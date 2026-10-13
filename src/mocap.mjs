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
 *                   to the locked feet (two-bone IK)
 *   retime          video frames onto film seconds (start, speed); played once (it holds its last frame) or looped
 *   motion-source   the source: poseAt(t) draws straight between the two frames around t
 *
 * Each verdict carries decide()'s evidence (the facts, the rule, the thresholds) and a sentence that says why.
 * The tracks themselves never enter the flowchart's scope; stages write small values about what they did.
 */
import {flowChart, decide, narrative, FlowChartExecutor} from 'footprintjs';
import {readKeypoints, RIG_JOINTS} from './mocap/keypoints.mjs';
import {gapsOf, fillGap, smoothTrack, median} from './mocap/tracks.mjs';
import {SIDES, torsoLength, toRig, bodyTracks, armTracks, legTracks, legLengths, solveKnee, turnOf, wrapAngle} from './mocap/rig.mjs';
import {absolute, floorOf, slowRuns, lockFoot} from './mocap/feet.mjs';
import {clipClock, poseBetween} from './mocap/clip.mjs';
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
  loop: false,            // true: it repeats, each time from where it left off
});
const KEYS = ['x', 'size', ...Object.keys(MOCAP)];
/** Half the angle between the arms (radians) that counts as a whole swing (pose.swing ±1). */
const SWING = .6;
const FOOT = ['left', 'right'];

const shown = v => (typeof v === 'number' ? String(v) : JSON.stringify(v) ?? String(v));
const round = (v, places = 3) => +v.toFixed(places);
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
  for (const k of ['maxGap', 'floorBand', 'blend']) need(isNumber(o[k]) && o[k] >= 0, `${k} is a number, 0 or more, not ${shown(o[k])}`);
  for (const k of ['stillSpeed', 'minContact', 'walkSpeed', 'frontal', 'speed']) need(isNumber(o[k]) && o[k] > 0, `${k} is a number above 0, not ${shown(o[k])}`);
  if (o.smooth) for (const k of ['minCutoff', 'dCutoff']) need(isNumber(o.smooth[k]) && o.smooth[k] > 0, `smooth.${k} is a cutoff in Hz, above 0 (or smooth: null for none), not ${shown(o.smooth[k])}`);
  if (o.smooth) need(isNumber(o.smooth.beta) && o.smooth.beta >= 0, `smooth.beta is 0 or more (how fast the cutoff rises with speed), not ${shown(o.smooth.beta)}`);
  need(isNumber(o.start), `start is film seconds, not ${shown(o.start)}`);
  for (const k of ['loop', 'mirror']) need(typeof o[k] === 'boolean', `${k} is true or false, not ${shown(o[k])}`);
  need(o.facing === null || o.facing === 1 || o.facing === -1, `facing is 1, -1, or null (decided from the clip), not ${shown(o.facing)}`);
  for (const k of ['from', 'to']) need(o[k] === null || isNumber(o[k]), `${k} is seconds of the video, or null, not ${shown(o[k])}`);
  return o;
}

// ——— Verdicts: decide() in the open ———

const OPS = {lte: '≤', lt: '<', gte: '≥', gt: '>', eq: '=', ne: '≠', in: 'in', notIn: 'not in'};
const conditionText = c => `${c.key} ${c.actualSummary} ${OPS[c.op] ?? c.op} ${JSON.stringify(c.threshold)} ${c.result ? '✓' : '✗'}`;

/** decide()'s evidence as a sentence: the rule that matched and its conditions, or why none did. */
function because(evidence) {
  const hit = evidence.rules.find(r => r.matched);
  if (hit) return `${hit.label}: ${(hit.conditions ?? []).map(conditionText).join(', ')}`;
  const missed = [...new Set(evidence.rules.map(r => (r.conditions ?? []).find(c => !c.result)).filter(Boolean).map(conditionText))];
  return `${evidence.defaultLabel ?? evidence.default}${missed.length ? ` (${missed.join('; ')})` : ''}`;
}

/**
 * What a stage found, written to the scope (the run's record) and to the source's record as the same plain values.
 * The source's record never reads the scope back: what a scope hands out is the stage's own, and lives with it.
 */
function report(s, record, found) {
  for (const [key, value] of Object.entries(found)) { s[key] = value; record[key] = value; }
}

/** The facts written to the scope (so the record has them), then decide() over them: {branch, why, evidence}. */
function verdict(s, facts, rules, fallback) {
  for (const [key, value] of Object.entries(facts)) s[key] = value;
  const d = decide(s, rules, fallback);
  return {branch: d.branch, why: because(d.evidence), evidence: d.evidence};
}

const GAP_RULES = maxGap => [
  {when: {gapSeconds: {lte: maxGap}, gapEdge: {eq: 'inside'}}, then: 'bridge', label: 'short, and seen on both sides: drawn straight across'},
  {when: {gapSeconds: {lte: maxGap}, gapEdge: {in: ['start', 'end']}}, then: 'hold', label: 'short, at an edge of the clip: held at the nearest point seen'},
];
const GAP_DEFAULT = {branch: 'refuse', label: 'longer than maxGap, or never seen: too long to guess'};
const FACING_RULES = [
  {when: {facingAsked: {eq: 1}}, then: 'right', label: 'asked to face right (+x)'},
  {when: {facingAsked: {eq: -1}}, then: 'left', label: 'asked to face left (−x)'},
  {when: {travel: {gte: .5}}, then: 'right', label: 'it travels right'},
  {when: {travel: {lte: -.5}}, then: 'left', label: 'it travels left'},
  {when: {noseAhead: {gte: .1}}, then: 'right', label: 'its nose points right'},
  {when: {noseAhead: {lte: -.1}}, then: 'left', label: 'its nose points left'},
];
const FACING_DEFAULT = {branch: 'right', label: 'it neither travels nor turns its head: facing right, as a figure is drawn'};
const CONTACT_RULES = o => [
  {when: {stillSeconds: {gte: o.minContact}, overFloor: {lte: o.floorBand}}, then: 'planted', label: 'still long enough, on the floor: planted'},
  {when: {stillSeconds: {gte: o.minContact}}, then: 'aloft', label: 'still long enough, but off the floor (the top of a jump): not planted'},
];
const CONTACT_DEFAULT = {branch: 'passing', label: 'slow too briefly to be a step: not planted'};
const END_RULES = [{when: {loop: {eq: true}}, then: 'repeat', label: 'asked to loop: it repeats, each time from where it left off'}];
const END_DEFAULT = {branch: 'hold', label: 'played once: it holds its last frame'};

/** Gaps over the same frames, as one: {frames, edge, missing, seconds, joints} (a person out of view loses every joint at once). */
function byFrames(gaps) {
  const groups = new Map();
  for (const g of gaps) {
    const key = `${g.frames}|${g.edge}`;
    if (!groups.has(key)) groups.set(key, {frames: g.frames, edge: g.edge, missing: g.missing, seconds: g.seconds, joints: []});
    groups.get(key).joints.push(g.joint);
  }
  return [...groups.values()];
}

/** The refusal for gaps too long to fill: the joints and their frames, and the fixes. */
function gapRefusal(refused, o) {
  const who = joints => (joints.length === RIG_JOINTS.length ? 'every joint (nobody in view) is' : `${joints.join(', ')} ${joints.length > 1 ? 'are' : 'is'}`);
  const one = g => (g.edge === 'whole' ? `${who(g.joints)} never seen (frames ${g.frames[0]}–${g.frames[1]})` : `${who(g.joints)} missing in frames ${g.frames[0]}–${g.frames[1]} (${g.missing} frames, ${g.seconds} s)`);
  const groups = byFrames(refused), named = groups.slice(0, 6).map(one).join('; ') + (groups.length > 6 ? `; and ${groups.length - 6} more` : '');
  return new Error(`fromPose "${o.name}": ${refused.length} gap${refused.length > 1 ? 's are' : ' is'} too long to fill: ${named}. At most ${o.maxGap} s (maxGap) is filled in: trim the clip past ${refused.length > 1 ? 'them' : 'it'} (from, to: seconds of the video), film it again with the whole body in view, or raise maxGap`);
}

// ——— The stages: each reads what came before from `work`, and writes what it did to the scope and the record ———

function readStage(s, keypoints, o, work, record) {
  const k = readKeypoints(keypoints, {from: o.from, to: o.to, minConfidence: o.minConfidence});
  Object.assign(work, {read: k, tracks: k.tracks});
  report(s, record, {scheme: k.scheme, fps: k.fps, coordinates: k.normalised ? 'normalised' : 'pixels',
    kept: {frames: [k.first, k.last], count: k.count, seconds: round((k.count - 1) / k.fps)}, nobody: k.empty, dropouts: k.dropouts});
}

function fillStage(s, o, work, record) {
  const {read: k, tracks} = work, filled = [], refused = [];
  s.maxGap = o.maxGap;
  for (const joint of RIG_JOINTS) for (const gap of gapsOf(tracks[joint])) {
    const missing = gap.to - gap.from + 1, seconds = round(missing / k.fps);
    const v = verdict(s, {gapJoint: joint, gapSeconds: seconds, gapEdge: gap.edge}, GAP_RULES(o.maxGap), GAP_DEFAULT);
    const entry = {joint, frames: [k.first + gap.from, k.first + gap.to], missing, seconds, edge: gap.edge, how: v.branch, why: v.why, evidence: v.evidence};
    if (v.branch === 'refuse') { refused.push(entry); continue; }
    tracks[joint] = fillGap(tracks[joint], gap, v.branch);
    filled.push(entry);
  }
  report(s, record, {gaps: filled});
  if (refused.length) { report(s, record, {refused}); throw gapRefusal(refused, o); }
}

function smoothStage(s, o, work, record) {
  const torso = torsoLength(work.tracks);
  if (!(torso > 0)) throw new Error(`fromPose "${o.name}": the hips and the shoulders are in one place in this clip (a torso of 0 px): film the person upright and in view`);
  work.torso = torso;
  if (o.smooth) for (const joint of RIG_JOINTS) work.tracks[joint] = smoothTrack(work.tracks[joint], work.read.fps, torso, o.smooth);
  report(s, record, {torso: round(torso, 1), smoothing: o.smooth ? {filter: 'One Euro, forward and back', ...o.smooth} : 'off'});
}

function normaliseStage(s, o, work, record) {
  const rig = toRig(work.tracks, work.torso, {mirror: o.mirror}), n = rig.root.length;
  work.rig = rig;
  const travel = rig.root[n - 1].x - rig.root[0].x;
  const noseAhead = rig.joints.reduce((sum, j) => sum + j.nose.x - (j.left_shoulder.x + j.right_shoulder.x) / 2, 0) / n;
  const v = verdict(s, {facingAsked: o.facing ?? 0, travel: round(travel), noseAhead: round(noseAhead)}, FACING_RULES, FACING_DEFAULT);
  work.facing = v.branch === 'left' ? -1 : 1;
  report(s, record, {mirror: o.mirror, facing: {facing: work.facing, how: v.branch, why: v.why, evidence: v.evidence}});
}

function anglesStage(s, work, record) {
  const {joints} = work.rig, F = work.facing, body = bodyTracks(joints, F);
  work.angles = {body, arms: armTracks(joints, body.torso, F), legs: legTracks(joints, body.torso, F)};
  const range = track => [round(Math.min(...track), 2), round(Math.max(...track), 2)];
  report(s, record, {angles: {torso: range(body.torso), neck: range(body.neck),
    ...Object.fromEntries(SIDES.flatMap((side, j) => [[`${side}shoulder`, range(work.angles.arms[j].shoulder)], [`${side}elbow`, range(work.angles.arms[j].elbow)]]))}});
}

/** A foot's still stretches, each decided: the planted ones (frame indices) and every entry for the record. */
function footVerdicts(s, o, work, j, track, floor) {
  const {fps, first} = work.read, planted = [], entries = [];
  // A move shorter than minContact between two still stretches is a blip, not a step: they are one stretch.
  const join = Math.max(0, Math.round(o.minContact * fps) - 1);
  for (const run of slowRuns(track, fps, o.stillSpeed, floor, join)) {
    const v = verdict(s, {foot: FOOT[j], stillSeconds: round(run.seconds), overFloor: round(run.height)}, CONTACT_RULES(o), CONTACT_DEFAULT);
    entries.push({foot: FOOT[j], frames: [first + run.from, first + run.to], lasts: round(run.seconds), overFloor: round(run.height), ...(run.blips ? {blips: run.blips} : {}), how: v.branch, why: v.why, evidence: v.evidence});
    if (v.branch === 'planted') planted.push(run);
  }
  return {planted, entries};
}

/** The legs re-solved where a locked foot moved its ankle: the knee by two-bone IK; how many frames fell short. */
function resolveLegs(work, locked) {
  const {root, joints} = work.rig, short = [];
  SIDES.forEach((side, j) => {
    const lengths = legLengths(joints, side);
    locked[j].weight.forEach((w, f) => {
      if (w === 0) return;
      const jt = joints[f], ankle = {x: locked[j].track[f].x - root[f].x, y: locked[j].track[f].y - root[f].y};
      const solved = solveKnee(jt[`${side}hip`], ankle, jt[`${side}knee`], lengths);
      jt[`${side}knee`] = solved.knee; jt[`${side}ankle`] = ankle;
      if (solved.short > 1e-6) short.push(solved.short);
    });
  });
  work.angles.legs = legTracks(joints, work.angles.body.torso, work.facing);
  return short;
}

/** How high the hips are when standing: over the frames with both feet planted, else one, else every frame. */
function standingHeight(work, locked, floor) {
  const n = work.rig.root.length, frames = Array.from({length: n}, (_, f) => f);
  const both = frames.filter(f => locked.every(l => l.weight[f] === 1)), one = frames.filter(f => locked.some(l => l.weight[f] === 1));
  const [basis, from] = both.length ? [both, 'both feet planted'] : one.length ? [one, 'one foot planted'] : [frames, 'every frame (no foot was planted)'];
  return {height: median(basis.map(f => work.rig.root[f].y - floor)), from, frames: basis.length};
}

function plantStage(s, o, work, record) {
  const {root, joints} = work.rig, fps = work.read.fps;
  const ankles = SIDES.map(side => absolute(root, joints, `${side}ankle`)), floor = floorOf(ankles);
  report(s, record, {floor: round(floor)});
  const decided = ankles.map((track, j) => footVerdicts(s, o, work, j, track, floor));
  const locked = ankles.map((track, j) => lockFoot(track, decided[j].planted, floor, Math.round(o.blend * fps)));
  const contacts = decided.flatMap((d, j) => d.entries.filter(e => e.how === 'planted').map((e, i) => ({...e, spot: round(locked[j].spots[i].x)})));
  contacts.sort((a, b) => a.frames[0] - b.frames[0] || FOOT.indexOf(a.foot) - FOOT.indexOf(b.foot));
  const short = resolveLegs(work, locked), standing = standingHeight(work, locked, floor);
  Object.assign(work, {feet: locked.map(l => l.track), floor, standing: standing.height});
  report(s, record, {contacts, notPlanted: decided.flatMap(d => d.entries.filter(e => e.how !== 'planted')),
    standing: {...standing, height: round(standing.height)}, reach: {frames: short.length, most: round(Math.max(0, ...short))}});
}

/** How far the body's pose at the clip's end is from its pose at the start (torso lengths): a loop's seam. */
function seamOf({root, joints}) {
  const a = joints[0], b = joints.at(-1);
  return Math.max(Math.abs(root.at(-1).y - root[0].y), ...Object.keys(a).map(n => Math.hypot(b[n].x - a[n].x, b[n].y - a[n].y)));
}

function retimeStage(s, o, work, record) {
  const {count, fps, first} = work.read, {root} = work.rig;
  const clock = clipClock({count, fps, start: o.start, speed: o.speed, loop: o.loop});
  const v = verdict(s, {loop: o.loop}, END_RULES, END_DEFAULT);
  // A loop carries the body on by the clip's travel plus one frame's mean step, so the seam is one more step.
  work.travel = o.loop ? (root[count - 1].x - root[0].x) * count / (count - 1) : 0;
  work.clock = clock;
  const film = frame => round(o.start + (frame - first) / (fps * o.speed));
  report(s, record, {contacts: record.contacts.map(c => ({...c, film: c.frames.map(film)})),
    timing: {start: o.start, speed: o.speed, pass: round(clock.pass), end: o.loop ? null : round(clock.end), after: v.branch, why: v.why, evidence: v.evidence,
      ...(o.loop ? {period: round(clock.period), travel: round(work.travel), seam: round(seamOf(work.rig))} : {})}});
}

/** One frame of the clip as the pose needs it, in torso lengths (the source scales it to px). */
function frameOf(work, o, f) {
  const {root, joints} = work.rig, {body, arms, legs} = work.angles, fps = work.read.fps, last = root.length - 1;
  const step = Math.abs(root[Math.min(last, f + 1)].x - root[Math.max(0, f - 1)].x) / ((Math.min(last, f + 1) - Math.max(0, f - 1)) / fps);
  return {
    x: root[f].x, lift: root[f].y - work.floor - work.standing,
    feet: work.feet.map(t => ({x: t[f].x, lift: Math.max(0, t[f].y - work.floor)})),
    swing: Math.max(-1, Math.min(1, wrapAngle(arms[1].shoulder[f] - arms[0].shoulder[f]) / (2 * SWING))),
    turn: turnOf(joints[f], o.frontal), walking: step > o.walkSpeed,
    joints: {torso: body.torso[f], neck: body.neck[f], arms: arms.map(a => ({shoulder: a.shoulder[f], elbow: a.elbow[f]})), legs: legs.map(l => ({hip: l.hip[f], knee: l.knee[f]}))},
  };
}

function sourceStage(s, o, work, record) {
  const frames = work.rig.root.map((_, f) => frameOf(work, o, f)), clock = work.clock;
  const place = {x: o.x, unit: o.size * TORSO_SHARE, facing: work.facing, travel: work.travel};
  work.poseAt = t => {
    if (!isNumber(t)) throw new Error(`${o.name}: poseAt(t) takes seconds, not ${shown(t)}`);
    const c = clock.at(t);
    return poseBetween(frames[c.a], frames[c.b], c, place);
  };
  report(s, record, {source: {name: o.name, start: o.start, end: o.loop ? null : round(clock.end), frames: frames.length, unit: round(place.unit, 2)}});
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
    ['fill gaps', 'fill-gaps', 'Each gap bridged, held or refused', s => fillStage(s, o, work, record)],
    ['smooth', 'smooth', 'One Euro, forward and back, in torso lengths', s => smoothStage(s, o, work, record)],
    ['normalise', 'normalise', 'Hips as the origin, torso lengths, y up; which way it faces', s => normaliseStage(s, o, work, record)],
    ['joint angles', 'joint-angles', 'Torso, neck, arms and legs, each track continuous', s => anglesStage(s, work, record)],
    ['plant feet', 'plant-feet', 'Contacts found; planted feet locked; the legs re-solved', s => plantStage(s, o, work, record)],
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
