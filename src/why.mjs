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
import {whyFromRecord, WHY_LIMITS} from 'footprint-story/record';

/** The reader's bounds (footprint-story/record · WHY_LIMITS), under the names this module has always given them. */
export const WHY_LINES = WHY_LIMITS.lines, WHY_VALUE = WHY_LIMITS.value, RECORD_MOST = WHY_LIMITS.bytes, STEPS_MOST = WHY_LIMITS.steps, READS_MOST = WHY_LIMITS.reads, ROWS_MOST = WHY_LIMITS.rows;

/**
 * Why `key` is what it is in a run. `run`: a saved run (runlog.mjs · listRuns) — one that kept no record says so, and
 * says which features do. Returns text.
 */
export async function whyText(run, key, {all = false} = {}) {
  if (typeof key !== 'string' || !key.trim()) throw new Error('--why names a value of the run, one of what its stages wrote (storyreel log --run 1 --only steps lists them)');
  if (/[.[\]]/.test(key)) throw new Error(`--why names a value by its own name (verdict, errors), not a part of one: ${JSON.stringify(key.trim().slice(0, 60))}`);
  if (!run.recordFile) throw new Error(`run ${run.n} (${run.feature}) kept no record, so it cannot say why: a check keeps one (storyreel check, then storyreel log --run 1 --why verdict)`);
  return whyFromRecord({file: run.recordFile, control: run.control, key, run: `run ${run.n}`, all, more: 'add --all', listed: `storyreel log --run ${run.n} --only steps lists what each wrote`});
}
