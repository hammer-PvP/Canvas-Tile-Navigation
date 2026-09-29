# Canvas Tile Navigation

**Canvas Tile Navigation** is a system-agnostic Foundry VTT V14 module for visual Scene navigation directly on the Canvas.

> Preparation first, navigation instantly during play.

## 1.1.2 — Party-aware Scene transitions

This patch replaces the first token-transfer experiment with a lifecycle-safe destination reconciliation model.

### GM commit lifecycle

A normal GM navigation gesture now runs as a guarded transition:

1. lock CTN navigation;
2. resolve the travelling party / destination representation;
3. preload the destination Scene and broadcast the preload to connected clients;
4. create or reposition destination TokenDocuments while the Scene is still inactive;
5. activate the destination Scene once, without a second `view()` call;
6. wait for `canvasReady` for that exact Scene;
7. remove only successfully transferred character Tokens from the source Scene;
8. pull the participating players;
9. release the navigation lock.

A 30-second timeout is a safety fallback only. Source Tokens are retained when the transition does not finish.

### GM preview

GM Shift + configured gesture remains preview-only:

- no Active Scene change;
- no Token transfer;
- no player pull.

### Destination reconciliation

CTN no longer treats the previous Token as the source of truth for creating the next Token.

For each travelling character:

- if the destination already contains a Token for that Actor, reuse and reposition it;
- otherwise resolve the live Actor from the Actor Directory and create a Token from its current Prototype Token;
- distribute multiple arriving character Tokens around the Arrival location to avoid stacking when possible.

This allows a player to enter a Scene early without being duplicated when the GM later commits the party to the same Scene.

### D&D5e Group Actor provider

The CTN core remains system-agnostic. When the active system is D&D5e, CTN adds party awareness:

- the native Group Actor is used as the travelling roster;
- the primary D&D5e party is preferred when configured;
- otherwise CTN can infer a unique Group Actor containing assigned player characters;
- Group membership decides which player characters travel with a GM commit;
- the Group only supplies membership — character Actors are always resolved live from `game.actors`;
- newly materialized character Tokens always come from the Actor's current Prototype Token.

Removing a character from the Group before a GM commit leaves that character's source Token behind and keeps that player's view in the previous Scene.

### Group Token Scene representation

If the destination Scene already contains the relevant D&D5e Group Actor Token:

- CTN does not create individual character Tokens there;
- CTN repositions the existing Group Token at the route Arrival;
- the individual travelling character Tokens are removed from the source only after the destination Canvas is ready;
- CTN never auto-creates or deletes the Group Token.

When travelling from a Group-token Scene to a normal Scene, CTN materializes the Group members from their live Actors / Prototype Tokens.

### Player individual navigation

Player navigation has its own protected transaction:

1. validate permission and proximity;
2. preload the destination locally;
3. the primary GM prepares or reuses only that player's character Token in the destination;
4. the GM pulls only that player;
5. the player reports `canvasReady` for the destination through the CTN socket;
6. only after that acknowledgement does the GM remove that character's source Token.

If the destination is represented by a relevant Group Token, the player may view the Scene but CTN does not move the Group Token and does not delete the player's individual source Token.

### Party-aware proximity

On ordinary Scenes, player proximity uses the assigned character Token. On a D&D5e Scene represented by a Group Token whose Group contains that character, the Group Token becomes that player's physical position for CTN route interaction.

## Release assets

GitHub releases should include:

- `module.json`
- `canvas-tile-navigation.zip`

Manifest URL:

`https://github.com/hammer-PvP/Canvas-Tile-Navigation/releases/latest/download/module.json`
