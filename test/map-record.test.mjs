// A map's own record (src/check/maps.mjs, src/kits/isometric/flow.mjs): a check builds each isometric world's map again
// with footprint-story's map flow and keeps that run's record, so `storyreel log --why at --map story` says why a block
// stands where it does from the record alone. The map flow's map must be the kit's; a difference is said aloud.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, rmSync, writeFileSync, readFileSync, mkdirSync, chmodSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readInputs, check, log} from '../src/tools.mjs';
import {listRuns, saveRun, RUNS, RUNS_KEPT, mapRecordBeside} from '../src/runlog.mjs';
import {runMaps, mapLines, MAPS_MOST} from '../src/check/index.mjs';
import {firstDifference, mapRun} from '../src/kits/isometric/flow.mjs';
import {compileExample} from './golden.mjs';
import {tempDir} from './tmp.mjs';

const project = fileURLToPath(new URL('./fixtures/iso-world/', import.meta.url));
const film = await compileExample('iso-world');
const ask = (out, why, map, more = {}) => log({cwd: project, out, run: '1', why, map, ...more});
const mapFiles = out => readdirSync(path.join(out, ...RUNS)).filter(n => /\.map-\d+\.record\.jsonl$/.test(n));

test('a check keeps a record for each map, and log --why --map answers from it: the place step and its decision, the grid\'s, a name\'s size', async t => {
  const out = tempDir('map-why', t);
  const said = await check(await readInputs({cwd: project, out}));
  // the call offered names the run by its id (a run's number moves when another is saved)
  // (the example's focus flies its camera between shots since 0.47.0, so the flights' line comes after: test/flight.test.mjs)
  const id = listRuns(out)[0].id;
  assert.ok(said.endsWith(`\nmaps: story, stages[0] — why a block stands where it does: storyreel log --run ${id} --why at --map story\ncameras: focus — why a flight takes its time: storyreel log --run ${id} --why flight-0 --camera focus (findings-<k>: what its critics found)`), said.split('\n').slice(-2).join('\n'));
  assert.doesNotMatch(said, /drift|not kept/);
  assert.equal(mapFiles(out).length, 2, 'one record a map, beside the run');
  assert.deepEqual(readdirSync(path.join(out, ...RUNS)).filter(n => n.startsWith('pending-')), [], 'nothing left pending');
  // where the story's blocks stand: written by the place step's build branch, which the place decision let run, and why
  const at = (await ask(out, 'at', 'story')).split('\n');
  assert.match(at[0], /^at = \[\[1\.5,16,0\],/);
  assert.equal(at[1], 'place: build (build#2) [wrote: at]');
  assert.match(at.join('\n'), /\n {2}place \(place#1\) ← \[control: no block has an at: the build places them from their wires, group by group \(1 group\)\] \[wrote: placed, placedWhy\]/);
  // the grid: fitted, through the grid decision
  const view = await ask(out, 'view', 'story');
  assert.match(view, /^view = \{"tile":\[\d+,\d+\],"origin":/);
  assert.match(view, /\ngrid: fitted \(fitted#6\) \[wrote: view\]\n/);
  assert.match(view, /← \[control: no grid is written: it is fitted so the picture fills the area\]/);
  // a name's size: the names step, which read the grid
  assert.match(await ask(out, 'names', 'story'), /^names = \[\{"lines":\["You"\],"size":26,"fits":true\}.*\nnames \(names#8\) \[wrote: names, smalls\]\n[\s\S]*grid: fitted \(fitted#6\) ← via view/);
  // the desk's blocks are placed by hand, and the record says so; its grid is written in numbers
  const hand = await ask(out, 'at', 'stages[0]');
  assert.match(hand, /^at = \[\[0,5,0\],\[5,1,0\],\[11,1,0\]\]\nplace: hand \(hand#2\) \[wrote: at\]\n/);
  assert.match(hand, /← \[control: every block has an at: the map placed them\]/);
  assert.match(await ask(out, 'view', 'stages[0]'), /\[control: the map writes its grid in numbers: its tile and where the floor's far corner stands\]/);
  // a key no step writes names those that are
  assert.match(await ask(out, 'nothing', 'story'), /^nothing: no stage of this run wrote it \(a map's steps write placed, placedWhy, at, routes, .*names, smalls, order/);
});

test('refusals name what there is: an unknown map, --map without --why, a bare --map, a run kept by another feature', async t => {
  const out = tempDir('map-refused', t);
  await check(await readInputs({cwd: project, out}));
  await assert.rejects(ask(out, 'at', 'desk'), {message: 'run 1 has no map "desk": its maps are story, stages[0]'});
  await assert.rejects(ask(out, 'at', '../../etc'), /run 1 has no map "\.\.\/\.\.\/etc": its maps are story, stages\[0\]/);
  await assert.rejects(log({cwd: project, out, run: '1', map: 'story'}), /--map picks the record --why reads: ask with --why/);
  await assert.rejects(ask(out, 'at', true), /--map names one of the run's maps by its world's place in the recipe/);
  // --why with no key, with --map: the keys a map's steps write, not the check's steps
  await assert.rejects(ask(out, true, 'story'), /^Error: --why names a value of the map, one of what its steps write: placed, placedWhy, at, routes, .*floorPaints$/);
  // a check kept before 0.40.0 (no maps, no worlds in its file) is not said to have no isometric world
  const run = listRuns(out)[0], saved = JSON.parse(readFileSync(run.file, 'utf8')), {maps: _maps, worlds: _worlds, ...old} = saved;
  writeFileSync(run.file, JSON.stringify(old));
  await assert.rejects(ask(out, 'at', 'story'), {message: 'run 1 was kept before 0.40.0, which kept no map records: run storyreel check again, then ask that run'});
  writeFileSync(run.file, JSON.stringify(saved));
  // the check's own record is read as before when no map is named
  assert.match(await log({cwd: project, out, run: '1', why: 'verdict'}), /^verdict = "fix"\n/);
  // a map whose record is gone says so, never another map's answer
  rmSync(listRuns(out)[0].maps[0].recordFile);
  await assert.rejects(ask(out, 'at', 'story'), /run 1's map story kept no record \(it could not be written when the check ran\)/);
  // a run of another feature keeps no map, and says which does
  const {review, loadProject} = await import('../src/tools.mjs');
  await review(await loadProject({cwd: project, out}));
  await assert.rejects(ask(out, 'at', 'story'), /run 1 \(review\) kept no map: a check keeps one for each isometric world/);
});

test('a film with no isometric world costs nothing new: no map run, no map record, and --map says so naming the worlds there are', async t => {
  const out = tempDir('map-none', t);
  assert.ok(!('mapRuns' in await compileExample('hello')), 'the film has no map runs to hand out');
  const said = await check(await readInputs({cwd: project, out, plain: 'true'}));
  assert.doesNotMatch(said, /maps?:|drift/);
  assert.deepEqual(mapFiles(out), []);
  await assert.rejects(ask(out, 'at', 'story', {plain: 'true'}), {message: 'run 1 kept no map: its film has no isometric world — its worlds are story (blank)'});
});

test('the map flow builds the very map the kit drew; a difference is found, and said aloud, never silently', async () => {
  assert.deepEqual(film.mapRuns.map(m => [m.name, m.kit]), [['story', 'isometric'], ['stages[0]', 'isometric']]);
  for (const m of film.mapRuns) assert.equal((await m.run()).differs, null, `${m.name}: the map flow's map is the kit's`);
  // where two maps part, by path, with both values
  assert.equal(firstDifference({at: [[1, 2, 0]], view: {tile: [96, 48]}}, {at: [[1, 2, 0]], view: {tile: [96, 48]}}), null);
  assert.equal(firstDifference({at: [[1, 2, 0], [3, 4, 0]]}, {at: [[1, 2, 0], [3, 5, 0]]}), 'at[1][1]: 4 here, 5 in the kit\'s');
  assert.equal(firstDifference({order: ['a']}, {order: ['a', 'b']}), 'order[1]: undefined here, "b" in the kit\'s');
  // a kit map that is not what the flow builds from its spec: the run says where
  const kit = {spec: {who: 'the isometric map', blocks: [{name: 'a', kind: 'block', at: null, size: [2, 2, 1], label: 'A', small: null, rule: null, group: null, ports: [], who: 'blocks[0] ("a")'},
    {name: 'b', kind: 'block', at: null, size: [2, 2, 1], label: 'B', small: null, rule: null, group: null, ports: [], who: 'blocks[1] ("b")'}],
  floors: [], wires: [{name: null, from: {block: 'a', port: null}, to: {block: 'b', port: null}, straight: false, who: 'wires[0]'}], grid: null, area: [0, 0, 1600, 900]}};
  const {map: right} = await (await import('footprint-story/mapflow')).runMapFlow(kit.spec, (await import('footprint-story/isometric')).ISO_MAP_POLICIES.film);
  kit.built = {...right, placed: 'hand'};
  assert.equal((await mapRun(kit)()).differs, 'placed: "build" here, "hand" in the kit\'s');
  // the check's reply says it first, as a drift; a map flow that fails where the kit built the map is one too
  const {maps} = await runMaps([{name: 'story', kit: 'isometric', run: mapRun(kit)}, {name: 'stages[0]', kit: 'isometric', run: async () => { throw new Error('a step refused'); }}]);
  assert.deepEqual(maps.map(m => m.differs), ['placed: "build" here, "hand" in the kit\'s', 'the map flow failed where the kit built the map: a step refused']);
  const lines = mapLines({maps, skipped: 0}, {run: 'r1'});
  assert.match(lines[0], /^drift · map story: footprint-story's map flow did not build the map the kit drew — placed: "build" here, "hand" in the kit's \(the film draws the kit's; report it to footprint-story\)$/);
  assert.match(lines[1], /^drift · map stages\[0\]: .*a step refused/);
});

test('a record that cannot be written never costs the check: the map is still built and compared, and the reply says no record was kept', async t => {
  const dir = tempDir('map-unwritable', t), locked = path.join(dir, 'locked');
  mkdirSync(locked); chmodSync(locked, 0o500);
  const {maps} = await runMaps(film.mapRuns, {recordFor: k => path.join(locked, `map-${k}.record.jsonl`)});
  assert.deepEqual(maps.map(m => [m.name, m.recorded, m.file, m.differs ?? null]), [['story', false, null, null], ['stages[0]', false, null, null]]);
  const thrown = await runMaps(film.mapRuns.slice(0, 1), {recordFor: () => { throw new Error('no room'); }});
  assert.equal(thrown.maps[0].recorded, false);
  assert.equal(mapLines({maps, skipped: 0}, {run: 'r1'}).length, 2, 'no map kept a record: no call is offered');
  assert.deepEqual(mapLines({maps, skipped: 0}, {run: 'r1'}).slice(0, 2), ['map story: its record was not kept, so log --why cannot answer for it', 'map stages[0]: its record was not kept, so log --why cannot answer for it']);
  // a whole out folder that cannot be written to: the check still answers, and says its run was not saved (nothing to ask)
  const out = path.join(dir, 'out');
  mkdirSync(path.join(out, ...RUNS), {recursive: true}); chmodSync(path.join(out, ...RUNS), 0o500);
  const said = await check(await readInputs({cwd: project, out}));
  assert.match(said, /^fix \d/);
  assert.match(said, /\n\(this check's run was not saved for storyreel log: .*\)$/);
  assert.doesNotMatch(said, /\nmaps: /);
  // bounded: past MAPS_MOST, the rest are counted and not run
  let ran = 0;
  const many = await runMaps(Array.from({length: MAPS_MOST + 3}, (_, i) => ({name: `stages[${i}]`, kit: 'isometric', run: async () => { ran++; return {snapshot: {commitLog: []}, differs: null}; }})));
  assert.equal(ran, MAPS_MOST);
  assert.equal(many.skipped, 3);
  assert.ok(mapLines(many).includes(`maps: 3 more not run (a check runs the first ${MAPS_MOST})`));
});

test('a run\'s maps read back as a file anyone may have written: a name not the recipe\'s is dropped, no file is found by it; old runs take their maps with them', async t => {
  const out = tempDir('map-hostile', t);
  await check(await readInputs({cwd: project, out}));
  const run = listRuns(out)[0], saved = JSON.parse(readFileSync(run.file, 'utf8'));
  assert.deepEqual(saved.maps.map(m => m.name), ['story', 'stages[0]']);
  assert.deepEqual(saved.worlds, {story: 'isometric', 'stages[0]': 'isometric'});
  writeFileSync(run.file, JSON.stringify({...saved, maps: [{name: '../../x', kit: 'k', control: {}}, ...saved.maps], worlds: {'a\nb': 'x', ...saved.worlds}}));
  const back = listRuns(out)[0];
  assert.deepEqual(back.maps.map(m => m.name), ['story', 'stages[0]'], 'only a recipe path is a map\'s name');
  assert.deepEqual(Object.keys(back.worlds), ['story', 'stages[0]']);
  // a map's record is named by its place in the list, never by its name: the two kept are as they were written
  assert.equal(back.maps[0].recordFile, mapRecordBeside(run.file, 0));
  // a feature's oldest run goes with its maps' records
  const dir = path.join(out, ...RUNS), old = new Date(Date.UTC(2000, 0, 1));
  const first = saveRun(out, {feature: 'check', at: old, maps: [{name: 'story', kit: 'isometric', control: {}, file: path.join(dir, 'x.record.jsonl')}]});
  writeFileSync(mapRecordBeside(first, 0), '');
  for (let k = 1; k < RUNS_KEPT + 1; k++) saveRun(out, {feature: 'check', at: new Date(old.getTime() + k * 1000)});
  assert.ok(!readdirSync(dir).some(n => n.startsWith(path.basename(first, '.json'))), 'the oldest run and its map record are gone');
});

test('a kit\'s mapRun is trusted for nothing: one that returns no map, throws, is no function or never settles is a failure said aloud, and the check goes on', async t => {
  const dir = tempDir('map-hostile-run', t), recordFor = k => path.join(dir, `pending-${k}.record.jsonl`);
  const runs = [{name: 'story', kit: 'x', run: async () => undefined}, {name: 'stages[0]', kit: 'x', run: () => { throw new Error('boom'); }},
    {name: 'stages[1]', kit: 'x', run: 'not a function'}, {name: 'stages[2]', kit: 'x', run: async () => ({snapshot: {commitLog: []}, differs: 7})},
    {name: 'stages[3]', kit: 'x', run: () => new Promise(() => {})}];
  const {maps} = await runMaps(runs, {recordFor, ms: 200});
  assert.deepEqual(maps.map(m => m.differs.replace(/^the map flow failed where the kit built the map: /, '')), ['the map run returned no map', 'boom', 'run is not a function',
    'the map run did not say whether its map is the kit\'s', 'the map run did not finish within 0.2 s']);
  assert.ok(maps.every(m => !m.recorded && m.file === null));
  assert.deepEqual(readdirSync(dir), [], 'a record begun and not kept is removed, never left pending');
  // the bound a check gives each map's run (said in src/check/README.md)
  const {MAP_RUN_MS} = await import('../src/check/maps.mjs');
  assert.equal(MAP_RUN_MS, 30_000);
});

test('the spec handed to the map flow is the one the kit built with, frozen at every level', async () => {
  const {readMap} = await import('../src/kits/isometric/read.mjs'), {buildMap} = await import('../src/kits/isometric/build.mjs');
  const map = buildMap(readMap(JSON.parse(readFileSync(fileURLToPath(new URL('../examples/iso-world/recipe.json', import.meta.url)), 'utf8')).story, 'the story'), 'the story');
  assert.ok(Object.isFrozen(map.spec) && Object.isFrozen(map.spec.blocks) && Object.isFrozen(map.spec.blocks[0]) && Object.isFrozen(map.spec.blocks[0].size) && Object.isFrozen(map.spec.area));
  assert.throws(() => { map.spec.blocks[0].size[0] = 9; }, TypeError);
});
