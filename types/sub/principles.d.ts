/** anticipate's options: the move's start and distance; the wind-up's seconds before (lead 0.15), its letting go after (release 0.1), its share of the distance (amount 0.1, at most 0.5) and its most, in pixels (max 40). */
export interface AnticipateOptions<D extends number | number[]> {at: number; distance: D; lead?: number; release?: number; amount?: number; max?: number}
/** The counter-move before a move, as an offset the shape of `distance`: winds back over `lead` before `at`, lets go over `release` after it; 0 outside. */
export function anticipate<D extends number | number[]>(t: number, options: AnticipateOptions<D>): D;
/** A landing: when the thing hit, and how fast (pixels a second). */
export interface Landing {at: number; speed: number}
/** squash's options: the speed along the motion now, the landings so far, the motion's axis ('y'), the stretch per pixel a second (k 0.0002), the most (max 0.35). */
export interface SquashOptions {velocity?: number; landings?: readonly Landing[]; axis?: 'x' | 'y'; k?: number; max?: number}
/** Squash and stretch keeping the volume (sx × sy = 1): stretched along the motion by speed, squashed on each landing, wobbling once and settling. */
export function squash(t: number, options?: SquashOptions): {sx: number; sy: number};
/** A one-shot event's shape: its rise (attack, 0.04–0.12 s) and its fade (decay: seconds to fall to 1/e). */
export interface BurstShape {attack: number; decay: number}
export type BurstName = 'flash' | 'pop' | 'shake';
export const BURSTS: Readonly<Record<BurstName, Readonly<BurstShape>>>;
export const BURST_NAMES: readonly BurstName[];
/** A one-shot event's strength at its age: 0 before, a smoothstep rise over attack, 1, then an exponential fade (0 below a thousandth). */
export function envelope(age: number, shape?: BurstName | BurstShape): number;
/** Every event's envelope at t, added (events are times or {at, strength?}): overlapping events add. */
export function burst(t: number, events: readonly (number | {at: number; strength?: number})[], shape?: BurstName | BurstShape): number;
/** A point on a slightly curved path from `from` to `to` at u: the middle sits `bend` (0.12) of the distance off the straight line, bulging `toward` a side of the screen (up). */
export function arc(from: readonly [number, number], to: readonly [number, number], u: number, options?: {bend?: number; toward?: 'up' | 'down' | 'left' | 'right'}): [number, number];
