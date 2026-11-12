/**
 * The model, as a port: one shape at every stage that asks. A brief goes out, {stage, instructions, material, expects, ids},
 * and an answer comes back: JSON text. The chart holds no model. A driver answers briefs; `inProcess(fn)` is the one this
 * stage of the work ships, an app's own call awaited where the stage asks. A paused driver (later) answers the same briefs
 * from outside the run, through the same `answer(brief, at)`: `at` is `{stage}`, the asking stage's name, and nothing more.
 *
 * `instructions` and `material` stay two fields all the way to the model: instructions are code's own words, the same
 * whatever the conversation says; material is data lines, never instructions.
 */
import {StoryRefusal} from '../refusal.mjs';

/** The most an answer may be, in bytes: the storyboard door's own cap. */
export const MOST_ANSWER_BYTES = 1 << 20;

/** What each stage expects back, by name: a pick's points, a shape's name, a whole board, one piece. */
export const EXPECTS = Object.freeze({pick: 'points', 'choose-shape': 'shape', write: 'board', fix: 'piece'});

/**
 * Why an answer was refused, by code: fixed words, so a refusal on the record never repeats the answer (a JSON parser's own
 * message quotes the text it read). Each says what to do instead. These are the ones every stage shares; a stage adds its
 * own, worded from its own limits (pick.mjs · PICK_REASONS).
 */
const REASONS = Object.freeze({
  'not-text': 'is not text: answer with JSON text',
  'too-big': `is over ${MOST_ANSWER_BYTES} bytes: answer with less`,
  'not-json': 'is not JSON: answer with one JSON value and nothing else',
  'not-object': 'is not a JSON object: answer with the object the brief describes',
  'bad-shape': 'names no shape the brief offers: answer {"shape": one of the names given}',
  'not-a-piece': 'is not the piece the brief describes: answer the entry, the list, or the frame\'s fields alone',
});

/**
 * An answer the stage cannot use: asked again by the retry policy. Its message is code's own words, by code: the shared
 * reasons, or `reasons`, the asking stage's own table.
 */
export class MalformedAnswer extends StoryRefusal {
  constructor(stage, code, reasons = REASONS) {
    const known = Object.hasOwn(reasons, code) ? code : 'not-json';
    super(`the ${stage} answer ${(Object.hasOwn(reasons, code) ? reasons : REASONS)[known]}`);
    this.name = 'MalformedAnswer';
    this.code = known;
  }
}

/** The model itself failed (it threw, or gave no answer). Never retried; its own error is kept aside, as the refusal's cause. */
export class ModelFailed extends StoryRefusal {
  constructor(stage, original) {
    super(`the model did not answer the ${stage} brief: read this refusal's cause for its own error`, original);
    this.name = 'ModelFailed';
  }
}

/** Whether a stage's retry policy should ask again: only for an answer it could not use, never for a model that failed. */
export const isMalformed = (error) => error instanceof MalformedAnswer;

/** The retry policy of every stage that asks: one more try for an answer it could not use. */
export const ASK_RETRY = Object.freeze({attempts: 2, retryOn: isMalformed});

/** A brief, frozen. `ids`: the message ids its material holds, in order. */
export function brief(stage, instructions, material, ids = []) {
  return Object.freeze({stage, instructions, material, expects: EXPECTS[stage], ids: Object.freeze([...ids])});
}

/** A driver from any function that answers a brief with JSON text (or a promise of it): the app's own model call. */
export function inProcess(fn) {
  if (typeof fn !== 'function') throw new TypeError('inProcess takes the function that answers a brief: inProcess(async (brief) => answerText)');
  return Object.freeze({kind: 'in-process', answer: (b) => fn(b)});
}

/** Whether this is a driver the chart can ask. */
export const isDriver = (driver) => driver !== null && typeof driver === 'object' && typeof driver.answer === 'function';

/**
 * Ask the driver and read its answer as JSON: the value, or MalformedAnswer. The driver is handed the brief and `{stage}`,
 * never the chart's scope. A driver that throws is ModelFailed, its own error kept aside, never on the record.
 */
export async function askJson(driver, b) {
  let text;
  try { text = await driver.answer(b, Object.freeze({stage: b.stage})); } catch (error) { throw new ModelFailed(b.stage, error); }
  if (typeof text !== 'string') throw new MalformedAnswer(b.stage, 'not-text');
  if (Buffer.byteLength(text) > MOST_ANSWER_BYTES) throw new MalformedAnswer(b.stage, 'too-big');
  try { return JSON.parse(text); } catch { throw new MalformedAnswer(b.stage, 'not-json'); }
}

/** Plain object, not a list: what most answers must be. */
export const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
