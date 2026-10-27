/**
 * compileStage: a stage spec → the stage, compiled (the one composition: read, plan, then the frame as a pure
 * function of time). index.mjs is the public door; kit.mjs wraps this for a film.
 */
import {readAdapters} from './adapters.mjs';
import {readStage} from './read.mjs';
import {planStage} from './plan.mjs';
import {stateAt} from './scene.mjs';
import {paintStage} from './paint.mjs';
import {regionsOf} from './names.mjs';

/** Standalone, a beat is seconds; in a film the stage kit hands the clock's own `at` (phrases, Law 2). */
const seconds = ref => {
  if (Number.isFinite(ref)) return ref;
  throw new Error(`without a clock a beat is seconds (a number), not ${JSON.stringify(ref)}; in a film the stage kit reads phrases`);
};

/**
 * A stage, compiled: the spec read and checked against the kit's adapters (raw {places, people, props, badge?} or a
 * port from readAdapters), the actions played through once (refusing what cannot happen), and the frame as a pure
 * function of time. Returns {draw(ctx, t), stateAt(t), regionsAt(t), sounds, ledger, facts: {start, end},
 * continuity (the facts, or null for a stage `aside`), end, place}.
 */
export function compileStage(spec, {adapters, at = seconds, clock = null, where = 'the stage'} = {}) {
  const port = adapters && typeof adapters.place === 'function' ? adapters : readAdapters(adapters);
  const stage = readStage(spec, {adapters: port, at, where}), plan = planStage(stage);
  plan.adapters = port;
  const state = t => stateAt(plan, t, {clock});
  return Object.freeze({
    place: stage.place.name,
    stateAt: state,
    draw: (ctx, t) => paintStage(plan, ctx, state(t)),
    regionsAt: t => regionsOf(plan, state(t)),
    sounds: Object.freeze(plan.sounds.map(Object.freeze)),
    ledger: plan.ledger,
    facts: plan.facts,
    continuity: stage.aside ? null : plan.facts,
    end: plan.end,
  });
}
