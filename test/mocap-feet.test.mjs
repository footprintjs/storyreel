// Feet, legs and the seam (mocap.mjs · fromPose, plant-feet and close-loop), and the cartoon figure they move
// (kits/cartoon/figure.mjs). Each check can fail: stances against the truth the fixtures were made from (a clean and a
// noisy detector), a loop's seam crossed by a planted foot, legs that must reach the foot they were locked to, knees
// that must bend forward under noise, bones that must keep their lengths.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import {fromPose, SCHEMES} from '../src/mocap.mjs';
import {walkSource, TORSO_SHARE} from '../src/pose.mjs';
import {solveKnee, KNEE_NOISE} from '../src/mocap/rig.mjs';
import {drawFigure, figureAt} from '../src/kits/cartoon/figure.mjs';
import {compileFilm, evenTimings, frameHashes} from '../src/index.mjs';
import {walkStances, WALK, WAVE, NOISY_SWAPS} from './fixtures/mocap/make.mjs';
import {bestCut, CUT_SEARCH_LIMIT} from '../src/mocap/seam.mjs';
import {loopRefusal} from '../src/mocap/verdicts.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/mocap/${name}`, import.meta.url), 'utf8'));
const WALK_JSON = fixture('walk.coco.json'), NOISY_JSON = fixture('walk-noisy.coco.json'), WAVE_JSON = fixture('wave.mediapipe.json');
const copy = v => structuredClone(v);
const PLACE = {x: 200, size: 400}, UNIT = PLACE.size * TORSO_SHARE;
const times = (from, to, every) => Array.from({length: Math.floor((to - from) / every + 1e-9) + 1}, (_, i) => from + i * every);
const footOf = c => (c.foot === 'left' ? 0 : 1);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The most a planted foot moves through each contact (sampled each millisecond), and how high it lifts. A contact's
 * film seconds are to the millisecond, so the samples start and end a millisecond inside them.
 */
function plantedDrift(source) {
  let moved = 0, lifted = 0;
  for (const c of source.record.contacts) {
    const j = footOf(c), at = source.poseAt(c.film[0] + .001).feet[j];
    for (const t of times(c.film[0] + .001, c.film[1] - .001, .001)) {
      const f = source.poseAt(t).feet[j];
      moved = Math.max(moved, Math.abs(f.x - at.x)); lifted = Math.max(lifted, f.lift);
    }
  }
  return {moved, lifted};
}

test('feet: every stretch the walk was planted is found within a frame or two — from a clean detector and one as rough as a real one', async () => {
  for (const [keypoints, rough] of [[WALK_JSON, false], [NOISY_JSON, true]]) {
    const {record} = await fromPose(keypoints, PLACE);
    for (const j of [0, 1]) {
      const found = record.contacts.filter(c => footOf(c) === j).map(c => c.frames);
      for (const [a, b] of walkStances(j)) {
        // A stance the clip cuts short (it touches the clip's first or last frame) is partial: a rough detector may
        // read its few frames as passing. Every stance inside the clip must be found.
        const partial = a === 0 || b === WALK.frames - 1, match = found.find(([p, q]) => Math.abs(p - a) <= 2 && Math.abs(q - b) <= 2);
        if (!partial || !rough) assert.ok(match, `${j ? 'right' : 'left'} stance ${a}–${b} found within 2 frames: ${JSON.stringify(found)}`);
      }
      assert.ok(found.every(([p, q]) => walkStances(j).some(([a, b]) => p <= b && q >= a)), `no contact while a foot is carried: ${JSON.stringify(found)}`);
    }
    for (const c of record.contacts) assert.match(c.why, /^still long enough, on the floor: planted: stillSeconds [\d.]+ ≥ 0\.1 ✓, overFloor -?[\d.]+ ≤ 0\.15 ✓$/);
    if (!rough) assert.deepEqual([record.notPlanted, record.reach], [[], {frames: 0, most: 0, at: []}], 'no stillness that is not a step; every planted foot within reach');
    assert.equal(record.standing.from, 'both feet planted');
  }
  assert.ok(NOISY_JSON.frames.flat().some(p => p?.[2] === .4), 'the rough detector dips to 0.4');
});

test('left and right swapped by the detector are traded back, where it happened and nowhere else, with the evidence', async () => {
  const {record} = await fromPose(NOISY_JSON, PLACE), traded = Object.fromEntries(record.swaps.map(p => [p.pair, p.frames]));
  assert.deepEqual(traded.ankle, NOISY_SWAPS.ankle, 'the ankles planted traded, found and traded back');
  assert.deepEqual(traded.wrist, NOISY_SWAPS.wrist, 'the wrists too');
  assert.ok(record.swaps.filter(p => !(p.pair in NOISY_SWAPS)).every(p => p.traded === 0 && p.frames.length === 0), `nothing else traded: ${JSON.stringify(traded)}`);
  for (const v of record.swaps.flatMap(p => p.verdicts)) {
    assert.match(v.why, /^traded back, it moves far less: the detector swapped left and right: swapGain [\d.]+ ≥ 0\.15 ✓, swapShare [\d.]+ ≤ 0\.5 ✓$/);
    assert.equal(v.evidence.chosen, 'swap');
  }
  assert.ok(record.swaps.some(p => p.kept > 0), 'a pair crossing, as labelled, is decided too, and kept');
  // A clean walk with its ankles traded for three frames: traded back, and its feet planted as if never swapped.
  const traded3 = copy(WALK_JSON), [l, r] = [15, 16];
  for (const f of [40, 41, 42]) [traded3.frames[f][l], traded3.frames[f][r]] = [traded3.frames[f][r], traded3.frames[f][l]];
  const [clean, repaired] = [await fromPose(WALK_JSON, PLACE), await fromPose(traded3, PLACE)];
  assert.deepEqual(repaired.record.swaps.find(p => p.pair === 'ankle').frames, [[40, 42]]);
  assert.deepEqual(repaired.record.contacts.map(c => [c.foot, c.frames]), clean.record.contacts.map(c => [c.foot, c.frames]));
  assert.ok(clean.record.swaps.every(p => p.traded === 0), 'a clean walk trades nothing');
});

// The clean walk, with its left ankle sliding 30 px through a stance (as a detector's foot drifts): the lock holds the
// foot on one spot, up to 15 px from where the video had it, so a leg not re-solved to the spot misses it. From the
// hip centre: the walk's two hips are 6 px apart, so the leg must end within a twentieth of a torso of its foot. (A
// rough detector moves each hip on its own, by more than that: the check would not tell a miss from noise.)
test('the legs reach the feet they were locked to: forward kinematics from the pose\'s angles and the record\'s bones lands on the planted foot', async () => {
  const sliding = copy(WALK_JSON);
  for (let f = 33; f <= 52; f++) if (sliding.frames[f]) sliding.frames[f][15][0] += 30 * (f - 33) / 19 - 15;
  for (const keypoints of [WALK_JSON, sliding]) {
    const source = await fromPose(keypoints, PLACE), {legs, standing, reach} = source.record;
    // Where the record says a foot was out of its leg's reach, the leg reaches toward it by at most that much less.
    const short = (foot, f) => reach.at.some(r => r.foot === foot && f >= r.frames[0] && f <= r.frames[1]);
    for (const c of source.record.contacts) for (const f of times(c.frames[0], c.frames[1], 1)) {
      const p = source.poseAt(f / WALK.fps), j = footOf(c), F = p.facing;
      // From the hip centre (torso lengths, y up): the thigh's angle from straight down is hip − torso, the shin's adds the knee.
      const thigh = p.joints.legs[j].hip - p.joints.torso, shin = thigh + p.joints.legs[j].knee;
      const ankle = {x: F * (Math.sin(thigh) * legs[j].thigh + Math.sin(shin) * legs[j].shin), y: -(Math.cos(thigh) * legs[j].thigh + Math.cos(shin) * legs[j].shin)};
      const foot = {x: (p.feet[j].x - p.x) / UNIT, y: (p.feet[j].lift - p.lift) / UNIT - standing.height};
      const allowed = short(c.foot, f) ? reach.most + .05 : .05;
      assert.ok(dist(ankle, foot) < allowed, `frame ${f}, ${c.foot} leg ends ${dist(ankle, foot).toFixed(3)} torso lengths from its planted foot (allowed ${allowed})`);
      assert.ok(p.joints.legs[j].knee < .02, `frame ${f}: the planted ${c.foot} knee bends forward, never back (${p.joints.legs[j].knee})`);
    }
  }
});

test('a knee bends forward: noise on a nearly straight leg never flips it; a knee the video clearly sees the other way is kept', () => {
  const hip = {x: 0, y: 0}, ankle = {x: 0, y: -1.68}, bones = {thigh: .85, shin: .85};
  for (const F of [1, -1]) for (const off of [-.04, -.01, 0, .01, .04]) {
    const {knee} = solveKnee(hip, ankle, {x: off, y: -.85}, bones, F);
    assert.ok(knee.x * F > 0, `facing ${F}, the video's knee ${off} off the line: bent forward (${knee.x})`);
  }
  assert.ok(solveKnee(hip, ankle, {x: -.3, y: -.85}, bones, 1).knee.x < 0, `more than ${KNEE_NOISE} off the line, the video's side is kept`);
});

test('a soft crouch seen from the front: the knees bend one way all through it, as the hips dip 6 px', async () => {
  const soft = copy(WAVE_JSON), names = SCHEMES['mediapipe-33'], legs = /knee|ankle|heel|foot/;
  soft.frames.forEach((frame, f) => {
    const dip = 6 * Math.max(0, Math.sin(Math.PI * f / 59));
    names.forEach((n, k) => { if (!legs.test(n)) frame[k][1] += dip / WAVE.height; else if (/knee/.test(n)) frame[k][1] += dip / 2 / WAVE.height; });
  });
  const source = await fromPose(soft, PLACE), knees = times(0, 2.36, .04).flatMap(t => source.poseAt(t).joints.legs.map(l => l.knee));
  assert.ok(Math.min(...knees) < -.1, 'they do bend');
  assert.ok(knees.every(k => k < .02), `never back: ${knees.filter(k => k >= .02).length} frames bent the other way`);
});

test('bones keep their lengths: a foot out of reach, or too near, is met as far or as near as the leg can, along the same line', () => {
  for (const [thigh, shin, d] of [[1, .5, 2.5], [1, .5, .2], [.2, 1, .5], [.85, .85, 1.2], [.85, .85, 0]]) {
    const hip = {x: 0, y: 0}, want = {x: .3 * d, y: -.95 * d}, r = solveKnee(hip, want, {x: .1, y: -.5}, {thigh, shin}, 1);
    assert.ok(Math.abs(dist(hip, r.knee) - thigh) < 1e-9 && Math.abs(dist(r.knee, r.ankle) - shin) < 1e-9, `thigh ${thigh}, shin ${shin}, ${d} away: ${dist(hip, r.knee)}, ${dist(r.knee, r.ankle)}`);
    const reach = Math.hypot(want.x, want.y);
    assert.ok(Math.abs(r.short - Math.max(0, reach - thigh - shin, Math.abs(thigh - shin) - reach)) < 1e-9, `it says how far it fell short (${r.short})`);
  }
});

test('a loop whose feet do not meet at its seam refuses, with the slide and the cut where they do meet', async () => {
  const error = await fromPose(WALK_JSON, {...PLACE, loop: true}).then(() => null, e => e);
  assert.ok(error, 'refused: the clip ends mid-stride');
  assert.match(error.message, /^fromPose "video": looped, its (left|right) foot is [\d.]+ px \([\d.]+ torso lengths\) from where it starts at the seam \(frame 95 against frame 0\), and at most 0\.05 \(seam\) is joined, so it would slide or jump at every repeat\. To loop it, trim it to whole cycles: from [\d.]+ to [\d.]+ \(frames \d+–\d+\) meet within [\d.]+ px; or play it once \(loop: false\)$/);
  const {loop} = error.record, {cut} = loop;
  assert.equal(loop.how, 'refuse');
  assert.match(loop.why, /^its feet do not meet at the seam: looped, a foot would slide or jump there \(loop true = false ✗; seamSlide [\d.]+ ≤ 0\.05 ✗\)$/);
  assert.equal(cut.frames[1] - cut.frames[0], 66, `the cut is two whole strides (${cut.frames})`);
  assert.ok(cut.px < 1, `and its feet meet within a pixel (${cut.px})`);
  const looped = await fromPose(WALK_JSON, {...PLACE, loop: true, from: cut.from, to: cut.to});
  assert.deepEqual([looped.record.kept.frames, looped.record.loop.how], [cut.frames, 'loop']);
});

test('across a loop\'s seam a planted foot does not move, the body walks on, and nothing jumps — over three repeats', async () => {
  const cut = (await fromPose(WALK_JSON, {...PLACE, loop: true}).catch(e => e)).record.loop.cut;
  const looped = await fromPose(WALK_JSON, {...PLACE, loop: true, from: cut.from, to: cut.to}), {period} = looped.record.timing;
  const wrapping = looped.record.contacts.filter(c => c.wraps);
  assert.ok(wrapping.length >= 1 && wrapping.every(c => c.film[1] > period), 'a contact crosses the seam (its film seconds run past the first repeat)');
  const {moved, lifted} = plantedDrift(looped);
  assert.ok(moved < 1e-6 && lifted === 0, `through every contact, the seam included, a planted foot stays put (moved ${moved} px, lifted ${lifted})`);
  let prev = looped.poseAt(0);
  for (const t of times(.001, 3 * period, .001)) {
    const p = looped.poseAt(t);
    assert.ok(Math.abs(p.x - prev.x) < 1 && p.feet.every((f, j) => Math.abs(f.x - prev.feet[j].x) < 1 && Math.abs(f.lift - prev.feet[j].lift) < 1), `nothing jumps at ${t}`);
    const angles = [p.joints.torso, p.joints.neck, ...p.joints.arms.flatMap(a => [a.shoulder, a.elbow]), ...p.joints.legs.flatMap(l => [l.hip, l.knee])];
    const before = [prev.joints.torso, prev.joints.neck, ...prev.joints.arms.flatMap(a => [a.shoulder, a.elbow]), ...prev.joints.legs.flatMap(l => [l.hip, l.knee])];
    angles.forEach((a, i) => assert.ok(Math.abs(a - before[i]) < .02, `angle ${i} jumps at ${t}: ${before[i]} → ${a}`));
    prev = p;
  }
  assert.ok(Math.abs(looped.poseAt(2 * period).x - looped.poseAt(0).x - 2 * looped.record.loop.travel * UNIT) < .5, 'each repeat walks on by the clip\'s travel');
  for (const c of wrapping) {   // in the second repeat too
    const j = footOf(c), at = looped.poseAt(c.film[0] + period + .001).feet[j];
    for (const t of times(c.film[0] + period + .001, c.film[1] + period - .001, .001)) assert.ok(Math.abs(looped.poseAt(t).feet[j].x - at.x) < 1e-6, `the second seam at ${t}`);
  }
});

test('a clip too long to search for a cut is said to be too long, never to have no cut', async () => {
  const n = 40, feet = [0, 1].map(j => Array.from({length: n}, (_, i) => ({x: i * .1 + j, y: i * .1}))), root = feet[0].map(() => ({x: 0, y: 0}));
  assert.deepEqual(bestCut(feet, root, {tolerance: .05, limit: 30}), {cut: null, searched: {done: false, frames: 40, limit: 30}});
  assert.deepEqual(bestCut(feet, root, {tolerance: .05, limit: 40}), {cut: null, searched: {done: true, frames: 40, limit: 40}}, 'searched, and nothing meets');
  const o = {name: 'video', seam: .05}, base = {foot: 'left', slide: .3, px: 36, frames: [0, 39], cut: null};
  assert.match(loopRefusal({...base, searched: {done: false, frames: 4000, limit: 3600}}, o).message, /To loop it, the clip is too long to search for a cut \(4000 frames, more than 3600\): trim it to whole cycles yourself \(from, to\); or play it once/);
  assert.match(loopRefusal({...base, searched: {done: true, frames: 40, limit: 3600}}, o).message, /To loop it, no two frames of this clip meet: film a few whole cycles of the motion/);
  assert.equal(CUT_SEARCH_LIMIT, 3600, 'two minutes at 30 fps');
  // Through fromPose: a walk tiled past the limit, looped.
  const long = copy(WALK_JSON), step = 140 * WALK.frames / WALK.fps;
  long.frames = Array.from({length: Math.ceil((CUT_SEARCH_LIMIT + 1) / WALK.frames)}, (_, k) => WALK_JSON.frames.map(f => f && f.map(p => p && [p[0] + k * step, p[1], p[2]]))).flat();
  long.width = 1e6;
  const error = await fromPose(long, {...PLACE, loop: true, maxGap: 1}).then(() => null, e => e);
  assert.ok(error, 'refused');
  assert.match(error.message, /the clip is too long to search for a cut \(\d+ frames, more than 3600\)/);
  assert.equal(error.record.loop.searched.done, false);
});

test('a clip planted through its whole length loops in place: its feet never leave their spots, the seam measured', async () => {
  const wave = await fromPose(WAVE_JSON, {...PLACE, loop: true}), {loop, timing} = wave.record;
  assert.deepEqual([loop.how, loop.travel, loop.held], ['loop', 0, 'a foot never leaves the floor: it loops in place']);
  assert.ok(loop.pose.angle > .1, `what the seam leaves to the eye is measured: the forearm is mid-wave at the end (${loop.pose.angle} rad)`);
  const spots = [0, 1].map(j => wave.poseAt(0).feet[j].x);
  for (const t of times(0, 3 * timing.period, .002)) assert.deepEqual(wave.poseAt(t).feet.map(f => [f.x, f.lift]), spots.map(x => [x, 0]), `the feet at ${t}`);
});

test('a blip of noise inside a stance is not a step: one contact, one spot, the foot never hops', async () => {
  const blip = copy(WAVE_JSON), ankle = SCHEMES['mediapipe-33'].indexOf('left_ankle');
  blip.frames[30][ankle][0] += 12 / WAVE.width;   // one frame, 12 px off: fast enough either side to break the stillness
  const source = await fromPose(blip, {...PLACE, smooth: null});
  assert.deepEqual(source.record.contacts.filter(c => c.foot === 'left').map(c => [c.frames, c.blips]), [[[0, 59], 2]], 'the stretches either side are one, two blips joined');
  assert.deepEqual(plantedDrift(source), {moved: 0, lifted: 0});
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
  const top = source.poseAt(30 / WAVE.fps), rise = 60 / 180 * UNIT;
  assert.ok(Math.abs(top.lift - rise) < .1 * rise && top.feet.every(f => Math.abs(f.lift - rise) < .1 * rise), `it rises ${rise.toFixed(1)} px: ${top.lift}, ${top.feet.map(f => f.lift)}`);
});

test('the figure: walking toward +x the camera sees its right side, so that side is drawn in front; a shoe rolls with its foot', () => {
  const plan = walkSource({from: 100, to: 900, start: 0, size: 420}), p = plan.poseAt(1.2);
  assert.equal(figureAt(p, {floor: 760, size: 420}).near, 1, 'facing +x: the right side (feet[1], arms[1]) is near');
  const back = walkSource({from: 900, to: 100, start: 0, size: 420}).poseAt(1.2);
  assert.equal(figureAt(back, {floor: 760, size: 420}).near, 0, 'facing −x: the left');
  // What is drawn ahead of the ankle and above the floor: the leg is the same either way, so only the shoe can add to it.
  const shoeAt = angle => {
    const c = createCanvas(400, 300), ctx = c.getContext('2d'), pose = {...p, x: 200, feet: [{x: 200, lift: 0, angle}, {x: 200, lift: 0, angle}]};
    drawFigure(ctx, pose, {floor: 260, size: 420});
    const T = ctx.getTransform();
    assert.deepEqual([T.a, T.d, T.e, T.f, ctx.globalAlpha], [1, 1, 0, 0, 1], 'the canvas restored');
    const px = ctx.getImageData(205, 230, 40, 25).data;
    let inked = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) inked++;
    return inked;
  };
  assert.ok(shoeAt(.6) > shoeAt(0) + 20, `toes up: the shoe's toe rises ahead of the ankle (${shoeAt(0)} → ${shoeAt(.6)} px)`);
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
