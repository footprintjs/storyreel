// why — where a value of a run came from, read from the run's own record.
//
//   storyreel log --run 1 --why verdict
//   verdict = "fix"
//   fix (fix#5) [wrote: verdict]
//     verdict (verdict#4) ← [control: there is something to fix]
//       beside the run before (since#3) ← via errors [wrote: errors, …]
//
// WHY: a run's words (its narrative) say what happened in order; they do not answer "why is this number so" without
// reading all of them. A run that keeps its record (runlog.mjs · saveRun, `kept`) keeps every commit as it was written,
// which keys each stage had read when it wrote, and which decision let each stage run. foottrace walks back from the
// key over that — nothing is run again, and nothing is guessed: a value the record cannot explain is said so.
//
// The record is a file in the project's out folder, so it is read as data anyone may have written: only as a plain
// file (footprintjs/sinks · readRecordFile: never through a link), its entries checked one by one (foottrace ·
// readStoredRecord), within bounds, and every line of the answer is one line (oneline.mjs).
import {readRecordFile} from 'footprintjs/sinks';
import {readStoredRecord, sliceForKey, formatSlice, findLastWriter, commitValueAt, keysReadFromMap, controlDepsFromMap} from 'foottrace';
import {oneLine} from './oneline.mjs';

/** The most lines an answer holds, and the most characters of a value it shows. */
export const WHY_LINES = 40, WHY_VALUE = 200;

/** The keys each stage had read when it wrote, from the record's own rows: {runtimeStageId: [key]}. */
function readsOf(commitLog) {
  const reads = new Map();
  for (const bundle of commitLog) for (const row of bundle.trace ?? []) for (const key of row.readKeys ?? []) {
    if (typeof key !== 'string') continue;
    if (!reads.has(bundle.runtimeStageId)) reads.set(bundle.runtimeStageId, new Set());
    reads.get(bundle.runtimeStageId).add(key);
  }
  return Object.fromEntries([...reads].map(([id, keys]) => [id, [...keys]]));
}

const shown = value => { const said = value === undefined ? 'nothing (never written)' : JSON.stringify(value) ?? String(value); return said.length > WHY_VALUE ? `${said.slice(0, WHY_VALUE - 1)}…` : said; };

/**
 * Why `key` is what it is in a run: its value, then the stage that wrote it, the decision that let that stage run and
 * what each had read, walked back. `run`: a saved run (runlog.mjs · listRuns) — one that kept no record says so, and
 * says which features do. Returns text.
 */
export async function whyText(run, key, {all = false} = {}) {
  if (typeof key !== 'string' || !key.trim()) throw new Error('--why names a value of the run, one of what its stages wrote (storyreel log --run 1 --only steps lists them)');
  if (!run.recordFile) throw new Error(`run ${run.n} (${run.feature}) kept no record, so it cannot say why: a check keeps one (storyreel check, then storyreel log --run 1 --why verdict)`);
  const {entries, unreadable} = await readRecordFile(run.recordFile);
  const logs = [...readStoredRecord(entries).logs.values()], log = logs.find(l => l.address.drillPath.length === 0) ?? logs[0];
  if (!log || !log.commitLog.length) throw new Error(`run ${run.n}'s record holds no step: ${oneLine(run.recordFile)}`);
  const commits = [...log.commitLog], name = key.trim();
  const slice = sliceForKey(commits, name, keysReadFromMap(readsOf(commits)), {controlDeps: controlDepsFromMap(run.control ?? {})});
  const writer = findLastWriter(commits, name), value = writer ? commitValueAt(commits, commits.length - 1, name) : undefined;
  const lines = [`${name} = ${shown(value)}`, ...formatSlice(slice).split('\n').filter(line => !/^SLICE for /.test(line))].map(oneLine);
  const notes = [...(log.complete ? [] : ['(this run did not finish: its record stops where it stopped)']), ...(log.gaps.length ? [`(${log.gaps.length} of its steps could not be read back)`] : []),
    ...(unreadable?.length ? [`(${unreadable.length} lines of its record could not be read)`] : [])];
  const kept = all ? lines : lines.slice(0, WHY_LINES);
  return [...kept, ...(lines.length > kept.length ? [`… ${lines.length - kept.length} more: add --all`] : []), ...notes].join('\n');
}
