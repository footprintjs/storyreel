/**
 * Motion copied from a video: a person filmed on a phone (walking, waving, jumping) moves a cartoon figure with
 * real human timing. 2D keypoints are enough for a 2D cartoon — no 3D body model, no licence on the motion.
 *
 *   const keypoints = JSON.parse(readFileSync('wave.pose.json', 'utf8'));   // tools/pose-from-video.py writes it
 *   const wave = await fromPose(keypoints, {x: 600, size: 420, start: 2});  // a motion source (pose.mjs)
 *   wave.poseAt(t)    → the pose a kit draws, with joint angles; wave.record → what was found and decided
 *
 * The conversion is a footprintjs flowchart, so every run explains itself — to a person or to a model:
 *
 *   read-keypoints  the JSON read and checked (mocap/keypoints.mjs); the clip trimmed (from, to); a point the
 *                   detector was unsure of (under minConfidence) dropped, and the dropout recorded
 *   fill-gaps       each run of missing frames, per joint, decided: bridged (short, seen both sides), held (short, at
 *                   an edge) or refused (longer than maxGap: the refusal names the joint and the frames)
 *   smooth          One Euro, forward and back (no lag), in torso lengths
 *   normalise       the hips' centre as the origin, one torso length as the unit, y up, mirrored if asked; which way
 *                   the figure faces, decided (asked, how it travels, where its nose points)
 *   joint-angles    torso, neck, shoulders, elbows, hips, knees; every track continuous (no jump by a turn)
 *   plant-feet      each still stretch of a foot, decided: planted (still long enough, on the floor), aloft (the top
 *                   of a jump) or passing; a planted foot locked to its spot, so it never slides; the legs re-solved
 *                   to the locked feet (two-bone IK, bent forward, the bones their own length)
 *   close-loop      played once (it holds its last frame), or looped: the seam measured with the feet — refused,
 *                   with the cut where they do meet, when a foot would slide there
 *   retime          video frames onto film seconds (start, speed)
 *   motion-source   the source: poseAt(t) draws straight between the two frames around t
 *
 * Each verdict carries decide()'s evidence (the facts, the rule, the thresholds) and a sentence that says why
 * (mocap/verdicts.mjs). The stages are in mocap/stages.mjs, the maths beside them. The tracks themselves never enter
 * the flowchart's scope; stages write small values about what they did.
 */
import {flowChart, narrative, FlowChartExecutor} from 'footprintjs';
import {readStage, fillStage, smoothStage, normaliseStage, anglesStage, plantStage, loopStage, retimeStage, sourceStage} from './mocap/stages.mjs';
import {motionSource, TORSO_SHARE} from './pose.mjs';

export {SCHEMES, SCHEME_NAMES, RIG_JOINTS} from './mocap/keypoints.mjs';

/**
 * The settings, each a strategy's number (seconds, or torso lengths: hips to shoulders, so they read the same at any
 * size of video). x and size have no default: where the figure stands, and how tall it is.
 */
export const MOCAP = Object.freeze({
  name: 'video',          // the source's name, in the record and the refusals
  minConfidence: .5,      // a point the detector is less sure of than this is not seen (a dropout)
  maxGap: .2,             // s: the longest run of missing frames filled in; a longer one refuses, naming its frames
  smooth: Object.freeze({minCutoff: 1.5, beta: .5, dCutoff: 1}),   // One Euro (Hz, per torso length a second, Hz); null: not smoothed
  stillSpeed: .6,         // torso lengths a second: a foot this slow is still
  minContact: .1,         // s: a foot still this long, on the floor, is planted
  floorBand: .15,         // torso lengths: a still foot this near the floor is on it
  blend: .1,              // s: either side of a contact, the foot eases onto its spot
  walkSpeed: .5,          // torso lengths a second: a body moving faster than this is walking
  frontal: .8,            // torso lengths: how wide the shoulders look when the person faces us (sets turn)
  mirror: false,          // flip it: x mirrored, left and right swapped
  facing: null,           // 1 or −1 to say which way it faces; null: decided from the clip
  from: null, to: null,   // s of the video: keep only this stretch (a gap outside it is not filled, nor refused)
  start: 0,               // film seconds: when the clip's first kept frame is shown
  speed: 1,               // 2 plays it twice as fast
  loop: false,            // true: it repeats, each time from where it left off (its last frame is the next repeat's first)
  seam: .05,              // torso lengths: looped, the feet must meet this near at the seam, or it refuses with a cut that does
});
const KEYS = ['x', 'size', ...Object.keys(MOCAP)];
const shown = v => (typeof v === 'number' ? String(v) : JSON.stringify(v) ?? String(v));
const isNumber = Number.isFinite;

/** The settings, checked before anything runs: unknown keys and wrong values refuse, naming the fix. */
function readMocapOptions(options = {}) {
  if (!options || typeof options !== 'object') throw new Error(`fromPose: the options are {x, size, …} (where the figure stands and how tall it is, px), not ${shown(options)}`);
  const stray = Object.keys(options).filter(k => !KEYS.includes(k));
  if (stray.length) throw new Error(`fromPose: unknown option${stray.length > 1 ? 's' : ''} ${stray.join(', ')}; the options are ${KEYS.join(', ')}`);
  const {smooth} = options;
  if (!(smooth === undefined || smooth === null || (typeof smooth === 'object' && !Array.isArray(smooth)))) throw new Error(`fromPose: smooth is {minCutoff?, beta?, dCutoff?} (One Euro; the rest as MOCAP.smooth) or null (not smoothed), not ${shown(smooth)}`);
  const o = {...MOCAP, ...options, smooth: options.smooth === null ? null : {...MOCAP.smooth, ...(options.smooth ?? {})}};
  const need = (ok, what) => { if (!ok) throw new Error(`fromPose: ${what}`); };
  need(isNumber(o.x), `x is where the figure stands on the floor at the clip's first frame (px), not ${shown(o.x)}`);
  need(isNumber(o.size) && o.size > 0, `size is the figure's standing height (px, above 0; one torso length is ${TORSO_SHARE} of it), not ${shown(o.size)}`);
  need(typeof o.name === 'string' && o.name.trim() !== '', `name is a word for the source (the record and the refusals use it), not ${shown(o.name)}`);
  need(o.minConfidence >= 0 && o.minConfidence <= 1, `minConfidence is 0..1 (a point the detector is less sure of is not seen), not ${shown(o.minConfidence)}`);
  for (const k of ['maxGap', 'floorBand', 'blend', 'seam']) need(isNumber(o[k]) && o[k] >= 0, `${k} is a number, 0 or more, not ${shown(o[k])}`);
  for (const k of ['stillSpeed', 'minContact', 'walkSpeed', 'frontal', 'speed']) need(isNumber(o[k]) && o[k] > 0, `${k} is a number above 0, not ${shown(o[k])}`);
  if (o.smooth) for (const k of ['minCutoff', 'dCutoff']) need(isNumber(o.smooth[k]) && o.smooth[k] > 0, `smooth.${k} is a cutoff in Hz, above 0 (or smooth: null for none), not ${shown(o.smooth[k])}`);
  if (o.smooth) need(isNumber(o.smooth.beta) && o.smooth.beta >= 0, `smooth.beta is 0 or more (how fast the cutoff rises with speed), not ${shown(o.smooth.beta)}`);
  need(isNumber(o.start), `start is film seconds, not ${shown(o.start)}`);
  for (const k of ['loop', 'mirror']) need(typeof o[k] === 'boolean', `${k} is true or false, not ${shown(o[k])}`);
  need(o.facing === null || o.facing === 1 || o.facing === -1, `facing is 1, -1, or null (decided from the clip), not ${shown(o.facing)}`);
  for (const k of ['from', 'to']) need(o[k] === null || isNumber(o[k]), `${k} is seconds of the video, or null, not ${shown(o[k])}`);
  return o;
}

/** The flowchart's logger: a refusal reaches the caller (and the record), so footprintjs does not print it again. */
const QUIET = Object.freeze({info() {}, log() {}, debug() {}, error() {}, warn: (...args) => console.warn(...args)});

/** The run's narrative without its live values (or keys left undefined), so the record is the same after JSON. */
const narrativeOf = trace => trace.getEntries().map(entry => Object.fromEntries(Object.entries(entry).filter(([key, value]) => key !== 'rawValue' && value !== undefined)));

/**
 * Motion from a video's keypoints (mocap/keypoints.mjs says the JSON) as a motion source (pose.mjs): {name,
 * poseAt(t), start, end, record}. Runs the conversion as a footprintjs flowchart; `record` keeps what it found and
 * decided — the dropouts, the gaps filled and how, the facing, the floor, the contacts, the timing — and the run's
 * narrative. A refusal carries the record so far as `error.record`.
 */
export async function fromPose(keypoints, options = {}) {
  const o = readMocapOptions(options), work = {}, record = {name: o.name};
  const stages = [
    ['read keypoints', 'read-keypoints', 'The keypoints read and checked; the clip trimmed; unsure points dropped', s => readStage(s, keypoints, o, work, record)],
    ['fill gaps', 'fill-gaps', 'Each kind of gap bridged, held or refused', s => fillStage(s, o, work, record)],
    ['smooth', 'smooth', 'One Euro, forward and back, in torso lengths', s => smoothStage(s, o, work, record)],
    ['normalise', 'normalise', 'Hips as the origin, torso lengths, y up; which way it faces', s => normaliseStage(s, o, work, record)],
    ['joint angles', 'joint-angles', 'Torso, neck, arms and legs, each track continuous', s => anglesStage(s, work, record)],
    ['plant feet', 'plant-feet', 'Contacts found; planted feet locked; the legs re-solved', s => plantStage(s, o, work, record)],
    ['close loop', 'close-loop', 'Played once, or looped where the feet meet at the seam', s => loopStage(s, o, work, record)],
    ['retime', 'retime', 'Video frames onto film seconds', s => retimeStage(s, o, work, record)],
    ['motion source', 'motion-source', 'poseAt(t), between the frames around t', s => sourceStage(s, o, work, record)],
  ];
  let chart = flowChart(stages[0][0], stages[0][3], stages[0][1], stages[0][2]);
  for (const [name, id, description, fn] of stages.slice(1)) chart = chart.addFunction(name, fn, id, description);
  const trace = narrative(), executor = new FlowChartExecutor(chart.setLogger(QUIET).build());
  executor.attachCombinedRecorder(trace);
  try { await executor.run(); } catch (error) {
    if (error && typeof error === 'object' && !('record' in error)) error.record = {...record, narrative: narrativeOf(trace)};
    throw error;
  }
  return motionSource({name: o.name, poseAt: work.poseAt, start: o.start, end: work.clock.end, record: {...record, narrative: narrativeOf(trace)}});
}
