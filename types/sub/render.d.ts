export {renderFilm, wholeVideo} from '../index.js';
export type {VideoStrategy} from '../index.js';
/** The motionBlur option, checked: null, or {subframes 2–16, shutter 0.1–1}. */
export function readMotionBlur(v: unknown): {subframes: number; shutter: number} | null;
/** The film's chapters on its own clock: a titled scene starts one, an untitled one goes on with it; with no titles at all, every scene is one by its id. */
export function sceneChapters(scenes: {id: string; title?: string}[], offsets: number[]): [number, string][];
/** The encodes a render can make: 'standard' (quick) and 'high' (for posting). */
export const QUALITIES: readonly ('standard' | 'high')[];
/** The captionFiles option, checked: the kinds to write. */
export function readCaptionFiles(v: unknown): ('vtt' | 'srt')[];
