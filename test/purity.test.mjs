// Every moment draws the same picture, whatever was drawn before (purity.mjs, review.mjs · pure): a kit that draws
// from t alone passes; one that keeps state between frames, or draws with Math.random, fails, each changed moment a
// finding that names the fix; a part with one moment is not run, never passed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {reviewPart} from '../src/review.mjs';
import {spreadTimes, purityOf, PURITY_MOMENTS} from '../src/purity.mjs';
import {frameHashes} from '../src/pins.mjs';

const storyboard = {title: 'Purity', scenes: [{id: 'move', narration: 'A square crosses the frame while the voice speaks for a while.'}]};
const timings = evenTimings(storyboard, {wordSeconds: .5});
const kit = draw => ({name: 'square', story: {compile: () => ({hang: 1, draw})}});
const backdrop = c => { c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#226'; };
/** From t alone: the square's place is a function of time. */
const pure = (c, t) => { backdrop(c); c.fillRect(100 + t * 80, 400, 60, 60); };
/** State kept between frames: the square steps on each draw, so a moment drawn again is somewhere else. */
const stepping = () => { let x = 100; return c => { backdrop(c); x += 7; c.fillRect(x, 400, 60, 60); }; };
/** Chance: a new place on every draw. */
const chance = c => { backdrop(c); c.fillRect(100 + Math.random() * 1200, 400, 60, 60); };
/**
 * Math.random for one test: a new value on every call, each a step of 1/97 on from the last, so two draws less than
 * 97 calls apart never put the square on the same pixels. Why the test rolls its own dice: with the real ones, two
 * draws of one moment sometimes land on the same pixels at the width the pictures are compared at, that moment is
 * then "unchanged", and a test that expects every moment to change fails by chance. The kit still draws with
 * Math.random; only the numbers are the test's.
 */
const dice = () => { let rolls = 0; return () => (rolls++ % 97) / 97; };
const filmOf = draw => compileFilm({storyboard, timings, recipe: {story: {kit: 'square'}}, kits: [kit(draw)]});
const verdict = r => r.verdicts.find(v => v.check === 'pure');

test('spreadTimes keeps the first and the last, evenly between', () => {
  assert.deepEqual(spreadTimes([1, 2, 3]), [1, 2, 3]);
  const many = Array.from({length: 41}, (_, i) => i);
  assert.deepEqual(spreadTimes(many, 5), [0, 10, 20, 30, 40]);
  assert.equal(spreadTimes(many).length, PURITY_MOMENTS);
});

test('a kit that draws from t alone passes', async () => {
  const r = await reviewPart(await filmOf(pure));
  assert.equal(verdict(r).verdict, 'passed', verdict(r).why);
  assert.equal(verdict(r).measured.changed, 0);
  assert.equal(r.findings.filter(f => f.kind === 'pure').length, 0);
});

test('a kit that keeps state between frames fails, and each changed moment names the fix', async () => {
  const r = await reviewPart(await filmOf(stepping()));
  assert.equal(verdict(r).verdict, 'failed');
  assert.ok(verdict(r).measured.changed > 0);
  const found = r.findings.filter(f => f.kind === 'pure');
  assert.ok(found.length > 0);
  assert.match(found[0].what, /make the kit draw from t alone — seeded randomness \(never Math\.random\), no clock, nothing kept from the frame before/);
  assert.equal(found[0].scene, 'move');
});

test('a kit that draws with Math.random fails', async t => {
  t.mock.method(Math, 'random', dice());
  const film = await filmOf(chance), times = [1, 2, 3], hashes = frameHashes(film, {times, width: 160});
  assert.equal(purityOf(film, {times, hashes}).changed.length, 3);
  assert.equal(verdict(await reviewPart(film)).verdict, 'failed');
});

test('a part with one moment is not run, never passed', async () => {
  const r = await reviewPart(await filmOf(pure), {from: 1, to: 1});
  assert.equal(verdict(r).verdict, 'not run');
});
