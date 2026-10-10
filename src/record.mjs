/**
 * The compile, recorded (compileFilm({…, record: true})): film.mjs · compileSteps runs in five segments,
 * and each segment is one stage of a footprintjs flowchart. A stage runs its segment of the real compile
 * (steps.next()), then reads the keys that segment depended on and writes small values about what it did
 * (numbers, strings, recipe paths; never a canvas or a function). Drawing a frame is never recorded.
 *
 * With writeProvenance 'reads-prefix', every write keeps the keys its stage read first, so
 * sliceForKey(commitLog, 'when.story.items[0].at', …) (foottrace) walks back from a line's
 * seconds to the stage that read the scene timings. Off (the default), compileFilm only drains the
 * segments: the same code in the same order, with no record.
 */
import {flowChart, narrative, FlowChartExecutor} from 'footprintjs';

/** The stages in the order the compile runs them: [id, name]. Each matches one `yield` in compileSteps. */
export const COMPILE_STAGES = [
  ['read-inputs', 'read inputs'],
  ['build-worlds-and-stages', 'build worlds and stages'],
  ['guesses-and-notes', 'guesses and notes'],
  ['checks', 'checks'],
  ['resolve-lines', 'resolve lines'],
];

/** One segment's report: its stage id, and (called only when recording) what it read and wrote. */
export const step = (stage, summary) => ({stage, summary});

/** Run every segment with no record; the film is the generator's return value. */
export async function drainSteps(steps) {
  for (let r = await steps.next(); ; r = await steps.next()) if (r.done) return r.value;
}

/** A read named exactly ('lines') or by prefix ('stage.'): every key written so far that it names. */
const keysNamed = (reads, written) => written.filter(k => reads.some(r => r.endsWith('.') ? k.startsWith(r) : k === r));

/** Read what the segment depended on, then write what it did (the order reads-prefix records). */
function writeStep(scope, {reads, writes}, written) {
  for (const key of keysNamed(reads, written)) void scope[key];
  for (const [key, value] of Object.entries(writes)) { scope[key] = value; if (!written.includes(key)) written.push(key); }
}

/** A stage that runs the next segment of the compile and records it; the last one also takes the film. */
function segmentStage(steps, id, last, written, done) {
  return async scope => {
    const r = await steps.next();
    if (r.done || r.value.stage !== id) throw new Error(`compileFilm record: the compile reached ${r.done ? 'its end' : `"${r.value.stage}"`} where the stage "${id}" was expected (film.mjs · compileSteps yields once per COMPILE_STAGES entry, in order)`);
    writeStep(scope, r.value.summary(), written);
    if (last) { const end = await steps.next(); if (!end.done) throw new Error('compileFilm record: the compile yielded after its last stage'); done(end.value); }
  };
}

/**
 * The flowchart's logger: a refusal is rethrown to compileFilm's caller (and kept in the record's narrative), so
 * footprintjs does not print it a second time; its warnings still reach the console.
 */
const QUIET = Object.freeze({info() {}, log() {}, debug() {}, error() {}, warn: (...args) => console.warn(...args)});

/** The record: the narrative (without its live raw values) and the snapshot, detached so it survives structuredClone. */
function recordOf(executor, trace) {
  return {narrative: trace.getEntries().map(({rawValue, ...entry}) => entry), snapshot: structuredClone(executor.getSnapshot())};
}

/**
 * Run the compile as a footprintjs flowchart: film.record = {narrative, snapshot}. A refusal keeps its
 * record: the error carries `record` too (footprintjs commits a failing stage's writes, then rethrows).
 */
export async function recordSteps(steps) {
  const written = [];
  let film;
  const [first, ...rest] = COMPILE_STAGES.map(([id, name], i) => [id, name, segmentStage(steps, id, i === COMPILE_STAGES.length - 1, written, f => { film = f; })]);
  let chart = flowChart(first[1], first[2], first[0]);
  for (const [id, name, fn] of rest) chart = chart.addFunction(name, fn, id);
  const trace = narrative(), executor = new FlowChartExecutor(chart.setLogger(QUIET).build(), {writeProvenance: 'reads-prefix'});
  executor.attachCombinedRecorder(trace);
  try { await executor.run(); } catch (error) {
    if (error && typeof error === 'object' && !('record' in error)) error.record = recordOf(executor, trace);
    throw error;
  }
  return {...film, record: recordOf(executor, trace)};
}
