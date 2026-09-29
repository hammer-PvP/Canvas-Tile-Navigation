import {
  MODULE_ID,
  SOCKET_NAME,
  NAVIGATION_MODE,
  TRIGGER_PERMISSION
} from "./constants.mjs";

function getNavData(tileDocument) {
  return tileDocument?.getFlag?.(MODULE_ID, "navigation") ?? null;
}

function activePrimaryGM() {
  return [...game.users]
    .filter((user) => user.active && user.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

function resolveWorldScene(uuid) {
  if (!uuid || typeof uuid !== "string") return null;
  const id = uuid.startsWith("Scene.")
    ? uuid.slice("Scene.".length).split(".")[0]
    : uuid;
  return game.scenes.get(id) ?? null;
}

async function performNavigation({ tileDocument, requesterId }) {
  const nav = getNavData(tileDocument);
  if (!nav?.targetSceneUuid) return;

  const requester = game.users.get(requesterId);
  if (!requester) return;

  if (!requester.isGM && nav.triggerPermission !== TRIGGER_PERMISSION.EVERYONE) return;

  const targetScene = resolveWorldScene(nav.targetSceneUuid);
  if (!targetScene) {
    if (requesterId === game.user.id) {
      ui.notifications.warn(game.i18n.localize("CTN.Notifications.MissingScene"));
    }
    return;
  }

  if (nav.navigationMode === NAVIGATION_MODE.SELF) {
    if (requesterId === game.user.id) {
      await targetScene.view();
    } else {
      targetScene.pullUsers([requesterId]);
    }
    return;
  }

  const activeUsers = [...game.users].filter((user) => user.active);
  targetScene.pullUsers(activeUsers);
}

async function handleSocketMessage(message) {
  if (message?.type !== "navigate") return;

  const primaryGM = activePrimaryGM();
  if (!primaryGM || primaryGM.id !== game.user.id) return;

  const tileUuid = String(message.tileUuid ?? "");
  const match = /^Scene\.([^.]+)\.Tile\.([^.]+)$/.exec(tileUuid);
  if (!match) return;

  const [, sceneId, tileId] = match;
  const scene = game.scenes.get(sceneId);
  const tileDocument = scene?.tiles?.get(tileId);
  if (!tileDocument) return;

  await performNavigation({
    tileDocument,
    requesterId: message.requesterId
  });
}

export function initializeNavigationSocket() {
  game.socket.on(SOCKET_NAME, handleSocketMessage);
}

export async function requestNavigation(tileDocument) {
  const nav = getNavData(tileDocument);
  if (!nav?.targetSceneUuid) return;

  if (!game.user.isGM && nav.triggerPermission !== TRIGGER_PERMISSION.EVERYONE) return;

  const primaryGM = activePrimaryGM();

  if (game.user.isGM) {
    await performNavigation({ tileDocument, requesterId: game.user.id });
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

  if (nav.navigationMode === NAVIGATION_MODE.SELF) {
    const targetScene = resolveWorldScene(nav.targetSceneUuid);
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
  } else {
    ui.notifications.warn(game.i18n.localize("CTN.Notifications.GMRequired"));
  }
}
