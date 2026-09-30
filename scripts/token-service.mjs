import { MODULE_ID } from "./constants.mjs";
import {
  getGroupRepresentationForActor,
  getUserActor
} from "./party-service.mjs";

export { getUserActor };

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

export function tileBounds(tile) {
  const bounds = tile?.shape?.bounds;
  if (bounds) {
    return {
      x: Number(bounds.x) || 0,
      y: Number(bounds.y) || 0,
      width: Math.abs(Number(bounds.width) || 0),
      height: Math.abs(Number(bounds.height) || 0)
    };
  }

  const width = Math.abs(Number(tile?.width) || 0);
  const height = Math.abs(Number(tile?.height) || 0);
  const centerX = Number(tile?.x) || 0;
  const centerY = Number(tile?.y) || 0;
  const anchorX = Number(tile?.texture?.anchorX ?? 0.5);
  const anchorY = Number(tile?.texture?.anchorY ?? 0.5);
  return {
    x: centerX - (width * anchorX),
    y: centerY - (height * anchorY),
    width,
    height
  };
}

function proximityTokensForUser(user, scene) {
  const actor = getUserActor(user);
  if (!actor) return [];

  const groupRepresentation = getGroupRepresentationForActor(scene, actor);
  if (groupRepresentation?.token) return [groupRepresentation.token];

  return actorTokensInScene(actor, scene);
}

export function isUserWithinNavigationRange(user, tile) {
  if (user?.isGM) return true;
  const scene = tile?.parent;
  if (!scene) return false;

  const tokens = proximityTokensForUser(user, scene);
  if (!tokens.length) return false;

  const tBounds = tileBounds(tile);
  const gridSize = Number(scene.grid?.size) || 100;
  const isGridless = scene.grid?.type === CONST.GRID_TYPES.GRIDLESS;
  const maxGap = isGridless ? gridSize : 3;

  return tokens.some((token) => rectGap(tokenBounds(token), tBounds) <= maxGap);
}

function pointInsideTile(tile, point) {
  if (tile?.shape?.testPoint) {
    try {
      return Boolean(tile.shape.testPoint(point));
    } catch (_error) {
      // Fall through to the bounds test.
    }
  }
  const bounds = tileBounds(tile);
  return point.x >= bounds.x && point.x <= bounds.x + bounds.width
    && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
}

function arrivalCenter(arrivalTile) {
  const center = arrivalTile?.shape?.center;
  if (center) return { x: Number(center.x) || 0, y: Number(center.y) || 0 };
  const bounds = tileBounds(arrivalTile);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function insideArea(rect, bounds) {
  const epsilon = 1;
  return rect.x >= bounds.x - epsilon
    && rect.y >= bounds.y - epsilon
    && rect.x + rect.width <= bounds.x + bounds.width + epsilon
    && rect.y + rect.height <= bounds.y + bounds.height + epsilon;
}

function slotRect(slot, size) {
  return {
    x: Math.round(slot.x - size.width / 2),
    y: Math.round(slot.y - size.height / 2),
    width: size.width,
    height: size.height
  };
}

function gridArrivalSlots(scene, arrivalTile) {
  const grid = scene?.grid;
  const bounds = tileBounds(arrivalTile);
  const center = arrivalCenter(arrivalTile);
  if (!grid || grid.isGridless || grid.type === CONST.GRID_TYPES.GRIDLESS) return [];

  let i0;
  let j0;
  let i1;
  let j1;
  try {
    const epsilon = 0.5;
    const points = [
      { x: bounds.x + epsilon, y: bounds.y + epsilon },
      { x: bounds.x + bounds.width - epsilon, y: bounds.y + epsilon },
      { x: bounds.x + epsilon, y: bounds.y + bounds.height - epsilon },
      { x: bounds.x + bounds.width - epsilon, y: bounds.y + bounds.height - epsilon }
    ];
    const offsets = points.map((point) => grid.getOffset(point));
    i0 = Math.min(...offsets.map((offset) => offset.i)) - 1;
    j0 = Math.min(...offsets.map((offset) => offset.j)) - 1;
    i1 = Math.max(...offsets.map((offset) => offset.i)) + 2;
    j1 = Math.max(...offsets.map((offset) => offset.j)) + 2;
  } catch (_error) {
    return [];
  }

  const slots = [];
  for (let i = i0; i < i1; i += 1) {
    for (let j = j0; j < j1; j += 1) {
      const point = grid.getCenterPoint({ i, j });
      if (!pointInsideTile(arrivalTile, point)) continue;
      slots.push({
        x: Number(point.x) || 0,
        y: Number(point.y) || 0,
        i,
        j,
        d2: ((point.x - center.x) ** 2) + ((point.y - center.y) ** 2)
      });
    }
  }

  return slots.sort((a, b) => a.d2 - b.d2 || a.i - b.i || a.j - b.j);
}

function gridlessArrivalSlots(scene, arrivalTile) {
  const bounds = tileBounds(arrivalTile);
  const center = arrivalCenter(arrivalTile);
  const spacing = Math.max(1, Number(scene?.grid?.size) || 100);
  const slots = [];

  const cols = Math.max(1, Math.floor(bounds.width / spacing));
  const rows = Math.max(1, Math.floor(bounds.height / spacing));
  const usedWidth = cols * spacing;
  const usedHeight = rows * spacing;
  const startX = bounds.x + (bounds.width - usedWidth) / 2 + spacing / 2;
  const startY = bounds.y + (bounds.height - usedHeight) / 2 + spacing / 2;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = startX + col * spacing;
      const y = startY + row * spacing;
      if (!pointInsideTile(arrivalTile, { x, y })) continue;
      slots.push({ x, y, row, col, d2: ((x - center.x) ** 2) + ((y - center.y) ** 2) });
    }
  }

  if (!slots.length) slots.push({ ...center, d2: 0 });
  return slots.sort((a, b) => a.d2 - b.d2 || (a.row ?? 0) - (b.row ?? 0) || (a.col ?? 0) - (b.col ?? 0));
}

function arrivalSlots(scene, arrivalTile) {
  const grid = scene?.grid;
  const slots = grid && !grid.isGridless && grid.type !== CONST.GRID_TYPES.GRIDLESS
    ? gridArrivalSlots(scene, arrivalTile)
    : gridlessArrivalSlots(scene, arrivalTile);
  return slots.length ? slots : [{ ...arrivalCenter(arrivalTile), d2: 0 }];
}

function clampRectInsideArea(rect, bounds) {
  if (rect.width > bounds.width || rect.height > bounds.height) return rect;
  return {
    ...rect,
    x: Math.min(Math.max(rect.x, bounds.x), bounds.x + bounds.width - rect.width),
    y: Math.min(Math.max(rect.y, bounds.y), bounds.y + bounds.height - rect.height)
  };
}

function pickArrivalPosition({ size, slots, arrivalBounds, occupied, slotUse }) {
  const fitting = slots
    .map((slot, index) => ({ slot, index, rect: slotRect(slot, size) }))
    .filter((entry) => insideArea(entry.rect, arrivalBounds));

  const candidates = fitting.length ? fitting : slots.map((slot, index) => ({
    slot,
    index,
    rect: clampRectInsideArea(slotRect(slot, size), arrivalBounds)
  }));

  // First pass: use every safe, non-overlapping location in the GM-drawn
  // Arrival Area before stacking anybody.
  for (const entry of candidates) {
    if ((slotUse.get(entry.index) ?? 0) > 0) continue;
    if (occupied.some((other) => overlaps(entry.rect, other))) continue;
    slotUse.set(entry.index, 1);
    return entry.rect;
  }

  // Second pass: the Arrival Area is authoritative. If there are more
  // travellers than available cells, stack inside the area instead of ever
  // spilling outside a wall/corridor the GM intentionally bounded.
  const ordered = [...candidates].sort((a, b) => {
    const au = slotUse.get(a.index) ?? 0;
    const bu = slotUse.get(b.index) ?? 0;
    return au - bu || a.slot.d2 - b.slot.d2 || a.index - b.index;
  });

  const selected = ordered[0] ?? {
    index: 0,
    rect: clampRectInsideArea(slotRect(arrivalCenter({ shape: { center: { x: arrivalBounds.x + arrivalBounds.width / 2, y: arrivalBounds.y + arrivalBounds.height / 2 } } }), size), arrivalBounds)
  };
  slotUse.set(selected.index, (slotUse.get(selected.index) ?? 0) + 1);
  return selected.rect;
}

async function actorTokenPixelSize(actor, targetScene, existingToken = null) {
  if (existingToken) {
    const size = existingToken.getSize?.() ?? tokenBounds(existingToken);
    return {
      width: Math.max(1, Number(size.width) || 1),
      height: Math.max(1, Number(size.height) || 1)
    };
  }

  try {
    const ephemeral = await actor.getTokenDocument({}, { parent: targetScene });
    const size = ephemeral.getSize?.();
    if (size) {
      return {
        width: Math.max(1, Number(size.width) || 1),
        height: Math.max(1, Number(size.height) || 1)
      };
    }

    const gridSize = Number(targetScene.grid?.size) || 100;
    return {
      width: Math.max(1, Number(ephemeral.width) || 1) * gridSize,
      height: Math.max(1, Number(ephemeral.height) || 1) * gridSize
    };
  } catch (_error) {
    const gridSize = Number(targetScene.grid?.size) || 100;
    return { width: gridSize, height: gridSize };
  }
}

async function createTokenFromActor(targetScene, actor, dataPosition) {
  const tokenDocument = await actor.getTokenDocument({
    x: dataPosition.x,
    y: dataPosition.y
  }, { parent: targetScene });

  const data = tokenDocument.toObject();
  delete data._id;
  delete data._stats;
  data.x = dataPosition.x;
  data.y = dataPosition.y;

  const [created] = await targetScene.createEmbeddedDocuments("Token", [data], { ctnTriggerInternal: true });
  return created ?? null;
}

async function buildActorEntries(actors, targetScene) {
  const entries = [];
  for (const actor of actors) {
    if (!actor) continue;
    const targetToken = actorTokensInScene(actor, targetScene)[0] ?? null;
    const size = await actorTokenPixelSize(actor, targetScene, targetToken);
    entries.push({ actor, targetToken, size });
  }
  return entries;
}

async function placeActorEntries(entries, targetScene, arrivalTile) {
  if (!entries.length || !arrivalTile) {
    return {
      tokens: [],
      successfulActorIds: new Set(),
      failedActorIds: new Set(entries.map((entry) => entry.actor.id))
    };
  }

  const movingTargetIds = new Set(entries.map((entry) => entry.targetToken?.id).filter(Boolean));
  const occupied = [...targetScene.tokens]
    .filter((token) => !movingTargetIds.has(token.id))
    .map(tokenBounds);

  const slots = arrivalSlots(targetScene, arrivalTile);
  const arrivalBounds = tileBounds(arrivalTile);
  const slotUse = new Map();
  const tokens = [];
  const successfulActorIds = new Set();
  const failedActorIds = new Set();

  for (const entry of entries) {
    const rect = pickArrivalPosition({
      size: entry.size,
      slots,
      arrivalBounds,
      occupied,
      slotUse
    });

    try {
      let token;
      if (entry.targetToken) {
        await entry.targetToken.update({ x: rect.x, y: rect.y }, { ctnTriggerInternal: true });
        token = entry.targetToken;
      } else {
        token = await createTokenFromActor(targetScene, entry.actor, rect);
      }

      if (!token) throw new Error("Token creation returned no document");

      const placed = tokenBounds(token);
      placed.x = rect.x;
      placed.y = rect.y;
      occupied.push(placed);
      tokens.push(token);
      successfulActorIds.add(entry.actor.id);
    } catch (error) {
      failedActorIds.add(entry.actor.id);
      console.warn(`${MODULE_ID} | Could not materialize ${entry.actor.name ?? entry.actor.id} in ${targetScene.name}`, error);
    }
  }

  return { tokens, successfulActorIds, failedActorIds };
}

export async function reconcileActorsAtArrival(actors, targetScene, arrivalTile) {
  if (!targetScene || !arrivalTile) {
    return {
      tokens: [],
      successfulActorIds: new Set(),
      failedActorIds: new Set((actors ?? []).map((actor) => actor.id))
    };
  }
  const entries = await buildActorEntries(actors ?? [], targetScene);
  return placeActorEntries(entries, targetScene, arrivalTile);
}

export async function repositionExistingTokenAtArrival(token, targetScene, arrivalTile) {
  if (!token || !targetScene || !arrivalTile) return false;

  const size = token.getSize?.() ?? tokenBounds(token);
  const occupied = [...targetScene.tokens]
    .filter((other) => other.id !== token.id)
    .map(tokenBounds);
  const slots = arrivalSlots(targetScene, arrivalTile);
  const arrivalBounds = tileBounds(arrivalTile);
  const rect = pickArrivalPosition({
    size: {
      width: Math.max(1, Number(size.width) || 1),
      height: Math.max(1, Number(size.height) || 1)
    },
    slots,
    arrivalBounds,
    occupied,
    slotUse: new Map()
  });

  try {
    await token.update({ x: rect.x, y: rect.y }, { ctnTriggerInternal: true });
    return true;
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not reposition group token ${token.name ?? token.id}`, error);
    return false;
  }
}

export async function deleteActorTokensFromScene(scene, actorIds) {
  if (!scene || !actorIds?.size) return [];

  const ids = [...scene.tokens]
    .filter((token) => actorIds.has(token.baseActor?.id ?? token.actorId))
    .filter((token) => (token.baseActor ?? game.actors.get(token.actorId))?.type !== "group")
    .map((token) => token.id);

  if (!ids.length) return [];

  try {
    await scene.deleteEmbeddedDocuments("Token", ids, { ctnTriggerInternal: true });
    return ids;
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not clean travelling Tokens from ${scene.name}`, error);
    return [];
  }
}

export function activeNonGMPlayers() {
  return [...game.users].filter((user) => user.active && !user.isGM);
}
