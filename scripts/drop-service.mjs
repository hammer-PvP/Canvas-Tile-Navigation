import {
  MODULE_ID,
  DISPLAY_MODES,
  VISIBILITY,
  ICON_PATHS,
  MISSING_SCENE_ICON
} from "./constants.mjs";
import { getCreationDefaults } from "./settings.mjs";

let bound = false;
let dropHandler = null;

function isCanvasTarget(event) {
  const path = event.composedPath?.() ?? [];
  const rendererCanvas = canvas?.app?.canvas ?? canvas?.app?.view ?? null;

  if (rendererCanvas && path.includes(rendererCanvas)) return true;
  return path.some((node) => node instanceof HTMLElement && node.id === "board");
}

function getDragData(event) {
  try {
    return foundry.applications.ux.TextEditor.implementation.getDragEventData(event) ?? {};
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not parse drag data`, error);
    return {};
  }
}

function isSceneDrag(data) {
  return data?.type === "Scene"
    || data?.documentName === "Scene"
    || (typeof data?.uuid === "string" && data.uuid.startsWith("Scene."));
}

async function resolveDroppedScene(data) {
  try {
    const document = await Scene.implementation.fromDropData(data);
    if (document?.documentName === "Scene") return document;
  } catch (_error) {
    // Fall through to simple world-Scene resolution.
  }

  const uuid = data?.uuid;
  if (typeof uuid === "string" && uuid.startsWith("Scene.")) {
    const id = uuid.slice("Scene.".length).split(".")[0];
    return game.scenes.get(id) ?? null;
  }

  const id = data?.id ?? data?._id;
  return id ? game.scenes.get(id) ?? null : null;
}

function getTexture(scene, displayMode, icon) {
  if (displayMode === DISPLAY_MODES.ICON) {
    return ICON_PATHS[icon] ?? ICON_PATHS.arrow;
  }

  return scene.thumbnail
    ?? scene.thumb
    ?? scene.background?.src
    ?? MISSING_SCENE_ICON;
}

function getNavigationTileSize() {
  // Foundry Scenes keep a grid pixel size even when their grid type is Gridless.
  // CTN uses that native Scene scale and never stores a competing width/height default.
  const size = Number(canvas?.scene?.grid?.size ?? canvas?.grid?.size);
  return Number.isFinite(size) && size > 0 ? Math.round(size) : 100;
}

async function createNavigationTile(data, event) {
  const sourceScene = await resolveDroppedScene(data);
  if (!sourceScene) {
    ui.notifications.warn(game.i18n.localize("CTN.Notifications.SceneResolveFailed"));
    return;
  }

  if (!canvas?.ready || !canvas.scene) return;

  const defaults = getCreationDefaults();
  const size = getNavigationTileSize();
  const point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
  const x = Math.round(point.x - size / 2);
  const y = Math.round(point.y - size / 2);

  const navigation = {
    enabled: true,
    targetSceneUuid: sourceScene.uuid,
    displayMode: defaults.displayMode,
    icon: defaults.icon,
    gesture: defaults.gesture,
    visibility: defaults.visibility,
    triggerPermission: defaults.triggerPermission,
    navigationMode: defaults.navigationMode,
    label: ""
  };

  const tileData = {
    name: `CTN: ${sourceScene.name}`,
    x,
    y,
    width: size,
    height: size,
    hidden: defaults.visibility === VISIBILITY.GM,
    texture: {
      src: getTexture(sourceScene, defaults.displayMode, defaults.icon),
      ...(defaults.displayMode === DISPLAY_MODES.ICON
        ? { tint: defaults.iconTint }
        : {})
    },
    flags: {
      [MODULE_ID]: {
        navigation
      }
    }
  };

  try {
    const [created] = await canvas.scene.createEmbeddedDocuments("Tile", [tileData]);
    if (created) {
      ui.notifications.info(
        game.i18n.format("CTN.Notifications.Created", { scene: sourceScene.name })
      );
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to create navigation Tile`, error);
    ui.notifications.error(game.i18n.localize("CTN.Notifications.CreateFailed"));
  }
}

function onDropCapture(event) {
  if (!game.user?.isGM) return;
  if (event.shiftKey) return;
  if (!canvas?.ready || !isCanvasTarget(event)) return;

  const data = getDragData(event);
  if (!isSceneDrag(data)) return;

  // CTN owns normal Scene drops. Shift+drop bypasses CTN completely.
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  void createNavigationTile(data, event);
}

export function bindSceneDropCapture() {
  if (bound) return;
  bound = true;
  dropHandler = onDropCapture;
  window.addEventListener("drop", dropHandler, { capture: true });
}

export function unbindSceneDropCapture() {
  if (!bound || !dropHandler) return;
  window.removeEventListener("drop", dropHandler, { capture: true });
  bound = false;
  dropHandler = null;
}
