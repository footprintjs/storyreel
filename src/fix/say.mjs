// say — the fix for a finding about time, not place: a beat keyed on a phrase said there, a pacing hold after a phrase,
// a drawn part kept together. Each names what to write in the recipe, as the recipe writes it.
//
// WHY: "nothing new for 6 s" leaves the author to find a phrase in that stretch and to know how a beat is keyed. The
// spoken words are on the film's clock (film.timings, places.mjs · said), so the fix can quote the phrase and the entry:
// `key a beat on ["farm", "she stops by"]`, `add {"scene": "a", "after": "went out", "seconds": 0.8} to pacing.holds`.
// A phrase said twice in its scene keys the first place it is said, so a quoted phrase is lengthened until its scene says
// it once (the clock's own matching: clock.places, as the anchors check reads it), or the beat names which (`nth`).
import {clockTenths} from '../clock.mjs';
import {cutText, unmarked} from './text.mjs';

/** A spoken word as the recipe quotes it: its letters, digits and inner marks ("down," → "down"). */
const plain = text => String(text).replace(/[^\p{L}\p{N}'’-]+/gu, ' ').trim();
/** The most words a quoted phrase grows to while it is still said more than once. */
const PHRASE_MOST = 8;
/** A recipe ref quoted in a fix: JSON, cut, with the reply's field mark escaped. */
const said = ref => unmarked(cutText(JSON.stringify(ref), 160));

/**
 * The phrase of scene words `words` that starts (forward) or ends (back) at word i: three words, more while the scene
 * says it more than once. {phrase, nth?} — `nth` (0-based, the clock's) when even PHRASE_MOST words are said twice;
 * null when nothing can be quoted.
 */
function phraseAt(places, words, i, {back = false} = {}) {
  const scene = words[i].scene, run = [];
  for (let k = i; k >= 0 && k < words.length && run.length < PHRASE_MOST; k += back ? -1 : 1) {
    if (words[k].scene !== scene) break;
    if (plain(words[k].text)) run[back ? 'unshift' : 'push'](words[k]);
  }
  if (!run.length) return null;
  const textOf = n => (back ? run.slice(-n) : run.slice(0, n)).map(w => plain(w.text)).join(' ');
  for (let n = Math.min(3, run.length); n <= run.length; n++) {
    const where = places.placesOf(scene, textOf(n));
    if (!where || where.length <= 1) return {phrase: textOf(n)};
  }
  // Said more than once even at its longest: which place it is, counted as the clock counts (the place this word starts).
  const where = places.placesOf(scene, textOf(run.length)) ?? [], start = run[0].start;
  const nth = where.findIndex(p => Math.abs(p.start - start) < 1e-3);
  return nth >= 0 ? {phrase: textOf(run.length), nth} : null;
}

/**
 * The phrase said nearest `at` inside [from, to]: {scene, phrase, nth?, t} — the word whose start is nearest, and the
 * words after it in its scene (phraseAt) — or null when nothing is said there.
 */
export function phraseNear(places, from, to, at = (from + to) / 2) {
  const near = places.said(from, to).filter(w => plain(w.text));
  if (!near.length) return null;
  const w = near.reduce((best, x) => (Math.abs(x.start - at) < Math.abs(best.start - at) ? x : best)), words = places.sceneSaid(w.scene);
  const p = phraseAt(places, words, words.findIndex(x => x.start === w.start && x.text === w.text));
  return p ? {scene: w.scene, ...p, t: w.start} : null;
}

/** The fix for a stretch with nothing new or nothing moving: a beat keyed on the phrase said nearest `at`, as a recipe keys it. */
export function beatFix(places, from, to, {at = (from + to) / 2, what = 'a beat (a drawing, a reveal or a camera move)'} = {}) {
  const near = phraseNear(places, from, to, at);
  if (!near) return `key ${what} near ${clockTenths(at)} (nothing is said there: a camera move, or a drawing at that time)`;
  const ref = near.nth === undefined ? [near.scene, near.phrase] : {scene: near.scene, phrase: near.phrase, nth: near.nth};
  return `key ${what} on ${said(ref)} (said at ${clockTenths(near.t)})`;
}

/**
 * The fix for too few real silences: `need` pauses between words in [from, to] made pacing holds of `seconds` after the
 * phrase before each. Only a pause with no effect sound in it (`soundless(from, to)`) can become a silence, and one already
 * quiet (`quiet(from, to)`) is one; the longest go first (a pause at a clause's end before one inside a clause), and
 * among pauses of one length (an even-timed voice) the picks spread over the stretch. A pause whose phrase its scene says twice is passed by: a hold has no `nth`.
 */
export function holdsFix(places, from, to, {need, seconds, quiet, soundless}) {
  const words = places.said(from, to).filter(w => plain(w.text)), gaps = [];
  for (let i = 1; i < words.length; i++) {
    const [a, b] = [words[i - 1].end, words[i].start];
    if (quiet(a, b) || !soundless(a, b)) continue;
    const scene = places.sceneSaid(words[i - 1].scene), k = scene.findIndex(w => w.start === words[i - 1].start && w.text === words[i - 1].text);
    const p = k >= 0 ? phraseAt(places, scene, k, {back: true}) : null;
    // a pause after a clause's end (a word ending in . , ; : ! ?) ranks a tenth of a second longer: a breath there never cuts a clause
    const clause = /[.,;:!?…]["'”’)]*$/u.test(String(words[i - 1].text).trim()) ? .1 : 0;
    if (p && p.nth === undefined) gaps.push({at: a, seconds: +(b - a + clause).toFixed(2), scene: words[i - 1].scene, after: p.phrase});
  }
  const picked = [];
  while (picked.length < need && gaps.length) {
    const longest = Math.max(...gaps.map(g => g.seconds)), tied = gaps.filter(g => g.seconds >= longest - .05);
    const far = g => (picked.length ? Math.min(...picked.map(p => Math.abs(p.at - g.at))) : g.at);   // the first: the latest (nearest the peak); then the farthest from those picked
    const g = tied.reduce((best, x) => (far(x) > far(best) ? x : best));
    picked.push(g); gaps.splice(gaps.indexOf(g), 1);
  }
  if (!picked.length) return `add a pacing hold of ${seconds} s (pacing.holds: {"scene", "after": a phrase said once, "seconds"}) before the peak, in a pause with no sound in it`;
  const holds = picked.sort((a, b) => a.at - b.at).map(g => said({scene: g.scene, after: g.after, seconds}));
  return `add ${holds.join(' and ')} to pacing.holds: a breath before the peak`;
}

/** The fix for a drawn part that breaks (geometry.mjs · a break: {rule, path, part, other}). Its names are the kit's, cut short. */
export function geometryFix(b) {
  const q = name => JSON.stringify(cutText(name, 40));
  if (b.rule === 'mount') return `draw ${q(b.part)} from where ${q(b.other)} is at every moment (the kit's parts(t)), so it stays mounted`;
  if (b.rule === 'cross') return `keep ${q(b.part)} and ${q(b.other)} apart: move one, or change the pose or path that brings them together`;
  return `keep ${q(b.part)} still while it is planted: move the body over it, not the part`;
}
