import {
  MODULE_ID,
  DISPLAY_MODES,
  GESTURES,
  ICONS,
  VISIBILITY,
  TRIGGER_PERMISSION,
  NAVIGATION_MODE
} from "./constants.mjs";

const choice = (key) => `CTN.Settings.Choices.${key}`;

export function registerSettings() {
  game.settings.register(MODULE_ID, "defaultGesture", {
    name: "CTN.Settings.DefaultGesture.Name",
    hint: "CTN.Settings.DefaultGesture.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    choices: {
      [GESTURES.SINGLE]: choice("Single"),
      [GESTURES.DOUBLE]: choice("Double"),
      [GESTURES.MIDDLE]: choice("Middle"),
      [GESTURES.ALT]: choice("Alt"),
      [GESTURES.CTRL]: choice("Ctrl")
    },
    default: GESTURES.DOUBLE
  });

  game.settings.register(MODULE_ID, "defaultDisplayMode", {
    name: "CTN.Settings.DefaultDisplayMode.Name",
    hint: "CTN.Settings.DefaultDisplayMode.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    choices: {
      [DISPLAY_MODES.THUMBNAIL]: choice("Thumbnail"),
      [DISPLAY_MODES.ICON]: choice("Icon")
    },
    default: DISPLAY_MODES.THUMBNAIL
  });

  game.settings.register(MODULE_ID, "defaultIcon", {
    name: "CTN.Settings.DefaultIcon.Name",
    hint: "CTN.Settings.DefaultIcon.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    choices: {
      [ICONS.ARROW]: choice("Arrow"),
      [ICONS.ENTER_DOOR]: choice("EnterDoor"),
      [ICONS.EXIT_DOOR]: choice("ExitDoor"),
      [ICONS.STAIRS_UP]: choice("StairsUp"),
      [ICONS.STAIRS_DOWN]: choice("StairsDown"),
      [ICONS.BACK]: choice("Back")
    },
    default: ICONS.ARROW
  });

  game.settings.register(MODULE_ID, "defaultVisibility", {
    name: "CTN.Settings.DefaultVisibility.Name",
    hint: "CTN.Settings.DefaultVisibility.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    choices: {
      [VISIBILITY.GM]: choice("GMOnly"),
      [VISIBILITY.EVERYONE]: choice("Everyone")
    },
    default: VISIBILITY.GM
  });

  game.settings.register(MODULE_ID, "defaultTriggerPermission", {
    name: "CTN.Settings.DefaultTriggerPermission.Name",
    hint: "CTN.Settings.DefaultTriggerPermission.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    choices: {
      [TRIGGER_PERMISSION.GM]: choice("GMOnly"),
      [TRIGGER_PERMISSION.EVERYONE]: choice("Everyone")
    },
    default: TRIGGER_PERMISSION.GM
  });

  game.settings.register(MODULE_ID, "defaultNavigationMode", {
    name: "CTN.Settings.DefaultNavigationMode.Name",
    hint: "CTN.Settings.DefaultNavigationMode.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    choices: {
      [NAVIGATION_MODE.EVERYONE]: choice("BringEveryone"),
      [NAVIGATION_MODE.SELF]: choice("TriggeringUser")
    },
    default: NAVIGATION_MODE.EVERYONE
  });

  game.settings.register(MODULE_ID, "defaultWidth", {
    name: "CTN.Settings.DefaultWidth.Name",
    hint: "CTN.Settings.DefaultWidth.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    default: 240
  });

  game.settings.register(MODULE_ID, "defaultHeight", {
    name: "CTN.Settings.DefaultHeight.Name",
    hint: "CTN.Settings.DefaultHeight.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    default: 135
  });
}

export function getCreationDefaults() {
  return {
    gesture: game.settings.get(MODULE_ID, "defaultGesture"),
    displayMode: game.settings.get(MODULE_ID, "defaultDisplayMode"),
    icon: game.settings.get(MODULE_ID, "defaultIcon"),
    visibility: game.settings.get(MODULE_ID, "defaultVisibility"),
    triggerPermission: game.settings.get(MODULE_ID, "defaultTriggerPermission"),
    navigationMode: game.settings.get(MODULE_ID, "defaultNavigationMode"),
    width: Math.max(32, Number(game.settings.get(MODULE_ID, "defaultWidth")) || 240),
    height: Math.max(32, Number(game.settings.get(MODULE_ID, "defaultHeight")) || 135)
  };
}
