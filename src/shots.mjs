/**
 * The plan of a film's shots — the story and each stage: what each one is FOR (its intent), what is true
 * when it starts and when it ends (its continuity), and whether it asks the viewer to take in too much,
 * too fast (watching). Borrowed from how a film crew plans a shot: one shot, one clear beat, and every
 * shot picks up where the one before it left off.
 *
 *   {"type": "world", "scene": "race", "intent": "Show the app refusing an offer the person made stale.",
 *    "continuity": {"start": {"order": "none", "size": "M"}, "end": {"order": "none", "size": "L"}},
 *    "world": {…}}
 *
 * The intent and the facts are the author's words: the film lists them, checks that one shot's start
 * agrees with what the shots before it left, and never pretends to see the pictures themselves.
 */

/** The longest intent, in characters: a shot's purpose fits in one short sentence. */
export const INTENT_MAX = 140;

/**
 * Too much, too fast: moments (phrases the recipe names) closer together than `together` seconds count
 * as one; more than `burst.most` moments inside `burst.seconds` is a burst — too fast to take in.
 * Reported by default; `watching: "refuse"` refuses. How MANY moments a shot carries is information
 * (film.shots[i].moments), never a verdict: a list revealed one item per spoken word is many moments and
 * one beat. Whether a shot is one beat is what its one-sentence intent says.
 */
export const WATCHING = Object.freeze({together: .25, burst: Object.freeze({most: 4, seconds: 2})});

/** A shot's moments, merged: times closer than `together` seconds to the last kept one are the same moment. */
export function distinctMoments(times, rule = WATCHING) {
  const kept = [];
  for (const t of [...times].sort((a, b) => a - b)) if (!kept.length || t - kept.at(-1) >= rule.together) kept.push(t);
  return kept;
}

/** A sentence end followed by a new sentence (a capital letter or a digit). */
const SECOND_SENTENCE = /[.!?]["'’”)\]]*\s+[\p{Lu}\p{N}“"‘(]/u;
/** Dots that do not end a sentence: common abbreviations and initials ("Mr. Robot", "e.g. Here", "U.S. Army", "3 p.m. Monday"). */
const NOT_AN_END = /\b(?:mrs?|ms|dr|st|no|vs?|etc|inc|ltd|jr|sr|fig|vol|approx|e\.g|i\.e|a\.m|p\.m)\.|\b\p{L}\./giu;

/**
 * A shot's intent: what the shot is for, one sentence of at most INTENT_MAX characters, or null when the
 * shot says none. Anything else refuses, naming the shot.
 */
export function readIntent(value, where) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${where}: intent says what the shot is for, in words (e.g. "Show the app refusing a stale offer."), not ${JSON.stringify(value)}`);
  const text = value.trim();
  if (text.length > INTENT_MAX) throw new Error(`${where}: intent is ${text.length} characters; a shot's purpose fits in ${INTENT_MAX} (one short sentence)`);
  const masked = text.replace(NOT_AN_END, m => m.replaceAll('.', '·')), second = masked.match(SECOND_SENTENCE);
  if (second) throw new Error(`${where}: intent reads as two sentences at "…${text.slice(Math.max(0, second.index - 12), second.index + second[0].length + 12)}…"; a shot carries one beat (one sentence) — give the second idea a shot of its own, or, if it is one sentence, spell out the abbreviation`);
  return text;
}

/**
 * A shot's continuity: {start?, end?}, each a flat list of facts (name → a string, number or true/false)
 * that are true when the shot starts or when it ends; null when the shot states none.
 */
export function readContinuity(value, where) {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${where}: continuity is {"start": {…facts}, "end": {…facts}}`);
  for (const key of Object.keys(value)) if (key !== 'start' && key !== 'end') throw new Error(`${where}: continuity has ${key}; it takes start and end (the facts true when the shot starts, and when it ends)`);
  if (value.start === undefined && value.end === undefined) throw new Error(`${where}: continuity needs start or end (or both)`);
  const facts = side => {
    const given = value[side];
    if (given === undefined) return {};
    if (!given || typeof given !== 'object' || Array.isArray(given)) throw new Error(`${where}: continuity.${side} is a list of facts, e.g. {"order": "placed", "size": "M"}`);
    for (const [name, fact] of Object.entries(given)) {
      if (!name.trim()) throw new Error(`${where}: continuity.${side} has a fact with no name`);
      if (!['string', 'number', 'boolean'].includes(typeof fact) || (typeof fact === 'number' && !Number.isFinite(fact))) throw new Error(`${where}: continuity.${side}.${name} must be a word, a number or true/false, not ${JSON.stringify(fact)}`);
    }
    return {...given};
  };
  return {start: facts('start'), end: facts('end')};
}

/**
 * Walk the shots in film order, carrying every fact forward: a fact a shot STARTS with must agree with
 * what the shots before it left (or not be known yet); what a shot ENDS with is carried on. A shot may
 * change anything between its own start and end — that is what it shows. Refuses at the first shot that
 * contradicts the story so far, naming the shot that last stated the fact and a fix that works: the
 * shot just before the contradicting one may end with the new fact. Returns the facts at the film's end.
 * @param plan [{where, continuity}] in film order
 */
export function checkContinuity(plan) {
  const carried = new Map();
  plan.forEach(({where, continuity}, i) => {
    if (!continuity) return;
    for (const [name, fact] of Object.entries(continuity.start)) {
      const known = carried.get(name);
      if (known && known.fact !== fact) {
        const before = plan[i - 1].where;
        throw new Error(`Continuity: ${where} starts with ${name} = ${JSON.stringify(fact)}, but ${known.said} ${name} = ${JSON.stringify(known.fact)}. Show the change (end ${before} with ${name} = ${JSON.stringify(fact)}), or start ${where} where the story is (${name} = ${JSON.stringify(known.fact)})`);
      }
      carried.set(name, {fact, said: `${where} starts with`});
    }
    for (const [name, fact] of Object.entries(continuity.end)) carried.set(name, {fact, said: `${where} left`});
  });
  return Object.fromEntries([...carried].map(([name, {fact}]) => [name, fact]));
}

/**
 * The shots that ask too much, too fast. Each shot: {path, where, moments: [seconds]} (the phrases named
 * while it is on screen). Returns [{kind: 'burst', path, where, at, moments, seconds}], in time order.
 */
export function tooMuchTooFast(shots, rule = WATCHING) {
  const found = [];
  for (const shot of shots) {
    const kept = distinctMoments(shot.moments, rule);
    for (let i = 0; i < kept.length;) {
      let j = i; while (j + 1 < kept.length && kept[j + 1] - kept[i] <= rule.burst.seconds) j++;
      if (j - i + 1 > rule.burst.most) { found.push({kind: 'burst', path: shot.path, where: shot.where, at: +kept[i].toFixed(3), moments: j - i + 1, seconds: +(kept[j] - kept[i]).toFixed(2)}); i = j + 1; }
      else i++;
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

/** Check a recipe's `watching` setting: 'report' (the default: the film lists what it found) or 'refuse'. */
export function watchingMode(value) {
  if (value === undefined) return 'report';
  if (value !== 'report' && value !== 'refuse') throw new Error('watching must be "report" or "refuse"');
  return value;
}

/** One finding in words, for a refusal or a list. */
export const watchingText = w => `${w.where} has ${w.moments} moments in ${w.seconds} s from ${w.at.toFixed(2)} s (too fast to take in)`;

/**
 * Reads: what the viewer must take in during a shot — each one a sentence about understanding (`what`),
 * when it starts (`at`: a phrase), the least time it needs to land (`min` seconds, 2 by default) and,
 * optionally, the named thing it is about (`region`: a name the kit gives in regionsAt). One read at a
 * time: two that overlap ask the viewer to take in two things at once. Borrowed from animators who time a
 * shot by what the viewer must understand, not by what moves.
 *
 *   "reads": [{"what": "the loop changes the picture each turn", "at": ["change", "It changes the picture"], "min": 2.5, "region": "ring"}]
 */
export const READS = Object.freeze({min: 2, least: .5, most: 15});
export function readReads(value, where) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.length) throw new Error(`${where}: reads is a list of {what, at, min?, region?}`);
  return value.map((r, k) => {
    const name = `${where}: reads[${k}]`;
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error(`${name} must be {what, at, min?, region?}`);
    for (const key of Object.keys(r)) if (!['what', 'at', 'min', 'region'].includes(key)) throw new Error(`${name} has ${key}; a read takes what, at, min and region`);
    if (typeof r.what !== 'string' || !r.what.trim()) throw new Error(`${name}: what says what the viewer must take in, in words`);
    if (!Array.isArray(r.at) && !(r.at && typeof r.at === 'object')) throw new Error(`${name}: at is the phrase the read starts on, e.g. ["scene", "a phrase"]`);
    const min = r.min ?? READS.min;
    if (!(typeof min === 'number' && min >= READS.least && min <= READS.most)) throw new Error(`${name}: min is the least time it needs, ${READS.least}–${READS.most} s`);
    if (r.region !== undefined && !(typeof r.region === 'string' && r.region.trim())) throw new Error(`${name}: region names a thing the kit draws (regionsAt → name)`);
    return {what: r.what.trim(), at: r.at, min, ...(r.region ? {region: r.region} : {})};
  });
}

/**
 * What is wrong with a shot's reads, timed (t = when each starts): two at once, or one the shot ends
 * before it lands. Returns the reads with a `problem` where there is one.
 */
export function checkReads(reads, {to, where}) {
  const sorted = [...reads].sort((a, b) => a.t - b.t);
  return sorted.map((r, i) => {
    const next = sorted[i + 1];
    if (next && next.t < r.t + r.min - 1e-6) return {...r, problem: `${where}: "${r.what}" needs ${r.min} s from ${r.t.toFixed(2)} s, and "${next.what}" starts at ${next.t.toFixed(2)} s — two reads at once; give the first its time (a pacing hold) or start the second later`};
    if (r.t + r.min > to + 1e-6) return {...r, problem: `${where}: "${r.what}" needs ${r.min} s from ${r.t.toFixed(2)} s, and the shot ends at ${to.toFixed(2)} s — lengthen the scene's tail (pacing.tails) or start the read earlier`};
    return r;
  });
}
