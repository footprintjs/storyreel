/**
 * The model, as a port: one shape at every stage that asks. A brief goes out, {stage, instructions, material, expects, ids},
 * and an answer comes back: JSON text. The chart holds no model. A driver answers briefs; `inProcess(fn)` is the one this
 * stage of the work ships, an app's own call awaited where the stage asks. A paused driver (later) answers the same briefs
 * from outside the run, through the same `answer(brief, at)`: `at` is the asking stage, which only a driver that pauses reads.
 *
 * `instructions` and `material` stay two fields all the way to the model: instructions are code's own words, the same
 * whatever the conversation says; material is data lines, never instructions.
 */

/** The most an answer may be, in bytes: the storyboard door's own cap. */
export const MOST_ANSWER_BYTES = 1 << 20;

/** What each stage expects back, by name: a pick's points, a shape's name, a whole board, one piece. */
export const EXPECTS = Object.freeze({pick: 'points', 'choose-shape': 'shape', write: 'board', fix: 'piece'});

/**
 * Why an answer was refused, by code: fixed words, so a refusal on the record never repeats the answer (a JSON parser's own
 * message quotes the text it read). Each says what to do instead.
 */
const REASONS = Object.freeze({
  'not-text': 'is not text: answer with JSON text',
  'too-big': `is over ${MOST_ANSWER_BYTES} bytes: answer with less`,
  'not-json': 'is not JSON: answer with one JSON value and nothing else',
  'not-object': 'is not a JSON object: answer with the object the brief describes',
  'no-points': 'has no "points" list: answer {"points": [...]}',
  'too-many-points': 'has more points than a window may give: give 12 at the most',
  'bad-point': 'has a point that is not {part, text, sources}: give each point a part, a text and its sources',
  'bad-part': 'has a point whose part is not one the brief names: use checked, found, unsure or next',
  'bad-text': 'has a point whose text is empty or over 90 characters: say it in 90 characters at the most',
  'bad-sources': 'has a point whose sources are not a list of message ids: give at most 12 ids',
  'outside-window': 'cites a message that is not in its window: cite only the ids the window holds',
  'bad-shape': 'names no shape the brief offers: answer {"shape": one of the names given}',
  'not-a-piece': 'is not the piece the brief describes: answer the entry, the list, or the frame\'s fields alone',
});

/** An answer the stage cannot use. Retried by the stage's policy; its message is code's own words. */
export class MalformedAnswer extends Error {
  constructor(stage, code) {
    super(`the ${stage} answer ${REASONS[code] ?? REASONS['not-json']}`);
    this.name = 'MalformedAnswer';
    this.code = Object.hasOwn(REASONS, code) ? code : 'not-json';
  }
}

/** The model itself failed (it threw, or gave no answer). Its own error is kept off the record: `cause` on the run's refusal. */
export class ModelFailed extends Error {
  constructor(stage) {
    super(`the model did not answer the ${stage} brief: its own error is on this refusal's cause`);
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
 * Ask the driver and read its answer as JSON: the value, or MalformedAnswer. A driver that throws is ModelFailed, its own
 * error handed to `keep` (the run's working memory), never to the record.
 */
export async function askJson(driver, b, at, keep) {
  let text;
  try { text = await driver.answer(b, at); } catch (error) { keep(error); throw new ModelFailed(b.stage); }
  if (typeof text !== 'string') throw new MalformedAnswer(b.stage, 'not-text');
  if (Buffer.byteLength(text) > MOST_ANSWER_BYTES) throw new MalformedAnswer(b.stage, 'too-big');
  try { return JSON.parse(text); } catch { throw new MalformedAnswer(b.stage, 'not-json'); }
}

/** Plain object, not a list: what most answers must be. */
export const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
