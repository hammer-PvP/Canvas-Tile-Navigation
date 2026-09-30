# Canvas Tile Navigation

**Canvas Tile Navigation (CTN)** is a Foundry VTT V14 module for fast visual Scene navigation, safe Token arrival, and deliberately small map-trigger workflows.

> Preparation first, navigation instantly during play.

## v1.1.3 — Arrival Areas + Stateful Trigger Tiles

### Arrival Areas

Arrival placement now treats the **GM-drawn Tile footprint as the authority**.

- Resize a One-Way Arrival or paired return Navigation Link to define exactly where arriving Tokens may be placed.
- On square/hex grids CTN fills grid spaces whose centers are inside that footprint.
- On gridless Scenes CTN builds compact pseudo-slots inside the Tile bounds.
- CTN uses every free authorized slot before stacking.
- Overflow stacks are balanced **inside the Arrival Area**; CTN never deliberately spills travellers outside the GM-defined area.
- Existing unrelated Tokens are avoided while free Arrival positions exist.
- Group Tokens use the same Arrival Area logic.
- No Wall/pathfinding analysis is attempted: the GM defines the safe area explicitly.

This keeps cave entrances, corridors, stairs, and narrow landing areas predictable.

### Trigger Tiles

Tiles controls now include **Create Trigger Tile**. A Trigger Tile can be a simple walk-over Scene transition, a hidden trap, a save-based hazard, a persistent damage area, or a re-arming trap.

The GM supplies the Tile image using Foundry's native Tile Appearance controls. CTN stores behavior in Tile flags.

Trigger configuration includes:

- Initial visibility: hidden or visible.
- Movement: continue or pause until the GM resolves the Trigger.
- Optional D&D5e saving throw with ability + DC.
- Zero or more damage components with formula + damage type.
- Damage condition: always, failed save, successful save, or full on failure / half on success.
- Optional Scene transition with a destination Arrival.
- Transition condition: always, failed save, or successful save.
- Reveal condition: never, on trigger, on failed save, or on successful save.
- Post-trigger behavior: disable, remain visible, become direct transition, become persistent damage area, re-arm when empty, or remain an active trap.

### GM-only resolution cards

A normal trap trigger creates a private GM Chat card. Depending on configuration it exposes only relevant actions:

- Roll Save
- Roll Damage
- Apply Damage
- Move Token
- Release Token
- Ignore / Release

CTN does not silently apply damage. The GM chooses when to roll and when to apply it.

D&D5e save rolls use the live Actor. Damage is rolled per configured component and applied through the D&D5e Actor damage API so damage types remain distinct.

### Movement lock

When **Pause Until GM Resolves** is enabled, CTN cancels the attempted movement at the first detected Trigger entry, places the Token at the Trigger edge/area, and marks it as CTN-locked. Further normal movement is rejected until the GM resolves or releases it.

Tiles controls also include **Release Paused Tokens** as a recovery action.

### Stateful traps

Trigger Tiles persist their state in Tile flags:

- Armed
- Triggered
- Revealed
- Active Hazard
- Disabled

Examples:

**Hidden pit:** hidden → save → failure → damage/transition → reveal → direct transition. Once revealed, later Tokens can simply step into the pit to use the configured transition.

**Retracting spikes:** hidden/armed → trigger → reveal + save/damage → re-arm when the last Token leaves → hidden/armed again.

**Persistent hazard:** first trigger reveals the Tile; later entries continue creating GM damage-resolution cards.

### Scene transitions from Triggers

Trigger-driven movement reuses the safe individual transition infrastructure introduced in 1.1.2:

- live Actor authority;
- Prototype Token creation when needed;
- existing destination Token reuse;
- Arrival Area placement;
- player Scene loading handshake;
- source cleanup only after successful destination loading;
- D&D5e Group-token destination protection.

A Trigger only moves the Token/Actor that entered it. It never performs the GM collective-party commit behavior.

### System compatibility

Navigation, Arrival Areas, Trigger entry/reveal/state, movement locking, and pure Scene transitions remain system-agnostic.

Save and typed-damage actions currently use the **D&D5e adapter**. On other systems, Trigger Tiles can still perform transition/state workflows without D&D5e rule automation.

## Existing navigation behavior retained

- Scene drag → Navigation Link.
- Hold Shift after starting the drag to bypass CTN for Foundry/other modules.
- GM normal gesture = collective commit.
- GM Shift + gesture = preview only.
- Player navigation = individual transition.
- D&D5e Group Actor membership controls collective travel.
- Route pairing, One-Way Arrival, Incoming Route, Route Manager, Check Routes, labels, diagnostics, and contextual hover help remain intact.
