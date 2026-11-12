/**
 * The conversation, as a source the chart can re-read: its facts (counts, bytes, a hash, window offsets) for the record, and
 * its words for a brief only. The words never go into the chart's state: a run record, a checkpoint or a sink then carries
 * no planted instruction and no private words. Messages are named in state by their ordinal (their place in the
 * conversation), never by their id, which is text the conversation chose.
 *
 * Read once: messages given in memory are copied, so a change to the caller's list cannot reach the run; a file is read
 * again only when its stat changes (inode, size, change and modify times), and then refused unless its words hash the same.
 */
import {createHash} from 'node:crypto';
import {statSync} from 'node:fs';
import path from 'node:path';
import {dataLine, storyboardBrief} from 'footprint-story/storyboard';
import {readJson} from '../../create.mjs';
import {StoryRefusal} from '../refusal.mjs';

/** The most characters a message id may have: the most a storyboard's source may be, so a longer one could never be cited. */
export const MOST_ID = 80;
/** One window by default, in bytes: about 24k tokens at four bytes each. */
export const WINDOW_BYTES = 96 * 1024;
/** The smallest window that may be asked for: a message line clipped to fit must still say something. */
export const LEAST_WINDOW_BYTES = 1024;
/** The most windows one run picks from: each is a pass of the chart's loop, and its record grows with them. */
export const MOST_WINDOWS = 500;

const lineOf = ({id, who, text}) => dataLine({id, ...(who === undefined ? {} : {who}), text});
const bytesOf = (text) => Buffer.byteLength(text);
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const refuse = (message, original) => { throw new StoryRefusal(message, original); };

/** The file's stat as one comparable stamp. */
function stampOf(full) {
  const s = statSync(full, {bigint: true});
  return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
}

/** {messages, stamp?, full?} as given: the list itself, or the JSON file in the project that holds it. Refuses in fixed words. */
function loadMessages(conversation, cwd) {
  if (conversation === null || typeof conversation !== 'object') refuse('give the conversation as {file: "chat.json"} or {messages: [{id, text}]}');
  const {file, messages} = conversation;
  if (Boolean(file) === Boolean(messages)) refuse('give the conversation one way: {file: "chat.json"} or {messages: [{id, text}]}, not both or neither');
  if (!file) return {messages};
  if (typeof file !== 'string') refuse('give the conversation file as a path: {file: "chat.json"}');
  const full = path.resolve(cwd, file);
  try {
    readJson(file, 'conversation', cwd, {quoteParser: false, checkOnly: true});   // where it is, what it is: refused first
    const before = stampOf(full), read = readJson(file, 'conversation', cwd, {quoteParser: false});
    if (stampOf(full) !== before) refuse('the conversation file changed while it was read: run again once nothing writes to it');
    return {messages: read, stamp: before, full};
  } catch (error) {
    if (error instanceof StoryRefusal) throw error;
    // readJson's refusals name the file and the fix in its own words, and never quote the file
    return refuse(String(error?.message ?? error));
  }
}

/**
 * Messages checked: a list, every id short enough to cite (asked first, so no refusal below can quote a long one), then the
 * storyboard door's own rule (what storyboardBrief accepts). The door's refusal quotes a message's id, so it is kept aside.
 */
function checked(messages) {
  if (!Array.isArray(messages)) refuse('a conversation is a list of messages: give [{id, who?, text}]');
  const long = messages.findIndex((m) => typeof m?.id === 'string' && m.id.length > MOST_ID);
  if (long >= 0) refuse(`message ${long}: its id has ${messages[long].id.length} characters, and ${MOST_ID} is the most a storyboard can cite: give it a shorter id`);
  try { storyboardBrief('what-we-found', {conversation: messages}); } catch (error) {
    refuse('the conversation has a message the storyboard door cannot use, or more messages than it reads: give each one {id, who?, text}, ids unique, at most 5000 (read this refusal\'s cause for which)', error);
  }
  return messages;
}

/**
 * Windows over the lines: [{from, to, bytes}], `to` past the last, in order, every line in exactly one. A line counts its
 * bytes and its line end. A line longer than a window is a window of its own, clipped when it is sent (clipMessage).
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

/** The smallest window, in whole kilobytes, that covers the lines in at most MOST_WINDOWS windows. */
function leastWindowFor(lineBytes) {
  let low = LEAST_WINDOW_BYTES, high = Math.max(LEAST_WINDOW_BYTES, lineBytes.reduce((n, b) => n + b + 1, 0));
  while (high - low > 1024) { const mid = Math.ceil((low + high) / 2048) * 1024; if (windowsOf(lineBytes, mid).length <= MOST_WINDOWS) high = mid; else low = mid; }
  return Math.ceil(high / 1024) * 1024;
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
 * The source: {facts, window(i), cited(ids), all(), ordinalOf(id), idOf(k)}. `facts` is all the record ever holds of it.
 * Every read of a file checks its words are still the ones counted: a file changed during the run is refused, not read.
 */
export function openSource(conversation, {cwd = process.cwd(), window = WINDOW_BYTES} = {}) {
  if (!Number.isInteger(window) || window < LEAST_WINDOW_BYTES) refuse(`a window is a whole number of bytes, ${LEAST_WINDOW_BYTES} at the least: give window as one, or leave it out for ${WINDOW_BYTES}`);
  const loaded = loadMessages(conversation, cwd);
  let messages = checked(loaded.messages);
  if (!loaded.full) messages = structuredClone(messages);   // the run's own copy: the caller's list may change, the run's does not
  const lines = messages.map(lineOf), lineBytes = lines.map(bytesOf), material = lines.join('\n');
  const windows = windowsOf(lineBytes, window);
  if (windows.length > MOST_WINDOWS) refuse(`the conversation needs ${windows.length} windows of ${window} bytes, and ${MOST_WINDOWS} is the most one run picks from: give a larger window, ${leastWindowFor(lineBytes)} bytes at the least`);
  const facts = Object.freeze({
    messages: messages.length, bytes: bytesOf(material), sha256: sha256(material), window,
    clipped: lineBytes.filter((size) => size + 1 > window).length,
    windows: Object.freeze(windows.map((w) => Object.freeze(w))),
  });
  const ordinals = new Map(messages.map((m, k) => [m.id, k]));
  let stamp = loaded.stamp;
  const current = () => {
    if (!loaded.full || stampOf(loaded.full) === stamp) return messages;
    const again = loadMessages(conversation, cwd);
    if (!Array.isArray(again.messages) || sha256(again.messages.map(lineOf).join('\n')) !== facts.sha256) refuse('the conversation changed during the run: its words no longer match what was counted at the start, so run again');
    stamp = again.stamp;
    return messages;
  };
  return Object.freeze({
    facts,
    /** The messages of window `i`, each clipped to fit it. */
    window: (i) => current().slice(windows[i].from, windows[i].to).map((m) => clipMessage(m, window)),
    /** The messages with these ids, in the conversation's order. */
    cited: (ids) => {
      const all = current();
      return [...new Set(ids)].filter((id) => ordinals.has(id)).map((id) => ordinals.get(id)).sort((a, b) => a - b).map((k) => all[k]);
    },
    /** Every message, as the checks read them: whole. */
    all: current,
    /** A message's ordinal, by id: what state names it by. Undefined for an id the conversation does not have. */
    ordinalOf: (id) => ordinals.get(id),
    /** A message's id, by ordinal: for the caller, from working memory only. */
    idOf: (k) => messages[k]?.id,
  });
}
