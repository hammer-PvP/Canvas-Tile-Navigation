# Canvas Tile Navigation

**Canvas Tile Navigation (CTN)** is a Foundry VTT V14 module for fast visual Scene navigation, safe Token arrival, and deliberately small map-trigger workflows.

> Preparation first, navigation instantly during play.

## v1.1.4 — Trigger Resolution & Arrival Sources

This patch keeps the validated v1.1.3 Arrival Area behavior and focuses on live-test corrections to Trigger Tiles and Arrival diagnostics.

### Arrival Areas retained

- The GM-drawn Tile footprint remains the authority for Token placement.
- CTN fills authorized spaces first and stacks overflow inside the same Arrival Area.
- CTN does not deliberately spill travellers outside the GM-defined area.
- Horizontal, vertical, narrow, and irregular GM-authored Arrival footprints remain supported.

### Arrival Sources

A One-Way Arrival is now a reusable destination rather than an exclusive one-route endpoint.

An Arrival can be referenced by multiple sources at the same time:

- Navigation Links;
- Trigger Tiles.

Arrival status becomes **In Use** when at least one CTN source points to it. Its configuration shows **Incoming Sources**, including whether each source is a Navigation Link or Trigger Tile. Multiple Navigation Links may share the same Arrival.

### GM-only Save adjudication

Trigger Saves no longer roll automatically from the CTN card.

The private GM card shows the configured ability and DC, then exposes:

- **PASS**
- **NOT PASS**

The player may roll from their own sheet or by any other table method. The GM decides the result in CTN, and that decision unlocks the configured success/failure consequences.

### Native D&D5e damage application

Damage remains GM-controlled:

1. Roll Damage;
2. choose **Half ×0.5**, **Normal ×1**, or **Double ×2**;
3. Apply Damage.

CTN sends typed damage components plus the selected multiplier through the D&D5e Actor damage API, allowing the game system to apply native resistance, vulnerability, immunity, and other damage calculations.

### Persistent Damage state corrected

`Reveal and Become Persistent Damage Area` now has its own post-trigger behavior.

After the initial trap has been resolved and becomes an Active Hazard, later entries:

- may pause movement according to the Tile setting;
- do **not** repeat the initial Saving Throw;
- go directly to Roll Damage / Apply Damage / Release.

### Re-arm When Empty corrected

`Reveal and Re-arm When Empty` now recomputes actual Token occupancy from the Scene instead of relying on incremental in-memory tracking.

Expected lifecycle:

- hidden + armed;
- Token enters → reveal + resolve;
- Tile stays visible while any Token remains inside;
- last Token exits → Tile returns to initial visibility and `ARMED` state;
- next entry triggers the trap again.

`Ignore / Release` restores an initial trigger to its armed/initial-visibility state. Ignoring one activation of an already persistent damage area leaves the hazard active.

### Trigger after CTN arrival

Token creation/reposition performed internally by CTN still suppresses Trigger detection during document updates. After the CTN arrival is complete, CTN explicitly evaluates the final Token position.

This allows workflows such as:

- hidden pit in Scene A;
- failed Save → move to Bottom of Pit in Scene B;
- Bottom of Pit overlaps another armed Trigger;
- CTN creates a new GM Trigger event for the arrived Token.

Manual Actor Directory drag-and-drop is unchanged and is not converted into a CTN arrival event.

Revealed Direct Transition zones are intentionally not auto-chained by an arrival evaluation, preventing accidental automatic Scene-transition loops.

### Existing behavior retained

- Scene drag → Navigation Link.
- Shift-drop bypass for Foundry/other modules.
- GM normal gesture = collective commit.
- GM Shift + gesture = preview only.
- Player navigation = individual transition.
- D&D5e Group Actor roster/materialization.
- safe preload/canvas-ready lifecycle and source cleanup.
- Arrival Areas and overflow stacking.
- Route Manager / Check Routes.
- movement pause/release recovery.
- stateful Trigger Tile reveal, transition, persistent hazard, and re-arm modes.
