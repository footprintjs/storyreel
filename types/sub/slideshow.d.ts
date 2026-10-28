import type {Film, VerdictRules} from '../index.js';
import type {Pace} from 'footprint-story/motion';
/**
 * No slideshows: the thresholds. A frame is a pure function of time, so a picture that does not move draws the same grey
 * levels exactly; `width` is how wide the frames are read (each pixel a 10×10 cell of the frame), `level` how far a
 * cell's grey must move to have changed (0–255), `area` the share of cells that must change for a step to move, `hold`
 * the seconds a still stretch may last before it is dead (3), `most` the share of dead running time past which a film is
 * a slideshow (a half).
 */
export const SLIDESHOW: Readonly<{width: number; level: number; area: number; hold: number; most: number;
  /** A shot whose changes, all its steps together, touch less than this share of the frame never moves (0.0025). */ cover: number;
  /** A film is a slideshow, too, when more than this share of its running time is still at all (0.85). */ still: number}>;
/** Each shot's middle: its time inside [from, to) with every change of picture (film.changes) cut out; a shot with nothing left is left out. */
export function shotInsides(film: Film, options?: {from?: number; to?: number; /** the last shots not measured (a pace's end card) */ spare?: number}): {path: string; where: string; scene: string; pieces: [number, number][]}[];
/** Whether the picture moved from one grey frame to the next. */
export function moved(before: Uint8Array, after: Uint8Array, rule?: typeof SLIDESHOW, seen?: Uint8Array | null): boolean;
/** How much a shot moves inside itself: its middle, the seconds measured, still (and when each still step starts), and dead — held still more than `hold` s, or all of a shot that never moves. */
export interface ShotMotion {path: string; where: string; scene: string; pieces: [number, number][]; seconds: number; still: number; stillAt: number[]; dead: number; deadAt: number[];
  /** The share of the frame its changes touched, over all its steps together. */ cover: number}
/** How a stretch is read: [from, to), a frame every `every` s (0.25) drawn small; or the moments in `times` (every `every` s), each frame given by `frameAt(t)` (grey levels, 160 × 90). */
export interface MotionOptions {from?: number; to?: number; every?: number; rule?: typeof SLIDESHOW; /** the last shots not measured (a pace's end card) */ spare?: number; times?: number[] | null; frameAt?: ((t: number) => Uint8Array) | null}
/** Each shot's motion over a stretch. */
export function shotMotion(film: Film, options?: MotionOptions): ShotMotion[];
/** The film (or a stretch of it) as a slideshow or not: the shots measured, seconds measured, still and dead, the share dead, and the shots that hold still (any dead time). */
export function slideshowOf(film: Film, options?: MotionOptions): {shots: number; seconds: number; still: number; stillShare: number; dead: number; deadShare: number; deadShots: (ShotMotion & {deadShare: number})[]; stillShots: (ShotMotion & {stillShare: number})[]};
/** The verdict at a lesson's pace: not run with no middle to measure; failed when most of the shots' running time is dead, or nearly all of it still. */
export const SLIDESHOW_VERDICT: Readonly<VerdictRules>;
/** The verdict at a pace: failed past its `most` dead or `still` still, its words saying its `hold` (a lesson's: SLIDESHOW_VERDICT). */
export function slideshowVerdict(pace?: Pace): Readonly<VerdictRules>;
/** The film's pace (its recipe's `pace`; a lesson's when it names none), the rule it makes, and the shots at its end not held to it. */
export function pacedRule(film: Film): {pace: Pace; rule: typeof SLIDESHOW; spare: number};
