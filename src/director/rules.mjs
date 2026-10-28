/**
 * The director's rule table: which lines move the camera to the speaker's face, and which change the speaker's face —
 * data. The table is the director's strategy. The library's own is neutral: it reads only how a line ends, so it works
 * in any language — a question or an exclamation from a speaker frames their face close, and whoever answers a pause
 * and guess thinks while it runs. Rules with words are the film's own data, in its language, passed in (a recipe's
 * `director.rules`, an application's `compileFilm({…, strategies: {director: {en: table, ta: table}}})`); read before
 * the neutral ones, and the first rule that matches a line wins, so a rule given as data adds a case or overrides one,
 * and a rule whose shot or mood is null takes its lines out of the later rules' hands.
 *
 *   {"lang": "en",
 *    "shots": [{"name": "found", "when": ["I know!", "Got it…!"], "shot": "close", "key": true},
 *              {"name": "aside", "when": ["By the way…"], "shot": null}],
 *    "moods": [{"name": "surprise", "when": ["Oh!", "Oh…!"], "mood": "surprised"}],
 *    "aliases": {"sacks": "row", "clay": {"on": "tablet", "size": "close"}},
 *    "guess": "thinking"}
 *
 * A shot rule with `key: true` marks a key moment: its line is framed whatever the close-up budget says (framing.mjs).
 * `aliases` let the narration name a thing however it likes: a word (as the rules read it) → the region name the
 * picture gives it, or {on, size}; the recipe's aliases win over the application's, and there are none built in.
 *
 * A rule names its lines by PATTERNS: the line as said, with … for any words.
 *   "Oh…!"        starts with "Oh", exclaimed      "…of course…"   says "of course" anywhere
 *   "Why…?"       starts with "Why" and asks       "Yes!"          exactly "Yes", exclaimed
 * Case, commas and quotes never count, and ’ reads as '. A pattern that ends with ? ! or . asks for a line that ends
 * so; one without an end mark takes any end. Words are matched whole ("How" never matches "However"); a language
 * written without spaces between words is matched by its end marks only. A mood is a name, or a list of names in order
 * of preference: the first one the world's kit can act is used (its direction's `moods`). Pure.
 */

/** The framings a shot rule may ask for (notes.mjs · FRAMINGS: how much of the frame the face fills). */
export const RULE_SHOTS = Object.freeze(['medium', 'close', 'insert']);
const TABLE_KEYS = ['lang', 'shots', 'moods', 'guess', 'aliases'], SHOT_KEYS = ['name', 'when', 'shot', 'key'], MOOD_KEYS = ['name', 'when', 'mood'];
/** Any words: the pattern's wildcard. */
const ANY = Symbol('any words');
/** A word as the rules read it: letters, marks and digits, with an apostrophe inside ("can't", "they're"). */
const WORD = /[\p{L}\p{M}\p{N}]+(?:'[\p{L}\p{M}\p{N}]+)*/gu;
/** How a line ends: its last . ! ? or …, past any closing quote or bracket. */
const END = /([.!?…])[\s"'”’»)\]]*$/u;

/** A text as the rules read it: one form for every spelling of a character (full width, ’ for '), lower case. */
const plain = text => String(text).normalize('NFKC').replace(/[’‘ʼ]/gu, "'").replace(/。/gu, '.').toLowerCase();
/** The words of a text, as the rules compare them. */
export const wordsOf = text => plain(text).match(WORD) ?? [];
/** How a line ends: '.', '!', '?', '…', or null (a comma, or no mark at all). */
export const endOf = text => plain(text).match(END)?.[1] ?? null;

/** A pattern, read: {text, parts: [word | ANY], end} — or a refusal that says how a pattern is written. */
function readPattern(text, where) {
  if (typeof text !== 'string' || !text.trim()) throw new Error(`${where} is a line as said, with … for any words ("Oh…!", "Why…?", "Yes!"), not ${JSON.stringify(text)}`);
  let body = plain(text).trim().replace(/\.\.\./gu, '…');
  const end = /[.!?]$/u.test(body) ? body.at(-1) : null;
  if (end) body = body.slice(0, -1);
  const parts = [];
  body.split('…').forEach((piece, k) => { if (k && parts.at(-1) !== ANY) parts.push(ANY); parts.push(...(piece.match(WORD) ?? [])); });
  if (!parts.some(p => p !== ANY) && !end) throw new Error(`${where}: ${JSON.stringify(text)} names no words and no end mark, so it would match every line; write its words ("Oh…!") or the end it asks for ("…?")`);
  return Object.freeze({text, parts: Object.freeze(parts), end});
}

/** Whether the words fit the parts, ANY standing for any run of words (none too): a wildcard match over words. */
function fits(parts, words) {
  let p = 0, w = 0, star = -1, mark = 0;
  while (w < words.length) {
    if (p < parts.length && parts[p] !== ANY && parts[p] === words[w]) { p++; w++; }
    else if (p < parts.length && parts[p] === ANY) { star = p++; mark = w; }
    else if (star >= 0) { p = star + 1; w = ++mark; }
    else return false;
  }
  while (p < parts.length && parts[p] === ANY) p++;
  return p === parts.length;
}

/** Whether a line (its words and its end) is one a pattern names. */
const matches = (pattern, words, end) => (!pattern.end || pattern.end === end) && fits(pattern.parts, words);

/** A rule's when: a pattern or a list of them, each read. */
function readWhen(when, where) {
  const list = typeof when === 'string' ? [when] : when;
  if (!Array.isArray(list) || !list.length) throw new Error(`${where}.when is a pattern, or a list of them ("Oh…!", "Why…?")`);
  return Object.freeze(list.map((text, k) => readPattern(text, `${where}.when[${k}]`)));
}

/** A mood as a rule gives it: a name, a list of names in order of preference, or null (no mood). */
function readMood(mood, where) {
  if (mood === null) return null;
  const list = typeof mood === 'string' ? [mood] : mood;
  if (!Array.isArray(list) || !list.length || !list.every(m => typeof m === 'string' && m.trim())) throw new Error(`${where} is a mood ("surprised"), a list of them in order of preference (["proud", "happy"]), or null, not ${JSON.stringify(mood)}`);
  return Object.freeze([...list]);
}

/** One rule, checked: {name, when, shot} or {name, when, mood}. */
function readRule(rule, kind, where) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error(`${where} is {"name", "when", "${kind}"}`);
  const keys = kind === 'shot' ? SHOT_KEYS : MOOD_KEYS;
  for (const key of Object.keys(rule)) if (!keys.includes(key)) throw new Error(`${where} has unsupported key ${key} (a ${kind} rule takes ${keys.join(', ')})`);
  if (typeof rule.name !== 'string' || !rule.name.trim()) throw new Error(`${where}.name names the rule, so the record says which one fired (e.g. "surprise")`);
  if (!Object.hasOwn(rule, kind)) throw new Error(`${where} "${rule.name}" gives no ${kind}: give one${kind === 'shot' ? ` (${RULE_SHOTS.join(', ')})` : ' ("surprised")'}, or null to take its lines out of the later rules' hands`);
  const when = readWhen(rule.when, where);
  if (kind === 'shot') {
    if (rule.shot !== null && !RULE_SHOTS.includes(rule.shot)) throw new Error(`${where}.shot is ${RULE_SHOTS.join(', ')} (how much of the frame the face fills), or null, not ${JSON.stringify(rule.shot)}`);
    if (rule.key !== undefined && typeof rule.key !== 'boolean') throw new Error(`${where}.key is true (a key moment: framed whatever the close-up budget says) or false, not ${JSON.stringify(rule.key)}`);
    return Object.freeze({name: rule.name, when, shot: rule.shot, key: rule.key === true});
  }
  return Object.freeze({name: rule.name, when, mood: readMood(rule.mood, `${where}.mood`)});
}

/** A table's aliases, checked: word → {on, size} (size null: the thing's own default). */
function readAliases(aliases, where) {
  if (aliases === undefined) return {};
  if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) throw new Error(`${where} is {word: "region name"} or {word: {"on": "region name", "size"?}} (e.g. {"sacks": "row"})`);
  const out = {};
  for (const [word, value] of Object.entries(aliases)) {
    const words = wordsOf(word), target = typeof value === 'string' ? {on: value} : value;
    if (words.length !== 1) throw new Error(`${where}: "${word}" is not one word; an alias names one word the narration says ("sacks")`);
    if (!target || typeof target !== 'object' || Array.isArray(target) || typeof target.on !== 'string' || !target.on.trim() || Object.keys(target).some(k => k !== 'on' && k !== 'size'))
      throw new Error(`${where}.${word} is the region name the picture gives it ("row"), or {"on": "row", "size"?}, not ${JSON.stringify(value)}`);
    if (target.size !== undefined && !RULE_SHOTS.includes(target.size)) throw new Error(`${where}.${word}.size is ${RULE_SHOTS.join(', ')}, not ${JSON.stringify(target.size)}`);
    out[words[0]] = Object.freeze({on: target.on, size: target.size ?? null});
  }
  return out;
}

/** A table, checked: {lang, shots, moods, guess, aliases} (`guess` undefined when it gives none). */
function readTable(table, where) {
  if (!table || typeof table !== 'object' || Array.isArray(table)) throw new Error(`${where} is a rule table: {"lang"?, "shots"?: […], "moods"?: […], "guess"?}`);
  for (const key of Object.keys(table)) if (!TABLE_KEYS.includes(key)) throw new Error(`${where} has unsupported key ${key} (a rule table takes ${TABLE_KEYS.join(', ')})`);
  if (table.lang !== undefined && !(typeof table.lang === 'string' && table.lang.trim())) throw new Error(`${where}.lang is the language its words are in ("en"), not ${JSON.stringify(table.lang)}`);
  const list = (key, kind) => {
    if (table[key] === undefined) return [];
    if (!Array.isArray(table[key])) throw new Error(`${where}.${key} is a list of rules`);
    return table[key].map((r, k) => readRule(r, kind, `${where}.${key}[${k}]`));
  };
  return {lang: table.lang ?? null, shots: list('shots', 'shot'), moods: list('moods', 'mood'), guess: table.guess === undefined ? undefined : readMood(table.guess, `${where}.guess`), aliases: readAliases(table.aliases, `${where}.aliases`)};
}

/**
 * The library's own rules, neutral and in no language: a question or an exclamation from a speaker frames their face
 * close; whoever answers a pause and guess thinks while it runs. No mood comes from words here: those rules are the
 * film's data.
 */
export const NEUTRAL_RULES = Object.freeze({
  shots: Object.freeze([
    Object.freeze({name: 'question', when: Object.freeze(['…?']), shot: 'close'}),
    Object.freeze({name: 'exclamation', when: Object.freeze(['…!']), shot: 'close'}),
  ]),
  moods: Object.freeze([]),
  guess: 'thinking',
});

/** A language as the tables are found by: its primary subtag, lower case ("en-IN" → "en"). */
const primary = lang => String(lang).toLowerCase().split(/[-_]/u)[0];

/**
 * The rule table a film is directed by, read in order (the first rule that matches a line wins): the recipe's own
 * `rules`, then the application's table for the language (`tables`: {lang: table}: the exact tag first, "en-IN", else
 * the primary subtag, "en"), then
 * the neutral rules. Returns {lang, source: [where each part came from], shots, moods, guess, aliases}, every pattern
 * read (aliases: the recipe's over the application's). A table in another language than the director's refuses.
 */
export function readRules({lang = null, rules = null, tables = null} = {}, where = 'director') {
  if (tables !== null && (typeof tables !== 'object' || Array.isArray(tables))) throw new Error(`${where}: the application's rule tables are {lang: table} (e.g. {"en": {"moods": […]}}), not ${JSON.stringify(tables)}`);
  const key = lang === null ? null : primary(lang), exact = lang === null ? null : String(lang).toLowerCase();
  const appKey = key === null || !tables ? undefined : Object.keys(tables).find(k => k.toLowerCase() === exact) ?? Object.keys(tables).find(k => primary(k) === key);
  const parts = [
    ...(rules === null ? [] : [[readTable(rules, `${where}.rules`), 'the recipe']]),
    ...(appKey === undefined ? [] : [[readTable(tables[appKey], `the application's "${appKey}" rule table`), `the application's "${appKey}" table`]]),
    [readTable(NEUTRAL_RULES, 'the neutral rules'), 'neutral'],
  ];
  for (const [table, from] of parts) if (table.lang && key !== null && primary(table.lang) !== key) throw new Error(`${where}: ${from === 'the recipe' ? `${where}.rules are` : `${from} is`} in "${table.lang}" and the director reads "${lang}": give rules in "${lang}", or "lang": "${table.lang}"`);
  const guess = parts.find(([table]) => table.guess !== undefined)?.[0].guess ?? null;
  const aliases = Object.freeze(Object.assign({}, ...parts.map(([t]) => t.aliases).reverse()));
  return Object.freeze({lang, source: Object.freeze(parts.map(([, from]) => from)), shots: Object.freeze(parts.flatMap(([t]) => t.shots)), moods: Object.freeze(parts.flatMap(([t]) => t.moods)), guess, aliases});
}

/** The first rule of a list a line matches, or null. A line is {words, end} (wordsOf, endOf). */
const firstMatch = (list, line) => list.find(rule => rule.when.some(p => matches(p, line.words, line.end))) ?? null;

/**
 * Which rules a line hits: {shot: rule | null, mood: rule | null} — the first shot rule and the first mood rule whose
 * patterns match it (a rule whose shot or mood is null still hits, so the line is out of the later rules' hands).
 * `line` is the line as said, or {words, end}; `table` a table read by readRules.
 */
export function matchLine(line, table) {
  const read = typeof line === 'string' ? {words: wordsOf(line), end: endOf(line)} : line;
  return {shot: firstMatch(table.shots, read), mood: firstMatch(table.moods, read)};
}
