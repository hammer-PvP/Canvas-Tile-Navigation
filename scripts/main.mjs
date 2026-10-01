import { MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { bindSceneDropCapture } from "./drop-service.mjs";
import { initializeNavigationSocket } from "./navigation-service.mjs";
import { registerTileInteractionHooks } from "./tile-interaction.mjs";
import { registerTileConfigHooks } from "./tile-config.mjs";
import { registerArrivalControls } from "./arrival-service.mjs";
import { initializeRoutes, registerRouteHooks } from "./route-service.mjs";
import { registerLabelHooks } from "./label-service.mjs";
import { initializePartyProvider, registerPartyHooks } from "./party-service.mjs";
import { initializeTriggerSocket, registerTriggerHooks } from "./trigger-service.mjs";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing`);
  registerSettings();
  registerTileInteractionHooks();
  registerTileConfigHooks();
  registerArrivalControls();
  registerRouteHooks();
  registerLabelHooks();
  registerPartyHooks();
  registerTriggerHooks();
});

Hooks.once("ready", async () => {
  initializeNavigationSocket();
  initializeTriggerSocket();
  bindSceneDropCapture();
  await initializePartyProvider();
  await initializeRoutes();
  console.log(`${MODULE_ID} | Ready`);
});
