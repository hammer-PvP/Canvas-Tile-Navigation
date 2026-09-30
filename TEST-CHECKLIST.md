# Canvas Tile Navigation 1.1.4 — Live Test Checklist

## A. Arrival Area regression
- [ ] 3×2 Arrival distributes 6 Tokens inside the footprint without spilling outside.
- [ ] Horizontal and vertical Arrival rectangles preserve their drawn shape.
- [ ] More travellers than available slots stack only inside the Arrival Area.
- [ ] One-cell Arrival intentionally stacks overflow.
- [ ] Group Token placement still respects the Arrival Area.

## B. Arrival Sources / diagnostics
- [ ] Configure Trigger Tile in Scene A → Scene B → One-Way Arrival B.
- [ ] Open Arrival B and confirm status is `In Use`, not `Unlinked Arrival`.
- [ ] Incoming Sources identifies the source as `Trigger Tile` with source Scene/name.
- [ ] Add a Navigation Link pointing to the same Arrival.
- [ ] Arrival lists both Trigger Tile and Navigation Link sources.
- [ ] Add a second Navigation Link to the same Arrival; the first source remains linked.
- [ ] Remove/change all incoming sources and confirm Arrival becomes Unlinked/Unused again.

## C. Save adjudication
- [ ] Armed Trigger with Save shows Ability + DC in a GM-only card.
- [ ] Card has PASS and NOT PASS; there is no CTN Roll Save button.
- [ ] PASS unlocks only success-eligible consequences.
- [ ] NOT PASS unlocks only failure-eligible consequences.
- [ ] Reveal on Failed Save / Successful Save follows the GM choice.

## D. Damage multiplier / D&D5e native traits
- [ ] Roll Damage does not modify HP.
- [ ] After rolling, Half ×0.5 / Normal ×1 / Double ×2 selector appears.
- [ ] Apply Normal to an Actor without resistance and verify expected damage.
- [ ] Apply Half and Double manually and verify expected base multiplier.
- [ ] Test Piercing resistance: native D&D5e resistance further modifies the selected multiplier.
- [ ] Test Piercing vulnerability if practical: native D&D5e vulnerability is honored.
- [ ] Test immunity if practical: native D&D5e immunity is honored.
- [ ] Multiple typed damage components remain distinct.

## E. Persistent Damage
- [ ] Configure initial Save + damage + `Reveal and Become Persistent Damage Area`.
- [ ] First activation uses the initial Save flow.
- [ ] Resolve/release the first activation and confirm Tile remains visible as Active Hazard.
- [ ] Exit and re-enter.
- [ ] Re-entry pauses if configured but does NOT request another Save.
- [ ] Re-entry immediately exposes Roll Damage, then multiplier, Apply Damage, Release.
- [ ] Ignore one persistent-hazard activation releases the Token but leaves the hazard active/visible.

## F. Re-arm When Empty
- [ ] Hidden + Reveal On Trigger + Re-arm When Empty.
- [ ] Token enters: Tile reveals and event resolves normally.
- [ ] Release Token while it is still inside: Tile remains visible.
- [ ] Move Token completely outside: Tile becomes hidden again and state returns to Armed.
- [ ] With two Tokens inside, first Token exiting does not re-arm.
- [ ] Last Token exiting causes re-arm/hide.
- [ ] Deleting/removing the last Token from the Scene also permits re-arm.
- [ ] Next entry after re-arm starts the full initial Save flow again.
- [ ] Ignore / Release on an initial activation restores Armed + initial visibility.

## G. Trigger after CTN arrival
- [ ] Scene A pit Trigger moves one character to Arrival in Scene B.
- [ ] Place an Armed Trigger over that destination Arrival.
- [ ] Materialized Token produces a new GM Trigger event after arrival completes.
- [ ] If destination Trigger is Persistent Damage, arrival produces the damage-only hazard workflow.
- [ ] Manual Actor Directory drag/drop onto the same Trigger does not gain CTN arrival evaluation.
- [ ] Revealed Direct Transition destination does not auto-chain into an uncontrolled Scene loop.

## H. Transition/source cleanup regression
- [ ] Trigger Move Token still transfers only the triggering Actor.
- [ ] Source Token cleanup happens only after successful destination load.
- [ ] GM collective navigation still materializes the D&D5e Group roster correctly.
- [ ] Character left out of the Group remains behind.
- [ ] No `resources finish loading` double-Scene-switch error returns.

## I. Trigger movement/recovery regression
- [ ] Pause Until GM Resolves still blocks continued movement.
- [ ] Release Token restores movement.
- [ ] Release Paused Tokens recovery tool still works.
- [ ] Disable / Remain Visible / Direct Transition / Remain Active Trap modes still function.

## J. Route/navigation regression
- [ ] Paired A↔B routes still auto-pair when unambiguous.
- [ ] One-Way Navigation Links still use selected Arrival Areas.
- [ ] Route Manager / Check Routes still work.
- [ ] MATT enabled does not introduce pointermove or Scene-loading regressions.
