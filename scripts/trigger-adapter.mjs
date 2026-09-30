import { MODULE_ID } from "./constants.mjs";

export function supportsTriggerRules() {
  return game.system?.id === "dnd5e";
}

export function supportsNativeTriggerDamage(actor = null) {
  if (!supportsTriggerRules()) return false;
  return !actor || typeof actor.applyDamage === "function";
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

async function postRoll(roll, { actor, flavor, publicRoll }) {
  const messageData = {
    flavor,
    speaker: ChatMessage.getSpeaker({ actor })
  };

  if (!publicRoll) messageData.whisper = gmIds();

  try {
    await roll.toMessage(messageData, publicRoll ? { rollMode: "publicroll" } : {});
  } catch (_error) {
    // Fallback for systems/Foundry builds whose Roll#toMessage signature does not
    // accept rollMode in the options object.
    await roll.toMessage(messageData);
  }
}

export async function rollTriggerDamage(actor, components, { flavor = "", publicRoll = null } = {}) {
  const rollData = actor?.getRollData?.({ roll: true }) ?? actor?.getRollData?.() ?? {};
  const results = [];
  const usePublicRoll = publicRoll ?? supportsNativeTriggerDamage(actor);

  for (const component of components ?? []) {
    const formula = String(component?.formula ?? "").trim();
    if (!formula) continue;

    try {
      const roll = await new Roll(formula, rollData).evaluate();
      const typeLabel = component?.type || "damage";
      await postRoll(roll, {
        actor,
        flavor: flavor ? `${flavor} — ${typeLabel}` : `${actor?.name ?? "Token"} — ${typeLabel}`,
        publicRoll: usePublicRoll
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
  if (!supportsNativeTriggerDamage(actor)) return false;
  const damages = (rolledComponents ?? [])
    .filter((entry) => Number.isFinite(Number(entry?.total)))
    .map((entry) => ({
      value: Number(entry.total),
      type: entry.type || undefined
    }));
  if (!damages.length) return false;

  try {
    // D&D5e owns resistance, immunity, vulnerability, temp HP and the rest of
    // its damage application rules. CTN only supplies typed damage components
    // and the multiplier selected by Trigger resolution.
    await actor.applyDamage(damages, { multiplier });
    return true;
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not apply trigger damage`, error);
    return false;
  }
}
