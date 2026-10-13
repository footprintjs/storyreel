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
 * cards, the push-in caption), the emphasis words, and the captions' shown words (number slots in digits). The numbers
 * in them are found the way the voice tools find digits (footprint-narration · unsaidDigits, over the text as
 * written), less a digit run right after a letter — part of a name (H2O, MP4, v2), not a number.
 */
import {spokenMap, unsaidDigits, normSpeech} from 'footprint-narration';

const FACT_KEYS = ['value', 'text', 'source'];
const isLetter = ch => /\p{L}/u.test(ch ?? '');

/**
 * The numbers a text shows, in order ("One frame takes 16.67 ms at 60 Hz." → ["16.67", "60"]): footprint-narration's
 * digit runs (unsaidDigits over the text as written), less a run right after a letter, which is part of a name (H2O,
 * MP4, v2). A unit written onto a number stays a number ("60Hz", "5km", "4K").
 */
export const numbersIn = text => numberRuns(text).map(n => n.run);
/** The same numbers with where each stands in the text: [{run, at}]. */
function numberRuns(text) {
  const s = String(text ?? ''), out = []; let from = 0;
  for (const run of unsaidDigits(spokenMap(s))) {
    const at = s.indexOf(run, from); if (at < 0) continue;
    from = at + run.length;
    if (!isLetter(s[at - 1])) out.push({run, at});
  }
  return out;
}

/**
 * The value a number stands for: "1,000" → 1000, "16.67" and "16.670" → 16.67; a run that is not one number (a time
 * "3:15", a version "1.2.3", a comma decimal "4,5") stays as it is written.
 */
export function numberValue(run) {
  const s = String(run);
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return Number(s.replaceAll(',', ''));
  return s;
}

/**
 * A facts list, checked: [{value, text?, source}] — `value` the number as the screen shows it, without a sign (16.67, 1000, or "3:15"),
 * `text` (optional) the words it is shown with, which must stand around it in the line that shows it (so 60 Hz is not
 * 60 sheep, and 6 Hz is not the 6 in "6 apples and 16 Hz"), and
 * `source` where it comes from (a URL, a document, a record pointer). Anything else refuses, naming the fix.
 */
export function readFacts(list, where = 'facts') {
  if (!Array.isArray(list)) throw new Error(`${where} must be a list of facts, [{"value": 16.67, "text": "16.67 ms", "source": "https://…"}]`);
  return list.map((f, i) => {
    const name = `${where}[${i}]`;
    if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error(`${name} must be {value, text?, source}`);
    for (const key of Object.keys(f)) if (!FACT_KEYS.includes(key)) throw new Error(`${name} has ${key}; a fact takes value, text and source`);
    const one = typeof f.value === 'string' && numbersIn(f.value).length === 1 && numbersIn(f.value)[0] === f.value;
    if (!(Number.isFinite(f.value) || one)) throw new Error(`${name}: value is the number as the screen shows it (16.67, 1000, or "3:15"), not ${JSON.stringify(f.value)}${typeof f.value === 'string' ? ': put the words around it in text' : ''}`);
    if (f.value < 0) throw new Error(`${name}: value is the number without its sign, as the numbers on screen are read (−5 °C shows 5): give ${-f.value}, and put the sign in text ("−5 °C")`);
    if (f.text !== undefined && !(typeof f.text === 'string' && normSpeech(f.text))) throw new Error(`${name}: text is the words the number is shown with ("16.67 ms"), or left out`);
    if (typeof f.source !== 'string' || !f.source.trim()) throw new Error(`${name}: source says where ${JSON.stringify(f.value)} comes from: a URL, a document or a record pointer`);
    return Object.freeze({value: f.value, ...(f.text !== undefined ? {text: f.text} : {}), source: f.source.trim()});
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
 * The numbers shown, each with where it comes from. shown: [{text, line?, offset?, at, scene, path}] — every text the
 * film shows, when it is first whole on screen, the index of the scene that shows it, the recipe entry (or `captions`)
 * that shows it, and `line`, the text a fact's words are looked for in when it is wider than `text` (a caption word's
 * whole scene), `text` standing at `offset` in it;
 * facts: a checked list (readFacts) or null; examples: exampleScenes(storyboard); scenes: the scenes' ids. Returns one
 * claim per number per entry and scene (said again later, it is the same claim): [{number, line, at, scene, path,
 * example, source}] in time order — `scene` the scene's id, `example` true in an example scene, `source` the backing
 * fact's, or null.
 */
export function findClaims(shown, {facts = null, examples = [], scenes = []} = {}) {
  const out = [], seen = new Set();
  for (const s of [...shown].sort((a, b) => a.at - b.at)) {
    const line = s.line ?? s.text;
    for (const {run: number, at} of numberRuns(s.text)) {
      const key = `${number}\u0000${s.path}\u0000${s.scene}`; if (seen.has(key)) continue; seen.add(key);
      const fact = (facts ?? []).find(f => backs(f, {run: number, at: (s.offset ?? 0) + at}, line));
      out.push({number, line, at: +s.at.toFixed(3), scene: scenes[s.scene] ?? null, path: s.path, example: Boolean(examples[s.scene]), source: fact?.source ?? null});
    }
  }
  return out.sort((a, b) => a.at - b.at || a.path.localeCompare(b.path));
}

/** What the claims add up to, for the verdict: how many numbers, how many in example scenes, sourced, outside example scenes, and unsourced. */
export function claimsCount(claims) {
  const numbers = claims?.numbers ?? [], open = numbers.filter(c => !c.example);
  return {numbers: numbers.length, examples: numbers.length - open.length, sourced: open.filter(c => c.source).length, open: open.length,
    unsourced: claims?.facts === null || claims?.facts === undefined ? 0 : open.filter(c => !c.source).length, factsGiven: Number.isInteger(claims?.facts)};
}

/** The numbers with no source, outside example scenes (none without facts: then the check cannot run). */
export const unsourcedClaims = claims => (Number.isInteger(claims?.facts) ? (claims.numbers ?? []).filter(c => !c.example && !c.source) : []);

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
