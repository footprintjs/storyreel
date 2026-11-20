/**
 * Stage 10 of the compile: the director's cuts put on their stages, and — without a push-in — the film as a row of
 * shots: the story, then each world, each run of paper, each with its entrance (a burst out of a thought cloud pops
 * that very cloud). Its own stage because the row of shots is what the drawing, the regions, the sounds and the
 * render's rows all walk.
 *
 * Reads: notes, stages, push, buildStage, storyWorld, transitions.
 * Writes: shots, entranceBoxes (filled by the entrances stage), NO_BOXES, shotAt(t).
 */
import {CUT} from '../transitions.mjs';
import {THOUGHT_SETTINGS} from '../thought/index.mjs';

export function rowOfShots(state) {
  const {notes, stages, push, buildStage, storyWorld, transitions} = state;
  // Director's cuts: the scene's stage arrives on a hard cut instead of its hand-over or entrance.
  for (const [scene, n] of notes.cuts) {
    const st = stages.find(s => s.scene === scene);
    if (!st) throw new Error(`note "${n.note}": no stage starts at scene ${scene}; a cut goes into a stage's scene`);
    if (push && st === buildStage) throw new Error(`note "${n.note}": ${scene} is the first stage, which arrives with the push-in`);
    st.cutNote = n;
    if (push) { st.cut = true; st.cutWas = 'hand-over'; }
  }

  // Without a push-in, the film is a row of shots: the story, then each world, each run of paper.
  const shots = [{world: storyWorld, stages: [], start: 0}];
  // Where the things a shot's entrance goes through are (transitions.mjs · boxes), by shot: found once the worlds are ready.
  const entranceBoxes = new Map(), NO_BOXES = Object.freeze({from: Object.freeze({}), to: Object.freeze({})});
  if (!push) for (const st of stages) {
    const last = shots.at(-1);
    if (st.type !== 'world' && !last.world && st.enter === undefined) {
      last.stages.push(st);
      if (st.cutNote) { st.cut = true; st.cutWas = 'hand-over'; }
    } else {
      if (st.cutNote) { st.cutWas = st.entrance.type; st.entrance = CUT; }
      shots.push({world: st.world ?? null, stages: st.world ? [] : [st], start: st.start, enter: st.entrance});
    }
  }
  // A burst out of a thought pops that very cloud (thoughtPopped).
  if (!push) shots.forEach((shot, j) => { if (j) shot.enter = thoughtPopped(shot, shots[j - 1]); });
  /**
   * An entrance on the thought's own settings (cloudBurst) out of a shot in a thought cloud pops that very cloud: each
   * setting the recipe leaves out is the frame's, and one it gives must be the frame's too (two clouds never show).
   */
  function thoughtPopped(shot, leaving) {
    const en = shot.enter, frame = leaving.world?.frame;
    if (!frame || transitions[en.type]?.params !== THOUGHT_SETTINGS) return en;
    const st = shot.stages[0] ?? stages.find(s => s.world === shot.world), given = st.enter && typeof st.enter === 'object' ? st.enter : {};
    const same = (a, b) => (typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b);
    const thought = leaving === shots[0] ? 'the story' : `stage ${(leaving.stages[0] ?? stages.find(s => s.world === leaving.world)).scene}`;
    for (const name of Object.keys(THOUGHT_SETTINGS)) {
      if (given[name] !== undefined && !same(given[name], frame[name])) throw new Error(`stage ${st.scene}: the ${en.type} pops the thought cloud ${thought} is in, and gives ${name} ${JSON.stringify(given[name])} where that cloud has ${JSON.stringify(frame[name])}: leave ${name} out (it takes the thought's own), or give both the same`);
    }
    const popped = Object.freeze({...en, p: Object.freeze({...en.p, ...Object.fromEntries(Object.keys(THOUGHT_SETTINGS).map(name => [name, frame[name]]))})});
    st.entrance = popped;
    return popped;
  }

  /** Which shot is on screen (or arriving) at t. */
  function shotAt(t) {
    let j = 0;
    while (j + 1 < shots.length && t >= shots[j + 1].start - shots[j + 1].enter.lead) j++;
    return j;
  }
  Object.assign(state, {shots, entranceBoxes, NO_BOXES, shotAt});
}
