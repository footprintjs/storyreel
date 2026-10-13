/**
 * The film's camerawork: the recipe's `camera` moves (camera.mjs · CAMERA_MOVES) placed on the film's clock, held
 * to the rule that a film has ONE camera, played as moves or — for a viewer who asks for reduced motion — as cuts,
 * and aimed. The plan is made by a footprintjs flowchart, so the film's record says how each move was read and why
 * it was played the way it was (a decide() with its evidence):
 *
 *   read moves → one picture → one camera → motion? (decide: reduced motion) → cuts | moves → aim
 *
 * HOW IT COMPOSES (film.mjs · frame). The picture is drawn on the picture's clock (a freeze or a speed ramp:
 * clockAt), a director's push moves it, the focus frames it (attention.mjs), then the camera's view is the outermost
 * lens, with handheld's drift over that. The view, the pushes and the focus run on the voice's clock; depth moves
 * act inside a world, on the picture's clock (a freeze stops them too).
 *
 * ONE CAMERA. A camera move (view, follow or depth) cannot run while something else moves the camera: a moving
 * focus (a camera-strategy focus, from each key until its spring settles: motion.mjs · settleTime), a director's
 * push (while it eases in or out) or a world's spotlight (its kit's own camera, as a push never runs over one). They take turns, and they compose: the camera frames a held push or focus, and a
 * focus that moves later frames inside the camera's held view. Two moves may run at once when they move different
 * things (a pan and a dutch), never the same one. Handheld is a texture, not a move: it runs under anything.
 *
 * ONE PICTURE. A move (but handheld) stays on one picture: one that runs across a change of picture (a hand-over, an
 * entrance, a cut, the push-in, the teaser) refuses, as a push does. Its framing holds until the picture changes, and
 * over the change it eases back to the whole frame (at a cut, at once), so every new picture opens wide. A world's
 * depth state holds until the world leaves; a rack focus opens its world focused on the layer it racks from.
 *
 * REDUCED MOTION (compileFilm({reducedMotion: true})). Each move cuts to its end framing on its first moment (a truck
 * or a track, whose end is wherever its thing is, at its last), the return over a change cuts at the change's start,
 * a speed ramp plays in step with the voice, handheld is off, and a freeze is kept (a still is not motion).
 */
import {flowChart, decide, narrative} from 'footprintjs';
import {readCameraMove, CAMERA_MOVE_NAMES, REST, MAX_ZOOM, coverZoom, covered, viewOf, aimAt, handheldAt, layersAt} from './camera.mjs';
import {inOut} from './ease.mjs';
import {then} from './regions.mjs';

const VIEW_AXES = ['x', 'y', 'z', 'r'];
const DEPTH_REST = Object.freeze({orbit: 0, zoom: 0, focus: null, blur: 0});
/** The families that move the camera, and so take turns with the focus and the pushes. */
const MOVING = new Set(['view', 'follow', 'depth']);
const AXIS_WORDS = {x: 'left–right', y: 'up–down', z: 'zoom', r: 'roll', orbit: 'orbit', zoom: 'dolly zoom', focus: 'focus', blur: 'focus', shake: 'handheld', clock: 'clock'};
/** How often a move is sampled when it is aimed: what it follows, and whether it keeps the frame covered. */
const SAMPLE = 1 / 30;
/** The flowchart's logger: a refusal is rethrown to the caller, so footprintjs does not print it a second time. */
const QUIET = Object.freeze({info() {}, log() {}, debug() {}, error() {}, warn: (...args) => console.warn(...args)});
const r3 = n => +n.toFixed(3);

/**
 * The camera plan for a recipe's `camera` list. `env` is what the film knows: clock (at: beat → seconds), total,
 * changes ([{from, to, what}]: every change of picture), onFrame(name, t, tp) (the box of a named thing on the frame
 * before the camera: through the push and the focus at t, as drawn at the picture's time tp), worldAt(t) ({world,
 * path} on screen at t, or null on paper), focus (attention.mjs · readFocus, or null), pushes (notes.mjs ·
 * placePushes), spotlight(t) (whose spotlight shows at t, or null), reducedMotion, and ground(ctx) (what lies under
 * a moved view: the paper).
 * Returns {viewAt(t), viewOn(t), clockAt(t), depthAt(world, t), show(ctx, t, paint), record}.
 */
export async function planCamera(spec, env) {
  if (!Array.isArray(spec) || !spec.length) throw new Error(`camera is a list of moves, [{move, at, until?, …}] (the moves are ${CAMERA_MOVE_NAMES.join(', ')})`);
  const work = {moves: [], decision: null, cuts: false, plan: null};
  const chart = flowChart('read moves', s => readMoves(s, spec, env, work), 'read-moves', 'Each move checked against the catalog and put on the clock')
    .addFunction('one picture', s => onePicture(s, env, work), 'one-picture', 'Each move stays on one picture, and a depth move on a world with layers')
    .addFunction('one camera', s => oneCamera(s, env, work), 'one-camera', 'Nothing else moves the camera while a move does')
    .addDeciderFunction('motion', s => { const d = decide(s, [{when: {reducedMotion: {eq: true}}, then: 'cuts', label: 'The viewer asked for reduced motion: each move cuts to its end framing'}], {branch: 'moves', label: 'Each move eases as written'}); work.decision = d.evidence; return d; }, 'motion', 'Moves, or cuts for reduced motion')
    .addFunctionBranch('cuts', 'cuts', s => played(s, work, true), 'Each move a cut to its end framing; handheld off; a speed ramp in step; a freeze kept')
    .addFunctionBranch('moves', 'moves', s => played(s, work, false), 'Each move as written')
    .setDefault('moves')
    .end()
    .addFunction('aim', s => aim(s, env, work), 'aim', 'Where each move takes the camera, kept covering the frame')
    .setLogger(QUIET).build();
  const trace = narrative();
  await chart.recorder(trace).run();
  return {...work.plan, record: recordOf(work, trace)};
}

/** Stage: every entry read against the catalog (camera.mjs · readCameraMove), in the order the moves start. */
function readMoves(s, spec, {clock, total, reducedMotion = false}, work) {
  if (typeof reducedMotion !== 'boolean') throw new Error(`reducedMotion is true (each camera move cuts to its end framing; handheld off) or false, not ${JSON.stringify(reducedMotion)}`);
  work.moves = spec.map((m, i) => readCameraMove(m, `camera[${i}]`, {at: clock.at, total}));
  work.moves.forEach((m, i) => { const prev = work.moves[i - 1]; if (prev && m.at < prev.at) throw new Error(`${m.path} starts at ${m.at.toFixed(2)} s, before ${prev.path} (${prev.at.toFixed(2)} s); list the moves in the order they start`); });
  s.moves = work.moves.map(summary);
  s.reducedMotion = reducedMotion;
}

/** Stage: no move (but handheld) runs across a change of picture; a depth move finds its world and the world's layers. */
function onePicture(s, {changes, worldAt}, work) {
  for (const m of work.moves) {
    // What it draws lasts until: a framing or a world's depth until the next picture has arrived; a clock or a drift, its own span.
    const next = changes.filter(x => x.from >= m.until).sort((a, b) => a.from - b.from)[0];
    m.lasts = m.family === 'time' || m.family === 'texture' ? m.until : next ? next.to : Infinity;
    if (m.family === 'texture') continue;
    const c = changes.find(x => m.at < x.to && m.until > x.from);
    if (c) throw new Error(`${m.path} (${m.move}) runs from ${m.at.toFixed(2)} s to ${m.until.toFixed(2)} s, across ${c.what} (${c.from.toFixed(2)} s); a camera move stays on one picture: end it before the change, or start it after`);
    if (m.family === 'depth') ({world: m.world, path: m.worldPath, layers: m.layers} = worldOf(m, worldAt));
  }
  s.pictures = work.moves.map(m => ({path: m.path, ...(Number.isFinite(m.lasts) ? {lasts: r3(m.lasts)} : {lasts: 'the end'}), ...(m.worldPath ? {world: m.worldPath} : {})}));
}

/** The world a depth move acts on, and its layers (back to front), checked; a picture with no world, or a world with no layers, refuses. */
function worldOf(m, worldAt) {
  const on = worldAt(m.at), where = `${m.path} (${m.move})`;
  if (!on) throw new Error(`${where} at ${m.at.toFixed(2)} s: the picture then is paper, which has no depth layers; a ${m.move} moves a world's layers by their depth (start it while a world is on screen)`);
  const {instance, kit} = on.world, layers = instance.layers;
  if (!Array.isArray(layers) || !layers.length || typeof instance.drawLayer !== 'function') throw new Error(`${where}: the world at ${on.path} is drawn by the kit "${kit}", which gives no depth layers; a ${m.move} moves a world's layers by their depth: the kit's world returns layers: [{name, depth}] (back to front; depth 1 is the subject's plane, 2 twice as far, 0.5 half way to the camera) and drawLayer(ctx, t, name, spot), which draws one layer`);
  const seen = new Set();
  layers.forEach((l, i) => {
    if (!l || typeof l.name !== 'string' || !l.name.trim() || seen.has(l.name)) throw new Error(`${where}: the kit "${kit}"'s layers[${i}] needs a name of its own (a layer is {name, depth})`);
    if (!(Number.isFinite(l.depth) && l.depth > 0)) throw new Error(`${where}: the kit "${kit}"'s layer "${l.name}" has depth ${JSON.stringify(l.depth)}; a depth is a number above 0 (1: the subject's plane, 2 twice as far)`);
    if (i && l.depth > layers[i - 1].depth) throw new Error(`${where}: the kit "${kit}"'s layers go back to front, the farthest first; "${l.name}" (depth ${l.depth}) is farther than "${layers[i - 1].name}" (depth ${layers[i - 1].depth}), above it`);
    seen.add(l.name);
  });
  return {world: on.world, path: on.path, layers: layers.map(l => Object.freeze({name: l.name, depth: l.depth}))};
}

/** Stage: one move at a time on each thing it moves, and none while the focus, a push or a world's spotlight moves the camera. */
function oneCamera(s, {focus = null, pushes = [], spotlight = () => null}, work) {
  const lanes = new Map();
  for (const m of work.moves) for (const axis of m.def.axes(m.p)) {
    const key = m.family === 'depth' ? `${m.worldPath}:${axis}` : axis, before = lanes.get(key);
    if (before && m.at < before.until) throw new Error(`${m.path} (${m.move}) starts at ${m.at.toFixed(2)} s while ${before.path} (${before.move}) still moves the camera's ${AXIS_WORDS[axis]} (until ${before.until.toFixed(2)} s); one move at a time on each: start it after, or move something else`);
    lanes.set(key, m);
  }
  const others = [...(focus?.moving ?? []).map(w => ({...w, what: `the focus (focus.keys[${w.key}], on "${w.on}") is moving the camera`, fix: 'start the move after it settles, or show the focus with "spotlight" or "dim"'})),
    ...pushes.flatMap(p => [[p.a, p.a + p.seconds], [p.b, p.b + p.seconds]].map(([from, to]) => ({from, to, what: `the push "${p.note}" is moving the camera`, fix: 'start the move after it has eased, or move the push'})))];
  for (const m of work.moves) {
    if (!MOVING.has(m.family)) continue;
    const o = others.find(x => m.at < x.to && m.until > x.from);
    if (o) throw new Error(`${m.path} (${m.move}, ${m.at.toFixed(2)}–${m.until.toFixed(2)} s) would move the camera while ${o.what} (${o.from.toFixed(2)}–${o.to.toFixed(2)} s); a film has one camera: ${o.fix}`);
    // A world's spotlight is its kit's own camera (StoryWorld · spotAt): a move never runs over one, as a push never does.
    for (let t = m.at; t < m.until; t += .05) { const lit = spotlight(t); if (lit) throw new Error(`${m.path} (${m.move}) runs over ${lit}'s spotlight at ${t.toFixed(2)} s; a film has one camera: move before or after the spotlight`); }
  }
  s.checked = {moves: work.moves.length, focus: (focus?.moving ?? []).length, pushes: pushes.length};
}

/** Branch: how each move is played — as written, or (reduced motion) as a cut, with handheld and a speed ramp off and a freeze kept. */
function played(s, work, cuts) {
  work.cuts = cuts;
  for (const m of work.moves) m.played = !cuts ? 'move' : m.move === 'freeze' ? 'kept' : m.family === 'texture' || m.move === 'speed-ramp' ? 'off' : 'cut';
  s.played = work.moves.map(m => `${m.path} ${m.move}: ${m.played}`);
}

/** Stage: the moves aimed (where each takes the camera), kept covering the frame, and the plan's functions. */
function aim(s, env, work) {
  const moves = work.moves.filter(m => m.played !== 'off'), cuts = work.cuts;
  const clockAt = clockOf(moves);
  const view = viewLanes(moves, {...env, clockAt, cuts}), depth = depthLanes(moves, cuts), shakeAt = shakeOf(moves);
  checkCover(moves, view.stateAt, cuts);
  const viewAt = t => { const v = view.stateAt(t); return VIEW_AXES.every(a => v[a] === REST[a]) ? null : covered(v); };
  /** The camera's whole view on the frame at t (handheld's drift over its framing), for regions and clicks; null at rest. */
  const viewOn = t => { const v = viewAt(t), k = shakeAt(t); return !v && !k ? null : !k ? viewOf(v) : !v ? viewOf(k) : then(viewOf(k), viewOf(v)); };
  const show = (ctx, t, paint) => {
    const v = viewAt(t), k = shakeAt(t);
    if (!v && !k) { paint(ctx); return; }
    ctx.save(); env.ground?.(ctx);   // the paper under the moved picture: an anti-aliased edge blends with it, never with the frame before
    if (k) aimAt(ctx, k);
    if (v) aimAt(ctx, v);
    paint(ctx); ctx.restore();
  };
  work.plan = {viewAt, viewOn, clockAt, depthAt: depth, show};
  s.aimed = moves.map(m => ({path: m.path, ...(m.covers ? {covers: m.covers} : {})}));
}

/** The picture's clock: in a freeze it holds; in a speed ramp it runs slow, then catches up; elsewhere it is the voice's. */
function clockOf(moves) {
  const spans = moves.filter(m => m.family === 'time').map(m => ({from: m.at, to: m.until, remap: u => m.def.remap(u, m.p)}));
  return t => { const w = spans.find(x => t >= x.from && t < x.to); return w ? w.from + (w.to - w.from) * w.remap((t - w.from) / (w.to - w.from)) : t; };
}

/** One change of an axis: from v0 to v1 (a number, or a function of t for a follow) between a and b, eased; a cut when a = b. */
const segment = (a, b, v0, v1, ease) => {
  const end = typeof v1 === 'function' ? v1 : () => v1;
  return {from: a, at: t => (t >= b ? end(b) : v0 + (end(t) - v0) * ease((t - a) / (b - a)))};
};
/** An axis at t: its rest, then each change that has started (they never overlap on one axis). */
const laneAt = (lane, t, rest) => { let v = rest; for (const x of lane) { if (t < x.from) break; v = x.at(t); } return v; };
/** When a move plays: its span, or (reduced motion) a cut on its first moment — a follow's on its last, where its thing then is. */
const spanOf = (m, cuts) => (!cuts ? [m.at, m.until] : m.family === 'follow' ? [m.until, m.until] : [m.at, m.at]);

/** The view's four axes (x, y, z, r) as lanes of changes: each view and follow move from the state before it, and back to rest over each change of picture. */
function viewLanes(moves, {changes, onFrame, clockAt, cuts}) {
  const lanes = {x: [], y: [], z: [], r: []}, state = {...REST};
  const events = [...moves.filter(m => m.family === 'view' || m.family === 'follow').map(m => ({t: m.at, m})), ...changes.map(c => ({t: c.from, c}))]
    .sort((a, b) => a.t - b.t || (a.c ? -1 : 0) - (b.c ? -1 : 0));
  for (const {m, c} of events) {
    if (c) {
      for (const axis of VIEW_AXES) if (state[axis] !== REST[axis]) { lanes[axis].push(segment(c.from, cuts ? c.from : c.to, state[axis], REST[axis], inOut)); state[axis] = REST[axis]; }
      continue;
    }
    const [a, b] = spanOf(m, cuts), axes = m.def.axes(m.p);
    if (m.family === 'view') {
      const end = m.def.aim(state, m.p, m.p.on ? boxOf(m, onFrame, m.at, clockAt) : null);
      for (const axis of axes) { lanes[axis].push(segment(a, b, state[axis], end[axis], m.ease)); state[axis] = end[axis]; }
    } else {
      const path = followed(m, onFrame, clockAt);
      for (const axis of axes) { lanes[axis].push(segment(a, b, state[axis], t => path(t)[axis], m.ease)); state[axis] = path(m.until)[axis]; }
    }
  }
  return {stateAt: t => Object.fromEntries(VIEW_AXES.map(axis => [axis, laneAt(lanes[axis], t, REST[axis])]))};
}

/** The box of the thing a move names, on the frame before the camera, at t; a name not there refuses, naming the move. */
function boxOf(m, onFrame, t, clockAt) {
  try { return onFrame(m.p.on, t, clockAt(t)); } catch (e) { throw new Error(`${m.path} (${m.move} on "${m.p.on}"): ${e.message}`, {cause: e}); }
}

/** A follow's path: where its thing is, sampled 30 times a second over the move, in between by a straight line. */
function followed(m, onFrame, clockAt) {
  const n = Math.max(1, Math.ceil((m.until - m.at) / SAMPLE)), span = m.until - m.at;
  const points = Array.from({length: n + 1}, (_, i) => m.def.follow(boxOf(m, onFrame, m.at + span * i / n, clockAt)));
  return t => {
    const u = Math.max(0, Math.min(n, (t - m.at) / span * n)), i = Math.min(n - 1, Math.floor(u)), f = u - i, a = points[i], b = points[i + 1];
    return Object.fromEntries(Object.keys(a).map(k => [k, a[k] + (b[k] - a[k]) * f]));
  };
}

/** Each view and follow move, sampled where it plays: never past MAX_ZOOM; where it had to scale up to keep the frame covered, the record says how far. */
function checkCover(moves, stateAt, cuts) {
  for (const m of moves) {
    if (m.family !== 'view' && m.family !== 'follow') continue;
    const [a, b] = spanOf(m, cuts), n = Math.max(1, Math.ceil((b - a) / SAMPLE));
    let most = 0;
    for (let i = 0; i <= n; i++) {
      const t = a + (b - a) * i / n, v = stateAt(t), need = coverZoom(v), z = Math.max(v.z, need);
      if (!(z <= MAX_ZOOM)) throw new Error(`${m.path} (${m.move}) would need the picture at ${Number.isFinite(z) ? `×${z.toFixed(2)}` : 'more than any zoom'} at ${t.toFixed(2)} s to keep the frame covered (a camera goes to ×${MAX_ZOOM}): move it less far, or dolly in before it so the picture has room`);
      if (need > v.z + 1e-6) most = Math.max(most, z);
    }
    if (most) m.covers = r3(most);
  }
}

/** Each world's depth axes (orbit, zoom, focus, blur) as lanes of changes; depthAt(world, t) → its layers moved, or null at rest. */
function depthLanes(moves, cuts) {
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
function shakeOf(moves) {
  const spans = moves.filter(m => m.move === 'handheld').map(m => ({from: m.at, to: m.until, p: m.p, fade: Math.min(.6, (m.until - m.at) / 2)}));
  return t => {
    const k = spans.find(x => t >= x.from && t <= x.to), w = k ? inOut(Math.min(1, (t - k.from) / k.fade, (k.to - t) / k.fade)) : 0;
    return w > 0 ? handheldAt(t, k.p, w) : null;
  };
}

/** A move as the record keeps it: where it is in the recipe, what it is, when (at, until: seconds), its settings and its ease. */
const summary = m => ({path: m.path, move: m.move, family: m.family, at: r3(m.at), until: r3(m.until), ...m.p, ...(m.eased ?? {})});

/** The record: how the moves were played (and why: the decision's evidence), each move as placed, and the flowchart's narrative. */
function recordOf(work, trace) {
  return {motion: work.cuts ? 'cuts' : 'moves', decision: work.decision,
    moves: work.moves.map(m => ({...summary(m), played: m.played, lasts: Number.isFinite(m.lasts) ? r3(m.lasts) : null, ...(m.worldPath ? {world: m.worldPath} : {}), ...(m.covers ? {covers: m.covers} : {})})),
    narrative: trace.getEntries().map(({rawValue, ...entry}) => entry)};
}
