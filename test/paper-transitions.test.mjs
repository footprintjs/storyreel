// The paper transitions (src/transitions/paper/): nine built-in entries of the one collection. Each starts on the
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
import {tornAt, tearPace} from '../src/transitions/paper/torn.mjs';
import {puffsOf} from '../src/transitions/paper/burst.mjs';
import {thoughtCloud, cloudPath} from '../src/thought/index.mjs';

const PAPER = Object.keys(PAPER_TRANSITIONS);
const RED = [255, 0, 0], BLUE = [0, 0, 255];
const solid = ([r, g, b]) => c => { c.fillStyle = `rgb(${r},${g},${b})`; c.fillRect(0, 0, 1600, 900); };
const paper = loadTheme('paper');
const S = .5;   // drawn at half size: 800 × 450

/** One transition drawn alone at e, red leaving and blue arriving: its pixels, and a reader at frame coordinates. */
function drawn(enter, e, {theme = paper, boxes = {from: {}, to: {}}, from = solid(RED), to = solid(BLUE)} = {}) {
  const en = readEntrance(enter, 'test'), c = createCanvas(1600 * S, 900 * S), ctx = c.getContext('2d'), ghost = ghostPainter();
  ctx.scale(S, S);
  en.draw(ctx, {e, from, to, p: en.p, ghost: (alpha, paint) => ghost(ctx, alpha, paint), theme, boxes});
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  return {ctx, data, px: (x, y) => { const i = (Math.round(y * S) * c.width + Math.round(x * S)) * 4; return [data[i], data[i + 1], data[i + 2]]; }};
}
/** The share of pixels within `tol` of a colour. */
const share = (data, rgb, tol = 10) => { let n = 0; for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i] - rgb[0]) <= tol && Math.abs(data[i + 1] - rgb[1]) <= tol && Math.abs(data[i + 2] - rgb[2]) <= tol) n++; return n / (data.length / 4); };
const near = (got, want, tol = 12) => want.every((v, i) => Math.abs(got[i] - v) <= tol);
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

test('the nine are in the catalog, each in its family, with the defaults a recipe gets by name', () => {
  assert.deepEqual(PAPER, ['cloudBurst', 'torn', 'eraser', 'inkBleed', 'ringIris', 'glassSheet', 'curl', 'fold', 'morph']);
  const catalog = transitionCatalog([]);
  for (const name of PAPER) {
    assert.ok(TRANSITION_NAMES.includes(name) && Object.hasOwn(catalog, name), `${name} is a built-in transition`);
    assert.equal(TRANSITIONS[name], PAPER_TRANSITIONS[name], `${name}: one definition, in paper-transitions.mjs`);
    assert.ok(Object.isFrozen(TRANSITIONS[name].params), `${name} is frozen like the rest`);
    const en = readEntrance(name, 'test');
    assert.equal(en.type, name); assert.equal(en.seconds, TRANSITIONS[name].seconds); assert.equal(en.lead, en.seconds * .75);
  }
  assert.deepEqual(Object.fromEntries(PAPER.map(n => [n, TRANSITIONS[n].family])),
    {cloudBurst: 'dissolve', torn: 'wipe', eraser: 'wipe', inkBleed: 'iris', ringIris: 'iris', glassSheet: 'motion', curl: 'page', fold: 'page', morph: 'match'});
  assert.deepEqual(readEntrance('cloudBurst', 'x').p, {corner: 'bottom-left', size: .8, seed: 3, color: null, ink: null}, 'the thought frame\'s own five settings, at its defaults');
  assert.deepEqual(readEntrance('torn', 'x').p, {direction: 'right', drift: 0, seed: 5});
  assert.deepEqual(readEntrance('inkBleed', 'x').p, {at: [220, 760], color: null, seed: 7}, 'a colour left at null is the theme\'s');
  assert.deepEqual(readEntrance({type: 'ringIris', at: [1060, 400], radius: 120, color: '#c26a12'}, 'x').p, {at: [1060, 400], radius: 120, width: 26, color: '#c26a12', accent: null});
  assert.throws(() => transitionCatalog([{name: 'k', transitions: {torn: TRANSITIONS.fade}}]), /has a built-in transition's name/, 'a kit that still brings its own torn must drop it');
});

test('each starts on the leaving picture and ends on the arriving one, exactly, and gets there without a jump', () => {
  const plainOf = color => { const c = createCanvas(1600 * S, 900 * S), x = c.getContext('2d'); x.scale(S, S); solid(color)(x); return x.getImageData(0, 0, c.width, c.height).data; };
  const red = plainOf(RED), blue = plainOf(BLUE);
  // Every transition at its defaults, and again with each setting that changes where it goes.
  const entrances = [...PAPER, {type: 'cloudBurst', corner: 'top-right', size: .6, seed: 9}, {type: 'cloudBurst', corner: 'bottom-right', size: .9}, {type: 'torn', direction: 'left'}, {type: 'torn', direction: 'top', drift: 100}, {type: 'torn', direction: 'bottom', seed: 9},
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
  for (const name of ['torn', 'inkBleed', 'cloudBurst']) {   // (mid-tear for torn: once torn through, its edge is off the sheet)
    assert.notDeepEqual(drawn({type: name, seed: 1}, .25).data, drawn({type: name, seed: 2}, .25).data, `${name}: the seed shapes the edge`);
    assert.deepEqual(drawn({type: name, seed: 41}, .25).data, drawn({type: name, seed: 41}, .25).data);
  }
  const a = seeded(7), b = seeded(7), c = seeded(7.5), first = [a(), a(), a()];
  assert.deepEqual(first, [b(), b(), b()]); assert.notDeepEqual(first, [c(), c(), c()], 'the fraction counts too');
  assert.ok(first.every(v => v >= 0 && v < 1));
});

test('the shapes, part way: where each one shows the new picture', () => {
  const at = (enter, e, x, y) => drawn(enter, e).px(x, y);
  // torn (its own test below): ripping right, the new picture is uncovered on the left first; ripping left, mirrored.
  assert.deepEqual(at('torn', .5, 100, 450), BLUE); assert.deepEqual(at('torn', .5, 1550, 450), RED);
  assert.deepEqual(at({type: 'torn', direction: 'left'}, .5, 100, 450), RED); assert.deepEqual(at({type: 'torn', direction: 'left'}, .5, 1550, 450), BLUE);
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

test('torn: a slow peel — behind the moving rip the old picture is gone and the new one shows, the flap carries the old picture, the edge is paper', () => {
  const p = readEntrance('torn', 'x').p, at = e => tornAt(e, p);
  // The rip runs one way only, at a seeded, uneven pace: slow to start, catching in stutters.
  const pace = tearPace(5), xs = Array.from({length: 201}, (_, i) => pace(i / 200)), steps = xs.slice(1).map((x, i) => x - xs[i]);
  assert.ok(steps.every(d => d >= 0), 'never back');
  assert.ok(pace(.1) < .06 && pace(.5) > .3 && pace(.5) < .7, `slow to start (${pace(.1).toFixed(3)} by a tenth of the rip), quicker after (${pace(.5).toFixed(3)} by half)`);
  assert.ok(steps.slice(30, 170).some(d => d < .25 / 200), 'it catches: somewhere in the middle the rip all but stops');
  assert.deepEqual(xs, Array.from({length: 201}, (_, i) => tearPace(5)(i / 200)), 'the same seed, the same pace');
  assert.notEqual(tearPace(6)(.5), pace(.5), 'another seed, another pace');
  for (const e of [.2, .4, .6, .8]) assert.ok(at(e).f < at(e + .05).f, 'the front moves on');
  // At every moment, on every row: behind the curl only the new picture; ahead of the front only the old one; and the
  // edge between is paper and shade, never a dark line (no pixel there without a bright channel).
  for (const e of [.2, .35, .5, .65]) {
    const {f, r, lift} = at(e), frame = drawn('torn', e);
    let core = 0;
    for (const y of [60, 250, 450, 650, 840]) {
      const front = f + .18 * (y - 450), behind = front - lift - 2 * r - 70;
      for (let x = 4; x < Math.min(1596, behind); x += 23) assert.ok(near(frame.px(x, y), BLUE, 40), `e ${e}: behind the curl at (${x}, ${y}), the new picture (${frame.px(x, y)})`);
      for (let x = Math.max(4, Math.ceil(front + 40)); x < 1596; x += 23) assert.deepEqual(frame.px(x, y), RED, `e ${e}: ahead of the front at (${x}, ${y}), the old picture`);
      for (let x = Math.max(0, Math.floor(behind)); x < Math.min(1600, front + 40); x += 2) {
        const c = frame.px(x, y);
        assert.ok(Math.max(...c) >= 70, `e ${e}: the torn edge and the curl at (${x}, ${y}) are paper and shade, not a dark line (${c})`);
        if (c.every(v => v >= 235)) core++;
      }
    }
    assert.ok(core > 3, `e ${e}: the white fibrous core shows along the tear (${core} samples)`);
  }
  // The flap carries the old picture as it lifts: a green mark lying just behind the front shows on the lifting strip,
  // squeezed toward the front, off its own place — on every row, the slanted front's own (top, middle, bottom).
  for (const [y0, y1] of [[40, 120], [400, 500], [780, 860]]) {
    const yMid = (y0 + y1) / 2, front = e => at(e).f + .18 * (yMid - 450), x0 = 600 + .18 * (yMid - 450);
    const marked = c => { solid(RED)(c); c.fillStyle = '#00ff00'; c.fillRect(x0, y0, 20, y1 - y0); };
    const greenIn = data => { let n = 0, x = 0; for (let i = 0; i < data.length; i += 4) if (data[i + 1] > 150 && data[i] < 110 && data[i + 2] < 110) { n++; x += (i / 4) % (1600 * S); } return {n, x: n ? x / n / S : null}; };
    let lo = 0, hi = .9;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (front(m) < x0 + 40) lo = m; else hi = m; }
    const carried = greenIn(drawn('torn', hi, {from: marked}).data), {lift} = at(hi);
    assert.ok(carried.n > 0 && carried.x > x0 + 10 + 5 && carried.x > front(hi) - lift, `rows ${y0}–${y1}: the mark rides the lifting flap, squeezed toward the front (centre ${carried.x?.toFixed(1)}, from ${(x0 + 10).toFixed(1)}; front ${front(hi).toFixed(1)})`);
  }
  // Never a dark line: under a near-black title card, the strip from the lifting flap to past the front is paper and
  // the old picture only — the card never shows through the tear.
  const dark = c => { c.fillStyle = '#141414'; c.fillRect(0, 0, 1600, 900); };
  for (const e of [.25, .45, .65]) {
    const {f, lift} = at(e), frame = drawn('torn', e, {to: dark});
    for (const y of [60, 250, 450, 650, 840]) {
      const front = f + .18 * (y - 450);
      for (let x = Math.max(0, Math.ceil(front - lift + 4)); x < Math.min(1600, front + 40); x += 2) assert.ok(Math.max(...frame.px(x, y)) >= 70, `e ${e}: at (${x}, ${y}) the tear is paper, not the dark card showing through (${frame.px(x, y)})`);
    }
  }
  // drift: the new picture comes along with the tear, set back by up to `drift` while it is uncovered, home at the end.
  const titled = c => { solid(BLUE)(c); c.fillStyle = '#ffff00'; c.fillRect(200, 400, 60, 100); };
  const yellowAt = (enter, e) => { const d = drawn(enter, e, {to: titled}).data; let n = 0, x = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] < 80) { n++; x += (i / 4) % (1600 * S); } return x / n / S; };
  const still = yellowAt('torn', .6), along = yellowAt({type: 'torn', drift: 40}, .6), home = yellowAt({type: 'torn', drift: 40}, .97);
  assert.ok(Math.abs(still - 229.5) < 2 && along < still - 4, `with drift the title sits back while uncovered (${along.toFixed(1)} against ${still.toFixed(1)})`);
  assert.ok(Math.abs(home - still) < 3, `and comes home with the tear, settling (${home.toFixed(1)})`);
  // drift never uncovers the ground behind the new picture, nor does the settle at an edge: drawn over a vivid green
  // ground, in every direction, no green shows at any moment.
  const vivid = validateTheme({...structuredClone(paper), palette: {...paper.palette, bg: '#00ff00'}});
  for (const direction of ['right', 'left', 'top', 'bottom']) for (const drift of [0, 40, 200]) for (let e = .1; e < 1; e += .035) {
    assert.equal(share(drawn({type: 'torn', direction, drift}, e, {theme: vivid}).data, [0, 255, 0], 30), 0, `${direction}, drift ${drift}, e ${e.toFixed(3)}: no ground shows`);
  }
  // The other way: from the right edge, the new picture uncovered on the right first.
  const {f} = at(.5), mirrored = drawn({type: 'torn', direction: 'left'}, .5);
  assert.deepEqual(mirrored.px(1590, 450), BLUE); assert.deepEqual(mirrored.px(Math.max(4, 1600 - f - 60), 450), RED);
});

test('paper and ink are the theme\'s; a colour setting at null is the theme\'s own, and a recipe may name one', () => {
  const green = validateTheme({...structuredClone(paper), palette: {...paper.palette, bg: '#00ff00', ink: '#ff00ff', accent: '#00ffff'}});
  assert.ok(near(drawn('fold', .3, {theme: green}).px(800, 20), [0, 255, 0]), 'the fold\'s ground is the theme\'s bg');
  assert.ok(share(drawn('inkBleed', .5, {theme: green}).data, [255, 0, 255], 2) > .05, 'the ink is the theme\'s ink');
  assert.ok(share(drawn({type: 'inkBleed', color: '#ffff00'}, .5, {theme: green}).data, [255, 255, 0], 2) > .05, 'unless the recipe names a colour');
  assert.ok(share(drawn('ringIris', .4, {theme: green}).data, [0, 255, 255], 2) > 0, 'the ring in the theme\'s accent');
  const yellowCard = validateTheme({...structuredClone(paper), palette: {...paper.palette, card: '#ffff00'}}), [cx, cy] = thoughtCloud({}).centre;
  assert.ok(near(drawn('cloudBurst', .29, {theme: yellowCard}).px(cx, cy), [255, 255, 0], 6), 'the cloud is the theme\'s card');
  assert.ok(near(drawn({type: 'cloudBurst', color: '#00ffff'}, .29, {theme: yellowCard}).px(cx, cy), [0, 255, 255], 6), 'unless the recipe names a colour');
  assert.ok(share(drawn('cloudBurst', .28, {theme: green}).data, [255, 0, 255], 40) > .002, 'its outline in the theme\'s ink');
  assert.equal(paperTokens(undefined).ink, paper.palette.ink, 'no theme given: the built-in paper theme\'s');
  assert.equal(paperTokens({palette: {bg: '#000000', panel: '#111111', edge: '#222222', ink: '#ffffff', accent: '#333333', available: '#444444'}}).paper, '#111111', 'a theme without a card: its panel');
});

test('bad settings refuse, naming what each one takes', () => {
  const refuses = (enter, re) => assert.throws(() => readEntrance(enter, 'stage b'), re);
  refuses({type: 'torn', direction: 'up'}, /stage b: enter.direction must be right, left, bottom, top/);
  refuses({type: 'torn', drift: 300}, /enter.drift must be a number 0–200/);
  refuses({type: 'torn', tear: .5}, /enter has unsupported key tear \(a torn takes seconds, ease, sound, direction, drift, seed\)/);
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
  refuses({type: 'torn', at: [1, 2]}, /enter has unsupported key at \(a torn takes seconds, ease, sound, direction, drift, seed\)/);
  refuses({type: 'glassSheet', ease: 'spring'}, /a glassSheet cannot take the ease "spring"/);
  refuses({type: 'cloudBurst', corner: 'north'}, /enter.corner must be bottom-left, bottom-right, top-left, top-right/);
  refuses({type: 'cloudBurst', size: 1.2}, /enter.size must be a number 0.5–0.9/);
  refuses({type: 'cloudBurst', seed: -1}, /enter.seed must be a number 0–10000/);
  refuses({type: 'cloudBurst', ink: 'black'}, /enter.ink must be a hex colour such as "#000000"/);
  refuses({type: 'cloudBurst', at: [1, 2]}, /enter has unsupported key at \(a cloudBurst takes seconds, ease, sound, corner, size, seed, color, ink\)/);
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

test('cloudBurst: the cloud swells and pales, pops on principles.mjs\'s pop, and its puffs clear the middle first', () => {
  const cloud = thoughtCloud({}), [cx, cy] = cloud.centre, card = hex(paperTokens(paper).paper);
  // Until the pop the new picture is nowhere, on a plain shot as after a thought: round the cloud the old picture stays
  // whole, and in the cloud the memory pales into the paper (the paper and the ink have no more blue than green).
  const incoming = data => { let n = 0; for (let i = 0; i < data.length; i += 4) if (data[i + 2] > data[i + 1] + 30) n++; return n; };
  for (const e of [.02, .1, .2, .29]) assert.equal(incoming(drawn('cloudBurst', e).data), 0, `at ${e}, before the pop, no pixel of the new picture`);
  for (const e of [.1, .29]) assert.deepEqual(drawn('cloudBurst', e).px(30, 30), RED, `at ${e}, round the cloud: the old picture, untouched`);
  const late = drawn('cloudBurst', .29);
  assert.ok(near(late.px(cx, cy), card, 6), `just before the pop, in the cloud: its paper (${late.px(cx, cy)})`);
  assert.deepEqual(drawn('cloudBurst', .1).px(cx, cy), RED, 'early on, the old picture in the cloud too');
  // The swell: a point just past the cloud's edge at rest is inside it as it swells to the pop (its paper, not the old picture).
  const [ex, ey] = cloud.anchor, past = [cx + (ex - cx) * 1.03, cy + (ey - cy) * 1.03];
  assert.ok(late.px(...past)[1] > 200, `swollen, the cloud covers ${past.map(Math.round)} (${late.px(...past)})`);
  // After the pop, round the cloud the new picture fades up with the burst; the middle clears first.
  const round = drawn('cloudBurst', .42).px(30, 30);
  assert.ok(round[0] > 40 && round[2] > 40, `round the cloud, the two crossing after the pop (${round})`);
  assert.deepEqual(drawn('cloudBurst', .7).px(30, 30), BLUE, 'and the new picture there once the burst has gone by');
  assert.deepEqual(drawn('cloudBurst', .62).px(cx, cy), BLUE, 'the middle, cleared');
  assert.ok(share(drawn('cloudBurst', .45).data, card, 8) > .02, 'puffs of the cloud\'s paper still on screen');
  assert.equal(share(drawn('cloudBurst', .93).data, BLUE, 0), 1, 'the puffs gone before the end');
  // (The puffs travel as far as principles.mjs · envelopeShare says the pop has pushed them: pinned against envelope
  // itself in test/principles.test.mjs.)
  // At the pop, the puffs ARE the cloud: its scallops, and discs inside its outline.
  const puffs = puffsOf(cloud), c = createCanvas(16, 16).getContext('2d');
  cloudPath(c, cloud);
  assert.equal(puffs.filter(p => p.rim).length, cloud.lobes.length, 'one rim puff per scallop');
  assert.ok(puffs.filter(p => !p.rim).length > 10, 'and discs that fill it');
  for (const p of puffs) assert.ok(c.isPointInPath(p.x, p.y), `a puff at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) starts inside the cloud`);
  assert.ok(puffs.filter(p => !p.rim).every(p => p.life < Math.min(...puffs.filter(q => q.rim).map(q => q.life))), 'the inside clears before the scallops');
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
  assert.deepEqual(pixel(f, t0 + .5, 100, 450), BLUE); assert.deepEqual(pixel(f, t0 + .5, 1550, 450), RED, 'ripping right: the new world uncovered on the left first');
  assert.deepEqual(pixel(f, b + .3, 800, 450), BLUE);
  assert.ok(f.sounds.some(s => s.type === 'crumble' && Math.abs(s.time - t0) < 1e-9), 'heard where it starts');
  const ink = await film({type: 'inkBleed', at: [800, 450], sound: false});
  assert.ok(!ink.sounds.some(s => s.type === 'whoosh'), 'sound: false');
  await assert.rejects(film({type: 'morph', region: 'door'}), /stage b: the morph looks for "door" in the picture it leaves, and nothing in the picture is called "door"/);
  // A cloudBurst's sound hits on its pop (e = 0.3), however long the change takes and however it is eased.
  for (const [seconds, ease] of [[1, undefined], [2, undefined], [2, 'in'], [1.5, 'out']]) {
    const enter = {type: 'cloudBurst', seconds, ...(ease ? {ease} : {})}, en = readEntrance(enter, 'x');
    const burst = await film(enter), start = burst.clock.start('b') - .75 * seconds, hit = start + en.hitAfter;
    assert.ok(Math.abs(en.ease(en.hitAfter / seconds) - .3) < 1e-9, `${seconds} s ${ease ?? 'linear'}: e is 0.3 when it sounds`);
    assert.ok(burst.sounds.some(s => s.type === 'whoosh' && Math.abs(s.time - hit) < 1e-9), `${seconds} s ${ease ?? 'linear'}: heard on the pop, at ${hit.toFixed(3)} s`);
    assert.ok(!burst.sounds.some(s => s.type === 'whoosh' && Math.abs(s.time - start) < 1e-9), 'not at the change\'s first moment');
  }
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
      const d = spec.default, want = d === null ? 'null' : spec.point && (d === 'centre' || (d[0] === 800 && d[1] === 450)) ? 'the centre' : `\`${Array.isArray(d) ? `[${d.join(', ')}]` : d}\``;
      assert.ok(settings.includes(want), `${name}'s ${setting} default, ${want}, is in its row`);
    }
  }
});
