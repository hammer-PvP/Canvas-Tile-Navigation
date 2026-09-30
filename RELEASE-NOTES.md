# Canvas Tile Navigation 1.1.4

## Trigger Save UX
- Replaced CTN Roll Save with GM-only `PASS` / `NOT PASS` adjudication.
- The card still shows the configured Save ability and DC.
- Player rolls are no longer coupled to CTN Chat state.

## Damage application
- Added Half ×0.5 / Normal ×1 / Double ×2 selection after damage is rolled.
- Typed damage continues to be rolled component-by-component.
- Apply Damage uses the native D&D5e Actor damage API with the chosen multiplier so system resistance/vulnerability/immunity logic remains authoritative.

## Persistent Damage
- Fixed Active Hazard re-entry inheriting the initial Saving Throw.
- Revealed Persistent Damage areas now go directly to damage resolution on subsequent entries.

## Re-arm When Empty
- Reworked empty-area detection to scan actual Scene Tokens.
- The Tile stays revealed while any Token remains inside.
- When the final Token exits or is removed, initial visibility is restored and state returns to Armed.
- Ignore / Release of an initial event restores the initial Armed state.

## Arrival Sources
- Arrival usage now considers both Navigation Links and Trigger Tiles.
- Added `In Use` Arrival status.
- Arrival configuration lists all Incoming Sources and identifies Trigger Tile vs Navigation Link.
- Multiple Navigation Links may share one Arrival; linking one no longer evicts another source.

## Trigger on CTN Arrival
- CTN now explicitly evaluates an arrived Token against Trigger Tiles after safe materialization.
- Supports falling/teleporting onto a second armed trap or active hazard.
- Manual Actor Directory drag/drop remains outside this CTN arrival evaluation.
- Revealed Direct Transition areas are excluded from automatic arrival chaining to avoid transition loops.

## Arrival Area
- No placement redesign in this patch: the GM-drawn footprint behavior validated in 1.1.3 remains intact.
