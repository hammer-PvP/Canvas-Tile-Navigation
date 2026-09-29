import {
  MODULE_ID,
  SOCKET_NAME,
  NAVIGATION_MODE,
  TRIGGER_PERMISSION
} from "./constants.mjs";
import {
  destinationArrivalTile,
  navData,
  resolveScene,
  resolveTile
} from "./route-service.mjs";
import {
  activeNonGMPlayersInScene,
  isUserWithinNavigationRange,
  placeUserAtArrival,
  placeUsersAtArrival
} from "./token-service.mjs";

function activePrimaryGM() {
  return [...game.users]
    .filter((user) => user.active && user.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

function notifyRequester(requesterId, key) {
  if (requesterId === game.user.id) ui.notifications.warn(game.i18n.localize(key));
}

async function performNavigation({ tileDocument, requesterId, preview = false }) {
  const nav = navData(tileDocument);
  if (!nav?.targetSceneUuid) return;

  const requester = game.users.get(requesterId);
  if (!requester) return;

  if (!requester.isGM && nav.triggerPermission !== TRIGGER_PERMISSION.EVERYONE) return;

  const targetScene = resolveScene(nav.targetSceneUuid);
  if (!targetScene) {
    notifyRequester(requesterId, "CTN.Notifications.MissingScene");
    return;
  }

  const sourceScene = tileDocument.parent;
  const arrivalTile = destinationArrivalTile(tileDocument);

  // GM Preview is deliberately side-effect free: no Active Scene change,
  // no player pull, and no Token movement.
  if (requester.isGM && preview) {
    await targetScene.view();
    return;
  }

  // A player may only navigate themselves, never change Active Scene and never
  // pull the rest of the table. Revalidate proximity on the authoritative GM.
  if (!requester.isGM) {
    if (!isUserWithinNavigationRange(requester, tileDocument)) {
      notifyRequester(requesterId, "CTN.Notifications.PlayerTooFar");
      return;
    }

    if (arrivalTile) {
      await placeUserAtArrival(requester, sourceScene, targetScene, arrivalTile);
    }
    targetScene.pullUsers([requesterId]);
    return;
  }

  // Normal GM navigation commits the table transition by activating the Scene.
  // Existing Navigation Target still controls whether all players are pulled.
  if (nav.navigationMode === NAVIGATION_MODE.EVERYONE) {
    const players = activeNonGMPlayersInScene(sourceScene);
    if (arrivalTile) {
      await placeUsersAtArrival(players, sourceScene, targetScene, arrivalTile);
    }
    await targetScene.activate({ pullUsers: true });
    return;
  }

  await targetScene.activate({ pullUsers: false });
}

async function handleSocketMessage(message) {
  if (message?.type !== "navigate") return;

  const primaryGM = activePrimaryGM();
  if (!primaryGM || primaryGM.id !== game.user.id) return;

  const tileDocument = resolveTile(String(message.tileUuid ?? ""));
  if (!tileDocument) return;

  await performNavigation({
    tileDocument,
    requesterId: message.requesterId,
    preview: false
  });
}

export function initializeNavigationSocket() {
  game.socket.on(SOCKET_NAME, handleSocketMessage);
}

export async function requestNavigation(tileDocument, { preview = false } = {}) {
  const nav = navData(tileDocument);
  if (!nav?.targetSceneUuid) return;

  if (!game.user.isGM && nav.triggerPermission !== TRIGGER_PERMISSION.EVERYONE) return;

  if (!game.user.isGM && !isUserWithinNavigationRange(game.user, tileDocument)) {
    ui.notifications.warn(game.i18n.localize("CTN.Notifications.PlayerTooFar"));
    return;
  }

  const primaryGM = activePrimaryGM();

  if (game.user.isGM) {
    await performNavigation({
      tileDocument,
      requesterId: game.user.id,
      preview
    });
    return;
  }

  if (primaryGM) {
    game.socket.emit(SOCKET_NAME, {
      type: "navigate",
      tileUuid: tileDocument.uuid,
      requesterId: game.user.id
    });
    return;
  }

  // No GM connected: permit only local viewing. Token placement and Active
  // Scene changes remain authoritative and therefore unavailable.
  const targetScene = resolveScene(nav.targetSceneUuid);
  if (!targetScene) {
    ui.notifications.warn(game.i18n.localize("CTN.Notifications.MissingScene"));
    return;
  }

  try {
    await targetScene.view();
  } catch (error) {
    console.warn(`${MODULE_ID} | Player fallback navigation failed`, error);
    ui.notifications.warn(game.i18n.localize("CTN.Notifications.GMRequired"));
  }
}
