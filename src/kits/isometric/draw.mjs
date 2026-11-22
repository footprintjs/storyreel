/**
 * draw — the built map painted on a canvas at t: the ground, the floors with their names, the cables with their labels
 * and packets, then the blocks back to front, each with its name on its top and the leads into its seen ports drawn
 * over it. Only drawing: every number was worked out once (footprint-story's map steps through build.mjs, then
 * cables.mjs and ride.mjs), so any moment draws the same pixels whatever was drawn before.
 *
 * A block's faces, a cylinder's side and top, a floor's ground and tile lines are not drawn here: they are the built
 * map's paint list (the style step: `paints`, `floorPaints`), painted by paint.mjs · paintItems with the kit's colours.
 * Names, labels, cables, packets and heads are still drawn here by hand.
 *
 * The look is StoryDeck's (deck/iso.js · ISO_CSS, deck.css): one colour a block (the paint list's tones: its top 20%
 * lighter and its sides 6% and 18% darker, edges in ink 2.5 px wide; the floor's tile lines ink at 16%); a cable 4 px
 * in the muted ink with an 18 px head; its label in 18 px capitals on a plate of the ground; a packet a 7 px dot in the
 * glow colour. The colours are the film's theme where it has one (ground, ink, muted ink, the ok / warn / bad tones).
 *
 * WHY the leads are drawn again over their block: a cable lies on the floor, under every block standing on it, so the
 * stretch out of a port on a side the viewer sees would be covered by that very block (StoryDeck draws it a level above
 * its block for the same reason); a block in front still covers it.
 */
import {packetsAt, PACKET_RADIUS} from './ride.mjs';
import {arrowHead, headingOf, walkWay, CABLE} from 'footprint-story/isometric';
import {HEX} from './read.mjs';
import {paintItems, mix, rgba as withAlpha} from './paint.mjs';

/**
 * StoryDeck's colours where the theme has none: a block's tone, the glow of a packet. And how long a piece takes to come in.
 * `line` and `grid` are the usual style's edge width and tile-line alpha (footprint-story's `ink` line choice): the paint
 * list carries them, and test/iso-paint.test.mjs pins that the two still agree.
 */
export const ISO_LOOK = Object.freeze({tone: '#d9e4f3', glow: '#e8a33d', line: 2.5, grid: 0.16, cable: 4, label: 1, smallInk: 0.68, appear: 0.35});

/** The colours a world draws with, from the film's theme (its palette), StoryDeck's tokens where the theme has none. */
export function lookOf(theme) {
  const p = theme?.palette ?? {}, type = theme?.type ?? {}, hex = (v, or) => (HEX.test(v ?? '') ? v : or);
  return {bg: hex(p.bg, '#f5f7fa'), ink: hex(p.ink, '#14181f'), muted: hex(p.dim, '#5d6673'), glow: ISO_LOOK.glow, tones: {ok: hex(p.available, '#1a7a3e'), warn: hex(p.unknown, '#8f5c00'), bad: hex(p.reject, '#c0322b')},
    sans: type.sans ?? '"Avenir Next",Arial,sans-serif', mono: type.mono ?? 'Menlo,monospace'};
}

/** How far a piece has come in at t: 0 before its moment, 1 once in (over ISO_LOOK.appear seconds). */
export const inAt = (from, t) => (from === null ? 1 : Math.max(0, Math.min(1, (t - from) / ISO_LOOK.appear)));

/** A floor's ground (filled when it has a colour) and its tile lines: its paint list. Then its name, flat on it. */
function drawFloor(c, f, look) {
  paintItems(c, f.paint, {base: f.color, ink: look.ink});
  if (!f.place) return;
  // flat on the floor along its front edge: the label's lines, their block's foot on the edge (CSS: matrix, then translateY(-100%))
  const {x, y, matrix: [a, b, cc, d], size, lines: words} = f.place, lh = size * 1.15;
  c.save(); c.translate(x, y); c.transform(a, b, cc, d, 0, 0);
  c.font = `700 ${size}px ${look.sans}`; c.textAlign = 'left'; c.textBaseline = 'middle';
  // a halo of the ground under the letters (as a wire's label has its plate): the tile lines stop at the words, which
  // read against the ground alone; and the ink is whole (StoryDeck draws 72%) — at 72% over the grid the film's contrast
  // check measured 2:1
  c.lineWidth = Math.max(4, size * 0.3); c.lineJoin = 'round'; c.strokeStyle = f.color ?? look.bg;
  words.forEach((line, i) => c.strokeText(line, 0, -lh * words.length + (i + 0.5) * lh));
  c.fillStyle = withAlpha(look.ink, ISO_LOOK.label);
  words.forEach((line, i) => c.fillText(line, 0, -lh * words.length + (i + 0.5) * lh));
  // a little weight on the letters (a stroke of the ink, 6% of the size): words laid flat on the floor are read slantwise,
  // thinner than they stand, and in the box round a slanted line the letters are a small share — the film's contrast check
  // read the plain weight at 2.7:1, under the 3:1 large words need
  c.lineWidth = Math.max(1, size * 0.06); c.strokeStyle = c.fillStyle;
  words.forEach((line, i) => c.strokeText(line, 0, -lh * words.length + (i + 0.5) * lh));
  c.restore();
}

/** A block's faces (or a cylinder's side and top): its paint list, in the kit's colours. Then its name on its top. */
function drawBlock(c, b, look) {
  // the list holds each face's recipe (top 20% toward white, sides toward black) and no colour: the kit picks the base
  // and the ink here, so the built map stays the deck's (paint.mjs says why). A tone is the theme's ok / warn / bad
  // colour as a pale tint (60% white): a block's name is ink on its top, and the theme's tones are ink-dark — on the
  // tone itself the name would fail the film's contrast check (StoryDeck colours the block the tone)
  const tone = b.color ?? (b.tone ? mix(look.tones[b.tone], '#ffffff', 0.6) : ISO_LOOK.tone), s = b.shape;
  paintItems(c, b.paint, {base: tone, ink: look.ink});
  if (!b.fitted?.lines.length) return;
  // the name upright on the top's middle, its lines as wordsToFit broke them; the small line beneath it
  const {lines, size} = b.fitted, lh = size * 1.15, sf = b.smallFitted, small = sf ? sf.size * 1.15 + 2 : 0, height = lines.length * lh + small;
  const [cx, cy] = s.centre, top = cy - height / 2;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = look.ink;
  c.font = `700 ${size}px ${look.sans}`;
  lines.forEach((line, i) => c.fillText(line, cx, top + (i + 0.5) * lh));
  if (sf) { c.font = `500 ${sf.size}px ${look.sans}`; c.fillStyle = withAlpha(look.ink, ISO_LOOK.smallInk); c.fillText(sf.lines.join(' '), cx, top + lines.length * lh + 2 + (small - 2) / 2); }
}

/** An arrow's head at `tip`, pointing from `before`: its corners are footprint-story/isometric's (arrowHead), a deck's head's too; only the painting is here. */
function drawHead(c, tip, before, colour) {
  const [t, l, r] = arrowHead(tip, headingOf(before, tip), CABLE.head);
  c.fillStyle = colour; c.beginPath(); c.moveTo(t[0], t[1]); c.lineTo(l[0], l[1]); c.lineTo(r[0], r[1]); c.closePath(); c.fill();
}

/** A cable's whole line (its rounded pieces), or the stretch of it from share `from` to `to` (walked). */
function strokeWay(c, way, from = 0, to = 1) {
  c.beginPath();
  if (from === 0 && to === 1) {
    c.moveTo(...way.start);
    for (const piece of way.pieces) { if (piece.corner) c.quadraticCurveTo(piece.corner[0], piece.corner[1], piece.to[0], piece.to[1]); else c.lineTo(...piece.to); }
  } else walkWay(way, from, to).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}

/** One packet (and its trail) at its share of a wire's line. */
function drawPacket(c, w, p, look) {
  const way = w.cable.way;
  c.save(); c.globalAlpha *= p.alpha;
  if (w.trail && p.share > 0) { c.strokeStyle = w.trail.color; c.lineWidth = w.trail.width; c.lineCap = 'butt'; strokeWay(c, way, 0, p.share); }
  const [x, y] = way.at(p.share);
  c.fillStyle = look.glow; c.shadowColor = look.glow; c.shadowBlur = 5;
  c.beginPath(); c.arc(x, y, PACKET_RADIUS, 0, 2 * Math.PI); c.fill();
  c.restore();
}

/** Which pass a packet is drawn in: 'from' / 'to' on a lead's stretch (over its block), else 'floor' (under the blocks). */
const passOf = (w, share) => (w.cable.leads[0] !== null && share < w.cable.leads[0] ? 'from' : w.cable.leads[1] !== null && share > 1 - w.cable.leads[1] ? 'to' : 'floor');

/** A wire's label on its plate of the ground: the line stops at it, a packet passes under it. */
function drawLabel(c, w, look) {
  const [x, y] = w.labelAt, [hx, hy] = w.labelHalf;
  c.fillStyle = look.bg; c.beginPath(); c.roundRect(x - hx, y - hy, 2 * hx, 2 * hy, 6); c.fill();
  c.font = `600 ${CABLE.label.size}px ${look.mono}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 6; c.lineJoin = 'round'; c.strokeStyle = look.bg; c.strokeText(w.label.toUpperCase(), x, y);
  c.fillStyle = look.muted; c.fillText(w.label.toUpperCase(), x, y);
}

/** The whole map at t on the 1600×900 sheet. `appearAt`: each piece's moment (seconds, or null: from the start). */
export function drawMap(c, map, t, look) {
  c.save();
  c.fillStyle = look.bg; c.fillRect(0, 0, 1600, 900);
  const faded = (alpha, paint) => { if (alpha <= 0) return; c.save(); c.globalAlpha *= alpha; paint(); c.restore(); };
  for (const f of map.floors) faded(inAt(f.appearAt, t), () => drawFloor(c, f, look));
  const riding = map.wires.map((w) => packetsAt(w.riding, w.packets, t));
  // the cables, under every block: their lines, heads at a foot, packets on the floor stretch; then their labels over them all
  map.wires.forEach((w, i) => faded(inAt(w.appearAt, t), () => {
    c.strokeStyle = look.muted; c.lineWidth = ISO_LOOK.cable; c.lineCap = 'round'; c.lineJoin = 'round';
    strokeWay(c, w.cable.way);
    if (w.head && w.cable.leads[1] === null) drawHead(c, w.cable.points.at(-1), w.cable.points.at(-2), look.muted);
    for (const p of riding[i]) if (passOf(w, p.share) === 'floor') drawPacket(c, w, p, look);
  }));
  map.wires.forEach((w) => { if (w.label) faded(inAt(w.appearAt, t), () => drawLabel(c, w, look)); });
  // the blocks back to front; after each, the leads into its seen ports and the packets on them
  for (const b of map.order) {
    faded(inAt(b.appearAt, t), () => drawBlock(c, b, look));
    map.wires.forEach((w, i) => {
      for (const [k, end] of [[0, 'from'], [1, 'to']]) {
        if (w.arrow[end].block !== b || w.cable.leads[k] === null) continue;
        faded(inAt(w.appearAt, t), () => {
          c.strokeStyle = look.muted; c.lineWidth = ISO_LOOK.cable; c.lineCap = 'round'; c.lineJoin = 'round';
          strokeWay(c, w.cable.way, k ? 1 - w.cable.leads[1] : 0, k ? 1 : w.cable.leads[0]);
          if (k && w.head) drawHead(c, w.cable.points.at(-1), w.cable.points.at(-2), look.muted);
          for (const p of riding[i]) if (passOf(w, p.share) === end) drawPacket(c, w, p, look);
        });
      }
    });
  }
  c.restore();
}
