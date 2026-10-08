/** A walk style: lengths are shares of the figure's standing height; cadence is steps a second. */
export interface WalkStyle {
  cadence: number; stride: number; bob: number; bounce: number; lift: number; lean: number; arms: number;
  anticipate: number; dip: number; settle: number; rock: number;
}
export type WalkName = 'stroll' | 'brisk' | 'bouncy' | 'tiptoe';
export const WALKS: Readonly<Record<WalkName, Readonly<WalkStyle>>>;
export const WALK_NAMES: readonly WalkName[];
/** A style as given (a name or an object with every key), checked. */
export function readWalk(style?: WalkName | WalkStyle): WalkStyle;
/** Where a figure is at t on a walk: numbers a kit draws it from. */
export interface WalkPose {
  /** The body's place on the floor (between its feet), px. */
  x: number;
  /** How far the body rises (+) or sinks (−) from standing, px. */
  lift: number;
  /** Radians, + toward the way it walks. */
  lean: number;
  /** Each foot's place on the floor and its height off it (feet[0] steps first). A planted foot never moves. */
  feet: [{x: number; lift: number}, {x: number; lift: number}];
  /** −arms…arms (the style's 0–1): + while feet[0] is ahead (so the arm on feet[1]'s side is forward); it eases in and out in the half steps that start and end the walk. */
  swing: number;
  /** 0 facing us … 1 turned along the way. */
  turn: number;
  facing: 1 | -1;
  walking: boolean;
  phase: 'before' | 'set off' | 'step' | 'settle' | 'after';
}
export interface Walk {
  at(t: number): WalkPose;
  /** When the feet come together at `to`. */
  readonly arrive: number;
  /** When it has settled. */
  readonly end: number;
  /** How many steps (0 when from is to: it stands there). */
  readonly steps: number;
  readonly stepSeconds: number;
  readonly facing: 1 | -1;
  readonly from: number; readonly to: number; readonly start: number;
}
/**
 * Plan a walk from `from` to `to` (px on the floor) starting at `start` (the set-off; the first foot lifts
 * `anticipate` seconds later), for a figure `size` px tall, in a style; `seconds` fits the stepping to that long.
 */
export function walk(spec: {from: number; to: number; start: number; size: number; style?: WalkName | WalkStyle; seconds?: number | null}): Walk;
