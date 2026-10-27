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
 *
 * A fact may also say HOW it is known (EVIDENCE): `evidence` — "verified" (a source), "reported" (a named person said
 * it: `by`), "derived" (grouped from verified facts, directly or through derived ones: `from`, their ids), "extrapolated"
 * (carried past what is known: a `source`, or `from`) or "open" (unresolved) — with `checked`, how it was checked (or,
 * for an open one, what is still unresolved). A claim in
 * words, with no number, is a fact with `says` in place of `value`: found wherever the film says or shows those words
 * (findStatements). A claim made from an open fact is open too. A release refuses an open claim it says or shows,
 * unless the recipe allows that open fact with a reason (readAllowOpen, unallowedOpen):
 *
 *   facts.json   [{"id": "battery-hours", "value": 18, "text": "18 hours", "evidence": "verified", "source": "https://example.org/spec", "checked": "the spec sheet, 2026-10-20"},
 *                 {"id": "battery-day", "says": "the battery lasts a full day", "evidence": "open", "checked": "the vendor has not confirmed it yet"}]
 */
import {existsSync, statSync} from 'node:fs';
import path from 'node:path';
import {spokenMap, unsaidDigits, normSpeech} from 'footprint-narration';
import {insideRoot} from './files.mjs';

const FACT_KEYS = ['value', 'text', 'source'];
/** The keys that say how a claim is known (readFacts · readEvidence): its id, a claim in words, its class, how it was checked, who said it, what it is made from. */
const EVIDENCE_KEYS = ['id', 'says', 'evidence', 'checked', 'by', 'from'];
/** How a claim is known: its evidence class, each with what it means. */
export const EVIDENCE = Object.freeze({verified: 'a source', reported: 'a named person said it', derived: 'grouped from verified facts, directly or through derived ones', extrapolated: 'carried past what is known', open: 'unresolved'});
/** The classes, in words, for a refusal. */
const CLASSES = Object.entries(EVIDENCE).map(([k, means], i, all) => `${i === all.length - 1 ? 'or ' : ''}"${k}" (${means})`).join(', ');
/** How a claim of each class might have been checked: the example a refusal shows. */
const CHECKED = Object.freeze({verified: 'read on the vendor\'s spec sheet, 2026-10-20', reported: 'asked by email, 2026-10-18', derived: 'added the two verified counts', extrapolated: 'the 2020–2025 trend, carried on to 2030', open: 'two sources disagree, and the vendor has not answered yet'});
/** A cased letter (upper, lower, title case): a digit run right after one is part of a name. A CJK character is not cased. */
const isCased = ch => /[\p{Lu}\p{Ll}\p{Lt}]/u.test(ch ?? '');
const isAlnum = ch => /[\p{L}\p{N}]/u.test(ch ?? '');
/** A minus standing on its own before a number is its sign: the hyphen-minus, the minus sign (U+2212), the en dash (U+2013), the full-width minus (U+FF0D). */
const SIGNS = new Set(['-', '\u2212', '\u2013', '\uff0d']), HYPHENS = new Set(['-', '\u2010', '\u2011']);

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
  // Its own separators as the text is read (plainDigits): the Arabic group ٬ and decimal ٫ are a "," and a "."; its own
  // digits (Arabic-Indic, Devanagari, Bengali, Tamil, Telugu, Thai …) are read as the digits they are, in every film.
  const plain = ch => SEPARATORS[ch] ?? ch;
  const locale = Object.freeze({lang: tag, group: ints.length > 1 ? plain(parts.find(p => p.type === 'group').value) : null, decimal: plain(parts.find(p => p.type === 'decimal')?.value ?? '.'),
    primary: ints.at(-1), secondary: ints.length > 2 ? ints.at(-2) : ints.at(-1), digits: f.resolvedOptions().numberingSystem});
  LOCALES.set(lang, locale);
  return locale;
}
const LOCALES = new Map();
/**
 * How code reads numbers, whatever the film's language: "." is the decimal mark, "," always separates (f(4,5) is 4 and
 * 5, 1,000 is 1 and 000), never any grouping — and "_" between digits joins them, as JavaScript and Python write a
 * long number (1_000_000 is 1000000). Words drawn inside decorative.mjs · code are read so; outside code "_" joins nothing.
 */
export const CODE_READING = Object.freeze({lang: 'code', code: true, group: null, decimal: '.', primary: 3, secondary: 3, cut: ',', join: '_'});
/** A language read already (numberLocale, or CODE_READING) or a tag to read. */
const readingOf = lang => (lang && typeof lang === 'object' ? lang : numberLocale(lang));
/**
 * The separators that are a "," and a "." in another form: the Arabic ٬ (a group) and ٫ (the decimal mark: ar, fa, ur),
 * and the full-width ， and ． of Chinese and Japanese text ("１，０００円", "３．５kg"). The ideographic comma 、 is not
 * among them: it separates a list (１、２、３ is three numbers), never a group.
 */
const SEPARATORS = Object.freeze({'\u066c': ',', '\u066b': '.', '\uff0c': ',', '\uff0e': '.'});
const DIGIT_VALUES = new Map(), ND = /\p{Nd}/u;
/** A digit's value, in any script (Unicode Nd: each script's ten digits in a row, from its zero), or null. */
function digitValue(ch) {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  if (!ND.test(ch)) return null;
  if (!DIGIT_VALUES.has(ch)) { const cp = ch.codePointAt(0); let n = 0; while (ND.test(String.fromCodePoint(cp - n - 1))) n++; DIGIT_VALUES.set(ch, n % 10); }
  return DIGIT_VALUES.get(ch);
}
/** The script a digit is in: its zero's code point. */
const scriptOf = ch => ch.codePointAt(0) - digitValue(ch);
/**
 * The text as it is read: every digit as an ASCII digit and the separators in other forms (SEPARATORS) as "," and ".", and where each of its
 * characters stands in the text — {plain, from}, from[i] the text's offset of plain[i] (and of its end, at plain.length).
 */
function plainDigits(text) {
  let plain = ''; const from = [];
  for (let i = 0; i < text.length;) {
    const ch = String.fromCodePoint(text.codePointAt(i)), v = digitValue(ch), out = v !== null ? String(v) : SEPARATORS[ch] ?? ch;
    for (let k = 0; k < out.length; k++) from.push(i);
    plain += out; i += ch.length;
  }
  from.push(text.length);
  return {plain, from};
}
/** Whether a run's digits are of more than one script ("١2٣"): ambiguous, kept as written. */
const mixedScripts = run => new Set([...String(run)].filter(ch => digitValue(ch) !== null).map(scriptOf)).size > 1;
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
  // Found in the text as read (plainDigits: a digit of any script, the Arabic and full-width separators), and given back as written.
  const s = String(text ?? ''), {plain, from: origin} = plainDigits(s), raw = []; let next = 0;
  for (const run of unsaidDigits(spokenMap(plain))) { const at = plain.indexOf(run, next); if (at < 0) continue; next = at + run.length; raw.push({run, at}); }
  const runs = [];
  for (const r of raw) {
    const last = runs.at(-1), between = last ? plain.slice(last.at + last.run.length, r.at) : null;
    const grouped = last && locale?.group && between.length === 1 && (between === locale.group || (NO_BREAK.has(locale.group) && NO_BREAK.has(between)));
    if (last && locale?.join && between === locale.join) last.run = plain.slice(last.at, r.at + r.run.length);   // code: 1_000_000
    else if (grouped && localePattern(locale).test(`${last.run}${between}${r.run}`)) last.run = plain.slice(last.at, r.at + r.run.length);
    else if (locale?.cut) { let at = r.at; for (const piece of r.run.split(locale.cut)) { if (piece) runs.push({run: piece, at}); at += piece.length + 1; } }   // code: "," separates
    else runs.push({...r});
  }
  const out = [];
  for (const {run: digits, at: p} of runs) {
    const at = origin[p], end = origin[p + digits.length];
    if (namedRun(s, at, digits)) continue;
    const before = s[at - 1], signed = SIGNS.has(before) && !isAlnum(s[at - 2]);
    out.push(signed ? {run: s.slice(at - 1, end), at: at - 1} : {run: s.slice(at, end), at});
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
/** numberValue, by a language already read (numberLocale, CODE_READING) or none. A number in a mix of scripts is as written. */
function valueIn(run, locale) {
  const s = String(run), negative = SIGNS.has(s[0]), body = plainDigits(negative ? s.slice(1) : s).plain;
  const value = mixedScripts(s) ? s : locale ? localeValue(body, locale) : valueOf(body);
  return typeof value === 'number' ? (negative ? -value : value) : s;
}
function localeValue(b, locale) {
  if (locale.join) b = b.replace(new RegExp(`(?<=\\d)${literal(locale.join)}(?=\\d)`, 'g'), '');   // code: 1_000_000 is 1000000
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
const ambiguous = (run, locale) => typeof valueIn(run, locale) === 'string' && (mixedScripts(run) || /^[−\-–]?\d+([.,]\d+)+$/.test(plainDigits(String(run)).plain));

/**
 * What a fact's source is: 'url' (an http or https address, alone or followed by notes after a space: "https://x.org/t
 * table 2, 2024 figures" — the leading URL is the source, the rest its notes), 'file' (a path inside the film's root that is there — a
 * document, or a record with a pointer into it after '#': "run.json#steps[2]"), or 'unverified' (anything else: words
 * nobody can follow, kept and reported, never refused — "/r/science thread" and "trust me" too). Only a path that is
 * there, outside the root, refuses, naming the fix: words that lead nowhere are words, whatever they start with.
 * Without a root, only a URL is verified.
 */
export function sourceKind(source, {root = null, where = 'facts'} = {}) {
  if (/^https?:\/\/[^\s]+(\s|$)/i.test(source)) return 'url';
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
  const read = list.map((f, i) => {
    const name = `${where}[${i}]`;
    if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error(`${name} must be {value, text?, source}`);
    for (const key of Object.keys(f)) if (!FACT_KEYS.includes(key) && !EVIDENCE_KEYS.includes(key)) throw new Error(`${name} has ${key}; a fact takes value, text and source (and, saying how it is known: ${EVIDENCE_KEYS.join(', ')})`);
    const how = readEvidence(f, name);
    if (f.says !== undefined) {
      if (f.value !== undefined || f.text !== undefined) throw new Error(`${name}: says is a claim in words, and value a number on screen (text the words it is shown with): give one fact says, another value`);
      if (typeof f.says !== 'string' || !/\p{L}/u.test(f.says)) throw new Error(`${name}: says is the claim as the film says or shows it, in words ("the battery lasts a full day"), not ${JSON.stringify(f.says)}`);
    } else if (!Number.isFinite(f.value)) {
      const found = typeof f.value === 'string' ? numbersIn(f.value, {lang}) : [], shows = `value is the number as the screen shows it (16.67, −5, or "1,000", "2,5", "3:15" as written), not ${JSON.stringify(f.value)}`;
      if (typeof f.value !== 'string' || !found.length) throw new Error(`${name}: ${shows}`);
      if (found.length > 1) throw new Error(`${name}: ${shows}, which shows ${found.length} numbers (${found.map(n => JSON.stringify(n)).join(', ')}): one fact per number: give each number a fact of its own`);
      if (found[0] !== f.value) throw new Error(`${name}: ${shows}: give the number alone (${JSON.stringify(found[0])}) and the words around it in text`);
    }
    if (f.text !== undefined && !(typeof f.text === 'string' && normSpeech(f.text))) throw new Error(`${name}: text is the words the number is shown with ("16.67 ms"), or left out`);
    // A derived claim rests on the facts it is grouped from, an open one on nothing yet, an extrapolated one on what it is carried from.
    const needsSource = !how?.evidence || how.evidence === 'verified' || how.evidence === 'reported' || (how.evidence === 'extrapolated' && !how.from);
    if ((needsSource || f.source !== undefined) && (typeof f.source !== 'string' || !f.source.trim())) throw new Error(`${name}: source says where ${JSON.stringify(f.says ?? f.value)} comes from: a URL, a document or a record pointer${how?.evidence === 'reported' ? ' (where they said it)' : ''}`);
    const source = typeof f.source === 'string' ? f.source.trim() : null;
    return Object.freeze({...(f.says !== undefined ? {says: f.says.trim()} : {value: f.value}), ...(f.text !== undefined ? {text: f.text} : {}), ...(source !== null ? {source, kind: sourceKind(source, {root, where: name})} : {}), ...how});
  });
  checkEvidenceList(read, where);
  return read;
}

/**
 * How a fact is known, checked: {id?, evidence, checked, by?, from?}, {id} alone, or null. `evidence` is one of EVIDENCE;
 * `checked` (always, with a class) how it was checked — for an open claim, what is still unresolved; `by` (reported only)
 * who said it; `from` (derived: required; extrapolated: or a source) the ids of the facts it is made from. A key that
 * says how a claim is known, given without its class, refuses: the class is what the rest is read by.
 */
function readEvidence(f, name) {
  if (f.id !== undefined && !(typeof f.id === 'string' && /^\S+$/.test(f.id.trim()))) throw new Error(`${name}: id names the fact, one word that no other fact uses ("battery-hours"), not ${JSON.stringify(f.id)}`);
  const id = f.id === undefined ? {} : {id: f.id.trim()}, told = EVIDENCE_KEYS.filter(k => k !== 'id' && k !== 'evidence' && f[k] !== undefined);
  if (f.evidence === undefined) {
    if (told.includes('says')) throw new Error(`${name}: says is a claim in words; say how it is known too — evidence ${CLASSES} — with checked (how it was checked)`);
    if (told.length) throw new Error(`${name} has ${told[0]}, which says how a claim is known: give its evidence too — ${CLASSES}`);
    return f.id === undefined ? null : id;
  }
  const e = f.evidence;
  if (!Object.hasOwn(EVIDENCE, e)) throw new Error(`${name}: evidence is how the claim is known — ${CLASSES} — not ${JSON.stringify(e)}`);
  if (typeof f.checked !== 'string' || !/\p{L}/u.test(f.checked)) throw new Error(e === 'open' ? `${name}: an open claim says what is still unresolved in checked (e.g. "${CHECKED.open}")` : `${name}: checked says how the claim was checked, in words (e.g. "${CHECKED[e]}")`);
  if (e === 'reported' && !(typeof f.by === 'string' && /\p{L}/u.test(f.by))) throw new Error(`${name}: a reported claim names who said it: by ("Asha Rao, head of support")`);
  if (e !== 'reported' && f.by !== undefined) throw new Error(`${name}: by names who said a reported claim, and this one is ${e}: leave by out, or class it "reported"`);
  if (f.from !== undefined && e !== 'derived' && e !== 'extrapolated') throw new Error(`${name}: from lists the facts a derived or extrapolated claim is made from, and this one is ${e}: leave from out`);
  if ((e === 'derived' || f.from !== undefined) && !(Array.isArray(f.from) && f.from.length && f.from.every(x => typeof x === 'string' && x.trim()))) throw new Error(`${name}: from lists the ids of the facts ${e === 'derived' ? 'a derived claim is grouped from' : 'it is carried from'} (["sales-march", "sales-april"])`);
  if (e === 'extrapolated' && f.from === undefined && f.source === undefined) throw new Error(`${name}: an extrapolated claim says what it is carried from: from (the facts' ids) or source`);
  return {...id, evidence: e, checked: f.checked.trim(), ...(e === 'reported' ? {by: f.by.trim()} : {}), ...(f.from !== undefined ? {from: Object.freeze(f.from.map(x => x.trim()))} : {})};
}

/**
 * The facts as one list: once one fact says how it is known, every fact does; each id is its own; every id a `from`
 * names is a fact's; a derived claim is grouped from verified or derived facts only; and no claim's `from` leads back to
 * itself (derived or extrapolated).
 */
function checkEvidenceList(facts, where) {
  const classed = facts.findIndex(f => f.evidence), bare = facts.findIndex(f => !f.evidence);
  if (classed >= 0 && bare >= 0) throw new Error(`${where}[${bare}] says no evidence, and ${where}[${classed}] does: once one fact says how it is known, every fact does — give ${where}[${bare}] evidence: ${CLASSES}`);
  const ids = new Map();
  facts.forEach((f, i) => {
    if (f.id === undefined) return;
    if (ids.has(f.id)) throw new Error(`${where}[${i}]: id "${f.id}" is ${where}[${ids.get(f.id)}]'s too: give each fact an id of its own`);
    ids.set(f.id, i);
  });
  facts.forEach((f, i) => {
    for (const ref of f.from ?? []) {
      if (!ids.has(ref)) throw new Error(`${where}[${i}]: from names "${ref}", which is no fact's id${ids.size ? ` (the ids: ${[...ids.keys()].join(', ')})` : ' (no fact has an id: give the ones it is made from "id")'}`);
      const base = facts[ids.get(ref)];
      if (f.evidence === 'derived' && base.evidence !== 'verified' && base.evidence !== 'derived') throw new Error(`${where}[${i}]: a derived claim is grouped from verified or derived facts, and "${ref}" is ${base.evidence}: verify "${ref}" first (evidence "verified", with its source)${base.evidence === 'open' ? `; until then this claim is open too: class it "open"` : ''}`);
    }
  });
  // A claim whose `from` leads back to itself rests on nothing, derived or extrapolated.
  const leadsBack = (start, at, seen = new Set()) => (facts[at].from ?? []).some(ref => {
    const k = ids.get(ref); if (k === start) return true; if (seen.has(k)) return false; seen.add(k); return leadsBack(start, k, seen);
  });
  facts.forEach((f, i) => { if (f.from && leadsBack(i, i)) throw new Error(`${where}[${i}]: ${f.evidence === 'derived' ? 'a derived' : 'an extrapolated'} claim cannot rest on itself (from leads back to "${f.id ?? `${where}[${i}]`}"): ground it in sourced facts`); });
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
    if (ND.test(line[a - 1] ?? '') && /^\p{Nd}/u.test(m[0])) continue;
    if (ND.test(line[b] ?? '') && /\p{Nd}$/u.test(m[0])) continue;
    out.push([a, b]);
  }
  return out;
}
/**
 * Whether a fact backs a number shown at `at` in a line: the same value — or, for a number that is not one value as read
 * (kept as written: "1,000" or "2,5" without a language, "16.67" in de), a fact written the same way, never a number
 * that happens to print alike — and, when the fact gives its words, said right there.
 */
function backs(fact, {run, at}, line, locale = null) {
  const shown = valueIn(run, locale), value = typeof fact.value === 'number' ? fact.value : valueIn(fact.value, locale);
  const same = typeof shown === 'number' ? typeof value === 'number' && Math.abs(shown - value) < 1e-9 : typeof fact.value === 'string' && String(shown) === String(value);
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
  const out = [], seen = new Map(), locale = readingOf(lang);
  for (const s of [...shown].sort((a, b) => a.at - b.at)) {
    const line = s.line ?? s.text;
    for (const {run: number, at} of numberRuns(s.text, locale)) {
      const offset = (s.offset ?? 0) + at, key = `${line}\u0000${offset}\u0000${s.scene}`;
      if (seen.has(key)) { const c = seen.get(key); c.to = Math.max(c.to, +s.to.toFixed(3)); continue; }
      const fact = (facts ?? []).find(f => f.says === undefined && backs(f, {run: number, at: offset}, line, locale));
      const claim = {number, line, offset, at: +s.at.toFixed(3), to: +Math.max(s.at, s.to).toFixed(3), scene: scenes[s.scene] ?? null, path: s.path, example: Boolean(examples[s.scene]),
        source: fact?.source ?? null, sourceKind: fact?.source ? fact.kind ?? sourceKind(fact.source) : null,
        ...(locale ? (locale.code ? {code: true} : {lang: locale.lang}) : {}), ...(ambiguous(number, locale) ? {ambiguous: locale ? locale.lang : 'no language'} : {}), ...knownBy(fact)};
      seen.set(key, claim); out.push(claim);
    }
  }
  return out.sort((a, b) => a.at - b.at || a.path.localeCompare(b.path) || a.offset - b.offset);
}

/** How the fact behind a claim is known, onto the claim: {id?, evidence, checked, by?, from?} — nothing for a fact that does not say (or none). */
const knownBy = fact => (fact?.evidence ? {...(fact.id ? {id: fact.id} : {}), evidence: fact.evidence, checked: fact.checked, ...(fact.by ? {by: fact.by} : {}), ...(fact.from ? {from: fact.from} : {})} : {});

/**
 * The claims in words the film makes: every place a fact's `says` stands in what the film shows or says — its words in
 * order, case and the marks between them ignored, never inside a word ("the battery lasts a full day" is in "And yes —
 * the battery lasts a full day!" but not in "the battery lasts a full daylight shift"). shown: as findClaims takes it (a caption word stands
 * for its scene's spoken line: `line`, and `offset` where the word is in it); facts: a checked list. One claim per place,
 * per scene: [{says, line, offset, at, to, scene, path, example, source, sourceKind, id?, evidence, checked, by?, from?}]
 * in time order — said aloud when `path` is 'captions' (at–to: when its words are said), shown otherwise.
 */
export function findStatements(shown, {facts = null, examples = [], scenes = []} = {}) {
  // A word's letters, its marks (the vowel signs of Devanagari, Tamil, Telugu, Bengali, Thai …) and its digits.
  const said = (facts ?? []).filter(f => f.says !== undefined);
  if (!said.length) return [];
  // Each line once per scene and entry, with its words' times (a caption's words) or its own (a line on screen).
  const lines = new Map();
  for (const s of shown) {
    const line = s.line ?? s.text, key = `${line}\u0000${s.scene}\u0000${s.path}`;
    if (!lines.has(key)) lines.set(key, {line, scene: s.scene, path: s.path, at: s.at, to: s.to, words: []});
    const l = lines.get(key); l.at = Math.min(l.at, s.at); l.to = Math.max(l.to, s.to);
    if (s.line !== undefined) l.words.push({offset: s.offset ?? 0, length: s.text.length, at: s.at, to: s.to});
  }
  const out = [];
  for (const fact of said) {
    const words = fact.says.normalize('NFC').split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${words.join('[^\\p{L}\\p{M}\\p{N}]+')}(?![\\p{L}\\p{M}\\p{N}])`, 'giu');
    for (const l of lines.values()) for (const m of nfc(l.line).matchAll(pattern)) {
      // The place as the line is written (NFC can join a letter and its mark into one): its offsets in the line.
      const a = nfcAt(l.line, m.index), b = nfcAt(l.line, m.index + m[0].length), inside = l.words.filter(w => w.offset < b && w.offset + w.length > a);
      if (l.words.length && !inside.length) continue;
      const at = inside.length ? Math.min(...inside.map(w => w.at)) : l.at, to = inside.length ? Math.max(...inside.map(w => w.to)) : l.to;
      out.push({says: fact.says, line: l.line, offset: a, at: +at.toFixed(3), to: +Math.max(at, to).toFixed(3), scene: scenes[l.scene] ?? null, path: l.path, example: Boolean(examples[l.scene]),
        source: fact.source ?? null, sourceKind: fact.source ? fact.kind ?? sourceKind(fact.source) : null, ...knownBy(fact)});
    }
  }
  return out.sort((a, b) => a.at - b.at || a.path.localeCompare(b.path) || a.offset - b.offset);
}

/** A line in NFC (each run between spaces normalised alone: NFC never joins across a space), cached. */
const NFC = new Map();
function nfcOf(line) {
  if (!NFC.has(line)) {
    if (NFC.size > 2000) NFC.clear();
    const parts = line.split(/(\s+)/), map = [];   // map: [normalised start, written start, written length] per run
    let text = '', at = 0;
    for (const part of parts) { const n = part.normalize('NFC'); map.push([text.length, at, part.length, n.length]); text += n; at += part.length; }
    NFC.set(line, {text, map});
  }
  return NFC.get(line);
}
const nfc = line => nfcOf(line).text;
/** An offset in the NFC line → the offset in the line as written: the start of its run, plus as far into it as the run allows. */
function nfcAt(line, i) {
  const {map} = nfcOf(line);
  let k = map.length - 1; while (k > 0 && map[k][0] > i) k--;
  const [start, written, length, normal] = map[k];
  return written + Math.min(length, i - start === normal ? length : i - start);
}

/**
 * The open claims a recipe lets a release say or show anyway, each with its reason: recipe.evidence =
 * {"allowOpen": {"<an open fact's id>": "why it may go out unresolved"}}, checked against the facts (readFacts): every id
 * an open fact's, every reason in words. Returns {id: reason}, frozen, or null when none is allowed.
 */
export function readAllowOpen(value, facts) {
  if (value === undefined) return null;
  const shape = 'recipe.evidence is {"allowOpen": {"<an open fact\'s id>": "why it may go out unresolved"}}';
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${shape}, not ${JSON.stringify(value)}`);
  for (const key of Object.keys(value)) if (key !== 'allowOpen') throw new Error(`recipe.evidence has ${key}; it takes allowOpen only: {"allowOpen": {"<an open fact's id>": "why it may go out unresolved"}}`);
  const allow = value.allowOpen;
  if (!allow || typeof allow !== 'object' || Array.isArray(allow)) throw new Error(`${shape}: allowOpen maps each open fact's id to its reason`);
  const ids = new Map((facts ?? []).filter(f => f.id !== undefined).map(f => [f.id, f]));
  for (const [id, reason] of Object.entries(allow)) {
    const fact = ids.get(id);
    if (!fact) throw new Error(`recipe.evidence.allowOpen names "${id}", which is no fact's id${ids.size ? ` (the ids: ${[...ids.keys()].join(', ')})` : facts ? ': give the open fact "id"' : ': the storyboard names no facts'}`);
    if (fact.evidence !== 'open') throw new Error(`recipe.evidence.allowOpen names "${id}", which is ${fact.evidence ? `"${fact.evidence}"` : 'not classed'}, not open: leave it out (only an open claim needs allowing)`);
    if (typeof reason !== 'string' || !/\p{L}/u.test(reason)) throw new Error(`recipe.evidence.allowOpen.${id} is why it may go out unresolved, in words (e.g. "the vendor has not confirmed it, and the film says so on screen"), not ${JSON.stringify(reason)}`);
  }
  const entries = Object.entries(allow);
  return entries.length ? Object.freeze(Object.fromEntries(entries.map(([id, r]) => [id, r.trim()]))) : null;
}

/** The facts by id. */
const byId = facts => new Map((facts ?? []).filter(f => f.id !== undefined).map(f => [f.id, f]));
/**
 * Whether a fact leads back to a source: not open, and with a source of its own, or made from facts (`from`) that all do.
 * A derived or extrapolated claim made from an open fact is not grounded, however many steps away the open one is.
 */
function grounded(fact, ids, seen = new Set()) {
  if (!fact || fact.evidence === 'open' || seen.has(fact)) return false;
  if (fact.source) return true;
  seen.add(fact);
  return Boolean(fact.from?.length) && fact.from.every(ref => grounded(ids.get(ref), ids, seen));
}
/** Whether a claim has a source: its own, or (made from facts) a `from` that leads back to sources (grounded). */
const backed = (c, ids) => Boolean(c.source) || (c.evidence !== 'open' && Boolean(c.from?.length) && c.from.every(ref => grounded(ids.get(ref), ids)));
/** The open facts a claim rests on: its own fact when it is open, and every open fact its `from` leads to — [{id?, checked}]. */
function openRoots(c, ids) {
  const out = c.evidence === 'open' ? [{id: c.id, checked: c.checked}] : [], seen = new Set();
  const walk = ref => { const f = ids.get(ref); if (!f || seen.has(f)) return; seen.add(f); if (f.evidence === 'open') out.push({id: f.id, checked: f.checked}); (f.from ?? []).forEach(walk); };
  (c.from ?? []).forEach(walk);
  return out;
}

/** One claim as the evidence list keeps it: what it claims, a number or words, said aloud or shown, where, and how it is known. */
const asEvidence = (c, kind, ids) => {
  const open = c.evidence === 'open' ? [] : openRoots(c, ids).map(r => r.id);
  return {claim: kind === 'number' ? c.number : c.says, kind, evidence: c.evidence ?? null, said: c.path === 'captions' ? 'spoken' : 'shown', scene: c.scene, path: c.path, at: c.at,
    ...(c.id ? {id: c.id} : {}), ...(c.source ? {source: c.source, sourceKind: c.sourceKind} : {}), ...(c.checked ? {checked: c.checked} : {}), ...(c.by ? {by: c.by} : {}), ...(c.from ? {from: [...c.from]} : {}),
    ...(open.length ? {restsOnOpen: open} : {})};
};
/**
 * Every claim the film says or shows outside example scenes, with its class — the making-of's `claims.evidence` — or null
 * when no fact says how it is known (the facts are not classed). {classes: {verified, reported, derived, extrapolated,
 * open, unclassed}, claims: [{claim, kind: 'number' | 'words', evidence, said: 'spoken' | 'shown', scene, path, at, id?,
 * source?, sourceKind?, checked?, by?, from?, restsOnOpen?}], allowed?: {id: reason}} — `unclassed` and `evidence: null`
 * a number no fact backs (its fix is in the claims' unsourced list); `restsOnOpen` the ids of the open facts a claim's
 * `from` leads to (a release treats it as open).
 */
export function evidenceOf(claims) {
  if (!(claims?.facts ?? []).some(f => f.evidence)) return null;
  const ids = byId(claims.facts), list = [...(claims.numbers ?? []).filter(c => !c.example).map(c => asEvidence(c, 'number', ids)), ...(claims.statements ?? []).filter(c => !c.example).map(c => asEvidence(c, 'words', ids))]
    .sort((a, b) => a.at - b.at || a.path.localeCompare(b.path));
  const classes = Object.fromEntries([...Object.keys(EVIDENCE), 'unclassed'].map(k => [k, list.filter(c => (c.evidence ?? 'unclassed') === k).length]));
  return {classes, claims: list, ...(claims.allowOpen ? {allowed: {...claims.allowOpen}} : {})};
}

/**
 * The open claims the film says or shows outside example scenes that the recipe does not allow (claims.allowOpen): what a
 * release refuses. A claim is open when its fact is, and when its `from` leads to an open fact (a week extrapolated from
 * an open day is as open as the day); it is allowed only when every open fact it rests on is. `ranges`: the stretches of
 * the film a render shows ([[from, to]] on the film clock: a part, or an edit's cuts) — a claim outside all of them is
 * not shown, so not refused; null: the whole film. Each comes back with `rests`, the open facts it rests on ([{id?, checked}]).
 */
export function unallowedOpen(claims, {ranges = null} = {}) {
  const ids = byId(claims?.facts), shown = c => !ranges || ranges.some(([from, to]) => c.at < to - 1e-6 && Math.max(c.at, c.to) > from + 1e-6);
  return [...(claims?.numbers ?? []), ...(claims?.statements ?? [])].filter(c => !c.example && shown(c))
    .map(c => ({...c, rests: openRoots(c, ids)})).filter(c => c.rests.some(r => !(r.id && claims.allowOpen?.[r.id])))
    .sort((a, b) => a.at - b.at || a.path.localeCompare(b.path));
}
/**
 * One open claim in words, with what is unresolved: "\"the battery lasts a full day\" (said in scene battery; fact
 * \"battery-day\"; open: …)", or, for a claim made from an open fact, what it rests on ("…; rests on open \"day\": …").
 */
export const openText = c => {
  const self = c.evidence === 'open', via = (c.rests ?? []).filter(r => !self || r.id !== c.id);
  return `"${c.number ?? c.says}" (${c.path === 'captions' ? 'said' : `shown (${c.path})`} in scene ${c.scene}${c.id ? `; fact "${c.id}"` : ''}${self ? `; open: ${c.checked}` : ''}${via.length ? `; rests on open ${via.map(r => `${r.id ? `"${r.id}"` : 'a fact with no id'}: ${r.checked}`).join(', ')}` : ''})`;
};
/** What a release says when it refuses open claims: each one, then the fix — settle it, cut it, or allow it with a reason. */
export function openRefusal(open) {
  const named = open.flatMap(c => c.rests ?? (c.evidence === 'open' ? [{id: c.id}] : [])).find(r => r.id)?.id;
  return `This release says or shows ${open.length} open claim${open.length > 1 ? 's' : ''} (unresolved): ${open.slice(0, 3).map(openText).join('; ')}${open.length > 3 ? `; and ${open.length - 3} more` : ''}. `
    + 'Settle each one (find its source and class it "verified", or "reported" by a named person) or cut it from the film; '
    + `to release it unresolved, allow the open fact in the recipe with a reason: "evidence": {"allowOpen": {"${named ?? '<the fact\'s id>'}": "why it may go out unresolved"}}${open.some(c => (c.rests ?? [c]).some(r => !r.id)) ? ' (a fact allowed this way needs an "id")' : ''}`;
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
// A digit of any script (Unicode Nd), and a point: ".", "," or the Arabic ٫ and ٬.
const LONE_POINT = /^[.,\u066b\u066c\uff0c\uff0e]$/, ENDS_DIGIT = /\p{Nd}$/u, STARTS_DIGIT = /^\p{Nd}/u;
/** A minus standing alone, or a decimal point written onto its digits: "-" + "5", "16" + ".67", "16." + "67". */
const glued = (last, next) => (SIGNS.has(last) && STARTS_DIGIT.test(next)) || (ENDS_DIGIT.test(last) && /^[._\u066b\uff0e]\p{Nd}/u.test(next)) || (/\p{Nd}[._\u066b\uff0e]$/u.test(last) && STARTS_DIGIT.test(next));
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
  if (ENDS_DIGIT.test(at) && /^[.\u066b]?\p{Nd}/u.test(bt) && !oneSize(a.box, b.box)) return null;
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
  /**
   * A frame's numbers that no declared line holds: [{text, offset, place, number, code}] — its code (words drawn inside
   * decorative.mjs · code) made into lines of its own and read as code reads numbers (CODE_READING), the rest by the
   * film's language.
   */
  const linesOf = (words, reading) => drawnLines(words).map(tidy).flatMap(text => {
    const runs = numberRuns(text, reading);
    return runs.map((n, k) => ({text, offset: n.at, place: `${reading?.code ? 'code' : ''}\u0000${placeOf(text, runs, k)}`, number: n.run, code: Boolean(reading?.code)})).filter(x => !known(x.number, x.text));
  });
  const numbersOf = words => { const said = words.filter(w => !w.decorative); return [...linesOf(said.filter(w => !w.code), locale), ...linesOf(said.filter(w => w.code), CODE_READING)]; };
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
      if (holds(i, j, x)) runs.push({id: `${x.place}\u0000${x.number}`, text: x.text, offset: x.offset, number: x.number, code: x.code, at: read[i].t, to: read[j].t});
    }
  });
  // A line typed on past its number is the line it becomes — run by run, so a line typed again is typed on again: the
  // run that follows a shorter one's end with the number up all the way between, in lines that start with it.
  const typedOn = (a, b) => b.number === a.number && b.offset === a.offset && b.code === a.code && b.text.length > a.text.length && b.text.startsWith(a.text) && b.at >= a.to
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
    if (h) { h.at = Math.min(h.at, at); h.to = Math.max(h.to, r.to); } else held.set(r.id, {text: r.text, offset: r.offset, code: r.code, at, to: r.to});
  }
  const options = {facts: claims?.facts ?? null, examples: claims?.examples ?? [], scenes};
  return [...held.values()].flatMap(h => findClaims([{text: h.text, at: h.at, to: h.to, scene: sceneOf(h.at), path: 'drawn'}], {...options, lang: h.code ? CODE_READING : locale}).filter(c => c.offset === h.offset))
    .map(c => ({...c, example: c.example && labelledOver(claims?.labels ?? [], c.at, c.to)}))
    .sort((a, b) => a.at - b.at || a.line.localeCompare(b.line) || a.offset - b.offset);
}

/**
 * What the claims add up to, for the verdict: how many numbers, how many in example scenes, sourced, outside example
 * scenes, unsourced, and how many of the sourced rest on a source nobody can follow (`unverified`: passed, and reported).
 */
export function claimsCount(claims) {
  const numbers = claims?.numbers ?? [], open = numbers.filter(c => !c.example), factsGiven = Array.isArray(claims?.facts);
  // A claim made from facts (`from`) is sourced only when they lead back to sources (backed: never through an open one).
  const ids = byId(claims?.facts);
  return {numbers: numbers.length, examples: numbers.length - open.length, sourced: open.filter(c => backed(c, ids)).length, open: open.length,
    unsourced: factsGiven ? open.filter(c => !backed(c, ids)).length : 0, unverified: open.filter(c => c.source && c.sourceKind === 'unverified').length, factsGiven};
}

/** The numbers with no source, outside example scenes (none without facts: then the check cannot run). One made from facts is sourced when they lead back to sources. */
export const unsourcedClaims = claims => (Array.isArray(claims?.facts) ? (claims.numbers ?? []).filter(c => !c.example && !backed(c, byId(claims.facts))) : []);

/** The fix for a number with no source, in words (one an open fact backs: settle it). */
export const claimFix = c => (c.evidence === 'open'
  ? `it rests on an open claim${c.id ? ` ("${c.id}")` : ''} — ${c.checked}: settle it (find its source and class it "verified"), or mark scene ${c.scene} "example": true`
  : c.from?.length
    ? `it is made from ${c.from.map(ref => `"${ref}"`).join(', ')}, which do not lead back to a source (an open fact, or one with no source): settle them (a source, evidence "verified"), or mark scene ${c.scene} "example": true`
  : c.ambiguous === 'no language'
  ? `"${c.number}" reads one way in one language and another in the next, and the film has no language: give it one (lang: "de" reads "2,5" as 2.5; "en-IN" reads "1,00,000" as 100000) and source the number, or add {"value": "${c.number}", "source": "…"} to the facts as written, or mark scene ${c.scene} "example": true`
  : c.ambiguous
    ? `"${c.number}" is not one number in ${c.ambiguous}: add {"value": "${c.number}", "source": "…"} to the facts as written, or mark scene ${c.scene} "example": true`
    : `add {"value": ${JSON.stringify(valueIn(c.number, c.code ? CODE_READING : numberLocale(c.lang ?? null)))}, "source": "…"} to the facts, or mark scene ${c.scene} "example": true`);

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
