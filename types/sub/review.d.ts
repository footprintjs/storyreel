import type {Claim, Film, Layout, Verdict, VerdictRules} from '../index.js';
/** A line of text a frame draws: its box (axis-aligned) and quad (its four corners, rotation kept) in output pixels, and its alpha. */
/** decorative: drawn inside decorative() (footprint-storyreel/decorative) — read by every check but the claims check; code: drawn inside code(), its numbers read as code writes them. */
export interface Word {text: string; box: [number, number, number, number]; quad: [number, number][]; alpha: number; decorative?: true; code?: true}
/** The words a frame draws at t, followed from each world's sheet onto the frame (through the layout when given). */
export function wordsAt(film: Film, t: number, options?: {layout?: ReturnType<typeof import('../index.js').compileLayout> | null}): Word[];
/**
 * What a check sees: the shared samples (words every `every` s), frame hashes (keyed by each sample's time), the
 * layout, the output size; `window`, what is read (a part with its handles), and `part`, the part itself (its own
 * scenes, without the handles; the window when the review was given from/to); `frozen`, the stretches where the
 * picture does not change for `stillFor` s or more; `picked`, the checks that run, so one can leave a finding to another;
 * `minAlpha`, how opaque a word must be drawn to count.
 */
export interface Review {film: Film; window: {from: number; to: number}; part: {from: number; to: number}; maxWords: number; minSilence: number; minAlpha: number; layout: ReturnType<typeof import('../index.js').compileLayout> | null; width: number; height: number; every: number; stillFor: number; newEvery: number;
  /** words: what the checks read; marks: a sign or a point too short to read on its own ("-", "."), for the claims check to join to the digits it touches. */
  samples: {t: number; words: Word[]; marks?: Word[]}[]; hashes: Record<number, string>;
  /** Each sample's frame as grey levels, 160 × 90 (the same drawing as its hash): what the slideshow check reads. */
  greys: Map<number, Uint8Array>; frozen: {from: number; to: number}[]; picked: string[];
  /** The numbers the picture draws that no declared line holds (claims.mjs · drawnClaims), read once for the claims checks. */
  drawn: Claim[];
  /** Where an example line lingers into a scene that is not example data, in the window, with the real numbers beside it (claims.mjs · lingeringExamples). */
  lingers: {scene: string | null; example: string | null; from: number; to: number; numbers: Claim[]}[]}
/**
 * A check: a strategy run as its own subflow, picked when `when(scope)` is true (scope.facts: {seconds, stillFor, newEvery, loop, captions, samples, words, spoken, parts, claims, freezes?: the camera freezes that reach the part, when there are any, lingers?: the stretches where an example line lingers into a scene that is not example data, when there are any}).
 * `find` answers at once with its hits, copied as {kind, t, what}; a `when` or a `find` that throws, or a `find` that returns anything else
 * (a promise, no list, a hit without a name, a time or words), fails the review, naming the check. Hits with the same kind and `what` merge
 * into one span, so `what` names one stretch.
 */
export interface FindingCheck {label: string; why?: string; when(scope: any): boolean; find(review: Review): {kind: string; t: number; what: string}[]}
/**
 * A check that answers with a verdict (passed, failed, or not run): `measure` answers at once with what it measured (each value goes on the
 * scope by its name, for the rules' decide() filters) and its hits; the verdict is decided over them, and the hits are findings only when it
 * fails. `notRun` says why when it is not picked (it is then 'not run', never passed); `summary` puts the numbers in its line.
 */
export interface VerdictCheck {label: string; why?: string; notRun?: string; when(scope: any): boolean;
  measure(review: Review): {measured: Record<string, unknown>; hits?: {kind: string; t: number; what: string}[]};
  verdict: VerdictRules; summary?(measured: any): string}
export type ReviewCheck = FindingCheck | VerdictCheck;
/** The built-in checks; slideshow, geometry and claims answer with a verdict. */
/**
 * The review's numbers: reviewPart's defaults (every, stillFor, lasting, minAlpha, minHeight, maxWords, minSilence,
 * newEvery) and two thresholds of its checks: the hook is the film's first `hook` seconds; a spoken part of `breath`
 * seconds or more needs real silences.
 */
export const REVIEW_DEFAULTS: Readonly<{every: number; stillFor: number; lasting: number; minAlpha: number; minHeight: number; maxWords: number; minSilence: number; newEvery: number; hook: number; breath: number}>;
export const REVIEW_CHECKS: Readonly<Record<'under-captions' | 'words-overlap' | 'cut-off' | 'hook' | 'text-density' | 'silences' | 'stale' | 'loop' | 'frozen-voice' | 'still' | 'example-lingers', FindingCheck> & Record<'slideshow' | 'geometry' | 'claims', VerdictCheck>>;
/** What a verdict check answered: its verdict, why (the rule that matched, or what passing means), what it measured, and its numbers in words. */
export interface ReviewVerdict {check: string; label: string; verdict: Verdict; why: string; measured: Record<string, unknown>; summary?: string}
export function verdictsText(verdicts: ReviewVerdict[]): string;
/** A finding: a span on the film clock, the scene it starts in. */
export interface Finding {kind: string; from: number; to: number; scene: string | null; what: string}
export function findingsText(findings: Finding[]): string;
/** How many findings a summary lists in full (the rest are counted). */
export const SUMMARY_TOP: number;
/**
 * A review said short (what `storyreel review` prints by default): the counts, the verdicts that did not pass with why,
 * the first SUMMARY_TOP findings (errors before advice), and how many more — `more` says how to list them all.
 */
export function reviewSummary(review: {findings: Finding[]; verdicts?: ReviewVerdict[]}, options?: {more?: string}): string;
/** The words a reader counts on screen (the too-much-to-read check): draws joined into lines, captions in, code() out. */
export function wordsOnScreen(words: {text: string; box?: number[]; code?: boolean}[]): {lines: string[]; count: number};
/**
 * Review a part (or the film) by reading it: a footprintjs flowchart that leaves its own record. from/to past the film's
 * ends are held to the film; a check that throws rejects the review, naming every check that failed and why.
 */
export function reviewPart(film: Film, options?: {part?: {scenes: string[]; handles?: number} | {scene: string; handles?: number} | null; from?: number; to?: number; layout?: Layout | null;
  /** the picture is frozen when unchanged this many seconds (5): the still check */ stillFor?: number;
  every?: number; lasting?: number; minAlpha?: number; minHeight?: number; maxWords?: number; minSilence?: number;
  /** something new (a scene, a beat, a new word) at least every this many seconds (5) while the picture moves: the stale check */ newEvery?: number;
  /** the part is made to loop: the end of its own scenes (not its handles) must come round to their start; motion that steps (a flipbook, drawing on twos) reads one drawing short there */ loop?: boolean; checks?: Record<string, ReviewCheck>}): Promise<{window: {from: number; to: number}; facts: Record<string, unknown> | null;
  findings: Finding[]; text: string; verdicts: ReviewVerdict[]; verdictText: string; timeline: string; ran: string[]; record: unknown[]}>;
