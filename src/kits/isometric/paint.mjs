/**
 * paint — the kit's one canvas painter: a piece's paint list drawn on a 2D canvas, item by item, in the list's order.
 *
 *   paintItems(c, items, {base, ink, now})   items: footprint-story/isometric's paint list (the map's `style` step:
 *                                       `paints[i]` for a block, `floorPaints[i]` for a floor); base, ink: the kit's colours;
 *                                       now: seconds since the piece's start (Infinity, the usual: every stroke whole)
 *
 * The list says what to draw (footprint-story · src/isometric/paint.js): a `polygon`, an `ellipse`, a `path` (moves,
 * lines, arcs, a close), `lines` (loose segments) or a `stroke` (a line drawn by hand: a width and a time per point),
 * each with a fill and a stroke or null. This module only traces each item and fills and strokes it as the list says.
 * It decides no shape and no colour of its own.
 *
 * WHY a `stroke` is filled, not stroked: a canvas line has one width, and a hand's line thins and tapers along it. The
 * geometry is all footprint-story's (human · strokeAt, strokeOutline: the one rule a deck's SVG and a film's canvas paint
 * by): `strokeAt(points, now)` is the line as far as the pen has come (each point says when the pen is there, seconds
 * from the piece's start; the pen's place between two points at `now`, so the line grows smoothly), and
 * `strokeOutline(…, {cap})` the one ring round it, both ends capped. This painter only fills that ring — by the
 * non-zero rule, a canvas's default, because the ring can cross itself at a round cap and even-odd would leave a hole.
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

import {mixColour} from 'footprint-story/isometric';
import {strokeAt, strokeOutline} from 'footprint-story/human';

/**
 * `hex` mixed with `other` by `share` of the other: footprint-story's mixColour (CSS color-mix in srgb, `#rgb` or
 * `#rrggbb` either side, since 0.32.4), the one mix a deck and a film colour a face by.
 */
export const mix = mixColour;

/**
 * A hex colour at an alpha, as a canvas takes it: `rgba(r,g,b,alpha)`. WHY its own three channels here: footprint-story
 * has no colour-at-an-alpha (its paint list keeps alpha beside the colour, and an SVG writes it as an opacity); the
 * colour is read as `#rrggbb` through mixColour first (no mix: `#rgb` written out), so the one colour reader decides it.
 */
export const rgba = (hex, alpha) => { const h = mixColour(hex, hex, 0); return `rgba(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',')},${alpha})`; };

/** An item traced as the canvas's current path. */
function trace(c, it) {
  c.beginPath();
  if (it.item === 'polygon') { it.points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); return; }
  if (it.item === 'ellipse') { c.ellipse(it.cx, it.cy, it.rx, it.ry, 0, 0, 2 * Math.PI); return; }
  if (it.item === 'lines') { for (const [x1, y1, x2, y2] of it.segments) { c.moveTo(x1, y1); c.lineTo(x2, y2); } return; }
  if (it.item !== 'path') throw new Error(`isometric kit: a paint item is a polygon, an ellipse, a path, lines or a stroke — not "${it.item}"`);   // refusal: internal (footprint-story's checkPaint lets only these through)
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

/** A stroke's colour as the canvas takes it: its own, else the kit's ink; a whole one as the hex itself, a faint one as rgba. */
const strokeColour = (s, ink) => { const colour = s.colour ?? ink; return s.alpha === 1 ? colour : rgba(colour, s.alpha); };

/**
 * A `stroke` item drawn as far as the pen has come `now` (seconds from its piece's start): footprint-story's ring round
 * the part drawn (strokeAt, then strokeOutline with the item's cap), one path filled once in the stroke's colour, so it
 * never darkens itself at an alpha under 1. Nothing drawn yet, nothing filled.
 */
function paintStroke(c, it, ink, now) {
  const ring = strokeOutline(strokeAt(it.points, now), {cap: it.stroke.cap});
  if (!ring.length) return;
  c.beginPath();
  ring.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fillStyle = strokeColour(it.stroke, ink); c.fill('nonzero');
}

/**
 * The items drawn in order: each traced, filled when its fill comes to a colour, stroked when it has a stroke (its own
 * colour, else the kit's ink, at its alpha; its width, join and cap); a `stroke` item filled as far as the pen has come
 * `now` (paintStroke). `colours`: {base, ink}, the kit's, base null for none; `now`: seconds since the piece's start.
 */
export function paintItems(c, items, {base, ink, now = Infinity}) {
  for (const it of items) {
    if (it.item === 'stroke') { paintStroke(c, it, ink, now); continue; }
    trace(c, it);
    const fill = fillColour(it.fill, base);
    if (fill !== null) { c.fillStyle = fill; c.fill(); }
    const s = it.stroke;
    if (s === null) continue;
    // a whole stroke as the hex itself, a faint one as rgba: what the kit drew before the painter, byte for byte
    c.strokeStyle = strokeColour(s, ink);
    c.lineWidth = s.width; c.lineJoin = s.join; c.lineCap = s.cap;
    c.stroke();
  }
}
