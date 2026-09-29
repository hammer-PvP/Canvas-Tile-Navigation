# Canvas Tile Navigation

**Canvas Tile Navigation** is a system-agnostic Foundry VTT V14 module for visual Scene navigation directly on the Canvas.

> Preparation first, navigation instantly during play.

## 1.1.1

This patch refines the 1.1 route workflow and finalizes GM/player navigation semantics.

### GM and player navigation

- **GM normal gesture:** commits the transition, activates the destination Scene, and pulls all active non-GM players.
- **GM + Shift + gesture:** preview only. Only the GM changes view; Active Scene, players, and Tokens are untouched.
- **Player gesture:** moves only that player and never activates the destination Scene.
- Player Shift does not create a preview mode.

Only Tokens belonging to assigned player characters are moved automatically.

### Player proximity

A player may trigger a player-enabled Navigation Link only while their assigned character Token is on or directly adjacent to that Tile.

### Arrival distribution

When multiple player characters arrive together, CTN uses the paired return Link or One-Way Arrival Point as the center and searches nearby positions to avoid stacking Tokens where possible.

- square grids expand through neighboring cells/rings;
- hex/gridless Scenes use radial neighboring positions;
- existing destination Tokens are treated as occupied;
- if no free nearby position can be found, arrival falls back to the center rather than blocking navigation.

### One-Way Arrival Points

One-Way Arrival labels are generated dynamically:

```text
One-Way Arrival — Cave E: Ogre Lair
One-Way Arrival — Cave E: Ogre Lair — 2
```

A Custom Label still overrides the automatic display name.

The Arrival configuration now includes **Incoming Route**. It lists unresolved routes whose destination is the current Scene. Selecting one makes that source route One-Way and binds it to this Arrival Point.

The route remains the single authority for the relationship; the Arrival Point does not store a duplicate source-route flag.

### Route Manager

The Route Manager now:

- scrolls internally;
- keeps resolved Linked / One-Way routes compact;
- exposes route-resolution controls only when needed or when the GM clicks Change;
- remains available through Game Settings;
- is also available directly from **Tiles → Check Routes**.

### Hover help

Hovering a healthy Navigation Link shows contextual instructions.

For a GM:

```text
Double-click to move all players to Cave E: Ogre Lair.
Shift + Double-click to preview Cave E: Ogre Lair.
```

For a player, the hover explains travel or tells them to move their character Token closer.

Route diagnostics still take visual priority for the GM.

## Release assets

GitHub releases should include:

- `module.json`
- `canvas-tile-navigation.zip`

Manifest URL:

`https://github.com/hammer-PvP/Canvas-Tile-Navigation/releases/latest/download/module.json`
