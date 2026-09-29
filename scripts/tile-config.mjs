import {
  MODULE_ID,
  DISPLAY_MODES,
  GESTURES,
  ICONS,
  ICON_PATHS,
  MISSING_SCENE_ICON,
  VISIBILITY,
  TRIGGER_PERMISSION,
  LABEL_DISPLAY,
  POINT_TYPES,
  ROUTE_MODES,
  ROUTE_STATUS
} from "./constants.mjs";
import {
  clearArrivalAssignment,
  getArrivalPointsForScene,
  getDisplayLabel,
  getIncomingLinkForArrival,
  getIncomingRouteCandidates,
  getReverseCandidates,
  getRouteStatus,
  isArrivalPoint,
  navData,
  resolveScene,
  resolveTile,
  setOneWay,
  statusLabel
} from "./route-service.mjs";

const escapeHTML = (value) => foundry.utils.escapeHTML(String(value ?? ""));

function option(value, label, current) {
  return `<option value="${escapeHTML(value)}"${value === current ? " selected" : ""}>${escapeHTML(label)}</option>`;
}

function localized(key) {
  return game.i18n.localize(key);
}

function sceneOptions(currentUuid) {
  return [...game.scenes]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((scene) => option(scene.uuid, scene.name, currentUuid))
    .join("");
}

function statusHTML(tile) {
  const status = getRouteStatus(tile);
  const css = status === ROUTE_STATUS.BROKEN
    ? "broken"
    : [ROUTE_STATUS.UNLINKED, ROUTE_STATUS.AMBIGUOUS, ROUTE_STATUS.UNUSED_ARRIVAL].includes(status)
      ? "warning"
      : "ok";
  return `<span class="ctn-route-status ${css}">${escapeHTML(statusLabel(status))}</span>`;
}

function arrivalConfigHTML(tile, nav) {
  const incoming = getIncomingLinkForArrival(tile);
  const candidates = getIncomingRouteCandidates(tile);
  const incomingOptions = [
    `<option value="">${escapeHTML(localized("CTN.TileConfig.NoIncomingRoute"))}</option>`,
    ...candidates.map((link) => option(
      link.uuid,
      `${link.parent?.name ?? ""} → ${getDisplayLabel(link)}`,
      incoming?.uuid ?? ""
    ))
  ].join("");

  return `
    <fieldset class="ctn-config" data-ctn-arrival-config>
      <legend><i class="fa-solid fa-location-dot"></i> ${escapeHTML(localized("CTN.TileConfig.ArrivalTitle"))}</legend>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.PointType"))}</label>
        <div class="form-fields"><span>${escapeHTML(localized("CTN.TileConfig.OneWayArrivalPoint"))}</span></div>
      </div>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.IncomingRoute"))}</label>
        <div class="form-fields">
          <select data-ctn-incoming-route>${incomingOptions}</select>
        </div>
      </div>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.RouteStatus"))}</label>
        <div class="form-fields">${statusHTML(tile)}</div>
      </div>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.Label"))}</label>
        <div class="form-fields">
          <input type="text" name="flags.${MODULE_ID}.navigation.label" value="${escapeHTML(nav.label)}"
                 placeholder="${escapeHTML(localized("CTN.TileConfig.ArrivalLabelPlaceholder"))}">
        </div>
      </div>
      <p class="hint">${escapeHTML(localized("CTN.TileConfig.ArrivalHint"))}</p>
    </fieldset>
  `;
}

function linkConfigHTML(tile, nav) {
  const displayOptions = [
    [DISPLAY_MODES.THUMBNAIL, localized("CTN.Settings.Choices.Thumbnail")],
    [DISPLAY_MODES.ICON, localized("CTN.Settings.Choices.Icon")]
  ].map(([v, l]) => option(v, l, nav.displayMode)).join("");

  const iconOptions = [
    [ICONS.ARROW, localized("CTN.Settings.Choices.Arrow")],
    [ICONS.ENTER_DOOR, localized("CTN.Settings.Choices.EnterDoor")],
    [ICONS.EXIT_DOOR, localized("CTN.Settings.Choices.ExitDoor")],
    [ICONS.STAIRS_UP, localized("CTN.Settings.Choices.StairsUp")],
    [ICONS.STAIRS_DOWN, localized("CTN.Settings.Choices.StairsDown")],
    [ICONS.BACK, localized("CTN.Settings.Choices.Back")]
  ].map(([v, l]) => option(v, l, nav.icon)).join("");

  const gestureOptions = [
    [GESTURES.SINGLE, localized("CTN.Settings.Choices.Single")],
    [GESTURES.DOUBLE, localized("CTN.Settings.Choices.Double")],
    [GESTURES.MIDDLE, localized("CTN.Settings.Choices.Middle")],
    [GESTURES.ALT, localized("CTN.Settings.Choices.Alt")],
    [GESTURES.CTRL, localized("CTN.Settings.Choices.Ctrl")]
  ].map(([v, l]) => option(v, l, nav.gesture)).join("");

  const visibilityOptions = [
    [VISIBILITY.GM, localized("CTN.Settings.Choices.GMOnly")],
    [VISIBILITY.EVERYONE, localized("CTN.Settings.Choices.Everyone")]
  ].map(([v, l]) => option(v, l, nav.visibility)).join("");

  const triggerOptions = [
    [TRIGGER_PERMISSION.GM, localized("CTN.Settings.Choices.GMOnly")],
    [TRIGGER_PERMISSION.EVERYONE, localized("CTN.Settings.Choices.Everyone")]
  ].map(([v, l]) => option(v, l, nav.triggerPermission)).join("");


  const labelOptions = [
    [LABEL_DISPLAY.OFF, localized("CTN.Settings.Choices.LabelOff")],
    [LABEL_DISPLAY.HOVER, localized("CTN.Settings.Choices.LabelHover")],
    [LABEL_DISPLAY.ALWAYS, localized("CTN.Settings.Choices.LabelAlways")]
  ].map(([v, l]) => option(v, l, nav.labelDisplay ?? LABEL_DISPLAY.HOVER)).join("");

  const routeMode = nav.routeMode ?? ROUTE_MODES.PAIRED;
  const routeModeOptions = [
    [ROUTE_MODES.PAIRED, localized("CTN.TileConfig.PairedRoute")],
    [ROUTE_MODES.ONE_WAY, localized("CTN.TileConfig.OneWayRoute")]
  ].map(([v, l]) => option(v, l, routeMode)).join("");

  const reverse = getReverseCandidates(tile, { includePaired: true });
  const pairOptions = [
    `<option value="">${escapeHTML(localized("CTN.TileConfig.NoReturnSelected"))}</option>`,
    ...reverse.map((candidate) => option(
      candidate.uuid,
      `${candidate.parent?.name ?? ""}: ${getDisplayLabel(candidate)}`,
      nav.pairedReturnLinkUuid
    ))
  ].join("");

  const arrivals = getArrivalPointsForScene(resolveScene(nav.targetSceneUuid));
  const arrivalOptions = [
    `<option value="">${escapeHTML(localized("CTN.TileConfig.NoArrivalSelected"))}</option>`,
    ...arrivals.map((arrival) => option(
      arrival.uuid,
      getDisplayLabel(arrival),
      nav.oneWayArrivalUuid
    ))
  ].join("");

  return `
    <fieldset class="ctn-config" data-ctn-link-config>
      <legend><i class="fa-solid fa-route"></i> ${escapeHTML(localized("CTN.TileConfig.Title"))}</legend>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.TargetScene"))}</label>
        <div class="form-fields">
          <select name="flags.${MODULE_ID}.navigation.targetSceneUuid">
            ${sceneOptions(nav.targetSceneUuid)}
          </select>
        </div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.AutoLabel"))}</label>
        <div class="form-fields"><span>${escapeHTML(getDisplayLabel(tile))}</span></div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.RouteStatus"))}</label>
        <div class="form-fields">${statusHTML(tile)}</div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.RouteMode"))}</label>
        <div class="form-fields">
          <select data-ctn-route-mode name="flags.${MODULE_ID}.navigation.routeMode">${routeModeOptions}</select>
        </div>
      </div>

      <div class="form-group ctn-paired-fields">
        <label>${escapeHTML(localized("CTN.TileConfig.ReturnLink"))}</label>
        <div class="form-fields">
          <select name="flags.${MODULE_ID}.navigation.pairedReturnLinkUuid">${pairOptions}</select>
        </div>
      </div>

      <div class="form-group ctn-one-way-fields">
        <label>${escapeHTML(localized("CTN.TileConfig.OneWayArrival"))}</label>
        <div class="form-fields">
          <select name="flags.${MODULE_ID}.navigation.oneWayArrivalUuid">${arrivalOptions}</select>
        </div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.DisplayMode"))}</label>
        <div class="form-fields">
          <select name="flags.${MODULE_ID}.navigation.displayMode">${displayOptions}</select>
        </div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.Icon"))}</label>
        <div class="form-fields">
          <select name="flags.${MODULE_ID}.navigation.icon">${iconOptions}</select>
        </div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.Label"))}</label>
        <div class="form-fields">
          <input type="text" name="flags.${MODULE_ID}.navigation.label" value="${escapeHTML(nav.label)}"
                 placeholder="${escapeHTML(localized("CTN.TileConfig.LabelPlaceholder"))}">
        </div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.LabelDisplay"))}</label>
        <div class="form-fields">
          <select name="flags.${MODULE_ID}.navigation.labelDisplay">${labelOptions}</select>
        </div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.Gesture"))}</label>
        <div class="form-fields">
          <select name="flags.${MODULE_ID}.navigation.gesture">${gestureOptions}</select>
        </div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.Visibility"))}</label>
        <div class="form-fields">
          <select name="flags.${MODULE_ID}.navigation.visibility">${visibilityOptions}</select>
        </div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.TriggerPermission"))}</label>
        <div class="form-fields">
          <select name="flags.${MODULE_ID}.navigation.triggerPermission">${triggerOptions}</select>
        </div>
      </div>


      <p class="hint">${escapeHTML(localized("CTN.TileConfig.PlayerRangeHint"))}</p>
      <p class="hint">${escapeHTML(localized("CTN.TileConfig.PreviewHint"))}</p>
      <p class="hint ctn-bypass-hint">${escapeHTML(localized("CTN.TileConfig.BypassHint"))}</p>
    </fieldset>
  `;
}

function getSubmittedValue(changes, path, fallback) {
  if (Object.prototype.hasOwnProperty.call(changes, path)) return changes[path];
  const value = foundry.utils.getProperty(changes, path);
  return value === undefined ? fallback : value;
}

function hasSubmittedValue(changes, path) {
  return Object.prototype.hasOwnProperty.call(changes, path)
    || foundry.utils.getProperty(changes, path) !== undefined;
}

function textureFor(config) {
  if (config.displayMode === DISPLAY_MODES.ICON) {
    return ICON_PATHS[config.icon] ?? ICON_PATHS.arrow;
  }
  const target = resolveScene(config.targetSceneUuid);
  return target?.thumbnail
    ?? target?.thumb
    ?? target?.background?.src
    ?? MISSING_SCENE_ICON;
}

function wireRouteModeVisibility(container) {
  const select = container.querySelector("[data-ctn-route-mode]");
  if (!select) return;

  const refresh = () => {
    const oneWay = select.value === ROUTE_MODES.ONE_WAY;
    container.querySelectorAll(".ctn-paired-fields").forEach((el) => el.hidden = oneWay);
    container.querySelectorAll(".ctn-one-way-fields").forEach((el) => el.hidden = !oneWay);
  };

  select.addEventListener("change", refresh);
  refresh();
}

function wireIncomingRoute(container, arrivalTile) {
  const select = container.querySelector("[data-ctn-incoming-route]");
  if (!select) return;

  select.addEventListener("change", async () => {
    const link = resolveTile(select.value);
    if (!link) {
      await clearArrivalAssignment(arrivalTile);
      return;
    }

    await setOneWay(link, arrivalTile);
  });
}

export function registerTileConfigHooks() {
  Hooks.on("renderApplicationV2", (application, element) => {
    const TileConfig = foundry.applications.sheets.TileConfig;
    if (!(application instanceof TileConfig)) return;

    const tile = application.document;
    const nav = navData(tile);
    if (!nav?.enabled) return;

    const form = element.matches?.("form") ? element : element.querySelector("form");
    if (!form || form.querySelector(".ctn-config")) return;

    const html = isArrivalPoint(tile)
      ? arrivalConfigHTML(tile, nav)
      : linkConfigHTML(tile, nav);

    const appearanceCandidates = [...form.querySelectorAll('[data-tab="appearance"]')];
    const appearancePanel = appearanceCandidates.find((candidate) => {
      if (candidate.matches("a, button, [role='tab']")) return false;
      return Boolean(candidate.querySelector("input, select, .form-group"));
    });

    const host = appearancePanel
      ?? [...form.querySelectorAll(".tab, [data-tab]")].find((candidate) => {
        if (candidate.matches("a, button, [role='tab']")) return false;
        return Boolean(candidate.querySelector("input, select, .form-group"));
      });

    if (!host) return;
    host.insertAdjacentHTML("beforeend", html);
    wireRouteModeVisibility(host);
    if (isArrivalPoint(tile)) wireIncomingRoute(host, tile);
  });

  Hooks.on("preUpdateTile", (tile, changes) => {
    const current = navData(tile);
    if (!current?.enabled) return;

    if (isArrivalPoint(tile)) {
      changes.hidden = true;
      return;
    }

    const base = `flags.${MODULE_ID}.navigation`;
    const config = {
      targetSceneUuid: getSubmittedValue(changes, `${base}.targetSceneUuid`, current.targetSceneUuid),
      displayMode: getSubmittedValue(changes, `${base}.displayMode`, current.displayMode),
      icon: getSubmittedValue(changes, `${base}.icon`, current.icon),
      visibility: getSubmittedValue(changes, `${base}.visibility`, current.visibility)
    };

    const flagChanged = [
      `${base}.targetSceneUuid`,
      `${base}.displayMode`,
      `${base}.icon`,
      `${base}.visibility`
    ].some((path) => hasSubmittedValue(changes, path));

    if (!flagChanged) return;

    changes.hidden = config.visibility === VISIBILITY.GM;
    foundry.utils.setProperty(changes, "texture.src", textureFor(config));
  });
}
