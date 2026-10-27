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

export function characterActorsInScene(scene) {
  if (!scene) return [];
  const seen = new Set();
  const actors = [];

  for (const token of scene.tokens ?? []) {
    const actor = token?.baseActor ?? game.actors.get(token?.actorId) ?? null;
    if (!actor || actor.type !== "character" || seen.has(actor.id)) continue;
    const live = game.actors.get(actor.id) ?? actor;
    seen.add(live.id);
    actors.push(live);
  }

  return actors;
}

async function groupMatchesActorIds(groupActor, actorIds) {
  if (!groupActor || !actorIds?.size) return false;
  const members = await getGroupMemberActors(groupActor, { refresh: true });
  return members.some((actor) => actorIds.has(actor.id));
}

async function matchingGroups(groups, actorIds) {
  const matches = [];
  for (const group of groups) {
    if (await groupMatchesActorIds(group, actorIds)) matches.push(group);
  }
  return matches;
}

function allDnd5eGroups() {
  if (!isDnd5e()) return [];
  return [...game.actors].filter((actor) => actor.type === "group");
}

/**
 * Resolve the D&D5e Group Actor which owns collective GM travel.
 *
 * Group membership is the authority for WHO travels. User.character is not
 * consulted here; user assignment is only used later to decide which clients
 * should be pulled to the destination Scene.
 */
export async function resolveTravelGroup({ sourceScene = null, returnDetails = false } = {}) {
  const result = { groupActor: null, ambiguous: false, candidates: [] };
  if (!isDnd5e()) return returnDetails ? result : null;

  const sourceCharacters = characterActorsInScene(sourceScene);
  const sourceActorIds = new Set(sourceCharacters.map((actor) => actor.id));

  // A Group Token placed in the source Scene is the strongest explicit signal.
  const sourceGroups = sceneGroupActors(sourceScene);
  if (sourceGroups.length === 1) {
    result.groupActor = sourceGroups[0];
    await getGroupMemberActors(result.groupActor, { refresh: true });
    return returnDetails ? result : result.groupActor;
  }

  if (sourceGroups.length > 1) {
    const matches = await matchingGroups(sourceGroups, sourceActorIds);
    if (matches.length === 1) {
      result.groupActor = matches[0];
      return returnDetails ? result : result.groupActor;
    }

    // Multiple Group Tokens with no unique membership match are ambiguous.
    result.ambiguous = true;
    result.candidates = matches.length ? matches : sourceGroups;
    return returnDetails ? result : null;
  }

  // A configured primary party is useful only when it is relevant to the
  // characters actually present in the source Scene (or there are none).
  const primary = primaryParty();
  if (primary) {
    const relevant = !sourceActorIds.size || await groupMatchesActorIds(primary, sourceActorIds);
    if (relevant) {
      result.groupActor = primary;
      return returnDetails ? result : result.groupActor;
    }
  }

  // Without a Group Token, infer the Group from character Actors physically
  // present in the source Scene. This keeps GM-only test worlds fully usable.
  if (sourceActorIds.size) {
    const matches = await matchingGroups(allDnd5eGroups(), sourceActorIds);
    if (matches.length === 1) {
      result.groupActor = matches[0];
      return returnDetails ? result : result.groupActor;
    }
    if (matches.length > 1) {
      result.ambiguous = true;
      result.candidates = matches;
      return returnDetails ? result : null;
    }
  }

  return returnDetails ? result : null;
}

export async function resolveTravelRoster({ sourceScene = null, targetScene = null } = {}) {
  if (isDnd5e()) {
    const groupResult = await resolveTravelGroup({ sourceScene, returnDetails: true });
    if (groupResult.ambiguous) {
      return {
        provider: "dnd5e-ambiguous-group",
        groupActor: null,
        actors: [],
        ambiguous: true,
        groupCandidates: groupResult.candidates
      };
    }

    if (groupResult.groupActor) {
      // IMPORTANT: do not filter Group members through User.character. The
      // Group Actor itself is the GM's live travel roster.
      const actors = await getGroupMemberActors(groupResult.groupActor, { refresh: true });
      return {
        provider: "dnd5e-group",
        groupActor: groupResult.groupActor,
        actors,
        ambiguous: false
      };
    }

    // D&D5e fallback for worlds which do not use Group Actors: every live
    // character Actor which has a Token in the source Scene travels. NPCs and
    // monsters remain untouched.
    return {
      provider: "dnd5e-scene-characters",
      groupActor: null,
      actors: characterActorsInScene(sourceScene),
      ambiguous: false
    };
  }

  return {
    provider: "generic",
    groupActor: null,
    actors: playerActors({ activeOnly: true }),
    ambiguous: false
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
