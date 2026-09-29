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
  findGroupTokenForParty,
  getGroupRepresentationForActorAsync,
  getUserActor,
  resolveTravelRoster,
  usersForRoster
} from "./party-service.mjs";
import {
  activeNonGMPlayers,
  deleteActorTokensFromScene,
  isUserWithinNavigationRange,
  reconcileActorsAtArrival,
  repositionExistingTokenAtArrival
} from "./token-service.mjs";

const TRANSITION_TIMEOUT_MS = 30_000;

let localNavigationInProgress = false;
let gmCommitInProgress = false;
const localPlayerTransitions = new Map();
const authorityPlayerTransitions = new Map();
const authorityPlayerLocks = new Set();

function activePrimaryGM() {
  return [...game.users]
    .filter((user) => user.active && user.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

function randomTransitionId() {
  return foundry.utils.randomID?.() ?? crypto.randomUUID();
}

function notify(key, data = {}) {
  const message = Object.keys(data).length
    ? game.i18n.format(key, data)
    : game.i18n.localize(key);
  ui.notifications.warn(message);
}

function emitToUser(type, userId, payload = {}) {
  game.socket.emit(SOCKET_NAME, {
    type,
    targetUserId: userId,
    ...payload
  });
}

async function safePreload(targetScene, { broadcast = false } = {}) {
  if (!targetScene) return;
  try {
    await game.scenes.preload(targetScene.id, { broadcast });
  } catch (error) {
    console.warn(`${MODULE_ID} | Scene preload failed for ${targetScene.name}; continuing`, error);
  }
}

function waitForCanvasReady(sceneId, { timeout = TRANSITION_TIMEOUT_MS } = {}) {
  if (canvas?.ready && canvas.scene?.id === sceneId) return Promise.resolve(true);

  return new Promise((resolve, reject) => {
    let timer = null;

    const cleanup = () => {
      Hooks.off("canvasReady", onReady);
      if (timer) clearTimeout(timer);
    };

    const onReady = (readyCanvas) => {
      const currentSceneId = readyCanvas?.scene?.id ?? canvas?.scene?.id;
      if (currentSceneId !== sceneId) return;
      cleanup();
      resolve(true);
    };

    Hooks.on("canvasReady", onReady);
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for canvasReady(${sceneId})`));
    }, timeout);
  });
}

async function performGMPreview(targetScene) {
  if (!canvas?.ready) {
    notify("CTN.Notifications.NavigationLoading");
    return;
  }

  if (canvas.scene?.id === targetScene.id) return;

  const ready = waitForCanvasReady(targetScene.id);
  await targetScene.view();
  await ready;
}

async function prepareCollectiveDestination({ sourceScene, targetScene, arrivalTile }) {
  const roster = await resolveTravelRoster({ sourceScene, targetScene });
  const result = {
    roster,
    successfulActorIds: new Set(),
    representation: "none"
  };

  if (!arrivalTile) return result;

  const groupToken = findGroupTokenForParty(targetScene, roster.groupActor);
  if (groupToken) {
    result.representation = "group";
    const moved = await repositionExistingTokenAtArrival(groupToken, targetScene, arrivalTile);
    if (moved) {
      for (const actor of roster.actors) result.successfulActorIds.add(actor.id);
    }
    return result;
  }

  result.representation = "characters";
  const placement = await reconcileActorsAtArrival(roster.actors, targetScene, arrivalTile);
  result.successfulActorIds = placement.successfulActorIds;
  return result;
}

async function performGMCommit({ tileDocument, targetScene }) {
  if (gmCommitInProgress) {
    notify("CTN.Notifications.NavigationBusy");
    return;
  }

  if (!canvas?.ready) {
    notify("CTN.Notifications.NavigationLoading");
    return;
  }

  const sourceScene = tileDocument.parent;
  if (!sourceScene) return;

  // Preserve the established CTN behavior: if the destination is already the
  // Active Scene while the GM is viewing elsewhere, do not force a second
  // Scene switch. Shift-preview remains the explicit way to inspect it.
  if (targetScene.active && canvas.scene?.id !== targetScene.id) return;

  gmCommitInProgress = true;
  localNavigationInProgress = true;

  try {
    const arrivalTile = destinationArrivalTile(tileDocument);

    // Preload first. V14 can broadcast Scene asset preloading to connected
    // clients so the later pull is less likely to stall on first render.
    await safePreload(targetScene, { broadcast: true });

    // Materialize the authoritative party representation in the inactive
    // destination Scene before activating it.
    const destination = await prepareCollectiveDestination({
      sourceScene,
      targetScene,
      arrivalTile
    });

    const alreadyReady = canvas.scene?.id === targetScene.id && canvas.ready;
    const ready = alreadyReady ? Promise.resolve(true) : waitForCanvasReady(targetScene.id);

    if (!targetScene.active) {
      await targetScene.activate({ pullUsers: false });
    }

    await ready;

    // Source cleanup is intentionally delayed until destination materialization
    // and the GM's target Canvas have both succeeded.
    if (destination.successfulActorIds.size) {
      await deleteActorTokensFromScene(sourceScene, destination.successfulActorIds);
    }

    const playersToPull = destination.roster.provider === "dnd5e-group"
      ? usersForRoster(destination.roster, { activeOnly: true })
      : activeNonGMPlayers();

    if (playersToPull.length) targetScene.pullUsers(playersToPull);
  } catch (error) {
    console.error(`${MODULE_ID} | GM Scene transition failed`, error);
    notify("CTN.Notifications.NavigationFailed");
  } finally {
    gmCommitInProgress = false;
    localNavigationInProgress = false;
  }
}

async function performGMNavigation({ tileDocument, preview = false }) {
  const nav = navData(tileDocument);
  if (!nav?.targetSceneUuid) return;

  const targetScene = resolveScene(nav.targetSceneUuid);
  if (!targetScene) {
    notify("CTN.Notifications.MissingScene");
    return;
  }

  if (preview) {
    if (localNavigationInProgress) {
      notify("CTN.Notifications.NavigationBusy");
      return;
    }
    localNavigationInProgress = true;
    try {
      await safePreload(targetScene, { broadcast: false });
      await performGMPreview(targetScene);
    } catch (error) {
      console.error(`${MODULE_ID} | GM preview failed`, error);
      notify("CTN.Notifications.NavigationFailed");
    } finally {
      localNavigationInProgress = false;
    }
    return;
  }

  await performGMCommit({ tileDocument, targetScene });
}

async function preparePlayerTransition({ tileDocument, requesterId, transitionId }) {
  const requester = game.users.get(requesterId);
  const nav = navData(tileDocument);

  if (!requester || requester.isGM || nav?.triggerPermission !== TRIGGER_PERMISSION.EVERYONE) {
    emitToUser("player-transition-failed", requesterId, { transitionId, reason: "CTN.Notifications.NavigationFailed" });
    return;
  }

  if (authorityPlayerLocks.has(requesterId)) {
    emitToUser("player-transition-failed", requesterId, { transitionId, reason: "CTN.Notifications.NavigationBusy" });
    return;
  }

  if (!isUserWithinNavigationRange(requester, tileDocument)) {
    emitToUser("player-transition-failed", requesterId, { transitionId, reason: "CTN.Notifications.PlayerTooFar" });
    return;
  }

  const targetScene = resolveScene(nav.targetSceneUuid);
  if (!targetScene) {
    emitToUser("player-transition-failed", requesterId, { transitionId, reason: "CTN.Notifications.MissingScene" });
    return;
  }

  const sourceScene = tileDocument.parent;
  const actor = getUserActor(requester);
  if (!sourceScene || !actor) {
    emitToUser("player-transition-failed", requesterId, { transitionId, reason: "CTN.Notifications.NoCharacter" });
    return;
  }

  authorityPlayerLocks.add(requesterId);

  try {
    const arrivalTile = destinationArrivalTile(tileDocument);
    const groupRepresentation = await getGroupRepresentationForActorAsync(targetScene, actor);
    let cleanupSource = false;

    if (!groupRepresentation && arrivalTile) {
      const placement = await reconcileActorsAtArrival([actor], targetScene, arrivalTile);
      cleanupSource = placement.successfulActorIds.has(actor.id);
      if (!cleanupSource) {
        emitToUser("player-transition-failed", requesterId, { transitionId, reason: "CTN.Notifications.TokenTransferFailed" });
        authorityPlayerLocks.delete(requesterId);
        return;
      }
    }

    // If destination uses a D&D5e Group Token, player navigation is view-only
    // for token state: never move the collective token and never delete the
    // player's individual source Token.
    if (groupRepresentation) cleanupSource = false;

    const timer = setTimeout(() => {
      const pending = authorityPlayerTransitions.get(transitionId);
      if (!pending) return;
      authorityPlayerTransitions.delete(transitionId);
      authorityPlayerLocks.delete(requesterId);
      emitToUser("player-transition-failed", requesterId, {
        transitionId,
        reason: "CTN.Notifications.NavigationTimeout"
      });
    }, TRANSITION_TIMEOUT_MS);

    authorityPlayerTransitions.set(transitionId, {
      requesterId,
      sourceSceneId: sourceScene.id,
      targetSceneId: targetScene.id,
      actorId: actor.id,
      cleanupSource,
      timer
    });

    targetScene.pullUsers([requesterId]);
  } catch (error) {
    authorityPlayerLocks.delete(requesterId);
    console.error(`${MODULE_ID} | Player transition preparation failed`, error);
    emitToUser("player-transition-failed", requesterId, {
      transitionId,
      reason: "CTN.Notifications.NavigationFailed"
    });
  }
}

async function finalizePlayerTransition(message) {
  const pending = authorityPlayerTransitions.get(message.transitionId);
  if (!pending || pending.requesterId !== message.requesterId) return;
  if (pending.targetSceneId !== message.targetSceneId) return;

  clearTimeout(pending.timer);
  authorityPlayerTransitions.delete(message.transitionId);
  authorityPlayerLocks.delete(pending.requesterId);

  try {
    if (pending.cleanupSource) {
      const sourceScene = game.scenes.get(pending.sourceSceneId);
      if (sourceScene) {
        await deleteActorTokensFromScene(sourceScene, new Set([pending.actorId]));
      }
    }

    emitToUser("player-transition-complete", pending.requesterId, {
      transitionId: message.transitionId
    });
  } catch (error) {
    console.error(`${MODULE_ID} | Player source cleanup failed after successful arrival`, error);
    emitToUser("player-transition-complete", pending.requesterId, {
      transitionId: message.transitionId
    });
  }
}

function beginLocalPlayerTransition(tileDocument) {
  const nav = navData(tileDocument);
  const targetScene = resolveScene(nav?.targetSceneUuid);
  if (!targetScene) {
    notify("CTN.Notifications.MissingScene");
    return null;
  }

  const transitionId = randomTransitionId();
  const timeout = setTimeout(() => {
    if (!localPlayerTransitions.has(transitionId)) return;
    localPlayerTransitions.delete(transitionId);
    localNavigationInProgress = false;
    notify("CTN.Notifications.NavigationTimeout");
  }, TRANSITION_TIMEOUT_MS + 2_000);

  localPlayerTransitions.set(transitionId, {
    targetSceneId: targetScene.id,
    arrivedSent: false,
    timeout
  });

  localNavigationInProgress = true;
  void safePreload(targetScene, { broadcast: false });
  return transitionId;
}

function finishLocalPlayerTransition(transitionId, { reason = null } = {}) {
  const pending = localPlayerTransitions.get(transitionId);
  if (pending?.timeout) clearTimeout(pending.timeout);
  localPlayerTransitions.delete(transitionId);
  localNavigationInProgress = false;
  if (reason) notify(reason);
}

function handleLocalCanvasReady(readyCanvas) {
  if (game.user?.isGM || !localPlayerTransitions.size) return;
  const sceneId = readyCanvas?.scene?.id ?? canvas?.scene?.id;
  if (!sceneId) return;

  for (const [transitionId, pending] of localPlayerTransitions) {
    if (pending.arrivedSent || pending.targetSceneId !== sceneId) continue;
    pending.arrivedSent = true;
    game.socket.emit(SOCKET_NAME, {
      type: "player-transition-arrived",
      transitionId,
      requesterId: game.user.id,
      targetSceneId: sceneId
    });
  }
}

async function handleSocketMessage(message) {
  if (!message?.type) return;

  if (message.type === "player-transition-complete") {
    if (message.targetUserId !== game.user.id) return;
    finishLocalPlayerTransition(message.transitionId);
    return;
  }

  if (message.type === "player-transition-failed") {
    if (message.targetUserId !== game.user.id) return;
    finishLocalPlayerTransition(message.transitionId, { reason: message.reason });
    return;
  }

  const primaryGM = activePrimaryGM();
  if (!primaryGM || primaryGM.id !== game.user.id) return;

  if (message.type === "navigate") {
    const tileDocument = resolveTile(String(message.tileUuid ?? ""));
    if (!tileDocument) {
      emitToUser("player-transition-failed", message.requesterId, {
        transitionId: message.transitionId,
        reason: "CTN.Notifications.NavigationFailed"
      });
      return;
    }

    await preparePlayerTransition({
      tileDocument,
      requesterId: message.requesterId,
      transitionId: message.transitionId
    });
    return;
  }

  if (message.type === "player-transition-arrived") {
    await finalizePlayerTransition(message);
  }
}

export function initializeNavigationSocket() {
  game.socket.on(SOCKET_NAME, handleSocketMessage);
  Hooks.on("canvasReady", handleLocalCanvasReady);
}

export async function requestNavigation(tileDocument, { preview = false } = {}) {
  const nav = navData(tileDocument);
  if (!nav?.targetSceneUuid) return;

  if (localNavigationInProgress) {
    notify("CTN.Notifications.NavigationBusy");
    return;
  }

  if (!game.user.isGM && nav.triggerPermission !== TRIGGER_PERMISSION.EVERYONE) return;

  if (!game.user.isGM && !isUserWithinNavigationRange(game.user, tileDocument)) {
    notify("CTN.Notifications.PlayerTooFar");
    return;
  }

  if (game.user.isGM) {
    await performGMNavigation({ tileDocument, preview });
    return;
  }

  const primaryGM = activePrimaryGM();
  if (primaryGM) {
    const transitionId = beginLocalPlayerTransition(tileDocument);
    if (!transitionId) return;

    game.socket.emit(SOCKET_NAME, {
      type: "navigate",
      tileUuid: tileDocument.uuid,
      requesterId: game.user.id,
      transitionId
    });
    return;
  }

  // Without a connected GM, preserve view-only navigation, but still protect
  // the local Scene lifecycle. No Token creation or source cleanup is attempted.
  const targetScene = resolveScene(nav.targetSceneUuid);
  if (!targetScene) {
    notify("CTN.Notifications.MissingScene");
    return;
  }

  localNavigationInProgress = true;
  try {
    await safePreload(targetScene, { broadcast: false });
    const ready = waitForCanvasReady(targetScene.id);
    await targetScene.view();
    await ready;
    notify("CTN.Notifications.GMRequired");
  } catch (error) {
    console.warn(`${MODULE_ID} | Player fallback navigation failed`, error);
    notify("CTN.Notifications.NavigationFailed");
  } finally {
    localNavigationInProgress = false;
  }
}
