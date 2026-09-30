import {
  ARRIVAL_MATERIALIZED_HOOK,
  MODULE_ID,
  SOCKET_NAME,
  TRIGGER_AFTER,
  TRIGGER_CONDITIONS,
  TRIGGER_INITIAL_VISIBILITY,
  TRIGGER_PAUSE,
  TRIGGER_REVEAL,
  TRIGGER_SAVE_STATES,
  TRIGGER_STATES,
  TRIGGER_ZONE_ICON
} from "./constants.mjs";
import { requestTriggeredActorTransition } from "./navigation-service.mjs";
import { resolveScene, resolveTile } from "./route-service.mjs";
import { tileBounds, tokenBounds } from "./token-service.mjs";
import {
  applyTriggerDamage,
  rollTriggerDamage,
  supportsNativeTriggerDamage,
  supportsTriggerRules
} from "./trigger-adapter.mjs";

const LOCK_FLAG = "triggerLock";
const SAMPLE_DIVISOR = 4;

const localMovementLocks = new Set();
const recentMovementTriggers = new Set();
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
    saveState: TRIGGER_SAVE_STATES.OFF,
    disableSaveOnPersistentHazard: true,
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

  const saveEnabled = raw.saveEnabled === true || raw.saveEnabled === "true";
  const configuredSaveState = saveEnabled ? TRIGGER_SAVE_STATES.ON : TRIGGER_SAVE_STATES.OFF;
  const disableSaveOnPersistentHazard = raw.disableSaveOnPersistentHazard !== false
    && raw.disableSaveOnPersistentHazard !== "false";
  const validRuntimeSaveState = [TRIGGER_SAVE_STATES.ON, TRIGGER_SAVE_STATES.OFF].includes(raw.saveState)
    ? raw.saveState
    : null;

  // Backward-compatible migration: an already active persistent hazard from an
  // older CTN version should immediately behave like the new default and skip
  // Saving Throws on subsequent entries.
  const migratedPersistentState = raw.state === TRIGGER_STATES.ACTIVE_HAZARD
    && raw.afterTrigger === TRIGGER_AFTER.PERSISTENT_DAMAGE
    && disableSaveOnPersistentHazard
    ? TRIGGER_SAVE_STATES.OFF
    : configuredSaveState;

  const runtimeSaveState = raw.state === TRIGGER_STATES.ARMED
    ? configuredSaveState
    : (validRuntimeSaveState ?? migratedPersistentState);

  return {
    ...defaultTriggerData(),
    ...raw,
    saveEnabled,
    saveState: runtimeSaveState,
    disableSaveOnPersistentHazard,
    saveDC: Number(raw.saveDC) || 10,
    damageComponents: typeof raw.damageComponents === "string"
      ? raw.damageComponents
      : JSON.stringify(parseDamageComponents(raw.damageComponents))
  };
}

function configuredSaveState(data) {
  return data?.saveEnabled ? TRIGGER_SAVE_STATES.ON : TRIGGER_SAVE_STATES.OFF;
}

function saveIsActive(data) {
  return data?.saveState === TRIGGER_SAVE_STATES.ON;
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

function triggerOccupants(trigger) {
  const scene = trigger?.parent;
  if (!scene) return [];
  return [...scene.tokens].filter((token) => tokenInsideTrigger(token, trigger));
}

async function rearmIfEmpty(trigger) {
  const data = triggerData(trigger);
  if (!data || data.afterTrigger !== TRIGGER_AFTER.REARM_WHEN_EMPTY) return false;
  if ([TRIGGER_STATES.ARMED, TRIGGER_STATES.DISABLED].includes(data.state)) return false;
  if (triggerOccupants(trigger).length) return false;
  await hideAndRearm(trigger);
  return true;
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
    [`flags.${MODULE_ID}.trigger.state`]: TRIGGER_STATES.ARMED,
    [`flags.${MODULE_ID}.trigger.saveState`]: configuredSaveState(data)
  }, { ctnTriggerState: true });
}

async function disableTrigger(trigger) {
  await trigger.update({
    [`flags.${MODULE_ID}.trigger.state`]: TRIGGER_STATES.DISABLED
  }, { ctnTriggerState: true });
}

function conditionMatches(condition, resolution, { saveActive = true, kind = "damage" } = {}) {
  if (condition === TRIGGER_CONDITIONS.ALWAYS) return true;

  // Once Save is OFF, save-dependent damage conditions collapse to direct
  // damage. This is what allows a revealed persistent hazard to keep causing
  // damage without asking for PASS / NOT PASS again. Transition conditions do
  // not silently broaden in the same way.
  if (!saveActive) return kind === "damage";

  if (condition === TRIGGER_CONDITIONS.HALF_ON_SUCCESS) return resolution.saveResult !== null;
  if (condition === TRIGGER_CONDITIONS.FAILED_SAVE) return resolution.saveResult === false;
  if (condition === TRIGGER_CONDITIONS.SUCCESSFUL_SAVE) return resolution.saveResult === true;
  return false;
}

function damageMultiplier(trigger, resolution) {
  const data = triggerData(trigger);
  if (!saveIsActive(data)) return 1;
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

function resolutionSaveRequired(data, resolution) {
  if (typeof resolution?.saveRequired === "boolean") return resolution.saveRequired;
  return Boolean(saveIsActive(data) && supportsTriggerRules());
}

function resolutionEligibility(trigger, token, resolution) {
  const data = triggerData(trigger);
  const actor = actorOfToken(token);
  const components = getTriggerDamageComponents(data);
  const saveRequired = resolutionSaveRequired(data, resolution);
  const saveResolved = resolution.saveResult !== null;
  const saveGateOpen = !saveRequired || saveResolved;
  const nativeDamage = supportsNativeTriggerDamage(actor);
  const damageEligible = Boolean(components.length)
    && saveGateOpen
    && conditionMatches(data.damageCondition, resolution, { saveActive: saveRequired, kind: "damage" });
  const transitionEligible = resolution.mode !== "persistent-damage"
    && Boolean(data.transitionSceneUuid && data.transitionArrivalUuid)
    && saveGateOpen
    && conditionMatches(data.transitionCondition, resolution, { saveActive: saveRequired, kind: "transition" });
  const locked = Boolean(triggerLockData(token)?.active);
  return {
    actor,
    components,
    damageEligible,
    data,
    locked,
    nativeDamage,
    saveRequired,
    saveResolved,
    transitionEligible
  };
}

function resolutionIsComplete(trigger, token, resolution) {
  const ctx = resolutionEligibility(trigger, token, resolution);
  if (resolution.manualResolved && !ctx.locked) return true;
  if (ctx.saveRequired && !ctx.saveResolved) return false;
  if (ctx.damageEligible && !resolution.damageApplied) return false;
  if (ctx.transitionEligible && !resolution.transitionDone) return false;
  if (ctx.locked) return false;
  return true;
}

function renderResolutionCard(trigger, token, resolution) {
  const {
    actor,
    components,
    damageEligible,
    data,
    locked,
    nativeDamage,
    saveRequired,
    saveResolved,
    transitionEligible
  } = resolutionEligibility(trigger, token, resolution);

  const saveText = !saveRequired
    ? game.i18n.localize("CTN.Trigger.NoSave")
    : saveResolved
      ? `${String(data.saveAbility).toUpperCase()} DC ${Number(data.saveDC) || 10} — <strong>${resolution.saveResult ? game.i18n.localize("CTN.Trigger.Success") : game.i18n.localize("CTN.Trigger.Failure")}</strong>`
      : `${String(data.saveAbility).toUpperCase()} DC ${Number(data.saveDC) || 10}`;

  const damageText = components.length
    ? components.map((entry) => `${escapeHTML(entry.formula)} ${escapeHTML(entry.type)}`).join("<br>")
    : game.i18n.localize("CTN.Trigger.NoDamage");

  const rolledText = resolution.damageRolls?.length
    ? `<div class="ctn-trigger-card__result">${resolution.damageRolls.map((entry) => `${escapeHTML(entry.total)} ${escapeHTML(entry.type)}`).join(" + ")}</div>`
    : "";

  const defaultMultiplier = Number.isFinite(Number(resolution.damageMultiplier))
    ? Number(resolution.damageMultiplier)
    : (saveRequired && data.damageCondition === TRIGGER_CONDITIONS.HALF_ON_SUCCESS && resolution.saveResult === true ? 0.5 : 1);
  const multiplierOptions = [
    [0.5, game.i18n.localize("CTN.Trigger.MultiplierHalf")],
    [1, game.i18n.localize("CTN.Trigger.MultiplierNormal")],
    [2, game.i18n.localize("CTN.Trigger.MultiplierDouble")]
  ].map(([value, label]) => `<option value="${value}"${value === defaultMultiplier ? " selected" : ""}>${escapeHTML(label)}</option>`).join("");

  const buttons = [];
  if (saveRequired && !saveResolved) {
    buttons.push(resolutionButton("save-pass", game.i18n.localize("CTN.Trigger.Pass"), "fa-solid fa-check"));
    buttons.push(resolutionButton("save-fail", game.i18n.localize("CTN.Trigger.NotPass"), "fa-solid fa-xmark"));
  }

  // D&D5e resolves eligible damage automatically through Actor5e.applyDamage.
  // The generic CTN path retains its explicit Roll / Apply controls.
  if (!nativeDamage && damageEligible && !resolution.damageRolls?.length) {
    buttons.push(resolutionButton("roll-damage", game.i18n.localize("CTN.Trigger.RollDamage"), "fa-solid fa-dice"));
  }
  if (!nativeDamage && damageEligible && resolution.damageRolls?.length && !resolution.damageApplied) {
    buttons.push(resolutionButton("apply-damage", game.i18n.localize("CTN.Trigger.ApplyDamage"), "fa-solid fa-heart-crack"));
  }
  if (transitionEligible && !resolution.transitionDone) {
    buttons.push(resolutionButton("move-token", game.i18n.localize("CTN.Trigger.MoveToken"), "fa-solid fa-person-falling"));
  }
  if (!nativeDamage && damageEligible && !resolution.damageApplied && !locked) {
    buttons.push(resolutionButton("resolve-trigger", game.i18n.localize("CTN.Trigger.ResolveTrigger"), "fa-solid fa-check-double"));
  }
  if (locked) {
    buttons.push(resolutionButton("release-token", game.i18n.localize("CTN.Trigger.ReleaseToken"), "fa-solid fa-lock-open"));
  }

  const multiplierControl = !nativeDamage && damageEligible && resolution.damageRolls?.length && !resolution.damageApplied
    ? `<div class="ctn-trigger-card__multiplier"><label>${escapeHTML(game.i18n.localize("CTN.Trigger.DamageMultiplier"))}</label><select data-ctn-damage-multiplier>${multiplierOptions}</select></div>`
    : resolution.damageApplied
      ? `<div class="ctn-trigger-card__result">${escapeHTML(game.i18n.localize("CTN.Trigger.AppliedMultiplier"))}: ×${escapeHTML(resolution.damageMultiplier ?? defaultMultiplier)}</div>`
      : "";

  const complete = resolutionIsComplete(trigger, token, resolution);

  return `
    <section class="ctn-trigger-card" data-ctn-trigger-resolution="${escapeHTML(resolution.id)}">
      <h3><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHTML(triggerTitle(trigger, data))}</h3>
      <p><strong>${escapeHTML(actor?.name ?? token?.name ?? "Token")}</strong> ${escapeHTML(game.i18n.localize("CTN.Trigger.EnteredArea"))}</p>
      ${locked ? `<p class="ctn-trigger-card__paused"><i class="fa-solid fa-lock"></i> ${escapeHTML(game.i18n.localize("CTN.Trigger.MovementPaused"))}</p>` : ""}
      <div class="ctn-trigger-card__section"><strong>${escapeHTML(game.i18n.localize("CTN.Trigger.Save"))}:</strong> ${saveText}</div>
      <div class="ctn-trigger-card__section"><strong>${escapeHTML(game.i18n.localize("CTN.Trigger.Damage"))}:</strong><br>${damageText}${rolledText}${multiplierControl}</div>
      ${resolution.mode !== "persistent-damage" && data.transitionSceneUuid ? `<div class="ctn-trigger-card__section"><strong>${escapeHTML(game.i18n.localize("CTN.Trigger.Transition"))}:</strong> ${escapeHTML(resolveScene(data.transitionSceneUuid)?.name ?? "—")}</div>` : ""}
      ${complete ? `<p class="ctn-trigger-card__resolved">${escapeHTML(game.i18n.localize("CTN.Trigger.Resolved"))}</p>` : `<div class="ctn-trigger-card__actions">${buttons.join("")}</div>`}
    </section>
  `;
}

async function updateResolutionMessage(message, resolution) {
  const trigger = resolveTile(resolution.triggerUuid);
  const token = resolveToken(resolution.tokenUuid);
  if (!trigger || !token) return;
  resolution.resolved = resolutionIsComplete(trigger, token, resolution);
  await message.update({
    content: renderResolutionCard(trigger, token, resolution),
    [`flags.${MODULE_ID}.triggerResolution`]: resolution
  });
}

async function createResolutionMessage(trigger, token, requesterId, { mode = "initial" } = {}) {
  const data = triggerData(trigger);
  const resolution = {
    id: foundry.utils.randomID(),
    mode,
    triggerUuid: trigger.uuid,
    tokenUuid: token.uuid,
    requesterId,
    actorUuid: actorOfToken(token)?.uuid ?? "",
    saveRequired: Boolean(saveIsActive(data) && supportsTriggerRules()),
    saveStateAtStart: data?.saveState ?? TRIGGER_SAVE_STATES.OFF,
    saveResult: null,
    saveTotal: null,
    damageRolls: [],
    damageMultiplier: null,
    damageApplied: false,
    transitionDone: false,
    behaviorFinalized: false,
    manualResolved: false,
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
  if (resolution.behaviorFinalized) return;
  const data = triggerData(trigger);
  if (!data) return;

  switch (data.afterTrigger) {
    case TRIGGER_AFTER.DISABLE:
      await disableTrigger(trigger);
      break;
    case TRIGGER_AFTER.DIRECT_TRANSITION:
    case TRIGGER_AFTER.REMAIN_VISIBLE:
      // Visibility is owned exclusively by Reveal Tile. Post-trigger behavior
      // changes capability/state, never visibility by itself.
      await trigger.update({
        [`flags.${MODULE_ID}.trigger.state`]: TRIGGER_STATES.REVEALED
      }, { ctnTriggerState: true });
      break;
    case TRIGGER_AFTER.PERSISTENT_DAMAGE: {
      const updates = {
        [`flags.${MODULE_ID}.trigger.state`]: TRIGGER_STATES.ACTIVE_HAZARD
      };
      if (data.disableSaveOnPersistentHazard) {
        updates[`flags.${MODULE_ID}.trigger.saveState`] = TRIGGER_SAVE_STATES.OFF;
      }
      await trigger.update(updates, { ctnTriggerState: true });
      break;
    }
    case TRIGGER_AFTER.REARM_WHEN_EMPTY:
      await trigger.update({
        [`flags.${MODULE_ID}.trigger.state`]: TRIGGER_STATES.TRIGGERED
      }, { ctnTriggerState: true });
      await rearmIfEmpty(trigger);
      break;
    case TRIGGER_AFTER.REMAIN_ACTIVE_TRAP:
    default:
      await trigger.update({
        [`flags.${MODULE_ID}.trigger.state`]: TRIGGER_STATES.ARMED,
        [`flags.${MODULE_ID}.trigger.saveState`]: configuredSaveState(data)
      }, { ctnTriggerState: true });
      break;
  }
  resolution.behaviorFinalized = true;
}

async function resolveNativeDamage(trigger, actor, resolution, dataSnapshot = null) {
  if (!supportsNativeTriggerDamage(actor) || resolution.damageApplied) return false;
  const data = dataSnapshot ?? triggerData(trigger);
  const components = getTriggerDamageComponents(data);
  const saveRequired = resolutionSaveRequired(data, resolution);
  if (!components.length || (saveRequired && resolution.saveResult === null)) return false;
  if (!conditionMatches(data.damageCondition, resolution, { saveActive: saveRequired, kind: "damage" })) return false;

  resolution.damageMultiplier = saveRequired
    && data.damageCondition === TRIGGER_CONDITIONS.HALF_ON_SUCCESS
    && resolution.saveResult === true
    ? 0.5
    : 1;

  resolution.damageRolls = await rollTriggerDamage(actor, components, {
    flavor: triggerTitle(trigger, data),
    publicRoll: true
  });
  if (!resolution.damageRolls.length) return false;

  const applied = await applyTriggerDamage(actor, resolution.damageRolls, {
    multiplier: resolution.damageMultiplier
  });
  resolution.damageApplied = Boolean(applied);
  if (!applied) ui.notifications.warn(game.i18n.localize("CTN.Trigger.SystemRuleUnsupported"));
  return Boolean(applied);
}

async function releaseResolutionToken(_trigger, token, resolution) {
  // Release is intentionally side-effect free for Trigger state. It only
  // removes the movement lock for this occurrence.
  await clearTokenLock(token);
  emitReleaseToUser(resolution.requesterId, token.uuid);
}

async function handleResolutionAction(message, action, button = null) {
  if (!game.user?.isGM) return;
  const resolution = resolutionFromMessage(message);
  if (!resolution) return;

  const trigger = resolveTile(resolution.triggerUuid);
  const token = resolveToken(resolution.tokenUuid);
  const actor = actorOfToken(token);
  const data = triggerData(trigger);
  if (!trigger || !token || !actor || !data) return;

  if (action === "save-pass" || action === "save-fail") {
    const dataAtDecision = foundry.utils.deepClone(data);
    resolution.saveResult = action === "save-pass";
    resolution.saveTotal = null;
    await applyRevealForPhase(trigger, resolution, "save");
    await finalizeTriggerBehavior(trigger, resolution);
    await resolveNativeDamage(trigger, actor, resolution, dataAtDecision);
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
    const selector = button?.closest?.(".ctn-trigger-card")?.querySelector?.("[data-ctn-damage-multiplier]");
    const selected = Number(selector?.value);
    resolution.damageMultiplier = [0.5, 1, 2].includes(selected)
      ? selected
      : damageMultiplier(trigger, resolution);
    const applied = await applyTriggerDamage(actor, resolution.damageRolls, {
      multiplier: resolution.damageMultiplier
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
    await finalizeTriggerBehavior(trigger, resolution);
    await updateResolutionMessage(message, resolution);
    return;
  }

  if (action === "release-token") {
    await releaseResolutionToken(trigger, token, resolution);
    await updateResolutionMessage(message, resolution);
    return;
  }

  // Compatibility handlers for Trigger cards created by older CTN versions.
  // New 1.1.6 cards do not render these actions.
  if (action === "resolve-trigger") {
    if (!resolution.behaviorFinalized) await finalizeTriggerBehavior(trigger, resolution);
    resolution.manualResolved = true;
    await updateResolutionMessage(message, resolution);
    return;
  }

  if (action === "ignore-trigger") {
    // Old "Ignore / Release" cards are treated as movement release only. They
    // must never revert or overwrite the current Trigger Tile state.
    await releaseResolutionToken(trigger, token, resolution);
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

  const isPersistentHazard = data.state === TRIGGER_STATES.ACTIVE_HAZARD
    && data.afterTrigger === TRIGGER_AFTER.PERSISTENT_DAMAGE;
  const dataAtEntry = foundry.utils.deepClone(data);
  const { message: chatMessage, resolution } = await createResolutionMessage(
    trigger,
    token,
    message.requesterId,
    { mode: isPersistentHazard ? "persistent-damage" : "initial" }
  );
  if (message.paused) {
    await setTokenLock(token, {
      triggerUuid: trigger.uuid,
      resolutionId: resolution.id,
      userId: message.requesterId
    });
  }

  if (!isPersistentHazard) {
    await trigger.update({
      [`flags.${MODULE_ID}.trigger.state`]: TRIGGER_STATES.TRIGGERED,
      [`flags.${MODULE_ID}.trigger.saveState`]: data.saveState
    }, { ctnTriggerState: true });
    await applyRevealForPhase(trigger, resolution, "trigger");
  }

  // Save OFF means the occurrence proceeds directly into its configured
  // consequences. Persistent hazards normally reach this path because their
  // activation can mutate Save State to OFF.
  if (!resolution.saveRequired) {
    if (!isPersistentHazard) await finalizeTriggerBehavior(trigger, resolution);
    await resolveNativeDamage(trigger, actorOfToken(token), resolution, dataAtEntry);
  }

  await updateResolutionMessage(chatMessage, resolution);
}

function checkRearmState(scene) {
  if (!isPrimaryGM() || !scene) return;
  for (const trigger of triggerTiles(scene)) {
    const data = triggerData(trigger);
    if (data?.afterTrigger !== TRIGGER_AFTER.REARM_WHEN_EMPTY) continue;
    if ([TRIGGER_STATES.ARMED, TRIGGER_STATES.DISABLED].includes(data.state)) continue;
    void rearmIfEmpty(trigger);
  }
}

function onMoveToken(token) {
  checkRearmState(token?.parent);
}

function onUpdateToken(token, changes) {
  if (!triggerLockData(token)?.active) localMovementLocks.delete(token.uuid);
  if (changes?.x !== undefined || changes?.y !== undefined) checkRearmState(token?.parent);
}

function onDeleteToken(token) {
  checkRearmState(token?.parent);
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
    button.addEventListener("click", () => void handleResolutionAction(message, button.dataset.ctnTriggerAction, button));
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

function requesterIdForToken(token) {
  const actorId = actorOfToken(token)?.id;
  return [...game.users].find((user) => !user.isGM && user.character?.id === actorId)?.id ?? game.user.id;
}

async function handleArrivalMaterialized({ tokenUuids = [] } = {}) {
  if (!isPrimaryGM()) return;

  for (const uuid of tokenUuids) {
    const token = resolveToken(uuid);
    if (!token?.parent || triggerLockData(token)?.active) continue;

    const trigger = triggerTiles(token.parent)
      .filter(triggerCanFire)
      .filter((candidate) => {
        const data = triggerData(candidate);
        return !(data?.state === TRIGGER_STATES.REVEALED
          && data?.afterTrigger === TRIGGER_AFTER.DIRECT_TRANSITION);
      })
      .filter((candidate) => tokenInsideTrigger(token, candidate))
      .sort((a, b) => (Number(b.sort) || 0) - (Number(a.sort) || 0))[0];
    if (!trigger) continue;

    const data = triggerData(trigger);
    const isDirect = data.state === TRIGGER_STATES.REVEALED
      && data.afterTrigger === TRIGGER_AFTER.DIRECT_TRANSITION;
    const shouldPause = !isDirect && data.pauseMode === TRIGGER_PAUSE.ON_TRIGGER;
    await handleTriggerEnter({
      type: "trigger-enter",
      requesterId: requesterIdForToken(token),
      tokenUuid: token.uuid,
      triggerUuid: trigger.uuid,
      movementId: "ctn-arrival",
      entryPosition: { x: token.x, y: token.y },
      paused: shouldPause
    });
  }
}

export function registerTriggerHooks() {
  Hooks.on("preMoveToken", onPreMoveToken);
  Hooks.on("moveToken", onMoveToken);
  Hooks.on("updateToken", onUpdateToken);
  Hooks.on("deleteToken", onDeleteToken);
  Hooks.on(ARRIVAL_MATERIALIZED_HOOK, (payload) => void handleArrivalMaterialized(payload));
  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
  Hooks.on("canvasTearDown", disarmTriggerPlacement);
}

export function initializeTriggerSocket() {
  game.socket.on(SOCKET_NAME, handleSocketMessage);
}
