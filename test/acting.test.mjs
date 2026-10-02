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

test('follows: the head follows where the eyes went, a moment later', () => {
  const eyes = t => (t >= 1 ? 1 : 0), head = follows(eyes, .15);
  assert.deepEqual([eyes(1.05), head(1.05), head(1.2)], [1, 0, 1]);
});
