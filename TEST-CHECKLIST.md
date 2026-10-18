# CTN v1.1.11 Focused Checklist

## Hidden Transition Tile / Enter Area

1. Create a paired **Transition Tile** A ⇄ B.
2. Set **Activation = Enter Area** on A.
3. Set A to **Hidden from Players**.
4. Control the linked Actor as a player and move into A using movement / WASD.
5. Confirm the Transition triggers even though the Tile is hidden.
6. Repeat the same test as GM and confirm the Transition still works.

## Hidden Transition Tile / Click behaviors

1. Create or reuse a hidden Transition Tile with **Single Click**.
2. As player, confirm it cannot be clicked while hidden.
3. Repeat with **Double Click** and confirm hidden still blocks clicking.
4. Reveal the Tile and confirm click / double-click works again.

## Regression spot-check

1. Same-Scene Transition still moves the same Token.
2. Cross-Scene Transition still transfers the player Token and removes the source Token.
3. Transition Effect behavior remains unchanged from v1.1.10.
