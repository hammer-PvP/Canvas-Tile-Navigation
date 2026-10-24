/** Lifecycle for an optional Trigger Effect Area. Mechanical authority is GM-side.
 * The area is never enabled/disabled by a player-side video playback result.
 * A session ID guards against late callbacks from a previous activation.
 */
import { MODULE_ID } from './constants.mjs';
import { isOn, TRIGGER_AREA, tokenInsideTriggerArea } from './trigger-areas.mjs';
import { stopTileFX } from './seqfx.mjs';

const TICK_MS = 250;
const TOKEN_ENTRY_GRACE_MS = 1200;
const AREA_ENTRY_GRACE_MS = 1200; // PreMove can report an entry before Token coordinates commit
const NATURAL_SAFETY_MS = 60000; // Upper bound if media completion callback is lost.
const TRANSITIONS = new Map();
const TRACKED = new Map();
let watcher = null;

function flag(tile) { return tile?.getFlag?.(MODULE_ID, 'trigger') ?? {}; }
function session(tile) { return flag(tile).effectSession ?? null; }
function tokenByUuid(uuid) {
  if (!uuid) return null;
  try { return fromUuidSync(uuid); } catch (_error) { return null; }
}
function areaHasOccupant(tile) {
  return [...(tile?.parent?.tokens ?? [])].some(t => tokenInsideTriggerArea(t, tile, TRIGGER_AREA.EFFECT));
}
function activeGM() {
  if (!game.user?.isGM) return false;
  const primary = [...game.users].filter(u => u.active && u.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  return primary?.id === game.user.id;
}
function playbackConfig(tile) {
  const fx = tile?.getFlag?.(MODULE_ID, 'visualFX') ?? {};
  // Only a visual that starts on the opening event can own an area's lifetime.
  // Other events / FX disabled retain manual / linked activation behavior.
  if (!isOn(fx.enabled) || !fx.effect || fx.event !== 'activation') return null;
  const lifetime = ['natural', 'seconds', 'token', 'area', 'persistent'].includes(fx.lifetime)
    ? fx.lifetime : 'natural';
  const seconds = Math.max(0.1, Math.min(3600, Number(fx.seconds) || 5));
  return { lifetime, seconds };
}

/** Read-only, fail-closed check, including expiry before the next polling tick. */
export function effectAreaIsActive(tile) {
  if (!isOn(flag(tile).effectActive)) return false;
  const s = session(tile);
  // Pre-v1.1.14 areas have no lifecycle: never allow a stale portal to transfer.
  if (!s?.id) return false;
  const now = Date.now();
  if (s.expiresAt && now >= s.expiresAt) return false;
  if (s.lifetime === 'token' && now >= s.startedAt + TOKEN_ENTRY_GRACE_MS) {
    const token = tokenByUuid(s.tokenUuid);
    if (!tokenInsideTriggerArea(token, tile, TRIGGER_AREA.SOURCE)) return false;
  }
  if (s.lifetime === 'area' && s.occupiedOnce
    && now >= (s.entryGraceUntil ?? 0) && !areaHasOccupant(tile)) return false;
  return true;
}

export function effectAreaSessionId(tile) { return session(tile)?.id ?? null; }

// Serialize close/open on a Tile. End the old Sequencer effect BEFORE a new
// session can start; an old cleanup must never stop a freshly opened portal.
function queued(tile, task) {
  const uuid = tile.uuid ?? `${tile.parent?.id}.${tile.id}`;
  const previous = TRANSITIONS.get(uuid) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  TRANSITIONS.set(uuid, next);
  void next.finally(() => { if (TRANSITIONS.get(uuid) === next) TRANSITIONS.delete(uuid); }).catch(() => {});
  return next;
}

/** Opening requires an actual Trigger activation (or explicit GM action).
 * No FX media is required for the mechanics; the stored FX settings govern
 * lifetime whenever the FX is configured to play on activation.
 */
export async function setEffectAreaActive(tile, active, { tokenUuid = '', expectedSessionId = null } = {}) {
  if (!activeGM() || !tile?.getFlag?.(MODULE_ID, 'trigger')?.enabled) return false;
  return queued(tile, async () => {
    const old = session(tile);
    if (expectedSessionId && old?.id !== expectedSessionId) return false;
    if (active) {
      if (effectAreaIsActive(tile)) return true;
      // An expired record might still have a visible Sequence: clean it first.
      if (isOn(flag(tile).effectActive)) await stopTileFX(tile);
      const now = Date.now();
      const fx = playbackConfig(tile);
      const lifetime = fx?.lifetime ?? 'persistent';
      const nextSession = {
        id: foundry.utils.randomID(), startedAt: now, tokenUuid: String(tokenUuid || ''),
        lifetime, occupiedOnce: lifetime === 'area' && areaHasOccupant(tile),
        expiresAt: lifetime === 'seconds' ? now + fx.seconds * 1000
          : lifetime === 'natural' ? now + NATURAL_SAFETY_MS : null
      };
      await tile.update({
        [`flags.${MODULE_ID}.trigger.effectActive`]: true,
        [`flags.${MODULE_ID}.trigger.effectSession`]: nextSession
      }, { ctnTriggerState: true, ctnEffectAreaState: true });
      TRACKED.set(tile.uuid, tile);
      return true;
    }
    if (!isOn(flag(tile).effectActive)) return true;
    await tile.update({
      [`flags.${MODULE_ID}.trigger.effectActive`]: false,
      [`flags.${MODULE_ID}.trigger.effectSession`]: null
    }, { ctnTriggerState: true, ctnEffectAreaState: true });
    TRACKED.delete(tile.uuid);
    await stopTileFX(tile);
    return true;
  });
}

export async function effectAreaVisualFinished(tile, expectedSessionId) {
  if (!expectedSessionId || session(tile)?.lifetime !== 'natural') return false;
  return setEffectAreaActive(tile, false, { expectedSessionId });
}

/** First entrant begins occupancy-based lifetime; until the first entrant,
 * the area waits open instead of flashing shut immediately on activation.
 */
export async function recordEffectAreaEntry(tile) {
  if (!activeGM() || !effectAreaIsActive(tile)) return;
  const s = session(tile);
  if (s?.lifetime !== 'area') return;
  await queued(tile, async () => {
    const current = session(tile);
    if (current?.id !== s.id) return;
    // The first entry can be detected from a waypoint before the actual
    // Token position update (or before the GM transfers it to another Scene).
    // A short grace prevents premature shutdown of the new occurrence.
    await tile.update({
      [`flags.${MODULE_ID}.trigger.effectSession.occupiedOnce`]: true,
      [`flags.${MODULE_ID}.trigger.effectSession.entryGraceUntil`]: Date.now() + AREA_ENTRY_GRACE_MS
    }, { ctnTriggerState: true, ctnEffectAreaState: true });
  });
}

export async function checkEffectAreaLifetime(tile) {
  if (!activeGM() || !isOn(flag(tile).effectActive)) return;
  // Legacy active flags have no session ID and must be cleared as well.
  if (!effectAreaIsActive(tile)) {
    const previous = session(tile)?.id;
    await setEffectAreaActive(tile, false, { expectedSessionId: previous || null });
  }
}

export function registerEffectAreaLifetimeHooks() {
  if (watcher) return;
  // Scan only open areas. A large World may contain thousands of Tiles but
  // almost none of them are active portals at any given moment.
  const check = () => {
    if (!activeGM()) return;
    for (const tile of TRACKED.values()) void checkEffectAreaLifetime(tile);
  };
  watcher = setInterval(check, TICK_MS);
  Hooks.once('ready', () => {
    for (const scene of game.scenes ?? []) for (const tile of scene.tiles ?? []) {
      if (isOn(flag(tile).effectActive)) TRACKED.set(tile.uuid, tile);
    }
    check();
  });
  Hooks.on('updateTile', tile => {
    if (isOn(flag(tile).effectActive)) TRACKED.set(tile.uuid, tile);
    else TRACKED.delete(tile.uuid);
  });
  Hooks.on('deleteTile', tile => TRACKED.delete(tile.uuid));
  Hooks.on('updateToken', check);
  Hooks.on('deleteToken', check);
}
