/**
 * Stage 18 of the compile: where the picture changes — how each stage arrives (the push-in, a shot's entrance, a
 * hand-over on the page, a cut), a thought cloud opening, the teaser — and the other things that move the camera: a
 * world's own camera (kitCameraIn) and a world's spotlight (spotlightAt). Its own stage because the director's
 * pushes, the camera's moves, the reading check, the stills and the record all keep to these changes.
 *
 * Reads: push, buildStage, boardEnd, TURN, shots, stages, storyWorld, clock, teaser, spotOf, shotAt; at call time
 * worldOnScreen (the regions stage).
 * Writes: arrivalOf(st), pictureChanges(), kitCameraIn(a, b), spotlightAt(t).
 */
import {THOUGHT_ENTRANCE} from '../thought/index.mjs';

export function changesStage(state) {
  const {push, buildStage, boardEnd, TURN, shots, stages, storyWorld, clock, teaser, spotOf, shotAt} = state;
  /** How a stage arrives: {from, to, what} — the push-in, a shot's entrance, a hand-over on the page, or a cut. */
  function arrivalOf(st) {
    if (push && st === buildStage) return {from: boardEnd, to: Math.max(boardEnd + TURN, st.start + .25), what: 'the push-in'};
    const shot = !push && shots.find(s => s.stages[0] === st || (st.world && s.world === st.world));
    if (shot) {
      const e = shot.enter;
      return e.type === 'cut' ? {from: st.start, to: st.start, what: `the cut into ${st.scene}`}
        : {from: st.start - e.lead, to: Math.max(st.start - e.lead + e.seconds, st.type === 'recap' ? st.start + 1 : 0), what: `the ${e.move ? `${e.move} move` : e.type} into ${st.scene}`};
    }
    return st.cut ? {from: st.start, to: st.start, what: `the cut into ${st.scene}`}
      : {from: st.start - .65, to: st.start + (st.type === 'recap' ? 1 : .4), what: `the hand-over to ${st.scene}`};
  }
  /**
   * Where the picture changes: the push-in, each hand-over, entrance and cut, the teaser. A
   * director's push stays on one picture, so it may not run across any of these.
   */
  function pictureChanges() {
    const out = stages.map(arrivalOf);
    // A thought cloud opening changes the picture too: its world grows in out of the trail (thought/entrance.mjs).
    for (const [w, what] of [[storyWorld, 'the thought cloud opening on the story'], ...stages.filter(st => st.world).map(st => [st.world, `the thought cloud opening in ${st.scene}`])]) {
      if (w.frame && !push) out.push({from: w.thoughtFrom, to: Math.min(clock.total, w.thoughtFrom + THOUGHT_ENTRANCE.settled), what});
    }
    if (teaser) out.push({from: teaser.at, to: clock.total, what: 'the teaser'});
    return out.sort((a, b) => a.from - b.from);
  }
  /**
   * A world's own camera moving between a and b while that world is on screen (StoryWorld · cameraMoves: e.g. the
   * cartoon kit's camera keys): {path, kit, from, to}, or null. A push and a camera move take turns with it.
   */
  function kitCameraIn(a, b) {
    const worlds = [storyWorld, ...stages.filter(st => st.world).map(st => st.world)];
    if (!worlds.some(w => w.instance.cameraMoves?.length)) return null;
    const starts = worlds.flatMap(w => (w.instance.cameraMoves ?? []).map(x => x.from)).filter(t => t > a && t < b);
    for (const t of [...Array.from({length: Math.ceil((b - a) / .05)}, (_, i) => a + i * .05), ...starts]) {
      const on = state.worldOnScreen(t), x = on && (on.w.instance.cameraMoves ?? []).find(m => t >= m.from && t < m.to);
      if (x) return {path: on.path, kit: on.w.kit, from: x.from, to: x.to};
    }
    return null;
  }
  /** The world whose spotlight shows at t (its name), or null. */
  function spotlightAt(t) {
    if (push) return t < boardEnd && spotOf(storyWorld, t) ? 'the story' : null;
    const j = shotAt(t), w = shots[j].world;
    return w && spotOf(w, t) ? (j === 0 ? 'the story' : `the world in ${stages.find(s => s.world === w).scene}`) : null;
  }
  Object.assign(state, {arrivalOf, pictureChanges, kitCameraIn, spotlightAt});
}
