import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings, paceTimings, cartoonKit} from '../src/index.mjs';
import {hitTest} from '../src/regions.mjs';

const dir = name => fileURLToPath(new URL(`../examples/${name}/`, import.meta.url));
const read = (name, file) => JSON.parse(readFileSync(dir(name) + file, 'utf8'));
const helloBoard = read('hello', 'storyboard.json'), hello = await compileFilm({storyboard: helloBoard, timings: evenTimings(helloBoard, {tail: 4}), recipe: read('hello', 'recipe.json'), root: dir('hello')});
const first = (film, t, x, y) => hitTest(film.regionsAt(t), x, y)[0];

test('hitTest: the smallest box that holds the point first; on a tie, the one drawn last', () => {
  const regions = [{box: [0, 0, 100, 100], path: 'big'}, {box: [10, 10, 20, 20], path: 'small'}, {box: [10, 10, 20, 20], path: 'small, drawn later'}];
  assert.deepEqual(hitTest(regions, 15, 15).map(r => r.path), ['small, drawn later', 'small', 'big']);
  assert.deepEqual(hitTest(regions, 50, 50).map(r => r.path), ['big']);
  assert.deepEqual(hitTest(regions, 150, 50), []);
});

test('every beat names the recipe entry that asked for it', () => {
  assert.equal(hello.beats[0].path, 'story.items[0].at');
  assert.ok(hello.beats.every(b => typeof b.path === 'string'), 'the built-in kits pass the recipe\'s own phrase lists through');
  assert.ok(hello.beats.some(b => b.path === 'stages[0].reveal[1][1]'));
});

test('a whiteboard drawing: its region names its item and holds its ink; a click reads back as board coordinates', () => {
  const t = hello.clock.at(['story', 'a shepherd']) + 1.3, figure = hello.regionsAt(t).find(r => r.path === 'story.items[0]');
  assert.equal(figure.label, 'figure');
  const [x0, y0, x1, y1] = figure.box.map(Math.round), c = createCanvas(1600, 900), ctx = c.getContext('2d'); hello.frame(ctx, t);
  const px = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data; let ink = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] < 90 && px[i + 1] < 90 && px[i + 2] < 90) ink++;
  assert.ok(ink > 200, `the figure's ink is inside its box (${ink} dark pixels)`);
  assert.equal(first(hello, t, (x0 + x1) / 2, (y0 + y1) / 2).path, 'story.items[0]');
  // The board hangs on the paper at 0.9: board (300, 620) is frame (350, 610.5).
  assert.deepEqual(hello.pointAt(t, 350, 610.5), {frame: [350, 611], world: {path: 'story', at: [300, 620]}});
});

test('paper: a code line names the reveal that showed it; a card row names its row', () => {
  const t = hello.clock.at(['rule', 'That is the idea']) + 1;
  const line = first(hello, t, 900, 282 + 36);
  assert.equal(line.path, 'stages[0].reveal[1]');
  assert.match(line.label, /leftOver/);
  const row = hello.regionsAt(t).find(r => r.path === 'card.rows[0]'), [x0, y0, x1, y1] = row.box;
  assert.equal(first(hello, t, (x0 + x1) / 2, (y0 + y1) / 2).path, 'card.rows[0]');
  assert.equal(row.label, 'sheep 1');
  assert.deepEqual(hello.pointAt(t, 900, 300), {frame: [900, 300]}, 'on paper, a click is frame coordinates only');
});

test('a world stage, strings and a guess: each region names its place in the recipe', async () => {
  const board = read('worlds', 'storyboard.json'), timings = paceTimings(board, evenTimings(board, {tail: .8}), read('worlds', 'pacing.json'));
  const film = await compileFilm({storyboard: board, timings, recipe: read('worlds', 'recipe.json'), kits: [cartoonKit], root: dir('worlds'), strings: read('worlds', 'strings/en.json')});
  const title = film.regionsAt(film.clock.at(['board', 'count with pebbles'])).find(r => r.path === 'story.items[0]');
  assert.equal(title.label, read('worlds', 'strings/en.json')['board.title'], 'the label is the word on screen, from the string table');
  const valley = film.clock.at(['valley', 'lets the sheep out']);
  assert.equal(first(film, valley, 800, 450).path, 'stages[0].world', 'a cartoon world answers as a whole');
  const pause = film.clock.pauseAfter(['valley', 'How many sheep went out']);
  assert.equal(first(film, pause.start + .8, 800, 130).path, 'guesses[0]');
  const again = film.clock.at(['again', 'one sheep, one pebble']) + 1.2;
  assert.equal(first(film, again, 800, 440).path, 'stages[2].world.items[0]', 'a whiteboard world stage names its own items');
});
