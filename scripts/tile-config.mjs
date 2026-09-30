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
  ROUTE_STATUS,
  TRIGGER_AFTER,
  TRIGGER_CONDITIONS,
  TRIGGER_INITIAL_VISIBILITY,
  TRIGGER_PAUSE,
  TRIGGER_REVEAL
} from "./constants.mjs";
import {
  allLinks,
  clearArrivalAssignment,
  getArrivalPointsForScene,
  getDisplayLabel,
  getIncomingRouteCandidates,
  getIncomingSourcesForArrival,
  getReverseCandidates,
  getRouteStatus,
  isArrivalPoint,
  navData,
  resolveScene,
  resolveTile,
  setOneWay,
  statusLabel
} from "./route-service.mjs";
import {
  getTriggerDamageComponents,
  isTriggerTile,
  triggerData
} from "./trigger-service.mjs";
import { abilityChoices, damageTypeChoices, supportsTriggerRules } from "./trigger-adapter.mjs";

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


function booleanOptions(current) {
  return [
    ["false", localized("CTN.Trigger.No")],
    ["true", localized("CTN.Trigger.Yes")]
  ].map(([value, label]) => option(value, label, String(Boolean(current)))).join("");
}

function triggerArrivalCandidates(sceneUuid) {
  const scene = resolveScene(sceneUuid);
  if (!scene) return [];
  const arrivals = getArrivalPointsForScene(scene).map((tile) => ({
    uuid: tile.uuid,
    label: getDisplayLabel(tile)
  }));
  const links = allLinks()
    .filter((tile) => tile.parent?.id === scene.id)
    .map((tile) => ({ uuid: tile.uuid, label: getDisplayLabel(tile) }));
  return [...arrivals, ...links]
    .sort((a, b) => a.label.localeCompare(b.label));
}

function triggerArrivalOptions(sceneUuid, currentUuid) {
  return [
    `<option value="">${escapeHTML(localized("CTN.Trigger.NoArrival"))}</option>`,
    ...triggerArrivalCandidates(sceneUuid).map((entry) => option(entry.uuid, entry.label, currentUuid))
  ].join("");
}

function damageRowsHTML(components) {
  const damageChoices = damageTypeChoices();
  const rows = components.length ? components : [{ formula: "", type: damageChoices[0]?.id ?? "" }];
  return rows.map((component) => {
    const typeOptions = damageChoices.map((entry) => option(entry.id, entry.label, component.type)).join("");
    return `
      <div class="ctn-trigger-damage-row">
        <input type="text" data-ctn-damage-formula value="${escapeHTML(component.formula)}" placeholder="2d6">
        <select data-ctn-damage-type>${typeOptions}</select>
        <button type="button" data-ctn-damage-remove title="${escapeHTML(localized("CTN.Trigger.RemoveDamage"))}"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
  }).join("");
}

function triggerConfigHTML(tile, data) {
  const supported = supportsTriggerRules();
  const abilities = abilityChoices();
  const components = getTriggerDamageComponents(data);
  const damageJSON = JSON.stringify(components);

  const initialVisibility = [
    [TRIGGER_INITIAL_VISIBILITY.HIDDEN, localized("CTN.Trigger.Hidden")],
    [TRIGGER_INITIAL_VISIBILITY.VISIBLE, localized("CTN.Trigger.Visible")]
  ].map(([value, label]) => option(value, label, data.initialVisibility)).join("");

  const pauseOptions = [
    [TRIGGER_PAUSE.NEVER, localized("CTN.Trigger.PauseNever")],
    [TRIGGER_PAUSE.ON_TRIGGER, localized("CTN.Trigger.PauseOnTrigger")]
  ].map(([value, label]) => option(value, label, data.pauseMode)).join("");

  const abilityOptions = abilities.map((entry) => option(entry.id, entry.label, data.saveAbility)).join("");
  const damageConditions = [
    [TRIGGER_CONDITIONS.ALWAYS, localized("CTN.Trigger.ConditionAlways")],
    [TRIGGER_CONDITIONS.FAILED_SAVE, localized("CTN.Trigger.ConditionFailed")],
    [TRIGGER_CONDITIONS.SUCCESSFUL_SAVE, localized("CTN.Trigger.ConditionSuccess")],
    [TRIGGER_CONDITIONS.HALF_ON_SUCCESS, localized("CTN.Trigger.ConditionHalf")]
  ].map(([value, label]) => option(value, label, data.damageCondition)).join("");

  const transitionConditions = [
    [TRIGGER_CONDITIONS.ALWAYS, localized("CTN.Trigger.ConditionAlways")],
    [TRIGGER_CONDITIONS.FAILED_SAVE, localized("CTN.Trigger.ConditionFailed")],
    [TRIGGER_CONDITIONS.SUCCESSFUL_SAVE, localized("CTN.Trigger.ConditionSuccess")]
  ].map(([value, label]) => option(value, label, data.transitionCondition)).join("");

  const revealOptions = [
    [TRIGGER_REVEAL.NEVER, localized("CTN.Trigger.RevealNever")],
    [TRIGGER_REVEAL.ON_TRIGGER, localized("CTN.Trigger.RevealOnTrigger")],
    [TRIGGER_REVEAL.FAILED_SAVE, localized("CTN.Trigger.RevealFailed")],
    [TRIGGER_REVEAL.SUCCESSFUL_SAVE, localized("CTN.Trigger.RevealSuccess")]
  ].map(([value, label]) => option(value, label, data.revealCondition)).join("");

  const afterOptions = [
    [TRIGGER_AFTER.DISABLE, localized("CTN.Trigger.AfterDisable")],
    [TRIGGER_AFTER.REMAIN_VISIBLE, localized("CTN.Trigger.AfterVisible")],
    [TRIGGER_AFTER.DIRECT_TRANSITION, localized("CTN.Trigger.AfterDirectTransition")],
    [TRIGGER_AFTER.PERSISTENT_DAMAGE, localized("CTN.Trigger.AfterPersistentDamage")],
    [TRIGGER_AFTER.REARM_WHEN_EMPTY, localized("CTN.Trigger.AfterRearmEmpty")],
    [TRIGGER_AFTER.REMAIN_ACTIVE_TRAP, localized("CTN.Trigger.AfterRemainActive")]
  ].map(([value, label]) => option(value, label, data.afterTrigger)).join("");

  return `
    <fieldset class="ctn-config ctn-trigger-config" data-ctn-trigger-config>
      <legend><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHTML(localized("CTN.Trigger.ConfigTitle"))}</legend>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Trigger.State"))}</label>
        <div class="form-fields"><span class="ctn-route-status ok">${escapeHTML(String(data.state).toUpperCase())}</span>
          <button type="button" data-ctn-trigger-reset><i class="fa-solid fa-rotate-left"></i> ${escapeHTML(localized("CTN.Trigger.Reset"))}</button>
        </div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.Label"))}</label>
        <div class="form-fields"><input type="text" name="flags.${MODULE_ID}.trigger.label" value="${escapeHTML(data.label)}"></div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Trigger.InitialVisibility"))}</label>
        <div class="form-fields"><select name="flags.${MODULE_ID}.trigger.initialVisibility">${initialVisibility}</select></div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Trigger.PauseMovement"))}</label>
        <div class="form-fields"><select name="flags.${MODULE_ID}.trigger.pauseMode">${pauseOptions}</select></div>
      </div>

      <hr>
      <h4>${escapeHTML(localized("CTN.Trigger.Save"))}</h4>
      ${supported ? "" : `<p class="hint warning">${escapeHTML(localized("CTN.Trigger.SystemRuleUnsupportedHint"))}</p>`}
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Trigger.SaveRequired"))}</label>
        <div class="form-fields"><select name="flags.${MODULE_ID}.trigger.saveEnabled">${booleanOptions(data.saveEnabled)}</select></div>
      </div>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Trigger.Ability"))}</label>
        <div class="form-fields"><select name="flags.${MODULE_ID}.trigger.saveAbility" ${supported ? "" : "disabled"}>${abilityOptions}</select></div>
      </div>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Trigger.DC"))}</label>
        <div class="form-fields"><input type="number" min="1" step="1" name="flags.${MODULE_ID}.trigger.saveDC" value="${Number(data.saveDC) || 10}"></div>
      </div>

      <hr>
      <h4>${escapeHTML(localized("CTN.Trigger.Damage"))}</h4>
      <input type="hidden" data-ctn-damage-json name="flags.${MODULE_ID}.trigger.damageComponents" value="${escapeHTML(damageJSON)}">
      <div data-ctn-damage-list>${damageRowsHTML(components)}</div>
      <button type="button" data-ctn-damage-add><i class="fa-solid fa-plus"></i> ${escapeHTML(localized("CTN.Trigger.AddDamage"))}</button>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Trigger.DamageCondition"))}</label>
        <div class="form-fields"><select name="flags.${MODULE_ID}.trigger.damageCondition">${damageConditions}</select></div>
      </div>

      <hr>
      <h4>${escapeHTML(localized("CTN.Trigger.Transition"))}</h4>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.TargetScene"))}</label>
        <div class="form-fields">
          <select data-ctn-trigger-scene name="flags.${MODULE_ID}.trigger.transitionSceneUuid">
            <option value="">${escapeHTML(localized("CTN.Trigger.NoTransition"))}</option>
            ${sceneOptions(data.transitionSceneUuid)}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Trigger.Arrival"))}</label>
        <div class="form-fields"><select data-ctn-trigger-arrival name="flags.${MODULE_ID}.trigger.transitionArrivalUuid">${triggerArrivalOptions(data.transitionSceneUuid, data.transitionArrivalUuid)}</select></div>
      </div>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Trigger.TransitionCondition"))}</label>
        <div class="form-fields"><select name="flags.${MODULE_ID}.trigger.transitionCondition">${transitionConditions}</select></div>
      </div>

      <hr>
      <h4>${escapeHTML(localized("CTN.Trigger.StateAfterTrigger"))}</h4>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Trigger.RevealTile"))}</label>
        <div class="form-fields"><select name="flags.${MODULE_ID}.trigger.revealCondition">${revealOptions}</select></div>
      </div>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Trigger.AfterTrigger"))}</label>
        <div class="form-fields"><select name="flags.${MODULE_ID}.trigger.afterTrigger">${afterOptions}</select></div>
      </div>
      <p class="hint">${escapeHTML(localized("CTN.Trigger.ImageHint"))}</p>
    </fieldset>
  `;
}

function arrivalConfigHTML(tile, nav) {
  const sources = getIncomingSourcesForArrival(tile);
  const candidates = getIncomingRouteCandidates(tile);
  const incomingOptions = [
    `<option value="">${escapeHTML(localized("CTN.TileConfig.AddIncomingRoute"))}</option>`,
    ...candidates.map((link) => option(
      link.uuid,
      `${link.parent?.name ?? ""} → ${getDisplayLabel(link)}`,
      ""
    ))
  ].join("");

  const sourcesHTML = sources.length
    ? `<div class="ctn-incoming-sources">${sources.map((source) => {
        const typeKey = source.type === "trigger"
          ? "CTN.TileConfig.SourceTrigger"
          : "CTN.TileConfig.SourceNavigation";
        return `<div><strong>${escapeHTML(localized(typeKey))}:</strong> ${escapeHTML(source.sourceScene)} — ${escapeHTML(source.label)}</div>`;
      }).join("")}</div>`
    : `<span class="hint">${escapeHTML(localized("CTN.TileConfig.NoIncomingSources"))}</span>`;

  return `
    <fieldset class="ctn-config" data-ctn-arrival-config>
      <legend><i class="fa-solid fa-location-dot"></i> ${escapeHTML(localized("CTN.TileConfig.ArrivalTitle"))}</legend>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.PointType"))}</label>
        <div class="form-fields"><span>${escapeHTML(localized("CTN.TileConfig.OneWayArrivalPoint"))}</span></div>
      </div>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.IncomingSources"))}</label>
        <div class="form-fields">${sourcesHTML}</div>
      </div>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.AddIncomingRouteLabel"))}</label>
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
      <p class="hint">${escapeHTML(localized("CTN.TileConfig.ArrivalAreaHint"))}</p>
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
      <p class="hint">${escapeHTML(localized("CTN.TileConfig.ArrivalAreaHint"))}</p>
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
    if (!link) return;
    await setOneWay(link, arrivalTile);
    select.value = "";
  });
}


function wireTriggerConfig(container, tile) {
  const root = container.querySelector("[data-ctn-trigger-config]");
  if (!root) return;

  root.querySelector("[data-ctn-trigger-reset]")?.addEventListener("click", async () => {
    const data = triggerData(tile);
    if (!data) return;
    await tile.update({
      hidden: data.initialVisibility === TRIGGER_INITIAL_VISIBILITY.HIDDEN,
      [`flags.${MODULE_ID}.trigger.state`]: "armed"
    }, { ctnTriggerState: true });
  });

  const list = root.querySelector("[data-ctn-damage-list]");
  const hidden = root.querySelector("[data-ctn-damage-json]");

  const syncDamage = () => {
    if (!list || !hidden) return;
    const components = [...list.querySelectorAll(".ctn-trigger-damage-row")]
      .map((row) => ({
        formula: row.querySelector("[data-ctn-damage-formula]")?.value?.trim?.() ?? "",
        type: row.querySelector("[data-ctn-damage-type]")?.value ?? ""
      }))
      .filter((entry) => entry.formula);
    hidden.value = JSON.stringify(components);
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const wireDamageRows = () => {
    list?.querySelectorAll("[data-ctn-damage-remove]").forEach((button) => {
      button.onclick = () => {
        button.closest(".ctn-trigger-damage-row")?.remove();
        if (list && !list.querySelector(".ctn-trigger-damage-row")) {
          list.insertAdjacentHTML("beforeend", damageRowsHTML([]));
          wireDamageRows();
        }
        syncDamage();
      };
    });
    list?.querySelectorAll("input, select").forEach((input) => {
      input.addEventListener("input", syncDamage);
      input.addEventListener("change", syncDamage);
    });
  };

  root.querySelector("[data-ctn-damage-add]")?.addEventListener("click", () => {
    list?.insertAdjacentHTML("beforeend", damageRowsHTML([]));
    wireDamageRows();
    syncDamage();
  });
  wireDamageRows();

  const sceneSelect = root.querySelector("[data-ctn-trigger-scene]");
  const arrivalSelect = root.querySelector("[data-ctn-trigger-arrival]");
  sceneSelect?.addEventListener("change", () => {
    if (!arrivalSelect) return;
    arrivalSelect.innerHTML = triggerArrivalOptions(sceneSelect.value, "");
    arrivalSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export function registerTileConfigHooks() {
  Hooks.on("renderApplicationV2", (application, element) => {
    const TileConfig = foundry.applications.sheets.TileConfig;
    if (!(application instanceof TileConfig)) return;

    const tile = application.document;
    const trigger = triggerData(tile);
    const nav = navData(tile);
    if (!trigger && !nav?.enabled) return;

    const form = element.matches?.("form") ? element : element.querySelector("form");
    if (!form || form.querySelector(".ctn-config")) return;

    const html = trigger
      ? triggerConfigHTML(tile, trigger)
      : isArrivalPoint(tile)
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
    if (trigger) wireTriggerConfig(host, tile);
    else {
      wireRouteModeVisibility(host);
      if (isArrivalPoint(tile)) wireIncomingRoute(host, tile);
    }
  });

  Hooks.on("preUpdateTile", (tile, changes) => {
    const trigger = triggerData(tile);
    if (trigger) {
      const base = `flags.${MODULE_ID}.trigger`;
      const initialVisibility = getSubmittedValue(changes, `${base}.initialVisibility`, trigger.initialVisibility);
      const state = getSubmittedValue(changes, `${base}.state`, trigger.state);
      const sceneUuid = getSubmittedValue(changes, `${base}.transitionSceneUuid`, trigger.transitionSceneUuid);
      const arrivalUuid = getSubmittedValue(changes, `${base}.transitionArrivalUuid`, trigger.transitionArrivalUuid);
      const arrival = resolveTile(arrivalUuid);

      if (hasSubmittedValue(changes, `${base}.initialVisibility`) && state === "armed") {
        changes.hidden = initialVisibility === TRIGGER_INITIAL_VISIBILITY.HIDDEN;
      }

      if (hasSubmittedValue(changes, `${base}.transitionSceneUuid`)
          && arrival && arrival.parent?.uuid !== sceneUuid) {
        foundry.utils.setProperty(changes, `${base}.transitionArrivalUuid`, "");
      }
      return;
    }

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
