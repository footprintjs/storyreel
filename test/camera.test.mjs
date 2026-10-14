// Camera moves by name (camera.mjs: the catalog; camerawork.mjs: the film's plan, a footprintjs flowchart): view moves,
// follows, depth moves on a world's layers, handheld, the picture's clock; one picture each, one camera, reduced motion
// as cuts — and a film without camera moves draws exactly what it drew before.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings, frameHashes, planSegments, segmentKey, cartoonKit, CAMERA_MOVES, CAMERA_MOVE_NAMES} from '../src/index.mjs';
import {segmentMaterial} from '../src/segments.mjs';
import {reviewPart, REVIEW_CHECKS} from '../src/review.mjs';
import {speedRamp, coverZoom, viewOf} from '../src/camera.mjs';
import {settleTime} from '../src/motion.mjs';
import {through} from '../src/regions.mjs';
import {compileExample, PINS_HERE} from './golden.mjs';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const storyboard = {title: 'Camera', scenes: [
  {id: 'a', narration: 'First the red square sits here, quietly, in its corner of the page.'},
  {id: 'b', narration: 'Then the blue one, and then back to all of it, the whole page at once.'},
]};
const timings = evenTimings(storyboard, {wordSeconds: .5});
const GROUND = [214, 230, 200], RED = [192, 57, 43], BLUE = [31, 79, 156];
const RED_BOX = [200, 200, 400, 350], BLUE_BOX = [1100, 500, 1340, 660];
const fill = (c, rgb, [x0, y0, x1, y1]) => { c.fillStyle = `rgb(${rgb.join(',')})`; c.fillRect(x0, y0, x1 - x0, y1 - y0); };
const named = [{box: RED_BOX, path: 'red', label: 'red', name: 'red'}, {box: BLUE_BOX, path: 'blue', label: 'blue', name: 'blue'}];
/** Two squares on a ground that is not the paper (so a frame edge the camera uncovered would show). */
const flat = {name: 'flat', story: {compile: () => ({hang: 1, regionsAt: () => named,
  draw: c => { fill(c, GROUND, [0, 0, 1600, 900]); fill(c, RED, RED_BOX); fill(c, BLUE, BLUE_BOX); }})}};
/** The same picture in three layers at their depths: the ground far off, red on the subject's plane, blue half way to the camera. */
const LAYER = {ground: c => fill(c, GROUND, [0, 0, 1600, 900]), red: c => fill(c, RED, RED_BOX), blue: c => fill(c, BLUE, BLUE_BOX)};
const deep = {name: 'deep', story: {compile: () => ({hang: 1, regionsAt: () => named, draw: c => Object.values(LAYER).forEach(f => f(c)),
  layers: [{name: 'ground', depth: 4}, {name: 'red', depth: 1}, {name: 'blue', depth: .5}], drawLayer: (c, t, name) => LAYER[name](c)})}};
/** A red square that walks right, 60 px a second. */
const moving = t => [200 + 60 * t, 200, 400 + 60 * t, 350];
const mover = {name: 'mover', story: {compile: () => ({hang: 1, regionsAt: t => [{box: moving(t), path: 'red', label: 'red', name: 'red'}],
  draw: (c, t) => { fill(c, GROUND, [0, 0, 1600, 900]); fill(c, RED, moving(t)); }})}};
const recipeOf = (recipe, kit = 'flat') => ({story: {kit}, ...recipe});
const make = (recipe, options = {}, kit = 'flat') => compileFilm({storyboard, timings, recipe: recipeOf(recipe, kit), kits: [flat, deep, mover], ...options});
const at = (film, scene, phrase) => film.clock.at([scene, phrase]);
/** The frame at t, as RGBA bytes. */
function picture(film, t) { const ctx = createCanvas(1600, 900).getContext('2d'); film.frame(ctx, t); return ctx.getImageData(0, 0, 1600, 900).data; }
const near = (d, x, y, rgb, tol = 12) => rgb.every((v, k) => Math.abs(d[(y * 1600 + x) * 4 + k] - v) < tol);
/** The first x along row y painted in the colour, or -1. */
const leftEdge = (d, y, rgb) => { for (let x = 0; x < 1600; x++) if (near(d, x, y, rgb)) return x; return -1; };
const boxOf = (film, t, name) => film.regionsAt(t).find(r => r.name === name).box;

test('the catalog: every move by name, in five families; whip is a transition, not a move; a refusal names what there is', async () => {
  assert.deepEqual(CAMERA_MOVE_NAMES, ['pan', 'tilt', 'dolly-in', 'dolly-out', 'crane', 'dutch', 'truck', 'track', 'orbit', 'dolly-zoom', 'rack-focus', 'handheld', 'speed-ramp', 'freeze']);
  assert.deepEqual([...new Set(Object.values(CAMERA_MOVES).map(m => m.family))], ['view', 'follow', 'depth', 'texture', 'time']);
  assert.ok(Object.isFrozen(CAMERA_MOVES.pan) && Object.isFrozen(CAMERA_MOVES.pan.params.amount));
  const red = ['a', 'red square'];
  await assert.rejects(make({camera: [{move: 'whip', at: red}]}), /camera\[0\]: a whip pan is a transition between two shots, not a move inside one: give the arriving stage "enter": "whip"/);
  await assert.rejects(make({camera: [{move: 'zoom', at: red}]}), /camera\[0\]: move must be one of pan, tilt, dolly-in, dolly-out, crane, dutch, truck, track, orbit, dolly-zoom, rack-focus, handheld, speed-ramp, freeze \(not "zoom"\)/);
  await assert.rejects(make({camera: [{move: 'pan', at: red, on: 'red'}]}), /camera\[0\] has unsupported key on \(a pan takes at, until, seconds, ease, feel, amount\)/);
  await assert.rejects(make({camera: [{move: 'dolly-in', at: red, amount: 5}]}), /camera\[0\]\.amount must be a number from 1\.05 to 3 \(times closer\), not 5/);
  await assert.rejects(make({camera: [{move: 'freeze', at: red, ease: 'out'}]}), /camera\[0\]: a freeze takes no ease or feel/);
  await assert.rejects(make({camera: [{move: 'pan', at: red, ease: 'out', feel: 'heavy'}]}), /give ease \(a curve's name\) or feel \(a spring\), not both/);
  await assert.rejects(make({camera: [{move: 'pan', at: red, ease: 'wobble'}]}), /camera\[0\]\.ease: "wobble" is not an ease/);
  for (const ease of ['bounce', 'cubic-bezier(0.2, 0.8, 0.2, 1)']) assert.ok(await make({camera: [{move: 'pan', at: red, ease}]}), `a named or written curve eases a move: ${ease}`);
  await assert.rejects(make({camera: [{move: 'pan', at: red, until: ['a', 'First']}]}), /camera\[0\]: until \(.*\) must come after at/);
  await assert.rejects(make({camera: [{move: 'pan', at: 99}]}), /camera\[0\]\.at is seconds from 0 to the film's end \(16\.70 s\), not 99/);
  await assert.rejects(make({camera: [{move: 'pan', at: ['b', 'once']}]}), /camera\[0\]: the pan takes 2 s and the film ends .* after it starts: give until or seconds/);
  await assert.rejects(make({camera: [{move: 'rack-focus', at: red}]}), /camera\[0\]: a rack-focus needs on: the name of one of the world's layers/);
  await assert.rejects(make({camera: {move: 'pan'}}), /camera is a list of moves, \[\{move, at, until\?, …\}\]/);
  await assert.rejects(make({camera: [{move: 'dutch', at: ['b', 'whole page']}, {move: 'pan', at: red}]}), /camera\[1\] starts at .* before camera\[0\] .*; list the moves in the order they start/);
  await assert.rejects(make({}, {reducedMotion: 'yes'}), /compileFilm: reducedMotion must be true .* or false \(the default\), not "yes"/);
});

test('additive: a film without camera moves draws exactly what it drew before, with reduced motion or not; a move changes nothing before it starts', async () => {
  if (PINS_HERE) {
    const hello = await compileExample('hello');
    assert.deepEqual(frameHashes(hello), golden.hello, 'the example film draws its pinned frames');
    assert.equal(hello.camera, null); assert.equal(hello.cameraAt, null);
  }
  const plain = await make({}), reduced = await make({}, {reducedMotion: true}), late = await make({camera: [{move: 'dutch', at: ['b', 'whole page']}]});
  const before = Array.from({length: 12}, (_, i) => +(i * at(plain, 'b', 'whole page') / 12).toFixed(3));
  assert.deepEqual(frameHashes(reduced, {times: before}), frameHashes(plain, {times: before}), 'reduced motion changes nothing without moves');
  assert.deepEqual(frameHashes(late, {times: before}), frameHashes(plain, {times: before}), 'not a pixel moves before the first move');
  assert.notDeepEqual(frameHashes(late, {times: [15.6]}), frameHashes(plain, {times: [15.6]}), 'and the move does move it');
  assert.deepEqual(late.regionsAt(1), plain.regionsAt(1));
  assert.deepEqual(late.moments().filter(m => !m.label.startsWith('mid dutch')), plain.moments());
});

test('view moves: a dolly in keeps its zoom and goes toward its thing as far as the edges allow; a pan at the whole frame scales just enough; a dutch rolls and still covers', async () => {
  const film = await make({camera: [{move: 'dolly-in', at: ['a', 'red square'], until: ['a', 'quietly'], on: 'red'}, {move: 'dutch', at: ['a', 'corner'], amount: 6, feel: 'heavy'}]});
  const a = at(film, 'a', 'red square'), q = at(film, 'a', 'quietly'), c = at(film, 'a', 'corner');
  assert.equal(film.cameraAt(a - .01), null, 'at rest before it');
  const held = film.cameraAt(q + .5);
  assert.equal(held.z, 1.3);
  assert.ok(Math.abs(held.x - 800 / 1.3) < 1e-9 && Math.abs(held.y - 450 / 1.3) < 1e-9, `toward red's centre (300, 275), stopped where the picture's edge reaches the frame's: ${JSON.stringify(held)}`);
  const red = boxOf(film, q + .5, 'red');
  assert.ok(Math.abs(red[0] - ((200 - held.x) * 1.3 + 800)) < 1e-6 && Math.abs(red[2] - red[0] - 260) < 1e-6, `red, 1.3 times larger: ${red}`);
  const rolled = film.cameraAt(c + settleTime('heavy') + .1);
  assert.ok(Math.abs(rolled.r - 6 * Math.PI / 180) < 1e-9 && rolled.z > 1.3, `rolled 6°, scaled up to cover: ${JSON.stringify(rolled)}`);
  assert.equal(rolled.z, coverZoom(rolled));
  const d = picture(film, c + 2);
  for (const [x, y] of [[0, 0], [1599, 0], [0, 899], [1599, 899]]) assert.ok([GROUND, RED, BLUE].some(rgb => near(d, x, y, rgb, 4)), `the frame's corner (${x}, ${y}) shows the picture, not the paper under it`);
  assert.deepEqual(film.camera.moves.map(m => [m.move, m.played, m.covers ?? null]), [['dolly-in', 'move', null], ['dutch', 'move', +rolled.z.toFixed(3)]]);
  const pan = await make({camera: [{move: 'pan', at: ['a', 'red square'], amount: 240}]}), panned = pan.cameraAt(at(pan, 'a', 'red square') + 2.5);
  assert.equal(panned.x, 1040); assert.ok(Math.abs(panned.z - 800 / 560) < 1e-9, 'scaled just enough for the slide');
  assert.equal(pan.camera.moves[0].covers, +(800 / 560).toFixed(3));
});

test('a framing holds until the picture changes, then eases back to the whole frame over the change; a move across a change refuses', async () => {
  const twoShots = (camera, options) => make({stages: [{type: 'world', scene: 'b', world: {kit: 'flat'}, enter: 'fade'}], camera}, options);
  const film = await twoShots([{move: 'dolly-in', at: ['a', 'red square'], until: ['a', 'quietly']}]);
  const start = film.clock.start('b'), from = start - .6, to = start - .6 + .8;   // the fade: 0.8 s, 0.75 of it before the scene
  assert.ok(Math.abs(film.cameraAt(from - .01).z - 1.3) < 1e-9, 'held up to the change');
  const mid = film.cameraAt((from + to) / 2).z;
  assert.ok(mid > 1 && mid < 1.3, `easing back over the fade: ${mid}`);
  assert.equal(film.cameraAt(to + .01), null, 'the new picture opens wide');
  assert.equal(film.camera.moves[0].lasts, +to.toFixed(3));
  const cut = await twoShots([{move: 'dolly-in', at: ['a', 'red square'], until: ['a', 'quietly']}], {reducedMotion: true});
  assert.equal(cut.cameraAt(from + .001), null, 'reduced motion: back at once, at the change');
  await assert.rejects(twoShots([{move: 'dolly-in', at: ['a', 'corner'], until: ['b', 'Then']}]), /camera\[0\] \(dolly-in\) runs from .* across the fade into b \(.*\); a camera move stays on one picture: end it before the change, or start it after/);
});

test('one camera: no move while the focus or a push moves the camera, nor two on the same thing; they take turns, and the camera frames what the focus framed', async () => {
  const focus = {strategy: 'camera', keys: [{at: ['a', 'red square'], on: 'red', size: 'medium'}]};
  await assert.rejects(make({focus, camera: [{move: 'dolly-in', at: ['a', 'square']}]}), /camera\[0\] \(dolly-in, .*\) would move the camera while the focus \(focus\.keys\[0\], on "red"\) is moving the camera \(.*\); a film has one camera: start the move after it settles, or show the focus with "spotlight" or "dim"/);
  const turns = await make({focus, camera: [{move: 'dolly-in', at: ['a', 'corner'], amount: 1.5}]}), c = at(turns, 'a', 'corner');
  // The focus put red in the middle of the frame (500–1100 on its row); the camera, the outer lens, dollies in on it there.
  assert.ok(near(picture(turns, c - .1), 800, 275 + 175, RED), 'the focus framed red');
  const [before, after] = [picture(turns, c - .1), picture(turns, c + 2.5)].map(d => leftEdge(d, 450, RED));
  assert.ok(Math.abs(before - 500) <= 2 && Math.abs(after - (800 - 300 * 1.5)) <= 2, `red's left edge: ${before} → ${after}`);
  assert.ok(near(picture(turns, c + 2.5), 800, 450, RED), 'still in the middle');
  const notes = [{note: 'push in', push: {at: [800, 450], zoom: 1.2, from: ['a', 'red square'], to: ['a', 'corner']}}];
  await assert.rejects(make({notes, camera: [{move: 'dutch', at: ['a', 'red square']}]}), /would move the camera while the push "push in" is moving the camera .* start the move after it has eased, or move the push/);
  const held = await make({notes, camera: [{move: 'dutch', at: ['a', 'quietly'], seconds: 1}]});
  assert.ok(held.cameraAt(at(held, 'a', 'quietly') + .5).r > 0, 'a move while a push holds is fine: the camera frames the pushed picture');
  await assert.rejects(make({camera: [{move: 'pan', at: ['a', 'red square']}, {move: 'pan', at: ['a', 'sits'], amount: -100}]}), /camera\[1\] \(pan\) starts at .* while camera\[0\] \(pan\) still moves the camera's left–right .*; one move at a time on each/);
  const both = await make({camera: [{move: 'pan', at: ['a', 'red square']}, {move: 'dutch', at: ['a', 'sits']}]});
  assert.equal(both.camera.moves.length, 2, 'a pan and a dutch at once move different things');
  // A world's spotlight is its kit's own camera: a move never runs over one, as a push never does.
  const spotted = {name: 'spotted', story: {compile: () => ({hang: 1, regionsAt: () => named, draw: flat.story.compile().draw,
    spotAt: t => (t > 5 && t < 6 ? {cx: 300, cy: 275, r: 120, zoom: 1.5, w: 1} : null)})}};
  const spot = camera => compileFilm({storyboard, timings, recipe: {story: {kit: 'spotted'}, camera}, kits: [spotted]});
  await assert.rejects(spot([{move: 'dolly-in', at: ['a', 'corner'], seconds: 1}]), /camera\[0\] \(dolly-in\) runs over the story's spotlight at 5\.0\d s; a film has one camera: move before or after the spotlight/);
  assert.ok((await spot([{move: 'dolly-in', at: ['b', 'Then'], seconds: 1}])).camera, 'after it, fine');
});

test('depth: an orbit slides each layer by its depth, a dolly zoom keeps the subject\'s size, a rack focus pulls focus from one layer to another', async () => {
  const red = ['a', 'red square'], done = film => at(film, 'a', 'red square') + 3.2;
  const orbit = await make({camera: [{move: 'orbit', at: red, amount: 120}]}, {}, 'deep'), o = picture(orbit, done(orbit));
  assert.equal(leftEdge(o, 275, RED), 200, 'the subject (depth 1) stays');
  assert.equal(leftEdge(o, 580, BLUE), 1100 - 120, 'the near layer (depth 0.5) slides the other way, by amount × (1 − 1/0.5)');
  assert.ok(near(o, 2, 450, GROUND) && near(o, 1597, 450, GROUND), 'the far layer still covers the frame');
  const zoom = await make({camera: [{move: 'dolly-zoom', at: red, amount: .35}]}, {}, 'deep'), z = picture(zoom, done(zoom));
  assert.equal(leftEdge(z, 275, RED), 200, 'the subject keeps its size');
  assert.ok(Math.abs(leftEdge(z, 580, BLUE) - (800 + 300 * 1.35 * .5 / .85)) <= 1, 'the near layer shrinks as the background grows');
  const rack = await make({camera: [{move: 'rack-focus', at: red, from: 'red', on: 'blue'}]}, {}, 'deep'), r = at(rack, 'a', 'red square');
  assert.ok(near(picture(rack, r - .1), 196, 275, GROUND) && near(picture(rack, r - .1), 1096, 580, GROUND), 'all sharp before it');
  const racked = picture(rack, r + 1.6);
  assert.ok(!near(racked, 196, 275, GROUND), 'the layer it left is soft: its edge bleeds');
  assert.ok(near(racked, 1096, 580, GROUND) && near(racked, 1105, 580, BLUE), 'the layer it pulled to is sharp');
  assert.equal(rack.camera.moves[0].world, 'story');
  await assert.rejects(make({camera: [{move: 'orbit', at: red}]}), /camera\[0\] \(orbit\): the world at story is drawn by the kit "flat", which gives no depth layers; .* layers: \[\{name, depth\}\] \(back to front; depth 1 is the subject's plane.*drawLayer\(ctx, t, name, spot\)/);
  await assert.rejects(make({camera: [{move: 'rack-focus', at: red, on: 'blue'}]}, {}, 'deep'), /camera\[0\] \(rack-focus\) needs from: the layer in focus as its world opens \(its layers are ground, red, blue\)/);
  await assert.rejects(make({camera: [{move: 'rack-focus', at: red, from: 'red', on: 'sky'}]}, {}, 'deep'), /has no layer "sky"; its layers are ground, red, blue/);
  await assert.rejects(make({camera: [{move: 'rack-focus', at: red, from: 'red', on: 'blue'}, {move: 'rack-focus', at: ['a', 'corner'], from: 'ground', on: 'red'}]}, {}, 'deep'), /racks from "ground", but the focus is on "blue" then .* a focus cannot jump/);
  const backwards = {name: 'backwards', story: {compile: () => ({hang: 1, draw() {}, drawLayer() {}, layers: [{name: 'near', depth: .5}, {name: 'far', depth: 3}]})}};
  await assert.rejects(compileFilm({storyboard, timings, recipe: {story: {kit: 'backwards'}, camera: [{move: 'orbit', at: red}]}, kits: [backwards]}), /layers go back to front, the farthest first; "far" \(depth 3\) is farther than "near"/);
});

test('follow: a track keeps a moving thing in view and holds where it was when it ends; reduced motion cuts there at its end', async () => {
  const film = await make({camera: [{move: 'track', at: ['a', 'red square'], until: ['a', 'corner'], on: 'red'}]}, {}, 'mover');
  const a = at(film, 'a', 'red square'), c = at(film, 'a', 'corner'), centre = t => (moving(t)[0] + moving(t)[2]) / 2;
  assert.ok(Math.abs(film.cameraAt(c - .02).x - centre(c - .02)) < 1, 'on the thing as the move arrives');
  assert.ok(Math.abs(film.cameraAt(c + 1).x - centre(c)) < 1e-6 && film.cameraAt(c + 1).y === 275, 'held where it was at the end');
  const m = film.cameraAt((a + c) / 2);
  assert.ok(m.x < 800 && m.x > centre((a + c) / 2), `easing from the frame's centre onto it: ${m.x}`);
  assert.equal(film.camera.moves[0].covers > 1, true, 'scaled up to keep the frame covered as it looks toward the edge');
  const cut = await make({camera: [{move: 'track', at: ['a', 'red square'], until: ['a', 'corner'], on: 'red'}]}, {reducedMotion: true}, 'mover');
  assert.equal(cut.cameraAt(c - .01), null); assert.ok(Math.abs(cut.cameraAt(c).x - centre(c)) < 1e-6);
  await assert.rejects(make({camera: [{move: 'track', at: ['a', 'red square'], on: 'green'}]}, {}, 'mover'), /camera\[0\] \(track on "green"\): nothing in the picture is called "green" at .*; the names there are red/);
});

test('the picture\'s clock: a freeze holds the picture while the voice goes on; a speed ramp runs slow in the middle and is in step at both ends', async () => {
  const plain = await make({}, {}, 'mover');
  const freeze = await make({camera: [{move: 'freeze', at: ['a', 'red square'], seconds: 1}]}, {}, 'mover'), f = at(freeze, 'a', 'red square');
  assert.deepEqual(Object.values(frameHashes(freeze, {times: [f + .2, f + .8]})).reduce((a, b) => (a === b ? a : null)) !== null, true, 'the same picture all through it');
  assert.deepEqual(Object.values(frameHashes(freeze, {times: [f + .5]})), Object.values(frameHashes(plain, {times: [f]})), 'the frame it froze on');
  assert.deepEqual(Object.values(frameHashes(freeze, {times: [f + 1.2]})), Object.values(frameHashes(plain, {times: [f + 1.2]})), 'then in step again');
  assert.deepEqual(boxOf(freeze, f + .5, 'red'), boxOf(plain, f, 'red'), 'what is drawn where is the frozen picture');
  assert.equal(speedRamp(0, .3), 0); assert.equal(speedRamp(1, .3), 1); assert.equal(speedRamp(.5, .3), .5);
  const slope = u => (speedRamp(u + 1e-6, .3) - speedRamp(u - 1e-6, .3)) / 2e-6;
  assert.ok(Math.abs(slope(.5) - .3) < 1e-6 && Math.abs(slope(1e-5) - 1) < 1e-4, 'speed 0.3 in the middle, 1 at the ends');
  for (let u = 0; u < 1; u += .01) assert.ok(speedRamp(u + .01, 0) >= speedRamp(u, 0), 'never runs backwards, even down to a stop');
  const ramp = await make({camera: [{move: 'speed-ramp', at: ['a', 'red square'], seconds: 2, amount: .3}]}, {}, 'mover'), s = at(ramp, 'a', 'red square');
  assert.ok(Math.abs(boxOf(ramp, s + .5, 'red')[0] - moving(s + 2 * speedRamp(.25, .3))[0]) < 1e-6, 'the picture is ahead of the voice a quarter in');
  assert.deepEqual(boxOf(ramp, s + 2.5, 'red'), boxOf(plain, s + 2.5, 'red'), 'and in step after');
});

test('handheld: a small, slow, seeded drift — the same every time, different for another seed, fading in and out, and off for reduced motion', async () => {
  const hand = seed => make({camera: [{move: 'handheld', at: ['a', 'First'], amount: 6, seed}]});
  const [one, again, two, plain] = await Promise.all([hand(1), hand(1), hand(2), make({})]), t = 5;
  assert.deepEqual(frameHashes(one, {count: 6}), frameHashes(again, {count: 6}), 'deterministic');
  assert.notDeepEqual(boxOf(one, t, 'red'), boxOf(two, t, 'red'), 'another seed drifts another way');
  const drift = boxOf(one, t, 'red').map((v, i) => v - boxOf(plain, t, 'red')[i]);
  assert.ok(Math.abs(drift[0]) > .1 && Math.abs(drift[0]) < 30, `small: ${drift}`);
  assert.deepEqual(boxOf(one, at(one, 'a', 'First'), 'red'), boxOf(plain, at(one, 'a', 'First'), 'red'), 'it fades in from nothing');
  assert.equal(one.cameraAt(t), null, 'a drift, not a framing');
  const steps = Array.from({length: 30}, (_, i) => boxOf(one, t + i / 30, 'red')[0]);
  assert.ok(Math.max(...steps.slice(1).map((x, i) => Math.abs(x - steps[i]))) < 1.5, 'slow: under 1.5 px a frame');
  const reduced = await make({camera: [{move: 'handheld', at: ['a', 'First'], amount: 6}]}, {reducedMotion: true});
  assert.deepEqual(frameHashes(reduced, {count: 6}), frameHashes(plain, {count: 6}), 'off');
});

test('reduced motion: a decision with its evidence — each move cuts to its end framing on its first moment, a speed ramp plays in step, a freeze is kept', async () => {
  const camera = [{move: 'handheld', at: ['a', 'First']}, {move: 'dolly-in', at: ['a', 'red square'], until: ['a', 'quietly'], on: 'red'}, {move: 'speed-ramp', at: ['b', 'Then']}, {move: 'freeze', at: ['b', 'back to all']}];
  const moves = await make({camera}), cuts = await make({camera}, {reducedMotion: true}), a = at(cuts, 'a', 'red square');
  assert.equal(moves.camera.motion, 'moves'); assert.equal(cuts.camera.motion, 'cuts');
  assert.equal(cuts.camera.decision.chosen, 'cuts');
  assert.deepEqual(cuts.camera.decision.rules[0].conditions.map(c => [c.key, c.op, c.threshold, c.result]), [['reducedMotion', 'eq', true, true]]);
  assert.equal(moves.camera.decision.defaultLabel, 'Each move eases as written');
  assert.deepEqual(cuts.camera.moves.map(m => m.played), ['off', 'cut', 'off', 'kept']);
  assert.equal(cuts.cameraAt(a - .01), null);
  assert.deepEqual(cuts.cameraAt(a), moves.cameraAt(at(moves, 'a', 'quietly') + .1), 'the end framing, at once');
  assert.ok(cuts.camera.narrative.some(e => /reduced motion/.test(e.text ?? '')), 'the narrative says why');
  assert.deepEqual(frameHashes(cuts, {times: [9]}), frameHashes(await make({camera: [camera[1], camera[3]]}, {reducedMotion: true}), {times: [9]}), 'the speed ramp in step');
});

test('the record: the plan is a footprintjs flowchart; the compile record carries each move as played; a segment\'s key holds the moves over it', async () => {
  const camera = [{move: 'dolly-in', at: ['a', 'red square'], amount: 1.3}];
  const film = await make({camera}, {record: true});
  const stages = film.camera.narrative.filter(e => e.type === 'stage').map(e => e.stageName ?? e.text);
  assert.ok(stages.length >= 5, `the plan's stages: ${stages}`);
  assert.ok(film.camera.narrative.some(e => e.type === 'condition' || /Condition|fell back|chose/.test(e.text ?? '')), 'the decision is in the narrative');
  assert.ok(JSON.stringify(film.record.snapshot.commitLog).includes('camera.camera[0]'), 'the compile record writes camera.camera[0]');
  assert.deepEqual(structuredClone(film.camera), film.camera, 'the camera record survives structuredClone');
  const pixels = {width: 320, height: 180, fps: 10, layout: null, stamp: null, motionBlur: null, poster: null};
  const keys = async moves => { const recipe = recipeOf({camera: moves}), f = await compileFilm({storyboard, timings, recipe, kits: [flat]}); return planSegments(f, {fps: 10}).map(seg => segmentKey(f, seg, {recipe, storyboard, pixels, code: 'k', fps: 10})); };
  assert.deepEqual(await keys(camera), await keys(camera), 'the same moves, the same keys');
  assert.notDeepEqual(await keys(camera), await keys([{...camera[0], amount: 1.4}]), 'another dolly, another key');
});

test('regions, clicks and the canvas: boxes go through the camera (a rolled box: the box that holds it), a click comes back through it, and every frame restores the canvas', async () => {
  const film = await make({camera: [{move: 'dolly-in', at: ['a', 'red square'], on: 'red'}, {move: 'dutch', at: ['a', 'corner'], amount: 8}, {move: 'handheld', at: ['a', 'corner'], seconds: 3}]}, {}, 'deep');
  const t = at(film, 'a', 'corner') + 1.2, lens = viewOf(film.cameraAt(t));
  const [fx, fy] = through(lens, [300, 275, 300, 275]);
  const back = film.pointAt(t, fx, fy).frame;
  assert.ok(Math.abs(back[0] - 300) <= 12 && Math.abs(back[1] - 275) <= 12, `a click on red's centre reads back near it (handheld's drift aside): ${back}`);
  const box = boxOf(film, t, 'red');
  assert.ok(fx > box[0] && fx < box[2] && fy > box[1] && fy < box[3], 'red\'s box holds where red is drawn');
  const ctx = createCanvas(320, 180).getContext('2d');
  for (const s of [1, t, t + .5, 12]) {
    ctx.resetTransform(); ctx.scale(.2, .2);
    const was = ctx.getTransform(); film.frame(ctx, s); const m = ctx.getTransform();
    assert.deepEqual([m.a, m.b, m.c, m.d, m.e, m.f], [was.a, was.b, was.c, was.d, was.e, was.f], `the transform is restored at ${s}`);
    assert.equal(ctx.filter, 'none'); assert.equal(ctx.globalAlpha, 1);
  }
});

test('a dolly starts from what is on screen: after a pan or a dutch angle (their cover zoom included) it is still a change of the zoom the viewer sees', async () => {
  const pan = await make({camera: [{move: 'pan', at: ['a', 'red square'], amount: 240}, {move: 'dolly-in', at: ['a', 'corner'], amount: 1.3}]});
  const panned = pan.cameraAt(at(pan, 'a', 'corner') - .1), dollied = pan.cameraAt(at(pan, 'a', 'corner') + 2.5);
  assert.ok(Math.abs(panned.z - 800 / 560) < 1e-9, 'the pan scaled up to cover');
  assert.ok(Math.abs(dollied.z - 1.3 * 800 / 560) < 1e-9, `×1.3 of what was on screen: ${panned.z} → ${dollied.z}`);
  assert.equal(pan.camera.moves[1].ends.z, +(1.3 * 800 / 560).toFixed(3));
  const steps = Array.from({length: 40}, (_, i) => pan.cameraAt(at(pan, 'a', 'corner') - .05 + i / 30).z);
  assert.ok(Math.max(...steps.slice(1).map((z, i) => Math.abs(z - steps[i]))) < .05, 'no jump as the dolly starts');
  const dutch = await make({camera: [{move: 'dutch', at: ['a', 'red square'], amount: 20}, {move: 'dolly-in', at: ['a', 'corner'], amount: 1.3}]});
  const rolled = dutch.cameraAt(at(dutch, 'a', 'corner') - .1), closer = dutch.cameraAt(at(dutch, 'a', 'corner') + 2.5);
  assert.ok(rolled.z > 1.5 && Math.abs(closer.z - 1.3 * rolled.z) < 1e-9, `after a 20° dutch: ${rolled.z} → ${closer.z}`);
  await assert.rejects(make({camera: [{move: 'dolly-in', at: ['a', 'red square'], amount: 2}, {move: 'dolly-in', at: ['a', 'corner'], amount: 2.5}]}),
    /camera\[1\] \(dolly-in\) takes the camera to ×5\.00 at .*, past the ×4 a camera goes to \(dollies multiply: each starts from the zoom on screen.*\): dolly in less, or dolly out between them/);
});

test('a world\'s own camera: a camera move or a push never runs while a kit moves its own camera (the cartoon kit\'s camera keys)', async () => {
  const clock = {at: ref => ({out: 1, home: 2, move: 3})[ref]};
  const world = cartoonKit.story.compile({flock: {count: 1, out: {at: 'out'}, home: {at: 'home'}}, camera: [{at: 'move', to: [560, 640], zoom: 1.25}]}, clock, {cameraSpeed: 1});
  assert.deepEqual(world.cameraMoves, [{from: 3, to: 3 + 1.6}], 'its camera keys, each over its move');
  const worlds = JSON.parse(readFileSync(new URL('../examples/worlds/recipe.json', import.meta.url), 'utf8')), beat = ['valley', 'lets the sheep out'];
  await assert.rejects(compileExample('worlds', {recipe: {...worlds, camera: [{move: 'dutch', at: beat, seconds: 1}]}}),
    /camera\[0\] \(dutch, .*\) would move the camera while the kit "cartoon" moves its own camera in the world at stages\[0\]\.world \(.*\); a film has one camera: move the camera move, or the kit's camera key, so they take turns/);
  await assert.rejects(compileExample('worlds', {recipe: {...worlds, notes: [{note: 'push in', push: {at: [600, 600], from: beat, to: ['valley', 'one by one']}}]}}),
    /note "push in": the push runs from .* while the kit "cartoon" moves its own camera in the world at stages\[0\]\.world .*; one camera move at a time: move the push, or the kit's camera key/);
  const after = await compileExample('worlds', {recipe: {...worlds, camera: [{move: 'dutch', at: ['valley', 'How many sheep'], seconds: 1}]}});
  assert.equal(after.camera.moves[0].played, 'move', 'after the kit\'s move, they take turns');
  const odd = {name: 'odd', story: {compile: () => ({draw() {}, cameraMoves: [{from: 2, to: 1}]})}};
  await assert.rejects(compileFilm({storyboard, timings, recipe: {story: {kit: 'odd'}}, kits: [odd]}), /the story: the kit "odd" returned cameraMoves that are not \[\{from, to\}\]/);
});

test('a dolly on a thing stays on it when the push under the camera eases out; its resolved end framing is in the record and the segment keys', async () => {
  const MID = [700, 400, 900, 500];
  const midKit = {name: 'mid', story: {compile: () => ({hang: 1, regionsAt: () => [{box: MID, path: 'mid', label: 'mid', name: 'mid'}],
    draw: c => { fill(c, GROUND, [0, 0, 1600, 900]); fill(c, RED, MID); }})}};
  const film = (zoom = 1.3) => compileFilm({storyboard, timings, kits: [midKit], recipe: {story: {kit: 'mid'},
    notes: [{note: 'push', push: {at: [400, 300], zoom, from: ['a', 'red square'], to: ['a', 'corner']}}],
    camera: [{move: 'dolly-in', at: ['a', 'sits'], until: ['a', 'quietly'], on: 'mid', amount: 1.6}]}});
  const f = await film(), held = f.cameraAt(at(f, 'a', 'quietly') + .2), after = f.cameraAt(at(f, 'a', 'corner') + 1.5);
  assert.ok(Math.abs(held.x - 1040) < 1e-6 && Math.abs(held.y - 585) < 1e-6, `on mid as the push holds it: ${JSON.stringify(held)}`);
  assert.ok(Math.abs(after.x - 800) < 1e-6 && Math.abs(after.y - 450) < 1e-6 && after.z === 1.6, `still on mid once the push has eased out: ${JSON.stringify(after)}`);
  const centre = b => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  assert.deepEqual(centre(boxOf(f, at(f, 'a', 'corner') + 1.5, 'mid')).map(Math.round), [800, 450], 'mid is where the camera put it');
  assert.deepEqual(f.camera.moves[0].ends, {x: 1040, y: 585, z: 1.6, r: 0});
  const g = await film(1.25);
  assert.notDeepEqual(g.camera.moves[0].ends, f.camera.moves[0].ends, 'another push under it, another end framing');
  const pixels = {width: 320, height: 180, fps: 10, layout: null, stamp: null, motionBlur: null, poster: null};
  const material = x => segmentMaterial(x, planSegments(x, {fps: 10})[0], {recipe: {story: {kit: 'mid'}}, storyboard, pixels, code: 'k', fps: 10});
  assert.notDeepEqual(material(g).camera, material(f).camera, 'and another segment key');
  const plain = await make({}), calm = await make({}, {reducedMotion: true});
  assert.equal('camera' in material(plain), false, 'no camera moves: no camera in a segment\'s key');
  assert.equal('reducedMotion' in calm.inputs, false, 'no camera moves: reduced motion leaves the inputs as they were');
  assert.deepEqual(calm.inputs, plain.inputs);
  assert.equal((await make({camera: [{move: 'dutch', at: ['a', 'red square']}]}, {reducedMotion: true})).inputs.reducedMotion, true);
});

test('clicks and boxes through the focus, the camera and handheld: a click on a thing reads back exactly where the recipe placed it', async () => {
  const focus = {strategy: 'camera', keys: [{at: ['a', 'red square'], on: 'red', size: 'medium'}]};
  const film = await make({focus, camera: [{move: 'dutch', at: ['a', 'corner'], amount: 8}, {move: 'handheld', at: ['a', 'corner'], seconds: 4}]});
  for (const t of [at(film, 'a', 'quietly'), at(film, 'a', 'corner') + 1.3]) {
    const box = boxOf(film, t, 'red'), [fx, fy] = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
    assert.deepEqual(film.pointAt(t, fx, fy).frame, [300, 275], `at ${t.toFixed(2)} s the click on red's centre reads back as red's centre`);
    assert.ok(near(picture(film, t), Math.round(fx), Math.round(fy), RED), 'and red is drawn there');
  }
});

test('a freeze over the voice is a review finding: a drawing the voice names under it, a mouth held still while its speaker talks', async () => {
  const shows = {name: 'shows', story: {compile: (spec, clock) => { const t0 = clock.at(spec.show); return {hang: 1,
    draw: (c, t) => { fill(c, GROUND, [0, 0, 1600, 900]); if (t >= t0) fill(c, RED, RED_BOX); },
    mouthsAt: t => [{who: null, open: Math.abs(Math.sin(t * 9))}]}; }}};
  const film = await compileFilm({storyboard, timings, kits: [shows], recipe: {story: {kit: 'shows', show: ['a', 'quietly']}, camera: [{move: 'freeze', at: ['a', 'sits'], until: ['a', 'corner']}]}});
  const r = await reviewPart(film, {from: 1, to: 6, checks: {'frozen-voice': REVIEW_CHECKS['frozen-voice']}});
  assert.deepEqual(r.ran, ['frozen-voice']);
  assert.ok(r.findings.some(f => f.kind === 'frozen-voice' && /the voice names "story\.show" while the picture is frozen \(it appears when the freeze ends\); a mouth stays still while the narrator speaks/.test(f.what)), JSON.stringify(r.findings));
  const plain = await compileFilm({storyboard, timings, kits: [shows], recipe: {story: {kit: 'shows', show: ['a', 'quietly']}}});
  assert.deepEqual((await reviewPart(plain, {from: 1, to: 6, checks: {'frozen-voice': REVIEW_CHECKS['frozen-voice']}})).ran, [], 'not picked without a freeze');
});

test('frozen-voice names only what the freeze holds: the emphasis and the focus run on the voice\'s clock, so their beats under a freeze are no finding', async () => {
  const film = await make({camera: [{move: 'freeze', at: ['a', 'sits'], until: ['a', 'corner']}],
    emphasis: {strategy: 'pop', words: [{at: ['a', 'quietly'], text: 'QUIET'}]}, focus: {strategy: 'spotlight', keys: [{at: ['a', 'here'], on: 'red'}]}});
  const r = await reviewPart(film, {from: 1, to: 6, checks: {'frozen-voice': REVIEW_CHECKS['frozen-voice']}});
  assert.deepEqual(r.ran, ['frozen-voice'], 'picked: the part has a freeze');
  assert.deepEqual(r.findings, [], `the words and the spotlight are not frozen: ${JSON.stringify(r.findings)}`);
});

test('a move that starts while another runs aims from where that one is going — and under reduced motion from where a follow will cut to, so both versions end on the same framing', async () => {
  const beside = await make({camera: [{move: 'pan', at: ['a', 'red square'], until: ['a', 'quietly'], amount: 240}, {move: 'dolly-in', at: ['a', 'sits'], seconds: 2, amount: 1.3}]});
  const after = await make({camera: [{move: 'pan', at: ['a', 'red square'], until: ['a', 'quietly'], amount: 240}, {move: 'dolly-in', at: ['a', 'corner'], seconds: 2, amount: 1.3}]});
  const s = at(beside, 'a', 'sits');
  assert.ok(Math.abs(beside.cameraAt(s + 2.5).z - 1.3 * 800 / 560) < 1e-9, `×1.3 of the zoom the pan ends on, not of its middle: ${beside.cameraAt(s + 2.5).z}`);
  assert.equal(beside.camera.moves[1].ends.z, after.camera.moves[1].ends.z, 'the same as a dolly after the pan');
  const steps = Array.from({length: 30}, (_, i) => beside.cameraAt(s - .1 + i / 60).z);
  assert.ok(Math.max(...steps.slice(1).map((z, i) => Math.abs(z - steps[i]))) < .03, 'it starts from what is on screen: no jump');
  const camera = [{move: 'track', at: ['a', 'red square'], until: ['a', 'corner'], on: 'red'}, {move: 'dolly-in', at: ['a', 'sits'], seconds: 1, amount: 1.3}];
  const [moving, calm] = await Promise.all([make({camera}, {}, 'mover'), make({camera}, {reducedMotion: true}, 'mover')]);
  const end = at(moving, 'a', 'corner') + 1, cover = 450 / 275;   // where the track ends, (588, 275), needs ×1.636 to cover
  assert.ok(Math.abs(moving.cameraAt(end).z - 1.3 * cover) < 1e-6, `moving: ${moving.cameraAt(end).z}`);
  assert.ok(Math.abs(calm.cameraAt(end).z - moving.cameraAt(end).z) < 1e-9, `reduced motion ends on the same framing: ${calm.cameraAt(end).z}`);
  for (const k of ['x', 'y', 'z', 'r']) assert.ok(Math.abs(calm.cameraAt(end)[k] - moving.cameraAt(end)[k]) < 1e-9, `the same ${k} once both have arrived`);
  assert.equal(calm.camera.moves[1].ends.z, moving.camera.moves[1].ends.z, 'the dolly resolves to the same zoom');
});

test('a dolly on a thing keeps the thing on its framing under a later dutch, which scales up to cover as anywhere; a dutch that would take a held dolly past ×4 refuses, naming the dutch', async () => {
  // The failing input: a dolly in on red ×1.3, then a dutch of 8°. The look point stays where the dolly put it; the zoom rises to cover.
  const red = await make({camera: [{move: 'dolly-in', at: ['a', 'red square'], until: ['a', 'quietly'], on: 'red'}, {move: 'dutch', at: ['a', 'corner'], amount: 8}]});
  const before = red.cameraAt(at(red, 'a', 'corner') - .1), after = red.cameraAt(at(red, 'a', 'corner') + 2);
  assert.ok(Math.abs(after.x - before.x) < 1e-9 && Math.abs(after.y - before.y) < 1e-9, `the look point stays on red's framing: ${JSON.stringify([before, after])}`);
  assert.ok(Math.abs(before.z - 1.3) < 1e-9 && Math.abs(after.z - 1.609) < 1e-3 && after.z === coverZoom(after), `×1.3 → ×${after.z.toFixed(3)}, scaled up to cover`);
  // A thing the dolly could centre stays in the middle of the frame through the dutch.
  const NEAR = [600, 330, 700, 430], nearKit = {name: 'near', story: {compile: () => ({hang: 1, regionsAt: () => [{box: NEAR, path: 'near', label: 'near', name: 'near'}],
    draw: c => { fill(c, GROUND, [0, 0, 1600, 900]); fill(c, RED, NEAR); }})}};
  const near = await compileFilm({storyboard, timings, kits: [nearKit], recipe: {story: {kit: 'near'}, camera: [{move: 'dolly-in', at: ['a', 'red square'], until: ['a', 'quietly'], on: 'near'}, {move: 'dutch', at: ['a', 'corner'], amount: 8}]}});
  for (const t of [at(near, 'a', 'quietly') + .5, at(near, 'a', 'corner') + .4, at(near, 'a', 'corner') + 2]) {
    const b = boxOf(near, t, 'near'), centre = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    assert.ok(Math.hypot(centre[0] - 800, centre[1] - 450) < .5, `at ${t.toFixed(2)} s "near" is on its framing: ${centre}`);
  }
  // A dutch that needs more than ×4 to cover a held dolly refuses, naming the dutch: while it rolls (its own span) …
  const CORNER = [100, 50, 200, 150], cornerKit = {name: 'corner', story: {compile: () => ({hang: 1, regionsAt: () => [{box: CORNER, path: 'corner', label: 'corner', name: 'corner'}],
    draw: c => { fill(c, GROUND, [0, 0, 1600, 900]); fill(c, RED, CORNER); }})}};
  await assert.rejects(compileFilm({storyboard, timings, kits: [cornerKit], recipe: {story: {kit: 'corner'}, camera: [{move: 'dolly-in', at: ['a', 'red square'], until: ['a', 'quietly'], on: 'corner', amount: 3}, {move: 'dutch', at: ['a', 'corner'], amount: 15}]}}),
    /camera\[1\] \(dutch\) would need the picture at ×4\.\d\d at .* to keep the frame covered/);
  // … or later in the hold, when the focus goes wide and the thing slides under the held, rolled camera.
  const FAR = [1440, 400, 1560, 500], farKit = {name: 'far', story: {compile: () => ({hang: 1, regionsAt: () => [{box: FAR, path: 'far', label: 'far', name: 'far'}],
    draw: c => { fill(c, GROUND, [0, 0, 1600, 900]); fill(c, RED, FAR); }})}};
  await assert.rejects(compileFilm({storyboard, timings, kits: [farKit], recipe: {story: {kit: 'far'},
    focus: {strategy: 'camera', keys: [{at: ['a', 'First'], on: 'far'}, {at: ['b', 'Then'], on: 'wide'}]},
    camera: [{move: 'pan', at: ['a', 'red square'], seconds: .8, amount: 133}, {move: 'dolly-in', at: ['a', 'sits'], seconds: 1, on: 'far', amount: 3},
      {move: 'dutch', at: ['a', 'quietly'], seconds: 1, amount: 30}]}}),
    /camera\[2\] \(dutch\) rolls the frame while camera\[1\] \(dolly-in\) holds on "far": at .* the picture would need ×4\.\d\d to keep the frame covered \(a camera goes to ×4\): roll less, or dolly in less before it/);
});

test('a refusal names the move that moves: a pan after a held dolly is checked on its own span, and the hold ends where the pan starts', async () => {
  await assert.rejects(make({camera: [{move: 'dolly-in', at: ['a', 'red square'], until: ['a', 'quietly'], on: 'red', amount: 1.2}, {move: 'pan', at: ['a', 'corner'], amount: 1000}]}),
    /^Error: camera\[1\] \(pan\) would need the picture at more than any zoom at .* to keep the frame covered/);
});

test('a dolly-out that cannot widen refuses as the no-op it is: a dutch holds the zoom up, or the camera is already at the whole frame', async () => {
  // A dolly in, then a 15° dutch with a dolly-out beside it: the dutch's cover need would zoom the picture IN (×1.3 → ×1.43).
  await assert.rejects(make({camera: [{move: 'dolly-in', at: ['a', 'red square'], until: ['a', 'quietly']}, {move: 'dutch', at: ['a', 'quietly'], seconds: 2, amount: 15}, {move: 'dolly-out', at: ['a', 'in'], seconds: 1.5}]}),
    /camera\[2\] \(dolly-out\) cannot widen here: the dutch \(camera\[1\]\) needs ×1\.43 to keep the frame covered; the camera is headed for ×1\.43 as it starts, and would end at ×1\.43; level the dutch first \(amount 0\), or leave the dolly-out out/);
  await assert.rejects(make({camera: [{move: 'dolly-out', at: ['a', 'red square']}]}), /camera\[0\] \(dolly-out\) cannot widen here: the camera is already at the whole frame/);
  const widens = await make({camera: [{move: 'dolly-in', at: ['a', 'red square'], until: ['a', 'quietly'], amount: 2}, {move: 'dutch', at: ['a', 'quietly'], seconds: 1, amount: 8}, {move: 'dolly-out', at: ['a', 'corner'], amount: 1.3}]});
  const c = at(widens, 'a', 'corner');
  assert.ok(widens.cameraAt(c + 2.5).z < widens.cameraAt(c - .1).z, 'a dolly-out the dutch leaves room for still widens');
});

test('a held dolly is checked until moves have taken over both where it looks across and up and down: a pan on x leaves y re-aiming', async () => {
  const TOP = [700, 30, 900, 110], topKit = {name: 'top', story: {compile: () => ({hang: 1, regionsAt: () => [{box: TOP, path: 'top', label: 'top', name: 'top'}],
    draw: c => { fill(c, GROUND, [0, 0, 1600, 900]); fill(c, RED, TOP); }})}};
  const film = camera => compileFilm({storyboard, timings, kits: [topKit], recipe: {story: {kit: 'top'}, camera,
    focus: {strategy: 'camera', keys: [{at: ['a', 'First'], on: 'top'}, {at: ['b', 'blue'], on: 'wide'}]}}});
  const dolly = {move: 'dolly-in', at: ['a', 'sits'], seconds: 1, on: 'top', amount: 3}, dutch = {move: 'dutch', at: ['a', 'corner'], seconds: 1, amount: 30};
  await assert.rejects(film([dolly, {move: 'pan', at: ['a', 'quietly'], seconds: .5, amount: 10}, dutch]),
    /camera\[2\] \(dutch\) rolls the frame while camera\[0\] \(dolly-in\) holds on "top": at [\d.]+ s the picture would need ×5\.26 to keep the frame covered/);
  // Without the pan the same hold refuses the same way (it used to name its first moment past ×4, ×4.13; now its furthest).
  await assert.rejects(film([dolly, dutch]), /camera\[1\] \(dutch\) rolls the frame while camera\[0\] \(dolly-in\) holds on "top": at [\d.]+ s the picture would need ×5\.26/);
});

test('a dolly-out is judged from where the camera is headed, so the moving film and reduced motion refuse it alike', async () => {
  const camera = [{move: 'dutch', at: ['a', 'First'], seconds: 1, amount: 20}, {move: 'dutch', at: ['a', 'sits'], seconds: 1.5, amount: 5}, {move: 'dolly-out', at: ['a', 'here'], seconds: 1}];
  const said = async options => { try { await make({camera}, options); return 'accepted'; } catch (e) { return e.message; } };
  const [moving, calm] = [await said({}), await said({reducedMotion: true})];
  assert.match(moving, /camera\[2\] \(dolly-out\) cannot widen here: the dutch \(camera\[1\]\) needs ×1\.15 to keep the frame covered; the camera is headed for ×1\.15 as it starts, and would end at ×1\.15/);
  assert.equal(calm, moving);
});

test('moving and reduced motion accept and refuse the same recipes, with the same words (generated recipes)', async () => {
  let seed = 7;
  const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const pick = list => list[Math.floor(rand() * list.length)], between = (a, b) => +(a + (b - a) * rand()).toFixed(2);
  const beats = [['a', 'First'], ['a', 'red square'], ['a', 'sits'], ['a', 'here'], ['a', 'quietly'], ['a', 'in its'], ['a', 'corner'], ['a', 'of the page'], ['b', 'Then'], ['b', 'blue'], ['b', 'and then'], ['b', 'back'], ['b', 'whole page']];
  const moves = {
    pan: () => ({amount: between(-400, 400)}), tilt: () => ({amount: between(-250, 250)}), dutch: () => ({amount: between(-25, 25)}),
    'dolly-in': () => ({amount: between(1.05, 2.5), ...(rand() < .5 ? {on: pick(['red', 'blue'])} : {})}), 'dolly-out': () => ({amount: between(1.05, 2)}),
    crane: () => ({amount: between(-150, 150), scale: between(.8, 1.3)}), track: () => ({on: pick(['red', 'blue'])}), truck: () => ({on: pick(['red', 'blue'])}),
    'speed-ramp': () => ({amount: between(0, 2.5)}), freeze: () => ({}), handheld: () => ({amount: between(2, 12), seed: Math.floor(rand() * 9)}),
  };
  // Red walks right (60 px a second), blue stays: a follow on red samples it on the picture's clock, which a speed ramp changes.
  const pair = {name: 'pair', story: {compile: () => ({hang: 1, regionsAt: t => [{box: moving(t), path: 'red', label: 'red', name: 'red'}, {box: BLUE_BOX, path: 'blue', label: 'blue', name: 'blue'}],
    draw: (c, t) => { fill(c, GROUND, [0, 0, 1600, 900]); fill(c, RED, moving(t)); fill(c, BLUE, BLUE_BOX); }})}};
  const said = async (camera, options) => {
    try { const f = await compileFilm({storyboard, timings, recipe: {story: {kit: 'pair'}, camera}, kits: [pair], ...options}); return `accepted ${JSON.stringify(f.camera.moves.map(m => m.ends ?? null).at(-1))}`; } catch (e) { return e.message; }
  };
  let refused = 0;
  for (let k = 0; k < 40; k++) {
    const at = [...new Set(Array.from({length: 2 + Math.floor(rand() * 3)}, () => beats.indexOf(pick(beats))))].sort((a, b) => a - b);
    const camera = at.map(i => { const move = pick(Object.keys(moves)); return {move, at: beats[i], seconds: between(.5, 1.5), ...moves[move]()}; });
    const [moving, calm] = [await said(camera, {}), await said(camera, {reducedMotion: true})];
    if (!moving.startsWith('accepted')) refused++;
    assert.equal(calm.startsWith('accepted'), moving.startsWith('accepted'), `recipe ${k}: ${JSON.stringify(camera)}\nmoving: ${moving}\nreduced: ${calm}`);
    if (!moving.startsWith('accepted')) assert.equal(calm, moving, `recipe ${k}: the same words`);
  }
  assert.ok(refused > 3 && refused < 37, `a mix of accepted and refused recipes (${refused} of 40 refused)`);
});

test('each version is checked with its own moves and its own clock: a speed ramp the cut film turns off does not hide what that film\'s track needs', async () => {
  const runner = {name: 'runner', story: {compile: () => { const red = t => [130 + 200 * t, 400, 330 + 200 * t, 500]; return {hang: 1,
    regionsAt: t => [{box: red(t), path: 'red', label: 'red', name: 'red'}], draw: (c, t) => { fill(c, GROUND, [0, 0, 1600, 900]); fill(c, RED, red(t)); }}; }}};
  const camera = [{move: 'track', at: 4, until: 6, on: 'red'}, {move: 'speed-ramp', at: 5.5, seconds: 2, amount: 2.5}];
  const said = async options => { try { await compileFilm({storyboard, timings, recipe: {story: {kit: 'runner'}, camera}, kits: [runner], ...options}); return 'accepted'; } catch (e) { return e.message; } };
  const [moving, calm] = [await said({}), await said({reducedMotion: true})];
  assert.match(calm, /camera\[0\] \(track\) would need the picture at ×4\.71 at 6\.00 s to keep the frame covered/, 'the cut film plays its track on the voice\'s clock');
  assert.equal(moving, calm, 'and the moving film refuses it with the same words');
});

test('a move that starts where a hold has already taken the camera past ×4 is not blamed: the hold, and the dutch that rolled it, are', async () => {
  const TOP = [700, 30, 900, 110], topKit = {name: 'top', story: {compile: () => ({hang: 1, regionsAt: () => [{box: TOP, path: 'top', label: 'top', name: 'top'}],
    draw: c => { fill(c, GROUND, [0, 0, 1600, 900]); fill(c, RED, TOP); }})}};
  await assert.rejects(compileFilm({storyboard, timings, kits: [topKit], recipe: {story: {kit: 'top'},
    focus: {strategy: 'camera', keys: [{at: ['a', 'First'], on: 'top'}, {at: ['b', 'blue'], on: 'wide'}]},
    camera: [{move: 'dolly-in', at: ['a', 'sits'], seconds: 1, on: 'top', amount: 3}, {move: 'truck', at: ['a', 'quietly'], seconds: 1, on: 'top'},
      {move: 'dutch', at: ['a', 'corner'], seconds: 1, amount: 30}, {move: 'tilt', at: ['b', 'back'], seconds: .5, amount: 20}]}}),
    /^Error: camera\[2\] \(dutch\) rolls the frame while camera\[0\] \(dolly-in\) holds on "top": at [\d.]+ s the picture would need ×5\.26 to keep the frame covered/);
});
