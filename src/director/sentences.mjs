/**
 * The script as the director reads it: each scene's sentences, who says each one, how it ends, and a beat that names
 * where it starts — the same beat a recipe would write by hand.
 *
 * Who says a word: the voice's timings when they say (a word's `speaker`, written by the voice step from the lines),
 * else the line it is in ({@who}"…": script.mjs · linesOf), else the scene's `speaker`, else nobody (the narrator). A
 * sentence ends at a word that ends with . ! ? or … (past a closing quote), and where the speaker changes.
 *
 * A beat names a moment written right before the sentence ({ask}: ["ask", "{ask}"]) when there is one, else the
 * sentence's first words, as few as name one place in the scene ("Grandad, can you"); words said more than once there
 * are named with nth. A silent scene's sentences are its directions, each named by its words. Pure.
 */
import {normSpeech, spokenOffset} from 'footprint-story';
import {sceneScript} from '../script.mjs';
import {speechIndex, directionTimings} from '../clock.mjs';
import {wordsOf, endOf} from './rules.mjs';

/** A word that ends a sentence: . ! ? or …, then any closing quote or bracket. */
const ENDS = /[.!?…。！？]["'”’»)\]]*$/u;
/** The first letter or digit of a word as written (a word may open with a quote). */
const FIRST = /[\p{L}\p{M}\p{N}]/u;
/** The most words a phrase beat takes before it settles for nth. */
const MOST_WORDS = 8;

/** The words of what is said, as written, with where each stands: [{text, from, to}]. */
function saidWords(said) {
  const out = [];
  for (const m of said.matchAll(/\S+/gu)) if (FIRST.test(m[0])) out.push({text: m[0], from: m.index, to: m.index + m[0].length});
  return out;
}

/**
 * Each said word's timed word ({start, end, speaker?}), or null — found by the letters said before it, as the clock
 * finds a moment (a number slot counted as the voice says it). `index` is the scene's speechIndex.
 */
function timedWords(said, words, index) {
  let shown = 0, k = 0;
  return words.map((w, i) => {
    if (i) shown += normSpeech(said.slice(words[i - 1].from, w.from)).length;
    const at = index.slots ? spokenOffset(index.slots, shown) : shown;
    if (at === null || at === undefined) return null;
    while (k + 1 < index.words.length && index.words[k].to <= at) k++;
    const timed = index.words[k];
    return timed && timed.from <= at && timed.to > at ? timed : null;
  });
}

/** Who says each said word: the timed word's speaker, else its {@who} line's, else the scene's, else null. */
function speakersOf(scene, said, words, timed, lines) {
  return words.map((w, i) => {
    const letter = w.from + w.text.search(FIRST);
    return timed[i]?.speaker ?? lines.find(l => letter >= l.offset && letter < l.offset + l.say.length)?.by ?? scene.speaker ?? null;
  });
}

/** Where a word is said in a scene's words, as the clock counts places: its normalized letters' start, and the boundaries between words. */
function boundaries(words) {
  const starts = new Set(), ends = new Set(); let content = '';
  for (const w of words) { starts.add(content.length); content += normSpeech(w.text); ends.add(content.length); }
  return {content, starts, ends};
}

/** How many places a phrase is said in a scene (whole words), and which of them starts at the letter `at`. */
function placesOf(bounds, phrase, at = -1) {
  const needle = normSpeech(phrase); let count = 0, nth = -1;
  if (!needle) return {count, nth};
  for (let k = bounds.content.indexOf(needle); k >= 0; k = bounds.content.indexOf(needle, k + 1)) {
    if (!bounds.starts.has(k) || !bounds.ends.has(k + needle.length)) continue;
    if (k === at) nth = count;
    count++;
  }
  return {count, nth};
}

/** A phrase as a beat names it: the words as written, without the quotes and marks at either end. */
const trimmed = text => text.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, '');

/**
 * A beat at word i of a scene: the moment written right before it, else its words from there — as few as are said in
 * only that place (up to MOST_WORDS, never past `last`), else the longest of those with nth. `plus` moves it (seconds).
 */
export function beatAt(scene, {said, words, moments, bounds}, i, last = words.length - 1, plus = 0) {
  const letter = words[i].from + words[i].text.search(FIRST), moment = moments.find(m => m.offset === letter);
  const add = ref => (plus ? [...ref, plus] : ref);
  if (moment) return add([scene.id, `{${moment.name}}`]);
  let at = 0; for (let k = 0; k < i; k++) at += normSpeech(words[k].text).length;
  let named = null;
  for (let n = 1; n <= MOST_WORDS && i + n - 1 <= last; n++) {
    const phrase = trimmed(said.slice(words[i].from, words[i + n - 1].to));
    if (!normSpeech(phrase)) continue;
    const {count, nth} = placesOf(bounds, phrase, at);
    if (count === 1) return add([scene.id, phrase]);
    named = {phrase, nth};
  }
  return {scene: scene.id, phrase: named.phrase, nth: named.nth, ...(plus ? {plus} : {})};
}

/** A sentence, read: {scene, n, speaker, text, end, words, at, t, until} (at: its beat; t and until: when it starts and ends on the film clock, or null). */
function sentence(scene, read, n, [i, j], speaker, [start, until]) {
  const text = read.said.slice(read.words[i].from, read.words[j].to);
  return Object.freeze({scene: scene.id, n, speaker, text, end: endOf(text), words: Object.freeze(wordsOf(text)), first: i, last: j, at: beatAt(scene, read, i, j), t: start, until});
}

/**
 * A silent scene read: its directions are its sentences, its text the directions joined (as the clock reads it: clock.mjs
 * · sceneText), each named as a spoken sentence is — its first words, as few as are said only there (whole words: a
 * direction inside a longer one is not that one), else nth — and timed by directionTimings.
 */
function readSilent(scene, offset) {
  const said = scene.silent.map(([text]) => text).join(' '), words = saidWords(said), bounds = boundaries(words), timed = directionTimings(scene).words;
  const read = {said, words, moments: [], bounds}, out = [];
  let k = 0;
  scene.silent.forEach(([text, seconds], n) => {
    const count = saidWords(text).length, [i, j] = [k, k + count - 1]; k += count;
    const t = offset === null ? null : offset + timed[i].start;
    out.push(Object.freeze({scene: scene.id, n, speaker: null, text, end: endOf(text), words: Object.freeze(wordsOf(text)), first: i, last: j, at: beatAt(scene, read, i, j), t, until: t === null ? null : t + seconds, silent: true}));
  });
  return Object.freeze({scene: scene.id, said, words, moments: [], bounds, timed: offset === null ? words.map(() => null) : timed, offset, sentences: Object.freeze(out)});
}

/**
 * A scene read for the director: {scene, said, words, moments, bounds, sentences}. `timing`: the scene's timings (its
 * words' speakers and times), or null; `offset`: where the scene starts on the film clock (null without timings).
 */
export function readScene(scene, i, {timing = null, offset = null} = {}) {
  if (scene.narration === undefined && Array.isArray(scene.silent)) return readSilent(scene, offset);
  const {said, lines, moments} = sceneScript(scene, i), words = saidWords(said), bounds = boundaries(words);
  const index = timing ? speechIndex(scene, timing) : null, timed = index ? timedWords(said, words, index) : words.map(() => null);
  if (timing && !index) throw new Error(`director: the timings for scene ${scene.id} do not time what it says (every word timed, in order, spelling the narration without its marks): give the voice's timings for this storyboard, or none`);
  const speakers = speakersOf(scene, said, words, timed, lines), read = {said, words, moments, bounds}, out = [];
  let from = 0;
  words.forEach((w, k) => {
    const last = k === words.length - 1, ends = last || ENDS.test(w.text) || speakers[k + 1] !== speakers[k];
    if (!ends) return;
    const start = timed[from] && offset !== null ? offset + timed[from].start : null, until = timed[k] && offset !== null ? offset + timed[k].end : null;
    out.push(sentence(scene, read, out.length, [from, k], speakers[from], [start, until]));
    from = k + 1;
  });
  return Object.freeze({scene: scene.id, said, words, moments, bounds, timed, offset, sentences: Object.freeze(out)});
}

/** When word k of a scene read is said, on the film clock (null without timings). */
export const wordTime = (read, k) => (read.timed?.[k] && read.offset !== null ? read.offset + read.timed[k].start : null);
