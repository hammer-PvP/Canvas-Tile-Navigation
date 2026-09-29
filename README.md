# Canvas Tile Navigation

**Canvas Tile Navigation** is a system-agnostic Foundry VTT V14 module for visual Scene navigation directly on the Canvas.

The goal is intentionally narrow:

> Prepare Scene links visually, then navigate instantly during play.

## v0.1.0

This first test build establishes the core workflow:

- Drag a Scene from the Scene Directory onto the Canvas.
- CTN captures the normal Scene drop and creates a persistent Foundry Tile.
- Hold **Shift while dropping** to bypass CTN completely. The drop is then left to Foundry or any other installed module, such as Monk's Active Tile Triggers.
- New navigation Tiles copy the current world defaults.
- Defaults include:
  - navigation gesture;
  - Scene thumbnail or navigation icon;
  - default icon;
  - visibility;
  - who may trigger the Tile;
  - move everyone or only the triggering user;
  - initial width and height.
- Double-click a CTN Tile while using the Tiles layer to access its normal Tile Configuration. CTN adds a **Canvas Tile Navigation** section to that configuration.
- Navigation uses Scene viewing/pulling and does **not** activate the destination Scene.
- Player-triggered navigation is routed through a connected GM when required.
- CTN uses its own module flags and has no required game-system dependency.

## Drop ownership

Normal Scene drag/drop is owned by CTN.

**Shift + drag/drop** is the universal bypass:

```text
Normal Scene drag  -> Canvas Tile Navigation
Shift + Scene drag -> CTN ignores the drop
```

CTN does not contain a MATT-specific integration. This is deliberate: the bypass can be used with any module.

## Intended scope

CTN is for click-based Scene navigation.

It is **not** intended to become a generic trigger engine. If you need workflows such as "a token walks onto this area and triggers a Scene change", use a module designed for triggers/automation.

## Initial navigation icons

The module ships with simple monochrome SVG navigation symbols:

- generic arrow;
- enter door;
- exit door;
- stairs up;
- stairs down;
- return/back.

## Current test notes

This is the first live-test build. The most important areas to validate in Foundry V14 are:

1. Scene drop interception and Shift bypass.
2. Coexistence with modules that also react to Scene drops.
3. Tile Configuration injection under ApplicationV2.
4. Player interaction with visible navigation Tiles.
5. Single/double/middle/modifier click behavior.
6. `Scene.pullUsers()` behavior without activating the Scene.

The visual hover label and richer navigation-point presentation are intentionally left for refinement after the core interaction is proven stable.

## Repository

https://github.com/hammer-PvP/Canvas-Tile-Navigation
