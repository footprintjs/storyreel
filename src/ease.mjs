/**
 * The ease table: how a change speeds up and settles. One table in the core that every key, way and
 * device reads (docs/design/2026-10-motion-grammar.md, section 4.6), so a curve is named, never copied.
 *
 * Every curve takes u, how far through its seconds a change is (clamped to 0..1), and returns how far
 * the value has gone: 0 at the start, 1 at the end, exactly. Only `back`/`outBack` and `spring` leave 0..1
 * on the way (they overshoot); `overshoots(name)` says which ones do, a four-number curve included.
 *
 *   linear      steady from start to end
 *   in          starts slow and speeds up (u²): leaving the frame
 *   out         starts fast and slows into place (1 − (1 − u)²): arriving
 *   inOut       slow, fast, slow (smoothstep, u² (3 − 2u)): EXACTLY kits/whiteboard/board.mjs · ease, the
 *               curve every film used before the table, so the old name still draws the same pixels
 *   back        arrives, overshoots about 10% past the end and settles back (Penner's back-out, 1.70158)
 *   walk        a walker's pace: speeds up over the first fifth, steady, slows over the last fifth (the
 *               speed is a trapezoid); never overshoots, so `reach` may use it
 *   jump        no in-between: the start value until the change ends, then the end value (Flash's hold
 *               keyframe; not called `hold`, which keeps its pacing.json meaning, a pause after a line)
 *   spring      a closed-form damped spring (damping 0.7): arrives fast, overshoots about 4% and settles,
 *               exact at both ends — the "pop" motion designers reach for; a formula of u, so any moment
 *               draws the same pixels (the first real film that needed it: a talk teaser, 2026-10)
 *   bounce      lands and bounces three times, smaller each time, never past the end (Penner's bounce-out):
 *               a thing dropped onto a floor
 *   outCubic    1 − (1 − u)³: the everyday arrival of interface motion, a little firmer than `out`
 *   outQuint    1 − (1 − u)⁵: arrives fast and glides a long way into place (a soft, expensive feel)
 *   outExpo     1 − 2^(−10u), scaled so it ends at exactly 1: the fastest start, the longest glide
 *   outBack     the same curve as `back`, under the name CSS libraries and easings.net use: overshoot moves
 *   inOutCubic  slow, fast, slow, steeper than inOut (4u³, then its mirror)
 *   standard    Material 3's standard curve, cubic-bezier(0.2, 0, 0, 1): for a thing that starts and ends on screen
 *   emphasized  Material 3's emphasized path (two Bézier pieces meeting at (1/6, 0.4)): a quick wind-up, then
 *               a long, decelerating glide — for the one move a viewer must notice
 *
 * A four-number curve is asked for the way CSS writes it, "cubic-bezier(0.16, 1, 0.3, 1)", or made with
 * `bezier(x1, y1, x2, y2)`: the same curve a browser draws for that string (x is time, so x1 and x2 stay
 * within 0..1; y may leave it, and the curve then overshoots).
 */

const clamp01 = n => Math.max(0, Math.min(1, n));
/** A value as a message shows it: a number as itself (NaN, Infinity), anything else as JSON. */
const shown = v => (typeof v === 'number' ? String(v) : JSON.stringify(v));

/** The curve today's films use everywhere (whiteboard strokes, hand-overs, push notes); see `inOut` above. */
export const inOut = t => { t = clamp01(t); return t * t * (3 - 2 * t); };

const BACK = 1.70158;
/** How much of a walk is spent speeding up (and, at the end, slowing down). */
const WALK_RAMP = .2, WALK_TOP = 1 / (1 - WALK_RAMP);

/** A walk: speed rises evenly to WALK_TOP, holds, and falls evenly to 0 (the area under it is 1). */
function walk(u) {
  u = clamp01(u);
  if (u < WALK_RAMP) return WALK_TOP * u * u / (2 * WALK_RAMP);
  if (u > 1 - WALK_RAMP) return 1 - WALK_TOP * (1 - u) ** 2 / (2 * WALK_RAMP);
  return WALK_TOP * (WALK_RAMP / 2 + u - WALK_RAMP);
}

/** Back-out: 1 + (c + 1)(u − 1)³ + c(u − 1)², with the ends exact (the formula leaves 2e-16 at the start). */
function back(u) {
  u = clamp01(u);
  if (u === 0 || u === 1) return u;
  const v = u - 1;
  return 1 + (BACK + 1) * v ** 3 + BACK * v ** 2;
}

const SPRING = {zeta: .7, omega: 7};
/** The damped spring x(u) = 1 − e^(−ζωu)(cos ω_d u + (ζω/ω_d) sin ω_d u), nudged so x(1) is exactly 1. */
function spring(u) {
  u = clamp01(u);
  if (u === 0 || u === 1) return u;
  const {zeta: z, omega: w} = SPRING, wd = w * Math.sqrt(1 - z * z);
  const raw = v => 1 - Math.exp(-z * w * v) * (Math.cos(wd * v) + (z * w / wd) * Math.sin(wd * v));
  return raw(u) + (1 - raw(1)) * u;
}

/** Bounce-out (Penner): four parabolas, each landing on 1, the bounces 1/4, 1/16 and 1/64 high; ends exact. */
function bounce(u) {
  u = clamp01(u);
  if (u === 0 || u === 1) return u;
  const n = 7.5625, d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) return n * (u -= 1.5 / d) * u + .75;
  if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + .9375;
  return n * (u -= 2.625 / d) * u + .984375;
}

const EXPO_END = 1 - 2 ** -10;
/** Expo-out, scaled by its end so it reaches exactly 1 (Penner's leaves 0.001 to jump at the last frame). */
const outExpo = u => (1 - 2 ** (-10 * clamp01(u))) / EXPO_END;

/** Cubic in-out: 4u³ for the first half, its mirror for the second. */
const inOutCubic = u => { u = clamp01(u); return u < .5 ? 4 * u ** 3 : 1 - (2 - 2 * u) ** 3 / 2; };

/** One coordinate of a unit cubic Bézier (ends 0 and 1, control points a and b) at its parameter s, and its slope. */
const bezierAt = (a, b, s) => ((1 + 3 * (a - b)) * s + 3 * (b - 2 * a)) * s * s + 3 * a * s;
const bezierSlope = (a, b, s) => (3 * (1 + 3 * (a - b)) * s + 6 * (b - 2 * a)) * s + 3 * a;

/**
 * The parameter s at which a unit Bézier's x is x: Newton's method from s = x (a few steps, wherever the slope is
 * not flat), and bisection over 0..1 when it does not converge there (x rises with s, so bisection always finds
 * it). Within 1e-12 of the answer in x; where x hardly moves with s (a curve like (1, 0, 0, 1) at its middle), the
 * answer in y is as exact as the numbers allow.
 */
function solveX(x1, x2, x) {
  let s = x;
  for (let i = 0; i < 8; i++) {
    const err = bezierAt(x1, x2, s) - x;
    if (Math.abs(err) < 1e-12) return s;
    const slope = bezierSlope(x1, x2, s);
    if (Math.abs(slope) < 1e-6) break;
    s -= err / slope;
    if (!(s >= 0 && s <= 1)) break;   // off the curve's own stretch: the other roots of the cubic are not the answer
  }
  let lo = 0, hi = 1;
  while (hi - lo > 1e-12) { const mid = (lo + hi) / 2; if (bezierAt(x1, x2, mid) < x) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/**
 * A CSS cubic-bezier(x1, y1, x2, y2): the curve from (0, 0) to (1, 1) whose two control points are (x1, y1)
 * and (x2, y2), read at time u (clamped to 0..1). The ends are exact. x is time, so x1 and x2 stay within
 * 0..1 (as CSS requires); y1 and y2 may be any number, and a y outside 0..1 makes the curve overshoot.
 */
export function bezier(x1, y1, x2, y2) {
  const points = [x1, y1, x2, y2];
  if (!points.every(Number.isFinite)) throw new Error(`bezier: four finite numbers, x1, y1, x2, y2 (as CSS's cubic-bezier takes them), not ${points.map(shown).join(', ')}`);
  if (!Number.isFinite(9 * (Math.abs(y1) + Math.abs(y2)))) throw new Error(`bezier: y1 and y2 are so large the curve cannot be worked out (${shown(y1)}, ${shown(y2)}); an ease's y stays within a few units of 0..1`);
  if (!(x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1)) throw new Error(`bezier: x1 and x2 are times, within 0..1 (a curve cannot go back in time), not x1 ${shown(x1)}, x2 ${shown(x2)}; y1 and y2 may leave 0..1`);
  if (x1 === y1 && x2 === y2) return u => clamp01(u);   // the control points on the diagonal: a straight line
  return u => {
    u = clamp01(u);
    if (u === 0 || u === 1) return u;
    return bezierAt(y1, y2, solveX(x1, x2, u));
  };
}

const standard = bezier(.2, 0, 0, 1);
// Material 3's emphasized path, M 0,0 C 0.05,0 0.133333,0.06 0.166666,0.4 C 0.208333,0.82 0.25,1 1,1: each piece
// scaled to the unit square is a four-number curve of its own (M3's emphasized-accelerate, then -decelerate).
const EMPH_X = 1 / 6, EMPH_Y = .4, emphIn = bezier(.3, 0, .8, .15), emphOut = bezier(.05, .7, .1, 1);
function emphasized(u) {
  u = clamp01(u);
  if (u === 0 || u === 1) return u;
  return u < EMPH_X ? EMPH_Y * emphIn(u / EMPH_X) : EMPH_Y + (1 - EMPH_Y) * emphOut((u - EMPH_X) / (1 - EMPH_X));
}

/** The table, by name. */
export const EASES = Object.freeze({
  linear: u => clamp01(u),
  in: u => clamp01(u) ** 2,
  out: u => 1 - (1 - clamp01(u)) ** 2,
  inOut,
  back,
  walk,
  jump: u => (u >= 1 ? 1 : 0),
  spring,
  bounce,
  outCubic: u => 1 - (1 - clamp01(u)) ** 3,
  outQuint: u => 1 - (1 - clamp01(u)) ** 5,
  outExpo,
  outBack: back,
  inOutCubic,
  standard,
  emphasized,
});
export const EASE_NAMES = Object.freeze(Object.keys(EASES));

/** The named eases that go past the end on the way. */
const OVERSHOOTING = new Set(['back', 'outBack', 'spring']);
const CSS_BEZIER = /^\s*cubic-bezier\(\s*([^,()]+),([^,()]+),([^,()]+),([^,()]+)\)\s*$/;

/**
 * "cubic-bezier(a, b, c, d)" → {numbers: [a, b, c, d], written: the four as written}, or null when the text is not
 * that shape. A number is written as CSS writes one (1, 0.5, .5, 1e-1); anything else is NaN, shown as written.
 */
function cssPoints(text) {
  const m = typeof text === 'string' ? CSS_BEZIER.exec(text) : null;
  if (!m) return null;
  const written = m.slice(1).map(s => s.trim());
  return {numbers: written.map(s => (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? Number(s) : NaN)), written};
}

/** The range a unit Bézier coordinate covers (control values a, b): its ends, and its turning points inside 0..1. */
function bezierRange(a, b) {
  const A = 3 * (1 + 3 * (a - b)), B = 6 * (b - 2 * a), C = 3 * a, disc = B * B - 4 * A * C, at = [0, 1];
  // A y so far out that the arithmetic overflows is far past 0..1: the curve at s = 1/3 and 2/3 is a mix of y1 and y2
  // that cannot keep both within 0..1.
  if (![A, B, C, disc].every(Number.isFinite)) return [-Infinity, Infinity];
  if (Math.abs(A) < 1e-12) { if (Math.abs(B) > 1e-12) at.push(-C / B); }
  else if (disc >= 0) at.push((-B + Math.sqrt(disc)) / (2 * A), (-B - Math.sqrt(disc)) / (2 * A));
  const values = at.filter(s => s >= 0 && s <= 1).map(s => bezierAt(a, b, s));
  return [Math.min(...values), Math.max(...values)];
}

/**
 * Whether the ease called `name` goes past its start or its end on the way: back, outBack and spring do, and a
 * four-number curve does when its y leaves 0..1 (worked out exactly, from the curve's turning points). A
 * transition that would show the frame's edge refuses those (transitions.mjs · readEntrance).
 */
export function overshoots(name) {
  if (OVERSHOOTING.has(name)) return true;
  const p = cssPoints(name);
  if (!p) return false;
  const [lo, hi] = bezierRange(p.numbers[1], p.numbers[3]);
  return lo < -1e-9 || hi > 1 + 1e-9;
}

/**
 * The curve named `name` — a name from the table, or a four-number curve as CSS writes it,
 * "cubic-bezier(0.16, 1, 0.3, 1)" — or a refusal that names the eases there are; `where` says which entry asked.
 */
export function easeNamed(name, where = 'ease') {
  if (typeof name === 'string' && Object.hasOwn(EASES, name)) return EASES[name];
  const p = cssPoints(name);
  if (p) {
    const not = what => new Error(`${where}: ${JSON.stringify(name)} is not a curve: ${what}`);
    if (!p.numbers.every(Number.isFinite)) throw not(`four finite numbers, x1, y1, x2, y2, not ${p.written.join(', ')}`);
    try { return bezier(...p.numbers); } catch (e) { const err = not(e.message.replace(/^bezier: /, '')); err.cause = e; throw err; }
  }
  throw new Error(`${where}: "${name}" is not an ease; the eases are ${EASE_NAMES.join(', ')}, or a four-number curve as CSS writes it, "cubic-bezier(0.16, 1, 0.3, 1)"`);
}
