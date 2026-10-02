export {checkVideo, readCaptions, FINISHED_CHECK_NAMES} from '../index.js';
export type {FinishedFinding, FinishedReport, FinishedCheckName, VideoProbe} from '../index.js';
import type {VideoProbe, FinishedFinding} from '../index.js';
/** The thresholds the checks use: frame width read, blank spread, blank run length, a visible change, a quiet word (dBFS), caption drift (s), how far sound may lead or trail a mouth (s), a moving mouth. */
export const FINISHED: Readonly<{width: number; blank: number; blankFrames: number; change: number; quiet: number; drift: number; soundLeads: number; soundTrails: number; open: number}>;
/** The default probe: FFmpeg and ffprobe (beside the FFmpeg given, or on the PATH). */
export function ffmpegProbe(options?: {ffmpeg?: string; ffprobe?: string}): VideoProbe;
/** The checks, each a strategy over what the probe read: what it needs (frames, the film, the captions, a voiced render), and run. */
export const FINISHED_CHECKS: Readonly<Record<string, {needs: string[]; run(context: unknown): Omit<FinishedFinding, 'check'>[]}>>;
