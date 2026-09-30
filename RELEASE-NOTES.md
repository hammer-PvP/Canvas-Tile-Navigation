# Canvas Tile Navigation 1.1.3

## Arrival Areas
- Replaced radial/ring Token placement with GM-authored Arrival Areas.
- The Arrival/return Tile footprint defines the only authorized placement area.
- Grid slots inside the footprint are used before any stack occurs.
- Overflow stacks remain inside the Arrival Area.
- Existing unrelated Tokens are avoided while free authorized positions exist.
- Group Token placement uses the same rules.

## Trigger Tiles
- Added Tiles → Create Trigger Tile.
- Trigger Tiles support On Enter behavior, initial hidden/visible state, optional movement lock, D&D5e save, multiple typed damage components, optional Scene transition, reveal conditions, and persistent post-trigger state.
- Added reset/re-arm control in Trigger Tile configuration.
- The GM selects the trap/hazard image using native Tile Appearance controls.

## GM resolution
- Trigger resolution is sent as GM-only Chat.
- Save/damage are not silently applied.
- Buttons are exposed contextually for Roll Save, Roll Damage, Apply Damage, Move Token, Release Token, and Ignore/Release.
- D&D5e saves use `Actor.rollSavingThrow`; typed damage application uses the live Actor damage API.

## Movement protection
- Pause Until GM Resolves prevents players from running through an unresolved Trigger.
- A CTN Token lock rejects additional normal movement until release.
- Added Tiles → Release Paused Tokens recovery action.
- CTN internal arrival/transfer movements suppress Trigger activation.

## Stateful traps
- Persistent states: Armed, Triggered, Revealed, Active Hazard, Disabled.
- After-trigger modes: Disable, Remain Visible, Direct Transition, Persistent Damage, Re-arm When Empty, Remain Active Trap.
- Re-arm When Empty can hide the Tile again once the last Token leaves.
- Revealed Direct Transition areas automatically use the configured Scene/Arrival on later entry.

## Transition reuse
- Trigger transitions reuse the safe 1.1.2 individual Actor transfer and canvas-ready cleanup lifecycle.
- A Trigger moves only the Actor that entered it; it never pulls the whole party.
