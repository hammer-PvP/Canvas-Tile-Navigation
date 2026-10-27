## v1.1.17 — Visual FX layers (QA candidate)

- Added one Visual FX group with up to 16 independently configurable JB2A layers.
- Each collapsible layer has its own JB2A selection, local preview, Canvas editor, position, size and rotation.
- Move Up / Down controls determine Sequencer Z-index. Expand All / Collapse All are interface-only.
- All configured layers start in parallel on the existing event and share the original lifetime, fade and repeat policy.
- The original first effect remains mechanically authoritative: existing Effect Area, damage, saving throws and teleporting are unchanged. Extra layers are visual-only.
- Older single-FX Tiles retain their original configuration without migration. Additional layers are stored in a separate JSON flag.
- Corrected the playback angle sign so the Sequencer visual matches the GM's PixiJS editor orientation (requires Foundry QA).
- Kept experimental Foundry V13 support and established V14 integration intact; no JB2A media distributed.

**QA:** source-level regression and simulated Sequencer tests only. Not verified in a live Foundry world.

## [1.1.16] — Trigger Toggle FX, GM Remote Control, FX Rotation, Foundry V13 (experimental) (2026-10-26)

- Fix: Toggle OFF now explicitly terminates the Trigger's Visual FX even when no mechanical Effect Area, Save, Damage or Scene Transition is configured. Existing completed consequences are not reversed.
- Trigger double-click: optional GM-only permissions to activate with no Token and/or ignore selected Token distance. Both default OFF for backwards compatibility. No-Token activation is primary-GM-local only and never uses the ordinary player request socket.
- No-Token clicks control activation/linked mechanisms/Visual FX, without inventing an actor or applying Token-specific Save, Damage or Transfer.
- Visual FX editor: rotation field, dedicated rotation handle, animated GM-local Pixi preview while moving, scaling and rotating, Shift for aspect-ratio resize and 15-degree angle snap, Apply/Cancel. Rotation changes presentation only, not the Trigger, Tile or Effect Area hitbox.
- Runtime Sequencer FX applies the saved visual rotation. Existing Tiles default to 0 degrees.
- Compatibility declaration: minimum Foundry V13.351, verified V14. V13 is **experimental/pending user QA**; v1.1.15 remains the approved V14 baseline.
- No changes to navigation, One-Way Arrival, Trigger Save/Damage, Transition, Linked Activation, FX browser filtering or pagination.

## 1.1.15 — Toggle Activation (QA)

### Added

- Optional **Toggle Activation On / Off** on Trigger Tiles, for Enter or Double-click activation.
- Each consecutive valid activation alternates the source mechanism ON/OFF. State changes are serialized per Tile to prevent concurrent clients from double-opening.
- A closing activation disables a dependent remote Effect Area and direct Linked Activation receivers without reversing any previously resolved Saving Throw, Damage, Teleport or one-shot Visual FX.
- ON activation preserves all existing source-area consequences; pure lever/plate switches do not emit an empty GM resolution card.
- Existing After Trigger preference is retained and temporarily not executed in Toggle mode.
- Reset closes the dependent Effect Area and linked receivers before rearming.

### Compatibility / QA

- Toggle is OFF by default on all existing and newly created Trigger Tiles, preserving v1.1.14 mechanics.
- Existing Scene navigation, One-Way Arrival, damage, saves, FX lifetimes and GM confirmation / automatic transitions remain unchanged outside the opt-in path.
- This is a QA candidate; runtime Foundry V14 validation remains required.

## v1.1.14 — Effect Area lifetime and safe portal closure (QA, 2026-10-24)

- The interactive Effect Area follows the Visual FX lifetime configured for `On Activation` rather than remaining mechanically ACTIVE after the animation has ended.
- Fixed Seconds: closes the portal on its deadline; Natural Animation Duration: closes on normal playback completion (60-second fail-safe if playback completion is lost); While Activating Token Is Inside: follows the activating Token in the original Trigger area; While Area Is Occupied: follows occupancy in the remote FX footprint (waits for first visitor, then closes when the last occupant departs after a short movement-commit grace); Persistent: remains active until GM closes/resets.
- Each opening has a persisted session ID; stale video callbacks and older chat cards can never reauthorize a new portal or close a newer opening.
- Closing a portal (including Stop Active FX) stops only its Tile's FX and blocks late manual/automatic transfers. Missing/failed FX launch closes visually governed portals rather than leaving invisible active portals.
- Existing pre-1.1.14 Effect Areas without a lifecycle session fail closed after upgrade; the GM must reopen/retrigger them.
- Preserves independent Trigger rearming, original activation Tile, remote Effect Area, On Effect Area Save/Damage/Transition, one-way arrivals and navigation.
- QA release candidate only; interactive GM/player Foundry V14 + Sequencer/JB2A validation remains necessary.

## v1.1.13d — Trigger and FX Area separation (QA)

- Trigger activation always belongs to the original Tile, by Token entry or optional double-click; when linked to another Trigger, the existing cross-Tile activation feature remains available at the top of the Trigger configuration.
- Saving Throw, Damage and Scene Transition now each offer an independent **On Effect Area** option. The original area opens the effect zone; it no longer gets replaced by the Visual FX rectangle.
- Effect Area has an independent active state, which can be opened/closed by the GM; normal Trigger rearm does not close an open portal. Reset closes it.
- Saving Throw on the Effect Area resolves for the Token entering that area, not the character who opened it.
- Scene Transition supports GM confirmation or automatic actor transfer, using the pre-existing Destination Scene/Arrival and one-way route machinery.
- Distinct movement detection for original and FX area, including overlap protection; preserve earlier effects and route mechanics by default.
- Linked Activation moved to the top of Trigger Tile settings; previous options remain for independent target Tiles.
- Compact Trigger checkboxes and filter fields for Destination Scene and Arrival selections.

# Changelog

## 1.1.13c — Interactive Visual FX area and Linked Activation (QA, 2026-10-24)

- Optional checkbox on Trigger/Transition Tiles: use the Visual FX rectangle as the **single** interaction area instead of the original Tile bounds. Existing Save, Damage, Transition, pairing and activation gestures remain authoritative.
- Same-scene Linked Activation: an existing Trigger can awaken a dormant Trigger or Transition Tile, without introducing a new macro system or duplicating mechanics. GM can toggle active state manually.
- New optional Visual FX event `On Linked Activation`, suitable for persistent portal/hazard FX. Sequencer remains optional for the mechanics.
- Old Tiles remain configured for their original Tile area with Linked Activation OFF.
- QA only: validate on real Foundry V14 with GM/player clients, collisions, hidden Tiles, Scene changes and Sequencer lifetime.

## 1.1.13b — JB2A browser filters and paging (QA, 2026-10-24)

- Search is performed over the entire installed JB2A Sequencer Database, with 100 results rendered per page rather than a hard 180-item cap.
- Compact First, Previous, direct page number/Go, Next and Last navigation.
- Optional Category, Color, Shape, Variation and Distance filters, each with an All setting. Filter options are inferred from installed database paths; unclassified effects remain accessible with All.
- Local animated preview and explicit effect confirmation are preserved. No change to the FX runner, Tile mechanics, Scene transitions or canvas editor.
- QA build: requires real Foundry V14 + Sequencer/JB2A testing before approval.


All notable changes to Canvas Tile Navigation are documented here, with the newest version first.

## 1.1.13a — PixiJS 7 canvas editor fix (2026-10-24)

- Fix FX footprint editor drawing and resize handles in Foundry V14 (PixiJS 7).
- Draw the editor in the canvas interface layer and clean up the overlay on close/error.
- No change to Tile hitboxes, movement behavior, or other feature configuration.

## 1.1.13 — Visual FX refinements (2026-10-23)

- Carries forward the Trigger Tile progressive-option checkboxes and dependency protections approved in the v1.1.12 QA build.
- Conditional Visual FX: explicit unlimited looping for persistent occupancy, movement grace and occupancy polling, including paused/crossing Token movements.
- Remote Visual FX: start acknowledgment and timeout cleanup to avoid stale "one active effect" locks when a player has the Scene loaded and the GM does not.
- JB2A browser: live animated GM-only media preview while browsing; explicit selection/confirmation without changing the Tile until confirmation.
- FX canvas editor: move + resize four corners across multiple interactions, Apply/Cancel, width/height independent of CTN Tile hitbox.
- Sequencer/JB2A remain optional. No third-party visual media included.

## 1.1.12

### Added

- Optional Sequencer + JB2A Visual FX for CTN Navigation, Arrival, Trigger, and Transition Tiles.
- A single Enable Visual FX checkbox reveals the contextual FX editor only when enabled.
- Installed JB2A effect search, per-Tile event selection, a local preview, independently sized and positioned FX, and canvas placement with movable/resizable bounds.
- Duration modes: natural playback, fixed seconds, activating Token inside area, any Token occupying area, and persistent until reset/state change.
- Configurable entry fade, instant or faded ending, and one effect per Tile versus independent activations.
- GM-authoritative event dispatch and selective cleanup by Tile UUID; no bundled JB2A assets or new mandatory dependencies.

### Preserved

- Transition pairing, movement, Trigger state/save/damage, Navigation, Arrivals, party/group, and Route Manager mechanics are unchanged.

## 1.1.11

### Fixed

- Hidden **Transition Tiles** configured with **Enter Area** once again trigger correctly for player-controlled Tokens.
- Hidden visibility still blocks player **Single Click** and **Double Click** activation, but no longer blocks movement-based activation.

## 1.1.10

### Added

- Dedicated **Canvas Tile Navigation** tab in native Tile Configuration for CTN Tiles.
- World-level Default CTN Asset Folder configuration using Foundry's native File Picker.
- Tile image picker inside Trigger and Transition CTN tabs, opening from the configured default folder when available.

### Fixed

- Transition Effect now animates the Token placeable container instead of native TokenMesh texture scaling, preventing Token size growth after repeated trips.

### Preserved

- Navigation, Arrival, Trigger, Save, Damage, Group, Route Manager, and Transition travel rules are unchanged.

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
