/**
 * Synthetic keypoints for the mocap tests (src/mocap.mjs · fromPose), from bodies whose truth is known:
 *   walk.coco.json        a walk seen from the side, COCO-17 in pixels, 30 fps: each foot planted 60% of a 1.1 s
 *                         stride, then carried on an arc to its next spot; with the gaps a detector leaves (the nose
 *                         lost for the first 2 frames, a wrist for 4, a knee unsure for 3, nobody found in frame 70)
 *   walk-noisy.coco.json  the same walk as a real detector reports it (MediaPipe heavy on a drawn walk, measured and
 *                         scaled to this 100 px torso): each point off by a slow wander (up to 16 px) and a jitter
 *                         (4.5 px on the limbs, 2 px on the body); and points dipping to 0.4 visibility for 1–3 frames
 *   wave.mediapipe.json   a child facing us waving, MediaPipe-33 normalised, a portrait phone video at 25 fps: feet
 *                         still, the right forearm swinging either side of straight up (its angle crosses ±π)
 * Deterministic: a seeded jitter stands in for the detector's noise. Write the files with
 *   node test/fixtures/mocap/make.mjs
 */
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const COCO = ['nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'];
const MEDIAPIPE = ['nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner', 'right_eye', 'right_eye_outer', 'left_ear', 'right_ear',
  'mouth_left', 'mouth_right', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
  'left_index', 'right_index', 'left_thumb', 'right_thumb', 'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
  'left_heel', 'right_heel', 'left_foot_index', 'right_foot_index'];

/** A seeded generator (mulberry32): the same jitter every run. */
function jitter(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth = u => u * u * (3 - 2 * u);
const add = (p, dx, dy) => ({x: p.x + dx, y: p.y + dy});
/** The knee joining hip and ankle (y down), bent toward +x (forward, walking right). */
function knee(hip, ankle, thigh, shin) {
  const dx = ankle.x - hip.x, dy = ankle.y - hip.y, d = Math.hypot(dx, dy), along = (thigh * thigh + d * d - shin * shin) / (2 * d), out = Math.sqrt(Math.max(0, thigh * thigh - along * along));
  const u = {x: dx / d, y: dy / d}, n = {x: -u.y, y: u.x}, side = n.x > 0 ? 1 : -1;   // the normal that points forward
  return {x: hip.x + u.x * along + n.x * out * side, y: hip.y + u.y * along + n.y * out * side};
}

// ——— The walk ———
export const WALK = Object.freeze({fps: 30, frames: 96, stride: 1.1, stance: .6, speed: 140, floor: 600, startX: 220, offsets: [0, .55], lift: 22});
const W = WALK;

/** A foot's truth at t: where it is, and whether it is planted (in its stance). */
export function walkFoot(j, t) {
  const s = (t - W.offsets[j]) / W.stride, k = Math.floor(s), phase = s - k;
  const spot = i => W.startX + W.speed * (W.offsets[j] + i * W.stride + W.stance * W.stride / 2);
  if (phase < W.stance) return {x: spot(k), y: W.floor, planted: true};
  const u = (phase - W.stance) / (1 - W.stance);
  return {x: spot(k) + (spot(k + 1) - spot(k)) * smooth(u), y: W.floor - W.lift * Math.sin(Math.PI * u), planted: false};
}

/** Each foot's planted frames, as runs [[from, to]] of frame numbers. */
export function walkStances(j) {
  const runs = []; let open = -1;
  for (let f = 0; f < W.frames; f++) {
    const on = walkFoot(j, f / W.fps).planted;
    if (on && open < 0) open = f;
    if (!on && open >= 0) { runs.push([open, f - 1]); open = -1; }
  }
  if (open >= 0) runs.push([open, W.frames - 1]);
  return runs;
}

function walkBody(t) {
  const hip = {x: W.startX + W.speed * t, y: W.floor - 160 - 3 * Math.sin(4 * Math.PI * t / W.stride)}, lean = .06;
  const feet = [0, 1].map(j => walkFoot(j, t)), sh = {x: hip.x + 100 * Math.sin(lean), y: hip.y - 100 * Math.cos(lean)};
  const p = {nose: add(sh, 14, -48), left_shoulder: add(sh, -3, 0), right_shoulder: add(sh, 3, 0), left_hip: add(hip, -3, 0), right_hip: add(hip, 3, 0)};
  [['left_', 0], ['right_', 1]].forEach(([side, j]) => {
    p[`${side}ankle`] = {x: feet[j].x, y: feet[j].y};
    p[`${side}knee`] = knee(p[`${side}hip`], p[`${side}ankle`], 85, 85);
    // The arm swings against its own leg: back as its foot lands, forward as the other's does.
    const a = -.4 * Math.cos(2 * Math.PI * (t - W.offsets[j]) / W.stride) + lean, e = .3 + .1 * Math.sin(2 * Math.PI * t / W.stride);
    p[`${side}elbow`] = add(p[`${side}shoulder`], 55 * Math.sin(a), 55 * Math.cos(a));
    p[`${side}wrist`] = add(p[`${side}elbow`], 50 * Math.sin(a + e), 50 * Math.cos(a + e));
  });
  Object.assign(p, {left_eye: add(p.nose, -4, -6), right_eye: add(p.nose, -2, -6), left_ear: add(p.nose, -16, -2), right_ear: add(p.nose, -14, -2)});
  return p;
}

/** The walk's points with up to `noise` px of jitter each way, and a confidence of .8–.99. */
function walkFrames(seed, noise) {
  const rand = jitter(seed), r2 = v => Math.round(v * 100) / 100;
  return Array.from({length: W.frames}, (_, f) => {
    const p = walkBody(f / W.fps);
    return COCO.map(name => [r2(p[name].x + (rand() - .5) * 2 * noise), r2(p[name].y + (rand() - .5) * 2 * noise), r2(.8 + .19 * rand())]);
  });
}

export function makeWalk() {
  const frames = walkFrames(17, .6);
  const at = name => COCO.indexOf(name);
  for (const f of [0, 1]) frames[f][at('nose')] = null;                 // lost at the start: held
  for (let f = 20; f <= 23; f++) frames[f][at('left_wrist')] = null;    // lost for 4 frames: bridged
  for (let f = 50; f <= 52; f++) frames[f][at('right_knee')][2] = .2;   // unsure for 3 frames: a dropout, bridged
  frames[70] = null;                                                    // nobody found: every joint bridged
  return {scheme: 'coco-17', fps: W.fps, coordinates: 'pixels', width: 1280, height: 720, frames};
}

/** A seeded normal draw (Box–Muller). */
const normalOf = rand => () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const LIMBS = /elbow|wrist|knee|ankle/;

/**
 * The walk as a real detector reports it: each point off by a slow wander (each axis a sine of up to 16 px, a tenth
 * to two fifths of a hertz) and a frame-to-frame jitter (normal, 4.5 px on the limbs, 2 px on the body), with a confidence of
 * .8–.99. (MediaPipe heavy on a drawn walk: jitter 0.03–0.056 torso lengths on the limbs, 0.015–0.02 on the body.)
 */
function roughFrames(seed) {
  const rand = jitter(seed), normal = normalOf(rand), r2 = v => Math.round(v * 100) / 100;
  const wander = COCO.map(() => [0, 1].map(() => ({a: 16 * rand(), hz: .1 + .3 * rand(), phase: 2 * Math.PI * rand()})));
  return Array.from({length: W.frames}, (_, f) => {
    const p = walkBody(f / W.fps), t = f / W.fps;
    return COCO.map((name, k) => {
      const sd = LIMBS.test(name) ? 4.5 : 2, [wx, wy] = wander[k].map(w => w.a * Math.sin(2 * Math.PI * w.hz * t + w.phase));
      return [r2(p[name].x + wx + sd * normal()), r2(p[name].y + wy + sd * normal()), r2(.8 + .19 * rand())];
    });
  });
}

export function makeNoisyWalk() {
  const frames = roughFrames(41), rand = jitter(43);
  // Dips: now and then a joint the detector is unsure of for 1–3 frames (visibility 0.4).
  for (let f = 0; f < W.frames; f++) for (let k = 5; k < COCO.length; k++) {
    if (rand() >= .02) continue;
    const n = 1 + Math.floor(rand() * 3);
    for (let i = f; i < Math.min(W.frames, f + n); i++) frames[i][k][2] = .4;
  }
  return {scheme: 'coco-17', fps: W.fps, coordinates: 'pixels', width: 1280, height: 720, frames};
}

// ——— The wave ———
export const WAVE = Object.freeze({fps: 25, frames: 60, width: 720, height: 1280, floor: 1100, waves: 2});

function waveBody(t) {
  const sway = 2 * Math.sin(Math.PI * t), hipY = WAVE.floor - 330, shY = hipY - 180, x = 360 + sway;
  const p = {left_hip: {x: x + 40, y: hipY}, right_hip: {x: x - 40, y: hipY}, left_shoulder: {x: x + 72, y: shY}, right_shoulder: {x: x - 72, y: shY},
    left_knee: {x: 402, y: hipY + 165}, right_knee: {x: 318, y: hipY + 165}, left_ankle: {x: 404, y: WAVE.floor}, right_ankle: {x: 316, y: WAVE.floor}, nose: {x, y: shY - 90}};
  p.left_elbow = add(p.left_shoulder, 4, 100); p.left_wrist = add(p.left_elbow, 2, 92);
  // The right arm raised out to the side; its forearm swings either side of straight up.
  const up = 2.6, fore = Math.PI + .5 * Math.sin(2 * Math.PI * WAVE.waves * t);
  p.right_elbow = add(p.right_shoulder, -100 * Math.sin(up), 100 * Math.cos(up));
  p.right_wrist = add(p.right_elbow, -90 * Math.sin(fore), 90 * Math.cos(fore));
  const face = {left_eye_inner: [8, -10], left_eye: [14, -11], left_eye_outer: [20, -11], right_eye_inner: [-8, -10], right_eye: [-14, -11], right_eye_outer: [-20, -11],
    left_ear: [34, -4], right_ear: [-34, -4], mouth_left: [10, 18], mouth_right: [-10, 18]};
  for (const [name, [dx, dy]] of Object.entries(face)) p[name] = add(p.nose, dx, dy);
  for (const side of ['left_', 'right_']) {
    for (const [part, dx, dy] of [['pinky', 6, 14], ['index', 2, 16], ['thumb', -4, 10]]) p[`${side}${part}`] = add(p[`${side}wrist`], dx, dy);
    p[`${side}heel`] = add(p[`${side}ankle`], 0, 14); p[`${side}foot_index`] = add(p[`${side}ankle`], side === 'left_' ? 18 : -18, 22);
  }
  return p;
}

export function makeWave() {
  const rand = jitter(29), r6 = v => Math.round(v * 1e6) / 1e6;
  const frames = Array.from({length: WAVE.frames}, (_, f) => {
    const p = waveBody(f / WAVE.fps);
    return MEDIAPIPE.map(name => [r6((p[name].x + (rand() - .5) * 1.6) / WAVE.width), r6((p[name].y + (rand() - .5) * 1.6) / WAVE.height), r6(.86 + .13 * rand())]);
  });
  // An unsure little finger is not a joint the figure is drawn from: no dropout, no gap.
  for (let f = 10; f <= 30; f++) frames[f][MEDIAPIPE.indexOf('left_pinky')][2] = .1;
  return {scheme: 'mediapipe-33', fps: WAVE.fps, coordinates: 'normalised', width: WAVE.width, height: WAVE.height, frames};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = new URL('.', import.meta.url);
  writeFileSync(new URL('walk.coco.json', here), `${JSON.stringify(makeWalk())}\n`);
  writeFileSync(new URL('walk-noisy.coco.json', here), `${JSON.stringify(makeNoisyWalk())}\n`);
  writeFileSync(new URL('wave.mediapipe.json', here), `${JSON.stringify(makeWave())}\n`);
}
