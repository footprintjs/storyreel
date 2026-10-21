/**
 * Morph: a box becomes a box. The old picture dims away into the paper and the new one comes up out of it, while an
 * outline travels and reshapes from the start box to the end box: the things `region` and `into` name (the film finds
 * their boxes, as `match` does) or, left out, `fromBox` and `toBox`.
 */
import {W, H, clamp01, lerp} from '../../frame.mjs';
import {rgba} from '../../colour.mjs';
import {paperTokens} from '../../paper-tokens.mjs';

const CARD = Object.freeze([600, 320, 1000, 580]), WIDE = Object.freeze([160, 90, 1440, 810]);

/** Where the box starts and ends: a named thing's box (found by the film) or the box setting. */
function morphBoxes(p, boxes) {
  const into = p.into ?? p.region;
  return [p.region ? boxes.from[p.region] ?? p.fromBox : p.fromBox, into ? boxes.to[into] ?? p.toBox : p.toBox];
}

function morph(ctx, {e, from, to, p, ghost, theme, boxes}) {
  const t = paperTokens(theme), [a, b] = morphBoxes(p, boxes);
  ctx.fillStyle = t.ground; ctx.fillRect(0, 0, W, H);
  if (e < .55) ghost(1 - clamp01(e / .55), from);
  if (e > .45) ghost(clamp01((e - .45) / .55), to);
  const u = clamp01((e - .15) / .7), box = [0, 1, 2, 3].map(k => lerp(a[k], b[k], u));
  const corner = lerp(10, Math.min(box[2] - box[0], box[3] - box[1]) / 2, u * .6);
  ctx.globalAlpha *= Math.sin(Math.PI * clamp01(e * 1.05)); ctx.lineWidth = 6;
  ctx.strokeStyle = p.color ?? t.accent; ctx.fillStyle = rgba(t.paper, .55);
  ctx.beginPath(); ctx.roundRect(box[0], box[1], box[2] - box[0], box[3] - box[1], Math.max(0, corner)); ctx.fill(); ctx.stroke();
}

export const MORPH = {family: 'match', seconds: 1.2, ease: 'inOut', sound: null,
  params: {region: {name: true, default: null}, into: {name: true, default: null}, fromBox: {box: true, default: CARD}, toBox: {box: true, default: WIDE}, color: {color: true, default: null}},
  regions: p => ({from: p.region ? [p.region] : [], to: (p.into ?? p.region) ? [p.into ?? p.region] : []}), draw: morph};
