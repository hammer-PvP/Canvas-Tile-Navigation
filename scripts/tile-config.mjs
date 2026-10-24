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
  TRIGGER_REVEAL,
  TRIGGER_SAVE_STATES,
  TRANSITION_ACTIVATIONS,
  TRANSITION_STATUS
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
import {
  disconnectTransition,
  isTransitionNameAvailable,
  transitionCandidates,
  transitionData,
  transitionStatus,
  transitionStatusLabel
} from "./transition-service.mjs";
import { openDefaultAssetImagePicker } from "./asset-folder.mjs";
import { fxConfigHTML, wireFXConfig } from "./fx-config.mjs";
import { stopTileFX } from "./seqfx.mjs";
import { linkedData, linkedIsActive, linkedSourceCandidates, setLinkedActive } from "./linked-activation.mjs";
import { effectAreaIsActive, setEffectAreaActive } from "./effect-area-state.mjs";

const escapeHTML = (value) => foundry.utils.escapeHTML(String(value ?? ""));

function option(value, label, current) {
  return `<option value="${escapeHTML(value)}"${value === current ? " selected" : ""}>${escapeHTML(label)}</option>`;
}

function localized(key) {
  return game.i18n.localize(key);
}

function tileImageConfigHTML(tile) {
  return `
    <fieldset class="ctn-config ctn-asset-config" data-ctn-asset-config>
      <legend><i class="fa-solid fa-image"></i> ${escapeHTML(localized("CTN.AssetFolder.TileImage"))}</legend>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.AssetFolder.TileImage"))}</label>
        <div class="form-fields ctn-asset-image-fields">
          <input type="text" data-ctn-tile-image value="${escapeHTML(tile.texture?.src ?? "")}">
          <button type="button" data-ctn-tile-image-browse title="${escapeHTML(localized("CTN.AssetFolder.BrowseImage"))}"><i class="fa-solid fa-folder-open"></i></button>
        </div>
      </div>
      <p class="hint">${escapeHTML(localized("CTN.AssetFolder.TileImageHint"))}</p>
    </fieldset>
  `;
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
  const components = getTriggerDamageComponents(data, { includeDisabled: true });
  const damageJSON = JSON.stringify(components);
  const base = `flags.${MODULE_ID}.trigger`;
  const onEffect = (name, checked) => `<label class="ctn-trigger-area-choice">
    <input type="hidden" data-ctn-area-value="${name}" name="${base}.${name}" value="${checked ? 'true' : 'false'}">
    <input type="checkbox" data-ctn-area-toggle="${name}" ${checked ? 'checked' : ''}>
    ${escapeHTML(localized('CTN.Trigger.OnEffectArea'))}</label>`;
  const toggle = (name, enabled, caption) => `
    <div class="ctn-trigger-toggle-row">
      <label class="ctn-trigger-toggle"><input type="hidden" data-ctn-trigger-toggle-value="${name}" name="${base}.${name}" value="${enabled ? "true" : "false"}">
        <input type="checkbox" data-ctn-trigger-toggle="${name}" ${enabled ? "checked" : ""}> <strong>${escapeHTML(caption)}</strong>
      </label>
    </div>`;
  const initialVisibility = [
    [TRIGGER_INITIAL_VISIBILITY.HIDDEN, localized("CTN.Trigger.Hidden")],
    [TRIGGER_INITIAL_VISIBILITY.VISIBLE, localized("CTN.Trigger.Visible")]
  ].map(([value, label]) => option(value, label, data.initialVisibility)).join("");
  const abilityOptions = abilityChoices()
    .map((entry) => option(entry.id, entry.label, data.saveAbility)).join("");
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
    [TRIGGER_REVEAL.ON_TRIGGER, localized("CTN.Trigger.RevealOnTrigger")],
    [TRIGGER_REVEAL.FAILED_SAVE, localized("CTN.Trigger.RevealFailed")],
    [TRIGGER_REVEAL.SUCCESSFUL_SAVE, localized("CTN.Trigger.RevealSuccess")]
  ].map(([value, label]) => option(value, label, data.revealCondition)).join("");
  const hazardSaveOptions = [
    ["true", localized("CTN.Trigger.PersistentHazardSaveOff")],
    ["false", localized("CTN.Trigger.PersistentHazardSaveKeep")]
  ].map(([value, label]) => option(value, label, String(Boolean(data.disableSaveOnPersistentHazard)))).join("");
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
      <div class="form-group ctn-effect-area-state">
        <label>${escapeHTML(localized("CTN.Trigger.EffectState"))}</label>
        <div class="form-fields"><span class="ctn-route-status ${effectAreaIsActive(tile) ? 'ok' : 'warning'}">${escapeHTML(localized(effectAreaIsActive(tile) ? 'CTN.Linked.Active' : 'CTN.Linked.Inactive'))}</span>
          <button type="button" data-ctn-effect-toggle-state>${escapeHTML(localized(effectAreaIsActive(tile) ? 'CTN.Trigger.CloseArea' : 'CTN.Trigger.OpenArea'))}</button>
        </div>
      </div>
      ${linkedConfigHTML(tile, { inline: true })}
      <div class="form-group">
        <label>${escapeHTML(localized('CTN.Trigger.ActivationMode'))}</label>
        <div class="form-fields"><select name="${base}.activationMode">
          ${option('enter', localized('CTN.Trigger.Enter'), data.activationMode ?? 'enter')}
          ${option('double', localized('CTN.Trigger.DoubleClick'), data.activationMode ?? 'enter')}
        </select></div>
      </div>
      <p class="hint" data-ctn-trigger-click-hidden hidden>${escapeHTML(localized('CTN.Trigger.HiddenClickHint'))}</p>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.TileConfig.Label"))}</label>
        <div class="form-fields"><input type="text" name="${base}.label" value="${escapeHTML(data.label)}"></div>
      </div>
      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Trigger.InitialVisibility"))}</label>
        <div class="form-fields"><select name="${base}.initialVisibility">${initialVisibility}</select></div>
      </div>
      <div class="ctn-trigger-toggle-row"><label class="ctn-trigger-toggle">
        <input type="hidden" data-ctn-trigger-pause-value name="${base}.pauseMode" value="${escapeHTML(data.pauseMode)}">
        <input type="checkbox" data-ctn-trigger-pause ${data.pauseMode === TRIGGER_PAUSE.ON_TRIGGER ? "checked" : ""}>
        <strong>${escapeHTML(localized("CTN.Trigger.PauseMovement"))}</strong>
      </label></div>

      <hr>
      ${toggle("saveEnabled", data.saveEnabled, localized("CTN.Trigger.EnableSave"))}
      <div class="ctn-trigger-option-body" data-ctn-trigger-section="saveEnabled" ${data.saveEnabled ? "" : "hidden"}>
        ${onEffect('saveOnEffectArea', data.saveOnEffectArea)}
        ${supported ? "" : `<p class="hint warning">${escapeHTML(localized("CTN.Trigger.SystemRuleUnsupportedHint"))}</p>`}
        <div class="form-group"><label>${escapeHTML(localized("CTN.Trigger.SaveCurrentState"))}</label>
          <div class="form-fields"><span class="ctn-route-status ${data.saveState === TRIGGER_SAVE_STATES.ON ? "ok" : "warning"}">${escapeHTML(data.saveState === TRIGGER_SAVE_STATES.ON ? localized("CTN.Trigger.StateOn") : localized("CTN.Trigger.StateOff"))}</span></div>
        </div>
        <div class="form-group"><label>${escapeHTML(localized("CTN.Trigger.Ability"))}</label>
          <div class="form-fields"><select name="${base}.saveAbility" ${supported ? "" : "disabled"}>${abilityOptions}</select></div></div>
        <div class="form-group"><label>${escapeHTML(localized("CTN.Trigger.DC"))}</label>
          <div class="form-fields"><input type="number" min="1" step="1" name="${base}.saveDC" value="${Number(data.saveDC) || 10}"></div></div>
      </div>

      <hr>
      ${toggle("damageEnabled", data.damageEnabled, localized("CTN.Trigger.EnableDamage"))}
      <input type="hidden" data-ctn-damage-json name="${base}.damageComponents" value="${escapeHTML(damageJSON)}">
      <div class="ctn-trigger-option-body" data-ctn-trigger-section="damageEnabled" ${data.damageEnabled ? "" : "hidden"}>
        ${onEffect('damageOnEffectArea', data.damageOnEffectArea)}
        <div data-ctn-damage-list>${damageRowsHTML(components)}</div>
        <button type="button" data-ctn-damage-add><i class="fa-solid fa-plus"></i> ${escapeHTML(localized("CTN.Trigger.AddDamage"))}</button>
        <p class="hint ctn-trigger-warning" data-ctn-trigger-damage-hint hidden>${escapeHTML(localized("CTN.Trigger.NeedDamage"))}</p>
        <div class="form-group" data-ctn-trigger-save-only>
          <label>${escapeHTML(localized("CTN.Trigger.DamageCondition"))}</label>
          <div class="form-fields"><select name="${base}.damageCondition">${damageConditions}</select></div>
        </div>
        <p class="hint" data-ctn-trigger-no-save>${escapeHTML(localized("CTN.Trigger.NoSaveDirect"))}</p>
      </div>

      <hr>
      ${toggle("transitionEnabled", data.transitionEnabled, localized("CTN.Trigger.EnableTransition"))}
      <div class="ctn-trigger-option-body" data-ctn-trigger-section="transitionEnabled" ${data.transitionEnabled ? "" : "hidden"}>
        ${onEffect('transitionOnEffectArea', data.transitionOnEffectArea)}
        <div class="form-group"><label>${escapeHTML(localized('CTN.Trigger.TransferMode'))}</label>
          <div class="form-fields"><select name="${base}.transitionMode">
            ${option('gm', localized('CTN.Trigger.GMConfirm'), data.transitionMode ?? 'gm')}
            ${option('automatic', localized('CTN.Trigger.Automatic'), data.transitionMode ?? 'gm')}
          </select></div></div>
        <div class="form-group"><label>${escapeHTML(localized("CTN.TileConfig.TargetScene"))}</label>
          <div class="form-fields ctn-scene-search-fields"><input type="search" data-ctn-trigger-scene-search placeholder="${escapeHTML(localized('CTN.Trigger.SearchScene'))}" autocomplete="off">
          <select data-ctn-trigger-scene name="${base}.transitionSceneUuid">
            <option value="">${escapeHTML(localized("CTN.Trigger.NoTransition"))}</option>${sceneOptions(data.transitionSceneUuid)}</select></div></div>
        <div class="form-group"><label>${escapeHTML(localized("CTN.Trigger.Arrival"))}</label>
          <div class="form-fields ctn-scene-search-fields"><input type="search" data-ctn-trigger-arrival-search placeholder="${escapeHTML(localized('CTN.Trigger.SearchArrival'))}" autocomplete="off">
          <select data-ctn-trigger-arrival name="${base}.transitionArrivalUuid">${triggerArrivalOptions(data.transitionSceneUuid, data.transitionArrivalUuid)}</select></div></div>
        <p class="hint ctn-trigger-warning" data-ctn-trigger-transition-hint hidden>${escapeHTML(localized("CTN.Trigger.NeedDestination"))}</p>
        <div class="form-group" data-ctn-trigger-save-only><label>${escapeHTML(localized("CTN.Trigger.TransitionCondition"))}</label>
          <div class="form-fields"><select name="${base}.transitionCondition">${transitionConditions}</select></div></div>
        <p class="hint" data-ctn-trigger-no-save>${escapeHTML(localized("CTN.Trigger.NoSaveDirect"))}</p>
      </div>

      <hr>
      ${toggle("revealEnabled", data.revealEnabled, localized("CTN.Trigger.EnableReveal"))}
      <div class="ctn-trigger-option-body" data-ctn-trigger-section="revealEnabled" ${data.revealEnabled ? "" : "hidden"}>
        <div class="form-group" data-ctn-trigger-save-only><label>${escapeHTML(localized("CTN.Trigger.RevealTile"))}</label>
          <div class="form-fields"><select data-ctn-trigger-reveal name="${base}.revealCondition">${revealOptions}</select></div></div>
        <p class="hint" data-ctn-trigger-no-save>${escapeHTML(localized("CTN.Trigger.RevealWithoutSave"))}</p>
      </div>

      <hr>
      <div class="form-group"><label>${escapeHTML(localized("CTN.Trigger.AfterTrigger"))}</label>
        <div class="form-fields"><select data-ctn-trigger-after name="${base}.afterTrigger">${afterOptions}</select></div></div>
      <p class="hint" data-ctn-trigger-after-hint>${escapeHTML(localized("CTN.Trigger.AfterHint"))}</p>
      <div data-ctn-trigger-hazard-save hidden>
        <div class="form-group"><label>${escapeHTML(localized("CTN.Trigger.PersistentHazardSave"))}</label>
          <div class="form-fields"><select name="${base}.disableSaveOnPersistentHazard">${hazardSaveOptions}</select></div></div>
        <p class="hint">${escapeHTML(localized("CTN.Trigger.PersistentHazardSaveHint"))}</p>
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


function transitionStatusHTML(tile) {
  const status = transitionStatus(tile);
  const css = status === TRANSITION_STATUS.BROKEN
    ? "broken"
    : status === TRANSITION_STATUS.DISCONNECTED
      ? "warning"
      : "ok";
  return `<span class="ctn-route-status ${css}">${escapeHTML(transitionStatusLabel(status))}</span>`;
}

function transitionConfigHTML(tile, data) {
  const activationOptions = [
    [TRANSITION_ACTIVATIONS.SINGLE, localized("CTN.Transition.ActivationSingle")],
    [TRANSITION_ACTIVATIONS.DOUBLE, localized("CTN.Transition.ActivationDouble")],
    [TRANSITION_ACTIVATIONS.ENTER, localized("CTN.Transition.ActivationEnter")]
  ].map(([value, label]) => option(value, label, data.activation)).join("");

  const connected = Boolean(data.connectedTileUuid);
  const candidates = transitionCandidates(tile);
  const entries = [`<option value=""${connected ? " disabled" : ""}>${escapeHTML(localized("CTN.Transition.NotConnected"))}</option>`];
  const currentResolved = candidates.some((candidate) => candidate.current);
  if (connected && !currentResolved) {
    entries.push(`<option value="${escapeHTML(data.connectedTileUuid)}" selected disabled>${escapeHTML(localized("CTN.Transition.MissingPartner"))}</option>`);
  }
  for (const candidate of candidates) {
    const statusSuffix = candidate.current
      ? localized("CTN.Transition.CurrentPartner")
      : candidate.status === TRANSITION_STATUS.CONNECTED
        ? localized("CTN.Transition.StatusConnected")
        : candidate.status === TRANSITION_STATUS.BROKEN
          ? localized("CTN.Transition.StatusBroken")
          : localized("CTN.Transition.StatusAvailable");
    const disabled = candidate.disabled ? " disabled" : "";
    const selected = candidate.current ? " selected" : "";
    entries.push(`<option value="${escapeHTML(candidate.uuid)}"${selected}${disabled}>${escapeHTML(`${candidate.label} — ${statusSuffix}`)}</option>`);
  }

  const hiddenOptions = [
    ["false", localized("CTN.Transition.Visible")],
    ["true", localized("CTN.Transition.Hidden")]
  ].map(([value, label]) => option(value, label, String(Boolean(tile.hidden)))).join("");

  return `
    <fieldset class="ctn-config ctn-transition-config" data-ctn-transition-config>
      <legend><i class="fa-solid fa-right-to-bracket"></i> ${escapeHTML(localized("CTN.Transition.ConfigTitle"))}</legend>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Transition.Name"))}</label>
        <div class="form-fields"><input type="text" data-ctn-transition-name name="flags.${MODULE_ID}.transition.name" value="${escapeHTML(data.name)}"></div>
      </div>
      <p class="hint ctn-transition-name-warning" data-ctn-transition-name-warning hidden>${escapeHTML(localized("CTN.Transition.DuplicateNameHint"))}</p>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Transition.ConnectTo"))}</label>
        <div class="form-fields">
          <select name="flags.${MODULE_ID}.transition.connectedTileUuid">${entries.join("")}</select>
          ${connected ? `<button type="button" data-ctn-transition-disconnect><i class="fa-solid fa-link-slash"></i> ${escapeHTML(localized("CTN.Transition.Disconnect"))}</button>` : ""}
        </div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Transition.Status"))}</label>
        <div class="form-fields">${transitionStatusHTML(tile)}</div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Transition.Activation"))}</label>
        <div class="form-fields"><select name="flags.${MODULE_ID}.transition.activation">${activationOptions}</select></div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Transition.Visibility"))}</label>
        <div class="form-fields"><select name="flags.${MODULE_ID}.transition.hidden">${hiddenOptions}</select></div>
      </div>

      <div class="form-group">
        <label>${escapeHTML(localized("CTN.Transition.Effect"))}</label>
        <div class="form-fields"><input type="hidden" data-ctn-transition-effect-value name="flags.${MODULE_ID}.transition.effectEnabled" value="${data.effectEnabled ? "true" : "false"}"><input type="checkbox" data-ctn-transition-effect-toggle ${data.effectEnabled ? "checked" : ""}></div>
      </div>
      <p class="hint">${escapeHTML(localized("CTN.Transition.EffectHint"))}</p>
      <p class="hint">${escapeHTML(localized("CTN.Transition.PairHint"))}</p>
    </fieldset>
  `;
}

function wireTransitionConfig(container, tile) {
  const root = container.querySelector("[data-ctn-transition-config]");
  if (!root) return;

  const input = root.querySelector("[data-ctn-transition-name]");
  const warning = root.querySelector("[data-ctn-transition-name-warning]");
  const refreshNameWarning = () => {
    if (!input || !warning) return;
    warning.hidden = isTransitionNameAvailable(tile, input.value);
  };
  input?.addEventListener("input", refreshNameWarning);
  refreshNameWarning();

  const effectToggle = root.querySelector("[data-ctn-transition-effect-toggle]");
  const effectValue = root.querySelector("[data-ctn-transition-effect-value]");
  effectToggle?.addEventListener("change", () => {
    if (!effectValue) return;
    effectValue.value = effectToggle.checked ? "true" : "false";
    effectValue.dispatchEvent(new Event("change", { bubbles: true }));
  });

  root.querySelector("[data-ctn-transition-disconnect]")?.addEventListener("click", async () => {
    await disconnectTransition(tile);
    tile.sheet?.render?.(true);
  });
}

/** Linked activation augments existing Trigger/Transition Tiles; mechanics stay in their native forms. */
function linkedConfigHTML(tile, { inline = false } = {}) {
  const data = linkedData(tile);
  const actuallyActive = linkedIsActive(tile);
  const base = `flags.${MODULE_ID}.linkedActivation`;
  const sources = linkedSourceCandidates(tile);
  const options = sources.map((other) => option(other.uuid,
    `${other.parent?.name ?? ""} — ${other.name ?? other.id}`, data.sourceTileUuid)).join("");
  const validSource = sources.some((other) => other.uuid === data.sourceTileUuid);
  const missing = data.sourceTileUuid && !validSource;
  return `<${inline ? 'div' : 'fieldset'} class="${inline ? 'ctn-linked-config ctn-linked-inline' : 'ctn-config ctn-linked-config'}" data-ctn-linked-config>
    ${inline ? '' : `<legend><i class="fa-solid fa-link"></i> ${escapeHTML(localized('CTN.Linked.Title'))}</legend>`}
    <label class="ctn-linked-toggle"><input type="hidden" data-ctn-linked-enabled-value name="${base}.enabled" value="${data.enabled ? "true" : "false"}">
      <input type="checkbox" data-ctn-linked-enabled ${data.enabled ? "checked" : ""}>
      ${escapeHTML(localized("CTN.Linked.Enable"))}</label>
    <div data-ctn-linked-body ${data.enabled ? "" : "hidden"}>
      <div class="form-group"><label>${escapeHTML(localized("CTN.Linked.Source"))}</label>
        <div class="form-fields"><select name="${base}.sourceTileUuid" data-ctn-linked-source>
          ${option("", localized("CTN.Linked.ChooseSource"), data.sourceTileUuid)}
          ${missing ? `<option selected disabled value="${escapeHTML(data.sourceTileUuid)}">${escapeHTML(localized("CTN.Linked.MissingSource"))}</option>` : ""}
          ${options}</select></div></div>
      <div class="ctn-linked-status"><span>${escapeHTML(localized("CTN.Linked.Status"))}:
        <b>${escapeHTML(localized(actuallyActive ? "CTN.Linked.Active" : "CTN.Linked.Inactive"))}</b></span>
        <button type="button" data-ctn-linked-toggle-state ${!validSource ? "disabled" : ""}>
          ${escapeHTML(localized(data.active ? "CTN.Linked.Deactivate" : "CTN.Linked.Activate"))}</button></div>
      <p class="hint">${escapeHTML(localized("CTN.Linked.Hint"))}</p>
    </div>
  </${inline ? 'div' : 'fieldset'}>`;
}

function wireLinkedConfig(container, tile) {
  const root = container.querySelector("[data-ctn-linked-config]");
  if (!root) return;
  const checkbox = root.querySelector("[data-ctn-linked-enabled]");
  const field = root.querySelector("[data-ctn-linked-enabled-value]");
  const body = root.querySelector("[data-ctn-linked-body]");
  const refresh = () => {
    field.value = checkbox.checked ? "true" : "false";
    body.hidden = !checkbox.checked;
  };
  checkbox.addEventListener("change", () => {
    refresh(); field.dispatchEvent(new Event("change", { bubbles: true }));
  });
  root.querySelector("[data-ctn-linked-toggle-state]")?.addEventListener("click", async () => {
    // State operations require the source selection to have been saved first.
    const data = linkedData(tile);
    if (!data.enabled || !data.sourceTileUuid) return;
    await setLinkedActive(tile, !data.active);
    tile.sheet?.render?.(true);
  });
  refresh();
}

function nativeTextureField(form) {
  return form.querySelector('file-picker[name="texture.src"]')
    ?? form.querySelector('input[name="texture.src"]');
}

function setTextureFieldValue(field, value) {
  if (!field) return;
  field.value = value;
  if (field.input && field.input !== field) field.input.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function wireAssetConfig(container, tile) {
  const root = container.querySelector("[data-ctn-asset-config]");
  if (!root) return;
  const input = root.querySelector("[data-ctn-tile-image]");
  const form = container.closest("form");
  const nativeField = form ? nativeTextureField(form) : null;
  if (!nativeField && input) input.name = "texture.src";

  const syncToNative = () => setTextureFieldValue(nativeField, input?.value ?? "");
  input?.addEventListener("input", syncToNative);
  input?.addEventListener("change", syncToNative);

  nativeField?.addEventListener?.("change", () => {
    if (input) input.value = nativeField.value ?? tile.texture?.src ?? "";
  });

  root.querySelector("[data-ctn-tile-image-browse]")?.addEventListener("click", async () => {
    await openDefaultAssetImagePicker({
      current: input?.value ?? tile.texture?.src ?? "",
      field: nativeField,
      callback: (path) => {
        if (input) input.value = String(path ?? "");
        setTextureFieldValue(nativeField, String(path ?? ""));
      }
    });
  });
}

function isTabControl(element) {
  return Boolean(element?.matches?.("a, button, [role='tab']"));
}

function findTabControl(form, tab) {
  return [...form.querySelectorAll(`[data-tab="${tab}"]`)].find(isTabControl) ?? null;
}

function findTabPanel(form, tab) {
  return [...form.querySelectorAll(`[data-tab="${tab}"]`)].find((candidate) => {
    if (isTabControl(candidate)) return false;
    return Boolean(candidate.querySelector("input, select, .form-group"));
  }) ?? null;
}

function injectCtnTab(application, form, html) {
  if (form.querySelector("[data-ctn-tab-panel]")) return null;
  const appearanceControl = findTabControl(form, "appearance");
  const appearancePanel = findTabPanel(form, "appearance");
  if (!appearanceControl || !appearancePanel) return null;

  const nav = appearanceControl.closest("nav, .tabs") ?? appearanceControl.parentElement;
  const panelParent = appearancePanel.parentElement;
  if (!nav || !panelParent) return null;

  const group = appearanceControl.dataset.group || appearancePanel.dataset.group || nav.dataset.group || "sheet";

  const control = appearanceControl.cloneNode(true);
  control.dataset.tab = "ctn";
  if (group) control.dataset.group = group;
  if (control.tagName === "BUTTON") control.type = "button";
  control.classList.remove("active");
  control.setAttribute("aria-selected", "false");
  control.innerHTML = `<i class="fa-solid fa-route"></i> ${escapeHTML(localized("CTN.TileConfig.Tab"))}`;
  control.setAttribute("data-ctn-tab-control", "");

  const panel = document.createElement(appearancePanel.tagName.toLowerCase());
  panel.className = appearancePanel.className;
  panel.classList.remove("active");
  panel.classList.add("ctn-tab-panel");
  panel.dataset.tab = "ctn";
  if (group) panel.dataset.group = group;
  panel.setAttribute("data-ctn-tab-panel", "");
  panel.innerHTML = html;

  nav.append(control);
  panelParent.append(panel);

  const deactivateCtn = () => {
    control.classList.remove("active");
    control.setAttribute("aria-selected", "false");
    panel.classList.remove("active");
  };

  [...nav.querySelectorAll("[data-tab]")].filter((candidate) => candidate !== control).forEach((candidate) => {
    candidate.addEventListener("click", deactivateCtn, { capture: true });
  });

  control.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    [...nav.querySelectorAll("[data-tab]")].forEach((candidate) => {
      candidate.classList.remove("active");
      candidate.setAttribute?.("aria-selected", "false");
    });
    [...panelParent.children].filter((candidate) => candidate?.dataset?.tab).forEach((candidate) => {
      candidate.classList.remove("active");
    });

    control.classList.add("active");
    control.setAttribute("aria-selected", "true");
    panel.classList.add("active");
    if (application.tabGroups) application.tabGroups[group] = "ctn";
  });

  return panel;
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
      [`flags.${MODULE_ID}.trigger.state`]: "armed",
      [`flags.${MODULE_ID}.trigger.effectActive`]: false,
      [`flags.${MODULE_ID}.trigger.saveState`]: data.saveEnabled ? TRIGGER_SAVE_STATES.ON : TRIGGER_SAVE_STATES.OFF
    }, { ctnTriggerState: true });
    await stopTileFX(tile);
    tile.sheet?.render?.(true);
  });

  root.querySelector('[data-ctn-effect-toggle-state]')?.addEventListener('click', async () => {
    const open = !effectAreaIsActive(tile);
    await setEffectAreaActive(tile, open);
    if (!open) await stopTileFX(tile);
    tile.sheet?.render?.(true);
  });
  for (const input of root.querySelectorAll('[data-ctn-area-toggle]')) {
    input.addEventListener('change', () => {
      const target = root.querySelector(`[data-ctn-area-value="${input.dataset.ctnAreaToggle}"]`);
      if (!target) return;
      target.value = input.checked ? 'true' : 'false';
      target.dispatchEvent(new Event('change', { bubbles: true }));
      root.dispatchEvent(new Event('ctn-trigger-refresh'));
    });
  }

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
        root.dispatchEvent(new Event("ctn-trigger-refresh"));
      };
    });
    list?.querySelectorAll("input, select").forEach((input) => {
      if (input.dataset.ctnDamageWired) return;
      input.dataset.ctnDamageWired = "true";
      input.addEventListener("input", syncDamage);
      input.addEventListener("change", syncDamage);
    });
  };

  root.querySelector("[data-ctn-damage-add]")?.addEventListener("click", () => {
    list?.insertAdjacentHTML("beforeend", damageRowsHTML([]));
    wireDamageRows();
    syncDamage();
    root.dispatchEvent(new Event("ctn-trigger-refresh"));
  });
  wireDamageRows();

  const sceneSelect = root.querySelector("[data-ctn-trigger-scene]");
  const arrivalSelect = root.querySelector("[data-ctn-trigger-arrival]");
  const after = root.querySelector("[data-ctn-trigger-after]");
  const pause = root.querySelector("[data-ctn-trigger-pause]");
  const pauseValue = root.querySelector("[data-ctn-trigger-pause-value]");
  const switches = Object.fromEntries([...root.querySelectorAll("[data-ctn-trigger-toggle]")]
    .map((input) => [input.dataset.ctnTriggerToggle, input]));
  let suspendedAfter = null;
  const refresh = () => {
    const clicked = root.querySelector(`[name="flags.${MODULE_ID}.trigger.activationMode"]`)?.value === 'double';
    const hiddenSource = root.querySelector(`[name="flags.${MODULE_ID}.trigger.initialVisibility"]`)?.value === TRIGGER_INITIAL_VISIBILITY.HIDDEN;
    const clickHint = root.querySelector('[data-ctn-trigger-click-hidden]');
    if (clickHint) clickHint.hidden = !(clicked && hiddenSource);
    const pauseRow = pause?.closest('.ctn-trigger-toggle-row');
    if (pauseRow) pauseRow.hidden = clicked; // Pause affects movement only.
    const enabled = (name) => Boolean(switches[name]?.checked);
    for (const [name, input] of Object.entries(switches)) {
      const value = root.querySelector(`[data-ctn-trigger-toggle-value="${name}"]`);
      if (value) {
        const next = input.checked ? "true" : "false";
        if (value.value !== next) {
          value.value = next;
          value.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      const body = root.querySelector(`[data-ctn-trigger-section="${name}"]`);
      if (body) body.hidden = !input.checked;
    }
    if (pauseValue) {
      const next = pause.checked ? TRIGGER_PAUSE.ON_TRIGGER : TRIGGER_PAUSE.NEVER;
      if (pauseValue.value !== next) {
        pauseValue.value = next;
        pauseValue.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    root.querySelectorAll('[data-ctn-trigger-save-only]').forEach((el) => {
      const section = el.closest('[data-ctn-trigger-section]')?.dataset.ctnTriggerSection;
      const consequenceAtFX = section === 'damageEnabled'
        ? root.querySelector('[data-ctn-area-toggle="damageOnEffectArea"]')?.checked
        : section === 'transitionEnabled' ? root.querySelector('[data-ctn-area-toggle="transitionOnEffectArea"]')?.checked : false;
      const saveAtFX = !!root.querySelector('[data-ctn-area-toggle="saveOnEffectArea"]')?.checked;
      el.hidden = !enabled('saveEnabled') || (section === 'revealEnabled' && saveAtFX)
        || (['damageEnabled', 'transitionEnabled'].includes(section) && !!consequenceAtFX !== saveAtFX);
    });
    root.querySelectorAll('[data-ctn-trigger-no-save]').forEach((el) => {
      const section = el.closest('[data-ctn-trigger-section]')?.dataset.ctnTriggerSection;
      const targetAtFX = section === 'damageEnabled'
        ? root.querySelector('[data-ctn-area-toggle="damageOnEffectArea"]')?.checked
        : section === 'transitionEnabled' ? root.querySelector('[data-ctn-area-toggle="transitionOnEffectArea"]')?.checked : false;
      const saveAtFX = !!root.querySelector('[data-ctn-area-toggle="saveOnEffectArea"]')?.checked;
      el.hidden = enabled('saveEnabled') && (section === 'revealEnabled' ? !saveAtFX : targetAtFX === saveAtFX);
    });
    const damageReady = enabled("damageEnabled")
      && [...(list?.querySelectorAll("[data-ctn-damage-formula]") ?? [])]
        .some((input) => input.value.trim());
    const destinationReady = enabled("transitionEnabled") && Boolean(sceneSelect?.value && arrivalSelect?.value);
    const damageHint = root.querySelector("[data-ctn-trigger-damage-hint]");
    if (damageHint) damageHint.hidden = !enabled("damageEnabled") || damageReady;
    const transitionHint = root.querySelector("[data-ctn-trigger-transition-hint]");
    if (transitionHint) transitionHint.hidden = !enabled("transitionEnabled") || destinationReady;

    // Invalid combinations are not selectable. A temporary forced fallback
    // is restored if the prerequisite is re-enabled in the same edit session.
    const valid = (kind) => kind === TRIGGER_AFTER.DIRECT_TRANSITION
      ? destinationReady
      : kind === TRIGGER_AFTER.PERSISTENT_DAMAGE ? damageReady : true;
    for (const kind of [TRIGGER_AFTER.DIRECT_TRANSITION, TRIGGER_AFTER.PERSISTENT_DAMAGE]) {
      const option = [...after.options].find((entry) => entry.value === kind);
      if (option) option.disabled = !valid(kind);
    }
    if (!valid(after.value)) {
      suspendedAfter = after.value;
      after.value = TRIGGER_AFTER.REMAIN_ACTIVE_TRAP;
    } else if (suspendedAfter && valid(suspendedAfter)
        && after.value === TRIGGER_AFTER.REMAIN_ACTIVE_TRAP) {
      after.value = suspendedAfter;
      suspendedAfter = null;
    }
    const hazardSave = root.querySelector("[data-ctn-trigger-hazard-save]");
    if (hazardSave) hazardSave.hidden = after.value !== TRIGGER_AFTER.PERSISTENT_DAMAGE || !enabled("saveEnabled");

    // Required only while the corresponding feature is ON. A partial setup
    // cannot silently create a nonfunctional transition/damage component.
    if (sceneSelect) sceneSelect.required = enabled("transitionEnabled");
    if (arrivalSelect) arrivalSelect.required = enabled("transitionEnabled");
    const damageInputs = [...(list?.querySelectorAll("[data-ctn-damage-formula]") ?? [])];
    damageInputs.forEach((input, index) => { input.required = enabled("damageEnabled") && !damageReady && index === 0; });
  };

  const bindSearch = (input, select) => {
    if (!input || !select) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLocaleLowerCase();
      for (const opt of select.options) {
        opt.hidden = !!q && opt.value !== select.value && !opt.textContent.toLocaleLowerCase().includes(q);
      }
    });
  };
  bindSearch(root.querySelector('[data-ctn-trigger-scene-search]'), sceneSelect);
  bindSearch(root.querySelector('[data-ctn-trigger-arrival-search]'), arrivalSelect);
  sceneSelect?.addEventListener("change", () => {
    if (!arrivalSelect) return;
    arrivalSelect.innerHTML = triggerArrivalOptions(sceneSelect.value, "");
    arrivalSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });
  arrivalSelect?.addEventListener("change", refresh);
  pause?.addEventListener("change", refresh);
  root.querySelector(`[name="flags.${MODULE_ID}.trigger.activationMode"]`)?.addEventListener('change', refresh);
  root.querySelector(`[name="flags.${MODULE_ID}.trigger.initialVisibility"]`)?.addEventListener('change', refresh);
  for (const input of Object.values(switches)) input.addEventListener("change", refresh);
  after?.addEventListener("change", () => { suspendedAfter = null; refresh(); });
  list?.addEventListener("input", refresh);
  list?.addEventListener("change", refresh);
  root.addEventListener("ctn-trigger-refresh", refresh);
  // Avoid accidentally saving a visually selected unsupported combination.
  refresh();
}

export function registerTileConfigHooks() {
  Hooks.on("renderApplicationV2", (application, element) => {
    const TileConfig = foundry.applications.sheets.TileConfig;
    if (!(application instanceof TileConfig)) return;

    const tile = application.document;
    const transition = transitionData(tile);
    const trigger = triggerData(tile);
    const nav = navData(tile);
    if (!transition && !trigger && !nav?.enabled) return;

    const form = element.matches?.("form") ? element : element.querySelector("form");
    if (!form || form.querySelector(".ctn-config")) return;

    const configHTML = transition
      ? transitionConfigHTML(tile, transition)
      : trigger
        ? triggerConfigHTML(tile, trigger)
        : isArrivalPoint(tile)
        ? arrivalConfigHTML(tile, nav)
        : linkConfigHTML(tile, nav);

    const html = `${(transition || trigger) ? tileImageConfigHTML(tile) : ""}${configHTML}`
      + `${transition ? linkedConfigHTML(tile) : ""}${fxConfigHTML(tile)}`;
    let host = injectCtnTab(application, form, html);

    // Safety fallback: if a future Foundry TileConfig changes its tab markup,
    // keep CTN configuration available in Appearance rather than losing it.
    if (!host) {
      const appearancePanel = findTabPanel(form, "appearance")
        ?? [...form.querySelectorAll(".tab, [data-tab]")].find((candidate) => {
          if (isTabControl(candidate)) return false;
          return Boolean(candidate.querySelector("input, select, .form-group"));
        });
      if (!appearancePanel) return;
      appearancePanel.insertAdjacentHTML("beforeend", html);
      host = appearancePanel;
    }

    if (transition || trigger) wireAssetConfig(host, tile);
    wireFXConfig(host, tile, application);
    if (transition || trigger) wireLinkedConfig(host, tile);
    if (transition) wireTransitionConfig(host, tile);
    else if (trigger) wireTriggerConfig(host, tile);
    else {
      wireRouteModeVisibility(host);
      if (isArrivalPoint(tile)) wireIncomingRoute(host, tile);
    }
  });

  Hooks.on("preUpdateTile", (tile, changes) => {
    const linkBase = `flags.${MODULE_ID}.linkedActivation`;
    const oldLink = linkedData(tile);
    const newSource = getSubmittedValue(changes, `${linkBase}.sourceTileUuid`, oldLink.sourceTileUuid);
    const newEnabled = getSubmittedValue(changes, `${linkBase}.enabled`, oldLink.enabled);
    const sourceChanged = hasSubmittedValue(changes, `${linkBase}.sourceTileUuid`)
      && newSource !== oldLink.sourceTileUuid;
    const activated = newEnabled === true || newEnabled === "true";
    if (sourceChanged || (activated && !oldLink.enabled) || !activated) {
      // New links always start sleeping; disabling clears persisted active state.
      foundry.utils.setProperty(changes, `${linkBase}.active`, false);
    }
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
      // The functional Save toggle wins over stale runtime Save State. The
      // persistent-hazard policy remains the only intentional exception.
      if (hasSubmittedValue(changes, `${base}.saveEnabled`)) {
        const enabled = [true, "true"].includes(getSubmittedValue(changes, `${base}.saveEnabled`, trigger.saveEnabled));
        const hazard = state === "active-hazard"
          && getSubmittedValue(changes, `${base}.afterTrigger`, trigger.afterTrigger) === TRIGGER_AFTER.PERSISTENT_DAMAGE
          && [true, "true"].includes(getSubmittedValue(changes, `${base}.disableSaveOnPersistentHazard`, trigger.disableSaveOnPersistentHazard));
        foundry.utils.setProperty(changes, `${base}.saveState`, enabled && !hazard
          ? TRIGGER_SAVE_STATES.ON : TRIGGER_SAVE_STATES.OFF);
      }

      // Normalize prerequisites at the persistence boundary too: sheets other
      // than this one may submit direct flag changes, including macros.
      const relevantFields = ["damageEnabled", "damageComponents", "transitionEnabled",
        "transitionSceneUuid", "transitionArrivalUuid", "afterTrigger"];
      if (relevantFields.some((key) => hasSubmittedValue(changes, `${base}.${key}`))) {
        const bool = (value) => value === true || value === "true";
        const damageEnabled = bool(getSubmittedValue(changes, `${base}.damageEnabled`, trigger.damageEnabled));
        const transitionEnabled = bool(getSubmittedValue(changes, `${base}.transitionEnabled`, trigger.transitionEnabled));
        const proposedAfter = getSubmittedValue(changes, `${base}.afterTrigger`, trigger.afterTrigger);
        const damageValue = getSubmittedValue(changes, `${base}.damageComponents`, trigger.damageComponents);
        const components = getTriggerDamageComponents({ damageEnabled, damageComponents: damageValue });
        const targetScene = resolveScene(sceneUuid);
        const hasValidDestination = transitionEnabled && Boolean(
          targetScene && arrival && arrival.parent?.id === targetScene.id);
        const invalidAfter = proposedAfter === TRIGGER_AFTER.DIRECT_TRANSITION && !hasValidDestination
          || proposedAfter === TRIGGER_AFTER.PERSISTENT_DAMAGE && (!damageEnabled || !components.length);
        if (invalidAfter) {
          foundry.utils.setProperty(changes, `${base}.afterTrigger`, TRIGGER_AFTER.REMAIN_ACTIVE_TRAP);
        }
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
