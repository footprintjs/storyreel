/**
 * Principles: four of the animator's principles as plain helpers a kit draws any move with. They are numbers,
 * never drawings, and pure functions of time: the same t gives the same value whichever frames came before.
 *
 *   anticipate(t, {at, distance})         a small counter-move before a move: wind back, then go
 *   squash(t, {velocity, landings})        squash and stretch that keep the volume (sx × sy = 1), from speed and impacts
 *   envelope(age, 'pop') · burst(t, hits)  a one-shot event (a flash, a pop, a shake): a quick rise, an exponential fade;
 *                                           burst adds every event by its own age, so overlapping events add;
 *   envelopeShare(age, 'pop')              how much of the event has come by `age`: how far a thing it pushed has gone
 *   arc(from, to, u)                       a point-to-point path that curves a little, as a hand's does
 *
 * The walk (walk.mjs) and acting (acting.mjs) already anticipate in their own way (a dip before setting off, a squint
 * before a change of mood); these are the same ideas for any other move.
 */

/** A value as a message shows it: a number as itself (NaN, Infinity), anything else as JSON. */
const shown = v => (typeof v === 'number' ? String(v) : JSON.stringify(v));
const clamp01 = n => Math.max(0, Math.min(1, n));
const smooth = u => { u = clamp01(u); return u * u * (3 - 2 * u); };
/** A number, or a point [x, y, …], each finite: what anticipate takes as a distance. */
const isAmount = v => Number.isFinite(v) || (Array.isArray(v) && v.length > 0 && v.every(Number.isFinite));

const ANTICIPATE = Object.freeze({lead: .15, release: .1, amount: .1, max: 40});

/**
 * Anticipation: the counter-move before a move — a thing about to go right first eases a little left. Give the move's
 * start (`at`) and its `distance` (a number, or [dx, dy]); returns the offset to add to the thing's place, the same
 * shape as the distance. Over `lead` seconds before `at` the thing winds back by `amount` of the distance (10%, at
 * most `max` pixels: 40, a small move on the 1600×900 frame); over `release` seconds after `at` the wind-up lets go
 * while the move itself begins. 0 before the wind-up and after the release; smooth (smoothstep) both ways.
 */
export function anticipate(t, {at, distance, lead = ANTICIPATE.lead, release = ANTICIPATE.release, amount = ANTICIPATE.amount, max = ANTICIPATE.max} = {}) {
  if (!(Number.isFinite(t) && Number.isFinite(at))) throw new Error(`anticipate: t and at (when the move starts) are seconds, not t ${shown(t)}, at ${shown(at)}`);
  if (!isAmount(distance)) throw new Error(`anticipate: distance is how far the move goes, a number or [dx, dy], not ${shown(distance)}`);
  if (!(Number.isFinite(lead) && lead > 0 && Number.isFinite(release) && release > 0)) throw new Error(`anticipate: lead and release are seconds, above 0 (the wind-up before the move, its letting go after), not lead ${shown(lead)}, release ${shown(release)}`);
  if (!(Number.isFinite(amount) && amount >= 0 && amount <= .5)) throw new Error(`anticipate: amount is the share of the distance it winds back, 0 to 0.5 (a small counter-move: 0.1 by default), not ${shown(amount)}`);
  if (!(max >= 0)) throw new Error(`anticipate: max is the most it winds back, in pixels, 0 or more (Infinity for no limit), not ${shown(max)}`);
  const w = t <= at ? smooth((t - (at - lead)) / lead) : 1 - smooth((t - at) / release);
  const vec = Array.isArray(distance) ? distance : [distance], size = Math.hypot(...vec);
  const k = size > 0 ? -w * Math.min(amount * size, max) / size : 0;
  const offset = vec.map(d => d * k + 0);   // (+ 0: never −0)
  return Array.isArray(distance) ? offset : offset[0];
}

const SQUASH = Object.freeze({k: .0002, max: .35, settle: .08, wobble: .2});

/** One landing's squash at its age: all of it on contact, then a quick wobble (past round into a little stretch) that dies away. */
function landed(age) {
  if (age < 0) return 0;
  const fade = Math.exp(-age / SQUASH.settle);
  return fade < 1e-3 ? 0 : fade * Math.cos(2 * Math.PI * age / SQUASH.wobble);
}

/**
 * Squash and stretch, keeping the volume: {sx, sy} with sx × sy = 1. A thing moving at `velocity` (pixels a second on
 * the 1600×900 frame, either sign) stretches along its motion by k × speed (k: 0.0002, so 1000 px/s stretches it 20%);
 * on each landing ({at, speed}: the moment it hit, how fast) it squashes by k × speed on contact, wobbles once past
 * round and settles within about 0.3 s; landings that overlap add. Both are capped at `max` (0.35). `axis` is the
 * motion's: 'y' (a fall, a bounce: sy is along it) or 'x'. Scale the thing about the point it lands on.
 */
export function squash(t, {velocity = 0, landings = [], axis = 'y', k = SQUASH.k, max = SQUASH.max} = {}) {
  if (!Number.isFinite(t)) throw new Error(`squash: t is seconds, not ${shown(t)}`);
  if (!Number.isFinite(velocity)) throw new Error(`squash: velocity is the thing's speed along its motion, pixels a second, not ${shown(velocity)}`);
  if (!(Array.isArray(landings) && landings.every(l => l && Number.isFinite(l.at) && Number.isFinite(l.speed) && l.speed >= 0))) throw new Error('squash: landings is a list of {at, speed}: when the thing hit, and how fast (pixels a second, 0 or more)');
  if (axis !== 'x' && axis !== 'y') throw new Error(`squash: axis is the motion's, 'y' (a fall) or 'x', not ${shown(axis)}`);
  if (!(Number.isFinite(k) && k >= 0)) throw new Error(`squash: k is the stretch per pixel a second, 0 or more (${SQUASH.k} by default), not ${shown(k)}`);
  if (!(max > 0 && max < 1)) throw new Error(`squash: max is the most it squashes or stretches, above 0 and below 1 (${SQUASH.max} by default), not ${shown(max)}`);
  const stretch = Math.min(max, k * Math.abs(velocity));
  const hit = landings.reduce((sum, l) => sum + Math.min(max, k * l.speed) * landed(t - l.at), 0);
  const along = (1 + stretch) * (1 - Math.max(-max, Math.min(max, hit))), across = 1 / along;
  return axis === 'y' ? {sx: across, sy: along} : {sx: along, sy: across};
}

/** The one-shot shapes: how fast each rises (attack, seconds) and fades (decay: the time it takes to fall to 1/e). */
export const BURSTS = Object.freeze({
  flash: Object.freeze({attack: .04, decay: .1}),
  pop: Object.freeze({attack: .06, decay: .18}),
  shake: Object.freeze({attack: .08, decay: .3}),
});
export const BURST_NAMES = Object.freeze(Object.keys(BURSTS));

/** A shape as given (a name, or {attack, decay}) → {attack, decay}; anything else refuses, naming the shapes. */
function readBurst(shape) {
  if (typeof shape === 'string') {
    if (!Object.hasOwn(BURSTS, shape)) throw new Error(`envelope: no shape called "${shape}" (the shapes are ${BURST_NAMES.join(', ')}, or {attack, decay} of your own)`);
    return BURSTS[shape];
  }
  if (!(shape && typeof shape === 'object' && Number.isFinite(shape.attack) && Number.isFinite(shape.decay))) throw new Error(`envelope: a shape is a name (${BURST_NAMES.join(', ')}) or {attack, decay}, in seconds`);
  if (!(shape.attack >= .04 && shape.attack <= .12)) throw new Error(`envelope: attack is 0.04–0.12 s (a one-shot event rises in 40–120 ms: quicker reads as a glitch, slower as a fade), not ${shown(shape.attack)}`);
  if (!(shape.decay > 0)) throw new Error(`envelope: decay is the seconds it takes to fall to about a third, above 0, not ${shown(shape.decay)}`);
  return shape;
}

/**
 * A one-shot event's strength at its age (seconds since it happened): 0 before, rising over `attack` (smoothstep, so
 * it starts gently), 1 at the top, then falling exponentially (to 1/e over `decay` seconds) and 0 once it is below a
 * thousandth. shape: flash, pop, shake, or {attack (0.04–0.12 s), decay}.
 */
export function envelope(age, shape = 'pop') {
  if (!Number.isFinite(age)) throw new Error(`envelope: age is seconds since the event, not ${shown(age)}`);
  const {attack, decay} = readBurst(shape);
  if (age <= 0) return 0;
  if (age < attack) return smooth(age / attack);
  const v = Math.exp(-(age - attack) / decay);
  return v < 1e-3 ? 0 : v;
}

/**
 * How much of a one-shot event has come by `age`, 0..1: its envelope added up from the event to `age`, as a share of
 * all of it (0 before; nearly 1 a few decays after). A thing the event pushes goes this share of its whole way: fast as
 * the event rises, slower as it fades (cloudBurst's puffs, pushed by its pop). The envelope's own shape, in closed form:
 * the smoothstep rise adds attack/2, the exponential fall adds decay (the fall's last thousandth, which envelope drops,
 * is kept here, so the share never jumps).
 */
export function envelopeShare(age, shape = 'pop') {
  if (!Number.isFinite(age)) throw new Error(`envelopeShare: age is seconds since the event, not ${shown(age)}`);
  const {attack, decay} = readBurst(shape), all = attack / 2 + decay;
  if (age <= 0) return 0;
  if (age < attack) { const x = age / attack; return attack * (x ** 3 - x ** 4 / 2) / all; }
  return (attack / 2 + decay * (1 - Math.exp(-(age - attack) / decay))) / all;
}

/**
 * Every event's envelope at t, added: events are times, or {at, strength?} (strength 1 by default). Each event's
 * strength comes from its own age, so two flashes close together add (the second lands on what is left of the first).
 */
export function burst(t, events, shape = 'pop') {
  if (!Number.isFinite(t)) throw new Error(`burst: t is seconds, not ${shown(t)}`);
  if (!Array.isArray(events)) throw new Error('burst: events is a list of times, or of {at, strength?}');
  readBurst(shape);
  let sum = 0;
  for (const e of events) {
    const at = typeof e === 'number' ? e : e?.at, strength = typeof e === 'number' ? 1 : e?.strength ?? 1;
    if (!(Number.isFinite(at) && Number.isFinite(strength))) throw new Error(`burst: an event is a time or {at, strength?}, numbers, not ${shown(e)}`);
    sum += strength * envelope(t - at, shape);
  }
  return sum;
}

const TOWARD = Object.freeze({up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]});

/**
 * A point on a path from `from` to `to` ([x, y] each) at u (0 at from, 1 at to; past 1, as an overshooting ease
 * goes, it carries on along the curve): not a straight line but a slight curve, as a hand moves. `bend` is how far
 * the middle of the path sits off the straight line, as a share of the distance (0.12; 0 is straight); `toward`
 * is the side it bulges to on the screen: up (by default: a toss, a reach), down, left or right — a move along that
 * very direction bulges to its own left. Pass u through an ease for the speed.
 */
export function arc(from, to, u, {bend = .12, toward = 'up'} = {}) {
  const point = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  if (!(point(from) && point(to))) throw new Error(`arc: from and to are points, [x, y], not ${shown(from)}, ${shown(to)}`);
  if (!Number.isFinite(u)) throw new Error(`arc: u is how far along, 0 at from, 1 at to, not ${shown(u)}`);
  if (!Number.isFinite(bend)) throw new Error(`arc: bend is how far the middle sits off the straight line, a share of the distance (0.12), not ${shown(bend)}`);
  if (!Object.hasOwn(TOWARD, toward)) throw new Error(`arc: toward is the side it bulges to, ${Object.keys(TOWARD).join(', ')}, not ${shown(toward)}`);
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]], len = Math.hypot(dx, dy);
  if (len === 0) return [from[0], from[1]];
  // The perpendicular on the travel's left (on a screen, y down: moving right, its left is up), flipped to face `toward`.
  const left = [dy / len, -dx / len], [tx, ty] = TOWARD[toward], side = left[0] * tx + left[1] * ty < -1e-9 ? -1 : 1;
  // A quadratic Bézier's middle sits half way to its control point: the control goes twice the bulge off the line.
  const c = [(from[0] + to[0]) / 2 + side * left[0] * 2 * bend * len, (from[1] + to[1]) / 2 + side * left[1] * 2 * bend * len];
  const a = (1 - u) ** 2, b = 2 * (1 - u) * u, d = u * u;
  return [a * from[0] + b * c[0] + d * to[0], a * from[1] + b * c[1] + d * to[1]];
}
