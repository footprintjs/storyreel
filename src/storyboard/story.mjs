/**
 * footprint-storyreel/storyboard/story: a conversation in, a checked storyboard out, by a footprintjs chart whose record says
 * why each choice was made. The model is a port: give `inProcess(fn)`, where fn answers a brief with JSON text.
 *
 *   storyFromConversation({conversation, model, shape?, drawable?, window?, mostFix?, cwd?})
 *     → {board, shape, standing, ask, stopped, problems, record}
 *   inProcess(fn)    → a driver: fn(brief) answers {stage, instructions, material, expects, ids} with JSON text
 *   storyMermaid()   → the chart, drawn as Mermaid text
 *
 * A conversation is untrusted: its words go only into briefs, as material, apart from the instructions. The chart's state,
 * and so the record, holds counts, bytes, a hash, window offsets and message ids, never a message's or an answer's words.
 */
import {storyShapes} from 'footprint-story/storyboard';
import {FILM_SHAPES} from './film.mjs';
import {storyWiring} from './story/chart.mjs';
import {buildChart, mermaidOf, runChart} from './story/engine.mjs';
import {ModelFailed, inProcess, isDriver} from './story/port/port.mjs';
import {MOST_FIX} from './story/check/stage.mjs';
import {WINDOW_BYTES} from './story/read-source/source.mjs';

export {inProcess};

const MOST_ROUNDS = 10;
const SHAPES = new Set(storyShapes().map((s) => s.name));

/** The run's input, checked: each refusal names the fix. */
function inputOf({conversation, model, shape, drawable = FILM_SHAPES, window = WINDOW_BYTES, mostFix = MOST_FIX, cwd = process.cwd()}) {
  if (!isDriver(model)) throw new TypeError('give the model as a driver: model: inProcess(async (brief) => answerText)');
  if (shape !== undefined && !SHAPES.has(shape)) throw new TypeError(`no shape "${shape}": the shapes are ${[...SHAPES].join(', ')}, or leave shape out`);
  if (!Array.isArray(drawable) || !drawable.length || !drawable.every((name) => SHAPES.has(name))) throw new TypeError(`drawable lists the shapes the drawer draws, from ${[...SHAPES].join(', ')}: give at least one, or leave it out for ${FILM_SHAPES.join(', ')}`);
  if (!Number.isInteger(mostFix) || mostFix < 0 || mostFix > MOST_ROUNDS) throw new RangeError(`mostFix is a whole number of fix rounds from 0 to ${MOST_ROUNDS}: give one, or leave it out for ${MOST_FIX}`);
  return {conversation, shape, drawable: [...drawable], window, mostFix, cwd};
}

/** One run's context: its input, the driver, and the working memory that holds every word. */
const runOf = (input, model) => ({input, model, source: null,
  work: {picks: [], points: [], board: null, written: null, problems: [], fixBriefs: null, roundStart: {}, rounds: {}, fixed: [], result: null, modelError: undefined}});

/**
 * Run the chart: {board, shape, standing, ask, stopped, problems, record}. `board` is the read storyboard, or null when the
 * run stopped (`stopped` says where and why; `problems` lists what was left). `ask`: what only the owner can answer.
 * A model that throws rejects the run, its own error as the refusal's `cause`.
 */
export async function storyFromConversation(options = {}) {
  const run = runOf(inputOf(options), options.model);
  let record;
  try { record = await runChart(buildChart(storyWiring(run))); } catch (error) {
    if (error instanceof ModelFailed) error.cause = run.work.modelError;
    throw error;
  }
  const state = record.snapshot.sharedState, stopped = state.stopped ?? null;
  return Object.freeze({
    board: run.work.result, shape: state.shape ?? null, standing: state.standing ?? {}, ask: state.ask ?? [], stopped,
    problems: stopped ? run.work.problems.map(({at, message}) => ({at, message})) : [], record,
  });
}

/** The chart, drawn as Mermaid text from the real chart (nothing runs). */
export const storyMermaid = () => mermaidOf(buildChart(storyWiring(runOf(inputOf({model: inProcess(() => '')}), null))));
