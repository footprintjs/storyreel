/**
 * One script: the narration itself says when a drawing lands and who says each line, in marks that are never spoken
 * and never shown — so a reworded line keeps its beats on their words, and what is said is written in one place.
 *
 *   {name}  a MOMENT: when the scene's next spoken word starts (with no word after it, when its last word ends). A beat
 *           names it as it names a phrase (["today", "{hop}", plus?]) and a pacing hold puts its silence there
 *           ({scene, after: "{hop}"}). A name is a letter, then letters, digits, - or _, used once in its scene.
 *   {@who}  the SPEAKER of the quoted line right after it, only spaces between: {@mom}'What are you two up to?'. The
 *           quotes are ' " ‘ ’ “ ”, and the line runs to its closing quote (an apostrophe inside a word is not one).
 *
 *   said('Ten ones {dots} make a ten {hop}.')     → 'Ten ones make a ten.'   what is voiced, shown and captioned
 *   marksOf('Ten ones {dots} make a ten {hop}.')  → [{name: 'dots', at: 9}, {name: 'hop', at: 20}]
 *
 * Anything else in braces refuses, naming the scene and the mark, and so does a mark in a silent scene's directions (a
 * beat names a direction by its words). The white space a mark leaves is tidied: one run stays between two words, none
 * at the text's start or end, after an opening bracket or quote, or before a closing mark. A narration without marks is
 * said exactly as written. This module is the one owner of the grammar: whatever reads a scene's words reads said()
 * (clock.mjs · spokenText, sceneText), so no voice, caption or clock ever sees a mark, and a phrase that is a mark is
 * read with momentOf. The cast's {{role}} (cast.mjs) is not a mark: it is left where it stands. Pure.
 */

/** A moment's or a speaker's name: a letter, then letters, digits, - or _. */
const NAME = /^\p{L}[\p{L}\p{M}\p{Nd}_-]*$/u;
/** What a voice says: letters, their marks and digits (footprint-narration · normSpeech keeps these). */
const WORD = /[\p{L}\p{M}\p{N}]/u, ENDS_WORD = /[\p{L}\p{M}\p{N}]$/u, STARTS_WORD = /^[\p{L}\p{M}\p{N}]/u;
/** The cast's {{role}} (cast.mjs · TOKEN): not a mark — withCast puts the role's name there. */
const ROLE = /\{\{[^}]*\}\}/y, ROLES = /\{\{[^}]*\}\}/g;
/**
 * A closing mark hangs on the word before it, an opening one on the word after: nothing stands between. A straight
 * quote closes when no word follows it, and opens after white space, an opening mark or the text's start.
 */
const CLOSES = /^(?:[.,;:!?…)\]»’”]|['"](?![\p{L}\p{M}\p{N}]))/u, OPENS = /(?:^|[\s([«‘“¿¡])['"]$|[([«‘“¿¡]$/u;
/** Each opening quote, and the one that closes its line. */
const QUOTES = Object.freeze({"'": "'", '"': '"', '‘': '’', '“': '”'});

/** Where a mark stands, for a refusal: the text around it, as written. */
const around = (text, from, to) => `"${from > 24 ? '…' : ''}${text.slice(Math.max(0, from - 24), to + 24)}${to + 24 < text.length ? '…' : ''}"`;

/** A mark as written ({name} or {@who}): {kind: 'moment' | 'speaker', name, from, to}; braces that hold anything else refuse. */
function markAt(text, from, to, where) {
  const body = text.slice(from + 1, to - 1), speaker = body.startsWith('@'), name = speaker ? body.slice(1) : body;
  if (NAME.test(name)) return {kind: speaker ? 'speaker' : 'moment', name, from, to};
  throw new Error(`${where}: ${text.slice(from, to)} is not a mark, at ${around(text, from, to)}: a moment is {name} and a speaker {@who}, each name a letter, then letters, digits, - or _ (braces hold nothing else: take them out of the words)`);
}

/** The marks in a text, in order (the cast's {{role}} passed over); a brace that opens or closes no mark refuses. */
function marksIn(text, where) {
  const marks = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '}') throw new Error(`${where}: a "}" closes no mark, at ${around(text, i, i + 1)}: open the mark ({hop}), or take the brace out`);
    if (text[i] !== '{') continue;
    ROLE.lastIndex = i;
    if (ROLE.test(text)) { i = ROLE.lastIndex - 1; continue; }
    const end = text.indexOf('}', i + 1), inner = text.indexOf('{', i + 1);
    if (end < 0 || (inner >= 0 && inner < end)) throw new Error(`${where}: a "{" opens a mark that never closes, at ${around(text, i, i + 1)}: close it ({hop}), or take the brace out`);
    marks.push(markAt(text, i, end + 1, where));
    i = end;
  }
  return marks;
}

/** A moment's name is used once in its scene: a second use refuses, naming both places. */
function checkNames(text, marks, where) {
  const seen = new Map();
  for (const m of marks.filter(x => x.kind === 'moment')) {
    const first = seen.get(m.name);
    if (first) throw new Error(`${where}: the moment {${m.name}} is written twice, at ${around(text, first.from, first.to)} and at ${around(text, m.from, m.to)}: a moment's name is used once in its scene — rename one`);
    seen.set(m.name, m);
  }
}

/**
 * What stands where a group of marks stood: nothing at the text's start or end, after an opening mark or before a
 * closing one; else one run of the white space around it (a line break when either side has one).
 */
function joint(before, spaceBefore, spaceAfter, after) {
  if (!before || !after) return '';
  const space = [spaceBefore, spaceAfter].find(s => /[\n\r]/.test(s)) ?? (spaceBefore || spaceAfter);
  return space && !CLOSES.test(after) && !OPENS.test(before) ? space : '';
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
    const lead = k ? /^\s*/.exec(raw)[0] : '', trail = k < groups.length ? /\s*$/.exec(raw.slice(lead.length))[0] : '';
    pieces.push({from: from + lead.length, core: raw.slice(lead.length, raw.length - trail.length), lead, trail});
  }
  let said = pieces[0].core;
  const cores = [{from: pieces[0].from, at: 0, length: said.length}];
  groups.forEach((group, k) => {
    const before = pieces[k], after = pieces[k + 1], marked = text.slice(group[0].from, group.at(-1).to);
    if (!before.trail && !after.lead && ENDS_WORD.test(said) && STARTS_WORD.test(after.core)) throw new Error(`${where}: ${marked} stands inside a word, at ${around(text, group[0].from, group.at(-1).to)}: a mark goes between words — put a space before or after it`);
    said += joint(said, before.trail, after.lead, after.core);
    for (const m of group) m.place = said.length;
    cores.push({from: after.from, at: said.length, length: after.core.length});
    said += after.core;
  });
  const kept = k => { const c = cores.find(x => k >= x.from && k < x.from + x.length); return c ? c.at + k - c.from : null; };
  return {said, marks, kept};
}

/** Where the next spoken word starts in what is said, from `place` (its length when no word follows). */
const nextWord = (said, place) => { const k = said.slice(place).search(WORD); return k < 0 ? said.length : place + k; };

/**
 * The quoted line a speaker tag gives its speaker: its opening quote right after the tag (only white space between)
 * and its closing quote, the first after it that is no apostrophe inside a word (can't) — {open, close}, the quotes'
 * offsets in the narration as written. Another speaker's tag inside the line refuses.
 */
function lineAfter(text, tag, marks, where) {
  const open = tag.to + /^\s*/.exec(text.slice(tag.to))[0].length, quote = text[open], written = text.slice(tag.from, tag.to);
  if (quote === undefined || !Object.hasOwn(QUOTES, quote)) throw new Error(`${where}: ${written} stands right before the quoted line it gives a speaker, only spaces between, at ${around(text, tag.from, tag.to)}: write the line in quotes just after it, ${written}'What are you two up to?' (a moment goes before the tag, or inside the quotes)`);
  for (let close = open + 1; close < text.length; close++) {
    if (text[close] !== QUOTES[quote] || (ENDS_WORD.test(text.slice(Math.max(0, close - 2), close)) && STARTS_WORD.test(text.slice(close + 1, close + 3)))) continue;
    const other = marks.find(m => m.kind === 'speaker' && m.from > open && m.from < close);
    if (other) throw new Error(`${where}: ${text.slice(other.from, other.to)} stands inside ${written}'s line, at ${around(text, other.from, other.to)}: end the line with ${QUOTES[quote]} before the next speaker`);
    return {open, close};
  }
  throw new Error(`${where}: ${written}'s line opens with ${quote} and never closes, at ${around(text, tag.from, open + 1)}: end it with ${QUOTES[quote]}`);
}

/** A narration's script, every mark checked: {said, lines, moments}. `where` names whose narration it is in a refusal. */
function script(narration, where) {
  if (typeof narration !== 'string') throw new TypeError(`${where}: narration must be the words said, as one string`);
  const {said, marks, kept} = read(narration, where);
  const lines = marks.filter(m => m.kind === 'speaker').map(tag => {
    const {open, close} = lineAfter(narration, tag, marks, where), at = kept(open) + 1;
    return {by: tag.name, say: said.slice(at, kept(close)), at};
  });
  return {said, lines, moments: marks.filter(m => m.kind === 'moment').map(m => ({name: m.name, at: nextWord(said, m.place)}))};
}

const whose = options => options?.name ?? 'the narration';

/** What is said: the narration without its marks, the white space they leave tidied — what is voiced, shown and captioned. `name` names the text in a refusal. */
export const said = (narration, options) => script(narration, whose(options)).said;
/** The narration's moments ({name}), in order: [{name, at}] — `at` where in said() the next spoken word starts (said()'s length when none follows). */
export const marksOf = (narration, options) => script(narration, whose(options)).moments;
/** The narration's quoted lines with a speaker tag ({@who}'…'), in order: [{by, say, at}] — `say` the line inside its quotes, its own marks out; `at` where in said() it starts. */
export const linesOf = (narration, options) => script(narration, whose(options)).lines;

/** A silent scene's directions take no marks (a beat names a direction by its words): one refuses, naming it. */
function noMarks(directions, where) {
  directions.forEach((direction, k) => {
    const text = Array.isArray(direction) && typeof direction[0] === 'string' ? direction[0] : '';
    const mark = /\{[^{}]*\}/.exec(text.replace(ROLES, ''));
    if (mark) throw new Error(`${where}: silent[${k}] has a mark, ${mark[0]}, and a silent scene takes none (a beat names a direction by its words): take it out`);
  });
}

/**
 * A storyboard scene's script, every mark checked (a refusal names the scene: `storyboard scene <id or index>`):
 * {id, said, lines, moments}. A silent scene says nothing — said null, no lines, no moments — and its directions take
 * no marks.
 */
export function scriptOf(scene, i) {
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
