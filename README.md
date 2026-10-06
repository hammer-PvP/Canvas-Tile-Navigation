# Canvas Tile Navigation

**Canvas Tile Navigation (CTN)** is a Foundry VTT V14 module for building visual Scene-to-Scene navigation directly on the Canvas.

Its core idea is simple:

> **Preparation first, navigation instantly during play.**

Drag Scenes onto maps, turn Tiles into navigation links and arrival areas, inspect route health, and optionally use lightweight Trigger Tiles for traps, hazards, falls, portals, and other spatial interactions.

CTN keeps a system-agnostic core whenever Foundry already provides everything required. When D&D5e is available, CTN uses targeted system adapters for features where the game system can do a better job, such as Group Actor party membership and native typed damage application.

---

## Features

- Drag a Scene from the Scene Directory onto the Canvas to create a Navigation Tile.
- Scene thumbnail or built-in navigation icon display.
- Configurable navigation gesture.
- Paired A ↔ B routes and one-way navigation.
- One-Way Arrival points and reusable Arrival Areas.
- GM route diagnostics through **Check Routes**.
- Destination labels: Off, Hover, or Always.
- GM collective navigation and GM-only preview.
- Player self-navigation with proximity checks when allowed.
- Transition Tiles for explicit 1 ↔ 1 player-controlled passages.
- D&D5e Group Actor-aware party travel.
- Safe Token transfer with existing destination Token reuse.
- Trigger Tiles for saves, damage, reveal, movement pause, persistent hazards, and Scene transitions.
- D&D5e native typed damage application.
- Generic CTN damage controls for systems without a dedicated adapter.
- Designed to coexist with automation modules rather than replace a full automation engine.

---

## Installation

Install the module using the Foundry VTT module manifest or the release ZIP.

After enabling **Canvas Tile Navigation** in a World, configure global defaults under **Game Settings → Configure Settings → Module Settings**.

CTN is developed for **Foundry VTT V14**.

The navigation and Trigger core does not require D&D5e. Enhanced D&D5e integration is used automatically when the active game system is D&D5e.

---

# Core Concepts

## Navigation Links

A Navigation Link is a native Foundry Tile carrying CTN navigation data.

The normal creation workflow is:

1. Open the Scene Directory.
2. Drag a Scene onto the current Canvas.
3. CTN creates a Navigation Tile at the drop location.
4. Move or resize it using normal Foundry Tile controls.
5. Use the configured navigation gesture during play.

Existing Tiles keep the values copied into them when they were created. Changing global defaults does not silently rewrite existing navigation Tiles.

### Shift drop bypass

CTN normally owns Scene drops used to create Navigation Tiles.

To bypass CTN, start the drag normally and hold **Shift before releasing the drop**. Foundry or another compatible module can then handle the drop instead.

---

## Display Modes

Navigation Tiles can use:

- **Scene Thumbnail**
- **Icon**

The built-in navigation icon set includes:

- Generic Arrow
- Enter Door
- Exit Door
- Stairs Up
- Stairs Down
- Return / Back

Icon tint can be configured globally and then adjusted using normal Tile appearance controls.

---

## Navigation Gestures

The global navigation gesture can be configured as:

- Single left click
- Double left click
- Middle click
- Alt + left click
- Ctrl + left click

The default is double left click.

---

# Routes and Arrivals

## Paired Routes

CTN can represent a normal reciprocal route:

```text
Scene A  ↔  Scene B
```

When two links form an unambiguous pair, CTN can associate them as the departure and arrival locations for that route.

Route names and labels follow the current destination Scene name dynamically unless a custom label is configured.

---

## One-Way Arrivals

A **One-Way Arrival** is an insertion location rather than a clickable navigation link.

Typical uses include:

- a pit landing point;
- the bottom of a ladder;
- a portal destination;
- a trap destination;
- a Scene entry that should not automatically create a return route.

One Arrival may receive multiple incoming CTN sources. For example, the same Arrival can be used by both a Navigation Link and a Trigger Tile.

---

## Arrival Areas

The physical footprint of an Arrival Tile is the authority for Token placement.

If the GM draws a long corridor-shaped Arrival, CTN fills that corridor. If the Arrival is a square, CTN fills the square.

CTN does not force a fixed square formation.

When possible, Tokens are distributed into available positions inside the Arrival footprint. If there are more Tokens than practical positions, CTN stacks the overflow **inside the allowed Arrival Area** rather than spilling Tokens outside it.

CTN does not perform Wall pathfinding for Arrival placement.

---

# GM Navigation

## Commit

The GM's normal configured navigation gesture performs a collective commit.

CTN:

1. resolves the destination and Arrival;
2. determines the travelling party;
3. prepares or reuses destination Tokens;
4. activates the destination Scene;
5. waits for the destination Canvas lifecycle;
6. removes successfully transferred source Tokens;
7. moves relevant connected users to the destination.

The transition lifecycle is intentionally coordinated with Foundry's Scene loading rather than relying on a fixed delay.

---

## Preview

**Shift + the configured navigation gesture** is GM preview.

Preview:

- changes only the GM's view;
- does not activate the destination Scene for the table;
- does not transfer Tokens;
- does not pull players.

---

# Player Navigation

When a Navigation Tile is available to players, a player navigation action is individual.

A player never activates the Scene for the whole table and never pulls the full party.

Player interaction requires the player's relevant position to be on or adjacent to the Navigation Tile. In D&D5e Group-token Scenes, the Group Token can represent the player's position when the player's assigned character belongs to that Group.

---

# Transition Tiles

Transition Tiles are explicit, player-facing passages between two points. They are separate from Navigation Links, One-Way Arrivals, and Trigger Tiles.

Two Transition Tiles form one exclusive reciprocal pair:

```text
Transition A  ⇄  Transition B
```

Each endpoint has a GM-defined name, a **Connect To** field, an activation mode, native visibility, and an optional transition effect. Connection choices are displayed as `Transition Name (Scene Name)`. A connected Transition remains visible in selection lists but is unavailable to third endpoints. Transition names must be unique within the same Scene; the same name may be reused in different Scenes.

A Transition can connect points in different Scenes or two points inside the same Scene. Same-Scene travel repositions the existing Token Document. Cross-Scene travel reuses an existing destination Token when possible or creates one from the Actor's current Prototype Token, then removes only the source Token after the destination is ready. The World Active Scene is not changed.

The paired Transition Tile is also the arrival point. Transition travel is individual and does not use Arrival Area distribution; multiple travellers intentionally stack at the paired endpoint.

Activation modes are:

- Single Click
- Double Click
- Enter Area

Click activation requires the player's character Token to be on or directly adjacent to the Transition. Enter Area suppresses CTN's own arrival movement so an A → B transfer cannot immediately bounce B → A; after the Token leaves B, entering it normally can activate the return trip.

**Enable Transition Effect** is off by default. When enabled on an endpoint, the travelling Token visually shrinks to zero before transfer and grows from zero at the paired endpoint. This is a visual placeable animation only and does not change Token Document dimensions or the Prototype Token.

Transition visibility is manual. CTN does not apply Trigger states, automatic reveal logic, Saving Throws, damage, or post-trigger behavior to Transition Tiles.

---

# D&D5e Party Integration

CTN uses a D&D5e-specific party provider when D&D5e is the active game system.

## Group Actor Authority

When an applicable D&D5e Group Actor exists, **Group membership is the authority for collective GM travel**.

`User.character` does not decide which Actors physically travel.

This means a GM-only test world still transfers Group members even when no player Users exist.

### Group discovery

CTN prefers:

1. a Group Token explicitly present in the source Scene;
2. a unique D&D5e Group containing the source Scene's character Actors;
3. a compatible primary party reference when available.

If more than one Group is plausible and CTN cannot resolve the party safely, it warns the GM instead of silently guessing.

### No Group fallback

If no applicable Group exists, CTN treats D&D5e `character` Actors with Tokens in the source Scene as the travelling party.

NPCs and monsters are not pulled into that fallback roster.

### Existing destination Tokens

For each travelling Actor:

- if a Token for that Actor already exists in the destination Scene, CTN reuses and repositions it;
- otherwise CTN creates the destination Token from the Actor's current Prototype Token.

This avoids unnecessary duplicates when a character is already present in the destination.

### Group Token destinations

If the destination Scene intentionally represents the party with a relevant Group Token, CTN uses that representation instead of materializing all individual character Tokens.

CTN does not automatically create or delete Group Tokens.

---

# Route Manager

Open **Check Routes** from the Tiles controls or the module settings menu.

The Route Manager identifies navigation structure such as:

- Linked routes
- One-Way routes
- Unlinked links
- Ambiguous routes
- Broken destinations
- Unused Arrivals
- Arrivals already in use

An Arrival can display multiple **Incoming Sources**, including Navigation Links and Trigger Tiles.

---

# Trigger Tiles

Trigger Tiles are CTN's lightweight spatial interaction layer.

They are intentionally narrower than a generic automation engine.

The intended scope is:

```text
enter area
→ optional movement pause
→ optional saving throw
→ optional damage
→ optional Scene transition
→ optional reveal/state change
```

CTN does not aim to become a general action-chain, macro, lighting, sound, NPC spawning, or scripting platform.

---

## Creating a Trigger Tile

Use **Create Trigger Tile** from the Tiles controls, then click the Canvas to place it.

The Trigger is a normal Foundry Tile. Use native Tile appearance controls to choose its image, size, opacity, tint, and placement.

A Trigger can begin hidden from players and later reveal according to its configuration.

---

## Trigger State

CTN currently uses these persistent Trigger states:

- `ARMED`
- `TRIGGERED`
- `REVEALED`
- `ACTIVE_HAZARD`
- `DISABLED`

State is stored on the Tile and survives normal reloads.

---

## Movement Pause

A Trigger can allow movement to continue or pause the Token when the area is entered.

When paused, the GM receives a Trigger Resolution card.

The **Release Token** button has one responsibility only:

> remove the movement lock for that Token.

Release Token does **not** reveal, hide, re-arm, disable, activate a hazard, change Save state, execute post-trigger behavior, or otherwise modify the Trigger Tile.

Trigger state and Token movement lock are deliberately separate concerns.

---

# Saving Throw State

Saving Throw is a stateful Trigger capability.

Each Trigger has:

- **Initial Save State:** `ON` or `OFF`
- **Current Save State:** `ON` or `OFF`
- Ability
- DC

The configured initial state describes how the Trigger starts or re-arms. The current state can be changed by Trigger behavior.

When Save is `ON` in D&D5e, the GM-only Trigger card provides:

- **PASS**
- **NOT PASS**

CTN does not roll or interpret the player's saving throw. The player may roll from the normal sheet, physical dice, or any other preferred workflow; the GM records the result using PASS or NOT PASS.

When Save is `OFF`, PASS and NOT PASS are skipped and the Trigger proceeds directly to the configured consequence.

---

# Damage

A Trigger can contain multiple damage components, for example:

```text
2d6 Piercing
1d6 Poison
```

Damage conditions include:

- Always
- On Failed Save
- On Successful Save
- Full on Failure / Half on Success

When Save is currently `OFF`, save-dependent damage conditions collapse into direct damage for that occurrence. This allows an activated hazard to continue dealing damage without repeatedly asking for a Save.

---

## D&D5e Native Damage

When D&D5e is active, CTN uses the D&D5e Actor damage pipeline rather than reproducing D&D damage rules itself.

The flow is:

```text
Trigger determines who is hit and when damage is eligible
→ GM presses Roll Damage on the Trigger Resolution card
→ CTN rolls the configured typed damage publicly
→ CTN passes the typed components to D&D5e
→ D&D5e applies the damage to the triggering Actor
```

Damage components remain separated by type, so D&D5e can apply its own resistance, immunity, vulnerability, damage modification, temporary HP, damage threshold, and related Actor damage rules.

The damage roll messages are public. The administrative Trigger Resolution card remains GM-only.

In D&D5e, eligible damage is **never rolled merely because a Trigger result was reached or a Token entered an active hazard**. The GM starts damage explicitly with **Roll Damage**. Once pressed, CTN rolls publicly and D&D5e applies the typed damage natively to the triggering Actor; no manual target selection is required.

---

## Generic Damage Fallback

When no dedicated game-system adapter is available, CTN keeps its generic damage controls.

The generic card can roll configured formulas and offers manual multiplier choices:

- Half ×0.5
- Normal ×1
- Double ×2

Game-system-specific concepts such as resistance and immunity are not reimplemented by CTN's generic layer.

---

# Persistent Hazards

A Trigger can be configured to **Become Persistent Damage Area**.

A common trap workflow is:

```text
Initial trap
Save State = ON
→ character enters
→ GM resolves PASS / NOT PASS
→ Trigger becomes ACTIVE_HAZARD
→ Save State changes to OFF
```

Subsequent entries then become:

```text
enter ACTIVE_HAZARD
→ optional movement pause
→ Roll Damage (GM)
→ native D&D5e application or generic CTN damage flow
→ Release Token
```

No repeated saving throw is required when Current Save State is OFF.

Under the Damage section, **Persistent Hazard Save State** controls whether activating the persistent hazard automatically turns Save OFF or preserves its current state.

This state transition is intentionally explicit rather than hard-coded to the `ACTIVE_HAZARD` state, leaving room for future Trigger interactions to turn capabilities on or off.

---

# Reveal Behavior

Tile visibility is controlled by **Reveal Tile**, independently from movement release and post-trigger state.

Available reveal conditions include:

- Never
- On Trigger
- On Failed Save
- On Successful Save

Post-trigger behavior does not use Release Token as a shortcut for visibility changes.

For example:

```text
Reveal: On Failed Save
Result: PASS
→ Tile stays hidden
→ Release Token
→ Tile stays hidden
```

---

# Re-arm When Empty

A Trigger configured to re-arm when empty checks actual Scene Token occupancy.

When the last Token leaves the area:

1. the Trigger returns to `ARMED`;
2. initial visibility is restored;
3. Current Save State is restored from Initial Save State.

Re-arming is driven by occupancy, not by the Release Token button.

---

# Trigger Scene Transitions

A Trigger can move the triggering Actor to another Scene and Arrival.

Trigger transitions are individual. A character falling through a pit does not automatically transfer the entire party.

CTN uses the same safe Scene-transfer lifecycle used by navigation, and a Token materialized by CTN can be evaluated against Trigger Tiles at its final destination.

This allows chains such as:

```text
hidden pit in Scene A
→ character falls to Scene B Arrival
→ Arrival overlaps spikes
→ spikes create a new, independent Trigger occurrence
```

CTN suppresses Trigger evaluation during its own materialization step and explicitly evaluates the final position afterward to avoid accidental mid-create firing.

---


# Global Settings

CTN currently exposes world defaults for:

- Navigation Gesture
- Display Mode
- Default Icon
- Default Icon Tint
- Navigation visibility
- Trigger permission
- Destination label display
- Route Manager

Creation defaults are copied into new Tiles. Existing Tiles remain individually editable.

---

# Compatibility and Coexistence

CTN is designed around native Foundry Scene, Tile, Token, Canvas, User, Hook, and Socket behavior.

It does not require Monk's Active Tile Triggers and does not attempt to reproduce MATT's general automation model.

The Scene-drop Shift bypass exists specifically so CTN can coexist with other modules and normal Foundry workflows.

---

# Design Boundaries

CTN deliberately focuses on spatial navigation and lightweight spatial triggers.

It is not intended to become:

- a generic scripting engine;
- an arbitrary action graph system;
- a combat automation suite;
- a journal automation layer;
- a lighting or sound sequencer;
- an NPC spawning framework.

When a game system already has a better rules implementation, CTN should prefer using that implementation through a small adapter instead of duplicating it.

---

# File Structure

The installable module keeps product documentation at the root:

```text
canvas-tile-navigation/
├─ module.json
├─ README.md
├─ CHANGELOG.md
├─ scripts/
├─ styles/
├─ lang/
└─ assets/
```

Release QA files and internal development checklists are not part of the installable module.
