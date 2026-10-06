# Changelog

All notable changes to Canvas Tile Navigation are documented here, with the newest version first.

## 1.1.9

### Added

- Transition Tiles as explicit exclusive 1 ↔ 1 passage pairs.
- Transition creation tool under Foundry's native Tiles controls.
- Same-Scene and cross-Scene individual Token transitions.
- Single Click, Double Click, and Enter Area activation modes.
- Manual visibility and optional Token shrink/grow transition effect.
- Connected / Disconnected / Broken status and reciprocal Disconnect behavior.
- Transition names unique per Scene and `Name (Scene)` pairing labels.

### Preserved

- Existing Navigation Link, One-Way Arrival, Trigger, Damage, Save, Group, and Route Manager behavior is unchanged.

## 1.1.8

### Changed

- Distribution package normalized to retain only the module's basic navigation icons.

### Removed

- Bundled hole, trap, hazard, and internal placeholder image libraries.

## 1.1.7

### Changed

- Trigger damage is no longer rolled or applied automatically when PASS / NOT PASS makes damage eligible.
- Entering an active Persistent Hazard no longer rolls or applies damage automatically.
- The GM now explicitly starts every eligible damage occurrence with **Roll Damage**.
- In D&D5e, **Roll Damage** keeps the public roll and native typed `Actor5e.applyDamage()` application.
- Generic systems keep the existing CTN Roll / multiplier / Apply workflow.

### Fixed

- Persistent hazards can now be intentionally ignored for a specific occurrence by releasing the Token without rolling damage.

## 1.1.6

### Added

- Stateful Saving Throw capability with separate **Initial Save State** and **Current Save State** (`ON` / `OFF`).
- Persistent Hazard option to turn Save State OFF when the hazard activates.
- D&D5e native typed damage application through the Actor damage pipeline.
- Public D&D5e damage roll messages while Trigger Resolution remains GM-only.
- Root `README.md` as the maintained module guide.
- Root `CHANGELOG.md` as the maintained version history.

### Changed

- `Release Token` now performs movement unlock only and never mutates Trigger state, visibility, re-arm state, Save state, or post-trigger behavior.
- PASS / NOT PASS and Trigger configuration now drive Trigger state transitions independently from movement release.
- Persistent damage areas can skip subsequent Saving Throws through mutable Save State instead of a hard-coded mode check.
- Re-arming restores the Trigger's configured initial Save State.
- Reveal conditions now own Tile visibility; post-trigger state changes no longer reveal a Tile as a side effect.
- In D&D5e, eligible Trigger damage is rolled publicly and applied automatically to the Actor that entered the Trigger.
- Generic CTN damage controls remain available when no native game-system adapter is used.

### Fixed

- Releasing a Token no longer reveals a Tile configured to reveal only on failure.
- Releasing a Token no longer disables or resets an already active persistent hazard.
- Activated hazards no longer repeatedly request a Save when their Current Save State has been turned OFF.
- Older active persistent hazards without a saved runtime Save State migrate to the new default Save-OFF behavior when appropriate.

## 1.1.5

### Added

- First bundled runtime asset library for holes, traps, and hazards.

### Changed

- D&D5e Group Actor membership became the authority for collective GM travel.
- Group members are no longer filtered through `User.character`.
- If no applicable Group exists, D&D5e falls back to `character` Actors physically present in the source Scene.
- `User.character` is used for player-client routing rather than physical party roster membership.
- Ambiguous Group selection warns the GM instead of guessing.

### Fixed

- GM-only test worlds can transfer party members without requiring non-GM Users.
- Existing destination Tokens continue to be reused instead of duplicated.

## 1.1.4

### Added

- Incoming Sources model for Arrivals.
- PASS / NOT PASS GM adjudication for Trigger saves.
- Persistent damage state handling.
- Trigger evaluation after CTN-controlled Token arrival.
- D&D5e typed damage application with multiplier support.

### Changed

- One Arrival can receive multiple Navigation Link and Trigger sources.
- Re-arm logic uses actual Scene Token occupancy.

## 1.1.3

### Added

- Arrival Areas with Token distribution constrained to the GM-drawn Tile footprint.
- Trigger Tiles with movement pause, save, damage, reveal, transition, and post-trigger state behavior.
- Persistent Trigger states.

## 1.1.2

### Added

- D&D5e Group Actor-aware party transfer.
- Safe Scene transition lifecycle using destination readiness instead of fixed delays.
- Live Actor / Prototype Token materialization.

### Fixed

- Prevented Scene switching while the previous/current view was still loading.

## 1.1.1

### Changed

- Refined GM commit, GM preview, and player self-navigation semantics.
- Improved Route Manager UX and initial Token placement.

## 1.1.0

### Added

- Destination labels.
- Route Manager / Check Routes.
- One-Way Arrivals.
- Player proximity requirements.
- GM preview navigation.
- Token arrival handling.

## 1.0.0

### Added

- Stable Canvas-based Scene navigation core.
- Scene drag-and-drop Navigation Tile creation.
- Thumbnail and built-in icon display modes.
- Configurable navigation gestures.
- Shift-drop bypass for Foundry/other-module handling.
- Full native Tile hit area interaction.
