/**
 * The camerawork chart's stages (camerawork.mjs wires them): every move read against the catalog, kept on one picture
 * and to one camera, played as moves or as cuts (the decision, with its evidence), then aimed; and the record the chart
 * leaves. Its own module because the chart file is wiring only: what each stage does, and why, is read here.
 */
import {decide} from 'footprintjs';
import {readCameraMove, REST, MAX_ZOOM, covered, viewOf, aimAt} from '../camera.mjs';
import {compose} from '../regions.mjs';
import {hashOf} from '../hash.mjs';
import {VIEW_AXES, r3, spanOf, clockOf, viewLanes, depthLanes, shakeOf} from './lanes.mjs';
import {checkCover, checkWidens, checkHolds} from './checks.mjs';

/** The families that move the camera, and so take turns with the focus and the pushes. */
const MOVING = new Set(['view', 'follow', 'depth']);
const AXIS_WORDS = {x: 'left–right', y: 'up–down', z: 'zoom', r: 'roll', orbit: 'orbit', zoom: 'dolly zoom', focus: 'focus', blur: 'focus', shake: 'handheld', clock: 'clock'};

/** Stage: every entry read against the catalog (camera.mjs · readCameraMove), in the order the moves start. */
export function readMoves(s, spec, {clock, total, reducedMotion = false}, work) {
  if (typeof reducedMotion !== 'boolean') throw new Error(`reducedMotion is true (each camera move cuts to its end framing; handheld off) or false, not ${JSON.stringify(reducedMotion)}`);
  work.moves = spec.map((m, i) => readCameraMove(m, `camera[${i}]`, {at: clock.at, total}));
  work.moves.forEach((m, i) => { const prev = work.moves[i - 1]; if (prev && m.at < prev.at) throw new Error(`${m.path} starts at ${m.at.toFixed(2)} s, before ${prev.path} (${prev.at.toFixed(2)} s); list the moves in the order they start`); });
  s.moves = work.moves.map(summary);
  s.reducedMotion = reducedMotion;
}

/** Stage: no move (but handheld) runs across a change of picture; a depth move finds its world and the world's layers. */
export function onePicture(s, {changes, worldAt}, work) {
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
    if (i && l.depth > layers[i - 1].depth) throw new Error(`${where}: the kit "${kit}"'s layers go back to front, the farthest first; "${l.name}" (depth ${l.depth}) is farther than "${layers[i - 1].name}" (depth ${layers[i - 1].depth}), above it: list "${l.name}" first`);
    seen.add(l.name);
  });
  return {world: on.world, path: on.path, layers: layers.map(l => Object.freeze({name: l.name, depth: l.depth}))};
}

/** Stage: one move at a time on each thing it moves, and none while the focus, a push or a world's spotlight moves the camera. */
export function oneCamera(s, {focus = null, pushes = [], spotlight = () => null, kitCamera = () => null}, work) {
  const lanes = new Map();
  for (const m of work.moves) for (const axis of m.def.axes(m.p)) {
    const key = m.family === 'depth' ? `${m.worldPath}:${axis}` : axis, before = lanes.get(key);
    if (before && m.at < before.until) throw new Error(`${m.path} (${m.move}) starts at ${m.at.toFixed(2)} s while ${before.path} (${before.move}) still moves the camera's ${AXIS_WORDS[axis]} (until ${before.until.toFixed(2)} s); one move at a time on each: start it after, or move something else`);
    lanes.set(key, m);
  }
  const others = [...(focus?.moving ?? []).map(w => ({...w, what: `the focus (focus.keys[${w.key}], on "${w.on}") is moving the camera`, fix: 'start the move after it arrives, or show the focus with "spotlight" or "dim"'})),
    ...pushes.flatMap(p => [[p.a, p.a + p.seconds], [p.b, p.b + p.seconds]].map(([from, to]) => ({from, to, what: `the push "${p.note}" is moving the camera`, fix: 'start the move after it has eased, or move the push'})))];
  for (const m of work.moves) {
    if (!MOVING.has(m.family)) continue;
    const o = others.find(x => m.at < x.to && m.until > x.from);
    if (o) throw new Error(`${m.path} (${m.move}, ${m.at.toFixed(2)}–${m.until.toFixed(2)} s) would move the camera while ${o.what} (${o.from.toFixed(2)}–${o.to.toFixed(2)} s); a film has one camera: ${o.fix}`);
    // A world's spotlight is its kit's own camera (StoryWorld · spotAt): a move never runs over one, as a push never does.
    for (let t = m.at; t < m.until; t += .05) { const lit = spotlight(t); if (lit) throw new Error(`${m.path} (${m.move}) runs over ${lit}'s spotlight at ${t.toFixed(2)} s; a film has one camera: move before or after the spotlight`); }
    const own = kitCamera(m.at, m.until);
    if (own) throw new Error(`${m.path} (${m.move}, ${m.at.toFixed(2)}–${m.until.toFixed(2)} s) would move the camera while the kit "${own.kit}" moves its own camera in the world at ${own.path} (${own.from.toFixed(2)}–${own.to.toFixed(2)} s); a film has one camera: move the camera move, or the kit's camera key, so they take turns`);
  }
  s.checked = {moves: work.moves.length, focus: (focus?.moving ?? []).length, pushes: pushes.length};
}

/** Decider: moves, or (the viewer asked for reduced motion) cuts; the decision's evidence is kept for the record. */
export function chooseMotion(s, work) {
  const d = decide(s, [{when: {reducedMotion: {eq: true}}, then: 'cuts', label: 'The viewer asked for reduced motion: each move cuts to its end framing'}], {branch: 'moves', label: 'Each move eases as written'}); work.decision = d.evidence; return d;
}

/** Branch: how each move is played — as written, or (reduced motion) as a cut, with handheld and a speed ramp off and a freeze kept. */
export function played(s, work, cuts) {
  work.cuts = cuts;
  for (const m of work.moves) m.played = playedAs(m, cuts);
  s.played = work.moves.map(m => `${m.path} ${m.move}: ${m.played}`);
}
/** How a move plays in one version: as written ('move'), or as cut: 'cut', 'kept' (a freeze) or 'off' (handheld, a speed ramp). */
const playedAs = (m, cuts) => (!cuts ? 'move' : m.move === 'freeze' ? 'kept' : m.family === 'texture' || m.move === 'speed-ramp' ? 'off' : 'cut');

/** Stage: the moves aimed (where each takes the camera), kept covering the frame, and the plan's functions. */
export function aim(s, env, work) {
  const cuts = work.cuts, paths = new Map();   // follow paths, by move and picture clock: both versions share them where they can
  // Each version from its own moves and its own picture clock (cuts turn handheld and a speed ramp off). The recipe is
  // checked as written and as cut, in that order, whichever version is made, so the moving film and the reduced-motion
  // film accept and refuse the same recipes, with the same words. The version made is planned last.
  const versionOf = asCuts => {
    const moves = work.moves.filter(m => playedAs(m, asCuts) !== 'off'), clockAt = clockOf(moves);
    return {moves, clockAt, cuts: asCuts, lanes: viewLanes(moves, {...env, clockAt, cuts: asCuts, paths})};
  };
  const other = versionOf(!cuts), made = versionOf(cuts);
  for (const v of cuts ? [other, made] : [made, other]) {
    // Each move where it moves; then each hold (what put the camera where a later move starts); then whether each
    // dolly-out widens — judged last, on framings already known to be coverable.
    const {covers, inherited} = checkCover(v.moves, v.lanes.stateAt, v.cuts);
    checkHolds(v.moves, v.lanes.stateAt, v.cuts);
    if (inherited) throw new Error(`${inherited.m.path} (${inherited.m.move}) starts where the picture already needs ×${inherited.need.toFixed(2)} to keep the frame covered (at ${inherited.t.toFixed(2)} s), past the ×${MAX_ZOOM} a camera goes to: a move before it holds the camera there`);
    checkWidens(v.moves, v.lanes.timeline);
    if (v === made) for (const [m, most] of covers) m.covers = most;
  }
  const {moves, clockAt} = made, view = made.lanes;
  const depth = depthLanes(moves, cuts), shakeAt = shakeOf(moves);
  for (const m of moves) if (m.family === 'view' || m.family === 'follow') m.ends = endsOf(covered(view.stateAt(spanOf(m, cuts)[1])), m.trail);
  const viewAt = t => { const v = view.stateAt(t); return VIEW_AXES.every(a => v[a] === REST[a]) ? null : covered(v); };
  /** The camera's whole view on the frame at t (handheld's drift over its framing), for regions and clicks; null at rest. */
  const viewOn = t => { const v = viewAt(t), k = shakeAt(t); return !v && !k ? null : !k ? viewOf(v) : !v ? viewOf(k) : compose(viewOf(k), viewOf(v)); };
  const show = (ctx, t, paint) => {
    const v = viewAt(t), k = shakeAt(t);
    if (!v && !k) { paint(ctx); return; }
    ctx.save(); env.ground?.(ctx);   // the paper under the moved picture: an anti-aliased edge blends with it, never with the frame before
    if (k) aimAt(ctx, k);
    if (v) aimAt(ctx, v);
    paint(ctx); ctx.restore();
  };
  work.plan = {viewAt, viewOn, clockAt, depthAt: depth, show};
  s.aimed = moves.map(m => ({path: m.path, ...(m.ends ? {ends: m.ends} : {}), ...(m.covers ? {covers: m.covers} : {})}));
}

/**
 * Where a view or follow move leaves the camera, as the record and a segment's key keep it: the framing the viewer
 * sees as it arrives ({x, y, z, r}, rounded), and for a follow the path it took (a hash of where its thing was).
 */
const endsOf = (v, trail) => ({x: r3(v.x), y: r3(v.y), z: r3(v.z), r: r3(v.r), ...(trail ? {path: hashOf(trail.map(p => Object.values(p).map(r3)))} : {})});

/** A move as the record keeps it: where it is in the recipe, what it is, when (at, until: seconds), its settings and its ease. */
const summary = m => ({path: m.path, move: m.move, family: m.family, at: r3(m.at), until: r3(m.until), ...m.p, ...(m.eased ?? {})});

/**
 * The record: how the moves were played (and why: the decision's evidence), each move as placed — with `ends`, the
 * framing it resolved to (so an edit under it, a push the dolly aims through, changes the record and a segment's key)
 * — and the flowchart's narrative.
 */
export function recordOf(work, trace) {
  return {motion: work.cuts ? 'cuts' : 'moves', decision: work.decision,
    moves: work.moves.map(m => ({...summary(m), played: m.played, lasts: Number.isFinite(m.lasts) ? r3(m.lasts) : null, ...(m.worldPath ? {world: m.worldPath} : {}),
      ...(m.ends ? {ends: m.ends} : {}), ...(m.covers ? {covers: m.covers} : {})})),
    narrative: trace.getEntries().map(({rawValue, ...entry}) => entry)};
}
