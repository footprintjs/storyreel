// cameras — the focus camera's flights between shots run again as a chart, its run's record kept for `log --why`.
//
// WHY here, as the maps and the moves are (maps.mjs, motions.mjs): the flights are planned on the compile's synchronous
// path (flight/steps.mjs · planFlights, footprint-story/shot · planCameraMove) and a footprintjs run is asynchronous, so
// the compiled film hands the run out (film.cameraRuns, film/result.mjs) and the check runs it with its own record file.
// So "why does the camera take 2.12 s to frame the API" is answered from a real run of the same steps:
// `storyreel log --run 1 --why flight-0 --camera focus` (`flight-<k>`: focus.keys[k]'s flight, its kind, its seconds,
// the limit that set them and footprint-story's reason; `findings-<k>`: what its critics found).
//
// The same rules as a map's (flowrun.mjs): a record named by its place, a run that throws, returns nothing or never
// settles said aloud and never failing the check, each bounded. A run whose result is not the compile's is a `drift`.
// What the critics found is not said here: it is the review's `motion` check (review.mjs), counted with the rest.
import {row} from './problems.mjs';
import {runAll} from './flowrun.mjs';

/** The most camera runs a check runs (one today: the film's focus); the rest are counted. */
export const CAMERAS_MOST = 4;
/** How long the flights may take to run (ms): a few dozen keys plan in well under a second; a run that never settles must not hang the check. */
export const CAMERA_RUN_MS = 30_000;

const CAMERA_WORDS = Object.freeze({run: 'the camera run', noun: 'flights', failed: "the camera flow failed where the film planned the focus's flights"});

/**
 * Run the camera runs the film hands out (film.cameraRuns: [{name, kit, run, findings}]). `recordFor(k)`: the file the
 * k-th run's record is written to (runlog.mjs · pendingRecord), or a throw: none is kept.
 * Returns {cameras: [{name, kit, file, recorded, control, differs?}], skipped}.
 */
export async function runCameras(cameraRuns, {recordFor = () => null, ms = CAMERA_RUN_MS} = {}) {
  const {runs, skipped} = await runAll(cameraRuns, {recordFor, ms, most: CAMERAS_MOST, words: CAMERA_WORDS});
  return {cameras: runs, skipped};
}

/** What the check's reply says of the flights, one line each at most: a drift aloud, a record not kept, then how to ask. Nothing when no focus flies. */
export function cameraLines({cameras, skipped}, {run = null} = {}) {
  if (!cameras.length) return [];
  const saved = run !== null, asked = cameras.find(c => c.recorded);
  return [
    ...cameras.filter(c => c.differs).map(c => row(`drift · camera ${c.name}: the camera run did not plan the flights the film draws — ${c.differs} (the film draws its own plan)`)),
    ...(saved ? cameras.filter(c => !c.recorded).map(c => `camera ${c.name}: its record was not kept, so log --why cannot answer for it`) : []),
    ...(skipped ? [`cameras: ${skipped} more not run (a check runs the first ${CAMERAS_MOST})`] : []),
    ...(saved && asked ? [`cameras: ${cameras.map(c => c.name).join(', ')} — why a flight takes its time: storyreel log --run ${run} --why flight-0 --camera ${asked.name} (findings-<k>: what its critics found)`] : []),
  ];
}
