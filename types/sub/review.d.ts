import type {Film, Layout} from '../index.js';
/** A line of text a frame draws: its box (axis-aligned) and quad (its four corners, rotation kept) in output pixels, and its alpha. */
export interface Word {text: string; box: [number, number, number, number]; quad: [number, number][]; alpha: number}
/** The words a frame draws at t, followed from each world's sheet onto the frame (through the layout when given). */
export function wordsAt(film: Film, t: number, options?: {layout?: ReturnType<typeof import('../index.js').compileLayout> | null}): Word[];
/**
 * What a check sees: the shared samples (words every `every` s), frame hashes (keyed by each sample's time), the
 * layout, the output size; `window`, what is read (a part with its handles), and `part`, the part itself (its own
 * scenes, without the handles; the window when the review was given from/to); `frozen`, the stretches where the
 * picture does not change for `stillFor` s or more; `picked`, the checks that run, so one can leave a finding to another.
 */
export interface Review {film: Film; window: {from: number; to: number}; part: {from: number; to: number}; maxWords: number; minSilence: number; layout: ReturnType<typeof import('../index.js').compileLayout> | null; width: number; height: number; every: number; stillFor: number; newEvery: number;
  samples: {t: number; words: Word[]}[]; hashes: Record<number, string>; frozen: {from: number; to: number}[]; picked: string[]}
/**
 * A check: a strategy run as its own subflow, picked when `when(scope)` is true (scope.facts: {seconds, stillFor, newEvery, loop, captions, samples, words, spoken}).
 * A `when` or a `find` that throws fails the review, naming the check. Hits with the same kind and `what` merge into one span, so `what` names one stretch.
 */
export interface ReviewCheck {label: string; why?: string; when(scope: any): boolean; find(review: Review): {kind: string; t: number; what: string}[]}
export const REVIEW_CHECKS: Readonly<Record<'under-captions' | 'words-overlap' | 'cut-off' | 'hook' | 'text-density' | 'silences' | 'stale' | 'loop' | 'still', ReviewCheck>>;
/** A finding: a span on the film clock, the scene it starts in. */
export interface Finding {kind: string; from: number; to: number; scene: string | null; what: string}
export function findingsText(findings: Finding[]): string;
/**
 * Review a part (or the film) by reading it: a footprintjs flowchart that leaves its own record. from/to past the film's
 * ends are held to the film; a check that throws rejects the review, naming every check that failed and why.
 */
export function reviewPart(film: Film, options?: {part?: {scenes: string[]; handles?: number} | {scene: string; handles?: number} | null; from?: number; to?: number; layout?: Layout | null;
  /** the picture is frozen when unchanged this many seconds (5): the still check */ stillFor?: number;
  every?: number; lasting?: number; minAlpha?: number; minHeight?: number; maxWords?: number; minSilence?: number;
  /** something new (a scene, a beat, a new word) at least every this many seconds (5) while the picture moves: the stale check */ newEvery?: number;
  /** the part is made to loop: the end of its own scenes (not its handles) must come round to their start */ loop?: boolean; checks?: Record<string, ReviewCheck>}): Promise<{window: {from: number; to: number}; facts: Record<string, unknown> | null;
  findings: Finding[]; text: string; timeline: string; ran: string[]; record: unknown[]}>;
