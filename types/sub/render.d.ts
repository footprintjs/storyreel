export {renderFilm, wholeVideo} from '../index.js';
export type {VideoStrategy} from '../index.js';
/** The motionBlur option, checked: null, or {subframes 2–16, shutter 0.1–1}. */
export function readMotionBlur(v: unknown): {subframes: number; shutter: number} | null;
/** The captionFiles option, checked: the kinds to write. */
export function readCaptionFiles(v: unknown): ('vtt' | 'srt')[];
