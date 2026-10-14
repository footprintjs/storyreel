/**
 * Claims: every number the film shows says where it comes from. A number on screen reads as a fact, so it must
 * either match a source — a FACT the storyboard names, {value, text?, source}, where `source` is a URL, a document
 * or a pointer into a record — or sit in a scene marked as example data (`"example": true`), which says so on screen
 * with an "Example data" label.
 *
 *   storyboard.json   {"title": "…", "facts": "facts.json", "scenes": [{"id": "speed", "narration": "…"}, {"id": "demo", "example": true, …}]}
 *   facts.json        [{"value": 16.67, "text": "16.67 ms", "source": "https://example.org/frame-timing"},
 *                      {"value": 60, "text": "60 Hz", "source": "docs/display.md"}]
 *
 * What the film shows: every line meant to be read (film.lines: titles, footers, list lines, a world's words, guess
 * cards, the push-in caption), the emphasis words, and the captions' shown words (number slots in digits) — and, in
 * the review, every word the picture draws (drawnClaims: a kit's own words, a card's rows, code). The numbers in them
 * are found the way the voice tools find digits (footprint-narration · unsaidDigits, over the text as written), with
 * their sign; a digit run right after a cased letter, or after a hyphen that follows one, is part of a name (H2O, MP4,
 * COVID-19, ISO-8601), not a number — but a year after a lower-case word or a time prefix is one ("mid-2024"). A number
 * with one separator before exactly three digits ("1,000", "1.000") is a thousand in one language and one in another:
 * it is ambiguous, and only a fact that writes it the same way sources it.
 */
import {existsSync, statSync} from 'node:fs';
import path from 'node:path';
import {spokenMap, unsaidDigits, normSpeech} from 'footprint-narration';
import {insideRoot} from './files.mjs';

const FACT_KEYS = ['value', 'text', 'source'];
/** A cased letter (upper, lower, title case): a digit run right after one is part of a name. A CJK character is not cased. */
const isCased = ch => /[\p{Lu}\p{Ll}\p{Lt}]/u.test(ch ?? '');
const isAlnum = ch => /[\p{L}\p{N}]/u.test(ch ?? '');
/** A minus standing on its own before a number is its sign: the hyphen-minus, the minus sign (U+2212), the en dash (U+2013). */
const SIGNS = new Set(['-', '\u2212', '\u2013']), HYPHENS = new Set(['-', '\u2010', '\u2011']);

/**
 * The numbers a text shows, in order ("One frame takes 16.67 ms at 60 Hz." → ["16.67", "60"]; "−5 °C" → ["−5"]):
 * footprint-narration's digit runs, each with its sign when a minus (or an en dash) stands right before it on its own,
 * less a run that is part of a name (namedRun) — right after a cased letter (H2O, MP4, v2), or after a hyphen right after
 * one (COVID-19, B-52, ISO-8601, A-1000, UTF-8) unless it is a year after a lower-case word or a time prefix ("mid-2024",
 * "pre-2020", "post-1990" are years, and need a source). A unit written onto a number stays a number ("60Hz", "5km",
 * "4K"); a number after a CJK character is a number ("価格は100円").
 */
export const numbersIn = text => numberRuns(text).map(n => n.run);
/** The words before a hyphen that make the year after it a time ("Mid-2024" opens a sentence): any case. */
const YEAR_PREFIXES = new Set(['mid', 'pre', 'post', 'early', 'late']);
/** A plausible year: four digits, 1000–2199. */
const isYear = digits => /^\d{4}$/.test(digits) && +digits >= 1000 && +digits <= 2199;
/**
 * Whether the digit run at `at` in `s` is part of a name, not a number: right after a cased letter (H2O, MP4, v2); or
 * after a hyphen right after a word, unless the run is a plausible year and the word a lower-case one or a time prefix
 * (YEAR_PREFIXES) — an upper-case code with a number is a name (COVID-19, B-52, ISO-8601, A-1000), whatever its digits.
 */
function namedRun(s, at, digits) {
  const before = s[at - 1];
  if (isCased(before)) return true;
  if (!(HYPHENS.has(before) && isCased(s[at - 2]))) return false;
  const word = /\p{L}+$/u.exec(s.slice(0, at - 1))[0];
  return !(isYear(digits) && (/^\p{Ll}+$/u.test(word) || YEAR_PREFIXES.has(word.toLowerCase())));
}
/** The same numbers with where each stands in the text (its sign's place, when it has one): [{run, at}]. */
function numberRuns(text) {
  const s = String(text ?? ''), out = []; let from = 0;
  for (const digits of unsaidDigits(spokenMap(s))) {
    const at = s.indexOf(digits, from); if (at < 0) continue;
    from = at + digits.length;
    if (namedRun(s, at, digits)) continue;
    const before = s[at - 1], signed = SIGNS.has(before) && !isAlnum(s[at - 2]);
    out.push(signed ? {run: before + digits, at: at - 1} : {run: digits, at});
  }
  return out;
}

/** A thousands group after a first group that does not start with 0: "1,000" or "12.345" (never "0.125"). */
const ONE_GROUP = /^[1-9]\d{0,2}[.,]\d{3}$/;
/**
 * The value a number stands for, or the number as it is written when it is not one value: "1,000,000" → 1000000,
 * "1,000.5" and "1.000,5" → 1000.5, "16.67" → 16.67, "4,5" → 4.5, "−5" → −5; "1,000" and "1.000" (a thousand, or one?),
 * a time "3:15" and a version "1.2.3" stay as written.
 */
export function numberValue(run) {
  const s = String(run), negative = SIGNS.has(s[0]), body = negative ? s.slice(1) : s, value = valueOf(body);
  return typeof value === 'number' ? (negative ? -value : value) : s;
}
function valueOf(b) {
  if (/^\d+$/.test(b)) return Number(b);
  if (ONE_GROUP.test(b)) return b;   // ambiguous: the reader's language decides, and the screen does not say
  if (/^\d+\.\d+$/.test(b)) return Number(b);
  if (/^\d+,\d+$/.test(b)) return Number(b.replace(',', '.'));   // a decimal comma ("4,5")
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(b)) return Number(b.replaceAll(',', ''));   // 1,000,000 · 1,000.5
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(b)) return Number(b.replaceAll('.', '').replace(',', '.'));   // 1.000.000 · 1.000,5
  return b;
}

/**
 * What a fact's source is: 'url' (an http or https address), 'file' (a path inside the film's root that is there — a
 * document, or a record with a pointer into it after '#': "run.json#steps[2]"), or 'unverified' (anything else: words
 * nobody can follow, kept and reported, never refused — "/r/science thread" and "trust me" too). Only a path that is
 * there, outside the root, refuses, naming the fix: words that lead nowhere are words, whatever they start with.
 * Without a root, only a URL is verified.
 */
export function sourceKind(source, {root = null, where = 'facts'} = {}) {
  if (/^https?:\/\/[^\s]+$/i.test(source)) return 'url';
  if (root === null) return 'unverified';
  const file = source.split('#')[0];
  if (!file.trim() || !existsSync(path.resolve(root, file))) return 'unverified';
  let real; try { real = insideRoot(root, file); } catch { throw new Error(`${where}: source ${JSON.stringify(source)} is a path outside the film's root (${root}): put the document inside it, or give its URL`); }
  return statSync(real).isFile() ? 'file' : 'unverified';
}

/**
 * A facts list, checked: [{value, text?, source}] — `value` the number as the screen shows it, its sign too (16.67, −5,
 * 1000000, or as written when it is not one value: "1,000", "3:15"), `text` (optional) the words it is shown with, which
 * must stand around it in the line that shows it (so 60 Hz is not 60 sheep, and 6 Hz is not the 6 in "6 apples and
 * 16 Hz"), and `source` where it comes from: a URL, a file inside `root`, or anything else, kept as unverified (sourceKind).
 * Each fact comes back with its `kind`. Anything else refuses, naming the fix.
 */
export function readFacts(list, where = 'facts', {root = null} = {}) {
  if (!Array.isArray(list)) throw new Error(`${where} must be a list of facts, [{"value": 16.67, "text": "16.67 ms", "source": "https://…"}]`);
  return list.map((f, i) => {
    const name = `${where}[${i}]`;
    if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error(`${name} must be {value, text?, source}`);
    for (const key of Object.keys(f)) if (!FACT_KEYS.includes(key)) throw new Error(`${name} has ${key}; a fact takes value, text and source`);
    const one = typeof f.value === 'string' && numbersIn(f.value).length === 1 && numbersIn(f.value)[0] === f.value;
    if (!(Number.isFinite(f.value) || one)) throw new Error(`${name}: value is the number as the screen shows it (16.67, −5, or "1,000", "3:15" as written), not ${JSON.stringify(f.value)}${typeof f.value === 'string' ? ': put the words around it in text' : ''}`);
    if (f.text !== undefined && !(typeof f.text === 'string' && normSpeech(f.text))) throw new Error(`${name}: text is the words the number is shown with ("16.67 ms"), or left out`);
    if (typeof f.source !== 'string' || !f.source.trim()) throw new Error(`${name}: source says where ${JSON.stringify(f.value)} comes from: a URL, a document or a record pointer`);
    const source = f.source.trim();
    return Object.freeze({value: f.value, ...(f.text !== undefined ? {text: f.text} : {}), source, kind: sourceKind(source, {root, where: name})});
  });
}

/**
 * The scenes marked as example data: one entry per scene, the label it shows ("Example data", or the scene's own words
 * for it in the film's language), or null. `example` is true, the label's words, false or left out; anything else refuses.
 */
export function exampleScenes(storyboard) {
  return storyboard.scenes.map((scene, i) => {
    const e = scene?.example;
    if (e === undefined || e === false) return null;
    if (e === true) return 'Example data';
    if (typeof e === 'string' && e.trim()) return e.trim();
    throw new Error(`storyboard scene ${scene?.id ?? i}: example is true (the scene shows example data, and says so on screen) or the label's words in the film's language, not ${JSON.stringify(e)}`);
  });
}

/**
 * When the example label is up: over each example scene, and on after it while any line that scene shows is still on
 * screen (a whiteboard keeps its writing into the next scene, and the label stays with it) — to the line's last ink,
 * `gone` when it has one (an eraser wipes the line over its own time: the label stays until the wipe ends, never only
 * until it starts). shown: as findClaims takes it, each with `gone` or not; scenes: each scene's span, [{from, to}];
 * examples: exampleScenes(storyboard). Returns the spans, merged where the same words run on, in time order: [{from, to,
 * words, scene}] (scene: the index of the example scene it is for).
 */
export function labelSpans(shown, {examples = [], scenes = []} = {}) {
  const spans = [...scenes.flatMap((s, i) => (examples[i] ? [{from: s.from, to: s.to, words: examples[i], scene: i}] : [])),
    ...shown.filter(s => examples[s.scene]).map(s => ({from: s.at, to: Math.max(s.at, s.to, s.gone ?? s.to), words: examples[s.scene], scene: s.scene}))].sort((a, b) => a.from - b.from);
  const out = [];
  for (const s of spans) { const last = out.at(-1); if (last && last.words === s.words && s.from <= last.to + 1e-6) last.to = Math.max(last.to, s.to); else out.push({...s}); }
  return out;
}
/** Whether the label is up over all of [from, to] (labelSpans). */
export function labelledOver(labels, from, to) {
  let reach = from;
  for (const l of [...labels].sort((a, b) => a.from - b.from)) { if (l.from > reach + 1e-6) break; reach = Math.max(reach, l.to); if (reach >= to - 1e-6) return true; }
  return reach >= to - 1e-6;
}

/**
 * Where an example line lingers into a scene that is not example data: the label stays up with the line (labelSpans),
 * so beside a real number it seems to cover that number too — the viewer cannot tell which numbers are examples. The
 * fix is the film's, not the label's: erase the line before the scene (a label per number would be one more thing to
 * read). labels: claims.labels; numbers: the claims on screen (declared and drawn); scenes: each scene's span, [{from,
 * to}]; examples: exampleScenes(storyboard); ids: the scenes' ids. Returns each stretch where a label is up in a scene
 * that is not example data, [{scene, example, from, to, numbers}] in time order — `scene` the real scene's id, `example`
 * the example scene's, `numbers` the claims outside example data on screen in the stretch (none: nothing is covered).
 */
export function lingeringExamples({labels = [], numbers = []} = {}, {scenes = [], examples = [], ids = []} = {}) {
  const out = [];
  for (const l of labels) scenes.forEach((sc, j) => {
    const from = Math.max(l.from, sc.from), to = Math.min(l.to, sc.to);
    if (examples[j] || !(to - from > 1e-6)) return;
    out.push({scene: ids[j] ?? null, example: ids[l.scene] ?? null, from, to, numbers: numbers.filter(c => !c.example && c.at < to - 1e-6 && c.to > from + 1e-6)});
  });
  return out.sort((a, b) => a.from - b.from);
}
/** One lingering example line beside real numbers, in words, with the fix. */
export const lingerText = g => `an example line lingers into scene ${g.scene} beside real numbers (${[...new Set(g.numbers.map(c => c.number))].join(', ')}): erase it before the scene`;

/**
 * Where a fact's words stand in a line: [[from, to)] — case ignored, a space matching any spacing ("60 Hz" is "60Hz"),
 * and never starting or ending inside a run of digits ("6 Hz" is not in "16 Hz").
 */
function wordsIn(text, line) {
  const pattern = new RegExp(text.trim().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'giu'), out = [];
  for (const m of line.matchAll(pattern)) {
    const a = m.index, b = a + m[0].length;
    if (/\d/.test(line[a - 1] ?? '') && /^\d/.test(m[0])) continue;
    if (/\d/.test(line[b] ?? '') && /\d$/.test(m[0])) continue;
    out.push([a, b]);
  }
  return out;
}
/** Whether a fact backs a number shown at `at` in a line: the same value, and — when the fact gives its words — said right there. */
function backs(fact, {run, at}, line) {
  const shown = numberValue(run), value = typeof fact.value === 'number' ? fact.value : numberValue(fact.value);
  const same = typeof shown === 'number' && typeof value === 'number' ? Math.abs(shown - value) < 1e-9 : String(shown) === String(value);
  return same && (fact.text === undefined || wordsIn(fact.text, line).some(([a, b]) => at >= a && at + run.length <= b));
}

/**
 * The numbers shown, each with where it comes from. shown: [{text, line?, offset?, at, to, scene, path}] — every text
 * the film shows, from when it is first whole on screen (`at`) to when it starts to leave (`to`), the index of the scene
 * that shows it, the recipe entry (or `captions`) that shows it, and `line`, the text a fact's words are looked for in
 * when it is wider than `text` (a caption word's whole scene), `text` standing at `offset` in it; facts: a checked list
 * (readFacts) or null; examples: exampleScenes(storyboard); scenes: the scenes' ids. One claim per place in a line, per
 * scene (a line shown again is the same claim; the same number twice in a line is two): [{number, line, offset, at, to,
 * scene, path, example, source, sourceKind}] in time order — `scene` the scene's id, `example` true in an example scene,
 * `source` the backing fact's (or null) and `sourceKind` what it is (sourceKind: 'url', 'file' or 'unverified').
 */
export function findClaims(shown, {facts = null, examples = [], scenes = []} = {}) {
  const out = [], seen = new Map();
  for (const s of [...shown].sort((a, b) => a.at - b.at)) {
    const line = s.line ?? s.text;
    for (const {run: number, at} of numberRuns(s.text)) {
      const offset = (s.offset ?? 0) + at, key = `${line}\u0000${offset}\u0000${s.scene}`;
      if (seen.has(key)) { const c = seen.get(key); c.to = Math.max(c.to, +s.to.toFixed(3)); continue; }
      const fact = (facts ?? []).find(f => backs(f, {run: number, at: offset}, line));
      const claim = {number, line, offset, at: +s.at.toFixed(3), to: +Math.max(s.at, s.to).toFixed(3), scene: scenes[s.scene] ?? null, path: s.path, example: Boolean(examples[s.scene]),
        source: fact?.source ?? null, sourceKind: fact ? fact.kind ?? sourceKind(fact.source) : null};
      seen.set(key, claim); out.push(claim);
    }
  }
  return out.sort((a, b) => a.at - b.at || a.path.localeCompare(b.path) || a.offset - b.offset);
}

/**
 * How close two drawn words stand on a line, as shares of the taller one's height: on one line when the next starts
 * within `near` of the last one's end; TOUCHING when the gap is under `touch` — ink against ink; a sign or a decimal
 * point written onto its digits ("-" + "5", "16" + ".67") holds to them within `mark`, closer than a word space
 * (measured: 0.4 of the height or more); and a lone point — a "." or a "," drawn as its own token between digits, as a
 * code panel draws "16" "." "67" — joins the digits on both sides within `point` of each (measured in 24-px Menlo:
 * 0.23–0.27; a "," joins only a thousands group, three digits after it, so f(4,5) stays two numbers). Two digit groups
 * of clearly different sizes never join: the smaller under `size` of the taller's height, or its bottom more than
 * `baseline` of that height off — a superscript or raised cents is its own number (10² is not 102). No gap tells the
 * pieces of one number from two numbers drawn close, so only touching ink joins on its own. Measured (ink boxes): "12"
 * and "30" drawn 4 px apart in 24-px boxes stand 0.17 apart (two numbers); "16" then ".67 ms" at its advance, 0.10, and
 * a code token "-" then "5" in 28-px Menlo, 0.09; but digits drawn one at a time at their advance stand 0.05–0.22 apart
 * (60-px sans-serif), so a number drawn digit by digit reads as its digits: draw a number as one string, as every
 * built-in kit does.
 */
export const DRAWN = Object.freeze({near: .5, touch: .08, mark: .2, point: .5, size: .7, baseline: .3});
const LONE_POINT = /^[.,]$/, ENDS_DIGIT = /\d$/, STARTS_DIGIT = /^\d/;
/** A minus standing alone, or a decimal point written onto its digits: "-" + "5", "16" + ".67", "16." + "67". */
const glued = (last, next) => (SIGNS.has(last) && STARTS_DIGIT.test(next)) || (ENDS_DIGIT.test(last) && /^\.\d/.test(next)) || (/\d\.$/.test(last) && STARTS_DIGIT.test(next));
const height = b => b[3] - b[1], tall = (a, b) => Math.max(height(a), height(b)), gapOf = (a, b) => (b[0] - a[2]) / tall(a, b);
/** Whether two boxes are type of one size on one baseline (DRAWN.size, DRAWN.baseline): a superscript or raised cents is not. */
const oneSize = (a, b) => Math.min(height(a), height(b)) >= DRAWN.size * tall(a, b) - 1e-6 && Math.abs(a[3] - b[3]) <= DRAWN.baseline * tall(a, b) + 1e-6;
/** Whether word k is a lone point between digits of one size, within DRAWN.point of each ("16" "." "67"; "1" "," "299"). */
function lonePoint(words, k) {
  const [a, p, b] = [words[k - 1], words[k], words[k + 1]];
  if (!a || !b || !LONE_POINT.test(p.text.trim())) return false;
  const after = b.text.trim(), digits = p.text.trim() === ',' ? /^\d{3}(?!\d)/.test(after) : STARTS_DIGIT.test(after);
  return ENDS_DIGIT.test(a.text.trim()) && digits && gapOf(a.box, p.box) < DRAWN.point && gapOf(p.box, b.box) < DRAWN.point && oneSize(a.box, b.box);
}
/**
 * Why word i joins the one before it with no space — 'touch', 'sign', 'point' — or null (a space). Two digit groups of
 * clearly different sizes never join (oneSize).
 */
function joinOf(words, i) {
  const a = words[i - 1], b = words[i], at = a.text.trim(), bt = b.text.trim(), gap = gapOf(a.box, b.box);
  if (ENDS_DIGIT.test(at) && /^\.?\d/.test(bt) && !oneSize(a.box, b.box)) return null;
  if (gap < DRAWN.touch) return 'touch';
  if (gap < DRAWN.mark && glued(at, bt)) return SIGNS.has(at) ? 'sign' : 'point';
  return lonePoint(words, i) || lonePoint(words, i - 1) ? 'point' : null;
}

/**
 * The words a frame draws, as the lines they make: two words are on one line when their boxes ([x0, y0, x1, y1], the
 * ink's) share most of the shorter one's height and the next starts within DRAWN.near of the taller one's height of the
 * last one's end. Words on one line are joined with a space, and without one only where they are one thing (joinOf):
 * ink that TOUCHES (a gap under DRAWN.touch: one word drawn in pieces); a sign or a decimal point written onto its
 * digits (within DRAWN.mark: a code token "-" then "5" is −5, "16" then ".67 ms" is 16.67; "x", "-", "5" a space apart
 * is x - 5); a lone point between digits (within DRAWN.point: "16" "." "67" is 16.67, "1" "," "299" "." "99" is
 * 1,299.99). So two numbers drawn close stay two ("12" and "30", 4 px apart, are 12 and 30, never 1230), and so do two
 * digit groups of clearly different sizes ("$1,299" and a raised "99" are 1,299 and 99: the picture does not say whether
 * a raised group is cents, a power or a note, so neither is read into the other). A word with no box stands alone.
 */
export function drawnLines(words) {
  const boxed = words.filter(w => Array.isArray(w.box) && w.box.length === 4), lines = [];
  const shares = (a, b) => Math.min(a[3], b[3]) - Math.max(a[1], b[1]) >= .5 * Math.min(height(a), height(b)) - 1e-6;
  for (const w of [...boxed].sort((a, b) => a.box[0] - b.box[0])) {
    const line = lines.find(l => { const last = l.at(-1).box, gap = gapOf(last, w.box); return shares(last, w.box) && gap >= -.25 && gap <= DRAWN.near; });
    if (line) line.push(w); else lines.push([w]);
  }
  return [...lines.map(l => l.map((w, i) => (i && !joinOf(l, i) ? ' ' : '') + w.text).join('')), ...words.filter(w => !boxed.includes(w)).map(w => w.text)];
}

/**
 * Where a number stands in a drawn line, for telling whether it holds: the words before it (their numbers masked), the
 * number, and the character after it (or the line's end). A typewriter's partial "1" of "16" stands where the 16 will —
 * a different number in the same place, so it never holds; a counter's "60" in "frame 16 of 60" stands in the same place
 * as the frame number ticks; a badge "1" is not the "1" of "1 · ONE FOR ONE".
 */
function placeOf(text, n, runs) {
  let before = text.slice(0, n.at);
  for (const r of runs.filter(r => r.at < n.at).reverse()) before = `${before.slice(0, r.at)}#${before.slice(r.at + r.run.length)}`;
  return `${before}\u0000${n.run}\u0000${text[n.at + n.run.length] ?? ''}`;
}

/**
 * The numbers the picture draws that no declared line holds, from the words the review reads off its frames (review.mjs
 * · wordsAt, read once for every check, and made into lines: drawnLines): samples [{t, words: [{text, box?,
 * decorative?}]}], consecutive, the film's claims, sceneOf(t) (a scene's index) and the scenes' ids. Decorative words (a
 * kit's line numbers, decorative.mjs) are left out: drawn, never said. A drawn number counts once it HOLDS — the same
 * number in the same place (placeOf) in two samples running — so a typewriter's partial is no claim, nor a counter's
 * passing value; at the review's rate (0.25 s) a number up for 0.5 s or more always holds (any two `every` holds two
 * samples running), and a line up long enough to read is up for 1 s (reading.mjs · READING.least). A drawn number is a
 * declared one when a declared line (not a caption: the captions are the layout's, and never in the frame) shows the
 * same number and the drawn words are that line, or a word-bounded start or end of it (a list line's name and value are
 * drawn apart). A held number is claimed once, in the scene where it first holds — in the line it is first held in — and
 * it counts as example data only if the example label is up the whole time it holds (claims.labels). Returns claims as
 * findClaims does, path 'drawn', from the first sample it holds at to the last.
 */
export function drawnClaims(samples, {claims, sceneOf, scenes = []}) {
  const tidy = text => String(text).trim().replace(/\s+/g, ' '), declared = (claims?.numbers ?? []).filter(c => c.path !== 'captions');
  const part = (drawn, line) => drawn === line || line.startsWith(`${drawn} `) || line.endsWith(` ${drawn}`);
  const known = (number, text) => declared.some(c => c.number === number && part(text, tidy(c.line)));
  // Each sample's drawn numbers that no declared line holds, each with its line and its place.
  const read = samples.map(({t, words}) => ({t, numbers: drawnLines(words.filter(w => !w.decorative)).map(tidy).flatMap(text => {
    const runs = numberRuns(text);
    return runs.filter(n => !known(n.run, text)).map(n => ({text, offset: n.at, place: placeOf(text, n, runs)}));
  })}));
  const places = read.map(r => new Set(r.numbers.map(x => x.place))), held = (i, place) => Boolean(places[i - 1]?.has(place) || places[i + 1]?.has(place));
  const first = new Map();   // each number that holds, by its place: the line it is first held in, when, and when last
  read.forEach(({t, numbers}, i) => {
    for (const x of numbers.filter(x => held(i, x.place))) {
      if (first.has(x.place)) first.get(x.place).shown.to = t; else first.set(x.place, {offset: x.offset, shown: {text: x.text, at: t, to: t, scene: sceneOf(t), path: 'drawn'}});
    }
  });
  const options = {facts: claims?.facts ?? null, examples: claims?.examples ?? [], scenes};
  return [...first.values()].flatMap(h => findClaims([h.shown], options).filter(c => c.offset === h.offset))
    .map(c => ({...c, example: c.example && labelledOver(claims?.labels ?? [], c.at, c.to)}))
    .sort((a, b) => a.at - b.at || a.line.localeCompare(b.line) || a.offset - b.offset);
}

/**
 * What the claims add up to, for the verdict: how many numbers, how many in example scenes, sourced, outside example
 * scenes, unsourced, and how many of the sourced rest on a source nobody can follow (`unverified`: passed, and reported).
 */
export function claimsCount(claims) {
  const numbers = claims?.numbers ?? [], open = numbers.filter(c => !c.example), factsGiven = Array.isArray(claims?.facts);
  return {numbers: numbers.length, examples: numbers.length - open.length, sourced: open.filter(c => c.source).length, open: open.length,
    unsourced: factsGiven ? open.filter(c => !c.source).length : 0, unverified: open.filter(c => c.source && c.sourceKind === 'unverified').length, factsGiven};
}

/** The numbers with no source, outside example scenes (none without facts: then the check cannot run). */
export const unsourcedClaims = claims => (Array.isArray(claims?.facts) ? (claims.numbers ?? []).filter(c => !c.example && !c.source) : []);

/** The fix for a number with no source, in words. */
export const claimFix = c => `add {"value": ${JSON.stringify(numberValue(c.number))}, "source": "…"} to the facts, or mark scene ${c.scene} "example": true`;

/** One claim with no source, in words: "\"42\" (scene rule, stages[0].footer) has no source: add …". */
export const claimText = c => `"${c.number}" (scene ${c.scene}, ${c.path}) has no source: ${claimFix(c)}`;

/**
 * The verdict (verdict.mjs): passed when nothing is shown; not run when numbers outside example scenes have no facts to
 * be checked against (the storyboard names none); failed when one has no source.
 */
export const CLAIMS_VERDICT = Object.freeze({
  rules: Object.freeze([
    Object.freeze({when: Object.freeze({numbers: Object.freeze({eq: 0})}), then: 'passed', label: 'the film shows no number'}),
    Object.freeze({when: Object.freeze({factsGiven: Object.freeze({eq: false}), open: Object.freeze({gt: 0})}), then: 'not run', label: 'the storyboard names no facts, so the numbers outside example scenes cannot be checked'}),
    Object.freeze({when: Object.freeze({unsourced: Object.freeze({gt: 0})}), then: 'failed', label: 'a number on screen has no source and sits in no example scene'}),
  ]),
  passed: 'every number on screen has a source, or sits in a scene marked as example data',
});
