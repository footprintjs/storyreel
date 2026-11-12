/**
 * The conversation, as a source the chart can re-read: its facts (counts, bytes, a hash, window offsets) for the record, and
 * its words for a brief only, read again from where they came from each time a stage needs them. The words never go into the
 * chart's state: a run record, a checkpoint or a sink then carries no planted instruction and no private words.
 */
import {createHash} from 'node:crypto';
import {dataLine, storyboardBrief} from 'footprint-story/storyboard';
import {readJson} from '../../create.mjs';

/** The most characters a message id may have: the most a storyboard's source may be, so a longer one could never be cited. */
export const MOST_ID = 80;
/** One window by default, in bytes: about 24k tokens at four bytes each. */
export const WINDOW_BYTES = 96 * 1024;
/** The smallest window that may be asked for: a message line clipped to fit must still say something. */
export const LEAST_WINDOW_BYTES = 1024;

const lineOf = ({id, who, text}) => dataLine({id, ...(who === undefined ? {} : {who}), text});
const bytesOf = (text) => Buffer.byteLength(text);
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** The messages as given: the list itself, or the JSON file in the project that holds it. Throws, naming the fix. */
function loadMessages(conversation, cwd) {
  if (conversation === null || typeof conversation !== 'object') throw new TypeError('give the conversation as {file: "chat.json"} or {messages: [{id, text}]}');
  const {file, messages} = conversation;
  if (Boolean(file) === Boolean(messages)) throw new TypeError('give the conversation one way: {file: "chat.json"} or {messages: [{id, text}]}, not both or neither');
  return file ? readJson(file, 'conversation', cwd) : messages;
}

/** Messages checked by the storyboard door's own rule (what storyboardBrief accepts), and ids short enough to cite. */
function checked(messages) {
  storyboardBrief('what-we-found', {conversation: messages});   // throws, naming the message, on anything the door cannot use
  const long = messages.findIndex((m) => m.id.length > MOST_ID);
  if (long >= 0) throw new RangeError(`message ${long}: its id has ${messages[long].id.length} characters, and ${MOST_ID} is the most a storyboard can cite: give it a shorter id`);
  return messages;
}

/**
 * Windows over the lines: [{from, to, bytes}], `to` past the last, in order, every line in exactly one. A line counts its
 * bytes and its line end. A line longer than a window is a window of its own, clipped when it is sent (clipLine).
 */
export function windowsOf(lineBytes, most) {
  const windows = [];
  lineBytes.forEach((size, i) => {
    const last = windows.at(-1), cost = size + 1;
    if (last && last.bytes + cost <= most) { last.to = i + 1; last.bytes += cost; return; }
    windows.push({from: i, to: i + 1, bytes: Math.min(cost, most)});
  });
  return windows;
}

const CUT = (n) => `… (${n} more characters)`;
/** A message cut so its line fits in `most` bytes, saying how much it lost; as it was when it fits. */
export function clipMessage(message, most) {
  if (bytesOf(lineOf(message)) + 1 <= most) return message;
  let keep = Math.max(0, message.text.length - (bytesOf(lineOf(message)) + 1 - most) - 32);
  for (;;) {
    if (/[\uD800-\uDBFF]/.test(message.text[keep - 1] ?? '')) keep--;   // never half of a pair
    const cut = {...message, text: message.text.slice(0, keep) + CUT(message.text.length - keep)};
    if (bytesOf(lineOf(cut)) + 1 <= most || keep === 0) return cut;
    keep = Math.max(0, keep - Math.max(16, Math.ceil((bytesOf(lineOf(cut)) + 1 - most) / 2)));
  }
}

/**
 * The source: {facts, window(i), cited(ids), all()}. `facts` is all the record ever holds of it. Every read checks the words
 * are still the ones counted, by their hash: a file changed during the run is refused, not read.
 */
export function openSource(conversation, {cwd = process.cwd(), window = WINDOW_BYTES} = {}) {
  if (!Number.isInteger(window) || window < LEAST_WINDOW_BYTES) throw new RangeError(`a window is a whole number of bytes, ${LEAST_WINDOW_BYTES} at the least: give window as one, or leave it out for ${WINDOW_BYTES}`);
  const first = checked(loadMessages(conversation, cwd)), lines = first.map(lineOf), material = lines.join('\n');
  const windows = windowsOf(lines.map(bytesOf), window);
  const facts = Object.freeze({
    messages: first.length, bytes: bytesOf(material), sha256: sha256(material), window,
    clipped: lines.filter((line) => bytesOf(line) + 1 > window).length,
    windows: Object.freeze(windows.map((w) => Object.freeze(w))),
  });
  const reread = () => {
    const messages = loadMessages(conversation, cwd);
    if (!Array.isArray(messages) || sha256(messages.map(lineOf).join('\n')) !== facts.sha256) throw new Error('the conversation changed during the run: its words no longer match what was counted at the start, so run again');
    return messages;
  };
  return Object.freeze({
    facts,
    /** The messages of window `i`, each clipped to fit it. */
    window: (i) => reread().slice(windows[i].from, windows[i].to).map((m) => clipMessage(m, window)),
    /** The messages with these ids, in the conversation's order. */
    cited: (ids) => { const wanted = new Set(ids); return reread().filter((m) => wanted.has(m.id)); },
    /** Every message, as the checks read them: whole. */
    all: reread,
  });
}
