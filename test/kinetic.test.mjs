// The kinetic kit (src/kits/kinetic): words that slam in as the voice says them — each lands on its spoken word, in
// order, enters with a move from the shared table, and holds until the next; a word the voice never says needs a time
// of its own. Its words are for the reading check, its sounds for the mix.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {kineticKit, compileKinetic, KINETIC} from '../src/kits/kinetic/index.mjs';

const {createCanvas} = createRequire(import.meta.url)('@napi-rs/canvas');
const storyboard = {title: 'Kinetic', scenes: [
  {id: 'intro', narration: 'Here is a film about cutting.'},
  {id: 'beat', narration: 'Every beat lands on a cut, and every cut lands on the beat.'},
]};
const timings = evenTimings(storyboard, {wordSeconds: .4, tail: .5});
const recipe = (world) => ({story: {kit: 'kinetic', scene: 'intro', words: ['film', 'cutting']},
  stages: [{type: 'world', scene: 'beat', enter: 'cut', world: {kit: 'kinetic', scene: 'beat', ...world}}]});
const filmOf = (world) => compileFilm({storyboard, timings, recipe: recipe(world), kits: [kineticKit]});
/** The clock alone, for the kit by itself. */
const clockOf = async () => (await filmOf({words: ['beat']})).clock;

test('each word lands as the voice says it — the next said word that matches, in order, any case, its marks aside', async () => {
  const clock = await clockOf(), said = clock.words('beat');
  const world = compileKinetic({scene: 'beat', words: ['Every', 'BEAT', 'cut', 'cut,', 'beat']}, clock);
  const at = (text, nth = 0) => said.filter((w) => w.text.toLowerCase().replace(/[^a-z]/g, '') === text)[nth].start;
  assert.deepEqual(world.texts().map((x) => [x.text, x.from]), [['Every', at('every')], ['BEAT', at('beat')], ['cut', at('cut')], ['cut,', at('cut', 1)], ['beat', at('beat', 1)]]);
  assert.deepEqual(world.texts().map((x) => x.to), [at('beat'), at('cut'), at('cut', 1), at('beat', 1), clock.end('beat')], 'each holds until the next lands, the last until its scene ends');
  assert.deepEqual(world.sounds, [], 'no sound unless one is named');
});

test('a word the voice does not say needs a time of its own: {text, at} at its anchor; else a refusal naming what is still said', async () => {
  const clock = await clockOf();
  const world = compileKinetic({scene: 'beat', words: ['Every', {text: 'NOW', at: ['beat', 'lands on']}, 'cut']}, clock);
  assert.equal(world.texts()[1].from, clock.at(['beat', 'lands on']));
  assert.throws(() => compileKinetic({scene: 'beat', words: ['Every', 'drum']}, clock), /kinetic word "drum" is not said in scene "beat" after the words before it \(still to come: "beat lands on a cut, and every cut lands on the beat\."\) — write it as the voice says it, or give it \{text, at\}/);
  assert.throws(() => compileKinetic({scene: 'beat', words: ['the', 'Every']}, clock), /kinetic word "Every" is not said in scene "beat" after the words before it/, 'in order: "Every" comes before the last "the"');
  assert.throws(() => compileKinetic({words: ['Every']}, clock), /has no time — name the scene whose voice the words follow \(scene\), or give it \{text, at\}/);
  assert.throws(() => compileKinetic({scene: 'beat', words: [{text: 'B', at: ['beat', 'the beat']}, {text: 'A', at: ['beat', 'Every']}]}, clock), /lands before "B" — the words land in the order written: write them in the order they are said, or give "A" a later at/);
});

test('its spec is checked, each refusal naming the fix', async () => {
  const clock = await clockOf(), bad = (extra) => () => compileKinetic({scene: 'beat', words: ['Every'], ...extra}, clock);
  assert.throws(bad({styles: 'x'}), /kinetic takes scene, words, style, move, flip, colors, sound, size — not "styles"/);
  assert.throws(bad({words: []}), /kinetic words is a list of 1 to 40 words/);
  assert.throws(bad({style: 'bounce'}), /kinetic style is slam or stack/);
  assert.throws(bad({move: 'shake'}), /kinetic move "shake" is not an entrance for text/);
  assert.throws(bad({move: 'nope'}), /kinetic move/);
  assert.throws(bad({colors: ['white', 'black']}), /kinetic colors is \[ground, ink\], two hex colours/);
  assert.throws(bad({sound: 'boom'}), /kinetic sound is one of slide, settle, tap/);
  assert.throws(bad({size: 5}), /kinetic size is the largest a word is drawn, 24 to 600 px/);
  assert.throws(bad({flip: 'yes'}), /kinetic flip is true or false/);
  assert.throws(bad({words: ['Every', '  ']}), /kinetic words\[1\] is "text" or \{text, at\}/);
});

test('a sound at every word that lands, when one is named', async () => {
  const clock = await clockOf(), world = compileKinetic({scene: 'beat', words: ['Every', 'beat'], sound: 'tap'}, clock);
  assert.deepEqual(world.sounds, world.texts().map((x) => ({time: x.from, type: 'tap'})));
});

/** The grey at a point of the world drawn at t, on a 1600×900 canvas. */
const pixel = (world, t, [x, y]) => { const c = createCanvas(1600, 900), ctx = c.getContext('2d'); world.draw(ctx, t); const d = ctx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
/** How much of the frame — or of a band of its rows, [y0, y1) on the 1600×900 frame — is inked (darker than the default ground), at t. */
const inked = (world, t, [y0, y1] = [0, 900]) => {
  const c = createCanvas(160, 90), ctx = c.getContext('2d'); ctx.scale(.1, .1); world.draw(ctx, t);
  const d = ctx.getImageData(0, y0 / 10, 160, (y1 - y0) / 10).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 200) n++;   // darker than the ground (243): a dimmed stacked word counts too
  return n / (d.length / 4);
};
/** How dark the frame is, all told (each pixel's darkness under the ground, summed, as a share of all black), at t. */
const darkness = (world, t) => {
  const c = createCanvas(160, 90), ctx = c.getContext('2d'); ctx.scale(.1, .1); world.draw(ctx, t);
  const d = ctx.getImageData(0, 0, 160, 90).data; let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += Math.max(0, 243 - d[i]) / 243;
  return sum / (d.length / 4);
};

test('drawn: the ground until the first word lands; then the word, as it lands, slammed in; flip swaps the ground at every word', async () => {
  const clock = await clockOf(), world = compileKinetic({scene: 'beat', words: ['Every', 'beat']}, clock), [first, second] = world.texts().map((x) => x.from);
  const landed = [second - .01, second + .38];   // each word just before the next lands (the slam takes 0.4 s; the words are 0.4 s apart here)
  assert.equal(inked(world, first - .1), 0, 'nothing before the first word');
  assert.ok(inked(world, landed[0]) > .02, 'the word, landed');
  assert.ok(darkness(world, first + .02) < darkness(world, landed[0]), 'it slams in: lighter as it lands (big, blurred, faint) than when landed');
  assert.deepEqual(pixel(world, landed[1], [20, 20]), [0xf3, 0xee, 0xe3], 'without flip the ground stays');
  const flipping = compileKinetic({scene: 'beat', words: ['Every', 'beat'], flip: true}, clock);
  assert.deepEqual(pixel(flipping, landed[0], [20, 20]), [0xf3, 0xee, 0xe3]);
  assert.deepEqual(pixel(flipping, landed[1], [20, 20]), [0x1a, 0x1a, 0x1a], 'flipped at the second word: the ink is the ground');
  const stack = compileKinetic({scene: 'beat', words: ['Every', 'beat', 'lands'], style: 'stack'}, clock), [, , third] = stack.texts().map((x) => x.from);
  const top = [0, 150], bottom = [750, 900];   // the outer sixths: a word as big as it fits stays out of them
  assert.deepEqual([inked(stack, landed[0], top), inked(stack, landed[0], bottom)], [0, 0], 'one word: the middle of the frame only');
  assert.ok(inked(stack, third + .38, top) > 0 && inked(stack, third + .38, bottom) > 0, 'three: a stack, line under line, top to bottom');
  assert.ok(stack.texts().every((x) => x.to === clock.end('beat')), 'a stacked word stays until the stack ends');
  assert.equal(KINETIC.size, 480);
});

test('in a film: the story and a world stage both kinetic; its words reach the reading check and its sounds the mix', async () => {
  const film = await filmOf({words: ['Every', 'beat'], sound: 'click'});
  assert.ok(film.total > 0);
  assert.ok(film.sounds.some((s) => s.type === 'click'), 'the world\'s sounds are the film\'s');
});
