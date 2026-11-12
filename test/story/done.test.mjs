// The standing per scene: known, not sure or ask, and the asks listed for the owner. Sources are ordinals (m1 is 0).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readStoryboard} from 'footprint-story/storyboard';
import {CHAT, STORY} from './fakes.test.mjs';
import {standingOf} from '../../src/storyboard/story/done/standing.mjs';

const board = readStoryboard(STORY, {conversation: CHAT});
const ordinalOf = (id) => Number(id.slice(1)) - 1;
const pts = (overrides = {}) => [
  {part: 'checked', sources: [0], standing: 'known', why: 'cited'},
  {part: 'checked', sources: [1], standing: 'known', why: 'cited'},
  {part: 'checked', sources: [2], standing: 'known', why: 'cited'},
  {part: 'found', sources: [0, 1], standing: 'known', why: 'cited'},
  {part: 'unsure', sources: [], standing: 'not-sure', why: 'unsure'},
].map((p, k) => ({...p, ...overrides[k]}));
const standingsOf = ({standing}) => Object.fromEntries(Object.entries(standing).map(([id, s]) => [id, s.standing]));

test('every scene is known when its point is, and unsure is not sure; sources are ordinals', () => {
  const result = standingOf(board, pts(), [], [], ordinalOf);
  assert.deepEqual(standingsOf(result), {title: 'known', 'checked-1': 'known', 'checked-2': 'known', 'checked-3': 'known', 'found-1': 'known', 'unsure-1': 'not-sure', next: 'known'});
  assert.equal(result.standing['found-1'].point, 3);
  assert.deepEqual(result.standing['found-1'].sources, [0, 1]);
  assert.deepEqual(result.ask, []);
});

test('a fixed entry is not sure; a disagreeing point is ask, listed for the owner', () => {
  const {standing, ask} = standingOf(board, pts({1: {standing: 'ask', why: 'disagree'}}), ['checked[0]', 'frame'], [], ordinalOf);
  assert.equal(standing['checked-1'].standing, 'not-sure');
  assert.equal(standing.title.standing, 'not-sure');
  assert.equal(standing['checked-2'].standing, 'ask');
  assert.deepEqual(ask.map((a) => a.scene), ['checked-2']);
  assert.match(ask[0].why, /only the owner can say which is right/);
});

test('a whole list fixed makes every scene of that list not sure, and no other', () => {
  const s = standingsOf(standingOf(board, pts(), ['checked'], [], ordinalOf));
  assert.deepEqual([s['checked-1'], s['checked-2'], s['checked-3'], s['found-1'], s.title], ['not-sure', 'not-sure', 'not-sure', 'known', 'known']);
});

test('a scene no point rests on is ask; an ask point no scene tells and a refused window are listed too', () => {
  const points = pts().filter((p) => p.sources[0] !== 2);
  points.push({part: 'found', sources: [], standing: 'ask', why: 'cites-nothing'});
  const {standing, ask} = standingOf(board, points, [], [2], ordinalOf);
  assert.equal(standing['checked-3'].standing, 'ask');
  assert.deepEqual(ask.map((a) => Object.keys(a)[0]), ['scene', 'point', 'window']);
});
