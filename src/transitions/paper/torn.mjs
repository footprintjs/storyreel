/**
 * Torn: the old picture is a sheet, torn away. First the tear: a ragged tear runs across the sheet from the `direction`
 * edge, and behind it the torn piece lifts (its shadow grows), tilts a little and pulls back, so the new picture shows
 * along the tear as it goes, between two white torn lips. Then the drag: the sheet, torn free, is dragged off toward
 * that edge, tilting further, lifted, its shadow on the new picture. The piece CARRIES the old picture: it is drawn
 * whole and opaque wherever it is, never faded. `tear` is the share of the change the tear takes; the drag takes the rest.
 *
 * Worked in tear space (AXES): u runs from the `direction` edge into the sheet, v along that edge. The tear is the line
 * u = front + SLANT · (v − middle) + its seeded raggedness (tearShape); the torn piece is the sheet on the edge's side of
 * it, the rest of the sheet lies in place beyond it.
 */
import {W, H, clamp, clamp01, lerp, smooth} from '../../frame.mjs';
import {rgba} from '../../colour.mjs';
import {paperTokens, pixelScale} from './tokens.mjs';
import {seeded} from './seeded.mjs';

const ROWS = 48, SLANT = .25, RAGGED = 26, LIP = 9;
/** How far the torn piece pulls back while the tear runs (the gap the new picture shows in), its tilts, its lift when dragged. */
const GAP = 70, TILT_TEAR = Math.PI / 180, TILT_DRAG = 6 * Math.PI / 180, LIFT = .03;
const SHADOW = Object.freeze({blur: 30, offset: 18, alpha: .35});

/**
 * Each direction as tear space: `drag` the frame vector the piece is pulled along, `point(u, v)` the frame point of
 * (u, v), the sheet's spans along u and v, and `turn`, the tilt's sign that lets the far end of the piece trail behind
 * the corner it is pulled by (u = 0, v = 0).
 */
const AXES = Object.freeze({
  left: {drag: [-1, 0], point: (u, v) => [u, v], spanU: W, spanV: H, turn: -1},
  right: {drag: [1, 0], point: (u, v) => [W - u, v], spanU: W, spanV: H, turn: 1},
  top: {drag: [0, -1], point: (u, v) => [v, u], spanU: H, spanV: W, turn: 1},
  bottom: {drag: [0, 1], point: (u, v) => [v, H - u], spanU: H, spanV: W, turn: -1},
});
export const TORN_DIRECTIONS = Object.freeze(Object.keys(AXES));

/** The tear's shape from the seed, a row each: its raggedness (a slow wander and fibre teeth) and how wide each side's white lip is. */
function tearShape(seed) {
  const next = seeded(seed), phase = next() * 2 * Math.PI;
  return Array.from({length: ROWS + 1}, (_, i) => ({
    ragged: (.55 * (2 * next() - 1) + .45 * Math.sin(i * 1.7 + phase)) * (RAGGED - 6) + (i % 2 ? 2 + 4 * next() : 0),
    piece: 3 + (LIP - 3) * next(), rest: 2 + (LIP - 4) * next(),
  }));
}

/** How far the piece must be dragged to be off the frame at the end: tilted, lifted, with its lip and its shadow. */
const dragReach = ax => (1 + LIFT) * (ax.spanU * Math.cos(TILT_DRAG) + ax.spanV * Math.sin(TILT_DRAG)) + LIP + 1.5 * SHADOW.blur + SHADOW.offset + 40;

/** Trace the torn piece (from = 'piece': the sheet on the edge's side of the tear) or the rest, each row's u moved by `lip`. */
function outline(ctx, ax, line, side, lip) {
  const edge = side === 'piece' ? 0 : ax.spanU, at = (u, v) => ctx.lineTo(...ax.point(u, v));
  ctx.beginPath(); ctx.moveTo(...ax.point(edge, 0));
  for (const {u, v, shape} of line) at(clamp(side === 'piece' ? u + lip * shape.piece : u - lip * shape.rest, 0, ax.spanU), v);
  at(edge, ax.spanV); ctx.closePath();
}

/** Where the change is: the tear's front, the piece's shift along the drag, its tilt, its scale and how lifted it is. */
function tornAt(e, p, ax) {
  const tearing = clamp01(e / p.tear), drag = smooth(0, 1, (e - p.tear) / (1 - p.tear)), lifted = smooth(0, .3, tearing);
  const reach = SLANT * ax.spanV / 2 + RAGGED + LIP + 2;   // the front starts and ends with the whole tear off the sheet
  return {front: lerp(-reach, ax.spanU + reach, tearing), lifted, shift: GAP * lifted + dragReach(ax) * drag,
    tilt: ax.turn * (TILT_TEAR * lifted + (TILT_DRAG - TILT_TEAR) * drag), scale: 1 + LIFT * drag};
}

export function torn(ctx, {e, from, to, p, theme}) {
  const t = paperTokens(theme), ax = AXES[p.direction], at = tornAt(e, p, ax), px = pixelScale(ctx);
  const line = tearShape(p.seed).map((shape, i) => { const v = i / ROWS * ax.spanV; return {u: at.front + (v - ax.spanV / 2) * SLANT + shape.ragged, v, shape}; });
  to(ctx);
  // The rest of the sheet, in place beyond the tear: its white lip into the gap, then the old picture.
  ctx.save(); outline(ctx, ax, line, 'rest', 1); ctx.fillStyle = t.back; ctx.fill();
  outline(ctx, ax, line, 'rest', 0); ctx.clip(); from(ctx); ctx.restore();
  // The torn piece: pulled along the drag, tilted and lifted about the corner it is pulled by, casting its shadow.
  const [dx, dy] = ax.drag, [cx, cy] = ax.point(0, 0);
  ctx.save(); ctx.translate(dx * at.shift, dy * at.shift);
  ctx.translate(cx, cy); ctx.rotate(at.tilt); ctx.scale(at.scale, at.scale); ctx.translate(-cx, -cy);
  ctx.save(); ctx.shadowColor = rgba(t.ink, SHADOW.alpha * at.lifted); ctx.shadowBlur = SHADOW.blur * at.lifted * px; ctx.shadowOffsetY = SHADOW.offset * at.lifted * px;
  outline(ctx, ax, line, 'piece', 1); ctx.fillStyle = t.back; ctx.fill(); ctx.restore();
  outline(ctx, ax, line, 'piece', 0); ctx.clip(); from(ctx);
  ctx.restore();
}

export const TORN = {family: 'wipe', seconds: 1.4, ease: 'inOut', sound: 'slide',
  params: {direction: {oneOf: TORN_DIRECTIONS, default: 'left'}, tear: {number: [.2, .8], default: .5}, seed: {number: [0, 10000], default: 5}}, draw: torn};
