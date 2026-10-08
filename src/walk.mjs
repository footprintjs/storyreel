/**
 * A walk, the whole flow of it, as numbers a kit draws a figure from: feet that never slide. It sets off (the body
 * dips and leans back a moment, and turns to face the way it goes: anticipation), steps (each foot lifts, travels on
 * an arc and is planted, and stays put while the body passes over it; the body bobs, down just after a foot lands
 * and up as the other passes; the arms swing against the legs), stops (the last step brings the feet together) and
 * settles (the body rocks on past its feet and comes back, and turns back to us: follow-through). The steps are
 * worked out from the distance and the figure's size, so the feet are planted exactly where the body passes.
 *
 * A WALK STYLE is a strategy: by name (stroll, brisk, bouncy, tiptoe) or an object of your own with the same keys.
 * Pure functions of time, like every frame: plan the walk once, when the world is compiled, and ask `at(t)` every
 * frame; what a foot or a swing looks like is the kit's drawing.
 *
 *   const w = walk({from: 130, to: 1800, start: 13.6, size: 475, style: 'stroll'})
 *   w.at(t)     → {x, lift, lean, feet: [{x, lift}, {x, lift}], swing, turn, facing, walking, phase}
 *     x       the body's place on the floor (between its feet); lift: how far it rises (+) or sinks (−) from standing
 *     lean    radians, + toward the way it walks; feet: each foot's place on the floor and its height off it (feet[0]
 *             steps first); swing: −arms…arms (the style's 0–1), + while feet[0] is ahead (so the arm on feet[1]'s side is
 *             forward) — in the half steps that start and end the walk it eases in and out from 0
 *     turn    0 facing us … 1 turned along the way; phase: before | set off | step | settle | after
 *   w.arrive    when the feet come together at `to`; w.end: when it has settled; w.steps: how many steps
 */
const clamp01 = n => Math.max(0, Math.min(1, n));
/** A value as a message shows it: a number as itself (NaN, Infinity), anything else as JSON. */
const shown = v => (typeof v === 'number' ? String(v) : JSON.stringify(v));

/**
 * The named styles. Lengths are shares of the figure's size (its standing height); cadence is steps a second.
 *   stroll  a grown-up's calm walk          brisk   quicker, longer steps, leaning into it
 *   bouncy  a cartoon child's springy walk  tiptoe  slow, high, careful steps, hunched a little
 */
export const WALKS = Object.freeze({
  stroll: Object.freeze({cadence: 1.8, stride: .42, bob: .02, bounce: 0, lift: .05, lean: .03, arms: .8, anticipate: .3, dip: .02, settle: .6, rock: .05}),
  brisk: Object.freeze({cadence: 2.2, stride: .46, bob: .022, bounce: .2, lift: .06, lean: .08, arms: 1, anticipate: .25, dip: .025, settle: .55, rock: .07}),
  bouncy: Object.freeze({cadence: 2.6, stride: .34, bob: .05, bounce: 1, lift: .08, lean: .02, arms: 1, anticipate: .3, dip: .045, settle: .6, rock: .06}),
  tiptoe: Object.freeze({cadence: 1.3, stride: .24, bob: .012, bounce: 0, lift: .11, lean: .14, arms: .3, anticipate: .45, dip: .04, settle: .7, rock: .03}),
});
export const WALK_NAMES = Object.freeze(Object.keys(WALKS));
const KEYS = Object.keys(WALKS.stroll);

/** A style as given (a name, or an object with every key of a named one, numbers ≥ 0, cadence and stride above 0) → the style. */
export function readWalk(style = 'stroll') {
  if (typeof style === 'string') {
    if (!Object.hasOwn(WALKS, style)) throw new Error(`no walk called "${style}" (the walks are ${WALK_NAMES.join(', ')}, or {${KEYS.join(', ')}} of your own)`);
    return WALKS[style];
  }
  const bad = !style || typeof style !== 'object' ? KEYS : KEYS.filter(k => !(Number.isFinite(style[k]) && style[k] >= 0));
  if (bad.length || !(style.cadence > 0 && style.stride > 0) || style.bounce > 1 || style.arms > 1) {
    throw new Error(`a walk style is a name (${WALK_NAMES.join(', ')}) or {${KEYS.join(', ')}}: numbers of 0 or more, cadence and stride above 0, bounce and arms 0–1${bad.length && style && typeof style === 'object' ? ` (check ${bad.join(', ')})` : ''}`);
  }
  return Object.freeze(Object.fromEntries(KEYS.map(k => [k, style[k]])));   // (a copy: changing the object later changes no walk)
}

// The body's height over a step: lowest just after the foot lands (.15 of the step), highest as the other passes;
// smooth for a walk, a hard bounce off the low point for a springy one.
const bobAt = (u, bounce) => (1 - bounce) * (.5 - .5 * Math.cos(2 * Math.PI * (u - .15))) + bounce * Math.abs(Math.sin(Math.PI * (u - .15)));
const smooth = u => { u = clamp01(u); return u * u * (3 - 2 * u); };
// The rock as a body settles, over the settle's time u (0..1): a quick push past the feet that eases back to 0 by the
// end, scaled so its peak is exactly the style's rock.
const rockShape = u => 3 * u * Math.exp(1 - 3 * u) * (1 - smooth(u));
const ROCK_PEAK = Math.max(...Array.from({length: 1001}, (_, i) => rockShape(i / 1000)));
const rockAt = u => rockShape(u) / ROCK_PEAK;
/** Standing at x: before `start` or after it (a walk with nowhere to go). */
const standing = (t, x, start, facing) => {
  if (!Number.isFinite(t)) throw new Error(`walk: at(t) takes seconds, not ${shown(t)}`);
  return {x, lift: 0, lean: 0, feet: [{x, lift: 0}, {x, lift: 0}], swing: 0, turn: 0, facing, walking: false, phase: t < start ? 'before' : 'after'};
};

/**
 * Plan a walk from `from` to `to` (places on the floor, in the world's px) starting at `start` (seconds: the set-off
 * begins there, the first foot lifts `anticipate` seconds later), for a figure `size` px tall, in a style.
 * `seconds` (optional) fits the stepping to that long instead of the style's cadence. Returns {at(t), arrive, end,
 * steps, stepSeconds, facing}.
 */
export function walk({from, to, start, size, style = 'stroll', seconds = null} = {}) {
  if (![from, to, start].every(Number.isFinite)) throw new Error(`walk: from and to are places on the floor (px) and start is seconds, not from ${shown(from)}, to ${shown(to)}, start ${shown(start)}`);
  if (!(Number.isFinite(size) && size > 0)) throw new Error(`walk: size is the figure's standing height in px (it sets the length of a step), not ${shown(size)}`);
  if (seconds !== null && !(Number.isFinite(seconds) && seconds > 0)) throw new Error(`walk: seconds is how long the stepping takes (more than 0), or null for the style's own pace, not ${shown(seconds)}`);
  const S = readWalk(style), facing = to < from ? -1 : 1, d = Math.abs(to - from);
  // Nowhere to go: standing where it is, before and after `start`.
  if (d === 0) return Object.freeze({at: t => standing(t, from, start, facing), arrive: start, end: start, steps: 0, stepSeconds: 0, facing, from, to, start});
  // Steps: the first and the last move the body half a step, the rest a whole one, so n steps cover n − 1 steps of length s.
  const n = Math.max(2, Math.round(d / (S.stride * size)) + 1), s = d / (n - 1), T = seconds === null ? 1 / S.cadence : seconds / n;
  if (seconds !== null && !(n / seconds >= S.cadence / 2 && n / seconds <= S.cadence * 2)) {
    throw new Error(`walk: ${n} steps in ${seconds} s is ${(n / seconds).toFixed(2)} steps a second, and this style walks ${S.cadence} — give between ${+(n / (S.cadence * 2)).toFixed(2)} and ${+(n / (S.cadence / 2)).toFixed(2)} seconds, a shorter or longer walk, or another style`);
  }
  const lift = S.lift * size * Math.min(1, s / (S.stride * size));   // (a tiny shuffle lifts its feet a little, not a full step's height)
  const t0 = start + S.anticipate, arrive = t0 + n * T, end = arrive + S.settle;
  // Where each foot is planted after step k (feet[0] moves first): the moving foot goes to the body's place plus half a step.
  const planted = k => {
    const lead = Math.min(k, n - 1), trail = Math.max(0, Math.min(k - 1, n - 1)), at = j => from + facing * j * s;
    const moved = k % 2 === 1 ? 0 : 1;   // after step k, the foot that moved on it
    if (k === 0) return [from, from];
    if (k >= n) return [to, to];
    return moved === 0 ? [at(lead), at(trail)] : [at(trail), at(lead)];
  };
  const bodyAt = (k, u) => {
    // The body's place during step k (1-based), u through it: easing in on the first step, out on the last.
    if (k === 1) return from + facing * (s / 2) * u * u;
    if (k === n) return to - facing * (s / 2) * (1 - u) * (1 - u);
    return from + facing * ((k - 1.5) * s + s * u);
  };
  const ramp = (k, u) => (k === 1 ? smooth(u) : k === n ? 1 - smooth(u) : 1);   // the walk's weight: it grows in the first step, fades in the last
  const still = (x, phase, extra = {}, feetAt = x) => ({x, lift: 0, lean: 0, feet: [{x: feetAt, lift: 0}, {x: feetAt, lift: 0}], swing: 0, turn: 0, facing, walking: false, phase, ...extra});

  function at(t) {
    if (!Number.isFinite(t)) throw new Error(`walk: at(t) takes seconds, not ${shown(t)}`);
    if (t < start) return still(from, 'before');
    if (t < t0) {
      // Setting off: a dip and a lean back (and a hair back from the way it goes), turning to face along it.
      const u = (t - start) / S.anticipate, a = Math.sin(Math.PI * u);
      return still(from - facing * .015 * size * a, 'set off', {lift: -S.dip * size * a, lean: -S.lean * .6 * a, turn: smooth(u)}, from);
    }
    if (t < arrive) {
      const k = Math.min(n, Math.floor((t - t0) / T) + 1), u = (t - t0) / T - (k - 1), w = ramp(k, u);
      const [p, q] = [planted(k - 1), planted(k)], mover = k % 2 === 1 ? 0 : 1, a = smooth(u);
      const feet = [0, 1].map(j => (j === mover ? {x: p[j] + (q[j] - p[j]) * a, lift: lift * Math.sin(Math.PI * u)} : {x: p[j], lift: 0}));
      // The arms swing against the legs: the arm opposite the foot that last went forward is forward.
      const swing = S.arms * w * Math.sin(Math.PI * (k - 1 + u - .5));
      // (A style with no set-off turns during its first step; one with no settle turns back during its last.)
      const turn = k === 1 && !S.anticipate ? smooth(u) : k === n && !S.settle ? 1 - smooth(u) : 1;
      return {x: bodyAt(k, u), lift: S.bob * size * bobAt(u, S.bounce) * w, lean: S.lean * w, feet, swing, turn, facing, walking: true, phase: 'step'};
    }
    // Settling: the feet together at `to`; the body rocks on past them and comes back (to 0 by the end); it turns back to us.
    const tau = t - arrive;
    if (t >= end) return still(to, 'after');
    const rock = S.rock * rockAt(tau / S.settle);
    return still(to, 'settle', {lean: rock, lift: -S.dip * .5 * size * Math.sin(Math.PI * Math.min(1, tau / (S.settle * .5))), turn: 1 - smooth(tau / S.settle)});
  }
  return Object.freeze({at, arrive, end, steps: n, stepSeconds: T, facing, from, to, start});
}
