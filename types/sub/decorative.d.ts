/** The mark decorative text rides on, a shared symbol (Symbol.for('footprint-storyreel.decorative')). */
export const DECORATIVE: unique symbol;
/**
 * Draw decorative text — a line number, a badge: words the film shows but does not say. `draw(ctx)` runs with the
 * context marked; the review reads its words for every check but the claims check. Returns what `draw` returns.
 */
export function decorative<T>(ctx: object, draw: (ctx: any) => T): T;
/** Whether words drawn on this context now are decorative. */
export function isDecorative(ctx: object | null | undefined): boolean;
