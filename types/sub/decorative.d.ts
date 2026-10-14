/** The mark decorative text rides on, a shared symbol (Symbol.for('footprint-storyreel.decorative')). */
export const DECORATIVE: unique symbol;
/** The mark code rides on, a shared symbol (Symbol.for('footprint-storyreel.code')). */
export const CODE: unique symbol;
/**
 * Draw decorative text — a line number, a badge, a step counter: words the film shows but does not say. `draw(ctx)` runs
 * with the context marked; the review reads its words for every check but the claims check. Returns what `draw` returns.
 */
export function decorative<T>(ctx: object, draw: (ctx: any) => T): T;
/**
 * Draw code: the claims check reads its numbers as code writes them ("." the decimal mark, "," always a separator, no
 * grouping), whatever the film's language; they still need a source. Returns what `draw` returns.
 */
export function code<T>(ctx: object, draw: (ctx: any) => T): T;
/** Whether words drawn on this context now are decorative. */
export function isDecorative(ctx: object | null | undefined): boolean;
/** Whether words drawn on this context now are code. */
export function isCode(ctx: object | null | undefined): boolean;
