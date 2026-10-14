/**
 * Decorative text: words a kit draws that the film does not SAY — a code panel's line numbers, a strip's frame badges,
 * a step's ordinal. The review still reads them for every other check (under the captions, over each other, cut off,
 * how much there is to read): they are on screen. Only the claims check leaves them out: a line number is not a number
 * the film claims, and needs no source.
 *
 *   import {decorative} from 'footprint-storyreel/decorative';
 *   decorative(ctx, () => ctx.fillText(String(i + 1), x + 52, y));   // the line number: drawn and read, never a claim
 *
 * The mark rides on the context while `draw` runs, so every word drawn on that context inside it is decorative —
 * nested calls too — and none after it. It is a shared symbol (Symbol.for), so a kit that loads its own copy of the
 * library marks words the engine's review reads. A frame drawn without the review is unchanged by it.
 */
export const DECORATIVE = Symbol.for('footprint-storyreel.decorative');

/** Draw decorative text: `draw(ctx)` runs with the context marked, and its answer is returned. */
export function decorative(ctx, draw) {
  if (!ctx || typeof ctx !== 'object') throw new Error('decorative(ctx, draw): ctx is the canvas context the words are drawn on');
  if (typeof draw !== 'function') throw new Error('decorative(ctx, draw): draw is a function that draws the decorative words on ctx');
  ctx[DECORATIVE] = (ctx[DECORATIVE] ?? 0) + 1;
  try { return draw(ctx); } finally { ctx[DECORATIVE] -= 1; }
}

/** Whether words drawn on this context now are decorative. */
export const isDecorative = ctx => (ctx?.[DECORATIVE] ?? 0) > 0;
