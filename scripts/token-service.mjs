import { MODULE_ID } from "./constants.mjs";

function getUserActor(user) {
  const character = user?.character;
  if (!character) return null;
  if (character.documentName === "Actor") return character;
  const id = character.id ?? character;
  return game.actors.get(id) ?? null;
}

function actorTokensInScene(actor, scene) {
  if (!actor || !scene) return [];
  try {
    const tokens = actor.getDependentTokens({ scenes: scene, concreteOnly: true });
    if (Array.isArray(tokens)) return tokens;
  } catch (_error) {
    // Fall back to direct Scene token lookup.
  }
  return [...scene.tokens].filter((token) => token.actorId === actor.id);
}

function rectGap(a, b) {
  const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  return Math.hypot(dx, dy);
}

function tokenBounds(token) {
  const size = token.getSize?.() ?? {
    width: Number(token.width) || 1,
    height: Number(token.height) || 1
  };
  return {
    x: Number(token.x) || 0,
    y: Number(token.y) || 0,
    width: Number(size.width) || 0,
    height: Number(size.height) || 0
  };
}

function tileBounds(tile) {
  const bounds = tile?.shape?.bounds;
  if (bounds) {
    return {
      x: Number(bounds.x) || 0,
      y: Number(bounds.y) || 0,
      width: Number(bounds.width) || 0,
      height: Number(bounds.height) || 0
    };
  }

  return {
    x: Number(tile?.x) || 0,
    y: Number(tile?.y) || 0,
    width: Math.abs(Number(tile?.width) || 0),
    height: Math.abs(Number(tile?.height) || 0)
  };
}

export function isUserWithinNavigationRange(user, tile) {
  if (user?.isGM) return true;
  const scene = tile?.parent;
  if (!scene) return false;

  const actor = getUserActor(user);
  if (!actor) return false;

  const tokens = actorTokensInScene(actor, scene);
  if (!tokens.length) return false;

  const tBounds = tileBounds(tile);
  const gridSize = Number(scene.grid?.size) || 100;
  const isGridless = scene.grid?.type === CONST.GRID_TYPES.GRIDLESS;
  const maxGap = isGridless ? gridSize : 3;

  return tokens.some((token) => rectGap(tokenBounds(token), tBounds) <= maxGap);
}

function arrivalCenter(arrivalTile) {
  const center = arrivalTile?.shape?.center;
  if (center) return { x: Number(center.x) || 0, y: Number(center.y) || 0 };

  const bounds = tileBounds(arrivalTile);
  return {
    x: bounds.x + (bounds.width / 2),
    y: bounds.y + (bounds.height / 2)
  };
}

function positionForToken(token, arrivalTile) {
  const center = arrivalCenter(arrivalTile);
  const size = token.getSize?.() ?? {
    width: Number(token.width) || 1,
    height: Number(token.height) || 1
  };

  return {
    x: Math.round(center.x - ((Number(size.width) || 0) / 2)),
    y: Math.round(center.y - ((Number(size.height) || 0) / 2))
  };
}

async function createTokenFromSource(targetScene, actor, sourceToken, arrivalTile) {
  let data;
  let ephemeral;

  if (sourceToken) {
    data = sourceToken.toObject();
    delete data._id;
    delete data._stats;
  } else {
    ephemeral = await actor.getTokenDocument();
    data = ephemeral.toObject();
    delete data._id;
    delete data._stats;
  }

  const positioningToken = sourceToken ?? ephemeral;
  Object.assign(data, positionForToken(positioningToken, arrivalTile));
  const [created] = await targetScene.createEmbeddedDocuments("Token", [data]);
  return created ?? null;
}

export async function placeUserAtArrival(user, sourceScene, targetScene, arrivalTile) {
  if (!user || !sourceScene || !targetScene || !arrivalTile) return null;

  const actor = getUserActor(user);
  if (!actor) return null;

  const sourceTokens = actorTokensInScene(actor, sourceScene);
  const sourceToken = sourceTokens[0] ?? null;
  if (!sourceToken) return null;

  const targetTokens = actorTokensInScene(actor, targetScene);
  const targetToken = targetTokens[0] ?? null;

  if (targetToken) {
    const position = positionForToken(targetToken, arrivalTile);
    await targetToken.update(position);
    return targetToken;
  }

  return createTokenFromSource(targetScene, actor, sourceToken, arrivalTile);
}

export async function placeUsersAtArrival(users, sourceScene, targetScene, arrivalTile) {
  if (!arrivalTile) return;
  for (const user of users) {
    try {
      await placeUserAtArrival(user, sourceScene, targetScene, arrivalTile);
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not place token for ${user?.name ?? user?.id}`, error);
    }
  }
}

export function activeNonGMPlayersInScene(scene) {
  return [...game.users].filter((user) => {
    if (!user.active || user.isGM) return false;
    const actor = getUserActor(user);
    return Boolean(actor && actorTokensInScene(actor, scene).length);
  });
}
