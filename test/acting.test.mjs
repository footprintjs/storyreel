// Acting (acting.mjs): a mood change is acted — the eyes squint just before it, the face swaps under the
// squint, a take stretches and settles, colours cross-fade — and the idle layer breathes, blinks and sways,
// never in step between two characters.
import test from 'node:test';
import assert from 'node:assert/strict';
import {moodAt, idleAt, follows, ACTING} from '../src/acting.mjs';

const keys = [{at: 0, mood: 'idle'}, {at: 2, mood: 'surprised'}, {at: 5, mood: 'smile', take: 0}];

test('the mood now, and the one it is changing from', () => {
  assert.equal(moodAt(keys, -1).mood, 'idle', 'before the first key: its mood');
  assert.equal(moodAt(keys, 1).mood, 'idle'); assert.equal(moodAt(keys, 1).from, null);
  const at = moodAt(keys, 2.15);
  assert.deepEqual([at.mood, at.from], ['surprised', 'idle']);
  assert.ok(at.u > 0 && at.u < 1, 'the colours are cross-fading');
  assert.equal(moodAt(keys, 3).u, 1, 'after the fade, fully the new mood');
});

test('anticipation: the eyes close just before a change and open just after it', () => {
  assert.equal(moodAt(keys, 1).anticipation, 0);
  assert.ok(moodAt(keys, 2 - ACTING.anticipate / 2).anticipation > .4, 'closing before the change');
  assert.ok(moodAt(keys, 2 + ACTING.reopen / 2).anticipation > .4, 'opening after it');
  assert.equal(moodAt(keys, 2.5).anticipation, 0);
  assert.equal(moodAt(keys, -.05).anticipation, 0, 'the first key is not a change: no squint before it');
  const same = [{at: 0, mood: 'idle'}, {at: 1, mood: 'idle'}];
  assert.deepEqual([moodAt(same, .95).anticipation, moodAt(same, 1.02).anticipation, moodAt(same, 1.1).take], [0, 0, 0], 'a key that repeats the mood is no change');
});

test('a take stretches, falls back past rest, and settles; a change with take 0 only cross-fades', () => {
  const takes = [.05, .1, .2, .3, .38].map(dt => moodAt(keys, 2 + dt).take);
  assert.ok(Math.max(...takes) > .3, 'it stretches');
  assert.ok(Math.min(...takes) < 0, 'it falls back past rest');
  const fine = Array.from({length: 4001}, (_, k) => moodAt(keys, 2 + k / 10000).take);
  assert.ok(Math.abs(Math.max(...fine) - 1) < 1e-4, 'the first swing peaks at the key\'s take');
  assert.ok(Math.abs(Math.min(...fine) + ACTING.overshoot) < 1e-4, 'the second swing is overshoot of it');
  const half = [{at: 0, mood: 'a'}, {at: 1, mood: 'b', take: .5}];
  assert.ok(Math.abs(Math.max(...Array.from({length: 400}, (_, k) => moodAt(half, 1 + k / 1000).take)) - .5) < 1e-3, 'a half take swings half as far');
  assert.equal(moodAt(keys, 2 + ACTING.settle + .01).take, 0, 'it settles');
  assert.equal(moodAt(keys, 5.1).take, 0, 'take 0: no stretch');
  assert.ok(moodAt(keys, 2.2).settle > 0 && moodAt(keys, 3).settle === 1);
});

test('one change at a time: a repeat is no change, changes too close or at one moment refuse, and so do bad timings', () => {
  // A key that repeats the mood just before a real change does not hide the change's squint.
  const withRepeat = [{at: 0, mood: 'idle'}, {at: .95, mood: 'idle'}, {at: 1, mood: 'surprised'}];
  assert.deepEqual([.92, .95, .98].map(t => +moodAt(withRepeat, t).anticipation.toFixed(2)), [.2, .5, .8]);
  assert.throws(() => moodAt([{at: 0, mood: 'calm'}, {at: 1, mood: 'surprised'}, {at: 1.1, mood: 'smile'}], 1.2), /the change to "smile" at 1.1 s comes 0.10 s after the change to "surprised"; a change takes 0.4 s to settle/);
  assert.equal(moodAt([{at: 0, mood: 'calm'}, {at: 1, mood: 'surprised'}, {at: 1.4, mood: 'smile'}], 1.5).mood, 'smile', 'a settle apart is fine');
  assert.throws(() => moodAt([{at: 1, mood: 'calm'}, {at: 1, mood: 'surprised'}], 1), /"calm" and "surprised" are both at 1 s; a character has one mood at a time/);
  assert.throws(() => moodAt(keys, NaN), /t is a time in seconds/);
  for (const [option, value] of [['fade', -1], ['anticipate', 0], ['settle', NaN], ['reopen', Infinity]]) assert.throws(() => moodAt(keys, 1, {[option]: value}), new RegExp(`${option} is seconds, above 0`));
  // Every number moves smoothly from frame to frame (60 a second) across a whole performance.
  const show = [{at: 0, mood: 'calm'}, {at: 1, mood: 'surprised'}, {at: 1.5, mood: 'smile', take: .5}, {at: 2.2, mood: 'calm', take: 0}];
  let last = moodAt(show, 0), worst = 0;
  for (let k = 1; k <= 180; k++) { const now = moodAt(show, k / 60); worst = Math.max(worst, Math.abs(now.take - last.take)); last = now; }
  assert.ok(worst < .6, `the take never jumps (largest step ${worst.toFixed(2)})`);
});

test('keys out of order or misshapen refuse', () => {
  assert.throws(() => moodAt([{at: 2, mood: 'a'}, {at: 1, mood: 'b'}], 0), /give the keys in time order/);
  assert.throws(() => moodAt([{at: 0}], 0), /must be \{at: seconds, mood/);
  assert.throws(() => moodAt([], 0), /keys is a list/);
  assert.throws(() => moodAt([{at: 0, mood: 'a', take: 2}], 0), /take is 0..1/);
  assert.throws(() => moodAt(keys, 0, {overshoot: 0}), /overshoot is how far/);
});

test('the idle layer is a pure function of time, and two seeds never move in step', () => {
  assert.deepEqual(idleAt(3.3, {seed: 1}), idleAt(3.3, {seed: 1}));
  const a = Array.from({length: 120}, (_, k) => idleAt(k / 10, {seed: 1})), b = Array.from({length: 120}, (_, k) => idleAt(k / 10, {seed: 2}));
  assert.ok(a.some((x, k) => Math.abs(x.sway - b[k].sway) > .5), 'their sways differ');
  assert.ok(a.some(x => x.blink > .5), 'it blinks');
  const blinksA = a.map(x => x.blink > .5), blinksB = b.map(x => x.blink > .5);
  assert.ok(blinksA.some((x, k) => x !== blinksB[k]), 'they do not blink together');
  assert.ok(a.every(x => Math.abs(x.breath - 1) <= .0125), 'a breath is a small scale');
  assert.throws(() => idleAt(1, {seed: 'x'}), /seed is a number/);
});

test('the idle layer refuses timings that would hang or say nothing, and costs the same at any moment', () => {
  for (const [options, re] of [[{blinkEvery: 0}, /blinkEvery is seconds between blinks, above 0/], [{blinkEvery: -1}, /blinkEvery/], [{blinkEvery: 1e-9}, /blinkFor is how long a blink takes/],
    [{breathEvery: 0}, /breathEvery is a period in seconds, above 0/], [{swayEvery: NaN}, /swayEvery/], [{blinkFor: -.1}, /blinkFor/], [{sway: Infinity}, /sway is a number/]]) assert.throws(() => idleAt(5, options), re);
  for (const t of [NaN, Infinity]) assert.throws(() => idleAt(t), /t is a time in seconds/);
  const blinks = (options, seconds = 60) => Array.from({length: seconds * 60}, (_, k) => idleAt(k / 60, options).blink).filter((b, k, all) => b > .5 && !(all[k - 1] > .5)).length;
  assert.equal(blinks({blinkEvery: Infinity}), 0, 'blinkEvery: Infinity never blinks');
  assert.equal(blinks({blinkFor: 0}), 0, 'nor does blinkFor: 0');
  const n = blinks({seed: 3});
  assert.ok(n >= 12 && n <= 19, `about one blink every 3.8 s (${n} in a minute)`);
  const t0 = performance.now(); for (let k = 0; k < 2000; k++) idleAt(36000 + k / 60, {seed: 2}); const late = performance.now() - t0;
  assert.ok(late < 200, `ten hours in, a frame's idle layer is as quick as at the start (${late.toFixed(1)} ms for 2000)`);
});

test('follows: the head follows where the eyes went, a moment later', () => {
  const eyes = t => (t >= 1 ? 1 : 0), head = follows(eyes, .15);
  assert.deepEqual([eyes(1.05), head(1.05), head(1.2)], [1, 0, 1]);
});

test('before the first key the next change is still anticipated; options are checked by name', () => {
  const soon = [{at: 2, mood: 'a'}, {at: 2.6, mood: 'b'}];
  assert.ok(moodAt(soon, 2.55).anticipation > .4, 'squinting into the change');
  const quick = [{at: 2, mood: 'a'}, {at: 2.02, mood: 'b'}];
  assert.ok(Math.abs(moodAt(quick, 1.999).anticipation - moodAt(quick, 2.001).anticipation) < .1, 'no jump at the first key');
  assert.deepEqual(moodAt(quick, 5, null).mood, 'b', 'null options: the defaults');
  assert.throws(() => moodAt(quick, 1, {setle: 5}), /unknown option setle; the timing takes anticipate, reopen, fade, settle, overshoot/);
  assert.throws(() => idleAt(1, {blink: 3}), /idleAt: unknown option blink/);
});
