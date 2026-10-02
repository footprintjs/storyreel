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

/** Where the things a transition looks for are, for the ones that go through a thing: a box on each picture. */
const THING = {from: [1000, 300, 1200, 500], to: [300, 200, 700, 600]};
const boxesFor = (en, boxes = THING) => { const want = en.regions?.(en.p) ?? {}, all = (names, box) => Object.fromEntries((names ?? []).map(n => [n, box])); return {from: all(want.from, boxes.from), to: all(want.to, boxes.to)}; };
/** A transition by name, with a thing to go through when it needs one. */
const named = name => (TRANSITIONS[name].params?.region ? {type: name, region: 'thing'} : name);

/** One transition drawn alone at e, red leaving and blue arriving; returns the canvas and a pixel reader. */
function drawn(enter, e, {scale = 1, boxes} = {}) {
  const en = readEntrance(enter, 'test'), c = createCanvas(1600 * scale, 900 * scale), ctx = c.getContext('2d'), ghost = ghostPainter();
  ctx.scale(scale, scale);
  en.draw(ctx, {e, from: solid(RED), to: solid(BLUE), p: en.p, ghost: (alpha, paint) => ghost(ctx, alpha, paint), theme, boxes: boxesFor(en, boxes)});
  return {ctx, px: (x, y) => [...ctx.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data]};
}

test('the collection: every family a video editor groups by, each transition with its default length, ease and sound', () => {
  assert.deepEqual(TRANSITION_NAMES, ['cut', 'fade', 'dip', 'wipe', 'split', 'clock', 'iris', 'push', 'slide', 'whip', 'zoom', 'page', 'through', 'match']);
  assert.deepEqual([...new Set(Object.values(TRANSITIONS).map(t => t.family))], ['cut', 'dissolve', 'wipe', 'iris', 'motion', 'zoom', 'page', 'match']);
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
    const {ctx, px} = drawn(named(name), e, {scale: .25});
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
  assert.throws(() => readEntrance('dissolve', 'stage b'), /stage b: enter must be a transition: cut, fade, dip, wipe, split, clock, iris, push, slide, whip, zoom, page, through, match \(not "dissolve"\)/);
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
  bad({...curtain, draw: undefined}, /needs draw\(ctx, \{e, from, to, p, ghost, theme, boxes\}\)/);
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
  await assert.rejects(film('curtain'), /stage b: enter must be a transition: cut, fade, dip, wipe, split, clock, iris, push, slide, whip, zoom, page, through, match \(not "curtain"\)/);
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

// Through and match: transitions that go through a named thing (transitions.mjs · regions, boxes).
const WHITE = [255, 255, 255], YELLOW = [255, 255, 0];
/** A picture in one colour with a box of another where its thing is. */
const withThing = (color, box, thing) => c => { solid(color)(c); c.fillStyle = `rgb(${thing.join(',')})`; c.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]); };
function drawnWith(enter, e, {from, to, boxes = THING}) {
  const en = readEntrance(enter, 'test'), c = createCanvas(1600, 900), ctx = c.getContext('2d'), ghost = ghostPainter();
  en.draw(ctx, {e, from, to, p: en.p, ghost: (alpha, paint) => ghost(ctx, alpha, paint), theme, boxes: boxesFor(en, boxes)});
  return {hash: () => [...ctx.getImageData(0, 0, 1600, 900).data].join(), px: (x, y) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)]};
}
const plain = paint => { const c = createCanvas(1600, 900), ctx = c.getContext('2d'); paint(ctx); return [...ctx.getImageData(0, 0, 1600, 900).data].join(); };

test('through: the camera goes through a thing in the old picture, and the new picture is what was inside it', () => {
  const from = withThing(RED, THING.from, WHITE), to = solid(BLUE), at = (e, x, y) => drawnWith({type: 'through', region: 'window'}, e, {from, to}).px(x, y);
  assert.equal(drawnWith({type: 'through', region: 'window'}, 0, {from, to}).hash(), plain(from), 'its first moment: the old picture, exactly');
  assert.equal(drawnWith({type: 'through', region: 'window'}, 1, {from, to}).hash(), plain(to), 'its last: the new one, exactly');
  assert.deepEqual(at(.3, 1100, 400), BLUE, 'the new picture shows inside the opening');
  assert.deepEqual(at(.3, 100, 100), RED, 'outside it, the old picture');
  // The zoom leaves one point still (here near the window's right edge, as the window sits right of centre), so the opening grows leftward.
  assert.deepEqual(at(0, 900, 400), RED); assert.deepEqual(at(.5, 900, 400), BLUE, 'the camera zooms in: the opening grows past where it was');
  assert.throws(() => readEntrance('through', 'stage b'), /stage b: a through needs enter.region: the name of a thing in the picture/);
  assert.throws(() => readEntrance({type: 'through', region: ''}, 'stage b'), /enter.region must be the name of a thing in the picture/);
  assert.deepEqual(readEntrance({type: 'through', region: 'window'}, 'x').regions({region: 'window'}), {from: ['window']});
  // An opening about the frame's size: nothing to zoom through; it widens to the frame and still ends exactly.
  const wide = {from: [0, 300, 1600, 600], to: THING.to};
  assert.equal(drawnWith({type: 'through', region: 'band'}, 1, {from, to, boxes: wide}).hash(), plain(to));
  assert.deepEqual(drawnWith({type: 'through', region: 'band'}, .3, {from, to, boxes: wide}).px(800, 450), BLUE);
});

test('match: a thing in the old picture becomes the same thing in the new one, meeting it half way', () => {
  const from = withThing(RED, THING.from, WHITE), to = withThing(BLUE, THING.to, YELLOW), match = e => drawnWith({type: 'match', region: 'ring'}, e, {from, to});
  assert.equal(match(0).hash(), plain(from), 'its first moment: the old picture, exactly');
  assert.equal(match(1).hash(), plain(to), 'its last: the new one, exactly');
  // Half way the two things meet: between their centres, at 1.3 times the larger one's size, the old thing's white dissolves into the new one's yellow.
  const [ax, ay] = [1100, 400], [bx, by] = [500, 400], meet = match(.5).px((ax + bx) / 2, (ay + by) / 2);
  assert.ok(meet[0] > 240 && meet[1] > 240 && meet[2] > 100 && meet[2] < 160, `where they meet, both things at once (${meet})`);
  const named = readEntrance({type: 'match', region: 'ring', into: 'loop'}, 'x');
  assert.deepEqual(named.regions(named.p), {from: ['ring'], to: ['loop']}, 'into: the thing\'s name in the new picture');
  const same = readEntrance({type: 'match', region: 'ring'}, 'x');
  assert.deepEqual(same.regions(same.p), {from: ['ring'], to: ['ring']}, 'the same name in both, by default');
  assert.throws(() => readEntrance({type: 'match', into: 'loop'}, 'stage b'), /a match needs enter.region/);
});

// Worlds that name a thing: a window in the red one; a ring in the blue one that moves right 100 px a second.
const namer = (name, color, things) => ({name, story: {compile: () => ({hang: 1, spotAt: () => null, sounds: [],
  draw: c => { c.fillStyle = color; c.fillRect(0, 0, 1600, 900); }, regionsAt: t => things(t)})}});
const thingKits = [namer('red', '#ff0000', () => [{box: [1000, 300, 1200, 500], path: 'window', name: 'window'}, {box: [1700, 0, 1800, 100], path: 'gone', name: 'gone'}]),
  namer('blue', '#0000ff', t => [{box: [100 * t, 200, 100 * t + 400, 600], path: 'ring', name: 'ring'}]), world('green', '#00ff00')];
const thingFilm = (enter, more = []) => compileFilm({storyboard, timings, root, kits: [...thingKits, ...more], recipe: {story: {kit: 'red'}, stages: [
  {type: 'world', scene: 'b', enter, world: {kit: 'blue'}}, {type: 'world', scene: 'c', enter: 'cut', world: {kit: 'green'}}]}});

test('in a film: the things are found once, where the change starts and ends, and a name the picture lacks refuses', async () => {
  const seen = [];
  const spy = {family: 'test', seconds: 1, ease: 'linear', sound: null, params: {region: {name: true}, into: {name: true, default: null}},
    regions: p => ({from: [p.region], to: [p.into]}), draw(ctx, {e, from, to, boxes}) { seen.push(boxes); (e < .5 ? from : to)(ctx); }};
  const f = await thingFilm({type: 'spy', region: 'window', into: 'ring'}, [{name: 'spies', transitions: {spy}}]), b = f.clock.start('b'), t0 = b - .75, t1 = t0 + 1;
  pixel(f, t0 + .5, 800, 450);
  assert.deepEqual(seen.at(-1).from, {window: [1000, 300, 1200, 500]}, 'the old picture\'s thing, where the change starts');
  assert.ok(Math.abs(seen.at(-1).to.ring[0] - 100 * t1) < 1e-6, 'the new picture\'s thing, where the change ends (it moves; the box is its last place)');
  pixel(f, t0 + .1, 800, 450);
  assert.deepEqual(seen.at(-1), seen.at(-2), 'the same boxes at every moment of the change: a frame is a pure function of time');
  const through = await thingFilm({type: 'through', region: 'window'});
  assert.deepEqual(pixel(through, t0 + .3 * 1.2, 1100, 400), BLUE, 'through the red world\'s window into the blue one');
  assert.deepEqual(pixel(through, t0 + .05, 100, 100), RED);
  await assert.rejects(thingFilm({type: 'through', region: 'door'}), /stage b: the through looks for "door" in the picture it leaves, and nothing in the picture is called "door" at [\d.]+ s; the names there are window, gone/);
  await assert.rejects(thingFilm({type: 'match', region: 'window'}), /stage b: the match looks for "window" in the picture it arrives at, and nothing in the picture is called "window"/);
  await assert.rejects(thingFilm({type: 'through', region: 'gone'}), /stage b: the through goes through "gone" in the picture it leaves, which is not on the frame at [\d.]+ s \(its box is \[1700, 0, 1800, 100\]\)/);
  assert.ok((await thingFilm({type: 'match', region: 'window', into: 'ring'})).total > 0);
  const liar = {...spy, regions: () => ({from: 'window'})};
  await assert.rejects(thingFilm({type: 'liar', region: 'window'}, [{name: 'liars', transitions: {liar}}]), /the liar's regions\(p\) must return \{from\?: \[names\], to\?: \[names\]\}/);
  assert.throws(() => transitionCatalog([{name: 'k', transitions: {spy: {...spy, regions: ['window']}}}]), /regions must be p => \(\{from\?: \[names\], to\?: \[names\]\}\)/);
  assert.throws(() => transitionCatalog([{name: 'k', transitions: {spy: {...spy, params: {region: {name: true, default: 3}}}}}]), /enter.region must be the name of a thing in the picture/);
});

test('the built-in kits name what they draw: a whiteboard item by its `name`, the cartoon\'s scenery as its camera shows it', async () => {
  const {compileExample} = await import('./golden.mjs');
  const shepherd = await compileExample('shepherd'), names = t => shepherd.regionsAt(t).filter(r => r.name).map(r => r.name);
  assert.deepEqual(names(1), ['sun', 'shepherd', 'sack', 'pen', 'gate'], 'the scenery, before the eureka');
  const eureka = shepherd.beats.find(b => b.path === 'story.eureka.at').t;
  assert.ok(names(eureka + .5).includes('bulb'), 'the eureka\'s bulb, once it shows');
  const sky = shepherd.regionsAt(1).find(r => r.name === 'sun'), dusk = shepherd.regionsAt(shepherd.total - .1).find(r => r.name === 'sun');
  assert.ok(dusk.box[1] > sky.box[1], 'the sun sets: lower by evening');
  const board = {title: 'B', scenes: [{id: 'a', narration: 'Here is a circle on the board, and here is a line.'}]};
  const film = await compileFilm({storyboard: board, timings: evenTimings(board), recipe: {story: {kit: 'whiteboard', items: [
    {at: ['a', 'Here is a circle'], dur: .8, draw: [['ellipse', 800, 400, 60, 60]], name: 'circle'}, {at: ['a', 'here is a line'], dur: .6, draw: [['line', 600, 600, 1000, 600]]}]}}});
  assert.deepEqual(film.regionsAt(film.total - .1).filter(r => r.name).map(r => r.name), ['circle']);
  await assert.rejects(compileFilm({storyboard: board, timings: evenTimings(board), recipe: {story: {kit: 'whiteboard', items: [{at: ['a', 'Here is a circle'], dur: .8, draw: [['ellipse', 800, 400, 60, 60]], name: 'a circle'}]}}}), /name is one word for the thing it draws/);
});

test('through a round opening: it stays inside the new picture as it widens, and ends on it exactly', () => {
  const from = withThing(RED, [700, 350, 820, 470], WHITE), to = solid(BLUE), go = e => drawnWith({type: 'through', region: 'bulb', shape: 'round'}, e, {from, to, boxes: {from: [700, 350, 820, 470], to: [0, 0, 1, 1]}});
  assert.equal(go(1).hash(), plain(to));
  for (const e of [.6, .75, .9]) {
    const frame = go(e);
    // Whatever shows inside the new picture is the new picture: red (the old one) only outside it, never a gap of it inside.
    assert.deepEqual(frame.px(760, 410), BLUE, `the middle of the opening at ${e}`);
  }
  // Early, a round opening leaves its box's corners to the old picture: find the corner of the box-shaped opening at the same moment.
  const boxed = drawnWith({type: 'through', region: 'bulb'}, .3, {from, to, boxes: {from: [700, 350, 820, 470], to: [0, 0, 1, 1]}});
  let corner = null;
  for (let y = 0; y < 900 && !corner; y += 2) for (let x = 0; x < 1600; x += 2) if (boxed.px(x, y)[2] > 200 && boxed.px(x, y)[0] < 50) { corner = [x + 2, y + 2]; break; }
  assert.ok(corner, 'the box-shaped opening shows the new picture');
  assert.deepEqual(boxed.px(...corner), BLUE); assert.deepEqual(go(.3).px(...corner), WHITE, 'the round one leaves that corner to the old picture (there, the thing itself)');
});

test('match meets a thing half off the frame by the half you see; a named setting must be looked up', async () => {
  // The old thing's centre is off the left edge: they still meet, half way between what shows of each.
  const from = withThing(RED, [-60, 400, 60, 500], WHITE), to = withThing(BLUE, [700, 400, 820, 500], YELLOW);
  const mid = drawnWith({type: 'match', region: 'ring'}, .5, {from, to, boxes: {from: [-60, 400, 60, 500], to: [700, 400, 820, 500]}});
  const meet = mid.px(390, 450);
  assert.ok(meet[0] > 200 && meet[1] > 200, `both things at the meeting point (${meet})`);
  const lookless = {family: 'x', seconds: 1, ease: 'linear', sound: null, params: {region: {name: true}}, draw: (ctx, {from: f}) => f(ctx)};
  assert.throws(() => transitionCatalog([{name: 'k', transitions: {lookless}}]), /a setting that names a thing in the picture, and no regions\(p\) to look it up/);
  const forgets = {...lookless, params: {region: {name: true}, also: {name: true, default: null}}, regions: p => ({from: [p.region]})};
  await assert.rejects(thingFilm({type: 'forgets', region: 'window', also: 'door'}, [{name: 'k', transitions: {forgets}}]), /the forgets's also names "door", which its regions\(p\) does not look for/);
  const nothing = {...lookless, regions: () => undefined};
  await assert.rejects(thingFilm({type: 'nothing', region: 'window'}, [{name: 'k', transitions: {nothing}}]), /regions\(p\) must return \{from\?: \[names\], to\?: \[names\]\}/);
});
