/**
 * The stage's timing: every number an action moves by, in one table, and the one shape arms and doors swing with.
 * Pure functions of time, like every frame.
 *
 *   STAGE.arm    a reach or a point: winds back a little, swings out, passes its end and settles (seconds, and how far)
 *   STAGE.door   a door or a lid, the same shape, a little slower
 *   swing(τ, s)  that shape, τ seconds after the move starts: 0 before the wind-back, 1 once it has settled
 *
 * The shape is the one fingers.mjs times a finger with (a wind-back, a quick move, an overshoot, a settle): an arm or
 * a door that snaps from rest to its end reads as a slideshow, one that anticipates and settles reads as acted.
 */

export const STAGE = Object.freeze({
  arm: Object.freeze({anticipate: .08, move: .2, settle: .2, lift: .1, overshoot: .1}),
  door: Object.freeze({anticipate: .1, move: .35, settle: .25, lift: .05, overshoot: .08}),
  /** How long a point holds when it has no `until` (seconds). */
  hold: 1.2,
  /** How long an arm takes to come back down (seconds). */
  lower: .3,
  /** A thing that fades away (eaten, used up): seconds. */
  fade: .5,
  /** Eyes turning to a new thing: seconds. */
  look: .35,
  /** A count badge's pop as each thing lands: seconds. */
  badge: .3,
  /** How long hands stay up after the last finger moves, without `until` (seconds). */
  fingers: 1.5,
  /** How far a person reaches from where they stand, as a share of their size (standing height). */
  reach: .75,
  /** How far past the frame's edge a person walks to when they come in or go out (px, plus half their size). */
  offstage: 60,
});

const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

/**
 * The swing shape, τ seconds after the move starts: a wind-back of `lift` over `anticipate` before it, a quick move
 * past the end by `overshoot` over `move`, a settle back over `settle`. Exactly 0 before and 1 after; smooth at every
 * join (the speed is 0 at each).
 */
export function swing(τ, {anticipate, move, settle, lift, overshoot}) {
  if (τ < -anticipate) return 0;
  if (τ < 0) return -lift * smooth((τ + anticipate) / anticipate);
  if (τ < move) { const c = Math.cos(Math.PI * τ / move); return -lift * (1 + c) / 2 + (1 + overshoot) * (1 - c) / 2; }
  if (τ < move + settle) return 1 + overshoot * (1 - smooth((τ - move) / settle));
  return 1;
}

/** How long the swing takes from its wind-back to settled (seconds). */
export const swingSeconds = s => s.anticipate + s.move + s.settle;

/**
 * An arm held out for an action from `start` to `end` (seconds): it swings out from `start` (winding back just
 * before), stays out, and comes back down over STAGE.lower after `end`. 0 at rest, about 1 out (it passes 1 a little
 * as it arrives).
 */
export function armAmount(t, start, end) {
  if (t < start - STAGE.arm.anticipate || t > end + STAGE.lower) return 0;
  const out = swing(t - start, STAGE.arm);
  return t <= end ? out : out * (1 - smooth((t - end) / STAGE.lower));
}

export {smooth};
