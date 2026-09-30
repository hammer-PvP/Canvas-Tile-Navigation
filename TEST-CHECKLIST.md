# Canvas Tile Navigation 1.1.3 — Live Test Checklist

## A. Arrival Area regression
- [ ] Resize a One-Way Arrival to exactly 3×2 grid spaces.
- [ ] GM commits a 6-member group into it.
- [ ] All 6 Tokens occupy distinct spaces inside the 3×2 footprint.
- [ ] No Token is placed outside the Arrival Tile.
- [ ] Resize an Arrival to 1×4 and confirm the shape is respected as a corridor.
- [ ] Send more Tokens than available grid positions and confirm overflow stacks inside the Arrival Area.
- [ ] Existing unrelated Tokens are avoided while another authorized slot remains free.
- [ ] Paired Navigation Link used as return Arrival follows the same footprint rules.
- [ ] D&D5e Group Token is positioned inside the Arrival Area.
- [ ] 1.1.2 source cleanup / Group roster behavior remains correct.

## B. Trigger Tile creation/configuration
- [ ] Tiles controls show Create Trigger Tile.
- [ ] Click tool, click Canvas, Trigger Tile is created and Tile Configuration opens.
- [ ] Native Tile Appearance can replace the technical Trigger image with a GM-supplied image.
- [ ] Trigger config persists after save/F5.
- [ ] Reset/Re-arm returns state to Armed and restores initial visibility.

## C. Simple walk-over transition
- [ ] Configure no Save, no Damage, Scene Transition = Always.
- [ ] Token enters area and GM receives private Trigger card.
- [ ] Move Token uses selected destination Arrival.
- [ ] Only the triggering Actor moves.
- [ ] Source Token cleanup occurs only after successful player destination loading.

## D. Movement lock
- [ ] Configure Pause Until GM Resolves.
- [ ] Player attempts to move through/into the Trigger.
- [ ] Original movement is rejected and Token stops at the detected Trigger entry.
- [ ] Additional movement attempts are rejected while locked.
- [ ] GM Release Token unlocks movement.
- [ ] Tiles → Release Paused Tokens releases an intentionally stranded lock.
- [ ] CTN internal Token placement does not immediately trigger another zone.

## E. Save trap (D&D5e)
- [ ] Configure DEX save + DC.
- [ ] Trigger card is visible only to GMs.
- [ ] Roll Save rolls from the live Actor.
- [ ] Card records SUCCESS/FAILURE against configured DC.
- [ ] Reveal On Failed Save only reveals on failure.
- [ ] Reveal On Successful Save only reveals on success.

## F. Damage trap (D&D5e)
- [ ] Configure two components, e.g. 2d6 Piercing + 1d6 Poison.
- [ ] Roll Damage creates rolls without changing HP.
- [ ] Apply Damage changes the Actor only after GM presses it.
- [ ] Damage types remain separate.
- [ ] Always / Failed Save / Successful Save conditions work.
- [ ] Full on Failure / Half on Success uses half multiplier after a successful save.

## G. Pit trap
- [ ] Hidden Tile with Save + damage + failed-save transition.
- [ ] Player enters and is movement-locked.
- [ ] Failed save can roll/apply damage and Move Token to the pit Arrival.
- [ ] Trigger reveals according to configuration.
- [ ] Set After Trigger = Direct Transition.
- [ ] A later Token entering the revealed pit is transitioned without repeating the initial surprise Save.

## H. Re-arming spikes
- [ ] Hidden + Reveal On Trigger + Re-arm When Empty.
- [ ] First Token enters: Tile becomes visible and resolution card appears.
- [ ] While a Token remains inside, Trigger does not reset.
- [ ] Last Token exits: Tile returns to Armed and hidden.
- [ ] Next entry triggers the trap again.

## I. Persistent damage area
- [ ] After Trigger = Persistent Damage Area.
- [ ] Resolve first activation.
- [ ] Tile stays visible/active.
- [ ] Token exits and re-enters.
- [ ] A new GM damage-resolution card is generated.

## J. One-time / active modes
- [ ] After Trigger = Disable prevents subsequent activations.
- [ ] Remain Visible leaves the revealed Tile without a forced automatic transition.
- [ ] Remain Active Trap can trigger again on later entry.

## K. Group-token protection
- [ ] Individual Trigger transition into a Scene represented by the relevant D&D5e Group Token does not create an individual Character Token there.
- [ ] It does not move the Group Token.
- [ ] It does not delete the individual's source Token solely because the destination is collective.

## L. Navigation regressions
- [ ] GM normal Navigation Link commit still works.
- [ ] GM Shift preview still moves no Tokens.
- [ ] Player click navigation still uses proximity and individual lifecycle.
- [ ] Route Manager / Check Routes / Incoming Route still work.
- [ ] MATT enabled does not introduce pointermove or navigation regressions.
