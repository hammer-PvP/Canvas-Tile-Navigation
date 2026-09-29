import { MODULE_ID } from "./constants.mjs";

const groupMemberCache = new Map();

function isDnd5e() {
  return game.system?.id === "dnd5e";
}

export function getUserActor(user) {
  const character = user?.character;
  if (!character) return null;
  if (character.documentName === "Actor") return game.actors.get(character.id) ?? character;
  const id = character.id ?? character;
  return game.actors.get(id) ?? null;
}

export function nonGMUsers({ activeOnly = false } = {}) {
  return [...game.users].filter((user) => !user.isGM && (!activeOnly || user.active));
}

export function playerActors({ activeOnly = false } = {}) {
  const seen = new Set();
  const actors = [];
  for (const user of nonGMUsers({ activeOnly })) {
    const actor = getUserActor(user);
    if (!actor || seen.has(actor.id)) continue;
    seen.add(actor.id);
    actors.push(actor);
  }
  return actors;
}

function groupActorFromToken(token) {
  const actor = token?.baseActor ?? game.actors.get(token?.actorId) ?? token?.actor ?? null;
  return actor?.type === "group" ? actor : null;
}

export function groupTokensInScene(scene) {
  if (!isDnd5e() || !scene) return [];
  return [...scene.tokens].filter((token) => Boolean(groupActorFromToken(token)));
}

function valuesOf(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.values === "function") return [...value.values()];
  try {
    return [...value];
  } catch (_error) {
    return [];
  }
}

function actorIdFromReference(reference) {
  if (!reference) return null;
  if (reference.documentName === "Actor") return reference.id ?? null;
  if (reference.actor?.documentName === "Actor") return reference.actor.id ?? null;
  if (reference.actor?.id && game.actors.has(reference.actor.id)) return reference.actor.id;

  const candidate = reference.uuid
    ?? reference.actorUuid
    ?? reference.actorUUID
    ?? reference.id
    ?? reference.actorId
    ?? (typeof reference === "string" ? reference : null);

  if (!candidate) return null;
  if (game.actors.has(candidate)) return candidate;

  const match = String(candidate).match(/^Actor\.([^.]+)$/);
  if (match && game.actors.has(match[1])) return match[1];
  return null;
}

function rawGroupMemberIds(groupActor) {
  if (!groupActor || groupActor.type !== "group") return new Set();
  const raw = groupActor.system?.members;
  const ids = new Set();
  for (const reference of valuesOf(raw)) {
    const id = actorIdFromReference(reference);
    if (id) ids.add(id);
  }
  return ids;
}

export function cachedGroupMemberIds(groupActor) {
  if (!groupActor) return new Set();
  return groupMemberCache.get(groupActor.id) ?? rawGroupMemberIds(groupActor);
}

export async function getGroupMemberActors(groupActor, { refresh = true } = {}) {
  if (!isDnd5e() || !groupActor || groupActor.type !== "group") return [];

  if (!refresh && groupMemberCache.has(groupActor.id)) {
    return [...groupMemberCache.get(groupActor.id)]
      .map((id) => game.actors.get(id))
      .filter(Boolean);
  }

  const actors = [];
  const seen = new Set();

  try {
    const getPlaceableMembers = groupActor.system?.getPlaceableMembers;
    if (typeof getPlaceableMembers === "function") {
      const members = await getPlaceableMembers.call(groupActor.system);
      for (const member of members ?? []) {
        const candidate = member?.actor ?? member;
        const live = candidate?.id ? game.actors.get(candidate.id) : null;
        if (!live || seen.has(live.id)) continue;
        seen.add(live.id);
        actors.push(live);
      }
    }
  } catch (error) {
    console.warn(`${MODULE_ID} | D&D5e Group getPlaceableMembers() failed; falling back to member references`, error);
  }

  if (!actors.length) {
    for (const id of rawGroupMemberIds(groupActor)) {
      const live = game.actors.get(id);
      if (!live || seen.has(live.id)) continue;
      seen.add(live.id);
      actors.push(live);
    }
  }

  groupMemberCache.set(groupActor.id, new Set(actors.map((actor) => actor.id)));
  return actors;
}

function primaryParty() {
  if (!isDnd5e()) return null;
  const party = game.actors?.party;
  return party?.type === "group" ? party : null;
}

function sceneGroupActors(scene) {
  const seen = new Set();
  const actors = [];
  for (const token of groupTokensInScene(scene)) {
    const actor = groupActorFromToken(token);
    if (!actor || seen.has(actor.id)) continue;
    seen.add(actor.id);
    actors.push(actor);
  }
  return actors;
}

async function scoreGroup(groupActor, playerIds) {
  const members = await getGroupMemberActors(groupActor, { refresh: true });
  return members.reduce((score, actor) => score + (playerIds.has(actor.id) ? 1 : 0), 0);
}

export async function resolveTravelGroup({ sourceScene = null, targetScene = null } = {}) {
  if (!isDnd5e()) return null;

  const primary = primaryParty();
  if (primary) {
    await getGroupMemberActors(primary, { refresh: true });
    return primary;
  }

  const assigned = playerActors({ activeOnly: false });
  const playerIds = new Set(assigned.map((actor) => actor.id));

  const candidateMap = new Map();
  for (const scene of [targetScene, sourceScene]) {
    for (const group of sceneGroupActors(scene)) candidateMap.set(group.id, group);
  }
  for (const actor of game.actors) {
    if (actor.type === "group") candidateMap.set(actor.id, actor);
  }

  let best = null;
  let bestScore = 0;
  let tied = false;

  for (const candidate of candidateMap.values()) {
    const score = await scoreGroup(candidate, playerIds);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
      tied = false;
    } else if (score > 0 && score === bestScore) {
      tied = true;
    }
  }

  return tied ? null : best;
}

export async function resolveTravelRoster({ sourceScene = null, targetScene = null } = {}) {
  if (isDnd5e()) {
    const groupActor = await resolveTravelGroup({ sourceScene, targetScene });
    if (groupActor) {
      const members = await getGroupMemberActors(groupActor, { refresh: true });
      const assignedIds = new Set(playerActors({ activeOnly: false }).map((actor) => actor.id));
      const actors = members.filter((actor) => assignedIds.has(actor.id));
      return { provider: "dnd5e-group", groupActor, actors };
    }
  }

  return {
    provider: "generic",
    groupActor: null,
    actors: playerActors({ activeOnly: true })
  };
}

export function usersForRoster(roster, { activeOnly = true } = {}) {
  const ids = new Set((roster?.actors ?? []).map((actor) => actor.id));
  return nonGMUsers({ activeOnly }).filter((user) => {
    const actor = getUserActor(user);
    return Boolean(actor && ids.has(actor.id));
  });
}

export function findGroupTokenForParty(scene, groupActor) {
  if (!isDnd5e() || !scene || !groupActor) return null;
  return groupTokensInScene(scene).find((token) => groupActorFromToken(token)?.id === groupActor.id) ?? null;
}

export function getGroupRepresentationForActor(scene, actor) {
  if (!isDnd5e() || !scene || !actor) return null;

  for (const token of groupTokensInScene(scene)) {
    const groupActor = groupActorFromToken(token);
    if (!groupActor) continue;
    if (cachedGroupMemberIds(groupActor).has(actor.id)) return { token, groupActor };
  }
  return null;
}

export async function getGroupRepresentationForActorAsync(scene, actor) {
  if (!isDnd5e() || !scene || !actor) return null;

  for (const token of groupTokensInScene(scene)) {
    const groupActor = groupActorFromToken(token);
    if (!groupActor) continue;
    const members = await getGroupMemberActors(groupActor, { refresh: true });
    if (members.some((member) => member.id === actor.id)) return { token, groupActor };
  }
  return null;
}

export async function initializePartyProvider() {
  if (!isDnd5e()) return;
  const groups = [...game.actors].filter((actor) => actor.type === "group");
  await Promise.all(groups.map((group) => getGroupMemberActors(group, { refresh: true })));
}

export function registerPartyHooks() {
  Hooks.on("createActor", (actor) => {
    if (isDnd5e() && actor?.type === "group") void getGroupMemberActors(actor, { refresh: true });
  });

  Hooks.on("updateActor", (actor) => {
    if (isDnd5e() && actor?.type === "group") void getGroupMemberActors(actor, { refresh: true });
  });

  Hooks.on("deleteActor", (actor) => {
    if (actor?.id) groupMemberCache.delete(actor.id);
  });
}
