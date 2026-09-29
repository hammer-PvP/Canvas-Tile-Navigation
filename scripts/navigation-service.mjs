import {
  MODULE_ID,
  SOCKET_NAME,
  TRIGGER_PERMISSION
} from "./constants.mjs";
import {
  destinationArrivalTile,
  navData,
  resolveScene,
  resolveTile
} from "./route-service.mjs";
import {
  activeNonGMPlayers,
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

  // GM Preview: view only. No Active Scene change, no player pull, no Tokens.
  if (requester.isGM && preview) {
    await targetScene.view();
    return;
  }

  // Players always navigate individually. Shift has no special meaning.
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

  // GM normal navigation is always a table commit.
  // Only player-character Tokens present in the source Scene are transferred.
  const playersToMoveTokens = activeNonGMPlayersInScene(sourceScene);
  if (arrivalTile) {
    await placeUsersAtArrival(playersToMoveTokens, sourceScene, targetScene, arrivalTile);
  }

  // Activate without pulling every connected GM. Then explicitly pull active
  // non-GM players and make sure this GM is viewing the committed Scene.
  await targetScene.activate({ pullUsers: false });
  await targetScene.view();

  const playersToPull = activeNonGMPlayers();
  if (playersToPull.length) targetScene.pullUsers(playersToPull);
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

  // Without a connected GM, player viewing may still work locally, but Token
  // transfer remains authoritative and is therefore not attempted.
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
