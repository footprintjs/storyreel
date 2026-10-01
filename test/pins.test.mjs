import test from 'node:test';
import assert from 'node:assert/strict';
import {frameHashes} from '../src/index.mjs';
import {compileExample} from './golden.mjs';

const film = await compileExample('hello');

test('frameHashes: 24 evenly spaced moments by default, the first at 0', () => {
  const pins = frameHashes(film, {width: 160});
  assert.equal(Object.keys(pins).length, 24);
  assert.equal(Object.keys(pins)[0], '0');
});

test('frameHashes times: hashes exactly the moments named (rounded to the millisecond), the same as even spacing draws them', () => {
  const even = frameHashes(film, {count: 5, width: 160}), moments = Object.keys(even).map(Number);
  assert.deepEqual(frameHashes(film, {times: moments, width: 160}), even, 'the same moment draws the same pixels, whichever way it was named');
  const still = film.moments().map(m => m.t), pins = frameHashes(film, {times: still, width: 160});
  assert.deepEqual(Object.keys(pins).map(Number).sort((a, b) => a - b), still.map(t => +t.toFixed(3)).sort((a, b) => a - b));
  assert.ok(Object.values(pins).every(h => /^[0-9a-f]{16}$/.test(h)));
  assert.deepEqual(Object.keys(frameHashes(film, {times: [1.23456], width: 160})), ['1.235']);
});

test('frameHashes times: anything but a list of moments inside the film refuses', () => {
  assert.throws(() => frameHashes(film, {times: []}), /times must be a list of moments/);
  assert.throws(() => frameHashes(film, {times: 3}), /times must be a list of moments/);
  assert.throws(() => frameHashes(film, {times: [1, '2']}), /the moment "2" is not a number of seconds/, 'a string is quoted, so it does not read as a number');
  assert.throws(() => frameHashes(film, {times: [-1]}), /the moment -1 is not/);
  assert.throws(() => frameHashes(film, {times: [film.total + 1]}), /from 0 to the film's end/);
  assert.throws(() => frameHashes(film, {times: [NaN]}), /the moment NaN is not/);
});

test('frameHashes times: two moments that round to the same millisecond refuse (one would be lost)', () => {
  assert.throws(() => frameHashes(film, {times: [1, 1.0004]}), /the moments 1 and 1\.0004 are the same millisecond \(1\); name each moment once/);
  assert.throws(() => frameHashes(film, {times: [2, 2]}), /same millisecond/);
  assert.deepEqual(Object.keys(frameHashes(film, {times: [1, 1.001], width: 160})), ['1', '1.001'], 'a millisecond apart is two moments');
});

test('frameHashes: count and times together refuse (one would be ignored)', () => {
  assert.throws(() => frameHashes(film, {count: 5, times: [1]}), /give count \(evenly spaced moments\) or times \(the moments you name\), not both/);
});
