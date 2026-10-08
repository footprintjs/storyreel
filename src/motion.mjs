/**
 * Motion with weight: closed-form springs, so every value is a pure function of time (frame 812 is drawn
 * without drawing 0–811) and moves the way a thing with mass does — it accelerates, settles, and, when the feel
 * says so, overshoots a hair. A FEEL is a strategy: a stiffness and a damping by name (snappy, default, heavy,
 * playful), or an object {k, d} of your own.
 *
 *   spring(t - at, 'playful')         0 → 1 from `at`, with a visible overshoot (a pop)
 *   track(t, [[0, 800], [2.5, 420]])  a value with many targets: one spring per change, so it never jumps
 *
 * Two of a cartoon's habits, for the figures a kit draws:
 *   heldTime(t, 'twos')               the moment the drawing shown at t was made: each drawing holds for two frames
 *   follow(body, t, {from})           a part that hangs off a moving body (hair, a hem, a bag) chases it on a spring:
 *   lag(body, t, {from})                it lags as the body sets off, swings past as it stops, and settles
 */

/** The named feels. snappy: buttons, leading edges; default: cards, containers; heavy: big type, cameras; playful: pops, stickers. */
export const FEELS = Object.freeze({
  snappy: Object.freeze({k: 320, d: 30}),
  default: Object.freeze({k: 170, d: 26}),
  heavy: Object.freeze({k: 90, d: 20}),
  playful: Object.freeze({k: 220, d: 14}),
});
export const FEEL_NAMES = Object.freeze(Object.keys(FEELS));

/** A feel as given (a name, or {k, d}) → {k, d}; anything else refuses, naming the feels. */
export function readFeel(feel = 'default') {
  if (typeof feel === 'string') {
    if (!Object.hasOwn(FEELS, feel)) throw new Error(`no feel called "${feel}" (the feels are ${FEEL_NAMES.join(', ')}, or {k, d} of your own)`);
    return FEELS[feel];
  }
  if (!(feel && Number.isFinite(feel.k) && Number.isFinite(feel.d) && feel.k > 0 && feel.d > 0)) throw new Error(`a feel is a name (${FEEL_NAMES.join(', ')}) or {k, d}: a stiffness and a damping, both above 0`);
  return feel;
}

/** A damped spring from 0 to 1, `t` seconds after it starts (0 before). Under-damped feels overshoot. */
export function spring(t, feel = 'default') {
  if (!(t > 0)) return 0;
  const {k, d} = readFeel(feel), w0 = Math.sqrt(k), zeta = d / (2 * w0);
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);   // critically damped (and heavier): no overshoot
}

/** A pop: the scale of something arriving at `at`, 0 → 1 with the feel's overshoot (playful by default). */
export const pop = (t, at, feel = 'playful') => spring(t - at, feel);

/**
 * A value with several targets, [[time, value], …] in time order: the first value, plus one spring per change
 * starting at its own time — continuous however close the changes come, and still a pure function of t.
 */
export function track(t, keys, feel = 'default') {
  if (!Array.isArray(keys) || !keys.length || !keys.every(k => Array.isArray(k) && Number.isFinite(k[0]) && Number.isFinite(k[1]))) throw new Error('track: keys are [[time, value], …] (numbers), at least one');
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], feel);
  return v;
}

/**
 * How many frames each drawing holds (a TIMING is a strategy, by name or a number of frames): ones, a new drawing on
 * every frame; twos, the cartoon's habit; threes, a slower, more limited look.
 */
export const TIMINGS = Object.freeze({ones: 1, twos: 2, threes: 3});
export const TIMING_NAMES = Object.freeze(Object.keys(TIMINGS));

const readTiming = timing => {
  if (typeof timing === 'string') {
    if (!Object.hasOwn(TIMINGS, timing)) throw new Error(`no timing called "${timing}" (the timings are ${TIMING_NAMES.join(', ')}, or the frames each drawing holds, 1–8)`);
    return TIMINGS[timing];
  }
  if (!(Number.isInteger(timing) && timing >= 1 && timing <= 8)) throw new Error(`a timing is a name (${TIMING_NAMES.join(', ')}) or the frames each drawing holds, 1–8, not ${JSON.stringify(timing)}`);
  return timing;
};

/**
 * The moment the drawing shown at t was made. Hand-drawn cartoons hold each drawing for two frames ("on twos")
 * while the camera moves on every frame: the held drawings read as made by hand, where a figure that changes on
 * every frame slides like a puppet. Work out everything about a held figure from this moment (its pose, its place,
 * its mouth) and leave the camera and the room on t. Frames are counted at `fps` (30, StoryReel's rate unless the
 * film is rendered at another); t is taken to its nearest frame first, so motion blur's sub-moments, which stay
 * within half a frame, share their frame's drawing. On ones it is t itself.
 */
export function heldTime(t, timing = 'twos', {fps = 30} = {}) {
  if (!Number.isFinite(t)) throw new Error(`heldTime: t is seconds, not ${JSON.stringify(t)}`);
  const n = readTiming(timing);
  if (!(Number.isFinite(fps) && fps > 0)) throw new Error(`heldTime: fps is the film's frames a second (30 unless it is rendered at another rate), not ${JSON.stringify(fps)}`);
  if (n === 1) return t;
  return Math.floor(Math.round(t * fps) / n) * n / fps + 0;   // (+ 0: a sub-moment just before 0 holds 0, not -0)
}

// follow reads the body 240 times a second (between two readings it takes the body to move in a straight line), and
// keeps the state at every 240th step (each second of steps), per body function and per (from, feel, drag), so the
// next frame starts from there instead of from `from`.
const STEPS = 240, followed = new WeakMap();

/** A body's value as a list of numbers ([x] for a number), refused unless every number is finite. */
const pointOf = (value, u, size) => {
  const p = typeof value === 'number' ? [value] : Array.isArray(value) ? [...value] : null;   // (a copy: a body may reuse its array)
  if (!p || !p.length || !p.every(Number.isFinite) || (size !== undefined && p.length !== size)) {
    throw new Error(`follow: body(u) gives the point the part hangs from, a number or [x, y], the same shape at every moment from \`from\` to t — at u = ${+u.toFixed(4)} it gave ${JSON.stringify(value)} (give the place even while the body is out of sight)`);
  }
  return p;
};

/**
 * One step of dt from a to b (the body's places at the step's two ends; it moves between them at one speed, vb). In
 * the part's offset from the body, e, the joint's spring pulls it back (k), the joint damps how fast it moves AGAINST
 * the body (d: a steady walk needs no pull) and the air, when there is drag, holds back how fast it moves at all:
 * e'' + (d + drag) e' + k e = −drag · vb. That is solved exactly over the step (no step is too long for a stiff or a
 * heavily damped joint); where the body changes speed, between steps, e' jumps by the change, as a jolt does.
 */
const stepped = ({p, v}, a, b, dt, {k, d}, drag) => {
  const w = Math.sqrt(k), z = (d + drag) / (2 * w), out = {p: [], v: []};
  for (let j = 0; j < p.length; j++) {
    const vb = (b[j] - a[j]) / dt, rest = -drag * vb / k, x0 = p[j] - a[j] - rest, x1 = v[j] - vb;
    const [x, dx] = settle(x0, x1, w, z, dt);
    out.p.push(b[j] + rest + x); out.v.push(vb + dx);
  }
  return out;
};

/** x'' + 2zw x' + w² x = 0 from x0, x1 (x, x') after dt: the damped spring's exact path, under-, critically or over-damped. */
function settle(x0, x1, w, z, dt) {
  if (Math.abs(z - 1) < 1e-9) { const B = x1 + w * x0, e = Math.exp(-w * dt); return [(x0 + B * dt) * e, (B - w * (x0 + B * dt)) * e]; }
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z), B = (x1 + z * w * x0) / wd, e = Math.exp(-z * w * dt), c = Math.cos(wd * dt), sn = Math.sin(wd * dt);
    return [e * (x0 * c + B * sn), e * ((B * wd - z * w * x0) * c - (x0 * wd + z * w * B) * sn)];
  }
  const q = Math.sqrt(z * z - 1), r1 = -w * (z - q), r2 = -w * (z + q), C1 = (x1 - r2 * x0) / (r1 - r2), C2 = x0 - C1;
  const e1 = Math.exp(r1 * dt), e2 = Math.exp(r2 * dt);
  return [C1 * e1 + C2 * e2, C1 * r1 * e1 + C2 * r2 * e2];
}

/**
 * Follow-through: where a part that hangs off a moving body has got to at t. The part hangs on a springy joint with a
 * feel (playful by default: it swings past and settles; heavy swings slower; your own {k, d}): it leans back as the
 * body sets off, swings on past as the body stops, and settles, and while the body moves steadily it hangs as it does
 * at rest. `drag` (per second, 0 by default) adds the air: a hem or a scarf also trails a moving body, by drag × speed
 * ÷ k. body: u → a number or [x, y], the point the part hangs from, for every moment from `from` to t; before `from`
 * the part is at rest on the body (`from`: a moment the body is still, the start of the scene, say). The swing is
 * `lag`. A pure function of t: it steps from `from` in steps of 1/240 s (each solved exactly), always the same steps,
 * so frame 812 is the same whichever frames were drawn before it. Make the body function once (when the world is
 * compiled) and pass that same function every frame: the steps already taken are kept for it; and set `from` to the
 * start of the scene, not 0, so a frame late in a long film does not step through the whole film first.
 */
export function follow(body, t, {from = 0, feel = 'playful', drag = 0} = {}) {
  if (typeof body !== 'function') throw new Error('follow: body is a function of time, u → the point the part hangs from (a number or [x, y])');
  if (!(Number.isFinite(t) && Number.isFinite(from))) throw new Error(`follow: t and from are seconds, not ${JSON.stringify({t, from})}`);
  if (!(Number.isFinite(drag) && drag >= 0)) throw new Error(`follow: drag is how hard the air holds the part back, per second, 0 or more (0: none), not ${JSON.stringify(drag)}`);
  const f = readFeel(feel), scalar = typeof body(from) === 'number', shape = p => (scalar ? p[0] : [...p]);
  if (t <= from) return shape(pointOf(body(t), t));
  const at = u => pointOf(body(u), u, size), size = pointOf(body(from), from).length;
  // The state after n whole steps, from the nearest kept state at or before it. At `from` the part is at rest on
  // the body, moving as the body moves.
  let byStart = followed.get(body);
  if (!byStart) followed.set(body, byStart = new Map());
  const key = `${from}|${f.k}|${f.d}|${drag}`;
  if (!byStart.has(key)) { const a = at(from), b = at(from + 1 / STEPS); byStart.set(key, [{p: a, v: a.map((x, j) => (b[j] - x) * STEPS)}]); }
  const kept = byStart.get(key), n = Math.floor((t - from) * STEPS + 1e-9);
  let i = Math.min(kept.length - 1, Math.floor(n / STEPS)), s = kept[i], here = at(from + i);
  for (let m = i * STEPS; m < n; m++) {
    const next = at(from + (m + 1) / STEPS);
    s = stepped(s, here, next, 1 / STEPS, f, drag); here = next;
    if ((m + 1) % STEPS === 0 && (m + 1) / STEPS === kept.length) kept.push(s);
  }
  // The last part of a step, to t itself (never kept: the kept states are whole steps only).
  const rest = t - (from + n / STEPS);
  if (rest > 1e-12) s = stepped(s, here, at(t), rest, f, drag);
  return shape(s.p);
}

/** How far the part trails the body at t (follow − body): 0 at rest; behind the way the body moves; past it as the body stops. */
export function lag(body, t, options = {}) {
  const at = follow(body, t, options), b = body(t);
  return typeof at === 'number' ? at - b : at.map((v, j) => v - b[j]);
}
