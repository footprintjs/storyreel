/**
 * A motion source: one shape for everything that moves a figure — a planned walk, motion copied from a video, one of
 * your own. A source is `{name, poseAt(t)}`: a name the record and the refusals use, and the pose at t (film
 * seconds), a pure function of time like every frame. A kit draws from the pose and never asks where it came from,
 * so the same figure walks a planned walk in one scene and moves as a filmed child in the next.
 *
 * The pose is the one the kits already draw (walk.mjs · walk's `at(t)`), in the world's px:
 *
 *   {x, lift, lean, feet: [{x, lift}, {x, lift}], swing, turn, facing, walking, phase, joints?}
 *     x        the body's place on the floor (its hips); lift: how far it rises (+) or sinks (−) from standing
 *     lean     radians, + toward the way it faces; feet: each foot's place on the floor and its height off it
 *     swing    −1…1: + while the arm on feet[1]'s side is forward
 *     turn     0 facing us … 1 turned along the way; facing: 1 (toward +x) or −1; walking: moving across the floor
 *     phase    where in its motion the source is, by the source's own names (a walk: before | set off | step |
 *              settle | after; a clip: before | clip | after)
 *     joints   optional: angles a kit may bend a figure by, radians, in the figure's own frame (+ forward, the way it
 *              faces: a kit draws them under scale(facing, 1)). arms[j] and legs[j] are on feet[j]'s side.
 *                torso     the hips-to-shoulders line from upright (the same number as lean)
 *                neck      the head (shoulders to nose) from the torso's line
 *                shoulder  the upper arm from hanging along the torso (0); + swung forward, ±π overhead
 *                elbow     the forearm from the upper arm's line (0: straight)
 *                hip       the thigh from the torso's line, downward (0: standing)
 *                knee      the shin from the thigh's line (0: straight; − as the knee bends and the shin swings back)
 *              A kit that draws its legs to the feet (its adapter) can leave them; a source without them (a walk)
 *              leaves them out.
 */
import {walk} from './walk.mjs';

/** The keys every pose has (joints is optional). */
export const POSE_KEYS = Object.freeze(['x', 'lift', 'lean', 'feet', 'swing', 'turn', 'facing', 'walking', 'phase']);

/**
 * A figure's torso (hips to shoulders) is this share of its standing height: the unit a source measured in torso
 * lengths (mocap.mjs · fromPose) is drawn at, and the one a kit that bends limbs by `joints` can size them by.
 */
export const TORSO_SHARE = .3;

/** A value as a message shows it: a number as itself (NaN, Infinity), anything else as JSON. */
const shown = v => (typeof v === 'number' ? String(v) : JSON.stringify(v) ?? String(v));

/**
 * A motion source, checked: a name (a non-empty string) and poseAt (a function of t). Anything else the source
 * carries (when it starts and ends, its record) is kept. Returns the source, frozen.
 */
export function motionSource(source) {
  if (!source || typeof source !== 'object') throw new Error(`a motion source is {name, poseAt(t)}, not ${shown(source)}`);
  if (!(typeof source.name === 'string' && source.name.trim())) throw new Error(`a motion source needs a name (a word the record and the refusals use), not ${shown(source.name)}`);
  if (typeof source.poseAt !== 'function') throw new Error(`the motion source "${source.name}" needs poseAt(t): the pose at t seconds (pose.mjs · POSE_KEYS)`);
  return Object.freeze({...source});
}

/**
 * The walk as a motion source (walk.mjs · walk, which is unchanged): a planned walk, or walk's own options
 * ({from, to, start, size, style?, seconds?}) to plan one. The source keeps the walk's start and end.
 */
export function walkSource(plan) {
  const w = plan && typeof plan.at === 'function' ? plan : walk(plan ?? {});
  return motionSource({name: 'walk', poseAt: t => w.at(t), start: w.start, end: w.end});
}

const isNumber = Number.isFinite;
const PLACE = [['x', 'px'], ['lift', 'px']];

/** Every refusal a pose earns: '<key> is <what it should be>, not <value>'. */
function poseProblems(pose) {
  if (!pose || typeof pose !== 'object') return [`a pose is {${POSE_KEYS.join(', ')}, joints?}, not ${shown(pose)}`];
  const out = [];
  for (const [key, what] of [...PLACE, ['lean', 'radians'], ['swing', '−1…1'], ['turn', '0…1']]) if (!isNumber(pose[key])) out.push(`${key} is a number (${what}), not ${shown(pose[key])}`);
  if (!Array.isArray(pose.feet) || pose.feet.length !== 2) out.push(`feet is [{x, lift}, {x, lift}], not ${shown(pose.feet)}`);
  else pose.feet.forEach((f, j) => { for (const [key] of PLACE) if (!isNumber(f?.[key])) out.push(`feet[${j}].${key} is a number (px), not ${shown(f?.[key])}`); });
  if (pose.facing !== 1 && pose.facing !== -1) out.push(`facing is 1 or -1, not ${shown(pose.facing)}`);
  if (typeof pose.walking !== 'boolean') out.push(`walking is true or false, not ${shown(pose.walking)}`);
  if (typeof pose.phase !== 'string') out.push(`phase is the source's name for where it is, not ${shown(pose.phase)}`);
  if (pose.joints !== undefined) out.push(...jointProblems(pose.joints));
  return out;
}

function jointProblems(j) {
  if (!j || typeof j !== 'object') return [`joints is {torso, neck, arms, legs}, not ${shown(j)}`];
  const out = [];
  for (const key of ['torso', 'neck']) if (!isNumber(j[key])) out.push(`joints.${key} is a number (radians), not ${shown(j[key])}`);
  for (const [limb, parts] of [['arms', ['shoulder', 'elbow']], ['legs', ['hip', 'knee']]]) {
    if (!Array.isArray(j[limb]) || j[limb].length !== 2) { out.push(`joints.${limb} is [{${parts.join(', ')}}, {${parts.join(', ')}}], not ${shown(j[limb])}`); continue; }
    j[limb].forEach((one, i) => { for (const p of parts) if (!isNumber(one?.[p])) out.push(`joints.${limb}[${i}].${p} is a number (radians), not ${shown(one?.[p])}`); });
  }
  return out;
}

/** A pose, checked: it is returned as it is, or the refusal names every key that is wrong. `where` names it. */
export function checkPose(pose, where = 'pose') {
  const problems = poseProblems(pose);
  if (problems.length) throw new Error(`${where}: ${problems.join('; ')}`);
  return pose;
}
