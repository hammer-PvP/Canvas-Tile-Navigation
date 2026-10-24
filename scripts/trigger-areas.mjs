/** Separate the original activation Tile from the optional Visual FX consequence zone.
 * Effects supply geometry only. Playback never grants/removes mechanical permissions.
 */
import { tileBounds, tokenBounds } from './token-service.mjs';

export const TRIGGER_AREA = Object.freeze({ SOURCE: 'source', EFFECT: 'effect' });
export const isOn = value => value === true || value === 'true';

export function triggerAreaBounds(tile, area = TRIGGER_AREA.SOURCE) {
  if (!tile) return null;
  if (area === TRIGGER_AREA.SOURCE) return tileBounds(tile);
  // interactionBounds uses the geometry stored by the Canvas FX editor.
  // Force the FX rectangle independently of the former global substitution flag.
  const fx = tile.getFlag?.('canvas-tile-navigation', 'visualFX') ?? {};
  const grid = Number(tile.parent?.grid?.size) || 100;
  const w = Number(fx.width), h = Number(fx.height);
  const width = (Number.isFinite(w) && w > 0 ? Math.min(w, 100) : 3) * grid;
  const height = (Number.isFinite(h) && h > 0 ? Math.min(h, 100) : 3) * grid;
  const base = tileBounds(tile);
  let x = base.x + base.width/2, y = base.y + base.height/2;
  if (fx.position === 'other' && fx.otherTileUuid) {
    try {
      const other = fromUuidSync(fx.otherTileUuid);
      if (other?.documentName === 'Tile' && other.parent?.id === tile.parent?.id) {
        const target = tileBounds(other);
        x = target.x + target.width/2; y = target.y + target.height/2;
      }
    } catch (_error) { /* unchanged origin */ }
  }
  if (fx.position === 'custom' && Number.isFinite(Number(fx.point?.x)) && Number.isFinite(Number(fx.point?.y))) {
    x = Number(fx.point.x); y = Number(fx.point.y);
  }
  return { x: x-width/2, y: y-height/2, width, height };
}

export function containsTriggerArea(tile, point, area = TRIGGER_AREA.SOURCE) {
  if (!tile || !point) return false;
  if (area === TRIGGER_AREA.SOURCE && tile.shape?.testPoint) {
    try { return !!tile.shape.testPoint(point); } catch (_error) { /* fallback */ }
  }
  const bounds = triggerAreaBounds(tile, area);
  return !!bounds && point.x >= bounds.x && point.x <= bounds.x+bounds.width && point.y >= bounds.y && point.y <= bounds.y+bounds.height;
}

export function tokenInsideTriggerArea(token, tile, area = TRIGGER_AREA.SOURCE, position = null) {
  if (!token || !tile || token.parent?.id !== tile.parent?.id) return false;
  const bounds = tokenBounds(token);
  return containsTriggerArea(tile, {
    x: Number(position?.x ?? token.x) + bounds.width/2,
    y: Number(position?.y ?? token.y) + bounds.height/2
  }, area);
}

/** Build area-specific rule scope without changing the Tile's stored settings.
 * A Save resolved here belongs to the Token entering *this* area.
 */
export function scopedTriggerData(data, area = TRIGGER_AREA.SOURCE) {
  if (!data) return null;
  const onEffect = area === TRIGGER_AREA.EFFECT;
  const applies = (key) => isOn(data[key]) === onEffect;
  const saveEnabled = Boolean(data.saveEnabled && applies('saveOnEffectArea'));
  return {
    ...data,
    saveEnabled,
    saveState: saveEnabled ? (onEffect ? 'on' : data.saveState) : 'off',
    damageEnabled: Boolean(data.damageEnabled && applies('damageOnEffectArea')),
    transitionEnabled: Boolean(data.transitionEnabled && applies('transitionOnEffectArea'))
  };
}

export function hasEffectConsequences(data) {
  return Boolean(data && (data.saveEnabled && isOn(data.saveOnEffectArea)
    || data.damageEnabled && isOn(data.damageOnEffectArea)
    || data.transitionEnabled && isOn(data.transitionOnEffectArea)));
}
