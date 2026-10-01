import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings, loadTheme} from '../src/index.mjs';
import {TRANSITIONS, TRANSITION_NAMES, readEntrance, transitionCatalog, ghostPainter, CUT} from '../src/transitions.mjs';
import {transitionSheet} from '../src/sheet.mjs';

const RED = [255, 0, 0], BLUE = [0, 0, 255];
const solid = ([r, g, b]) => c => { c.fillStyle = `rgb(${r},${g},${b})`; c.fillRect(0, 0, 1600, 900); };
const theme = loadTheme('paper');
const near = (got, want, tol = 12) => want.every((v, i) => Math.abs(got[i] - v) <= tol);

/** One transition drawn alone at e, red leaving and blue arriving; returns the canvas and a pixel reader. */
function drawn(enter, e, {scale = 1} = {}) {
  const en = readEntrance(enter, 'test'), c = createCanvas(1600 * scale, 900 * scale), ctx = c.getContext('2d'), ghost = ghostPainter();
  ctx.scale(scale, scale);
  en.draw(ctx, {e, from: solid(RED), to: solid(BLUE), p: en.p, ghost: (alpha, paint) => ghost(ctx, alpha, paint), theme});
  return {ctx, px: (x, y) => [...ctx.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data]};
}

test('the collection: every family a video editor groups by, each transition with its default length, ease and sound', () => {
  assert.deepEqual(TRANSITION_NAMES, ['cut', 'fade', 'dip', 'wipe', 'split', 'clock', 'iris', 'push', 'slide', 'whip', 'zoom', 'page']);
  assert.deepEqual([...new Set(Object.values(TRANSITIONS).map(t => t.family))], ['cut', 'dissolve', 'wipe', 'iris', 'motion', 'zoom', 'page']);
  // The five that shipped first keep their lengths and sounds (the pixel pins hold their pictures).
  for (const [name, seconds, sound] of [['fade', .8, null], ['wipe', .8, 'slide'], ['iris', .8, 'slide'], ['page', 1.1, 'slide']]) {
    const en = readEntrance(name, 'test');
    assert.equal(en.seconds, seconds); assert.equal(en.sound, sound); assert.equal(en.lead, seconds * .75, 'most of the change before the first word');
  }
  assert.equal(readEntrance(undefined, 'test').type, 'fade', 'no enter: a fade');
  assert.equal(readEntrance('cut', 'test'), CUT);
  assert.ok(Object.isFrozen(TRANSITIONS) && Object.isFrozen(TRANSITIONS.push) && Object.isFrozen(TRANSITIONS.push.params.from.oneOf));
});

test('every transition covers the whole frame at every moment and leaves the canvas as it found it', () => {
  for (const name of TRANSITION_NAMES.filter(n => n !== 'cut')) for (const e of [0, .03, .3, .5, .7, .97, 1]) {
    const {ctx, px} = drawn(name, e, {scale: .25});
    for (const [x, y] of [[2, 2], [1597, 2], [2, 897], [1597, 897], [800, 450], [400, 225], [1200, 675]]) assert.equal(px(x, y)[3], 255, `${name} at ${e}: (${x}, ${y}) is covered`);
    const m = ctx.getTransform();
    assert.ok(m.a === .25 && m.d === .25 && m.e === 0 && m.f === 0 && ctx.globalAlpha === 1, `${name} at ${e} restores the canvas`);
  }
  // A push seams its two pictures with no gap: every pixel down the join is opaque and one of the two colours.
  for (const e of [.13, .5, .77]) {
    const {px} = drawn('push', e), seam = 1600 * (1 - e);
    for (const x of [Math.floor(seam) - 1, Math.floor(seam), Math.ceil(seam)]) { const p = px(x, 450); assert.equal(p[3], 255); assert.equal(p[1], 0, `the join at ${x} is red, blue or between (${p})`); }
  }
});

test('the shapes: each transition shows the new picture where it should, half way', () => {
  const at = (enter, e, x, y) => drawn(enter, e).px(x, y).slice(0, 3);
  // push: both pictures move; from the right the new one arrives on the right and the old leaves left.
  assert.deepEqual(at('push', .5, 400, 450), RED); assert.deepEqual(at('push', .5, 1200, 450), BLUE);
  assert.deepEqual(at({type: 'push', from: 'left'}, .5, 400, 450), BLUE); assert.deepEqual(at({type: 'push', from: 'left'}, .5, 1200, 450), RED);
  assert.deepEqual(at({type: 'push', from: 'top'}, .5, 800, 200), BLUE); assert.deepEqual(at({type: 'push', from: 'bottom'}, .5, 800, 200), RED);
  // slide: the old picture stays put, in the shadow of the new one's leading edge.
  assert.deepEqual(at('slide', .5, 400, 450), RED); assert.deepEqual(at('slide', .5, 1200, 450), BLUE);
  const shaded = at('slide', .5, 790, 450); assert.ok(shaded[0] < 230 && shaded[1] < 20 && shaded[2] < 20, `the shadow falls on the old picture (${shaded})`);
  // wipe from each side.
  assert.deepEqual(at('wipe', .25, 200, 450), BLUE); assert.deepEqual(at('wipe', .25, 1400, 450), RED);
  assert.deepEqual(at({type: 'wipe', from: 'right'}, .25, 1500, 450), BLUE); assert.deepEqual(at({type: 'wipe', from: 'right'}, .25, 600, 450), RED);
  assert.deepEqual(at({type: 'wipe', from: 'top'}, .5, 800, 200), BLUE); assert.deepEqual(at({type: 'wipe', from: 'top'}, .5, 800, 700), RED);
  assert.deepEqual(at({type: 'wipe', from: 'bottom'}, .5, 800, 700), BLUE);
  // split opens from the middle line.
  assert.deepEqual(at('split', .5, 800, 450), BLUE); assert.deepEqual(at('split', .5, 100, 450), RED); assert.deepEqual(at('split', .5, 1500, 450), RED);
  assert.deepEqual(at({type: 'split', line: 'horizontal'}, .5, 800, 450), BLUE); assert.deepEqual(at({type: 'split', line: 'horizontal'}, .5, 800, 40), RED);
  // clock: a quarter turn from twelve o'clock has uncovered the top right.
  assert.deepEqual(at('clock', .25, 1150, 150), BLUE); assert.deepEqual(at('clock', .25, 400, 700), RED);
  // iris from its centre.
  assert.deepEqual(at({type: 'iris', at: [400, 300]}, .3, 400, 300), BLUE); assert.deepEqual(at({type: 'iris', at: [400, 300]}, .3, 1590, 890), RED);
  // dip: through black by the middle; never both pictures at once.
  assert.ok(near(at('dip', .25, 800, 450), [128, 0, 0]), 'the old picture going dark');
  assert.ok(near(at('dip', .5, 800, 450), [0, 0, 0]));
  assert.ok(near(at('dip', .75, 800, 450), [0, 0, 128]), 'the new one coming up');
  assert.ok(near(at({type: 'dip', color: '#ffffff'}, .5, 800, 450), [255, 255, 255]), 'a dip to white');
  // zoom: the old picture, whole at the start; the new one, whole at the end; between, both.
  assert.deepEqual(at('zoom', 0, 800, 450), RED); assert.deepEqual(at('zoom', 1, 800, 450), BLUE);
  const mid = at('zoom', .5, 800, 450); assert.ok(mid[0] > 60 && mid[2] > 60, `half way, both (${mid})`);
  // fade.
  const half = at('fade', .5, 800, 450); assert.ok(near(half, [128, 0, 127], 3), `half way, half each (${half})`);
  // whip: a push that smears along its move, widest in the middle; far from the join, one picture.
  assert.deepEqual(at('whip', .5, 200, 450), RED); assert.deepEqual(at('whip', .5, 1450, 450), BLUE);
  const smear = at('whip', .5, 760, 450); assert.ok(smear[0] > 30 && smear[2] > 30, `at the join, a streak of both (${smear})`);
  assert.deepEqual(drawn('whip', 0).px(800, 450).slice(0, 3), RED, 'still at its start: no smear');
});

test('settings and refusals: each refusal names what the transition takes', () => {
  assert.throws(() => readEntrance('dissolve', 'stage b'), /stage b: enter must be a transition: cut, fade, dip, wipe, split, clock, iris, push, slide, whip, zoom, page \(not "dissolve"\)/);
  assert.throws(() => readEntrance({type: 'push', at: [1, 2]}, 'stage b'), /enter has unsupported key at \(a push takes seconds, ease, sound, from\)/);
  assert.throws(() => readEntrance({type: 'fade', at: [800, 450]}, 'stage b'), /enter has unsupported key at \(a fade takes seconds, ease, sound\)/);
  assert.throws(() => readEntrance({type: 'push', from: 'north'}, 'stage b'), /enter.from must be left, right, top, bottom/);
  assert.throws(() => readEntrance({type: 'dip', color: 'black'}, 'stage b'), /enter.color must be a hex colour/);
  assert.throws(() => readEntrance({type: 'iris', at: [800]}, 'stage b'), /enter.at must be \[x, y\]/);
  assert.throws(() => readEntrance({type: 'wipe', seconds: 5}, 'stage b'), /enter.seconds must be between 0.2 and 3/);
  assert.throws(() => readEntrance({type: 'wipe', ease: 'bouncy'}, 'stage b'), /"bouncy" is not an ease/);
  assert.throws(() => readEntrance({type: 'push', ease: 'back'}, 'stage b'), /a push cannot take the ease "back" \(it goes past the end, and the frame's edge would show\); slide can/);
  assert.equal(readEntrance({type: 'slide', ease: 'spring'}, 'stage b').type, 'slide', 'a slide may overshoot and settle');
  assert.throws(() => readEntrance({type: 'wipe', sound: 'boom'}, 'stage b'), /enter.sound must be false or a sound: slide, settle, tap, question, chime, door, step, click, whoosh, crumble \(not "boom"\)/);
  assert.equal(readEntrance({type: 'wipe', sound: false}, 'stage b').sound, null);
  assert.equal(readEntrance({type: 'fade', sound: 'chime'}, 'stage b').sound, 'chime');
  assert.throws(() => readEntrance({type: 'cut', seconds: 1}, 'stage b'), /a cut takes no seconds and no centre/);
  assert.throws(() => readEntrance(['wipe'], 'stage b'), /enter must be a transition/);
  assert.deepEqual(readEntrance({type: 'wipe', from: 'top', seconds: .5}, 'x').p, {from: 'top'});
});

// A kit's own transition, written to the same contract as the built-in ones.
const curtain = {family: 'theatre', seconds: 1.2, ease: 'inOut', sound: 'whoosh', params: {color: {color: true, default: '#7a1020'}},
  draw(ctx, {e, from, to, p}) {
    (e < .5 ? from : to)(ctx);
    const closed = 1 - Math.abs(1 - 2 * e);
    ctx.save(); ctx.fillStyle = p.color; ctx.fillRect(0, 0, 800 * closed, 900); ctx.fillRect(1600 - 800 * closed, 0, 800 * closed, 900); ctx.restore();
  }};

test('a kit adds its own transitions, checked like the built-in ones; names never clash', () => {
  const catalog = transitionCatalog([{name: 'stage', transitions: {curtain}}]);
  assert.deepEqual(Object.keys(catalog), [...TRANSITION_NAMES, 'curtain']);
  const en = readEntrance({type: 'curtain', color: '#000000'}, 'x', catalog);
  assert.equal(en.seconds, 1.2); assert.equal(en.sound, 'whoosh'); assert.deepEqual(en.p, {color: '#000000'});
  assert.throws(() => readEntrance('curtain', 'x'), /enter must be a transition/, 'only the film whose kits bring it knows it');
  const bad = (def, re, name = 'curtain') => assert.throws(() => transitionCatalog([{name: 'stage', transitions: {[name]: def}}]), re);
  bad(curtain, /has a built-in transition's name/, 'wipe');
  assert.throws(() => transitionCatalog([{name: 'a', transitions: {curtain}}, {name: 'b', transitions: {curtain}}]), /the kit "a" already has a transition named "curtain"/);
  bad(curtain, /one word in camelCase/, 'Big-Curtain');
  bad({...curtain, draw: undefined}, /needs draw\(ctx, \{e, from, to, p, ghost, theme\}\)/);
  bad({...curtain, colour: 1}, /has unsupported key colour/);
  bad({...curtain, family: ''}, /needs a family/);
  bad({...curtain, seconds: 9}, /seconds must be between 0.2 and 3/);
  bad({...curtain, ease: 'wobble'}, /"wobble" is not an ease/);
  bad({...curtain, sound: 'boom'}, /sound must be null or a sound/);
  bad({...curtain, params: {seconds: {number: [0, 1], default: .5}}}, /may not be called "seconds"/);
  bad({...curtain, params: {color: {color: true}}}, /must be one of \{oneOf/);
  bad({...curtain, params: {color: {color: true, default: 'red'}}}, /enter.color must be a hex colour/);
  bad({...curtain, params: {k: {number: [1, 0], default: .5}}}, /gives number as \[min, max\]/);
  assert.throws(() => transitionCatalog([{name: 'stage', transitions: [curtain]}]), /transitions that are not \{name: transition\}/);
});

// The films: a red story, a blue world entering with a transition, a third world after it.
const storyboard = {title: 'T', scenes: [
  {id: 'a', narration: 'This is the first world, all in red.'},
  {id: 'b', narration: 'Now the second world arrives, all in blue.'},
  {id: 'c', narration: 'And a third world comes after it.'},
]};
const world = (name, color) => ({name, story: {compile: () => ({hang: 1, spotAt: () => null, sounds: [], draw: c => { c.fillStyle = color; c.fillRect(0, 0, 1600, 900); }})}});
const kits = [world('red', '#ff0000'), world('blue', '#0000ff'), world('green', '#00ff00')];
const timings = evenTimings(storyboard), root = fileURLToPath(new URL('../examples/worlds/', import.meta.url));
const film = (enter, more = []) => compileFilm({storyboard, timings, root, kits: [...kits, ...more], recipe: {story: {kit: 'red'}, stages: [
  {type: 'world', scene: 'b', enter, world: {kit: 'blue'}}, {type: 'world', scene: 'c', enter: 'cut', world: {kit: 'green'}}]}});
const pixel = (f, t, x, y) => { const c = createCanvas(1600, 900), ctx = c.getContext('2d'); f.frame(ctx, t); return [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)]; };

test('in a film: a shot enters with any transition, on the film clock, with its sound', async () => {
  const push = await film({type: 'push', from: 'left', seconds: .8}), b = push.clock.start('b'), half = b - .6 + .4;
  assert.deepEqual(pixel(push, half, 400, 450), BLUE, 'from the left: the new world on the left');
  assert.deepEqual(pixel(push, half, 1200, 450), RED);
  assert.deepEqual(pixel(push, b + .21, 800, 450), BLUE, 'done before the first word, like every entrance');
  assert.ok(push.sounds.some(s => s.type === 'slide' && Math.abs(s.time - (b - .6)) < 1e-9), 'a push is heard where it starts');
  const whip = await film('whip');
  assert.ok(whip.sounds.some(s => s.type === 'whoosh'), 'a whip whooshes');
  const quiet = await film({type: 'whip', sound: false}), dip = await film('dip');
  for (const f of [quiet, dip]) assert.ok(!f.sounds.some(s => s.type === 'whoosh' || s.type === 'slide'), 'sound: false, and a dip, are silent');
  await assert.rejects(film({type: 'push', ease: 'back'}), /stage b: a push cannot take the ease "back"/);
});

test('in a film: a kit\'s transition is named like a built-in one', async () => {
  const f = await film({type: 'curtain', seconds: 1}, [{name: 'stage', transitions: {curtain}}]), b = f.clock.start('b');
  assert.deepEqual(pixel(f, b - .75 + .5, 100, 450), [0x7a, 0x10, 0x20], 'the curtain closed half way through');
  assert.deepEqual(pixel(f, b + .3, 800, 450), BLUE);
  assert.ok(f.sounds.some(s => s.type === 'whoosh' && Math.abs(s.time - (b - .75)) < 1e-9));
  await assert.rejects(film('curtain'), /stage b: enter must be a transition: cut, fade, dip, wipe, split, clock, iris, push, slide, whip, zoom, page \(not "curtain"\)/);
});

test('the transitions sheet: a row per transition, a still per moment, as a PNG', async () => {
  const png = await transitionSheet({width: 900});
  assert.deepEqual([...png.subarray(1, 4)].map(b => String.fromCharCode(b)).join(''), 'PNG');
  const height = png.readUInt32BE(20), width = png.readUInt32BE(16);
  const cell = Math.round(Math.floor((900 - 170 - 10 * 5) / 4) * 9 / 16);
  assert.equal(width, 900); assert.equal(height, 10 + (TRANSITION_NAMES.length - 1) * (cell + 10), 'every transition but the cut');
  const withKit = await transitionSheet({width: 900, catalog: transitionCatalog([{name: 'stage', transitions: {curtain}}])});
  assert.equal(withKit.readUInt32BE(20), height + cell + 10, 'a kit\'s transitions show too');
});
