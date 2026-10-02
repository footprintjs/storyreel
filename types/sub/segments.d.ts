export {segmentedVideo, folderStore, ffmpegJoin, planSegments, segmentKey, codeFingerprint, wholeVideo} from '../index.js';
export type {VideoStrategy, SegmentStore, SegmentJoiner, Segment, SegmentReport, SegmentsReport, FilmRow} from '../index.js';
/** The moments a segment is spot-checked at: `count` frames spread over it, first and last included. */
export function sampleMoments(segment: {f0: number; f1: number}, options?: {fps?: number; count?: number}): number[];
/** Everything that draws a segment, on its own clock (what segmentKey hashes). */
export function segmentMaterial(film: import('../index.js').Film, segment: import('../index.js').Segment, options: {recipe: import('../index.js').Recipe; storyboard?: import('../index.js').Storyboard | null; pixels: Record<string, unknown>; code?: string | null; fps?: number; margin?: number}): Record<string, unknown>;
