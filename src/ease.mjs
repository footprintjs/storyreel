/**
 * The ease table: how a change speeds up and settles. One table in the core that every key, way and
 * device reads (docs/design/2026-10-motion-grammar.md, section 4.6), so a curve is named, never copied.
 *
 * Every curve takes u, how far through its seconds a change is (clamped to 0..1), and returns how far
 * the value has gone: 0 at the start, 1 at the end. Only `back` leaves 0..1 on the way (it overshoots).
 *
 *   linear  steady from start to end
 *   in      starts slow and speeds up (u²): leaving the frame
 *   out     starts fast and slows into place (1 − (1 − u)²): arriving
 *   inOut   slow, fast, slow (smoothstep, u² (3 − 2u)): EXACTLY kits/whiteboard/board.mjs · ease, the
 *           curve every film used before the table, so the old name still draws the same pixels
 *   back    arrives, overshoots about 10% past the end and settles back (Penner's back-out, 1.70158)
 *   walk    a walker's pace: speeds up over the first fifth, steady, slows over the last fifth (the
 *           speed is a trapezoid); never overshoots, so `reach` may use it
 *   jump    no in-between: the start value until the change ends, then the end value (Flash's hold
 *           keyframe; not called `hold`, which keeps its pacing.json meaning, a pause after a line)
 *
 * `spring` (kits/paper/paper.mjs · spring), `bounce` and four-number curves are on the later list.
 */

const clamp01 = n => Math.max(0, Math.min(1, n));

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

/** The table, by name. */
export const EASES = Object.freeze({
  linear: u => clamp01(u),
  in: u => clamp01(u) ** 2,
  out: u => 1 - (1 - clamp01(u)) ** 2,
  inOut,
  back,
  walk,
  jump: u => (u >= 1 ? 1 : 0),
});

/** The curve named `name`, or a refusal that names the eases there are; `where` says which entry asked. */
export function easeNamed(name, where = 'ease') {
  if (typeof name === 'string' && Object.hasOwn(EASES, name)) return EASES[name];
  throw new Error(`${where}: "${name}" is not an ease; the eases are ${Object.keys(EASES).join(', ')} (spring, bounce and four-number curves are not offered yet)`);
}
