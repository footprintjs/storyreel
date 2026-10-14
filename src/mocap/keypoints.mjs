/**
 * The keypoints a pose detector writes, read and checked: one JSON document for a clip (tools/pose-from-video.py
 * writes it from an mp4 with MediaPipe Pose; any COCO-17 detector's output fits it too).
 *
 *   {"scheme": "coco-17" | "mediapipe-33",
 *    "fps": 30,                                   the video's frames a second
 *    "coordinates": "pixels" | "normalised",      normalised: x and y are shares of the width and the height
 *    "width": 1280, "height": 720,                the video's size in px (needed for normalised coordinates)
 *    "frames": [ frame | null, … ],              null: nobody was found in that frame
 *    "unread": 74}                                optional: frames the video states that could not be read (damaged)
 *
 *   a frame   the scheme's points in its order ([[x, y, confidence], …]: 17 or 33 of them), or by name
 *             ({"nose": [x, y, confidence], …}: a name left out was not seen)
 *   a point   [x, y, confidence] (confidence 0..1, how sure the detector is), or null (not seen)
 *
 * Only the thirteen joints a figure is drawn from are read (RIG_JOINTS: the nose, shoulders, elbows, wrists, hips,
 * knees and ankles, named alike in both schemes); every point is checked. Pure functions: no file is read here.
 */
const COCO_17 = ['nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'];
const MEDIAPIPE_33 = ['nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner', 'right_eye', 'right_eye_outer', 'left_ear', 'right_ear',
  'mouth_left', 'mouth_right', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
  'left_index', 'right_index', 'left_thumb', 'right_thumb', 'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
  'left_heel', 'right_heel', 'left_foot_index', 'right_foot_index'];

/** The schemes read: each one's point names, in its order. */
export const SCHEMES = Object.freeze({'coco-17': Object.freeze(COCO_17), 'mediapipe-33': Object.freeze(MEDIAPIPE_33)});
export const SCHEME_NAMES = Object.freeze(Object.keys(SCHEMES));
/** The joints a figure is drawn from: named alike in both schemes. */
export const RIG_JOINTS = Object.freeze(['nose', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist',
  'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle']);
const COORDINATES = ['pixels', 'normalised', 'normalized'];
const DOC = '{scheme, fps, coordinates, width?, height?, frames} (the JSON tools/pose-from-video.py writes)';

const shown = v => (typeof v === 'number' ? String(v) : JSON.stringify(v) ?? String(v));
const positive = v => Number.isFinite(v) && v > 0;

/** The document's header, checked: {scheme, names, fps, normalised, width, height}. */
function readHeader(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error(`keypoints: the document is ${DOC}, not ${shown(doc)}`);
  if (!Object.hasOwn(SCHEMES, doc.scheme)) throw new Error(`keypoints: scheme ${shown(doc.scheme)} is not one we read; the schemes are ${SCHEME_NAMES.join(', ')} (name each frame's points as one of them)`);
  if (!positive(doc.fps)) throw new Error(`keypoints: fps is the video's frames a second (above 0), not ${shown(doc.fps)}`);
  if (!COORDINATES.includes(doc.coordinates)) throw new Error(`keypoints: coordinates is 'pixels' or 'normalised' (x and y as shares of the width and the height), not ${shown(doc.coordinates)}`);
  const normalised = doc.coordinates !== 'pixels';
  if (normalised && !(positive(doc.width) && positive(doc.height))) throw new Error(`keypoints: normalised coordinates need the video's width and height in px (x is a share of one, y of the other), so the figure keeps its proportions; give width and height, not ${shown(doc.width)} × ${shown(doc.height)}`);
  if (doc.unread !== undefined && !(Number.isInteger(doc.unread) && doc.unread >= 0)) throw new Error(`keypoints: unread is how many frames the video states that could not be read (a whole number, 0 or more), not ${shown(doc.unread)}`);
  if (!Array.isArray(doc.frames) || doc.frames.length < 2) throw new Error(`keypoints: frames is a list of at least 2 frames (a frame's points, or null), not ${Array.isArray(doc.frames) ? `${doc.frames.length} frame` : shown(doc.frames)}`);
  return {scheme: doc.scheme, names: SCHEMES[doc.scheme], fps: doc.fps, unread: doc.unread ?? 0, normalised, width: normalised ? doc.width : doc.width ?? null, height: normalised ? doc.height : doc.height ?? null};
}

/** A point as given → {x, y, c} in px, or null when not seen; anything else refuses, naming the frame and the joint. */
function readPoint(p, k, name, h) {
  if (p === null || p === undefined) return null;
  const ok = Array.isArray(p) && p.length === 3 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]) && p[2] >= 0 && p[2] <= 1;
  if (!ok) throw new Error(`keypoints: frame ${k}, ${name}: a point is [x, y, confidence] (confidence 0..1) or null, not ${shown(p)}`);
  return {x: h.normalised ? p[0] * h.width : p[0], y: h.normalised ? p[1] * h.height : p[1], c: p[2]};
}

/** A frame as given → {name: point | null} for the rig's joints (every point is checked, read or not). */
function readFrame(frame, k, h) {
  if (frame === null) return null;
  let named;
  if (Array.isArray(frame)) {
    if (frame.length !== h.names.length) throw new Error(`keypoints: frame ${k} has ${frame.length} points; a ${h.scheme} frame has ${h.names.length}, in its order (or name them: {"nose": [x, y, confidence], …})`);
    named = Object.fromEntries(h.names.map((n, i) => [n, frame[i]]));
  } else if (frame && typeof frame === 'object') {
    const stray = Object.keys(frame).find(n => !h.names.includes(n));
    if (stray !== undefined) throw new Error(`keypoints: frame ${k} names "${stray}", which ${h.scheme} does not have (its points are ${h.names.join(', ')})`);
    named = frame;
  } else throw new Error(`keypoints: frame ${k} is a list of ${h.names.length} points, {name: point}, or null, not ${shown(frame)}`);
  const points = Object.fromEntries(Object.entries(named).map(([n, p]) => [n, readPoint(p, k, n, h)]));
  return Object.fromEntries(RIG_JOINTS.map(n => [n, points[n] ?? null]));
}

/** The frames kept: from and to are the video's seconds; the first and last frame numbers kept. */
function keptFrames(count, fps, from, to) {
  const last = (count - 1) / fps;
  const a = from ?? 0, b = to ?? last;
  if (!(Number.isFinite(a) && a >= 0 && Number.isFinite(b) && b <= last + 1e-9 && a < b)) {
    throw new Error(`fromPose: from and to are seconds of the video, 0 ≤ from < to ≤ ${+last.toFixed(3)} (its last frame), not from ${shown(from)}, to ${shown(to)}`);
  }
  // (A time within a thousandth of a frame of a frame is that frame: a cut written to a few decimals keeps its frames.)
  const first = Math.max(0, Math.ceil(a * fps - 1e-3)), end = Math.floor(b * fps + 1e-3);   // (max: never −0)
  if (end - first < 1) throw new Error(`fromPose: from ${a} s to ${b} s keeps ${end - first + 1} frame; keep at least 2 (a longer stretch)`);
  return {first, last: end};
}

/** Runs of true in a list of booleans: [[from, to]] (inclusive indices). */
export function runsOf(flags) {
  const out = []; let start = -1;
  flags.forEach((on, i) => { if (on && start < 0) start = i; if (!on && start >= 0) { out.push([start, i - 1]); start = -1; } });
  if (start >= 0) out.push([start, flags.length - 1]);
  return out;
}

/**
 * A joint's dropouts — runs of points the detector gave under minConfidence — summed up, so a flickering detector
 * adds one line, not one per flicker: {joint, runs, frames (in all), lowest (confidence), longest: [a, b]}.
 */
function dropoutsOf(joint, points, low, first) {
  const runs = runsOf(low);
  if (!runs.length) return null;
  let frames = 0, lowest = 1, longest = runs[0];
  for (const [a, b] of runs) {
    frames += b - a + 1;
    if (b - a > longest[1] - longest[0]) longest = [a, b];
    for (let i = a; i <= b; i++) if (points[i].c < lowest) lowest = points[i].c;
  }
  return {joint, runs: runs.length, frames, lowest, longest: [first + longest[0], first + longest[1]]};
}

/**
 * The keypoints, read: {scheme, fps, normalised, width, height, first, last, count, lo, hi, tracks, dropouts, empty}.
 *   first…last  the frames kept (from, to), count of them
 *   lo…hi       the frames read: the kept ones and up to `context` frames either side, where the video has them —
 *               the motion around a cut, so the cut's own frames are smoothed as they would be uncut
 *   tracks      {joint: [{x, y} | null]} in px, one entry per frame read (lo…hi); a point under minConfidence is null
 *   reported    {joint: [confidence | null]}: what the detector said of each point read (null: not reported), so a
 *               gap can tell a point it never found from one it found but was unsure of
 *   dropouts    one line per joint the detector was unsure of in the kept frames (dropoutsOf), in video frame numbers
 *   empty       how many kept frames found nobody
 */
export function readKeypoints(doc, {from = null, to = null, minConfidence = .5, context = 0} = {}) {
  const h = readHeader(doc), frames = doc.frames.map((f, k) => readFrame(f, k, h));
  const {first, last} = keptFrames(frames.length, h.fps, from, to), lo = Math.max(0, first - context), hi = Math.min(frames.length - 1, last + context);
  const read = frames.slice(lo, hi + 1), kept = frames.slice(first, last + 1), tracks = {}, reported = {}, dropouts = [];
  for (const joint of RIG_JOINTS) {
    const points = read.map(f => f?.[joint] ?? null), low = points.map(p => p !== null && p.c < minConfidence);
    tracks[joint] = points.map((p, i) => (p === null || low[i] ? null : {x: p.x, y: p.y}));
    reported[joint] = points.map(p => (p === null ? null : p.c));
    const summed = dropoutsOf(joint, points.slice(first - lo, last - lo + 1), low.slice(first - lo, last - lo + 1), first);
    if (summed) dropouts.push(summed);
  }
  return {scheme: h.scheme, fps: h.fps, unread: h.unread, normalised: h.normalised, width: h.width, height: h.height, first, last, count: kept.length, lo, hi, tracks, reported, dropouts, empty: kept.filter(f => f === null).length};
}
