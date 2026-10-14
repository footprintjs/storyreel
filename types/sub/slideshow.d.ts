import type {Film, VerdictRules} from '../index.js';
/**
 * No slideshows: the thresholds. A frame is a pure function of time, so a picture that does not move draws the same grey
 * levels exactly; `width` is how wide the frames are read (each pixel a 10×10 cell of the frame), `level` how far a
 * cell's grey must move to have changed (0–255), `area` the share of cells that must change for a step to move, `hold`
 * the seconds a still stretch may last before it is dead (3), `most` the share of dead running time past which a film is
 * a slideshow (a half).
 */
export const SLIDESHOW: Readonly<{width: number; level: number; area: number; hold: number; most: number}>;
/** Each shot's middle: its time inside [from, to) with every change of picture (film.changes) cut out; a shot with nothing left is left out. */
export function shotInsides(film: Film, options?: {from?: number; to?: number}): {path: string; where: string; scene: string; pieces: [number, number][]}[];
/** Whether the picture moved from one grey frame to the next. */
export function moved(before: Uint8Array, after: Uint8Array, rule?: typeof SLIDESHOW): boolean;
/** How much a shot moves inside itself: its middle, the seconds measured, still (and when each still step starts), and dead — held still more than `hold` s, or all of a shot that never moves. */
export interface ShotMotion {path: string; where: string; scene: string; pieces: [number, number][]; seconds: number; still: number; stillAt: number[]; dead: number; deadAt: number[]}
/** How a stretch is read: [from, to), a frame every `every` s (0.25) drawn small; or the moments in `times` (every `every` s), each frame given by `frameAt(t)` (grey levels, 160 × 90). */
export interface MotionOptions {from?: number; to?: number; every?: number; rule?: typeof SLIDESHOW; times?: number[] | null; frameAt?: ((t: number) => Uint8Array) | null}
/** Each shot's motion over a stretch. */
export function shotMotion(film: Film, options?: MotionOptions): ShotMotion[];
/** The film (or a stretch of it) as a slideshow or not: the shots measured, seconds measured, still and dead, the share dead, and the shots that hold still (any dead time). */
export function slideshowOf(film: Film, options?: MotionOptions): {shots: number; seconds: number; still: number; dead: number; deadShare: number; deadShots: (ShotMotion & {deadShare: number})[]};
/** The verdict: not run with no middle to measure; failed when most of the shots' running time is dead. */
export const SLIDESHOW_VERDICT: Readonly<VerdictRules>;
