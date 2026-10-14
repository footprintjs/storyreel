// Claims (claims.mjs): every number the film shows — its lines, its emphasis words, its captions as shown, and (in the
// review) every word the picture draws — matches a fact the storyboard names ({value, text?, source}) or sits in a scene
// marked as example data, which says so on screen. A verdict in the review and in makeFilm's pipeline, decided with
// decide(), so the record says why.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {compileFilm, evenTimings, makeFilm} from '../src/index.mjs';
import {numbersIn, numberValue, numberLocale, readFacts, sourceKind, exampleScenes, findClaims, drawnClaims, drawnLines, DRAWN, HOLD, labelSpans, lingeringExamples, claimsCount, unsourcedClaims, claimText, CLAIMS_VERDICT} from '../src/claims.mjs';
import {decorative, isDecorative} from '../src/decorative.mjs';
import {createCanvas} from '@napi-rs/canvas';
import {approveFilm, checkApproval} from '../src/approval.mjs';
import {wordsAt, reviewPart} from '../src/review.mjs';
import {compileLayout} from '../src/layout.mjs';
import {planSegments, segmentMaterial} from '../src/segments.mjs';
import {tempDir} from './tmp.mjs';

const root = tempDir('claims');
const facts = [{value: 60, text: '60 Hz', source: 'https://example.org/display-rates'}, {value: 16.67, source: 'docs/frames.md'}];
writeFileSync(path.join(root, 'facts.json'), JSON.stringify(facts));
const storyboard = {title: 'Claims', facts: 'facts.json', scenes: [
  {id: 'rate', narration: 'A screen draws at 60 Hz, so one frame takes 16.67 ms, and some draw up to 120 times a second.', say: [['60 Hz', 'sixty hertz'], ['16.67 ms', 'sixteen point six seven milliseconds']]},
  {id: 'shop', example: true, narration: 'Say a stall sells 12 cups in a morning and 30 by the evening.'},
  {id: 'end', narration: 'That is all there is to it for now.'}]};
const recipe = {story: {kit: 'whiteboard', items: [
  {at: ['rate', 'A screen'], dur: .6, write: '60 Hz', x: 400, y: 300, size: 50, align: 'center'},
  {at: ['rate', 'some draw'], dur: .6, write: 'up to 120 Hz', x: 1000, y: 300, size: 50, align: 'center'},
  {at: ['shop', 'Say a stall'], dur: .6, write: '12 cups', x: 800, y: 500, size: 50, align: 'center'}]},
  emphasis: {strategy: 'corner', words: [{at: ['rate', 'one frame'], text: '16.67 MS A FRAME'}]}};
const timings = evenTimings(storyboard, {wordSeconds: .4, tail: 1});
const film = await compileFilm({storyboard, recipe, timings, root});

test('the numbers a text shows: footprint-narration\'s digit runs, with their sign, less a digit inside a name', () => {
  assert.deepEqual(numbersIn('One frame takes 16.67 ms at 60 Hz.'), ['16.67', '60']);
  assert.deepEqual(numbersIn('1,000 sheep by 3:15, (2024)'), ['1,000', '3:15', '2024']);
  assert.deepEqual(numbersIn('H2O, MP4 and v2 are names; 60Hz and 4K are numbers'), ['60', '4'], 'a run right after a cased letter is part of a name; a unit written on stays a number');
  assert.deepEqual(numbersIn('COVID-19 is a name; B-52 too'), [], 'a run after a hyphen after a cased letter is part of a name');
  assert.deepEqual(numbersIn('価格は100円、在庫は3個'), ['100', '3'], 'a CJK character is not cased: the numbers after it are seen');
  assert.deepEqual(numbersIn('it was −5 °C, then -3, from 5-10'), ['−5', '-3', '5', '10'], 'a minus standing on its own is the number\'s sign; one between digits is a range');
  assert.deepEqual(numbersIn('a low of –5 °C, the 10–20 range'), ['–5', '10', '20'], 'an en dash standing on its own is a sign too; between digits, a range');
  assert.equal(numberValue('–5'), -5);
  assert.deepEqual(numbersIn('by mid-2024, pre-2020 prices, post-1990 growth'), ['2024', '2020', '1990'], 'a year after a lower-case word or a time prefix is a number that needs a source');
  assert.deepEqual(numbersIn('Mid-2024 sales, Early-1999 and summer-2024'), ['2024', '1999', '2024'], 'a time prefix in any case (a sentence opens with it); a lower-case word');
  assert.deepEqual(numbersIn('dates in ISO-8601, the A-1000 model, text in UTF-8'), [], 'an upper-case code with a number is a name, whatever its digits: four of them are no year after one');
  assert.deepEqual(numbersIn('a B-52, COVID-19, an MP-3, a mid-3000 dream'), [], 'anything else after a hyphen after a cased letter stays a name: 3000 is no plausible year (1000–2199)');
  assert.deepEqual(numbersIn('no numbers here'), []);
  assert.equal(numberValue('1,000,000'), 1000000); assert.equal(numberValue('1.000.000,5'), 1000000.5); assert.equal(numberValue('16.67'), 16.67);
  assert.equal(numberValue('0.125'), .125); assert.equal(numberValue('−5'), -5);
  // Without the film's language, what the languages read apart is kept as written — ambiguous — and what they read alike
  // is one value (by a language: the next test). map(numberValue) is safe: its language is an option.
  assert.deepEqual(numbersIn('steps 1,2 and 3'), ['1,2', '3']);
  assert.deepEqual(['2,5', '1,00,000', '4,5'].map(numberValue), ['2,5', '1,00,000', '4,5'], 'a decimal comma, or a list? Indian grouping, or a typo? as written');
  assert.deepEqual(numbersIn('1,299.99 and 1,000,000').map(numberValue), [1299.99, 1000000]);
  assert.deepEqual(numbersIn('1.299,99 € and 1.000,5').map(numberValue), [1299.99, 1000.5], 'both separators: the last is the decimal, in every language that writes it');
  assert.deepEqual(findClaims([{text: 'steps 1,2 and 3', at: 0, to: 1, scene: 0, path: 'x'}], {facts: readFacts([{value: 1.2, source: 'https://example.org/x'}]), scenes: ['a']}).map(c => [c.number, c.source, c.ambiguous ?? null]),
    [['1,2', null, 'no language'], ['3', null, null]], 'a fact of 1.2 sources neither: "1,2" is 1.2 only in a language that says so');
  for (const ambiguous of ['1,000', '1.000', '16.670', '−1.000']) assert.equal(numberValue(ambiguous), ambiguous, `${ambiguous}: a thousand, or one? as written`);
  assert.equal(numberValue('3:15'), '3:15'); assert.equal(numberValue('1.2.3'), '1.2.3');
});

test('facts and example scenes are checked as written, each refusal naming the fix', () => {
  assert.deepEqual(readFacts([{value: '3:15', text: 'at 3:15', source: ' run.json#steps[2] '}]), [{value: '3:15', text: 'at 3:15', source: 'run.json#steps[2]', kind: 'unverified'}], 'without a root, only a URL is verified');
  for (const [list, message] of [
    [{value: 1}, /facts must be a list of facts/],
    [[{value: 1, source: 'x', note: 'y'}], /facts\[0\] has note; a fact takes value, text and source/],
    [[{value: '16.67 ms', source: 'x'}], /facts\[0\]: value is the number as the screen shows it \(16\.67, −5, or "1,000", "2,5", "3:15" as written\), not "16\.67 ms": give the number alone \("16\.67"\) and the words around it in text/],
    [[{value: '2 and 5', source: 'x'}], /facts\[0\]: .* not "2 and 5", which shows 2 numbers \("2", "5"\): one fact per number/],
    [[{value: NaN, source: 'x'}], /facts\[0\]: value is the number as the screen shows it/],
    [[{value: 1, text: '  ', source: 'x'}], /facts\[0\]: text is the words the number is shown with/],
    [[{value: 1}], /facts\[0\]: source says where 1 comes from: a URL, a document or a record pointer/],
  ]) assert.throws(() => readFacts(list), message);
  assert.deepEqual(exampleScenes({scenes: [{id: 'a', example: true}, {id: 'b'}, {id: 'c', example: 'Beispieldaten'}, {id: 'd', example: false}]}), ['Example data', null, 'Beispieldaten', null]);
  assert.throws(() => exampleScenes({scenes: [{id: 'a', example: 1}]}), /storyboard scene a: example is true \(the scene shows example data, and says so on screen\) or the label's words/);
});

test('the film lists every number it shows: its lines, its emphasis words, its captions as shown — each with its source', () => {
  assert.deepEqual(film.claims.facts.map(({kind, ...f}) => f), facts); assert.deepEqual(film.claims.examples, [null, 'Example data', null]);
  assert.deepEqual(film.claims.facts.map(f => f.kind), ['url', 'unverified'], 'a URL is followed; docs/frames.md is not in the root, so it is kept, unverified');
  const seen = film.claims.numbers.map(c => [c.number, c.scene, c.path, c.source, c.example]);
  assert.deepEqual(seen, [
    ['60', 'rate', 'story.items[0]', 'https://example.org/display-rates', false],
    ['60', 'rate', 'captions', 'https://example.org/display-rates', false],
    ['16.67', 'rate', 'emphasis.words[0]', 'docs/frames.md', false],
    ['16.67', 'rate', 'captions', 'docs/frames.md', false],
    ['120', 'rate', 'story.items[1]', null, false],
    ['120', 'rate', 'captions', null, false],
    ['12', 'shop', 'story.items[2]', null, true],
    ['12', 'shop', 'captions', null, true],
    ['30', 'shop', 'captions', null, true]], 'in time order; the captions show the slots in digits ("16.67 ms")');
  assert.ok(film.claims.numbers.every(c => c.to >= c.at), 'each from when it is whole on screen to when it starts to leave');
  assert.deepEqual(claimsCount(film.claims), {numbers: 9, examples: 3, sourced: 4, open: 6, unsourced: 2, unverified: 2, factsGiven: true}, 'the two 16.67s rest on docs/frames.md, not in the root: unverified, and counted');
  assert.equal(claimText(unsourcedClaims(film.claims)[0]), '"120" (scene rate, story.items[1]) has no source: add {"value": 120, "source": "…"} to the facts, or mark scene rate "example": true');
  assert.ok(!Object.keys(film.inputs.files).includes('facts.json') && typeof film.inputs.facts === 'string', 'the facts are hashed on their own, not among the files that draw');
  // A fact's words must stand around the number: 60 Hz is not 60 sheep, and 6 Hz is not the 6 in "6 apples and 16 Hz".
  const of = (text, list) => findClaims([{text, at: 1, scene: 0, path: 'x'}], {facts: readFacts(list), scenes: ['rate']}).map(c => [c.number, c.source]);
  assert.deepEqual(of('60 sheep', facts), [['60', null]]);
  const six = [{value: 6, text: '6 Hz', source: 'six.md'}];
  assert.deepEqual(of('6 apples and 16 Hz', six), [['6', null], ['16', null]]);
  assert.deepEqual(of('it ticks at 6Hz', six), [['6', 'six.md']], 'a space in the fact\'s words matches any spacing');
  // In the captions the words are looked for in the whole scene, around the number's own place in it.
  assert.deepEqual(findClaims([{text: '6', line: '6 apples and 16 Hz', offset: 0, at: 1, scene: 0, path: 'captions'}], {facts: readFacts(six), scenes: ['a']}).map(c => c.source), [null]);
  assert.deepEqual(findClaims([{text: 'Hz', line: 'at 6 Hz', offset: 5, at: 1, to: 2, scene: 0, path: 'captions'}, {text: '6', line: 'at 6 Hz', offset: 3, at: 1, to: 2, scene: 0, path: 'captions'}], {facts: readFacts(six), scenes: ['a']}).map(c => c.source), ['six.md']);
});

test('one claim per place in a line: the same number twice in a line is two; the sign counts; "1.000" is not 1', () => {
  const of = (text, list) => findClaims([{text, at: 1, to: 2, scene: 0, path: 'x'}], {facts: readFacts(list), scenes: ['a']}).map(c => [c.number, c.offset, c.source]);
  assert.deepEqual(of('60 Hz on a screen, 60 sheep in a pen', facts), [['60', 0, 'https://example.org/display-rates'], ['60', 19, null]], 'the 60 sheep are not the 60 Hz');
  assert.deepEqual(findClaims([{text: '60 Hz', at: 1, to: 2, scene: 0, path: 'x'}, {text: '60 Hz', at: 3, to: 4, scene: 0, path: 'y'}], {scenes: ['a']}).map(c => [c.path, c.at, c.to]), [['x', 1, 4]], 'a line shown again is the same claim');
  const cold = [{value: 5, text: '5 °C', source: 'met.md'}];
  assert.deepEqual(of('it was −5 °C', cold), [['−5', 7, null]], 'a "5 °C" fact does not source "−5 °C"');
  assert.deepEqual(of('it was −5 °C', [{value: -5, text: '−5 °C', source: 'met.md'}]), [['−5', 7, 'met.md']]);
  assert.deepEqual(of('1.000 visitors', [{value: 1, source: 'one.md'}, {value: 1000, source: 'thousand.md'}]), [['1.000', 0, null]], 'a thousand or one: no number sources it');
  assert.deepEqual(of('1.000 visitors', [{value: '1.000', text: '1.000 visitors', source: 'log.md'}]), [['1.000', 0, 'log.md']], 'a fact written as the screen writes it does');
});

test('an example scene says so on screen, in the top right corner, from its first frame and while its lines are up', () => {
  const shop = film.clock.start('shop'), label = t => wordsAt(film, t).find(w => w.text === 'Example data');
  const on = label(shop + .5);
  assert.ok(on && on.box[2] <= 1561 && on.box[2] > 1450 && on.box[1] < 70, JSON.stringify(on));
  assert.equal(label(shop - .2), undefined);
  // The board keeps "12 cups" into the next scene: the label stays with it, and goes when it does.
  const cups = film.claims.numbers.find(c => c.path === 'story.items[2]');
  assert.ok(cups.to > film.clock.start('end'), 'the line is still up in the next scene');
  assert.ok(label(film.clock.start('end') + .2), 'so the label is too');
  assert.deepEqual(film.claims.labels.map(l => [l.from, +l.to.toFixed(3), l.words]), [[shop, cups.to, 'Example data']]);
  assert.ok(film.lines.some(l => l.text === 'Example data' && l.path === 'storyboard.scenes[1].example' && l.from === shop), 'a line meant to be read');
  // A format that crops the frame (vertical: a 4:3 window) shows it in the corner of what the crop shows.
  const vertical = compileLayout(film, {format: 'vertical'}), cropped = wordsAt(film, shop + .5, {layout: vertical}).find(w => w.text === 'Example data');
  assert.ok(cropped && cropped.box[0] > 0 && cropped.box[2] < vertical.width && cropped.box[1] >= vertical.boxes.film[1], JSON.stringify(cropped));
  // An edit to the label redraws the segments that show it: it is in their key.
  const [first] = planSegments(film), material = segmentMaterial(film, first, {recipe, storyboard, pixels: {}});
  assert.deepEqual(material.scenes.map(s => s.example ?? null), [null, true, null]);
});

test('the facts draw nothing: a corrected source leaves every segment\'s key alone, and an approval still locks it', async () => {
  const dir = tempDir('facts'), write = list => writeFileSync(path.join(dir, 'facts.json'), JSON.stringify(list));
  const of = async () => compileFilm({storyboard, recipe, timings, root: dir}), materials = f => planSegments(f).map(seg => segmentMaterial(f, seg, {recipe, storyboard, pixels: {}}));
  write(facts); const before = await of();
  write([{...facts[0], source: 'https://example.org/display-rates-2026'}, facts[1]]); const after = await of();
  assert.deepEqual(materials(after), materials(before), 'no segment is drawn again for a corrected source');
  assert.deepEqual(after.inputs.files, before.inputs.files);
  assert.notEqual(after.inputs.facts, before.inputs.facts);
  const approval = approveFilm({record: {out: 'film.mp4', inputs: before.inputs}, by: 'S'});
  assert.deepEqual(checkApproval(approval, after.inputs).changed, ['facts'], 'the approval names the facts');
  const plain = await compileFilm({storyboard: (({facts: _, ...rest}) => rest)(storyboard), recipe, timings, root: dir});
  assert.equal('facts' in plain.inputs, false, 'a film with no facts has the inputs it always had');
});

test('the facts are found inside the root, and a file that is not there or not JSON refuses with the fix', async () => {
  const of = sb => compileFilm({storyboard: sb, recipe: {story: {kit: 'whiteboard', items: []}}, timings, root});
  await assert.rejects(of({...storyboard, facts: 'nope.json'}), /storyboard\.facts names nope\.json, which is not a file in the film's root/);
  writeFileSync(path.join(root, 'bad.json'), '{not json');
  await assert.rejects(of({...storyboard, facts: 'bad.json'}), /storyboard\.facts: bad\.json is not JSON .*; it is a list of facts/);
  await assert.rejects(of({...storyboard, facts: '../outside.json'}), /outside\.json is outside/);
  await assert.rejects(of({...storyboard, facts: [{value: 1}]}), /storyboard\.facts\[0\]: source says where 1 comes from/);
  assert.equal((await of({...storyboard, facts: facts})).claims.facts.length, 2, 'or the list itself');
});

test('the review decides it with decide(): failed lists each number with no source, its scene and the fix; not run without facts', async () => {
  const quick = {every: 1};   // a few samples are enough: the claims are the film's own list
  const r = await reviewPart(film, quick);
  const v = r.verdicts.find(x => x.check === 'claims');
  assert.equal(v.verdict, 'failed'); assert.equal(v.why, CLAIMS_VERDICT.rules[2].label);
  assert.equal(v.summary, '9 numbers on screen: 4 sourced (2 on a source nobody can follow: unverified), 3 in example scenes, 2 with no source');
  assert.deepEqual(r.findings.filter(f => f.kind === 'claims').map(f => [f.scene, f.what]), [
    ['rate', '"120" (scene rate, story.items[1]) has no source: add {"value": 120, "source": "…"} to the facts, or mark scene rate "example": true'],
    ['rate', '"120" (scene rate, captions) has no source: add {"value": 120, "source": "…"} to the facts, or mark scene rate "example": true']]);
  assert.match(r.record.filter(e => e.type === 'condition').map(e => e.text).join('\n'), /"a number on screen has no source and sits in no example scene": unsourced 2 gt 0 ✓, and chose claims\/failed/);
  // The example scene and after: the board still shows "up to 120 Hz" from the scene before (its line is up until the
  // story ends), so that number is in the part; the captions' 120 was said and gone.
  const part = (await reviewPart(film, {...quick, from: film.clock.start('shop'), to: film.total})).verdicts.find(x => x.check === 'claims');
  assert.deepEqual([part.verdict, part.measured.unsourcedNumbers.map(c => c.path)], ['failed', ['story.items[1]']]);
  const {facts: _, ...unsourced} = storyboard;
  const none = await reviewPart(await compileFilm({storyboard: unsourced, recipe, timings, root}), quick);
  const n = none.verdicts.find(x => x.check === 'claims');
  assert.equal(n.verdict, 'not run'); assert.equal(n.why, CLAIMS_VERDICT.rules[1].label);
  assert.equal(none.findings.filter(f => f.kind === 'claims').length, 0);
  // A part that starts while a line is still up counts its numbers: the line's [at, to] meets the part.
  const line = film.claims.numbers.find(c => c.path === 'story.items[1]'), late = await reviewPart(film, {...quick, from: line.at + .5, to: line.at + 4});
  assert.ok(late.verdicts.find(x => x.check === 'claims').measured.unsourcedNumbers.some(c => c.path === 'story.items[1]'));
});

test('the review reads the numbers the picture draws, from the frames it already reads: a kit\'s own words are claims too', async () => {
  // A kit that draws a number it never lists (no texts()): a gauge that reads 42 %.
  const gauge = {name: 'gauge', story: {compile: () => ({hang: 1, draw: c => { c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '60px sans-serif'; c.fillText('Load: 42 %', 200, 300); c.fillText('60 Hz', 200, 500); }})}};
  const sb = {title: 'Gauge', facts: facts, scenes: [{id: 'a', narration: 'the gauge shows how busy the machine is, and the screen rate'}]};
  const f = await compileFilm({storyboard: sb, recipe: {story: {kit: 'gauge'}}, timings: evenTimings(sb, {wordSeconds: .4}), kits: [gauge]});
  assert.equal(f.claims.numbers.length, 0, 'nothing declared');
  const r = await reviewPart(f, {every: .5}), v = r.verdicts.find(x => x.check === 'claims');
  assert.deepEqual([v.verdict, v.measured.numbers, v.measured.drawn, v.measured.sourced], ['failed', 2, 2, 1]);
  assert.deepEqual(r.findings.filter(x => x.kind === 'claims').map(x => x.what), ['"42" (scene a, drawn) has no source: add {"value": 42, "source": "…"} to the facts, or mark scene a "example": true']);
  // A drawn line the film declares is the declared claim, not a second one.
  const declaredToo = drawnClaims([{t: 7.5, words: [{text: 'up to 120 Hz'}, {text: '12 cups'}]}], {claims: film.claims, sceneOf: t => film.clock.locate(t).index, scenes: ['rate', 'shop', 'end']});
  assert.deepEqual(declaredToo, []);
  // A number drawn in an example scene that stays on screen with no label — no declared line keeps the label up — is not
  // example data while it is unlabelled: it needs a source.
  const gauge77 = t => ({t, words: [{text: 'a gauge at 77 %'}]}), inShop = film.clock.start('shop') + 1, shopOnly = {...film.claims, labels: [{from: film.clock.start('shop'), to: film.clock.start('end'), words: 'Example data', scene: 1}]};
  const of = samples => drawnClaims(samples, {claims: shopOnly, sceneOf: t => film.clock.locate(t).index, scenes: ['rate', 'shop', 'end']}).map(c => [c.number, c.scene, c.example]);
  assert.deepEqual(of([gauge77(inShop), gauge77(inShop + 1)]), [['77', 'shop', true]], 'drawn and labelled the whole time: example data');
  assert.deepEqual(of([gauge77(inShop), gauge77(film.total - .1)]), [['77', 'shop', false]], 'still drawn after the label has gone: a claim');
  // What it costs: no frame is drawn again — the words are the ones read for every check.
  const samples = Array.from({length: 400}, (_, k) => ({t: k * .25, words: [{text: 'Load: 42 %'}, {text: 'up to 120 Hz'}, {text: 'a title with no number'}]}));
  const started = performance.now(); drawnClaims(samples, {claims: film.claims, sceneOf: () => 0, scenes: ['rate']});
  assert.ok(performance.now() - started < 200, 'reading 1,200 drawn words takes well under 0.2 s');
});

test('makeFilm: claims "refuse" refuses a number with no source before anything is drawn; "report" keeps the verdict in the record', async () => {
  const out = dir => path.join(root, dir, 'film.mp4');
  await assert.rejects(makeFilm({storyboard, recipe, timings, root, out: out('refused'), claims: 'refuse'}),
    /The film shows 2 numbers with no source \(claims: 'refuse'; the check saw declared lines only \(the review also reads what the picture draws\)\): "120" \(scene rate, story\.items\[1\]\) has no source: add \{"value": 120, "source": "…"\} to the facts, or mark scene rate "example": true; "120" \(scene rate, captions\)/);
  assert.deepEqual(readdirSync(path.join(root, 'refused')), [], 'nothing drawn, nothing left behind');
  const {facts: _, ...unsourced} = storyboard;
  await assert.rejects(makeFilm({storyboard: unsourced, recipe, timings, root, out: out('unchecked'), claims: 'refuse'}),
    /claims: 'refuse' needs the facts the numbers on screen come from \(the check saw declared lines only \(the review also reads what the picture draws\)\) — the storyboard names no facts, so the numbers outside example scenes cannot be checked: give the storyboard "facts": "facts\.json"/);
  await assert.rejects(makeFilm({storyboard, recipe, timings, root, out: out('x'), claims: 'strict'}), /claims is 'report' \(the record lists the numbers on screen with no source\) or 'refuse'/);
});

const ffmpeg = !spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-version']).error;
test('a claims refusal with a voice leaves the voice and the last render\'s narration as they were', {skip: ffmpeg ? false : 'needs ffmpeg'}, async () => {
  const top = tempDir('claims-voice'), voice = path.join(top, 'voice'), even = evenTimings(storyboard, {tail: 1});
  spawnSync('mkdir', ['-p', voice]);
  const scenes = even.scenes.map(sc => { const audio = `${sc.id}.wav`; spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(sc.duration), '-c:a', 'pcm_s16le', path.join(voice, audio)]); return {...sc, audio}; });
  writeFileSync(path.join(voice, 'timings.json'), JSON.stringify({...even, scenes}));
  const voiceBefore = readdirSync(voice).map(f => [f, readFileSync(path.join(voice, f)).length]);
  const pacing = {voiceSpeed: 1, sceneTail: 1, holds: [], tails: {}}, out = path.join(top, 'final', 'film.mp4'), render = {width: 160, height: 90, fps: 5};
  await makeFilm({storyboard, recipe, root, narrationDir: voice, pacing, out, render});
  const kept = readFileSync(path.join(top, 'final', 'narration', 'timings.json'), 'utf8');
  await assert.rejects(makeFilm({storyboard, recipe, root, narrationDir: voice, pacing: {...pacing, sceneTail: 1.5}, out, render, claims: 'refuse'}), /The film shows 2 numbers with no source \(claims: 'refuse'; the check saw declared lines only/);
  assert.equal(readFileSync(path.join(top, 'final', 'narration', 'timings.json'), 'utf8'), kept, 'the last render\'s narration is untouched');
  assert.deepEqual(readdirSync(path.join(top, 'final')).filter(f => f.startsWith('.narration')), [], 'and the refused one\'s paced copy is gone');
  assert.deepEqual(readdirSync(voice).map(f => [f, readFileSync(path.join(voice, f)).length]), voiceBefore, 'the voice folder is as it was');
});

test('makeFilm records every number with no source, the verdict and why', {skip: ffmpeg ? false : 'needs ffmpeg'}, async () => {
  const made = await makeFilm({storyboard, recipe, timings, root, out: path.join(root, 'made', 'film.mp4'), render: {width: 320, height: 180, fps: 6}});
  const record = JSON.parse(readFileSync(made.makingOf, 'utf8'));
  assert.equal(record.claims.verdict, 'failed'); assert.equal(record.claims.why, CLAIMS_VERDICT.rules[2].label);
  assert.equal(record.claims.saw, 'declared lines only (the review also reads what the picture draws)');
  assert.equal(record.claims.unverified, 2, 'the two 16.67s rest on docs/frames.md, which is not in the root: unverified, and counted');
  assert.deepEqual(record.claims.unsourced.map(c => [c.number, c.scene, c.path]), [['120', 'rate', 'story.items[1]'], ['120', 'rate', 'captions']]);
  assert.ok(record.pipeline.some(e => /check-claims/.test(e.text ?? '')) && record.pipeline.some(e => e.type === 'condition' && /unsourced 2 gt 0/.test(e.text)), 'the verdict and its evidence are in the pipeline\'s record');
  assert.ok(existsSync(path.join(root, 'made', 'film.mp4')));
});

test('an example line that stays up into a real scene keeps its label there: the reviewer\'s shop and real', async () => {
  const sb = {title: 'Shop', facts: [], scenes: [{id: 'shop', example: true, narration: 'Say a stall sells 12 cups in a morning, for the sake of the sum.'},
    {id: 'real', narration: 'Now a real stall: it keeps its own count, and we read it from the record.'}]};
  const f = await compileFilm({storyboard: sb, recipe: {story: {kit: 'whiteboard', items: [{at: ['shop', 'Say a stall'], dur: .6, write: '12 cups', x: 800, y: 500, size: 50, align: 'center'}]}}, timings: evenTimings(sb, {wordSeconds: .4, tail: 1}), root});
  const inReal = f.clock.start('real') + 2, said = t => wordsAt(f, t).map(w => w.text);
  assert.ok(said(inReal).includes('12 cups') && said(inReal).includes('Example data'), 'the number and its label, both up in the real scene');
  assert.deepEqual(f.claims.labels.map(l => [l.from, l.to]), [[0, f.total]], 'the board keeps the line to the end, and the label with it');
  assert.ok(f.lines.some(l => l.text === 'Example data' && l.to === f.total), 'the label is a line meant to be read, for as long as it is up');
  const v = (await reviewPart(f, {every: 1})).verdicts.find(x => x.check === 'claims');
  assert.deepEqual([v.verdict, v.measured.examples, v.measured.open], ['passed', 2, 0], 'labelled the whole time it is up: example data');
  assert.deepEqual(labelSpans([{text: 'x', at: 1, to: 2, scene: 0}, {text: 'y', at: 5, to: 6, scene: 1}], {examples: ['Example data', null], scenes: [{from: 0, to: 3}, {from: 3, to: 9}]}).map(l => [l.from, l.to]), [[0, 3]], 'a real scene\'s line keeps no label up');
  const r = await reviewPart(f, {every: 1});
  assert.ok(r.ran.includes('example-lingers') && !r.findings.some(x => x.kind === 'example-lingers'), 'the line lingers, but beside no real number: the label covers nothing it should not');
});

test('an example line that lingers into a real scene beside a real number is a finding: erase it before the scene', async () => {
  const sb = {title: 'Shop', facts: [{value: 60, text: '60 Hz', source: 'https://example.org/rates'}],
    scenes: [{id: 'shop', example: true, narration: 'Say a stall sells 12 cups in a morning, for the sake of the sum.'},
      {id: 'real', narration: 'Now a real screen: it draws at 60 Hz, and we read that from its record.', say: [['60 Hz', 'sixty hertz']]}]};
  const items = [{at: ['shop', 'Say a stall'], dur: .6, write: '12 cups', x: 800, y: 300, size: 50, align: 'center'}, {at: ['real', 'Now a real'], dur: .6, write: '60 Hz', x: 800, y: 600, size: 50, align: 'center'}];
  const compile = story => compileFilm({storyboard: sb, recipe: {story: {kit: 'whiteboard', ...story}}, timings: evenTimings(sb, {wordSeconds: .4, tail: 1}), root});
  const f = await compile({items}), inReal = f.clock.start('real') + 2, said = wordsAt(f, inReal).map(w => w.text);
  assert.ok(['12 cups', '60 Hz', 'Example data'].every(w => said.includes(w)), `the reviewer's picture: the example line, the real number and the label, all up in scene real (${said})`);
  const stretch = lingeringExamples(f.claims, {scenes: f.timings.scenes.map((sc, i) => ({from: f.clock.offsets[i], to: f.clock.offsets[i] + sc.duration})), examples: f.claims.examples, ids: ['shop', 'real']});
  assert.deepEqual(stretch.map(g => [g.scene, g.example, g.from, +g.to.toFixed(3), [...new Set(g.numbers.map(c => c.number))]]), [['real', 'shop', f.clock.start('real'), +f.total.toFixed(3), ['60']]]);
  const r = await reviewPart(f, {every: 1}), found = r.findings.filter(x => x.kind === 'example-lingers');
  assert.deepEqual(found.map(x => [x.scene, x.what]), [['real', 'an example line lingers into scene real beside real numbers (60): erase it before the scene']]);
  assert.ok(found[0].from >= f.clock.start('real') && /example data over real numbers: an example line lingers/.test(r.text), r.text);
  assert.equal(r.verdicts.find(x => x.check === 'claims').verdict, 'passed', 'every number has its source: the finding is about what the label seems to cover, not a missing source');
  // Erased before the scene — the wipe over by the cut — the label goes with the line, and the real number stands on its own.
  const erased = await compile({erasers: {wipe: {at: ['real', 'Now a real', -1], dur: .5, box: [500, 220, 1100, 380]}}, items: [{...items[0], erase: 'wipe'}, items[1]]});
  assert.ok(erased.claims.labels.every(l => l.to <= erased.clock.start('real')) && !wordsAt(erased, erased.clock.start('real') + 2).some(w => w.text === 'Example data'));
  const clean = await reviewPart(erased, {every: 1});
  assert.ok(!clean.ran.includes('example-lingers') && !clean.findings.some(x => x.kind === 'example-lingers'), 'nothing lingers: the check has nothing to read');
});

test('the words drawn in pieces are read whole: "16" + ".67 ms" is 16.67, a code token "-" then "5" is −5', async () => {
  const pieces = {name: 'pieces', story: {compile: () => ({hang: 1, draw: c => {
    c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.textBaseline = 'alphabetic';
    c.font = '60px sans-serif'; c.fillText('16', 200, 300); c.fillText('.67 ms', 200 + c.measureText('16').width, 300);
    c.font = '28px Menlo'; let x = 200; for (const tok of ['const', ' ', 'drop', ' ', '=', ' ', '-', '5', ';']) { c.fillText(tok, x, 600); x += c.measureText(tok).width; }
  }})}};
  const sb = {title: 'Pieces', facts: [{value: 16.67, text: '16.67 ms', source: 'https://example.org/frames'}], scenes: [{id: 'a', narration: 'numbers drawn in pieces are read whole by the review'}]};
  const f = await compileFilm({storyboard: sb, recipe: {story: {kit: 'pieces'}}, timings: evenTimings(sb, {wordSeconds: .4}), kits: [pieces]});
  const lines = drawnLines(wordsAt(f, 1));
  assert.ok(lines.includes('16.67 ms') && lines.some(l => l.startsWith('-5')), JSON.stringify(lines));
  const v = (await reviewPart(f, {every: 1})).verdicts.find(x => x.check === 'claims');
  assert.deepEqual([v.verdict, v.measured.sourced, v.measured.unsourcedNumbers.map(c => c.number)], ['failed', 1, ['-5']], 'the 16.67 is sourced; the −5 is a number with its sign, and needs one');
  assert.deepEqual(drawnLines([{text: 'no box'}, {text: '16', box: [0, 0, 40, 40]}, {text: '.5', box: [41, 0, 70, 40]}]), ['16.5', 'no box']);
});

test('two numbers drawn close stay two: only touching ink, or a sign or a decimal point at its digits, joins without a space', async () => {
  // The reviewer's case: "12" and "30" drawn 4 px apart in 24-px boxes (0.17 of the height) are 12 and 30, never 1230.
  assert.deepEqual(drawnLines([{text: '12', box: [0, 0, 30, 24]}, {text: '30', box: [34, 0, 64, 24]}]), ['12 30']);
  assert.deepEqual(drawnLines([{text: '12', box: [0, 0, 30, 24]}, {text: '30', box: [31, 0, 61, 24]}]), ['1230'], `ink against ink (under ${DRAWN.touch} of the height) is one word drawn in pieces`);
  // Joined by what they are, at the gaps measured off real fonts: "16" then ".67 ms" (0.10), a Menlo "-" then "5" (0.09).
  assert.deepEqual(drawnLines([{text: '16', box: [0, 0, 40, 44]}, {text: '.67 ms', box: [44.3, 0, 140, 44]}]), ['16.67 ms'], 'a decimal point at its digits');
  assert.deepEqual(drawnLines([{text: '16.', box: [0, 0, 48, 44]}, {text: '67', box: [53, 0, 90, 44]}]), ['16.67'], 'a decimal point after its digits');
  assert.deepEqual(drawnLines([{text: '-', box: [0, 8, 12, 11]}, {text: '5', box: [13.8, 0, 26, 21]}]), ['-5'], 'a minus at its digits is its sign');
  assert.deepEqual(drawnLines([{text: 'x', box: [0, 0, 20, 20]}, {text: '-', box: [26, 8, 36, 11]}, {text: '5', box: [42, 0, 54, 20]}]), ['x - 5'], 'a minus with room after it is not a sign');
  assert.deepEqual(drawnLines([{text: 'up', box: [0, 0, 40, 20]}, {text: 'to', box: [46, 0, 70, 20]}]), ['up to'], 'words a space apart are one line, with the space');
  // Read off a frame: two numbers 4 px apart are two claims.
  const close = {name: 'close', story: {compile: () => ({hang: 1, draw: c => {
    c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '24px sans-serif'; c.fillText('12', 200, 300); c.fillText('30', 200 + c.measureText('12').width + 4, 300);
  }})}};
  const sb = {title: 'Close', facts: [{value: 12, source: 'https://example.org/a'}, {value: 30, source: 'https://example.org/b'}], scenes: [{id: 'a', narration: 'two numbers drawn close are read as two'}]};
  const f = await compileFilm({storyboard: sb, recipe: {story: {kit: 'close'}}, timings: evenTimings(sb, {wordSeconds: .4}), kits: [close]});
  const v = (await reviewPart(f, {every: 1})).verdicts.find(x => x.check === 'claims');
  assert.deepEqual([v.verdict, v.measured.numbers, v.measured.sourced], ['passed', 2, 2], 'two numbers, each with its source: not one 1230 with none');
});

test('a source is a URL, a file in the root, or kept as unverified — "trust me" passes, and is counted', async t => {
  const outer = tempDir('sources', t), dir = path.join(outer, 'film');
  mkdirSync(dir); writeFileSync(path.join(dir, 'run.json'), '{"steps": []}'); writeFileSync(path.join(outer, 'elsewhere.md'), '# outside the film');
  assert.equal(sourceKind('https://example.org/x', {root: dir}), 'url');
  assert.equal(sourceKind('run.json#steps[2]', {root: dir}), 'file', 'a record with a pointer into it');
  assert.equal(sourceKind('missing.csv', {root: dir}), 'unverified');
  assert.equal(sourceKind('trust me', {root: dir}), 'unverified');
  assert.throws(() => sourceKind('../elsewhere.md', {root: dir, where: 'facts[0]'}), /facts\[0\]: source "\.\.\/elsewhere\.md" is a path outside the film's root .*: put the document inside it, or give its URL/, 'a path that is there, outside the root, refuses');
  assert.equal(sourceKind('../missing.md', {root: dir}), 'unverified', 'a path that leads nowhere is words');
  assert.equal(sourceKind('/r/science thread', {root: dir}), 'unverified', 'prose that starts with "/" is words too: kept as unverified, never a refusal');
  assert.equal(sourceKind('/r/science thread#top', {root: dir}), 'unverified');
  const sb = {title: 'Sources', facts: [{value: 60, text: '60 Hz', source: 'https://example.org/rates'}, {value: 12, source: 'run.json#steps[0]'}, {value: 30, source: 'trust me'}],
    scenes: [{id: 'a', narration: 'A screen at 60 Hz, 12 runs, 30 sheep.', say: [['60 Hz', 'sixty hertz']]}]};
  const f = await compileFilm({storyboard: sb, recipe: {story: {kit: 'whiteboard', items: []}}, timings: evenTimings(sb, {wordSeconds: .4}), root: dir});
  assert.deepEqual(f.claims.numbers.map(c => [c.number, c.sourceKind]), [['60', 'url'], ['12', 'file'], ['30', 'unverified']]);
  assert.deepEqual(claimsCount(f.claims), {numbers: 3, examples: 0, sourced: 3, open: 3, unsourced: 0, unverified: 1, factsGiven: true});
  const v = (await reviewPart(f, {every: 1})).verdicts.find(x => x.check === 'claims');
  assert.equal(v.verdict, 'passed');
  assert.equal(v.summary, '3 numbers on screen: 3 sourced (1 on a source nobody can follow: unverified), 0 in example scenes, 0 with no source');
  await assert.rejects(compileFilm({storyboard: {...sb, facts: [{value: 1, source: '/etc/hosts'}]}, recipe: {story: {kit: 'whiteboard', items: []}}, timings: evenTimings(sb, {wordSeconds: .4}), root: dir}), /source "\/etc\/hosts" is a path outside the film's root/);
  const prose = await compileFilm({storyboard: {...sb, facts: [{value: 60, text: '60 Hz', source: '/r/science thread'}]}, recipe: {story: {kit: 'whiteboard', items: []}}, timings: evenTimings(sb, {wordSeconds: .4}), root: dir});
  assert.deepEqual(prose.claims.facts.map(x => x.kind), ['unverified'], 'a prose source compiles, kept as unverified');
});

test('the example label stays until the example line\'s last ink: an eraser wipes it over its own time', async () => {
  // The reviewer's input: "12 cups" erased from 0.4 s after the cut, over 0.8 s.
  const sb = {title: 'Shop', facts: [], scenes: [{id: 'shop', example: true, narration: 'Say a stall sells 12 cups in a morning, for the sake of the sum.'},
    {id: 'real', narration: 'Now a real stall: it keeps its own count, and we read it from the record.'}]};
  const write = {at: ['shop', 'Say a stall'], dur: .6, write: '12 cups', x: 800, y: 500, size: 50, align: 'center', erase: 'wipe'};
  const timings = evenTimings(sb, {wordSeconds: .4, tail: 1}), probe = await compileFilm({storyboard: sb, recipe: {story: {kit: 'whiteboard', items: []}}, timings, root});
  const cut = probe.clock.start('real'), lead = probe.clock.at(['real', 'Now a real']) - cut;
  const f = await compileFilm({storyboard: sb, recipe: {story: {kit: 'whiteboard', erasers: {wipe: {at: ['real', 'Now a real', .4 - lead], dur: .8, box: [600, 440, 1000, 560]}}, items: [write]}}, timings, root});
  const line = f.lines.find(l => l.text === '12 cups');
  assert.deepEqual([+(line.to - cut).toFixed(3), +(line.gone - cut).toFixed(3)], [.4, 1.2], 'the line starts to leave as the wipe starts; its last ink goes as the wipe ends');
  assert.deepEqual(f.claims.labels.map(l => [l.from, +(l.to - cut).toFixed(3)]), [[0, 1.2]], 'the label stays to the last ink');
  const up = t => wordsAt(f, cut + t).some(w => w.text === 'Example data');
  assert.ok(up(.9) && up(1.15), 'half wiped, the line keeps its label (it used to go at the wipe\'s start, 0.8 s early)');
  assert.ok(!up(1.25), 'and goes with the last ink');
  assert.deepEqual(labelSpans([{text: '12 cups', at: 1, to: 3, gone: 4, scene: 0}], {examples: ['Example data', null], scenes: [{from: 0, to: 2}, {from: 2, to: 9}]}).map(l => [l.from, l.to]), [[0, 4]]);
});

/** A code panel drawn as How the Browser Draws draws it (series.mjs · codePanel): each token on its own, at its advance. */
const TOKENS = /(\s+|'[^']*'|"[^"]*"|\d+|[A-Za-z_$][\w$]*|.)/g;
function panel(c, lines, {typed = Infinity, numbers = 'plain', size = 24} = {}) {
  c.fillStyle = '#1d2230'; c.fillRect(0, 0, 1600, 900); let left = typed;
  lines.forEach((line, i) => {
    const ly = 200 + i * size * 1.55; c.textBaseline = 'middle';
    c.font = `600 ${size * .8}px Menlo, Consolas, monospace`; c.fillStyle = '#6b7389'; c.textAlign = 'right';
    if (numbers === 'decorative') decorative(c, () => c.fillText(String(i + 1), 152, ly)); else if (numbers === 'plain') c.fillText(String(i + 1), 152, ly);
    c.textAlign = 'left'; c.font = `600 ${size}px Menlo, Consolas, monospace`; let cx = 172;
    for (const tok of line.match(TOKENS)) { if (left <= 0) break; c.fillStyle = '#e6e9ef'; c.fillText(tok.slice(0, Math.max(0, left)), cx, ly); cx += c.measureText(tok).width; left -= tok.length; }
    left -= 1;
  });
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
}
const panelFilm = async (draw, facts = []) => {
  const sb = {title: 'Panel', facts, scenes: [{id: 'a', narration: 'a code panel drawn token by token, the way a browser series draws its code, read by the review'}]};
  return compileFilm({storyboard: sb, recipe: {story: {kit: 'panel'}}, timings: evenTimings(sb, {wordSeconds: .4}), kits: [{name: 'panel', story: {compile: () => ({hang: 1, draw})}}]});
};

test('a decimal drawn as tokens is one number: "16" "." "67" is 16.67, "$1" "," "299" "." "99" is 1,299.99 — and f(4,5), x - 5 stay apart', async () => {
  const code = ['const frame = 16.67;', 'let total = $1,299.99', 'f(4,5) + [1,2,3]', 'x - 5'];
  const f = await panelFilm(c => panel(c, code, {numbers: 'none'}), [{value: 16.67, source: 'https://example.org/frames'}, {value: 1299.99, source: 'https://example.org/price'}]);
  const lines = drawnLines(wordsAt(f, 1)), numbers = lines.flatMap(l => numbersIn(l)).sort();
  // Which tokens share a line rides on the font's word space (Menlo's is 0.7 of the height; a Linux monospace's, under
  // 0.5, puts "= $1,299.99" on one line): the numbers do not.
  assert.ok(lines.some(l => /(^|\s)16\.67(\s|$)/.test(l)) && lines.some(l => /(^|\s)\$1,299\.99$/.test(l)), JSON.stringify(lines));
  assert.deepEqual(numbers, ['1,2,3', '1,299.99', '16.67', '4,5', '5'], 'drawn as typed: without the film\'s language, f(4,5) and [1,2,3] are kept as written; x - 5 is a subtraction');
  assert.deepEqual(drawnLines([{text: '1', box: [0, 0, 14, 20]}, {text: ',', box: [17, 14, 21, 24]}, {text: '299', box: [26, 0, 66, 20]}]), ['1,299'], 'a thousands group');
  assert.deepEqual(drawnLines([{text: '4', box: [0, 0, 14, 20]}, {text: ',', box: [17, 14, 21, 24]}, {text: '5', box: [26, 0, 40, 20]}]), ['4,5'], 'joined as typed text has it');
  assert.deepEqual([numbersIn('4,5'), numberValue('4,5', {lang: 'de'})], [['4,5'], 4.5], 'and read as typed text is: as written without a language, 4.5 in de');
  // Drawn as typed: "1" "," "2" is "1,2"; "1" "." "299" "," "99" is 1299.99.
  const tokens = (...texts) => { let x = 0; return texts.map(text => { const w = /^[.,]$/.test(text) ? 4 : 14 * text.length, b = /^[.,]$/.test(text) ? [x, 14, x + w, 24] : [x, 0, x + w, 20]; x += w + 3; return {text, box: b}; }); };
  assert.deepEqual(drawnLines(tokens('1', ',', '2')).flatMap(l => numbersIn(l)), ['1,2']);
  assert.deepEqual(drawnLines(tokens('1', '.', '299', ',', '99')).flatMap(l => numbersIn(l)).map(numberValue), [1299.99]);
  assert.deepEqual(drawnLines(tokens('1', ',', '299', '.', '99')).flatMap(l => numbersIn(l)).map(numberValue), [1299.99]);
  assert.deepEqual(drawnLines([{text: '16', box: [0, 0, 28, 20]}, {text: '.', box: [32.5, 17, 36.5, 20]}, {text: '67', box: [42, 0, 70, 20]}]), ['16.67']);
  assert.deepEqual(drawnLines([{text: '16', box: [0, 0, 28, 20]}, {text: '.', box: [40, 17, 44, 20]}, {text: '67', box: [56, 0, 84, 20]}]), ['16', '.', '67'], `a point more than ${DRAWN.point} of the height off its digits is not theirs`);
  const v = (await reviewPart(f, {every: 1})).verdicts.find(x => x.check === 'claims');
  assert.deepEqual([v.measured.sourced, v.measured.unsourcedNumbers.map(c => c.number).sort()], [2, ['1,2,3', '4,5', '5']], 'the decimals are sourced as drawn');
});

test('digit groups of different sizes never join: "$1,299" and a raised "99" are 1,299 and 99, not 129999', async () => {
  // The honest reading: the picture does not say whether a raised group is cents (.99), a power (10² is 100) or a note
  // mark, so neither is read into the other — two numbers, each its own claim.
  const f = await panelFilm(c => {
    c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '600 60px sans-serif'; c.fillText('$1,299', 400, 500);
    const w = c.measureText('$1,299').width; c.font = '600 34px sans-serif'; c.fillText('99', 400 + w + 2, 476);
  });
  assert.deepEqual(drawnLines(wordsAt(f, 1)), ['$1,299 99']);
  assert.deepEqual(drawnLines([{text: '10', box: [0, 0, 40, 30]}, {text: '2', box: [40.5, -8, 52, 8]}]), ['10 2'], 'a superscript touching its base: 10², not 102');
  assert.deepEqual(drawnLines([{text: '12', box: [0, 0, 30, 24]}, {text: '30', box: [31, 0, 61, 24]}]), ['1230'], 'touching groups of one size are one number drawn in pieces');
  const v = (await reviewPart(f, {every: 1})).verdicts.find(x => x.check === 'claims');
  assert.deepEqual([v.verdict, v.measured.unsourcedNumbers.map(c => c.number)], ['failed', ['1,299', '99']], 'two numbers on screen, each needing its source');
});

test('decorative words are drawn and read, never claimed; a drawn number counts once it holds for two samples', async () => {
  const code = ['const frame = 16.67;', 'let n = 0;', 'loop();', 'paint();', 'wait();'];
  // Line numbers through decorative(): every check reads them, the claims check leaves them out.
  const marked = await panelFilm(c => panel(c, code, {numbers: 'decorative'})), plain = await panelFilm(c => panel(c, code));
  const words = wordsAt(marked, 1);
  assert.deepEqual(words.filter(w => w.decorative).map(w => w.text), ['1', '2', '3', '4', '5'], 'the line numbers are read, marked decorative');
  // Marked on the context it is drawn on: an offscreen sheet's own, carried onto the frame with the sheet.
  const sheeted = await panelFilm(c => { const sheet = createCanvas(400, 300), s = sheet.getContext('2d'); s.font = '40px Menlo'; s.fillStyle = '#222'; decorative(s, () => s.fillText('7', 40, 100)); s.fillText('8', 140, 100); c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.drawImage(sheet, 100, 100); });
  assert.deepEqual(wordsAt(sheeted, 1).map(w => [w.text, Boolean(w.decorative)]), [['7', true], ['8', false]]);
  assert.ok(words.filter(w => !w.decorative).every(w => !('decorative' in w)), 'the other words carry no mark');
  const drawn = async f => (await reviewPart(f, {every: 1})).verdicts.find(x => x.check === 'claims').measured.unsourcedNumbers.map(c => c.number).sort();
  assert.deepEqual(await drawn(plain), ['0', '1', '16.67', '2', '3', '4', '5'], 'drawn plain, the line numbers are claims');
  assert.deepEqual(await drawn(marked), ['0', '16.67'], 'drawn decorative, only the code\'s own numbers are');
  const r = await reviewPart(marked, {every: 1});
  assert.ok(r.ran.includes('text-density') && r.ran.includes('words-overlap'), 'the other checks still read the line numbers');
  assert.equal(isDecorative({}), false);
  assert.throws(() => decorative({}, null), /decorative\(ctx, draw\): draw is a function/);
});

/** A scripted picture: lines(t) → the lines drawn at t, one row each. Its reads every `step` from 0 to `to`, and its claims. */
const scripted = lines => t => lines(t).map((text, k) => ({text, box: [0, 100 * k, 20 * text.length, 100 * k + 30]}));
function heldClaims(lines, {step = .25, to = 4, facts = null} = {}) {
  const at = scripted(lines), samples = [];
  for (let k = 0; k * step <= to + 1e-9; k++) samples.push({t: +(k * step).toFixed(3), words: at(+(k * step).toFixed(3))});
  return drawnClaims(samples, {claims: {...film.claims, facts: facts ?? film.claims.facts}, sceneOf: () => 0, scenes: ['rate'], wordsAt: at}).map(c => [c.number, c.line, c.source !== null]);
}
const between = (t, a, b) => t >= a - 1e-9 && t < b - 1e-9;

test('a drawn number is checked in its own line: "Sold 40 cups" and later "Sold 40 kg" are two claims', () => {
  const facts = [{value: 40, text: '40 cups', source: 'https://example.org/cups'}];
  const apart = t => [...(between(t, .5, 1.5) ? ['Sold 40 cups'] : []), ...(between(t, 2, 3) ? ['Sold 40 kg'] : [])];
  assert.deepEqual(heldClaims(apart, {facts}), [['40', 'Sold 40 cups', true], ['40', 'Sold 40 kg', false]], 'the kg is checked, and has no source');
  const swapped = t => (between(t, .5, 1.5) ? ['Sold 40 cups'] : between(t, 1.5, 2.5) ? ['Sold 40 kg'] : []);
  assert.deepEqual(heldClaims(swapped, {facts}), [['40', 'Sold 40 cups', true], ['40', 'Sold 40 kg', false]], 'swapped in place, too');
  const counter = t => (between(t, 0, 3) ? [`frame ${Math.floor(t * 10)} of 60`] : []);
  assert.deepEqual(heldClaims(counter).map(c => c[0]), ['60'], 'a counter\'s passing values are no claims; the number that stays is');
});

test('a drawn number holds in time, at any review step: up 0.5 s or more it counts, up under 0.4 s it never does', async () => {
  // Read every 1 s, a value up 1 s is in one read only: the hold is timed from its edges read again.
  const gauge = t => (between(t, 1, 2) ? ['load 58 %'] : between(t, 2, 3) ? ['load 59 %'] : []);
  assert.deepEqual(heldClaims(gauge, {step: 1}).map(c => c[0]), ['58', '59']);
  // The bound, for reads HOLD.step (0.25 s) apart or closer — what the review gives the claims check, whatever its own step.
  for (const step of [.05, .1, HOLD.step]) for (const phase of [0, .07, .13, .19, .24]) {
    const up = seconds => heldClaims(t => (between(t, 1 + phase, 1 + phase + seconds) ? ['load 42 %'] : []), {step}).length;
    assert.equal(up(.5), 1, `up 0.5 s from ${1 + phase} s, read every ${step} s: counted`);
    assert.equal(up(.35), 0, `up 0.35 s from ${1 + phase} s, read every ${step} s: passing`);
  }
  // End to end: reviewPart reads for claims every 0.25 s whatever its own step.
  const f = await panelFilm((c, t) => { c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '60px sans-serif'; const v = between(t, 1, 2) ? 58 : between(t, 2, 3) ? 59 : null; if (v) c.fillText(`load ${v} %`, 200, 300); });
  const v = (await reviewPart(f, {every: 1})).verdicts.find(x => x.check === 'claims');
  assert.deepEqual(v.measured.unsourcedNumbers.map(c => c.number), ['58', '59']);
});

test('a typewriter\'s partials are no claims, and a line typed on past its number is one claim: 3 and 20 characters a second', async () => {
  // Typed at 6 characters a second and read every 0.25 s, "frame = 1", "frame = 16" and "frame = 16.6" each pass by.
  const six = await panelFilm((c, t) => panel(c, ['frame = 16.67;'], {numbers: 'none', typed: Math.floor(t * 6 + 1e-9)}));
  assert.deepEqual([1.5, 1.75, 2].map(t => drawnLines(wordsAt(six, t)).join(' | ')), ['frame | = | 1', 'frame | = | 16', 'frame | = | 16.6'], 'the partials, as drawn');
  const claimed = async f => (await reviewPart(f, {every: .25})).verdicts.find(x => x.check === 'claims').measured.unsourcedNumbers.map(c => c.number);
  assert.deepEqual(await claimed(six), ['16.67']);
  const line = 'We sold 1299 cups';
  for (const cps of [3, 20]) {
    // One string, typed on: "We sold 1" … "We sold 1299" (0.67 s at 3 a second: the space after it reads as nothing) … "We sold 1299 cups".
    const whole = await panelFilm((c, t) => { c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '60px sans-serif'; c.fillText(line.slice(0, Math.floor(t * cps + 1e-9)), 200, 300); });
    const v = (await reviewPart(whole, {every: .25})).verdicts.find(x => x.check === 'claims');
    assert.deepEqual(v.measured.unsourcedNumbers.map(c => [c.number, c.path]), [['1299', 'drawn']], `${cps} a second: one claim, never the partial 1, 12, 129, never 1299 twice`);
    // The browser series' own pattern: each token on its own.
    const tokens = await panelFilm((c, t) => panel(c, [line], {numbers: 'decorative', typed: Math.floor(t * cps + 1e-9)}));
    assert.deepEqual(await claimed(tokens), ['1299'], `${cps} a second, token by token`);
  }
  const typedOn = t => [line.slice(0, Math.min(line.length, Math.floor(t * 3 + 1e-9)))].filter(Boolean);
  assert.deepEqual(heldClaims(typedOn, {to: 8}).map(c => [c[0], c[1]]), [['1299', 'We sold 1299 cups']], 'the claim is the line it becomes');
});

/**
 * A number shown in a film of a language, read two ways — typed (a whiteboard line the film declares: film.claims) and
 * drawn (a kit that only paints it: the review's drawn claims) — each as [number, sourced, ambiguous].
 */
async function readBy(lang, text, facts) {
  const sb = {title: 'Numbers', facts, scenes: [{id: 'a', narration: 'On the board, a number from the record, read in the language the film is shown in.'}]};
  const timings = evenTimings(sb, {wordSeconds: .4}), as = lang ? {lang} : {};
  const typed = await compileFilm({storyboard: sb, recipe: {story: {kit: 'whiteboard', items: [{at: ['a', 'On the board'], dur: .6, write: text, x: 800, y: 450, size: 50, align: 'center'}]}}, timings, root, ...as});
  const sign = {name: 'sign', story: {compile: () => ({hang: 1, draw: c => { c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '60px sans-serif'; c.fillText(text, 300, 450); }})}};
  const painted = await compileFilm({storyboard: sb, recipe: {story: {kit: 'sign'}}, timings, root, kits: [sign], ...as});
  const r = await reviewPart(painted, {every: 1}), v = r.verdicts.find(x => x.check === 'claims');
  const drawn = [...Array(v.measured.sourced).fill(true), ...v.measured.unsourcedNumbers.map(() => false)].length === 1
    ? (v.measured.sourced ? [[numbersIn(text, as)[0], true]] : v.measured.unsourcedNumbers.map(c => [c.number, false])) : null;
  return {film: typed, typed: typed.claims.numbers.filter(c => c.path !== 'captions').map(c => [c.number, Boolean(c.source)]), drawn, claim: typed.claims.numbers.find(c => c.path !== 'captions')};
}
const url = 'https://example.org/record';

test('numbers are read by the language the film is shown in: de, fr, en-IN, ta and te, typed and drawn alike', async () => {
  for (const [lang, text, value, number] of [
    ['de', '2,5 kg', 2.5, '2,5'], ['de', '1.299,99 €', 1299.99, '1.299,99'],
    ['fr', '2,5 kg', 2.5, '2,5'], ['fr', '1 299,99 €', 1299.99, '1 299,99'], ['fr', '1 299,99 €', 1299.99, '1 299,99'],
    ['en-IN', '1,00,000 users', 100000, '1,00,000'], ['ta', '1,00,000 மக்கள்', 100000, '1,00,000'], ['te', '12,34,567.5 kg', 1234567.5, '12,34,567.5']]) {
    const {film, typed, drawn} = await readBy(lang, text, [{value, source: url}]);
    assert.equal(film.lang, lang);
    assert.deepEqual(typed, [[number, true]], `${lang} "${text}": sourced by ${value}`);
    assert.deepEqual(drawn, typed, `${lang} "${text}": drawn as typed`);
  }
  // Little Aha Stories' languages, ta and te, write Latin digits, "," groups and "." decimals, in Indian grouping.
  for (const lang of ['ta', 'te']) assert.deepEqual((({group, decimal, primary, secondary}) => [group, decimal, primary, secondary])(numberLocale(lang)), [',', '.', 3, 2]);
  assert.deepEqual((({group, decimal}) => [group, decimal])(numberLocale('fr')), [' ', ','], 'fr groups with a narrow no-break space (and a no-break space is read as one)');
  assert.deepEqual(numbersIn('a 1 234 list', {lang: 'fr'}), ['1', '234'], 'a plain space is no group: two numbers');
  // In another language, the same writing is another number, or none.
  assert.equal(numberValue('1,000', {lang: 'en'}), 1000); assert.equal(numberValue('1,000', {lang: 'de'}), 1);
  assert.equal(numberValue('16.67', {lang: 'de'}), '16.67', 'not a German number: as written');
});

test('without the film\'s language "2,5" is ambiguous, kept as written: only a fact written so sources it, and the fix says how to give a language', async () => {
  const bare = await readBy(null, '2,5 kg', [{value: 2.5, source: url}]);
  assert.equal(bare.film.lang, null); assert.equal(bare.film.inputs.lang, undefined, 'and no language in what an approval locks');
  assert.deepEqual([bare.typed, bare.drawn], [[['2,5', false]], [['2,5', false]]], 'typed and drawn alike: 2.5 does not source it');
  assert.equal(bare.claim.ambiguous, 'no language');
  assert.match(claimText(bare.claim), /"2,5" reads one way in one language and another in the next, and the film has no language: give it one \(lang: "de" reads "2,5" as 2\.5; "en-IN" reads "1,00,000" as 100000\) and source the number, or add \{"value": "2,5", "source": "…"\} to the facts as written/);
  const written = await readBy(null, '2,5 kg', [{value: '2,5', source: url}]);
  assert.deepEqual([written.typed, written.drawn], [[['2,5', true]], [['2,5', true]]], 'a fact written the same way sources it, as "1,000" is');
  assert.deepEqual((await readBy(null, '1,00,000 users', [{value: 100000, source: url}])).typed, [['1,00,000', false]], 'Indian grouping without a language: as written');
  const en = await readBy('en', '2,5 kg', [{value: 2.5, source: url}]);
  assert.deepEqual([en.typed, en.claim.ambiguous], [[['2,5', false]], 'en'], 'in en "2,5" is not one number');
  assert.match(claimText(en.claim), /"2,5" is not one number in en: add \{"value": "2,5", "source": "…"\} to the facts as written/);
  const de = await readBy('de', '2,5 kg', [{value: 2.5, source: url}]);
  assert.deepEqual([de.film.inputs.lang, de.claim.lang], ['de', 'de'], 'the language is in what an approval locks, and on each claim');
  await assert.rejects(compileFilm({storyboard: {title: 'x', scenes: [{id: 'a', narration: 'a b c'}]}, recipe: {story: {kit: 'whiteboard', items: []}}, timings: evenTimings({title: 'x', scenes: [{id: 'a', narration: 'a b c'}]}), root, lang: 'not a tag'}),
    /compileFilm: lang is the language the film is shown in, a BCP 47 tag \("de", "fr", "en-IN", "ta"\), not "not a tag"/);
  assert.equal(readFacts([{value: '2,5', source: url}])[0].value, '2,5', 'a fact "2,5" is accepted as written: never "put the words around it"');
});

test('makeFilm reads the numbers by its lang: the one language the film is shown in', async () => {
  const sb = {title: 'Sack', facts: [{value: 2.5, text: '2,5 kg', source: url}], scenes: [{id: 'a', narration: 'On the board, the weight of one sack, as the record gives it.'}]};
  const recipe = {story: {kit: 'whiteboard', items: [{at: ['a', 'On the board'], dur: .6, write: 'Ein Sack: 2,5 kg', x: 800, y: 450, size: 50, align: 'center'}]}}, timings = evenTimings(sb, {wordSeconds: .4});
  const out = name => path.join(root, 'lang', name, 'film.mp4');
  await assert.rejects(makeFilm({storyboard: sb, recipe, timings, root, lang: 'en', out: out('en'), claims: 'refuse'}), /"2,5" is not one number in en/);
  await assert.rejects(makeFilm({storyboard: sb, recipe, timings, root, out: out('none'), claims: 'refuse'}), /"2,5" reads one way in one language and another in the next, and the film has no language/);
  const film = await compileFilm({storyboard: sb, recipe, timings, root, lang: 'de'});
  assert.deepEqual([film.lang, claimsCount(film.claims).unsourced], ['de', 0], 'in de the fact sources it');
});

test('a line typed again is typed on again: "We sold 1299 cups today" at 3 a second, every 12 s, is one sourced claim', async () => {
  const line = 'We sold 1299 cups today', facts = [{value: 1299, text: '1299 cups', source: url}];
  const sb = {title: 'Again', facts, scenes: [{id: 'a', narration: Array.from({length: 66}, (_, i) => `word${i}`).join(' ')}]};
  const typer = {name: 'typer', story: {compile: () => ({hang: 1, draw: (c, t) => {
    c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.font = '60px sans-serif';
    c.fillText(line.slice(0, Math.floor((t % 12) * 3 + 1e-9)), 200, 450);
  }})}};
  const f = await compileFilm({storyboard: sb, recipe: {story: {kit: 'typer'}}, timings: evenTimings(sb, {wordSeconds: .4}), kits: [typer]});
  assert.ok(f.total > 24, `typed twice and more (${f.total.toFixed(1)} s)`);
  const v = (await reviewPart(f, {every: .25})).verdicts.find(x => x.check === 'claims');
  assert.deepEqual([v.verdict, v.measured.numbers, v.measured.sourced, v.measured.unsourcedNumbers.map(c => c.number)], ['passed', 1, 1, []], 'one claim, its line the one with "1299 cups": sourced, each time it is typed');
});
