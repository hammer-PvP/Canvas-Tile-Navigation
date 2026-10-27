/** Linked activation: a same-scene Trigger can wake a Trigger/Transition Tile.
 * Linked state belongs to the receiving Tile and is authoritative on the GM.
 * This is deliberately not a generic chain/macro execution system.
 */
import { MODULE_ID } from "./constants.mjs";
import { resolveTile } from "./route-service.mjs";
import { isTriggerTile, triggerData } from "./trigger-service.mjs";
import { isTransitionTile } from "./transition-service.mjs";
import { emitVisualFX, stopTileFX } from "./seqfx.mjs";
import { hasEffectConsequences } from "./trigger-areas.mjs";
import { effectAreaIsActive, setEffectAreaActive } from "./effect-area-state.mjs";

const FLAG = "linkedActivation";

export function linkedData(tile) {
  const raw = tile?.getFlag?.(MODULE_ID, FLAG) ?? {};
  return {
    enabled: raw.enabled === true || raw.enabled === "true",
    sourceTileUuid: String(raw.sourceTileUuid ?? ""),
    active: raw.active === true || raw.active === "true"
  };
}

export function linkedIsActive(tile) {
  const data = linkedData(tile);
  if (!data.enabled) return true;
  if (!data.active) return false;
  const source = resolveTile(data.sourceTileUuid);
  return Boolean(source && source.id !== tile.id && source.parent?.id === tile.parent?.id && isTriggerTile(source));
}

export function linkedSourceCandidates(tile) {
  return [...(tile?.parent?.tiles ?? [])]
    .filter((candidate) => candidate.id !== tile.id && isTriggerTile(candidate))
    .sort((a, b) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id)));
}

export async function setLinkedActive(tile, active) {
  if (!game.user?.isGM || !tile || !(isTransitionTile(tile) || isTriggerTile(tile))) return false;
  const data = linkedData(tile);
  if (!data.enabled || !data.sourceTileUuid) return false;
  if (active) {
    const source = resolveTile(data.sourceTileUuid);
    if (!source || source.id === tile.id || source.parent?.id !== tile.parent?.id || !isTriggerTile(source)) return false;
  }
  if (data.active === Boolean(active)) return true;
  await tile.update({ [`flags.${MODULE_ID}.${FLAG}.active`]: Boolean(active) }, { ctnLinkedState: true });
  if (isTriggerTile(tile) && hasEffectConsequences(triggerData(tile))) {
    await setEffectAreaActive(tile, Boolean(active));
  }
  if (!active) await stopTileFX(tile);
  else emitVisualFX(tile, "linked");
  return true;
}

/** OFF only affects direct receivers of this source, not unrelated Tiles. */
export async function deactivateLinkedTargets(sourceTile) {
  if (!game.user?.isGM || !sourceTile || !isTriggerTile(sourceTile)) return;
  for (const target of sourceTile.parent?.tiles ?? []) {
    if (target.id === sourceTile.id || !(isTransitionTile(target) || isTriggerTile(target))) continue;
    const data = linkedData(target);
    if (!data.enabled || !data.active || data.sourceTileUuid !== sourceTile.uuid) continue;
    await setLinkedActive(target, false);
  }
}

export async function activateLinkedTargets(sourceTile) {
  if (!game.user?.isGM || !sourceTile || !isTriggerTile(sourceTile)) return;
  // Called only from the primary GM's already-authorized Trigger activation.
  for (const target of sourceTile.parent?.tiles ?? []) {
    if (target.id === sourceTile.id || !(isTransitionTile(target) || isTriggerTile(target))) continue;
    const data = linkedData(target);
    if (!data.enabled || data.active || data.sourceTileUuid !== sourceTile.uuid) continue;
    await setLinkedActive(target, true);
  }
}
