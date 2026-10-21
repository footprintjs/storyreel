/**
 * Ink bleed: ink spreads across the old picture from `at`, and the new picture comes up through the ink a beat behind
 * it. The blot's ragged rim and its splashed drops are a seeded shape (blotShape), the same on every frame.
 */
import {clamp01, farthest} from '../../frame.mjs';
import {paperTokens} from '../../paper-tokens.mjs';
import {seeded} from '../../seeded.mjs';

const POINTS = 96, DROPS = 9, TAU = 2 * Math.PI;

/** A blot from the seed: its rim (radius factors round the circle), its drops, and `least`, the rim's nearest reach. */
function blotShape(seed) {
  const next = seeded(seed), a = next() * TAU, b = next() * TAU;
  const rim = Array.from({length: POINTS}, (_, i) => { const angle = i / POINTS * TAU; return 1 + .16 * Math.sin(5 * angle + a) + .08 * Math.sin(13 * angle + b) + .05 * (2 * next() - 1); });
  const drops = Array.from({length: DROPS}, (_, i) => ({angle: i * 2.4 + a, out: 1.18 + .14 * next(), size: .05 + .03 * next()}));
  // A polygon's edges sag at most cos(π/n) inside its points: the blot covers every point within r · least of its centre.
  return {rim, drops, least: Math.min(...rim) * Math.cos(Math.PI / POINTS)};
}

function blotPath(ctx, {rim, drops}, [cx, cy], r) {
  ctx.beginPath();
  rim.forEach((k, i) => { const angle = i / POINTS * TAU, x = cx + Math.cos(angle) * r * k, y = cy + Math.sin(angle) * r * k; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.closePath();
  for (const d of drops) { const x = cx + Math.cos(d.angle) * r * d.out, y = cy + Math.sin(d.angle) * r * d.out; ctx.moveTo(x + r * d.size, y); ctx.arc(x, y, r * d.size, 0, TAU); }
}

function inkBleed(ctx, {e, from, to, p, theme}) {
  const ink = p.color ?? paperTokens(theme).ink, inkShape = blotShape(p.seed), riseShape = blotShape(p.seed + 1);
  // The radius at which a blot's ragged rim clears the farthest corner, with a little to spare.
  const cover = shape => farthest(p.at) / shape.least * 1.04, spread = clamp01(e * 1.35), rise = clamp01((e - .3) / .7);
  from(ctx);
  if (spread > 0) { blotPath(ctx, inkShape, p.at, cover(inkShape) * spread); ctx.fillStyle = ink; ctx.fill(); }
  if (rise > 0) { ctx.save(); blotPath(ctx, riseShape, p.at, cover(riseShape) * rise); ctx.clip(); to(ctx); ctx.restore(); }
}

export const INK_BLEED = {family: 'iris', seconds: 1.3, ease: 'inOut', sound: 'whoosh',
  params: {at: {point: true, default: [220, 760]}, color: {color: true, default: null}, seed: {number: [0, 10000], default: 7}}, draw: inkBleed};
