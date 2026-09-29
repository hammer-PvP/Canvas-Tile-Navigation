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

function canvasPoint(event) {
  if (!canvas?.ready) return null;
  return canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
}

function containsPoint(tileDocument, point) {
  const x = Number(tileDocument.x) || 0;
  const y = Number(tileDocument.y) || 0;
  const width = Number(tileDocument.width) || 0;
  const height = Number(tileDocument.height) || 0;
  if (!width || !height) return false;

  const anchorX = Number(tileDocument.texture?.anchorX ?? 0.5);
  const anchorY = Number(tileDocument.texture?.anchorY ?? 0.5);
  const originX = x + (width * anchorX);
  const originY = y + (height * anchorY);

  const angle = -(Number(tileDocument.rotation) || 0) * (Math.PI / 180);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - originX;
  const dy = point.y - originY;

  // Inverse-rotate the pointer into the Tile's unrotated document rectangle.
  const unrotatedX = originX + (dx * cos) - (dy * sin);
  const unrotatedY = originY + (dx * sin) + (dy * cos);

  const minX = Math.min(x, x + width);
  const maxX = Math.max(x, x + width);
  const minY = Math.min(y, y + height);
  const maxY = Math.max(y, y + height);

  return unrotatedX >= minX
    && unrotatedX <= maxX
    && unrotatedY >= minY
    && unrotatedY <= maxY;
}

function getNavigationTileAt(event) {
  const point = canvasPoint(event);
  if (!point || !canvas?.scene?.tiles) return null;

  const candidates = [...canvas.scene.tiles]
    .map(([, tile]) => tile)
    .filter((tile) => {
      const nav = navData(tile);
      return nav?.enabled
        && canSee(tile, nav)
        && canTrigger(nav)
        && containsPoint(tile, point);
    })
    .sort((a, b) => {
      const elevationA = Number(a.elevation) || 0;
      const elevationB = Number(b.elevation) || 0;
      if (elevationA !== elevationB) return elevationB - elevationA;

      const sortA = Number(a.sort) || 0;
      const sortB = Number(b.sort) || 0;
      return sortB - sortA;
    });

  return candidates[0] ?? null;
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

  const tileDocument = getNavigationTileAt(event);
  if (!tileDocument) return;

  const nav = navData(tileDocument);
  if (!matchesPointerGesture(nav, event)) return;

  void activate(tileDocument, event);
}

function onDoubleClick(event) {
  if (isEditingTiles()) return;
  if (event.button !== 0 || event.altKey || event.ctrlKey) return;

  const tileDocument = getNavigationTileAt(event);
  if (!tileDocument) return;

  const nav = navData(tileDocument);
  if (nav?.gesture !== GESTURES.DOUBLE) return;

  void activate(tileDocument, event);
}

function onPointerMove(event) {
  if (!boundElement) return;

  if (isEditingTiles()) {
    boundElement.style.cursor = "";
    return;
  }

  const tileDocument = getNavigationTileAt(event);
  boundElement.style.cursor = tileDocument ? "pointer" : "";
}

function bindCanvasElement() {
  const element = canvas?.app?.canvas ?? canvas?.app?.view ?? null;
  if (!(element instanceof HTMLCanvasElement)) return;
  if (boundElement === element) return;

  unbindCanvasElement();

  boundElement = element;
  pointerUpHandler = onPointerUp;
  doubleClickHandler = onDoubleClick;
  pointerMoveHandler = onPointerMove;

  element.addEventListener("pointerup", pointerUpHandler);
  element.addEventListener("dblclick", doubleClickHandler);
  element.addEventListener("pointermove", pointerMoveHandler);
}

function unbindCanvasElement() {
  if (!boundElement) return;

  if (pointerUpHandler) boundElement.removeEventListener("pointerup", pointerUpHandler);
  if (doubleClickHandler) boundElement.removeEventListener("dblclick", doubleClickHandler);
  if (pointerMoveHandler) boundElement.removeEventListener("pointermove", pointerMoveHandler);

  boundElement.style.cursor = "";
  boundElement = null;
  pointerUpHandler = null;
  doubleClickHandler = null;
  pointerMoveHandler = null;
}

export function registerTileInteractionHooks() {
  Hooks.on("canvasReady", bindCanvasElement);
  Hooks.on("canvasTearDown", unbindCanvasElement);

  if (canvas?.ready) bindCanvasElement();
}
