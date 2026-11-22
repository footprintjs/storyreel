// check — the one call after an edit: everything that can be read without rendering, in one reply.
//
// WHY: an agent fixing a film called anchors, timeline, review and changes in turn, read four replies, and had to
// work out itself what its last edit did. A check runs them once, says the verdict first (clean, fix <n>, broken),
// lists what to fix worst first, and says what changed since the check before. See README.md.
import {FlowChartExecutor, narrative} from 'footprintjs';
import {fileSink} from 'footprintjs/sinks';
import {controlDepRecorder} from 'footprintjs/trace';
import {checkChart} from './chart.mjs';
import {checkText} from './text.mjs';
import {withRecord} from '../runlog.mjs';

export {checkText, verdictLine, sinceLine, CHECK_TOP} from './text.mjs';
export {problemsOf, sinceLast, ADVICE_KINDS, ROW_MOST, KEYS_MOST} from './problems.mjs';
export {checkChart, CHECK_VERDICTS} from './chart.mjs';
export {VERDICT_RULES} from './stages.mjs';
export {runMaps, mapLines, MAPS_MOST} from './maps.mjs';
export {runMotions, motionLines, MOTIONS_MOST} from './motions.mjs';
export {runCameras, cameraLines, CAMERAS_MOST} from './cameras.mjs';

/**
 * Run one check. `does`: the work, given by the caller (tools.mjs gives the project's):
 *   anchors() → {notes, lines, checked, stopped}   every keyed phrase checked; `stopped`: the compile's refusal, or null
 *   review()  → {findings, lines, verdicts, head, notRun}
 *   changes() → one line
 *   before()  → {keys, round, verdict} of the last check kept, or null
 * Returns {verdict, text, said, keys, round, record, control, recorded}: `record` the run's narrative, for the log;
 * `control` which decision let each step run; `recorded` whether the record file was written.
 */
export async function checkFilm(does, {all = false, more, record = null} = {}) {
  // `record`: a file the run's record is written to as it runs, with the keys each stage had read when it wrote: what
  // `storyreel log --why` walks back over. A record that cannot be kept never costs the check.
  let sink = null;
  try { sink = record ? fileSink(record) : null; } catch { /* no record: the check goes on */ }
  const run = {does}, trace = narrative(), control = controlDepRecorder(), executor = new FlowChartExecutor(checkChart(run), {...(sink ? {sink} : {}), writeProvenance: 'reads-prefix'});
  executor.attachCombinedRecorder(trace);
  executor.attachCombinedRecorder(control);
  // a stage that throws (a kit whose drawing fails) leaves its run so far on the error, for the log: the error is the caller's to say
  try { await executor.run(); } catch (e) { throw withRecord(e, trace); } finally { try { await sink?.close(); } catch { /* a record that cannot be closed costs the check nothing */ } }
  const errors = run.problems.filter(p => p.level === 'error').length;
  const said = {verdict: run.verdict, errors, advice: run.problems.length - errors, stopped: run.anchors.stopped, head: run.review?.head ?? null,
    problems: run.problems, notRun: run.review?.notRun ?? [], changes: run.changes ?? null, since: run.since};
  // which decision let each step run, as plain data: the record keeps what was written, this keeps why a branch was taken
  const edges = Object.fromEntries(executor.getSnapshot().commitLog.map(b => [b.runtimeStageId, control.lookup(b.runtimeStageId)]).filter(([, edge]) => edge));
  return {verdict: run.verdict, text: checkText(said, {all, ...(more ? {more} : {})}), said, keys: run.keys, round: run.since.round, control: edges, recorded: Boolean(sink),
    record: trace.getEntries().map(({rawValue, ...entry}) => entry)};
}
