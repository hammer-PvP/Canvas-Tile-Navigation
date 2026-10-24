/** Persisted independent state for the optional interactive area opened by a Trigger. */
import { MODULE_ID } from './constants.mjs';
import { isOn } from './trigger-areas.mjs';

export function effectAreaIsActive(tile) {
  return isOn(tile?.getFlag?.(MODULE_ID, 'trigger')?.effectActive);
}

export async function setEffectAreaActive(tile, active) {
  if (!game.user?.isGM || !tile?.getFlag?.(MODULE_ID, 'trigger')?.enabled) return false;
  const state = Boolean(active);
  if (effectAreaIsActive(tile) === state) return true;
  await tile.update({ [`flags.${MODULE_ID}.trigger.effectActive`]: state }, { ctnTriggerState: true });
  return true;
}
