# Canvas Tile Navigation

**Canvas Tile Navigation** is a system-agnostic Foundry VTT V14 module for visual Scene navigation directly on the Canvas.

> Preparation first, navigation instantly during play.

## 1.1.0

Version 1.1 adds route topology and physical player navigation while preserving the 1.0 workflow.

### Navigation Links

Drag a Scene from the Scene Directory onto the Canvas to create a Navigation Link.

- Normal Scene drop: CTN owns the drop.
- Start dragging normally, then hold **Shift before releasing**: CTN ignores the drop so Foundry or another module such as MATT can handle it.
- A normal GM navigation action **activates** the destination Scene.
- `Shift + navigation gesture` is GM Preview: only the GM views the destination. Active Scene, players, and Tokens are not changed.
- A player action never activates the Scene and never moves the whole table. It moves only that player.

### Physical player interaction

Players can trigger a visible/player-enabled Navigation Link only when their assigned `User.character` Token is:

- on the Navigation Tile; or
- directly adjacent to it.

For gridless Scenes, CTN uses one configured grid-size worth of distance as the interaction radius.

GM interaction is never range-limited.

### Route pairing

A paired route is two Navigation Links that point back to each other's Scenes.

Example:

```text
Scene A: A → B
Scene B: B → A
```

When the relationship is unambiguous, CTN pairs the two automatically.

The return Navigation Link is also the arrival location for Tokens. This means the ordinary A ↔ B loop needs no extra arrival marker.

When there are multiple routes between the same Scenes, each additional route receives a stable automatic discriminator:

```text
Mina dos Passos Argênteos
Mina dos Passos Argênteos — 2
Mina dos Passos Argênteos — 3
```

A custom label may replace the displayed name without changing the internal route identity.

### One-Way Arrival Points

Some routes deliberately have no return: a pit, a trap, a portal that closes, a one-way teleport, and similar transitions.

Use the Tiles Scene Controls tool **Create One-Way Arrival Point**, then click the destination map.

A One-Way Arrival Point:

- is GM-only;
- is not clickable by players;
- is used only as a Token insertion location;
- can be selected by a Navigation Link configured as **One-Way Route**.

### Token arrival

When a player navigates individually, only that player's assigned character Token is placed at the paired return Link or One-Way Arrival Point.

When the GM commits a **Bring Everyone** transition, CTN processes active non-GM users whose assigned character Tokens are present in the source Scene and places those Tokens at the destination arrival location before activating/pulling the Scene.

If the Actor already has a Token in the destination Scene, CTN repositions it. Otherwise CTN creates one from the source Token data.

### Destination labels

Default label behavior is configured globally:

- Off
- On Hover
- Always

`On Hover` is the default.

Displayed text is dynamic:

1. Custom Label, if present.
2. Destination Scene name otherwise.
3. Automatic route discriminator for additional routes.

CTN does not store the Scene name as route authority.

### Route diagnostics

CTN continuously validates the route network.

Statuses include:

- Linked
- One-Way
- Unlinked
- Ambiguous
- Broken

For the GM, unresolved route diagnostics override the normal label preference and remain visible on the Canvas until resolved.

New unresolved/broken routes also raise a yellow permanent Foundry notification which the GM dismisses manually.

### Route Manager

**Game Settings → Canvas Tile Navigation → Route Manager**

The Route Manager provides a World-wide view of routes and lets the GM:

- locate a route;
- open its Tile configuration;
- explicitly pair a return link;
- select a One-Way Arrival Point;
- clear a route resolution.

### Release assets

GitHub releases should include:

- `module.json`
- `canvas-tile-navigation.zip`

Manifest URL:

`https://github.com/hammer-PvP/Canvas-Tile-Navigation/releases/latest/download/module.json`
