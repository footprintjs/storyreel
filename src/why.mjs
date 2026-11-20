// why — where a value of a run came from, read from the run's own record.
//
//   storyreel log --run 1 --why verdict
//   verdict = "fix"
//   fix (fix#6) [wrote: verdict]
//     verdict (verdict#5) ← [control: there is something to fix]
//       count the errors (errors#3) ← via errors [wrote: errors]
//
// WHY: a run's words (its narrative) say what happened in order; they do not answer "why is this number so" without
// reading all of them. A run that keeps its record (runlog.mjs · saveRun, `kept`) keeps every commit as it was written,
// which keys each stage had read when it wrote, and which decision let each stage run. foottrace walks back from the
// key over that — nothing is run again, and nothing is guessed.
//
// The record is a file in the project's out folder, so it is read as data anyone may have written:
//   - only as a plain file of at most RECORD_MOST bytes, never through a link (footprintjs/sinks · readRecordFile);
//   - its entries checked one by one (foottrace · readStoredRecord), and it must hold one run: a second is refused;
//   - before the walk, what the answer would show of it (a stage's name and id, a key) is made one line and cut, and
//     each row's list of keys read is cut to READS_MOST, so a planted name starts no line and a planted list costs no time;
//   - an edge of the saved control map is used only when it names a step of this record that ran before the step it governs;
//   - a record that is not whole says so FIRST, and then a value it does not find is "not found in what could be read",
//     never "never written".
// What the record cannot hold is said under every answer: a stage also uses what it is given from outside the run's
// own state (the film, the check before), and that is in no record.
import {lstatSync} from 'node:fs';
import {readRecordFile} from 'footprintjs/sinks';
import {readStoredRecord, sliceForKey, formatSlice, findLastWriter, commitValueAt, keysReadFromMap, controlDepsFromMap} from 'foottrace';
import {oneLine} from './oneline.mjs';

/** The most lines an answer holds, the most characters of a value or a name it shows, the most bytes of a record it reads, the most steps and keys it walks. */
export const WHY_LINES = 40, WHY_VALUE = 200, RECORD_MOST = 8 * 1024 * 1024, STEPS_MOST = 5000, READS_MOST = 200;
const OUTSIDE = '(a stage also uses what it is given from outside the run\'s own state — the film, the check before: the record holds what stages read and wrote, and no more)';

const name = text => { const said = oneLine(String(text ?? '')); return said.length > WHY_VALUE ? `${said.slice(0, WHY_VALUE - 1)}…` : said; };
const shown = value => { const said = JSON.stringify(value) ?? String(value); return said.length > WHY_VALUE ? `${said.slice(0, WHY_VALUE - 1)}…` : said; };

/** A commit as the walk may show it: its names one line and cut, its rows' keys read cut to READS_MOST. Its values are left as stored (they are shown through JSON, never raw). */
function plainCommit(bundle) {
  const text = key => (typeof bundle[key] === 'string' ? {[key]: name(bundle[key])} : {});
  const rows = Array.isArray(bundle.trace) ? bundle.trace.filter(row => row && typeof row === 'object').map(row => ({...row,
    ...(typeof row.path === 'string' ? {path: name(row.path)} : {}),
    ...(Array.isArray(row.readKeys) ? {readKeys: row.readKeys.slice(0, READS_MOST).filter(k => typeof k === 'string').map(name)} : {})})) : [];
  return {...bundle, ...text('stage'), ...text('stageId'), ...text('stageName'), ...text('runtimeStageId'), trace: rows};
}

/** The keys each stage had read when it wrote, from the record's own rows: {runtimeStageId: [key]}. */
function readsOf(commits) {
  const reads = new Map();
  for (const bundle of commits) for (const row of bundle.trace) for (const key of row.readKeys ?? []) {
    if (!reads.has(bundle.runtimeStageId)) reads.set(bundle.runtimeStageId, new Set());
    reads.get(bundle.runtimeStageId).add(key);
  }
  return Object.fromEntries([...reads].map(([id, keys]) => [id, [...keys]]));
}

/** The saved control edges that are true of this record: the decider is a step of it, and ran before the step it let run. */
function controlOf(control, commits) {
  const at = new Map(commits.map((bundle, i) => [bundle.runtimeStageId, i])), out = {};
  for (const [step, edge] of Object.entries(control ?? {})) {
    const i = at.get(name(step)), d = at.get(name(edge?.deciderId));
    if (i !== undefined && d !== undefined && d < i) out[name(step)] = {deciderId: name(edge.deciderId), ...(typeof edge.label === 'string' ? {label: name(edge.label)} : {})};
  }
  return out;
}

/** The record file's entries: read only as a plain file of a size a run's record can have, a refusal saying what it is. */
async function entriesOf(run) {
  let size;
  try { size = lstatSync(run.recordFile).size; } catch { throw new Error(`run ${run.n}'s record is gone: ${name(run.recordFile)}`); }
  if (size > RECORD_MOST) throw new Error(`run ${run.n}'s record is ${Math.round(size / 1e6)} MB, more than a run writes (${RECORD_MOST / 1024 / 1024} MB at most): it was changed, and is not read`);
  try { return await readRecordFile(run.recordFile); } catch (e) { throw new Error(`run ${run.n}'s record cannot be read as a plain file of its own (${name(e?.code ?? e?.message ?? e)}): ${name(run.recordFile)}`); }
}

/**
 * Why `key` is what it is in a run: its value, then the stage that wrote it, the decision that let that stage run and
 * what each had read, walked back. `run`: a saved run (runlog.mjs · listRuns) — one that kept no record says so, and
 * says which features do. Returns text.
 */
export async function whyText(run, key, {all = false} = {}) {
  const asked = typeof key === 'string' ? key.trim() : '';
  if (!asked) throw new Error('--why names a value of the run, one of what its stages wrote (storyreel log --run 1 --only steps lists them)');
  if (/[.[\]]/.test(asked)) throw new Error(`--why names a value by its own name (verdict, errors), not a part of one: ${JSON.stringify(asked.slice(0, 60))}`);
  if (!run.recordFile) throw new Error(`run ${run.n} (${run.feature}) kept no record, so it cannot say why: a check keeps one (storyreel check, then storyreel log --run 1 --why verdict)`);
  const {entries, unreadable} = await entriesOf(run), logs = [...readStoredRecord(entries).logs.values()];
  if (logs.length > 1) throw new Error(`run ${run.n}'s record holds ${logs.length} runs, and a run writes one: it was changed, and is not read`);
  const log = logs[0];
  if (!log || !log.commitLog.length) throw new Error(`run ${run.n}'s record holds no step: ${name(run.recordFile)}`);
  if (log.commitLog.length > STEPS_MOST) throw new Error(`run ${run.n}'s record holds ${log.commitLog.length} steps, more than a run takes (${STEPS_MOST} at most): it was changed, and is not read`);
  const commits = log.commitLog.map(plainCommit);
  // what is missing from the record is said before anything it answers
  const torn = [...(log.complete ? [] : ['this run did not finish: its record stops where it stopped']), ...(log.gaps.length ? [`${log.gaps.length} of its steps could not be read back`] : []),
    ...(unreadable?.length ? [`${unreadable.length} lines of its record could not be read`] : [])];
  const head = torn.length ? [`(the record is not whole — ${torn.join('; ')}: what follows is what could be read)`] : [];
  const writer = findLastWriter(commits, asked);
  if (!writer) return [...head, torn.length ? `${name(asked)}: not found in what could be read` : `${name(asked)}: no stage of this run wrote it (storyreel log --run ${run.n} --only steps lists what each wrote)`].join('\n');
  const slice = sliceForKey(commits, asked, keysReadFromMap(readsOf(commits)), {controlDeps: controlDepsFromMap(controlOf(run.control, commits))});
  const lines = [...head, `${name(asked)} = ${shown(commitValueAt(commits, commits.length - 1, asked))}`, ...formatSlice(slice).split('\n').filter(line => !/^SLICE for /.test(line)).map(oneLine)];
  const kept = all ? lines : lines.slice(0, WHY_LINES);
  return [...kept, ...(lines.length > kept.length ? [`… ${lines.length - kept.length} more: add --all`] : []), OUTSIDE].join('\n');
}
