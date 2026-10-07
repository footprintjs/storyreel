/** Where the focus is: the camera's point and zoom, the named thing's box, how focused (0 wide … 1). */
export interface FocusView {cx: number; cy: number; z: number; sx: number; sy: number; box: [number, number, number, number]; w: number}
/** A focus strategy: shows the picture (paint) for a view. */
export interface FocusStrategy {name?: string; moves?: boolean; show(ctx: any, view: FocusView, paint: (ctx: any) => void, theme: unknown): void}
/** An emphasis strategy: draws the current words. */
export interface EmphasisStrategy {name?: string; draw(ctx: any, t: number, word: {t: number; text: string; next: number; until: number}, theme: unknown): void}
export const FOCUS: Readonly<Record<'camera' | 'spotlight' | 'dim' | 'none', FocusStrategy>>;
export const EMPHASIS: Readonly<Record<'pop' | 'corner' | 'none', EmphasisStrategy>>;
