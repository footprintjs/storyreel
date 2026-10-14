// Claims (claims.mjs): every number the film shows — its lines, its emphasis words, its captions as shown, and (in the
// review) every word the picture draws — matches a fact the storyboard names ({value, text?, source}) or sits in a scene
// marked as example data, which says so on screen. A verdict in the review and in makeFilm's pipeline, decided with
// decide(), so the record says why.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, existsSync, readFileSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {compileFilm, evenTimings, makeFilm} from '../src/index.mjs';
import {numbersIn, numberValue, readFacts, exampleScenes, findClaims, drawnClaims, claimsCount, unsourcedClaims, claimText, CLAIMS_VERDICT} from '../src/claims.mjs';
import {approveFilm, checkApproval} from '../src/approval.mjs';
import {wordsAt, reviewPart} from '../src/review.mjs';
import {compileLayout} from '../src/layout.mjs';
import {planSegments, segmentMaterial} from '../src/segments.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'storyreel-claims-'));
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
  assert.deepEqual(numbersIn('no numbers here'), []);
  assert.equal(numberValue('1,000,000'), 1000000); assert.equal(numberValue('1.000.000,5'), 1000000.5); assert.equal(numberValue('16.67'), 16.67);
  assert.equal(numberValue('4,5'), 4.5, 'a decimal comma'); assert.equal(numberValue('0.125'), .125); assert.equal(numberValue('−5'), -5);
  for (const ambiguous of ['1,000', '1.000', '16.670', '−1.000']) assert.equal(numberValue(ambiguous), ambiguous, `${ambiguous}: a thousand, or one? as written`);
  assert.equal(numberValue('3:15'), '3:15'); assert.equal(numberValue('1.2.3'), '1.2.3');
});

test('facts and example scenes are checked as written, each refusal naming the fix', () => {
  assert.deepEqual(readFacts([{value: '3:15', text: 'at 3:15', source: ' run.json#steps[2] '}]), [{value: '3:15', text: 'at 3:15', source: 'run.json#steps[2]'}]);
  for (const [list, message] of [
    [{value: 1}, /facts must be a list of facts/],
    [[{value: 1, source: 'x', note: 'y'}], /facts\[0\] has note; a fact takes value, text and source/],
    [[{value: '16.67 ms', source: 'x'}], /facts\[0\]: value is the number as the screen shows it \(16\.67, −5, or "1,000", "3:15" as written\), not "16\.67 ms": put the words around it in text/],
    [[{value: NaN, source: 'x'}], /facts\[0\]: value is the number as the screen shows it/],
    [[{value: 1, text: '  ', source: 'x'}], /facts\[0\]: text is the words the number is shown with/],
    [[{value: 1}], /facts\[0\]: source says where 1 comes from: a URL, a document or a record pointer/],
  ]) assert.throws(() => readFacts(list), message);
  assert.deepEqual(exampleScenes({scenes: [{id: 'a', example: true}, {id: 'b'}, {id: 'c', example: 'Beispieldaten'}, {id: 'd', example: false}]}), ['Example data', null, 'Beispieldaten', null]);
  assert.throws(() => exampleScenes({scenes: [{id: 'a', example: 1}]}), /storyboard scene a: example is true \(the scene shows example data, and says so on screen\) or the label's words/);
});

test('the film lists every number it shows: its lines, its emphasis words, its captions as shown — each with its source', () => {
  assert.deepEqual(film.claims.facts, facts); assert.deepEqual(film.claims.examples, [null, 'Example data', null]);
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
  assert.deepEqual(claimsCount(film.claims), {numbers: 9, examples: 3, sourced: 4, open: 6, unsourced: 2, factsGiven: true});
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

test('an example scene says so on screen, in the top right corner, for exactly its own time', () => {
  const shop = film.clock.start('shop'), label = t => wordsAt(film, t).find(w => w.text === 'Example data');
  const on = label(shop + .5);
  assert.ok(on && on.box[2] <= 1561 && on.box[2] > 1450 && on.box[1] < 70, JSON.stringify(on));
  assert.equal(label(shop - .2), undefined); assert.equal(label(film.clock.start('end') + .2), undefined);
  assert.ok(film.lines.some(l => l.text === 'Example data' && l.path === 'storyboard.scenes[1].example' && l.from === shop), 'a line meant to be read');
  // A format that crops the frame (vertical: a 4:3 window) shows it in the corner of what the crop shows.
  const vertical = compileLayout(film, {format: 'vertical'}), cropped = wordsAt(film, shop + .5, {layout: vertical}).find(w => w.text === 'Example data');
  assert.ok(cropped && cropped.box[0] > 0 && cropped.box[2] < vertical.width && cropped.box[1] >= vertical.boxes.film[1], JSON.stringify(cropped));
  // An edit to the label redraws the segments that show it: it is in their key.
  const [first] = planSegments(film), material = segmentMaterial(film, first, {recipe, storyboard, pixels: {}});
  assert.deepEqual(material.scenes.map(s => s.example ?? null), [null, true, null]);
});

test('the facts draw nothing: a corrected source leaves every segment\'s key alone, and an approval still locks it', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'storyreel-facts-')), write = list => writeFileSync(path.join(dir, 'facts.json'), JSON.stringify(list));
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
  assert.equal(v.summary, '9 numbers on screen: 4 sourced, 3 in example scenes, 2 with no source');
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
  // What it costs: no frame is drawn again — the words are the ones read for every check.
  const samples = Array.from({length: 400}, (_, k) => ({t: k * .25, words: [{text: 'Load: 42 %'}, {text: 'up to 120 Hz'}, {text: 'a title with no number'}]}));
  const started = performance.now(); drawnClaims(samples, {claims: film.claims, sceneOf: () => 0, scenes: ['rate']});
  assert.ok(performance.now() - started < 200, 'reading 1,200 drawn words takes well under 0.2 s');
});

test('makeFilm: claims "refuse" refuses a number with no source before anything is drawn; "report" keeps the verdict in the record', async () => {
  const out = dir => path.join(root, dir, 'film.mp4');
  await assert.rejects(makeFilm({storyboard, recipe, timings, root, out: out('refused'), claims: 'refuse'}),
    /The film shows 2 numbers with no source \(claims: 'refuse'\): "120" \(scene rate, story\.items\[1\]\) has no source: add \{"value": 120, "source": "…"\} to the facts, or mark scene rate "example": true; "120" \(scene rate, captions\)/);
  assert.deepEqual(readdirSync(path.join(root, 'refused')), [], 'nothing drawn, nothing left behind');
  const {facts: _, ...unsourced} = storyboard;
  await assert.rejects(makeFilm({storyboard: unsourced, recipe, timings, root, out: out('unchecked'), claims: 'refuse'}),
    /claims: 'refuse' needs the facts the numbers on screen come from — the storyboard names no facts, so the numbers outside example scenes cannot be checked: give the storyboard "facts": "facts\.json"/);
  await assert.rejects(makeFilm({storyboard, recipe, timings, root, out: out('x'), claims: 'strict'}), /claims is 'report' \(the record lists the numbers on screen with no source\) or 'refuse'/);
});

const ffmpeg = !spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-version']).error;
test('a claims refusal with a voice leaves the voice and the last render\'s narration as they were', {skip: ffmpeg ? false : 'needs ffmpeg'}, async () => {
  const top = mkdtempSync(path.join(tmpdir(), 'storyreel-claims-voice-')), voice = path.join(top, 'voice'), even = evenTimings(storyboard, {tail: 1});
  spawnSync('mkdir', ['-p', voice]);
  const scenes = even.scenes.map(sc => { const audio = `${sc.id}.wav`; spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(sc.duration), '-c:a', 'pcm_s16le', path.join(voice, audio)]); return {...sc, audio}; });
  writeFileSync(path.join(voice, 'timings.json'), JSON.stringify({...even, scenes}));
  const voiceBefore = readdirSync(voice).map(f => [f, readFileSync(path.join(voice, f)).length]);
  const pacing = {voiceSpeed: 1, sceneTail: 1, holds: [], tails: {}}, out = path.join(top, 'final', 'film.mp4'), render = {width: 160, height: 90, fps: 5};
  await makeFilm({storyboard, recipe, root, narrationDir: voice, pacing, out, render});
  const kept = readFileSync(path.join(top, 'final', 'narration', 'timings.json'), 'utf8');
  await assert.rejects(makeFilm({storyboard, recipe, root, narrationDir: voice, pacing: {...pacing, sceneTail: 1.5}, out, render, claims: 'refuse'}), /The film shows 2 numbers with no source \(claims: 'refuse'\)/);
  assert.equal(readFileSync(path.join(top, 'final', 'narration', 'timings.json'), 'utf8'), kept, 'the last render\'s narration is untouched');
  assert.deepEqual(readdirSync(path.join(top, 'final')).filter(f => f.startsWith('.narration')), [], 'and the refused one\'s paced copy is gone');
  assert.deepEqual(readdirSync(voice).map(f => [f, readFileSync(path.join(voice, f)).length]), voiceBefore, 'the voice folder is as it was');
});

test('makeFilm records every number with no source, the verdict and why', {skip: ffmpeg ? false : 'needs ffmpeg'}, async () => {
  const made = await makeFilm({storyboard, recipe, timings, root, out: path.join(root, 'made', 'film.mp4'), render: {width: 320, height: 180, fps: 6}});
  const record = JSON.parse(readFileSync(made.makingOf, 'utf8'));
  assert.equal(record.claims.verdict, 'failed'); assert.equal(record.claims.why, CLAIMS_VERDICT.rules[2].label);
  assert.deepEqual(record.claims.unsourced.map(c => [c.number, c.scene, c.path]), [['120', 'rate', 'story.items[1]'], ['120', 'rate', 'captions']]);
  assert.ok(record.pipeline.some(e => /check-claims/.test(e.text ?? '')) && record.pipeline.some(e => e.type === 'condition' && /unsourced 2 gt 0/.test(e.text)), 'the verdict and its evidence are in the pipeline\'s record');
  assert.ok(existsSync(path.join(root, 'made', 'film.mp4')));
});
