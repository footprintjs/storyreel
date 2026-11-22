// why — where a value of a run came from, read from the run's own record.
//
//   storyreel log --run 1 --why verdict
//   verdict = "fix"
//   fix (fix#7) [wrote: verdict]
//     verdict (verdict#6) ← [control: there is something to fix]
//       count the errors (errors#3) ← via errors [wrote: errors]
//
// The reader is footprint-story/record · whyFromRecord, the one StoryDeck uses too: the record is read as a file anyone
// may have written (a plain file within its bounds, one run, every line of the answer one line), one that is not whole
// says so first, and every answer ends by saying what no record holds. This file says it in StoryReel's words: how a
// run is named, which runs keep a record, and how to list what a run's stages wrote.
//
// A check also keeps one record per isometric world, its map built again by footprint-story's map flow (check/maps.mjs):
// `--map story` reads that record instead of the check's own, so `--why at --map story` says why the blocks stand where
// they do — through the place step and the decision that let it run.
//
// And one record per world whose pieces move by intent, its moves run again through footprint-story's intent decider
// (check/motions.mjs): `--motion story` reads that one, so `--why duration-1 --motion story` says why motion[1] takes
// its time — the law's numbers, the plan, and the rule that chose its model. A whiteboard's drawings are planned by the
// same decider (kits/whiteboard/sketch.mjs, `do: 'sketch'`), so `--why duration-0 --motion story` says how many strokes
// and lifts its first drawing takes, the fewest its corners allow, and its seconds.
//
// And one record of the focus camera's flights between shots, run again as a chart of the steps the compile ran
// (check/cameras.mjs, flight/run.mjs): `--camera focus` reads that one, so `--why flight-1 --camera focus` says why
// focus.keys[1]'s flight takes its time — footprint-story's reason, its kind, its seconds and the limit that set them.
import {whyFromRecord, WHY_LIMITS} from 'footprint-story/record';
import {FLIGHT_KEYS, PER_FLIGHT} from './flight/steps.mjs';
import {ISO_MAP_STEPS} from 'footprint-story/isometric';
import {HUMAN_STEPS, PER_INTENT} from 'footprint-story/human';

/** The reader's bounds (footprint-story/record · WHY_LIMITS), under the names this module has always given them. */
export const WHY_LINES = WHY_LIMITS.lines, WHY_VALUE = WHY_LIMITS.value, RECORD_MOST = WHY_LIMITS.bytes, STEPS_MOST = WHY_LIMITS.steps, READS_MOST = WHY_LIMITS.reads, ROWS_MOST = WHY_LIMITS.rows;

/**
 * Why `key` is what it is in a run. `run`: a saved run (runlog.mjs · listRuns) — one that kept no record says so, and
 * says which features do. Returns text.
 */
export async function whyText(run, key, {all = false, map = null, motion = null, camera = null} = {}) {
  if ([map, motion, camera].filter(x => x !== null).length > 1) throw new Error('--map, --motion and --camera each pick the record --why reads: give one of them');
  if (camera !== null && (typeof key !== 'string' || !key.trim())) throw new Error(`--why names a value of the flights, one of what their steps write: ${CAMERA_LISTED}`);
  if (map !== null && (typeof key !== 'string' || !key.trim())) throw new Error(`--why names a value of the map, one of what its steps write: ${MAP_KEYS.join(', ')}`);
  if (motion !== null && (typeof key !== 'string' || !key.trim())) throw new Error(`--why names a value of the moves, one of what their steps write: ${MOTION_LISTED}`);
  if (typeof key !== 'string' || !key.trim()) throw new Error('--why names a value of the run, one of what its stages wrote (storyreel log --run 1 --only steps lists them)');
  if (/[.[\]]/.test(key)) throw new Error(`--why names a value by its own name (verdict, errors), not a part of one: ${JSON.stringify(key.trim().slice(0, 60))}`);
  if (map !== null) return mapWhy(run, key, map, {all});
  if (motion !== null) return motionWhy(run, key, motion, {all});
  if (camera !== null) return cameraWhy(run, key, camera, {all});
  if (!run.recordFile) throw new Error(`run ${run.n} (${run.feature}) kept no record, so it cannot say why: a check keeps one (storyreel check, then storyreel log --run 1 --why verdict)`);
  return whyFromRecord({file: run.recordFile, control: run.control, key, run: `run ${run.n}`, all, more: 'add --all', listed: `storyreel log --run ${run.n} --only steps lists what each wrote`});
}

/** Every key a map's steps write (footprint-story/isometric · ISO_MAP_STEPS, each branch's too), once each, in order. */
export const MAP_KEYS = Object.freeze([...new Set(ISO_MAP_STEPS.flatMap(s => [...(s.decides?.writes ?? []), ...s.writes, ...Object.values(s.branches ?? {}).flatMap(b => b.writes)]))]);
const quoted = text => JSON.stringify(String(text).trim().slice(0, 60));

/**
 * Why `key` is what it is in one of a run's maps (`map`: its world's recipe path, `story` or `stages[1]`). Every
 * refusal names what there is: the maps the run keeps, or, when it keeps none, the worlds its film has. The name asked
 * is only compared with the names kept: no file is found by it.
 */
async function mapWhy(run, key, map, {all}) {
  if (typeof map !== 'string' || !map.trim()) throw new Error('--map names one of the run\'s maps by its world\'s place in the recipe (--map story, --map \'stages[1]\')');
  const maps = run.maps ?? [], worlds = Object.entries(run.worlds ?? {});
  if (!maps.length) {
    if (run.feature !== 'check') throw new Error(`run ${run.n} (${run.feature}) kept no map: a check keeps one for each isometric world (storyreel check, then storyreel log --run 1 --why at --map story)`);
    // a check from 0.40.0 on writes its maps, even none: a run with no list was kept before maps were
    if (run.maps === undefined) throw new Error(`run ${run.n} was kept before 0.40.0, which kept no map records: run storyreel check again, then ask that run`);
    if (/^broken\b/.test(run.summary ?? '')) throw new Error(`run ${run.n} kept no map: its film did not compile, so no map was built`);
    throw new Error(`run ${run.n} kept no map: its film has no isometric world${worlds.length ? ` — its worlds are ${worlds.map(([name, kit]) => `${name} (${kit})`).join(', ')}` : ', and no world drawn by a kit'}`);
  }
  const m = maps.find(x => x.name === map.trim());
  if (!m) throw new Error(`run ${run.n} has no map ${quoted(map)}: its maps are ${maps.map(x => x.name).join(', ')}`);
  if (!m.recordFile) throw new Error(`run ${run.n}'s map ${m.name} kept no record (it could not be written when the check ran), so it cannot say why`);
  const said = await whyFromRecord({file: m.recordFile, control: m.control, key, run: `run ${run.n} map ${m.name}`, all, more: 'add --all', listed: `a map's steps write ${MAP_KEYS.join(', ')}`});
  // a map flow that parted from the kit's map is said before its answer: the film draws the kit's
  return m.differs ? `(this map flow did not build the map the kit drew: ${m.differs})\n${said}` : said;
}

/** Every key the intent decider's steps write (footprint-story/human · HUMAN_STEPS), and the per-move ones (`duration-<i>`). */
export const MOTION_KEYS = Object.freeze([...new Set(HUMAN_STEPS.flatMap(s => [...(s.decides?.writes ?? []), ...s.writes]))]);
const MOTION_LISTED = `${MOTION_KEYS.join(', ')}, and for motion[i] alone ${Object.keys(PER_INTENT).map(k => `${k}-<i>`).join(', ')} (duration-0: why motion[0] takes its time; on a whiteboard, i counts its drawings — each draw item and each eureka, in order — and the record names each by its item)`;

/**
 * Why `key` is what it is in one of a run's worlds' moves (`motion`: its world's recipe path, `story` or `stages[1]`).
 * The same rules as a map's: every refusal names what there is, and the name asked is only compared with the names kept.
 */
async function motionWhy(run, key, motion, {all}) {
  if (typeof motion !== 'string' || !motion.trim()) throw new Error('--motion names one of the run\'s worlds that move by its place in the recipe (--motion story, --motion \'stages[1]\')');
  const kept = run.motions ?? [], worlds = Object.entries(run.worlds ?? {});
  if (!kept.length) {
    if (run.feature !== 'check') throw new Error(`run ${run.n} (${run.feature}) kept no moves: a check keeps one record for each world whose pieces move (storyreel check, then storyreel log --run 1 --why duration-0 --motion story)`);
    // a check from 0.43.0 on writes its motions, even none: a run with no list was kept before worlds moved
    if (run.motions === undefined) throw new Error(`run ${run.n} was kept before 0.43.0, which kept no motion records: run storyreel check again, then ask that run`);
    if (/^broken\b/.test(run.summary ?? '')) throw new Error(`run ${run.n} kept no moves: its film did not compile, so nothing was planned`);
    throw new Error(`run ${run.n} kept no moves: no world of its film has a motion${worlds.length ? ` — its worlds are ${worlds.map(([name, kit]) => `${name} (${kit})`).join(', ')}` : ''}`);
  }
  const m = kept.find(x => x.name === motion.trim());
  if (!m) throw new Error(`run ${run.n} has no moves for ${quoted(motion)}: its worlds that move are ${kept.map(x => x.name).join(', ')}`);
  if (!m.recordFile) throw new Error(`run ${run.n}'s moves for ${m.name} kept no record (it could not be written when the check ran), so they cannot say why`);
  const said = await whyFromRecord({file: m.recordFile, control: m.control, key, run: `run ${run.n} motion ${m.name}`, all, more: 'add --all', listed: `the moves' steps write ${MOTION_LISTED}`});
  // a run whose moves parted from the compile's is said before its answer: the film draws the compile's
  return m.differs ? `(this run did not plan the moves the kit drew: ${m.differs})\n${said}` : said;
}

const CAMERA_LISTED = `${FLIGHT_KEYS.join(', ')}, and for focus.keys[k] alone ${PER_FLIGHT.map(k => `${k}-<k>`).join(', ')} (flight-0: why focus.keys[0]'s flight takes its time)`;

/**
 * Why `key` is what it is in a run's camera flights (`camera`: what flies it, `focus`). The same rules as a map's: every
 * refusal names what there is, and the name asked is only compared with the names kept.
 */
async function cameraWhy(run, key, camera, {all}) {
  if (typeof camera !== 'string' || !camera.trim()) throw new Error('--camera names what flies the camera: --camera focus (the film\'s focus)');
  const kept = run.cameras ?? [];
  if (!kept.length) {
    if (run.feature !== 'check') throw new Error(`run ${run.n} (${run.feature}) kept no flights: a check keeps one record when the film's focus flies the camera (storyreel check, then storyreel log --run 1 --why flight-0 --camera focus)`);
    // a check from 0.47.0 on writes its cameras, even none: a run with no list was kept before flights were recorded
    if (run.cameras === undefined) throw new Error(`run ${run.n} was kept before 0.47.0, which kept no camera records: run storyreel check again, then ask that run`);
    if (/^broken\b/.test(run.summary ?? '')) throw new Error(`run ${run.n} kept no flights: its film did not compile, so nothing was planned`);
    throw new Error(`run ${run.n} kept no flights: its film's focus does not fly the camera (a "camera" focus does: {"focus": {"strategy": "camera", "keys": [...]}})`);
  }
  const c = kept.find(x => x.name === camera.trim());
  if (!c) throw new Error(`run ${run.n} has no flights for ${quoted(camera)}: what flies its camera is ${kept.map(x => x.name).join(', ')}`);
  if (!c.recordFile) throw new Error(`run ${run.n}'s flights for ${c.name} kept no record (it could not be written when the check ran), so they cannot say why`);
  const said = await whyFromRecord({file: c.recordFile, control: c.control, key, run: `run ${run.n} camera ${c.name}`, all, more: 'add --all', listed: `the flights' steps write ${CAMERA_LISTED}`});
  // a run whose flights parted from the compile's is said before its answer: the film draws the compile's
  return c.differs ? `(this run did not plan the flights the film draws: ${c.differs})\n${said}` : said;
}
