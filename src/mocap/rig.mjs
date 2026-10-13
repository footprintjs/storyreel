/**
 * The rig: a person's keypoints as a figure is drawn — measured in torso lengths from the hips, y up — and the
 * angles of its joints (pose.mjs says what each angle means). Pure functions.
 */
import {median} from './tracks.mjs';

/** The two sides, in the order a pose lists them: feet[0], arms[0] and legs[0] are the left. */
export const SIDES = Object.freeze(['left_', 'right_']);
const TAU = 2 * Math.PI;

const mid = (a, b) => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
const sub = (a, b) => ({x: a.x - b.x, y: a.y - b.y});
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** The torso's length in px: over the clip, the median distance from the hips' centre to the shoulders' centre. */
export function torsoLength(tracks) {
  return median(tracks.left_hip.map((_, f) => dist(mid(tracks.left_hip[f], tracks.right_hip[f]), mid(tracks.left_shoulder[f], tracks.right_shoulder[f]))));
}

/** A joint's name in a mirror: left and right swap (a mirrored person raises the other hand). */
export const mirrored = name => (name.startsWith('left_') ? `right_${name.slice(5)}` : name.startsWith('right_') ? `left_${name.slice(6)}` : name);

/**
 * The tracks in the rig's units: the first frame's hip centre as the origin, one torso length (px) as the unit,
 * y up; x mirrored, and left and right swapped, when asked. Returns {root, joints}:
 *   root    [{x, y}]: where the body is in each frame (the hips' centre)
 *   joints  [{name: {x, y}}]: how it is held (each joint from that frame's hip centre)
 */
export function toRig(tracks, torso, {mirror = false} = {}) {
  const m = mirror ? -1 : 1, names = Object.keys(tracks), centre = f => mid(tracks.left_hip[f], tracks.right_hip[f]), o = centre(0);
  const place = p => ({x: m * (p.x - o.x) / torso, y: -(p.y - o.y) / torso});
  const root = tracks.left_hip.map((_, f) => place(centre(f)));
  const joints = root.map((r, f) => Object.fromEntries(names.map(name => [mirror ? mirrored(name) : name, sub(place(tracks[name][f]), r)])));
  return {root, joints};
}

/** An angle the short way round: within half a turn of 0. */
export const wrapAngle = a => a - TAU * Math.round(a / TAU);
/** A track of angles made continuous: each frame's step taken the short way round, so nothing jumps by a turn. */
export function unwrap(angles) {
  const out = [angles[0]];
  for (let i = 1; i < angles.length; i++) out.push(out[i - 1] + wrapAngle(angles[i] - angles[i - 1]));
  return out;
}

// Angles of a direction, + toward the way the figure faces (F: 1 or −1): from straight up, and from straight down.
const fromUp = (v, F) => Math.atan2(F * v.x, v.y);
const fromDown = (v, F) => Math.atan2(F * v.x, -v.y);

/** One frame's torso (from upright) and neck (from the torso's line). */
function bodyAngles(j, F) {
  const shoulders = mid(j.left_shoulder, j.right_shoulder), torso = fromUp(sub(shoulders, mid(j.left_hip, j.right_hip)), F);
  return {torso, neck: wrapAngle(fromUp(sub(j.nose, shoulders), F) - torso)};
}
// A torso leaning forward by `torso` (its top forward) turns its own downward line BACK by as much: an arm hanging along
// it points −torso from straight down. So a limb's angle from the torso's line is its angle from straight down + torso.
/** One arm's angles: the upper arm from hanging along the torso, the forearm from the upper arm. */
function armAngles(j, side, torso, F) {
  const upper = fromDown(sub(j[`${side}elbow`], j[`${side}shoulder`]), F), fore = fromDown(sub(j[`${side}wrist`], j[`${side}elbow`]), F);
  return {shoulder: wrapAngle(upper + torso), elbow: wrapAngle(fore - upper)};
}
/** One leg's angles: the thigh from the torso's line downward, the shin from the thigh. */
function legAngles(j, side, torso, F) {
  const thigh = fromDown(sub(j[`${side}knee`], j[`${side}hip`]), F), shin = fromDown(sub(j[`${side}ankle`], j[`${side}knee`]), F);
  return {hip: wrapAngle(thigh + torso), knee: wrapAngle(shin - thigh)};
}

/** Per-frame values → one continuous track per key: {key: [frame values]}, unwrapped. */
const tracksOf = (frames, keys) => Object.fromEntries(keys.map(k => [k, unwrap(frames.map(v => v[k]))]));

/** The torso and the neck over the clip, each continuous: {torso: [], neck: []}. */
export const bodyTracks = (joints, F) => tracksOf(joints.map(j => bodyAngles(j, F)), ['torso', 'neck']);
/** Both arms over the clip: [{shoulder: [], elbow: []}, …] (left, right), each continuous. */
export const armTracks = (joints, torso, F) => SIDES.map(s => tracksOf(joints.map((j, f) => armAngles(j, s, torso[f], F)), ['shoulder', 'elbow']));
/** Both legs over the clip: [{hip: [], knee: []}, …] (left, right), each continuous. */
export const legTracks = (joints, torso, F) => SIDES.map(s => tracksOf(joints.map((j, f) => legAngles(j, s, torso[f], F)), ['hip', 'knee']));

/** A leg's bone lengths over the clip (medians): {thigh, shin}, in the joints' units. */
export function legLengths(joints, side) {
  return {thigh: median(joints.map(j => dist(j[`${side}hip`], j[`${side}knee`]))), shin: median(joints.map(j => dist(j[`${side}knee`], j[`${side}ankle`])))};
}

/**
 * How far (torso lengths) the video's knee must sit off the hip–ankle line before its side counts: closer than this,
 * a nearly straight leg's knee is on whichever side the noise put it, and the knee bends forward instead.
 */
export const KNEE_NOISE = .05;

/**
 * The knee that joins a hip to an ankle with bones of these lengths (two-bone IK). It bends forward (the way the
 * figure faces, F), unless the video saw it clearly to the other side (`seen` more than KNEE_NOISE off the line: a
 * squat seen from the front). The reach is held to what the bones can do, |thigh − shin| … thigh + shin, so they
 * never stretch or shrink: an ankle out of reach (or too near) is met as far (or as near) as the leg can, along the
 * same line. Returns {knee, ankle, short}: the ankle the leg reaches, and how far it fell short of the one asked for
 * (0 when it reaches).
 */
export function solveKnee(hip, ankle, seen, {thigh, shin}, F = 1) {
  const d = dist(hip, ankle), u = d > 1e-9 ? {x: (ankle.x - hip.x) / d, y: (ankle.y - hip.y) / d} : {x: 0, y: -1};
  const reach = Math.max(Math.abs(thigh - shin), Math.min(thigh + shin, d)), reached = {x: hip.x + u.x * reach, y: hip.y + u.y * reach};
  const along = reach > 1e-9 ? (thigh * thigh + reach * reach - shin * shin) / (2 * reach) : 0, out = Math.sqrt(Math.max(0, thigh * thigh - along * along));
  const n = {x: -u.y, y: u.x}, off = (seen.x - hip.x) * n.x + (seen.y - hip.y) * n.y;
  const side = Math.abs(off) > KNEE_NOISE ? Math.sign(off) : (n.x * F >= 0 ? 1 : -1);
  return {knee: {x: hip.x + u.x * along + n.x * out * side, y: hip.y + u.y * along + n.y * out * side}, ankle: reached, short: Math.abs(d - reach)};
}

/** How far the figure is turned from us (0 facing us … 1 side on), from how wide its shoulders look against `frontal`. */
export const turnOf = (j, frontal) => Math.max(0, Math.min(1, 1 - Math.abs(j.left_shoulder.x - j.right_shoulder.x) / frontal));
