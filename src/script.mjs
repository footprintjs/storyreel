/**
 * One script: the narration itself says when a drawing lands and who says each line, in marks that are never spoken
 * and never shown — so a reworded line keeps its beats on their words, and what is said is written in one place.
 *
 *   {name}  a MOMENT: when the scene's next spoken word starts (with no word after it, when its last word ends). A beat
 *           names it as it names a phrase (["today", "{hop}", plus?]) and a pacing hold puts its silence there
 *           ({scene, after: "{hop}"}). A name is a letter, then letters, digits, - or _, used once in its scene.
 *   {@who}  the SPEAKER of the quoted line right after it, only spaces between: {@mom}"What are you two up to?". The
 *           quotes are " “” ‘’ and ', and the line runs to its closing quote: the first one no letter or digit follows.
 *           An apostrophe can end a line in ' or ‘’ quotes (the dogs' bowls): a line that could end at two places
 *           refuses, and "…" never can. A speaker tag moves no mouth by itself: the voice step reads the lines
 *           (`storyreel script`) and writes each word's speaker, and the clock reads those (clock.mjs · speaking).
 *
 *   said('Ten ones {dots} make a ten {hop}.')       → 'Ten ones make a ten.'   what is voiced, shown and captioned
 *   momentsOf('Ten ones {dots} make a ten {hop}.')  → [{name: 'dots', offset: 9}, {name: 'hop', offset: 20}]
 *
 * Anything else in braces refuses, naming the scene and the mark, and so does a mark in a silent scene's directions (a
 * beat names a direction by its words). The white space a mark leaves is tidied: one run stays between two words (a
 * line break when the marks touched one), none at the text's start or end, after an opening bracket or quote, or
 * before a closing mark. A narration without marks is said exactly as written. This module is the one owner of the
 * grammar: whatever reads a scene's words reads said() (clock.mjs · spokenText, sceneText), so no voice, caption or
 * clock ever sees a mark, and a phrase that is a mark is read with momentOf. The cast's {{role}} (cast.mjs ·
 * ROLE_TOKEN) is not a mark: it is left where it stands. Every reading is linear in the text's length. Pure.
 */
import {ROLE_TOKEN} from './cast.mjs';

/** A moment's or a speaker's name: a letter, then letters, digits, - or _. */
const NAME = /^\p{L}[\p{L}\p{M}\p{Nd}_-]*$/u;
/** What a voice says: letters, their marks and digits (footprint-narration · normSpeech keeps these). */
const WORD = /[\p{L}\p{M}\p{N}]/u, ENDS_WORD = /[\p{L}\p{M}\p{N}]$/u, STARTS_WORD = /^[\p{L}\p{M}\p{N}]/u;
/** The cast's {{role}}, read where it starts (cast.mjs owns its shape). */
const ROLE = new RegExp(ROLE_TOKEN.source, 'y');
/**
 * A closing mark hangs on the word before it, an opening one on the word after: nothing stands between. A straight
 * quote or ’ closes when no word follows it (’cause opens a word); a straight quote opens after white space, an
 * opening mark or the text's start.
 */
const CLOSES = /^(?:[.,;:!?…)\]»”]|['"’](?![\p{L}\p{M}\p{N}]))/u, OPENS = /(?:^|[\s([«‘“¿¡])['"]$|[([«‘“¿¡]$/u;
/** Each opening quote, and the one that closes its line. */
const QUOTES = Object.freeze({'"': '"', '“': '”', '‘': '’', "'": "'"});
/** The closing quotes an apostrophe is also written with: a line in them can end at an apostrophe. */
const APOSTROPHES = new Set(["'", '’']);
/** The most characters a refusal quotes of a mark, a name or the text around it. */
const SHOWN = 40;

/** A text cut to `n` characters (never inside one), "…" after when it was longer. */
function cut(text, n = SHOWN) {
  const chars = Array.from(text);
  return chars.length > n ? `${chars.slice(0, n - 1).join('')}…` : text;
}
/** A text as a refusal quotes it: cut, and in JSON's quotes, so no control character, line break or quote inside it reads as the message's own. */
const quoted = (text, n = SHOWN) => JSON.stringify(cut(text, n));
/** Whether the code unit at k is the second half of a character (a low surrogate): a cut there would split it. */
const lowHalf = (text, k) => k > 0 && k < text.length && text.charCodeAt(k) >= 0xdc00 && text.charCodeAt(k) <= 0xdfff;
/** Where a mark stands, for a refusal: the mark (cut) and a little of the text either side, as JSON quotes it. */
function around(text, from, to) {
  let a = Math.max(0, from - 24), b = Math.min(text.length, to + 24);
  if (lowHalf(text, a)) a--;
  if (lowHalf(text, b)) b++;
  return JSON.stringify(`${a > 0 ? '…' : ''}${text.slice(a, from)}${cut(text.slice(from, to))}${text.slice(to, b)}${b < text.length ? '…' : ''}`);
}
/** The text up to and with the character at k, as a refusal quotes where something ends (a few words before it). */
function endingAt(text, k) {
  let a = Math.max(0, k - 24);
  if (lowHalf(text, a)) a--;
  return JSON.stringify(`${a > 0 ? '…' : ''}${text.slice(a, k + 1)}`);
}
/** A moment's name as a refusal shows it: in its braces, cut. */
export const shownMark = name => `{${cut(name)}}`;

/**
 * The braces in a text, in order — the one reader of them: [{kind: 'group' | 'lone', from, to}]. A group is "{" to
 * the next "}" with no brace between (a mark, as written); a lone brace is a "{" that no "}" closes before the next
 * "{", or a "}" that closes nothing. The cast's {{role}} is passed over. The next "{" and "}" are found once for each
 * stretch of text, so a long run of braces is read once.
 */
function bracesIn(text) {
  const out = [];
  let open = -1, close = -1;   // the first "{" after the place being read, and the first "}" at or after it
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '}') { out.push({kind: 'lone', from: i, to: i + 1}); continue; }
    if (ch !== '{') continue;
    if (close < i) { const c = text.indexOf('}', i); close = c < 0 ? Infinity : c; }
    if (open <= i) { const o = text.indexOf('{', i + 1); open = o < 0 ? Infinity : o; }
    if (text[i + 1] === '{' && text[close + 1] === '}') { ROLE.lastIndex = i; if (ROLE.test(text)) { i = ROLE.lastIndex - 1; continue; } }
    if (close < open) { out.push({kind: 'group', from: i, to: close + 1}); i = close; } else out.push({kind: 'lone', from: i, to: i + 1});
  }
  return out;
}

/** A mark as written ({name} or {@who}): {kind: 'moment' | 'speaker', name, from, to}; braces that hold anything else refuse. */
function markAt(text, from, to, where) {
  const body = text.slice(from + 1, to - 1), speaker = body.startsWith('@'), name = speaker ? body.slice(1) : body;
  if (NAME.test(name)) return {kind: speaker ? 'speaker' : 'moment', name, from, to};
  throw new Error(`${where}: ${quoted(text.slice(from, to))} is not a mark, at ${around(text, from, to)}: a moment is {name} and a speaker {@who}, each name a letter, then letters, digits, - or _ (braces hold nothing else: take them out of the words)`);
}

/** The marks in a text, in order; a brace that opens or closes no mark refuses. */
function marksIn(text, where) {
  return bracesIn(text).map(b => {
    if (b.kind === 'group') return markAt(text, b.from, b.to, where);
    throw new Error(text[b.from] === '}' ? `${where}: a "}" closes no mark, at ${around(text, b.from, b.to)}: open the mark ({hop}), or take the brace out`
      : `${where}: a "{" opens a mark that never closes, at ${around(text, b.from, b.to)}: close it ({hop}), or take the brace out`);
  });
}

/** A moment's name is used once in its scene: a second use refuses, naming both places. */
function checkNames(text, marks, where) {
  const seen = new Map();
  for (const m of marks.filter(x => x.kind === 'moment')) {
    const first = seen.get(m.name);
    if (first) throw new Error(`${where}: the moment ${shownMark(m.name)} is written twice, at ${around(text, first.from, first.to)} and at ${around(text, m.from, m.to)}: a moment's name is used once in its scene — rename one`);
    seen.set(m.name, m);
  }
}

/** The white space a text starts with, and the white space it ends with (trimStart, trimEnd: no pattern to backtrack). */
const leading = text => text.slice(0, text.length - text.trimStart().length), trailing = text => text.slice(text.trimEnd().length);
/** Where the first character that is no white space stands in `text`, from `i` (its length when none does). */
const solid = (text, i) => { const re = /\S/g; re.lastIndex = i; return re.exec(text)?.index ?? text.length; };

/**
 * What stands where a group of marks stood: nothing at the text's start or end, after an opening mark or before a
 * closing one; else one run of the white space around and between the marks (a line break when one of them has one).
 * `before` is what is said up to the group; `ahead`, the first characters said after it, every mark after it out.
 */
function joint(before, spaces, ahead) {
  if (!before || !ahead) return '';
  const space = spaces.find(s => /[\n\r]/.test(s)) ?? spaces.find(Boolean) ?? '';
  return space && !CLOSES.test(ahead) && !OPENS.test(before) ? space : '';
}

/**
 * The narration read once: what is said (the marks out, the white space they leave tidied), each mark with `place`,
 * where in what is said the text after it goes on, and kept(k): where a character of the narration as written that
 * is said stands in it (null for one that is not: a mark, or white space a mark took with it).
 */
function read(text, where) {
  const marks = marksIn(text, where);
  if (!marks.length) return {said: text, marks, kept: k => k};   // said as written, byte for byte
  checkNames(text, marks, where);
  // Marks with only white space between them stand in one place; each piece of text between gives the white space
  // that touches a group to that group.
  const groups = [];
  for (const m of marks) { const last = groups.at(-1); if (last && !text.slice(last.at(-1).to, m.from).trim()) last.push(m); else groups.push([m]); }
  const pieces = [];
  for (let k = 0; k <= groups.length; k++) {
    const from = k ? groups[k - 1].at(-1).to : 0, raw = text.slice(from, k < groups.length ? groups[k][0].from : text.length);
    const lead = k ? leading(raw) : '', rest = raw.slice(lead.length), trail = k < groups.length ? trailing(rest) : '';
    pieces.push({from: from + lead.length, core: rest.slice(0, rest.length - trail.length), lead, trail});
  }
  // The text with every mark out (its white space kept): what is said just after a group, past any mark that follows.
  let plain = '', last = 0;
  const ends = groups.map(group => { for (const m of group) { plain += text.slice(last, m.from); last = m.to; } return plain.length; });
  plain += text.slice(last);
  let said = pieces[0].core;
  const cores = [{from: pieces[0].from, at: 0, length: said.length}];
  groups.forEach((group, k) => {
    const before = pieces[k], after = pieces[k + 1], from = group[0].from, to = group.at(-1).to;
    const spaces = [before.trail, ...group.slice(1).map((m, j) => text.slice(group[j].to, m.from)), after.lead], j = solid(plain, ends[k]);
    if (!spaces.some(Boolean) && ENDS_WORD.test(said) && STARTS_WORD.test(after.core)) throw new Error(`${where}: ${quoted(text.slice(from, to))} stands inside a word, at ${around(text, from, to)}: a mark goes between words — put a space before or after it`);
    said += joint(said, spaces, plain.slice(j, j + 3));
    for (const m of group) m.place = said.length;
    cores.push({from: after.from, at: said.length, length: after.core.length});
    said += after.core;
  });
  const kept = k => {   // the cores are in order: halve the list
    let lo = 0, hi = cores.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1, c = cores[mid]; if (k < c.from) hi = mid - 1; else if (k >= c.from + c.length) lo = mid + 1; else return c.at + k - c.from; }
    return null;
  };
  return {said, marks, kept};
}

/** Where the next spoken word starts in what is said, from `place` (its length when no word follows). */
const nextWord = (said, place) => { const k = said.slice(place).search(WORD); return k < 0 ? said.length : place + k; };
/** Whether the quote at k can close a line: no letter or digit follows it (in can't, the ' is inside a word). */
const closes = (text, k) => !STARTS_WORD.test(text.slice(k + 1, k + 3));

/**
 * The quoted line a speaker tag gives its speaker: its opening quote right after the tag (only white space between)
 * and its closing quote, the first after it that no letter or digit follows — {open, close}, the quotes' offsets in
 * the narration as written. The next speaker's tag (`next`, or null) inside the line refuses; so does a line in ' or ‘’
 * quotes whose end is an apostrophe after a word (the dogs' bowls) while another quote before the next tag could end it.
 */
function lineAfter(text, tag, next, where) {
  const open = solid(text, tag.to), quote = text[open], written = text.slice(tag.from, tag.to);
  if (quote === undefined || !Object.hasOwn(QUOTES, quote)) throw new Error(`${where}: ${quoted(written)} stands right before the quoted line it gives a speaker, only spaces between, at ${around(text, tag.from, tag.to)}: write the line in quotes just after it, ${cut(written)}"What are you two up to?" (a moment goes before the tag, or inside the quotes)`);
  const end = QUOTES[quote], limit = next ? next.from : text.length;
  for (let close = open + 1; close < text.length; close++) {
    if (text[close] !== end || !closes(text, close)) continue;
    if (next && next.from > open && next.from < close) throw new Error(`${where}: ${quoted(text.slice(next.from, next.to))} stands inside ${quoted(written)}'s line, at ${around(text, next.from, next.to)}: end the line with ${end} before the next speaker`);
    if (APOSTROPHES.has(end) && ENDS_WORD.test(text.slice(Math.max(0, close - 2), close))) {
      for (let also = close + 1; also < limit; also++) {
        if (text[also] === end && closes(text, also)) throw new Error(`${where}: ${quoted(written)}'s line could end at ${endingAt(text, close)} or at ${endingAt(text, also)}: an apostrophe reads as the end of a line in ${quote}…${end} quotes — write the line in "…" quotes`);
      }
    }
    return {open, close};
  }
  throw new Error(`${where}: ${quoted(written)}'s line opens with ${quote} and never closes, at ${around(text, tag.from, open + 1)}: end it with ${end}`);
}

/** A narration's script, every mark checked: {said, lines, moments}. `where` names whose narration it is in a refusal. */
function script(narration, where) {
  if (typeof narration !== 'string') throw new TypeError(`${where}: narration must be the words said, as one string`);
  const {said, marks, kept} = read(narration, where), tags = marks.filter(m => m.kind === 'speaker');
  const lines = tags.map((tag, t) => {
    const {open, close} = lineAfter(narration, tag, tags[t + 1] ?? null, where), offset = kept(open) + 1;
    return {by: tag.name, say: said.slice(offset, kept(close)), offset};
  });
  return {said, lines, moments: marks.filter(m => m.kind === 'moment').map(m => ({name: m.name, offset: nextWord(said, m.place)}))};
}

const whose = options => options?.name ?? 'the narration';

/** What is said: the narration without its marks, the white space they leave tidied — what is voiced, shown and captioned. `name` names the text in a refusal. */
export const said = (narration, options) => script(narration, whose(options)).said;
/** The narration's moments ({name}), in order: [{name, offset}] — `offset` where in said() the next spoken word starts (said()'s length when none follows). */
export const momentsOf = (narration, options) => script(narration, whose(options)).moments;
/** The narration's quoted lines with a speaker tag ({@who}"…"), in order: [{by, say, offset}] — `say` the line inside its quotes, its own marks out; `offset` where in said() it starts. */
export const linesOf = (narration, options) => script(narration, whose(options)).lines;

/** A silent scene's directions take no marks (a beat names a direction by its words): one refuses, naming it. */
function noMarks(directions, where) {
  directions.forEach((direction, k) => {
    const text = Array.isArray(direction) && typeof direction[0] === 'string' ? direction[0] : '', mark = bracesIn(text).find(b => b.kind === 'group');
    if (mark) throw new Error(`${where}: silent[${k}] has a mark, ${quoted(text.slice(mark.from, mark.to))}, and a silent scene takes none (a beat names a direction by its words): take it out`);
  });
}

/**
 * A storyboard scene's script, every mark checked (a refusal names the scene: `storyboard scene <id or index>`):
 * {id, said, lines, moments}. A silent scene says nothing — said null, no lines, no moments — and its directions take
 * no marks.
 */
export function sceneScript(scene, i) {
  const where = `storyboard scene ${scene?.id ?? i ?? '(no id)'}`;
  if (scene?.narration === undefined && Array.isArray(scene?.silent)) { noMarks(scene.silent, where); return {id: scene.id, said: null, lines: [], moments: []}; }
  return {id: scene?.id, ...script(scene?.narration, where)};
}

/**
 * The moment a beat's phrase names: "{hop}" → 'hop'; null for a phrase of words, read as ever. A speaker tag ("{@mom}")
 * names no moment, and braces round anything but a name refuse: `where` says whose phrase it is in the refusal.
 */
export function momentOf(phrase, where = `"${phrase}"`) {
  const mark = typeof phrase === 'string' ? /^\s*\{([^{}]*)\}\s*$/.exec(phrase) : null;
  if (!mark) return null;
  if (NAME.test(mark[1])) return mark[1];
  if (mark[1].startsWith('@')) throw new Error(`${where}: a speaker tag names who says a line, and is no moment: write a moment where the beat lands ({look}${mark[1] ? `{${mark[1]}}` : ''}'…') and name that ("{look}")`);
  throw new Error(`${where}: not a moment: a moment's name is a letter, then letters, digits, - or _ ("{hop}")`);
}
