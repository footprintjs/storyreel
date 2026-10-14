/**
 * One joint's track over a clip — a point {x, y} (or null where it was not seen) per frame — and what is done to it:
 * its gaps found and filled, its noise smoothed. Pure functions, the same numbers in the same order every time.
 */
import {runsOf} from './keypoints.mjs';

/**
 * The gaps in a track: runs of frames without a point, as {from, to, edge} (indices into the track). edge says
 * where the gap lies: inside (seen on both sides), start or end (at an edge of the clip), whole (never seen).
 */
export function gapsOf(track) {
  const last = track.length - 1;
  return runsOf(track.map(p => p === null)).map(([from, to]) => ({from, to, edge: from === 0 && to === last ? 'whole' : from === 0 ? 'start' : to === last ? 'end' : 'inside'}));
}

/**
 * A gap filled, in a copy of the track: 'bridge' draws it straight across, from the point before it to the point
 * after it; 'hold' keeps the nearest point seen (a gap at an edge of the clip has one side only).
 */
export function fillGap(track, {from, to}, how) {
  const out = track.slice();
  if (how === 'bridge') {
    const a = track[from - 1], b = track[to + 1], span = to - from + 2;
    for (let i = from; i <= to; i++) { const u = (i - from + 1) / span; out[i] = {x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u}; }
    return out;
  }
  if (how === 'hold') {
    const near = from === 0 ? track[to + 1] : track[from - 1];
    for (let i = from; i <= to; i++) out[i] = {x: near.x, y: near.y};
    return out;
  }
  throw new Error(`fillGap: a gap is filled by 'bridge' or 'hold', not ${JSON.stringify(how)}`);
}

/** The One Euro filter's weight for a cutoff (Hz) at a step of dt seconds. */
const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

/** One pass of the One Euro filter (Casiez, Roussel and Vogel, 2012): a low-pass whose cutoff rises with the speed. */
function oneEuroPass(values, dt, {minCutoff, beta, dCutoff}) {
  const out = [values[0]];
  let kept = values[0], speed = 0;
  for (let i = 1; i < values.length; i++) {
    speed += alpha(dCutoff, dt) * ((values[i] - kept) / dt - speed);
    kept += alpha(minCutoff + beta * Math.abs(speed), dt) * (values[i] - kept);
    out.push(kept);
  }
  return out;
}

/**
 * The values with `pad` more at each end, reflected through the end frame (2·end − values[k]): a value moving
 * steadily keeps moving steadily past the ends, so a filter starts on the move instead of catching up to it, and a
 * value still at an end stays still there. (The end frames themselves are steadied a little less than the rest.)
 */
function reflected(values, pad) {
  const n = values.length, k = Math.min(pad, n - 1), first = values[0], last = values[n - 1];
  const before = Array.from({length: k}, (_, i) => 2 * first - values[k - i]), after = Array.from({length: k}, (_, i) => 2 * last - values[n - 2 - i]);
  return {values: [...before, ...values, ...after], k};
}

/**
 * A list of numbers smoothed with the One Euro filter, run forward and then backward over its own output, so the
 * smoothing leaves no lag in time (a foot lands on the frame it landed on in the video). The ends are padded by
 * reflection first (half a second each), so the first and last frames are not pulled toward a standstill.
 * minCutoff (Hz): how strongly a still value is steadied; beta: how fast the cutoff rises with the speed (in the
 * values' units a second).
 */
export function oneEuro(values, fps, options) {
  const dt = 1 / fps, {values: padded, k} = reflected(values, Math.ceil(fps / 2));
  return oneEuroPass(oneEuroPass(padded, dt, options).reverse(), dt, options).reverse().slice(k, k + values.length);
}

/** A filled track smoothed in units of `scale` (one torso length), so beta reads the same at any size of video. */
export function smoothTrack(track, fps, scale, options) {
  const [xs, ys] = ['x', 'y'].map(k => oneEuro(track.map(p => p[k] / scale), fps, options));
  return xs.map((x, i) => ({x: x * scale, y: ys[i] * scale}));
}

/** The value at a share q (0..1) of the way through the sorted numbers, between ranks as needed. */
export function quantile(values, q) {
  const s = values.slice().sort((a, b) => a - b), at = q * (s.length - 1), i = Math.floor(at);
  return i + 1 < s.length ? s[i] + (s[i + 1] - s[i]) * (at - i) : s[i];
}
export const median = values => quantile(values, .5);
/** The least and the most of a list of numbers, by a loop (a spread into Math.min fails past about 125,000 values). */
export function least(values) { let m = Infinity; for (const v of values) if (v < m) m = v; return m; }
export function most(values) { let m = -Infinity; for (const v of values) if (v > m) m = v; return m; }
