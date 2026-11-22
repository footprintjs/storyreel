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
 * ring round it is footprint-story's (human · strokeOutline, the one geometry for a line of changing width, the ring
 * StoryDeck's SVG fills too); this painter fills that ring and, for a round cap, the circle of each end's width (the
 * ends are the painter's, strokeOutline says). WHY drawn by time: each point says when the pen is there (seconds from
 * the piece's start, rising), so a film draws the line as far as the pen has come — the ring of the points it has
 * reached, the same ring cut short, never a second curve. footprint-story gives no point between two of a stroke's
 * points at a time, so the line grows point by point (its points are a couple of px apart: plan.js walks every 2 px).
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

import {strokeOutline} from 'footprint-story/human';

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
 * The points of a `stroke` item the pen has reached `now` seconds after its piece's start: the first points, up to the
 * last whose time is `now` or before (footprint-story checks the times rise along the item). The whole list when all
 * are reached, so a finished line is the very list.
 */
export function reachedPoints(points, now) {
  let n = 0;
  while (n < points.length && points[n][3] <= now) n += 1;
  return n === points.length ? points : points.slice(0, n);
}

/**
 * A `stroke` item drawn as far as the pen has come: the ring round the reached points (footprint-story · strokeOutline)
 * and, for a round cap, a circle of each end's width — one path, filled once in the stroke's colour, so the ring and its
 * ends never darken where they overlap at an alpha under 1. WHY each circle turns clockwise on the frame: the ring runs
 * up a stroke's left side and back down its right, which is clockwise on a y-down frame whatever way the stroke goes, so
 * the ends add to it under the canvas's nonzero rule; turned the other way they would cut a hole where they overlap it.
 * Nothing reached, nothing drawn; one point reached is the pen's touch: its end's dot.
 */
function paintStroke(c, it, ink, now) {
  const s = it.stroke;
  // footprint-story's ring takes a round end and a cut one; a square end would be geometry made here, so it is refused
  // (at any time: whether a list is drawn never hangs on the frame)
  if (s.cap === 'square') throw new Error(`isometric kit: a stroke item's cap is "round" or "butt" — not "square" (footprint-story's strokeOutline gives no square end): give the stroke of "${it.of}" cap "round", as footprint-story's strokeItems does`);
  const points = reachedPoints(it.points, now);
  if (!points.length) return;
  c.beginPath();
  if (points.length >= 2) { strokeOutline(points).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); }
  if (s.cap === 'round') {
    for (const [x, y, w] of points.length === 1 ? points : [points[0], points.at(-1)]) { c.moveTo(x + w / 2, y); c.arc(x, y, w / 2, 0, 2 * Math.PI); }
  }
  c.fillStyle = strokeColour(s, ink); c.fill();
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
