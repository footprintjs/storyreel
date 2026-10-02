import type {Film, Layout} from '../index.js';
/** A line of text a frame draws: its box (axis-aligned) and quad (its four corners, rotation kept) in output pixels, and its alpha. */
export interface Word {text: string; box: [number, number, number, number]; quad: [number, number][]; alpha: number}
/** The words a frame draws at t, followed from each world's sheet onto the frame (through the layout when given). */
export function wordsAt(film: Film, t: number, options?: {layout?: ReturnType<typeof import('../index.js').compileLayout> | null}): Word[];
/** What a check sees: the shared samples (words every `every` s), frame hashes, the layout, the output size. */
export interface Review {film: Film; layout: ReturnType<typeof import('../index.js').compileLayout> | null; width: number; height: number; every: number; stillFor: number; samples: {t: number; words: Word[]}[]; hashes: Record<number, string>}
/** A check: a strategy run as its own subflow, picked when `when(scope)` is true (scope.facts: {seconds, stillFor, captions, samples, words}). */
export interface ReviewCheck {label: string; why?: string; when(scope: any): boolean; find(review: Review): {kind: string; t: number; what: string}[]}
export const REVIEW_CHECKS: Readonly<Record<'under-captions' | 'words-overlap' | 'cut-off' | 'still', ReviewCheck>>;
/** A finding: a span on the film clock, the scene it starts in. */
export interface Finding {kind: string; from: number; to: number; scene: string | null; what: string}
export function findingsText(findings: Finding[]): string;
/** Review a part (or the film) by reading it: a footprintjs flowchart that leaves its own record. */
export function reviewPart(film: Film, options?: {part?: {scenes: string[]; handles?: number} | {scene: string; handles?: number} | null; from?: number; to?: number; layout?: Layout | null;
  every?: number; stillFor?: number; lasting?: number; minAlpha?: number; checks?: Record<string, ReviewCheck>}): Promise<{window: {from: number; to: number}; facts: Record<string, unknown> | null;
  findings: Finding[]; text: string; timeline: string; ran: string[]; record: unknown[]}>;
