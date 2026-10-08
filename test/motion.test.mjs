// Two cartoon habits for the figures a kit draws (motion.mjs): drawings held for two frames while the camera moves on
// every frame (heldTime), and parts that hang off a moving body lagging, swinging past and settling (follow, lag).
import test from 'node:test';
import assert from 'node:assert/strict';
import {heldTime, TIMINGS, TIMING_NAMES, follow, lag} from '../src/motion.mjs';

const frame = (t, fps = 30) => Math.round(t * fps);

test('on twos each drawing holds for two frames; threes for three; ones is the moment itself', () => {
  assert.deepEqual(Array.from({length: 7}, (_, f) => frame(heldTime(f / 30, 'twos'))), [0, 0, 2, 2, 4, 4, 6]);
  assert.deepEqual(Array.from({length: 7}, (_, f) => frame(heldTime(f / 30, 'threes'))), [0, 0, 0, 3, 3, 3, 6]);
  assert.deepEqual(Array.from({length: 7}, (_, f) => frame(heldTime(f / 30, 4))), [0, 0, 0, 0, 4, 4, 4]);
  for (const t of [0, 1 / 30, .4567, 12.3]) assert.equal(heldTime(t, 'ones'), t);
  assert.equal(heldTime(13 / 30), heldTime(12 / 30), 'twos is the default');
  // At another rate the frames are that rate's: a film rendered at 60 holds each drawing for two of its frames.
  assert.deepEqual(Array.from({length: 4}, (_, f) => frame(heldTime(f / 60, 'twos', {fps: 60}), 60)), [0, 0, 2, 2]);
  assert.deepEqual(TIMING_NAMES, ['ones', 'twos', 'threes']); assert.equal(TIMINGS.twos, 2);
});

test('motion blur: the sub-moments of a frame (within half a frame of it) share that frame\'s drawing', () => {
  for (let f = 0; f < 12; f++) {
    const held = heldTime(f / 30);
    for (const off of [-.49, -.25, 0, .25, .49]) assert.equal(heldTime((f + off) / 30), held, `frame ${f}, sub-moment ${off}`);
  }
});

test('timing refusals name the fix', () => {
  assert.throws(() => heldTime(1, 'fours'), /no timing called "fours" \(the timings are ones, twos, threes, or the frames each drawing holds, 1–8\)/);
  assert.throws(() => heldTime(1, 0), /a timing is a name \(ones, twos, threes\) or the frames each drawing holds, 1–8, not 0/);
  assert.throws(() => heldTime(1, 2.5), /not 2\.5/);
  assert.throws(() => heldTime(1, 'twos', {fps: 0}), /fps is the film's frames a second/);
});

// A body that stands still for 1 s, walks at 500 px/s for 3 s, and stops.
const walk = u => (u < 1 ? 0 : u < 4 ? (u - 1) * 500 : 1500);

test('follow-through: at rest on the body; leaning back as it sets off, hanging straight while it moves, swinging past as it stops, then settled', () => {
  const at = t => lag(walk, t, {from: 0}), span = (a, b) => Array.from({length: Math.round((b - a) * 120) + 1}, (_, i) => at(a + i / 120));
  assert.equal(at(-1), 0); assert.equal(at(0), 0); assert.equal(at(.9), 0);
  assert.ok(Math.min(...span(1, 1.5)) < -5, 'as the body sets off the part is left behind');
  assert.ok(Math.abs(at(3.9)) < .05, `walking steadily it hangs as at rest (${at(3.9)})`);
  assert.ok(Math.max(...span(4, 4.6)) > 5, 'as the body stops the part swings on past it');
  assert.ok(Math.abs(at(7)) < .01, 'and settles');
  // default (critically damped) swings past as the body stops, but comes back without swinging the other way.
  const calm = Array.from({length: 240}, (_, i) => lag(walk, 4 + i / 60, {from: 0, feel: 'default'})), peak = calm.indexOf(Math.max(...calm));
  assert.ok(calm[peak] > 1 && calm.slice(peak).every(v => v > -1e-6));
});

test('drag: the air holds a part back while the body moves, by drag × speed ÷ stiffness (a hem, a scarf)', () => {
  const trail = lag(walk, 3.9, {from: 0, drag: 5});
  assert.ok(Math.abs(trail - -5 * 500 / 220) < .05, `steady trail ${trail}`);
  assert.ok(Math.abs(lag(walk, 8, {from: 0, drag: 5})) < .01, 'still, it hangs straight again');
});

test('follow is a pure function of time: the same value however the frames were drawn, and for a point as for a number', () => {
  const one = u => walk(u), two = u => walk(u);
  const direct = follow(one, 5.123, {from: 0});
  follow(two, 7.5, {from: 0}); follow(two, 2.2, {from: 0}); follow(two, 5.9, {from: 0});
  assert.equal(follow(two, 5.123, {from: 0}), direct);
  // A fresh function every frame gives the same numbers (it only starts from `from` each time).
  assert.equal(follow(u => walk(u), 5.123, {from: 0}), direct);
  const p = follow(u => [walk(u), 40], 4.2, {from: 0});
  assert.equal(p.length, 2); assert.equal(p[0], follow(walk, 4.2, {from: 0})); assert.ok(Math.abs(p[1] - 40) < 1e-9);
  assert.deepEqual(lag(u => [walk(u), 40], 0.5, {from: 0}), [0, 0]);
});

test('follow refusals name the fix', () => {
  assert.throws(() => follow(42, 1), /body is a function of time/);
  assert.throws(() => follow(u => (u < 1 ? 0 : null), 2), /at u = 1 it gave null \(give the place even while the body is out of sight\)/);
  assert.throws(() => follow(u => (u < 1 ? [0, 0] : [0]), 2), /the same shape at every moment/);
  assert.throws(() => follow(walk, NaN), /t and from are seconds/);
  assert.throws(() => follow(walk, 1, {feel: 'bouncy'}), /no feel called "bouncy"/);
  assert.throws(() => follow(walk, 1, {feel: {k: 1e6, d: 10}}), /k up to 20 000 and d up to 240/);
  assert.throws(() => follow(walk, 1, {drag: -1}), /drag is how hard the air holds the part back, per second, 0–240/);
});
