// The motion-source port (pose.mjs): one shape for everything that moves a figure — {name, poseAt(t)} — and the
// planned walk (walk.mjs, unchanged) as one adapter of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {walk} from '../src/walk.mjs';
import {motionSource, walkSource, checkPose, POSE_KEYS, TORSO_SHARE} from '../src/pose.mjs';

const plan = () => walk({from: 130, to: 1800, start: 2, size: 475, style: 'brisk'});

test('the walk is a motion source: poseAt is exactly the walk at t, and every pose it gives passes the port\'s check', () => {
  const w = plan();
  for (const source of [walkSource(w), walkSource({from: 130, to: 1800, start: 2, size: 475, style: 'brisk'})]) {
    assert.equal(source.name, 'walk');
    assert.deepEqual([source.start, source.end], [w.start, w.end], 'it keeps when the walk starts and ends');
    assert.ok(Object.isFrozen(source));
    for (let t = 0; t < w.end + 1; t += .05) assert.deepEqual(checkPose(source.poseAt(t), `walk at ${t}`), w.at(t));
  }
  assert.deepEqual(Object.keys(w.at(3)).sort(), [...POSE_KEYS].sort(), 'the port\'s keys are the walk\'s own');
  assert.equal(TORSO_SHARE, .3);
  assert.throws(() => walkSource({from: 0, to: 100, start: 0}), /walk: size is the figure's standing height/, 'walk\'s own refusal, through the adapter');
});

test('a motion source is checked — a name and poseAt — and whatever else it carries is kept', () => {
  const poseAt = t => plan().at(t), source = motionSource({name: 'mine', poseAt, start: 1, record: {made: 'by hand'}});
  assert.deepEqual([source.name, source.start, source.record], ['mine', 1, {made: 'by hand'}]);
  assert.equal(source.poseAt, poseAt);
  assert.ok(Object.isFrozen(source));
  assert.throws(() => motionSource(null), /a motion source is \{name, poseAt\(t\)\}, not null/);
  assert.throws(() => motionSource({poseAt}), /a motion source needs a name \(a word the record and the refusals use\), not undefined/);
  assert.throws(() => motionSource({name: '  ', poseAt}), /needs a name/);
  assert.throws(() => motionSource({name: 'still'}), /the motion source "still" needs poseAt\(t\): the pose at t seconds/);
});

test('checkPose names every key that is wrong, the joints\' too, and passes a good pose as it is', () => {
  const good = plan().at(4), joints = {torso: .1, neck: 0, arms: [{shoulder: .3, elbow: .2}, {shoulder: -.3, elbow: .1}], legs: [{hip: .2, knee: -.4}, {hip: 0, knee: 0}]};
  assert.equal(checkPose(good), good);
  const withJoints = {...good, joints};
  assert.equal(checkPose(withJoints), withJoints);
  assert.throws(() => checkPose({...good, x: NaN, facing: 0, feet: [{x: 1, lift: 0}, {x: 'a', lift: 0}]}, 'frame 3'),
    /^Error: frame 3: x is a number \(px\), not NaN; feet\[1\]\.x is a number \(px\), not "a"; facing is 1 or -1, not 0$/);
  assert.throws(() => checkPose({...good, joints: {...joints, arms: [{shoulder: 1}, {shoulder: 0, elbow: 0}]}}), /joints\.arms\[0\]\.elbow is a number \(radians\), not undefined/);
  assert.throws(() => checkPose({...good, joints: {torso: 0, neck: 0, arms: [], legs: joints.legs}}), /joints\.arms is \[\{shoulder, elbow\}, \{shoulder, elbow\}\]/);
  assert.throws(() => checkPose({...good, walking: 1, phase: 2}), /walking is true or false, not 1; phase is the source's name for where it is, not 2/);
  assert.throws(() => checkPose(undefined), /pose: a pose is \{x, lift, lean, feet, swing, turn, facing, walking, phase, joints\?\}, not undefined/);
});
