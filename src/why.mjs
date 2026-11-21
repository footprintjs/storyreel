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
import {whyFromRecord, WHY_LIMITS} from 'footprint-story/record';
import {ISO_MAP_STEPS} from 'footprint-story/isometric';

/** The reader's bounds (footprint-story/record · WHY_LIMITS), under the names this module has always given them. */
export const WHY_LINES = WHY_LIMITS.lines, WHY_VALUE = WHY_LIMITS.value, RECORD_MOST = WHY_LIMITS.bytes, STEPS_MOST = WHY_LIMITS.steps, READS_MOST = WHY_LIMITS.reads, ROWS_MOST = WHY_LIMITS.rows;

/**
 * Why `key` is what it is in a run. `run`: a saved run (runlog.mjs · listRuns) — one that kept no record says so, and
 * says which features do. Returns text.
 */
export async function whyText(run, key, {all = false, map = null} = {}) {
  if (map !== null && (typeof key !== 'string' || !key.trim())) throw new Error(`--why names a value of the map, one of what its steps write: ${MAP_KEYS.join(', ')}`);
  if (typeof key !== 'string' || !key.trim()) throw new Error('--why names a value of the run, one of what its stages wrote (storyreel log --run 1 --only steps lists them)');
  if (/[.[\]]/.test(key)) throw new Error(`--why names a value by its own name (verdict, errors), not a part of one: ${JSON.stringify(key.trim().slice(0, 60))}`);
  if (map !== null) return mapWhy(run, key, map, {all});
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
