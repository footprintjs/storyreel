import type {Film, Zone, ZoneRect, UiFinding, UiReport} from '../index.js';
export type {Zone, LayoutUi, ZoneRect, UiFinding, UiReport} from '../index.js';

/** What a layout does with something under the app's UI: report it, or refuse before a frame is drawn. */
export const COVERED: readonly ['report', 'refuse'];
/** Where a zone's numbers come from: the platform's own template or figure ('measured'), or an estimate. */
export const BASES: readonly ['measured', 'estimate'];
/** Rectangles overlap when they share more than this many pixels each way: a shared edge is no overlap. */
export const EDGE: number;
/** How often (seconds) a named face is looked at for the check. */
export const FACE_STEP: number;
/** A list of zones, checked and frozen; refuses naming the zone and the fix. */
export function readZones(zones: unknown, where?: string): readonly Readonly<Zone>[];
/** A layout's ui, checked: the zones, what to do with something under them ('report' by default), the faces to keep clear ([] by default). */
export function readUi(ui: unknown, where?: string): Readonly<{zones: readonly Readonly<Zone>[]; covered: 'report' | 'refuse'; faces: readonly string[]}>;
/** The zones on a picture `width`×`height`, in its pixels. */
export function zoneRects(zones: readonly Zone[], width: number, height: number): ZoneRect[];
/** Where two rectangles [x0, y0, x1, y1] overlap, or null. */
export function overlapOf(a: readonly number[], b: readonly number[]): [number, number, number, number] | null;
/** Each rectangle under a zone. */
export function underZones(rects: readonly (readonly number[])[], zones: readonly ZoneRect[]): {rect: readonly number[]; zone: string; overlap: [number, number, number, number]}[];
/** The stretch of a span the zones leave clear (narrowed about its centre when that keeps 60% of it), or null when they cover it all. */
export function clearSpan(span: [number, number], zones: readonly ZoneRect[]): [number, number] | null;
/**
 * A block of text laid out clear of the zones: `place(span, dy)` lays it out in a horizontal span, moved down dy pixels.
 * Kept untouched when none of it is under a zone; else narrowed or moved, a few times at most.
 */
export function fitBlock<P extends {rects: number[][]}>(place: (span: [number, number], dy: number) => P, span: [number, number], zones: readonly ZoneRect[], options: {height: number}): {placed: P; fitted: boolean; covered: {rect: number[]; zone: string; overlap: [number, number, number, number]}[]};
/** What of the film is still under the app's UI in a compiled layout with `ui`, between from and to on the film clock. */
export function uiFindings(film: Film, framed: unknown, options?: {from?: number; to?: number; cut?: number}): {findings: Omit<UiFinding, 'text' | 'fix'>[]; fitted: {captions: number; title: boolean}};
/** A render's report from its compiled layouts (one per cut of an edit), or null when none has `ui`; refuses with covered: 'refuse' and anything under the UI. */
export function uiReport(film: Film, layouts: {framed: unknown; from: number; to: number; cut?: number}[]): UiReport | null;
/** A finding as words. */
export function findingText(finding: Omit<UiFinding, 'text' | 'fix'>): string;
/** The fix a finding names. */
export function findingFix(finding: Omit<UiFinding, 'text' | 'fix'>, zones: readonly ZoneRect[]): string;
/** A rectangle as words: "x 780–1080, y 840–1920". */
export function rectText(rect: readonly number[]): string;
