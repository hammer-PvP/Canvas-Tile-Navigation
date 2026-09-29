# Canvas Tile Navigation

**Canvas Tile Navigation** is a system-agnostic Foundry VTT V14 module for visual Scene navigation directly on the Canvas.

The goal is intentionally narrow:

> Prepare Scene links visually, then navigate instantly during play.

## 1.0.0-rc.1

This patch is rebased directly on the validated v0.1.2 build and changes only the full-Tile interaction area and the default icon tint.

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

### v0.1.3 focused fixes

- CTN uses Foundry V14's native `TileDocument.shape.testPoint()` for the clickable area, so the full Tile rectangle is actionable rather than only one corner.
- A new **Default Icon Tint** world setting is copied to newly created Navigation Icon Tiles.
- Existing Visibility, Trigger Permission, Navigation Target, gesture, display, and icon defaults from v0.1.2 are preserved.
- Tint application is non-blocking: a tint failure cannot prevent Tile creation or registration of the remaining CTN settings.


### 1.0.0 RC1 icon polish

The built-in navigation icon pack has been redrawn and is bundled locally with the module:

- Generic Arrow
- Enter Door
- Exit Door
- Stairs Up
- Stairs Down
- Return / Back

The stair arrows now sit above and follow the direction of the steps, while Enter and Exit use clearly opposing door-navigation metaphors.

`missing-scene.png` is an internal technical fallback asset and is not part of the normal navigation icon choices.

No icon requires an external URL or network request during play.

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
