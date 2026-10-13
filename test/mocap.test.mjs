// Motion copied from a video (mocap.mjs · fromPose): keypoints read, gaps filled or refused, smoothed, put on the
// rig, angled, feet planted and locked, retimed — a footprintjs flowchart whose record says what it found and why.
// The keypoints are synthetic, from bodies whose truth is known (test/fixtures/mocap/make.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {fromPose, MOCAP, SCHEMES, RIG_JOINTS} from '../src/mocap.mjs';
import {checkPose, TORSO_SHARE} from '../src/pose.mjs';
import {oneEuro} from '../src/mocap/tracks.mjs';
import {wrapAngle} from '../src/mocap/rig.mjs';
import {drawFigure, figureAt} from '../src/kits/cartoon/figure.mjs';
import {compileFilm, evenTimings, frameHashes} from '../src/index.mjs';
import {makeWalk, makeWave, walkStances, WALK, WAVE} from './fixtures/mocap/make.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/mocap/${name}`, import.meta.url), 'utf8'));
const WALK_JSON = fixture('walk.coco.json'), WAVE_JSON = fixture('wave.mediapipe.json');
const copy = v => structuredClone(v);
const PLACE = {x: 200, size: 400};
/** Every angle a pose carries, by name. */
const anglesOf = p => ({torso: p.joints.torso, neck: p.joints.neck, ...Object.fromEntries(p.joints.arms.flatMap((a, j) => [[`shoulder${j}`, a.shoulder], [`elbow${j}`, a.elbow]])),
  ...Object.fromEntries(p.joints.legs.flatMap((l, j) => [[`hip${j}`, l.hip], [`knee${j}`, l.knee]]))});
const times = (from, to, every) => Array.from({length: Math.floor((to - from) / every + 1e-9) + 1}, (_, i) => from + i * every);
const footOf = c => (c.foot === 'left' ? 0 : 1);
/** Two values the same, numbers to a billionth (a moment on the film's clock is a sum of floats). */
function near(a, b, where) {
  if (typeof a === 'number') return assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${where}: ${a} is not ${b}`);
  if (a && typeof a === 'object') return Object.keys(b).forEach(k => near(a[k], b[k], `${where}.${k}`));
  assert.equal(a, b, where);
}

test('the fixtures are what make.mjs makes: synthetic keypoints with a known truth, checked in', () => {
  assert.deepEqual(WALK_JSON, copy(makeWalk()));
  assert.deepEqual(WAVE_JSON, copy(makeWave()));
  assert.deepEqual(Object.keys(SCHEMES), ['coco-17', 'mediapipe-33']);
  for (const joint of RIG_JOINTS) for (const names of Object.values(SCHEMES)) assert.ok(names.includes(joint), `${joint} is named alike in both schemes`);
});

test('the record says what was found and decided: the dropouts, every gap and how it was filled, which way it faces', async () => {
  const {record} = await fromPose(WALK_JSON, PLACE);
  assert.deepEqual([record.scheme, record.fps, record.kept, record.nobody], ['coco-17', 30, {frames: [0, 95], count: 96, seconds: 3.167}, 1]);
  assert.deepEqual(record.dropouts, [{joint: 'right_knee', frames: [50, 52], lowest: .2}], 'the knee the detector was unsure of');
  const how = record.gaps.map(g => `${g.joint} ${g.frames.join('–')} ${g.how}`);
  for (const line of ['nose 0–1 hold', 'left_wrist 20–23 bridge', 'right_knee 50–52 bridge']) assert.ok(how.includes(line), `${line} in ${how}`);
  assert.equal(record.gaps.filter(g => g.frames[0] === 70).length, RIG_JOINTS.length, 'nobody found in frame 70: every joint bridged');
  assert.equal(record.gaps.length, 3 + RIG_JOINTS.length);
  for (const g of record.gaps) {
    assert.equal(g.evidence.chosen, g.how, 'the evidence is decide()\'s own');
    assert.equal(g.evidence.rules[0].conditions[0].threshold, MOCAP.maxGap);
  }
  const nose = record.gaps.find(g => g.joint === 'nose' && g.frames[0] === 0);
  assert.equal(nose.why, 'short, at an edge of the clip: held at the nearest point seen: gapSeconds 0.067 ≤ 0.2 ✓, gapEdge "start" in ["start","end"] ✓');
  assert.deepEqual([record.facing.how, record.facing.facing], ['right', 1]);
  assert.match(record.facing.why, /^it travels right: travel 4\.\d+ ≥ 0\.5 ✓$/);
  assert.deepEqual(structuredClone(record), JSON.parse(JSON.stringify(record)), 'plain data: it survives structuredClone and JSON');
  const stages = record.narrative.filter(e => e.type === 'stage').map(e => e.stageId);
  assert.deepEqual(stages, ['read-keypoints', 'fill-gaps', 'smooth', 'normalise', 'joint-angles', 'plant-feet', 'retime', 'motion-source']);
});

test('feet: every stretch the walk was planted is found, within a frame or two; none while a foot is carried', async () => {
  const {record} = await fromPose(WALK_JSON, PLACE);
  for (const j of [0, 1]) {
    const truth = walkStances(j), found = record.contacts.filter(c => footOf(c) === j).map(c => c.frames);
    assert.equal(found.length, truth.length, `${j ? 'right' : 'left'} foot: ${JSON.stringify(found)} against ${JSON.stringify(truth)}`);
    found.forEach(([a, b], i) => assert.ok(Math.abs(a - truth[i][0]) <= 2 && Math.abs(b - truth[i][1]) <= 2, `contact ${a}–${b} against ${truth[i]}`));
  }
  for (const c of record.contacts) {
    assert.match(c.why, /^still long enough, on the floor: planted: stillSeconds [\d.]+ ≥ 0\.1 ✓, overFloor -?[\d.]+ ≤ 0\.15 ✓$/);
    assert.equal(c.evidence.chosen, 'planted');
  }
  assert.deepEqual(record.notPlanted, [], 'no stillness that is not a step');
  assert.deepEqual(record.reach, {frames: 0, most: 0}, 'every planted foot is within its leg\'s reach');
  assert.equal(record.standing.from, 'both feet planted');
});

test('a planted foot never slides: through every contact, each millisecond, it stays exactly on its spot on the floor — drawn too', async () => {
  const sources = [await fromPose(WALK_JSON, PLACE), await fromPose(WALK_JSON, {...PLACE, start: 1.7, speed: .6}), await fromPose(WALK_JSON, {...PLACE, mirror: true}), await fromPose(WALK_JSON, {...PLACE, loop: true}), await fromPose(WAVE_JSON, PLACE)];
  for (const source of sources) {
    assert.ok(source.record.contacts.length > 0);
    for (const c of source.record.contacts) {
      const j = footOf(c), first = source.poseAt(c.film[0] + .001).feet[j], drawn = figureAt(source.poseAt(c.film[0] + .001), {floor: 760, size: 400}).feet[j];
      for (const t of times(c.film[0] + .001, c.film[1] - .001, .001)) {
        const p = source.poseAt(t);
        assert.deepEqual(p.feet[j], {x: first.x, lift: 0}, `${source.name}: the ${c.foot} foot slid at ${t} (contact ${c.frames})`);
        assert.deepEqual(figureAt(p, {floor: 760, size: 400}).feet[j], drawn, `the drawn ${c.foot} foot moved at ${t}`);
      }
    }
  }
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
  // The forearm's own direction does cross ±π (half a turn either way of straight down): told the short way round
  // each frame, it would jump by nearly a whole turn; the pose's elbow never does.
  const wave = await fromPose(WAVE_JSON, PLACE), poses = times(0, 2.36, .01).map(t => wave.poseAt(t));
  const raw = poses.map(p => wrapAngle(p.joints.arms[1].shoulder - p.joints.torso + p.joints.arms[1].elbow));
  assert.ok(raw.some((a, i) => i && Math.abs(a - raw[i - 1]) > 5), 'the forearm\'s direction crosses straight up');
});

test('the angles mean what the port says: a child waving, facing us; a walker side on', async () => {
  const wave = await fromPose(WAVE_JSON, PLACE), still = times(0, 2.3, .1).map(t => checkPose(wave.poseAt(t)));
  for (const p of still) {
    assert.ok(Math.abs(p.joints.arms[0].shoulder) < .15 && Math.abs(p.joints.arms[0].elbow) < .15, 'the left arm hangs');
    assert.ok(Math.abs(p.joints.arms[1].shoulder) > 2.3, `the right arm is raised (${p.joints.arms[1].shoulder})`);
    assert.ok(p.joints.legs.every(l => Math.abs(l.knee) < .1) && Math.abs(p.joints.torso) < .05, 'standing straight');
    assert.ok(p.turn < .1 && !p.walking && p.feet.every(f => f.lift === 0), 'facing us, on both feet');
  }
  assert.deepEqual(wave.record.contacts.map(c => [c.foot, c.frames]), [['left', [0, 59]], ['right', [0, 59]]], 'both feet planted the whole clip');
  assert.deepEqual([wave.record.gaps, wave.record.dropouts], [[], []], 'an unsure little finger is no joint of the figure: no gap, no dropout');
  assert.equal(wave.record.facing.why, 'it neither travels nor turns its head: facing right, as a figure is drawn (facingAsked 0 = 1 ✗; facingAsked 0 = -1 ✗; travel 0.005 ≥ 0.5 ✗; travel 0.005 ≤ -0.5 ✗; noseAhead -0.001 ≥ 0.1 ✗; noseAhead -0.001 ≤ -0.1 ✗)');
  const walk = await fromPose(WALK_JSON, PLACE), steps = times(.3, 2.9, .05).map(t => walk.poseAt(t));
  assert.ok(steps.every(p => Math.abs(p.lean - .06) < .03 && p.lean === p.joints.torso), 'it leans into its walk (0.06 rad)');
  assert.ok(steps.every(p => p.turn > .8 && p.walking), 'side on, walking');
  assert.ok(Math.min(...steps.map(p => p.joints.legs[0].knee)) < -.5, 'the knee bends as the foot is carried');
  assert.ok(Math.max(...steps.map(p => p.swing)) > .3 && Math.min(...steps.map(p => p.swing)) < -.3, 'the arms swing against the legs');
});

test('a blip of noise inside a stance is not a step: one contact, one spot, the foot never hops', async () => {
  const blip = copy(WAVE_JSON), ankle = SCHEMES['mediapipe-33'].indexOf('left_ankle');
  blip.frames[30][ankle][0] += 12 / WAVE.width;   // one frame, 12 px off: fast enough either side to break the stillness
  const source = await fromPose(blip, {...PLACE, smooth: null});
  const left = source.record.contacts.filter(c => c.foot === 'left');
  assert.deepEqual(left.map(c => [c.frames, c.blips]), [[[0, 59], 2]], 'the stretches either side are one, two blips joined');
  const spot = source.poseAt(0).feet[0];
  for (const t of times(0, 2.36, .001)) assert.deepEqual(source.poseAt(t).feet[0], spot, `the left foot moved at ${t}`);
  const split = await fromPose(blip, {...PLACE, smooth: null, minContact: .04});
  assert.ok(split.record.contacts.filter(c => c.foot === 'left').length > 1, 'with minContact under a frame, the blip does break it');
});

test('a jump: the feet still at its top are aloft, not planted, and the body rises off its standing height', async () => {
  const jump = copy(WAVE_JSON), up = f => (f >= 20 && f <= 40 ? 60 * (1 - ((f - 30) / 10) ** 2) : 0);
  jump.frames.forEach((frame, f) => frame.forEach(p => { p[1] -= up(f) / WAVE.height; }));
  const source = await fromPose(jump, PLACE), {record} = source;
  const aloft = record.notPlanted.filter(s => s.how === 'aloft');
  assert.deepEqual(aloft.map(s => s.foot), ['left', 'right']);
  for (const s of aloft) {
    assert.ok(s.frames[0] > 22 && s.frames[1] < 38, `still near the top: ${s.frames}`);
    assert.match(s.why, /^still long enough, but off the floor \(the top of a jump\): not planted: stillSeconds [\d.]+ ≥ 0\.1 ✓$/);
  }
  assert.ok(record.contacts.every(c => c.frames[1] < 22 || c.frames[0] > 38), 'planted before it leaves the floor and after it lands, never in the air');
  const top = source.poseAt(30 / WAVE.fps), unit = PLACE.size * TORSO_SHARE, rise = 60 / 180 * unit;
  assert.ok(Math.abs(top.lift - rise) < .1 * rise && top.feet.every(f => Math.abs(f.lift - rise) < .1 * rise), `it rises ${rise.toFixed(1)} px: ${top.lift}, ${top.feet.map(f => f.lift)}`);
});

test('a gap too long to guess refuses, naming the joint, its frames and the fixes; trimming past it, or a larger maxGap, takes it', async () => {
  const lost = copy(WALK_JSON);
  for (let f = 30; f <= 45; f++) lost.frames[f][13] = null;   // left_knee
  const error = await fromPose(lost, PLACE).then(() => null, e => e);
  assert.ok(error, 'refused');
  assert.equal(error.message, 'fromPose "video": 1 gap is too long to fill: left_knee is missing in frames 30–45 (16 frames, 0.533 s). At most 0.2 s (maxGap) is filled in: trim the clip past it (from, to: seconds of the video), film it again with the whole body in view, or raise maxGap');
  assert.deepEqual(error.record.refused.map(g => [g.joint, g.frames, g.how]), [['left_knee', [30, 45], 'refuse']]);
  assert.equal(error.record.refused[0].why, 'longer than maxGap, or never seen: too long to guess (gapSeconds 0.533 ≤ 0.2 ✗)');
  assert.deepEqual(error.record.narrative.filter(e => e.type === 'stage' || e.type === 'error').map(e => `${e.type} ${e.stageId}`), ['stage read-keypoints', 'error fill-gaps'], 'the record stops where it refused');
  const trimmed = await fromPose(lost, {...PLACE, from: 1.6});
  assert.deepEqual(trimmed.record.kept.frames, [48, 95]);
  assert.ok(trimmed.record.contacts.every(c => c.frames[0] >= 48), 'frame numbers stay the video\'s');
  const patient = await fromPose(lost, {...PLACE, maxGap: .6});
  assert.ok(patient.record.gaps.some(g => g.joint === 'left_knee' && g.frames[0] === 30 && g.how === 'bridge'));
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
  assert.equal(RIG_JOINTS.length, 13);
  const scattered = copy(WALK_JSON);
  [7, 8, 9, 10, 13, 14, 15, 16].forEach((k, i) => { for (let f = 5 + i; f <= 25 + i; f++) scattered.frames[f][k] = null; });
  await assert.rejects(fromPose(scattered, PLACE), /8 gaps are too long to fill: left_elbow is missing in frames 5–25 .*; left_knee is missing in frames 9–29 .*; and 2 more\./);
});

test('retimed: start and speed put the video\'s frames on the film\'s clock; once, it holds its last frame; looped, it walks on', async () => {
  const plain = await fromPose(WALK_JSON, PLACE), fast = await fromPose(WALK_JSON, {...PLACE, start: 3, speed: 2});
  for (let k = 0; k < WALK.frames - 1; k += 5) near(fast.poseAt(3 + k / 60), plain.poseAt(k / 30), `frame ${k}`);
  assert.deepEqual([fast.start, fast.end, fast.record.timing.pass], [3, 3 + 95 / 60, +(95 / 60).toFixed(3)]);
  assert.deepEqual({...fast.poseAt(2), phase: 'clip'}, fast.poseAt(3), 'before it starts: its first frame');
  assert.equal(fast.poseAt(2).phase, 'before');
  const after = fast.poseAt(10);
  assert.deepEqual(after, fast.poseAt(fast.end), 'after its end: its last frame, held');
  assert.equal(after.phase, 'after');
  near({...after, phase: 'clip'}, {...plain.poseAt(95 / 30), phase: 'clip'}, 'the last frame');
  assert.equal(fast.record.timing.after, 'hold');
  assert.equal(fast.record.timing.why, 'played once: it holds its last frame (loop false = true ✗)');
  for (const c of fast.record.contacts) assert.deepEqual(c.film, c.frames.map(f => +(3 + f / 60).toFixed(3)), 'each contact on the film\'s clock');
  const looped = await fromPose(WALK_JSON, {...PLACE, loop: true}), {timing} = looped.record;
  assert.deepEqual([looped.end, timing.after, timing.end, timing.period], [Infinity, 'repeat', null, 3.2]);
  assert.match(timing.why, /^asked to loop: it repeats, each time from where it left off: loop true = true ✓$/);
  const unit = PLACE.size * TORSO_SHARE;
  for (const t of [.2, 1.35, 3.0]) {
    const a = looped.poseAt(t), b = looped.poseAt(t + timing.period);
    assert.ok(Math.abs(b.x - a.x - timing.travel * unit) <= 5e-4 * unit, `each repeat carries on by the clip's travel (${b.x - a.x}; the record's travel is to a thousandth)`);
    near(b.joints, a.joints, 'and it moves as it did');
  }
  assert.ok(timing.seam >= 0 && Number.isFinite(timing.seam), 'the seam between its end and its start is measured');
  const jump = Math.abs(looped.poseAt(3.2 - 1e-6).x - looped.poseAt(3.2 + 1e-6).x);
  assert.ok(jump < 1, `over the seam the body carries on, it does not jump back (${jump} px)`);
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
  const [a, b] = [await fromPose(WALK_JSON, PLACE), await fromPose(WALK_JSON, PLACE)];
  assert.equal(JSON.stringify(a.record), JSON.stringify(b.record));
  for (const t of times(0, 3.3, .037)) assert.deepEqual(a.poseAt(t), b.poseAt(t));
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

test('smoothing: One Euro forward and back steadies a still point and leaves no lag on a moving one; null turns it off', async () => {
  let seed = 7; const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - .5; };
  const still = Array.from({length: 120}, () => 1 + .02 * noise()), steady = oneEuro(still, 30, MOCAP.smooth);
  const spread = v => Math.sqrt(v.reduce((s, x) => s + (x - 1) ** 2, 0) / v.length);
  assert.ok(spread(steady) < spread(still) / 3, `a still point steadied (${spread(still)} → ${spread(steady)})`);
  const ramp = Array.from({length: 120}, (_, i) => i / 30), followed = oneEuro(ramp, 30, MOCAP.smooth);
  assert.ok(followed.slice(20, 100).every((v, i) => Math.abs(v - ramp[i + 20]) < 1e-3), 'no lag on a steady move');
  const off = await fromPose(WALK_JSON, {...PLACE, smooth: null});
  assert.ok(off.record.narrative.some(e => e.text === 'Step 2: Write smoothing = "off"'), 'the record says it was not smoothed');
});

test('end to end: a cartoon figure driven by fromPose renders frames, moves, and its drawn feet stay put while planted', async () => {
  const source = await fromPose(WALK_JSON, {x: 300, size: 420, start: .5});
  const kit = {name: 'mocap', story: {compile: () => ({hang: 1, draw: (ctx, t) => {
    ctx.fillStyle = '#bfe3ff'; ctx.fillRect(0, 0, 1600, 900);
    drawFigure(ctx, source.poseAt(t), {floor: 760, size: 420});
  }})}};
  const storyboard = {scenes: [{id: 'walk', narration: 'He walks across the field and keeps on walking.'}]};
  const film = await compileFilm({storyboard, timings: evenTimings(storyboard), recipe: {story: {kit: 'mocap'}}, kits: [kit]});
  const moments = times(.5, 3.6, .1), hashes = frameHashes(film, {times: moments, width: 320});
  assert.ok(new Set(Object.values(hashes)).size > moments.length / 2, 'the figure moves from frame to frame');
  const canvas = createCanvas(1600, 900), ctx = canvas.getContext('2d');
  for (const t of [.5, 1.6, 2.7, 3.6]) {
    film.frame(ctx, t);
    const at = figureAt(source.poseAt(t), {floor: 760, size: 420}), body = {x: (at.hip.x + at.shoulder.x) / 2, y: (at.hip.y + at.shoulder.y) / 2};
    const [r, g, b] = ctx.getImageData(Math.round(body.x), Math.round(body.y), 1, 1).data;
    assert.ok(r > 180 && g < 120 && b < 120, `the shirt is drawn where the pose puts the body at ${t} (${r}, ${g}, ${b})`);
    const T = ctx.getTransform();
    assert.deepEqual([T.a, T.b, T.c, T.d, T.e, T.f], [1, 0, 0, 1, 0, 0], 'the frame restores the canvas');
  }
  for (const c of source.record.contacts) {
    const j = footOf(c), drawn = times(c.film[0] + .001, c.film[1] - .001, .01).map(t => figureAt(source.poseAt(t), {floor: 760, size: 420}).feet[j]);
    assert.ok(drawn.every(p => p.x === drawn[0].x && p.y === 760), `the drawn ${c.foot} foot stays on its spot through ${c.film}`);
  }
});

// Any TypeScript compiler will do: TSC_BIN, or one found in a sibling checkout (as types.test.mjs looks).
const tsc = [process.env.TSC_BIN, ...['../node_modules/.bin/tsc', '../../../node_modules/.bin/tsc'].map(p => fileURLToPath(new URL(p, import.meta.url)))].find(p => p && existsSync(p));
test('the types: a motion source, fromPose\'s options and record, and the figure, as a kit author uses them', {skip: tsc ? false : 'no tsc found (set TSC_BIN)'}, () => {
  const r = spawnSync(tsc, ['--noEmit', '--strict', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', fileURLToPath(new URL('./mocap.check.ts', import.meta.url))], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
