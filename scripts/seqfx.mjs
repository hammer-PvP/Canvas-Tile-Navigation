/**
 * Optional Sequencer/JB2A visual integration. CTN Tiles remain the exclusive
 * authority for mechanics; everything in this file is visual only.
 */
import { MODULE_ID, SOCKET_NAME } from "./constants.mjs";
import { isNavigationLink, isArrivalPoint, resolveTile } from "./route-service.mjs";
import { isTransitionTile } from "./transition-service.mjs";
import { isTriggerTile } from "./trigger-service.mjs";
import { tileBounds, tokenBounds } from "./token-service.mjs";

const FLAG = "visualFX";
const SEQ_FX_EVENT = "ctnVisualFXEvent";
const MAX_DURATION_S = 3600;
const ACTIVE = new Map(); // tileUuid -> Map(effectName -> record), GM authority only
const ENDING = new Set();
const LAST_EVENTS = new Map();
let pickerSession = null;
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
    case "trigger": return ["activation", "pass", "fail", "hazard"];
    case "transition": return ["before", "after"];
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
function tokenInTile(token, tile) {
  if (!token || token.parent?.id !== tile.parent?.id) return false;
  const rect = tokenBounds(token);
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  if (tile.shape?.testPoint) {
    try { return Boolean(tile.shape.testPoint(center)); } catch (_error) { /* rectangle fallback */ }
  }
  const area = tileBounds(tile);
  return center.x >= area.x && center.y >= area.y
    && center.x <= area.x + area.width && center.y <= area.y + area.height;
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
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not end Visual FX ${name}`, error);
  } finally {
    recordsFor(tile).delete(name);
    ENDING.delete(name);
  }
}
export async function stopTileFX(tile, { clear = false } = {}) {
  if (!isAuthority() || !tile) return;
  const records = recordsFor(tile);
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
      section = section.persist();
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
    .filter((u) => u.active && !u.isGM && u.viewedScene === sceneId)
    .sort((a,b) => a.id.localeCompare(b.id))[0] ?? null;
}

export async function playTileFX(tile, { event, tokenUuid = "", preview = false, override = null } = {}) {
  if (!tile || !isSequencerAvailable()) return false;
  if (!preview && !isAuthority()) return false;
  const cfg = override ?? fxConfig(tile);
  if (!preview && (!cfg.enabled || cfg.event !== event)) return false;
  if (!cfg.effect || !jb2aPaths().includes(cfg.effect)) return false;
  const records = recordsFor(tile);
  if (!preview && cfg.repeat === "one" && records.size) return false;
  const name = preview ? `ctn-preview-${foundry.utils.randomID()}` : effectName(tile);
  if (!preview) records.set(name, { lifetime: cfg.lifetime, tokenUuid, timer: null });
  try {
    const remote = !preview && canvas?.scene?.id !== tile.parent.id
      ? remoteRunner(tile.parent.id) : null;
    if (remote) {
      game.socket.emit(SOCKET_NAME, {
        type: "ctn-visual-fx-remote-play", senderId: game.user.id,
        targetUserId: remote.id, tileUuid: tile.uuid, cfg, name
      });
      if ([FX_LIFETIMES.NATURAL, FX_LIFETIMES.SECONDS].includes(cfg.lifetime)) {
        // Sequencer plays on the remote client; time-bound dedupe is enough here.
        const holdMs = cfg.lifetime === FX_LIFETIMES.SECONDS ? cfg.seconds * 1000 + 500 : 10000;
        const record = records.get(name);
        if (record) record.timer = setTimeout(() => records.delete(name), holdMs);
      }
    } else if (!preview && canvas?.scene?.id !== tile.parent.id) {
      // Nobody has the target Scene ready: defer rather than drawing the FX
      // at identical coordinates in the GM's unrelated Scene.
      records.delete(name);
      return false;
    } else {
      void executeSequence(tile, cfg, name, { preview }).then(() => {
        if (!preview && [FX_LIFETIMES.NATURAL, FX_LIFETIMES.SECONDS].includes(cfg.lifetime)) {
          records.delete(name);
        }
      }).catch((error) => {
        console.error(`${MODULE_ID} | Visual FX failed`, error);
        records.delete(name);
      });
    }
    if (!preview && cfg.lifetime === FX_LIFETIMES.TOKEN && !tokenUuid) {
      setTimeout(() => void expire(tile, name), 350);
    }
    if (!preview && [FX_LIFETIMES.TOKEN, FX_LIFETIMES.AREA].includes(cfg.lifetime)) {
      // Entry may precede the authoritative Token position update by one tick.
      setTimeout(() => checkLifetimeForTile(tile), 350);
    }
    return true;
  } catch (error) {
    records.delete(name);
    console.warn(`${MODULE_ID} | Visual FX activation failed`, error);
    return false;
  }
}

function checkLifetimeForTile(tile) {
  if (!isAuthority()) return;
  const records = ACTIVE.get(tile.uuid);
  if (!records?.size) return;
  for (const [name, record] of records) {
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
  if ((LAST_EVENTS.get(key) ?? 0) + 100 < now) {
    LAST_EVENTS.set(key, now);
    void playTileFX(tile, { event, tokenUuid: token?.uuid ?? "" });
  }
}

function onTileUpdate(tile, changes) {
  if (!isAuthority()) return;
  const cfgChanges = Object.keys(changes).some((k) => k.includes("visualFX"))
    || Boolean(changes.flags?.[MODULE_ID]?.visualFX);
  if (cfgChanges && !fxConfig(tile).enabled) void stopTileFX(tile);
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
  Hooks.on("canvasReady", () => {
    // Sequencer handles persistence/reload; CTN only refreshes occupancy logic.
    if (canvas?.scene) checkLifetimesForScene(canvas.scene);
  });
  Hooks.once("ready", () => {
    game.socket.on(SOCKET_NAME, (message) => {
      if (message?.type !== "ctn-visual-fx-remote-play" || message.targetUserId !== game.user.id) return;
      if (primaryGM()?.id !== message.senderId) return;
      const tile = resolveTile(message.tileUuid);
      if (!tile || canvas?.scene?.id !== tile.parent?.id || !isSequencerAvailable()) return;
      const cfg = fxConfig(tile);
      if (!cfg.enabled || !cfg.effect || !jb2aPaths().includes(cfg.effect)) return;
      // Use the saved/authoritative Tile configuration, not arbitrary socket FX values.
      void executeSequence(tile, cfg, message.name).catch((error) => {
        console.warn(`${MODULE_ID} | Remote Visual FX failed`, error);
      });
    });
    if (!isSequencerAvailable()) console.info(`${MODULE_ID} | Visual FX is optional; Sequencer unavailable`);
  });
}

export function emitVisualFX(tile, event, token = null) {
  Hooks.callAll(SEQ_FX_EVENT, { tile, event, token });
}

// Canvas preview/editor. Temporary PIXI markup is NEVER persisted as a Tile.
function destroyPicker() {
  if (!pickerSession) return;
  const p = pickerSession;
  p.canvasElement.removeEventListener("pointerdown", p.down, true);
  p.canvasElement.removeEventListener("pointermove", p.move, true);
  p.canvasElement.removeEventListener("pointerup", p.up, true);
  window.removeEventListener("keydown", p.escape);
  p.graphics?.destroy?.();
  pickerSession = null;
}
function canvasPoint(ev) { return canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY }); }
function pickerRender(session) {
  const { graphics: g, state } = session;
  const gridSize = Number(canvas.scene?.grid?.size) || 100;
  const width = state.width * gridSize;
  const height = state.height * gridSize;
  const x = state.x - width / 2;
  const y = state.y - height / 2;
  g.clear();
  // Foundry V14 uses PixiJS v8: rect/fill/stroke, not v7 drawRect/lineStyle.
  g.rect(x, y, width, height)
    .fill({ color: 0x64B5F6, alpha: 0.12 })
    .stroke({ color: 0x64B5F6, width: 3, alpha: 0.95 });
  g.rect(x + width - 9, y + height - 9, 18, 18)
    .fill({ color: 0xFFCC80, alpha: 0.85 })
    .stroke({ color: 0xFFCC80, width: 2 });
  g.circle(state.x, state.y, 4).fill(0x64B5F6);
}
/** Uses raw canvas capture so GM can drag the FX box without moving Scene Tiles. */
export function editFXOnCanvas(tile, cfg, callback, onCancel = null) {
  if (!game.user?.isGM || canvas?.scene?.id !== tile?.parent?.id || !canvas?.ready) return false;
  destroyPicker();
  const canvasElement = canvas.app?.canvas ?? canvas.app?.view;
  if (!(canvasElement instanceof HTMLCanvasElement)) return false;
  const graphics = new PIXI.Graphics();
  graphics.eventMode = "none";
  canvas.stage.addChild(graphics);
  const center = fxCenter(tile, cfg);
  const state = { x: center.x, y: center.y, width: cfg.width, height: cfg.height };
  const session = { canvasElement, graphics, state, drag: null };
  pickerSession = session;
  const bounds = () => {
    const gridSize = Number(canvas.scene?.grid?.size) || 100;
    return { left: state.x - state.width * gridSize / 2, top: state.y - state.height * gridSize / 2,
      right: state.x + state.width * gridSize / 2, bottom: state.y + state.height * gridSize / 2 };
  };
  session.down = (ev) => {
    if (ev.button !== 0) return;
    const point = canvasPoint(ev);
    const b = bounds();
    session.drag = Math.abs(point.x - b.right) < 35 && Math.abs(point.y - b.bottom) < 35 ? "resize" : "move";
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    if (session.drag === "move") { state.x = point.x; state.y = point.y; }
    pickerRender(session);
  };
  session.move = (ev) => {
    if (!session.drag) return;
    const point = canvasPoint(ev);
    const grid = Number(canvas.scene?.grid?.size) || 100;
    if (session.drag === "move") { state.x = point.x; state.y = point.y; }
    else {
      state.width = n(Math.abs(point.x - (state.x - state.width * grid / 2)) / grid, state.width, 0.1, 100);
      state.height = n(Math.abs(point.y - (state.y - state.height * grid / 2)) / grid, state.height, 0.1, 100);
    }
    ev.preventDefault(); ev.stopPropagation(); pickerRender(session);
  };
  session.up = (ev) => {
    if (!session.drag) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    session.drag = null;
    destroyPicker();
    callback({ ...state });
  };
  session.escape = (ev) => {
    if (ev.key === "Escape") { ev.preventDefault(); destroyPicker(); onCancel?.(); }
  };
  canvasElement.addEventListener("pointerdown", session.down, true);
  canvasElement.addEventListener("pointermove", session.move, true);
  canvasElement.addEventListener("pointerup", session.up, true);
  window.addEventListener("keydown", session.escape);
  pickerRender(session);
  return true;
}
