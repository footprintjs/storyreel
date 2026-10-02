export {segmentedVideo, folderStore, ffmpegJoin, planSegments, segmentKey, codeFingerprint, wholeVideo} from '../index.js';
export type {VideoStrategy, SegmentStore, SegmentJoiner, Segment, SegmentReport, SegmentsReport, FilmRow} from '../index.js';
/** Where a segment is spot-checked: `count` frame offsets spread over it, first and last included. */
export function sampleOffsets(segment: {f0: number; f1: number}, count?: number): number[];
/** Code per segment for a kit that draws many shots: sources(entry) names a recipe entry's files; each segment is keyed by its own shots' code (imports followed) and `shared`. */
export function sourceCode(sources: (entry: any) => string[] | null | undefined, options?: {shared?: string[]}): import('../index.js').SegmentCode;
/** The extensions codeFingerprint reads by default: code (TypeScript too), data, images and fonts. */
export const CODE_EXTENSIONS: readonly string[];
/** What draws a segment, on its own clock (what segmentKey hashes). */
export function segmentMaterial(film: import('../index.js').Film, segment: import('../index.js').Segment, options: {recipe: import('../index.js').Recipe; storyboard?: import('../index.js').Storyboard | null; pixels: Record<string, unknown>; code?: string | import('../index.js').SegmentCode | null; fps?: number; margin?: number}): Record<string, unknown>;
