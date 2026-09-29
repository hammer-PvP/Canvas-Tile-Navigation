import {
  GESTURES,
  HOVER_HOOK,
  MODULE_ID,
  TRIGGER_PERMISSION,
  VISIBILITY
} from "./constants.mjs";
import { requestNavigation } from "./navigation-service.mjs";
import { isNavigationLink, navData } from "./route-service.mjs";
import { isUserWithinNavigationRange } from "./token-service.mjs";

let boundElement = null;
let pointerUpHandler = null;
let doubleClickHandler = null;
let pointerMoveHandler = null;
let pointerLeaveHandler = null;

let navigationTileCache = [];
let hoverFrame = null;
let pendingPointer = null;
let hoveredTileId = null;

function isEditingTiles() {
  return Boolean(game.user?.isGM && canvas?.activeLayer === canvas?.tiles);
}

function canSee(tileDocument, nav) {
  if (game.user?.isGM) return true;
  return nav?.visibility === VISIBILITY.EVERYONE && !tileDocument.hidden;
}

function hasTriggerPermission(nav) {
  return game.user?.isGM || nav?.triggerPermission === TRIGGER_PERMISSION.EVERYONE;
}

function canTrigger(tileDocument, nav) {
  if (!hasTriggerPermission(nav)) return false;
  if (game.user?.isGM) return true;
  return isUserWithinNavigationRange(game.user, tileDocument);
}

function rebuildNavigationTileCache() {
  const tiles = canvas?.scene?.tiles?.contents;
  navigationTileCache = Array.isArray(tiles)
    ? tiles.filter(isNavigationLink)
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
  if (tileDocument?.shape?.testPoint) {
    try {
      return Boolean(tileDocument.shape.testPoint(point));
    } catch (error) {
      console.warn(`${MODULE_ID} | Native Tile shape hit-test failed; using fallback`, error);
    }
  }

  const originX = Number(tileDocument?.x) || 0;
  const originY = Number(tileDocument?.y) || 0;
  const width = Math.abs(Number(tileDocument?.width) || 0);
  const height = Math.abs(Number(tileDocument?.height) || 0);
  if (!width || !height) return false;

  const rawAnchorX = tileDocument?.texture?.anchorX ?? tileDocument?.anchorX ?? 0.5;
  const rawAnchorY = tileDocument?.texture?.anchorY ?? tileDocument?.anchorY ?? 0.5;
  const anchorX = Number.isFinite(Number(rawAnchorX)) ? Number(rawAnchorX) : 0.5;
  const anchorY = Number.isFinite(Number(rawAnchorY)) ? Number(rawAnchorY) : 0.5;

  const left = -(width * anchorX);
  const top = -(height * anchorY);
  const right = left + width;
  const bottom = top + height;

  const angle = -(Number(tileDocument?.rotation) || 0) * (Math.PI / 180);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - originX;
  const dy = point.y - originY;

  const localX = (dx * cos) - (dy * sin);
  const localY = (dx * sin) + (dy * cos);

  return localX >= Math.min(left, right)
    && localX <= Math.max(left, right)
    && localY >= Math.min(top, bottom)
    && localY <= Math.max(top, bottom);
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

function getVisibleNavigationTileAt(clientX, clientY) {
  if (!navigationTileCache.length) return null;

  const point = canvasPoint(clientX, clientY);
  if (!point) return null;

  let best = null;
  for (const tile of navigationTileCache) {
    const nav = navData(tile);
    if (!nav?.enabled || !canSee(tile, nav)) continue;
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
  await requestNavigation(tileDocument, {
    preview: Boolean(game.user?.isGM && event.shiftKey)
  });
}

function validateAndActivate(tileDocument, event) {
  const nav = navData(tileDocument);
  if (!hasTriggerPermission(nav)) return;

  if (!canTrigger(tileDocument, nav)) {
    if (!game.user?.isGM) {
      ui.notifications.warn(game.i18n.localize("CTN.Notifications.PlayerTooFar"));
    }
    return;
  }

  void activate(tileDocument, event);
}

function onPointerUp(event) {
  if (isEditingTiles()) return;

  const tileDocument = getVisibleNavigationTileAt(event.clientX, event.clientY);
  if (!tileDocument) return;

  const nav = navData(tileDocument);
  if (!matchesPointerGesture(nav, event)) return;

  validateAndActivate(tileDocument, event);
}

function onDoubleClick(event) {
  if (isEditingTiles()) return;
  if (event.button !== 0 || event.altKey || event.ctrlKey) return;

  const tileDocument = getVisibleNavigationTileAt(event.clientX, event.clientY);
  if (!tileDocument) return;

  const nav = navData(tileDocument);
  if (nav?.gesture !== GESTURES.DOUBLE) return;

  validateAndActivate(tileDocument, event);
}

function setHoveredTile(tileDocument, actionable = false) {
  if (!boundElement) return;

  const nextId = tileDocument?.id ?? null;
  if (nextId !== hoveredTileId) {
    hoveredTileId = nextId;
    Hooks.callAll(HOVER_HOOK, tileDocument ?? null);
  }

  boundElement.style.cursor = nextId && actionable ? "pointer" : "";
}

function processPointerMove() {
  hoverFrame = null;

  if (!boundElement || !pendingPointer) return;

  const pointer = pendingPointer;
  pendingPointer = null;

  if (isEditingTiles() || !navigationTileCache.length) {
    setHoveredTile(null, false);
    return;
  }

  const tileDocument = getVisibleNavigationTileAt(pointer.clientX, pointer.clientY);
  const nav = navData(tileDocument);
  setHoveredTile(tileDocument, Boolean(tileDocument && canTrigger(tileDocument, nav)));
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

  setHoveredTile(null, false);
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
    setHoveredTile(null, false);
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
