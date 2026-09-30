import {
  MODULE_ID,
  SOCKET_NAME,
  TRIGGER_AFTER,
  TRIGGER_CONDITIONS,
  TRIGGER_INITIAL_VISIBILITY,
  TRIGGER_PAUSE,
  TRIGGER_REVEAL,
  TRIGGER_STATES,
  TRIGGER_ZONE_ICON
} from "./constants.mjs";
import { requestTriggeredActorTransition } from "./navigation-service.mjs";
import { resolveScene, resolveTile } from "./route-service.mjs";
import { tileBounds, tokenBounds } from "./token-service.mjs";
import {
  applyTriggerDamage,
  rollTriggerDamage,
  rollTriggerSave,
  supportsTriggerRules
} from "./trigger-adapter.mjs";

const LOCK_FLAG = "triggerLock";
const SAMPLE_DIVISOR = 4;

const localMovementLocks = new Set();
const recentMovementTriggers = new Set();
const insideTokens = new Map();
const warnedLockedTokens = new Map();

let armedPlacement = false;
let placementCanvas = null;
let placementPointerHandler = null;
let placementEscapeHandler = null;

function primaryGM() {
  return [...game.users]
    .filter((user) => user.active && user.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

function isPrimaryGM() {
  return Boolean(game.user?.isGM && primaryGM()?.id === game.user.id);
}

function gmWhisperIds() {
  return [...game.users].filter((user) => user.isGM).map((user) => user.id);
}

function actorOfToken(token) {
  return token?.baseActor ?? game.actors.get(token?.actorId) ?? token?.actor ?? null;
}

function resolveToken(uuid) {
  if (!uuid) return null;
  try {
    const document = fromUuidSync(uuid);
    if (document?.documentName === "Token") return document;
  } catch (_error) {
    // Fall through to explicit parsing.
  }
  const match = /^Scene\.([^.]+)\.Token\.([^.]+)$/.exec(String(uuid));
  return match ? game.scenes.get(match[1])?.tokens?.get(match[2]) ?? null : null;
}

function parseDamageComponents(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }
  return Object.values(value);
}

export function defaultTriggerData() {
  return {
    enabled: true,
    triggerId: foundry.utils.randomID(),
    state: TRIGGER_STATES.ARMED,
    label: "",
    initialVisibility: TRIGGER_INITIAL_VISIBILITY.HIDDEN,
    pauseMode: TRIGGER_PAUSE.ON_TRIGGER,
    saveEnabled: false,
    saveAbility: "dex",
    saveDC: 10,
    damageComponents: "[]",
    damageCondition: TRIGGER_CONDITIONS.ALWAYS,
    transitionSceneUuid: "",
    transitionArrivalUuid: "",
    transitionCondition: TRIGGER_CONDITIONS.ALWAYS,
    revealCondition: TRIGGER_REVEAL.ON_TRIGGER,
    afterTrigger: TRIGGER_AFTER.REMAIN_VISIBLE
  };
}

export function triggerData(tile) {
  const raw = tile?.getFlag?.(MODULE_ID, "trigger");
  if (!raw?.enabled) return null;
  return {
    ...defaultTriggerData(),
    ...raw,
    saveEnabled: raw.saveEnabled === true || raw.saveEnabled === "true",
    saveDC: Number(raw.saveDC) || 10,
    damageComponents: typeof raw.damageComponents === "string"
      ? raw.damageComponents
      : JSON.stringify(parseDamageComponents(raw.damageComponents))
  };
}

export function isTriggerTile(tile) {
  return Boolean(triggerData(tile)?.enabled);
}

export function triggerTiles(scene) {
  if (!scene) return [];
  return [...scene.tiles].filter(isTriggerTile);
}

export function getTriggerDamageComponents(tileOrData) {
  const data = tileOrData?.documentName === "Tile" ? triggerData(tileOrData) : tileOrData;
  return parseDamageComponents(data?.damageComponents)
    .map((entry) => ({
      formula: String(entry?.formula ?? "").trim(),
      type: String(entry?.type ?? "").trim()
    }))
    .filter((entry) => entry.formula);
}

function tileContainsPoint(tile, point) {
  if (tile?.shape?.testPoint) {
    try {
      return Boolean(tile.shape.testPoint(point));
    } catch (_error) {
      // Fall through to rectangular bounds.
    }
  }
  const bounds = tileBounds(tile);
  return point.x >= bounds.x && point.x <= bounds.x + bounds.width
    && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
}

function tokenCenterAt(token, position) {
  const bounds = tokenBounds(token);
  return {
    x: Number(position?.x ?? token.x) + bounds.width / 2,
    y: Number(position?.y ?? token.y) + bounds.height / 2
  };
}

function tokenInsideTrigger(token, trigger, position = null) {
  return tileContainsPoint(trigger, tokenCenterAt(token, position));
}

function movementWaypoints(movement) {
  const points = [];
  const add = (point) => {
    if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return;
    const normalized = { x: Number(point.x), y: Number(point.y) };
    const last = points.at(-1);
    if (last && last.x === normalized.x && last.y === normalized.y) return;
    points.push(normalized);
  };

  add(movement?.origin);
  for (const point of movement?.pending?.waypoints ?? []) add(point);
  add(movement?.destination);
  return points;
}

function firstEntryOnMovement(token, trigger, movement) {
  const points = movementWaypoints(movement);
  if (points.length < 2) return null;
  if (tokenInsideTrigger(token, trigger, points[0])) return null;

  const gridSize = Math.max(20, Number(token.parent?.grid?.size) || 100);
  const sampleStep = Math.max(5, gridSize / SAMPLE_DIVISOR);
  let progress = 0;

  for (let segment = 1; segment < points.length; segment += 1) {
    const a = points[segment - 1];
    const b = points[segment];
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(distance / sampleStep));

    for (let index = 1; index <= steps; index += 1) {
      const t = index / steps;
      const pos = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      progress += 1;
      if (tokenInsideTrigger(token, trigger, pos)) return { position: pos, progress };
    }
  }
  return null;
}

function triggerCanFire(trigger) {
  const data = triggerData(trigger);
  return Boolean(data && data.state !== TRIGGER_STATES.DISABLED);
}

function firstCrossedTrigger(token, movement) {
  const scene = token?.parent;
  if (!scene) return null;

  let best = null;
  for (const trigger of triggerTiles(scene)) {
    if (!triggerCanFire(trigger)) continue;
    const entry = firstEntryOnMovement(token, trigger, movement);
    if (!entry) continue;
    if (!best || entry.progress < best.entry.progress) best = { trigger, entry };
  }
  return best;
}

function movementKey(token, movement) {
  return `${token.uuid}:${movement?.id ?? `${movement?.destination?.x}:${movement?.destination?.y}`}`;
}

function triggerLockData(token) {
  return token?.getFlag?.(MODULE_ID, LOCK_FLAG) ?? null;
}

function warnTokenLocked(token) {
  const now = Date.now();
  const prior = warnedLockedTokens.get(token.uuid) ?? 0;
  if (now - prior < 1500) return;
  warnedLockedTokens.set(token.uuid, now);
  ui.notifications.warn(game.i18n.localize("CTN.Trigger.TokenLocked"));
}

async function stopAtTriggerEntry(token, entryPosition) {
  try {
    await token.update({
      x: Math.round(entryPosition.x),
      y: Math.round(entryPosition.y)
    }, { ctnTriggerInternal: true, animate: false });
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not position Token at Trigger entry`, error);
  }
}

function sendTriggerEnter(token, trigger, movement, entryPosition, paused) {
  const payload = {
    type: "trigger-enter",
    requesterId: game.user.id,
    tokenUuid: token.uuid,
    triggerUuid: trigger.uuid,
    movementId: movement?.id ?? "",
    entryPosition,
    paused
  };

  if (isPrimaryGM()) {
    void handleTriggerEnter(payload);
  } else {
    game.socket.emit(SOCKET_NAME, payload);
  }
}

function onPreMoveToken(token, movement, operation = {}) {
  if (operation?.ctnTriggerInternal) return;

  const persistedLock = triggerLockData(token);
  if (persistedLock?.active || localMovementLocks.has(token.uuid)) {
    warnTokenLocked(token);
    return false;
  }

  const crossed = firstCrossedTrigger(token, movement);
  if (!crossed) return;

  const key = movementKey(token, movement);
  if (recentMovementTriggers.has(key)) return;
  recentMovementTriggers.add(key);
  setTimeout(() => recentMovementTriggers.delete(key), 5000);

  const data = triggerData(crossed.trigger);
  const revealedDirect = data.state === TRIGGER_STATES.REVEALED
    && data.afterTrigger === TRIGGER_AFTER.DIRECT_TRANSITION
    && Boolean(data.transitionSceneUuid && data.transitionArrivalUuid);
  const shouldPause = !revealedDirect && data.pauseMode === TRIGGER_PAUSE.ON_TRIGGER;

  if (shouldPause) {
    localMovementLocks.add(token.uuid);
    setTimeout(() => void stopAtTriggerEntry(token, crossed.entry.position), 0);
  }

  sendTriggerEnter(token, crossed.trigger, movement, crossed.entry.position, shouldPause);
  if (shouldPause) return false;
}

async function setTokenLock(token, { triggerUuid, resolutionId, userId }) {
  if (!token) return;
  await token.setFlag(MODULE_ID, LOCK_FLAG, {
    active: true,
    triggerUuid,
    resolutionId,
    userId
  });
}

async function clearTokenLock(token) {
  if (!token) return;
  try {
    await token.unsetFlag(MODULE_ID, LOCK_FLAG);
  } catch (_error) {
    await token.setFlag(MODULE_ID, LOCK_FLAG, null);
  }
  localMovementLocks.delete(token.uuid);
}

function emitReleaseToUser(userId, tokenUuid) {
  if (!userId) return;
  game.socket.emit(SOCKET_NAME, {
    type: "trigger-release-local",
    targetUserId: userId,
    tokenUuid
  });
}

async function revealTrigger(trigger, state = TRIGGER_STATES.REVEALED) {
  const data = triggerData(trigger);
  if (!data) return;
  await trigger.update({
    hidden: false,
    [`flags.${MODULE_ID}.trigger.state`]: state
  }, { ctnTriggerState: true });
}

async function hideAndRearm(trigger) {
  const data = triggerData(trigger);
  if (!data) return;
  await trigger.update({
    hidden: data.initialVisibility === TRIGGER_INITIAL_VISIBILITY.HIDDEN,
    [`flags.${MODULE_ID}.trigger.state`]: TRIGGER_STATES.ARMED
  }, { ctnTriggerState: true });
}

async function disableTrigger(trigger) {
  await trigger.update({
    [`flags.${MODULE_ID}.trigger.state`]: TRIGGER_STATES.DISABLED
  }, { ctnTriggerState: true });
}

function conditionMatches(condition, resolution) {
  if (condition === TRIGGER_CONDITIONS.ALWAYS) return true;
  if (condition === TRIGGER_CONDITIONS.HALF_ON_SUCCESS) return resolution.saveResult !== null;
  if (condition === TRIGGER_CONDITIONS.FAILED_SAVE) return resolution.saveResult === false;
  if (condition === TRIGGER_CONDITIONS.SUCCESSFUL_SAVE) return resolution.saveResult === true;
  return false;
}

function damageMultiplier(trigger, resolution) {
  const data = triggerData(trigger);
  return data?.damageCondition === TRIGGER_CONDITIONS.HALF_ON_SUCCESS && resolution.saveResult === true ? 0.5 : 1;
}

function shouldReveal(data, resolution, phase) {
  if (data.revealCondition === TRIGGER_REVEAL.NEVER) return false;
  if (phase === "trigger") return data.revealCondition === TRIGGER_REVEAL.ON_TRIGGER;
  if (phase === "save") {
    return (data.revealCondition === TRIGGER_REVEAL.FAILED_SAVE && resolution.saveResult === false)
      || (data.revealCondition === TRIGGER_REVEAL.SUCCESSFUL_SAVE && resolution.saveResult === true);
  }
  return false;
}

function triggerTitle(trigger, data) {
  return String(data?.label || trigger?.name || game.i18n.localize("CTN.Trigger.DefaultName"));
}

function escapeHTML(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function resolutionFromMessage(message) {
  return foundry.utils.deepClone(message.getFlag(MODULE_ID, "triggerResolution") ?? null);
}

function resolutionButton(action, label, icon = "") {
  return `<button type="button" data-ctn-trigger-action="${escapeHTML(action)}">${icon ? `<i class="${escapeHTML(icon)}"></i> ` : ""}${escapeHTML(label)}</button>`;
}

function renderResolutionCard(trigger, token, resolution) {
  const data = triggerData(trigger);
  const actor = actorOfToken(token);
  const components = getTriggerDamageComponents(data);
  const saveRequired = Boolean(data?.saveEnabled && supportsTriggerRules());
  const saveResolved = resolution.saveResult !== null;
  const damageEligible = components.length && (!saveRequired || saveResolved) && conditionMatches(data.damageCondition, resolution);
  const transitionEligible = Boolean(data.transitionSceneUuid && data.transitionArrivalUuid)
    && (!saveRequired || saveResolved)
    && conditionMatches(data.transitionCondition, resolution);
  const locked = Boolean(triggerLockData(token)?.active);

  const saveText = !saveRequired
    ? game.i18n.localize("CTN.Trigger.NoSave")
    : saveResolved
      ? `${String(data.saveAbility).toUpperCase()} DC ${Number(data.saveDC) || 10}: <strong>${resolution.saveTotal ?? "—"}</strong> — ${resolution.saveResult ? game.i18n.localize("CTN.Trigger.Success") : game.i18n.localize("CTN.Trigger.Failure")}`
      : `${String(data.saveAbility).toUpperCase()} DC ${Number(data.saveDC) || 10}`;

  const damageText = components.length
    ? components.map((entry) => `${escapeHTML(entry.formula)} ${escapeHTML(entry.type)}`).join("<br>")
    : game.i18n.localize("CTN.Trigger.NoDamage");

  const rolledText = resolution.damageRolls?.length
    ? `<div class="ctn-trigger-card__result">${resolution.damageRolls.map((entry) => `${escapeHTML(entry.total)} ${escapeHTML(entry.type)}`).join(" + ")}${damageMultiplier(trigger, resolution) === 0.5 ? ` (${escapeHTML(game.i18n.localize("CTN.Trigger.HalfDamage"))})` : ""}</div>`
    : "";

  const buttons = [];
  if (saveRequired && !saveResolved) buttons.push(resolutionButton("roll-save", game.i18n.localize("CTN.Trigger.RollSave"), "fa-solid fa-dice-d20"));
  if (damageEligible && !resolution.damageRolls?.length) buttons.push(resolutionButton("roll-damage", game.i18n.localize("CTN.Trigger.RollDamage"), "fa-solid fa-dice"));
  if (damageEligible && resolution.damageRolls?.length && !resolution.damageApplied) buttons.push(resolutionButton("apply-damage", game.i18n.localize("CTN.Trigger.ApplyDamage"), "fa-solid fa-heart-crack"));
  if (transitionEligible && !resolution.transitionDone) buttons.push(resolutionButton("move-token", game.i18n.localize("CTN.Trigger.MoveToken"), "fa-solid fa-person-falling"));
  if (locked) buttons.push(resolutionButton("release-token", game.i18n.localize("CTN.Trigger.ReleaseToken"), "fa-solid fa-unlock"));
  if (!resolution.resolved) buttons.push(resolutionButton("ignore-trigger", game.i18n.localize("CTN.Trigger.Ignore"), "fa-solid fa-forward"));

  return `
    <section class="ctn-trigger-card" data-ctn-trigger-resolution="${escapeHTML(resolution.id)}">
      <h3><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHTML(triggerTitle(trigger, data))}</h3>
      <p><strong>${escapeHTML(actor?.name ?? token?.name ?? "Token")}</strong> ${escapeHTML(game.i18n.localize("CTN.Trigger.EnteredArea"))}</p>
      ${locked ? `<p class="ctn-trigger-card__paused"><i class="fa-solid fa-lock"></i> ${escapeHTML(game.i18n.localize("CTN.Trigger.MovementPaused"))}</p>` : ""}
      <div class="ctn-trigger-card__section"><strong>${escapeHTML(game.i18n.localize("CTN.Trigger.Save"))}:</strong> ${saveText}</div>
      <div class="ctn-trigger-card__section"><strong>${escapeHTML(game.i18n.localize("CTN.Trigger.Damage"))}:</strong><br>${damageText}${rolledText}</div>
      ${data.transitionSceneUuid ? `<div class="ctn-trigger-card__section"><strong>${escapeHTML(game.i18n.localize("CTN.Trigger.Transition"))}:</strong> ${escapeHTML(resolveScene(data.transitionSceneUuid)?.name ?? "—")}</div>` : ""}
      ${resolution.resolved ? `<p class="ctn-trigger-card__resolved">${escapeHTML(game.i18n.localize("CTN.Trigger.Resolved"))}</p>` : `<div class="ctn-trigger-card__actions">${buttons.join("")}</div>`}
    </section>
  `;
}

async function updateResolutionMessage(message, resolution) {
  const trigger = resolveTile(resolution.triggerUuid);
  const token = resolveToken(resolution.tokenUuid);
  if (!trigger || !token) return;
  await message.update({
    content: renderResolutionCard(trigger, token, resolution),
    [`flags.${MODULE_ID}.triggerResolution`]: resolution
  });
}

async function createResolutionMessage(trigger, token, requesterId) {
  const resolution = {
    id: foundry.utils.randomID(),
    triggerUuid: trigger.uuid,
    tokenUuid: token.uuid,
    requesterId,
    actorUuid: actorOfToken(token)?.uuid ?? "",
    saveResult: null,
    saveTotal: null,
    damageRolls: [],
    damageApplied: false,
    transitionDone: false,
    resolved: false
  };

  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actorOfToken(token), token }),
    whisper: gmWhisperIds(),
    content: renderResolutionCard(trigger, token, resolution),
    flags: { [MODULE_ID]: { triggerResolution: resolution } }
  });
  return { message, resolution };
}

async function applyRevealForPhase(trigger, resolution, phase) {
  const data = triggerData(trigger);
  if (!data || !shouldReveal(data, resolution, phase)) return;
  await revealTrigger(trigger);
}

async function finalizeTriggerBehavior(trigger, resolution) {
  const data = triggerData(trigger);
  if (!data) return;

  switch (data.afterTrigger) {
    case TRIGGER_AFTER.DISABLE:
      await disableTrigger(trigger);
      break;
    case TRIGGER_AFTER.DIRECT_TRANSITION:
    case TRIGGER_AFTER.REMAIN_VISIBLE:
      await revealTrigger(trigger, TRIGGER_STATES.REVEALED);
      break;
    case TRIGGER_AFTER.PERSISTENT_DAMAGE:
      await revealTrigger(trigger, TRIGGER_STATES.ACTIVE_HAZARD);
      break;
    case TRIGGER_AFTER.REARM_WHEN_EMPTY: {
      await revealTrigger(trigger, TRIGGER_STATES.TRIGGERED);
      const occupants = insideTokens.get(trigger.uuid) ?? new Set();
      if (!occupants.size) await hideAndRearm(trigger);
      break;
    }
    case TRIGGER_AFTER.REMAIN_ACTIVE_TRAP:
    default:
      await trigger.update({ [`flags.${MODULE_ID}.trigger.state`]: TRIGGER_STATES.ARMED }, { ctnTriggerState: true });
      break;
  }
}

async function releaseResolutionToken(trigger, token, resolution) {
  await clearTokenLock(token);
  emitReleaseToUser(resolution.requesterId, token.uuid);
  if (!resolution.resolved) {
    resolution.resolved = true;
    await finalizeTriggerBehavior(trigger, resolution);
  }
}

async function handleResolutionAction(message, action) {
  if (!game.user?.isGM) return;
  const resolution = resolutionFromMessage(message);
  if (!resolution) return;

  const trigger = resolveTile(resolution.triggerUuid);
  const token = resolveToken(resolution.tokenUuid);
  const actor = actorOfToken(token);
  const data = triggerData(trigger);
  if (!trigger || !token || !actor || !data) return;

  if (action === "roll-save") {
    const result = await rollTriggerSave(actor, {
      ability: data.saveAbility,
      dc: data.saveDC,
      flavor: `${triggerTitle(trigger, data)} — DC ${Number(data.saveDC) || 10}`
    });
    if (!result.supported || result.total === null) {
      ui.notifications.warn(game.i18n.localize("CTN.Trigger.SystemRuleUnsupported"));
      return;
    }
    resolution.saveTotal = result.total;
    resolution.saveResult = result.success;
    await applyRevealForPhase(trigger, resolution, "save");
    await updateResolutionMessage(message, resolution);
    return;
  }

  if (action === "roll-damage") {
    resolution.damageRolls = await rollTriggerDamage(actor, getTriggerDamageComponents(data), {
      flavor: triggerTitle(trigger, data)
    });
    await updateResolutionMessage(message, resolution);
    return;
  }

  if (action === "apply-damage") {
    const applied = await applyTriggerDamage(actor, resolution.damageRolls, {
      multiplier: damageMultiplier(trigger, resolution)
    });
    if (applied) resolution.damageApplied = true;
    else ui.notifications.warn(game.i18n.localize("CTN.Trigger.SystemRuleUnsupported"));
    await updateResolutionMessage(message, resolution);
    return;
  }

  if (action === "move-token") {
    const targetScene = resolveScene(data.transitionSceneUuid);
    const arrivalTile = resolveTile(data.transitionArrivalUuid);
    if (!targetScene || !arrivalTile || arrivalTile.parent?.id !== targetScene.id) {
      ui.notifications.warn(game.i18n.localize("CTN.Trigger.MissingDestination"));
      return;
    }

    // The source movement lock must not prevent CTN's own transfer lifecycle.
    await clearTokenLock(token);
    emitReleaseToUser(resolution.requesterId, token.uuid);
    const moved = await requestTriggeredActorTransition({ sourceToken: token, targetScene, arrivalTile });
    if (!moved) {
      await setTokenLock(token, { triggerUuid: trigger.uuid, resolutionId: resolution.id, userId: resolution.requesterId });
      ui.notifications.warn(game.i18n.localize("CTN.Notifications.NavigationFailed"));
      return;
    }
    resolution.transitionDone = true;
    resolution.resolved = true;
    await finalizeTriggerBehavior(trigger, resolution);
    await updateResolutionMessage(message, resolution);
    return;
  }

  if (action === "release-token") {
    await releaseResolutionToken(trigger, token, resolution);
    await updateResolutionMessage(message, resolution);
    return;
  }

  if (action === "ignore-trigger") {
    await clearTokenLock(token);
    emitReleaseToUser(resolution.requesterId, token.uuid);
    resolution.resolved = true;
    await updateResolutionMessage(message, resolution);
  }
}

async function performRevealedDirectTransition(trigger, token, requesterId) {
  const data = triggerData(trigger);
  const targetScene = resolveScene(data?.transitionSceneUuid);
  const arrivalTile = resolveTile(data?.transitionArrivalUuid);
  if (!targetScene || !arrivalTile) return false;

  const info = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actorOfToken(token), token }),
    whisper: gmWhisperIds(),
    content: `<section class="ctn-trigger-card"><h3>${escapeHTML(triggerTitle(trigger, data))}</h3><p>${escapeHTML(actorOfToken(token)?.name ?? token.name)} — ${escapeHTML(game.i18n.localize("CTN.Trigger.DirectTransition"))}</p></section>`
  });
  void info;

  await clearTokenLock(token);
  emitReleaseToUser(requesterId, token.uuid);
  return requestTriggeredActorTransition({ sourceToken: token, targetScene, arrivalTile });
}

async function handleTriggerEnter(message) {
  if (!isPrimaryGM()) return;
  const trigger = resolveTile(message.triggerUuid);
  const token = resolveToken(message.tokenUuid);
  const data = triggerData(trigger);
  if (!trigger || !token || !data || data.state === TRIGGER_STATES.DISABLED) return;

  const lock = triggerLockData(token);
  if (lock?.active && lock.triggerUuid === trigger.uuid) return;

  const isDirect = data.state === TRIGGER_STATES.REVEALED
    && data.afterTrigger === TRIGGER_AFTER.DIRECT_TRANSITION
    && Boolean(data.transitionSceneUuid && data.transitionArrivalUuid);
  if (isDirect) {
    await performRevealedDirectTransition(trigger, token, message.requesterId);
    return;
  }

  const { message: chatMessage, resolution } = await createResolutionMessage(trigger, token, message.requesterId);
  if (message.paused) {
    await setTokenLock(token, {
      triggerUuid: trigger.uuid,
      resolutionId: resolution.id,
      userId: message.requesterId
    });
  }

  await trigger.update({ [`flags.${MODULE_ID}.trigger.state`]: TRIGGER_STATES.TRIGGERED }, { ctnTriggerState: true });
  await applyRevealForPhase(trigger, resolution, "trigger");
  await updateResolutionMessage(chatMessage, resolution);
}

function updateInsideTracking(token) {
  if (!isPrimaryGM() || !token?.parent) return;
  for (const trigger of triggerTiles(token.parent)) {
    const set = insideTokens.get(trigger.uuid) ?? new Set();
    const inside = tokenInsideTrigger(token, trigger);
    if (inside) set.add(token.uuid);
    else set.delete(token.uuid);
    insideTokens.set(trigger.uuid, set);

    const data = triggerData(trigger);
    if (!inside && !set.size && data?.afterTrigger === TRIGGER_AFTER.REARM_WHEN_EMPTY
        && data.state !== TRIGGER_STATES.ARMED && data.state !== TRIGGER_STATES.DISABLED) {
      void hideAndRearm(trigger);
    }
  }
}

function onMoveToken(token) {
  updateInsideTracking(token);
}

function onUpdateToken(token, changes) {
  if (!triggerLockData(token)?.active) localMovementLocks.delete(token.uuid);
  if (changes?.x !== undefined || changes?.y !== undefined) updateInsideTracking(token);
}

async function handleSocketMessage(message) {
  if (!message?.type) return;

  if (message.type === "trigger-release-local") {
    if (message.targetUserId !== game.user.id) return;
    localMovementLocks.delete(message.tokenUuid);
    return;
  }

  if (message.type === "trigger-enter") await handleTriggerEnter(message);
}

function onRenderChatMessage(message, html) {
  if (!game.user?.isGM) return;
  const resolution = message.getFlag(MODULE_ID, "triggerResolution");
  if (!resolution) return;
  html.querySelectorAll("[data-ctn-trigger-action]").forEach((button) => {
    button.addEventListener("click", () => void handleResolutionAction(message, button.dataset.ctnTriggerAction));
  });
}

function getCanvasElement() {
  return canvas?.app?.canvas ?? canvas?.app?.view ?? null;
}

function disarmTriggerPlacement() {
  armedPlacement = false;
  if (placementCanvas && placementPointerHandler) {
    placementCanvas.removeEventListener("pointerup", placementPointerHandler, { capture: true });
  }
  if (placementEscapeHandler) window.removeEventListener("keydown", placementEscapeHandler);
  placementCanvas = null;
  placementPointerHandler = null;
  placementEscapeHandler = null;
}

async function createTriggerTile(event) {
  if (!canvas?.ready || !canvas.scene || !game.user?.isGM) return;
  const size = Math.max(50, Number(canvas.scene.grid?.size) || 100);
  const point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
  const data = defaultTriggerData();
  const [created] = await canvas.scene.createEmbeddedDocuments("Tile", [{
    name: `${game.i18n.localize("CTN.Trigger.DefaultName")}: ${canvas.scene.name}`,
    x: Math.round(point.x - size / 2),
    y: Math.round(point.y - size / 2),
    width: size,
    height: size,
    hidden: true,
    texture: { src: TRIGGER_ZONE_ICON },
    flags: { [MODULE_ID]: { trigger: data } }
  }]);

  if (created) {
    ui.notifications.info(game.i18n.localize("CTN.Trigger.Created"));
    setTimeout(() => created.sheet?.render?.(true), 50);
  }
}

export function armTriggerPlacement() {
  if (!game.user?.isGM || !canvas?.ready) return;
  disarmTriggerPlacement();
  placementCanvas = getCanvasElement();
  if (!(placementCanvas instanceof HTMLCanvasElement)) return;

  armedPlacement = true;
  ui.notifications.info(game.i18n.localize("CTN.Trigger.ArmedPlacement"));

  placementPointerHandler = (event) => {
    if (!armedPlacement || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    disarmTriggerPlacement();
    void createTriggerTile(event);
  };

  placementEscapeHandler = (event) => {
    if (event.key !== "Escape") return;
    disarmTriggerPlacement();
    ui.notifications.info(game.i18n.localize("CTN.Trigger.PlacementCancelled"));
  };

  placementCanvas.addEventListener("pointerup", placementPointerHandler, { capture: true });
  window.addEventListener("keydown", placementEscapeHandler);
}

export async function releaseAllPausedTokens() {
  if (!game.user?.isGM) return;
  let count = 0;
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      const lock = triggerLockData(token);
      if (!lock?.active) continue;
      await clearTokenLock(token);
      emitReleaseToUser(lock.userId, token.uuid);
      count += 1;
    }
  }
  ui.notifications.info(game.i18n.format("CTN.Trigger.ReleasedCount", { count }));
}

export function registerTriggerHooks() {
  Hooks.on("preMoveToken", onPreMoveToken);
  Hooks.on("moveToken", onMoveToken);
  Hooks.on("updateToken", onUpdateToken);
  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
  Hooks.on("canvasTearDown", disarmTriggerPlacement);
}

export function initializeTriggerSocket() {
  game.socket.on(SOCKET_NAME, handleSocketMessage);
}
