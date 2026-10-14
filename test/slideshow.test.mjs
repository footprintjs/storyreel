// No slideshows (slideshow.mjs): each shot measured in its middle — its time with every change of picture cut out — as
// frames drawn small; a still stretch held more than 3 s (or a whole shot that never moves) is dead time, and a film
// whose shots are mostly dead is a slideshow. In the review it is a verdict (verdict.mjs), decided with decide(), so the
// record says why; it is not the stale check.
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {compileExample} from './golden.mjs';
import {SLIDESHOW, shotInsides, moved, shotMotion, slideshowOf, SLIDESHOW_VERDICT} from '../src/slideshow.mjs';
import {reviewPart, REVIEW_CHECKS} from '../src/review.mjs';

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
  assert.equal(s.shots, 3); assert.equal(s.deadShare, 1);
  assert.deepEqual(s.deadShots.map(x => x.where), ['the story', 'stage two', 'stage three'], 'every shot is held still, the cut and the fade never counted');
  const m = slideshowOf(moving);
  assert.equal(m.deadShare, 0); assert.deepEqual(m.deadShots, []);
  const one = slideshowOf(await filmOf([1]));
  assert.equal(one.deadShare, .686, 'one moving shot of three: still a slideshow');
  assert.deepEqual(one.deadShots.map(x => x.where), ['the story', 'stage three']);
  const [motion] = shotMotion(still, {every: .5});
  assert.ok(motion.seconds > 0 && motion.still === motion.seconds && motion.dead === motion.still && motion.stillAt.every(t => t >= 0), 'every is how often the frames are read');
  assert.throws(() => shotMotion(still, {every: 0}), /every is seconds between the frames read, more than 0/);
  assert.throws(() => shotMotion(still, {frameAt: () => new Uint8Array(14400)}), /frameAt gives the frames drawn at the moments in times: give both, or neither/);
});

test('dead time: a stretch held more than 3 s, or a whole shot that never moves; a shorter pause between moves is a beat', async () => {
  // Slides of 2.5 s, crossfaded: no stretch is longer than 3 s, but no slide ever moves — all of it is dead.
  const sb = {title: 'Slides', scenes: Array.from({length: 6}, (_, i) => ({id: `s${i}`, narration: 'one slide'}))}, tm = evenTimings(sb, {wordSeconds: .4, tail: 1.4});
  const slides = await compileFilm({storyboard: sb, timings: tm, recipe: {story: {kit: 'card', title: 'Slide 0'}, stages: sb.scenes.slice(1).map((sc, i) => ({type: 'world', scene: sc.id, enter: 'fade', world: {kit: 'card', title: `Slide ${i + 1}`}}))}, kits: [card]});
  assert.ok(tm.scenes.every(sc => sc.duration <= 2.5 + 1e-9), JSON.stringify(tm.scenes.map(sc => sc.duration)));
  assert.equal(slideshowOf(slides).deadShare, 1);
  // A page swapped every 5 s: something new each time, still for nearly 5 s in between — dead.
  const pages = slideshowOf(await filmOf([], {every: 5}));
  assert.equal(pages.deadShare, .628);
  // The same with a swap every 1.5 s: every pause is a beat, none of it dead.
  assert.equal(slideshowOf(await filmOf([], {every: 1.5})).deadShare, 0);
  assert.equal(SLIDESHOW.hold, 3);
});

test('the review decides it with decide(): failed names the dead stretches as findings; passed lists none; the record says why', async () => {
  const r = await reviewPart(still);
  const v = r.verdicts.find(x => x.check === 'slideshow');
  assert.equal(v.verdict, 'failed');
  assert.equal(v.why, SLIDESHOW_VERDICT.rules[1].label);
  assert.equal(v.measured.deadShare, 1);
  assert.match(v.summary, /^100 % of [\d.]+ s dead; held still: the story 100 %, stage two 100 %, stage three 100 %$/);
  assert.equal(r.findings.filter(f => f.kind === 'slideshow').length, 0, 'every dead stretch here is frozen: the still check names it, once');
  assert.ok(r.findings.some(f => f.kind === 'still'));
  const said = r.record.filter(e => e.type === 'condition').map(e => e.text).join('\n');
  assert.match(said, /most of the running time inside the shots is dead \(held still for more than 3 s at a time\): a slideshow": deadShare 1 gt 0\.5 ✓, and chose slideshow\/failed/, 'the decide() evidence: the rule, the value, the threshold');
  const without = await reviewPart(still, {checks: Object.fromEntries(Object.entries(REVIEW_CHECKS).filter(([id]) => id !== 'still'))});
  assert.deepEqual(without.findings.filter(f => f.kind === 'slideshow').map(f => f.scene), ['one', 'two', 'three'], 'without the still check, the dead stretches are its own findings');
  assert.match(without.text, /^0:\d\d\.\d–0:\d\d\.\d two · held still: stage two holds still: 100 % of its [\d.]+ s is dead \(still for more than 3 s at a time\)$/m);
  const ok = await reviewPart(await filmOf([0, 1]));
  const passed = ok.verdicts.find(x => x.check === 'slideshow');
  assert.equal(passed.verdict, 'passed');
  assert.equal(passed.why, SLIDESHOW_VERDICT.passed);
  assert.deepEqual(passed.measured.deadShots.map(x => x.where), ['stage three'], 'a shot held still is still listed with the verdict');
  assert.equal(ok.findings.filter(f => f.kind === 'slideshow').length, 0, '— but a film that passes has no finding for it');
});

test('not stale: a new page every 5 s keeps stale quiet, and a picture that only holds between the pages is a slideshow', async () => {
  const film = await filmOf([], {every: 5}), r = await reviewPart(film);
  assert.equal(r.findings.filter(f => f.kind === 'stale').length, 0, 'something new comes every 5 s');
  const v = r.verdicts.find(x => x.check === 'slideshow');
  assert.deepEqual([v.verdict, v.measured.deadShare], ['failed', .631], 'but the picture does not move between the pages');
});

test('the example films\' verdicts, as the README gives them', async () => {
  const verdicts = {};
  for (const name of ['hello', 'recap', 'shepherd', 'worlds']) {
    const [slides, parts, claims] = (await reviewPart(await compileExample(name))).verdicts;
    verdicts[name] = {slideshow: [slides.verdict, slides.measured.deadShare, slides.measured.deadShots.map(s => `${s.where} ${s.deadShare}`)],
      geometry: [parts.verdict, parts.measured.parts ?? 0], claims: [claims.verdict, claims.measured.numbers ?? 0, claims.measured.drawn ?? 0]};
  }
  assert.deepEqual(verdicts, {
    // A whiteboard and a code stage, still between their reveals: held still for a third of their time, and moving for
    // the rest. The numbers they draw (the card's "sheep 1", a 0 in the code) have no facts to be checked against.
    hello: {slideshow: ['passed', .324, ['stage rule 0.75']], geometry: ['not run', 0], claims: ['not run', 4, 4]},
    recap: {slideshow: ['passed', .146, ['the story 0.217', 'stage code 0.371']], geometry: ['not run', 0], claims: ['not run', 12, 9]},
    // The cartoon kit gives its parts; its world moves all the time.
    shepherd: {slideshow: ['passed', 0, []], geometry: ['passed', 21], claims: ['passed', 0, 0]},
    worlds: {slideshow: ['passed', 0, []], geometry: ['passed', 17], claims: ['not run', 3, 3]}});
});

test('a part too short to hold a shot is not run, never passed', async () => {
  const r = await reviewPart(still, {from: 1, to: 3});
  assert.deepEqual(r.verdicts.find(x => x.check === 'slideshow'), {check: 'slideshow', label: 'No slideshow', verdict: 'not run', why: 'the part is too short to hold a shot (stillFor)', measured: {}});
});
