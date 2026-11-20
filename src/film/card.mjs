/**
 * Stage 8 of the compile: where the card goes once the stages start — aside for the first stage (MOVE0 → MOVE1), into
 * the middle of a stage kit's scene when that kit places it (centrePlace), named on a phrase — and the check that the
 * push-in is done before the card moves. Its own stage because the card's moves are read by the drawing, the regions,
 * the reading check and the sounds alike.
 *
 * Reads: stages, card, clock, push, boardEnd, TURN, notes.
 * Writes: buildStage, moveTo, centreStage, MOVE0, MOVE1, centrePlace, namedAt.
 */

export function placeCard(state) {
  const {stages, card, clock, push, boardEnd, TURN, notes} = state;
  // A stage kit may take the card into the middle of its scene (place) and drive its rows (card).
  const buildStage = stages[0], moveTo = card.aside, centreStage = stages.find(s => s.kit?.place), MOVE0 = buildStage ? buildStage.start - 1.05 : Infinity, MOVE1 = MOVE0 + .9;
  const centrePlace = centreStage ? centreStage.kit.place(centreStage.handle) : {at: [800, 600], scale: .58};
  const namedAt = card.named ? clock.at(card.named.at) : Infinity;
  // The push-in (the camera, then the page typed over it) is done before the card moves aside for the first stage.
  if (push && buildStage && boardEnd + TURN * .9 > MOVE0) throw new Error(`The push-in ends at ${(boardEnd + TURN * .9).toFixed(2)} s${notes.speed !== 1 ? ` (at camera speed ${notes.speed} it takes ${TURN.toFixed(2)} s)` : ''}, after the card moves aside for the first stage at ${MOVE0.toFixed(2)} s: give the scene before ${buildStage.scene} a longer tail (pacing.tails), or the push-in a shorter turn`);
  Object.assign(state, {buildStage, moveTo, centreStage, MOVE0, MOVE1, centrePlace, namedAt});
}
