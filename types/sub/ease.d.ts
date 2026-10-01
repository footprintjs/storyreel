/** An ease: how far a change has gone (0..1; `back` overshoots on the way) at u, how far through its seconds (clamped to 0..1). */
export type Ease = (u: number) => number;
export type EaseName = 'linear' | 'in' | 'out' | 'inOut' | 'back' | 'walk' | 'jump' | 'spring';
/** The one ease table: linear, in, out, inOut (the whiteboard's ease), back (overshoots ~10%), walk, jump (no in-between), spring (overshoots ~4% and settles). */
export const EASES: Readonly<Record<EaseName, Ease>>;
/** Slow, fast, slow (smoothstep): exactly `footprint-storyreel/kits/whiteboard/board` · ease. */
export const inOut: Ease;
/** The curve with that name, or a refusal naming the eases there are; `where` names the entry that asked. */
export function easeNamed(name: string, where?: string): Ease;
