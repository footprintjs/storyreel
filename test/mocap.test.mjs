// Motion copied from a video (mocap.mjs · fromPose): keypoints read, gaps filled or refused, smoothed, put on the
// rig, angled, retimed, looped or played once — a footprintjs flowchart whose record says what it found and why.
// The keypoints are synthetic, from bodies whose truth is known (test/fixtures/mocap/make.mjs). The feet, the seam,
// the legs and the figure are tested in mocap-feet.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fromPose, MOCAP, SCHEMES, RIG_JOINTS} from '../src/mocap.mjs';
import {checkPose} from '../src/pose.mjs';
import {oneEuro, least, most} from '../src/mocap/tracks.mjs';
import {makeWalk, makeNoisyWalk, makeWave, WALK, WAVE} from './fixtures/mocap/make.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/mocap/${name}`, import.meta.url), 'utf8'));
const WALK_JSON = fixture('walk.coco.json'), NOISY_JSON = fixture('walk-noisy.coco.json'), WAVE_JSON = fixture('wave.mediapipe.json');
const copy = v => structuredClone(v);
const PLACE = {x: 200, size: 400};
/** Every angle a pose carries, by name. */
const anglesOf = p => ({torso: p.joints.torso, neck: p.joints.neck, ...Object.fromEntries(p.joints.arms.flatMap((a, j) => [[`shoulder${j}`, a.shoulder], [`elbow${j}`, a.elbow]])),
  ...Object.fromEntries(p.joints.legs.flatMap((l, j) => [[`hip${j}`, l.hip], [`knee${j}`, l.knee]]))});
const times = (from, to, every) => Array.from({length: Math.floor((to - from) / every + 1e-9) + 1}, (_, i) => from + i * every);
/** Two values the same, numbers to a billionth (a moment on the film's clock is a sum of floats). */
function near(a, b, where) {
  if (typeof a === 'number') return assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${where}: ${a} is not ${b}`);
  if (a && typeof a === 'object') return Object.keys(b).forEach(k => near(a[k], b[k], `${where}.${k}`));
  assert.equal(a, b, where);
}
/** The places a gap of this length and edge was filled, as 'joint a–b'. */
const placesOf = (record, missing, edge) => (record.gaps.find(g => g.missing === missing && g.edge === edge)?.at ?? []).map(p => `${p.joint} ${p.frames.join('–')}`);

test('the fixtures are what make.mjs makes: synthetic keypoints with a known truth, checked in', () => {
  assert.deepEqual(WALK_JSON, copy(makeWalk()));
  assert.deepEqual(NOISY_JSON, copy(makeNoisyWalk()));
  assert.deepEqual(WAVE_JSON, copy(makeWave()));
  assert.deepEqual(Object.keys(SCHEMES), ['coco-17', 'mediapipe-33']);
  for (const joint of RIG_JOINTS) for (const names of Object.values(SCHEMES)) assert.ok(names.includes(joint), `${joint} is named alike in both schemes`);
});

test('the record says what was found and decided: dropouts per joint, each kind of gap once with every place, which way it faces', async () => {
  const {record} = await fromPose(WALK_JSON, PLACE);
  assert.deepEqual([record.scheme, record.fps, record.kept, record.nobody], ['coco-17', 30, {frames: [0, 95], count: 96, seconds: 3.167}, 1]);
  assert.deepEqual(record.dropouts, [{joint: 'right_knee', runs: 1, frames: 3, lowest: .2, longest: [50, 52]}], 'the knee the detector was unsure of');
  assert.deepEqual(placesOf(record, 2, 'start'), ['nose 0–1']);
  assert.deepEqual(placesOf(record, 4, 'inside'), ['left_wrist 20–23']);
  assert.deepEqual(placesOf(record, 3, 'inside'), ['right_knee 50–52']);
  assert.deepEqual(placesOf(record, 1, 'inside'), RIG_JOINTS.map(j => `${j} 70–70`), 'nobody found in frame 70: every joint bridged, one verdict');
  assert.deepEqual(record.gaps.map(g => g.how), ['hold', 'bridge', 'bridge', 'bridge']);
  for (const g of record.gaps) {
    assert.equal(g.evidence.chosen, g.how, 'the evidence is decide()\'s own');
    assert.equal(g.evidence.rules[0].conditions[0].threshold, MOCAP.maxGap);
  }
  assert.equal(record.gaps[0].why, 'short, at an edge of the clip: held at the nearest point seen: gapSeconds 0.067 ≤ 0.2 ✓, gapEdge "start" in ["start","end"] ✓');
  assert.deepEqual([record.facing.how, record.facing.facing], ['right', 1]);
  assert.match(record.facing.why, /^it travels right: travel 4\.\d+ ≥ 0\.5 ✓$/);
  assert.deepEqual([record.loop.how, record.loop.why], ['once', 'played once: it holds its last frame: loop false = false ✓']);
  assert.deepEqual(structuredClone(record), JSON.parse(JSON.stringify(record)), 'plain data: it survives structuredClone and JSON');
  const stages = record.narrative.filter(e => e.type === 'stage').map(e => e.stageId);
  assert.deepEqual(stages, ['read-keypoints', 'fill-gaps', 'smooth', 'normalise', 'joint-angles', 'plant-feet', 'close-loop', 'retime', 'motion-source']);
});

test('a flickering detector grows the record by places, not verdicts: its narrative stays the clean run\'s size', async () => {
  const flicker = copy(WALK_JSON);
  let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let dips = 0;
  for (let f = 2; f < flicker.frames.length - 4; f++) for (let k = 5; k < 17; k++) {
    if (!flicker.frames[f] || rnd() >= .05) continue;
    for (let i = 0, n = 1 + Math.floor(rnd() * 3); i < n; i++) if (flicker.frames[f + i]?.[k]) { flicker.frames[f + i][k][2] = .3; dips++; }
  }
  const [clean, flickering] = [await fromPose(WALK_JSON, PLACE), await fromPose(flicker, PLACE)];
  assert.ok(dips > 60, `the detector flickers (${dips} unsure points)`);
  assert.ok(flickering.record.dropouts.length <= RIG_JOINTS.length, 'one dropout line per joint at most');
  assert.ok(flickering.record.gaps.length <= 8, `a few kinds of gap (${flickering.record.gaps.length}), each with its places`);
  const extra = flickering.record.narrative.length - clean.record.narrative.length;
  assert.ok(extra < 40, `the narrative grows by verdicts, not flickers (${extra} more entries for ${dips} unsure points)`);
});

test('the angles are continuous: no jump from one millisecond to the next, even where the waving forearm crosses straight up', async () => {
  for (const [keypoints, seconds] of [[WALK_JSON, WALK.frames / WALK.fps], [WAVE_JSON, WAVE.frames / WAVE.fps]]) {
    const source = await fromPose(keypoints, PLACE);
    let prev = null;
    for (const t of times(0, seconds, .001)) {
      const now = anglesOf(source.poseAt(t));
      if (prev) for (const [k, v] of Object.entries(now)) assert.ok(Math.abs(v - prev[k]) < .02, `${k} jumps at ${t}: ${prev[k]} → ${v}`);
      prev = now;
    }
  }
});

test('the angles mean what the port says: a child waving, facing us; a walker side on', async () => {
  const wave = await fromPose(WAVE_JSON, PLACE);
  for (const p of times(0, 2.3, .1).map(t => checkPose(wave.poseAt(t)))) {
    assert.ok(Math.abs(p.joints.arms[0].shoulder) < .15 && Math.abs(p.joints.arms[0].elbow) < .15, 'the left arm hangs');
    assert.ok(Math.abs(p.joints.arms[1].shoulder) > 2.3, `the right arm is raised (${p.joints.arms[1].shoulder})`);
    assert.ok(p.joints.legs.every(l => Math.abs(l.knee) < .1) && Math.abs(p.joints.torso) < .05, 'standing straight');
    assert.ok(p.turn < .1 && !p.walking && p.feet.every(f => f.lift === 0 && f.angle === 0), 'facing us, on both feet, flat');
  }
  assert.deepEqual([wave.record.gaps, wave.record.dropouts], [[], []], 'an unsure little finger is no joint of the figure: no gap, no dropout');
  assert.equal(wave.record.facing.why, 'it neither travels nor turns its head: facing right, as a figure is drawn (facingAsked 0 = 1 ✗; facingAsked 0 = -1 ✗; travel 0.008 ≥ 0.5 ✗; travel 0.008 ≤ -0.5 ✗; noseAhead -0.001 ≥ 0.1 ✗; noseAhead -0.001 ≤ -0.1 ✗)');
  const walk = await fromPose(WALK_JSON, PLACE), steps = times(.3, 2.9, .05).map(t => walk.poseAt(t));
  assert.ok(steps.every(p => Math.abs(p.lean - .06) < .03 && p.lean === p.joints.torso), 'it leans into its walk (0.06 rad)');
  assert.ok(steps.every(p => p.turn > .8 && p.walking), 'side on, walking');
  assert.ok(Math.min(...steps.map(p => p.joints.legs[0].knee)) < -.5, 'the knee bends as the foot is carried');
  assert.ok(Math.max(...steps.map(p => p.swing)) > .3 && Math.min(...steps.map(p => p.swing)) < -.3, 'the arms swing against the legs');
});

test('a gap too long to guess refuses, naming the joint, its frames and the fixes; trimming past it, or a larger maxGap, takes it', async () => {
  const lost = copy(WALK_JSON);
  for (let f = 30; f <= 45; f++) lost.frames[f][13] = null;   // left_knee
  const error = await fromPose(lost, PLACE).then(() => null, e => e);
  assert.ok(error, 'refused');
  assert.equal(error.message, 'fromPose "video": 1 gap is too long to fill: left_knee is missing in frames 30–45 (16 frames, 0.533 s). At most 0.2 s (maxGap) is filled in: trim the clip past it (from, to: seconds of the video), film it again with the whole body in view, or raise maxGap');
  assert.deepEqual(error.record.refused.map(g => [g.how, g.missing, g.at]), [['refuse', 16, [{joint: 'left_knee', frames: [30, 45]}]]]);
  assert.equal(error.record.refused[0].why, 'longer than maxGap, or never seen: too long to guess (gapSeconds 0.533 ≤ 0.2 ✗)');
  assert.deepEqual(error.record.narrative.filter(e => e.type === 'stage' || e.type === 'error').map(e => `${e.type} ${e.stageId}`), ['stage read-keypoints', 'error fill-gaps'], 'the record stops where it refused');
  const trimmed = await fromPose(lost, {...PLACE, from: 1.6});
  assert.deepEqual(trimmed.record.kept.frames, [48, 95]);
  assert.ok(trimmed.record.contacts.every(c => c.frames[0] >= 48), 'frame numbers stay the video\'s');
  const patient = await fromPose(lost, {...PLACE, maxGap: .6});
  assert.deepEqual(placesOf(patient.record, 16, 'inside'), ['left_knee 30–45']);
  const blind = copy(WALK_JSON);
  blind.frames.forEach(frame => { if (frame) frame[0] = null; });
  await assert.rejects(fromPose(blind, PLACE), /1 gap is too long to fill: nose is never seen \(frames 0–95\)/);
  // Gaps over the same frames are said once; a person out of view is every joint; past six, the rest are counted.
  const arms = copy(WALK_JSON);
  for (const k of [7, 8, 9, 10]) for (let f = 5; f <= 30; f++) arms.frames[f][k] = null;
  await assert.rejects(fromPose(arms, PLACE), /^Error: fromPose "video": 4 gaps are too long to fill: left_elbow, right_elbow, left_wrist, right_wrist are missing in frames 5–30 \(26 frames, 0\.867 s\)\. At most 0\.2 s \(maxGap\) is filled in: trim the clip past them/);
  const away = copy(WALK_JSON);
  for (let f = 40; f <= 60; f++) away.frames[f] = null;
  await assert.rejects(fromPose(away, PLACE), /13 gaps are too long to fill: every joint \(nobody in view\) is missing in frames 40–60 \(21 frames, 0\.7 s\)/);
  // A gap that reaches past a cut is decided by its whole length, and the refusal says which of its frames are kept.
  const straddling = copy(WALK_JSON);
  for (let f = 40; f <= 55; f++) straddling.frames[f][13] = null;
  await assert.rejects(fromPose(straddling, {...PLACE, from: 1.6}), /1 gap is too long to fill: left_knee is missing in frames 40–55 \(16 frames, 0\.533 s, of which 48–55 are kept\)\. At most/);
  const scattered = copy(WALK_JSON);
  [7, 8, 9, 10, 13, 14, 15, 16].forEach((k, i) => { for (let f = 5 + i; f <= 25 + i; f++) scattered.frames[f][k] = null; });
  await assert.rejects(fromPose(scattered, PLACE), /8 gaps are too long to fill: left_elbow is missing in frames 5–25 .*; left_knee is missing in frames 9–29 .*; and 2 more\./);
});

test('a gap of points the detector reported, only unsure of them, says so and names minConfidence — filming again is no fix', async () => {
  // As a real side-on clip: the far arm reported in every frame, at visibility 0.02–0.2.
  const far = copy(WAVE_JSON), names = SCHEMES['mediapipe-33'];
  far.frames.forEach((frame, f) => { for (const joint of ['left_elbow', 'left_wrist']) frame[names.indexOf(joint)][2] = .02 + .18 * ((f * 7) % 10) / 9; });
  const error = await fromPose(far, PLACE).then(() => null, e => e);
  assert.ok(error, 'refused');
  assert.equal(error.message, 'fromPose "video": 2 gaps are too long to fill: left_elbow, left_wrist are reported only under minConfidence 0.5 (at 0.02–0.2) in every frame (frames 0–59). At most 0.2 s (maxGap) is filled in: trim the clip past them (from, to: seconds of the video), lower minConfidence (0.5) to use the points the detector reported, or raise maxGap');
  assert.doesNotMatch(error.message, /film it again/);
  assert.deepEqual(error.record.refused[0].at.map(p => [p.joint, p.unsure]), [['left_elbow', 60], ['left_wrist', 60]], 'the record counts the points reported, unsure');
  const lowered = await fromPose(far, {...PLACE, minConfidence: .01});
  assert.deepEqual(lowered.record.gaps, [], 'with minConfidence under them, the points are seen');
  // Decided over the frames kept: a gap that is missing in the context before a cut and unsure in the kept frames is
  // unsure. A confidence is never rounded up to minConfidence (0.4996 is said as 0.499).
  const cutUnsure = copy(WALK_JSON);
  for (let f = 20; f <= 45; f++) if (f < 30) cutUnsure.frames[f][13] = null; else cutUnsure.frames[f][13][2] = f === 40 ? .4996 : .3;
  const cut = await fromPose(cutUnsure, {...PLACE, from: 1}).then(() => null, e => e);
  assert.match(cut.message, /left_knee is reported only under minConfidence 0\.5 \(at 0\.3–0\.499\) in frames 20–45 \(26 frames, 0\.867 s, of which 30–45 are kept\)\. At most 0\.2 s \(maxGap\) is filled in: trim the clip past it \(from, to: seconds of the video\), lower minConfidence/);
  assert.doesNotMatch(cut.message, /film it again|0\.5\)\s*in/);
  // Some frames never found and some reported unsure: both fixes.
  const mixed = copy(WALK_JSON);
  for (let f = 30; f <= 45; f++) if (f < 38) mixed.frames[f][13] = null; else mixed.frames[f][13][2] = .3;
  await assert.rejects(fromPose(mixed, PLACE), /left_knee is missing, or reported only under minConfidence 0\.5 \(at 0\.3–0\.3\), in frames 30–45 \(16 frames, 0\.533 s\)\. At most 0\.2 s \(maxGap\) is filled in: trim the clip past it \(from, to: seconds of the video\), film it again with the whole body in view, lower minConfidence \(0\.5\) to use the points the detector reported, or raise maxGap/);
});

test('frames the tool could not read are said in the record, and why: damaged (by time) or not known which', async () => {
  const damaged = await fromPose({...WALK_JSON, unread: {frames: 58, why: 'damaged', read: [0, 2.067], duration: 4}}, PLACE);
  assert.deepEqual(damaged.record.unread, {frames: 58, why: 'damaged', read: [0, 2.067], duration: 4,
    note: 'the video lasts 4 s and its frames could be read only from 0 to 2.067 s (58 frames lost): it is likely damaged'});
  const unknown = await fromPose({...WALK_JSON, unread: {frames: 66, why: 'unknown'}}, PLACE);
  assert.equal(unknown.record.unread.note, 'the video states 66 more frames than could be read: a trimmed file states more than it shows; a damaged one ends early (the tool could not tell which)');
  assert.equal((await fromPose(WALK_JSON, PLACE)).record.unread, undefined, 'none unread: nothing said');
  for (const bad of [24, {frames: -1, why: 'damaged'}, {frames: 3, why: 'trimmed'}, {frames: 3, why: 'damaged', read: [0]}, {frames: 3, why: 'unknown', duration: 0}]) {
    await assert.rejects(fromPose({...WALK_JSON, unread: bad}, PLACE), /keypoints: unread is \{frames, why: "damaged" \| "unknown", read\?: \[from, to\], duration\?\} \(what tools\/pose-from-video\.py could not read\)/);
  }
});

test('retimed: start and speed put the video\'s frames on the film\'s clock; played once, it holds its last frame', async () => {
  const plain = await fromPose(WALK_JSON, PLACE), fast = await fromPose(WALK_JSON, {...PLACE, start: 3, speed: 2});
  for (let k = 0; k < WALK.frames - 1; k += 5) near(fast.poseAt(3 + k / 60), plain.poseAt(k / 30), `frame ${k}`);
  assert.deepEqual([fast.start, fast.end, fast.record.timing], [3, 3 + 95 / 60, {start: 3, speed: 2, pass: +(95 / 60).toFixed(3), end: +(3 + 95 / 60).toFixed(3)}]);
  assert.deepEqual({...fast.poseAt(2), phase: 'clip'}, fast.poseAt(3), 'before it starts: its first frame');
  assert.equal(fast.poseAt(2).phase, 'before');
  const after = fast.poseAt(10);
  assert.deepEqual(after, fast.poseAt(fast.end), 'after its end: its last frame, held');
  assert.equal(after.phase, 'after');
  near({...after, phase: 'clip'}, {...plain.poseAt(95 / 30), phase: 'clip'}, 'the last frame');
  for (const c of fast.record.contacts) assert.deepEqual(c.film, c.frames.map(f => +(3 + f / 60).toFixed(3)), 'each contact on the film\'s clock');
});

test('mirrored: the figure faces the other way, and left and right swap', async () => {
  const plain = await fromPose(WALK_JSON, PLACE), mirrored = await fromPose(WALK_JSON, {...PLACE, mirror: true});
  assert.deepEqual([mirrored.record.facing.how, mirrored.poseAt(1).facing], ['left', -1]);
  const sides = (source, foot) => source.record.contacts.filter(c => c.foot === foot).map(c => c.frames);
  assert.deepEqual(sides(mirrored, 'left'), sides(plain, 'right'));
  assert.deepEqual(sides(mirrored, 'right'), sides(plain, 'left'));
  for (const t of [.4, 1.3, 2.2]) {
    const a = plain.poseAt(t), b = mirrored.poseAt(t);
    assert.ok(Math.abs((b.x - PLACE.x) + (a.x - PLACE.x)) < 1e-6, 'x mirrored about where it started');
    assert.ok(Math.abs(b.joints.legs[0].knee - a.joints.legs[1].knee) < 1e-9 && Math.abs(b.joints.arms[1].shoulder - a.joints.arms[0].shoulder) < 1e-9, 'the same body, its sides swapped');
  }
});

test('facing: asked wins; else how it travels, then where its nose points; else right, as a figure is drawn', async () => {
  const asked = await fromPose(WAVE_JSON, {...PLACE, facing: -1});
  assert.deepEqual([asked.record.facing.how, asked.record.facing.why], ['left', 'asked to face left (−x): facingAsked -1 = -1 ✓']);
  assert.equal(asked.poseAt(1).facing, -1);
  const turned = copy(WAVE_JSON);
  turned.frames.forEach(frame => { frame[0][0] -= 40 / WAVE.width; });   // the nose turned to the left
  assert.match((await fromPose(turned, PLACE)).record.facing.why, /^its nose points left: noseAhead -0\.2\d+ ≤ -0\.1 ✓$/);
});

test('deterministic: the same keypoints give the same record and the same poses, run after run', async () => {
  for (const keypoints of [WALK_JSON, NOISY_JSON]) {
    const [a, b] = [await fromPose(keypoints, PLACE), await fromPose(keypoints, PLACE)];
    assert.equal(JSON.stringify(a.record), JSON.stringify(b.record));
    for (const t of times(0, 3.3, .037)) assert.deepEqual(a.poseAt(t), b.poseAt(t));
  }
});

test('points by name read the same as the scheme\'s order; normalised points are scaled by the width and the height', async () => {
  const named = copy(WALK_JSON);
  named.frames = named.frames.map(frame => frame && Object.fromEntries(SCHEMES['coco-17'].map((n, i) => [n, frame[i]]).filter(([, p]) => p !== null)));
  const [a, b] = [await fromPose(WALK_JSON, PLACE), await fromPose(named, PLACE)];
  assert.equal(JSON.stringify(b.record), JSON.stringify(a.record));
  const pixels = copy(WAVE_JSON);
  pixels.coordinates = 'pixels';
  pixels.frames.forEach(frame => frame.forEach(p => { p[0] *= WAVE.width; p[1] *= WAVE.height; }));
  const [n, p] = [await fromPose(WAVE_JSON, PLACE), await fromPose({...WAVE_JSON, coordinates: 'normalized'}, PLACE)];
  assert.deepEqual(p.poseAt(1.1), n.poseAt(1.1), '"normalized" is read too');
  const px = (await fromPose(pixels, PLACE)).poseAt(1.1), norm = n.poseAt(1.1);
  assert.ok(Math.abs(px.x - norm.x) < 1e-6 && Math.abs(px.joints.arms[1].elbow - norm.joints.arms[1].elbow) < 1e-9);
});

test('the keypoints are checked: each mistake refuses, naming the fix', async () => {
  const cases = [
    [null, /keypoints: the document is \{scheme, fps, coordinates, width\?, height\?, frames\} \(the JSON tools\/pose-from-video\.py writes\), not null/],
    [{...WALK_JSON, scheme: 'openpose-25'}, /keypoints: scheme "openpose-25" is not one we read; the schemes are coco-17, mediapipe-33/],
    [{...WALK_JSON, fps: 0}, /keypoints: fps is the video's frames a second \(above 0\), not 0/],
    [{...WALK_JSON, coordinates: 'metres'}, /keypoints: coordinates is 'pixels' or 'normalised'/],
    [{...WAVE_JSON, width: undefined}, /keypoints: normalised coordinates need the video's width and height in px .* give width and height, not undefined × 1280/],
    [{...WALK_JSON, frames: [WALK_JSON.frames[0]]}, /keypoints: frames is a list of at least 2 frames/],
    [{...WALK_JSON, frames: [WALK_JSON.frames[0], WALK_JSON.frames[1].slice(1)]}, /keypoints: frame 1 has 16 points; a coco-17 frame has 17, in its order \(or name them/],
    [{...WALK_JSON, frames: [WALK_JSON.frames[0], [[1, 2], ...WALK_JSON.frames[1].slice(1)]]}, /keypoints: frame 1, nose: a point is \[x, y, confidence\] \(confidence 0\.\.1\) or null, not \[1,2\]/],
    [{...WALK_JSON, frames: [WALK_JSON.frames[0], {nose: [1, 2, .9], left_toe: [1, 2, .9]}]}, /keypoints: frame 1 names "left_toe", which coco-17 does not have/],
    [{...WALK_JSON, frames: [WALK_JSON.frames[0], 'person']}, /keypoints: frame 1 is a list of 17 points, \{name: point\}, or null, not "person"/],
  ];
  for (const [doc, message] of cases) await assert.rejects(fromPose(doc, PLACE), message);
  await assert.rejects(fromPose(WALK_JSON, {...PLACE, from: 2, to: 9}), /fromPose: from and to are seconds of the video, 0 ≤ from < to ≤ 3\.167 \(its last frame\), not from 2, to 9/);
  await assert.rejects(fromPose(WALK_JSON, {...PLACE, from: 1, to: 1.02}), /keeps 1 frame; keep at least 2/);
});

test('the settings are checked before anything runs, naming the fix', async () => {
  const cases = [
    [{}, /fromPose: x is where the figure stands on the floor at the clip's first frame \(px\), not undefined/],
    [{x: 0}, /fromPose: size is the figure's standing height \(px, above 0; one torso length is 0\.3 of it\), not undefined/],
    [{...PLACE, sise: 3}, /fromPose: unknown option sise; the options are x, size, name, minConfidence/],
    [{...PLACE, minConfidence: 2}, /minConfidence is 0\.\.1/],
    [{...PLACE, maxGap: -1}, /maxGap is a number, 0 or more, not -1/],
    [{...PLACE, seam: -1}, /seam is a number, 0 or more, not -1/],
    [{...PLACE, speed: 0}, /speed is a number above 0, not 0/],
    [{...PLACE, smooth: {beta: -1}}, /smooth\.beta is 0 or more/],
    [{...PLACE, smooth: {minCutoff: 0}}, /smooth\.minCutoff is a cutoff in Hz, above 0 \(or smooth: null for none\)/],
    [{...PLACE, smooth: false}, /smooth is \{minCutoff\?, beta\?, dCutoff\?\} \(One Euro; the rest as MOCAP\.smooth\) or null \(not smoothed\), not false/],
    [{...PLACE, loop: 'yes'}, /loop is true or false, not "yes"/],
    [{...PLACE, facing: 2}, /facing is 1, -1, or null \(decided from the clip\), not 2/],
    [{...PLACE, name: ''}, /name is a word for the source/],
    [{...PLACE, from: '1s'}, /from is seconds of the video, or null, not "1s"/],
  ];
  for (const [options, message] of cases) await assert.rejects(fromPose(WALK_JSON, options), message);
  const source = await fromPose(WALK_JSON, {...PLACE, name: 'dad walking'});
  assert.equal(source.name, 'dad walking');
  assert.throws(() => source.poseAt('soon'), /dad walking: poseAt\(t\) takes seconds, not "soon"/);
});

test('smoothing: One Euro forward and back steadies a still point, leaves no lag on a moving one, not even at the ends; null turns it off', async () => {
  let seed = 7; const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - .5; };
  const still = Array.from({length: 120}, () => 1 + .02 * noise()), steady = oneEuro(still, 30, MOCAP.smooth);
  const spread = v => Math.sqrt(v.reduce((s, x) => s + (x - 1) ** 2, 0) / v.length);
  // Reflected through its end frames, an end is steadied less than the middle (its own noise is mirrored), but never made worse.
  assert.ok(spread(steady.slice(15, 105)) < spread(still) / 3, `a still point steadied (${spread(still)} → ${spread(steady.slice(15, 105))})`);
  assert.ok(most(steady.map(v => Math.abs(v - 1))) <= most(still.map(v => Math.abs(v - 1))), 'and nowhere worse than it was');
  for (const speed of [1, 3]) {
    const ramp = Array.from({length: 120}, (_, i) => speed * i / 30), followed = oneEuro(ramp, 30, MOCAP.smooth);
    const off = followed.map((v, i) => Math.abs(v - ramp[i]));
    assert.ok(most(off) < .005, `no lag on a steady move of ${speed} torso lengths a second, ends included (the most: ${most(off)})`);
  }
  const off = await fromPose(WALK_JSON, {...PLACE, smooth: null});
  assert.ok(off.record.narrative.some(e => e.text === 'Step 2: Write smoothing = "off"'), 'the record says it was not smoothed');
  const long = Array.from({length: 200000}, (_, i) => i % 7);
  assert.deepEqual([least(long), most(long)], [0, 6], 'the least and the most of a long clip, by a loop');
});

// Any TypeScript compiler will do: TSC_BIN, or one found in a sibling checkout (as types.test.mjs looks).
const tsc = [process.env.TSC_BIN, ...['../node_modules/.bin/tsc', '../../../node_modules/.bin/tsc'].map(p => fileURLToPath(new URL(p, import.meta.url)))].find(p => p && existsSync(p));
test('the types: a motion source, fromPose\'s options and record, and the figure, as a kit author uses them', {skip: tsc ? false : 'no tsc found (set TSC_BIN)'}, () => {
  const r = spawnSync(tsc, ['--noEmit', '--strict', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', fileURLToPath(new URL('./mocap.check.ts', import.meta.url))], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

