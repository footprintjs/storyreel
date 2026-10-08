export {renderFilm, wholeVideo} from '../index.js';
export type {VideoStrategy} from '../index.js';
/** The motionBlur option, checked: null, or {subframes 2–16, shutter 0.1–1}. */
export function readMotionBlur(v: unknown): {subframes: number; shutter: number} | null;
/** The film's chapters on its own clock: a titled scene starts one, an untitled one goes on with it; with no titles at all, every scene is one by its id. */
export function sceneChapters(scenes: {id: string; title?: string}[], offsets: number[]): [number, string][];
/** The encodes a render can make: 'standard' (quick) and 'high' (for posting). */
export const QUALITIES: readonly ('standard' | 'draft' | 'high')[];
/** Where a part's own scenes lie on the film clock, exactly (unrounded, held to the film): no handles. */
export function partScenes(film: import('../index.js').Film, part: {scenes: string[]; handles?: number} | {scene: string; handles?: number}): {from: number; to: number};
/** A part with its handles → the render's from/to on the film clock (rounded to the millisecond). */
export function partWindow(film: import('../index.js').Film, part: {scenes: string[]; handles?: number} | {scene: string; handles?: number}): {from: number; to: number};
/** The scenes and beats in a stretch of the film, on its own clock: text to read instead of frames. */
export interface TimelineRow {t: number; kind: 'scene' | 'beat'; scene: string | null; phrase?: string | null; entry?: string | null}
export function partTimeline(film: import('../index.js').Film, window?: {from?: number; to?: number}): TimelineRow[];
export function timelineText(rows: TimelineRow[]): string;
/** The captionFiles option, checked: the kinds to write. */
export function readCaptionFiles(v: unknown): ('vtt' | 'srt')[];

/** The moments one frame's motion blur averages: `subframes` spread over `shutter` of the frame, always strictly inside it. */
export function blurMoments(t: number, blur: {subframes: number; shutter: number}, fps: number): number[];
