/**
 * Ring iris: a ring opens from `at` onto the new picture — from `radius` (a ring already drawn in the old picture, whose
 * inside then dissolves to the new one) or from a point — its two coloured halves turning and a dot running round it
 * twice. It draws itself in over the first frames, so the change starts on the old picture exactly.
 */
import {lerp, smooth, farthest} from '../../frame.mjs';
import {paperTokens} from './tokens.mjs';

const TAU = 2 * Math.PI;

function ringIris(ctx, {e, from, to, p, ghost, theme}) {
  const t = paperTokens(theme), [cx, cy] = p.at, end = farthest(p.at) + p.width + 12, r = Math.max(.5, lerp(p.radius, end, e));
  from(ctx);
  const inside = c => { c.save(); c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.clip(); to(c); c.restore(); };
  if (p.radius > 0) ghost(smooth(0, .25, e), inside); else inside(ctx);
  ctx.globalAlpha *= smooth(0, .12, e); ctx.lineCap = 'round'; ctx.lineWidth = p.width * (1 - .5 * e);
  ctx.strokeStyle = t.fold; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  [p.color ?? t.accent, p.accent ?? t.second].forEach((c, i) => {
    ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2 + i * Math.PI + .06, Math.PI / 2 + i * Math.PI - .06); ctx.stroke();
  });
  const angle = -Math.PI / 2 + e * 2 * TAU, dx = cx + Math.cos(angle) * r, dy = cy + Math.sin(angle) * r;
  ctx.fillStyle = t.ink; ctx.beginPath(); ctx.arc(dx, dy, p.width * .7, 0, TAU); ctx.fill();
  ctx.fillStyle = t.paper; ctx.beginPath(); ctx.arc(dx, dy, p.width * .27, 0, TAU); ctx.fill();
}

export const RING_IRIS = {family: 'iris', seconds: 1.2, ease: 'inOut', sound: 'slide',
  params: {at: {point: true, default: [800, 450]}, radius: {number: [0, 900], default: 0}, width: {number: [4, 80], default: 26}, color: {color: true, default: null}, accent: {color: true, default: null}},
  draw: ringIris};
