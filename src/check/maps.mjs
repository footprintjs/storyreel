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

/** The most maps a check runs: past it the rest are counted, not run (runlog.mjs keeps as many). */
export const MAPS_MOST = 32;

/** One map's run: {name, kit, file, recorded, control, differs?} — `file` the record written (null when none was kept). */
async function runOne({name, kit, run}, file) {
  let sink = null;
  try { sink = file ? fileSink(file) : null; } catch { /* no record: the map is still built, and compared */ }
  const control = controlDepRecorder();
  let made = null, failed = null;
  try { made = await run({...(sink ? {sink} : {}), recorders: [control]}); } catch (e) { failed = String(e?.message ?? e); }
  let recorded = Boolean(sink) && !failed;
  try { await sink?.close(); } catch { recorded = false; }
  // which decision let each step run, as plain data beside the record (footprint-story/record · controlEdges)
  let edges = {};
  try { edges = made ? controlEdges(made.snapshot.commitLog, control) : {}; } catch { /* the record still answers, without the decisions' words */ }
  const differs = failed ? `the map flow failed where the kit built the map: ${failed}` : made.differs;
  return {name, kit, file: recorded ? file : null, recorded, control: edges, ...(differs ? {differs} : {})};
}

/**
 * Run every map the film hands out (film.mapRuns: [{name, kit, run}]), one after another. `recordFor(k)`: the file the
 * k-th map's record is written to while it runs (runlog.mjs · pendingRecord), or a throw: then that map keeps none.
 * Returns {maps: [{name, kit, file, recorded, control, differs?}], skipped}.
 */
export async function runMaps(mapRuns, {recordFor = () => null} = {}) {
  const asked = Array.isArray(mapRuns) ? mapRuns : [], maps = [];
  for (const one of asked.slice(0, MAPS_MOST)) {
    let file = null;
    try { file = recordFor(maps.length); } catch { /* an out folder that cannot hold a record: the map is built without one */ }
    maps.push(await runOne(one, file));
  }
  return {maps, skipped: Math.max(0, asked.length - MAPS_MOST)};
}

/**
 * What the check's reply says of its maps, one line each at most: a drift aloud, a record not kept, then how to ask
 * (`saved`: false when the check's run itself was not saved, so there is nothing to ask). Nothing when the film has no map.
 */
export function mapLines({maps, skipped}, {saved = true} = {}) {
  if (!maps.length) return [];
  const names = maps.map(m => m.name);
  return [
    ...maps.filter(m => m.differs).map(m => row(`drift · map ${m.name}: footprint-story's map flow did not build the map the kit drew — ${m.differs} (the film draws the kit's; report it to footprint-story)`)),
    ...(saved ? maps.filter(m => !m.recorded).map(m => `map ${m.name}: its record was not kept, so log --why cannot answer for it`) : []),
    ...(skipped ? [`maps: ${skipped} more not run (a check runs the first ${MAPS_MOST})`] : []),
    ...(saved ? [`maps: ${names.join(', ')} — why a block stands where it does: storyreel log --run 1 --why at --map ${names[0]}`] : []),
  ];
}
