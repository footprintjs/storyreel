import type {Film, Parts, VerdictRules} from '../index.js';
/** The thresholds, in the kit's own pixels: seconds between moments read (moments further apart start the planted ends again), how far past touching a mounted end may sit, how far a planted end may be from where it was first planted. */
export const GEOMETRY: Readonly<{every: number; reach: number; slide: number;
  /** The most the picture's clock may run per second of the film's and be the same picture moving on (3: a speed ramp reaches 2.5); more is a jump, and the planted ends start again. */ jump: number}>;
/** A kit's parts at one moment, checked; `where` names the kit's entry and the moment in a refusal. */
export function readParts(parts: unknown, where: string): Required<Parts>;
/** Whether two segments' centre lines cross through each other (a shared end, a joint, is no crossing). */
export function crosses(one: [[number, number], [number, number]], other: [[number, number], [number, number]]): boolean;
/** Something that breaks: an end off its mount (px), a pair crossing, a planted end (`end`) away from where it was first planted (px). */
export interface GeometryBreak {rule: 'mount' | 'cross' | 'slide'; path: string; part: string; other?: string; end?: 'a' | 'b'; t: number; px?: number}
/** Audit parts over a stretch: how many mounts, pairs and planted parts were checked, and every break, at every moment. */
export function auditParts(samples: {t: number; picture?: number; parts: (Parts & {path: string})[]}[], rule?: typeof GEOMETRY): {checked: {mounts: number; pairs: number; planted: number}; breaks: GeometryBreak[]};
/** A break in words, the same at every moment of one stretch. */
export function breakText(b: GeometryBreak): string;
/** Read a film's parts over [from, to] (film.partsAt every GEOMETRY.every s) and audit them; `worst` is each break at its largest. */
export function geometryOf(film: Film, options?: {from?: number; to?: number; rule?: typeof GEOMETRY}): {samples: number; parts: number; checked: {mounts: number; pairs: number; planted: number}; breaks: GeometryBreak[]; worst: {text: string; t: number; px?: number}[]};
/** The verdict: not run when the parts declare nothing to check; failed when anything breaks. */
export const GEOMETRY_VERDICT: Readonly<VerdictRules>;
