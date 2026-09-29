import {
  ARRIVAL_POINT_ICON,
  LABEL_DISPLAY,
  MODULE_ID,
  POINT_TYPES,
  ROUTE_MODES,
  VISIBILITY,
  TRIGGER_PERMISSION,
  NAVIGATION_MODE,
  GESTURES,
  DISPLAY_MODES,
  ICONS
} from "./constants.mjs";
import { scheduleRouteReconciliation } from "./route-service.mjs";
import { openRouteManager } from "./route-manager.mjs";

let armed = false;
let canvasElement = null;
let pointerHandler = null;
let escapeHandler = null;

function getCanvasElement() {
  return canvas?.app?.canvas ?? canvas?.app?.view ?? null;
}

function disarm() {
  armed = false;
  if (canvasElement && pointerHandler) {
    canvasElement.removeEventListener("pointerup", pointerHandler, { capture: true });
  }
  if (escapeHandler) window.removeEventListener("keydown", escapeHandler);
  canvasElement = null;
  pointerHandler = null;
  escapeHandler = null;
}

function getTileSize() {
  const size = Number(canvas?.scene?.grid?.size ?? canvas?.grid?.size);
  return Number.isFinite(size) && size > 0 ? Math.round(size) : 100;
}

async function createArrivalPoint(event) {
  if (!canvas?.ready || !canvas.scene || !game.user?.isGM) return;

  const size = getTileSize();
  const point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
  const x = Math.round(point.x - size / 2);
  const y = Math.round(point.y - size / 2);

  const navigation = {
    enabled: true,
    pointType: POINT_TYPES.ARRIVAL,
    arrivalId: foundry.utils.randomID(),
    routeId: "",
    routeIndex: 1,
    routeMode: ROUTE_MODES.ONE_WAY,
    pairedReturnLinkUuid: "",
    oneWayArrivalUuid: "",
    targetSceneUuid: "",
    displayMode: DISPLAY_MODES.ICON,
    icon: ICONS.ENTER_DOOR,
    gesture: GESTURES.DOUBLE,
    visibility: VISIBILITY.GM,
    triggerPermission: TRIGGER_PERMISSION.GM,
    navigationMode: NAVIGATION_MODE.SELF,
    label: "",
    labelDisplay: LABEL_DISPLAY.ALWAYS
  };

  const [created] = await canvas.scene.createEmbeddedDocuments("Tile", [{
    name: `CTN Arrival: ${canvas.scene.name}`,
    x,
    y,
    width: size,
    height: size,
    hidden: true,
    texture: { src: ARRIVAL_POINT_ICON },
    flags: {
      [MODULE_ID]: { navigation }
    }
  }]);

  if (created) {
    ui.notifications.info(game.i18n.localize("CTN.Notifications.ArrivalCreated"));
    scheduleRouteReconciliation();
  }
}

export function armArrivalPlacement() {
  if (!game.user?.isGM || !canvas?.ready) return;
  disarm();

  canvasElement = getCanvasElement();
  if (!(canvasElement instanceof HTMLCanvasElement)) return;

  armed = true;
  ui.notifications.info(game.i18n.localize("CTN.Notifications.ArrivalArmed"));

  pointerHandler = (event) => {
    if (!armed || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    disarm();
    void createArrivalPoint(event);
  };

  escapeHandler = (event) => {
    if (event.key !== "Escape") return;
    disarm();
    ui.notifications.info(game.i18n.localize("CTN.Notifications.ArrivalCancelled"));
  };

  canvasElement.addEventListener("pointerup", pointerHandler, { capture: true });
  window.addEventListener("keydown", escapeHandler);
}

export function registerArrivalControls() {
  Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user?.isGM || !controls.tiles?.tools) return;

    const baseOrder = Object.keys(controls.tiles.tools).length;

    controls.tiles.tools.ctnArrivalPoint = {
      name: "ctnArrivalPoint",
      title: "CTN.Controls.CreateArrival",
      icon: "fa-solid fa-location-dot",
      order: baseOrder,
      button: true,
      visible: true,
      onChange: () => armArrivalPlacement()
    };

    controls.tiles.tools.ctnCheckRoutes = {
      name: "ctnCheckRoutes",
      title: "CTN.Controls.CheckRoutes",
      icon: "fa-solid fa-list-check",
      order: baseOrder + 1,
      button: true,
      visible: true,
      onChange: () => openRouteManager()
    };
  });

  Hooks.on("canvasTearDown", disarm);
}
