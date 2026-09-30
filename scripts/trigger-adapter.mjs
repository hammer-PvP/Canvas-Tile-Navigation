import { MODULE_ID } from "./constants.mjs";

export function supportsTriggerRules() {
  return game.system?.id === "dnd5e";
}

export function abilityChoices() {
  if (!supportsTriggerRules()) return [];
  return Object.entries(CONFIG.DND5E?.abilities ?? {})
    .map(([id, config]) => ({ id, label: game.i18n.localize(config?.label ?? id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function damageTypeChoices() {
  if (!supportsTriggerRules()) return [];
  return Object.entries(CONFIG.DND5E?.damageTypes ?? {})
    .map(([id, config]) => ({ id, label: game.i18n.localize(config?.label ?? id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function gmIds() {
  return [...game.users].filter((user) => user.isGM).map((user) => user.id);
}

export async function rollTriggerDamage(actor, components, { flavor = "" } = {}) {
  const rollData = actor?.getRollData?.({ roll: true }) ?? actor?.getRollData?.() ?? {};
  const results = [];

  for (const component of components ?? []) {
    const formula = String(component?.formula ?? "").trim();
    if (!formula) continue;

    try {
      const roll = await new Roll(formula, rollData).evaluate();
      await roll.toMessage({
        flavor: flavor || `${actor?.name ?? "Token"} — ${component?.type ?? "damage"}`,
        speaker: ChatMessage.getSpeaker({ actor }),
        whisper: gmIds()
      });
      results.push({
        formula,
        type: component?.type ?? "",
        total: Number(roll.total) || 0
      });
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not roll trigger damage formula ${formula}`, error);
    }
  }

  return results;
}

export async function applyTriggerDamage(actor, rolledComponents, { multiplier = 1 } = {}) {
  if (!supportsTriggerRules() || !actor || typeof actor.applyDamage !== "function") return false;
  const damages = (rolledComponents ?? [])
    .filter((entry) => Number.isFinite(Number(entry?.total)))
    .map((entry) => ({
      value: Number(entry.total),
      type: entry.type || undefined
    }));
  if (!damages.length) return false;

  try {
    await actor.applyDamage(damages, { multiplier });
    return true;
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not apply trigger damage`, error);
    return false;
  }
}
