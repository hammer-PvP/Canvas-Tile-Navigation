import { MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { bindSceneDropCapture } from "./drop-service.mjs";
import { initializeNavigationSocket } from "./navigation-service.mjs";
import { registerTileInteractionHooks } from "./tile-interaction.mjs";
import { registerTileConfigHooks } from "./tile-config.mjs";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing`);
  registerSettings();
  registerTileInteractionHooks();
  registerTileConfigHooks();
});

Hooks.once("ready", () => {
  initializeNavigationSocket();
  bindSceneDropCapture();
  console.log(`${MODULE_ID} | Ready`);
});
