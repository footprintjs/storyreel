/**
 * The thought cloud's shape, from {corner, size, seed}: where it sits (leaning a little away from the trail's corner),
 * its scallops (a seeded ring of arcs round a superellipse, fitted to the box the world's picture fills) and the trail of
 * three circles toward the corner. Pure numbers: drawing it is draw.mjs's, its entrance entrance.mjs's.
 */
import {W, H} from '../frame.mjs';
import {arc} from '../principles.mjs';
import {seeded} from '../seeded.mjs';

const TAU = 2 * Math.PI;
/**
 * The frame's corners, and the most the cloud leans away from the trail's (px across, px down): enough to leave the trail
 * room, little enough that at the default size the cloud keeps a margin from the far edge even as it overshoots opening
 * and swells before a burst.
 */
const CORNER_AT = Object.freeze({'bottom-left': [0, H], 'bottom-right': [W, H], 'top-left': [0, 0], 'top-right': [W, 0]});
const LEAN = Object.freeze([80, 28]);
/** The scallops: how many, the curve their valleys sit on (a superellipse: 2 is an ellipse, higher is squarer), how deep each bulges (a share of its width). */
const LOBES = 22, SQUARENESS = 2.8, DEPTH = Object.freeze([.26, .4]), SAMPLES = 720;
/** The trail, from the corner out: each circle's radius, and how far along it sits from its start toward the corner. */
const TRAIL = Object.freeze([Object.freeze({r: 12, along: .9}), Object.freeze({r: 19, along: .6}), Object.freeze({r: 29, along: .3})]);
/**
 * The longest trail (px), where it heads (in from the corner by this much), and where it starts: off the cloud's edge
 * nearest the corner, as far out as the cloud grown by ROOM reaches, so the swell before a burst (cloudBurst grows the
 * cloud by 5 % before it pops) never meets it.
 */
const TRAIL_REACH = 340, TRAIL_END = Object.freeze([70, 58]), ROOM = 1.06;

const clouds = new Map();
/**
 * The cloud for {corner, size, seed}, checked by the caller (recipe.mjs · readThought, or a transition's settings): where
 * it sits (`centre`; `box` [x0, y0, x1, y1], which the world's picture fills, drawn at scale `S` from `place`), its
 * scallops (`lobes`, each the arc of a circle between two `valleys`), the point it grows from (`anchor`: its edge nearest
 * the trail), each scallop's turn in the entrance (`rank`, round from the anchor) and the trail's circles, from the corner
 * out. Kept per settings (at most 64): every frame asks again.
 */
export function thoughtCloud({corner = 'bottom-left', size = .8, seed = 3} = {}) {
  const key = `${corner}|${size}|${seed}`;
  if (!clouds.has(key)) { if (clouds.size >= 64) clouds.clear(); clouds.set(key, buildCloud(corner, size, seed)); }
  return clouds.get(key);
}

function buildCloud(corner, size, seed) {
  const w = W * size, h = H * size, [kx, ky] = CORNER_AT[corner], away = [kx ? -1 : 1, ky ? -1 : 1];
  const centre = [W / 2 + away[0] * Math.min(LEAN[0], (W - w) / 4), H / 2 + away[1] * Math.min(LEAN[1], (H - h) / 4)];
  const next = seeded(seed), valleys = valleysOn(superellipse(w / 2 * .9, h / 2 * .86), next);
  const depths = valleys.map(() => DEPTH[0] + (DEPTH[1] - DEPTH[0]) * next());
  const lobes = fitted(valleys, depths, centre, [w, h]);
  const apexes = lobes.map(l => [(l.v0[0] + l.v1[0]) / 2 + l.out[0] * l.h, (l.v0[1] + l.v1[1]) / 2 + l.out[1] * l.h]);
  const first = nearest(apexes, [kx, ky]), anchor = apexes[first];
  const rank = lobes.map((_, i) => Math.min(Math.abs(i - first), LOBES - Math.abs(i - first)));
  const box = [centre[0] - w / 2, centre[1] - h / 2, centre[0] + w / 2, centre[1] + h / 2];
  const start = [centre[0] + (anchor[0] - centre[0]) * ROOM, centre[1] + (anchor[1] - centre[1]) * ROOM];
  return Object.freeze({corner, size, seed, centre: Object.freeze(centre), box: Object.freeze(box), S: size, place: Object.freeze([box[0], box[1]]),
    lobes: Object.freeze(lobes), valleys: Object.freeze(lobes.map(l => l.v0)), anchor: Object.freeze(anchor), rank: Object.freeze(rank),
    trail: trailOf(start, [kx, ky], away)});
}

const signedPow = (v, p) => Math.sign(v) * Math.abs(v) ** p;
/** A superellipse about the origin, half-extents a and b, as a dense closed polyline (clockwise on the screen). */
function superellipse(a, b) {
  return Array.from({length: SAMPLES}, (_, j) => { const t = j / SAMPLES * TAU; return [a * signedPow(Math.cos(t), 2 / SQUARENESS), b * signedPow(Math.sin(t), 2 / SQUARENESS)]; });
}
/** LOBES valleys spread evenly along the curve's length, from a seeded start, each nudged a little (seeded). */
function valleysOn(curve, next) {
  const lengths = [0];
  for (let j = 1; j <= curve.length; j++) { const a = curve[j - 1], b = curve[j % curve.length]; lengths.push(lengths[j - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const total = lengths.at(-1), step = total / LOBES, phase = next() * step;
  return Array.from({length: LOBES}, (_, i) => pointAt(curve, lengths, ((phase + (i + (next() - .5) * .36) * step) % total + total) % total));
}
function pointAt(curve, lengths, s) {
  let j = 1;
  while (lengths[j] < s) j++;
  const a = curve[j - 1], b = curve[j % curve.length], u = (s - lengths[j - 1]) / (lengths[j] - lengths[j - 1] || 1);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

/** A scallop: the arc from v0 to v1 bulging `h` out along `out` (the chord's outward normal), as a circle {x, y, r, a0, a1}. */
export function circleOf(v0, v1, out, h) {
  const c = Math.hypot(v1[0] - v0[0], v1[1] - v0[1]), r = (c * c / 4 + h * h) / (2 * h);
  const x = (v0[0] + v1[0]) / 2 + out[0] * (h - r), y = (v0[1] + v1[1]) / 2 + out[1] * (h - r), a0 = Math.atan2(v0[1] - y, v0[0] - x);
  let a1 = Math.atan2(v1[1] - y, v1[0] - x);
  while (a1 <= a0) a1 += TAU;
  return {x, y, r, a0, a1};
}
/** Each valley to the next, the scallop between them, `depth` of the chord deep. */
function lobesOf(valleys, depths) {
  return valleys.map((v0, i) => {
    const v1 = valleys[(i + 1) % valleys.length], c = Math.hypot(v1[0] - v0[0], v1[1] - v0[1]), out = [(v1[1] - v0[1]) / c, -(v1[0] - v0[0]) / c], h = depths[i] * c;
    return Object.freeze({v0, v1, out, h, ...circleOf(v0, v1, out, h)});
  });
}
/** The scallops, moved and scaled (the same in x and y, so each stays a circle) to sit inside a w × h box about `centre`, touching it on one side. */
function fitted(valleys, depths, centre, [w, h]) {
  const pts = lobesOf(valleys, depths).flatMap(l => Array.from({length: 25}, (_, k) => { const a = l.a0 + (l.a1 - l.a0) * k / 24; return [l.x + l.r * Math.cos(a), l.y + l.r * Math.sin(a)]; }));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min(w / (x1 - x0), h / (y1 - y0)), mid = [(x0 + x1) / 2, (y0 + y1) / 2];
  return lobesOf(valleys.map(([x, y]) => [centre[0] + (x - mid[0]) * s, centre[1] + (y - mid[1]) * s]), depths);
}
const nearest = (points, [x, y]) => points.reduce((best, p, i) => (Math.hypot(p[0] - x, p[1] - y) < Math.hypot(points[best][0] - x, points[best][1] - y) ? i : best), 0);

/** The trail's circles, from the corner out: on a gentle curve (principles.mjs · arc) from `start` toward the corner. */
function trailOf(start, [kx, ky], away) {
  const end = [kx + away[0] * TRAIL_END[0], ky + away[1] * TRAIL_END[1]], d = Math.hypot(end[0] - start[0], end[1] - start[1]), k = Math.min(1, TRAIL_REACH / d);
  const to = [start[0] + (end[0] - start[0]) * k, start[1] + (end[1] - start[1]) * k];
  return Object.freeze(TRAIL.map(({r, along}) => Object.freeze({c: Object.freeze(arc(start, to, along, {bend: .1, toward: ky ? 'down' : 'up'})), r})));
}
