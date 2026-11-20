// check — the one call after an edit: everything that can be read without rendering, in one reply.
//
// WHY: an agent fixing a film called anchors, timeline, review and changes in turn, read four replies, and had to
// work out itself what its last edit did. A check runs them once, says the verdict first (clean, fix <n>, broken),
// lists what to fix worst first, and says what changed since the check before. See README.md.
import {FlowChartExecutor, narrative} from 'footprintjs';
import {checkChart} from './chart.mjs';
import {checkText} from './text.mjs';
import {withRecord} from '../runlog.mjs';

export {checkText, verdictLine, sinceLine, CHECK_TOP} from './text.mjs';
export {problemsOf, sinceLast, ADVICE_KINDS, ROW_MOST, KEYS_MOST} from './problems.mjs';
export {checkChart, CHECK_VERDICTS} from './chart.mjs';
export {VERDICT_RULES} from './stages.mjs';

/**
 * Run one check. `does`: the work, given by the caller (tools.mjs gives the project's):
 *   anchors() → {notes, lines, checked, stopped}   every keyed phrase checked; `stopped`: the compile's refusal, or null
 *   review()  → {findings, lines, verdicts, head, notRun}
 *   changes() → one line
 *   before()  → {keys, round, verdict} of the last check kept, or null
 * Returns {verdict, text, said, keys, round, record}: `record` the run's narrative, for the log.
 */
export async function checkFilm(does, {all = false, more} = {}) {
  const run = {does}, trace = narrative(), executor = new FlowChartExecutor(checkChart(run));
  executor.attachCombinedRecorder(trace);
  // a stage that throws (a kit whose drawing fails) leaves its run so far on the error, for the log: the error is the caller's to say
  try { await executor.run(); } catch (e) { throw withRecord(e, trace); }
  const errors = run.problems.filter(p => p.level === 'error').length;
  const said = {verdict: run.verdict, errors, advice: run.problems.length - errors, stopped: run.anchors.stopped, head: run.review?.head ?? null,
    problems: run.problems, notRun: run.review?.notRun ?? [], changes: run.changes ?? null, since: run.since};
  return {verdict: run.verdict, text: checkText(said, {all, ...(more ? {more} : {})}), said, keys: run.keys, round: run.since.round,
    record: trace.getEntries().map(({rawValue, ...entry}) => entry)};
}
