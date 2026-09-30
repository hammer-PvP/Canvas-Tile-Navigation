export const MODULE_ID = "canvas-tile-navigation";
export const SOCKET_NAME = `module.${MODULE_ID}`;
export const HOVER_HOOK = `${MODULE_ID}.hover`;
export const ROUTES_CHANGED_HOOK = `${MODULE_ID}.routesChanged`;
export const ARRIVAL_MATERIALIZED_HOOK = `${MODULE_ID}.arrivalMaterialized`;

export const FLAGS = Object.freeze({
  ROOT: "navigation",
  TRIGGER_ROOT: "trigger",
  TARGET_SCENE_UUID: "targetSceneUuid",
  DISPLAY_MODE: "displayMode",
  ICON: "icon",
  GESTURE: "gesture",
  VISIBILITY: "visibility",
  TRIGGER_PERMISSION: "triggerPermission",
  NAVIGATION_MODE: "navigationMode",
  LABEL: "label",
  LABEL_DISPLAY: "labelDisplay",
  POINT_TYPE: "pointType",
  ROUTE_ID: "routeId",
  ROUTE_INDEX: "routeIndex",
  ROUTE_MODE: "routeMode",
  PAIRED_RETURN_UUID: "pairedReturnLinkUuid",
  ONE_WAY_ARRIVAL_UUID: "oneWayArrivalUuid",
  ARRIVAL_ID: "arrivalId"
});

export const POINT_TYPES = Object.freeze({
  LINK: "link",
  ARRIVAL: "arrival"
});

export const ROUTE_MODES = Object.freeze({
  PAIRED: "paired",
  ONE_WAY: "one-way"
});

export const ROUTE_STATUS = Object.freeze({
  LINKED: "linked",
  ONE_WAY: "one-way",
  UNLINKED: "unlinked",
  AMBIGUOUS: "ambiguous",
  BROKEN: "broken",
  UNUSED_ARRIVAL: "unused-arrival",
  IN_USE: "in-use"
});

export const LABEL_DISPLAY = Object.freeze({
  OFF: "off",
  HOVER: "hover",
  ALWAYS: "always"
});

export const DISPLAY_MODES = Object.freeze({
  THUMBNAIL: "thumbnail",
  ICON: "icon"
});

export const VISIBILITY = Object.freeze({
  GM: "gm",
  EVERYONE: "everyone"
});

export const TRIGGER_PERMISSION = Object.freeze({
  GM: "gm",
  EVERYONE: "everyone"
});

export const NAVIGATION_MODE = Object.freeze({
  EVERYONE: "everyone",
  SELF: "self"
});

export const GESTURES = Object.freeze({
  SINGLE: "single",
  DOUBLE: "double",
  MIDDLE: "middle",
  ALT: "alt",
  CTRL: "ctrl"
});

export const ICONS = Object.freeze({
  ARROW: "arrow",
  ENTER_DOOR: "enter-door",
  EXIT_DOOR: "exit-door",
  STAIRS_UP: "stairs-up",
  STAIRS_DOWN: "stairs-down",
  BACK: "back"
});

export const ICON_PATHS = Object.freeze({
  [ICONS.ARROW]: `modules/${MODULE_ID}/assets/icons/arrow.png`,
  [ICONS.ENTER_DOOR]: `modules/${MODULE_ID}/assets/icons/enter-door.png`,
  [ICONS.EXIT_DOOR]: `modules/${MODULE_ID}/assets/icons/exit-door.png`,
  [ICONS.STAIRS_UP]: `modules/${MODULE_ID}/assets/icons/stairs-up.png`,
  [ICONS.STAIRS_DOWN]: `modules/${MODULE_ID}/assets/icons/stairs-down.png`,
  [ICONS.BACK]: `modules/${MODULE_ID}/assets/icons/back.png`
});

export const TRIGGER_STATES = Object.freeze({
  ARMED: "armed",
  TRIGGERED: "triggered",
  REVEALED: "revealed",
  ACTIVE_HAZARD: "active-hazard",
  DISABLED: "disabled"
});

export const TRIGGER_INITIAL_VISIBILITY = Object.freeze({
  HIDDEN: "hidden",
  VISIBLE: "visible"
});

export const TRIGGER_PAUSE = Object.freeze({
  NEVER: "never",
  ON_TRIGGER: "on-trigger"
});

export const TRIGGER_SAVE_STATES = Object.freeze({
  ON: "on",
  OFF: "off"
});

export const TRIGGER_CONDITIONS = Object.freeze({
  ALWAYS: "always",
  FAILED_SAVE: "failed-save",
  SUCCESSFUL_SAVE: "successful-save",
  HALF_ON_SUCCESS: "half-on-success"
});

export const TRIGGER_REVEAL = Object.freeze({
  NEVER: "never",
  ON_TRIGGER: "on-trigger",
  FAILED_SAVE: "failed-save",
  SUCCESSFUL_SAVE: "successful-save"
});

export const TRIGGER_AFTER = Object.freeze({
  DISABLE: "disable",
  REMAIN_VISIBLE: "remain-visible",
  DIRECT_TRANSITION: "direct-transition",
  PERSISTENT_DAMAGE: "persistent-damage",
  REARM_WHEN_EMPTY: "rearm-when-empty",
  REMAIN_ACTIVE_TRAP: "remain-active-trap"
});

export const MISSING_SCENE_ICON = `modules/${MODULE_ID}/assets/internal/missing-scene.png`;
export const ARRIVAL_POINT_ICON = ICON_PATHS[ICONS.ENTER_DOOR];
export const TRIGGER_ZONE_ICON = `modules/${MODULE_ID}/assets/internal/trigger-zone.png`;
