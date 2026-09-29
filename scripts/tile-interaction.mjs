import {
  MODULE_ID,
  GESTURES,
  VISIBILITY,
  TRIGGER_PERMISSION
} from "./constants.mjs";
import { requestNavigation } from "./navigation-service.mjs";

let boundElement = null;
let pointerUpHandler = null;
let doubleClickHandler = null;
let pointerMoveHandler = null;
let pointerLeaveHandler = null;

let navigationTileCache = [];
let hoverFrame = null;
let pendingPointer = null;
let hoveredTileId = null;

function navData(tileDocument) {
  return tileDocument?.getFlag?.(MODULE_ID, "navigation") ?? null;
}

function isEditingTiles() {
  return Boolean(game.user?.isGM && canvas?.activeLayer === canvas?.tiles);
}

function canSee(tileDocument, nav) {
  if (game.user?.isGM) return true;
  return nav?.visibility === VISIBILITY.EVERYONE && !tileDocument.hidden;
}

function canTrigger(nav) {
  return game.user?.isGM || nav?.triggerPermission === TRIGGER_PERMISSION.EVERYONE;
}

function rebuildNavigationTileCache() {
  const tiles = canvas?.scene?.tiles?.contents;
  navigationTileCache = Array.isArray(tiles)
    ? tiles.filter((tile) => navData(tile)?.enabled)
    : [];
}

function belongsToCurrentScene(tileDocument) {
  return Boolean(
    tileDocument
    && canvas?.scene
    && tileDocument.parent?.id === canvas.scene.id
  );
}

function canvasPoint(clientX, clientY) {
  if (!canvas?.ready) return null;
  return canvas.canvasCoordinatesFromClient({ x: clientX, y: clientY });
}

function containsPoint(tileDocument, point) {
  const x = Number(tileDocument.x) || 0;
  const y = Number(tileDocument.y) || 0;
  const width = Number(tileDocument.width) || 0;
  const height = Number(tileDocument.height) || 0;
  if (!width || !height) return false;

  // TileDocument x/y describe the document rectangle. Rotation is around its center.
  const centerX = x + (width / 2);
  const centerY = y + (height / 2);
  const angle = -(Number(tileDocument.rotation) || 0) * (Math.PI / 180);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - centerX;
  const dy = point.y - centerY;

  const localX = centerX + (dx * cos) - (dy * sin);
  const localY = centerY + (dx * sin) + (dy * cos);

  const minX = Math.min(x, x + width);
  const maxX = Math.max(x, x + width);
  const minY = Math.min(y, y + height);
  const maxY = Math.max(y, y + height);

  return localX >= minX
    && localX <= maxX
    && localY >= minY
    && localY <= maxY;
}

function isAbove(candidate, current) {
  if (!current) return true;

  const elevationA = Number(candidate.elevation) || 0;
  const elevationB = Number(current.elevation) || 0;
  if (elevationA !== elevationB) return elevationA > elevationB;

  const sortA = Number(candidate.sort) || 0;
  const sortB = Number(current.sort) || 0;
  return sortA > sortB;
}

function getNavigationTileAt(clientX, clientY) {
  if (!navigationTileCache.length) return null;

  const point = canvasPoint(clientX, clientY);
  if (!point) return null;

  let best = null;

  for (const tile of navigationTileCache) {
    const nav = navData(tile);
    if (!nav?.enabled) continue;
    if (!canSee(tile, nav)) continue;
    if (!canTrigger(nav)) continue;
    if (!containsPoint(tile, point)) continue;
    if (isAbove(tile, best)) best = tile;
  }

  return best;
}

function modifiers(event) {
  return {
    alt: Boolean(event.altKey),
    ctrl: Boolean(event.ctrlKey),
    button: Number(event.button ?? 0)
  };
}

function matchesPointerGesture(nav, event) {
  const { alt, ctrl, button } = modifiers(event);

  switch (nav.gesture) {
    case GESTURES.MIDDLE:
      return button === 1;
    case GESTURES.ALT:
      return button === 0 && alt;
    case GESTURES.CTRL:
      return button === 0 && ctrl;
    case GESTURES.SINGLE:
      return button === 0 && !alt && !ctrl;
    default:
      return false;
  }
}

async function activate(tileDocument, event) {
  event.preventDefault?.();
  await requestNavigation(tileDocument);
}

function onPointerUp(event) {
  if (isEditingTiles()) return;

  const tileDocument = getNavigationTileAt(event.clientX, event.clientY);
  if (!tileDocument) return;

  const nav = navData(tileDocument);
  if (!matchesPointerGesture(nav, event)) return;

  void activate(tileDocument, event);
}

function onDoubleClick(event) {
  if (isEditingTiles()) return;
  if (event.button !== 0 || event.altKey || event.ctrlKey) return;

  const tileDocument = getNavigationTileAt(event.clientX, event.clientY);
  if (!tileDocument) return;

  const nav = navData(tileDocument);
  if (nav?.gesture !== GESTURES.DOUBLE) return;

  void activate(tileDocument, event);
}

function setHoveredTile(tileDocument) {
  if (!boundElement) return;

  const nextId = tileDocument?.id ?? null;
  if (nextId === hoveredTileId) return;

  hoveredTileId = nextId;
  boundElement.style.cursor = nextId ? "pointer" : "";
}

function processPointerMove() {
  hoverFrame = null;

  if (!boundElement || !pendingPointer) return;

  const pointer = pendingPointer;
  pendingPointer = null;

  if (isEditingTiles() || !navigationTileCache.length) {
    setHoveredTile(null);
    return;
  }

  const tileDocument = getNavigationTileAt(pointer.clientX, pointer.clientY);
  setHoveredTile(tileDocument);
}

function onPointerMove(event) {
  pendingPointer = {
    clientX: event.clientX,
    clientY: event.clientY
  };

  if (hoverFrame !== null) return;
  hoverFrame = requestAnimationFrame(processPointerMove);
}

function onPointerLeave() {
  pendingPointer = null;

  if (hoverFrame !== null) {
    cancelAnimationFrame(hoverFrame);
    hoverFrame = null;
  }

  setHoveredTile(null);
}

function bindCanvasElement() {
  const element = canvas?.app?.canvas ?? canvas?.app?.view ?? null;
  if (!(element instanceof HTMLCanvasElement)) return;
  if (boundElement === element) {
    rebuildNavigationTileCache();
    return;
  }

  unbindCanvasElement();

  boundElement = element;
  pointerUpHandler = onPointerUp;
  doubleClickHandler = onDoubleClick;
  pointerMoveHandler = onPointerMove;
  pointerLeaveHandler = onPointerLeave;

  element.addEventListener("pointerup", pointerUpHandler);
  element.addEventListener("dblclick", doubleClickHandler);
  element.addEventListener("pointermove", pointerMoveHandler);
  element.addEventListener("pointerleave", pointerLeaveHandler);

  rebuildNavigationTileCache();
}

function unbindCanvasElement() {
  if (hoverFrame !== null) {
    cancelAnimationFrame(hoverFrame);
    hoverFrame = null;
  }

  pendingPointer = null;
  navigationTileCache = [];
  hoveredTileId = null;

  if (!boundElement) return;

  if (pointerUpHandler) boundElement.removeEventListener("pointerup", pointerUpHandler);
  if (doubleClickHandler) boundElement.removeEventListener("dblclick", doubleClickHandler);
  if (pointerMoveHandler) boundElement.removeEventListener("pointermove", pointerMoveHandler);
  if (pointerLeaveHandler) boundElement.removeEventListener("pointerleave", pointerLeaveHandler);

  boundElement.style.cursor = "";
  boundElement = null;
  pointerUpHandler = null;
  doubleClickHandler = null;
  pointerMoveHandler = null;
  pointerLeaveHandler = null;
}

function refreshCacheForTile(tileDocument) {
  if (!belongsToCurrentScene(tileDocument)) return;
  rebuildNavigationTileCache();

  if (hoveredTileId && !navigationTileCache.some((tile) => tile.id === hoveredTileId)) {
    setHoveredTile(null);
  }
}

export function registerTileInteractionHooks() {
  Hooks.on("canvasReady", bindCanvasElement);
  Hooks.on("canvasTearDown", unbindCanvasElement);

  Hooks.on("createTile", refreshCacheForTile);
  Hooks.on("updateTile", refreshCacheForTile);
  Hooks.on("deleteTile", refreshCacheForTile);

  if (canvas?.ready) bindCanvasElement();
}
