/**
 * Optional Sequencer/JB2A visual integration. CTN Tiles remain the exclusive
 * authority for mechanics; everything in this file is visual only.
 */
import { MODULE_ID, SOCKET_NAME } from "./constants.mjs";
import { isNavigationLink, isArrivalPoint, resolveTile } from "./route-service.mjs";
import { isTransitionTile } from "./transition-service.mjs";
import { isTriggerTile } from "./trigger-service.mjs";
import { tileBounds } from "./token-service.mjs";
import { tokenInsideInteraction } from "./interaction-area.mjs";

const FLAG = "visualFX";
const SEQ_FX_EVENT = "ctnVisualFXEvent";
const MAX_DURATION_S = 3600;
const INITIAL_OCCUPANCY_GRACE_MS = 1000; // Trigger detection can precede a paused/committed movement
const OCCUPANCY_POLL_MS = 300;
const REMOTE_ACK_TIMEOUT_MS = 3500;
const ACTIVE = new Map(); // tileUuid -> Map(effectName -> record), GM authority only
const ENDING = new Set();
const LAST_EVENTS = new Map();
let pickerSession = null;
let occupancyPoll = null;
let databaseCache = null;
let databaseCacheInstance = null;

export const FX_EVENTS = Object.freeze({
  ACTIVATION: "activation", PASS: "pass", FAIL: "fail", HAZARD: "hazard",
  BEFORE: "before", AFTER: "after", ARRIVAL: "arrival"
});
export const FX_LIFETIMES = Object.freeze({
  NATURAL: "natural", SECONDS: "seconds", TOKEN: "token", AREA: "area", PERSISTENT: "persistent"
});

function primaryGM() {
  return [...game.users].filter((u) => u.active && u.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}
function isAuthority() { return Boolean(game.user?.isGM && primaryGM()?.id === game.user.id); }
export function isSequencerAvailable() {
  return Boolean(game.modules.get("sequencer")?.active && globalThis.Sequencer?.EffectManager && globalThis.Sequence);
}
export function isJB2AAvailable() {
  return Boolean(isSequencerAvailable() && (game.modules.get("JB2A_DnD5e")?.active || game.modules.get("jb2a_patreon")?.active));
}
const n = (value, fallback, lo, hi) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(hi, Math.max(lo, parsed)) : fallback;
};
const valid = (value, options, fallback) => options.includes(value) ? value : fallback;

export function fxKind(tile) {
  if (isTriggerTile(tile)) return "trigger";
  if (isTransitionTile(tile)) return "transition";
  if (isArrivalPoint(tile)) return "arrival";
  if (isNavigationLink(tile)) return "navigation";
  return null;
}
export function fxEventsFor(tile) {
  switch (fxKind(tile)) {
    case "trigger": return ["activation", "pass", "fail", "hazard", "linked"];
    case "transition": return ["before", "after", "linked"];
    case "navigation": return ["activation"];
    case "arrival": return ["arrival"];
    default: return [];
  }
}
export function fxConfig(tile) {
  const raw = tile?.getFlag?.(MODULE_ID, FLAG) ?? {};
  const kind = fxKind(tile);
  const events = fxEventsFor(tile);
  return {
    enabled: raw.enabled === true || raw.enabled === "true",
    effect: typeof raw.effect === "string" ? raw.effect.trim() : "",
    interactionAtFX: raw.interactionAtFX === true || raw.interactionAtFX === "true",
    event: valid(raw.event, events, events[0] ?? "activation"),
    position: valid(raw.position, ["tile", "custom", "other"], "tile"),
    point: { x: n(raw.point?.x, 0, -1000000, 1000000), y: n(raw.point?.y, 0, -1000000, 1000000) },
    otherTileUuid: String(raw.otherTileUuid ?? ""),
    width: n(raw.width, 3, 0.1, 100), height: n(raw.height, 3, 0.1, 100),
    lifetime: valid(raw.lifetime, Object.values(FX_LIFETIMES), "natural"),
    seconds: n(raw.seconds, 5, 0.1, MAX_DURATION_S),
    fadeIn: n(raw.fadeIn, 0.3, 0, 60), fadeOut: n(raw.fadeOut, 0.5, 0, 60),
    endMode: valid(raw.endMode, ["instant", "fade"], "fade"),
    repeat: valid(raw.repeat, ["one", "per"], "one"),
    kind
  };
}

/** Real JB2A Database keys only, never fabricated preset names. */
export function jb2aPaths() {
  if (!isSequencerAvailable()) return [];
  try {
    const db = globalThis.Sequencer.Database;
    if (databaseCacheInstance === db && databaseCache?.length) return databaseCache;
    let keys = db.getPathsUnder("jb2a", { fullyQualified: true });
    if (!Array.isArray(keys)) keys = [];
    // Avoid directories and unsupported shapes from optional modules.
    databaseCacheInstance = db;
    databaseCache = [...new Set(keys.filter((v) => typeof v === "string" && v.startsWith("jb2a.")))].sort();
    return databaseCache;
  } catch (error) {
    console.warn(`${MODULE_ID} | JB2A database enumeration unavailable`, error);
    return [];
  }
}

export function fxCenter(tile, cfg = fxConfig(tile)) {
  if (cfg.position === "custom") return { ...cfg.point };
  const other = cfg.position === "other" ? resolveTile(cfg.otherTileUuid) : null;
  const source = other?.parent?.id === tile?.parent?.id ? other : tile;
  const bounds = tileBounds(source);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}
function effectName(tile) {
  return `ctn-fx-${tile.parent.id}-${tile.id}-${foundry.utils.randomID()}`;
}
function recordsFor(tile) {
  if (!ACTIVE.has(tile.uuid)) ACTIVE.set(tile.uuid, new Map());
  return ACTIVE.get(tile.uuid);
}
function forgetRecord(tile, name) {
  const records = ACTIVE.get(tile.uuid);
  const record = records?.get(name);
  if (record?.timer) clearTimeout(record.timer);
  records?.delete(name);
  if (records && !records.size) ACTIVE.delete(tile.uuid);
}
function scheduleRemoteTimeout(tile, name) {
  const record = ACTIVE.get(tile.uuid)?.get(name);
  if (!record) return;
  record.timer = setTimeout(() => {
    if (!record.acknowledged) {
      console.warn(`${MODULE_ID} | Remote Visual FX was not acknowledged: ${name}`);
      forgetRecord(tile, name);
    }
  }, REMOTE_ACK_TIMEOUT_MS);
}
function tokenInTile(token, tile) {
  return tokenInsideInteraction(token, tile);
}
function anyOccupant(tile) {
  return [...(tile.parent?.tokens ?? [])].some((token) => tokenInTile(token, tile));
}
function lookupToken(uuid) {
  if (!uuid) return null;
  try { return fromUuidSync(uuid); } catch (_error) { return null; }
}

async function terminate(tile, name, record, immediate = false) {
  if (ENDING.has(name)) return;
  ENDING.add(name);
  try {
    if (record.timer) clearTimeout(record.timer);
    // The fadeOut configured on a persistent Sequencer effect plays during
    // EffectManager.endEffects; no CTN animation or Token scaling is involved.
    await globalThis.Sequencer?.EffectManager?.endEffects?.({ name, origin: tile.uuid, sceneId: tile.parent.id });
    if (record.runnerId && record.runnerId !== game.user.id) {
      game.socket.emit(SOCKET_NAME, {
        type: "ctn-visual-fx-remote-end", senderId: game.user.id,
        targetUserId: record.runnerId, tileUuid: tile.uuid, name
      });
    }
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not end Visual FX ${name}`, error);
  } finally {
    forgetRecord(tile, name);
    ENDING.delete(name);
  }
}
export async function stopTileFX(tile, { clear = false } = {}) {
  if (!isAuthority() || !tile) return;
  const records = ACTIVE.get(tile.uuid) ?? new Map();
  await Promise.all([...records].map(([name, record]) => terminate(tile, name, record)));
  // Also catch Sequencer-persisted effects restored after CTN/world reload.
  try {
    await globalThis.Sequencer?.EffectManager?.endEffects?.({
      origin: tile.uuid,
      name: `ctn-fx-${tile.parent.id}-${tile.id}-*`,
      sceneId: tile.parent.id
    });
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not clean restored Visual FX`, error);
  }
  if (clear) ACTIVE.delete(tile.uuid);
}
async function expire(tile, name) {
  const record = ACTIVE.get(tile.uuid)?.get(name);
  if (record) await terminate(tile, name, record);
}

async function executeSequence(tile, cfg, name, { preview = false } = {}) {
  const center = fxCenter(tile, cfg);
  let section = new globalThis.Sequence().effect()
    .file(cfg.effect)
    .atLocation(center)
    .size({ width: cfg.width, height: cfg.height }, { gridUnits: true })
    .name(name)
    .origin(tile.uuid);
  if (preview) {
    section = section.locally().duration(2000).fadeOut(250);
  } else {
    if (cfg.fadeIn > 0) section = section.fadeIn(Math.round(cfg.fadeIn * 1000));
    if (cfg.lifetime === FX_LIFETIMES.NATURAL) {
      if (cfg.endMode === "fade" && cfg.fadeOut > 0) section = section.fadeOut(Math.round(cfg.fadeOut * 1000));
    } else if (cfg.lifetime === FX_LIFETIMES.SECONDS) {
      section = section.duration(Math.round(cfg.seconds * 1000));
      if (cfg.endMode === "fade" && cfg.fadeOut > 0) section = section.fadeOut(Math.round(Math.min(cfg.fadeOut, cfg.seconds) * 1000));
    } else {
      // Persist holds ownership; loops: 0 replays full finite assets as well
      // as JB2A assets with internal loop markers, until CTN ends the effect.
      section = section.persist().loopOptions({ loops: 0 });
      if (cfg.endMode === "fade" && cfg.fadeOut > 0) {
        section = section.fadeOut(Math.round(cfg.fadeOut * 1000))
          .extraEndDuration(Math.round(cfg.fadeOut * 1000));
      }
    }
  }
  return section.play();
}
function remoteRunner(sceneId) {
  // If the GM is viewing a different Scene, a player with that Scene loaded
  // can originate the Sequencer effect, which Sequencer then synchronizes.
  return [...game.users]
    .filter((u) => u.active && u.id !== game.user.id && u.viewedScene === sceneId)
    .sort((a,b) => a.id.localeCompare(b.id))[0] ?? null;
}

export async function playTileFX(tile, { event, tokenUuid = "", preview = false, override = null } = {}) {
  if (!tile || !isSequencerAvailable()) return false;
  if (!preview && !isAuthority()) return false;
  const cfg = override ?? fxConfig(tile);
  if (!preview && (!cfg.enabled || cfg.event !== event)) return false;
  if (!cfg.effect || !jb2aPaths().includes(cfg.effect)) return false;
  const records = preview ? null : recordsFor(tile);
  if (!preview && cfg.repeat === "one" && records.size) return false;
  const name = preview ? `ctn-preview-${foundry.utils.randomID()}` : effectName(tile);
  const now = Date.now();
  if (!preview) records.set(name, {
    lifetime: cfg.lifetime, tokenUuid, runnerId: null, timer: null,
    startedAt: now, graceUntil: now + INITIAL_OCCUPANCY_GRACE_MS,
    acknowledged: false,
    maxRuntimeMs: cfg.lifetime === FX_LIFETIMES.SECONDS
      ? cfg.seconds * 1000 + 5000 : cfg.lifetime === FX_LIFETIMES.NATURAL ? 60000 : 0
  });
  try {
    const remote = !preview && canvas?.scene?.id !== tile.parent.id
      ? remoteRunner(tile.parent.id) : null;
    if (remote) {
      const record = records.get(name);
      record.runnerId = remote.id;
      scheduleRemoteTimeout(tile, name);
      game.socket.emit(SOCKET_NAME, {
        type: "ctn-visual-fx-remote-play", senderId: game.user.id,
        targetUserId: remote.id, tileUuid: tile.uuid, name
      });
    } else if (!preview && canvas?.scene?.id !== tile.parent.id) {
      // No client with this scene loaded; never draw on the wrong scene.
      forgetRecord(tile, name);
      return false;
    } else {
      // Do not await the lifetime of a persistent effect. A Sequence's play()
      // promise can stay unresolved until the effect has ended.
      void executeSequence(tile, cfg, name, { preview }).then(() => {
        if (!preview && [FX_LIFETIMES.NATURAL, FX_LIFETIMES.SECONDS].includes(cfg.lifetime)) {
          forgetRecord(tile, name);
        }
      }).catch((error) => {
        console.error(`${MODULE_ID} | Visual FX failed`, error);
        if (!preview) forgetRecord(tile, name);
      });
    }
    // No token exists for navigation/arrival events. TOKEN lifetime with no
    // activating token is a short activation FX, not a permanent orphan.
    if (!preview && cfg.lifetime === FX_LIFETIMES.TOKEN && !tokenUuid) {
      const record = records.get(name);
      if (record) record.timer = setTimeout(() => void expire(tile, name), INITIAL_OCCUPANCY_GRACE_MS);
    }
    return true;
  } catch (error) {
    forgetRecord(tile, name);
    console.warn(`${MODULE_ID} | Visual FX activation failed`, error);
    return false;
  }
}

function checkLifetimeForTile(tile) {
  if (!isAuthority()) return;
  const records = ACTIVE.get(tile.uuid);
  if (!records?.size) return;
  const now = Date.now();
  for (const [name, record] of records) {
    if (ENDING.has(name) || now < record.graceUntil) continue;
    if (record.lifetime === FX_LIFETIMES.TOKEN) {
      const token = lookupToken(record.tokenUuid);
      if (!tokenInTile(token, tile)) void expire(tile, name);
    } else if (record.lifetime === FX_LIFETIMES.AREA && !anyOccupant(tile)) {
      void expire(tile, name);
    }
  }
}
function checkLifetimesForScene(scene) {
  if (!isAuthority() || !scene) return;
  for (const uuid of ACTIVE.keys()) {
    const tile = resolveTile(uuid);
    if (tile?.parent?.id === scene.id) checkLifetimeForTile(tile);
  }
}

/** Called only after the existing CTN flow accepts an actual action. */
export function fireTileFXEvent(tile, event, token = null) {
  if (!tile || !isAuthority()) return;
  // Coalesce duplicate parallel hooks, not distinct users.
  const key = `${tile.uuid}/${event}/${token?.uuid ?? ""}`;
  const now = Date.now();
  if ((LAST_EVENTS.get(key) ?? 0) + 40 < now) {
    LAST_EVENTS.set(key, now);
    void playTileFX(tile, { event, tokenUuid: token?.uuid ?? "" });
  }
}

function onTileUpdate(tile, changes, operation = {}) {
  if (!isAuthority()) return;
  const cfgChanges = Object.keys(changes).some((k) => k.includes("visualFX"))
    || Boolean(changes.flags?.[MODULE_ID]?.visualFX);
  const linkedChanged = Object.keys(changes).some((k) => k.includes("linkedActivation"))
    || Boolean(changes.flags?.[MODULE_ID]?.linkedActivation);
  if (linkedChanged && !operation.ctnLinkedState) {
    const data = tile.getFlag(MODULE_ID, "linkedActivation");
    if (data && (data.enabled === false || data.enabled === "false"
        || data.active === false || data.active === "false")) void stopTileFX(tile);
  }
  if (cfgChanges) {
    // A new effect/position/duration replaces the previous occurrence. Old
    // effect names must not survive after saving a changed configuration.
    void stopTileFX(tile);
  }
  if (isTriggerTile(tile)) {
    const state = tile.getFlag(MODULE_ID, "trigger")?.state;
    // Reset, disable or rearm end active FX rather than silently carrying it.
    const stateChanged = changes.flags?.[MODULE_ID]?.trigger?.state !== undefined
      || Object.keys(changes).some((k) => k.includes("trigger.state"));
    const hiddenChanged = changes.hidden !== undefined;
    if (stateChanged && (state === "disabled" || (state === "armed" && hiddenChanged))) {
      // Explicit Reset/re-arm/disable, not a regular save-result state cycle.
      void stopTileFX(tile);
    }
  }
}

export function registerVisualFXHooks() {
  Hooks.on(SEQ_FX_EVENT, ({ tile, event, token }) => fireTileFXEvent(tile, event, token));
  Hooks.on("updateToken", (token, changes) => {
    if (changes.x !== undefined || changes.y !== undefined || changes.elevation !== undefined) {
      checkLifetimesForScene(token.parent);
    }
  });
  Hooks.on("moveToken", (token) => checkLifetimesForScene(token.parent));
  Hooks.on("deleteToken", (token) => checkLifetimesForScene(token.parent));
  Hooks.on("updateTile", onTileUpdate);
  Hooks.on("deleteTile", (tile) => void stopTileFX(tile, { clear: true }));
  // A committed movement update is not guaranteed for a paused Trigger, and
  // updates are not guaranteed when a GM is viewing another Scene. Poll only
  // while there are active conditional FX and let each record's grace settle.
  occupancyPoll = setInterval(() => {
    if (!isAuthority()) return;
    for (const uuid of [...ACTIVE.keys()]) {
      const tile = resolveTile(uuid);
      if (tile) checkLifetimeForTile(tile);
      else ACTIVE.delete(uuid);
    }
  }, OCCUPANCY_POLL_MS);
  Hooks.on("canvasReady", () => {
    if (canvas?.scene) checkLifetimesForScene(canvas.scene);
  });
  Hooks.on("canvasTearDown", () => { if (pickerSession) cancelPicker(); });
  Hooks.once("ready", () => {
    game.socket.on(SOCKET_NAME, (message) => {
      if (!message || !message.type?.startsWith("ctn-visual-fx-")) return;
      if (message.type === "ctn-visual-fx-remote-ack") {
        if (!isAuthority() || message.targetUserId !== game.user.id) return;
        const tile = resolveTile(message.tileUuid);
        const record = tile && ACTIVE.get(tile.uuid)?.get(message.name);
        if (!record || record.runnerId !== message.senderId) return;
        if (message.status === "ended") {
          if ([FX_LIFETIMES.NATURAL, FX_LIFETIMES.SECONDS].includes(record.lifetime)) forgetRecord(tile, message.name);
          return;
        }
        if (record.timer) clearTimeout(record.timer);
        record.timer = null;
        record.acknowledged = message.status === "started";
        if (!record.acknowledged) forgetRecord(tile, message.name);
        else if (record.maxRuntimeMs > 0) {
          // Completion ACK is preferred; this fallback prevents stale dedupe
          // locks when a remote client closes mid-animation.
          record.timer = setTimeout(() => forgetRecord(tile, message.name), record.maxRuntimeMs);
        }
        return;
      }
      if (message.targetUserId !== game.user.id || primaryGM()?.id !== message.senderId) return;
      const tile = resolveTile(message.tileUuid);
      if (!tile || canvas?.scene?.id !== tile.parent?.id || !isSequencerAvailable()) return;
      const acknowledge = (status) => game.socket.emit(SOCKET_NAME, {
        type: "ctn-visual-fx-remote-ack", senderId: game.user.id,
        targetUserId: message.senderId, tileUuid: tile.uuid, name: message.name, status
      });
      if (message.type === "ctn-visual-fx-remote-end") {
        void globalThis.Sequencer.EffectManager.endEffects({
          name: message.name, origin: tile.uuid, sceneId: tile.parent.id
        });
        return;
      }
      if (message.type !== "ctn-visual-fx-remote-play") return;
      const cfg = fxConfig(tile);
      if (!cfg.enabled || !cfg.effect || !jb2aPaths().includes(cfg.effect)) {
        acknowledge("failed"); return;
      }
      try {
        const running = executeSequence(tile, cfg, message.name);
        acknowledge("started");
        void running.then(() => acknowledge("ended")).catch((error) => {
          console.warn(`${MODULE_ID} | Remote Visual FX failed`, error);
          acknowledge("failed");
        });
      } catch (error) {
        console.warn(`${MODULE_ID} | Remote Visual FX failed`, error);
        acknowledge("failed");
      }
    });
    if (!isSequencerAvailable()) console.info(`${MODULE_ID} | Visual FX is optional; Sequencer unavailable`);
  });
}

export function emitVisualFX(tile, event, token = null) {
  Hooks.callAll(SEQ_FX_EVENT, { tile, event, token });
}

// GM-only Canvas editor. The rectangle is a visual FX footprint, never a Tile
// hitbox. Editing is a SESSION: multiple moves/resizes, then Apply or Cancel.
function destroyPicker() {
  if (!pickerSession) return;
  const p = pickerSession;
  p.canvasElement.removeEventListener("pointerdown", p.down, true);
  window.removeEventListener("pointermove", p.move, true);
  window.removeEventListener("pointerup", p.up, true);
  window.removeEventListener("keydown", p.keydown, true);
  p.toolbar?.remove();
  // Detach explicitly so the overlay is removed even with external PIXI wrappers.
  p.graphics?.parent?.removeChild?.(p.graphics);
  p.graphics?.destroy?.();
  pickerSession = null;
}
function cancelPicker() {
  const cancel = pickerSession?.onCancel;
  destroyPicker();
  cancel?.();
}
function canvasPoint(ev) {
  return canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY });
}
function pickerBounds(state) {
  const grid = Number(canvas.scene?.grid?.size) || 100;
  const width = state.width * grid;
  const height = state.height * grid;
  return { left: state.x - width / 2, top: state.y - height / 2,
    right: state.x + width / 2, bottom: state.y + height / 2 };
}
function pickerCorners(b) {
  return { nw: { x: b.left, y: b.top }, ne: { x: b.right, y: b.top },
    sw: { x: b.left, y: b.bottom }, se: { x: b.right, y: b.bottom } };
}
const OPPOSITE_CORNER = { nw: "se", ne: "sw", sw: "ne", se: "nw" };
function pickerRender(session) {
  const { graphics: g, state } = session;
  const b = pickerBounds(state);
  const corners = pickerCorners(b);
  const zoom = Math.max(0.05, Math.abs(canvas.stage?.scale?.x ?? 1));
  const radius = 7 / zoom;
  // Foundry V14 uses PixiJS 7, NOT the PixiJS 8 rect/fill/stroke API.
  // The previous code threw before drawing the footprint or dimensions.
  g.clear();
  g.lineStyle(2 / zoom, 0x64B5F6, 1);
  g.beginFill(0x64B5F6, 0.13);
  g.drawRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
  g.endFill();
  for (const c of Object.values(corners)) {
    g.lineStyle(1.5 / zoom, 0x15283A, 1);
    g.beginFill(0xFFCC80, 0.98);
    g.drawRect(c.x - radius, c.y - radius, radius * 2, radius * 2);
    g.endFill();
  }
  g.lineStyle(0);
  g.beginFill(0x64B5F6, 1);
  g.drawCircle(state.x, state.y, Math.max(2, 3 / zoom));
  g.endFill();
  session.dimensions.textContent = `${state.width.toFixed(2)} × ${state.height.toFixed(2)} ${session.unitLabel}`;
}
/**
 * Resize corners are screen-constant-size, and drag is independent of the
 * pointer release. Enter/Apply commits; Escape/Cancel rolls back everything.
 */
export function editFXOnCanvas(tile, cfg, callback, onCancel = null) {
  if (!game.user?.isGM || canvas?.scene?.id !== tile?.parent?.id || !canvas?.ready) return false;
  cancelPicker();
  const canvasElement = canvas.app?.canvas ?? canvas.app?.view;
  if (!(canvasElement instanceof HTMLCanvasElement)) return false;
  // The interface group renders above the scene and shares scene coordinates.
  // Adding directly to the stage can place the editor beneath Foundry groups.
  if (!canvas.interface) return false;
  const graphics = new PIXI.Graphics();
  graphics.eventMode = "none";
  graphics.zIndex = 100000;
  canvas.interface.addChild(graphics);
  const center = fxCenter(tile, cfg);
  const state = { x: center.x, y: center.y, width: cfg.width, height: cfg.height };
  const unitLabel = game.i18n.localize("CTN.FX.GridUnits");
  const toolbar = document.createElement("aside");
  toolbar.className = "ctn-fx-canvas-toolbar";
  toolbar.innerHTML = `<strong>${foundry.utils.escapeHTML(game.i18n.localize("CTN.FX.CanvasEditor"))}</strong>
    <p>${foundry.utils.escapeHTML(game.i18n.localize("CTN.FX.CanvasEditInstructions"))}</p>
    <output data-ctn-fx-dimensions></output>
    <div class="ctn-fx-canvas-toolbar__actions">
      <button type="button" data-ctn-fx-apply>${foundry.utils.escapeHTML(game.i18n.localize("CTN.FX.ApplyEditor"))}</button>
      <button type="button" data-ctn-fx-cancel>${foundry.utils.escapeHTML(game.i18n.localize("CTN.FX.CancelEditor"))}</button>
    </div>`;
  document.body.append(toolbar);
  const session = {
    canvasElement, graphics, state, toolbar, unitLabel, onCancel,
    dimensions: toolbar.querySelector("[data-ctn-fx-dimensions]"), drag: null
  };
  pickerSession = session;
  const finish = () => {
    const result = { ...state };
    destroyPicker();
    callback(result);
  };
  toolbar.querySelector("[data-ctn-fx-apply]").addEventListener("click", finish);
  toolbar.querySelector("[data-ctn-fx-cancel]").addEventListener("click", cancelPicker);
  session.down = (ev) => {
    if (ev.button !== 0 || pickerSession !== session) return;
    const point = canvasPoint(ev);
    const b = pickerBounds(state);
    const corners = pickerCorners(b);
    const zoom = Math.max(0.05, Math.abs(canvas.stage?.scale?.x ?? 1));
    const radius = 19 / zoom;
    const corner = Object.keys(corners).find((key) =>
      Math.hypot(point.x - corners[key].x, point.y - corners[key].y) <= radius);
    if (corner) {
      const anchor = corners[OPPOSITE_CORNER[corner]];
      session.drag = { kind: "resize", anchor };
    } else if (point.x >= b.left && point.x <= b.right && point.y >= b.top && point.y <= b.bottom) {
      session.drag = { kind: "move", offsetX: state.x - point.x, offsetY: state.y - point.y };
    } else return; // Do not intercept ordinary canvas interactions outside FX area.
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
  };
  session.move = (ev) => {
    if (!session.drag || pickerSession !== session) return;
    const point = canvasPoint(ev);
    if (session.drag.kind === "move") {
      state.x = point.x + session.drag.offsetX;
      state.y = point.y + session.drag.offsetY;
    } else {
      const anchor = session.drag.anchor;
      const grid = Number(canvas.scene?.grid?.size) || 100;
      const dx = point.x - anchor.x;
      const dy = point.y - anchor.y;
      const widthPx = n(Math.abs(dx) / grid, state.width, 0.1, 100) * grid;
      const heightPx = n(Math.abs(dy) / grid, state.height, 0.1, 100) * grid;
      const directionX = dx < 0 ? -1 : 1;
      const directionY = dy < 0 ? -1 : 1;
      state.x = anchor.x + directionX * widthPx / 2;
      state.y = anchor.y + directionY * heightPx / 2;
      state.width = widthPx / grid;
      state.height = heightPx / grid;
    }
    ev.preventDefault(); ev.stopPropagation();
    pickerRender(session);
  };
  session.up = (ev) => {
    if (!session.drag) return;
    session.move(ev); // final position even if no final move event
    session.drag = null; // do NOT close the editor after the first action
    ev.preventDefault(); ev.stopPropagation();
  };
  session.keydown = (ev) => {
    if (ev.key === "Escape") { ev.preventDefault(); cancelPicker(); }
    else if (ev.key === "Enter" && !ev.repeat) { ev.preventDefault(); finish(); }
  };
  canvasElement.addEventListener("pointerdown", session.down, true);
  window.addEventListener("pointermove", session.move, true);
  window.addEventListener("pointerup", session.up, true);
  window.addEventListener("keydown", session.keydown, true);
  try {
    pickerRender(session);
  } catch (error) {
    // Never leave an Apply/Cancel editor with an invisible, unusable overlay.
    console.error(`${MODULE_ID} | Could not draw Visual FX canvas editor`, error);
    destroyPicker();
    return false;
  }
  return true;
}
