/**
 * The one module that calls footprintjs for the story chart. The chart is wiring written as data (chart.mjs); this builds it
 * with footprintjs's builder, runs it, and hands back its record. A move to a new footprintjs touches this file only.
 *
 * What it uses, all from the main door: flowChart (start, addFunction, retry, addDeciderFunction, addFunctionBranch with
 * loopTo and retry, end, setLogger, build), the built chart's toMermaid, FlowChartExecutor (attachCombinedRecorder, run,
 * getSnapshot), narrative, decide, and two scope methods: $attempt() and $break().
 */
import {FlowChartExecutor, decide, flowChart, narrative} from 'footprintjs';
import {QUIET, plainNarrative} from '../../record.mjs';

/** A stage's own part: [name, fn, id, description] as footprintjs takes them. */
const stageArgs = ({name, run, id, about}) => [name, run, id, about];

/** One branch of a decider: its loop back and its retry policy, when it has them. */
function addBranch(list, branch) {
  const options = {...(branch.loopTo ? {loopTo: branch.loopTo} : {}), ...(branch.retry ? {retry: branch.retry} : {})};
  return list.addFunctionBranch(branch.id, branch.name, branch.run, branch.about, options);
}

/** One step of the wiring: a stage (with its retry policy) or a decider (with its branches). */
function addStep(builder, step) {
  if (step.branches) return step.branches.reduce(addBranch, builder.addDeciderFunction(...stageArgs(step))).end();
  const added = builder.addFunction(...stageArgs(step));
  return step.retry ? added.retry(step.retry) : added;
}

/** The chart from its wiring: [first, ...rest], each {id, name, about, run, retry?, branches?}. */
export function buildChart([first, ...rest]) {
  if (first.branches) throw new TypeError('the story chart starts with a stage, not a decider: put a stage first in its wiring');
  const start = flowChart(...stageArgs(first));
  return rest.reduce(addStep, first.retry ? start.retry(first.retry) : start).setLogger(QUIET).build();
}

/** The chart drawn as Mermaid text, as footprintjs draws it. */
export const mermaidOf = (chart) => chart.toMermaid().trim();

/** The record of a run: its narrative (without live raw values) and its snapshot, detached. */
const recordOf = (executor, trace) => ({narrative: plainNarrative(trace), snapshot: structuredClone(executor.getSnapshot())});

/** Run the chart once: its record. A refusal keeps the record too (`error.record`), as footprintjs commits a failing stage. */
export async function runChart(chart) {
  const trace = narrative(), executor = new FlowChartExecutor(chart);
  executor.attachCombinedRecorder(trace);
  try { await executor.run(); } catch (error) {
    if (error !== null && typeof error === 'object' && !('record' in error)) error.record = recordOf(executor, trace);
    throw error;
  }
  return recordOf(executor, trace);
}

/** A choice made with decide(): first rule that matches, else the fallback, the evidence on the record. */
export const choose = (scope, rules, fallback) => decide(scope, rules, fallback);
/** The attempt this stage runs in: {attempt, of}, 1-based. */
export const attemptOf = (scope) => scope.$attempt();
/** Stop the run after this stage, with a reason on the record. */
export const stopRun = (scope, reason) => scope.$break(reason);
