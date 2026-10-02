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
 * One change at a time: changes closer than one change takes to settle refuse, so every number a kit reads
 * moves smoothly from frame to frame.
 */
import {EASES} from './ease.mjs';

/** The timing every change is acted with (seconds; overshoot: how far the take passes its rest, 0..1). */
export const ACTING = Object.freeze({anticipate: .1, reopen: .08, fade: .3, settle: .4, overshoot: .12});

const clamp01 = n => Math.max(0, Math.min(1, n));

/**
 * A character's mood at t, acted. keys: [{at, mood, take?}] in time order (at: seconds; take: how big
 * the take is, 0..1, 1 by default — 0 for a change that should just cross-fade). A key that repeats the
 * mood is no change; two changes must be at least max(fade, settle) apart (one change at a time). Returns:
 *   mood         the mood now (the latest key at or before t; the first key's before it)
 *   from         the mood before the latest change (null before the first change); `u` says how far it went
 *   u            how far the latest change has gone, 0..1 over `fade` (cross-fade colours with it)
 *   anticipation 0..1: rises over `anticipate` before a change, falls over `reopen` after it (squint the eyes
 *                with it: the swap happens while they are nearly shut)
 *   take         the take's stretch now: up to the key's take early, back past rest by overshoot × take, 0 at
 *                `settle` (scale a body or a head by 1 + take × how far your kit stretches)
 *   settle       0..1 with a little overshoot: a pose settling into the new mood
 */
export function moodAt(keys, t, options = {}) {
  const o = actingOptions(options), moods = readKeys(keys, o);
  if (!Number.isFinite(t)) throw new Error('moodAt: t is a time in seconds');
  let i = -1; while (i + 1 < moods.length && moods[i + 1].at <= t) i++;
  if (i < 0) return {mood: moods[0].mood, from: null, u: 1, anticipation: 0, take: 0, settle: 1};
  // Anticipation, around a change only: the eyes start closing just before it and open again just after it.
  const next = moods[i + 1], before = next ? clamp01((t - (next.at - o.anticipate)) / o.anticipate) : 0;
  const after = i > 0 ? 1 - clamp01((t - moods[i].at) / o.reopen) : 0, anticipation = Math.max(before, after);
  if (i === 0) return {mood: moods[0].mood, from: null, u: 1, anticipation, take: 0, settle: 1};
  const key = moods[i], dt = t - key.at, s = clamp01(dt / o.settle);
  return {mood: key.mood, from: moods[i - 1].mood, u: clamp01(dt / o.fade), anticipation, take: s >= 1 ? 0 : (key.take ?? 1) * takeCurve(s, o.overshoot), settle: EASES.spring(s)};
}

/** The timing, checked: every length a number of seconds above 0, overshoot a fraction above 0 and below 1. */
function actingOptions({anticipate = ACTING.anticipate, reopen = ACTING.reopen, fade = ACTING.fade, settle = ACTING.settle, overshoot = ACTING.overshoot} = {}) {
  for (const [name, v] of Object.entries({anticipate, reopen, fade, settle})) if (!(Number.isFinite(v) && v > 0)) throw new Error(`moodAt: ${name} is seconds, above 0`);
  if (!(overshoot > 0 && overshoot < 1)) throw new Error('moodAt: overshoot is how far a take falls back past rest, a fraction above 0 and below 1');
  return {anticipate, reopen, fade, settle, overshoot};
}

/** The keys, checked, without the ones that repeat the mood: the first mood, then each change. */
function readKeys(keys, o) {
  if (!Array.isArray(keys) || !keys.length) throw new Error('moodAt: keys is a list of {at, mood} in time order');
  const moods = [], spacing = Math.max(o.fade, o.settle);
  keys.forEach((k, i) => {
    if (!k || !Number.isFinite(k.at) || typeof k.mood !== 'string') throw new Error(`moodAt: key ${i} must be {at: seconds, mood: 'a name', take?}`);
    if (i && k.at < keys[i - 1].at) throw new Error(`moodAt: key ${i} (${k.mood} at ${k.at}) comes before key ${i - 1} (${keys[i - 1].at}); give the keys in time order`);
    if (k.take !== undefined && !(k.take >= 0 && k.take <= 1)) throw new Error(`moodAt: key ${i}'s take is 0..1 (how big the reaction is)`);
    const last = moods.at(-1);
    if (last && k.mood === last.mood) return;
    if (last && k.at === last.at) throw new Error(`moodAt: "${last.mood}" and "${k.mood}" are both at ${k.at} s; a character has one mood at a time`);
    const change = moods.length >= 2 && moods.at(-1);
    if (change && k.at - change.at < spacing - 1e-9) throw new Error(`moodAt: the change to "${k.mood}" at ${k.at} s comes ${(k.at - change.at).toFixed(2)} s after the change to "${change.mood}"; a change takes ${spacing} s to settle, so space changes at least that far apart (or make fade and settle shorter)`);
    moods.push(k);
  });
  return moods;
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
 * in step. Periods are seconds above 0; `blinkEvery: Infinity` (or `blinkFor: 0`) never blinks, and a blink
 * takes under half the time between blinks. Returns {breath (a scale, ~1 ± breath), blink (0 open .. 1
 * shut), sway (px), glance (-1..1, a small look aside now and then)}.
 */
export function idleAt(t, {seed = 1, breath = .012, breathEvery = 3.6, blinkEvery = 3.8, blinkFor = .14, sway = 2, swayEvery = 5.3} = {}) {
  if (!Number.isFinite(t)) throw new Error('idleAt: t is a time in seconds');
  if (!Number.isFinite(seed)) throw new Error('idleAt: seed is a number (give each character its own, so they never move in step)');
  for (const [name, v] of Object.entries({breathEvery, swayEvery})) if (!(Number.isFinite(v) && v > 0)) throw new Error(`idleAt: ${name} is a period in seconds, above 0`);
  for (const [name, v] of Object.entries({breath, sway})) if (!Number.isFinite(v)) throw new Error(`idleAt: ${name} is a number (how far it moves)`);
  if (!(blinkEvery > 0)) throw new Error('idleAt: blinkEvery is seconds between blinks, above 0 (Infinity: never blinks)');
  if (!(Number.isFinite(blinkFor) && blinkFor >= 0 && blinkFor < blinkEvery / 2)) throw new Error('idleAt: blinkFor is how long a blink takes: 0 or more, and under half of blinkEvery');
  const pb = breathEvery * (1 + .12 * (jitter(seed, 1) - .5)), ps = swayEvery * (1 + .2 * (jitter(seed, 2) - .5));
  const breathNow = 1 + breath * Math.sin(2 * Math.PI * (t / pb + jitter(seed, 3)));
  const swayNow = sway * Math.sin(2 * Math.PI * (t / ps + jitter(seed, 5)));
  const g = Math.sin(2 * Math.PI * (t / (ps * 2.3) + jitter(seed, 6)));
  return {breath: breathNow, blink: blinkAt(t, seed, blinkEvery, blinkFor), sway: swayNow, glance: Math.abs(g) > .92 ? Math.sign(g) * (Math.abs(g) - .92) / .08 : 0};
}

/**
 * The blink at t. Blinks come at a slightly uneven rhythm: blink k starts near k·every, moved by up to a
 * quarter of `every` either way (chosen by the seed and k), so the blink at any t is one of three — found in
 * the same time at the film's first second as at its thousandth.
 */
function blinkAt(t, seed, every, length) {
  if (!Number.isFinite(every) || length === 0) return 0;
  const phase = jitter(seed, 4) * every, start = k => phase + k * every + (jitter(seed, 10 + k) - .5) * .5 * every, near = Math.floor((t - phase) / every);
  for (const k of [near - 1, near, near + 1]) { const b = (t - start(k)) / length; if (b >= 0 && b <= 1) return Math.sin(Math.PI * b); }
  return 0;
}

/**
 * How open `who`'s mouth is at t (0..1): it moves only while its owner says a word (clock.speaking: the
 * scene's `speaker`; null is the narrator), one open-and-close a syllable or so (`syllable` seconds), shut
 * between words. A kit that draws a mouth with it can say so (a world's mouthsAt(t) → [{who, open}]) and the
 * lip-sync check (finished.mjs) holds the finished file to it.
 */
export function mouthAt(clock, t, who = null, {syllable = .17} = {}) {
  if (!(syllable > 0)) throw new Error('mouthAt: syllable is the seconds of one open-and-close, above 0');
  const w = clock.speaking?.(t);
  if (!w || (w.speaker ?? null) !== who) return 0;
  const n = Math.max(1, Math.round((w.end - w.start) / syllable)), k = clamp01((t - w.start) / (w.end - w.start));
  return Math.abs(Math.sin(Math.PI * k * n));
}

/** A value that follows another `delay` seconds behind it: the head follows where the eyes went. */
export const follows = (f, delay = .15) => t => f(t - delay);
