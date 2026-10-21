/**
 * Cloud burst: a thought cloud pops, and the next shot is there. The cloud is thought/'s: the one a "frame": "thought"
 * shot is drawn in or, over a plain shot, the same cloud cut from its picture. The same corner, size and seed give the
 * same cloud (in a film, the leaving thought's own when the recipe leaves them out: film.mjs). Until it pops, the new shot
 * is nowhere: the old one stays whole round the cloud (a thought shot's own paper and trail), while the cloud swells a
 * little and the memory in it fades into the cloud's paper. Then it pops: the cloud breaks into puffs (its own scallops,
 * and the discs that filled it) which drift out and shrink away, and the new shot is uncovered where they part, while
 * round the cloud it fades up with the burst (0.3 s, eased) — a thought's dark backdrop falls away with it, so nothing
 * of it lingers on the new shot. The puffs travel as far as the pop has pushed them (principles.mjs ·
 * envelopeShare, BURSTS.pop: a 60 ms rise, then a fall to a third every 180 ms, at the default 1 s; a longer change
 * stretches the pop with it). Its sound hits on the pop (hitAt).
 */
import {W, H, smooth, scaleAbout} from '../../frame.mjs';
import {rgba} from '../../colour.mjs';
import {envelopeShare} from '../../principles.mjs';
import {thoughtCloud, cloudPath, CLOUD_LINE, THOUGHT_SETTINGS} from '../../thought/index.mjs';
import {paperTokens} from '../../paper-tokens.mjs';
import {seeded} from '../../seeded.mjs';

const TAU = 2 * Math.PI;
/**
 * Where in the change the cloud pops, and how much it has swelled by then; when the memory fades into the cloud's paper;
 * how long after the pop the old shot takes to fall away round the cloud (eased out: fast as the puffs fly, then soft);
 * when the last puffs fade out.
 */
const POP = .3, SWELL = .05, PALE = Object.freeze([.14, .3]), AROUND = .3, FADE = Object.freeze([.6, .92]);
/** Its default length, seconds: the change's clock the pop's timing runs on (a recipe's longer change stretches it). */
const LENGTH = 1;

const puffsByCloud = new WeakMap();
/**
 * The puffs a cloud breaks into: its scallops, each a disc that breaks off and drifts out through its middle, and the
 * discs that filled the space between them, which vanish quickly, so the middle clears first. Each has its way out
 * (from the cloud's middle, nudged), how far it drifts and how long it takes to shrink away (seconds after the pop).
 * Seeded from the cloud's seed; kept per cloud.
 */
export function puffsOf(cloud) {
  if (puffsByCloud.has(cloud)) return puffsByCloud.get(cloud);
  const next = seeded(cloud.seed + .5), [cx, cy] = cloud.centre;
  const puff = ([x, y, r], rim) => {
    const d = Math.hypot(x - cx, y - cy), way = (d > 1 ? Math.atan2(y - cy, x - cx) : next() * TAU) + (next() - .5) * .5;
    const [travel, life] = rim ? [120 + .4 * d, .32 + .18 * next()] : [30 + .25 * d, .12 + .1 * next()];
    return Object.freeze({x, y, r, dx: Math.cos(way), dy: Math.sin(way), travel: travel * (.8 + .4 * next()), life, rim});
  };
  // The inside first, so the scallops are drawn over it.
  const puffs = Object.freeze([...insideDiscs(cloud, next).map(disc => puff(disc, false)), ...cloud.lobes.map(l => puff([l.x, l.y, l.r], true))]);
  puffsByCloud.set(cloud, puffs);
  return puffs;
}
/** Discs that fill the cloud between its scallops: a hex grid, nudged (seeded), each centred more than half a disc inside the valleys' outline. */
function insideDiscs(cloud, next) {
  const r = .9 * cloud.lobes.reduce((n, l) => n + l.r, 0) / cloud.lobes.length, step = 1.4 * r, [x0, y0, x1, y1] = cloud.box, out = [];
  for (let row = 0, y = y0; y <= y1; row++, y += step * Math.sqrt(3) / 2) {
    for (let x = x0 + (row % 2 ? step / 2 : 0); x <= x1; x += step) {
      const p = [x + (next() - .5) * .3 * step, y + (next() - .5) * .3 * step];
      if (inside(p, cloud.valleys) && edgeDistance(p, cloud.valleys) > .5 * r) out.push([p[0], p[1], r * (.85 + .3 * next())]);
    }
  }
  return out;
}
/** Whether a point is inside a polygon (even-odd). */
function inside([x, y], poly) {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) yes = !yes;
  }
  return yes;
}
/** How far a point is from a polygon's nearest edge. */
function edgeDistance([x, y], poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i], dx = bx - ax, dy = by - ay, u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - ax - u * dx, y - ay - u * dy));
  }
  return best;
}

/**
 * Before the pop: the old shot, whole, and over it the cloud cut from it, swelling, the memory in it paling into the
 * cloud's paper. The new shot is not seen anywhere yet.
 */
function swelling(ctx, from, cloud, e, paper, ink) {
  const s = 1 + SWELL * (e / POP) ** 2, pale = smooth(PALE[0], PALE[1], e);
  from(ctx);
  ctx.save(); scaleAbout(ctx, cloud.centre, s); cloudPath(ctx, cloud); ctx.clip(); from(ctx);
  if (pale > 0) { ctx.fillStyle = rgba(paper, pale); ctx.fillRect(0, 0, W, H); }
  ctx.restore();
  // The outline, drawn in as the cloud swells (over a plain shot it appears; a thought shot's own is under it already).
  ctx.save(); scaleAbout(ctx, cloud.centre, s); ctx.lineWidth = CLOUD_LINE; ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(ink, smooth(0, POP, e)); cloudPath(ctx, cloud); ctx.stroke(); ctx.restore();
}
/** ctx clipped to everything round the cloud (swollen by s about its middle): the frame with the cloud cut out. */
function aroundCloud(c, cloud, s) {
  c.save(); scaleAbout(c, cloud.centre, s); cloudPath(c, cloud); c.restore();   // (the path outlives restore: only the transform is put back)
  c.rect(0, 0, W, H); c.clip('evenodd');
}

/**
 * After the pop: every puff where the pop has pushed it, shrinking away. The scallops' ink goes down first, a ring twice
 * the line wide round each, and the paper of every puff over it, so at the pop the rings show only round the outside:
 * the cloud's own outline. The ink fades fast as the scallops part, and the puffs go on as soft paper.
 */
function drawPuffs(c, cloud, e, paper, ink) {
  const age = (e - POP) * LENGTH, d = envelopeShare(age, 'pop'), [cx, cy] = cloud.centre, s = 1 + SWELL;
  const shown = puffsOf(cloud).map(p => ({x: cx + (p.x - cx) * s + p.dx * p.travel * d, y: cy + (p.y - cy) * s + p.dy * p.travel * d,
    r: p.r * s * (1 + .15 * d) * (1 - smooth(0, p.life, age)), rim: p.rim})).filter(p => p.r > .5);
  c.save();
  c.lineWidth = 2 * CLOUD_LINE; c.strokeStyle = rgba(ink, 1 - smooth(POP, POP + .2, e));
  for (const p of shown) if (p.rim) { c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.stroke(); }
  c.fillStyle = paper;
  for (const p of shown) { c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); }
  c.restore();
}

/**
 * Before the pop, swelling. After it: the new shot under everything; round the cloud the old one, fading as the burst
 * goes (AROUND); in the cloud's place the puffs, which uncover the new shot as they part.
 */
function cloudBurst(ctx, {e, from, to, p, ghost, theme}) {
  const t = paperTokens(theme), paper = p.color ?? t.paper, ink = p.ink ?? t.ink, cloud = thoughtCloud(p);
  if (e < POP) { swelling(ctx, from, cloud, e, paper, ink); return; }
  to(ctx);
  const old = (1 - Math.min(1, (e - POP) / AROUND)) ** 2, alpha = 1 - smooth(FADE[0], FADE[1], e);
  if (old > 0) ghost(old, c => { c.save(); aroundCloud(c, cloud, 1 + SWELL); from(c); c.restore(); });
  if (alpha > 0) ghost(alpha, c => drawPuffs(c, cloud, e, paper, ink));
}

export const CLOUD_BURST = {family: 'dissolve', seconds: LENGTH, ease: 'linear', sound: 'whoosh', hitAt: POP, params: THOUGHT_SETTINGS, draw: cloudBurst};
