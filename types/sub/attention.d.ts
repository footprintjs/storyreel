/**
 * Where the focus is: the camera's point and zoom, where on the frame it sits, the named thing's box as the focus eases
 * to it, how focused (0 wide … 1); the current key's thing — its name ("wide" too) and its box at the key, not eased —
 * and the seconds since that key (on, thing and since are null before the first key).
 */
export interface FocusView {cx: number; cy: number; z: number; sx: number; sy: number; box: [number, number, number, number]; w: number; on: string | null; thing: [number, number, number, number] | null; since: number | null}
/** A focus strategy: shows the picture (paint) for a view. */
export interface FocusStrategy {name?: string; moves?: boolean; show(ctx: any, view: FocusView, paint: (ctx: any) => void, theme: unknown): void}
/** An emphasis strategy: draws the current words. */
export interface EmphasisStrategy {name?: string; draw(ctx: any, t: number, word: {t: number; text: string; next: number; until: number}, theme: unknown, view: FocusView | null): void}
export const FOCUS: Readonly<Record<'camera' | 'spotlight' | 'dim' | 'circle' | 'none', FocusStrategy>>;
/** The circle's marker loop: drawn in `draw` seconds from its key, `margin` px clear of the thing, `width` px thick. */
export const LOOP: Readonly<{draw: number; margin: number; width: number}>;
export const EMPHASIS: Readonly<Record<'pop' | 'label' | 'corner' | 'none', EmphasisStrategy>>;
/** A small label: ink ground, paper letters, at (x, y) — or set against a right edge (`right`) — scaled by k; returns its width. */
export function chip(ctx: any, text: string, alpha: number, theme: unknown, options?: {x?: number; y?: number; k?: number; right?: number | null}): number;
