import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings, loadTheme} from '../src/index.mjs';
import {EASES, easeNamed, inOut} from '../src/ease.mjs';
import {ease as boardEase} from '../src/kits/whiteboard/board.mjs';

// The ease table (src/ease.mjs): one place every curve is named.
const grid = Array.from({length: 241}, (_, i) => -.1 + i * 1.2 / 240);

test('ease table: inOut is exactly the whiteboard ease every film used before, and the old name is the same curve', () => {
  assert.equal(boardEase, inOut, 'board.mjs · ease is the table\'s inOut, not a copy');
  assert.equal(EASES.inOut, inOut);
  const before = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  for (const u of grid) assert.equal(inOut(u), before(u), `inOut(${u})`);
});

test('ease table: every curve goes 0 → 1, clamps outside its seconds, and only back and spring leave 0..1', () => {
  assert.deepEqual(Object.keys(EASES), ['linear', 'in', 'out', 'inOut', 'back', 'walk', 'jump', 'spring']);
  assert.ok(Object.isFrozen(EASES));
  for (const [name, f] of Object.entries(EASES)) {
    assert.equal(f(0), 0, `${name}(0)`); assert.ok(Math.abs(f(1) - 1) < 1e-12, `${name}(1)`);
    assert.equal(f(-3), f(0), `${name} before its start`); assert.equal(f(4), f(1), `${name} after its end`);
    if (name === 'back' || name === 'spring') continue;
    for (let i = 1; i < grid.length; i++) assert.ok(f(grid[i]) >= f(grid[i - 1]) - 1e-12 && f(grid[i]) <= 1, `${name} never goes back or past the end at ${grid[i]}`);
  }
  const peak = Math.max(...grid.map(EASES.back));
  assert.ok(peak > 1.09 && peak < 1.11, `back overshoots about 10% (${peak})`);
  const fine = Array.from({length: 1001}, (_, i) => i / 1000), sprung = Math.max(...fine.map(EASES.spring));
  assert.ok(sprung > 1.03 && sprung < 1.05, `spring overshoots about 4% (${sprung})`);
  assert.ok(EASES.spring(.5) > EASES.out(.5), 'spring arrives faster than out');
  assert.ok(Math.abs(EASES.spring(.999) - 1) < .002, 'and has settled by its end');
  assert.equal(EASES.jump(.999), 0, 'jump keeps the start value until the change ends');
  assert.ok(EASES.in(.5) < .5 && EASES.out(.5) > .5, 'in starts slow, out starts fast');
  for (const u of grid) assert.ok(Math.abs(EASES.walk(u) + EASES.walk(1 - u) - 1) < 1e-12, 'a walk slows down as it sped up');
  assert.ok(Math.abs(EASES.walk(.2) - .125) < 1e-12 && Math.abs(EASES.walk(.5) - .5) < 1e-12, 'a steady middle after a fifth spent speeding up');
});

test('ease table: an unknown name refuses, naming the eases there are', () => {
  assert.equal(easeNamed('back'), EASES.back);
  assert.equal(easeNamed('spring'), EASES.spring);
  for (const name of ['bounce', 'hold', 'constructor', 42, undefined]) assert.throws(() => easeNamed(name, 'items[0].keys[1]'), /items\[0\]\.keys\[1\]: ".*" is not an ease; the eases are linear, in, out, inOut, back, walk, jump, spring/);
});

// The kit context: a story kit that declares context: true is compiled as kit.compile(spec, context).
const storyboard = {title: 'Kits', scenes: [
  {id: 'a', narration: 'The first world is drawn here.'},
  {id: 'b', narration: 'The second world is drawn there.'},
]};
const timings = evenTimings(storyboard);
const pixel = (film, t) => { const c = createCanvas(1600, 900), ctx = c.getContext('2d'); film.frame(ctx, t); return [...ctx.getImageData(800, 450, 1, 1).data.slice(0, 3)]; };
const fill = color => c => { c.fillStyle = color; c.fillRect(0, 0, 1600, 900); };

test('kit context: a story kit with context: true receives the context, with the theme; it cannot draw the film', async () => {
  const got = [];
  const kit = {name: 'ctx', story: {context: true, compile: (...args) => { got.push(args); return {hang: 1, draw: fill('#ff0000')}; }}};
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'storyreel-kit-')));
  const film = await compileFilm({storyboard, timings, recipe: {story: {kit: 'ctx', size: 3}}, kits: [kit], root});
  assert.equal(got.length, 1); const [[spec, context, more]] = got;
  assert.deepEqual(spec, {kit: 'ctx', size: 3}); assert.equal(more, undefined, 'one argument after the spec');
  assert.deepEqual(Object.keys(context).sort(), ['cast', 'clock', 'insideRoot', 'labels', 'library', 'motion', 'readFile', 'root', 'theme']);
  assert.equal(context.cast, null, 'no cast given: null');
  assert.ok(Object.isFrozen(context));
  assert.deepEqual(context.theme, loadTheme('paper'), 'the film\'s theme (paper by default)');
  assert.deepEqual(context.motion, {cameraSpeed: 1});
  assert.equal(context.root, root);
  assert.deepEqual([context.library, context.labels], [{}, {}], 'the recipe carries no library or labels yet');
  assert.equal(context.clock.at(['b', 'second world']), film.clock.at(['b', 'second world']), 'the film\'s own clock');
  assert.ok(!['frame', 'film', 'draw', 'canvas'].some(k => k in context), 'nothing in the context draws the film');
  assert.deepEqual(pixel(film, 1), [255, 0, 0]);
  const themed = await compileFilm({storyboard, timings, recipe: {story: {kit: 'ctx'}, paperStyle: 'storybook'}, kits: [kit], root});
  assert.ok(themed && got[1][1].theme.palette.bg === loadTheme('storybook').palette.bg, 'a recipe\'s paperStyle reaches the kit');
});

test('kit context: an older kit keeps compile(spec, clock, motion), and a context kit follows the speed note rule', async () => {
  const got = [];
  const old = {name: 'old', story: {motion: ['cameraSpeed'], compile: (...args) => { got.push(args); return {hang: 1, draw: fill('#00ff00')}; }}};
  await compileFilm({storyboard, timings, recipe: {story: {kit: 'old'}, notes: [{note: 'slower', speed: .8}]}, kits: [old]});
  const [[, clock, motion]] = got;
  assert.equal(typeof clock.at, 'function'); assert.deepEqual(motion, {cameraSpeed: .8});
  const plain = {name: 'plain', story: {context: true, compile: () => ({hang: 1, draw: fill('#00ff00')})}};
  await assert.rejects(compileFilm({storyboard, timings, recipe: {story: {kit: 'plain'}, notes: [{note: 'slower', speed: .8}]}, kits: [plain]}), /note "slower": the story is drawn by the kit "plain", which does not take a camera speed/);
  const odd = {name: 'odd', story: {context: 'yes', compile: () => ({draw() {}})}};
  await assert.rejects(compileFilm({storyboard, timings, recipe: {story: {kit: 'odd'}}, kits: [odd]}), /The story kit "odd" declares context: "yes"; context is true \(compile\(spec, context\)\) or false/);
});

test('kit context: readFile loads only from inside the root; insideRoot answers the real path', async () => {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'storyreel-kit-'))), root = path.join(base, 'film');
  mkdirSync(path.join(root, 'pics'), {recursive: true}); mkdirSync(path.join(base, 'film-private'));
  writeFileSync(path.join(root, 'pics', 'cup.txt'), 'a cup'); writeFileSync(path.join(base, 'film-private', 'secret.txt'), 'secret');
  let context;
  const kit = {name: 'files', story: {context: true, compile: (spec, c) => { context = c; return {hang: 1, draw() {}, words: c.readFile(spec.file).toString()}; }}};
  await compileFilm({storyboard, timings, recipe: {story: {kit: 'files', file: 'pics/cup.txt'}}, kits: [kit], root});
  assert.equal(context.readFile('pics/cup.txt').toString(), 'a cup');
  assert.equal(context.insideRoot('pics/cup.txt'), path.join(root, 'pics', 'cup.txt'));
  for (const outside of ['../film-private/secret.txt', path.join(base, 'film-private', 'secret.txt')]) {
    assert.throws(() => context.readFile(outside), /is outside .*film: a recipe loads files only from inside the film's root folder/);
  }
  // Refused while the film is built, too: the refusal reaches compileFilm.
  await assert.rejects(compileFilm({storyboard, timings, recipe: {story: {kit: 'files', file: '../film-private/secret.txt'}}, kits: [kit], root}), /is outside/);
});

/** A world that draws blue until its picture has "decoded" (ready resolves late), then red; it logs what each draw saw. */
const slowKit = (log, {fail = false} = {}) => ({name: 'slow', story: {context: true, compile: () => {
  let loaded = false;
  const ready = new Promise((resolve, reject) => setTimeout(() => fail ? reject(new Error('no picture')) : (loaded = true, resolve()), 40));
  return {hang: 1, ready, draw: c => { log.push(loaded); fill(loaded ? '#ff0000' : '#0000ff')(c); }};
}}});

test('ready: a world whose ready resolves late is drawn loaded in every recall and in the film', async () => {
  const log = [];
  const recipe = {story: {kit: 'slow'}, stages: [{type: 'world', scene: 'b', world: {kit: 'slow'}}], recalls: {first: ['a', 'first world'], second: ['b', 'second world', .5]}};
  const film = await compileFilm({storyboard, timings, recipe, kits: [slowKit(log)]});
  assert.ok(log.length >= 2, 'the recalls drew the worlds while the film was built');
  assert.ok(log.every(Boolean), 'no recall caught a world before it was ready');
  assert.deepEqual(pixel(film, film.clock.at(['a', 'first world'])), [255, 0, 0]);
  assert.deepEqual(pixel(film, film.clock.end('b') - .2), [255, 0, 0]);
});

test('ready: a world that fails to get ready refuses the film, naming it; a ready that is not a Promise refuses', async () => {
  const recipe = {story: {kit: 'slow'}, recalls: {first: ['a', 'first world']}};
  await assert.rejects(compileFilm({storyboard, timings, recipe, kits: [slowKit([], {fail: true})]}), /the story: the kit "slow" was not ready: no picture/);
  const eager = {name: 'eager', story: {compile: () => ({draw() {}, ready: true})}};
  await assert.rejects(compileFilm({storyboard, timings, recipe: {story: {kit: 'eager'}}, kits: [eager]}), /the story: the kit "eager" returned ready that is not a Promise/);
});
