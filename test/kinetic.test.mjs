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
  assert.deepEqual(world.words.map((x) => [x.text, x.at]), [['Every', at('every')], ['BEAT', at('beat')], ['cut', at('cut')], ['cut,', at('cut', 1)], ['beat', at('beat', 1)]]);
  assert.deepEqual(world.texts().map((x) => [x.from, x.to]), [[at('every') + .2, at('beat')], [at('beat') + .2, at('cut')], [at('cut') + .2, at('cut', 1)], [at('cut', 1) + .2, at('beat', 1)], [at('beat', 1) + .2, clock.end('beat')]],
    'each can be read 0.2 s after it lands (a slam is blurred until then), and holds until the next lands, the last until its scene ends');
  assert.deepEqual(world.sounds, [], 'no sound unless one is named');
});

test('a word the voice does not say needs a time of its own: {text, at} at its anchor; else a refusal naming what is still said', async () => {
  const clock = await clockOf();
  const world = compileKinetic({scene: 'beat', words: ['Every', {text: 'NOW', at: ['beat', 'lands on']}, 'cut']}, clock);
  assert.equal(world.words[1].at, clock.at(['beat', 'lands on']));
  assert.throws(() => compileKinetic({scene: 'beat', words: ['Every', 'drum']}, clock), /kinetic word "drum" is not said in scene "beat" after the words before it \(still to come: "beat lands on a cut, and every cut lands on the beat\."\) — write it as the voice says it \(a number said in words is written as it is said\), or give it \{text, at\}/);
  assert.throws(() => compileKinetic({scene: 'beat', words: ['the', 'Every']}, clock), /kinetic word "Every" is not said in scene "beat" after the words before it/, 'in order: "Every" comes before the last "the"');
  assert.throws(() => compileKinetic({words: ['Every']}, clock), /has no time — name the scene whose voice the words follow \(scene\), or give it \{text, at\}/);
  assert.throws(() => compileKinetic({scene: 'beat', words: [{text: 'B', at: ['beat', 'the beat']}, {text: 'A', at: ['beat', 'Every']}]}, clock), /lands before "B" — the words land in the order written: write them in the order they are said, or give "A" a later at/);
});

test('its spec is checked, each refusal naming the fix', async () => {
  const clock = await clockOf(), bad = (extra) => () => compileKinetic({scene: 'beat', words: ['Every'], ...extra}, clock);
  assert.throws(bad({styles: 'x'}), /kinetic takes scene, words, style, move, flip, colors, sound, size — not "styles"/);
  assert.throws(bad({words: []}), /kinetic words is a list of 1 to 40 words/);
  assert.throws(bad({style: 'bounce'}), /kinetic style is slam or stack/);
  assert.throws(bad({move: 'shake'}), /kinetic move "shake" is not an entrance a whole word makes — name one that is \(slam, pop/);
  for (const move of ['text-reveal-word', 'text-reveal-letter', 'count-up']) assert.throws(bad({move}), /is not an entrance a whole word makes/, `${move}: it splits the word or counts`);
  assert.throws(bad({move: 'nope'}), /kinetic move/);
  assert.throws(bad({colors: ['white', 'black']}), /kinetic colors is \[ground, ink\], two hex colours/);
  assert.throws(bad({sound: 'boom'}), /kinetic sound is one of slide, settle, tap/);
  assert.throws(bad({size: 5}), /kinetic size is the largest a word is drawn, 24 to 600 px/);
  assert.throws(bad({flip: 'yes'}), /kinetic flip is true or false/);
  assert.throws(bad({words: ['Every', '  ']}), /kinetic words\[1\] is "text" or \{text, at\}/);
});

test('a sound at every word that lands, when one is named', async () => {
  const clock = await clockOf(), world = compileKinetic({scene: 'beat', words: ['Every', 'beat'], sound: 'tap'}, clock);
  assert.deepEqual(world.sounds, world.words.map((x) => ({time: x.at, type: 'tap'})));
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
  const clock = await clockOf(), world = compileKinetic({scene: 'beat', words: ['Every', 'beat']}, clock), [first, second] = world.words.map((x) => x.at);
  const landed = [second - .01, second + .38];   // each word just before the next lands (the slam takes 0.4 s; the words are 0.4 s apart here)
  assert.equal(inked(world, first - .1), 0, 'nothing before the first word');
  assert.ok(inked(world, landed[0]) > .02, 'the word, landed');
  assert.ok(darkness(world, first + .02) < darkness(world, landed[0]), 'it slams in: lighter as it lands (big, blurred, faint) than when landed');
  assert.deepEqual(pixel(world, landed[1], [20, 20]), [0xf3, 0xee, 0xe3], 'without flip the ground stays');
  const flipping = compileKinetic({scene: 'beat', words: ['Every', 'beat'], flip: true}, clock);
  assert.deepEqual(pixel(flipping, landed[0], [20, 20]), [0xf3, 0xee, 0xe3]);
  assert.deepEqual(pixel(flipping, landed[1], [20, 20]), [0x1a, 0x1a, 0x1a], 'flipped at the second word: the ink is the ground');
  const stack = compileKinetic({scene: 'beat', words: ['Every', 'beat', 'lands'], style: 'stack'}, clock), [, , third] = stack.words.map((x) => x.at);
  const top = [0, 150], bottom = [750, 900];   // the outer sixths: a word as big as it fits stays out of them
  // a stack's lines have their places from the start (its size is its words', all of them): the first word on the top line
  assert.ok(inked(stack, landed[0], top) > 0 && inked(stack, landed[0], bottom) === 0, 'one word: the top line only');
  assert.ok(inked(stack, third + .38, bottom) > 0, 'three: the stack reaches the bottom line');
  // the top line's ink, from its first column to its last (a dimmed line keeps its size, only its shade changes)
  const sizeOf = (t) => {
    const c = createCanvas(1600, 900), ctx = c.getContext('2d'); stack.draw(ctx, t);
    const d = ctx.getImageData(0, 0, 1600, 300).data; let lo = Infinity, hi = -1;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 230) { const x = (i / 4) % 1600; lo = Math.min(lo, x); hi = Math.max(hi, x); }
    return [lo, hi];
  };
  assert.deepEqual(sizeOf(landed[0]), sizeOf(third + .38), 'the first line is the same size before and after the others land: nothing jumps');
  assert.ok(stack.texts().every((x) => x.to === clock.end('beat')), 'a stacked word stays until the stack ends');
  assert.equal(KINETIC.size, 480);
});

test('in a film: the story and a world stage both kinetic; its words reach the reading check and its sounds the mix', async () => {
  const film = await filmOf({words: ['Every', 'beat'], sound: 'click'});
  assert.ok(film.total > 0);
  assert.ok(film.sounds.some((s) => s.type === 'click'), 'the world\'s sounds are the film\'s');
});

test('a vowel sign is part of its word: in Tamil and Hindi a word is matched with its marks', async () => {
  const board = {title: 'Marks', scenes: [{id: 'ta', narration: 'கு கா கி'}, {id: 'hi', narration: 'कि की'}]};
  const film = await compileFilm({storyboard: board, timings: evenTimings(board, {wordSeconds: .4, tail: .5}), recipe: {story: {kit: 'kinetic', scene: 'ta', words: ['கா']}}, kits: [kineticKit]});
  const said = (id) => film.clock.words(id).map((w) => w.start);
  assert.deepEqual(compileKinetic({scene: 'ta', words: ['கா']}, film.clock).words.map((w) => w.at), [said('ta')[1]], 'கா, not the கு before it');
  assert.deepEqual(compileKinetic({scene: 'hi', words: ['की']}, film.clock).words.map((w) => w.at), [said('hi')[1]], 'की, not कि');
});

test('the refusals a recipe author meets name the fix: a phrase in one entry, a mark with no letter, a silent scene, a bad at, a word past its scene, two at once', async () => {
  const clock = await clockOf(), make = (spec) => () => compileKinetic({scene: 'beat', ...spec}, clock);
  assert.throws(make({words: ['Every beat']}), /kinetic word "Every beat" is several words — one said word per entry \("Every", "beat"\), or give it \{text, at\} to land them as one/);
  assert.throws(make({words: ['—']}), /kinetic word "—" has no letter or digit for the voice to say — give it \{text, at\}/);
  assert.throws(make({words: [{text: 'X', at: 'beat'}]}), /kinetic word "X": at is an anchor, \["scene", "phrase"\]/);
  assert.throws(make({words: [{text: 'X', at: ['intro', 'film']}]}), /kinetic word "X" lands before scene "beat" starts — give it an at inside the scene/);
  assert.throws(make({words: ['Every', {text: 'Late', at: ['beat', 'the beat', 30]}]}), /kinetic word "Late" lands after scene "beat" ends — give it an at inside the scene/);
  assert.throws(make({words: [{text: 'A', at: ['beat', 'lands on']}, {text: 'B', at: ['beat', 'lands on']}]}), /kinetic words "A" and "B" land at once — one word at a time shows only the later: give one of them another at, or stack them/);
  assert.doesNotThrow(make({words: [{text: 'A', at: ['beat', 'lands on']}, {text: 'B', at: ['beat', 'lands on']}], style: 'stack'}), 'a stack shows both');
  // a scene that says no words: a clock whose scene is silent
  const silent = {words: () => [], start: () => 0, end: () => 5, total: 5, at: () => 1};
  assert.throws(() => compileKinetic({scene: 'quiet', words: ['Hush']}, silent), /kinetic word "Hush": scene "quiet" says no words — give each word \{text, at\}/);
  assert.equal(compileKinetic({scene: 'quiet', words: [{text: 'Hush', at: ['quiet', 'x']}]}, silent).words[0].at, 1, 'with a time of its own it lands');
});

test('a wipe uncovers the word itself, not the frame\'s width; a fade the frame is under fades the words too', async () => {
  const clock = await clockOf(), wipe = compileKinetic({scene: 'beat', words: ['Every', 'beat'], move: 'mask-wipe'}, clock), [first] = wipe.words.map((w) => w.at);
  // at 0.2 s the wipe (inOutCubic over 0.5 s) has uncovered a quarter: of the word — over the frame's width, none of a word in the middle
  assert.ok(inked(wipe, first + .2) > 0, 'a quarter into the wipe, the start of the word shows');
  assert.ok(inked(wipe, first + .2) < inked(wipe, first + .38) / 2, 'and only the start of it');
  const plain = compileKinetic({scene: 'beat', words: ['Every', 'beat']}, clock), shade = (alpha) => {
    const c = createCanvas(1600, 900), ctx = c.getContext('2d'); ctx.globalAlpha = alpha; plain.draw(ctx, first + .38);
    const d = ctx.getImageData(0, 0, 1600, 900).data; let darkest = 255; for (let i = 0; i < d.length; i += 4) darkest = Math.min(darkest, d[i]); return darkest;
  };
  assert.ok(shade(.5) > shade(1) + 50, 'under half a fade the ink is half as dark');
});
