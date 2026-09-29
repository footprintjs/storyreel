import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, mkdtempSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadImage} from '@napi-rs/canvas';
import {compileFilm, evenTimings, renderFilm} from '../src/index.mjs';
import {tooShortToRead, secondsToRead} from '../src/reading.mjs';
import {contactSheet} from '../src/sheet.mjs';
import {compileExample} from './golden.mjs';

const hello = fileURLToPath(new URL('../examples/hello/', import.meta.url)), read = f => JSON.parse(readFileSync(hello + f, 'utf8'));
const board = read('storyboard.json'), recipe = read('recipe.json'), timings = evenTimings(board, {tail: 4});
const helloWith = more => compileFilm({storyboard: board, timings, recipe: {...recipe, ...more}, root: hello});

test('reading time: about 0.3 s a word, at least a second, counted while the whole line is shown', () => {
  assert.equal(secondsToRead('Now the rule.'), 1);
  assert.equal(secondsToRead('one two three four five six seven eight nine ten'), 3);
  assert.equal(secondsToRead('a · b'), 1, 'a mark between words is not a word');
  const short = tooShortToRead([{text: 'one two three four five six seven eight nine ten', from: 1, to: 3, path: 'x'}, {text: 'fine', from: 0, to: Infinity, path: 'y'}]);
  assert.deepEqual(short, [{path: 'x', text: 'one two three four five six seven eight nine ten', at: 1, seconds: 2, needs: 3}]);
});

test('a film lists every line it shows too briefly; "reading": "refuse" refuses the recipe', async () => {
  for (const name of ['hello', 'shepherd', 'worlds']) assert.deepEqual((await compileExample(name)).reading, [], `${name}: every line can be read`);
  const long = 'Now the rule that every shepherd in the valley used for a thousand years.', film = await helloWith({pushIn: {...recipe.pushIn, caption: long}});
  assert.deepEqual(film.reading.map(l => l.path), ['pushIn.caption']);
  assert.ok(film.reading[0].seconds < film.reading[0].needs);
  await assert.rejects(helloWith({pushIn: {...recipe.pushIn, caption: long}, reading: 'refuse'}), /Too short to read .*"Now the rule that every shepherd.*" \(pushIn.caption\) is up .* s and needs 4.2 s/);
  await assert.rejects(helloWith({reading: 'strict'}), /reading must be "report" or "refuse"/);
  // A board's writing counts until the eraser starts.
  const written = await helloWith({story: {...recipe.story, erasers: {soon: {at: ['story', 'a shepherd', -0.5], dur: .5, box: [100, 300, 600, 420]}}, items: recipe.story.items.map((it, i) => i === 1 ? {...it, erase: 'soon'} : it)}});
  assert.ok(written.reading.some(l => l.path === 'story.items[1]' && l.text === 'no written numbers'));
});

test('stills: each settled picture and each change half way, on one contact sheet', async () => {
  const worlds = await compileExample('worlds'), moments = worlds.moments();
  assert.deepEqual(moments.filter(m => m.kind === 'settled').map(m => m.label), ['The board', 'The valley', 'The rule', 'Back to the board']);
  assert.deepEqual(moments.filter(m => m.kind === 'moving').map(m => m.label), ['mid the fade into valley', 'mid the wipe into rule', 'mid the iris into again']);
  assert.ok(moments.every((m, i) => i === 0 || m.t >= moments[i - 1].t));
  const png = await contactSheet(worlds, {width: 800});
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  const image = await loadImage(png);
  assert.equal(image.width, 800);
});

const ffmpeg = spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-version']).status === 0;
test('a poster: the recipe names its frame; it is written beside the video and is the video\'s first frame', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async () => {
  const film = await helloWith({poster: ['rule', 'That is the idea', 1]});
  assert.equal(film.beats.find(b => b.path === 'poster').t, film.posterAt);
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'poster-')), 'hello.mp4');
  const result = await renderFilm({film, storyboard: board, timings, out, width: 320, height: 180, fps: 6});
  assert.ok(existsSync(result.poster));
  const first = path.join(path.dirname(out), 'first.png');
  spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-vframes', '1', first]);
  const [a, b] = [await loadImage(first), await loadImage(readFileSync(result.poster))];
  const {createCanvas} = await import('@napi-rs/canvas'), pixels = img => { const c = createCanvas(320, 180), x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, 320, 180).data; };
  const [pa, pb] = [pixels(a), pixels(b)]; let diff = 0; for (let i = 0; i < pa.length; i++) diff += Math.abs(pa[i] - pb[i]);
  assert.ok(diff / pa.length < 6, `frame 0 is the poster (mean difference ${(diff / pa.length).toFixed(2)})`);
  assert.equal(result.seconds, film.total, 'the poster replaces a frame; the length is unchanged');
});
