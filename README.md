# Canvas Tile Navigation

**Canvas Tile Navigation** is a system-agnostic Foundry VTT V14 module for visual Scene navigation directly on the Canvas.

The goal is intentionally narrow:

> Prepare Scene links visually, then navigate instantly during play.

## v0.1.2

This patch incorporates the first live Foundry test.

### Scene drop

- Drag a Scene normally: CTN owns the drop and creates one navigation Tile.
- Start dragging the Scene normally, then hold **Shift before releasing it on the Canvas**: CTN ignores that drop completely so Foundry or another module can handle it.
- CTN has no MATT-specific dependency.

### Native size

CTN no longer has Default Tile Width / Default Tile Height settings.

Every new Navigation Tile is created as a **square** whose side length is the current Scene's native **Grid Size (pixels)**.

That same Scene grid size exists even when the Scene is configured as Gridless, so CTN still uses the Scene's native scale instead of maintaining a second size setting.

### Interaction

The first live test exposed a V14 Collection bug in CTN's Canvas scanner. That scanner has been rebuilt:

- CTN uses `canvas.scene.tiles.contents`, which is the V14 array of TileDocument values.
- Only Tiles carrying CTN's navigation flag are cached and considered.
- MATT and other ordinary Tiles are ignored by CTN's interaction scanner.
- Pointer hover processing is limited to at most once per animation frame.
- Cursor state is only changed when the hovered CTN Tile actually changes.
- Click and double-click still perform an immediate hit test when needed.

Configured gestures:

- Single Left Click
- Double Left Click
- Middle Click
- Alt + Left Click
- Ctrl + Left Click

**Editing rule:** while the GM has the native Tiles Layer active, Foundry's normal Tile editing behavior wins. CTN does not navigate from clicks in that mode, so Tiles can still be selected, moved, resized, and double-clicked to open Tile Configuration.

Switch back to a gameplay layer (for example Tokens) to test navigation clicks.

### Tile Configuration

Double-click a CTN Tile while editing Tiles to open the normal Tile Configuration.

The CTN section is now inserted only inside the native **Appearance** tab instead of remaining visible beneath every tab.

### Navigation

Per-Tile configuration still supports:

- destination Scene;
- Scene Thumbnail or Navigation Icon;
- icon choice;
- custom label storage;
- navigation gesture;
- GM-only or Everyone visibility;
- GM-only or Everyone trigger permission;
- Bring Everyone or Triggering User Only.

Navigation changes the viewed Scene and does not activate the destination Scene.

## Repository

https://github.com/hammer-PvP/Canvas-Tile-Navigation
