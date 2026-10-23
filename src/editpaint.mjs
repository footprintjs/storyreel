/**
 * The painter of an edit (edit.mjs): output frame f into a canvas. Kept apart from paint.mjs — the render hands it to the
 * frame loop (paint.mjs · frameEncoder's `paintEdit`) — so an edit's drawing (the joins, the end card) is not part of the
 * drawing fingerprint every cached piece of a whole film is keyed by (segments/drawing.mjs): changing it redraws no piece.
 *
 * Each cut is painted by its own layout (its crop), with only the caption its own stretch says (edit.mjs ·
 * captionInCut); in an overlap the later side is laid over the earlier at `a` and its bands are the ones drawn; a pop
 * covers the picture with the paper; the end card is drawn in the film's theme under the title band. A cut's painters
 * are made when it is first drawn, and every painter shares one canvas for its motion blur's subframes.
 */
import {createCanvas} from '@napi-rs/canvas';
import {makePainter} from './paint.mjs';
import {editFrame, captionInCut} from './edit.mjs';
import {drawEndCard} from './endcard.mjs';

/** {film, edit, framedCuts (each cut's compiled layout, or null), blur, width, height, fps, ctx} → f => void. */
export function makeEditPainter({film, edit, framedCuts, blur, width, height, fps, ctx}) {
  const sub = createCanvas(width, height), subCtx = sub.getContext('2d'), scratch = blur ? createCanvas(width, height) : null;
  const made = new Map(), painter = (i, c) => {
    const key = `${i}:${c === ctx ? 'top' : 'under'}`;
    if (!made.has(key)) made.set(key, makePainter({film, framed: framedCuts[i], blur, width, height, fps, ctx: c, scratch}));
    return made.get(key);
  };
  const base = framedCuts[0];
  const box = base ? base.boxes.film : [0, 0, width, height], paper = base?.paper ?? film.theme?.palette?.bg ?? '#f3eee3';
  const done = c => { c.resetTransform(); c.globalAlpha = 1; };
  const bands = (i, t) => { const framed = framedCuts[i]; if (!framed) return; framed.overlay(ctx, t, {caption: captionInCut(edit.cuts[i], t, framed.captionAt)}); done(ctx); };
  const card = c => { drawEndCard(c, {lines: edit.end.lines, box, width, height, theme: film.theme}); done(c); };
  const title = () => { if (base) { base.overlay(ctx, 0, {still: true}); done(ctx); } };
  const pop = () => { ctx.fillStyle = paper; ctx.fillRect(...box); };
  return f => {
    const s = editFrame(edit, f);
    if (s.kind === 'cut') { painter(s.cut, ctx)(s.t, {bands: false}); if (s.pop) pop(); bands(s.cut, s.t); return; }
    if (s.kind === 'end') { card(ctx); if (s.pop) pop(); title(); return; }
    painter(s.under.cut, ctx)(s.under.t, {bands: false});
    if (s.over.end) card(subCtx); else painter(s.over.cut, subCtx)(s.over.t, {bands: false});
    ctx.globalAlpha = s.a; ctx.drawImage(sub, 0, 0); done(ctx);
    if (s.over.end) title(); else bands(s.over.cut, s.over.t);
  };
}
