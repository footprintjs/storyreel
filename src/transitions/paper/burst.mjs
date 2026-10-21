/**
 * Cloud burst: a thought cloud pops, and the next shot is there. The cloud is thought.mjs's: the one a "frame":
 * "thought" shot is drawn in or, over a plain shot, the same cloud cut from its picture. The same corner, size and seed
 * give the same cloud. It swells a little while everything outside it gives way to the new picture and the memory inside
 * fades into the cloud's paper. Then it pops: the cloud breaks into puffs (its own scallops, and the discs that filled
 * it), which fly out, grow and fade, leaving the new picture. The pop keeps principles.mjs's one-shot timing
 * (BURSTS.pop: a 60 ms rise, then a fall to a third every 180 ms). The puffs travel as far as the pop has pushed them,
 * fast at first, then drifting. Its sound lands on the pop (soundAt).
 */
import {W, H, smooth} from '../../frame.mjs';
import {rgba} from '../../colour.mjs';
import {BURSTS} from '../../principles.mjs';
import {thoughtCloud, cloudPath, THOUGHT_SETTINGS} from '../../thought.mjs';
import {paperTokens} from './tokens.mjs';
import {seeded} from './seeded.mjs';

const TAU = 2 * Math.PI;
/** Where in the change the cloud pops, and how much it has swelled by then; when the memory fades into the cloud's paper; when the puffs fade out. */
const POP = .3, SWELL = .05, PALE = Object.freeze([.14, .3]), FADE = Object.freeze([.6, .92]);
/** The change's clock at its default length, 1 s: the pop's timing runs on it, so a longer change stretches the pop with it. */
const SECONDS = 1;
/** The cloud's ink line (thought.mjs draws it 4.5 wide). */
const LINE = 4.5;

/** How far the pop has pushed the puffs `age` seconds after it, 0..1: its envelope's strength so far (principles.mjs · BURSTS.pop), a share of all of it. */
export function pushed(age) {
  if (!(age > 0)) return 0;
  const {attack, decay} = BURSTS.pop, all = attack / 2 + decay;
  if (age < attack) { const x = age / attack; return attack * (x ** 3 - x ** 4 / 2) / all; }
  return (attack / 2 + decay * (1 - Math.exp(-(age - attack) / decay))) / all;
}

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

/** ctx scaled by s about a point. */
const scaledAbout = (ctx, [x, y], s) => { ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-x, -y); };

/** Before the pop: the cloud swells; outside it the old picture gives way to the new; inside, the memory fades into the cloud's paper. */
function swelling(ctx, {from, ghost}, cloud, e, paper, ink) {
  const outside = smooth(0, POP, e), s = 1 + SWELL * (e / POP) ** 2, pale = smooth(PALE[0], PALE[1], e);
  if (outside < 1) ghost(1 - outside, from);
  ctx.save(); scaledAbout(ctx, cloud.centre, s); cloudPath(ctx, cloud); ctx.clip(); from(ctx);
  if (pale > 0) { ctx.fillStyle = rgba(paper, pale); ctx.fillRect(0, 0, W, H); }
  ctx.restore();
  // The outline, drawn in as the outside goes (a thought shot's own outline is under it already).
  ctx.save(); scaledAbout(ctx, cloud.centre, s); ctx.lineWidth = LINE; ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(ink, outside); cloudPath(ctx, cloud); ctx.stroke(); ctx.restore();
}

/**
 * After the pop: every puff where the pop has pushed it, shrinking away. The scallops' ink goes down first, a ring twice
 * the line wide round each, and the paper of every puff over it, so at the pop the rings show only round the outside:
 * the cloud's own outline. The ink fades fast as the scallops part, and the puffs go on as soft paper.
 */
function drawPuffs(c, cloud, e, paper, ink) {
  const age = (e - POP) * SECONDS, d = pushed(age), [cx, cy] = cloud.centre, s = 1 + SWELL;
  const shown = puffsOf(cloud).map(p => ({x: cx + (p.x - cx) * s + p.dx * p.travel * d, y: cy + (p.y - cy) * s + p.dy * p.travel * d,
    r: p.r * s * (1 + .15 * d) * (1 - smooth(0, p.life, age)), rim: p.rim})).filter(p => p.r > .5);
  c.lineWidth = 2 * LINE; c.strokeStyle = rgba(ink, 1 - smooth(POP, POP + .2, e));
  for (const p of shown) if (p.rim) { c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.stroke(); }
  c.fillStyle = paper;
  for (const p of shown) { c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); }
}

function cloudBurst(ctx, {e, from, to, p, ghost, theme}) {
  const t = paperTokens(theme), paper = p.color ?? t.paper, ink = p.ink ?? t.ink, cloud = thoughtCloud(p);
  to(ctx);
  if (e < POP) { swelling(ctx, {from, ghost}, cloud, e, paper, ink); return; }
  const alpha = 1 - smooth(FADE[0], FADE[1], e);
  if (alpha > 0) ghost(alpha, c => drawPuffs(c, cloud, e, paper, ink));
}

export const CLOUD_BURST = {family: 'dissolve', seconds: 1, ease: 'linear', sound: 'whoosh', soundAt: POP, params: THOUGHT_SETTINGS, draw: cloudBurst};
