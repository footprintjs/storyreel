// The merge: duplicates kept once, a disagreement marked ask, a claim citing nothing marked ask, at most 24 points.
import test from 'node:test';
import assert from 'node:assert/strict';
import {MOST_POINTS, mergePoints, pointFacts} from '../../src/storyboard/story/merge/merge.mjs';

test('two points of a part on a shared message saying the same numbers are one, with both their sources', () => {
  const {points, conflicts} = mergePoints([[{part: 'found', text: 'It waited 41 minutes', sources: ['m1']}], [{part: 'found', text: '41 minutes of waiting', sources: ['m1', 'm2']}]]);
  assert.equal(points.length, 1);
  assert.deepEqual(points[0].sources, ['m1', 'm2']);
  assert.equal(points[0].standing, 'known');
  assert.equal(conflicts, 0);
});

test('two points on the same messages with different numbers are marked ask, never settled', () => {
  const {points, conflicts} = mergePoints([[{part: 'found', text: 'It waited 41 minutes', sources: ['m1']}], [{part: 'found', text: 'It waited 14 minutes', sources: ['m1']}]]);
  assert.equal(points.length, 1);
  assert.equal(points[0].standing, 'ask');
  assert.equal(points[0].why, 'disagree');
  assert.equal(conflicts, 1);
});

test('different parts, or no shared message, stay apart; unsure is not sure; a claim citing nothing is ask', () => {
  const {points} = mergePoints([[{part: 'found', text: 'a 1', sources: ['m1']}, {part: 'checked', text: 'a 2', sources: ['m1']}, {part: 'found', text: 'b 3', sources: ['m2']}, {part: 'unsure', text: 'c', sources: []}, {part: 'found', text: 'd', sources: []}, {part: 'next', text: 'e', sources: []}]]);
  assert.deepEqual(points.map((p) => p.standing), ['known', 'known', 'known', 'not-sure', 'ask', 'known']);
});

test('at most 24 points, the rest counted; the facts never carry a point\'s words', () => {
  const many = Array.from({length: 30}, (_, i) => ({part: 'checked', text: `point ${i}`, sources: [`m${i}`]}));
  const {points, dropped} = mergePoints([many]);
  assert.equal(points.length, MOST_POINTS);
  assert.equal(dropped, 6);
  assert.deepEqual(Object.keys(pointFacts(points[0])), ['part', 'sources', 'standing', 'why']);
});
