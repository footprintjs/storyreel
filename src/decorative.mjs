/**
 * Marks on the words a kit draws, for the review's claims check — one small API, two marks:
 *
 * DECORATIVE: words the film does not SAY — a code panel's line numbers, a strip's frame badges, a step's ordinal. The
 * review still reads them for every other check (under the captions, over each other, cut off, how much there is to
 * read): they are on screen. Only the claims check leaves them out: a line number is not a number the film claims.
 *
 * CODE: words that are code. Code writes numbers as its programming language does, not as the film's language: "." is
 * the decimal mark, "," always separates (f(4,5) is 4 and 5), never any grouping — so in a "de" film x = 16.67 is 16.67.
 * The claims check reads them so (claims.mjs · CODE_READING); they still need a source. The built-in code stage marks
 * its own code.
 *
 *   import {decorative, code} from 'footprint-storyreel/decorative';
 *   decorative(ctx, () => ctx.fillText(String(i + 1), x + 52, y));   // the line number: drawn and read, never a claim
 *   code(ctx, () => ctx.fillText('x = 16.67;', x + 72, y));           // the code: its numbers read as code reads them
 *
 * A mark rides on the context while `draw` runs, so every word drawn on that context inside it carries it — nested
 * calls too — and none after it: mark the context the words are drawn on (an offscreen canvas's own). It is a shared
 * symbol (Symbol.for), so a kit that loads its own copy of the library marks words the engine's review reads. A frame
 * drawn without the review is unchanged by it.
 */
export const DECORATIVE = Symbol.for('footprint-storyreel.decorative');
export const CODE = Symbol.for('footprint-storyreel.code');

/** Draw with a mark: `draw(ctx)` runs with the context marked, and its answer is returned. */
function marked(ctx, mark, draw, name) {
  if (!ctx || typeof ctx !== 'object') throw new Error(`${name}(ctx, draw): ctx is the canvas context the words are drawn on`);
  if (typeof draw !== 'function') throw new Error(`${name}(ctx, draw): draw is a function that draws the ${name === 'code' ? 'code' : 'decorative words'} on ctx`);
  ctx[mark] = (ctx[mark] ?? 0) + 1;
  try { return draw(ctx); } finally { ctx[mark] -= 1; }
}

/** Draw decorative text: the review reads it for every check but the claims check. */
export const decorative = (ctx, draw) => marked(ctx, DECORATIVE, draw, 'decorative');
/** Draw code: the claims check reads its numbers as code writes them (CODE_READING), whatever the film's language. */
export const code = (ctx, draw) => marked(ctx, CODE, draw, 'code');

/** Whether words drawn on this context now are decorative. */
export const isDecorative = ctx => (ctx?.[DECORATIVE] ?? 0) > 0;
/** Whether words drawn on this context now are code. */
export const isCode = ctx => (ctx?.[CODE] ?? 0) > 0;
