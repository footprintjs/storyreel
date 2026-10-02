/**
 * Acting: how a character's face and body CHANGE, not just what they are. A mood swapped from one frame to
 * the next reads as a glitch; a change that is acted reads as a thought. Borrowed from how animators time a
 * reaction: the eyes squint a moment BEFORE the change (anticipation), the new face swaps in under the
 * squint, a small "take" (a stretch, then a settle with a little overshoot) sells it, and colour
 * cross-fades. Between changes nobody is ever still: an idle layer breathes, blinks and sways, and two
 * characters never do it in step.
 *
 * Pure functions of time, like every frame: a kit asks `moodAt(keys, t)` and `idleAt(t, {seed})` and draws
 * from the numbers they return. Kit-agnostic: what "squint" or "take" look like is the kit's drawing.
 */
import {EASES} from './ease.mjs';

/** The timing every change is acted with (seconds; overshoot: how far the take passes its rest, 0..1). */
export const ACTING = Object.freeze({anticipate: .1, reopen: .08, fade: .3, settle: .4, overshoot: .12});

const clamp01 = n => Math.max(0, Math.min(1, n));

/**
 * A character's mood at t, acted. keys: [{at, mood, take?}] in time order (at: seconds; take: how big
 * the take is, 0..1, 1 by default — 0 for a change that should just cross-fade). Returns:
 *   mood         the mood now (the latest key at or before t; the first key's before it)
 *   from         the mood it is changing from (null when nothing changed yet)
 *   u            how far the change has gone, 0..1 over `fade` (cross-fade colours with it)
 *   anticipation 0..1: rises over `anticipate` before a change, falls over `reopen` after it (squint the eyes
 *                with it: the swap happens while they are nearly shut). A key that repeats the mood is no change.
 *   take         the take's stretch now: up to the key's take early, back past rest by overshoot × take, 0 at
 *                `settle` (scale a body or a head by 1 + take × how far your kit stretches)
 *   settle       0..1 with a little overshoot: a pose settling into the new mood
 */
export function moodAt(keys, t, {anticipate = ACTING.anticipate, reopen = ACTING.reopen, fade = ACTING.fade, settle = ACTING.settle, overshoot = ACTING.overshoot} = {}) {
  if (!Array.isArray(keys) || !keys.length) throw new Error('moodAt: keys is a list of {at, mood} in time order');
  keys.forEach((k, i) => {
    if (!k || !Number.isFinite(k.at) || typeof k.mood !== 'string') throw new Error(`moodAt: key ${i} must be {at: seconds, mood: 'a name', take?}`);
    if (i && k.at < keys[i - 1].at) throw new Error(`moodAt: key ${i} (${k.mood} at ${k.at}) comes before key ${i - 1} (${keys[i - 1].at}); give the keys in time order`);
    if (k.take !== undefined && !(k.take >= 0 && k.take <= 1)) throw new Error(`moodAt: key ${i}'s take is 0..1 (how big the reaction is)`);
  });
  if (!(overshoot > 0 && overshoot < 1)) throw new Error('moodAt: overshoot is how far a take falls back past rest, a fraction above 0 and below 1');
  let i = -1; while (i + 1 < keys.length && keys[i + 1].at <= t) i++;
  const changes = j => j > 0 && keys[j].mood !== keys[j - 1].mood;
  // Anticipation, around a change only: the eyes start closing just before it and open again just after it.
  const before = i >= 0 && i + 1 < keys.length && changes(i + 1) ? clamp01((t - (keys[i + 1].at - anticipate)) / anticipate) : 0;
  const after = changes(i) ? 1 - clamp01((t - keys[i].at) / reopen) : 0;
  const anticipation = Math.max(before, after);
  if (i < 0) return {mood: keys[0].mood, from: null, u: 1, anticipation, take: 0, settle: 1};
  const key = keys[i], dt = t - key.at;
  if (!changes(i)) return {mood: key.mood, from: null, u: 1, anticipation, take: 0, settle: 1};
  const s = clamp01(dt / settle);
  return {mood: key.mood, from: keys[i - 1].mood, u: clamp01(dt / fade), anticipation, take: s >= 1 ? 0 : (key.take ?? 1) * takeCurve(s, overshoot), settle: EASES.spring(s)};
}

/**
 * The take's swing over s = 0..1: a damped sine, up to 1 early, back past rest to −overshoot, still at 1.
 * The decay is chosen so the second swing is exactly `overshoot` of the first, and the whole is scaled so
 * the first swing peaks at exactly 1.
 */
function takeCurve(s, overshoot) {
  const k = -2 * Math.log(overshoot), w = 2 * Math.PI, peakAt = Math.atan(w / k) / w;
  return Math.sin(w * s) * Math.exp(-k * s) / (Math.sin(w * peakAt) * Math.exp(-k * peakAt));
}

/** A whole-number seed's phase and period offsets: deterministic, different for each seed. */
const jitter = (seed, k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

/**
 * The idle layer at t: what a character does while nothing happens — breathe, blink, sway, glance. `seed`
 * sets each one's phase and a slightly different period, so two characters with different seeds never move
 * in step. Returns {breath (a scale, ~1 ± breath), blink (0 open .. 1 shut), sway (px), glance (-1..1, a
 * small look aside now and then)}.
 */
export function idleAt(t, {seed = 1, breath = .012, breathEvery = 3.6, blinkEvery = 3.8, blinkFor = .14, sway = 2, swayEvery = 5.3} = {}) {
  if (!Number.isFinite(seed)) throw new Error('idleAt: seed is a number (give each character its own, so they never move in step)');
  const pb = breathEvery * (1 + .12 * (jitter(seed, 1) - .5)), ps = swayEvery * (1 + .2 * (jitter(seed, 2) - .5));
  const breathNow = 1 + breath * Math.sin(2 * Math.PI * (t / pb + jitter(seed, 3)));
  // Blinks come at a slightly uneven rhythm: each interval is the base ± 25 %, chosen by the seed and its count.
  let start = jitter(seed, 4) * blinkEvery, n = 0;
  while (start + blinkFor < t) start += blinkEvery * (.75 + .5 * jitter(seed, 10 + n++));
  const b = (t - start) / blinkFor, blink = b >= 0 && b <= 1 ? Math.sin(Math.PI * b) : 0;
  const swayNow = sway * Math.sin(2 * Math.PI * (t / ps + jitter(seed, 5)));
  const g = Math.sin(2 * Math.PI * (t / (ps * 2.3) + jitter(seed, 6)));
  return {breath: breathNow, blink, sway: swayNow, glance: Math.abs(g) > .92 ? Math.sign(g) * (Math.abs(g) - .92) / .08 : 0};
}

/** A value that follows another `delay` seconds behind it: the head follows where the eyes went. */
export const follows = (f, delay = .15) => t => f(t - delay);
