/**
 * Stage 12 of the compile: the steps track (kits/paper/steps-track.mjs) — a slim band over every shot, its playhead
 * walking the stations the voice names — and its rewind cue, which must replay the picture of its own shot only. Its
 * own stage because the track is read from the recipe once and drawn, measured, read and keyed from what it made.
 *
 * Reads: recipe, clock, push, shots, stages, shotAt.
 * Writes: stepsTrack, rewinding(t), rewindNest.
 */
import {createCanvas} from '@napi-rs/canvas';
import {readStepsTrack} from '../kits/paper/steps-track.mjs';

export function readStepsTrackStage(state) {
  const {recipe, clock, push, shots, stages, shotAt} = state;
  // A steps track (kits/paper/steps-track.mjs): a slim band over every shot, its playhead walking the stations the voice
  // names — back with ⏪, then (a flip) forward with ▶. Its rewind cue replays the picture of its own shot only, so
  // what a segment draws stays inside the segment.
  const stepsTrack = recipe.stepsTrack === undefined ? null : readStepsTrack(recipe.stepsTrack, {where: 'stepsTrack', at: b => clock.at(b)});
  const rewinding = t => Boolean(stepsTrack?.rewind) && t >= stepsTrack.rewind.from && t < stepsTrack.rewind.from + stepsTrack.rewind.seconds;
  if (stepsTrack?.rewind && !push) {
    const {from, to, seconds} = stepsTrack.rewind, j = shotAt(from);
    if (shotAt(to) !== j || to < shots[j].start || shotAt(from + seconds) !== j) throw new Error(`stepsTrack.rewind replays the shot it plays in (${(shots[j].stages[0] ?? stages.find(st => st.world && st.world === shots[j].world))?.scene ?? 'the story'}): rewind.to must be inside that shot after its entrance, and the ${seconds} s rewind must end before the next shot arrives`);
  }
  const rewindNest = stepsTrack?.rewind ? createCanvas(1600, 900) : null;
  Object.assign(state, {stepsTrack, rewinding, rewindNest});
}
