/**
 * The stage's timing: every number an action moves by, in one table, and the held swing arms and hands move with.
 * The swing itself is swing.mjs's (the shape fingers.mjs times a finger with). Pure functions of time.
 *
 *   STAGE.arm    a reach or a point: winds back a little, swings out, passes its end and settles (seconds, and how far)
 *   STAGE.door   a door or a lid, the same shape, a little slower
 *   heldAt(w, t) an arm (or a pair of hands) held out over a window {start, end, a0}: it swings out from a0 — where the
 *                window before left it — winding back first only when it starts from rest, and lowers after `end`
 */
import {swing, smooth} from '../swing.mjs';

export const STAGE = Object.freeze({
  arm: Object.freeze({anticipate: .08, move: .2, settle: .2, lift: .1, overshoot: .1}),
  door: Object.freeze({anticipate: .1, move: .35, settle: .25, lift: .05, overshoot: .08}),
  /** How long a point holds when it has no `until` (seconds). */
  hold: 1.2,
  /** How long an arm takes to come back down (seconds). */
  lower: .3,
  /** A thing that fades away (eaten, used up): seconds. */
  fade: .5,
  /** Eyes, or an arm, turning from one thing to the next: seconds. */
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

/** Below this an arm counts as at rest: the next swing winds back first; above it, the next one carries on from there. */
const REST = .05;
const ARM_ON = Object.freeze({...STAGE.arm, lift: 0});

/** When a held window starts to move (its wind-back): the moment the window before it hands over. */
export const heldFrom = w => w.start - STAGE.arm.anticipate;

/**
 * A window held out at t: from `a0` (0 at rest) it swings to 1 — winding back first only from rest, so an arm already
 * out carries on without a dip — stays out, and lowers over STAGE.lower after `end`. Continuous everywhere: at
 * heldFrom(w) it is a0, at `end` the lowering starts from where it is.
 */
export function heldAt(w, t) {
  const a0 = w.a0 ?? 0, out = a0 + (1 - a0) * swing(t - w.start, a0 < REST ? STAGE.arm : ARM_ON);
  return t <= w.end ? out : out * (1 - smooth((t - w.end) / STAGE.lower));
}

/** Whether a held window still shows at t (it has started, and has not finished lowering). */
export const heldShows = (w, t) => t >= heldFrom(w) && t <= w.end + STAGE.lower;

/**
 * Each window's a0 — where the one before it (same person, same kind) leaves the arm when this one starts — so a
 * window that starts while the last is still lowering carries on from there. Windows in start order.
 */
export function chainHeld(windows) {
  windows.forEach((w, i) => { const prev = windows[i - 1]; w.a0 = prev && heldShows(prev, heldFrom(w)) ? heldAt(prev, heldFrom(w)) : 0; });
}

/** How long a swing takes from its wind-back to settled (seconds). */
export const swingSeconds = s => s.anticipate + s.move + s.settle;

export {swing, smooth};
