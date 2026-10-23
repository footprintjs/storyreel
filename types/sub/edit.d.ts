import type {Edit, EditRecord, Join, Box} from '../index.js';
export type {Edit, EditRecord, Join, Cut, CutTime, EndCard} from '../index.js';
/** A join's three settings and their defaults: a hard cut on the voice's silence, no overlap, no pop. */
export const JOIN_DEFAULTS: Readonly<Required<Join>>;
/** How far into the silence a cut point moved off a word goes, at most (half the gap when that is shorter). */
export const SILENCE_PAD: number;
/** A gap between words shorter than this is no silence: a cut point moved there is reported (snapped.noSilence). */
export const NO_SILENCE: number;
/** A join as given, over its defaults, checked (an overlap given drops a pop it would inherit, and a pop an overlap). */
export function readJoin(given: Join | undefined, base?: Required<Join>, where?: string): Readonly<Required<Join>>;
/** An edit's shape checked without a film: refuses naming what is wrong. */
export function checkEdit(edit: unknown): {cuts: {from: unknown; to: unknown; follow?: unknown; join: Required<Join>}[]; end: {lines: string[]; seconds: number; join: Required<Join>} | null; join: Required<Join>};
/** A cut point moved off a spoken word into the silence beside it ('from': before the word, 'to': after it). */
export function snapToSilence(words: {start: number; end: number}[], t: number, side: 'from' | 'to'): {t: number; word?: number; gap?: number};
/** A cut's frames on the frame grid: never rounding in a word its cut points left out (a frame short where words touch). */
export function cutFrames(words: {start: number; end: number}[], from: number, to: number, fps: number): {start: number; frames: number};
/** One cut placed: its stretch (as used and as given), its first film frame (start), its frames, where it plays (at, a frame), its join. */
export interface PlacedCut {index: number; from: number; to: number; given: [number, number]; snapped?: {from?: [number, number]; to?: [number, number]; noSilence?: ('from' | 'to')[]}; start: number; frames: number; at: number; join: Required<Join>; follow?: unknown}
/** An edit placed on a film: every frame accounted for. */
export interface PlacedEdit {fps: number; cuts: PlacedCut[]; end: {at: number; frames: number; lines: string[]; join: Required<Join>} | null; frames: number; seconds: number}
export function placeEdit(checked: ReturnType<typeof checkEdit>, film: {time(v: unknown, edge: 'from' | 'to', where: string): number; words: {start: number; end: number}[]; total: number; fps: number}): PlacedEdit;
/** What output frame f shows: a cut at a film second (popped or not), a blend of two sides in an overlap, or the end card. */
export function editFrame(edit: PlacedEdit, f: number): {kind: 'cut'; cut: number; t: number; pop?: true} | {kind: 'blend'; under: {cut: number; t: number}; over: {cut: number; t: number} | {end: true; u: number}; a: number} | {kind: 'end'; u: number; pop?: true};
/** The caption a frame of a cut may show: only words said between its cut points (none from the stretch before it). */
export function captionInCut<C extends {words: {start: number}[]; active: number}>(cut: {from: number; to: number}, t: number, captionAt: (t: number) => C | null): C | {words: C['words']; active: number} | null;
/** The output frame where each join lands. */
export function joinFrames(edit: PlacedEdit): {index: number | 'end'; frame: number}[];
/** Caption chunks on the edit's clock (for caption files): each cut's own words, where it plays. */
export function chunksThrough<C extends {start: number; end: number; text: string; words: {text: string; start: number; end: number}[]}>(edit: PlacedEdit, chunks: C[]): C[];
/** Chapters [[seconds, name]] on the edit's clock. */
export function chaptersThrough(edit: PlacedEdit, chapters: [number, string][]): [number, string][];
/** The edit as its record keeps it. */
export function editRecord(edit: PlacedEdit): EditRecord;
/** The end card drawn into ctx (output pixels), in the film's theme, inside `box`. */
export function drawEndCard(ctx: any, options: {lines: string[]; box: Box; width: number; height: number; theme?: unknown}): void;
