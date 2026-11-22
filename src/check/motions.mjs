// motions — each world's moves run again through footprint-story's intent decider as a chart, its run's record kept for
// `log --why`.
//
// WHY here, as the maps are (maps.mjs): a world's moves are planned on the compile's synchronous path (footprint-story ·
// planIntents) and a footprintjs run is asynchronous, so the compiled film hands each such world's run out
// (film.motionRuns, film/result.mjs) and the check runs it, each world's moves a run of its own with its own record file.
// So "why does the ball take 1.13 s" is answered from a real run of the same steps:
// `storyreel log --run 1 --why duration-1 --motion story` (`duration-<i>`: motion[i]'s seconds and the law's numbers).
//
// The same rules as a map's (flowrun.mjs): a record named by its place, a run that throws, returns nothing or never
// settles said aloud and never failing the check, each bounded. A run whose result is not the compile's is a `drift`.
// What the critics found is not said here: it is the review's `motion` check (review.mjs), so it is counted with the
// rest of what the check finds.
import {row} from './problems.mjs';
import {runAll} from './flowrun.mjs';

/** The most worlds' moves a check runs: past it the rest are counted, not run (runlog.mjs keeps as many). */
export const MOTIONS_MOST = 32;

/** How long one world's moves may take to run (ms): 64 moves plan in well under a second; a run that never settles must not hang the check. */
export const MOTION_RUN_MS = 30_000;

/** How a world's moves are named in what the check says (flowrun.mjs). */
const MOTION_WORDS = Object.freeze({run: 'the motion run', noun: 'motion', failed: 'the motion flow failed where the kit planned the moves'});

/**
 * Run every world's moves the film hands out (film.motionRuns: [{name, kit, run, findings}]), one after another.
 * `recordFor(k)`: the file the k-th run's record is written to (runlog.mjs · pendingRecord), or a throw: none is kept.
 * Returns {motions: [{name, kit, file, recorded, control, differs?}], skipped}.
 */
export async function runMotions(motionRuns, {recordFor = () => null, ms = MOTION_RUN_MS} = {}) {
  const {runs, skipped} = await runAll(motionRuns, {recordFor, ms, most: MOTIONS_MOST, words: MOTION_WORDS});
  return {motions: runs, skipped};
}

/**
 * What the check's reply says of its worlds' moves, one line each at most: a drift aloud, a record not kept, then how
 * to ask, the run named by its id, of the first world that kept a record. Nothing when the film moves nothing.
 */
export function motionLines({motions, skipped}, {run = null} = {}) {
  if (!motions.length) return [];
  const names = motions.map(m => m.name), saved = run !== null, asked = motions.find(m => m.recorded);
  return [
    ...motions.filter(m => m.differs).map(m => row(`drift · motion ${m.name}: footprint-story's intent decider did not plan the moves the kit drew — ${m.differs} (the film draws the kit's; report it to footprint-story)`)),
    ...(saved ? motions.filter(m => !m.recorded).map(m => `motion ${m.name}: its record was not kept, so log --why cannot answer for it`) : []),
    ...(skipped ? [`motions: ${skipped} more not run (a check runs the first ${MOTIONS_MOST})`] : []),
    ...(saved && asked ? [`motions: ${names.join(', ')} — why a move takes its time: storyreel log --run ${run} --why duration-0 --motion ${/^\w+$/.test(asked.name) ? asked.name : `'${asked.name}'`} (model-<i>: why its model; findings-<i>: what its critics found)`] : []),
  ];
}
