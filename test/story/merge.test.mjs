// The merge: duplicates kept once and disagreements marked ask, within a window (the only place two points can share a
// message); a claim citing nothing marked ask; at most 24 points. Across windows nothing is merged yet, and this says so.
import test from 'node:test';
import assert from 'node:assert/strict';
import {MOST_POINTS, mergePoints, pointFacts} from '../../src/storyboard/story/merge/merge.mjs';

test('two points of one window on a shared message saying the same numbers are one, with both their sources', () => {
  const {points, conflicts} = mergePoints([[{part: 'found', text: 'It waited 41 minutes', sources: ['m1']}, {part: 'found', text: '41 minutes of waiting', sources: ['m1', 'm2']}]]);
  assert.equal(points.length, 1);
  assert.deepEqual(points[0].sources, ['m1', 'm2']);
  assert.equal(points[0].standing, 'known');
  assert.equal(conflicts, 0);
});

test('two points of one window on the same message with different numbers are marked ask, never settled', () => {
  const {points, conflicts} = mergePoints([[{part: 'found', text: 'It waited 41 minutes', sources: ['m1']}, {part: 'found', text: 'It waited 14 minutes', sources: ['m1']}]]);
  assert.equal(points.length, 1);
  assert.equal(points[0].standing, 'ask');
  assert.equal(points[0].why, 'disagree');
  assert.equal(conflicts, 1);
});

test('across windows nothing is merged: each window cites only its own messages, so a disagreement there is not found yet', () => {
  const {points, conflicts} = mergePoints([[{part: 'found', text: 'It waited 41 minutes', sources: ['m1']}], [{part: 'found', text: 'It waited 14 minutes', sources: ['m9']}]]);
  assert.deepEqual(points.map((p) => p.standing), ['known', 'known']);
  assert.equal(conflicts, 0);
});

test('different parts, or no shared message, stay apart; unsure is not sure; a claim citing nothing is ask', () => {
  const {points} = mergePoints([[{part: 'found', text: 'a 1', sources: ['m1']}, {part: 'checked', text: 'a 2', sources: ['m1']}, {part: 'found', text: 'b 3', sources: ['m2']}, {part: 'unsure', text: 'c', sources: []}, {part: 'found', text: 'd', sources: []}, {part: 'next', text: 'e', sources: []}]]);
  assert.deepEqual(points.map((p) => p.standing), ['known', 'known', 'known', 'not-sure', 'ask', 'known']);
});

test('at most 24 points, the rest counted; the facts carry ordinals, never a point\'s words or a message id', () => {
  const many = Array.from({length: 30}, (_, i) => ({part: 'checked', text: `point ${i}`, sources: [`m${i}`]}));
  const {points, dropped} = mergePoints([many]);
  assert.equal(points.length, MOST_POINTS);
  assert.equal(dropped, 6);
  assert.deepEqual(pointFacts(points[3], (id) => Number(id.slice(1)) + 100), {part: 'checked', sources: [103], standing: 'known', why: 'cited'});
});
