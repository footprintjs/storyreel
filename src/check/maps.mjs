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
import {fileSink} from 'footprintjs/sinks';
import {controlDepRecorder} from 'footprintjs/trace';
import {controlEdges} from 'footprint-story/record';
import {row} from './problems.mjs';
import {dropPending} from '../runlog.mjs';

/** The most maps a check runs: past it the rest are counted, not run (runlog.mjs keeps as many). */
export const MAPS_MOST = 32;

/** How long one map's run may take before it is given up (ms): a map is built in well under a second; a kit's run that never settles must not hang the check. */
export const MAP_RUN_MS = 30_000;

/** A run's answer as the check can use it: {snapshot, differs} with a commit log and a string or null, or why not. */
function readMade(made) {
  if (!made || typeof made !== 'object') return {failed: 'the map run returned no map'};
  const {snapshot, differs} = made;
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.commitLog)) return {failed: 'the map run returned no run (no snapshot with its commit log)'};
  if (differs !== null && typeof differs !== 'string') return {failed: 'the map run did not say whether its map is the kit\'s'};
  return {snapshot, differs};
}

/**
 * `promise`, or a rejection after `ms`: the timer is cleared either way. WHY not unref'd: the check is waiting on this
 * answer, so the timer must keep the process alive — unref'd, a run that never settles (nothing else pending) let the
 * process end before the bound, with the check's promise never settled (seen on CI, test/map-record.test.mjs).
 */
function within(promise, ms) {
  let timer;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`the map run did not finish within ${ms / 1000} s`)), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/**
 * One map's run: {name, kit, file, recorded, control, differs?} — `file` the record written (null when none was kept;
 * a file begun and not kept is removed). Never throws: a kit's `mapRun` is a public field, so whatever it does — throws,
 * returns nothing, never settles — is a failure said aloud (`differs`), and the check goes on.
 */
async function runOne({name, kit, run}, file, ms) {
  let sink = null;
  try { sink = file ? fileSink(file) : null; } catch { /* no record: the map is still built, and compared */ }
  const control = controlDepRecorder();
  let made = {failed: null};
  try { made = readMade(await within(Promise.resolve().then(() => run({...(sink ? {sink} : {}), recorders: [control]})), ms)); } catch (e) { made = {failed: thrownText(e)}; }
  let recorded = Boolean(sink) && !made.failed;
  try { await within(Promise.resolve(sink?.close()), ms); } catch { recorded = false; }
  if (file && !recorded) dropPending(file);
  // which decision let each step run, as plain data beside the record (footprint-story/record · controlEdges)
  let edges = {};
  try { edges = made.failed ? {} : controlEdges(made.snapshot.commitLog, control); } catch { /* the record still answers, without the decisions' words */ }
  const differs = made.failed ? `the map flow failed where the kit built the map: ${made.failed}` : made.differs;
  return {name, kit, file: recorded ? file : null, recorded, control: edges, ...(differs ? {differs} : {})};
}

/** Whatever was thrown, in words: never a throw itself. */
function thrownText(e) {
  try { return String(e?.message ?? e); } catch { return 'something that cannot be said in words was thrown'; }
}

/**
 * Run every map the film hands out (film.mapRuns: [{name, kit, run}]), one after another. `recordFor(k)`: the file the
 * k-th map's record is written to while it runs (runlog.mjs · pendingRecord), or a throw: then that map keeps none.
 * Returns {maps: [{name, kit, file, recorded, control, differs?}], skipped}.
 */
export async function runMaps(mapRuns, {recordFor = () => null, ms = MAP_RUN_MS} = {}) {
  const asked = Array.isArray(mapRuns) ? mapRuns : [], maps = [];
  for (const one of asked.slice(0, MAPS_MOST)) {
    let file = null;
    try { file = recordFor(maps.length); } catch { /* an out folder that cannot hold a record: the map is built without one */ }
    maps.push(await runOne(one ?? {}, file, ms));
  }
  return {maps, skipped: Math.max(0, asked.length - MAPS_MOST)};
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
