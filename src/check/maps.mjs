// maps — each isometric world's map built again by footprint-story's map flow, its run's record kept for `log --why`.
//
// WHY here: a check is the agent's loop after an edit, and it already keeps a record per run that `storyreel log --why`
// reads. A world's map is built on the compile's synchronous path (buildIsoMap); a footprintjs run is asynchronous, so
// the compiled film hands each such world's run out (film.mapRuns, film/result.mjs) and the check runs it, each map a
// run of its own with its own record file (a record holds one run). So "why does this block stand here" is answered
// from a real run of the same steps: `storyreel log --run 1 --why at --map story`. See README.md · Asking why a map is so.
//
// A map flow whose map is not the kit's is said aloud (`drift`): the film draws the kit's map, so it is no fault of the
// film's, and no verdict counts it, but a person must hear it. A record that cannot be written never costs the check.
import {row} from './problems.mjs';
import {runAll} from './flowrun.mjs';

/** The most maps a check runs: past it the rest are counted, not run (runlog.mjs keeps as many). */
export const MAPS_MOST = 32;

/** How long one map's run may take before it is given up (ms): a map is built in well under a second; a kit's run that never settles must not hang the check. */
export const MAP_RUN_MS = 30_000;

/** How a map's run is named in what the check says (flowrun.mjs). */
const MAP_WORDS = Object.freeze({run: 'the map run', noun: 'map', failed: 'the map flow failed where the kit built the map'});

/**
 * Run every map the film hands out (film.mapRuns: [{name, kit, run}]), one after another, under flowrun.mjs's rules:
 * a run that throws, returns nothing or never settles is said aloud (`differs`), never thrown. `recordFor(k)`: the file
 * the k-th map's record is written to while it runs (runlog.mjs · pendingRecord), or a throw: then that map keeps none.
 * Returns {maps: [{name, kit, file, recorded, control, differs?}], skipped}.
 */
export async function runMaps(mapRuns, {recordFor = () => null, ms = MAP_RUN_MS} = {}) {
  const {runs, skipped} = await runAll(mapRuns, {recordFor, ms, most: MAPS_MOST, words: MAP_WORDS});
  return {maps: runs, skipped};
}

/**
 * What the check's reply says of its maps, one line each at most: a drift aloud, a record not kept, then how to ask,
 * the run named by its id (`run`: the check's run id; a run's number moves when another is saved, its id never), of
 * the first map that kept a record. `run` null: the check's run was not saved, so there is nothing to ask. Nothing
 * when the film has no map.
 */
export function mapLines({maps, skipped}, {run = null} = {}) {
  if (!maps.length) return [];
  const names = maps.map(m => m.name), saved = run !== null, asked = maps.find(m => m.recorded);
  return [
    ...maps.filter(m => m.differs).map(m => row(`drift · map ${m.name}: footprint-story's map flow did not build the map the kit drew — ${m.differs} (the film draws the kit's; report it to footprint-story)`)),
    ...(saved ? maps.filter(m => !m.recorded).map(m => `map ${m.name}: its record was not kept, so log --why cannot answer for it`) : []),
    ...(skipped ? [`maps: ${skipped} more not run (a check runs the first ${MAPS_MOST})`] : []),
    ...(saved && asked ? [`maps: ${names.join(', ')} — why a block stands where it does: storyreel log --run ${run} --why at --map ${/^\w+$/.test(asked.name) ? asked.name : `'${asked.name}'`}`] : []),
  ];
}
