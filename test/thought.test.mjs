// The thought frame (src/thought.mjs): a world drawn inside a cartoon thought cloud, its trail of three circles toward a
// corner. The cloud is a seeded shape the world's picture fills; its entrance pops the trail from the corner out, then
// opens the cloud; in a film the world sits inside the cloud, and cloudBurst pops the very cloud the frame drew. Bad
// frames refuse with the fix, and the README's table is the settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {thoughtCloud, thoughtAt, cloudPath, drawThought, readThought, THOUGHT_CORNERS, THOUGHT_SETTINGS, THOUGHT_ENTRANCE} from '../src/thought/index.mjs';

const pathCtx = () => createCanvas(16, 16).getContext('2d');
/** Whether (x, y) is inside the cloud's outline, the outline scaled by k about the cloud's middle. */
function insideCloud(cloud, [x, y], k = 1) {
  const c = pathCtx(), [cx, cy] = cloud.centre;
  c.translate(cx, cy); c.scale(k, k); c.translate(-cx, -cy); cloudPath(c, cloud);
  return c.isPointInPath(x, y);
}
const arcPoints = l => Array.from({length: 33}, (_, k) => { const a = l.a0 + (l.a1 - l.a0) * k / 32; return [l.x + l.r * Math.cos(a), l.y + l.r * Math.sin(a)]; });
const CORNER_AT = {'bottom-left': [0, 900], 'bottom-right': [1600, 900], 'top-left': [0, 0], 'top-right': [1600, 0]};

test('the cloud: a seeded shape inside the box the picture fills, leaning away from the trail, which runs to its corner', () => {
  const random = Math.random;
  Math.random = () => { throw new Error('the cloud drew from Math.random'); };
  try {
    for (const corner of THOUGHT_CORNERS) for (const size of [.5, .8, .9]) {
      const cloud = thoughtCloud({corner, size, seed: 41 + size}), [x0, y0, x1, y1] = cloud.box, [cx, cy] = cloud.centre, at = CORNER_AT[corner];
      assert.equal(cloud.S, size, 'the picture is drawn at the cloud\'s size');
      assert.deepEqual([x1 - x0, y1 - y0].map(v => +v.toFixed(6)), [1600 * size, 900 * size].map(v => +v.toFixed(6)), 'the box is the frame at that size');
      assert.deepEqual(cloud.place, [x0, y0]);
      // Every point of the outline is in the box (the picture covers the cloud), and it touches the box on one side.
      const pts = cloud.lobes.flatMap(arcPoints), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      assert.ok(pts.every(([x, y]) => x >= x0 - 1e-6 && x <= x1 + 1e-6 && y >= y0 - 1e-6 && y <= y1 + 1e-6), `${corner} ${size}: the outline stays in the picture's box`);
      assert.ok(Math.max(Math.max(...xs) - Math.min(...xs) - (x1 - x0), Math.max(...ys) - Math.min(...ys) - (y1 - y0)) > -1e-6, 'and fills it on one side');
      // It leans away from the corner, and stays on the frame.
      assert.ok(Math.sign(cx - 800) === Math.sign(800 - at[0]) && Math.sign(cy - 450) === Math.sign(450 - at[1]), `${corner}: the cloud leans away from its corner`);
      assert.ok(x0 >= 0 && y0 >= 0 && x1 <= 1600 && y1 <= 900, 'on the frame');
      // The trail: from the corner out, each circle bigger and further from the corner, outside the cloud, on the frame.
      const far = cloud.trail.map(({c}) => Math.hypot(c[0] - at[0], c[1] - at[1]));
      assert.ok(far[0] < far[1] && far[1] < far[2], `${corner} ${size}: the trail runs from the corner out (${far.map(Math.round)})`);
      assert.ok(cloud.trail[0].r < cloud.trail[1].r && cloud.trail[1].r < cloud.trail[2].r, 'small at the corner, bigger toward the cloud');
      for (const {c: [x, y], r} of cloud.trail) {
        // Clear of the cloud even swollen as cloudBurst swells it (5 %) and its ink line, at every size.
        for (let k = 0; k < 32; k++) assert.ok(!insideCloud(cloud, [x + r * Math.cos(k / 32 * 2 * Math.PI), y + r * Math.sin(k / 32 * 2 * Math.PI)], 1.06), `${corner} ${size}: a trail circle clear of the cloud swollen to burst`);
        assert.ok(x - r >= 0 && x + r <= 1600 && y - r >= 0 && y + r <= 900, 'on the frame');
      }
      assert.ok(Math.hypot(cloud.anchor[0] - at[0], cloud.anchor[1] - at[1]) < Math.hypot(cx - at[0], cy - at[1]), 'it grows from its edge nearest the trail');
    }
  } finally { Math.random = random; }
  const a = thoughtCloud({seed: 7}), b = thoughtCloud({seed: 8});
  assert.equal(thoughtCloud({seed: 7}), a, 'kept per settings');
  assert.notDeepEqual(a.lobes.map(l => l.r), b.lobes.map(l => l.r), 'another seed, other scallops');
});

test('at its default size the cloud keeps a margin from the frame\'s edges: at rest, opening past its size, swollen to burst', () => {
  for (const corner of THOUGHT_CORNERS) {
    const cloud = thoughtCloud({corner}), pts = cloud.lobes.flatMap(arcPoints);
    const margin = ps => Math.min(...ps.map(([x, y]) => Math.min(x, 1600 - x, y, 900 - y))), about = ([ax, ay], k) => pts.map(([x, y]) => [ax + (x - ax) * k, ay + (y - ay) * k]);
    let open = 0;
    for (let t = 0; t < THOUGHT_ENTRANCE.settled; t += 1 / 240) open = Math.max(open, thoughtAt(cloud, t).open);
    assert.ok(margin(pts) >= 50, `${corner}: at rest, ${margin(pts).toFixed(1)} px from the nearest edge`);
    assert.ok(margin(about(cloud.anchor, open)) >= 36, `${corner}: opening (${open.toFixed(3)} of its size), ${margin(about(cloud.anchor, open)).toFixed(1)} px`);
    assert.ok(margin(about(cloud.centre, 1.05)) >= 36, `${corner}: swollen to burst (cloudBurst swells it by 5 %), ${margin(about(cloud.centre, 1.05)).toFixed(1)} px`);
  }
});

test('the entrance: the trail pops one circle after another from the corner, then the cloud opens; at rest by 1.6 s', () => {
  const cloud = thoughtCloud({}), at = age => thoughtAt(cloud, age);
  assert.deepEqual({...at(0), bulge: null}, {trail: [0, 0, 0], open: 0, bulge: null, backdrop: 0}, 'nothing before the shot');
  const firstSeen = i => { for (let t = 0; t < 2; t += 1 / 240) if (at(t).trail[i] > 0) return t; return Infinity; };
  const firstOpen = (() => { for (let t = 0; t < 2; t += 1 / 240) if (at(t).open > 0) return t; return Infinity; })();
  const order = [0, 1, 2].map(firstSeen);
  assert.ok(order[0] < order[1] && order[1] < order[2] && order[2] < firstOpen, `the corner's circle first, then the next, then the cloud (${[...order, firstOpen].map(t => t.toFixed(3))})`);
  // A small overshoot: each pops a little past its size and settles; the cloud a little softer.
  const most = f => Math.max(...Array.from({length: 480}, (_, i) => f(at(i / 240))));
  for (const i of [0, 1, 2]) { const m = most(s => s.trail[i]); assert.ok(m > 1.02 && m < 1.12, `circle ${i} overshoots a little (${m.toFixed(3)})`); }
  const open = most(s => s.open);
  assert.ok(open > 1.01 && open < 1.04, `the cloud overshoots a little (${open.toFixed(3)})`);
  assert.deepEqual(at(THOUGHT_ENTRANCE.settled), {trail: [1, 1, 1], open: 1, bulge: null, backdrop: 1}, 'at rest: exactly the cloud');
  assert.ok(Math.abs(at(THOUGHT_ENTRANCE.settled - 1e-3).open - 1) < 1e-3, 'and no jump onto it');
  // In pixels: early on only the corner's circle is drawn (paper at its middle); the rest of the frame is untouched.
  const page = '#00ff00', drawnAt = age => {
    const c = createCanvas(800, 450), ctx = c.getContext('2d'); ctx.scale(.5, .5); ctx.fillStyle = page; ctx.fillRect(0, 0, 1600, 900);
    drawThought(ctx, cloud, x => { x.fillStyle = '#ff0000'; x.fillRect(0, 0, 1600, 900); }, {age});
    return ([x, y]) => [...ctx.getImageData(Math.round(x / 2), Math.round(y / 2), 1, 1).data.slice(0, 3)];
  };
  const green = px => px[1] > 200 && px[0] < 60, early = drawnAt(.1);
  assert.ok(!green(early(cloud.trail[0].c)), 'at 0.1 s the corner\'s circle is up');
  assert.ok(green(early(cloud.trail[1].c)) && green(early(cloud.trail[2].c)) && green(early(cloud.centre)), 'the others, and the cloud, not yet');
  const opened = drawnAt(2);
  assert.deepEqual(opened(cloud.centre), [255, 0, 0], 'settled: the picture fills the cloud');
});

// A film: a red world (the story, in a thought cloud), then a blue one.
const storyboard = {title: 'T', scenes: [
  {id: 'a', narration: 'This is the first world, all in red, remembered.'},
  {id: 'b', narration: 'Now the second world arrives, all in blue.'},
  {id: 'c', narration: 'And a third world comes after it, in green.'},
]};
const world = (name, color) => ({name, story: {compile: () => ({hang: 1, spotAt: () => null, sounds: [], draw: c => { c.fillStyle = color; c.fillRect(0, 0, 1600, 900); },
  regionsAt: () => [{box: [0, 0, 1600, 900], path: 'all', label: `the ${name} world`, name: 'all'}]})}});
const kits = [world('red', '#ff0000'), world('blue', '#0000ff'), world('green', '#00ff00')];
const film = (recipe, extra = {}) => compileFilm({storyboard, timings: evenTimings(storyboard), kits, recipe, ...extra});
function frameAt(f, t) {
  const c = createCanvas(800, 450), ctx = c.getContext('2d'); ctx.scale(.5, .5); f.frame(ctx, t);
  const data = ctx.getImageData(0, 0, 800, 450).data;
  return {data, px: ([x, y]) => { const i = (Math.round(y / 2) * 800 + Math.round(x / 2)) * 4; return [data[i], data[i + 1], data[i + 2]]; }};
}
const isRed = ([r, g, b]) => r > 200 && g < 70 && b < 70;

test('in a film: the world is drawn inside its cloud, and only there; its regions are where it is drawn', async () => {
  const f = await film({story: {kit: 'red', frame: 'thought'}, stages: [{type: 'world', scene: 'b', enter: 'cut', world: {kit: 'blue'}}]}), cloud = thoughtCloud({});
  const rest = frameAt(f, 2);
  assert.ok(f.clock.start('b') > 2.5, 'the story is still on at 2 s');
  for (let y = 4; y < 900; y += 14) for (let x = 4; x < 1600; x += 14) {
    const red = isRed(rest.px([x, y]));
    if (red) assert.ok(insideCloud(cloud, [x, y], 1.01), `red at (${x}, ${y}), outside the cloud`);
    // (well inside: the paper softens in for a little way inside the outline, most in the valleys between scallops)
    if (insideCloud(cloud, [x, y], .86)) assert.ok(red, `inside the cloud at (${x}, ${y}), not the picture (${rest.px([x, y])})`);
  }
  assert.ok(!isRed(rest.px([1595, 5])) && !isRed(rest.px([5, 5])), 'the page round the cloud');
  // Before it opens, none of the world shows.
  const first = frameAt(f, .05); let red = 0;
  for (let i = 0; i < first.data.length; i += 4) if (isRed([first.data[i], first.data[i + 1], first.data[i + 2]])) red++;
  assert.equal(red, 0, 'at 0.05 s the cloud is not open yet');
  // The world's regions are where the cloud shows it: its box at rest; while it opens, where the drawn picture is.
  const box = t => f.regionsAt(t).find(r => r.path === 'story.all')?.box;
  box(2).forEach((v, i) => assert.ok(Math.abs(v - cloud.box[i]) < 1e-6, `at rest the world's region is the cloud's box (${box(2)})`));
  for (const t of [.5, .62]) {
    const drawn = frameAt(f, t), red = [Infinity, Infinity, -Infinity, -Infinity];
    for (let y = 0; y < 450; y++) for (let x = 0; x < 800; x++) { const i = (y * 800 + x) * 4; if (isRed([drawn.data[i], drawn.data[i + 1], drawn.data[i + 2]])) { red[0] = Math.min(red[0], 2 * x); red[1] = Math.min(red[1], 2 * y); red[2] = Math.max(red[2], 2 * x + 2); red[3] = Math.max(red[3], 2 * y + 2); } }
    const [x0, y0, x1, y1] = box(t);
    assert.ok(red[0] >= x0 - 3 && red[1] >= y0 - 3 && red[2] <= x1 + 3 && red[3] <= y1 + 3, `at ${t} s the drawn picture ${red} sits in its region ${box(t).map(Math.round)}`);
    assert.ok(red[2] - red[0] > .85 * (x1 - x0) && red[3] - red[1] > .75 * (y1 - y0), `and fills most of it (${red}, ${box(t).map(Math.round)})`);
  }
  // Before the cloud opens, the world is not on screen: no region, no point in it.
  assert.equal(box(.05), undefined, 'no region before the cloud opens');
  assert.equal(f.pointAt(.05, 800, 450).world, undefined, 'and no point in the world');
  assert.deepEqual(f.pointAt(2, ...cloud.centre).world.at, [800, 450], 'at rest, the cloud\'s middle is the world\'s');
  // The opening is a change of picture: a push or a camera move takes turns with it.
  const opening = f.changes.find(c => c.what === 'the thought cloud opening on the story');
  assert.deepEqual([opening.from, opening.to], [0, THOUGHT_ENTRANCE.settled]);
});

test('in a film: a world stage takes a frame, its entrance timed from its own scene; cloudBurst pops the very cloud', async () => {
  const f = await film({story: {kit: 'red'}, stages: [
    {type: 'world', scene: 'b', enter: 'cut', frame: {type: 'thought', corner: 'top-right', size: .7, seed: 12}, world: {kit: 'blue'}},
    {type: 'world', scene: 'c', enter: {type: 'cloudBurst', sound: 'tap'}, world: {kit: 'green'}}]});   // its settings: the frame's
  const cloud = thoughtCloud({corner: 'top-right', size: .7, seed: 12}), b = f.clock.start('b'), c = f.clock.start('c'), blue = ([r, g, bl]) => bl > 200 && r < 70 && g < 70;
  assert.ok(!blue(frameAt(f, b + .05).px(cloud.centre)), 'just into its scene, the cloud has not opened');
  const settled = frameAt(f, b + 2);
  assert.ok(blue(settled.px(cloud.centre)), 'then the blue world, in it');
  assert.ok(!blue(settled.px([30, 870])), 'and the page round it (the trail is toward the top right)');
  // The burst: until its pop, nothing of the green world shows; the thought's own paper and trail stay round the cloud
  // as the memory pales. After it, the green world fades up round the cloud and is uncovered in it.
  const start = c - .75, isGreen = ([r, g, bl]) => g > 150 && r < 100 && bl < 100;
  for (const e of [.05, .15, .29]) {
    const before = frameAt(f, start + e); let green = 0;
    for (let i = 0; i < before.data.length; i += 4) if (isGreen([before.data[i], before.data[i + 1], before.data[i + 2]])) green++;
    assert.equal(green, 0, `at ${e} of the burst, before its pop, no pixel of the next world`);
  }
  const pop = frameAt(f, start + .29);
  for (const {c: at} of cloud.trail) assert.ok(!isGreen(pop.px(at)) && pop.px(at).every(v => v > 200), `the trail at ${at.map(Math.round)} is still the thought's (${pop.px(at)})`);
  assert.ok(pop.px(cloud.centre).every(v => v > 230), `the memory has paled into the cloud's paper (${pop.px(cloud.centre)})`);
  const after = frameAt(f, start + .8);
  for (const {c: at} of cloud.trail) assert.ok(isGreen(after.px(at)), `after the pop the trail at ${at.map(Math.round)} has gone with the burst (${after.px(at)})`);
  assert.ok(f.sounds.some(s => s.type === 'tap' && Math.abs(s.time - (start + .3)) < 1e-9), 'its sound on the pop');
  assert.ok(frameAt(f, c + .5).px(cloud.centre)[1] > 200, 'after it, the green world');
});

test('bad frames refuse, naming the fix', async () => {
  const refuses = (value, re) => assert.throws(() => readThought(value, 'stage dream'), re);
  assert.equal(readThought(undefined, 'x'), null, 'left out: no frame');
  assert.deepEqual({...readThought('thought', 'x'), cloud: null}, {type: 'thought', corner: 'bottom-left', size: .8, seed: 3, color: null, ink: null, backdrop: null, cloud: null});
  assert.equal(readThought({type: 'thought', size: .7}, 'x').cloud, thoughtCloud({size: .7}), 'its cloud, the one cloudBurst draws with the same settings');
  refuses('dream', /stage dream: frame must be "thought" or \{"type": "thought", "corner"\?, "size"\?, "seed"\?, "color"\?, "ink"\?, "backdrop"\?\} \(a thought cloud is the one frame there is\), not "dream"/);
  refuses({type: 'cloud'}, /frame must be "thought" or/);
  // The settings are read by the one reader (settings.mjs), in the words a bad entrance setting gets.
  refuses({type: 'thought', corner: 'north'}, /stage dream: frame.corner must be bottom-left, bottom-right, top-left, top-right/);
  refuses({type: 'thought', size: 1.2}, /stage dream: frame.size must be a number 0.5–0.9/);
  refuses({type: 'thought', size: '0.8'}, /frame.size must be a number 0.5–0.9/);
  refuses({type: 'thought', seed: -1}, /frame.seed must be a number 0–10000/);
  refuses({type: 'thought', color: 'white'}, /frame.color must be a hex colour such as "#000000"/);
  refuses({type: 'thought', ink: 12}, /frame.ink must be a hex colour/);
  refuses({type: 'thought', at: [1, 2]}, /stage dream: frame has unsupported key at \(a thought frame takes corner, size, seed, color, ink, backdrop\)/);
  // In a film: a frame on a paper stage, and on the story of a film with a pushIn.
  await assert.rejects(film({story: {kit: 'red'}, stages: [{type: 'code', scene: 'b', enter: 'cut', frame: 'thought', code: {file: 'x.ts'}}]}),
    /stage b has a frame, and a frame is for a world \(the story, or a stage of "type": "world"\): a code stage has the page to itself/);
  await assert.rejects(film({story: {kit: 'red', frame: 'thought'}, pushIn: {after: 'a', rest: .3, caption: 'Now.'}, stages: []}),
    /the story: a frame is for a film without a pushIn/);
  await assert.rejects(film({story: {kit: 'red'}, stages: [{type: 'world', scene: 'b', frame: {type: 'thought', size: 2}, world: {kit: 'blue'}}]}), /stage b: frame.size must be a number 0.5–0.9/);
  // The story's spelling inside a world stage's world: the engine reads frame on the stage, beside world.
  await assert.rejects(film({story: {kit: 'red'}, stages: [{type: 'world', scene: 'b', world: {kit: 'blue', frame: 'thought'}}]}), /stage b: frame belongs on the stage, beside world \(the engine reads it there\), not inside world/);
  // Going through a thing into a world in a thought cloud: none of it is on the frame until its cloud opens.
  await assert.rejects(film({story: {kit: 'red'}, stages: [{type: 'world', scene: 'b', enter: {type: 'match', region: 'all'}, frame: 'thought', world: {kit: 'blue'}}]}),
    /stage b: the match goes to "all" in the picture it arrives at, and that world opens in a thought cloud \(its frame\): none of it is on the frame until the cloud has opened, after the change\. Enter it another way/);
  // A burst out of a thought pops that very cloud: a setting it gives that differs from the frame's refuses.
  await assert.rejects(film({story: {kit: 'red', frame: {type: 'thought', size: .7}}, stages: [{type: 'world', scene: 'b', enter: {type: 'cloudBurst', size: .6}, world: {kit: 'blue'}}]}),
    /stage b: the cloudBurst pops the thought cloud the story is in, and gives size 0.6 where that cloud has 0.7: leave size out \(it takes the thought's own\), or give both the same/);
  await film({story: {kit: 'red', frame: {type: 'thought', size: .7}}, stages: [{type: 'world', scene: 'b', enter: {type: 'cloudBurst', size: .7, corner: 'bottom-left'}, world: {kit: 'blue'}}]});   // the same: fine
});

test('a backdrop: the ground round the cloud — dark in with the entrance, only outside the cloud, gone on the burst\'s pop', async () => {
  // As written: a colour (flat), {color, vignette?} (soft), or null / left out (the shot's own ground).
  assert.deepEqual({...readThought({type: 'thought', backdrop: '#111111'}, 'x').backdrop}, {color: '#111111', vignette: 0});
  assert.deepEqual({...readThought({type: 'thought', backdrop: {color: '#2b2622'}}, 'x').backdrop}, {color: '#2b2622', vignette: .5});
  assert.deepEqual({...readThought({type: 'thought', backdrop: {color: '#2b2622', vignette: .8}}, 'x').backdrop}, {color: '#2b2622', vignette: .8});
  assert.equal(readThought({type: 'thought', backdrop: null}, 'x').backdrop, null); assert.equal(readThought('thought', 'x').backdrop, null);
  const refuses = (backdrop, re) => assert.throws(() => readThought({type: 'thought', backdrop}, 'the story'), re);
  refuses('black', /the story: frame.backdrop is the ground round the cloud: a hex colour such as "#111111" \(flat\), or \{"color": "#2b2622", "vignette": 0.5\} \(lighter near the cloud, darker at the frame's edges; vignette 0–1\), or null \(the shot's own ground\), not "black"/);
  refuses(7, /frame.backdrop is the ground round the cloud: .*, not 7/);
  refuses({colour: '#111111'}, /frame.backdrop has unsupported key colour \(a backdrop takes color and vignette\)/);
  refuses({color: 'dark'}, /frame.backdrop.color must be a hex colour such as "#2b2622", not "dark"/);
  refuses({}, /the story: frame.backdrop needs color: a hex colour such as "#2b2622"/);
  refuses({color: '#111111', vignette: 2}, /frame.backdrop.vignette is how much lighter near the cloud and darker at the edges: a number 0–1 \(0 is flat; 0.5 by default\), not 2/);
  // In a film: the dark darkens in as the trail rises, is drawn only round the cloud, and the burst takes it away on its pop.
  const f = await film({story: {kit: 'red', frame: {type: 'thought', backdrop: '#111111'}}, stages: [{type: 'world', scene: 'b', enter: 'cloudBurst', world: {kit: 'blue'}}]});
  const cloud = thoughtCloud({}), lum = px => px[0] + px[1] + px[2], corner = [1590, 10];
  const away = ([x, y]) => !insideCloud(cloud, [x, y], 1.15) && cloud.trail.every(({c, r}) => Math.hypot(x - c[0], y - c[1]) > r + 40);
  const darkening = [.05, .4, 1].map(t => lum(frameAt(f, t).px(corner)));
  assert.ok(darkening[0] > darkening[1] && darkening[1] > darkening[2], `it darkens in with the entrance (${darkening})`);
  assert.ok(darkening[0] > 600, `not a hard cut: at 0.05 s the page still shows (${darkening[0]})`);
  assert.ok(frameAt(f, .76).px(corner).every(v => Math.abs(v - 0x11) <= 2), `dark by 0.75 s, as the cloud opens (${frameAt(f, .76).px(corner)})`);
  const rest = frameAt(f, 2);
  for (let y = 4; y < 900; y += 22) for (let x = 4; x < 1600; x += 22) {
    if (away([x, y])) assert.ok(rest.px([x, y]).every(v => Math.abs(v - 0x11) <= 2), `round the cloud at (${x}, ${y}): the backdrop (${rest.px([x, y])})`);
    if (insideCloud(cloud, [x, y], .86)) assert.ok(isRed(rest.px([x, y])), `inside the cloud at (${x}, ${y}): the picture, no backdrop (${rest.px([x, y])})`);
  }
  for (const {c} of cloud.trail) assert.ok(lum(rest.px(c)) > 600, `a trail circle reads on the dark: its paper (${rest.px(c)})`);
  // The burst: before its pop the dark is still there; after it, nothing of it is left on the next shot.
  const start = f.clock.start('b') - .75, blueish = ([r, g, b]) => b > 200 && r < 40 && g < 40;
  assert.ok(frameAt(f, start + .29).px(corner).every(v => Math.abs(v - 0x11) <= 2), 'just before the pop, still the backdrop');
  // Mid-fall, 0.15 s after the pop, the old shot round the cloud is a quarter left (eased out: fast as the puffs fly).
  const mid = frameAt(f, start + .45).px(corner), left = (255 - mid[2]) / (255 - 0x11);
  assert.ok(left > .15 && left < .35, `mid-fall, ${left.toFixed(2)} of the dark left round the cloud`);
  const after = frameAt(f, start + .62); let dark = 0;
  for (let i = 0; i < after.data.length; i += 4) if (after.data[i] + after.data[i + 1] + after.data[i + 2] < 120) dark++;
  assert.equal(dark, 0, '0.32 s after the pop no dark is left anywhere');
  assert.ok(blueish(after.px(corner)), `the next shot round where the cloud was (${after.px(corner)})`);
  // A vignette: lighter near the cloud than at the frame's edge.
  const soft = await film({story: {kit: 'red', frame: {type: 'thought', backdrop: {color: '#2b2622', vignette: .8}}}, stages: []}), lit = frameAt(soft, 2);
  const near = [1100, cloud.box[3] + 44], edge = [1594, 894];   // just under the cloud (past its shadow), and the far corner
  assert.ok(lum(lit.px(near)) > lum(lit.px(edge)) + 20, `lighter by the cloud (${lit.px(near)}) than at the edge (${lit.px(edge)})`);
  // A colour with its own alpha keeps it, flat or vignetted: half-black over white is grey, never black.
  for (const backdrop of [{color: '#00000080', vignette: 0}, {color: '#00000080', vignette: .2}]) {
    const c = createCanvas(160, 90), x = c.getContext('2d'); x.scale(.1, .1); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 1600, 900);
    drawThought(x, cloud, () => {}, {backdrop});
    const [r] = x.getImageData(158, 1, 1, 1).data;
    assert.ok(r > 80 && r < 170, `${JSON.stringify(backdrop)}: the far corner half dark (${r})`);
  }
});

test('the README\'s thought table is the settings: each one, with its default', () => {
  const lines = readFileSync(new URL('../README.md', import.meta.url), 'utf8').split('\n');
  const head = lines.findIndex(l => l.startsWith('| setting | what it is | default |'));
  assert.ok(head > 0 && lines.slice(head - 30, head).some(l => l === '### A thought cloud'), 'the README has the thought table under its heading');
  const rows = [];
  for (const line of lines.slice(head + 2)) { if (!line.startsWith('|')) break; rows.push(line.split('|').slice(1, -1).map(c => c.trim())); }
  const named = rows.flatMap(([cell, , dflt]) => [...cell.matchAll(/`(\w+)`/g)].map(m => [m[1], dflt]));
  assert.deepEqual(named.map(([n]) => n), [...Object.keys(THOUGHT_SETTINGS), 'backdrop'], 'every setting, in order, and the backdrop');
  for (const [name, dflt] of named) {
    if (name === 'backdrop') { assert.match(dflt, /the shot's own ground/, 'left out, the backdrop is the shot\'s own ground'); continue; }
    const d = THOUGHT_SETTINGS[name].default;
    assert.ok(d === null ? /the theme's/.test(dflt) : dflt === `\`${d}\``, `${name}'s default, ${d}, is in its row (${dflt})`);
  }
  assert.ok(lines.some(l => l.includes('"frame": "thought"')), 'and an example that names the frame');
});
