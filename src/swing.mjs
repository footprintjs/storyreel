/**
 * The one swing shape: how a finger, an arm or a door moves from where it was (0) to where it goes (1), the way an
 * animator times it — a small wind-back first, a quick move that passes its end a little, and a settle. fingers.mjs
 * times each finger with it and the stage (stage/timing.mjs) each arm and door, so all three move alike.
 *
 *   swing(τ, {anticipate, move, settle, lift, overshoot})   τ seconds after the move starts; exactly 0 before the
 *                                                          wind-back and 1 once settled, smooth at every join
 *   smooth(u)                                              smoothstep, clamped to 0..1 (ease.mjs · inOut)
 */
import {inOut} from './ease.mjs';

export const smooth = inOut;

/**
 * A wind-back of `lift` over `anticipate` seconds before the move, a move past the end by `overshoot` over `move`, and
 * a settle back over `settle`. The speed is 0 at every join.
 */
export function swing(τ, {anticipate, move, settle, lift, overshoot}) {
  if (τ < -anticipate) return 0;
  if (τ < 0) return -lift * smooth((τ + anticipate) / anticipate);
  if (τ < move) { const c = Math.cos(Math.PI * τ / move); return -lift * (1 + c) / 2 + (1 + overshoot) * (1 - c) / 2; }
  if (τ < move + settle) return 1 + overshoot * (1 - smooth((τ - move) / settle));
  return 1;
}
