import {
  MODULE_ID,
  DISPLAY_MODES,
  GESTURES,
  ICONS,
  ICON_PATHS,
  MISSING_SCENE_ICON,
  VISIBILITY,
  TRIGGER_PERMISSION,
  NAVIGATION_MODE
} from "./constants.mjs";

const escapeHTML = (value) => foundry.utils.escapeHTML(String(value ?? ""));

function navData(tile) {
  return tile?.getFlag?.(MODULE_ID, "navigation") ?? null;
}

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

function configHTML(nav) {
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

  const navigationOptions = [
    [NAVIGATION_MODE.EVERYONE, localized("CTN.Settings.Choices.BringEveryone")],
    [NAVIGATION_MODE.SELF, localized("CTN.Settings.Choices.TriggeringUser")]
  ].map(([v, l]) => option(v, l, nav.navigationMode)).join("");

  return `
    <fieldset class="ctn-config">
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

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.NavigationMode"))}</label>
        <div class="form-fields">
          <select name="flags.${MODULE_ID}.navigation.navigationMode">${navigationOptions}</select>
        </div>
      </div>

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

function resolveTargetScene(uuid) {
  const document = foundry.utils.fromUuidSync(uuid);
  return document?.documentName === "Scene" ? document : null;
}

function textureFor(config) {
  if (config.displayMode === DISPLAY_MODES.ICON) {
    return ICON_PATHS[config.icon] ?? ICON_PATHS.arrow;
  }
  const target = resolveTargetScene(config.targetSceneUuid);
  return target?.thumbnail
    ?? target?.thumb
    ?? target?.background?.src
    ?? MISSING_SCENE_ICON;
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

    const footer = form.querySelector("footer");
    if (footer) footer.insertAdjacentHTML("beforebegin", configHTML(nav));
    else form.insertAdjacentHTML("beforeend", configHTML(nav));
  });

  Hooks.on("preUpdateTile", (tile, changes) => {
    const current = navData(tile);
    if (!current?.enabled) return;

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
