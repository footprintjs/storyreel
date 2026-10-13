// No slideshows (slideshow.mjs): each shot measured in its middle — its time with every change of picture cut out — as
// frames drawn small; a film whose shots hold still for most of their running time is a slideshow. In the review it is a
// verdict (verdict.mjs), decided with decide(), so the record says why; it is not the stale check.
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {SLIDESHOW, shotInsides, moved, shotMotion, slideshowOf, SLIDESHOW_VERDICT} from '../src/slideshow.mjs';
import {reviewPart} from '../src/review.mjs';

// A card world: its title, and — when it moves — a dot circling; `every` turns to a new page name every that many seconds.
const card = {name: 'card', story: {compile: spec => ({hang: 1, draw: (c, t) => {
  c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900);
  c.fillStyle = '#222'; c.font = '60px sans-serif'; c.textBaseline = 'middle'; c.fillText(spec.title, 200, 200);
  if (spec.every) c.fillText(`page ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(t / spec.every) % 26]}`, 200, 400);
  if (spec.moves) { c.beginPath(); c.arc(800 + 200 * Math.cos(t * 2), 500 + 200 * Math.sin(t * 2), 30, 0, 7); c.fill(); }
}})}};
const storyboard = {title: 'Cards', scenes: ['one', 'two', 'three'].map(id => ({id, narration: 'these are the words said while the card is on the screen for a while'}))};
const timings = evenTimings(storyboard, {wordSeconds: .45, tail: .5});
const cards = (moves = [], extra = {}) => ({story: {kit: 'card', title: 'One', moves: moves.includes(0), ...extra},
  stages: [{type: 'world', scene: 'two', enter: 'cut', world: {kit: 'card', title: 'Two', moves: moves.includes(1), ...extra}},
    {type: 'world', scene: 'three', enter: 'fade', world: {kit: 'card', title: 'Three', moves: moves.includes(2), ...extra}}]});
const filmOf = (moves, extra) => compileFilm({storyboard, timings, recipe: cards(moves, extra), kits: [card]});
const still = await filmOf([]), moving = await filmOf([0, 1, 2]);

test('a shot is measured in its middle: every change of picture is cut out, and no step crosses a cut', () => {
  const [, two, three] = still.shots, fade = still.changes.find(c => /fade/.test(c.what)), cut = still.changes.find(c => /cut/.test(c.what));
  assert.ok(cut.from === cut.to && cut.from === two.from, 'a cut is a change with no length, on the shot\'s first frame');
  const inside = shotInsides(still);
  assert.deepEqual(inside.map(s => s.where), ['the story', 'stage two', 'stage three']);
  assert.equal(inside[0].pieces.at(-1)[1], two.from, 'the story ends where the cut is');
  assert.deepEqual(inside[1].pieces, [[two.from, fade.from]], 'the next shot\'s fade is cut out of the end of this one');
  assert.deepEqual(inside[2].pieces, [[fade.to, three.to]], 'and out of the start of its own');
  assert.deepEqual(shotInsides(still, {from: two.from + 1, to: two.from + 2}).map(s => [s.where, s.pieces]), [['stage two', [[two.from + 1, two.from + 2]]]], 'a stretch of the film: its shots, held to it');
});

test('a picture moves when enough of it changes, by more than a fade\'s tail', () => {
  const a = new Uint8Array(14400).fill(200);
  assert.equal(moved(a, a.slice()), false, 'the same frame: still');
  const b = a.slice(); b.fill(150, 0, 3);
  assert.equal(moved(a, b), true, `3 cells changed: about 300 px² of the frame (${SLIDESHOW.area * 14400} cells is enough)`);
  const faint = a.slice().fill(204);
  assert.equal(moved(a, faint), false, `every cell ${SLIDESHOW.level} levels off: a fade's tail, not movement`);
  assert.equal(moved(a, b, {...SLIDESHOW, area: .01}), false, 'the threshold is data');
});

test('a film of still cards is a slideshow, however well it cuts; the same cards with something moving are not', async () => {
  const s = slideshowOf(still);
  assert.equal(s.shots, 3); assert.equal(s.stillShare, 1);
  assert.deepEqual(s.stillShots.map(x => x.where), ['the story', 'stage two', 'stage three'], 'every shot is still, the cut and the fade never counted');
  const m = slideshowOf(moving);
  assert.equal(m.stillShare, 0); assert.deepEqual(m.stillShots, []);
  const one = slideshowOf(await filmOf([1]));
  assert.ok(one.stillShare > SLIDESHOW.most, `one moving shot of three: still a slideshow (${one.stillShare})`);
  assert.deepEqual(one.stillShots.map(x => x.where), ['the story', 'stage three']);
  const [motion] = shotMotion(still, {every: .5});
  assert.ok(motion.seconds > 0 && motion.still === motion.seconds && motion.stillAt.every(t => t >= 0), 'every is how often the frames are read');
  assert.throws(() => shotMotion(still, {every: 0}), /every is seconds between the frames read, more than 0/);
  assert.throws(() => shotMotion(still, {frameAt: () => new Uint8Array(14400)}), /frameAt gives the frames drawn at the moments in times: give both, or neither/);
});

test('the review decides it with decide(): failed names the still shots as findings; passed lists none; the record says why', async () => {
  const r = await reviewPart(still);
  const v = r.verdicts.find(x => x.check === 'slideshow');
  assert.equal(v.verdict, 'failed');
  assert.equal(v.why, SLIDESHOW_VERDICT.rules[1].label);
  assert.equal(v.measured.stillShare, 1);
  assert.match(v.summary, /^100 % of [\d.]+ s still; still shots: the story 100 %, stage two 100 %, stage three 100 %$/);
  assert.deepEqual(r.findings.filter(f => f.kind === 'slideshow').map(f => f.scene), ['one', 'two', 'three'], 'one finding a still shot, over its middle');
  assert.match(r.text, /^0:\d\d\.\d–0:\d\d\.\d two · a slide: stage two hardly moves inside itself: 100 % of its [\d.]+ s is still$/m);
  const said = r.record.filter(e => e.type === 'condition').map(e => e.text).join('\n');
  assert.match(said, /most of the running time inside the shots is still: a slideshow": stillShare 1 gt 0\.5 ✓, and chose slideshow\/failed/, 'the decide() evidence: the rule, the value, the threshold');
  const ok = await reviewPart(await filmOf([0, 1]));
  const passed = ok.verdicts.find(x => x.check === 'slideshow');
  assert.equal(passed.verdict, 'passed');
  assert.equal(passed.why, SLIDESHOW_VERDICT.passed);
  assert.deepEqual(passed.measured.stillShots.map(x => x.where), ['stage three'], 'a still shot is still listed with the verdict');
  assert.equal(ok.findings.filter(f => f.kind === 'slideshow').length, 0, '— but a film that passes has no finding for it');
});

test('not stale: new words every few seconds keep stale quiet, and a picture that only holds between them is still a slide', async () => {
  const film = await filmOf([], {every: 1.5}), r = await reviewPart(film);
  assert.equal(r.findings.filter(f => f.kind === 'stale').length, 0, 'something new comes every 1.5 s');
  assert.equal(r.verdicts.find(x => x.check === 'slideshow').verdict, 'failed', 'but the picture does not move between the words');
});

test('a part too short to hold a shot is not run, never passed', async () => {
  const r = await reviewPart(still, {from: 1, to: 3});
  assert.deepEqual(r.verdicts.find(x => x.check === 'slideshow'), {check: 'slideshow', label: 'No slideshow', verdict: 'not run', why: 'the part is too short to hold a shot (stillFor)', measured: {}});
});
