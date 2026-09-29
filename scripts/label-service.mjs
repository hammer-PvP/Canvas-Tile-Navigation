import {
  MODULE_ID,
  HOVER_HOOK,
  LABEL_DISPLAY,
  POINT_TYPES,
  ROUTE_STATUS,
  ROUTES_CHANGED_HOOK,
  VISIBILITY
} from "./constants.mjs";
import {
  getDisplayLabel,
  getRouteStatus,
  isArrivalPoint,
  navData,
  statusLabel
} from "./route-service.mjs";

let root = null;
let hoveredTileUuid = null;
let renderFrame = null;

function ensureRoot() {
  if (root?.isConnected) return root;
  root = document.createElement("div");
  root.id = "ctn-canvas-labels";
  document.body.append(root);
  return root;
}

function clearRoot() {
  root?.remove();
  root = null;
}

function visibleToCurrentUser(tile, nav) {
  if (game.user?.isGM) return true;
  return nav?.visibility === VISIBILITY.EVERYONE && !tile.hidden && !isArrivalPoint(tile);
}

function hasDiagnostic(status) {
  return [
    ROUTE_STATUS.UNLINKED,
    ROUTE_STATUS.AMBIGUOUS,
    ROUTE_STATUS.BROKEN,
    ROUTE_STATUS.UNUSED_ARRIVAL
  ].includes(status);
}

function shouldShow(tile, nav, status) {
  if (!visibleToCurrentUser(tile, nav)) return false;

  if (game.user?.isGM && (isArrivalPoint(tile) || hasDiagnostic(status))) return true;

  const display = nav?.labelDisplay
    ?? game.settings.get(MODULE_ID, "defaultLabelDisplay")
    ?? LABEL_DISPLAY.HOVER;

  if (display === LABEL_DISPLAY.ALWAYS) return true;
  if (display === LABEL_DISPLAY.HOVER) return hoveredTileUuid === tile.uuid;
  return false;
}

function statusClass(status) {
  if (status === ROUTE_STATUS.BROKEN) return "broken";
  if ([ROUTE_STATUS.UNLINKED, ROUTE_STATUS.AMBIGUOUS, ROUTE_STATUS.UNUSED_ARRIVAL].includes(status)) {
    return "warning";
  }
  if (status === ROUTE_STATUS.ONE_WAY) return "one-way";
  return "ok";
}

function clientPosition(tile) {
  const center = tile.shape?.center ?? { x: tile.x, y: tile.y };
  const bounds = tile.shape?.bounds;
  const canvasPoint = {
    x: Number(center.x) || 0,
    y: bounds ? (Number(bounds.y) + Number(bounds.height)) : (Number(center.y) || 0)
  };
  return canvas.clientCoordinatesFromCanvas(canvasPoint);
}

function renderNow() {
  renderFrame = null;
  const layer = ensureRoot();
  layer.replaceChildren();

  if (!canvas?.ready || !canvas.scene) return;

  for (const tile of canvas.scene.tiles) {
    const nav = navData(tile);
    if (!nav?.enabled) continue;

    const status = getRouteStatus(tile);
    if (!shouldShow(tile, nav, status)) continue;

    const pos = clientPosition(tile);
    const label = document.createElement("div");
    label.className = "ctn-canvas-label";
    label.style.left = `${Math.round(pos.x)}px`;
    label.style.top = `${Math.round(pos.y + 6)}px`;

    const title = document.createElement("div");
    title.className = "ctn-canvas-label__title";
    title.textContent = getDisplayLabel(tile);
    label.append(title);

    if (game.user?.isGM && hasDiagnostic(status)) {
      const diagnostic = document.createElement("div");
      diagnostic.className = `ctn-canvas-label__status ${statusClass(status)}`;
      diagnostic.textContent = `⚠ ${statusLabel(status).toUpperCase()}`;
      label.append(diagnostic);
    } else if (game.user?.isGM && isArrivalPoint(tile)) {
      const diagnostic = document.createElement("div");
      diagnostic.className = `ctn-canvas-label__status ${statusClass(status)}`;
      diagnostic.textContent = status === ROUTE_STATUS.ONE_WAY
        ? game.i18n.localize("CTN.Arrival.LinkedBadge")
        : `⚠ ${statusLabel(status).toUpperCase()}`;
      label.append(diagnostic);
    }

    layer.append(label);
  }
}

export function scheduleLabelRender() {
  if (renderFrame !== null) return;
  renderFrame = requestAnimationFrame(renderNow);
}

export function registerLabelHooks() {
  Hooks.on("canvasReady", scheduleLabelRender);
  Hooks.on("canvasPan", scheduleLabelRender);
  Hooks.on("canvasTearDown", clearRoot);
  Hooks.on("createTile", scheduleLabelRender);
  Hooks.on("updateTile", scheduleLabelRender);
  Hooks.on("deleteTile", scheduleLabelRender);
  Hooks.on(ROUTES_CHANGED_HOOK, scheduleLabelRender);

  Hooks.on(HOVER_HOOK, (tile) => {
    hoveredTileUuid = tile?.uuid ?? null;
    scheduleLabelRender();
  });

  window.addEventListener("resize", scheduleLabelRender);
}
