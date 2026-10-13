/** An ease: how far a change has gone (0..1; back, outBack, spring and some four-number curves overshoot on the way) at u, how far through its seconds (clamped to 0..1). */
export type Ease = (u: number) => number;
export type EaseName = 'linear' | 'in' | 'out' | 'inOut' | 'back' | 'walk' | 'jump' | 'spring'
  | 'bounce' | 'outCubic' | 'outQuint' | 'outExpo' | 'outBack' | 'inOutCubic' | 'standard' | 'emphasized';
/** A four-number curve as CSS writes it: "cubic-bezier(0.16, 1, 0.3, 1)" (x1 and x2 within 0..1). */
export type CubicBezier = `cubic-bezier(${string})`;
/** What a recipe or a kit may name as an ease: a name from the table, or a four-number curve as CSS writes it. */
export type EaseSpec = EaseName | CubicBezier;
/**
 * The one ease table: linear, in, out, inOut (the whiteboard's ease), back (overshoots ~10%), walk, jump (no
 * in-between), spring (overshoots ~4% and settles), bounce (lands and bounces, never past the end), outCubic,
 * outQuint, outExpo, outBack (the same curve as back), inOutCubic, standard (Material 3's), emphasized (Material 3's path).
 */
export const EASES: Readonly<Record<EaseName, Ease>>;
export const EASE_NAMES: readonly EaseName[];
/** Slow, fast, slow (smoothstep): exactly `footprint-storyreel/kits/whiteboard/board` · ease. */
export const inOut: Ease;
/** A CSS cubic-bezier(x1, y1, x2, y2), exact at its ends: x1 and x2 are times within 0..1 (refused otherwise); y1 and y2 may leave 0..1 (it then overshoots). */
export function bezier(x1: number, y1: number, x2: number, y2: number): Ease;
/** Whether an ease goes past its start or its end on the way: back, outBack, spring, and a four-number curve whose y leaves 0..1. */
export function overshoots(name: EaseSpec | (string & {})): boolean;
/** The curve with that name (or a "cubic-bezier(…)"), or a refusal naming the eases there are; `where` names the entry that asked. */
export function easeNamed(name: EaseSpec | (string & {}), where?: string): Ease;
