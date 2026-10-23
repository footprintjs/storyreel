// Counting on fingers (fingers.mjs): which finger moves and when, timed as an animator times it — a wind-back before,
// a quick move, an overshoot and a settle after — in a counting order that is data, with the impossible keys refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fingersAt, FINGERS, FINGER_NAMES, COUNTING_ORDERS} from '../src/acting.mjs';

const THUMB = 0, INDEX = 1, LITTLE = 4;
const takeAway = [{at: 0, up: 10}, {at: 1, fold: 1}, {at: 2, fold: 1}, {at: 3, fold: 3}];
const finger = (keys, t, hand, f, options) => fingersAt(keys, t, options).hands[hand][f];

test('ten up, then one folds a beat: the count says the number, the finger raised last folds first', () => {
  const start = fingersAt(takeAway, .5);
  assert.deepEqual([start.up, start.from], [10, null]);
  assert.deepEqual(start.hands, {left: [1, 1, 1, 1, 1], right: [1, 1, 1, 1, 1]}, 'all ten straight');
  const after = fingersAt(takeAway, 1.6);
  assert.deepEqual([after.up, after.from], [9, 10], 'the count changes on the beat');
  assert.deepEqual(after.hands.right, [1, 1, 1, 1, 0], 'thumb first, left hand first: the right little finger was the tenth, so it folds first');
  assert.deepEqual(fingersAt(takeAway, 2.6).hands.right, [1, 1, 1, 0, 0], 'then the ring finger');
  const five = fingersAt(takeAway, 4);
  assert.equal(five.up, 5);
  assert.deepEqual(five.hands, {left: [1, 1, 1, 1, 1], right: [0, 0, 0, 0, 0]}, 'fold 3 folds the rest of the right hand');
  assert.equal(fingersAt(takeAway, -3).up, 10, 'before the first key: its count');
});

test('a finger winds back before it moves, moves quickly, overshoots and settles', () => {
  const {anticipate, move, settle, lift, overshoot} = FINGERS, at = 1;
  const e = t => finger(takeAway, t, 'right', LITTLE);
  assert.equal(e(at - anticipate - .01), 1, 'still before the wind-back');
  assert.ok(Math.abs(e(at) - (1 + lift)) < 1e-9, 'a finger about to fold lifts a little first');
  assert.ok(e(at - anticipate / 2) > 1 && e(at - anticipate / 2) < 1 + lift, 'lifting');
  assert.ok(e(at + move / 2) < .6 && e(at + move / 2) > .4, 'halfway down mid-move: a quick move');
  assert.ok(Math.abs(e(at + move) + overshoot) < 1e-9, 'it curls past folded by the overshoot');
  assert.ok(e(at + move + settle / 2) < 0, 'settling back');
  assert.equal(e(at + move + settle), 0, 'settled: exactly folded');
  // Smooth from frame to frame (240 a second): no jump anywhere.
  let worst = 0;
  for (let k = 1; k <= 240 * 5; k++) worst = Math.max(worst, Math.abs(e(k / 240) - e((k - 1) / 240)));
  assert.ok(worst < .2, `no jumps (largest step ${worst.toFixed(3)})`);
  // A raise is the mirror: it curls a little, then rises past straight and settles.
  const up = [{at: 0, up: 0}, {at: 1, raise: 1}];
  assert.ok(Math.abs(finger(up, 1, 'left', THUMB) + lift) < 1e-9, 'a finger about to rise curls a little first');
  assert.ok(Math.abs(finger(up, 1 + move, 'left', THUMB) - (1 + overshoot)) < 1e-9, 'and passes straight');
  assert.equal(finger(up, 1 + move + settle, 'left', THUMB), 1);
});

test('counting back by raising: "nineteen" raises one, "eighteen" raises two', () => {
  const steps = [{at: 0, up: 0}, {at: 1, raise: 1}, {at: 1.5, raise: 1}, {at: 2, raise: 1}];
  assert.deepEqual([.5, 1.2, 1.7, 3].map(t => fingersAt(steps, t).up), [0, 1, 2, 3]);
  assert.deepEqual(fingersAt(steps, 3).hands.left, [1, 1, 1, 0, 0], 'thumb, index, middle on the left hand');
  assert.deepEqual(fingersAt([{at: 0, up: 4}, {at: 1, raise: 2}], 2).hands, {left: [1, 1, 1, 1, 1], right: [1, 0, 0, 0, 0]}, 'past five the count goes on to the other hand\'s thumb');
});

test('one key may move several fingers, one after another; up sets the count', () => {
  const keys = [{at: 0, up: 10}, {at: 1, fold: 3}];
  const {stagger, anticipate} = FINGERS;
  assert.equal(finger(keys, 1, 'right', LITTLE), 1 + FINGERS.lift, 'the first finger starts on the beat');
  assert.equal(finger(keys, 1 + stagger - anticipate - .001, 'right', 3), 1, 'the next waits its stagger');
  assert.deepEqual(fingersAt(keys, 2).hands.right, [1, 1, 0, 0, 0]);
  assert.deepEqual(fingersAt([{at: 0, up: 0}, {at: 1, up: 7}], 3).hands, {left: [1, 1, 1, 1, 1], right: [1, 1, 0, 0, 0]});
  assert.deepEqual([fingersAt([{at: 0, up: 3}, {at: 1, up: 3}], 2).up, fingersAt([{at: 0, up: 3}, {at: 1, up: 3}], 2).from], [3, null], 'up to the count it has is no change');
});

test('the counting order is data: by name, as five fingers, and either hand first', () => {
  assert.deepEqual(FINGER_NAMES, ['thumb', 'index', 'middle', 'ring', 'little']);
  assert.deepEqual(Object.keys(COUNTING_ORDERS), ['thumb-first', 'index-first', 'little-first']);
  const one = [{at: 0, up: 1}];
  assert.deepEqual(fingersAt(one, 0).hands.left, [1, 0, 0, 0, 0], 'the default: the left thumb counts one');
  assert.deepEqual(fingersAt(one, 0, {order: 'index-first'}).hands.left, [0, 1, 0, 0, 0]);
  assert.deepEqual(fingersAt(one, 0, {order: 'little-first', first: 'right'}).hands, {left: [0, 0, 0, 0, 0], right: [0, 0, 0, 0, 1]});
  assert.deepEqual(fingersAt([{at: 0, up: 2}], 0, {order: ['middle', 'index', 'thumb', 'ring', 'little']}).hands.left, [0, 1, 1, 0, 0]);
  assert.deepEqual(fingersAt([{at: 0, up: 7}], 0, {order: ['middle', 'index', 'thumb', 'ring', 'little']}).hands.right, [0, 1, 1, 0, 0], 'a custom order counts on the second hand the same way');
});

test('impossible keys refuse, naming the problem', () => {
  const refuses = (keys, re, options) => assert.throws(() => fingersAt(keys, 1, options), re);
  refuses([{at: 0, up: 2}, {at: 1, fold: 3}], /key 1 \(fold 3 at 1 s\) folds 3 but only 2 are up: fold at most 2/);
  refuses([{at: 0, up: 9}, {at: 1, raise: 2}], /raises 2 but 9 are already up: two hands hold ten fingers, so raise at most 1/);
  refuses([{at: 0, up: 11}], /key 0's up is how many fingers are up, a whole number 0..10, not 11/);
  refuses([{at: 0, up: 5}, {at: 1, fold: 1.5}], /key 1's fold is how many fingers move, a whole number 1..10/);
  refuses([{at: 0, up: 5}, {at: 1, fold: 0}], /fold is how many fingers move, a whole number 1..10, not 0/);
  refuses([{at: 0, fold: 1}], /the first key says how many fingers are up from the start, \{at, up: n\}, not fold 1 at 0 s/);
  refuses([{at: 0, up: 5}, {at: 1, fold: 1, raise: 1}], /key 1 must be \{at: seconds\} with one of up, fold or raise/);
  refuses([{at: 2, up: 5}, {at: 1, fold: 1}], /key 1 \(fold 1 at 1 s\) comes before key 0 \(2 s\); give the keys in time order/);
  refuses([], /keys is a list/);
  refuses([{at: 0, up: 10}, {at: 1, fold: 1}, {at: 1.1, fold: 1}], /key 2 \(fold 1 at 1.1 s\) comes 0.10 s after the last finger of the change before it starts moving; a finger takes 0.2 s/);
  refuses([{at: 0, up: 10}, {at: 1, fold: 1}, {at: 1.25, raise: 1}], /moves a finger at 1.25 s that is still settling until 1.32 s/);
  refuses([{at: 0, up: 1}], /no counting order called "thumbs" \(the orders are thumb-first, index-first, little-first/, {order: 'thumbs'});
  refuses([{at: 0, up: 1}], /order is a counting order's name or the five fingers/, {order: ['thumb', 'thumb', 'index', 'ring', 'little']});
  refuses([{at: 0, up: 1}], /first is the hand that counts first, 'left' or 'right'/, {first: 'top'});
  refuses([{at: 0, up: 1}], /unknown option speed; it takes anticipate, move/, {speed: 2});
  refuses([{at: 0, up: 1}], /move is seconds, above 0/, {move: 0});
  refuses([{at: 0, up: 1}], /overshoot is how far a finger passes its end/, {overshoot: .7});
  // A number given as text, or null, is no number: it refuses instead of being read as one.
  refuses([{at: 0, up: 1}], /overshoot is how far a finger passes its end, .*: a number 0 or more, under 0.5 \(e.g. 0.1\), not "0.1"/, {overshoot: '0.1'});
  refuses([{at: 0, up: 1}], /lift is how far a finger passes its end, .* not null/, {lift: null});
  refuses([{at: 0, up: 1}], /move is seconds, above 0 \(e.g. 0.12\), not "0.2"/, {move: '0.2'});
  refuses([{at: 0, up: 1}], /stagger is the seconds between fingers .* not null/, {stagger: null});
  refuses([{at: 0, up: 1}], /order is a counting order's name or the five fingers/, {order: null});
  assert.throws(() => fingersAt([{at: 0, up: 1}], NaN), /t is a time in seconds/);
  assert.doesNotThrow(() => fingersAt([{at: 0, up: 10}, {at: 1, fold: 1}, {at: 1.2, fold: 1}], 2), 'anticipate + move apart is enough for another finger');
});

test('a pure function of time: the same keys and t give the same hands, in any order', () => {
  const ts = Array.from({length: 50}, (_, k) => k * .09);
  const forward = ts.map(t => fingersAt(takeAway, t)), backward = [...ts].reverse().map(t => fingersAt(takeAway, t)).reverse();
  assert.deepEqual(forward, backward);
});
