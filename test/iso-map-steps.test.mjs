// The isometric kit builds its maps with footprint-story's steps (buildIsoMap with the film policy), not a copy of them
// (0.39.0). For the example's two worlds and one map with every difference between a deck and a film, the kit's built
// map is the map buildIsoMap builds from a spec written here by hand, and each piece reads the built map's own entries;
// no file of the kit calls a step itself; and the refusals the move changed say the entry and the fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildIsoMap, ISO_MAP_POLICIES} from 'footprint-story/isometric';
import {readMap} from '../src/kits/isometric/read.mjs';
import {buildMap} from '../src/kits/isometric/build.mjs';
import {compileIsometric, ISO_FIT} from '../src/kits/isometric/index.mjs';

const kitDir = fileURLToPath(new URL('../src/kits/isometric/', import.meta.url));
const recipe = JSON.parse(readFileSync(fileURLToPath(new URL('../examples/iso-world/recipe.json', import.meta.url)), 'utf8'));
const kitMap = (world, where = 'the story') => buildMap(readMap(world, where), where);
const clock = {at: () => 0};

/**
 * A recipe world as buildIsoMap's spec, written out here from the recipe's own keys (not by the kit's specOf): a block a
 * 2 × 2 × 1 when it gives no size, a wire's arrow split into its ends, a trailing bend drawing it straight, a floor with
 * a size alone at [0, 0], the whole frame the area, each piece's `who` its place in the recipe.
 */
function handSpec(world) {
  const end = (text, blocks) => { const b = blocks.find((x) => x.name === text); if (b) return {block: text, port: null}; const dot = text.lastIndexOf('.'); return {block: text.slice(0, dot), port: text.slice(dot + 1)}; };
  const blocks = world.blocks.map((b, i) => ({name: b.name, kind: b.kind ?? 'block', at: b.at ? [b.at[0], b.at[1], b.at[2] ?? 0] : null, size: b.size ?? [2, 2, 1], label: b.label ?? null, small: b.small ?? null,
    rule: b.break ?? null, group: b.group ?? null, ports: b.ports ?? [], who: `isometric blocks[${i}] ("${b.name}")`}));
  return {
    who: 'the isometric map', blocks,
    floors: (world.floors ?? []).map((f, i) => ({name: f.name ?? null, at: f.at ?? (f.size ? [0, 0] : null), size: f.size ?? null, label: f.label ?? null, group: f.group ?? null, who: `isometric floors[${i}]${f.name ? ` ("${f.name}")` : ''}`})),
    wires: (world.wires ?? []).map((w, i) => {
      const [, from, to, bend] = /^(\S+) to (\S+)(?: (\S+))?$/.exec(w.arrow);
      return {name: w.name ?? null, from: end(from, world.blocks), to: end(to, world.blocks), straight: bend !== undefined, who: `isometric wires[${i}]${w.name ? ` ("${w.name}")` : ` (${w.arrow})`}`};
    }),
    grid: world.grid ? {tile: world.grid.tile, origin: world.grid.at} : null,
    area: world.area ?? [0, 0, 1600, 900],
  };
}

/** Where a deck and a film differ (the film fits a small line, and holds an ungrouped labelled floor in the picture), and cylinders, ports, a break rule, a straight wire, a floor with a size alone. */
const DIFFERENCES = {blocks: [
  {name: 'web', label: 'Web servers', small: 'three of them', break: 'fill', size: [3, 2, 1.2], ports: [{name: 'out', at: [3, 1, 0.3]}]},
  {name: 'cache', kind: 'cylinder', label: 'Cache', small: 'redis', size: [1.6, 1.6, 1]},
  {name: 'queue', label: 'Queue'}, {name: 'jobs', label: 'Jobs', group: 'workers'}, {name: 'mail', label: 'Mail', group: 'workers'}],
floors: [{label: 'The whole system, end to end'}, {name: 'w', group: 'workers', label: 'Workers'}, {size: [3, 3]}],
wires: [{arrow: 'web.out to queue'}, {arrow: 'web to cache 0'}, {arrow: 'queue to jobs', name: 'q'}, {arrow: 'jobs to mail'}]};

/**
 * Placed by hand and listed front first, the front block standing over the back one on the frame: the paint order is
 * the built map's (the back first), not the order written. (Blocks far apart may be painted in any order: backToFront
 * orders only what overlaps.)
 */
const FRONT_FIRST = {blocks: [{name: 'front', at: [2, 2], label: 'Front'}, {name: 'back', at: [0, 0], label: 'Back'}]};

const WORLDS = {'the story': recipe.story, 'stage desk': recipe.stages[0].world, 'differences': DIFFERENCES, 'front first': FRONT_FIRST};

test('the kit\'s built map is buildIsoMap\'s, with the film policy, for the example\'s worlds and a map of every difference', () => {
  for (const [where, world] of Object.entries(WORLDS)) {
    const map = kitMap(world, where), want = buildIsoMap(handSpec(world), ISO_MAP_POLICIES.film);
    assert.deepEqual(map.built, want, `${where}: the same built map`);
    assert.ok(Object.isFrozen(map.built) && Object.isFrozen(map.built.shapes[0].faces[0]), `${where}: frozen plain data`);
  }
  assert.equal(ISO_FIT, ISO_MAP_POLICIES.film, 'the kit\'s numbers are footprint-story\'s film policy');
  // the differences show in numbers: a deck's policy builds the same spec otherwise
  const deck = buildIsoMap(handSpec(DIFFERENCES), ISO_MAP_POLICIES.deck), film = kitMap(DIFFERENCES, 'differences').built;
  assert.notDeepEqual(deck.view, film.view, 'a film holds the labelled floor in its picture, a deck does not');
  assert.ok(film.smalls[0] && deck.smalls[0] === null, 'a film fits the small line, a deck leaves it as written');
});

test('each piece reads the built map\'s own entries, never a copy; the grid is made again from its numbers', () => {
  for (const [where, world] of Object.entries(WORLDS)) {
    const map = kitMap(world, where), {built} = map;
    map.blocks.forEach((b, i) => {
      assert.equal(b.at, built.at[i]); assert.equal(b.shape, built.shapes[i]); assert.equal(b.fitted, built.names[i]); assert.equal(b.smallFitted, built.smalls[i]);
    });
    map.floors.forEach((f, i) => {
      assert.equal(f.shape, built.floorShapes[i]); assert.equal(f.place, built.floorLabels[i]); assert.deepEqual([f.at, f.size], [built.floorTiles[i].at, built.floorTiles[i].size]);
    });
    map.wires.forEach((w, i) => assert.equal(w.route, built.routes[i]));
    assert.deepEqual(map.order.map((b) => b.name), built.order);
    if (where === 'front first') assert.deepEqual(built.order, ['back', 'front'], 'the furthest first, whatever order the recipe wrote');
    assert.equal(map.placed, built.placed);
    assert.deepEqual([map.grid.tile, map.grid.origin, map.grid.rise], [built.view.tile, built.view.origin, built.view.rise], `${where}: the grid from the built map's numbers`);
  }
});

test('no file of the kit runs a map step itself: placement, routes, the grid, faces, names, order and floor labels are buildIsoMap\'s', () => {
  // the steps' own calls (footprint-story/isometric · mapSteps.js); the kit reads what they made
  const STEPS = ['arrange', 'arrangeByGroup', 'routes', 'gridFor', 'roundOutline', 'wordsToFit', 'floorLabelPlace', 'backToFront', 'shapePiece', 'GROUP_MARGIN'];
  for (const file of readdirSync(kitDir).filter((f) => f.endsWith('.mjs'))) {
    const source = readFileSync(kitDir + file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    // the name itself, imported or called — not a key of what was built (`built.routes`)
    for (const step of STEPS) assert.ok(!new RegExp(`(?<![.\\w$])${step}\\b`).test(source), `${file} names ${step}: a copy of a map step`);
    // and by what it imports: every name from footprint-story/isometric is named (never `import *` or a dynamic import,
    // through which `ns.wordsToFit(…)` would pass the look above), and none of them is a step
    assert.ok(!/import\s*\*\s*as\s+\w+\s+from\s+['"]footprint-story\/isometric['"]|import\(\s*['"]footprint-story\/isometric['"]/.test(source), `${file} imports footprint-story/isometric whole: name what it uses`);
    for (const [, names] of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]footprint-story\/isometric['"]/g)) {
      for (const name of names.split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean)) assert.ok(!STEPS.includes(name), `${file} imports ${name}: a map step`);
    }
  }
  // the spec the kit builds with is the one it keeps for the map flow (flow.mjs): made once
  assert.match(readFileSync(kitDir + 'build.mjs', 'utf8'), /const spec = frozen\(specOf\(map, where\)\);\n[\s\S]*buildIsoMap\(spec, ISO_FIT, \{choices: STYLE_CHOICES\}\)/);
  assert.match(readFileSync(kitDir + 'flow.mjs', 'utf8'), /runMapFlow\(map\.spec, ISO_FIT, \{choices: STYLE_CHOICES,/);
});

test('what moved changed for a writer: a floor with a size alone still stands at [0, 0], and each changed refusal names the entry and the fix', () => {
  // the spec takes a floor's at and size together: read.mjs gives a floor with a size alone [0, 0], as before
  const sized = compileIsometric({blocks: [{name: 'a', at: [1, 1]}], floors: [{size: [4, 4], label: 'Floor'}]}, {clock, where: 'stage map'});
  assert.deepEqual([sized.map.floors[0].at, sized.map.floors[0].size], [[0, 0], [4, 4]]);
  // a cylinder a billionth from round: refused in the entry's words (before, the grid refused it with no entry named)
  assert.throws(() => compileIsometric({blocks: [{name: 'db', kind: 'cylinder', size: [2, 2 + 1e-12, 1]}]}, {clock, where: 'stage map'}),
    /^Error: stage map: isometric blocks\[0\] \("db"\): a cylinder is round — its size is \[wide, wide, high\], the same width and depth/);
  // the map-wide refusals name the map (before: "the isometric blocks cannot be placed", "isometric picture (fitted …)")
  assert.throws(() => compileIsometric({blocks: [{name: 'a', size: [300, 2, 1]}, {name: 'b'}], wires: [{arrow: 'a to b'}]}, {clock, where: 'stage map'}),
    /^Error: stage map: the isometric map: the blocks cannot be placed from their wires: "a"'s size is .* — or give every block an at$/);
  assert.throws(() => compileIsometric({blocks: [{name: 'a', at: [0, 0]}, {name: 'b', at: [100000, 100000]}]}, {clock, where: 'stage map'}),
    /^Error: stage map: the isometric map: its picture \(fitted into the area\): origin is/);
  // a floor's refusals keep their words
  assert.throws(() => compileIsometric({blocks: [{name: 'a', at: [0, 0]}, {name: 'b', at: [300, 0]}], floors: [{label: 'x'}]}, {clock, where: 'stage map'}),
    /^Error: stage map: isometric floors\[0\]: fitted round its blocks the floor would be 304 by 4 tiles, and a floor is at most 256 a side — give it an at and a size of its own, or take it out$/);
});

test('a recipe entry of any length is named whole: the spec is handed the piece\'s words, the entry put back on a refusal', () => {
  // a spec's `who` is at most 200 letters; the entry's name is the film's
  const where = `stage ${'a-very-long-scene-name-'.repeat(12)}`;
  assert.equal(kitMap({blocks: [{name: 'x'}, {name: 'y'}], wires: [{arrow: 'x to y'}]}, where).built.blocks[0].who, 'isometric blocks[0] ("x")');
  assert.throws(() => compileIsometric({blocks: [{name: 'a', at: [0, 0]}, {name: 'b', at: [300, 0]}], floors: [{label: 'x'}]}, {clock, where}),
    (e) => e.message.startsWith(`${where}: isometric floors[0]: fitted round its blocks`));
});
