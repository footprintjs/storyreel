/**
 * The stage at t, as numbers the kit draws from: each person's pose, each thing's place and look, each count badge.
 * A pure function of the plan and t — the same t gives the same numbers whichever frames came before.
 *
 *   people  [{who, kind, x, y, size, facing, walk, arm, look, fingers, holding, action, talk, t}]
 *             walk: walk.mjs's pose while walking (null standing); arm: {to: [x, y], amount, why} (amount 0 rest … 1 out,
 *             passing 1 a little as it arrives) or null; look: {to: [x, y], amount} or null (the kit's own look);
 *             fingers: fingersAt's {up, from, hands} plus `shown` (0..1, the hands coming up) or null; holding: prop ids
 *   items   [{key, prop, kind, k, x, y, sx, sy, scale, opacity, layer, holder, open, count}] (x, y: its bottom centre;
 *             holder: where it is, or where it is going — a container's or person's id, ground, gone, offstage)
 *   badges  [{x, y, n, pop, done, opacity}]
 */
import {MOVES, moveAt} from '../moves.mjs';
import {fingersAt} from '../fingers.mjs';
import {mouthAt} from '../acting.mjs';
import {STAGE, swing, smooth, heldAt, heldFrom, heldShows} from './timing.mjs';
import {holderKey} from './say.mjs';
import {principlesAt} from './travel.mjs';
import {own} from './own.mjs';
import {personX, walkPoseAt, facingAt, presentAt, headAt, itemPoint, itemShown, tripAt, stayAt, tripEnds} from './positions.mjs';

const lastAt = (list, t) => { let found = null; for (const e of list) { if (e.at <= t) found = e; else break; } return found; };
const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

/** The point a name stands for at t: a person's head, a thing's middle, a group's middle, a spot, a region's middle. */
export function targetPoint(plan, on, t) {
  const P = plan.people.get(on);
  if (P) return headAt(plan, P, t);
  const I = plan.items.get(on);
  if (I) { const p = itemPoint(plan, I, t) ?? (I.fade ? itemPoint(plan, I, I.fade.start) : null); return p ? [p[0], p[1] - I.size[1] / 2] : null; }
  const keys = plan.groups.get(on);
  if (keys) {
    const pts = keys.map(k => plan.items.get(k)).filter(J => itemShown(plan, J, t)).map(J => { const [x, y] = itemPoint(plan, J, t); return [x, y - J.size[1] / 2]; });
    if (pts.length) return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    return null;
  }
  const spot = own(plan.stage.place.adapter.spots, on), region = own(plan.stage.place.adapter.regions, on);
  if (spot) return [...spot];
  if (region) { const [x0, y0, x1, y1] = region; return [(x0 + x1) / 2, (y0 + y1) / 2]; }
  return null;
}

/** The window under way at t (an arm's or the hands'): the latest whose swing has begun, or -1. */
function currentOf(windows, t) { let i = -1; for (let j = 0; j < windows.length; j++) if (t >= heldFrom(windows[j])) i = j; return i; }

/** Where an arm window aims at t: its target, or a count's track, moving from thing to thing over STAGE.look. */
function aimOf(plan, w, t) {
  if (!w.track) return targetPoint(plan, w.on, t);
  let j = 0; for (let m = 0; m < w.track.length; m++) if (w.track[m].at <= t) j = m;
  const to = targetPoint(plan, w.track[j].on, t), since = t - w.track[j].at;
  if (j === 0 || since >= STAGE.look) return to;
  const from = targetPoint(plan, w.track[j - 1].on, t);
  return from && to ? lerp(from, to, smooth(since / STAGE.look)) : to;
}

/**
 * The arm at t: held out over its window (timing.mjs · heldAt — carrying on from where the window before left it), and
 * aimed at its target, turning from the last window's over STAGE.look, so neither its amount nor its aim jumps.
 */
function armOf(plan, P, t) {
  const i = currentOf(P.arms, t), w = P.arms[i];
  if (!w || !heldShows(w, t)) return null;
  let to = aimOf(plan, w, t);
  const prev = P.arms[i - 1], since = t - heldFrom(w);
  if (prev && since < STAGE.look) { const from = aimOf(plan, prev, t); if (from && to) to = lerp(from, to, smooth(since / STAGE.look)); }
  return to ? {to, amount: heldAt(w, t), why: w.why} : null;
}

function lookOf(plan, P, t) {
  const i = P.looks.findLastIndex(l => l.at <= t);
  if (i < 0) return null;
  const cur = P.looks[i], prev = P.looks[i - 1] ?? null, u = smooth((t - cur.at) / STAGE.look);
  const at = l => (l && l.on !== null ? targetPoint(plan, l.on, t) : null), a = at(prev), b = at(cur);
  if (b && a) return {to: lerp(a, b, u), amount: 1};
  if (b) return {to: b, amount: u};
  return a && u < 1 ? {to: a, amount: 1 - u} : null;
}

/** The hands counting on fingers at t: held up over their window, and blending from the last count's over STAGE.look. */
function fingersOf(P, t) {
  const i = currentOf(P.fingers, t), f = P.fingers[i];
  if (!f || !heldShows(f, t)) return null;
  const now = fingersAt(f.keys, t), prev = P.fingers[i - 1], since = t - heldFrom(f);
  let hands = now.hands;
  if (prev && since < STAGE.look) {
    const was = fingersAt(prev.keys, t).hands, u = smooth(since / STAGE.look), mix = side => was[side].map((e, k) => e + (now.hands[side][k] - e) * u);
    hands = {left: mix('left'), right: mix('right')};
  }
  return {...now, hands, shown: heldAt(f, t)};
}

/** A door's openness at t: 0 shut … 1 open, swinging past a little and settling (timing.mjs · swing). */
function doorAt(D, t) {
  let v = D.doors[0].open ? 1 : 0;
  for (const d of D.doors.slice(1)) { if (d.at - STAGE.door.anticipate > t) break; const to = d.open ? 1 : 0; v += (to - v) * swing(t - d.at, STAGE.door); }
  return v;
}

const layerOf = h => (h.type === 'in' ? `in:${h.id}` : h.type === 'with' ? `with:${h.id}` : 'ground');

function itemState(plan, I, t) {
  const point = itemPoint(plan, I, t);
  if (!point) return null;
  const trip = tripAt(I, t);
  let layer = layerOf(stayAt(I, t));
  if (trip) { const u = (t - trip.start) / (trip.end - trip.start); layer = u < .25 ? layerOf(trip.from) : u > .75 ? layerOf(trip.to) : 'flight'; }
  const near = I.trips.filter(tr => t > tr.start - .2 && t < tr.end + .6).map(tr => { const [from, to] = tripEnds(plan, I, tr, Math.min(t, tr.end)); return {...tr, from, to}; });
  const {dx, dy, sx, sy} = principlesAt(near, t);
  let opacity = 1, scale = 1, rise = 0;
  if (I.fade && t >= I.fade.start) { const u = smooth((t - I.fade.start) / STAGE.fade); opacity = 1 - u; scale = 1 - .3 * u; rise = -16 * u; }
  const pop = I.pops.findLast(p => p.at <= t);
  if (pop?.kind === 'in' && t < pop.at + MOVES.pop.seconds) { const v = moveAt('pop', t, {start: pop.at}); opacity *= v.opacity; scale *= v.scale; rise += v.y; }
  if (pop?.kind === 'out') { const v = moveAt('pop-out', t, {start: pop.at}); opacity *= v.opacity; scale *= v.scale; rise += v.y; }
  const holder = pop?.kind === 'out' ? 'offstage' : I.fade && t >= I.fade.start ? 'gone' : holderKey(trip ? trip.to : stayAt(I, t));
  const D = plan.doors.get(I.key), C = plan.containers.get(I.key);
  const count = C ? [...plan.items.values()].filter(J => !tripAt(J, t) && stayAt(J, t).type === 'in' && stayAt(J, t).id === I.key && itemShown(plan, J, t)).length : null;
  return {key: I.key, prop: I.prop, kind: I.kind, k: I.k, x: point[0] + dx, y: point[1] + dy + rise, sx, sy, scale, opacity, layer, holder, open: D ? doorAt(D, t) : null, count};
}

function badgeState(plan, b, t) {
  if (t < b.from || t >= b.until + STAGE.badge) return null;
  const I = plan.items.get(b.on);
  if (!itemShown(plan, I, t)) return null;
  const landed = b.lands.filter(at => at <= t), n = b.mode === 'each' ? b.n : landed.length, [x, y] = itemPoint(plan, I, t);
  return {x, y: y - I.size[1] - (b.mode === 'each' ? 26 : 56), n, pop: Math.min(1, (t - landed.at(-1)) / STAGE.badge), done: b.mode === 'each' || n === b.lands.length,
    opacity: t < b.until ? 1 : 1 - smooth((t - b.until) / STAGE.badge)};
}

/** Everything on the stage at t (see the module's comment). `clock` (the film's) opens mouths with the voice. */
export function stateAt(plan, t, {clock = null} = {}) {
  if (!Number.isFinite(t)) throw new Error(`the stage: t is seconds, not ${JSON.stringify(t)}`);
  const items = [...plan.items.values()].filter(I => itemShown(plan, I, t)).map(I => itemState(plan, I, t)).filter(Boolean);
  const people = [...plan.people.values()].filter(P => presentAt(P, t)).map(P => ({
    who: P.id, kind: P.kind, x: personX(P, t), y: plan.floor, size: P.size, facing: facingAt(P, t), walk: walkPoseAt(P, t),
    arm: armOf(plan, P, t), look: lookOf(plan, P, t), fingers: fingersOf(P, t),
    holding: [...new Set(items.filter(i => i.layer === `with:${P.id}`).map(i => i.prop))],
    action: P.doing.findLast(d => t >= d.start && t <= d.end)?.verb ?? null, talk: clock ? mouthAt(clock, t, P.id) : 0, t}));
  return {t, people, items, badges: plan.badges.map(b => badgeState(plan, b, t)).filter(Boolean)};
}
