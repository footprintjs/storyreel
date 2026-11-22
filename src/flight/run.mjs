/**
 * The focus flights' steps (steps.mjs · FLIGHT_STEPS) as a footprintjs chart, and a run of it: read → plan → check.
 *
 *   const {result, snapshot} = await runFlights({shots}, {sink, recorders: [controlDepRecorder()]})
 *
 * WHY a chart of the same functions: a run's record is its debug log. Each stage runs one step — the very function the
 * compile runs (planFlights) — handed the keys it names, each read through the scope (so the record keeps what a stage
 * had read when it wrote), and writes back the keys it names, each flight's under its own (`flight-1`, `findings-1`). So
 * `storyreel log --run 1 --why flight-1 --camera focus` says why focus.keys[1]'s flight takes its time: the planner's
 * reason, its kind, its seconds and the limit that set them. The compile plans on its synchronous path; `storyreel
 * check` runs this (check/cameras.mjs) and compares the two: a difference is a `drift` line, never silent.
 *
 * Built the way footprint-story's intent decider is (footprint-story/humanflow · runHumanFlow): the shots come in as the
 * run's input (`$getArgs`), a run is recorded with `writeProvenance: 'reads-prefix'`.
 */
import {flowChart, FlowChartExecutor} from 'footprintjs';
import {FLIGHT_STEPS, planFlights} from './steps.mjs';

/** The chart's logger: a refusal is rethrown to the caller, so footprintjs does not print it a second time. */
const QUIET = Object.freeze({info() {}, log() {}, debug() {}, error() {}, warn: (...args) => console.warn(...args)});
const take = (s, keys) => Object.fromEntries(keys.map(k => [k, s.$getValue(k)]));
/** A step's list keys and its per-flight keys (`<perFlight>-<k>`), from what it gave back. */
const keysOut = (step, state) => [...step.writes, ...(step.perFlight ? Object.keys(state).filter(k => k.startsWith(`${step.perFlight}-`)) : [])];
const put = (s, state, step) => { for (const k of keysOut(step, state)) s.$setValue(k, state[k]); };

/** The chart: one stage per step, the first reading the run's input. */
export function flightFlow() {
  const [first, ...rest] = FLIGHT_STEPS;
  // the shots come in as the run's input under a name of their own: an input's keys are read-only in a run
  let chart = flowChart(first.name, s => put(s, first.run({shots: s.$getArgs()?.focusShots}), first), first.name, first.about);
  for (const step of rest) chart = chart.addFunction(step.name, s => put(s, step.run(take(s, step.reads)), step), step.name, step.about);
  return chart.setLogger(QUIET).build();
}

/** The flights' run: {result (every key the steps wrote, as planFlights gives it), snapshot}. `sink`, `recorders` as footprint-story's runs take them. */
export async function runFlights(input, {sink = null, recorders = []} = {}) {
  const executor = new FlowChartExecutor(flightFlow(), {writeProvenance: 'reads-prefix', ...(sink ? {sink} : {})});
  for (const r of recorders) executor.attachCombinedRecorder(r);
  await executor.run({input: {focusShots: structuredClone(input.shots)}});
  const snapshot = executor.getSnapshot();
  return {result: structuredClone(snapshot.sharedState), snapshot};
}

/** The first place two plans part, or null: what the check says when its run did not plan the flights the film draws. */
export function firstDifference(a, b, at = 'flights') {
  if (Object.is(a, b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return `${at}: ${JSON.stringify(a)} here, ${JSON.stringify(b)} in the film`;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDifference(a[k], b[k], `${at}.${k}`); if (d) return d; }
  return null;
}

/** The run a check is handed (film.cameraRuns): the same shots, run as a chart, compared with the compile's plan. */
export const flightRunOf = (input, planned) => async ({sink, recorders = []} = {}) => {
  const {result, snapshot} = await runFlights(input, {sink, recorders});
  return {snapshot, differs: firstDifference(result, JSON.parse(JSON.stringify(planned)))};
};
export {planFlights};
