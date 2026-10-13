/** A feel: a spring's stiffness and damping. */
export interface Feel {k: number; d: number}
export type FeelName = 'snappy' | 'default' | 'heavy' | 'playful';
export const FEELS: Readonly<Record<FeelName, Readonly<Feel>>>;
export const FEEL_NAMES: readonly FeelName[];
/** A feel as given (a name or {k, d}), checked. */
export function readFeel(feel?: FeelName | Feel): Feel;
/** A damped spring 0 → 1, t seconds after it starts (0 before); under-damped feels overshoot. */
export function spring(t: number, feel?: FeelName | Feel): number;
/** The scale of something arriving at `at`: 0 → 1 with the feel's overshoot (playful by default). */
export function pop(t: number, at: number, feel?: FeelName | Feel): number;
/** A value with several targets [[time, value], …]: one spring per change, continuous, a pure function of t. */
export function track(t: number, keys: [number, number][], feel?: FeelName | Feel): number;
/** How many frames each drawing holds: ones (every frame), twos (the cartoon's habit), threes. */
export type TimingName = 'ones' | 'twos' | 'threes';
export const TIMINGS: Readonly<Record<TimingName, number>>;
export const TIMING_NAMES: readonly TimingName[];
/**
 * The moment the drawing shown at t was made: on twos each drawing holds for two frames (counted at `fps`, 30 by
 * default) while the camera moves on every frame. Work out a held figure (pose, place, mouth) from it; on ones it is t.
 */
export function heldTime(t: number, timing?: TimingName | number, options?: {fps?: number}): number;
/** A point a part hangs from: a number, or [x, y]. */
export type Hanging = number | number[];
/** follow's options: from (a moment the body is still; 0), feel (the joint's spring; playful), drag (the air, per second; 0). */
export interface FollowOptions {from?: number; feel?: FeelName | Feel; drag?: number}
/**
 * Follow-through: where a part that hangs off a moving body has got to at t. It hangs on a springy joint (playful by
 * default): it swings back as the body sets off, on past as it stops, and settles; while the body moves steadily it
 * hangs as at rest. `drag` adds the air (a hem trails a moving body by drag × speed ÷ k). At rest on the body before
 * `from` (give the scene's start). A pure function of t, each 1/240 s step solved exactly; pass the same body function
 * every frame and the steps already taken are kept for it.
 */
export function follow<P extends Hanging>(body: (u: number) => P, t: number, options?: FollowOptions): P;
/** How far the part trails the body at t (follow − body): 0 at rest and at a steady pace; back as it sets off, past as it stops. */
export function lag<P extends Hanging>(body: (u: number) => P, t: number, options?: FollowOptions): P;

/** A turn drawn as a cartoon turnaround: which drawing (0 front … views − 1 side) and how wide to draw it (1 − depth at a swap … 1). */
export interface Turnaround { view: number; squash: number }
/** turnaround's options: views (how many drawings, 2 or more; 3), depth (how much narrower at a swap, 0 – <1; .22), window (how much of the turn the squash spans; .2). */
export interface TurnaroundOptions { views?: number; depth?: number; window?: number }
/** The drawing for a turn (a walk's `turn`, 0 facing us … 1 along the way) and a squash across each swap, so the change reads as the body turning. */
export function turnaround(turn: number, options?: TurnaroundOptions): Turnaround;
