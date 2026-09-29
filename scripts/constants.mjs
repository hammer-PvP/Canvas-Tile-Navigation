export const MODULE_ID = "canvas-tile-navigation";
export const SOCKET_NAME = `module.${MODULE_ID}`;

export const FLAGS = Object.freeze({
  ROOT: "navigation",
  TARGET_SCENE_UUID: "targetSceneUuid",
  DISPLAY_MODE: "displayMode",
  ICON: "icon",
  GESTURE: "gesture",
  VISIBILITY: "visibility",
  TRIGGER_PERMISSION: "triggerPermission",
  NAVIGATION_MODE: "navigationMode",
  LABEL: "label"
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
  [ICONS.ARROW]: `modules/${MODULE_ID}/assets/icons/arrow.svg`,
  [ICONS.ENTER_DOOR]: `modules/${MODULE_ID}/assets/icons/enter-door.svg`,
  [ICONS.EXIT_DOOR]: `modules/${MODULE_ID}/assets/icons/exit-door.svg`,
  [ICONS.STAIRS_UP]: `modules/${MODULE_ID}/assets/icons/stairs-up.svg`,
  [ICONS.STAIRS_DOWN]: `modules/${MODULE_ID}/assets/icons/stairs-down.svg`,
  [ICONS.BACK]: `modules/${MODULE_ID}/assets/icons/back.svg`
});

export const MISSING_SCENE_ICON = `modules/${MODULE_ID}/assets/icons/missing-scene.svg`;
