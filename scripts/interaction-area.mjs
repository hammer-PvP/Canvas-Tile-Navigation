/**
 * Optional CTN interaction rectangle anchored to the Visual FX placement.
 * The FX never decides which mechanics run: this module only supplies their
 * hit-test geometry. Neither Sequencer nor an active animation is required.
 */
import { MODULE_ID } from "./constants.mjs";
import { resolveTile } from "./route-service.mjs";
import { tileBounds, tokenBounds } from "./token-service.mjs";

export function useFXInteractionArea(tile) {
  const fx = tile?.getFlag?.(MODULE_ID, "visualFX");
  return Boolean((fx?.enabled === true || fx?.enabled === "true")
    && (fx?.interactionAtFX === true || fx?.interactionAtFX === "true"));
}

export function interactionBounds(tile) {
  if (!tile) return null;
  if (!useFXInteractionArea(tile)) return tileBounds(tile);
  const fx = tile.getFlag(MODULE_ID, "visualFX") ?? {};
  const grid = Number(tile.parent?.grid?.size) || 100;
  const widthUnits = Number(fx.width);
  const heightUnits = Number(fx.height);
  const width = Number.isFinite(widthUnits) && widthUnits > 0 ? Math.min(widthUnits, 100) * grid : 3 * grid;
  const height = Number.isFinite(heightUnits) && heightUnits > 0 ? Math.min(heightUnits, 100) * grid : 3 * grid;
  let source = tile;
  if (fx.position === "other") {
    const other = resolveTile(String(fx.otherTileUuid ?? ""));
    if (other?.parent?.id === tile.parent?.id) source = other;
  }
  const base = tileBounds(source);
  let x = base.x + base.width / 2;
  let y = base.y + base.height / 2;
  if (fx.position === "custom" && Number.isFinite(Number(fx.point?.x)) && Number.isFinite(Number(fx.point?.y))) {
    x = Number(fx.point.x);
    y = Number(fx.point.y);
  }
  return { x: x - width / 2, y: y - height / 2, width, height };
}

export function interactionContainsPoint(tile, point) {
  if (!tile || !point) return false;
  if (!useFXInteractionArea(tile) && tile.shape?.testPoint) {
    try { return Boolean(tile.shape.testPoint(point)); } catch (_error) { /* bounds fallback */ }
  }
  const bounds = interactionBounds(tile);
  return Boolean(bounds && point.x >= bounds.x && point.x <= bounds.x + bounds.width
    && point.y >= bounds.y && point.y <= bounds.y + bounds.height);
}

export function tokenInsideInteraction(token, tile, position = null) {
  if (!token || !tile || token.parent?.id !== tile.parent?.id) return false;
  const bounds = tokenBounds(token);
  const center = {
    x: Number(position?.x ?? token.x) + bounds.width / 2,
    y: Number(position?.y ?? token.y) + bounds.height / 2
  };
  return interactionContainsPoint(tile, center);
}
