import { MODULE_ID } from "./constants.mjs";

export function getUserActor(user) {
  const character = user?.character;
  if (!character) return null;
  if (character.documentName === "Actor") return character;
  const id = character.id ?? character;
  return game.actors.get(id) ?? null;
}

export function actorTokensInScene(actor, scene) {
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

function overlaps(a, b, padding = 2) {
  return !(
    a.x + a.width + padding <= b.x
    || b.x + b.width + padding <= a.x
    || a.y + a.height + padding <= b.y
    || b.y + b.height + padding <= a.y
  );
}

export function tokenBounds(token) {
  const size = token?.getSize?.() ?? {
    width: Number(token?.width) || 1,
    height: Number(token?.height) || 1
  };
  return {
    x: Number(token?.x) || 0,
    y: Number(token?.y) || 0,
    width: Math.max(1, Number(size.width) || 1),
    height: Math.max(1, Number(size.height) || 1)
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

function sceneBounds(scene) {
  try {
    const rect = scene?.getDimensions?.()?.sceneRect;
    if (rect) {
      return {
        x: Number(rect.x) || 0,
        y: Number(rect.y) || 0,
        width: Number(rect.width) || 0,
        height: Number(rect.height) || 0
      };
    }
  } catch (_error) {
    // Fall through to a permissive bound.
  }
  return null;
}

function insideScene(rect, sceneRect) {
  if (!sceneRect) return true;
  return rect.x >= sceneRect.x
    && rect.y >= sceneRect.y
    && rect.x + rect.width <= sceneRect.x + sceneRect.width
    && rect.y + rect.height <= sceneRect.y + sceneRect.height;
}

function squareOffsets(gridSize, maxRings = 8) {
  const result = [{ x: 0, y: 0 }];
  for (let ring = 1; ring <= maxRings; ring += 1) {
    for (let x = -ring; x <= ring; x += 1) {
      result.push({ x: x * gridSize, y: -ring * gridSize });
      result.push({ x: x * gridSize, y: ring * gridSize });
    }
    for (let y = -ring + 1; y <= ring - 1; y += 1) {
      result.push({ x: -ring * gridSize, y: y * gridSize });
      result.push({ x: ring * gridSize, y: y * gridSize });
    }
  }
  return result;
}

function radialOffsets(gridSize, sides = 8, maxRings = 8) {
  const result = [{ x: 0, y: 0 }];
  for (let ring = 1; ring <= maxRings; ring += 1) {
    const count = Math.max(sides, sides * ring);
    const radius = gridSize * ring;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count;
      result.push({
        x: Math.round(Math.cos(angle) * radius),
        y: Math.round(Math.sin(angle) * radius)
      });
    }
  }
  return result;
}

function candidateOffsets(scene) {
  const gridSize = Number(scene?.grid?.size) || 100;
  const type = scene?.grid?.type;

  if (type === CONST.GRID_TYPES.GRIDLESS) return radialOffsets(gridSize, 8);
  if (type === CONST.GRID_TYPES.HEXODDR
      || type === CONST.GRID_TYPES.HEXEVENR
      || type === CONST.GRID_TYPES.HEXODDQ
      || type === CONST.GRID_TYPES.HEXEVENQ) {
    return radialOffsets(gridSize, 6);
  }
  return squareOffsets(gridSize);
}

function positionRect(center, offset, size) {
  const x = Math.round(center.x + offset.x - (size.width / 2));
  const y = Math.round(center.y + offset.y - (size.height / 2));
  return { x, y, width: size.width, height: size.height };
}

function pickFreePosition({ center, size, offsets, occupied, sceneRect }) {
  for (const offset of offsets) {
    const rect = positionRect(center, offset, size);
    if (!insideScene(rect, sceneRect)) continue;
    if (occupied.some((other) => overlaps(rect, other))) continue;
    return rect;
  }

  // Best effort fallback: if no collision-free candidate exists, use the
  // Arrival Point itself rather than failing navigation.
  return positionRect(center, { x: 0, y: 0 }, size);
}

async function createTokenFromSource(targetScene, sourceToken, dataPosition) {
  const data = sourceToken.toObject();
  delete data._id;
  delete data._stats;
  data.x = dataPosition.x;
  data.y = dataPosition.y;
  const [created] = await targetScene.createEmbeddedDocuments("Token", [data]);
  return created ?? null;
}

function buildPlayerMoveEntries(users, sourceScene, targetScene) {
  const entries = [];

  for (const user of users) {
    if (!user || user.isGM) continue;

    const actor = getUserActor(user);
    if (!actor) continue;

    const sourceToken = actorTokensInScene(actor, sourceScene)[0] ?? null;
    if (!sourceToken) continue;

    const targetToken = actorTokensInScene(actor, targetScene)[0] ?? null;
    const sizeSource = targetToken ?? sourceToken;
    const size = sizeSource.getSize?.() ?? tokenBounds(sizeSource);

    entries.push({
      user,
      actor,
      sourceToken,
      targetToken,
      size: {
        width: Math.max(1, Number(size.width) || 1),
        height: Math.max(1, Number(size.height) || 1)
      }
    });
  }

  return entries;
}

async function placeEntries(entries, targetScene, arrivalTile) {
  if (!entries.length || !arrivalTile) return [];

  const movingTargetIds = new Set(
    entries.map((entry) => entry.targetToken?.id).filter(Boolean)
  );

  const occupied = [...targetScene.tokens]
    .filter((token) => !movingTargetIds.has(token.id))
    .map(tokenBounds);

  const center = arrivalCenter(arrivalTile);
  const offsets = candidateOffsets(targetScene);
  const bounds = sceneBounds(targetScene);
  const results = [];

  for (const entry of entries) {
    const rect = pickFreePosition({
      center,
      size: entry.size,
      offsets,
      occupied,
      sceneRect: bounds
    });

    try {
      let token;
      if (entry.targetToken) {
        await entry.targetToken.update({ x: rect.x, y: rect.y });
        token = entry.targetToken;
      } else {
        token = await createTokenFromSource(targetScene, entry.sourceToken, rect);
      }

      if (token) {
        const placed = tokenBounds(token);
        placed.x = rect.x;
        placed.y = rect.y;
        occupied.push(placed);
        results.push(token);
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not place token for ${entry.user?.name ?? entry.user?.id}`, error);
    }
  }

  return results;
}

export async function placeUserAtArrival(user, sourceScene, targetScene, arrivalTile) {
  if (!user || !sourceScene || !targetScene || !arrivalTile) return null;
  const entries = buildPlayerMoveEntries([user], sourceScene, targetScene);
  const [token] = await placeEntries(entries, targetScene, arrivalTile);
  return token ?? null;
}

export async function placeUsersAtArrival(users, sourceScene, targetScene, arrivalTile) {
  if (!arrivalTile) return [];
  const entries = buildPlayerMoveEntries(users, sourceScene, targetScene);
  return placeEntries(entries, targetScene, arrivalTile);
}

export function activeNonGMPlayers() {
  return [...game.users].filter((user) => user.active && !user.isGM);
}

export function activeNonGMPlayersInScene(scene) {
  return activeNonGMPlayers().filter((user) => {
    const actor = getUserActor(user);
    return Boolean(actor && actorTokensInScene(actor, scene).length);
  });
}
