// A scene that differs from the real thing says so (differs.mjs): how many times faster its time runs, what is out of
// scale, on screen by default, in the voice with a phrase, or both. Here: the declaration and its refusals, the labels
// as a frame draws them, the phrase checked as every phrase is, the verdict over a whole film and over a part, a label's
// number being no claim, the labels in a crop, and a piece's key.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {compileFilm, evenTimings, compileLayout, makeFilm} from '../src/index.mjs';
import {kineticKit} from '../src/kits/kinetic/index.mjs';
import {reviewPart, wordsAt, readDiffers, timeWords, DIFFERS_MOST} from '../src/review.mjs';
import {planPieces, pieceKey, whyDrawn} from '../src/segments.mjs';
import {tempDir} from './tmp.mjs';

const TIME = 'Time shown 30 times faster', SCALE = 'The dots are drawn far larger than real';
const recipe = {story: {kit: 'kinetic', scene: 'one', words: [{text: 'FAST', at: ['one', 'runs']}]},
  stages: [{type: 'world', scene: 'two', enter: 'cut', world: {kit: 'kinetic', scene: 'two', words: [{text: 'REAL', at: ['two', 'simply']}]}}]};
/** A film of two scenes, the first declaring `differs` (and whatever else `one` adds). */
const filmOf = (differs, {one = {}, ...options} = {}) => {
  const storyboard = {title: 'T', ...(options.facts ? {facts: options.facts} : {}), scenes: [{id: 'one', narration: 'Here it all runs thirty times faster than life, so you can see every part of it.', ...(differs ? {differs} : {}), ...one},
    {id: 'two', narration: 'And this part is simply how it looks in the room, with nothing changed at all.'}]};
  return compileFilm({storyboard, recipe, kits: [kineticKit], timings: evenTimings(storyboard, {tail: 0}), ...(options.anchors ? {anchors: options.anchors} : {})});
};
const words = (film, t, options) => wordsAt(film, t, options).map(w => w.text);

test('a declaration is checked as written, each refusal naming the fix', () => {
  assert.equal(readDiffers(undefined), null);
  assert.deepEqual(readDiffers({time: 30, scale: SCALE}), {time: 30, scale: SCALE, shown: [TIME, SCALE]});
  assert.deepEqual(readDiffers({time: .04}).shown, ['Time shown 25 times slower']);
  assert.equal(timeWords(1.5), 'Time shown 1.5 times faster');
  assert.equal(timeWords(1 / 3), 'Time shown 3 times slower');
  assert.deepEqual(readDiffers({time: 30, shown: 'Zeit 30-mal schneller', said: 'thirty times'}), {time: 30, shown: ['Zeit 30-mal schneller'], said: 'thirty times'});
  assert.deepEqual(readDiffers({scale: 'Not to scale', shown: false, said: 'not to scale'}), {scale: 'Not to scale', shown: [], said: 'not to scale'});
  const refused = (spec, re) => assert.throws(() => readDiffers(spec, 'storyboard scene one'), re);
  refused(30, /^Error: storyboard scene one: differs says how the scene differs from the real thing: \{time: 30/);
  refused({}, /give time \(how many times faster it runs\), scale \(what is out of scale, in words\), or both/);
  refused({time: 1}, /1 is real time, so leave it out/);
  refused({time: -2}, /differs\.time is how many times faster/);
  refused({speed: 30}, /differs takes time, scale, shown, said, not "speed"/);
  refused({scale: ''}, /differs\.scale is words/);
  refused({scale: 'x'.repeat(DIFFERS_MOST + 1)}, /more than a label can hold in a glance \(70\): shorten it, and say the rest in the voice/);
  refused({time: 30, shown: false}, /differs\.shown is false, so the voice must say it: give said/);
  refused({time: 30, shown: []}, /or false for the voice alone, not an empty list/);
  refused({time: 30, said: 7}, /differs\.said is the phrase of the scene's narration/);
});

test('the labels are up over the scene that declares them, in reading order, as lines to read; a film with none is as it was', async () => {
  const film = await filmOf({time: 30, scale: SCALE}), one = film.clock.start('one'), two = film.clock.start('two');
  assert.deepEqual(film.differs.map(d => [d.scene, d.from, d.to, d.shown]), [['one', one, two, [TIME, SCALE]]]);
  const up = wordsAt(film, one + 1), a = up.find(w => w.text === TIME), b = up.find(w => w.text === SCALE);
  assert.ok(a && b, 'both drawn');
  assert.ok(a.box[3] <= b.box[1], 'the time above the scale, never over it');
  assert.ok(a.alpha === 1 && b.alpha === 1);
  assert.ok(!words(film, two + 1).includes(TIME), 'the next scene is real: no label');
  assert.deepEqual(film.lines.filter(l => l.path === 'storyboard.scenes[0].differs').map(l => l.text), [TIME, SCALE], 'read as every line is');
  const plain = await filmOf(null);
  assert.equal('differs' in plain, false);
  assert.equal('own' in plain.claims, false);
  assert.ok(!words(await filmOf({time: 30, shown: false, said: 'thirty times faster'}), one + 1).includes(TIME), 'for the voice alone, no label');
});

test('a label under the example label, never over it; a scene too short to read its label is said', async () => {
  const film = await filmOf({time: 30}, {one: {example: true}}), up = wordsAt(film, 1), e = up.find(w => w.text === 'Example data'), a = up.find(w => w.text === TIME);
  assert.ok(e.box[3] <= a.box[1], 'under it');
  const short = {title: 'T', scenes: [{id: 'one', silent: [['a', .5]], differs: {scale: SCALE}}, {id: 'two', silent: [['words here', 3]]}]};
  const quick = await compileFilm({storyboard: short, recipe: {story: {kit: 'kinetic', scene: 'one', words: []}, stages: [{type: 'world', scene: 'two', enter: 'cut', world: {kit: 'kinetic', scene: 'two', words: []}}]}, kits: [kineticKit], timings: evenTimings(short, {tail: 0})});
  assert.ok(quick.reading.some(r => r.path === 'storyboard.scenes[0].differs'), 'too short to read');
});

test('its phrase is checked as every phrase is: said, or refused naming the scene; noted where anchors are noted; its moment logged', async () => {
  const film = await filmOf({time: 30, said: 'thirty times faster'});
  assert.ok(film.differs[0].saidAt > 0 && film.differs[0].saidAt < film.clock.start('two'));
  assert.ok(film.beats.some(b => b.path === 'storyboard.scenes[0].differs.said' && b.t === film.differs[0].saidAt), 'in the record of which words did what');
  await assert.rejects(filmOf({time: 30, said: 'a hundred times faster'}), /a hundred times faster/);
  const noted = await filmOf({time: 30, said: 'a hundred times faster'}, {anchors: 'note'});
  assert.ok(noted.anchors.some(a => a.path === 'storyboard.scenes[0].differs.said'), 'storyreel anchors lists it with the others');
});

const verdictOf = r => r.verdicts.find(v => v.check === 'differs');

test('the verdict: asked only of a film that declares; passed on screen, passed in the voice; failed where a part loses the phrase or something hides the label', async () => {
  assert.equal(verdictOf(await reviewPart(await filmOf(null))), undefined, 'any other film\'s verdicts stay as they were');
  const onScreen = await filmOf({time: 30, scale: SCALE}), whole = verdictOf(await reviewPart(onScreen));
  assert.equal(whole.verdict, 'passed');
  assert.deepEqual([whole.measured.scenes, whole.measured.shown, whole.measured.said, whole.measured.unstated, whole.measured.neither], [1, 1, 0, 0, []]);
  assert.equal(whole.summary, '1 scene differs: 1 on screen, 0 in the voice');
  const voice = await filmOf({time: 30, shown: false, said: 'thirty times faster'}), said = voice.differs[0].saidAt;
  assert.equal(verdictOf(await reviewPart(voice)).verdict, 'passed', 'the voice says it');
  const lost = await reviewPart(voice, {from: said + 1, to: voice.clock.start('two') + 1}), v = verdictOf(lost);
  assert.equal(v.verdict, 'failed', 'a part cut to lose the phrase');
  assert.deepEqual(v.measured.neither.map(u => [u.scene, u.differs]), [['one', 'time shown 30 times faster']]);
  assert.equal(v.summary, '1 scene differs: 0 on screen, 0 in the voice, 1 neither');
  assert.match(lost.text, /does not say how it differs: scene one declares it differs from the real thing \(time shown 30 times faster\), and here neither shows it nor says it: the phrase "thirty times faster" falls outside this part: keep it in, or put the words on screen \(differs\.shown\)/);
  assert.equal(verdictOf(await reviewPart(voice, {from: voice.clock.start('two') + 1})).verdict, 'not run', 'a part with no such scene');
  // The verdict reads the frame, not the declaration: a label something hides is no label.
  const hidden = {...onScreen, frame() {}}, gone = verdictOf(await reviewPart(hidden));
  assert.equal(gone.verdict, 'failed');
  assert.match((await reviewPart(hidden)).text, /something hides its label: move what covers the top right corner/);
  const both = verdictOf(await reviewPart(await filmOf({time: 30, said: 'thirty times faster'})));
  assert.equal(both.summary, '1 scene differs: 1 on screen, 1 in the voice');
});

test('the number in a label is the film\'s declaration, not a claim about the world: it needs no source', async () => {
  const facts = [{value: 99, source: 'https://example.org/x'}], film = await filmOf({time: 30}, {facts});
  assert.deepEqual(film.claims.own, [TIME]);
  assert.equal(film.claims.numbers.length, 0, 'no declared number');
  const r = await reviewPart(film);
  assert.equal(r.verdicts.find(v => v.check === 'claims').verdict, 'passed', r.verdictText);
  assert.equal(r.verdicts.find(v => v.check === 'claims').measured.drawn, 0, 'nor a drawn one');
});

test('in a format that crops, the labels sit inside what is shown; a long one breaks between words', async () => {
  const long = 'The dots on this wire are drawn far larger than they are in real life', film = await filmOf({scale: long}), spec = {format: 'vertical', crop: [{at: ['one', 'Here'], x: 800, width: 600}]}, crop = compileLayout(film, spec);
  const drawn = wordsAt(film, 1, {layout: crop}).filter(w => long.includes(w.text) && w.text.length > 4);
  assert.ok(drawn.length >= 2, `broken in two: ${drawn.map(w => w.text).join(' | ')}`);
  assert.equal(drawn.map(w => w.text).join(' '), long);
  for (const w of drawn) assert.ok(w.box[0] >= 0 && w.box[2] <= crop.width, `inside the frame: ${w.text} ${w.box}`);
  assert.equal(verdictOf(await reviewPart(film, {layout: spec})).verdict, 'passed', 'read as drawn');
});

test('a piece\'s key holds the labels over it, and only those', async () => {
  const pixels = {width: 320, height: 180, fps: 10, layout: null, motionBlur: null, poster: null};
  const parts = film => planPieces(film, {fps: 10, chunkSeconds: 2}).map(seg => ({seg, parts: pieceKey(film, seg, {recipe, storyboard: {scenes: []}, pixels, code: 'kits', fps: 10}).parts}));
  const a = parts(await filmOf({time: 30, shown: 'Words one'})), b = parts(await filmOf({time: 30, shown: 'Words two'})), plain = parts(await filmOf(null));
  assert.ok('differs' in a[0].parts, 'the first piece has the label over it');
  assert.notDeepEqual(a[0].parts.differs, b[0].parts.differs);
  assert.match(whyDrawn(a[0].parts, b[0].parts), /what a scene says on how it differs changed/);
  assert.equal('differs' in a.at(-1).parts, false, 'a piece no label is over is keyed as it was');
  assert.ok(plain.every(p => !('differs' in p.parts)), 'a film with none is keyed as it was');
  assert.deepEqual(a.at(-1).parts, b.at(-1).parts, 'the piece of the other scene is not drawn again');
});

const has = cmd => !spawnSync(cmd, ['-version']).error;

test('the making-of lists how its scenes differ', {skip: has('ffmpeg') ? false : 'needs ffmpeg'}, async t => {
  const dir = tempDir('differs-render', t), storyboard = {title: 'T', scenes: [{id: 'one', silent: [['some words here', 2]], differs: {time: 30}}]};
  const {makingOf} = await makeFilm({storyboard, recipe: {story: {kit: 'kinetic', scene: 'one', words: []}}, kits: [kineticKit], timings: evenTimings(storyboard, {tail: 0}), out: path.join(dir, 'film.mp4')});
  const made = JSON.parse(readFileSync(makingOf, 'utf8'));
  assert.deepEqual(made.differs.map(d => [d.scene, d.time, d.shown]), [['one', 30, [TIME]]]);
});
