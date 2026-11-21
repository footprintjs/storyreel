// The isometric world kit (src/kits/isometric): StoryDeck's maps in a film, every number footprint-story's. The worked
// example (examples/iso-world) is built and its frames checked: the pixels are pinned in golden.json (film.test.mjs) and
// drawn the same in any order; each packet stands on its cable's line; each name is fitted as a deck fits it; the camera
// frames a block by its name; and a map that cannot be drawn as written is refused, naming the entry and the fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {arrange, arrangeByGroup, routes, wordsToFit, isometric} from 'footprint-story/isometric';
import {rideProfile} from 'footprint-story/motion';
import {compileFilm, evenTimings, frameHashes, loadTheme} from '../src/index.mjs';
import {geometryOf} from '../src/geometry.mjs';
import {isometricKit, compileIsometric, ISO_FIT, onStops} from '../src/kits/isometric/index.mjs';
import {compileExample} from './golden.mjs';

const dir = fileURLToPath(new URL('../examples/iso-world/', import.meta.url));
const recipe = JSON.parse(readFileSync(dir + 'recipe.json', 'utf8'));
const film = await compileExample('iso-world');
const theme = loadTheme('paper');
const worldOf = (spec, where = 'the story') => compileIsometric(spec, {clock: film.clock, theme, where});
const story = worldOf(recipe.story), desk = worldOf(recipe.stages[0].world, 'stage desk');

test('the example builds: the story placed from its wires, the desk by hand on its grid, every wire along the floor, nothing to say', () => {
  assert.equal(story.map.placed, 'build');
  assert.equal(story.map.fitted, true);
  assert.equal(desk.map.placed, 'hand');
  assert.equal(desk.map.tile, 120, 'a grid written in numbers is that grid');
  assert.ok([...story.map.cables, ...desk.map.cables].every((c) => c.along), 'every wire is a cable on the floor');
  assert.deepEqual(desk.map.cables[0].ports, ['rj45', 'p1'], 'the cable plugs into the ports it names');
  assert.deepEqual([...story.notes, ...desk.notes], [], 'the example lies well: no note');
});

test('a film and a deck place the same map the same way: arrange / arrangeByGroup, routes, wordsToFit', () => {
  const blocks = recipe.story.blocks.map((b) => ({name: b.name, size: b.size ?? [2, 2, 1], group: b.group ?? null}));
  const links = recipe.story.wires.map((w) => w.arrow.split(' to '));
  const placed = arrangeByGroup(blocks, links);
  assert.deepEqual(story.map.blocks.map((b) => b.at), placed.map((p) => [...p]), 'grouped: arrangeByGroup, unchanged');
  const things = blocks.map((b, i) => ({name: b.name, at: placed[i], size: b.size, round: recipe.story.blocks[i].kind === 'cylinder'}));
  const laid = routes(things, links);
  laid.forEach((r, i) => assert.equal(story.map.cables[i].bends, r.bends, `${r.from} to ${r.to}: the route's bends`));
  const ungrouped = worldOf({blocks: blocks.map(({name, size}) => ({name, size})), wires: recipe.story.wires.map(({arrow}) => ({arrow}))});
  assert.deepEqual(ungrouped.map.blocks.map((b) => b.at), arrange(blocks.map(({name, size}) => ({name, size})), links, {across: true}).things.map((t) => [...t.at]), 'no group: arrange across the frame');
  // a name fitted to its top with the same rule a deck uses (deck/iso.js · fitName)
  const grid = isometric({tile: story.map.tile, origin: [0, 0]});
  for (const b of story.map.blocks) {
    const label = recipe.story.blocks.find((x) => x.name === b.name).label, round = b.kind === 'cylinder';
    const want = wordsToFit(label, (high) => ISO_FIT.clear * grid.room({at: b.at, size: b.size, round}, high), ISO_FIT.name);
    assert.deepEqual({lines: b.lines, size: b.nameSize, fits: b.fits}, {lines: want.lines, size: want.size, fits: true}, `${b.name}: fitted as a deck fits it`);
  }
  assert.deepEqual(story.map.blocks.find((b) => b.name === 'lb').lines, ['Load', 'Balancer'], 'a long name breaks onto two lines');
});

test('pixels: the frames are pinned, and every moment draws the same picture whatever was drawn before', () => {
  const times = Array.from({length: 12}, (_, k) => +((k + 0.5) * film.total / 12).toFixed(3));
  const first = frameHashes(film, {times, width: 320}), again = frameHashes(film, {times: [...times].reverse(), width: 320});
  for (const t of times) assert.equal(again[t], first[t], `the frame at ${t} s is the same drawn again, last first`);
  assert.ok(new Set(Object.values(first)).size > 6, 'the picture moves: packets ride, blocks come in');
});

test('packets ride their cables: on the line at every moment, at the share rideProfile gives, and the geometry audit finds none off it', () => {
  const g = geometryOf(film);
  assert.ok(g.checked.mounts > 100, `packets were checked (${g.checked.mounts})`);
  assert.deepEqual(g.worst, [], 'no packet comes off its cable');
  // a steady ride is linear in time: halfway through a run the packet is halfway along its line, by length
  const w = worldOf({blocks: [{name: 'a', at: [0, 0]}, {name: 'b', at: [6, 0]}], wires: [{arrow: 'a to b 0', packets: 1, speed: 4}]});   // drawn straight, so length is distance
  const [cable] = w.map.cables, parts = w.parts(2).segments;
  assert.equal(cable.period, 4);
  const at = parts['wires[0] packet 1'].a, [x0, y0] = cable.points[0];
  assert.ok(Math.abs(Math.hypot(at[0] - x0, at[1] - y0) - cable.length / 2) < 1.5, 'halfway in time, halfway by length');
  assert.ok(Math.abs(onStops(rideProfile([0.15, 0.2], 400), 0.5) - 0.5) < 0.2, 'eased ends are rideProfile\'s stops');
});

test('names: every block and wire is named for the camera, the focus framed the database by its name, every label reaches the reading check', () => {
  const t = film.clock.at(['map', 'writes a line']) + 0.5, names = film.regionsAt(t).filter((r) => r.name).map((r) => r.name);
  for (const n of ['you', 'lb', 'api', 'db', 'logs', 'w1', 'w4', 'prod']) assert.ok(names.includes(n), `"${n}" is named on the frame`);
  assert.equal(film.regionsAt(t).find((r) => r.name === 'db').path, 'story.blocks[3]');
  assert.ok(film.regionsAt(film.clock.at(['map', 'A request starts']) + 0.1).every((r) => r.name !== 'db'), 'a block is not named before it comes in');
  const texts = story.texts().map((l) => l.text);
  assert.ok(texts.includes('Load Balancer') && texts.includes('Production account') && texts.includes('HTTPS'));
  assert.deepEqual(film.reading, [], 'every label is up long enough to read');
});

test('refusals name the recipe entry and the fix', () => {
  const two = (more = {}) => ({blocks: [{name: 'a'}, {name: 'b'}], ...more});
  assert.throws(() => worldOf(two({wires: [{arrow: 'a to c'}]}), 'stage map'), /stage map: isometric wires\[0\] \(a to c\): arrow "a to c" names "c", which is no block here — the blocks are a, b/);
  assert.throws(() => worldOf(two({wires: [{arrow: 'a.p9 to b'}]})), /a has no port "p9" — give it ports/);
  assert.throws(() => worldOf({blocks: [{name: 'a', at: [0, 0]}, {name: 'b'}]}), /"b" has no at and "a" has one: the blocks are placed from the wires only when none has an at/);
  assert.throws(() => worldOf({blocks: [{name: 'a'}, {name: 'a'}]}), /blocks\[1\] \("a"\): "a" is the name of blocks\[0\] too/);
  assert.throws(() => worldOf(two({wire: []})), /the isometric world takes kit, blocks, floors, wires, grid, area, strict — not "wire"/);
  assert.throws(() => worldOf(two({wires: [{arrow: 'a to b', speed: 2}]})), /speed says how its packets ride — give it packets too/);
  assert.throws(() => worldOf({blocks: [{name: 'a', at: [0, 0]}, {name: 'b', at: [3, 0]}], wires: [{arrow: 'a to b', packets: 1, speed: '9000px'}]}), /a run takes 0.5 to 60 s — give it \d+(\.\d)?px to \d+(\.\d)?px, or its seconds/);
  assert.throws(() => worldOf({blocks: [{name: 'a', kind: 'cylinder', size: [2, 1, 1]}]}), /a cylinder is round/);
  assert.throws(() => worldOf({blocks: [{name: 'lap', ports: [{name: 'p', at: [1, 0.5, 2]}]}]}), /blocks\[0\] \("lap"\):/);
  assert.throws(() => worldOf({blocks: []}), /give it blocks/);
});

test('a map that does not lie well is said, with the fix; strict refuses it', () => {
  // a wire from the far block to one straight in front of another tall one: it must pass behind it
  const spec = {blocks: [{name: 'app', at: [0, 0]}, {name: 'logs', at: [3, 3], size: [2, 2, 3]}, {name: 'db', at: [5, 6]}], wires: [{arrow: 'app to db'}]};
  const w = worldOf(spec, 'stage map'), said = w.notes.map((n) => n.message).join('\n');
  assert.ok(w.notes.length, 'a note is given');
  assert.match(said, /stage map: isometric wires\[0\] \(app to db\): /, 'naming the entry');
  assert.throws(() => worldOf({...spec, strict: true}, 'stage map'), /stage map: the isometric map has \d+ warnings? \(strict: true\)/);
  const tight = worldOf({blocks: [{name: 'a', size: [1, 1, 1], label: 'An extraordinarily long name for so small a block'}]});
  assert.match(tight.notes[0].message, /does not fit its top even on two lines at 16 px — shorten it, or give the block a bigger top/);
});

test('the kit is passed in kits and named by a world', async () => {
  const sb = {scenes: [{id: 'one', narration: 'A map of two blocks.'}]};
  const one = await compileFilm({storyboard: sb, timings: evenTimings(sb), recipe: {story: {kit: 'isometric', blocks: [{name: 'a', label: 'A'}, {name: 'b', label: 'B'}], wires: [{arrow: 'a to b', packets: 1}]}}, kits: [isometricKit]});
  assert.ok(one.regionsAt(0.5).some((r) => r.name === 'b' && r.path === 'story.blocks[1]'));
  await assert.rejects(compileFilm({storyboard: sb, timings: evenTimings(sb), recipe: {story: {kit: 'isometric', blocks: [{name: 'a', at: [0, 0]}, {name: 'b'}]}}, kits: [isometricKit]}), /the story: isometric "b" has no at/);
});
