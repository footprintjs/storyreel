import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, mkdtempSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings, paceTimings, makeClock, makeFilm, withStrings, cartoonKit} from '../src/index.mjs';
import {compileExample} from './golden.mjs';

// Three short scenes and plain colour worlds, so a pixel says which world is on screen.
const storyboard = {title: 'Worlds', scenes: [
  {id: 'a', narration: 'This is the first world, all in red.'},
  {id: 'b', narration: 'Now the second world arrives, all in blue. How many are there? There are three.'},
  {id: 'c', narration: 'And here is a page of paper with some code on it.'},
]};
const solid = (name, color) => ({name, story: {compile: () => ({hang: 1, spotAt: () => null, sounds: [], draw: c => { c.fillStyle = color; c.fillRect(0, 0, 1600, 900); }})}});
const kits = [solid('red', '#ff0000'), solid('blue', '#0000ff')];
const root = fileURLToPath(new URL('../examples/worlds/', import.meta.url));
const recipe = (enter = 'fade', more = {}) => ({story: {kit: 'red'}, stages: [
  {type: 'world', scene: 'b', enter, world: {kit: 'blue'}},
  {type: 'code', scene: 'c', chrome: false, code: {file: 'count.ts'}, reveal: [[0, ['c', 'a page of paper']]]},
], ...more});
const timings = evenTimings(storyboard);
const pixel = (film, t, x, y) => { const c = createCanvas(1600, 900), ctx = c.getContext('2d'); film.frame(ctx, t); return [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)]; };
const near = (got, want, tol = 12) => got.every((v, i) => Math.abs(v - want[i]) <= tol);

test('silent pacing: a hold shifts only the words after its phrase; the scene ends its tail after the last word', () => {
  const pacing = {sceneTail: .8, holds: [{scene: 'b', after: 'How many are there', seconds: 3}], tails: {c: 1.5}};
  const paced = paceTimings(storyboard, timings, pacing), before = timings.scenes[1].words, after = paced.scenes[1].words;
  const k = before.findIndex(w => w.text === 'there?');
  assert.deepEqual(after.slice(0, k + 1), before.slice(0, k + 1), 'the words up to the phrase keep their times');
  for (let i = k + 1; i < before.length; i++) assert.ok(Math.abs(after[i].start - before[i].start - 3) < 1e-6);
  assert.equal(paced.scenes[2].duration, +(paced.scenes[2].words.at(-1).end + 1.5).toFixed(5));
  const pause = makeClock(storyboard, paced).pauseAfter(['b', 'How many are there']);
  assert.ok(Math.abs(pause.end - pause.start - (3 + .38 * .1)) < 1e-6, 'the pause is the hold plus the gap between words');
  assert.throws(() => paceTimings(storyboard, timings, {...pacing, holds: [{scene: 'b', after: 'nobody says this', seconds: 1}]}), /Pacing phrase not found in b/);
  assert.throws(() => paceTimings(storyboard, timings, {...pacing, holds: [{scene: 'b', after: 'How many', seconds: 7}]}), /between 0.1 and 6/);
});

test('worlds as scenes: each world fills the frame in its own scene', async () => {
  const film = await compileFilm({storyboard, timings, recipe: recipe(), kits, root});
  const clock = film.clock, mid = id => (clock.start(id) + clock.end(id)) / 2;
  assert.deepEqual(pixel(film, mid('a'), 800, 450), [255, 0, 0]);
  assert.deepEqual(pixel(film, mid('b'), 800, 450), [0, 0, 255]);
  assert.ok(!near(pixel(film, mid('c'), 800, 450), [0, 0, 255]), 'the paper page replaced the blue world');
});

test('shots enter with a fade, a wipe or an iris, mostly in the silence before the scene speaks', async () => {
  const halfway = f => f.clock.start('b') - .6 + .4;
  const fade = await compileFilm({storyboard, timings, recipe: recipe('fade'), kits, root});
  const mixed = pixel(fade, halfway(fade), 800, 450);
  assert.ok(mixed[0] > 60 && mixed[0] < 200 && mixed[2] > 60 && mixed[2] < 200, `a fade mixes the two worlds halfway (${mixed})`);
  const wipe = await compileFilm({storyboard, timings, recipe: recipe('wipe'), kits, root});
  assert.deepEqual(pixel(wipe, halfway(wipe), 200, 450), [0, 0, 255], 'the wipe has uncovered the left');
  assert.deepEqual(pixel(wipe, halfway(wipe), 1400, 450), [255, 0, 0], 'and not yet the right');
  const iris = await compileFilm({storyboard, timings, recipe: recipe({type: 'iris', at: [800, 450]}), kits, root});
  assert.deepEqual(pixel(iris, halfway(iris), 800, 450), [0, 0, 255], 'the iris opens from its centre');
  assert.deepEqual(pixel(iris, halfway(iris), 10, 10), [255, 0, 0], 'the corners open last');
  assert.ok(wipe.sounds.some(s => s.type === 'slide' && Math.abs(s.time - (wipe.clock.start('b') - .6)) < 1e-9), 'a wipe whooshes; a fade is silent');
  assert.ok(!fade.sounds.some(s => s.type === 'slide'));
  // Done before the first word: every entrance ends .2 s into its scene, and scenes start with a .3 s lead.
  assert.deepEqual(pixel(fade, fade.clock.start('b') + .21, 800, 450), [0, 0, 255]);
});

test('chrome-free: a stage with chrome: false shows no chip or title', async () => {
  const withChrome = recipe('fade'); withChrome.stages[1] = {...withChrome.stages[1], chrome: true, chip: 'THE RULE', title: 'One pebble'};
  const plain = await compileFilm({storyboard, timings, recipe: recipe(), kits, root});
  const dressed = await compileFilm({storyboard, timings, recipe: withChrome, kits, root});
  const t = plain.clock.end('c') - .3, chip = [110, 102];
  assert.ok(near(pixel(dressed, t, ...chip), [0x2d, 0x5c, 0x9a], 30), 'the chip is drawn in the accent');
  assert.ok(!near(pixel(plain, t, ...chip), [0x2d, 0x5c, 0x9a], 30), 'and is absent without chrome');
});

test('pause and guess: the card waits in the pause the narration holds, then shows the answer', async () => {
  const guesses = [{after: ['b', 'How many are there'], question: 'How many?', answer: 'Three!'}];
  await assert.rejects(compileFilm({storyboard, timings, recipe: recipe('fade', {guesses}), kits, root}), /a guess needs a hold there of at least 1 s/);
  const paced = paceTimings(storyboard, timings, {sceneTail: .8, holds: [{scene: 'b', after: 'How many are there', seconds: 3}]});
  const film = await compileFilm({storyboard, timings: paced, recipe: recipe('fade', {guesses}), kits, root});
  const bare = await compileFilm({storyboard, timings: paced, recipe: recipe(), kits, root});
  const pause = film.clock.pauseAfter(['b', 'How many are there']);
  assert.deepEqual(pixel(film, pause.start - .1, 800, 130), pixel(bare, pause.start - .1, 800, 130), 'nothing before the pause');
  assert.notDeepEqual(pixel(film, pause.start + 1.5, 800, 130), [0, 0, 255], 'the card is up during the pause');
  assert.notDeepEqual(pixel(film, pause.end + .5, 800, 130), pixel(bare, pause.end + .5, 800, 130), 'the answer shows after the pause');
  const leaves = film.clock.end('b') - .9 + .5;
  assert.deepEqual(pixel(film, leaves, 800, 130), pixel(bare, leaves, 800, 130), 'and leaves before its scene hands over');
  assert.ok(film.sounds.some(s => s.type === 'question' && s.time === pause.start));
  assert.ok(film.sounds.some(s => s.type === 'chime' && s.time === pause.end));
  await assert.rejects(compileFilm({storyboard, timings: paced, recipe: recipe('fade', {guesses: [{...guesses[0], place: 'left'}]}), kits, root}), /place must be top, center, bottom/);
  await assert.rejects(compileFilm({storyboard, timings: paced, recipe: recipe('fade', {guesses: [{...guesses[0], hint: 'x'}]}), kits, root}), /unsupported key hint/);
});

test('the string table fills every {"$string": key}; a missing key or a missing table refuses', async () => {
  const keyed = recipe('fade', {guesses: [{after: ['b', 'How many are there'], question: {$string: 'q'}, answer: {$string: 'a'}}]});
  const paced = paceTimings(storyboard, timings, {sceneTail: .8, holds: [{scene: 'b', after: 'How many are there', seconds: 2}]});
  const film = await compileFilm({storyboard, timings: paced, recipe: keyed, kits, root, strings: {q: 'Wie viele?', a: 'Drei!'}});
  assert.deepEqual(film.strings.sort(), ['a', 'q']);
  await assert.rejects(compileFilm({storyboard, timings: paced, recipe: keyed, kits, root, strings: {q: 'Wie viele?'}}), /The string table has no "a" \(recipe\.guesses\[0\]\.answer\)/);
  await assert.rejects(compileFilm({storyboard, timings: paced, recipe: keyed, kits, root}), /names the string "q", and no string table was given/);
  const plain = recipe();
  assert.equal(withStrings(plain, null), plain, 'a recipe that names no strings is used as it is');
  // Data that merely has a key named "string" (a code emphasis map colouring TypeScript's string type) is data
  // (unless the table also has its value as a key: then it reads as the old spelling, below).
  const emphasis = {code: {emphasis: {string: 'kw'}}};
  assert.deepEqual(withStrings(emphasis, {q: 'Wie viele?'}), emphasis);
  // A recipe still written with the old key, whose table has that key, is told the new spelling.
  assert.throws(() => withStrings({text: {string: 'q'}}, {q: 'Wie viele?'}), /recipe.text is \{"string": "q"\}; string-table keys are written \{"\$string": "q"\}/);
});

test('a film joins its parts one way: worlds and entrances without a pushIn, glows and a card with one', async () => {
  const hello = fileURLToPath(new URL('../examples/hello/', import.meta.url)), read = f => JSON.parse(readFileSync(hello + f, 'utf8'));
  const sb = read('storyboard.json'), lesson = read('recipe.json'), t = evenTimings(sb);
  await assert.rejects(compileFilm({storyboard: sb, timings: t, recipe: {...lesson, stages: [{type: 'world', scene: 'rule', world: {kit: 'whiteboard', items: []}}]}, root: hello}), /is a world, and a film with a pushIn keeps one page/);
  await assert.rejects(compileFilm({storyboard: sb, timings: t, recipe: {...lesson, stages: [{...lesson.stages[0], enter: 'wipe'}]}, root: hello}), /has enter, and a film with a pushIn/);
  await assert.rejects(compileFilm({storyboard, timings, recipe: {...recipe(), card: lesson.card}, kits, root}), /card and no pushIn/);
  const glowing = recipe(); glowing.stages[1] = {...glowing.stages[1], glows: [{row: 'a', from: ['c', 'paper'], to: ['c', 'code']}]};
  await assert.rejects(compileFilm({storyboard, timings, recipe: glowing, kits, root}), /glows card rows, and the film has no card/);
  await assert.rejects(compileFilm({storyboard, timings, recipe: recipe('dissolve'), kits, root}), /stage b: enter must be a transition: cut, fade, dip, wipe, split, clock, iris, push, slide, whip, zoom, page, through, match \(not "dissolve"\)/);
  const titled = recipe(); titled.stages[0] = {...titled.stages[0], title: 'Blue'};
  await assert.rejects(compileFilm({storyboard, timings, recipe: titled, kits, root}), /stage b has unsupported key title/);
  await assert.rejects(compileFilm({storyboard, timings, recipe: {...recipe(), stages: [{type: 'world', scene: 'b', world: {kit: 'green'}}]}, kits, root}), /No story kit "green" for stage b/);
});

test('a kit stage\'s declared keys are the kit\'s own: the engine does not read marks, columns or glows it declares', async () => {
  let seen = null;
  const tallyKit = {name: 'tally', stages: {tally: {keys: ['marks', 'columns', 'glows'], compile: spec => (seen = {marks: spec.marks, columns: spec.columns, glows: spec.glows}), draw: () => {}}}};
  const spec = {type: 'tally', scene: 'c', chrome: false, marks: 3, columns: ['one', 'two'], glows: 'soft', footer: {text: 'the footer is still the engine\'s', at: ['c', 'code']}};
  const film = await compileFilm({storyboard, timings, recipe: {story: {kit: 'red'}, stages: [spec]}, kits: [...kits, tallyKit], root});
  assert.deepEqual(seen, {marks: 3, columns: ['one', 'two'], glows: 'soft'}, 'the kit got its keys untouched (no card, no code: the engine would have refused both)');
  assert.ok(film.beats.some(b => b.ref[1] === 'code'), 'the engine still reads the footer on a kit stage');
});

test('a stage kit may declare its own keys; others still refuse', async () => {
  let seen = null;
  const stepsKit = {name: 'steps', stages: {steps: {keys: ['steps'], compile: spec => (seen = spec.steps), draw: () => {}}}};
  const spec = {type: 'steps', scene: 'c', chrome: false, steps: [1, 2, 3]};
  await compileFilm({storyboard, timings, recipe: {story: {kit: 'red'}, stages: [spec]}, kits: [...kits, stepsKit], root});
  assert.deepEqual(seen, [1, 2, 3]);
  await assert.rejects(compileFilm({storyboard, timings, recipe: {story: {kit: 'red'}, stages: [{...spec, sparkle: 1}]}, kits: [...kits, stepsKit], root}), /unsupported key sparkle/);
});

test('the worlds example: pure in time, and every frame restores the canvas', async () => {
  const film = await compileExample('worlds'), times = [2, 6.9, 16, 18.6, 23.2, 29.9, 34];
  const draw = t => { const c = createCanvas(320, 180), x = c.getContext('2d'); x.scale(.2, .2); film.frame(x, t); return c.data().toString('base64'); };
  assert.deepEqual(times.map(draw), [...times].reverse().map(draw).reverse());
  const c = createCanvas(160, 90), x = c.getContext('2d');
  for (let t = 0; t < film.total; t += film.total / 40) {
    x.resetTransform(); x.scale(.1, .1); film.frame(x, t);
    const m = x.getTransform();
    assert.ok(Math.abs(m.a - .1) < 1e-6 && Math.abs(m.d - .1) < 1e-6 && m.b === 0 && m.c === 0 && m.e === 0 && m.f === 0, `transform leaked at ${t}`);
    assert.equal(x.globalAlpha, 1, `alpha leaked at ${t}`);
  }
});

const ffmpeg = spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-version']).status === 0;
test('makeFilm: a silent cut is paced like a voiced one, and the making-of names the language and its strings', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async () => {
  const read = f => JSON.parse(readFileSync(root + f, 'utf8')), sb = read('storyboard.json');
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'storyreel-worlds-')), 'worlds.mp4');
  const result = await makeFilm({storyboard: sb, recipe: read('recipe.json'), kits: [cartoonKit], root, timings: evenTimings(sb), pacing: read('pacing.json'),
    strings: read('strings/en.json'), lang: 'en', out, render: {width: 320, height: 180, fps: 4}});
  assert.ok(existsSync(result.out));
  const record = JSON.parse(readFileSync(result.makingOf, 'utf8'));
  assert.equal(record.strings.lang, 'en');
  assert.deepEqual([...record.strings.used].sort(), Object.keys(read('strings/en.json')).sort());
  assert.equal(record.pacing.silent, true);
  assert.ok(record.inputs.strings);
});

test('review fixes: a hold after the last phrase counts; a voiced hold never lands inside the next word', async () => {
  const {planHolds, shiftWords} = await import('../src/pacing.mjs');
  const pacing = {sceneTail: .8, holds: [{scene: 'c', after: 'some code on it', seconds: 3}]};
  const paced = paceTimings(storyboard, timings, pacing), words = timings.scenes[2].words;
  assert.equal(paced.scenes[2].duration, +(words.at(-1).end + 3 + .8).toFixed(5), 'the silent cut keeps the hold after its last phrase, like a voiced one');
  // Voiced: the next word starts 2 ms after the phrase ends (an abutting pair from forced alignment).
  const scene = {id: 's', narration: 'one two three'}, rate = 24000;
  const timing = {id: 's', duration: 1.5, alignment: {status: 'available'}, words: [{text: 'one', start: .1, end: .4}, {text: 'two', start: .402, end: .7}, {text: 'three', start: .8, end: 1.1}]};
  const wav = {rate, samples: new Int16Array(Math.round(1.5 * rate)).map((_, i) => Math.round(3000 * Math.sin(i / 7)))};
  const plan = planHolds(scene, timing, [{scene: 's', after: 'one', seconds: 2}], wav);
  assert.ok(plan[0].sample <= Math.floor(.402 * rate), `the pause is cut before "two" starts (${plan[0].sample})`);
  assert.equal(shiftWords(timing.words, plan)[1].start, +(0.402 + 2).toFixed(5), '"two" moves by the pause, so the pictures stay in sync');
});

test('review fixes: a guess answers inside its own scene; entrances and places are checked when the recipe compiles', async () => {
  const late = paceTimings(storyboard, timings, {sceneTail: .8, holds: [{scene: 'c', after: 'some code on it', seconds: 2}]});
  await assert.rejects(compileFilm({storyboard, timings: late, recipe: recipe('fade', {guesses: [{after: ['c', 'some code on it'], question: 'Q?', answer: 'A'}]}), kits, root}), /the answer needs 1.9 s in the same scene/);
  const paced = paceTimings(storyboard, timings, {sceneTail: .8, holds: [{scene: 'b', after: 'How many are there', seconds: 2}]});
  await assert.rejects(compileFilm({storyboard, timings: paced, recipe: recipe('fade', {guesses: [{after: ['b', 'How many are there'], question: 'Q?', place: 'toString'}]}), kits, root}), /place must be/);
  for (const at of [5, 'centre', [800], [800, NaN]]) await assert.rejects(compileFilm({storyboard, timings, recipe: recipe({type: 'iris', at}), kits, root}), /enter.at must be \[x, y\]/);
});

test('review fixes: elide works on an indented block, which is then dedented', async () => {
  const {excerpt} = await import('../src/kits/paper/code.mjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'excerpt-')), file = path.join(dir, 'tool.ts');
  writeFileSync(file, "const t = defineTool({\n  // --- on-screen code\n  name: 'x',\n  description: 'long words',\n  inputSchema: {},\n  execute: () => 1,\n  // --- end on-screen code ---\n});\n");
  assert.equal(excerpt(file, {elide: ['description', 'inputSchema']}), "name: 'x',\n// description, inputSchema …\nexecute: () => 1,");
});

test('the guess reveal is a flip: the card closes on the question and opens on the answer, never both at once', async () => {
  const {GUESS_FLIP} = await import('../src/kits/paper/paper.mjs');
  const guesses = [{after: ['b', 'How many are there'], question: 'How many?', answer: 'Three!'}];
  const paced = paceTimings(storyboard, timings, {sceneTail: .8, holds: [{scene: 'b', after: 'How many are there', seconds: 3}]});
  const film = await compileFilm({storyboard, timings: paced, recipe: recipe('fade', {guesses}), kits, root});
  const bare = await compileFilm({storyboard, timings: paced, recipe: recipe(), kits, root});
  const end = film.clock.pauseAfter(['b', 'How many are there']).end, probe = [700, 130];
  assert.notDeepEqual(pixel(film, end - .5, ...probe), pixel(bare, end - .5, ...probe), 'the question face is up');
  assert.deepEqual(pixel(film, end + GUESS_FLIP, ...probe), pixel(bare, end + GUESS_FLIP, ...probe), 'edge-on at the middle of the flip: no text at all');
  assert.notDeepEqual(pixel(film, end + 2 * GUESS_FLIP + .3, ...probe), pixel(bare, end + 2 * GUESS_FLIP + .3, ...probe), 'the answer face is up');
});

test('a theme can give the guess card a storybook look; the page turn is an entrance', async () => {
  const {loadTheme} = await import('../src/theme.mjs');
  const storybook = loadTheme('storybook');
  assert.equal(storybook.guess.look, 'storybook');
  const guesses = [{after: ['b', 'How many are there'], question: 'How many?', answer: 'Three!'}];
  const paced = paceTimings(storyboard, timings, {sceneTail: .8, holds: [{scene: 'b', after: 'How many are there', seconds: 3}]});
  const clean = await compileFilm({storyboard, timings: paced, recipe: recipe('fade', {guesses}), kits, root});
  const book = await compileFilm({storyboard, timings: paced, recipe: recipe('fade', {guesses}), kits, root, theme: storybook});
  const t = clean.clock.pauseAfter(['b', 'How many are there']).start + 1;
  assert.notDeepEqual(pixel(clean, t, 800, 130), pixel(book, t, 800, 130), 'paper card, inked border');
  const page = await compileFilm({storyboard, timings, recipe: recipe('page'), kits, root});
  // 40% into the turn (35% after easing): the fold is near x = 1037, the page's back spans ~474–1037,
  // and the old page is still flat left of it.
  const b = page.clock.start('b'), mid = b - .75 * 1.1 + 1.1 * .4;
  assert.deepEqual(pixel(page, mid, 1500, 450), [0, 0, 255], 'right of the fold: the new world, uncovered');
  assert.deepEqual(pixel(page, mid, 100, 450), [255, 0, 0], 'far left: the old page, still flat');
  const back = pixel(page, mid, 750, 450);
  assert.ok(!near(back, [255, 0, 0]) && !near(back, [0, 0, 255]), `left of the fold: the page's back (${back})`);
  assert.ok(page.sounds.some(s => s.type === 'slide'), 'a page turn is heard');
});
