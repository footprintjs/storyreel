/**
 * Stage 2 of the compile: the film's clock, on the paced narration, which logs every phrase the recipe names as it is
 * resolved (a beat: the making-of record says which spoken words triggered which drawing). With anchors: 'note' a
 * phrase not as written is noted and stands at the nearest words said. Its own stage because every later stage asks
 * this one clock, and the beats it logs are the film's record.
 *
 * Reads: storyboard, timings, anchors, noted, entries (at each call: the director may give new ones).
 * Writes: beats, base (the plain clock), resolve(ref, how), clock (the logging clock).
 */
import {makeClock} from '../clock.mjs';
import {checkPhrase, standIn} from '../anchors.mjs';

export function timeClock(state) {
  const {anchors, noted} = state;
  // Every phrase the recipe names is logged as it is resolved: the film's making-of record says which
  // spoken words triggered which drawing.
  const beats = [], base = makeClock(state.storyboard, state.timings);
  // Noting the anchors ('note'): each of the recipe's own phrases not as written is noted once (with how it is read: a
  // beat, or the pause after it), and one not said stands at the nearest words said. A phrase a kit builds for itself
  // is read as ever, so a kit that probes nth until the clock refuses still stops.
  const resolve = (ref, how) => {
    if (anchors === 'refuse' || !state.entries.has(ref)) return base[how](ref);
    const check = checkPhrase(base, ref);
    if (check.problem && !noted.some(n => n.ref === ref)) noted.push({ref, path: state.entries.get(ref), how, ...check});
    return check.problem && check.problem !== 'ambiguous' ? standIn(base, ref, check, how) : base[how](ref);
  };
  const clock = {...base,
    at: ref => { const t = resolve(ref, 'at'); beats.push({ref, t: +t.toFixed(3), path: state.entries.get(ref) ?? null}); return t; },
    pauseAfter: ref => { const p = resolve(ref, 'pauseAfter'); beats.push({ref, t: +p.start.toFixed(3), path: state.entries.get(ref) ?? null}); return p; }};
  Object.assign(state, {beats, base, resolve, clock});
}
