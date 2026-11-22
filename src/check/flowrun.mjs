// flowrun — one recorded run a kit hands out (a map flow, a world's moves), run by the check and trusted for nothing.
//
// WHY one module: the check runs two kinds of kit run beside the compile — each isometric world's map (maps.mjs) and
// each world's moves (motions.mjs) — under the same safety rules: a record file named by place, never by recipe text;
// a run that throws, returns nothing or never settles said aloud, never failing the check; every run bounded in time.
// One copy of those rules cannot drift between the two.
import {fileSink} from 'footprintjs/sinks';
import {controlDepRecorder} from 'footprintjs/trace';
import {controlEdges} from 'footprint-story/record';
import {dropPending} from '../runlog.mjs';

/** Whatever was thrown, in words: never a throw itself. */
export function thrownText(e) {
  try { return String(e?.message ?? e); } catch { return 'something that cannot be said in words was thrown'; }
}

/**
 * `promise`, or a rejection after `ms`: the timer is cleared either way. WHY not unref'd: the check is waiting on this
 * answer, so the timer must keep the process alive — unref'd, a run that never settles (nothing else pending) let the
 * process end before the bound, with the check's promise never settled (seen on CI, test/map-record.test.mjs).
 */
function within(promise, ms, run) {
  let timer;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${run} did not finish within ${ms / 1000} s`)), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** A run's answer as the check can use it: {snapshot, differs} with a commit log and a string or null, or why not. */
function readMade(made, {run, noun}) {
  if (!made || typeof made !== 'object') return {failed: `${run} returned no ${noun}`};
  const {snapshot, differs} = made;
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.commitLog)) return {failed: `${run} returned no run (no snapshot with its commit log)`};
  if (differs !== null && typeof differs !== 'string') return {failed: `${run} did not say whether its ${noun} is the kit's`};
  return {snapshot, differs};
}

/**
 * One kit run: {name, kit, file, recorded, control, differs?} — `file` the record written (null when none was kept; a
 * file begun and not kept is removed). Never throws: a kit's run is a public field, so whatever it does — throws,
 * returns nothing, never settles — is a failure said aloud (`differs`), and the check goes on. `words`: how the run is
 * named in what is said — {run: 'the map run', noun: 'map', failed: 'the map flow failed where the kit built the map'}.
 */
export async function runRecorded({name, kit, run}, file, ms, words) {
  let sink = null;
  try { sink = file ? fileSink(file) : null; } catch { /* no record: the run still runs, and is compared */ }
  const control = controlDepRecorder();
  let made = {failed: null};
  try { made = readMade(await within(Promise.resolve().then(() => run({...(sink ? {sink} : {}), recorders: [control]})), ms, words.run), words); } catch (e) { made = {failed: thrownText(e)}; }
  let recorded = Boolean(sink) && !made.failed;
  try { await within(Promise.resolve(sink?.close()), ms, words.run); } catch { recorded = false; }
  if (file && !recorded) dropPending(file);
  // which decision let each step run, as plain data beside the record (footprint-story/record · controlEdges)
  let edges = {};
  try { edges = made.failed ? {} : controlEdges(made.snapshot.commitLog, control); } catch { /* the record still answers, without the decisions' words */ }
  const differs = made.failed ? `${words.failed}: ${made.failed}` : made.differs;
  return {name, kit, file: recorded ? file : null, recorded, control: edges, ...(differs ? {differs} : {})};
}

/**
 * Every run a film hands out, one after another, at most `most` (the rest counted, not run). `recordFor(k)`: the file
 * the k-th run's record is written to (runlog.mjs · pendingRecord), or a throw: then that run keeps none.
 * Returns {runs: [{name, kit, file, recorded, control, differs?}], skipped}.
 */
export async function runAll(given, {recordFor = () => null, ms, most, words}) {
  const asked = Array.isArray(given) ? given : [], runs = [];
  for (const one of asked.slice(0, most)) {
    let file = null;
    try { file = recordFor(runs.length); } catch { /* an out folder that cannot hold a record: the run goes on without one */ }
    runs.push(await runRecorded(one ?? {}, file, ms, words));
  }
  return {runs, skipped: Math.max(0, asked.length - most)};
}
