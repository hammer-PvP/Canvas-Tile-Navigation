import {
  ICONS,
  ICON_PATHS,
  MODULE_ID,
  SOCKET_NAME,
  TRANSITION_ACTIVATIONS,
  TRANSITION_STATUS
} from "./constants.mjs";
import { resolveTile } from "./route-service.mjs";
import {
  actorTokensInScene,
  getUserActor,
  tileBounds,
  tokenBounds
} from "./token-service.mjs";

const EFFECT_MS = 250;
const TRANSITION_TIMEOUT_MS = 30_000;
const SAMPLE_DIVISOR = 4;

let armedPlacement = false;
let placementCanvas = null;
let placementPointerHandler = null;
let placementEscapeHandler = null;

let boundCanvas = null;
let pointerUpHandler = null;
let doubleClickHandler = null;
let transitionCache = [];

const localActivationLocks = new Set();
const authorityLocks = new Set();
const localPending = new Map();
const authorityPending = new Map();
const localEffectScales = new Map();

function localized(key, data = {}) {
  return Object.keys(data).length ? game.i18n.format(key, data) : game.i18n.localize(key);
}

function notify(key, data = {}) {
  ui.notifications.warn(localized(key, data));
}

function primaryGM() {
  return [...game.users]
    .filter((user) => user.active && user.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

function isPrimaryGM() {
  return Boolean(game.user?.isGM && primaryGM()?.id === game.user.id);
}

function randomId() {
  return foundry.utils.randomID?.() ?? crypto.randomUUID();
}

function bool(value, fallback = false) {
  if (value === true || value === "true" || value === "on" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

function normalizeName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function getSubmittedValue(changes, path, fallback) {
  if (Object.prototype.hasOwnProperty.call(changes, path)) return changes[path];
  const value = foundry.utils.getProperty(changes, path);
  return value === undefined ? fallback : value;
}

function hasSubmittedValue(changes, path) {
  return Object.prototype.hasOwnProperty.call(changes, path)
    || foundry.utils.getProperty(changes, path) !== undefined;
}

function setSubmittedValue(changes, path, value) {
  if (Object.prototype.hasOwnProperty.call(changes, path)) changes[path] = value;
  else foundry.utils.setProperty(changes, path, value);
}

export function transitionData(tile) {
  const raw = tile?.getFlag?.(MODULE_ID, "transition");
  if (!raw?.enabled) return null;
  const activation = Object.values(TRANSITION_ACTIVATIONS).includes(raw.activation)
    ? raw.activation
    : TRANSITION_ACTIVATIONS.DOUBLE;
  return {
    enabled: true,
    transitionId: String(raw.transitionId || tile.id || ""),
    name: String(raw.name ?? "").trim() || game.i18n.localize("CTN.Transition.DefaultName"),
    connectedTileUuid: String(raw.connectedTileUuid ?? ""),
    activation,
    effectEnabled: bool(raw.effectEnabled, false),
    hidden: Boolean(tile?.hidden)
  };
}

export function isTransitionTile(tile) {
  return Boolean(transitionData(tile)?.enabled);
}

export function allTransitionTiles() {
  const result = [];
  for (const scene of game.scenes) {
    for (const tile of scene.tiles) {
      if (isTransitionTile(tile)) result.push(tile);
    }
  }
  return result;
}

export function transitionDisplayName(tile) {
  const data = transitionData(tile);
  const sceneName = tile?.parent?.name ?? game.i18n.localize("CTN.Transition.UnknownScene");
  return `${data?.name ?? game.i18n.localize("CTN.Transition.DefaultName")} (${sceneName})`;
}

export function transitionStatus(tile) {
  const data = transitionData(tile);
  if (!data) return null;
  if (!data.connectedTileUuid) return TRANSITION_STATUS.DISCONNECTED;
  const partner = resolveTile(data.connectedTileUuid);
  if (!partner || !isTransitionTile(partner)) return TRANSITION_STATUS.BROKEN;
  const partnerData = transitionData(partner);
  return partnerData?.connectedTileUuid === tile.uuid
    ? TRANSITION_STATUS.CONNECTED
    : TRANSITION_STATUS.BROKEN;
}

export function transitionStatusLabel(status) {
  const keys = {
    [TRANSITION_STATUS.DISCONNECTED]: "CTN.Transition.StatusDisconnected",
    [TRANSITION_STATUS.CONNECTED]: "CTN.Transition.StatusConnected",
    [TRANSITION_STATUS.BROKEN]: "CTN.Transition.StatusBroken"
  };
  return game.i18n.localize(keys[status] ?? "CTN.Transition.StatusBroken");
}

export function transitionCandidates(tile) {
  const data = transitionData(tile);
  if (!data) return [];
  const connected = Boolean(data.connectedTileUuid);
  return allTransitionTiles()
    .filter((candidate) => candidate.uuid !== tile.uuid)
    .map((candidate) => {
      const current = candidate.uuid === data.connectedTileUuid;
      const status = transitionStatus(candidate);
      return {
        tile: candidate,
        uuid: candidate.uuid,
        label: transitionDisplayName(candidate),
        status,
        current,
        disabled: current ? false : connected || status !== TRANSITION_STATUS.DISCONNECTED
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function isTransitionNameAvailable(tile, value) {
  const scene = tile?.parent;
  if (!scene) return true;
  const normalized = normalizeName(value);
  if (!normalized) return false;
  return ![...scene.tiles].some((candidate) => {
    if (candidate.id === tile.id || !isTransitionTile(candidate)) return false;
    return normalizeName(transitionData(candidate)?.name) === normalized;
  });
}

function nextTransitionName(scene) {
  const used = new Set(
    [...(scene?.tiles ?? [])]
      .filter(isTransitionTile)
      .map((tile) => normalizeName(transitionData(tile)?.name))
  );
  let index = 1;
  while (used.has(normalizeName(`${game.i18n.localize("CTN.Transition.DefaultName")} ${index}`))) index += 1;
  return `${game.i18n.localize("CTN.Transition.DefaultName")} ${index}`;
}

export function defaultTransitionData(scene) {
  return {
    enabled: true,
    transitionId: randomId(),
    name: nextTransitionName(scene),
    connectedTileUuid: "",
    activation: TRANSITION_ACTIVATIONS.DOUBLE,
    effectEnabled: false
  };
}

export async function disconnectTransition(tile) {
  const data = transitionData(tile);
  if (!data) return;
  const partner = resolveTile(data.connectedTileUuid);
  await tile.update({
    [`flags.${MODULE_ID}.transition.connectedTileUuid`]: ""
  }, { ctnTransitionPairing: true });

  if (partner && transitionData(partner)?.connectedTileUuid === tile.uuid) {
    await partner.update({
      [`flags.${MODULE_ID}.transition.connectedTileUuid`]: ""
    }, { ctnTransitionPairing: true });
  }
}

async function reconcilePair(tile, oldUuid, newUuid) {
  if (oldUuid && oldUuid !== newUuid) {
    const oldPartner = resolveTile(oldUuid);
    if (oldPartner && transitionData(oldPartner)?.connectedTileUuid === tile.uuid) {
      await oldPartner.update({
        [`flags.${MODULE_ID}.transition.connectedTileUuid`]: ""
      }, { ctnTransitionPairing: true });
    }
  }

  if (!newUuid) return;
  const partner = resolveTile(newUuid);
  if (!partner || !isTransitionTile(partner)) return;
  const partnerData = transitionData(partner);
  if (partnerData.connectedTileUuid && partnerData.connectedTileUuid !== tile.uuid) return;
  if (partnerData.connectedTileUuid === tile.uuid) return;
  await partner.update({
    [`flags.${MODULE_ID}.transition.connectedTileUuid`]: tile.uuid
  }, { ctnTransitionPairing: true });
}

function validateTransitionUpdate(tile, changes, operation = {}) {
  const data = transitionData(tile);
  if (!data || operation?.ctnTransitionPairing) return;
  const base = `flags.${MODULE_ID}.transition`;

  const submittedName = getSubmittedValue(changes, `${base}.name`, data.name);
  const cleanedName = String(submittedName ?? "").trim().replace(/\s+/g, " ");
  if (!cleanedName || !isTransitionNameAvailable(tile, cleanedName)) {
    notify("CTN.Transition.DuplicateName", { name: cleanedName || data.name });
    return false;
  }
  if (hasSubmittedValue(changes, `${base}.name`)) {
    setSubmittedValue(changes, `${base}.name`, cleanedName);
    changes.name = `CTN Transition: ${cleanedName}`;
  }

  if (hasSubmittedValue(changes, `${base}.hidden`)) {
    const hidden = bool(getSubmittedValue(changes, `${base}.hidden`, tile.hidden), tile.hidden);
    changes.hidden = hidden;
  }

  if (hasSubmittedValue(changes, `${base}.connectedTileUuid`)) {
    const nextUuid = String(getSubmittedValue(changes, `${base}.connectedTileUuid`, "") ?? "");
    const previousUuid = data.connectedTileUuid;

    if (previousUuid && nextUuid !== previousUuid) {
      notify("CTN.Transition.DisconnectFirst");
      return false;
    }

    if (nextUuid) {
      const partner = resolveTile(nextUuid);
      if (!partner || !isTransitionTile(partner) || partner.uuid === tile.uuid) {
        notify("CTN.Transition.InvalidPartner");
        return false;
      }
      const partnerData = transitionData(partner);
      if (partnerData.connectedTileUuid && partnerData.connectedTileUuid !== tile.uuid) {
        notify("CTN.Transition.AlreadyConnected");
        return false;
      }
    }

  }
}

function handleTransitionUpdated(tile, changes, operation = {}) {
  rebuildTransitionCache();
  if (operation?.ctnTransitionPairing || !isTransitionTile(tile)) return;
  const path = `flags.${MODULE_ID}.transition.connectedTileUuid`;
  if (!hasSubmittedValue(changes, path)) return;
  const newUuid = String(getSubmittedValue(changes, path, "") ?? "");
  if (!newUuid) return;
  void reconcilePair(tile, "", newUuid).catch((error) => {
    console.error(`${MODULE_ID} | Could not reconcile Transition pair`, error);
    notify("CTN.Transition.PairingFailed");
  });
}

function getCanvasElement() {
  return canvas?.app?.canvas ?? canvas?.app?.view ?? null;
}

function getTileSize() {
  const size = Number(canvas?.scene?.grid?.size ?? canvas?.grid?.size);
  return Number.isFinite(size) && size > 0 ? Math.round(size) : 100;
}

function disarmTransitionPlacement() {
  armedPlacement = false;
  if (placementCanvas && placementPointerHandler) {
    placementCanvas.removeEventListener("pointerup", placementPointerHandler, { capture: true });
  }
  if (placementEscapeHandler) window.removeEventListener("keydown", placementEscapeHandler);
  placementCanvas = null;
  placementPointerHandler = null;
  placementEscapeHandler = null;
}

async function createTransitionTile(event) {
  if (!canvas?.ready || !canvas.scene || !game.user?.isGM) return;
  const size = getTileSize();
  const point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
  const data = defaultTransitionData(canvas.scene);
  const [created] = await canvas.scene.createEmbeddedDocuments("Tile", [{
    name: `CTN Transition: ${data.name}`,
    x: Math.round(point.x - size / 2),
    y: Math.round(point.y - size / 2),
    width: size,
    height: size,
    hidden: false,
    texture: { src: ICON_PATHS[ICONS.ENTER_DOOR] },
    flags: { [MODULE_ID]: { transition: data } }
  }]);

  if (created) {
    ui.notifications.info(localized("CTN.Transition.Created", { name: data.name }));
    setTimeout(() => created.sheet?.render?.(true), 50);
  }
}

export function armTransitionPlacement() {
  if (!game.user?.isGM || !canvas?.ready) return;
  disarmTransitionPlacement();
  placementCanvas = getCanvasElement();
  if (!(placementCanvas instanceof HTMLCanvasElement)) return;

  armedPlacement = true;
  ui.notifications.info(game.i18n.localize("CTN.Transition.ArmedPlacement"));

  placementPointerHandler = (event) => {
    if (!armedPlacement || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    disarmTransitionPlacement();
    void createTransitionTile(event);
  };

  placementEscapeHandler = (event) => {
    if (event.key !== "Escape") return;
    disarmTransitionPlacement();
    ui.notifications.info(game.i18n.localize("CTN.Transition.PlacementCancelled"));
  };

  placementCanvas.addEventListener("pointerup", placementPointerHandler, { capture: true });
  window.addEventListener("keydown", placementEscapeHandler);
}

function belongsToCurrentScene(tile) {
  return Boolean(tile && canvas?.scene && tile.parent?.id === canvas.scene.id);
}

function rebuildTransitionCache() {
  const tiles = canvas?.scene?.tiles?.contents;
  transitionCache = Array.isArray(tiles) ? tiles.filter(isTransitionTile) : [];
}

function isEditingTiles() {
  return Boolean(game.user?.isGM && canvas?.activeLayer === canvas?.tiles);
}

function canvasPoint(clientX, clientY) {
  if (!canvas?.ready) return null;
  return canvas.canvasCoordinatesFromClient({ x: clientX, y: clientY });
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

function isAbove(candidate, current) {
  if (!current) return true;
  const elevationA = Number(candidate.elevation) || 0;
  const elevationB = Number(current.elevation) || 0;
  if (elevationA !== elevationB) return elevationA > elevationB;
  return (Number(candidate.sort) || 0) > (Number(current.sort) || 0);
}

function visibleToCurrentUser(tile) {
  return Boolean(game.user?.isGM || !tile.hidden);
}

function getTransitionAt(clientX, clientY) {
  const point = canvasPoint(clientX, clientY);
  if (!point) return null;
  let best = null;
  for (const tile of transitionCache) {
    if (!visibleToCurrentUser(tile) || !tileContainsPoint(tile, point)) continue;
    if (isAbove(tile, best)) best = tile;
  }
  return best;
}

function rectGap(a, b) {
  const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  return Math.hypot(dx, dy);
}

function tokenWithinTransitionRange(token, tile) {
  if (!token || token.parent?.id !== tile?.parent?.id) return false;
  const gridSize = Number(tile.parent?.grid?.size) || 100;
  const gridless = tile.parent?.grid?.type === CONST.GRID_TYPES.GRIDLESS;
  const maxGap = gridless ? gridSize : 3;
  return rectGap(tokenBounds(token), tileBounds(tile)) <= maxGap;
}

function tokenActor(token) {
  return token?.baseActor ?? game.actors.get(token?.actorId) ?? token?.actor ?? null;
}

function tokenForClickActivation(user, tile) {
  if (!user || !tile) return null;
  if (user.isGM) {
    const controlled = (canvas?.tokens?.controlled ?? [])
      .map((placeable) => placeable.document ?? placeable)
      .filter((token) => tokenWithinTransitionRange(token, tile));
    if (controlled.length === 1) return controlled[0];
    if (controlled.length > 1) notify("CTN.Transition.SelectOneToken");
    else notify("CTN.Transition.SelectToken");
    return null;
  }

  const actor = getUserActor(user);
  if (!actor) {
    notify("CTN.Notifications.NoCharacter");
    return null;
  }
  return actorTokensInScene(actor, tile.parent).find((token) => tokenWithinTransitionRange(token, tile)) ?? null;
}

function validateClickableActivation(tile, method) {
  const data = transitionData(tile);
  if (!data || data.activation !== method) return false;
  if (transitionStatus(tile) !== TRANSITION_STATUS.CONNECTED) {
    notify(transitionStatus(tile) === TRANSITION_STATUS.BROKEN
      ? "CTN.Transition.BrokenNotification"
      : "CTN.Transition.DisconnectedNotification");
    return false;
  }
  return true;
}

function onPointerUp(event) {
  if (isEditingTiles() || event.button !== 0 || event.altKey || event.ctrlKey) return;
  const tile = getTransitionAt(event.clientX, event.clientY);
  if (!tile || !validateClickableActivation(tile, TRANSITION_ACTIVATIONS.SINGLE)) return;
  const token = tokenForClickActivation(game.user, tile);
  if (!token) {
    if (!game.user.isGM) notify("CTN.Transition.PlayerTooFar");
    return;
  }
  event.preventDefault?.();
  void requestTransitionActivation(tile, token, TRANSITION_ACTIVATIONS.SINGLE);
}

function onDoubleClick(event) {
  if (isEditingTiles() || event.button !== 0 || event.altKey || event.ctrlKey) return;
  const tile = getTransitionAt(event.clientX, event.clientY);
  if (!tile || !validateClickableActivation(tile, TRANSITION_ACTIVATIONS.DOUBLE)) return;
  const token = tokenForClickActivation(game.user, tile);
  if (!token) {
    if (!game.user.isGM) notify("CTN.Transition.PlayerTooFar");
    return;
  }
  event.preventDefault?.();
  void requestTransitionActivation(tile, token, TRANSITION_ACTIVATIONS.DOUBLE);
}

function bindCanvasInteraction() {
  const element = getCanvasElement();
  if (!(element instanceof HTMLCanvasElement)) return;
  if (boundCanvas === element) {
    rebuildTransitionCache();
    return;
  }
  unbindCanvasInteraction();
  boundCanvas = element;
  pointerUpHandler = onPointerUp;
  doubleClickHandler = onDoubleClick;
  element.addEventListener("pointerup", pointerUpHandler);
  element.addEventListener("dblclick", doubleClickHandler);
  rebuildTransitionCache();
}

function unbindCanvasInteraction() {
  transitionCache = [];
  if (!boundCanvas) return;
  if (pointerUpHandler) boundCanvas.removeEventListener("pointerup", pointerUpHandler);
  if (doubleClickHandler) boundCanvas.removeEventListener("dblclick", doubleClickHandler);
  boundCanvas = null;
  pointerUpHandler = null;
  doubleClickHandler = null;
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

function tokenCenterAt(token, position) {
  const bounds = tokenBounds(token);
  return {
    x: Number(position?.x ?? token.x) + bounds.width / 2,
    y: Number(position?.y ?? token.y) + bounds.height / 2
  };
}

function tokenInsideTransition(token, tile, position = null) {
  return tileContainsPoint(tile, tokenCenterAt(token, position));
}

function firstEntryOnMovement(token, tile, movement) {
  const points = movementWaypoints(movement);
  if (points.length < 2) return null;
  if (tokenInsideTransition(token, tile, points[0])) return null;

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
      if (tokenInsideTransition(token, tile, pos)) return { position: pos, progress };
    }
  }
  return null;
}

function firstCrossedTransition(token, movement) {
  let best = null;
  for (const tile of [...(token?.parent?.tiles ?? [])].filter(isTransitionTile)) {
    const data = transitionData(tile);
    if (data?.activation !== TRANSITION_ACTIVATIONS.ENTER) continue;
    if (!game.user?.isGM && tile.hidden) continue;
    if (transitionStatus(tile) !== TRANSITION_STATUS.CONNECTED) continue;
    const entry = firstEntryOnMovement(token, tile, movement);
    if (!entry) continue;
    if (!best || entry.progress < best.entry.progress) best = { tile, entry };
  }
  return best;
}

async function stopAtTransitionEntry(token, position) {
  try {
    await token.update({
      x: Math.round(position.x),
      y: Math.round(position.y)
    }, { ctnTransitionInternal: true, ctnTriggerInternal: true, animate: false });
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not stop Token at Transition entry`, error);
  }
}

function onPreMoveToken(token, movement, operation = {}) {
  if (operation?.ctnTransitionInternal) return;
  if (localActivationLocks.has(token.uuid)) return false;
  const crossed = firstCrossedTransition(token, movement);
  if (!crossed) return;

  if (!game.user?.isGM && !primaryGM()) {
    notify("CTN.Notifications.GMRequired");
    return;
  }

  localActivationLocks.add(token.uuid);
  setTimeout(async () => {
    await stopAtTransitionEntry(token, crossed.entry.position);
    await requestTransitionActivation(crossed.tile, token, TRANSITION_ACTIVATIONS.ENTER, { alreadyLocked: true });
  }, 0);
  return false;
}

function tokenSize(token) {
  const size = token?.getSize?.() ?? tokenBounds(token);
  return {
    width: Math.max(1, Number(size.width) || 1),
    height: Math.max(1, Number(size.height) || 1)
  };
}

async function actorTokenSize(actor, scene, existingToken = null) {
  if (existingToken) return tokenSize(existingToken);
  try {
    const ephemeral = await actor.getTokenDocument({}, { parent: scene });
    const size = ephemeral.getSize?.();
    if (size) return {
      width: Math.max(1, Number(size.width) || 1),
      height: Math.max(1, Number(size.height) || 1)
    };
    const gridSize = Number(scene.grid?.size) || 100;
    return {
      width: Math.max(1, Number(ephemeral.width) || 1) * gridSize,
      height: Math.max(1, Number(ephemeral.height) || 1) * gridSize
    };
  } catch (_error) {
    const gridSize = Number(scene.grid?.size) || 100;
    return { width: gridSize, height: gridSize };
  }
}

function stackedPosition(tile, size) {
  const bounds = tileBounds(tile);
  return {
    x: Math.round(bounds.x + bounds.width / 2 - size.width / 2),
    y: Math.round(bounds.y + bounds.height / 2 - size.height / 2)
  };
}

async function moveSameSceneToken(token, targetTile) {
  const pos = stackedPosition(targetTile, tokenSize(token));
  await token.update(pos, { ctnTransitionInternal: true, ctnTriggerInternal: true, animate: false });
  return token;
}

async function createOrMoveDestinationToken(actor, targetScene, targetTile) {
  const existing = actorTokensInScene(actor, targetScene)[0] ?? null;
  const size = await actorTokenSize(actor, targetScene, existing);
  const pos = stackedPosition(targetTile, size);

  if (existing) {
    await existing.update(pos, { ctnTransitionInternal: true, ctnTriggerInternal: true, animate: false });
    return existing;
  }

  const tokenDocument = await actor.getTokenDocument(pos, { parent: targetScene });
  const raw = tokenDocument.toObject();
  delete raw._id;
  delete raw._stats;
  raw.x = pos.x;
  raw.y = pos.y;
  const [created] = await targetScene.createEmbeddedDocuments("Token", [raw], {
    ctnTransitionInternal: true,
    ctnTriggerInternal: true
  });
  return created ?? null;
}

async function deleteSourceToken(sceneId, tokenId) {
  const scene = game.scenes.get(sceneId);
  if (!scene?.tokens?.get(tokenId)) return;
  await scene.deleteEmbeddedDocuments("Token", [tokenId], {
    ctnTransitionInternal: true,
    ctnTriggerInternal: true
  });
}

async function safePreload(scene) {
  if (!scene) return;
  try {
    await game.scenes.preload(scene.id, { broadcast: false });
  } catch (error) {
    console.warn(`${MODULE_ID} | Transition Scene preload failed for ${scene.name}; continuing`, error);
  }
}

function waitForCanvasReady(sceneId, { timeout = TRANSITION_TIMEOUT_MS } = {}) {
  if (canvas?.ready && canvas.scene?.id === sceneId) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    let timer = null;
    const cleanup = () => {
      Hooks.off("canvasReady", onReady);
      if (timer) clearTimeout(timer);
    };
    const onReady = (readyCanvas) => {
      const current = readyCanvas?.scene?.id ?? canvas?.scene?.id;
      if (current !== sceneId) return;
      cleanup();
      resolve(true);
    };
    Hooks.on("canvasReady", onReady);
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for Transition canvasReady(${sceneId})`));
    }, timeout);
  });
}

function assignedActiveUser(actor) {
  if (!actor) return null;
  return [...game.users].find((user) => user.active && !user.isGM && getUserActor(user)?.id === actor.id) ?? null;
}

function resolveToken(uuid) {
  if (!uuid) return null;
  try {
    const doc = fromUuidSync(uuid);
    if (doc?.documentName === "Token") return doc;
  } catch (_error) {
    // Fall through to explicit lookup.
  }
  const match = /^Scene\.([^.]+)\.Token\.([^.]+)$/.exec(String(uuid));
  return match ? game.scenes.get(match[1])?.tokens?.get(match[2]) ?? null : null;
}

function transitionPlaceable(token) {
  if (!token || canvas?.scene?.id !== token.parent?.id) return null;
  return token.object ?? canvas.tokens?.get(token.id) ?? null;
}

function scaleTarget(placeable) {
  // Animate the Token placeable container, never the Token mesh.
  // TokenMesh.scale is part of Foundry's native texture/grid sizing and
  // writing it back can compound the rendered Token size after refreshes.
  return placeable ?? null;
}

function readScale(target) {
  const x = Number(target?.scale?.x);
  const y = Number(target?.scale?.y);
  return {
    x: Number.isFinite(x) ? x : 1,
    y: Number.isFinite(y) ? y : 1
  };
}

function usableBaseScale(scale) {
  const tiny = (value) => Math.abs(Number(value) || 0) <= 0.01;
  return (scale && !tiny(scale.x) && !tiny(scale.y)) ? scale : { x: 1, y: 1 };
}

function setScale(target, x, y) {
  const scale = target?.scale;
  if (!scale) return false;
  if (typeof scale.set === "function") scale.set(x, y);
  else {
    scale.x = x;
    scale.y = y;
  }
  return true;
}

function animateScale(target, from, to, duration = EFFECT_MS) {
  return new Promise((resolve) => {
    if (!target?.scale) {
      resolve(false);
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = t * t * (3 - 2 * t);
      setScale(target,
        from.x + ((to.x - from.x) * eased),
        from.y + ((to.y - from.y) * eased));
      if (t >= 1) resolve(true);
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

async function playTransitionEffect(tokenUuid, phase) {
  const token = resolveToken(tokenUuid);
  const placeable = transitionPlaceable(token);
  const target = scaleTarget(placeable);
  if (!target?.scale) return;

  const key = tokenUuid;
  const current = readScale(target);
  let base = localEffectScales.get(key);

  if (phase === "out") {
    base = usableBaseScale(current);
    localEffectScales.set(key, base);
    await animateScale(target, base, { x: 0.001, y: 0.001 });
    return;
  }

  if (phase === "prepare") {
    base = usableBaseScale(current);
    localEffectScales.set(key, base);
    setScale(target, 0.001, 0.001);
    return;
  }

  if (phase === "in") {
    base = usableBaseScale(base ?? current);
    localEffectScales.set(key, base);
    setScale(target, 0.001, 0.001);
    try {
      await animateScale(target, { x: 0.001, y: 0.001 }, base);
    } finally {
      setScale(target, base.x, base.y);
      localEffectScales.delete(key);
    }
    return;
  }

  if (phase === "restore") {
    base = usableBaseScale(base ?? current);
    setScale(target, base.x, base.y);
    localEffectScales.delete(key);
  }
}

function broadcastEffect(tokenUuid, phase) {
  if (!tokenUuid) return;
  void playTransitionEffect(tokenUuid, phase);
  game.socket.emit(SOCKET_NAME, {
    type: "transition-effect",
    senderId: game.user.id,
    tokenUuid,
    phase
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emitToUser(type, userId, payload = {}) {
  game.socket.emit(SOCKET_NAME, { type, targetUserId: userId, ...payload });
}

function failActivation(requesterId, tokenUuid, reason = "CTN.Transition.Failed") {
  if (requesterId === game.user.id) {
    localActivationLocks.delete(tokenUuid);
    notify(reason);
    return;
  }
  emitToUser("transition-failed", requesterId, { tokenUuid, reason });
}

function validateAuthorityRequest({ sourceTile, sourceToken, requester, method }) {
  const data = transitionData(sourceTile);
  if (!data || data.activation !== method) return false;
  if (transitionStatus(sourceTile) !== TRANSITION_STATUS.CONNECTED) return false;
  if (!requester || !sourceToken || sourceToken.parent?.id !== sourceTile.parent?.id) return false;
  if (!requester.isGM) {
    if (sourceTile.hidden) return false;
    const actor = getUserActor(requester);
    const sourceActor = tokenActor(sourceToken);
    if (!actor || !sourceActor || actor.id !== sourceActor.id) return false;
  }
  if ([TRANSITION_ACTIVATIONS.SINGLE, TRANSITION_ACTIVATIONS.DOUBLE].includes(method)
      && !tokenWithinTransitionRange(sourceToken, sourceTile)) return false;
  return true;
}

async function finishAuthorityPending(message) {
  const pending = authorityPending.get(message.transitionId);
  if (!pending || pending.targetUserId !== message.requesterId) return;
  if (pending.targetSceneId !== message.targetSceneId) return;

  clearTimeout(pending.timer);
  authorityPending.delete(message.transitionId);
  authorityLocks.delete(pending.sourceTokenUuid);
  localActivationLocks.delete(pending.sourceTokenUuid);

  try {
    await deleteSourceToken(pending.sourceSceneId, pending.sourceTokenId);
    if (pending.effectEnabled) broadcastEffect(pending.targetTokenUuid, "in");
    emitToUser("transition-complete", pending.targetUserId, {
      transitionId: message.transitionId,
      tokenUuid: pending.sourceTokenUuid
    });
  } catch (error) {
    console.error(`${MODULE_ID} | Transition source cleanup failed`, error);
    if (pending.effectEnabled) {
      broadcastEffect(pending.sourceTokenUuid, "restore");
      broadcastEffect(pending.targetTokenUuid, "restore");
    }
    emitToUser("transition-failed", pending.targetUserId, {
      transitionId: message.transitionId,
      tokenUuid: pending.sourceTokenUuid,
      reason: "CTN.Transition.Failed"
    });
  }
}

async function performAuthorityTransition({ sourceTile, sourceToken, requester, method }) {
  const sourceData = transitionData(sourceTile);
  const targetTile = resolveTile(sourceData.connectedTileUuid);
  if (!targetTile || transitionStatus(sourceTile) !== TRANSITION_STATUS.CONNECTED) {
    failActivation(requester.id, sourceToken.uuid, "CTN.Transition.BrokenNotification");
    return;
  }

  if (authorityLocks.has(sourceToken.uuid)) {
    failActivation(requester.id, sourceToken.uuid, "CTN.Notifications.NavigationBusy");
    return;
  }
  authorityLocks.add(sourceToken.uuid);

  const effectEnabled = Boolean(sourceData.effectEnabled);
  let preparedTargetTokenUuid = "";
  try {
    if (effectEnabled) {
      broadcastEffect(sourceToken.uuid, "out");
      await delay(EFFECT_MS + 25);
    }

    const sourceScene = sourceTile.parent;
    const targetScene = targetTile.parent;

    if (sourceScene.id === targetScene.id) {
      const moved = await moveSameSceneToken(sourceToken, targetTile);
      if (effectEnabled) broadcastEffect(moved.uuid, "in");
      authorityLocks.delete(sourceToken.uuid);
      localActivationLocks.delete(sourceToken.uuid);
      if (!requester.isGM) emitToUser("transition-complete", requester.id, { tokenUuid: sourceToken.uuid });
      return;
    }

    const actor = tokenActor(sourceToken);
    if (!actor) throw new Error("Transition source Token has no Actor");

    await safePreload(targetScene);
    const targetToken = await createOrMoveDestinationToken(actor, targetScene, targetTile);
    if (!targetToken) throw new Error("Transition destination Token could not be prepared");
    preparedTargetTokenUuid = targetToken.uuid;
    if (effectEnabled) broadcastEffect(targetToken.uuid, "prepare");

    const targetUser = requester.isGM ? assignedActiveUser(actor) : requester;

    if (!targetUser) {
      if (requester.isGM) {
        const ready = waitForCanvasReady(targetScene.id);
        await targetScene.view();
        await ready;
        if (effectEnabled) await playTransitionEffect(targetToken.uuid, "prepare");
      }
      await deleteSourceToken(sourceScene.id, sourceToken.id);
      if (effectEnabled) broadcastEffect(targetToken.uuid, "in");
      authorityLocks.delete(sourceToken.uuid);
      localActivationLocks.delete(sourceToken.uuid);
      return;
    }

    const transitionId = randomId();
    const timer = setTimeout(() => {
      const pending = authorityPending.get(transitionId);
      if (!pending) return;
      authorityPending.delete(transitionId);
      authorityLocks.delete(sourceToken.uuid);
      localActivationLocks.delete(sourceToken.uuid);
      if (effectEnabled) {
        broadcastEffect(sourceToken.uuid, "restore");
        broadcastEffect(targetToken.uuid, "restore");
      }
      emitToUser("transition-failed", targetUser.id, {
        transitionId,
        tokenUuid: sourceToken.uuid,
        reason: "CTN.Notifications.NavigationTimeout"
      });
    }, TRANSITION_TIMEOUT_MS);

    authorityPending.set(transitionId, {
      targetUserId: targetUser.id,
      sourceSceneId: sourceScene.id,
      sourceTokenId: sourceToken.id,
      sourceTokenUuid: sourceToken.uuid,
      targetSceneId: targetScene.id,
      targetTokenUuid: targetToken.uuid,
      effectEnabled,
      timer
    });

    emitToUser("transition-begin", targetUser.id, {
      transitionId,
      targetSceneId: targetScene.id,
      targetTokenUuid: targetToken.uuid,
      effectEnabled,
      tokenUuid: sourceToken.uuid
    });
    targetScene.pullUsers([targetUser.id]);
  } catch (error) {
    console.error(`${MODULE_ID} | Transition failed`, error);
    authorityLocks.delete(sourceToken.uuid);
    if (effectEnabled) {
      broadcastEffect(sourceToken.uuid, "restore");
      if (preparedTargetTokenUuid) broadcastEffect(preparedTargetTokenUuid, "restore");
    }
    failActivation(requester.id, sourceToken.uuid, "CTN.Transition.Failed");
  }
}

export async function requestTransitionActivation(tile, token, method, { alreadyLocked = false } = {}) {
  if (!tile || !token) return false;
  const data = transitionData(tile);
  if (!data || data.activation !== method) {
    localActivationLocks.delete(token.uuid);
    return false;
  }

  if (!alreadyLocked) {
    if (localActivationLocks.has(token.uuid)) return false;
    localActivationLocks.add(token.uuid);
  }

  const status = transitionStatus(tile);
  if (status !== TRANSITION_STATUS.CONNECTED) {
    localActivationLocks.delete(token.uuid);
    notify(status === TRANSITION_STATUS.BROKEN
      ? "CTN.Transition.BrokenNotification"
      : "CTN.Transition.DisconnectedNotification");
    return false;
  }

  if (game.user?.isGM) {
    await performAuthorityTransition({ sourceTile: tile, sourceToken: token, requester: game.user, method });
    return true;
  }

  const gm = primaryGM();
  if (!gm) {
    localActivationLocks.delete(token.uuid);
    notify("CTN.Notifications.GMRequired");
    return false;
  }

  game.socket.emit(SOCKET_NAME, {
    type: "transition-activate",
    requesterId: game.user.id,
    sourceTileUuid: tile.uuid,
    sourceTokenUuid: token.uuid,
    method
  });
  return true;
}

function beginLocalTransition(message) {
  if (message.targetUserId !== game.user.id || game.user.isGM) return;
  const targetScene = game.scenes.get(message.targetSceneId);
  if (!targetScene) return;

  const timeout = setTimeout(() => {
    if (!localPending.has(message.transitionId)) return;
    const pending = localPending.get(message.transitionId);
    localPending.delete(message.transitionId);
    localActivationLocks.delete(message.tokenUuid);
    if (pending?.effectEnabled && pending.targetTokenUuid) {
      void playTransitionEffect(pending.targetTokenUuid, "restore");
    }
    notify("CTN.Notifications.NavigationTimeout");
  }, TRANSITION_TIMEOUT_MS + 2_000);

  localPending.set(message.transitionId, {
    targetSceneId: message.targetSceneId,
    targetTokenUuid: message.targetTokenUuid,
    effectEnabled: Boolean(message.effectEnabled),
    tokenUuid: message.tokenUuid,
    arrivedSent: false,
    timeout
  });
  void safePreload(targetScene);
}

function finishLocalTransition(message) {
  if (message.targetUserId !== game.user.id) return;
  const pending = message.transitionId ? localPending.get(message.transitionId) : null;
  if (pending?.timeout) clearTimeout(pending.timeout);
  if (message.transitionId) localPending.delete(message.transitionId);
  if (message.tokenUuid) localActivationLocks.delete(message.tokenUuid);
  if (message.reason) notify(message.reason);
}

async function handleLocalCanvasReady(readyCanvas) {
  if (game.user?.isGM || !localPending.size) return;
  const sceneId = readyCanvas?.scene?.id ?? canvas?.scene?.id;
  for (const [transitionId, pending] of localPending) {
    if (pending.arrivedSent || pending.targetSceneId !== sceneId) continue;
    pending.arrivedSent = true;
    if (pending.effectEnabled && pending.targetTokenUuid) {
      await playTransitionEffect(pending.targetTokenUuid, "prepare");
    }
    game.socket.emit(SOCKET_NAME, {
      type: "transition-arrived",
      transitionId,
      requesterId: game.user.id,
      targetSceneId: sceneId
    });
  }
}

async function handleSocketMessage(message) {
  if (!message?.type?.startsWith?.("transition-")) return;

  if (message.type === "transition-effect") {
    if (message.senderId === game.user.id) return;
    await playTransitionEffect(message.tokenUuid, message.phase);
    return;
  }

  if (message.type === "transition-begin") {
    beginLocalTransition(message);
    return;
  }

  if (message.type === "transition-complete") {
    finishLocalTransition(message);
    return;
  }

  if (message.type === "transition-failed") {
    finishLocalTransition(message);
    return;
  }

  if (!isPrimaryGM()) return;

  if (message.type === "transition-activate") {
    const requester = game.users.get(message.requesterId);
    const sourceTile = resolveTile(message.sourceTileUuid);
    const sourceToken = resolveToken(message.sourceTokenUuid);
    if (!validateAuthorityRequest({ sourceTile, sourceToken, requester, method: message.method })) {
      failActivation(message.requesterId, message.sourceTokenUuid, "CTN.Transition.Failed");
      return;
    }
    await performAuthorityTransition({ sourceTile, sourceToken, requester, method: message.method });
    return;
  }

  if (message.type === "transition-arrived") {
    await finishAuthorityPending(message);
  }
}

export function initializeTransitionSocket() {
  game.socket.on(SOCKET_NAME, handleSocketMessage);
}

export function registerTransitionHooks() {
  Hooks.on("canvasReady", (readyCanvas) => {
    bindCanvasInteraction();
    void handleLocalCanvasReady(readyCanvas);
  });
  Hooks.on("canvasTearDown", () => {
    unbindCanvasInteraction();
    disarmTransitionPlacement();
  });
  Hooks.on("createTile", (tile) => {
    if (belongsToCurrentScene(tile)) rebuildTransitionCache();
  });
  Hooks.on("updateTile", handleTransitionUpdated);
  Hooks.on("deleteTile", (tile) => {
    if (belongsToCurrentScene(tile)) rebuildTransitionCache();
  });
  Hooks.on("preUpdateTile", validateTransitionUpdate);
  Hooks.on("preMoveToken", onPreMoveToken);

  if (canvas?.ready) bindCanvasInteraction();
}
