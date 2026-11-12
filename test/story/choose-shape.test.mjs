// Which shapes fit: facts code decides on, and the rare brief when two or more fit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fits, readShape, shapeBrief, shapeFacts} from '../../src/storyboard/story/choose-shape/fits.mjs';

const P = (part) => ({part, sources: ['m1'], standing: 'known'});
const full = [P('checked'), P('found'), P('next')];

test('what-we-found fits when its parts are filled; told-twice never fits picked points', () => {
  assert.ok(fits('what-we-found', full));
  assert.ok(!fits('what-we-found', [P('checked'), P('next')]));
  assert.ok(!fits('told-twice', full));
  assert.ok(!fits('no-such-shape', full));
});

test('the facts say what was asked, whether it is drawable, and what fits', () => {
  assert.deepEqual(shapeFacts({asked: undefined, drawable: ['what-we-found'], points: full}), {askedShape: null, askedDrawable: null, fitting: ['what-we-found'], fitCount: 1});
  assert.deepEqual(shapeFacts({asked: 'told-twice', drawable: ['what-we-found'], points: full}), {askedShape: 'told-twice', askedDrawable: false, fitting: [], fitCount: 0});
  assert.equal(shapeFacts({asked: undefined, drawable: ['what-we-found'], points: []}).fitCount, 0);
});

test('the shape brief offers only what fits, and its answer must name one of them', () => {
  const b = shapeBrief(['what-we-found', 'told-twice'], full);
  assert.equal(b.material.split('\n').length, 3);
  assert.equal(readShape({shape: 'told-twice'}, ['what-we-found', 'told-twice']), 'told-twice');
  assert.throws(() => readShape({shape: 'other'}, ['what-we-found']), {code: 'bad-shape'});
});
