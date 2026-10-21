/**
 * A thought cloud: a world drawn inside a cartoon thought bubble — a scalloped cloud with an ink outline and a soft
 * shadow, and a trail of three little circles toward a corner — for a memory, a recap, a daydream. No one is thinking
 * it: remembering is the cloud. A world takes it as its frame in the recipe, and the film hangs the world's sheet in
 * the cloud instead of on the paper (film.mjs · drawWorld):
 *
 *   {"story": {"kit": "draws", "shot": "recap", "frame": "thought"}, …}
 *   {"type": "world", "scene": "dream", "frame": {"type": "thought", "corner": "bottom-right", "size": 0.75}, "world": {…}}
 *
 * The cloudBurst transition (transitions/paper/burst.mjs) pops the same cloud into puffs: the same corner, size and seed
 * are the same cloud.
 *
 *   corner  where the trail points: bottom-left (the default) · bottom-right · top-left · top-right; the cloud leans a
 *           little toward the opposite corner, to leave the trail room
 *   size    the cloud's share of the frame, 0.5–0.9 (0.8). The world is drawn at that scale, so the cloud is a window
 *           onto all of it but its corners, and the words in it stay readable
 *   seed    the scallops, 0–10000 (3): a seeded shape (transitions/paper/seeded.mjs), the same on every frame and machine
 *   color   the cloud's paper (null: the theme's card); `ink` its outline (null: the theme's ink)
 *
 * Its entrance is a pure function of the seconds since its shot began (thoughtAt): the trail's circles pop up one
 * after another from the corner toward the cloud, each with a small overshoot (motion.mjs · spring), then the cloud
 * puffs open out of the trail, its scallops filling out one after another round from there; about 1.4 s in all.
 */
import {W, H, pixelScale} from './frame.mjs';
import {isHex, rgba} from './colour.mjs';
import {spring} from './motion.mjs';
import {arc} from './principles.mjs';
import {seeded} from './transitions/paper/seeded.mjs';
import {paperTokens} from './transitions/paper/tokens.mjs';

const TAU = 2 * Math.PI;

export const THOUGHT_CORNERS = Object.freeze(['bottom-left', 'bottom-right', 'top-left', 'top-right']);
/** The settings, written as a transition's are (transitions.mjs · readParams): the frame and cloudBurst take the same five. */
export const THOUGHT_SETTINGS = Object.freeze({
  corner: Object.freeze({oneOf: THOUGHT_CORNERS, default: 'bottom-left'}),
  size: Object.freeze({number: Object.freeze([.5, .9]), default: .8}),
  seed: Object.freeze({number: Object.freeze([0, 10000]), default: 3}),
  color: Object.freeze({color: true, default: null}),
  ink: Object.freeze({color: true, default: null}),
});

// ── The cloud's shape ──────────────────────────────────────────────────────────────────────────────────────────

/** The frame's corners, and the most the cloud leans away from the trail's (px across, px down). */
const CORNER_AT = Object.freeze({'bottom-left': [0, H], 'bottom-right': [W, H], 'top-left': [0, 0], 'top-right': [W, 0]});
const LEAN = Object.freeze([80, 45]);
/** The scallops: how many, the curve their valleys sit on (a superellipse: 2 is an ellipse, higher is squarer), how deep each bulges (a share of its width). */
const LOBES = 22, SQUARENESS = 2.8, DEPTH = Object.freeze([.26, .4]), SAMPLES = 720;
/** The trail, from the corner out: each circle's radius, and how far along it sits from the cloud's edge toward the corner. */
const TRAIL = Object.freeze([Object.freeze({r: 12, along: .9}), Object.freeze({r: 19, along: .6}), Object.freeze({r: 29, along: .3})]);
/** The longest trail (px from the cloud's edge), and where it heads: in from the corner by this much. */
const TRAIL_REACH = 340, TRAIL_END = Object.freeze([70, 58]);

const clouds = new Map();
/**
 * The cloud for {corner, size, seed}, checked by the caller (readThought, or a transition's settings): where it sits
 * (`centre`; `box` [x0, y0, x1, y1], which the world's picture fills, drawn at scale `S` from `place`), its scallops
 * (`lobes`, each the arc of a circle between two `valleys`), the point it grows from (`anchor`: its edge nearest the
 * trail), each scallop's turn in the entrance (`rank`, round from the anchor) and the trail's circles, from the corner
 * out. Kept per settings: every frame asks again.
 */
export function thoughtCloud({corner = 'bottom-left', size = .8, seed = 3} = {}) {
  const key = `${corner}|${size}|${seed}`;
  if (!clouds.has(key)) { if (clouds.size >= 64) clouds.clear(); clouds.set(key, buildCloud(corner, size, seed)); }
  return clouds.get(key);
}

function buildCloud(corner, size, seed) {
  const w = W * size, h = H * size, [kx, ky] = CORNER_AT[corner], away = [kx ? -1 : 1, ky ? -1 : 1];
  const centre = [W / 2 + away[0] * Math.min(LEAN[0], (W - w) / 4), H / 2 + away[1] * Math.min(LEAN[1], (H - h) / 4)];
  const next = seeded(seed), valleys = valleysOn(superellipse(w / 2 * .9, h / 2 * .86), next);
  const depths = valleys.map(() => DEPTH[0] + (DEPTH[1] - DEPTH[0]) * next());
  const lobes = fitted(valleys, depths, centre, [w, h]);
  const apexes = lobes.map(l => [(l.v0[0] + l.v1[0]) / 2 + l.out[0] * l.h, (l.v0[1] + l.v1[1]) / 2 + l.out[1] * l.h]);
  const first = nearest(apexes, [kx, ky]), anchor = apexes[first];
  const rank = lobes.map((_, i) => Math.min(Math.abs(i - first), LOBES - Math.abs(i - first)));
  const box = [centre[0] - w / 2, centre[1] - h / 2, centre[0] + w / 2, centre[1] + h / 2];
  return Object.freeze({corner, size, seed, centre: Object.freeze(centre), box: Object.freeze(box), S: size, place: Object.freeze([box[0], box[1]]),
    lobes: Object.freeze(lobes), valleys: Object.freeze(lobes.map(l => l.v0)), anchor: Object.freeze(anchor), rank: Object.freeze(rank),
    trail: trailOf(anchor, [kx, ky], away)});
}

const signedPow = (v, p) => Math.sign(v) * Math.abs(v) ** p;
/** A superellipse about the origin, half-extents a and b, as a dense closed polyline (clockwise on the screen). */
function superellipse(a, b) {
  return Array.from({length: SAMPLES}, (_, j) => { const t = j / SAMPLES * TAU; return [a * signedPow(Math.cos(t), 2 / SQUARENESS), b * signedPow(Math.sin(t), 2 / SQUARENESS)]; });
}
/** LOBES valleys spread evenly along the curve's length, from a seeded start, each nudged a little (seeded). */
function valleysOn(curve, next) {
  const lengths = [0];
  for (let j = 1; j <= curve.length; j++) { const a = curve[j - 1], b = curve[j % curve.length]; lengths.push(lengths[j - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const total = lengths.at(-1), step = total / LOBES, phase = next() * step;
  return Array.from({length: LOBES}, (_, i) => pointAt(curve, lengths, ((phase + (i + (next() - .5) * .36) * step) % total + total) % total));
}
function pointAt(curve, lengths, s) {
  let j = 1;
  while (lengths[j] < s) j++;
  const a = curve[j - 1], b = curve[j % curve.length], u = (s - lengths[j - 1]) / (lengths[j] - lengths[j - 1] || 1);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

/** A scallop: the arc from v0 to v1 bulging `h` out along `out` (the chord's outward normal), as a circle {x, y, r, a0, a1}. */
function circleOf(v0, v1, out, h) {
  const c = Math.hypot(v1[0] - v0[0], v1[1] - v0[1]), r = (c * c / 4 + h * h) / (2 * h);
  const x = (v0[0] + v1[0]) / 2 + out[0] * (h - r), y = (v0[1] + v1[1]) / 2 + out[1] * (h - r), a0 = Math.atan2(v0[1] - y, v0[0] - x);
  let a1 = Math.atan2(v1[1] - y, v1[0] - x);
  while (a1 <= a0) a1 += TAU;
  return {x, y, r, a0, a1};
}
/** Each valley to the next, the scallop between them, `depth` of the chord deep. */
function lobesOf(valleys, depths) {
  return valleys.map((v0, i) => {
    const v1 = valleys[(i + 1) % valleys.length], c = Math.hypot(v1[0] - v0[0], v1[1] - v0[1]), out = [(v1[1] - v0[1]) / c, -(v1[0] - v0[0]) / c], h = depths[i] * c;
    return Object.freeze({v0, v1, out, h, ...circleOf(v0, v1, out, h)});
  });
}
/** The scallops, moved and scaled (the same in x and y, so each stays a circle) to sit inside a w × h box about `centre`, touching it on one side. */
function fitted(valleys, depths, centre, [w, h]) {
  const pts = lobesOf(valleys, depths).flatMap(l => Array.from({length: 25}, (_, k) => { const a = l.a0 + (l.a1 - l.a0) * k / 24; return [l.x + l.r * Math.cos(a), l.y + l.r * Math.sin(a)]; }));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min(w / (x1 - x0), h / (y1 - y0)), mid = [(x0 + x1) / 2, (y0 + y1) / 2];
  return lobesOf(valleys.map(([x, y]) => [centre[0] + (x - mid[0]) * s, centre[1] + (y - mid[1]) * s]), depths);
}
const nearest = (points, [x, y]) => points.reduce((best, p, i) => (Math.hypot(p[0] - x, p[1] - y) < Math.hypot(points[best][0] - x, points[best][1] - y) ? i : best), 0);

/** The trail's circles, from the corner out: on a gentle curve (principles.mjs · arc) from the cloud's edge toward the corner. */
function trailOf(edge, [kx, ky], away) {
  const end = [kx + away[0] * TRAIL_END[0], ky + away[1] * TRAIL_END[1]], d = Math.hypot(end[0] - edge[0], end[1] - edge[1]), k = Math.min(1, TRAIL_REACH / d);
  const to = [edge[0] + (end[0] - edge[0]) * k, edge[1] + (end[1] - edge[1]) * k];
  return Object.freeze(TRAIL.map(({r, along}) => Object.freeze({c: Object.freeze(arc(edge, to, along, {bend: .1, toward: ky ? 'down' : 'up'})), r})));
}

// ── Its entrance ───────────────────────────────────────────────────────────────────────────────────────────────

/** The entrance, in seconds from the shot's start: each trail circle's pop (from the corner out), the cloud's opening, the step between its scallops, and when all of it has settled. */
export const THOUGHT_ENTRANCE = Object.freeze({trail: Object.freeze([0, .14, .28]), cloud: .38, scallops: .02, settled: 1.6});
/** The circles pop with a small overshoot (about 8 %); the cloud opens a little softer (about 4 %). */
const POP = Object.freeze({k: 260, d: 20}), OPEN = Object.freeze({k: 190, d: 20});

/**
 * The cloud `age` seconds into its shot: {trail: [three circles' sizes, from the corner out], open (the cloud's size
 * about its anchor), bulge (each scallop's share of its depth; null: all full)}, each 0 before its turn and 1 once it
 * has settled. Before the shot nothing shows; from THOUGHT_ENTRANCE.settled on it is exactly the cloud at rest.
 */
export function thoughtAt(cloud, age) {
  if (!(age > 0)) return {trail: [0, 0, 0], open: 0, bulge: cloud.rank.map(() => 0)};
  if (age >= THOUGHT_ENTRANCE.settled) return {trail: [1, 1, 1], open: 1, bulge: null};
  const {trail, cloud: opens, scallops} = THOUGHT_ENTRANCE;
  return {trail: trail.map(at => spring(age - at, POP)), open: spring(age - opens, OPEN),
    bulge: cloud.rank.map(k => .4 + .6 * spring(age - opens - scallops * k, POP))};
}
/** The cloud's growth at `age` as a camera about its anchor ({sx, sy, z, tx, ty}: regions.mjs · about): what is drawn in it is seen through it. */
export function thoughtCamera(cloud, age) {
  const [x, y] = cloud.anchor;
  return {sx: x, sy: y, z: thoughtAt(cloud, age).open, tx: x, ty: y};
}

// ── Drawing it ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The cloud's outline as the current path on ctx: its scallops in order, each bulging bulge[i] of its depth (null: all full). */
export function cloudPath(ctx, cloud, bulge = null) {
  ctx.beginPath();
  cloud.lobes.forEach((lobe, i) => { const {x, y, r, a0, a1} = bulge ? circleOf(lobe.v0, lobe.v1, lobe.out, lobe.h * bulge[i]) : lobe; ctx.arc(x, y, r, a0, a1); });
  ctx.closePath();
}

/** The soft shadow a sheet hung on the paper casts (film.mjs · drawWorld), in frame units (a shadow ignores the transform). */
function shade(ctx, k) {
  const px = pixelScale(ctx);
  ctx.shadowColor = 'rgba(60,50,35,.22)'; ctx.shadowBlur = 26 * k * px; ctx.shadowOffsetY = 8 * k * px;
}
/** The paper softening in at the cloud's edge, inside it: wide to narrow strokes of thin paper, deepest at the outline. */
const SOFT_EDGE = Object.freeze([[44, .1], [32, .1], [22, .1], [13, .12], [6, .14]]);

/**
 * The cloud on ctx at `age` seconds into its shot (thoughtAt): the trail, then the cloud — its paper, casting a soft
 * shadow; the picture inside it, softening into the paper at the edge (paint(c) draws the picture in frame units: a
 * world's sheet at the cloud's `place`, scale `S`); the ink outline. Colours: `color` and `ink`, or the theme's card
 * and ink (transitions/paper/tokens.mjs). ctx is left as it was found.
 */
export function drawThought(ctx, cloud, paint, {age = Infinity, color = null, ink = null, theme} = {}) {
  const tokens = paperTokens(theme), paper = color ?? tokens.paper, line = ink ?? tokens.ink, now = thoughtAt(cloud, age);
  ctx.save();
  try {
    cloud.trail.forEach((circle, i) => { if (now.trail[i] > 0) trailCircle(ctx, circle, now.trail[i], paper, line); });
    if (now.open > 0) drawCloud(ctx, cloud, now, paint, paper, line);
  } finally { ctx.restore(); }
}
function trailCircle(ctx, {c: [x, y], r}, k, paper, line) {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.save(); shade(ctx, .5); ctx.fillStyle = paper; ctx.fill(); ctx.restore();
  ctx.lineWidth = 3.5; ctx.strokeStyle = line; ctx.stroke();
  ctx.restore();
}
function drawCloud(ctx, cloud, {open, bulge}, paint, paper, line) {
  const [ax, ay] = cloud.anchor;
  ctx.translate(ax, ay); ctx.scale(open, open); ctx.translate(-ax, -ay);
  ctx.save(); shade(ctx, 1); ctx.fillStyle = paper; cloudPath(ctx, cloud, bulge); ctx.fill(); ctx.restore();
  ctx.save(); cloudPath(ctx, cloud, bulge); ctx.clip(); paint(ctx);
  ctx.lineJoin = 'round';
  for (const [width, alpha] of SOFT_EDGE) { ctx.lineWidth = width; ctx.strokeStyle = rgba(paper, alpha); cloudPath(ctx, cloud, bulge); ctx.stroke(); }
  ctx.restore();
  ctx.lineWidth = 4.5; ctx.lineJoin = 'round'; ctx.strokeStyle = line; cloudPath(ctx, cloud, bulge); ctx.stroke();
}

// ── The recipe's frame ─────────────────────────────────────────────────────────────────────────────────────────

const FRAME_KEYS = Object.freeze(['type', ...Object.keys(THOUGHT_SETTINGS)]);
const shown = v => (typeof v === 'number' ? String(v) : JSON.stringify(v));
/** Each setting as a refusal names it: what it is, and what it takes. */
const MEANS = Object.freeze({
  corner: `where the trail of little circles points: ${THOUGHT_CORNERS.join(', ')}`,
  size: 'the cloud\'s share of the frame: a number from 0.5 to 0.9 (0.8, the default, keeps the picture inside readable)',
  seed: 'a number from 0 to 10000 (it picks the scallops)',
  color: 'the cloud\'s paper: a hex colour such as "#fffdf8" (left out: the theme\'s card)',
  ink: 'the outline\'s ink: a hex colour such as "#1b1f27" (left out: the theme\'s ink)',
});
const fits = (rule, v) => (rule.oneOf ? rule.oneOf.includes(v) : rule.number ? typeof v === 'number' && v >= rule.number[0] && v <= rule.number[1] : v === null || isHex(v));

/**
 * A world's frame from the recipe: "thought", or {"type": "thought", corner?, size?, seed?, color?, ink?}; left out,
 * null (the world hangs on its sheet as before). Returns its settings and its cloud; anything else refuses, naming the
 * fix.
 */
export function readThought(value, where) {
  if (value === undefined) return null;
  const spec = value === 'thought' ? {type: 'thought'} : value;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec) || spec.type !== 'thought') throw new Error(`${where}: frame must be "thought" or {"type": "thought", "corner"?, "size"?, "seed"?, "color"?, "ink"?} (a thought cloud is the one frame there is), not ${shown(value)}`);
  for (const key of Object.keys(spec)) if (!FRAME_KEYS.includes(key)) throw new Error(`${where}: frame has unsupported key ${key} (a thought frame takes ${Object.keys(THOUGHT_SETTINGS).join(', ')})`);
  const p = Object.fromEntries(Object.entries(THOUGHT_SETTINGS).map(([name, rule]) => [name, spec[name] ?? rule.default]));
  for (const [name, rule] of Object.entries(THOUGHT_SETTINGS)) if (!fits(rule, p[name])) throw new Error(`${where}: frame.${name} is ${MEANS[name]}, not ${shown(spec[name])}`);
  return Object.freeze({type: 'thought', ...p, cloud: thoughtCloud(p)});
}
