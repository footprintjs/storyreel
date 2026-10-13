/**
 * A clip on the film's clock: which two of its frames a moment falls between, and the pose there, drawn straight
 * between them. Frames are the rig's (torso lengths); the pose is the world's px (pose.mjs). Pure functions of time.
 */
const lerp = (a, b, u) => a + (b - a) * u;   // a when the two are the same: a planted foot stays exactly where it is

/**
 * The clip's clock: `count` frames at `fps`, from `start` (film seconds), played at `speed` (2: twice as fast).
 * Played once, it holds its last frame after `end`; looped, it repeats for ever, each repeat carrying on from where
 * the last left off (`cycle` counts the repeats: a looped walk keeps walking). at(t) → {a, b, u, cycleA, cycleB,
 * phase}: the frames either side of t, how far between them (0..1), the repeat each is in, and before | clip | after.
 */
export function clipClock({count, fps, start, speed, loop}) {
  const rate = fps * speed, pass = (count - 1) / rate, end = loop ? Infinity : start + pass;
  // (Within a frame of either end a step of the float can land a hair either side: the clamps keep a, b and u in the clip.)
  const between = r => { const a = Math.max(0, Math.min(count - 2, Math.floor(r))); return {a, u: Math.max(0, Math.min(1, r - a))}; };
  const at = t => {
    if (t < start) return {a: 0, b: 0, u: 0, cycleA: 0, cycleB: 0, phase: 'before'};
    // Played once, `end` itself shows the last frame, exactly.
    if (t >= end) return {a: count - 1, b: count - 1, u: 0, cycleA: 0, cycleB: 0, phase: 'after'};
    const r = (t - start) * rate;
    if (!loop) { const {a, u} = between(r); return {a, b: a + 1, u, cycleA: 0, cycleB: 0, phase: 'clip'}; }
    const cycle = Math.floor(r / count), q = r - cycle * count, a = Math.max(0, Math.min(count - 1, Math.floor(q))), u = Math.max(0, Math.min(1, q - a));
    return a + 1 < count ? {a, b: a + 1, u, cycleA: cycle, cycleB: cycle, phase: 'clip'} : {a, b: 0, u, cycleA: cycle, cycleB: cycle + 1, phase: 'clip'};
  };
  return {pass, period: loop ? count / rate : null, end, at};
}

/** Angles between two frames, nested as the pose has them. */
function jointsBetween(A, B, u) {
  return {
    torso: lerp(A.torso, B.torso, u), neck: lerp(A.neck, B.neck, u),
    arms: A.arms.map((arm, j) => ({shoulder: lerp(arm.shoulder, B.arms[j].shoulder, u), elbow: lerp(arm.elbow, B.arms[j].elbow, u)})),
    legs: A.legs.map((leg, j) => ({hip: lerp(leg.hip, B.legs[j].hip, u), knee: lerp(leg.knee, B.legs[j].knee, u)})),
  };
}

/**
 * The pose between frames A and B (u of the way), in the world: `x` is where the clip's first hip centre stands
 * (px), `unit` the px of one torso length, `travel` how far one repeat of a loop carries the body (torso lengths),
 * shifted by each frame's repeat.
 */
export function poseBetween(A, B, {u, cycleA, cycleB, phase}, {x, unit, facing, travel}) {
  const ax = cycleA * travel, bx = cycleB * travel, along = (p, q) => x + lerp(p + ax, q + bx, u) * unit;
  return {
    x: along(A.x, B.x), lift: lerp(A.lift, B.lift, u) * unit, lean: lerp(A.joints.torso, B.joints.torso, u),
    feet: A.feet.map((f, j) => ({x: along(f.x, B.feet[j].x), lift: lerp(f.lift, B.feet[j].lift, u) * unit})),
    swing: lerp(A.swing, B.swing, u), turn: lerp(A.turn, B.turn, u), facing, walking: u < .5 ? A.walking : B.walking, phase,
    joints: jointsBetween(A.joints, B.joints, u),
  };
}
