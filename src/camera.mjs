/**
 * Camera moves by name. Directors and prompt guides name camera work, and naming it gets the effect: pan,
 * tilt, dolly in, truck, crane, orbit, dolly zoom, rack focus, dutch angle, handheld, speed ramp, freeze frame.
 * This module is that vocabulary as a catalog (CAMERA_MOVES), kept the way transitions.mjs · TRANSITIONS keeps
 * an editor's: each move is a strategy with a family, a default length, settings with defaults, and the one
 * function its family asks for. A recipe names moves in its `camera` list (camerawork.mjs places them):
 *
 *   "camera": [{"move": "dolly-in", "at": ["leak", "leaves the building"], "until": ["leak", "the door"], "on": "database"},
 *              {"move": "dutch", "at": ["turn", "something is wrong"], "amount": 6, "feel": "heavy"}]
 *
 *   family   moves                                         what the move's function gives
 *   view     pan · tilt · dolly-in · dolly-out ·           aim(state, p, box) → the part of the state it ends in
 *            crane · dutch
 *   follow   truck · track                                 follow(box) → the part of the state that follows a named thing
 *   depth    orbit · dolly-zoom · rack-focus               depth(p, layers, before) → where a world's layers end (layersAt)
 *   texture  handheld                                      a small, slow, seeded wobble over the view (handheldAt)
 *   time     speed-ramp · freeze                           remap(u, p) → how far through its span the picture's clock is
 *
 * The camera's STATE is {x, y, z, r}: the point of the frame-as-drawn it centres (1600×900 units), its zoom (1:
 * the whole frame) and its roll (radians, clockwise). REST is the frame as the film draws it with no camera.
 * A state never uncovers the frame: coverZoom is the least zoom that keeps the picture covering it at (x, y)
 * rolled r, and the camera always takes at least that — a dutch angle scales up a little, as an editor's
 * "scale to fill" does, and a pan at the whole frame scales up just enough to slide. A dolly keeps the zoom it
 * asks for instead: it moves toward its named thing only as far as the picture's edges allow, as a push does.
 *
 * DEPTH. A world gives its layers a depth (StoryWorld · layers, back to front, and drawLayer(ctx, t, name, spot)):
 * how far the layer is from the camera, as a multiple of the subject's distance. 1 is the subject's plane, 2 twice
 * as far, 0.5 half way to the camera. An orbit slides each layer by amount × (1 − 1/depth): the subject stays,
 * what is behind it slides one way, what is in front the other way, the nearer the more. A dolly zoom keeps the
 * subject's size while the background grows behind it (the camera pulls back as the lens zooms in): each layer
 * scales by (1 + amount)·depth / (depth + amount). A rack focus blurs each layer by how far it is from the focused
 * plane, |1/depth − 1/focused| (a lens's circle of confusion), easing the focus from one layer to another.
 *
 * A whip pan is a transition between two shots (transitions.mjs · TRANSITIONS.whip), not a move inside one:
 * the catalog refuses it and names the transition.
 */
import {easeNamed} from './ease.mjs';
import {readFeel, spring, settleTime} from './motion.mjs';

const W = 1600, H = 900, DEG = Math.PI / 180;
/** The camera at rest: the frame as the film draws it without one. */
export const REST = Object.freeze({x: W / 2, y: H / 2, z: 1, r: 0});
/** The most a camera may scale the picture: a move that would need more to keep the frame covered refuses. */
export const MAX_ZOOM = 4;
/** The most a layer is blurred, in pixels of its world's sheet. */
const MAX_BLUR = 48;

const clamp01 = v => Math.max(0, Math.min(1, v));
const centreOf = ([x0, y0, x1, y1]) => ({x: (x0 + x1) / 2, y: (y0 + y1) / 2});
/** A value as a message shows it: a number as itself, anything else as JSON. */
const shown = v => (typeof v === 'number' ? String(v) : JSON.stringify(v) ?? String(v));

/** The least zoom that keeps the picture covering the frame with the camera centred on (x, y) and rolled r; Infinity off the picture. */
export function coverZoom({x, y, r = 0}) {
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r)), roomX = Math.min(x, W - x), roomY = Math.min(y, H - y);
  if (!(roomX > 0 && roomY > 0)) return Infinity;
  return Math.max((W / 2 * c + H / 2 * s) / roomX, (W / 2 * s + H / 2 * c) / roomY);
}

/** A state with its zoom raised, where it must be, to keep the frame covered. */
export const covered = s => ({...s, z: Math.max(s.z, coverZoom(s))});

/** A state moved back to where the picture covers the frame at its own zoom and roll (a dolly out recentres as it pulls back). */
function recentred(s) {
  const c = Math.abs(Math.cos(s.r)), n = Math.abs(Math.sin(s.r)), hx = (W / 2 * c + H / 2 * n) / s.z, hy = (W / 2 * n + H / 2 * c) / s.z;
  const fit = (v, h, span) => (h >= span / 2 ? span / 2 : Math.min(span - h, Math.max(h, v)));
  return {...s, x: fit(s.x, hx, W), y: fit(s.y, hy, H)};
}

/** A state as a view on the frame (regions.mjs · view): p → R(r)·(p − (x, y))·z + the frame's centre. */
export function viewOf({x, y, z, r}) {
  const c = Math.cos(r), s = Math.sin(r), v = {z, tx: W / 2 - z * (c * x - s * y), ty: H / 2 - z * (s * x + c * y)};
  return r ? {...v, r} : v;
}

/** Point the canvas through a state: to the frame's centre, the roll, the zoom, then back from the point it centres. */
export function aimAt(ctx, {x, y, z, r}) {
  ctx.translate(W / 2, H / 2); if (r) ctx.rotate(r); ctx.scale(z, z); ctx.translate(-x, -y);
}

/**
 * A move's ease, u (0..1 through its seconds) → how far it has gone: a curve from the ease table by name (ease.mjs ·
 * EASES; inOut when neither is given), or a spring feel (motion.mjs · FEELS, or {k, d}) fitted to the move's seconds
 * — the spring as it runs for its settling time, nudged so it is exactly 1 at the end.
 */
function moveEase({ease, feel}, where) {
  if (feel === undefined) return easeNamed(ease ?? 'inOut', `${where}.ease`);
  let f;
  try { f = readFeel(feel); } catch (e) { throw new Error(`${where}.feel: ${e.message}`, {cause: e}); }
  const S = settleTime(f), end = spring(S, f);
  return u => (u <= 0 ? 0 : u >= 1 ? 1 : spring(u * S, f) + (1 - end) * u);
}

/**
 * A speed ramp's clock: u (how far through its span the voice is) → how far the picture is. The picture runs at
 * `middle` speed half way through and at speed 1 at both ends, and is in step with the voice at both ends, so it
 * makes up (or gives back) the time on either side: speed = 1 + k(cos 2πu − cos 4πu), k = (1 − middle)/2.
 */
export function speedRamp(u, middle) {
  u = clamp01(u);
  if (u === 0 || u === 1) return u;
  const k = (1 - middle) / 2;
  return u + k * (Math.sin(2 * Math.PI * u) / (2 * Math.PI) - Math.sin(4 * Math.PI * u) / (4 * Math.PI));
}

/** A whole-number seed's phase: deterministic, different for each seed and k (the hash acting.mjs · idleAt uses). */
const jitter = (seed, k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
/** Smooth seeded noise in −1..1 at t: three slow waves (at most 1.27 a second) at the seed's phases. */
const wobble = (t, seed, k) => (Math.sin(2 * Math.PI * (.31 * t + jitter(seed, k))) + .6 * Math.sin(2 * Math.PI * (.73 * t + jitter(seed, k + 1)))
  + .35 * Math.sin(2 * Math.PI * (1.27 * t + jitter(seed, k + 2)))) / 1.95;

/**
 * Handheld at t as a state over the frame: a slow seeded drift of up to `amount` px each way and a roll of up to
 * 0.3° per 6 px, at strength w (0..1, its fade in and out). Its zoom covers the farthest the drift can reach, so it
 * never breathes with the drift: it changes only as the strength does.
 */
export function handheldAt(t, {amount, seed}, w = 1) {
  const reach = amount * w, roll = amount / 6 * .3 * DEG * w;
  return {x: W / 2 - reach * wobble(t, seed, 1), y: H / 2 - reach * wobble(t, seed, 11), r: roll * wobble(t, seed, 21), z: coverZoom({x: W / 2 - reach, y: H / 2 - reach, r: roll})};
}

/**
 * Each layer of a world (back to front) as the depth moves leave it: a slide (orbit), a scale about the sheet's
 * centre (dolly zoom) and a blur (rack focus: `focus` is the focused plane as 1/depth, `blur` the pixels per unit of
 * 1/depth away from it). The farthest layer is the ground: it is scaled just enough to keep covering the sheet.
 */
export function layersAt(layers, {orbit = 0, zoom = 0, focus = null, blur = 0} = {}) {
  return layers.map((l, i) => {
    const dx = orbit * (1 - 1 / l.depth), grown = (1 + zoom) * l.depth / (l.depth + zoom);
    const scale = i === 0 ? Math.max(grown, 1 + Math.abs(dx) / (W / 2)) : grown;
    return {name: l.name, dx, scale, blur: focus === null ? 0 : Math.min(MAX_BLUR, blur * Math.abs(1 / l.depth - focus))};
  });
}

/**
 * A dolly's end: the zoom it asks for, toward the named thing's centre (or where it looks now) only as far as the
 * picture's edges allow at that zoom — a dolly keeps its zoom and gives up centring, as a push note does.
 */
const dolly = (s, z, box) => { const {x, y} = recentred({...s, ...(box ? centreOf(box) : {}), z}); return {x, y, z}; };

const number = (range, fallback, unit) => ({number: range, default: fallback, unit});
const layerByName = (layers, name) => layers.find(l => l.name === name);

/** The built-in moves, by family. Each: {family, seconds (its default length), params, axes(p) (what it moves), and its family's function}. */
export const CAMERA_MOVES = deepFreeze({
  pan: {family: 'view', seconds: 2, params: {amount: number([-1200, 1200], 240, 'px across the frame; + looks right, − left')},
    axes: () => ['x'], aim: (s, p) => ({x: s.x + p.amount})},
  tilt: {family: 'view', seconds: 2, params: {amount: number([-700, 700], 140, 'px down the frame; + looks down, − up')},
    axes: () => ['y'], aim: (s, p) => ({y: s.y + p.amount})},
  'dolly-in': {family: 'view', seconds: 2, params: {amount: number([1.05, 3], 1.3, 'times closer'), on: {name: true, default: null}},
    axes: p => (p.on ? ['x', 'y', 'z'] : ['z']), aim: (s, p, box) => (box ? dolly(s, s.z * p.amount, box) : {z: s.z * p.amount})},
  'dolly-out': {family: 'view', seconds: 2, params: {amount: number([1.05, 3], 1.3, 'times farther, never past the whole frame'), on: {name: true, default: null}},
    axes: () => ['x', 'y', 'z'], aim: (s, p, box) => dolly(s, Math.max(1, s.z / p.amount), box)},
  crane: {family: 'view', seconds: 2.5, params: {amount: number([-600, 600], 120, 'px it rises; − descends'), scale: number([.5, 2], 1.12, 'times closer as it goes; below 1 widens, never past the whole frame')},
    axes: () => ['y', 'z'], aim: (s, p) => ({y: s.y - p.amount, z: Math.max(1, s.z * p.scale)})},
  dutch: {family: 'view', seconds: 1.5, params: {amount: number([-30, 30], 8, 'degrees the frame rolls to, clockwise; 0 levels it')},
    axes: () => ['r'], aim: (s, p) => ({r: p.amount * DEG})},
  truck: {family: 'follow', seconds: 2, params: {on: {name: true}}, axes: () => ['x'], follow: box => ({x: centreOf(box).x})},
  track: {family: 'follow', seconds: 2, params: {on: {name: true}}, axes: () => ['x', 'y'], follow: box => centreOf(box)},
  orbit: {family: 'depth', seconds: 3, params: {amount: number([-400, 400], 120, 'px the farthest layer slides; + right')},
    axes: () => ['orbit'], depth: (p, layers, before) => ({orbit: before.orbit + p.amount})},
  'dolly-zoom': {family: 'depth', seconds: 3, params: {amount: number([-.8, .8], .35, 'how much the background grows behind the subject; − gives it back')},
    axes: () => ['zoom'], depth: (p, layers, before) => ({zoom: before.zoom + p.amount})},
  'rack-focus': {family: 'depth', seconds: 1.5, params: {on: {layer: true}, from: {layer: true, default: null}, amount: number([1, 24], 8, 'px of blur on the layer it leaves')},
    axes: () => ['focus', 'blur'], depth: (p, layers) => ({focus: 1 / layerByName(layers, p.on).depth, blur: p.amount / Math.abs(1 / layerByName(layers, p.from).depth - 1 / layerByName(layers, p.on).depth)})},
  handheld: {family: 'texture', seconds: Infinity, params: {amount: number([1, 24], 6, 'px it drifts each way'), seed: number([0, 1e6], 1, 'which drift: give two shots different seeds')},
    axes: () => ['shake']},
  'speed-ramp': {family: 'time', seconds: 2, params: {amount: number([0, 2.5], .3, "the picture's speed half way through; 1 is the voice's")},
    axes: () => ['clock'], remap: (u, p) => speedRamp(u, p.amount)},
  freeze: {family: 'time', seconds: 1.5, params: {}, axes: () => ['clock'], remap: () => 0},
});
export const CAMERA_MOVE_NAMES = Object.freeze(Object.keys(CAMERA_MOVES));
/** What every entry may carry besides its move's own settings. */
const COMMON = ['move', 'at', 'until', 'seconds', 'ease', 'feel'];
/** Names that are not moves inside a shot, and what to write instead. */
const ELSEWHERE = Object.freeze({
  whip: 'a whip pan is a transition between two shots, not a move inside one: give the arriving stage "enter": "whip" (transitions.mjs · TRANSITIONS)',
  'whip-pan': 'a whip pan is a transition between two shots, not a move inside one: give the arriving stage "enter": "whip" (transitions.mjs · TRANSITIONS)',
});

/**
 * One entry of a recipe's `camera` list, checked and put on the clock: {path, move, family, def, at, until, p,
 * ease (the curve, or null for a time or texture move), eased (what the record says it eased by)}. `at` and `until`
 * are a beat (as clock.at takes it) or seconds on the film's clock; `seconds` instead of `until` gives the length.
 * Left out, a move takes its default seconds (a spring feel: the time its spring takes to settle; handheld: to the
 * film's end). An unknown move, key or setting refuses, naming what there is.
 */
export function readCameraMove(entry, where, {at: clockAt, total}) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${where} must be {move, at, until?, …}: the moves are ${CAMERA_MOVE_NAMES.join(', ')}`);
  const name = entry.move;
  if (Object.hasOwn(ELSEWHERE, name)) throw new Error(`${where}: ${ELSEWHERE[name]}`);
  if (typeof name !== 'string' || !Object.hasOwn(CAMERA_MOVES, name)) throw new Error(`${where}: move must be one of ${CAMERA_MOVE_NAMES.join(', ')} (not ${shown(name)})`);
  const def = CAMERA_MOVES[name], allowed = [...COMMON, ...Object.keys(def.params)];
  for (const key of Object.keys(entry)) if (!allowed.includes(key)) throw new Error(`${where} has unsupported key ${key} (a ${name} takes ${allowed.slice(1).join(', ')})`);
  const easing = def.family !== 'time' && def.family !== 'texture';
  if (!easing && (entry.ease !== undefined || entry.feel !== undefined)) throw new Error(`${where}: a ${name} takes no ease or feel (${def.family === 'time' ? 'its clock keeps its own curve' : 'it fades in and out on its own'})`);
  if (entry.ease !== undefined && entry.feel !== undefined) throw new Error(`${where}: give ease (a curve's name) or feel (a spring), not both`);
  const ease = easing ? moveEase(entry, where) : null;
  if (entry.at === undefined) throw new Error(`${where} needs at: the beat it starts on (["scene", "phrase"]) or seconds on the film's clock`);
  const at = timeOf(entry.at, `${where}.at`, clockAt, total);
  if (entry.until !== undefined && entry.seconds !== undefined) throw new Error(`${where}: give until (when it arrives) or seconds (how long it takes), not both`);
  if (entry.seconds !== undefined && !(typeof entry.seconds === 'number' && entry.seconds >= .2 && entry.seconds <= 60)) throw new Error(`${where}.seconds must be a number from 0.2 to 60, not ${shown(entry.seconds)}`);
  const until = entry.until !== undefined ? timeOf(entry.until, `${where}.until`, clockAt, total) : lengthOf(def, entry, at, total, where);
  if (!(until > at)) throw new Error(`${where}: until (${until.toFixed(2)} s) must come after at (${at.toFixed(2)} s)`);
  const eased = !easing ? null : entry.feel !== undefined ? {feel: entry.feel} : {ease: entry.ease ?? 'inOut'};
  return {path: where, move: name, family: def.family, def, at, until, p: readMoveParams(def, entry, where), ease, eased};
}

/** A beat or seconds on the film's clock (0 to its end). */
function timeOf(value, where, clockAt, total) {
  if (typeof value === 'number') {
    if (!(Number.isFinite(value) && value >= 0 && value <= total)) throw new Error(`${where} is seconds from 0 to the film's end (${total.toFixed(2)} s), not ${shown(value)}`);
    return value;
  }
  try { return clockAt(value); } catch (e) { throw new Error(`${where}: ${e.message}`, {cause: e}); }
}

/** When a move with no until ends: its seconds, its spring's settling time, or (handheld) the film's end. */
function lengthOf(def, entry, at, total, where) {
  if (entry.seconds === undefined && def.seconds === Infinity) return total;
  const seconds = entry.seconds ?? (entry.feel !== undefined ? settleTime(entry.feel) : def.seconds);
  if (at + seconds > total + 1e-9) throw new Error(`${where}: the ${entry.move} takes ${+seconds.toFixed(3)} s and the film ends ${(total - at).toFixed(2)} s after it starts: give until or seconds`);
  return at + seconds;
}

/** A move's settings, each checked against its kind, the defaults filled in. */
function readMoveParams(def, entry, where) {
  const out = {};
  for (const [key, spec] of Object.entries(def.params)) {
    const v = entry[key] ?? spec.default;
    if (spec.name || spec.layer) {
      const what = spec.name ? 'the name of a thing in the picture (a kit names what it draws: regionsAt → {name})' : "the name of one of the world's layers (the kit's world gives layers: [{name, depth}])";
      if (v === undefined) throw new Error(`${where}: a ${entry.move} needs ${key}: ${what}`);
      if (v !== null && !(typeof v === 'string' && v.trim())) throw new Error(`${where}.${key} must be ${what}, not ${shown(v)}`);
    }
    if (spec.number && !(typeof v === 'number' && v >= spec.number[0] && v <= spec.number[1])) throw new Error(`${where}.${key} must be a number from ${spec.number[0]} to ${spec.number[1]} (${spec.unit}), not ${shown(v)}`);
    out[key] = v;
  }
  return Object.freeze(out);
}

function deepFreeze(v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) deepFreeze(x); } return v; }
