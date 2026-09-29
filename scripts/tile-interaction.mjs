import {
  MODULE_ID,
  GESTURES,
  TRIGGER_PERMISSION
} from "./constants.mjs";
import { requestNavigation } from "./navigation-service.mjs";

const doubleClickState = new Map();
const DOUBLE_CLICK_MS = 350;

function getNav(tile) {
  return tile?.document?.getFlag?.(MODULE_ID, "navigation") ?? null;
}

function isEditingTiles() {
  return Boolean(game.user?.isGM && canvas?.activeLayer === canvas?.tiles);
}

function canTrigger(nav) {
  return game.user?.isGM || nav?.triggerPermission === TRIGGER_PERMISSION.EVERYONE;
}

function eventModifiers(event) {
  const native = event?.nativeEvent ?? event?.originalEvent ?? event;
  return {
    alt: Boolean(event?.altKey ?? native?.altKey),
    ctrl: Boolean(event?.ctrlKey ?? native?.ctrlKey),
    button: Number(event?.button ?? native?.button ?? 0)
  };
}

function matchesGesture(tile, nav, event) {
  const { alt, ctrl, button } = eventModifiers(event);

  switch (nav.gesture) {
    case GESTURES.MIDDLE:
      return button === 1;
    case GESTURES.ALT:
      return button === 0 && alt;
    case GESTURES.CTRL:
      return button === 0 && ctrl;
    case GESTURES.SINGLE:
      return button === 0 && !alt && !ctrl;
    case GESTURES.DOUBLE: {
      if (button !== 0 || alt || ctrl) return false;
      const now = Date.now();
      const previous = doubleClickState.get(tile.id) ?? 0;
      doubleClickState.set(tile.id, now);
      return (now - previous) <= DOUBLE_CLICK_MS;
    }
    default:
      return false;
  }
}

async function handlePointerTap(tile, event) {
  const nav = getNav(tile);
  if (!nav?.enabled) return;
  if (isEditingTiles()) return;
  if (!canTrigger(nav)) return;
  if (!matchesGesture(tile, nav, event)) return;

  event.stopPropagation?.();
  await requestNavigation(tile.document);
}

function attach(tile) {
  const nav = getNav(tile);
  if (!nav?.enabled) return;

  // Make explicitly player-visible navigation Tiles interactive even when the
  // normal Tiles layer is not an interactive layer for that user.
  tile.eventMode = "static";
  tile.cursor = canTrigger(nav) ? "pointer" : "default";

  if (tile.__ctnPointerTap) tile.off?.("pointertap", tile.__ctnPointerTap);

  tile.__ctnPointerTap = (event) => void handlePointerTap(tile, event);
  tile.on?.("pointertap", tile.__ctnPointerTap);
}

export function registerTileInteractionHooks() {
  Hooks.on("drawTile", attach);

  Hooks.on("updateTile", (document) => {
    const tile = document.object;
    if (tile) attach(tile);
  });

  Hooks.on("destroyTile", (tile) => {
    if (tile?.__ctnPointerTap) tile.off?.("pointertap", tile.__ctnPointerTap);
    doubleClickState.delete(tile?.id);
  });
}
