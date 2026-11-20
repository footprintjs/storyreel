/**
 * The lanes a camera plan is made of: each axis of the view (x, y, z, r) and of a world's depth (orbit, zoom, focus,
 * blur) as a list of eased changes, the picture's clock (a freeze, a speed ramp), handheld's drift, and where a move on
 * a named thing aims or follows. Its own module because these are the plan's arithmetic: the stages build them, the
 * checks sample them, and the film reads them at every frame.
 */
import {REST, covered, handheldAt, layersAt} from '../camera.mjs';
import {inOut} from '../ease.mjs';
import {through} from '../regions.mjs';

export const VIEW_AXES = ['x', 'y', 'z', 'r'];
const DEPTH_REST = Object.freeze({orbit: 0, zoom: 0, focus: null, blur: 0});
/** How often a move is sampled when it is aimed: what it follows, and whether it keeps the frame covered. */
export const SAMPLE = 1 / 30;
export const r3 = n => +n.toFixed(3);
/** The part of a version's picture clock a move reads: the time moves over its span, by path (alike in both versions: shared). */
const clockKey = (moves, m) => moves.filter(x => x.family === 'time' && x.at < m.until && x.until > m.at).map(x => x.path).join(',');

/** The picture's clock: in a freeze it holds; in a speed ramp it runs slow, then catches up; elsewhere it is the voice's. */
export function clockOf(moves) {
  const spans = moves.filter(m => m.family === 'time').map(m => ({from: m.at, to: m.until, remap: u => m.def.remap(u, m.p)}));
  return t => { const w = spans.find(x => t >= x.from && t < x.to); return w ? w.from + (w.to - w.from) * w.remap((t - w.from) / (w.to - w.from)) : t; };
}

/**
 * One change of an axis: from v0 to v1 between a and b, eased; a cut when a = b. v1 is a number, or a function of t:
 * a follow's (held where it was at b once it arrives) or an anchor's (`live`: it keeps following after b, so a dolly
 * on a thing stays on it while a push or the focus under the camera moves the picture).
 */
const segment = (a, b, v0, v1, ease, {live = false} = {}) => {
  const end = typeof v1 === 'function' ? v1 : () => v1;
  return {from: a, at: t => (t >= b ? end(live ? t : b) : v0 + (end(t) - v0) * ease((t - a) / (b - a)))};
};
/** An axis at t: its rest, then each change that has started (they never overlap on one axis). */
const laneAt = (lane, t, rest) => { let v = rest; for (const x of lane) { if (t < x.from) break; v = x.at(t); } return v; };
/** When a move plays: its span, or (reduced motion) a cut on its first moment — a follow's on its last, where its thing then is. */
export const spanOf = (m, cuts) => (!cuts ? [m.at, m.until] : m.family === 'follow' ? [m.until, m.until] : [m.at, m.at]);

/**
 * The view's four axes (x, y, z, r) as lanes of changes: each view and follow move from the framing the viewer sees
 * as it starts (the zoom that covers the frame included, so a dolly after a pan or a dutch angle is a change of what
 * is on screen), and back to rest over each change of picture.
 */
export function viewLanes(moves, {changes, named, under, clockAt, cuts, total, paths = new Map()}) {
  const lanes = {x: [], y: [], z: [], r: []}, stateAt = t => Object.fromEntries(VIEW_AXES.map(axis => [axis, laneAt(lanes[axis], t, REST[axis])]));
  // Where every move started so far is going (each axis's last change, at its end): a move aims from there — not from
  // the middle of a move still running beside it, and not, under reduced motion, from before a follow that cuts later.
  const settled = {...REST}, timeline = [];   // timeline: where the camera is headed after each event, in order
  const events = [...moves.filter(m => m.family === 'view' || m.family === 'follow').map(m => ({t: m.at, m})), ...changes.map(c => ({t: c.from, c}))]
    .sort((a, b) => a.t - b.t || (a.c ? -1 : 0) - (b.c ? -1 : 0));
  for (const {m, c} of events) {
    if (c) {
      const held = stateAt(c.from);
      for (const axis of VIEW_AXES) if (held[axis] !== REST[axis]) lanes[axis].push(segment(c.from, cuts ? c.from : c.to, held[axis], REST[axis], inOut));
      Object.assign(settled, REST);
      timeline.push({t: c.from, settled: {...settled}});
      continue;
    }
    // It aims from where the camera is going, with the zoom that covers it; it starts from what is on screen (no jump).
    const [a, b] = spanOf(m, cuts), axes = m.def.axes(m.p), base = covered(settled), now = stateAt(m.at), start = {...now, z: covered(now).z};
    if (m.family === 'view') {
      const anchor = m.p.on ? anchorOf(m, {named, under, clockAt}) : null, end = m.def.aim(base, m.p, anchor ? anchor(m.at) : null);
      // A dolly on a thing re-aims as the picture moves under it, with its own roll: it keeps the thing on its framing,
      // and a later dutch scales the picture up to cover, as a dutch does anywhere (checkCover samples the hold for ×4).
      const reaim = axis => t => m.def.aim(base, m.p, anchor(t))[axis];
      for (const axis of axes) {
        const follows = anchor && (axis === 'x' || axis === 'y'), target = follows ? reaim(axis) : end[axis];
        lanes[axis].push(segment(a, b, start[axis], target, m.ease, {live: follows}));
        settled[axis] = follows ? target(m.until) : end[axis];
      }
      // How long it re-aims: until its picture changes (the same in both versions: no change falls inside a move).
      if (anchor) m.holdEnd = Math.min(total, changes.filter(x => x.from >= m.until).reduce((t, x) => Math.min(t, x.from), Infinity));
    } else {
      const key = `${m.path}|${clockKey(moves, m)}`;   // a follow both versions read on the same clock is sampled once
      if (!paths.has(key)) paths.set(key, followed(m, {named, under, clockAt}));
      const {path, points} = paths.get(key);
      m.trail = points;
      for (const axis of axes) { lanes[axis].push(segment(a, b, start[axis], t => path(t)[axis], m.ease)); settled[axis] = path(m.until)[axis]; }
    }
    timeline.push({t: m.at, m, settled: {...settled}});
  }
  return {stateAt, timeline};
}

/** The box of the thing a move names, as drawn at t (on the picture's clock), before the push, the focus and the camera; a name not there refuses, naming the move. */
function rawBoxOf(m, named, t, clockAt) {
  try { return named(m.p.on, clockAt(t)); } catch (e) { throw new Error(`${m.path} (${m.move} on "${m.p.on}"): ${e.message}`, {cause: e}); }
}
/** A box on the frame before the camera at t: through the push and the focus under it then (under(t): a view, or null). */
const onFrame = (box, under, t) => { const v = under(t); return v ? through(v, box) : box; };

/**
 * Where a dolly on a thing aims at t: the thing's place in the picture as the move starts, through whatever push or
 * focus is under the camera at t — so the camera stays on the thing when they move the picture under it. (A thing
 * that walks away is followed by a truck or a track, not a dolly.)
 */
function anchorOf(m, {named, under, clockAt}) {
  const box = rawBoxOf(m, named, m.at, clockAt);
  return t => onFrame(box, under, t);
}

/** A follow's path: where its thing is on the frame, sampled 30 times a second over the move, in between by a straight line. */
function followed(m, {named, under, clockAt}) {
  const n = Math.max(1, Math.ceil((m.until - m.at) / SAMPLE)), span = m.until - m.at;
  const points = Array.from({length: n + 1}, (_, i) => { const t = m.at + span * i / n; return m.def.follow(onFrame(rawBoxOf(m, named, t, clockAt), under, t)); });
  const path = t => {
    const u = Math.max(0, Math.min(n, (t - m.at) / span * n)), i = Math.min(n - 1, Math.floor(u)), f = u - i, a = points[i], b = points[i + 1];
    return Object.fromEntries(Object.keys(a).map(k => [k, a[k] + (b[k] - a[k]) * f]));
  };
  return {path, points};
}

/** Each world's depth axes (orbit, zoom, focus, blur) as lanes of changes; depthAt(world, t) → its layers moved, or null at rest. */
export function depthLanes(moves, cuts) {
  const worlds = new Map();
  for (const m of moves.filter(x => x.family === 'depth')) {
    if (!worlds.has(m.world)) worlds.set(m.world, {layers: m.layers, state: {...DEPTH_REST}, lanes: {orbit: [], zoom: [], focus: [], blur: []}, lastOn: null});
    const w = worlds.get(m.world), p = m.move === 'rack-focus' ? rackSettings(m, w) : m.p, end = m.def.depth(p, w.layers, w.state), [a, b] = spanOf(m, cuts);
    if (m.move === 'dolly-zoom' && !(end.zoom >= 0 && end.zoom <= 1.5)) throw new Error(`${m.path} (dolly-zoom) takes the world's dolly zoom to ${end.zoom.toFixed(2)}; it goes from 0 (none) to 1.5: ${end.zoom < 0 ? 'the background would shrink below the frame — give back no more than was given' : 'give less'}`);
    if (m.move === 'rack-focus' && w.state.focus === null) { openFocus(w, m, p, end, [a, b]); continue; }
    for (const axis of m.def.axes(p)) { w.lanes[axis].push(segment(a, b, w.state[axis], end[axis], m.ease)); w.state[axis] = end[axis]; }
  }
  return (world, t) => {
    const w = worlds.get(world);
    if (!w) return null;
    const now = Object.fromEntries(Object.keys(DEPTH_REST).map(axis => [axis, laneAt(w.lanes[axis], t, DEPTH_REST[axis])]));
    return now.orbit === 0 && now.zoom === 0 && now.focus === null ? null : layersAt(w.layers, now);
  };
}

/**
 * A world's first rack focus: everything is sharp before it, so over its first third the depth of field narrows on
 * `from` (the other layers go soft), then the focus pulls to `on` — no blur before the move, and no jump into it.
 */
function openFocus(w, m, p, end, [a, b]) {
  const from = 1 / layerOf(m, w, p.from).depth, narrowed = a + (b - a) / 3;
  w.lanes.blur.push(segment(a, narrowed, 0, end.blur, m.ease));
  w.lanes.focus.push(segment(a, narrowed, from, from, m.ease), segment(narrowed, b, from, end.focus, m.ease));
  w.state.focus = end.focus; w.state.blur = end.blur;
}

/** A layer of the move's world by name, or a refusal naming the layers there are. */
function layerOf(m, w, name) {
  const l = w.layers.find(x => x.name === name);
  if (!l) throw new Error(`${m.path} (${m.move}): the world at ${m.worldPath} has no layer "${name}"; its layers are ${w.layers.map(x => x.name).join(', ')}`);
  return l;
}

/** A rack focus's settings with `from` filled in: the layer the last rack focus in its world ended on; the first must say. */
function rackSettings(m, w) {
  const from = m.p.from ?? w.lastOn;
  if (from === null) throw new Error(`${m.path} (rack-focus) needs from: the layer in focus as its world opens (its layers are ${w.layers.map(x => x.name).join(', ')}); a later rack focus starts where the one before it ended`);
  if (w.lastOn !== null && from !== w.lastOn) throw new Error(`${m.path} (rack-focus) racks from "${from}", but the focus is on "${w.lastOn}" then (the rack focus before it ended there); a focus cannot jump: leave from out, or rack from "${w.lastOn}"`);
  const a = layerOf(m, w, from), b = layerOf(m, w, m.p.on);
  if (a.depth === b.depth) throw new Error(`${m.path} (rack-focus): "${from}" and "${m.p.on}" are both at depth ${a.depth}, so there is nothing to rack between; rack to a layer nearer or farther`);
  w.lastOn = m.p.on;
  return {...m.p, from};
}

/** Handheld at t: its drift, faded in and out over its first and last 0.6 s (less in a short one); null outside it. */
export function shakeOf(moves) {
  const spans = moves.filter(m => m.move === 'handheld').map(m => ({from: m.at, to: m.until, p: m.p, fade: Math.min(.6, (m.until - m.at) / 2)}));
  return t => {
    const k = spans.find(x => t >= x.from && t <= x.to), w = k ? inOut(Math.min(1, (t - k.from) / k.fade, (k.to - t) / k.fade)) : 0;
    return w > 0 ? handheldAt(t, k.p, w) : null;
  };
}

