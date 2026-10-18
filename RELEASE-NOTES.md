# Canvas Tile Navigation v1.1.11

## Surgical fix

This release fixes a specific regression in **Transition Tiles**: when a Transition was configured with **Enter Area** and hidden from players, GM-controlled movement worked but player-controlled movement did not trigger the Transition.

### Fixed

- Hidden Transition Tiles now still activate for player-controlled Tokens when the activation mode is **Enter Area**.
- Hidden Transition Tiles remain non-clickable to players for **Single Click** and **Double Click**, preserving secret-passage behavior.

### Preserved

- No travel, Trigger, Arrival, Save, Damage, Group, or Route behavior was otherwise changed.
