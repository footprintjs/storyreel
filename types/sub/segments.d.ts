export {segmentedVideo, folderStore, ffmpegJoin, planSegments, planPieces, segmentKey, codeFingerprint, codeCover, storyreelCode, engineFingerprint, wholeVideo, pictureLine} from '../index.js';
export type {VideoStrategy, SegmentStore, SegmentJoiner, Segment, Piece, SegmentReport, SegmentsReport, SegmentOptions, SegmentCode, FilmRow, KitSources} from '../index.js';
/** Where a piece is spot-checked: `count` frame offsets spread over it, first and last included, and two inside each moment it replays. */
export function sampleOffsets(segment: {f0: number; f1: number; replays?: {at: number; until: number}[]}, count?: number, fps?: number): number[];
/** A piece's key and its parts (each part hashed: engine, catalog:<name>, code, frames, pixels, entries, lines, words, captions, notes, camera, attention, labels, strings, data, theme, files, cast, poster, recalls). */
export function pieceKey(film: import('../index.js').Film, segment: import('../index.js').Segment, options: Parameters<typeof segmentMaterial>[2]): {key: string; parts: Record<string, string>};
/** Why a piece was drawn again: the parts that changed since its slot was last drawn, in a few words ("words changed, beats moved"), or null. */
export function whyDrawn(before: Record<string, string> | null | undefined, now: Record<string, string>): string | null;
/** What each part's change means, in a few words. */
export const PART_WHY: Readonly<Record<string, string>>;
/** StoryReel's drawing code (the code a cached piece's frames depend on): the core every key holds, and each catalog entry's (a transition, the steps track), keyed only by the pieces that draw it. `src`: another source tree (a test edits a copy). */
export function drawingCode(options?: {src?: string; versionOf?: (name: string) => string}): {core: string; coreFiles: Set<string>; catalog(name: string): string | null; cover(): Record<string, unknown>};
/** The catalogs pruned from the core: each entry's module, by the name a recipe gives it, and each catalog's registry. */
export const CATALOG: Readonly<Record<string, {registry: string | null; entries: Readonly<Record<string, string>>}>>;
/** The modules the painter imports that never decide a pixel, and why. */
export const NOT_DRAWING: Readonly<Record<string, string>>;
/** The kits' code per piece, from each kit's own `sources` (and `fallback`, a fingerprint of all the kits' code, for a kit that declares none). */
export function kitCode(film: import('../index.js').Film, options?: {fallback?: string | null}): import('../index.js').SegmentCode;
/** How many pieces are drawn at once by default: availableParallelism − 1, at most 6. */
export function defaultParallel(): number;
/** The most pieces a picture is planned in (a longer film is cut into longer pieces). */
export const MAX_PIECES: number;
/** The pieces' defaults: {chunkSeconds: 6, minSeconds: 1.5, pause: 0.3}. */
export const PIECE_DEFAULTS: Readonly<{chunkSeconds: number; minSeconds: number; pause: number}>;
/** The store's defaults: {cap: 4 GB, grace: 10 minutes}. */
export const STORE_DEFAULTS: Readonly<{cap: number; grace: number}>;
/** Code per segment for a kit that draws many shots: sources(entry) names a recipe entry's files; each segment is keyed by its own shots' code (imports followed) and `shared`. */
export function sourceCode(sources: (entry: any) => (string | URL)[] | null | undefined, options?: {shared?: (string | URL)[]}): import('../index.js').SegmentCode;
/** The extensions codeFingerprint reads by default: code (TypeScript too), data, images and fonts. */
export const CODE_EXTENSIONS: readonly string[];
/** What draws a piece, part by part, on its own clock (what pieceKey hashes): times near it exact, the rest only the side they are on. */
export function segmentMaterial(film: import('../index.js').Film, segment: import('../index.js').Segment, options: {recipe: import('../index.js').Recipe; storyboard?: import('../index.js').Storyboard | null; pixels: Record<string, unknown>; code?: string | import('../index.js').SegmentCode | null; fps?: number; margin?: number;
  captions?: {start: number; end: number; text: string; words: {text: string; start: number; end: number}[]}[] | null; extra?: {poster?: unknown; recalls?: unknown}; drawing?: {core: string; catalog(name: string): string | null}}): Record<string, unknown>;
