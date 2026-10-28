/**
 * Moves: a vocabulary of named motions, asked for by name — by how a motion FEELS (smooth, crisp, soft, heavy, bouncy)
 * and what it is FOR (ui, text, logo, character, 3d). The vocabulary is footprint-story/motion's, the one table a film
 * and a deck share (moveAt, readMove, movesBy, stagger and the table itself); what is StoryReel's own is the painter
 * that applies a move's values to a canvas.
 *
 *   moveAt('soft-rise', t, {start})          → {opacity, x, y, scale, rotate, blur, clip, progress, mask}
 *   applyMove(ctx, values, {box})           the values on a canvas, for a thing drawn in box
 */
export {MOVES, MOVE_NAMES, MOVE_KINDS, MOVE_USES, MOVE_FEELS, MOVE_FEEL_NAMES, MASKS, REST, WORD_GAP, LETTER_GAP, EXIT_SHARE, readMove, moveAt, stagger, movesBy} from 'footprint-story/motion';

/**
 * Apply a move's values to a canvas, for a thing drawn in `box` ([x0, y0, x1, y1], the whole 1600×900 frame by
 * default): its opacity, its offset, its scale and turn about the box's centre, its mask, its blur (in frame pixels,
 * scaled to the canvas). Save the context before and restore it after; returns false when nothing of the thing shows
 * (draw nothing then). Blur applies to each drawing operation: blur a picture of many shapes as one layer.
 */
export function applyMove(ctx, values, {box = [0, 0, 1600, 900]} = {}) {
  const v = values, [x0, y0, x1, y1] = box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (!(v.opacity > 0 && v.clip > 0 && v.scale > 0)) return false;
  const device = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
  ctx.globalAlpha *= v.opacity;
  ctx.translate(cx + v.x, cy + v.y); ctx.rotate(v.rotate * Math.PI / 180); ctx.scale(v.scale, v.scale); ctx.translate(-cx, -cy);
  if (v.mask && v.clip < 1) maskTo(ctx, v.mask, v.clip, box);
  if (v.blur > 0) ctx.filter = `blur(${+(v.blur * device).toFixed(3)}px)`;
  return true;
}

/** Clip to the share of the box a mask uncovers: from an edge (left, right, top, bottom), or a circle from its centre (iris). */
function maskTo(ctx, mask, clip, [x0, y0, x1, y1]) {
  const w = x1 - x0, h = y1 - y0;
  ctx.beginPath();
  if (mask === 'left') ctx.rect(x0, y0, w * clip, h);
  else if (mask === 'right') ctx.rect(x1 - w * clip, y0, w * clip, h);
  else if (mask === 'top') ctx.rect(x0, y0, w, h * clip);
  else if (mask === 'bottom') ctx.rect(x0, y1 - h * clip, w, h * clip);
  else ctx.arc((x0 + x1) / 2, (y0 + y1) / 2, clip * Math.hypot(w, h) / 2, 0, Math.PI * 2);
  ctx.clip();
}
