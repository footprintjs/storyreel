/**
 * paint — the kit's one canvas painter: a piece's paint list drawn on a 2D canvas, item by item, in the list's order.
 *
 *   paintItems(c, items, {base, ink})   items: footprint-story/isometric's paint list (the map's `style` step:
 *                                       `paints[i]` for a block, `floorPaints[i]` for a floor); base, ink: the kit's colours
 *
 * The list says what to draw (footprint-story · src/isometric/paint.js): a `polygon`, an `ellipse`, a `path` (moves,
 * lines, arcs, a close) or `lines` (loose segments), each with a fill and a stroke or null. This module only traces
 * each item and fills and strokes it as the list says. It decides no shape and no colour of its own.
 *
 * WHY one painter: a deck and a film paint the same list, so they draw the same picture; a new look (a style) needs a
 * new list, never new drawing code here. It was proven call for call equal to the kit's old face-by-face drawing
 * (footprint-story's test/isometric-style.property.test.js · canvasPaint, against StoryReel 0.38.0's drawBlock and
 * drawFloor); the film's golden frames pin it here.
 *
 * WHY the colours come in here, not through the style step: the kit builds its map with no colours, so the built map
 * is the deck's, colour for colour (a fill then carries its recipe, `{mix: [toward, share], colour: null}`, and a
 * stroke `colour: null`: "the page decides"). The kit is that page: it picks a block's base (its colour, or its tone's
 * tint) and the theme's ink at draw time, and this painter applies the recipe to them. A colour the list does give
 * (a style's own palette, later) is drawn as given.
 */

/** A hex colour's three channels, 0 to 255 (`#rgb` or `#rrggbb`: a recipe may write either). */
const channels = (hex) => { const h = hex.length === 4 ? `#${[...hex.slice(1)].map((ch) => ch + ch).join('')}` : hex; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); };

/** `hex` mixed with `other` by `share` of the other (CSS color-mix in srgb; footprint-story's mixColour, which takes `#rrggbb` only). */
export const mix = (hex, other, share) => { const a = channels(hex), b = channels(other); return `#${a.map((v, i) => Math.round(v + (b[i] - v) * share).toString(16).padStart(2, '0')).join('')}`; };

/** A hex colour at an alpha, as a canvas takes it. */
export const rgba = (hex, alpha) => `rgba(${channels(hex).join(',')},${alpha})`;

/** An item traced as the canvas's current path. */
function trace(c, it) {
  c.beginPath();
  if (it.item === 'polygon') { it.points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); return; }
  if (it.item === 'ellipse') { c.ellipse(it.cx, it.cy, it.rx, it.ry, 0, 0, 2 * Math.PI); return; }
  if (it.item === 'lines') { for (const [x1, y1, x2, y2] of it.segments) { c.moveTo(x1, y1); c.lineTo(x2, y2); } return; }
  if (it.item !== 'path') throw new Error(`isometric kit: a paint item is a polygon, an ellipse, a path or lines — not "${it.item}"`);   // refusal: internal (footprint-story's checkPaint lets only these through)
  for (const [op, ...n] of it.segments) {
    if (op === 'move') c.moveTo(n[0], n[1]);
    else if (op === 'line') c.lineTo(n[0], n[1]);
    // an arc is at most half a turn, counted the way it turns (paint.js), so the canvas never goes the long way round
    else if (op === 'arc') c.ellipse(n[0], n[1], n[2], n[3], 0, n[4], n[5], n[6]);
    else if (op === 'close') c.closePath();
    else throw new Error(`isometric kit: a paint item's path has no step "${op}"`);   // refusal: internal (as above)
  }
}

/** The colour a fill comes to: its own, else its recipe over the kit's base; null when there is nothing to fill with. */
function fillColour(fill, base) {
  if (fill === null) return null;
  if (fill.colour !== null) return fill.colour;
  if (base === null) return null;   // a floor with no colour of its own: its ground is the frame's, left unpainted
  return fill.mix === null ? base : mix(base, fill.mix[0], fill.mix[1]);
}

/**
 * The items drawn in order: each traced, filled when its fill comes to a colour, stroked when it has a stroke (its own
 * colour, else the kit's ink, at its alpha; its width, join and cap). `colours`: {base, ink}, the kit's, base null for none.
 */
export function paintItems(c, items, {base, ink}) {
  for (const it of items) {
    trace(c, it);
    const fill = fillColour(it.fill, base);
    if (fill !== null) { c.fillStyle = fill; c.fill(); }
    const s = it.stroke;
    if (s === null) continue;
    const colour = s.colour ?? ink;
    // a whole stroke as the hex itself, a faint one as rgba: what the kit drew before the painter, byte for byte
    c.strokeStyle = s.alpha === 1 ? colour : rgba(colour, s.alpha);
    c.lineWidth = s.width; c.lineJoin = s.join; c.lineCap = s.cap;
    c.stroke();
  }
}
