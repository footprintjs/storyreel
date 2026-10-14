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
 * COVID-19, ISO-8601), not a number — but a year after a lower-case word or a time prefix is one ("mid-2024"). Each is
 * read by the language the film is shown in (`film.lang`, numberLocale: de "2,5" is 2.5, en-IN "1,00,000" is 100000);
 * without one, a number the languages read apart ("1,000", "1.000", "2,5", "1,00,000") is ambiguous, kept as written,
 * and only a fact that writes it the same way sources it.
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
export const numbersIn = (text, {lang = null} = {}) => numberRuns(text, numberLocale(lang)).map(n => n.run);
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
/**
 * A language's way of writing numbers, from Intl.NumberFormat(lang).formatToParts: its group and decimal symbols and its
 * grouping — the group after the last (`primary`, 3) and before it (`secondary`: 3, or 2 in Indian grouping: "en-IN",
 * "ta", "te", "hi" write 1,00,000). null without a language. A tag that is not BCP 47 refuses, naming the fix.
 *   numberLocale('de') → {lang: 'de', group: '.', decimal: ',', primary: 3, secondary: 3}
 *   numberLocale('fr') → {lang: 'fr', group: '\u202f' (a narrow no-break space), decimal: ',', …}
 */
export function numberLocale(lang) {
  if (lang === null || lang === undefined) return null;
  if (LOCALES.has(lang)) return LOCALES.get(lang);
  let tag = null; try { [tag] = typeof lang === 'string' ? Intl.getCanonicalLocales(lang) : []; } catch { /* refused below */ }
  if (!tag) throw new Error(`lang is the language the film is shown in, a BCP 47 tag ("de", "fr", "en-IN", "ta"), not ${JSON.stringify(lang)}: the numbers on screen are read by it (2,5 is 2.5 in "de")`);
  const f = new Intl.NumberFormat(tag), parts = f.formatToParts(1234567.5), ints = parts.filter(p => p.type === 'integer').map(p => p.value.length);
  const locale = Object.freeze({lang: tag, group: ints.length > 1 ? parts.find(p => p.type === 'group').value : null, decimal: parts.find(p => p.type === 'decimal')?.value ?? '.',
    primary: ints.at(-1), secondary: ints.length > 2 ? ints.at(-2) : ints.at(-1)});
  LOCALES.set(lang, locale);
  return locale;
}
const LOCALES = new Map();
/** The no-break spaces a group may be written with when the language groups with one (fr: U+202F; typed text often U+00A0). */
const NO_BREAK = new Set(['\u00a0', '\u202f', '\u2009']);
const literal = ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), PATTERNS = new Map();
/** A language's number as a pattern: plain digits, or grouped its way, each with an optional decimal part. */
function localePattern(locale) {
  if (PATTERNS.has(locale.lang)) return PATTERNS.get(locale.lang);
  const d = `(${literal(locale.decimal)}\\d+)?`, g = locale.group === null ? null : (NO_BREAK.has(locale.group) ? '[\\u00a0\\u202f\\u2009]' : literal(locale.group));
  PATTERNS.set(locale.lang, new RegExp(`^(\\d+${d}${g ? `|\\d{1,${locale.secondary}}(${g}\\d{${locale.secondary}})*${g}\\d{${locale.primary}}${d}` : ''})$`));
  return PATTERNS.get(locale.lang);
}

/**
 * The same numbers with where each stands in the text (its sign's place, when it has one): [{run, at}]. With a
 * language (numberLocale), a number grouped with a symbol the voice tools stop at (a no-break space, an apostrophe:
 * fr "1 234 567,5", de-CH "1'234'567.5") is one run.
 */
function numberRuns(text, locale = null) {
  const s = String(text ?? ''), raw = []; let from = 0;
  for (const run of unsaidDigits(spokenMap(s))) { const at = s.indexOf(run, from); if (at < 0) continue; from = at + run.length; raw.push({run, at}); }
  const runs = [];
  for (const r of raw) {
    const last = runs.at(-1), between = last ? s.slice(last.at + last.run.length, r.at) : null;
    const grouped = last && locale?.group && between.length === 1 && (between === locale.group || (NO_BREAK.has(locale.group) && NO_BREAK.has(between)));
    if (grouped && localePattern(locale).test(`${last.run}${between}${r.run}`)) last.run = s.slice(last.at, r.at + r.run.length);
    else runs.push({...r});
  }
  const out = [];
  for (const {run: digits, at} of runs) {
    if (namedRun(s, at, digits)) continue;
    const before = s[at - 1], signed = SIGNS.has(before) && !isAlnum(s[at - 2]);
    out.push(signed ? {run: before + digits, at: at - 1} : {run: digits, at});
  }
  return out;
}

/** A thousands group after a first group that does not start with 0: "1,000" or "12.345" (never "0.125"). */
const ONE_GROUP = /^[1-9]\d{0,2}[.,]\d{3}$/;
/**
 * The value a number stands for, or the number as it is written when it is not one value. By the film's language
 * (`lang`, numberLocale) when it has one: de "2,5" → 2.5 and "1.299,99" → 1299.99, fr "1 299,99" → 1299.99, en-IN
 * "1,00,000" → 100000, en "1,000" → 1000 — and anything that language does not write as one number stays as written
 * (en "2,5", de "16.67"). Without a language, what every language reads alike: "1,000,000" → 1000000, "1,000.5" and
 * "1.000,5" → 1000.5, "16.67" → 16.67, "−5" → −5; and as written, AMBIGUOUS, what the languages read apart: "1,000"
 * and "1.000" (a thousand, or one?), "2,5" (2.5, or a list?), "1,00,000" — only a fact written the same way sources it.
 * A time "3:15" and a version "1.2.3" stay as written.
 */
export const numberValue = (run, {lang = null} = {}) => valueIn(run, numberLocale(lang));
/** numberValue, by a language already read (numberLocale) or none. */
function valueIn(run, locale) {
  const s = String(run), negative = SIGNS.has(s[0]), body = negative ? s.slice(1) : s, value = locale ? localeValue(body, locale) : valueOf(body);
  return typeof value === 'number' ? (negative ? -value : value) : s;
}
function localeValue(b, locale) {
  if (!localePattern(locale).test(b)) return b;
  const digits = locale.group === null ? b : [...b].filter(ch => !(ch === locale.group || (NO_BREAK.has(locale.group) && NO_BREAK.has(ch)))).join('');
  return Number(digits.replace(locale.decimal, '.'));
}
function valueOf(b) {
  if (/^\d+$/.test(b)) return Number(b);
  if (ONE_GROUP.test(b)) return b;   // ambiguous: the reader's language decides, and the screen does not say
  if (/^\d+\.\d+$/.test(b)) return Number(b);
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(b)) return Number(b.replaceAll(',', ''));   // 1,000,000 · 1,000.5
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(b)) return Number(b.replaceAll('.', '').replace(',', '.'));   // 1.000.000 · 1.000,5
  return b;   // "2,5", "1,00,000", "3:15", "1.2.3": as written
}
/** Whether a number is ambiguous as read: not one value, though written like one ("1,000" or "2,5" without a language). */
const ambiguous = (run, locale) => typeof valueIn(run, locale) === 'string' && /^[−\-–]?\d+([.,]\d+)+$/.test(String(run));

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
export function readFacts(list, where = 'facts', {root = null, lang = null} = {}) {
  if (!Array.isArray(list)) throw new Error(`${where} must be a list of facts, [{"value": 16.67, "text": "16.67 ms", "source": "https://…"}]`);
  return list.map((f, i) => {
    const name = `${where}[${i}]`;
    if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error(`${name} must be {value, text?, source}`);
    for (const key of Object.keys(f)) if (!FACT_KEYS.includes(key)) throw new Error(`${name} has ${key}; a fact takes value, text and source`);
    if (!Number.isFinite(f.value)) {
      const found = typeof f.value === 'string' ? numbersIn(f.value, {lang}) : [], shows = `value is the number as the screen shows it (16.67, −5, or "1,000", "2,5", "3:15" as written), not ${JSON.stringify(f.value)}`;
      if (typeof f.value !== 'string' || !found.length) throw new Error(`${name}: ${shows}`);
      if (found.length > 1) throw new Error(`${name}: ${shows}, which shows ${found.length} numbers (${found.map(n => JSON.stringify(n)).join(', ')}): one fact per number`);
      if (found[0] !== f.value) throw new Error(`${name}: ${shows}: give the number alone (${JSON.stringify(found[0])}) and the words around it in text`);
    }
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
function backs(fact, {run, at}, line, locale = null) {
  const shown = valueIn(run, locale), value = typeof fact.value === 'number' ? fact.value : valueIn(fact.value, locale);
  const same = typeof shown === 'number' && typeof value === 'number' ? Math.abs(shown - value) < 1e-9 : String(shown) === String(value);
  return same && (fact.text === undefined || wordsIn(fact.text, line).some(([a, b]) => at >= a && at + run.length <= b));
}

/**
 * The numbers shown, each with where it comes from. shown: [{text, line?, offset?, at, to, scene, path}] — every text
 * the film shows, from when it is first whole on screen (`at`) to when it starts to leave (`to`), the index of the scene
 * that shows it, the recipe entry (or `captions`) that shows it, and `line`, the text a fact's words are looked for in
 * when it is wider than `text` (a caption word's whole scene), `text` standing at `offset` in it; facts: a checked list
 * (readFacts) or null; examples: exampleScenes(storyboard); scenes: the scenes' ids; lang: the language the film is
 * shown in, the numbers read by it (numberValue), or null. One claim per place in a line, per scene (a line shown again
 * is the same claim; the same number twice in a line is two): [{number, line, offset, at, to, scene, path, example,
 * source, sourceKind, lang?, ambiguous?}] in time order — `scene` the scene's id, `example` true in an example scene,
 * `source` the backing fact's (or null) and `sourceKind` what it is (sourceKind: 'url', 'file' or 'unverified'), `lang`
 * the language it was read by, and `ambiguous` when it is not one number as read: 'no language' ("2,5" in a film with
 * none), or the language it is not one number in.
 */
export function findClaims(shown, {facts = null, examples = [], scenes = [], lang = null} = {}) {
  const out = [], seen = new Map(), locale = numberLocale(lang);
  for (const s of [...shown].sort((a, b) => a.at - b.at)) {
    const line = s.line ?? s.text;
    for (const {run: number, at} of numberRuns(s.text, locale)) {
      const offset = (s.offset ?? 0) + at, key = `${line}\u0000${offset}\u0000${s.scene}`;
      if (seen.has(key)) { const c = seen.get(key); c.to = Math.max(c.to, +s.to.toFixed(3)); continue; }
      const fact = (facts ?? []).find(f => backs(f, {run: number, at: offset}, line, locale));
      const claim = {number, line, offset, at: +s.at.toFixed(3), to: +Math.max(s.at, s.to).toFixed(3), scene: scenes[s.scene] ?? null, path: s.path, example: Boolean(examples[s.scene]),
        source: fact?.source ?? null, sourceKind: fact ? fact.kind ?? sourceKind(fact.source) : null,
        ...(locale ? {lang: locale.lang} : {}), ...(ambiguous(number, locale) ? {ambiguous: locale ? locale.lang : 'no language'} : {})};
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
 * 0.23–0.27), and the number is then read as typed text is (numberValue, by the film's language). Two digit groups
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
/**
 * Whether word k is a lone point between digits of one size, within DRAWN.point of each ("16" "." "67"; "1" "," "299"):
 * joined as typed text has it, so it is read as typed text is (numberValue: "4,5" is 4.5 in de, as written without a language).
 */
function lonePoint(words, k) {
  const [a, p, b] = [words[k - 1], words[k], words[k + 1]];
  if (!a || !b || !LONE_POINT.test(p.text.trim())) return false;
  return ENDS_DIGIT.test(a.text.trim()) && STARTS_DIGIT.test(b.text.trim()) && gapOf(a.box, p.box) < DRAWN.point && gapOf(p.box, b.box) < DRAWN.point && oneSize(a.box, b.box);
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
 * 1,299.99, "4" "," "5" is "4,5" — two numbers, as typed). So two numbers drawn close stay two ("12" and "30", 4 px apart, are 12 and 30, never 1230), and so do two
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
 * How long a drawn number must stay up to be a claim: `seconds` (0.5 s), the same number in the same place of the same
 * line. The claims check reads the frames every `step` (0.25 s) or finer, whatever the review's own step; where that
 * cannot tell — a number seen at two reads running, up between 0.25 s and 0.75 s — it reads the two edges again every
 * `fine` (0.05 s). So a number up for 0.5 s or more always counts, and one up for less than 0.4 s never does: a
 * typewriter's partial "1" of "1299" (0.33 s at 3 characters a second) is no claim.
 */
export const HOLD = Object.freeze({seconds: .5, step: .25, fine: .05});

/**
 * Where a number stands, for telling whether it holds: its whole line with every number masked, and which of the
 * line's numbers it is. "Sold 40 cups" and "Sold 40 kg" are two places, each checked against its own facts; a counter's
 * "60" in "frame 16 of 60" keeps its place as the frame number ticks; a typewriter's "1" of "1299" stands where the 1299
 * will, a different number in the same place.
 */
function placeOf(text, runs, k) {
  let masked = text;
  for (const r of [...runs].reverse()) masked = `${masked.slice(0, r.at)}#${masked.slice(r.at + r.run.length)}`;
  return `${masked}\u0000${k}`;
}

/**
 * The numbers the picture draws that no declared line holds, from the words the review reads off its frames (review.mjs
 * · wordsAt, made into lines: drawnLines): samples [{t, words: [{text, box?, decorative?}]}] in time order, at most
 * HOLD.step apart for the bound below (the review reads for this check that often, whatever its own step), the film's
 * claims, sceneOf(t) (a scene's index), the scenes' ids, wordsAt(t) (the words at any moment, to read an edge again —
 * none before the film's start or after its end; without it, a number the reads cannot time is counted), and lang (the
 * language the film is shown in: numberValue). Decorative words (a kit's line numbers,
 * decorative.mjs) are left out: drawn, never said. A drawn number counts once it HOLDS — the same number in the same
 * place (placeOf) for HOLD.seconds — timed from the reads (a run of them, and the reads either side), and from its
 * edges read again every HOLD.fine where the reads cannot tell (past the reads' first and last moment too). A line typed on past its number ("We sold 1299" while "cups" is typed) is the same claim as the line it
 * becomes. A drawn number is a declared one when a declared line (not a caption: the captions are the layout's, and
 * never in the frame) shows the same number and the drawn words are that line, or a word-bounded start or end of it.
 * Each held number is claimed once, in the scene where it first holds, with the line it holds in — and it counts as
 * example data only if the example label is up the whole time it holds (claims.labels). Returns claims as findClaims
 * does, path 'drawn', from the first read it holds at to the last.
 */
export function drawnClaims(samples, {claims, sceneOf, scenes = [], wordsAt = null, lang = null}) {
  // Spaces made one (a no-break space is a language's group symbol: kept), and the film's language to read numbers by.
  const tidy = text => String(text).trim().replace(/[ \t\r\n]+/g, ' '), declared = (claims?.numbers ?? []).filter(c => c.path !== 'captions'), locale = numberLocale(lang);
  const part = (drawn, line) => drawn === line || line.startsWith(`${drawn} `) || line.endsWith(` ${drawn}`);
  const known = (number, text) => declared.some(c => c.number === number && part(text, tidy(c.line)));
  /** A frame's numbers that no declared line holds: [{text, offset, place, number}]. */
  const numbersOf = words => drawnLines(words.filter(w => !w.decorative)).map(tidy).flatMap(text => {
    const runs = numberRuns(text, locale);
    return runs.map((n, k) => ({text, offset: n.at, place: placeOf(text, runs, k), number: n.run})).filter(x => !known(x.number, x.text));
  });
  const read = samples.map(({t, words}) => ({t, numbers: numbersOf(words)}));
  const shows = (numbers, x) => numbers.some(y => y.place === x.place && y.number === x.number);
  const shownAt = (t, x) => shows(numbersOf(wordsAt(t)), x);
  /** Whether the number x, at reads i..j and not at the reads either side, is up for HOLD.seconds. */
  const holds = (i, j, x) => {
    const first = read[i].t, last = read[j].t, before = read[i - 1], after = read[j + 1];
    if (last - first >= HOLD.seconds - 1e-9) return true;   // seen up that long
    if (before && after && after.t - before.t <= HOLD.seconds + 1e-9) return false;   // up for less, whatever falls between the reads
    if (!wordsAt) return true;   // the reads cannot tell, and there is nothing to read again: counted, never dropped
    // Read the edges again every HOLD.fine — past the reads' own first and last moment too (a part's window cuts what is
    // on screen; nothing is up before the film's start) — until it is gone, or seen up HOLD.seconds.
    let from = before?.t ?? -Infinity, to = after?.t ?? Infinity;
    for (let t = first - HOLD.fine; t > from + 1e-9 && last - t < HOLD.seconds; t -= HOLD.fine) if (t < 0 || !shownAt(t, x)) { from = t; break; }
    for (let t = last + HOLD.fine; t < to - 1e-9 && t - from <= HOLD.seconds + 1e-9; t += HOLD.fine) if (!shownAt(t, x)) { to = t; break; }
    return to - from >= HOLD.seconds - 1e-9;
  };
  const runs = [];   // each run a number holds for: its place, its line, its offset, from its first read to its last
  read.forEach(({numbers}, i) => {
    for (const x of numbers) {
      if (i > 0 && shows(read[i - 1].numbers, x)) continue;   // a run starts here, or not at all
      let j = i; while (read[j + 1] && shows(read[j + 1].numbers, x)) j++;
      if (holds(i, j, x)) runs.push({id: `${x.place}\u0000${x.number}`, text: x.text, offset: x.offset, number: x.number, at: read[i].t, to: read[j].t});
    }
  });
  // A line typed on past its number is the line it becomes — run by run, so a line typed again is typed on again: the
  // run that follows a shorter one's end with the number up all the way between, in lines that start with it.
  const typedOn = (a, b) => b.number === a.number && b.offset === a.offset && b.text.length > a.text.length && b.text.startsWith(a.text) && b.at >= a.to
    && read.every(r => r.t <= a.to || r.t >= b.at || r.numbers.some(y => y.number === a.number && y.offset === a.offset && y.text.startsWith(a.text)));
  const byStart = [...runs].sort((a, b) => a.at - b.at);
  for (const a of [...runs].sort((a, b) => a.text.length - b.text.length)) {   // shortest first: a chain carries its first moment on
    const b = byStart.find(b => !b.gone && typedOn(a, b));
    if (b) { b.from = Math.min(b.from ?? b.at, a.from ?? a.at); a.gone = true; }
  }
  // Then the runs of one number in one place are one claim: from its first moment to its last.
  const held = new Map();
  for (const r of byStart.filter(r => !r.gone)) {
    const h = held.get(r.id), at = r.from ?? r.at;
    if (h) { h.at = Math.min(h.at, at); h.to = Math.max(h.to, r.to); } else held.set(r.id, {text: r.text, offset: r.offset, at, to: r.to});
  }
  const options = {facts: claims?.facts ?? null, examples: claims?.examples ?? [], scenes, lang};
  return [...held.values()].flatMap(h => findClaims([{text: h.text, at: h.at, to: h.to, scene: sceneOf(h.at), path: 'drawn'}], options).filter(c => c.offset === h.offset))
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
export const claimFix = c => (c.ambiguous === 'no language'
  ? `"${c.number}" reads one way in one language and another in the next, and the film has no language: give it one (lang: "de" reads "2,5" as 2.5; "en-IN" reads "1,00,000" as 100000) and source the number, or add {"value": "${c.number}", "source": "…"} to the facts as written, or mark scene ${c.scene} "example": true`
  : c.ambiguous
    ? `"${c.number}" is not one number in ${c.ambiguous}: add {"value": "${c.number}", "source": "…"} to the facts as written, or mark scene ${c.scene} "example": true`
    : `add {"value": ${JSON.stringify(numberValue(c.number, {lang: c.lang ?? null}))}, "source": "…"} to the facts, or mark scene ${c.scene} "example": true`);

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
