/**
 * The conversion's stages, in the order mocap.mjs · fromPose runs them as a footprintjs flowchart. Each reads what
 * came before from `work` (the tracks: heavy, never in the scope), does its part with the pure functions beside it,
 * and reports what it did — small values — to the scope and to the source's record (verdicts.mjs · report).
 */
import {readKeypoints, runsOf, RIG_JOINTS} from './keypoints.mjs';
import {gapsOf, fillGap, smoothTrack, median, least, most} from './tracks.mjs';
import {SIDES, torsoLength, toRig, bodyTracks, armTracks, legTracks, legLengths, solveKnee, turnOf, wrapAngle} from './rig.mjs';
import {absolute, floorOf, slowRuns, spotsOf, lockFoot} from './feet.mjs';
import {footSlides, bestCut} from './seam.mjs';
import {PAIRS, pairMoves, trade} from './swaps.mjs';
import {clipClock, poseBetween} from './clip.mjs';
import {TORSO_SHARE} from '../pose.mjs';
import {report, verdict, SWAP_GAIN, SWAP_RULES, SWAP_DEFAULT, GAP_RULES, GAP_DEFAULT, FACING_RULES, FACING_DEFAULT, CONTACT_RULES, CONTACT_DEFAULT, LOOP_RULES, LOOP_DEFAULT, gapRefusal, loopRefusal} from './verdicts.mjs';

/** Half the angle between the arms (radians) that counts as a whole swing (pose.swing ±1). */
const SWING = .6;
/** Torso lengths: a planted foot out of its leg's reach by less than this is noise, not a stretch. */
export const REACH_NOISE = .01;
const FOOT = ['left', 'right'];
const round = (v, places = 3) => +v.toFixed(places);
const shown = v => (typeof v === 'number' ? String(v) : JSON.stringify(v) ?? String(v));

/** Seconds of the video read either side of a cut, as its context (see readKeypoints): the smoothing's reach and more. */
const CONTEXT = .5;

export function readStage(s, keypoints, o, work, record) {
  const k = readKeypoints(keypoints, {from: o.from, to: o.to, minConfidence: o.minConfidence, context: Math.ceil(CONTEXT * keypoints?.fps || 0)});
  Object.assign(work, {read: k, tracks: k.tracks});
  report(s, record, {scheme: k.scheme, fps: k.fps, coordinates: k.normalised ? 'normalised' : 'pixels',
    kept: {frames: [k.first, k.last], count: k.count, seconds: round((k.count - 1) / k.fps), ...(k.lo < k.first || k.hi > k.last ? {context: [k.lo, k.hi]} : {})},
    nobody: k.empty, dropouts: k.dropouts});
}

/**
 * Left and right traded back where the detector swapped them (mocap/swaps.mjs). Frame by frame, each pair is held
 * against the last frame both were seen in (at most a fifth of a second before). A frame where trading would move it
 * at least SWAP_GAIN less is decided — trading by less is the detector's noise, never a verdict — and where trading
 * moves it at most half as far, it is traded back, so the next frame is held against the repaired one. The record
 * keeps, for each pair, the frames traded (video frame numbers) with each verdict, and how many it decided to keep.
 */
export function swapStage(s, o, work, record) {
  const {read: k, tracks} = work, scale = torsoLength(tracks), reach = Math.max(1, Math.round(.2 * k.fps)), swaps = [];
  if (!(scale > 0)) { report(s, record, {swaps}); return; }   // (no torso seen: the smoothing refuses the clip, naming it)
  for (const pair of PAIRS) {
    const [L, R] = [tracks[`left_${pair}`], tracks[`right_${pair}`]], traded = L.map(() => false), verdicts = [];
    let ref = -1, kept = 0;
    for (let f = 0; f < L.length; f++) {
      if (!L[f] || !R[f]) continue;
      const moves = ref >= 0 && f - ref <= reach ? pairMoves(L, R, ref, f, scale) : null;
      ref = f;
      if (!moves || !(moves.keep - moves.swap >= SWAP_GAIN)) continue;
      const [keep, swap] = [round(moves.keep), round(moves.swap)];
      const v = verdict(s, {swapPair: pair, keepMoves: keep, swapMoves: swap, swapGain: round(moves.keep - moves.swap), swapShare: round(moves.swap / moves.keep)}, SWAP_RULES, SWAP_DEFAULT);
      if (v.how !== 'swap') { kept++; continue; }
      trade(tracks, k.reported, pair, f); traded[f] = true;
      verdicts.push({frame: k.lo + f, keepMoves: keep, swapMoves: swap, why: v.why, evidence: v.evidence});
    }
    if (verdicts.length || kept) swaps.push({pair, frames: runsOf(traded).map(([a, b]) => [k.lo + a, k.lo + b]), traded: verdicts.length, kept, verdicts});
  }
  report(s, record, {swaps});
}

/** A gap wholly in the context around a cut is filled for the smoothing's sake, never decided: it is not shown. */
const contextOnly = (gap, k) => gap.to < k.first - k.lo || gap.from > k.last - k.lo;

/**
 * What made a gap: points never found (missing), points reported under minConfidence (unsure), or both (mixed) —
 * with how many were reported, and at what confidence.
 */
function whyMissing(reported, gap) {
  let unsure = 0, low = 1, high = 0;
  for (let i = gap.from; i <= gap.to; i++) {
    const c = reported[i];
    if (c === null) continue;
    unsure++; low = Math.min(low, c); high = Math.max(high, c);
  }
  const kind = unsure === 0 ? 'missing' : unsure === gap.to - gap.from + 1 ? 'unsure' : 'mixed';
  return {kind, unsure, ...(unsure ? {low: round(low), high: round(high)} : {})};
}

/** The frames of a gap that are kept, when it reaches past a cut (null when all of it is kept). */
function keptPart([a, b], k) {
  const [from, to] = [Math.max(a, k.first), Math.min(b, k.last)];
  return from === a && to === b ? null : [from, to];
}

/**
 * Each gap decided and filled. One verdict per kind of gap — its length and where it lies are what decide it — so a
 * flickering detector adds places to a verdict (`at`), not verdicts to the record. A gap that reaches into the kept
 * frames is decided by its whole length.
 */
export function fillStage(s, o, work, record) {
  const {read: k, tracks} = work, kinds = new Map(), refused = [];
  for (const joint of RIG_JOINTS) for (const gap of gapsOf(tracks[joint])) {
    if (contextOnly(gap, k)) { tracks[joint] = fillGap(tracks[joint], gap, gap.edge === 'inside' ? 'bridge' : 'hold'); continue; }
    const missing = gap.to - gap.from + 1, seconds = round(missing / k.fps), key = `${missing}|${gap.edge}`, frames = [k.lo + gap.from, k.lo + gap.to];
    if (!kinds.has(key)) {
      const v = verdict(s, {gapSeconds: seconds, gapEdge: gap.edge}, GAP_RULES(o.maxGap), GAP_DEFAULT);
      kinds.set(key, {how: v.how, edge: gap.edge, missing, seconds, why: v.why, evidence: v.evidence, at: []});
    }
    const kind = kinds.get(key), why = whyMissing(k.reported[joint], gap), kept = keptPart(frames, k);
    kind.at.push({joint, frames, ...(why.unsure ? {unsure: why.unsure} : {}), ...(kept ? {kept} : {})});
    if (kind.how === 'refuse') refused.push({joint, frames, ...(kept ? {kept} : {}), edge: gap.edge, missing, seconds, ...why});
    else tracks[joint] = fillGap(tracks[joint], gap, kind.how);
  }
  const all = [...kinds.values()];
  report(s, record, {gaps: all.filter(g => g.how !== 'refuse')});
  if (refused.length) { report(s, record, {refused: all.filter(g => g.how === 'refuse')}); throw gapRefusal(refused, o); }
}

export function smoothStage(s, o, work, record) {
  const torso = torsoLength(work.tracks);
  if (!(torso > 0)) throw new Error(`fromPose "${o.name}": the hips and the shoulders are in one place in this clip (a torso of 0 px): film the person upright and in view`);
  work.torso = torso;
  // Smoothed with the context around a cut, then cut: the kept frames move as they would in the whole video.
  const {first, lo, count} = work.read;
  for (const joint of RIG_JOINTS) {
    const track = o.smooth ? smoothTrack(work.tracks[joint], work.read.fps, torso, o.smooth) : work.tracks[joint];
    work.tracks[joint] = track.slice(first - lo, first - lo + count);
  }
  report(s, record, {torso: round(torso, 1), smoothing: o.smooth ? {filter: 'One Euro, forward and back, ends reflected', ...o.smooth} : 'off'});
}

export function normaliseStage(s, o, work, record) {
  const rig = toRig(work.tracks, work.torso, {mirror: o.mirror}), n = rig.root.length;
  work.rig = rig;
  const travel = rig.root[n - 1].x - rig.root[0].x;
  let ahead = 0;
  for (const j of rig.joints) ahead += j.nose.x - (j.left_shoulder.x + j.right_shoulder.x) / 2;
  const v = verdict(s, {facingAsked: o.facing ?? 0, travel: round(travel), noseAhead: round(ahead / n)}, FACING_RULES, FACING_DEFAULT);
  work.facing = v.how === 'left' ? -1 : 1;
  report(s, record, {mirror: o.mirror, facing: {facing: work.facing, how: v.how, why: v.why, evidence: v.evidence}});
}

export function anglesStage(s, work, record) {
  const {joints} = work.rig, F = work.facing, body = bodyTracks(joints, F);
  work.angles = {body, arms: armTracks(joints, body.torso, F), legs: legTracks(joints, body.torso, F)};
  const range = track => [round(least(track), 2), round(most(track), 2)];
  report(s, record, {angles: {torso: range(body.torso), neck: range(body.neck),
    ...Object.fromEntries(SIDES.flatMap((side, j) => [[`${side}shoulder`, range(work.angles.arms[j].shoulder)], [`${side}elbow`, range(work.angles.arms[j].elbow)]]))}});
}

/** A foot's still stretches, each decided: the planted ones and every entry for the record. */
function footVerdicts(s, o, work, j, track, floor) {
  const {fps, first} = work.read, planted = [], entries = [];
  // A move shorter than minContact between two still stretches is a blip, not a step: they are one stretch.
  const join = Math.max(0, Math.round(o.minContact * fps) - 1);
  for (const run of slowRuns(track, fps, o.stillSpeed, floor, {join, loop: o.loop})) {
    const v = verdict(s, {foot: FOOT[j], stillSeconds: round(run.seconds), overFloor: round(run.height)}, CONTACT_RULES(o), CONTACT_DEFAULT);
    entries.push({foot: FOOT[j], frames: [first + run.from, first + run.to], ...(run.wraps ? {wraps: true} : {}), lasts: round(run.seconds), overFloor: round(run.height),
      ...(run.blips ? {blips: run.blips} : {}), how: v.how, why: v.why, evidence: v.evidence});
    if (v.how === 'planted') planted.push(run);
  }
  return {planted, entries};
}

/**
 * A looped clip's travel (torso lengths): the body's over the clip, whose last frame is the next repeat's first —
 * or none when a foot is planted through the whole clip (it never leaves the floor, so it holds the loop in place).
 */
function loopTravel(o, root, decided) {
  const n = root.length;
  if (!o.loop) return {travel: 0, held: false};
  const held = decided.some(d => d.planted.some(r => !r.wraps && r.from === 0 && r.to === n - 1));
  return {travel: held ? 0 : root[n - 1].x - root[0].x, held};
}

/**
 * The legs re-solved where a locked foot moved its ankle: the knee by two-bone IK, bent forward, the bones their
 * own length (rig.mjs · solveKnee). Returns how far each foot fell out of reach where it did (by more than
 * REACH_NOISE), frame by frame ([side][frame]: 0 within reach), and the bone lengths.
 */
function resolveLegs(work, locked) {
  const {root, joints} = work.rig, lengths = SIDES.map(side => legLengths(joints, side)), short = SIDES.map(() => root.map(() => 0));
  SIDES.forEach((side, j) => locked[j].weight.forEach((w, f) => {
    if (w === 0) return;
    const jt = joints[f], wanted = {x: locked[j].track[f].x - root[f].x, y: locked[j].track[f].y - root[f].y};
    const solved = solveKnee(jt[`${side}hip`], wanted, jt[`${side}knee`], lengths[j], work.facing);
    jt[`${side}knee`] = solved.knee; jt[`${side}ankle`] = solved.ankle;
    if (solved.short > REACH_NOISE) short[j][f] = solved.short;
  }));
  work.angles.legs = legTracks(joints, work.angles.body.torso, work.facing);
  return {short, lengths};
}

/** Where the feet fell out of reach: how many frames, by how much at most, and where ({foot, frames: [a, b]} runs). */
function reachOf(short, first) {
  const all = short.flat().filter(v => v > 0);
  return {frames: all.length, most: round(Math.max(0, most(all))),
    at: short.flatMap((track, j) => runsOf(track.map(v => v > 0)).map(([a, b]) => ({foot: FOOT[j], frames: [first + a, first + b]})))};
}

/** How high the hips are when standing: over the frames with both feet planted, else one, else every frame. */
function standingHeight(work, locked, floor) {
  const n = work.rig.root.length, frames = Array.from({length: n}, (_, f) => f);
  const both = frames.filter(f => locked.every(l => l.weight[f] === 1)), one = frames.filter(f => locked.some(l => l.weight[f] === 1));
  const [basis, from] = both.length ? [both, 'both feet planted'] : one.length ? [one, 'one foot planted'] : [frames, 'every frame (no foot was planted)'];
  return {height: median(basis.map(f => work.rig.root[f].y - floor)), from, frames: basis.length};
}

export function plantStage(s, o, work, record) {
  const {root, joints} = work.rig, fps = work.read.fps;
  const ankles = SIDES.map(side => absolute(root, joints, `${side}ankle`)), floor = floorOf(ankles);
  report(s, record, {floor: round(floor)});
  const decided = ankles.map((track, j) => footVerdicts(s, o, work, j, track, floor)), {travel, held} = loopTravel(o, root, decided);
  const spotted = decided.map((d, j) => d.planted.map(run => spotsOf(ankles[j], run, floor, travel)));
  const locked = ankles.map((track, j) => lockFoot(track, spotted[j].flat(), Math.round(o.blend * fps)));
  const contacts = decided.flatMap((d, j) => d.entries.filter(e => e.how === 'planted').map((e, i) => ({...e, spot: round(spotted[j][i][0].spot.x)})));
  contacts.sort((a, b) => a.frames[0] - b.frames[0] || FOOT.indexOf(a.foot) - FOOT.indexOf(b.foot));
  const {short, lengths} = resolveLegs(work, locked), standing = standingHeight(work, locked, floor);
  Object.assign(work, {ankles, feet: locked.map(l => l.track), floor, standing: standing.height, travel, held});
  report(s, record, {contacts, notPlanted: decided.flatMap(d => d.entries.filter(e => e.how !== 'planted')),
    standing: {...standing, height: round(standing.height)}, reach: reachOf(short, work.read.first),
    legs: lengths.map(l => ({thigh: round(l.thigh), shin: round(l.shin)}))});
}

/** Every angle track, as the pose nests them: {torso, neck, arms: [{shoulder, elbow}], legs: [{hip, knee}]} of f(track). */
function eachAngle({body, arms, legs}, f) {
  return {torso: f(body.torso), neck: f(body.neck), arms: arms.map(a => ({shoulder: f(a.shoulder), elbow: f(a.elbow)})), legs: legs.map(l => ({hip: f(l.hip), knee: f(l.knee)}))};
}
/** The whole turns an angle makes over a looped clip: each repeat carries it on by them (clip.mjs · poseBetween). */
const turnsOf = angles => eachAngle(angles, t => { const d = t.at(-1) - t[0]; return d - wrapAngle(d); });
/** Every angle track, in a list. */
const angleTracks = ({body, arms, legs}) => [body.torso, body.neck, ...arms.flatMap(a => [a.shoulder, a.elbow]), ...legs.flatMap(l => [l.hip, l.knee])];
/** How far the angles jump at a loop's seam (radians): its last frame against its first, the short way round. */
const angleJump = angles => most(angleTracks(angles).map(t => Math.abs(wrapAngle(t.at(-1) - t[0]))));

/**
 * Played once, or looped. A loop's seam is measured with the feet, in the room: where each foot is at the clip's last
 * frame (the next repeat's first) against where it was at its first, the body carried on by the loop's travel. Within
 * `seam` it loops (a foot planted across the seam is one contact, locked to one spot); past it, it refuses with the
 * slide and the cut where the feet do meet (seam.mjs · bestCut).
 */
export function loopStage(s, o, work, record) {
  if (!o.loop) {
    const v = verdict(s, {loop: false}, LOOP_RULES(o.seam), LOOP_DEFAULT);
    report(s, record, {loop: {how: v.how, why: v.why, evidence: v.evidence}});
    return;
  }
  const {root} = work.rig, n = root.length, {first, fps} = work.read, unit = o.size * TORSO_SHARE;
  if (n < 3) throw new Error(`fromPose "${o.name}": a loop needs at least 3 frames (its last is the next repeat's first), not ${n}: keep a longer stretch (from, to)`);
  const slides = footSlides(work.ankles, 0, n - 1, work.travel), j = slides[1] > slides[0] ? 1 : 0;
  const v = verdict(s, {loop: true, seamSlide: round(slides[j])}, LOOP_RULES(o.seam), LOOP_DEFAULT);
  const found = {how: v.how, why: v.why, evidence: v.evidence, foot: FOOT[j], slide: round(slides[j]), px: round(slides[j] * unit, 1), frames: [first, first + n - 1],
    travel: round(work.travel), ...(work.held ? {held: 'a foot never leaves the floor: it loops in place'} : {})};
  if (v.how === 'refuse') {
    const {cut, searched} = bestCut(work.ankles, root, {tolerance: o.seam});
    found.searched = searched;
    found.cut = cut && {from: +((first + cut.a) / fps).toFixed(6), to: +((first + cut.b) / fps).toFixed(6), frames: [first + cut.a, first + cut.b], px: round(cut.slide * unit, 1)};
    report(s, record, {loop: found});
    throw loopRefusal(found, o);
  }
  work.turns = turnsOf(work.angles);
  // What the seam leaves to the eye: the body's held angles and its height are not locked as the feet are.
  found.pose = {angle: round(angleJump(work.angles)), lift: round(Math.abs(root[n - 1].y - root[0].y)), x: round(Math.abs(root[n - 1].x - root[0].x - work.travel))};
  report(s, record, {loop: found});
}

export function retimeStage(s, o, work, record) {
  const {count, fps, first} = work.read, rate = fps * o.speed, clock = clipClock({count, fps, start: o.start, speed: o.speed, loop: o.loop});
  work.clock = clock;
  const film = f => round(o.start + (f - first) / rate);
  // A contact across a loop's seam ends in the next repeat: its film seconds run on past the first repeat.
  const onFilm = c => (c.wraps ? [film(c.frames[0]), round(o.start + clock.pass + (c.frames[1] - first) / rate)] : c.frames.map(film));
  report(s, record, {contacts: record.contacts.map(c => ({...c, film: onFilm(c)})),
    timing: {start: o.start, speed: o.speed, pass: round(clock.pass), end: o.loop ? null : round(clock.end), ...(o.loop ? {period: round(clock.period)} : {})}});
}

/** One frame of the clip as the pose needs it, in torso lengths (the source scales it to px). */
function frameOf(work, o, f) {
  const {root, joints} = work.rig, {body, arms, legs} = work.angles, fps = work.read.fps, last = root.length - 1, p = Math.max(0, f - 1), q = Math.min(last, f + 1);
  const step = Math.abs(root[q].x - root[p].x) / ((q - p) / fps);
  return {
    x: root[f].x, lift: root[f].y - work.floor - work.standing,
    feet: work.feet.map(t => ({x: t[f].x, lift: Math.max(0, t[f].y - work.floor)})),
    swing: Math.max(-1, Math.min(1, wrapAngle(arms[1].shoulder[f] - arms[0].shoulder[f]) / (2 * SWING))),
    turn: turnOf(joints[f], o.frontal), walking: step > o.walkSpeed,
    joints: {torso: body.torso[f], neck: body.neck[f], arms: arms.map(a => ({shoulder: a.shoulder[f], elbow: a.elbow[f]})), legs: legs.map(l => ({hip: l.hip[f], knee: l.knee[f]}))},
  };
}

export function sourceStage(s, o, work, record) {
  const frames = work.rig.root.map((_, f) => frameOf(work, o, f)), clock = work.clock;
  const place = {x: o.x, unit: o.size * TORSO_SHARE, facing: work.facing, travel: work.travel, turns: work.turns ?? null};
  work.poseAt = t => {
    if (!Number.isFinite(t)) throw new Error(`${o.name}: poseAt(t) takes seconds, not ${shown(t)}`);
    const c = clock.at(t);
    return poseBetween(frames[c.a], frames[c.b], c, place);
  };
  report(s, record, {source: {name: o.name, start: o.start, end: o.loop ? null : round(clock.end), frames: frames.length, unit: round(place.unit, 2)}});
}
