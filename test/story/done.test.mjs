// The standing per scene: known, not sure or ask, and the asks listed for the owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readStoryboard} from 'footprint-story/storyboard';
import {CHAT, STORY} from './fakes.test.mjs';
import {standingOf} from '../../src/storyboard/story/done/standing.mjs';

const board = readStoryboard(STORY, {conversation: CHAT});
const pts = (overrides = {}) => [
  {part: 'checked', sources: ['m1'], standing: 'known', why: 'cited'},
  {part: 'checked', sources: ['m2'], standing: 'known', why: 'cited'},
  {part: 'checked', sources: ['m3'], standing: 'known', why: 'cited'},
  {part: 'found', sources: ['m1', 'm2'], standing: 'known', why: 'cited'},
  {part: 'unsure', sources: [], standing: 'not-sure', why: 'unsure'},
].map((p, k) => ({...p, ...overrides[k]}));

test('every scene is known when its point is, and unsure is not sure', () => {
  const {standing, ask} = standingOf(board, pts(), []);
  assert.deepEqual(Object.fromEntries(Object.entries(standing).map(([id, s]) => [id, s.standing])), {title: 'known', 'checked-1': 'known', 'checked-2': 'known', 'checked-3': 'known', 'found-1': 'known', 'unsure-1': 'not-sure', next: 'known'});
  assert.equal(standing['found-1'].point, 3);
  assert.deepEqual(ask, []);
});

test('a fixed piece is not sure; a disagreeing point is ask, listed for the owner', () => {
  const {standing, ask} = standingOf(board, pts({1: {standing: 'ask', why: 'disagree'}}), ['checked[0]', 'frame']);
  assert.equal(standing['checked-1'].standing, 'not-sure');
  assert.equal(standing.title.standing, 'not-sure');
  assert.equal(standing['checked-2'].standing, 'ask');
  assert.deepEqual(ask.map((a) => a.scene), ['checked-2']);
  assert.match(ask[0].why, /only the owner can say which is right/);
});

test('a scene no point rests on is ask; an ask point no scene tells and a refused window are listed too', () => {
  const points = pts().filter((p) => p.sources[0] !== 'm3');
  points.push({part: 'found', sources: [], standing: 'ask', why: 'cites-nothing'});
  const {standing, ask} = standingOf(board, points, [], [2]);
  assert.equal(standing['checked-3'].standing, 'ask');
  assert.deepEqual(ask.map((a) => Object.keys(a)[0]), ['scene', 'point', 'window']);
});
