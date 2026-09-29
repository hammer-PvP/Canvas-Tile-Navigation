import {
  MODULE_ID,
  POINT_TYPES,
  ROUTE_MODES,
  ROUTE_STATUS,
  ROUTES_CHANGED_HOOK
} from "./constants.mjs";

let reconciling = false;
let reconcileQueued = false;
let initialized = false;
let knownIssues = new Set();
const pendingPairChanges = new Map();

export function navData(tile) {
  return tile?.getFlag?.(MODULE_ID, "navigation") ?? null;
}

export function pointType(tile) {
  return navData(tile)?.pointType ?? POINT_TYPES.LINK;
}

export function isNavigationLink(tile) {
  const nav = navData(tile);
  return Boolean(nav?.enabled && pointType(tile) === POINT_TYPES.LINK);
}

export function isArrivalPoint(tile) {
  const nav = navData(tile);
  return Boolean(nav?.enabled && pointType(tile) === POINT_TYPES.ARRIVAL);
}

export function allCTNTiles() {
  const result = [];
  for (const scene of game.scenes) {
    for (const tile of scene.tiles) {
      if (navData(tile)?.enabled) result.push(tile);
    }
  }
  return result;
}

export function allLinks() {
  return allCTNTiles().filter(isNavigationLink);
}

export function allArrivals() {
  return allCTNTiles().filter(isArrivalPoint);
}

export function resolveScene(uuid) {
  if (!uuid || typeof uuid !== "string") return null;
  const match = /^Scene\.([^.]+)$/.exec(uuid);
  const id = match?.[1] ?? uuid;
  return game.scenes.get(id) ?? null;
}

export function resolveTile(uuid) {
  if (!uuid || typeof uuid !== "string") return null;
  const match = /^Scene\.([^.]+)\.Tile\.([^.]+)$/.exec(uuid);
  if (!match) return null;
  const scene = game.scenes.get(match[1]);
  return scene?.tiles?.get(match[2]) ?? null;
}

function targetSceneOf(link) {
  return resolveScene(navData(link)?.targetSceneUuid);
}

export function getNextRouteIndex(sourceScene, targetSceneUuid) {
  const indexes = [...sourceScene.tiles]
    .filter((tile) => {
      const nav = navData(tile);
      return isNavigationLink(tile) && nav?.targetSceneUuid === targetSceneUuid;
    })
    .map((tile) => Number(navData(tile)?.routeIndex) || 1);
  return indexes.length ? Math.max(...indexes) + 1 : 1;
}

export function getDisplayLabel(tile) {
  const nav = navData(tile);
  if (!nav?.enabled) return "";

  const custom = String(nav.label ?? "").trim();
  if (custom) return custom;

  if (isArrivalPoint(tile)) {
    return game.i18n.localize("CTN.Arrival.DefaultLabel");
  }

  const target = resolveScene(nav.targetSceneUuid);
  const base = target?.name ?? game.i18n.localize("CTN.Label.MissingScene");
  const index = Math.max(1, Number(nav.routeIndex) || 1);
  return index > 1 ? `${base} — ${index}` : base;
}

export function getReverseCandidates(link, { includePaired = true } = {}) {
  if (!isNavigationLink(link)) return [];
  const nav = navData(link);
  const sourceScene = link.parent;
  const targetScene = resolveScene(nav?.targetSceneUuid);
  if (!sourceScene || !targetScene) return [];

  return [...targetScene.tiles].filter((candidate) => {
    if (!isNavigationLink(candidate)) return false;
    const cNav = navData(candidate);
    if (cNav?.targetSceneUuid !== sourceScene.uuid) return false;
    if (!includePaired && cNav?.pairedReturnLinkUuid) return false;
    return true;
  });
}

export function getArrivalPointsForScene(sceneOrUuid) {
  const scene = typeof sceneOrUuid === "string" ? resolveScene(sceneOrUuid) : sceneOrUuid;
  if (!scene) return [];
  return [...scene.tiles].filter(isArrivalPoint);
}

function compatiblePair(link, pair) {
  if (!link || !pair || !isNavigationLink(link) || !isNavigationLink(pair)) return false;
  const linkNav = navData(link);
  const pairNav = navData(pair);
  return link.parent?.uuid === pairNav?.targetSceneUuid
    && pair.parent?.uuid === linkNav?.targetSceneUuid;
}

export function getRouteStatus(tile) {
  const nav = navData(tile);
  if (!nav?.enabled) return null;

  if (isArrivalPoint(tile)) {
    const used = allLinks().some((link) => {
      const lNav = navData(link);
      return lNav?.routeMode === ROUTE_MODES.ONE_WAY
        && lNav?.oneWayArrivalUuid === tile.uuid;
    });
    return used ? ROUTE_STATUS.ONE_WAY : ROUTE_STATUS.UNUSED_ARRIVAL;
  }

  const target = resolveScene(nav.targetSceneUuid);
  if (!target) return ROUTE_STATUS.BROKEN;

  const mode = nav.routeMode ?? ROUTE_MODES.PAIRED;
  if (mode === ROUTE_MODES.ONE_WAY) {
    if (!nav.oneWayArrivalUuid) return ROUTE_STATUS.UNLINKED;
    const arrival = resolveTile(nav.oneWayArrivalUuid);
    if (!arrival || !isArrivalPoint(arrival) || arrival.parent?.uuid !== target.uuid) {
      return ROUTE_STATUS.BROKEN;
    }
    return ROUTE_STATUS.ONE_WAY;
  }

  if (nav.pairedReturnLinkUuid) {
    const pair = resolveTile(nav.pairedReturnLinkUuid);
    if (!pair || !compatiblePair(tile, pair)) return ROUTE_STATUS.BROKEN;
    const pNav = navData(pair);
    return pNav?.pairedReturnLinkUuid === tile.uuid
      ? ROUTE_STATUS.LINKED
      : ROUTE_STATUS.BROKEN;
  }

  const reverse = getReverseCandidates(tile, { includePaired: true });
  if (reverse.length) return ROUTE_STATUS.AMBIGUOUS;
  return ROUTE_STATUS.UNLINKED;
}

export function statusLabel(status) {
  const key = {
    [ROUTE_STATUS.LINKED]: "Linked",
    [ROUTE_STATUS.ONE_WAY]: "OneWay",
    [ROUTE_STATUS.UNLINKED]: "Unlinked",
    [ROUTE_STATUS.AMBIGUOUS]: "Ambiguous",
    [ROUTE_STATUS.BROKEN]: "Broken",
    [ROUTE_STATUS.UNUSED_ARRIVAL]: "UnusedArrival"
  }[status];
  return key ? game.i18n.localize(`CTN.RouteStatus.${key}`) : "";
}

export function destinationArrivalTile(link) {
  if (!isNavigationLink(link)) return null;
  const nav = navData(link);
  if ((nav?.routeMode ?? ROUTE_MODES.PAIRED) === ROUTE_MODES.ONE_WAY) {
    return resolveTile(nav?.oneWayArrivalUuid);
  }
  return resolveTile(nav?.pairedReturnLinkUuid);
}

async function updateTileFlags(tile, data) {
  if (!tile || !Object.keys(data).length) return;
  const update = {};
  for (const [key, value] of Object.entries(data)) {
    foundry.utils.setProperty(update, `flags.${MODULE_ID}.navigation.${key}`, value);
  }
  await tile.update(update, { ctnRouteSync: true });
}

async function migrateLegacyTiles() {
  if (!game.user?.isGM) return;

  for (const scene of game.scenes) {
    const groups = new Map();

    for (const tile of scene.tiles) {
      const nav = navData(tile);
      if (!nav?.enabled) continue;
      if ((nav.pointType ?? POINT_TYPES.LINK) !== POINT_TYPES.LINK) continue;
      const key = nav.targetSceneUuid ?? "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(tile);
    }

    for (const group of groups.values()) {
      group.sort((a, b) => {
        const at = Number(a._stats?.createdTime) || 0;
        const bt = Number(b._stats?.createdTime) || 0;
        return at - bt || String(a.id).localeCompare(String(b.id));
      });

      for (let i = 0; i < group.length; i += 1) {
        const tile = group[i];
        const nav = navData(tile);
        const changes = {};

        if (!nav.pointType) changes.pointType = POINT_TYPES.LINK;
        if (!nav.routeId) changes.routeId = foundry.utils.randomID();
        if (!nav.routeIndex) changes.routeIndex = i + 1;
        if (!nav.routeMode) changes.routeMode = ROUTE_MODES.PAIRED;
        if (nav.pairedReturnLinkUuid === undefined) changes.pairedReturnLinkUuid = "";
        if (nav.oneWayArrivalUuid === undefined) changes.oneWayArrivalUuid = "";
        if (!nav.labelDisplay) {
          changes.labelDisplay = game.settings.get(MODULE_ID, "defaultLabelDisplay");
        }

        if (Object.keys(changes).length) await updateTileFlags(tile, changes);
      }
    }

    for (const tile of scene.tiles) {
      const nav = navData(tile);
      if (!nav?.enabled || !isArrivalPoint(tile)) continue;
      const changes = {};
      if (!nav.arrivalId) changes.arrivalId = foundry.utils.randomID();
      if (!nav.labelDisplay) changes.labelDisplay = "always";
      if (Object.keys(changes).length) await updateTileFlags(tile, changes);
    }
  }
}

export async function pairLinks(link, pair) {
  if (!game.user?.isGM || !compatiblePair(link, pair)) return false;

  const oldA = resolveTile(navData(link)?.pairedReturnLinkUuid);
  const oldB = resolveTile(navData(pair)?.pairedReturnLinkUuid);

  if (oldA && oldA.uuid !== pair.uuid && navData(oldA)?.pairedReturnLinkUuid === link.uuid) {
    await updateTileFlags(oldA, { pairedReturnLinkUuid: "" });
  }
  if (oldB && oldB.uuid !== link.uuid && navData(oldB)?.pairedReturnLinkUuid === pair.uuid) {
    await updateTileFlags(oldB, { pairedReturnLinkUuid: "" });
  }

  await updateTileFlags(link, {
    routeMode: ROUTE_MODES.PAIRED,
    pairedReturnLinkUuid: pair.uuid,
    oneWayArrivalUuid: ""
  });
  await updateTileFlags(pair, {
    routeMode: ROUTE_MODES.PAIRED,
    pairedReturnLinkUuid: link.uuid,
    oneWayArrivalUuid: ""
  });

  scheduleRouteReconciliation();
  return true;
}

export async function setOneWay(link, arrival) {
  if (!game.user?.isGM || !isNavigationLink(link)) return false;
  const target = targetSceneOf(link);
  if (!target || !arrival || !isArrivalPoint(arrival) || arrival.parent?.uuid !== target.uuid) {
    return false;
  }

  const oldPair = resolveTile(navData(link)?.pairedReturnLinkUuid);
  if (oldPair && navData(oldPair)?.pairedReturnLinkUuid === link.uuid) {
    await updateTileFlags(oldPair, { pairedReturnLinkUuid: "" });
  }

  await updateTileFlags(link, {
    routeMode: ROUTE_MODES.ONE_WAY,
    pairedReturnLinkUuid: "",
    oneWayArrivalUuid: arrival.uuid
  });

  scheduleRouteReconciliation();
  return true;
}

export async function clearRouteResolution(link) {
  if (!game.user?.isGM || !isNavigationLink(link)) return;
  const pair = resolveTile(navData(link)?.pairedReturnLinkUuid);
  if (pair && navData(pair)?.pairedReturnLinkUuid === link.uuid) {
    await updateTileFlags(pair, { pairedReturnLinkUuid: "" });
  }
  await updateTileFlags(link, {
    routeMode: ROUTE_MODES.PAIRED,
    pairedReturnLinkUuid: "",
    oneWayArrivalUuid: ""
  });
  scheduleRouteReconciliation();
}

async function autoPairUnambiguousRoutes() {
  const links = allLinks();

  for (const link of links) {
    const nav = navData(link);
    if ((nav?.routeMode ?? ROUTE_MODES.PAIRED) !== ROUTE_MODES.PAIRED) continue;
    if (nav?.pairedReturnLinkUuid) continue;

    const candidates = getReverseCandidates(link, { includePaired: false });
    if (candidates.length !== 1) continue;

    const candidate = candidates[0];
    const reverseForCandidate = getReverseCandidates(candidate, { includePaired: false });
    if (reverseForCandidate.length !== 1 || reverseForCandidate[0].uuid !== link.uuid) continue;

    await pairLinks(link, candidate);
  }
}

function issueKey(tile, status) {
  return `${tile.uuid}:${status}`;
}

function notifyNewIssues() {
  if (!game.user?.isGM) return;

  const current = new Set();
  for (const link of allLinks()) {
    const status = getRouteStatus(link);
    if (![ROUTE_STATUS.UNLINKED, ROUTE_STATUS.AMBIGUOUS, ROUTE_STATUS.BROKEN].includes(status)) continue;

    const key = issueKey(link, status);
    current.add(key);
    if (knownIssues.has(key)) continue;

    const source = link.parent?.name ?? "?";
    const target = resolveScene(navData(link)?.targetSceneUuid)?.name
      ?? game.i18n.localize("CTN.Label.MissingScene");
    const message = game.i18n.format("CTN.Notifications.RouteIssue", {
      source,
      target,
      status: statusLabel(status)
    });
    ui.notifications.warn(message, { permanent: true });
  }

  knownIssues = current;
}

export async function reconcileRoutes({ notify = true } = {}) {
  if (!game.user?.isGM || reconciling) return;
  reconciling = true;
  try {
    await migrateLegacyTiles();
    await autoPairUnambiguousRoutes();
    if (notify) notifyNewIssues();
    Hooks.callAll(ROUTES_CHANGED_HOOK);
  } finally {
    reconciling = false;
  }
}

export function scheduleRouteReconciliation() {
  if (!game.user?.isGM || reconcileQueued) return;
  reconcileQueued = true;
  setTimeout(async () => {
    reconcileQueued = false;
    await reconcileRoutes();
  }, 50);
}

export async function locateTile(tile) {
  if (!tile?.parent) return;
  await tile.parent.view();
  setTimeout(() => {
    if (!canvas?.ready || canvas.scene?.id !== tile.parent.id) return;
    const center = tile.shape?.center ?? { x: tile.x, y: tile.y };
    canvas.animatePan({ x: center.x, y: center.y, scale: Math.max(canvas.stage?.scale?.x ?? 1, 1) });
  }, 100);
}

export async function openTileConfig(tile) {
  if (!tile) return;
  await locateTile(tile);
  setTimeout(() => tile.sheet?.render?.(true), 150);
}

export function getRouteManagerRows() {
  return allLinks()
    .sort((a, b) => {
      const sa = a.parent?.name ?? "";
      const sb = b.parent?.name ?? "";
      return sa.localeCompare(sb) || getDisplayLabel(a).localeCompare(getDisplayLabel(b));
    })
    .map((link) => {
      const nav = navData(link);
      const status = getRouteStatus(link);
      const target = resolveScene(nav?.targetSceneUuid);
      const pair = resolveTile(nav?.pairedReturnLinkUuid);
      const arrival = resolveTile(nav?.oneWayArrivalUuid);
      return {
        uuid: link.uuid,
        source: link.parent?.name ?? "",
        target: target?.name ?? game.i18n.localize("CTN.Label.MissingScene"),
        label: getDisplayLabel(link),
        status,
        statusLabel: statusLabel(status),
        resolution: pair
          ? getDisplayLabel(pair)
          : arrival
            ? getDisplayLabel(arrival)
            : "—",
        reverseCandidates: getReverseCandidates(link, { includePaired: true })
          .map((candidate) => ({
            uuid: candidate.uuid,
            label: `${candidate.parent?.name ?? ""}: ${getDisplayLabel(candidate)}`,
            selected: candidate.uuid === nav?.pairedReturnLinkUuid
          })),
        arrivals: getArrivalPointsForScene(target)
          .map((point) => ({
            uuid: point.uuid,
            label: getDisplayLabel(point),
            selected: point.uuid === nav?.oneWayArrivalUuid
          }))
      };
    });
}

export function registerRouteHooks() {
  if (initialized) return;
  initialized = true;

  Hooks.on("preUpdateTile", (tile, changes, options = {}) => {
    if (options.ctnRouteSync || !isNavigationLink(tile)) return;
    const base = `flags.${MODULE_ID}.navigation`;
    const paths = [
      `${base}.pairedReturnLinkUuid`,
      `${base}.routeMode`,
      `${base}.oneWayArrivalUuid`,
      `${base}.targetSceneUuid`
    ];
    if (!paths.some((path) => {
      return Object.prototype.hasOwnProperty.call(changes, path)
        || foundry.utils.getProperty(changes, path) !== undefined;
    })) return;

    pendingPairChanges.set(tile.uuid, {
      oldPairUuid: navData(tile)?.pairedReturnLinkUuid ?? ""
    });
  });

  Hooks.on("createTile", () => scheduleRouteReconciliation());

  Hooks.on("updateTile", (tile, changes, options = {}) => {
    if (options.ctnRouteSync) return;

    const pending = pendingPairChanges.get(tile.uuid);
    pendingPairChanges.delete(tile.uuid);

    if (pending && game.user?.isGM && isNavigationLink(tile)) {
      const nav = navData(tile);
      const oldPair = resolveTile(pending.oldPairUuid);
      const mode = nav?.routeMode ?? ROUTE_MODES.PAIRED;

      // Switching a paired route to One-Way must release the previous return
      // link immediately. Do not leave a reciprocal "ghost" pairing behind.
      if (mode === ROUTE_MODES.ONE_WAY) {
        if (oldPair && navData(oldPair)?.pairedReturnLinkUuid === tile.uuid) {
          void updateTileFlags(oldPair, { pairedReturnLinkUuid: "" });
        }
        if (nav?.pairedReturnLinkUuid) {
          void updateTileFlags(tile, { pairedReturnLinkUuid: "" });
        }
      } else {
        if (oldPair && oldPair.uuid !== nav?.pairedReturnLinkUuid
            && navData(oldPair)?.pairedReturnLinkUuid === tile.uuid) {
          void updateTileFlags(oldPair, { pairedReturnLinkUuid: "" });
        }

        if (nav?.oneWayArrivalUuid) {
          void updateTileFlags(tile, { oneWayArrivalUuid: "" });
        }

        if (nav?.pairedReturnLinkUuid) {
          const pair = resolveTile(nav.pairedReturnLinkUuid);
          if (pair && compatiblePair(tile, pair)) {
            const pNav = navData(pair);
            if (!pNav?.pairedReturnLinkUuid || pNav.pairedReturnLinkUuid === tile.uuid) {
              void updateTileFlags(pair, {
                routeMode: ROUTE_MODES.PAIRED,
                pairedReturnLinkUuid: tile.uuid,
                oneWayArrivalUuid: ""
              });
            }
          }
        }
      }
    }

    scheduleRouteReconciliation();
  });

  Hooks.on("deleteTile", () => scheduleRouteReconciliation());
  Hooks.on("deleteScene", () => scheduleRouteReconciliation());
}

export async function initializeRoutes() {
  await reconcileRoutes({ notify: true });
}
