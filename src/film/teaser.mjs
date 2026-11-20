/**
 * Stage 14 of the compile: the recap's teaser for the next film — the answer frame fills the screen, a stamp asks the
 * next question, the recorded scene rewinds (the film's own frames, played backward), and the next title arrives.
 * Its own stage because the teaser is a picture of its own at the film's end: it draws over everything and its rewind
 * replays the whole film, which is why the regions, the reading check and the render's rows each ask for it by name.
 *
 * Reads: stages, paper, blank, recalls, frame (at draw time).
 * Writes: recapStage, teaser, drawTeaser(ctx, t, window).
 */
import {createCanvas} from '@napi-rs/canvas';
import {inOut as ease} from '../ease.mjs';
import {makePen} from '../pen.mjs';
import {recapSlotBox, drawRecallFramed, drawRewind, rewindAt} from '../kits/paper/paper.mjs';

export function teaserStage(state) {
  const {stages, paper, blank, recalls} = state;
  const recapStage = stages.find(s => s.teaserAt), teaser = recapStage?.teaserAt, nest = createCanvas(1600, 900);
  /**
   * The teaser for the next film: the answer frame fills the screen, a stamp asks the next
   * question, the recorded scene rewinds, and the next title arrives.
   */
  function drawTeaser(ctx, t, window) {
    const u = t - teaser.at, P = makePen(ctx, paper, {baseScale: 1});
    ctx.drawImage(blank, 0, 0);
    if (u < 2.7) {
      const grow = ease(Math.min(1, u / 1.0)), from = recapSlotBox(5, 1.55), r = from.map((v, j) => v + ([0, 0, 1600, 900][j] - v) * grow);
      if (recalls[teaser.recall]) drawRecallFramed(ctx, P, recalls[teaser.recall], ...r, 1);
      const s = u - 1.2;
      if (s > 0) {
        const k = Math.min(1, s / .35), sc = 1.7 - .7 * ease(k);
        ctx.save(); ctx.translate(800, 450); ctx.rotate(-.1); ctx.scale(sc, sc); ctx.globalAlpha *= Math.min(1, s / .15);
        ctx.font = '700 64px Caveat'; const w = ctx.measureText(teaser.stamp).width + 80;
        ctx.fillStyle = 'rgba(255,250,245,.9)'; ctx.beginPath(); ctx.roundRect(-w / 2, -58, w, 116, 18); ctx.fill();
        ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 7; ctx.beginPath(); ctx.roundRect(-w / 2, -58, w, 116, 18); ctx.stroke();
        ctx.fillStyle = '#c0392b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(teaser.stamp, 0, 4); ctx.restore();
      }
      return;
    }
    if (u < 4.8) {
      // Rewind: the recorded scene plays backwards, fast.
      const back = rewindAt((u - 2.7) / 2.1, teaser.from, teaser.to);
      const n = nest.getContext('2d'); n.resetTransform(); n.clearRect(0, 0, 1600, 900); state.frame(n, back, {window});
      ctx.drawImage(nest, 0, 0);
      drawRewind(ctx, P, u);
      return;
    }
    // The next film's title card.
    const v = u - 4.8, a = ease(Math.min(1, v / .6)), N = teaser.next;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.font = '700 18px Menlo'; const cw = ctx.measureText(N.chip).width + 40;
    ctx.fillStyle = P.C.accent; ctx.beginPath(); ctx.roundRect(800 - cw / 2, 300, cw, 40, 20); ctx.fill();
    P.text(N.chip, 800, 321, 18, paper.palette.bg, {mono: true, weight: 700});
    P.text(N.title, 800, 420, 76, P.C.ink, {display: true, weight: 700});
    const uw = P.measure(N.title, 76, {display: true, weight: 700}) * ease(Math.min(1, Math.max(0, (v - .3) / .7)));
    ctx.fillStyle = P.C.available; ctx.beginPath(); ctx.roundRect(800 - uw / 2, 470, uw, 7, 4); ctx.fill();
    P.alpha(ease(Math.min(1, Math.max(0, (v - .7) / .6))), () => P.text(N.sub, 800, 540, 32, P.C.dim, {display: true}));
    ctx.restore();
  }
  Object.assign(state, {recapStage, teaser, drawTeaser});
}
