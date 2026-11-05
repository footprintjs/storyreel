// A scene that differs from the real thing says so (differs.mjs): how many times faster its time runs, what is out of
// scale, on screen by default, in the voice with a phrase, or both. Here: the declaration and its refusals, the labels
// as a frame draws them, the phrase checked as every phrase is, the verdict over a whole film and over a part, which
// number in a label is a claim and which is the film's own, the labels in a crop and over the bands, a piece's key, and
// what a phrase changes elsewhere (the stale check, the anchors tool). The phrase, line-break and factor tables are
// the same in StoryDeck's deck/differs.test.js: a deck and a film say it alike.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {compileFilm, evenTimings, compileLayout, makeFilm} from '../src/index.mjs';
import {kineticKit} from '../src/kits/kinetic/index.mjs';
import {reviewPart, wordsAt, readDiffers, timeWords, REVIEW_CHECKS, DIFFERS_MOST, DIFFERS_SAID_MOST} from '../src/review.mjs';
import {differsMeasure, differsOf, ownFigure, saidBeat} from '../src/differs.mjs';
import {chipLines} from '../src/attention.mjs';
import {rubricSheet} from '../src/rubric.mjs';
import {phraseMatches, speechIndex} from '../src/clock.mjs';
import {uiReport} from '../src/zones.mjs';
import {coveredAt} from '../src/phone.mjs';
import {anchors, readInputs} from '../src/tools.mjs';
import {planPieces, pieceKey, whyDrawn} from '../src/segments.mjs';
import {tempDir} from './tmp.mjs';

const TIME = 'Time shown 30 times faster', SCALE = 'The dots are drawn far larger than real';
const recipe = {story: {kit: 'kinetic', scene: 'one', words: [{text: 'FAST', at: ['one', 'runs']}]},
  stages: [{type: 'world', scene: 'two', enter: 'cut', world: {kit: 'kinetic', scene: 'two', words: [{text: 'REAL', at: ['two', 'simply']}]}}]};
/** A film of two scenes, the first declaring `differs` (and whatever else `one` adds). */
const filmOf = (differs, {one = {}, two = {}, ...options} = {}) => {
  const storyboard = {title: 'T', ...(options.facts ? {facts: options.facts} : {}), scenes: [{id: 'one', narration: 'Here it all runs thirty times faster than life, so you can see every part of it.', ...(differs ? {differs} : {}), ...one},
    {id: 'two', narration: 'And this part is simply how it looks in the room, with nothing changed at all.', ...two}]};
  return compileFilm({storyboard, recipe: options.recipe ?? recipe, kits: [kineticKit], timings: evenTimings(storyboard, {tail: 0}), ...(options.anchors ? {anchors: options.anchors} : {}), ...(options.lang ? {lang: options.lang} : {})});
};
const words = (film, t, options) => wordsAt(film, t, options).map(w => w.text);
/** A kit that only paints these words: drawn, in no line the film declares. */
const painter = text => ({name: 'painter', story: {compile: () => ({hang: 1, draw: c => { c.font = '60px sans-serif'; c.fillStyle = '#000'; c.fillText(text, 300, 500); }})}});
const paintingFilm = (differs, text, {facts} = {}) => {
  const storyboard = {title: 'T', facts, scenes: [{id: 'one', narration: 'Here it all runs thirty times faster than life, so you can see every part of it.', ...(differs ? {differs} : {})}]};
  return compileFilm({storyboard, recipe: {story: {kit: 'painter'}}, kits: [painter(text)], timings: evenTimings(storyboard, {tail: 0})});
};

test('a declaration is checked as written, each refusal naming the fix', () => {
  assert.equal(readDiffers(undefined), null);
  assert.deepEqual(readDiffers({time: 30, scale: SCALE}), {time: 30, scale: SCALE, shown: [TIME, SCALE]});
  assert.deepEqual(readDiffers({time: .04}).shown, ['Time shown 25 times slower']);
  assert.equal(timeWords(1.5), 'Time shown 1.5 times faster');
  assert.equal(timeWords(1 / 3), 'Time shown 3 times slower');
  assert.deepEqual(readDiffers({time: 30, shown: 'Zeit 30-mal schneller', said: 'thirty times'}), {time: 30, shown: ['Zeit 30-mal schneller'], said: ['thirty times']});
  assert.deepEqual(readDiffers({scale: 'Not to scale', shown: false, said: 'not to scale'}), {scale: 'Not to scale', shown: [], said: ['not to scale']});
  const refused = (spec, re) => assert.throws(() => readDiffers(spec, 'storyboard scene one'), re);
  refused(30, /^Error: storyboard scene one: differs says how the scene differs from the real thing: \{time: 30/);
  refused({}, /give time \(how many times faster it runs\), scale \(what is out of scale, in words\), analogy \(what stands in for what\), or more than one/);
  refused({time: 1}, /1 is real time, so leave it out/);
  refused({time: -2}, /differs\.time is how many times faster/);
  refused({speed: 30}, /differs takes time, scale, analogy, shown, said, not "speed"/);
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
  const [{phrase, places}] = film.differs[0].heard;
  assert.equal(phrase, 'thirty times faster');
  assert.ok(places.length === 1 && places[0].start > 0 && places[0].end < film.clock.start('two'));
  assert.ok(film.beats.some(b => b.path === 'storyboard.scenes[0].differs.said' && b.t === +places[0].start.toFixed(3)), 'in the record of which words did what');
  await assert.rejects(filmOf({time: 30, said: 'a hundred times faster'}), /a hundred times faster/);
  const noted = await filmOf({time: 30, said: 'a hundred times faster'}, {anchors: 'note'});
  assert.ok(noted.anchors.some(a => a.path === 'storyboard.scenes[0].differs.said'), 'storyreel anchors lists it with the others');
});

const verdictOf = r => r.verdicts.find(v => v.check === 'differs');

test('the verdict: asked only of a film that declares; passed on screen, passed in the voice; failed where a part loses the phrase or something hides the label', async () => {
  assert.equal(verdictOf(await reviewPart(await filmOf(null))), undefined, 'any other film\'s verdicts stay as they were');
  const onScreen = await filmOf({time: 30, scale: SCALE}), whole = verdictOf(await reviewPart(onScreen));
  assert.equal(whole.verdict, 'passed');
  assert.deepEqual([whole.measured.scenes, whole.measured.shown, whole.measured.said, whole.measured.unstated, whole.measured.brief, whole.measured.neither], [1, 1, 0, 0, 0, []]);
  assert.equal(whole.summary, `1 scene differs: 1 on screen, 0 in the voice · one: on screen "${TIME}", "${SCALE}"`, 'the words themselves, so a reader can judge them');
  const voice = await filmOf({time: 30, shown: false, said: 'thirty times faster'}), said = voice.differs[0].heard[0].places[0].start;
  assert.equal(verdictOf(await reviewPart(voice)).verdict, 'passed', 'the voice says it');
  const lost = await reviewPart(voice, {from: said + 1, to: voice.clock.start('two') + 1}), v = verdictOf(lost);
  assert.equal(v.verdict, 'failed', 'a part cut to lose the phrase');
  assert.deepEqual(v.measured.neither.map(u => [u.scene, u.differs]), [['one', 'time shown 30 times faster']]);
  assert.equal(v.summary, '1 scene differs: 0 on screen, 0 in the voice, 1 neither · one: in the voice "thirty times faster"');
  assert.match(lost.text, /does not say how it differs: scene one declares it differs from the real thing \(time shown 30 times faster\), and here neither shows it nor says it: the phrase "thirty times faster" falls outside this part: keep it in, or put the words on screen \(differs\.shown\)/);
  assert.equal(verdictOf(await reviewPart(voice, {from: voice.clock.start('two') + 1})).verdict, 'not run', 'a part with no such scene');
  // The verdict reads the frame, not the declaration: a label something hides is no label.
  const hidden = {...onScreen, frame() {}}, gone = verdictOf(await reviewPart(hidden));
  assert.equal(gone.verdict, 'failed');
  assert.match((await reviewPart(hidden)).text, /something hides its label: move what covers the top right corner/);
  const both = verdictOf(await reviewPart(await filmOf({time: 30, said: 'thirty times faster'})));
  assert.equal(both.summary, `1 scene differs: 1 on screen, 1 in the voice · one: on screen "${TIME}"; in the voice "thirty times faster"`);
});

const FACTS = [{value: 99, source: 'https://example.org/x'}];
const claimsOf = async film => verdictChecked(await reviewPart(film, {checks: {claims: REVIEW_CHECKS.claims}}), 'claims');
const verdictChecked = (r, check) => r.verdicts.find(v => v.check === check);

test('which number in a label is the film\'s own: the time words, or a line whose only number is the declared time', () => {
  const table = [
    ['Time shown 30 times faster', 30, null, true],
    ['Time shown 25 times slower', .04, null, true],
    ['Zeit 30-mal schneller', 30, 'de', true],
    ['25-mal langsamer', .04, 'de', true],
    ['1,5-mal schneller', 1.5, 'de', true],
    ['33 times faster', 33.3, null, true],
    ['Only 3% of patients recover', 3, null, false],
    ['Real cell is 7 microns', 30, null, false],
    ['Runs 30 times faster in 7 steps', 30, null, false],
    ['Drawn 1000 times larger', 30, null, false],
    ['99% 42 7', 30, null, false],
    ['1,5-mal schneller', 1.5, null, false],   // no language: not one number, so it stays a claim
    ['Time shown 30 times faster', undefined, null, false],
  ];
  for (const [line, time, lang, own] of table) assert.equal(ownFigure(line, time, lang), own, `${line} with time ${time} in ${lang}`);
});

test('the declared time needs no source and the verdict says what it stood on; a label is no cover for any other number', async () => {
  const film = await filmOf({time: 30}, {facts: FACTS});
  assert.equal('own' in film.claims, false);
  assert.equal(film.claims.numbers.length, 0, 'no declared number');
  const own = await claimsOf(film);
  assert.equal(own.verdict, 'passed');
  assert.equal(own.measured.drawn, 0, 'nor a drawn one');
  assert.equal(own.measured.ownFigures, 1);
  assert.match(own.why, /the only number on screen is the film's own/, 'not "the film shows no number": one is up');
  // A number a kit draws is a claim, whatever the label says: it fails with the label as it fails without one.
  for (const text of ['30', '3', '0', '30 times']) {
    const {verdict, measured} = await claimsOf(await paintingFilm({time: 30}, text, {facts: FACTS}));
    assert.equal(verdict, 'failed', `a kit drawing "${text}"`);
    assert.equal(measured.drawn, 1);
    assert.equal((await claimsOf(await paintingFilm(null, text, {facts: FACTS}))).verdict, 'failed', 'as it does without one');
  }
  assert.equal((await claimsOf(await paintingFilm({scale: 'Drawn 1000 times larger'}, '100', {facts: [{value: 1000, source: 'https://example.org/y'}]}))).measured.drawn, 1, 'nor do the digits of a number in a label cover a drawn one');
  // A label with any other number is a line that claims it: declared, so a render's check reads it too.
  const larger = await filmOf({scale: 'Drawn 1000 times larger'}, {facts: FACTS});
  assert.deepEqual(larger.claims.numbers.map(c => [c.number, c.scene, c.path]), [['1000', 'one', 'storyboard.scenes[0].differs']]);
  assert.equal(wordsAt(larger, 1).find(w => w.differs).differs.own, undefined, 'its words carry no such mark');
  const refused = await claimsOf(larger);
  assert.equal(refused.verdict, 'failed');
  assert.equal(refused.measured.drawn, 0, 'said once: as the line it is, not again as what the frame draws');
  assert.equal((await claimsOf(await filmOf({scale: 'Drawn 1000 times larger'}, {facts: [{value: 1000, source: 'https://example.org/y'}]}))).verdict, 'passed', 'sourced');
  assert.equal((await claimsOf(await filmOf({scale: 'Not to scale', shown: 'Only 3% of patients recover'}, {facts: FACTS}))).verdict, 'failed', 'a claim about the world in the label itself');
  assert.equal((await claimsOf(await filmOf({time: 30, scale: 'Real cell is 7 microns'}, {facts: FACTS}))).verdict, 'failed');
  assert.equal((await claimsOf(await filmOf({time: 30}, {facts: FACTS, one: {example: true}}))).verdict, 'passed', 'an example scene as ever');
  // Broken across a crop's chips, a line stays what it is.
  const spec = {format: 'vertical', crop: [{at: ['one', 'Here'], x: 800, width: 600}]}, narrow = await filmOf({time: 30, shown: 'Zeit 30-mal schneller und noch viel schneller als das echte Leben'}, {facts: FACTS});
  const chips = wordsAt(narrow, 1, {layout: compileLayout(narrow, spec)}).filter(w => w.differs);
  assert.ok(chips.length >= 2 && chips.every(w => w.differs.own), `broken and still its own: ${chips.map(w => w.text).join(' | ')}`);
  assert.equal(verdictChecked(await reviewPart(narrow, {layout: spec, checks: {claims: REVIEW_CHECKS.claims}}), 'claims').verdict, 'passed');
});

test('a declaration says every statement, on one line, in numbers that match, or is refused naming the fix', () => {
  const refused = (spec, re) => assert.throws(() => readDiffers(spec, 'storyboard scene one'), re);
  // One statement dropped: both declared, one line, or one phrase for the two.
  refused({time: 30, scale: SCALE, shown: TIME}, /declares both time and scale and says only 1 thing: give each its own line in differs\.shown or its own phrase in differs\.said/);
  refused({time: 30, scale: SCALE, shown: false, said: 'thirty times'}, /declares both time and scale and says only 1 thing/);
  refused({time: 30, scale: SCALE, shown: [TIME, TIME]}, /says only 1 thing/);
  refused({time: 30, scale: SCALE, shown: false, said: ['thirty times', 'Thirty, times']}, /differs\.said is the phrase/);
  assert.deepEqual(readDiffers({time: 30, scale: SCALE, shown: TIME, said: 'far larger'}).said, ['far larger'], 'a line and a phrase');
  assert.deepEqual(readDiffers({time: 30, scale: SCALE, shown: false, said: ['thirty times', 'far larger']}).said, ['thirty times', 'far larger'], 'a phrase each');
  // A number that contradicts the declaration.
  refused({time: 30, shown: 'Time shown 5 times faster'}, /differs\.shown says 5 where differs\.time says 30/);
  refused({time: 30, scale: SCALE, shown: ['Time shown 5 times faster', SCALE]}, /says 5 where differs\.time says 30/);
  refused({time: .04, shown: 'Time shown 30 times slower'}, /says 30 where differs\.time says 0\.04/);
  assert.deepEqual(readDiffers({time: 30, scale: 'Drawn 1000 times larger', shown: ['Zeit 30-mal schneller', 'Drawn 1000 times larger']}).shown.length, 2, 'the time\'s line first; the other its own');
  assert.equal(readDiffers({time: 1.5, shown: 'Zeit 1,5-mal schneller'}).shown.length, 1, 'whichever way a language writes it');
  assert.equal(readDiffers({time: .04, shown: '25 times slower'}).shown.length, 1, 'as the time words say it');
  assert.equal(readDiffers({time: 30, shown: 'H2O runs fast'}).shown.length, 1, 'a digit inside a word is no number');
  // One line, wherever it is printed.
  assert.deepEqual(readDiffers({time: 30, said: 'thirty\ntimes faster\u0085now\u001b'}).said, ['thirty times faster now']);
  assert.deepEqual(readDiffers({scale: 'far\nlarger', shown: 'one\r\ntwo'}), {scale: 'far larger', shown: ['one two']});
  refused({time: 30, said: 'x'.repeat(DIFFERS_SAID_MOST + 1)}, /differs\.said is 121 characters, more than a phrase \(120\): name the few words that say it/);
  refused({time: 30, said: '...'}, /differs\.said is the phrase/);
  refused({time: 30, said: []}, /differs\.said is the phrase/);
  refused({time: 30, said: '{hop}'}, /the words the voice says, not a moment/);
});

test('the time factor: one a label can say, the same limits as a deck\'s', () => {
  const refused = (time, re) => assert.throws(() => readDiffers({time}, 'storyboard scene one'), re);
  for (const time of [1, 1.001, 1.004, .999, .996]) refused(time, /1 is real time, so leave it out/);
  for (const time of [1e21, 1e10, 1e-10, 1e-21]) refused(time, /past 1000000000 times either way no viewer reads the number, so say it in words in differs\.scale/);
  for (const time of [0, -2, NaN, Infinity, '30']) refused(time, /differs\.time is how many times faster/);
  assert.equal(readDiffers({time: 1.01}).shown[0], 'Time shown 1.01 times faster');
  assert.equal(readDiffers({time: .99}).shown[0], 'Time shown 1.01 times slower');
  assert.equal(readDiffers({time: 1e9}).shown[0], 'Time shown 1000000000 times faster');
  assert.equal(readDiffers({time: 1e-9}).shown[0], 'Time shown 1000000000 times slower');
});

test('a scene is held to itself and its film: a silent scene names no phrase, and a film in another language gives its own words', async () => {
  const silent = said => ({title: 'T', scenes: [{id: 'one', silent: [['the dots run thirty times faster', 3]], differs: {time: 30, ...said}}]});
  assert.throws(() => differsOf(silent({shown: false, said: 'thirty times faster'})), /storyboard scene one: differs\.said names a phrase the voice says, and a silent scene says nothing: put the words on screen \(differs\.shown\), or narrate the scene/);
  assert.throws(() => differsOf(silent({said: 'thirty times faster'})), /a silent scene says nothing/);
  assert.equal(differsOf(silent({}))[0].shown[0], TIME, 'a label says it');
  const board = silent({shown: false, said: 'thirty times faster'});
  await assert.rejects(compileFilm({storyboard: board, recipe: {story: {kit: 'kinetic', scene: 'one', words: []}}, kits: [kineticKit], timings: evenTimings(board, {tail: 0})}), /a silent scene says nothing/);
  // The default words are English.
  await assert.rejects(filmOf({time: 30}, {lang: 'de'}), /storyboard scene one: "Time shown 30 times faster" is English and the film is in "de": give the words in its language \(differs\.shown\), or false for the voice alone/);
  assert.ok(await filmOf({time: 30, shown: 'Zeit 30-mal schneller'}, {lang: 'de'}));
  assert.ok(await filmOf({time: 30, shown: false, said: 'thirty times faster'}, {lang: 'de'}));
  assert.ok(await filmOf({scale: SCALE}, {lang: 'de'}), 'a scale is the author\'s own words');
  assert.ok(await filmOf({time: 30}, {lang: 'en-GB'}));
  assert.ok(await filmOf({time: 30}), 'no language named');
});

const said = (phrase, text) => {
  const scene = {id: 's', narration: text}, {scenes: [timing]} = evenTimings({scenes: [scene]});
  return phraseMatches(speechIndex(scene, timing), phrase).length > 0;
};
test('a phrase is found as a deck finds it: its words in order, punctuation and case aside, never inside a word', () => {
  for (const [phrase, text, found] of [
    ['thirty times faster', 'Here it runs Thirty  times faster.', true],
    ['thirty times faster', 'Here it runs thirty times, faster.', true],
    ['thirty times faster', 'faster, thirty times', false],
    ['ten times', 'often times it runs', false],
    ['fast', 'breakfast is served', false],
    ['break', 'breakfast is served', false],
    ['times faster', 'thirty-times faster', false],
    ['thirty-times', 'thirty times faster', true],
    ['thirty times', 'thirty-times faster', true],
    ['R&D runs', 'The R&D runs here', true],
  ]) assert.equal(said(phrase, text), found, `"${phrase}" in "${text}"`);
});

test('the phrase counts where it is said whole, at any place it is said, and never where it is not said', async () => {
  const voice = await filmOf({time: 30, shown: false, said: 'thirty times faster'}), [{start, end}] = voice.differs[0].heard[0].places, v = async part => verdictOf(await reviewPart(voice, part)).verdict;
  assert.equal(await v({from: 0, to: start + .01}), 'failed', 'its first word starts, and none of it is heard');
  assert.equal(await v({from: 0, to: end - .01}), 'failed', 'its last word is cut');
  assert.equal(await v({from: start + .01, to: voice.clock.start('two')}), 'failed', 'its first word is cut');
  assert.equal(await v({from: start - .01, to: end + .01}), 'passed', 'whole');
  // Said twice: either place will do.
  const twice = await filmOf({time: 30, shown: false, said: 'thirty times faster'}, {one: {narration: 'Thirty times faster than life, and again it runs thirty times faster than life here.'}});
  const [first, second] = twice.differs[0].heard[0].places;
  assert.ok(first && second);
  assert.deepEqual(twice.anchors, [], 'any place will do, so it is not ambiguous');
  assert.equal(verdictOf(await reviewPart(twice, {from: second.start - .01, to: second.end + .01})).verdict, 'passed', 'a part holding only the second');
  assert.equal(verdictOf(await reviewPart(twice, {from: first.start - .01, to: first.end + .01})).verdict, 'passed', 'a part holding only the first');
  // A phrase the scene does not say, standing in for the compile's sake, is not said.
  const noted = await filmOf({time: 30, shown: false, said: 'a hundred times faster'}, {anchors: 'note'}), r = await reviewPart(noted);
  assert.ok(noted.anchors.some(a => a.path === 'storyboard.scenes[0].differs.said'));
  assert.equal(verdictOf(r).verdict, 'failed');
  assert.match(r.text, /the phrase "a hundred times faster" is not said in the scene: say it, or fix differs\.said/);
});

test('each statement reaches the viewer: one phrase each, or a line and a phrase, all of them in the part', async () => {
  const voices = await filmOf({time: 30, scale: SCALE, shown: false, said: ['thirty times faster', 'every part of it']}), [a, b] = voices.differs[0].heard;
  assert.ok(voices.beats.some(x => x.path === 'storyboard.scenes[0].differs.said[0]') && voices.beats.some(x => x.path === 'storyboard.scenes[0].differs.said[1]'), 'each named by where it is');
  assert.equal(verdictOf(await reviewPart(voices)).verdict, 'passed');
  assert.equal(verdictOf(await reviewPart(voices, {from: a.places[0].start - .01, to: a.places[0].end + .01})).verdict, 'failed', 'a part with one of the two');
  const mixed = await filmOf({time: 30, scale: SCALE, shown: TIME, said: 'every part of it'}), place = mixed.differs[0].heard[0].places[0];
  const whole = verdictOf(await reviewPart(mixed));
  assert.equal(whole.verdict, 'passed');
  assert.deepEqual([whole.measured.shown, whole.measured.said], [1, 1]);
  assert.equal(verdictOf(await reviewPart(mixed, {from: 0, to: place.start})).verdict, 'failed', 'the label alone leaves the scale unsaid');
  // Two labels: one lost, and the other does not speak for it.
  const d = {index: 0, scene: 'one', from: 0, to: 10, time: 30, scale: SCALE, shown: [TIME, SCALE]}, marked = line => ({text: 'x', box: [10, 10, 50, 30], alpha: 1, differs: {scene: 0, line, piece: 0, pieces: 1}});
  const measure = (wordsAt, options = {}) => differsMeasure({differs: [d]}, {from: 0, to: 10}, {wordsAt, ...options}).measured;
  assert.equal(measure(() => [marked(0), marked(1)]).unstated, 0);
  assert.equal(measure(() => [marked(0)]).unstated, 1, 'one of the two is gone');
  assert.equal(measure(() => [marked(1)]).unstated, 1);
});

test('the verdict reads the label as drawn: its own words, whole, inside the film, in sight', async () => {
  const d = {index: 2, scene: 'one', from: 0, to: 10, time: 30, shown: [TIME]};
  const word = (over = {}) => ({text: TIME, box: [100, 10, 500, 40], alpha: 1, differs: {scene: 2, line: 0, piece: 0, pieces: 1}, ...over});
  const measure = (w, options = {}) => differsMeasure({differs: [d]}, {from: 0, to: 10}, {wordsAt: () => w, ...options});
  assert.equal(measure([word()]).measured.unstated, 0);
  assert.equal(measure([word({alpha: .01})]).measured.unstated, 1, 'too faint to count');
  assert.equal(measure([word(), {text: 'kit', box: [120, 12, 200, 38], alpha: 1}]).measured.unstated, 0, 'a kit\'s word beside it changes nothing');
  assert.equal(measure([word({differs: {scene: 1, line: 0, piece: 0, pieces: 1}})]).measured.unstated, 1, 'another scene\'s label');
  assert.equal(measure([word({differs: {scene: 2, line: 0, piece: 0, pieces: 2}})]).measured.unstated, 1, 'half of it');
  const off = measure([word({box: [-514, 10, 981, 40]})]);
  assert.equal(off.measured.unstated, 1);
  assert.match(off.hits[0].what, /its label "Time shown 30 times faster" runs past the edge of what is shown: shorten it \(differs\.shown\), widen the crop, or say it in the voice/);
  const under = measure([word()], {coveredBy: () => 'top bar'});
  assert.equal(under.measured.unstated, 1);
  assert.match(under.hits[0].what, /its label "Time shown 30 times faster" is under the top bar: move the top bar, or say it in the voice/);
  // Through a film: words that only read like the label are not the label.
  const film = await filmOf({time: 30}), forged = {...film, frame(ctx) { ctx.font = '24px sans-serif'; ctx.fillText(TIME, 900, 40); }};
  assert.equal(verdictOf(await reviewPart(forged)).verdict, 'failed');
});

test('a label up too briefly to read is no label; the verdict reads it inside the part', async () => {
  const short = {title: 'T', scenes: [{id: 'one', silent: [['a', .5]], differs: {scale: SCALE}}, {id: 'two', silent: [['words here', 3]]}]};
  const quick = await compileFilm({storyboard: short, recipe: {story: {kit: 'kinetic', scene: 'one', words: []}, stages: [{type: 'world', scene: 'two', enter: 'cut', world: {kit: 'kinetic', scene: 'two', words: []}}]}, kits: [kineticKit], timings: evenTimings(short, {tail: 0})});
  const r = await reviewPart(quick), v = verdictOf(r);
  assert.equal(v.verdict, 'failed');
  assert.equal(v.measured.brief, 1, 'a scalar for the rule');
  assert.match(v.why, /up too briefly to read/);
  assert.match(r.text, /its label "The dots are drawn far larger than real" is up 0\.5 s and needs 2\.4 s to read: hold the scene longer, shorten the words, or say it in the voice/);
  assert.match(v.summary, /\(1 too brief to read\)/);
  // A part that shows a moment of a long scene.
  const film = await filmOf({time: 30});
  assert.equal(verdictOf(await reviewPart(film, {from: 1, to: 1.1})).measured.brief, 1);
  assert.equal(verdictOf(await reviewPart(film, {from: 1, to: 2.6})).verdict, 'passed', 'a second and a half is enough for these five words');
  // Read inside the part, not at the scene's start: a label gone by then is gone, and one that comes later is up.
  const mid = 3, late = {...film, frame(ctx, t, options) { if (t >= mid) film.frame(ctx, t, options); }}, early = {...film, frame(ctx, t, options) { if (t < mid) film.frame(ctx, t, options); }};
  assert.equal(verdictOf(await reviewPart(late, {from: mid, to: mid + 2})).verdict, 'passed');
  assert.equal(verdictOf(await reviewPart(early, {from: mid, to: mid + 2})).verdict, 'failed');
});

test('a part is asked about its own scenes: what its handle shows of the next is not reviewed for a statement', async () => {
  const voice = await filmOf({time: 30, shown: false, said: 'thirty times faster'});
  const part = await reviewPart(voice, {part: {scenes: ['two']}});
  assert.equal(verdictOf(part).verdict, 'not run', 'the default handle reaches the scene that declares');
  assert.equal(verdictOf(await reviewPart(voice, {part: {scenes: ['two'], handles: 0}})).verdict, 'not run');
  assert.equal(verdictOf(await reviewPart(voice, {part: {scenes: ['one']}})).verdict, 'passed');
  // A part whose own scene says it passes, whatever the scene in its handle holds.
  const both = await filmOf({time: 30}, {two: {differs: {time: 30, shown: false, said: 'simply how it looks'}}});
  const one = verdictOf(await reviewPart(both, {part: {scene: 'one', handles: 2}}));
  assert.deepEqual([one.verdict, one.measured.scenes], ['passed', 1], 'scene two is only in the handle, and its phrase is not');
});

test('a label is read against the film\'s box in the layout, not the frame\'s', async () => {
  // Stacked lines run down the tall picture past where a 900-high frame would end, and stay inside the film's box.
  const shown = Array.from({length: 12}, (_, i) => `Line ${'abcdefghijkl'[i]}`), film = await filmOf({scale: 'Not to scale', shown}), layout = {format: 'vertical'}, framed = compileLayout(film, layout);
  const [, top, , height] = framed.boxes.film, lowest = Math.max(...wordsAt(film, 1, {layout: framed}).filter(w => w.differs).map(w => w.box[3]));
  assert.ok(lowest > 900 && lowest < top + height, `in the box and past 900: ${lowest} in ${top}–${top + height}`);
  assert.equal(verdictOf(await reviewPart(film, {from: 0, to: film.clock.start('two'), layout})).verdict, 'passed');
});

test('the label goes with the picture: a freeze holds it, a part of what the freeze holds is asked, and a teaser\'s rewind keeps it in a crop', async () => {
  const film = await filmOf({time: 30}, {recipe: {story: {kit: 'kinetic', scene: 'one', words: []}, camera: [{move: 'freeze', at: ['one', 'every part'], until: ['two', 'simply']}]}}), two = film.clock.start('two'), {until} = film.camera.moves[0];
  assert.ok(until > two + 1, 'the freeze runs on into scene two');
  assert.ok(words(film, two + .5).includes(TIME), 'scene one\'s picture is still up, and its label');
  assert.ok(!words(film, until + .5).includes(TIME), 'scene two\'s picture has no label');
  assert.equal(verdictOf(await reviewPart(film, {part: {scene: 'two', handles: 0}})).verdict, 'passed', 'its label is read over the picture it stands for');
  assert.equal(verdictOf(await reviewPart(film, {from: until + .1})).verdict, 'not run', 'past the freeze, the real scene');
  // The rewind draws an earlier moment, with its label, in what the crop shows.
  const dir = new URL('../examples/recap/', import.meta.url), read = f => JSON.parse(readFileSync(new URL(f, dir), 'utf8')), board = read('storyboard.json'), rec = read('recipe.json');
  for (const scene of board.scenes) scene.differs = {time: 30};
  const recap = await compileFilm({storyboard: board, timings: evenTimings(board, {tail: 4}), recipe: rec, root: dir.pathname}), at = recap.changes.find(c => c.what === 'the teaser').from;
  const crop = compileLayout(recap, {format: 'vertical'}), labels = wordsAt(recap, at + 3.5, {layout: crop}).filter(w => w.differs);
  assert.ok(labels.length, 'the rewound moment has its label');
  for (const w of labels) assert.ok(w.box[0] >= 0 && w.box[2] <= crop.width, `inside the crop: ${w.box}`);
});

test('in a format that crops, the labels sit inside what is shown; a long one breaks between words', async () => {
  const long = 'The dots on this wire are drawn far larger than they are in real life', film = await filmOf({scale: long}), spec = {format: 'vertical', crop: [{at: ['one', 'Here'], x: 800, width: 600}]}, crop = compileLayout(film, spec);
  const drawn = wordsAt(film, 1, {layout: crop}).filter(w => long.includes(w.text) && w.text.length > 4);
  assert.ok(drawn.length >= 2, `broken in two: ${drawn.map(w => w.text).join(' | ')}`);
  assert.equal(drawn.map(w => w.text).join(' '), long);
  for (const w of drawn) assert.ok(w.box[0] >= 0 && w.box[2] <= crop.width, `inside the frame: ${w.text} ${w.box}`);
  assert.equal(verdictOf(await reviewPart(film, {layout: spec})).verdict, 'passed', 'read as drawn');
});

test('a label breaks where it must: between words with the chip\'s padding counted, and within a word too long for a chip', async () => {
  const ctx = {save() {}, restore() {}, measureText: s => ({width: [...s].length * 10})}, lines = (text, most) => chipLines(ctx, text, null, most);
  assert.deepEqual(lines('abc de', 100), ['abc de'], '60 wide, 92 with its padding');
  assert.deepEqual(lines('abc def', 100), ['abc', 'def'], '70 wide, 102 with its padding: it does not fit');
  assert.deepEqual(lines('abcdefghijklm', 100), ['abcdef', 'ghijkl', 'm'], 'one long word');
  assert.deepEqual(lines('ab abcdefghijklm cd', 100), ['ab', 'abcdef', 'ghijkl', 'm cd'], 'on from where the long word ends');
  assert.deepEqual(lines('東京都庁', 62), ['東京都', '庁'], 'a script written without spaces');
  assert.deepEqual(lines('a\u{1F468}‍\u{1F469}‍\u{1F467}b', 42), ['a', '\u{1F468}‍\u{1F469}‍\u{1F467}', 'b'], 'a grapheme is never split');
  // On a frame: a compound past the crop's width stays inside it, and the verdict reads it.
  const compound = 'Donaudampfschifffahrtsgesellschaftskapitaenskajuetenschluesselanhaenge', film = await filmOf({scale: compound}), spec = {format: 'vertical', crop: [{at: ['one', 'Here'], x: 800, width: 600}]}, crop = compileLayout(film, spec);
  const drawn = wordsAt(film, 1, {layout: crop}).filter(w => w.differs);
  assert.ok(drawn.length >= 2);
  assert.equal(drawn.map(w => w.text).join(''), compound);
  for (const w of drawn) assert.ok(w.box[0] >= 0 && w.box[2] <= crop.width, `inside the frame: ${w.text} ${w.box}`);
  assert.equal(verdictOf(await reviewPart(film, {layout: spec})).verdict, 'passed');
});

test('what sits over the picture counts: a title band or the app\'s UI over a label is no label, and the UI report names it', async () => {
  const film = await filmOf({time: 30}), plainLayout = {format: 'vertical'}, W = 1080, H = 1920;
  const [x0, y0, x1, y1] = wordsAt(film, 1, {layout: compileLayout(film, plainLayout)}).find(w => w.differs).box;
  assert.equal(verdictOf(await reviewPart(film, {layout: plainLayout})).verdict, 'passed');
  const band = await reviewPart(film, {layout: {...plainLayout, header: {title: 'A title', box: [x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20]}}});
  assert.equal(verdictOf(band).verdict, 'failed');
  assert.match(band.text, /its label "Time shown 30 times faster" is under the title band/);
  const ui = {zones: [{name: 'top bar', box: [x0 / W, y0 / H, (x1 - x0) / W, (y1 - y0) / H]}]}, layout = {...plainLayout, ui}, under = await reviewPart(film, {layout});
  assert.equal(verdictOf(under).verdict, 'failed');
  assert.match(under.text, /is under the top bar/);
  // The render's report, and the phone's.
  const framed = compileLayout(film, layout), report = uiReport(film, [{framed, from: 0, to: film.total}]);
  assert.equal(report.ok, false);
  const [finding] = report.findings.filter(f => f.kind === 'label');
  assert.equal(finding.name, TIME);
  assert.ok(finding.until <= film.clock.start('two') + .25 + 1e-6, 'over the scene and no longer');
  assert.match(finding.text, /^the label "Time shown 30 times faster" at 0\.00 s–[\d.]+ s is under the top bar/);
  assert.match(finding.fix, /say it in the voice \(differs\.said\) and leave the label out \(differs\.shown: false\)/);
  assert.equal(uiReport(await filmOf({time: 30, shown: false, said: 'thirty times faster'}), [{framed: compileLayout(film, layout), from: 0, to: 0}]).findings.length, 0, 'no label, nothing under the UI');
  const canvas = {save() {}, restore() {}, measureText: s => ({width: s.length * 14})};
  assert.ok(coveredAt(film, framed, 1, canvas).some(h => h.kind === 'label' && h.zone === 'top bar'));
  assert.ok(!coveredAt(film, framed, film.clock.start('two') + 1, canvas).some(h => h.kind === 'label'));
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
  const voice = parts(await filmOf({time: 30, shown: false, said: 'thirty times faster'}));
  assert.deepEqual(voice.map(p => p.parts), plain.map(p => p.parts), 'a film that says it only in the voice is keyed as one that declares nothing');
  // One piece over both scenes: only the scene with a label is in its key.
  const oneRecipe = {story: {kit: 'kinetic', scene: 'one', words: []}}, whole = film => pieceKey(film, planPieces(film, {fps: 10, chunkSeconds: 100})[0], {recipe: oneRecipe, storyboard: {scenes: []}, pixels, code: 'kits', fps: 10}).parts.differs;
  const labelled = await filmOf({time: 30}, {recipe: oneRecipe}), beside = await filmOf({time: 30}, {recipe: oneRecipe, two: {differs: {time: 30, shown: false, said: 'simply how it looks'}}});
  assert.ok(whole(labelled), 'its label is in the key');
  assert.deepEqual(whole(beside), whole(labelled), 'a scene beside it that says so only in the voice adds nothing');
});

test('a phrase names what the voice says, and moves nothing else: no new moment for the stale check, no beat a freeze holds, no beat a sound is near', async () => {
  // Nothing new in a long scene, and the phrase does not make it so.
  const long = differs => {
    const narration = 'It all runs thirty times faster than life, on and on and on, with nothing new at all in the whole of this long, long scene here.';
    const board = {title: 'T', scenes: [{id: 'one', narration, ...(differs ? {differs} : {})}]};
    return compileFilm({storyboard: board, recipe: {story: {kit: 'kinetic', scene: 'one', words: []}}, kits: [kineticKit], timings: evenTimings(board, {tail: 0})});
  };
  const stale = async film => (await reviewPart(film, {checks: {stale: REVIEW_CHECKS.stale}})).findings.filter(f => f.kind === 'stale').map(f => [f.from, f.to]);
  const without = await stale(await long(null));
  assert.ok(without.length, 'the film is stale');
  assert.deepEqual(await stale(await long({time: 30, shown: false, said: 'thirty times faster'})), without);
  // A beat logged, read as saying only.
  const voice = await filmOf({time: 30, shown: false, said: 'thirty times faster'}), beat = voice.beats.find(b => b.path?.includes('differs'));
  assert.ok(saidBeat(beat));
  assert.ok(!saidBeat({path: 'story.words[0].at'}) && !saidBeat({path: null}) && !saidBeat(undefined));
  // A rubric names the nearest beat that acts on the picture.
  const sheet = rubricSheet({total: 9, sounds: [{type: 'pop', time: 2}], beats: [{ref: ['one', 'x'], t: 2.01, path: 'storyboard.scenes[0].differs.said'}, {ref: ['one', 'y'], t: 1, path: 'story.words[0].at'}]}, {name: 'r', points: [{id: 'sound', label: 'Sound lands on what it marks', look: 'sound'}]});
  assert.ok(sheet.points[0].evidence.some(line => /the nearest beat "story\.words\[0\]\.at"/.test(line)), JSON.stringify(sheet.points[0].evidence));
  // A freeze over the phrase holds no drawing of it.
  const frozen = await filmOf({time: 30, shown: false, said: 'thirty times faster'}, {recipe: {...recipe, story: {kit: 'kinetic', scene: 'one', words: []}, camera: [{move: 'freeze', at: ['one', 'Here'], until: ['one', 'every part']}]}});
  const r = await reviewPart(frozen, {from: 0, to: frozen.clock.start('two'), checks: {'frozen-voice': REVIEW_CHECKS['frozen-voice']}});
  assert.deepEqual(r.ran, ['frozen-voice']);
  assert.deepEqual(r.findings.filter(f => /storyboard/.test(f.what)), [], JSON.stringify(r.findings));
});

test('storyreel anchors names the storyboard for a phrase the storyboard holds, also when the compile stops before it', async t => {
  const dir = tempDir('differs-anchors', t), kit = pathToFileURL(path.resolve('src/kits/kinetic/index.mjs')).href;
  const scenes = `[{id: 'one', narration: 'Here it all runs thirty times faster than life.', differs: {time: 30, said: 'a hundred times faster'}}, {id: 'two', narration: 'And this is real.'}]`;
  writeFileSync(path.join(dir, 'storyreel.config.mjs'), `import {kineticKit} from ${JSON.stringify(kit)};
const stopping = {name: 'stopping', story: {compile() { throw new Error('stopping: a kit refuses'); }}};
export default {film: flags => ({storyboard: {title: 'T', scenes: ${scenes}}, recipe: {story: {kit: flags.stop ? 'stopping' : 'kinetic', scene: 'one', words: []}}, kits: [kineticKit, stopping]})};
`);
  const text = await anchors(await readInputs({cwd: dir}));
  assert.match(text, /one "a hundred times faster" → storyboard\.scenes\[0\]\.differs\.said — not said; the nearest words said: "times faster"/, text);
  assert.doesNotMatch(text, /recipe\.storyboard/);
  const stopped = await anchors(await readInputs({cwd: dir, stop: 'true'}));
  assert.match(stopped, /one "a hundred times faster" → storyboard\.scenes\[0\]\.differs\.said — not said/, stopped);
  assert.match(stopped, /the compile stopped: stopping: a kit refuses/);
});

const has = cmd => !spawnSync(cmd, ['-version']).error;

test('the making-of lists how its scenes differ', {skip: has('ffmpeg') ? false : 'needs ffmpeg'}, async t => {
  const dir = tempDir('differs-render', t), storyboard = {title: 'T', scenes: [{id: 'one', silent: [['some words here', 2]], differs: {time: 30}}]};
  const {makingOf} = await makeFilm({storyboard, recipe: {story: {kit: 'kinetic', scene: 'one', words: []}}, kits: [kineticKit], timings: evenTimings(storyboard, {tail: 0}), out: path.join(dir, 'film.mp4')});
  const made = JSON.parse(readFileSync(makingOf, 'utf8'));
  assert.deepEqual(made.differs.map(d => [d.scene, d.time, d.shown]), [['one', 30, [TIME]]]);
  assert.match(made.claims.why, /the only number on screen is the film's own/, 'the render\'s check says so too');
});

test('an analogy says what stands in for what, in its own line', () => {
  const ANALOGY = 'people stand in for the services', LINE = `An analogy: ${ANALOGY}`;
  assert.deepEqual({...readDiffers({analogy: ANALOGY})}, {analogy: ANALOGY, shown: [LINE]});
  assert.deepEqual([...readDiffers({analogy: ANALOGY, scale: SCALE, time: 30}).shown], [TIME, SCALE, LINE]);
  assert.deepEqual([...readDiffers({analogy: ANALOGY, shown: 'Eine Analogie'}).shown], ['Eine Analogie']);
  assert.deepEqual([...readDiffers({analogy: ANALOGY, shown: false, said: 'stand in for'}).said], ['stand in for']);
  assert.throws(() => readDiffers({time: 30, analogy: ANALOGY, shown: TIME}), /declares both time and an analogy and says only 1 thing.*so neither goes unstated/);
  assert.throws(() => readDiffers({time: 30, scale: SCALE, analogy: ANALOGY, shown: ['A', 'B']}), /declares time, scale and an analogy and says only 2 thing.*so none goes unstated/);
  assert.throws(() => readDiffers({analogy: 7}), /differs\.analogy is words/);
  assert.throws(() => readDiffers({analogy: 'x'.repeat(DIFFERS_MOST)}), /more than its label can hold in a glance \(58, after "An analogy:"\)/);
  assert.equal(readDiffers({analogy: 'x'.repeat(58)}).shown[0].length, DIFFERS_MOST);
  // A number in the analogy is not a wrong time; the time's own line still is held to the factor.
  assert.deepEqual([...readDiffers({time: 30, analogy: '2 dogs stand in for 2 nuclei'}).shown], [TIME, 'An analogy: 2 dogs stand in for 2 nuclei']);
  assert.throws(() => readDiffers({time: 30, analogy: 'a shop', shown: ['Time shown 40 times faster', 'A shop']}), /says 40 where differs\.time says 30/);
});

test('an analogy\'s default words are English, so a film in another language gives its own', () => {
  const board = differs => ({scenes: [{id: 'one', narration: 'Hier.', differs}]});
  assert.throws(() => differsOf(board({analogy: 'people stand in'}), {lang: 'de'}), /"An analogy: people stand in" is English and the film is in "de"/);
  assert.deepEqual([...differsOf(board({analogy: 'people stand in', shown: 'Eine Analogie'}), {lang: 'de'})[0].shown], ['Eine Analogie']);
  assert.equal(differsOf(board({analogy: 'people stand in'}), {lang: 'en-GB'})[0].shown[0], 'An analogy: people stand in');
});

