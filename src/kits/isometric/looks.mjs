/**
 * looks — a world's named look on the film's ground.
 *
 *   groundedStyle(style, look, who)  the style row as read (read.mjs · readStyle) → {style, look}: the row the map is
 *                                    built in, and what the record says of the look (`{name, ground}`, or null)
 *   darkGround(look)                 whether the film's ground is darker than its ink
 *   inDuotone(style)                 whether the map is printed in the duotone palette (its untoned blocks then hand
 *                                    the map build their colours: build.mjs · specOf)
 *
 * A look is footprint-story's (`ISO_LOOKS`: outlined, line-art, paper-grain, duotone, sketchy), a style row under a name. Three of
 * them carry a page's colours, white paper and a navy ink, as their own: line-art's and sketchy's paper shading (`#ffffff`) and the
 * duotone's paper and ink (`DUOTONE`). On a light ground they are drawn as named. On a dark one they take the film's:
 * the paper shading the ground (`shading: {name: "paper", colour}`) and the duotone the ground as its paper and the
 * theme's ink as its ink (`palette: {name: "duotone", paper, ink, accent}`), as footprint-story's 0.35.0 notes ask of a
 * dark page. WHY: white paper faces under a light ink are names nobody can read, and a navy line on a dark ground is a
 * line nobody sees. A film has one ground a world is drawn on, the theme's (draw.mjs · lookOf: `bg`, and `ink` on it);
 * it is dark when it is darker than its ink.
 *
 * A column the recipe writes is the recipe's: the ground's colours go only into a column the look itself gives. When
 * the ground's colours fill every column the look gives (the duotone's one column), the row is written out without the
 * look's name — footprint-story refuses a look that draws nothing of its own — and the record keeps the name here
 * (`look`), beside the style footprint-story recorded.
 *
 * WHY a duotone world hands its untoned blocks' colours to the build: the kit builds its map with no colours (the
 * page decides each face's at draw time: paint.mjs), and the duotone leaves a face the page colours as it is — that is
 * where the kit puts colour that means something, a block's ok / warn / bad tone. So with no colours a duotone would
 * print only its lines. A block with no tone means nothing by its colour, so its colour (its own, else the kit's tone,
 * draw.mjs · ISO_LOOK) is handed in, and the duotone prints it as a tint of its accent; a toned block, and every
 * floor (the ground the page lays), stay the page's. footprint-story's 0.35.0 notes ask exactly this of a tool.
 *
 * A block's name's ink is footprint-story's rule (0.38.0, `readableInk`), asked where the name is drawn (draw.mjs ·
 * drawName); the luminance the ground is judged by here is its `luminance`, the one WCAG measure a deck and a film share.
 */
import {isoStyle, ISO_LOOKS, DUOTONE, luminance} from 'footprint-story/isometric';
import {STYLE_CHOICES} from './read.mjs';

/** Whether the film's ground is dark: darker than the ink written on it (WCAG's relative luminance, footprint-story's). */
export const darkGround = (look) => luminance(look.bg) < luminance(look.ink);

/** The colours a look's own column takes from a dark ground: by the choice the look names there. */
const FROM_GROUND = Object.freeze({
  shading: (entry, look) => (entry === 'paper' ? {name: 'paper', colour: look.bg} : null),
  palette: (entry, look) => (entry === 'duotone' ? {name: 'duotone', paper: look.bg, ink: look.ink, accent: DUOTONE.accent} : null),
});

/**
 * The style the map is built in, on this ground: `style` as read (null: today's look), `look` the world's colours
 * (draw.mjs · lookOf), `who` the entry's words for a refusal. Gives {style, look: {name, ground} | null}.
 */
export function groundedStyle(style, look, who) {
  if (!style || !Object.hasOwn(style, 'look')) return {style, look: null};
  const name = style.look, dark = darkGround(look), record = Object.freeze({name, ground: dark ? 'dark' : 'light'});
  if (!dark) return {style, look: record};
  const row = ISO_LOOKS[name], taken = {};
  for (const [column, entry] of Object.entries(row)) {
    const given = Object.hasOwn(style, column) ? null : FROM_GROUND[column]?.(entry, look) ?? null;
    if (given) taken[column] = given;
  }
  if (!Object.keys(taken).length) return {style, look: record};
  // the look still gives a column of its own: named beside the ground's colours; else its row written out
  const stillLooks = Object.keys(row).some((column) => !Object.hasOwn(style, column) && !Object.hasOwn(taken, column));
  const grounded = stillLooks ? {...style, ...taken} : {...Object.fromEntries(Object.entries(style).filter(([k]) => k !== 'look')), ...taken};
  try { isoStyle(grounded, {choices: STYLE_CHOICES}); } catch (e) {
    const said = String(e?.message ?? e).replace(/^isometric: /, '').replace(/^the style's /, '');
    throw new Error(`${who}: the look "${name}" on this dark ground (${look.bg}) takes the ground's colours (${Object.keys(taken).join(', ')}: ${JSON.stringify(taken)}), and then ${said} — write the ${Object.keys(taken).join(' and ')} out in place of the look, with colours that read on this ground`, {cause: e});
  }
  return {style: grounded, look: record};
}

/** Whether a style (as handed to the build: a row, a look, or null) prints the map in the duotone palette. */
export const inDuotone = (style) => (style ? isoStyle(style, {choices: STYLE_CHOICES}).row.palette === 'duotone' : false);
