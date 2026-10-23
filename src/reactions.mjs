/**
 * Listener reactions: while someone else speaks, a listener does not stand frozen. They look at the speaker
 * (clock.gaze), nod softly a moment after each sentence ends, lean in a little while a question is asked and wait
 * for the answer, and brighten (a small smile, a take) when the speaker exclaims. Every reaction comes from the
 * voice's own timings — the clock's turns and the punctuation its words carry ("Look!", "why?") — never placed by
 * hand, so re-voicing a line moves the nods with it.
 *
 * Each listener has a seed (by default, from their name) that sets how long they take to react to each sentence,
 * how big the reaction is, and which sentences they let pass without a nod: two listeners never nod in step.
 *
 * Pure functions of time, like every frame: `reactionAt(clock, t, who)` returns numbers a kit applies to the
 * listener it draws. What a nod or a brighten looks like is the kit's drawing.
 */

/**
 * The timing every reaction is acted with: seconds (delay, spread, nodFor, leanHold, leanBack, brightenFor), how big
 * (nod, lean, brighten: 0..1), and how often a listener nods (chance, 0..1).
 */
export const REACTING = Object.freeze({delay: .15, spread: .2, nod: .5, nodFor: .6, chance: .8, lean: .6, leanHold: .8, leanBack: .5, brighten: 1, brightenFor: 1.2});

const SIZES = ['nod', 'lean', 'brighten', 'chance'], SECONDS = ['delay', 'spread', 'nodFor', 'leanHold', 'leanBack', 'brightenFor'];
/** A word that ends a sentence: a full stop, a question or exclamation mark, an ellipsis, then any closing quote or bracket. */
const ENDS_SENTENCE = /[.!?…。！？]["'”’)\]]*$/u;
/** How far back up a nod comes past rest, as a share of its dip. */
const REBOUND = .25;

const clamp01 = n => Math.max(0, Math.min(1, n));
const smooth = x => { const u = clamp01(x); return u * u * (3 - 2 * u); };
/** Deterministic, different for each seed and k (the same hash the idle layer uses). */
const jitter = (seed, k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
/** A name's default seed: the same name, the same seed, on every machine. */
const seedOf = name => { let h = 2166136261; for (const c of name) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0; return h % 100003; };

/**
 * How `who` reacts at t to what the others say. clock: the film's clock (makeClock; it reads turns(), words(scene)
 * and, when it has one, gaze). Returns:
 *   nod       head pitch, -1..1: positive dips the chin, a little negative is the head coming back up past rest
 *   lean      0..1: leaning in toward a question, held while the answer is awaited
 *   brighten  0..1: a small smile or take when the speaker exclaims
 *   look      clock.gaze(t, who): {at, amount, also?} or null — where to turn the eyes
 *   cause     {nod, lean, brighten}: the sentence behind each one now ({scene, speaker, start, end, mark, text}), or
 *             null
 * A nod starts `delay` to `delay + spread` seconds after a sentence ends ('.' or none: the end of a turn), on `chance`
 * of the sentences, never over another nod; a question ('?') leans; an exclamation ('!') brightens. Nothing reacts
 * while `who` speaks. The narrator (a scene with no speaker) is nobody on screen: no one reacts to it. Options: the
 * timing (REACTING) and `seed` (a number; by default from `who`).
 */
export function reactionAt(clock, t, who, options = {}) {
  if (!clock || typeof clock.turns !== 'function' || typeof clock.words !== 'function') throw new Error('reactionAt: clock is the film\'s clock (makeClock): it reads turns() and words(scene)');
  if (!(typeof who === 'string' && who.trim())) throw new Error(`reactionAt: who is the listener's name (a character on screen), not ${JSON.stringify(who)}; the narrator is nobody on screen`);
  if (!Number.isFinite(t)) throw new Error('reactionAt: t is a time in seconds');
  const o = readOptions(options ?? {}, who), plan = planFor(clock, who, o);
  const nod = strongest(plan.nods, t, e => e.size * nodCurve((t - e.at) / o.nodFor), o.nodFor);
  const brighten = strongest(plan.brightens, t, e => e.size * brightCurve(t - e.at, o.brightenFor), o.brightenFor);
  const lean = strongest(plan.leans, t, e => e.size * leanCurve(t, e, o), Infinity);
  const look = typeof clock.gaze === 'function' ? clock.gaze(t, who) : null;
  return {nod: nod.value, lean: lean.value, brighten: brighten.value, look, cause: {nod: nod.cause, lean: lean.cause, brighten: brighten.cause}};
}

/** The biggest of the events under way at t (by size of value), with the sentence behind it. */
function strongest(events, t, valueOf, lasts) {
  let best = {value: 0, cause: null};
  for (const e of events) {
    if (e.at > t) break;   // (events are in time order)
    if (t - e.at > lasts) continue;
    const value = valueOf(e);
    if (Math.abs(value) > Math.abs(best.value)) best = {value, cause: e.sentence};
  }
  return best;
}

/** A nod over u = 0..1: the chin dips and comes back (sin², still at both ends), then up past rest by REBOUND and back. */
function nodCurve(u) {
  if (!(u > 0 && u < 1)) return 0;
  return u < .5 ? Math.sin(Math.PI * u / .5) ** 2 : -REBOUND * Math.sin(Math.PI * (u - .5) / .5) ** 2;
}

/** A brighten, `age` seconds in: up over its first eighth, held to two fifths, eased away by its end. */
function brightCurve(age, lasts) {
  if (!(age > 0 && age < lasts)) return 0;
  return age < lasts / 8 ? smooth(age / (lasts / 8)) : age < .4 * lasts ? 1 : 1 - smooth((age - .4 * lasts) / (.6 * lasts));
}

/** A lean: in over the question (at least 0.3 s), held until `until`, back over leanBack. */
function leanCurve(t, e, o) {
  const into = smooth((t - e.at) / Math.max(.3, e.sentence.end - e.at));
  return Math.min(into, 1 - smooth((t - e.until) / o.leanBack));
}

/** The options, checked: the timing (REACTING) and the seed. */
function readOptions(options, who) {
  const names = [...Object.keys(REACTING), 'seed'];
  for (const key of Object.keys(options)) if (!names.includes(key)) throw new Error(`reactionAt: unknown option ${key}; it takes ${names.join(', ')}`);
  const o = {...REACTING};
  for (const [k, v] of Object.entries(options)) if (v !== undefined && k !== 'seed') o[k] = v;
  for (const name of SECONDS) if (!(Number.isFinite(o[name]) && o[name] >= 0 && (o[name] > 0 || name === 'delay' || name === 'spread' || name === 'leanHold'))) throw new Error(`reactionAt: ${name} is seconds, ${['delay', 'spread', 'leanHold'].includes(name) ? '0 or more' : 'above 0'}`);
  for (const name of SIZES) if (!(o[name] >= 0 && o[name] <= 1)) throw new Error(`reactionAt: ${name} is ${name === 'chance' ? 'the share of sentences a listener nods at' : 'how big the reaction is'}: give a number 0..1 (e.g. 0.5), not ${JSON.stringify(o[name])}`);
  o.seed = options.seed ?? seedOf(who);
  if (!Number.isFinite(o.seed)) throw new Error('reactionAt: seed is a number (by default, one made from the listener\'s name)');
  return o;
}

// A plan is worked out once per clock, listener and options: the frames that follow read it.
const plans = new WeakMap();
function planFor(clock, who, o) {
  let byKey = plans.get(clock);
  if (!byKey) plans.set(clock, byKey = new Map());
  const key = JSON.stringify([who, o]);
  if (!byKey.has(key)) byKey.set(key, plan(clock, who, o));
  return byKey.get(key);
}

/**
 * Every reaction `who` makes, from the clock: [{at, size, sentence}] nods and brightens, and leans that hold `until`,
 * each list in time order. A reaction that would start while `who` speaks is left out.
 */
function plan(clock, who, o) {
  const own = clock.turns().filter(g => g.speaker === who), speaking = at => own.some(g => at >= g.start - .1 && at <= g.end);
  const nods = [], brightens = [], leans = [];
  let lastNod = -Infinity;
  sentencesOf(clock, who).forEach((s, k) => {
    const late = o.delay + o.spread * jitter(o.seed, 3 * k + 1), size = .75 + .25 * jitter(o.seed, 3 * k + 2);
    if (s.mark === '?') {
      const answer = own.find(g => g.start >= s.end - 1e-9), until = Math.min(s.end + o.leanHold, answer ? answer.start : Infinity);
      if (!speaking(s.start)) leans.push({at: s.start, until, size: o.lean * size, sentence: s});
    } else if (s.mark === '!') {
      const at = s.end + late / 2;
      if (!speaking(at)) brightens.push({at, size: o.brighten * size, sentence: s});
    } else {
      const at = s.end + late;
      if (jitter(o.seed, 3 * k + 3) < o.chance && at >= lastNod + o.nodFor && !speaking(at)) { nods.push({at, size: o.nod * size, sentence: s}); lastNod = at; }
    }
  });
  return {nods, brightens: brightens.sort((a, b) => a.at - b.at), leans};
}

/**
 * The sentences the others say, in order: each turn's words cut after every word that ends a sentence (its own
 * punctuation, as the voice's timings write it) and at the turn's end. mark: '?', '!', '.' — or null when the turn
 * ends without one.
 */
function sentencesOf(clock, who) {
  const out = [];
  for (const g of clock.turns()) {
    if (g.speaker === who) continue;
    const words = clock.words(g.scene).filter(w => w.start >= g.start - 1e-9 && w.end <= g.end + 1e-9);
    let first = 0;
    words.forEach((w, j) => {
      const ends = ENDS_SENTENCE.test(w.text);
      if (!ends && j < words.length - 1) return;
      const tail = ends ? w.text.match(/[.!?…。！？"'”’)\]]*$/u)[0] : '';
      const mark = /[?？]/u.test(tail) ? '?' : /[!！]/u.test(tail) ? '!' : ends ? '.' : null;
      out.push(Object.freeze({scene: g.scene, speaker: g.speaker, start: words[first].start, end: w.end, mark, text: words.slice(first, j + 1).map(x => x.text).join(' ')}));
      first = j + 1;
    });
  }
  return out;
}
