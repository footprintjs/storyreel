// say — the fix for a finding about time, not place: a beat keyed on a phrase said there, a pacing hold after a phrase,
// a drawn part kept together. Each names what to write in the recipe, as the recipe writes it.
//
// WHY: "nothing new for 6 s" leaves the author to find a phrase in that stretch and to know how a beat is keyed. The
// spoken words are on the film's clock (film.timings, places.mjs · said), so the fix can quote the phrase and the entry:
// `key a beat on ["farm", "she stops by"]`, `add {"scene": "a", "after": "went out", "seconds": 0.8} to pacing.holds`.
import {clockTenths} from '../clock.mjs';

/** A spoken word as the recipe quotes it: its letters, digits and inner marks ("down," → "down"). */
const plain = text => String(text).replace(/[^\p{L}\p{N}'’-]+/gu, ' ').trim();
/** Up to `most` words of one scene, from word i on (forward) or ending at it (back), as a phrase. */
function phraseFrom(words, i, {most = 3, back = false} = {}) {
  const scene = words[i].scene, out = [];
  for (let k = i; k >= 0 && k < words.length && out.length < most; k += back ? -1 : 1) {
    if (words[k].scene !== scene) break;
    const w = plain(words[k].text);
    if (w) out[back ? 'unshift' : 'push'](w);
  }
  return out.join(' ');
}

/**
 * The phrase said nearest `at` inside [from, to]: {scene, phrase, t} — the word whose start is nearest, and the words
 * after it in its scene (three at most) — or null when nothing is said there.
 */
export function phraseNear(places, from, to, at = (from + to) / 2) {
  const words = places.said(from, to).filter(w => plain(w.text));
  if (!words.length) return null;
  const i = words.reduce((best, w, k) => (Math.abs(w.start - at) < Math.abs(words[best].start - at) ? k : best), 0);
  return {scene: words[i].scene, phrase: phraseFrom(words, i), t: words[i].start};
}

/** The fix for a stretch with nothing new or nothing moving: a beat keyed on the phrase said nearest `at`, as a recipe keys it. */
export function beatFix(places, from, to, {at = (from + to) / 2, what = 'a beat (a drawing, a reveal or a camera move)'} = {}) {
  const near = phraseNear(places, from, to, at);
  return near ? `key ${what} on ${JSON.stringify([near.scene, near.phrase])} (said at ${clockTenths(near.t)})`
    : `key ${what} near ${clockTenths(at)} (nothing is said there: a camera move, or a drawing at that time)`;
}

/**
 * The fix for too few real silences: the `need` longest pauses between words in [from, to] that are not already quiet,
 * each made a pacing hold of `seconds` after the phrase before it. `quiet(from, to)`: whether a pause is a real silence.
 */
export function holdsFix(places, from, to, {need, seconds, quiet}) {
  const words = places.said(from, to).filter(w => plain(w.text)), gaps = [];
  for (let i = 1; i < words.length; i++) if (!quiet(words[i - 1].end, words[i].start)) gaps.push({i: i - 1, seconds: words[i].start - words[i - 1].end});
  const picked = gaps.sort((a, b) => b.seconds - a.seconds || b.i - a.i).slice(0, need).sort((a, b) => a.i - b.i);
  if (!picked.length) return `add a pacing hold of ${seconds} s (pacing.holds: {"scene", "after": a phrase, "seconds"}) before the peak`;
  const holds = picked.map(g => JSON.stringify({scene: words[g.i].scene, after: phraseFrom(words, g.i, {back: true}), seconds}));
  return `add ${holds.join(' and ')} to pacing.holds: a breath before the peak`;
}

/** The fix for a drawn part that breaks (geometry.mjs · a break: {rule, path, part, other}). */
export function geometryFix(b) {
  if (b.rule === 'mount') return `draw "${b.part}" from where "${b.other}" is at every moment (the kit's parts(t)), so it stays mounted`;
  if (b.rule === 'cross') return `keep "${b.part}" and "${b.other}" apart: move one, or change the pose or path that brings them together`;
  return `keep "${b.part}" still while it is planted: move the body over it, not the part`;
}
