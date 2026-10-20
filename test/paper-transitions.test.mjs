// The paper transitions (src/paper-transitions.mjs): eight built-in entries of the one collection. Each starts on the
// leaving picture and ends on the arriving one exactly, is the same pixels for the same moment (seeded, never
// Math.random), refuses a bad setting naming what it takes, draws its paper and ink in the theme's colours, and is
// listed in the catalog and in the README's table with what it means.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings, loadTheme, validateTheme} from '../src/index.mjs';
import {TRANSITIONS, TRANSITION_NAMES, readEntrance, transitionCatalog, ghostPainter} from '../src/transitions.mjs';
import {PAPER_TRANSITIONS, seeded, paperTokens} from '../src/transitions/paper/index.mjs';

const PAPER = Object.keys(PAPER_TRANSITIONS);
const RED = [255, 0, 0], BLUE = [0, 0, 255];
const solid = ([r, g, b]) => c => { c.fillStyle = `rgb(${r},${g},${b})`; c.fillRect(0, 0, 1600, 900); };
const paper = loadTheme('paper');
const S = .5;   // drawn at half size: 800 × 450

/** One transition drawn alone at e, red leaving and blue arriving: its pixels, and a reader at frame coordinates. */
function drawn(enter, e, {theme = paper, boxes = {from: {}, to: {}}, from = solid(RED)} = {}) {
  const en = readEntrance(enter, 'test'), c = createCanvas(1600 * S, 900 * S), ctx = c.getContext('2d'), ghost = ghostPainter();
  ctx.scale(S, S);
  en.draw(ctx, {e, from, to: solid(BLUE), p: en.p, ghost: (alpha, paint) => ghost(ctx, alpha, paint), theme, boxes});
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  return {ctx, data, px: (x, y) => { const i = (Math.round(y * S) * c.width + Math.round(x * S)) * 4; return [data[i], data[i + 1], data[i + 2]]; }};
}
/** The share of pixels within `tol` of a colour. */
const share = (data, rgb, tol = 10) => { let n = 0; for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i] - rgb[0]) <= tol && Math.abs(data[i + 1] - rgb[1]) <= tol && Math.abs(data[i + 2] - rgb[2]) <= tol) n++; return n / (data.length / 4); };
const near = (got, want, tol = 12) => want.every((v, i) => Math.abs(got[i] - v) <= tol);
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

test('the eight are in the catalog, each in its family, with the defaults a recipe gets by name', () => {
  assert.deepEqual(PAPER, ['torn', 'eraser', 'inkBleed', 'ringIris', 'glassSheet', 'curl', 'fold', 'morph']);
  const catalog = transitionCatalog([]);
  for (const name of PAPER) {
    assert.ok(TRANSITION_NAMES.includes(name) && Object.hasOwn(catalog, name), `${name} is a built-in transition`);
    assert.equal(TRANSITIONS[name], PAPER_TRANSITIONS[name], `${name}: one definition, in paper-transitions.mjs`);
    assert.ok(Object.isFrozen(TRANSITIONS[name].params), `${name} is frozen like the rest`);
    const en = readEntrance(name, 'test');
    assert.equal(en.type, name); assert.equal(en.seconds, TRANSITIONS[name].seconds); assert.equal(en.lead, en.seconds * .75);
  }
  assert.deepEqual(Object.fromEntries(PAPER.map(n => [n, TRANSITIONS[n].family])),
    {torn: 'wipe', eraser: 'wipe', inkBleed: 'iris', ringIris: 'iris', glassSheet: 'motion', curl: 'page', fold: 'page', morph: 'match'});
  assert.deepEqual(readEntrance('torn', 'x').p, {direction: 'left', tear: .5, seed: 5});
  assert.deepEqual(readEntrance('inkBleed', 'x').p, {at: [220, 760], color: null, seed: 7}, 'a colour left at null is the theme\'s');
  assert.deepEqual(readEntrance({type: 'ringIris', at: [1060, 400], radius: 120, color: '#c26a12'}, 'x').p, {at: [1060, 400], radius: 120, width: 26, color: '#c26a12', accent: null});
  assert.throws(() => transitionCatalog([{name: 'k', transitions: {torn: TRANSITIONS.fade}}]), /has a built-in transition's name/, 'a kit that still brings its own torn must drop it');
});

test('each starts on the leaving picture and ends on the arriving one, exactly, and gets there without a jump', () => {
  const plainOf = color => { const c = createCanvas(1600 * S, 900 * S), x = c.getContext('2d'); x.scale(S, S); solid(color)(x); return x.getImageData(0, 0, c.width, c.height).data; };
  const red = plainOf(RED), blue = plainOf(BLUE);
  // Every transition at its defaults, and again with each setting that changes where it goes.
  const entrances = [...PAPER, {type: 'torn', direction: 'right'}, {type: 'torn', direction: 'top', tear: .3}, {type: 'torn', direction: 'bottom', tear: .8},
    {type: 'eraser', from: 'right'}, {type: 'inkBleed', at: [1500, 100]}, {type: 'ringIris', at: [1400, 200], radius: 120, width: 80},
    {type: 'glassSheet', from: 'top'}, {type: 'glassSheet', from: 'bottom'}, {type: 'glassSheet', from: 'left'},
    ...['bottom-left', 'top-right', 'top-left'].map(corner => ({type: 'curl', corner})), {type: 'fold', line: 'vertical'}, {type: 'morph', fromBox: [0, 0, 1600, 900], toBox: [700, 400, 900, 500]}];
  for (const enter of entrances) {
    const name = JSON.stringify(enter);
    assert.deepEqual(drawn(enter, 0).data, red, `${name} at e = 0 is the leaving picture`);
    assert.deepEqual(drawn(enter, 1).data, blue, `${name} at e = 1 is the arriving picture`);
    // The shapes start and end off the frame: a hair from either end, the frame is (almost) that picture already.
    assert.ok(share(drawn(enter, .005).data, RED) > .99, `${name} a hair after the start is still the leaving picture`);
    assert.ok(share(drawn(enter, .995).data, BLUE) > .99, `${name} a hair before the end is already the arriving one`);
    // The draw is wrapped (index.mjs · landed): whatever it sets on the canvas is put back.
    const {ctx} = drawn(enter, .5), m = ctx.getTransform();
    assert.ok(m.a === S && m.d === S && m.e === 0 && ctx.globalAlpha === 1, `${name} leaves the canvas as it found it`);
  }
});

test('a frame is a pure function of the moment: the same pixels twice, nothing from Math.random, a seed for the ragged ones', () => {
  const random = Math.random;
  Math.random = () => { throw new Error('a transition drew from Math.random'); };
  try {
    for (const name of PAPER) for (const e of [.3, .62]) assert.deepEqual(drawn(name, e).data, drawn(name, e).data, `${name} at ${e}: the same frame, the same pixels`);
  } finally { Math.random = random; }
  // The torn edge and the ink blot are shapes from their seed: another seed, another edge; the same seed, the same one.
  for (const name of ['torn', 'inkBleed']) {   // (mid-tear for torn: once torn through, its edge is off the sheet)
    assert.notDeepEqual(drawn({type: name, seed: 1}, .25).data, drawn({type: name, seed: 2}, .25).data, `${name}: the seed shapes the edge`);
    assert.deepEqual(drawn({type: name, seed: 41}, .25).data, drawn({type: name, seed: 41}, .25).data);
  }
  const a = seeded(7), b = seeded(7), c = seeded(7.5), first = [a(), a(), a()];
  assert.deepEqual(first, [b(), b(), b()]); assert.notDeepEqual(first, [c(), c(), c()], 'the fraction counts too');
  assert.ok(first.every(v => v >= 0 && v < 1));
});

test('the shapes, part way: where each one shows the new picture', () => {
  const at = (enter, e, x, y) => drawn(enter, e).px(x, y);
  // torn (its own test below): dragged left, the new picture is uncovered on the right first; dragged right, mirrored.
  assert.deepEqual(at('torn', .75, 200, 450), RED); assert.deepEqual(at('torn', .75, 1450, 450), BLUE);
  assert.deepEqual(at({type: 'torn', direction: 'right'}, .75, 200, 450), BLUE); assert.deepEqual(at({type: 'torn', direction: 'right'}, .75, 1450, 450), RED);
  // eraser: what it has passed is wiped; ahead of it, the old picture.
  assert.deepEqual(at('eraser', .5, 150, 100), BLUE); assert.deepEqual(at('eraser', .5, 1500, 100), RED);
  assert.deepEqual(at({type: 'eraser', from: 'right'}, .5, 1500, 100), BLUE);
  // inkBleed: the new picture rises where the ink began; far from it, still the old one, or ink.
  assert.deepEqual(at('inkBleed', .6, 220, 760), BLUE); assert.deepEqual(at({type: 'inkBleed', at: [1400, 200]}, .6, 1400, 200), BLUE);
  assert.ok(share(drawn('inkBleed', .5).data, hex(paper.palette.ink), 2) > .1, 'the ink, between');
  // ringIris: inside the ring, the new picture; outside, the old.
  assert.deepEqual(at({type: 'ringIris', at: [400, 300]}, .3, 400, 300), BLUE); assert.deepEqual(at({type: 'ringIris', at: [400, 300]}, .3, 1590, 890), RED);
  // glassSheet: the sheet comes in from its side over the old picture, which has stepped back.
  assert.deepEqual(at('glassSheet', .5, 1500, 450).map(v => v > 128), [false, false, true], 'the new picture under the glass, on the right');
  assert.ok(at('glassSheet', .5, 300, 450)[0] > 150, 'the old picture still on the left');
  // curl: the corner lifted first: the new picture there, the old page across from it.
  assert.deepEqual(at('curl', .3, 1580, 880), BLUE); assert.deepEqual(at('curl', .3, 20, 20), RED);
  assert.ok(near(at('curl', .5, 20, 20), hex(paper.palette.panel)), 'half way, the flap folded back over the old page shows the paper\'s back');
  assert.deepEqual(at({type: 'curl', corner: 'top-left'}, .3, 20, 20), BLUE);
  // fold: the halves fold toward the crease, the ground showing where they were; then the new one opens.
  assert.ok(near(at('fold', .3, 800, 20), hex(paper.palette.bg)), 'folding: the ground at the top edge');
  assert.ok(at('fold', .3, 800, 440)[0] > 100, 'the old picture at the crease');
  assert.ok(near(at({type: 'fold', line: 'vertical'}, .3, 20, 450), hex(paper.palette.bg)), 'a vertical crease folds the sides in');
  assert.deepEqual(at('fold', .9, 800, 300), BLUE, 'popped open, off the fading crease');
  // morph: the outline travels from its start box to its end box, in the theme's accent.
  assert.ok(near(at({type: 'morph', fromBox: [100, 100, 300, 300], toBox: [100, 100, 300, 300]}, .5, 100, 200), hex(paper.palette.accent), 30), 'the outline, on its box');
});

test('torn: the tear runs across showing the new picture along it, then the torn piece carries the old picture off', () => {
  // The old picture is red with a white mark on it; the new one, blue.
  const MARK = [1150, 380, 1250, 480], marked = c => { solid(RED)(c); c.fillStyle = '#ffffff'; c.fillRect(MARK[0], MARK[1], MARK[2] - MARK[0], MARK[3] - MARK[1]); };
  /** Where the mark is in a frame: how many of its pixels (frame units²), and their centre. */
  const markIn = data => {
    let n = 0, x = 0, y = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) { n++; x += (i / 4) % (1600 * S); y += Math.floor(i / 4 / (1600 * S)); }
    return {area: n / S / S, x: x / n / S, y: y / n / S};
  };
  // Half way through the tear (tear: .5, so e = .25): a gap along the tear shows the new picture, the old on both sides,
  // and the sheet beyond the tear (the mark) still in place.
  const home = markIn(drawn('torn', 0, {from: marked}).data), tearing = drawn('torn', .25, {from: marked}), row = Array.from({length: 1600}, (_, x) => tearing.px(x, 450));
  const gap = row.filter(c => near(c, BLUE, 40)).length;
  assert.ok(gap > 20 && gap < 200, `a gap of the new picture along the tear (${gap} frame units of the row)`);
  assert.deepEqual(row[60], RED); assert.deepEqual(row[1550], RED);
  assert.equal(home.area, 10000);
  assert.deepEqual(markIn(tearing.data), home, 'beyond the tear, the sheet lies in place');
  // Half way through the drag (e = .75): the mark rides the torn piece, whole and unfaded, well off its place toward the drag.
  const dragging = markIn(drawn('torn', .75, {from: marked}).data);
  assert.ok(dragging.area > 9000, `the mark is carried whole and opaque, never faded (${dragging.area.toFixed(0)} of 10000 units pure white)`);
  assert.ok(dragging.x < 1200 - 300, `the mark has moved left with the piece (its centre at x ${dragging.x.toFixed(0)}, from 1200)`);
  assert.deepEqual(drawn('torn', .75, {from: marked}).px(1200, 430), BLUE, 'where the mark was, the new picture');
  // Dragged up instead: the mark goes up.
  const up = markIn(drawn({type: 'torn', direction: 'top'}, .6, {from: marked}).data);
  assert.ok(up.area > 9000 && up.y < 430 - 100, `dragged toward the top, the mark rises (its centre at y ${up.y.toFixed(0)}, from 430)`);
  // The timing split: a short tear (tear: .2) is already dragging at e = .5; a long one (tear: .8) is still tearing.
  assert.ok(markIn(drawn({type: 'torn', tear: .2}, .5, {from: marked}).data).x < 1100, 'a short tear: dragging by half way');
  assert.deepEqual(markIn(drawn({type: 'torn', tear: .8}, .5, {from: marked}).data), home, 'a long tear: still tearing, the mark in place');
});

test('paper and ink are the theme\'s; a colour setting at null is the theme\'s own, and a recipe may name one', () => {
  const green = validateTheme({...structuredClone(paper), palette: {...paper.palette, bg: '#00ff00', ink: '#ff00ff', accent: '#00ffff'}});
  assert.ok(near(drawn('fold', .3, {theme: green}).px(800, 20), [0, 255, 0]), 'the fold\'s ground is the theme\'s bg');
  assert.ok(share(drawn('inkBleed', .5, {theme: green}).data, [255, 0, 255], 2) > .05, 'the ink is the theme\'s ink');
  assert.ok(share(drawn({type: 'inkBleed', color: '#ffff00'}, .5, {theme: green}).data, [255, 255, 0], 2) > .05, 'unless the recipe names a colour');
  assert.ok(share(drawn('ringIris', .4, {theme: green}).data, [0, 255, 255], 2) > 0, 'the ring in the theme\'s accent');
  assert.equal(paperTokens(undefined).ink, paper.palette.ink, 'no theme given: the built-in paper theme\'s');
  assert.equal(paperTokens({palette: {bg: '#000000', panel: '#111111', edge: '#222222', ink: '#ffffff', accent: '#333333', available: '#444444'}}).paper, '#111111', 'a theme without a card: its panel');
});

test('bad settings refuse, naming what each one takes', () => {
  const refuses = (enter, re) => assert.throws(() => readEntrance(enter, 'stage b'), re);
  refuses({type: 'torn', direction: 'up'}, /stage b: enter.direction must be left, right, top, bottom/);
  refuses({type: 'torn', tear: .95}, /enter.tear must be a number 0.2–0.8/);
  refuses({type: 'torn', seed: -1}, /enter.seed must be a number 0–10000/);
  refuses({type: 'eraser', color: 'slate'}, /enter.color must be a hex colour such as "#000000"/);
  refuses({type: 'inkBleed', at: [220]}, /enter.at must be \[x, y\]/);
  refuses({type: 'ringIris', width: 200}, /enter.width must be a number 4–80/);
  refuses({type: 'ringIris', radius: -5}, /enter.radius must be a number 0–900/);
  refuses({type: 'glassSheet', from: 'up'}, /enter.from must be right, left, top, bottom/);
  refuses({type: 'glassSheet', tint: 'blue'}, /enter.tint must be a hex colour/);
  refuses({type: 'curl', corner: 'north'}, /enter.corner must be bottom-right, bottom-left, top-right, top-left/);
  refuses({type: 'fold', line: 'diagonal'}, /enter.line must be horizontal, vertical/);
  refuses({type: 'morph', fromBox: [300, 300, 100, 100]}, /enter.fromBox must be a box \[x0, y0, x1, y1\] on the 1600×900 frame, with x0 < x1 and y0 < y1/);
  refuses({type: 'morph', toBox: [0, 0, 1]}, /enter.toBox must be a box/);
  refuses({type: 'torn', at: [1, 2]}, /enter has unsupported key at \(a torn takes seconds, ease, sound, direction, tear, seed\)/);
  refuses({type: 'glassSheet', ease: 'spring'}, /a glassSheet cannot take the ease "spring"/);
  // A kit's own transition may take the new kinds of setting too: a box, and a colour that is the theme's.
  const kit = {name: 'k', transitions: {frame: {family: 'x', seconds: 1, ease: 'linear', sound: null, params: {box: {box: true, default: [0, 0, 10, 10]}, ink: {color: true, default: null}}, draw: (c, {from}) => from(c)}}};
  assert.deepEqual(readEntrance('frame', 'x', transitionCatalog([kit])).p, {box: [0, 0, 10, 10], ink: null});
  assert.throws(() => transitionCatalog([{name: 'k', transitions: {frame: {...kit.transitions.frame, params: {box: {box: true, default: [5, 5, 1, 1]}}}}}]), /enter.box must be a box/);
});

test('morph: a box becomes a box, from boxes it is given or from the things it names', () => {
  const own = readEntrance('morph', 'x'), named = readEntrance({type: 'morph', region: 'window', into: 'tree'}, 'x'), same = readEntrance({type: 'morph', region: 'ring'}, 'x');
  assert.deepEqual(own.regions(own.p), {from: [], to: []}, 'no names: its own boxes, nothing to look up');
  assert.deepEqual(named.regions(named.p), {from: ['window'], to: ['tree']});
  assert.deepEqual(same.regions(same.p), {from: ['ring'], to: ['ring']});
  // A named thing's box wins over the setting: the outline starts where the film found the window.
  const boxes = {from: {window: [1000, 300, 1200, 500]}, to: {tree: [1000, 300, 1200, 500]}};
  assert.ok(near(drawn({type: 'morph', region: 'window', into: 'tree'}, .5, {boxes}).px(1000, 400), hex(paper.palette.accent), 30));
});

// A film: a red world, then a blue one entering by a paper transition, then a green one.
const storyboard = {title: 'T', scenes: [
  {id: 'a', narration: 'This is the first world, all in red.'},
  {id: 'b', narration: 'Now the second world arrives, all in blue.'},
  {id: 'c', narration: 'And a third world comes after it.'},
]};
const world = (name, color) => ({name, story: {compile: () => ({hang: 1, spotAt: () => null, sounds: [], draw: c => { c.fillStyle = color; c.fillRect(0, 0, 1600, 900); }})}});
const film = enter => compileFilm({storyboard, timings: evenTimings(storyboard), kits: [world('red', '#ff0000'), world('blue', '#0000ff'), world('green', '#00ff00')],
  recipe: {story: {kit: 'red'}, stages: [{type: 'world', scene: 'b', enter, world: {kit: 'blue'}}, {type: 'world', scene: 'c', enter: 'cut', world: {kit: 'green'}}]}});
const pixel = (f, t, x, y) => { const c = createCanvas(1600, 900), ctx = c.getContext('2d'); f.frame(ctx, t); return [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)]; };

test('in a film: a recipe names a paper transition like any other, on the film clock, with its sound', async () => {
  const f = await film({type: 'torn', seconds: 1, ease: 'linear'}), b = f.clock.start('b'), t0 = b - .75;
  assert.deepEqual(pixel(f, t0, 800, 450), RED, 'the first frame of the change: the old world');
  assert.deepEqual(pixel(f, t0 + .75, 100, 450), RED); assert.deepEqual(pixel(f, t0 + .75, 1500, 450), BLUE, 'dragging left: the new world uncovered on the right');
  assert.deepEqual(pixel(f, b + .3, 800, 450), BLUE);
  assert.ok(f.sounds.some(s => s.type === 'slide' && Math.abs(s.time - t0) < 1e-9), 'heard where it starts');
  const ink = await film({type: 'inkBleed', at: [800, 450], sound: false});
  assert.ok(!ink.sounds.some(s => s.type === 'whoosh'), 'sound: false');
  await assert.rejects(film({type: 'morph', region: 'door'}), /stage b: the morph looks for "door" in the picture it leaves, and nothing in the picture is called "door"/);
});

test('the README\'s table is the catalog: every transition, in order, with its family, length, sound, settings and meaning', () => {
  const text = readFileSync(new URL('../README.md', import.meta.url), 'utf8'), lines = text.split('\n');
  const at = lines.findIndex(l => l.startsWith('| family | transition |'));
  assert.ok(at > 0, 'the README has the transitions table');
  assert.deepEqual(lines[at].split('|').slice(1, -1).map(c => c.trim()), ['family', 'transition', 'what it does', 'use it for', 'settings (default)', 'length', 'sound']);
  const rows = [];
  for (const line of lines.slice(at + 2)) { if (!line.startsWith('|')) break; rows.push(line.split('|').slice(1, -1).map(c => c.trim())); }
  assert.deepEqual(rows.map(r => r[1].replace(/`/g, '')), [...TRANSITION_NAMES], 'one row per transition, in the catalog\'s order');
  let family = null;
  for (const [fam, cell, what, use, settings, length, sound] of rows) {
    const name = cell.replace(/`/g, ''), tr = TRANSITIONS[name];
    family = fam || family;
    assert.equal(family, tr.family, `${name}'s family`);
    assert.ok(what && use, `${name} says what it does and when to use it`);
    assert.equal(length, tr.seconds ? `${tr.seconds} s` : '0', `${name}'s length`);
    assert.equal(sound, tr.sound ?? '–', `${name}'s sound`);
    for (const [setting, spec] of Object.entries(tr.params)) {
      assert.ok(settings.includes(`\`${setting}\``), `${name}'s setting ${setting} is in its row`);
      if (spec.name) continue;   // a thing in the picture: required, or "left out"
      const d = spec.default, want = d === null ? 'null' : spec.point && d[0] === 800 && d[1] === 450 ? 'the centre' : `\`${Array.isArray(d) ? `[${d.join(', ')}]` : d}\``;
      assert.ok(settings.includes(want), `${name}'s ${setting} default, ${want}, is in its row`);
    }
  }
});
