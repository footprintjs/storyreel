// A world's pieces moved by intent (src/kits/isometric/motion-read.mjs, motion.mjs; src/check/motions.mjs): the author
// writes what happens, footprint-story decides each move's model, duration and curve, the kit places it on the frame and
// draws the block where the samples put it. Its record names each move's model, reason and seconds; a check runs the
// moves through footprint-story's chart and keeps a record that `log --why --motion` answers from; the critics' findings
// reach the check's reply naming the entry and the fix. A world with no motion is exactly as it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {planIntents, sampleMove} from 'footprint-story/human';
import {frameHashes, loadTheme} from '../src/index.mjs';
import {compileIsometric, MOTION_DOS, MOTION_FRAME} from '../src/kits/isometric/index.mjs';
import {PLANNED_DOS} from '../src/kits/isometric/motion.mjs';
import {readInputs, check, log} from '../src/tools.mjs';
import {listRuns, RUNS} from '../src/runlog.mjs';
import {runMotions, motionLines} from '../src/check/index.mjs';
import {compileExample} from './golden.mjs';
import {tempDir} from './tmp.mjs';

const dir = fileURLToPath(new URL('../examples/iso-motion/', import.meta.url));
const recipe = JSON.parse(readFileSync(dir + 'recipe.json', 'utf8'));
const film = await compileExample('iso-motion');
const theme = loadTheme('paper');
const worldOf = (spec, where = 'the story') => compileIsometric(spec, {clock: film.clock, theme, where});
const story = worldOf(recipe.story);
const project = fileURLToPath(new URL('./fixtures/iso-motion/', import.meta.url));
const ask = (out, why, motion, more = {}) => log({cwd: project, out, run: '1', why, motion, ...more});
const motionFiles = out => readdirSync(path.join(out, ...RUNS)).filter(n => /\.motion-\d+\.record\.jsonl$/.test(n));
const near = (a, b, what) => assert.ok(Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6, `${what}: ${a} is not ${b}`);
const at = (phrase, plus = 0) => film.clock.at(['drop', phrase]) + plus;

test('the record names each move\'s model, how it was chosen, its reason and its seconds: footprint-story\'s own data', () => {
  assert.deepEqual(story.map.motions.map(m => [m.path, m.piece, m.do, m.model, m.by, m.wrappers]), [
    ['motion[0]', 'box', 'fall', 'ballistic', 'usual', []],
    ['motion[1]', 'ball', 'throw', 'ballistic', 'usual', ['anticipate']],
    ['motion[2]', 'box', 'settle', 'spring', 'usual', []]]);
  assert.match(story.map.motions[0].reason, /^do: 'fall' → ballistic, the usual for do: 'fall' — a fall of [\d.]+ px onto the floor at y [\d.]+ from rest, over 0\.\d+ s under 1960 px\/s²$/);
  assert.match(story.map.motions[1].reason, /then anticipate: a pull back of 8% of its distance/);
  assert.equal(story.map.motions[0].at, +at('It falls to the floor').toFixed(3), 'it begins at its anchor');
  // the summary keeps the few words of each, beside the world's entry in the compile's record
  assert.deepEqual(story.summary.motions.map(m => Object.keys(m)), [0, 1, 2].map(() => ['piece', 'do', 'model', 'at', 'seconds']));
  // the moves are footprint-story's: planIntents over the intents the kit handed it gives the very seconds recorded
  const again = planIntents(story.motionIntents, {frame: [...MOTION_FRAME]});
  assert.deepEqual(again.durations.map(d => +d.seconds.toFixed(3)), story.map.motions.map(m => m.seconds));
  assert.deepEqual(again.moves.map(m => m.reason), story.map.motions.map(m => m.reason));
  // the ball comes to rest on the server's top, over its name: meant in this film, so its entry accepts reel:covers
  assert.deepEqual(story.motionFindings.map(f => [f.path, f.critic, f.level]), [['motion[1]', 'reel:covers', 'accepted']], 'the example moves well: only the cover it means');
  assert.deepEqual(film.motionRuns.map(m => [m.name, m.kit, m.findings.length]), [['story', 'isometric', 1]]);
});

test('placed from the built map: a fall drops the box\'s foot straight to the floor under it, a throw lands the ball on the server\'s top', () => {
  // a grid written in numbers, so a world and its "after" picture stand on the very same floor
  const grid = {tile: 100, at: [800, 150]}, server = {name: 'server', at: [6, 1], size: [2, 2, 1.6]};
  const box = {name: 'box', at: [1, 1, 3]}, ball = {name: 'ball', kind: 'cylinder', at: [1, 5], size: [1.2, 1.2, 0.6]};
  const w = worldOf({grid, blocks: [box, ball, server], motion: [{piece: 'box', do: 'fall'}, {piece: 'ball', do: 'throw', to: 'server'}]});
  const region = (world, name, t) => world.regionsAt(t).find(r => r.name === name).box.map(v => +v.toFixed(6));
  const [fall, toss] = w.map.motions, end = Math.max(fall.seconds, toss.seconds) + 0.01;
  // the box after its fall is the box built standing on the floor; the ball after its throw, a ball built on the server's top
  const landed = worldOf({grid, blocks: [{...box, at: [1, 1]}, {...ball, at: [6 + 1 - 0.6, 1 + 1 - 0.6, 1.6]}, server]});
  assert.deepEqual(region(w, 'box', end), region(landed, 'box', 0), 'the box lands exactly where a block on the floor stands');
  assert.deepEqual(region(w, 'ball', end), region(landed, 'ball', 0), 'the ball lands on the middle of the server\'s top');
  assert.equal(region(w, 'box', fall.seconds / 2)[0], region(w, 'box', 0)[0], 'straight down: not one pixel sideways');
  assert.ok(region(w, 'box', fall.seconds / 2)[1] > region(w, 'box', 0)[1], 'half way through, lower');
  // the ball goes up before it comes down onto the server: its highest point is above both ends
  const tops = Array.from({length: 40}, (_, k) => region(w, 'ball', k * toss.seconds / 40)[1]);
  assert.ok(Math.min(...tops) < Math.min(region(w, 'ball', 0)[1], region(w, 'ball', end)[1]) - 20, 'thrown through the air, over an arc');
});

test('timed on the film\'s clock: as built before its anchor, moving from it, and where it ended after; a camera frames the block where it is', () => {
  const w = worldOf(recipe.story), still = worldOf({...recipe.story, motion: undefined});
  const t0 = at('It falls to the floor');
  for (const t of [0, 1, t0 - 0.05]) assert.deepEqual(w.regionsAt(t), still.regionsAt(t), `at ${t} s nothing has moved`);
  assert.notDeepEqual(w.regionsAt(t0 + 0.3), still.regionsAt(t0 + 0.3), 'once it begins, the box is framed where it falls');
  // the camera key on ["ball", "server"] frames the ball where it landed
  const t = at('lands on top', 0.5), ball = film.regionsAt(t).find(r => r.name === 'ball'), server = film.regionsAt(t).find(r => r.name === 'server');
  assert.ok(ball.box[3] <= server.box[3] && ball.box[1] < server.box[1] + 40, 'the ball is on the server, and framed there');
});

test('the same intents give the same moves and the same frames, drawn in any order; the frames are pinned in golden.json', async () => {
  const twice = worldOf(recipe.story);
  assert.deepEqual(twice.map.motions, story.map.motions);
  const times = Array.from({length: 14}, (_, k) => +((k + 0.5) * film.total / 14).toFixed(3));
  const first = frameHashes(film, {times, width: 320}), again = frameHashes(await compileExample('iso-motion'), {times: [...times].reverse(), width: 320});
  for (const t of times) assert.equal(again[t], first[t], `the frame at ${t} s is the same, drawn again last first`);
  const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
  assert.ok(golden['iso-motion'], 'iso-motion is pinned');
});

test('a world with no motion is as it was: no motions in its record or summary, no run handed out, the same drawing', () => {
  const still = worldOf({...recipe.story, motion: undefined}), empty = worldOf({...recipe.story, motion: []});
  for (const w of [still, empty]) {
    assert.ok(!('motions' in w.map) && !('motions' in w.summary), 'nothing about motion is recorded');
    assert.ok(!('motionRun' in w) && !('motionFindings' in w), 'nothing is handed out');
  }
  assert.deepEqual(empty.map, still.map);
});

test('a film with no motion hands out no motion run, and its check says nothing of motion', async t => {
  const plain = await compileExample('iso-world');
  assert.ok(!('motionRuns' in plain), 'the film has no motion runs');
  const out = tempDir('motion-none', t);
  const said = await check(await readInputs({cwd: project, out, plain: 'true'}));
  assert.doesNotMatch(said, /motions?[: ]|move that reads/);
  assert.deepEqual(motionFiles(out), []);
  await assert.rejects(ask(out, 'duration-0', 'story', {plain: 'true'}), {message: 'run 1 kept no moves: no world of its film has a motion — its worlds are story (isometric)'});
});

test('refusals name the entry and the fix', () => {
  const blocks = [{name: 'box', at: [2, 2, 3]}, {name: 'ball', at: [0, 6]}, {name: 'server', at: [8, 2], size: [2, 2, 1.6]}];
  const cases = [
    [[{piece: 'box', do: 'fall', speed: 2}], /^Error: stage s: isometric motion\[0\] takes piece, do, at, to, from, wrap, model, accept — not "speed"$/],
    [[{do: 'fall'}], /isometric motion\[0\]: piece names the block that moves \("box"\) — the blocks are box, ball, server; not undefined/],
    [[{piece: 'crate', do: 'fall'}], /piece names "crate", which is no block here — the blocks are box, ball, server/],
    [[{piece: 'box', do: 'wobble'}], /motion\[0\] \("box"\): do says what the block does, "fall", "throw", "hang", "settle", "reach", "roll", "slide" or "tumble" \(footprint-story's words\) — not "wobble"/],
    [[{piece: 'box', do: 'draw'}], /do "draw" moves a pen's point along a line, not a block — a block takes do "fall", "throw", "hang", "settle", "reach", "roll", "slide" or "tumble"/],
    [[{piece: 'ball', do: 'fall'}], /motion\[0\] \("ball"\): a fall drops the block from where it stands, and it stands on the floor already — lift it first \(its at: \[col, row, 3\]\), or throw it/],
    [[{piece: 'box', do: 'fall', to: 'server'}], /a fall takes no to — it falls straight down to the floor below it: take to out/],
    [[{piece: 'ball', do: 'throw'}], /a throw needs to, where it ends: a block's name \("box"\) or tiles \(\[col, row\]\)/],
    [[{piece: 'ball', do: 'throw', to: 'ball'}], /to names the piece itself — name another block, or give tiles/],
    [[{piece: 'ball', do: 'throw', to: 'cloud'}], /to names "cloud", which is no block here — the blocks are box, ball, server; or give tiles/],
    [[{piece: 'ball', do: 'throw', to: [1, 2, -1]}], /to's lift is how high above the floor, 0 or more — not -1/],
    [[{piece: 'ball', do: 'hang'}], /a hang needs from, the pin it hangs from/],
    [[{piece: 'ball', do: 'throw', to: 'server', at: 'soon'}], /at is when the move begins, an anchor \["scene", "phrase"\] .* not "soon"; leave it out to begin when the block appears/],
    [[{piece: 'ball', do: 'throw', to: 'server', at: ['drop', 'no such words']}], /^Error: stage s: isometric motion\[0\] \("ball"\): at: /],
    [[{piece: 'ball', do: 'throw', to: 'server', wrap: {wrapper: 'anticipate'}}], /wrap is a list of at most 4 wrappers, \[\{"wrapper": "anticipate"\}\]/],
    [[{piece: 'ball', do: 'throw', to: 'server', wrap: [{wrapper: 'wobble'}]}], /^Error: stage s: isometric motion\[0\] \("ball"\)'s wrap\[0\] is \{wrapper, …its options\}, the wrapper 'anticipate', 'follow-through', 'hold', 'overshoot' — not "wobble"$/],
    [[{piece: 'ball', do: 'throw', to: 'server', model: 'min-jerk'}], /^Error: stage s: isometric motion\[0\] \("ball"\): the model "min-jerk" is for a reach, and this intent is do: 'throw' .* name a throw model: "ballistic", "bounce"$/],
    [[{piece: 'ball', do: 'settle', to: 'server', model: {name: 'spring', feel: 'bouncy'}}], /^Error: stage s: isometric motion\[0\] \("ball"\): model "spring"'s feel is one of snappy, default, heavy, playful — not "bouncy"$/],
    [[{piece: 'box', do: 'fall'}, {piece: 'box', do: 'throw', to: 'server'}], /motion\[1\] \("box"\): it begins at 0 s, as motion\[0\] does — a piece makes one move at a time: anchor one later/],
    [[{piece: 'box', do: 'fall', at: ['drop', 'It falls']}, {piece: 'box', do: 'throw', to: 'server', at: ['drop', 'It falls', 0.1]}], /motion\[1\] \("box"\): it begins at [\d.]+ s, while motion\[0\] still moves "box" until [\d.]+ s \(footprint-story planned it 0\.\d+ s\) — anchor it at [\d.]+ s or later: a later phrase, or \["scene", "phrase", 0\.\d+\] after this one/],
    [[{piece: 'ball', do: 'hang', from: [0, 4, 4]}, {piece: 'ball', do: 'settle', to: 'server', at: ['drop', 'timed by hand']}], /motion\[1\] \("ball"\): it follows motion\[0\], a hang, which ends wherever its swing settles — a hang is a piece's last move/],
    [[{piece: 'server', do: 'settle', to: [1, 1]}], /motion\[0\] \("server"\): wires\[0\] joins "server": its cable is laid on the floor to where "server" stands and would not follow it — move a block no wire joins, or take the wire off/, {wires: [{arrow: 'ball to server'}]}],
    [{piece: 'box'}, /isometric motion is a list of moves, \[\{"piece": "box", "do": "fall"\}\]/],
    [Array.from({length: 65}, () => ({piece: 'box', do: 'fall'})), /an isometric world holds at most 64 motions, and this one has 65 — split it into two worlds/],
  ];
  for (const [motion, message, more] of cases) assert.throws(() => worldOf({blocks, ...(more ?? {}), motion}, 'stage s'), message, JSON.stringify(motion).slice(0, 80));
  // a floor named as the piece: a motion moves a block
  assert.throws(() => worldOf({blocks, floors: [{name: 'rug', label: 'Rug'}], motion: [{piece: 'rug', do: 'fall'}]}, 'stage s'), /piece "rug" is floors\[0\] — a motion moves a block \(a packet later\): name a block, box, ball, server/);
});

test('the families a film lets a block do are one table: what motion-read takes is what the planner has a row for', () => {
  assert.deepEqual(Object.keys(MOTION_DOS), ['fall', 'throw', 'hang', 'settle', 'reach', 'roll', 'slide', 'tumble']);
  assert.deepEqual(PLANNED_DOS, Object.keys(MOTION_DOS));
});

test('a hang draws its rope from the pin to the block\'s top and leaves it hanging below; a bounce squashes it; a reach aims at a block\'s top', () => {
  const grid = {tile: 100, at: [800, 150]}, blocks = [{name: 'sign', at: [4, 4, 0]}, {name: 'box', at: [1, 1, 3]}, {name: 'server', at: [8, 2], size: [2, 2, 1.6]}];
  const w = worldOf({grid, blocks, motion: [{piece: 'sign', do: 'hang', from: [2, 4, 4]}, {piece: 'box', do: 'fall', model: {name: 'bounce', squash: 0.2}}]});
  assert.deepEqual(w.map.motions.map(m => m.model), ['verlet', 'bounce']);
  // drawn on a recording canvas: the rope starts at the pin
  const [hang] = w.motionIntents, calls = [];
  const rec = new Proxy({}, {get: (_, k) => (typeof k === 'string' ? (...a) => { calls.push([k, ...a]); return {width: 10}; } : undefined), set: (_, k, v) => { calls.push(['=' + String(k), v]); return true; }});
  w.draw(rec, 1);
  assert.ok(calls.some(([k, x, y]) => k === 'moveTo' && Math.abs(x - hang.from[0]) < 1e-9 && Math.abs(y - hang.from[1]) < 1e-9), 'the rope is drawn from the pin');
  // at rest its top is where the swing left the rope's end: footprint-story's last sample of the very same intent
  // (the region frames the rope too: its top is the pin; its bottom is the block's near foot, 50 px and a unit of height
  // under its top's middle on this grid)
  const move = planIntents([hang]).moves[0], rest = sampleMove(move, move.plan.seconds), box = w.regionsAt(move.plan.seconds + 1).find(r => r.name === 'sign').box;
  near([(box[0] + box[2]) / 2, box[3] - 50 - Math.sqrt((100 ** 2 - 50 ** 2) / 2)], [rest.x, rest.y], 'the sign\'s top is the rope\'s end');
  assert.ok(Math.abs(box[1] - hang.from[1]) < 1e-6, 'a camera framing the sign frames its rope up to the pin');
  // a bounce squashes the box at a landing, wider for a moment
  const squash = w.map.motions[1], widths = Array.from({length: 200}, (_, k) => w.regionsAt(k * squash.seconds / 200).find(r => r.name === 'box').box).map(b => b[2] - b[0]);
  assert.ok(Math.max(...widths) > Math.min(...widths) + 1, 'at a landing it is wider: squashed');
  // a reach to a block reads its top's width for Fitts's law
  const r = worldOf({blocks, motion: [{piece: 'box', do: 'reach', to: 'server'}]}).map.motions[0];
  assert.match(r.reason, /to a [\d.]+ px target(?! \(the usual)/);
});

test('the review\'s motion check: a finding is held over its move however short, advice naming the entry and the fix; none outside its window', async () => {
  const {reviewPart, REVIEW_CHECKS} = await import('../src/review.mjs');
  const short = {path: 'story.motion[0]', from: 3, to: 3.05, critic: 'jerk', level: 'warn', what: 'its move has 3 speed peaks', fix: "use do: 'reach'"};
  const moved = {...film, motionRuns: [{name: 'story', kit: 'isometric', run: film.motionRuns[0].run, findings: [short]}]};
  const r = await reviewPart(moved, {checks: {motion: REVIEW_CHECKS.motion}});
  assert.deepEqual(r.ran, ['motion']);
  assert.deepEqual(r.findings.map(f => [f.kind, f.what, f.where, f.fix]), [['motion', 'jerk: its move has 3 speed peaks', 'story.motion[0]', "use do: 'reach'"]]);
  assert.deepEqual((await reviewPart(moved, {from: 6, to: 9, checks: {motion: REVIEW_CHECKS.motion}})).findings, [], 'a move outside the window is not said');
  assert.deepEqual((await reviewPart(await compileExample('iso-world'), {checks: {motion: REVIEW_CHECKS.motion}})).ran, [], 'not picked for a film that moves nothing');
});

test('a critic\'s level is kept: a warn (a body through the floor) asks for a fix, only a note is advice', async () => {
  const {reviewPart, REVIEW_CHECKS, MOTION_KINDS} = await import('../src/review.mjs');
  const {problemsOf} = await import('../src/check/index.mjs');
  const {FINDING_LEVELS} = await import('footprint-story/human');
  assert.deepEqual(Object.keys(MOTION_KINDS).sort(), [...FINDING_LEVELS, 'accepted'].sort(), 'every level footprint-story gives is mapped, and an accepted finding');
  const contact = {path: 'story.motion[0]', from: 3, to: 3.5, critic: 'contact', level: 'warn', what: 'at 0.39 s it goes 49.7 px into the floor — it passes through something solid', fix: 'raise its path'};
  const note = {...contact, critic: 'reel:hint', level: 'note', what: 'it could ease in', fix: 'wrap it: [{"wrapper": "anticipate"}]', from: 5, to: 5.5};
  const moved = {...film, motionRuns: [{name: 'story', kit: 'isometric', run: film.motionRuns[0].run, findings: [contact, note]}]};
  const r = await reviewPart(moved, {checks: {motion: REVIEW_CHECKS.motion}});
  assert.deepEqual(r.findings.map(f => f.kind), ['motion', 'motion-note']);
  const problems = problemsOf({review: {findings: r.findings, lines: r.findings.map(f => f.what), verdicts: []}});
  assert.deepEqual(problems.map(p => [p.level, p.kind]), [['error', 'motion'], ['advice', 'motion-note']], 'the contact is an error; the note is advice');
});

test('paint order: a moving block takes its place in the back-to-front order where it is now — landed behind a block, it is drawn behind it', () => {
  const grid = {tile: 100, at: [800, 150]}, wall = {name: 'wall', label: 'Wall', at: [4, 4], size: [2, 2, 2]}, ball = {name: 'ball', label: 'Ball', at: [9, 9], size: [1, 1, 1]};
  const labels = (w, t) => {
    const said = [];
    const rec = new Proxy({}, {get: (_, k) => (k === 'fillText' ? (text) => said.push(text) : typeof k === 'string' ? () => ({width: 10}) : undefined), set: () => true});
    w.draw(rec, t);
    return said.filter(x => x === 'Ball' || x === 'Wall');
  };
  const behind = worldOf({grid, blocks: [wall, ball], motion: [{piece: 'ball', do: 'throw', to: [3, 3]}]});
  const front = worldOf({grid, blocks: [wall, ball], motion: [{piece: 'ball', do: 'throw', to: [7, 7]}]});
  const end = (w) => w.map.motions[0].seconds + 0.5;
  // the ball behind the wall's footprint really is behind it on the frame: their outlines meet there
  const [a, b] = ['ball', 'wall'].map(n => behind.regionsAt(end(behind)).find(r => r.name === n).box);
  assert.ok(a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3], 'the two overlap on the frame, so the order shows');
  assert.deepEqual(labels(behind, end(behind)), ['Ball', 'Wall'], 'landed behind the wall: drawn before it, so the wall covers it');
  assert.deepEqual(labels(front, end(front)), ['Wall', 'Ball'], 'landed in front: drawn after it');
  // high in the air over the wall, mid-flight, it is in front
  const mid = behind.map.motions[0].seconds * 0.5;
  assert.deepEqual(labels(behind, mid), ['Wall', 'Ball'], 'in flight above the wall: drawn after it (its name stays drawn: a pass is no rest)');
  assert.deepEqual(labels(behind, 0), ['Wall', 'Ball'], 'before its move: the built order');
});

test('the kit\'s modules import no cycle', () => {
  const kit = fileURLToPath(new URL('../src/kits/isometric/', import.meta.url)), files = readdirSync(kit).filter(f => f.endsWith('.mjs'));
  const edges = Object.fromEntries(files.map(f => [f, [...readFileSync(kit + f, 'utf8').matchAll(/^(?:import|export)\b[^;]*?from '\.\/([\w-]+\.mjs)'/gms)].map(m => m[1])]));
  assert.ok(edges['read.mjs'].includes('motion-read.mjs') && edges['motion-read.mjs'].includes('words.mjs'), 'the scan reads the imports');
  const cycles = [], walk = (f, path) => {
    if (path.includes(f)) { cycles.push([...path.slice(path.indexOf(f)), f].join(' → ')); return; }
    for (const g of edges[f] ?? []) walk(g, [...path, f]);
  };
  for (const f of files) walk(f, []);
  assert.deepEqual(cycles, []);
});

test('a check runs the moves through footprint-story\'s chart, keeps its record, and log --why --motion answers from it', async t => {
  const out = tempDir('motion-why', t);
  const said = await check(await readInputs({cwd: project, out}));
  assert.ok(said.endsWith(`\nmotions: story — why a move takes its time: storyreel log --run ${listRuns(out)[0].id} --why duration-0 --motion story (model-<i>: why its model; findings-<i>: what its critics found)`), said.split('\n').at(-1));
  assert.match(said, /^clean/);
  assert.doesNotMatch(said, /drift|not kept/);
  assert.equal(motionFiles(out).length, 1, 'one record a world that moves, beside the run');
  assert.deepEqual(readdirSync(path.join(out, ...RUNS)).filter(n => n.startsWith('pending-')), [], 'nothing left pending');
  // why the throw takes its time: its seconds and the law's numbers, written by the wrap step, through the plan and the choice
  const duration = (await ask(out, 'duration-1', 'story')).split('\n');
  assert.match(duration[0], /^duration-1 = \{"seconds":[01]\.\d+,"across":\d+(\.\d+)?,"apex":[\d.]+,"apexDefaulted":true,"angle":[\d.]+,.*"wrappers":"anticipate","planned":0\.\d+\}$/);
  assert.equal(duration[1], 'wrap (wrap#3) [wrote: moves, durations, duration-0, duration-1, duration-2]');
  assert.match(duration.join('\n'), /choose \(choose#1\) ← via choices ← \[control: this package's models plan every move — isometric motion\[0\] \("box"\): fall → ballistic \(usual\); isometric motion\[1\] \("ball"\): throw → ballistic \(usual\)/);
  // why the box's model: written by choose
  assert.match(await ask(out, 'model-0', 'story'), /^model-0 = \{"model":"ballistic","family":"fall","by":"usual","rule":"the intent names none: its family's usual","own":false\}\nchoose \(choose#1\)/);
  // a key no step writes names those that are
  assert.match(await ask(out, 'nothing', 'story'), /the moves' steps write intents, wraps, frame, choices, chose, choseWhy, plans, moves, durations, tracks, checks, findings, and for motion\[i\] alone model-<i>, duration-<i>, findings-<i>/);
});

test('refusals of --motion name what there is', async t => {
  const out = tempDir('motion-refused', t);
  await check(await readInputs({cwd: project, out}));
  await assert.rejects(ask(out, 'duration-0', 'stages[0]'), {message: 'run 1 has no moves for "stages[0]": its worlds that move are story'});
  await assert.rejects(log({cwd: project, out, run: '1', motion: 'story'}), /--motion picks the record --why reads: ask with --why/);
  await assert.rejects(ask(out, 'duration-0', true), /--motion names one of the run's worlds that move by its place in the recipe/);
  await assert.rejects(ask(out, true, 'story'), /^Error: --why names a value of the moves, one of what their steps write: intents, wraps, frame, /);
  await assert.rejects(ask(out, 'duration-0', 'story', {map: 'story'}), /--map and --motion each pick the record --why reads: give one of them/);
  // a check kept before 0.43.0 (no motions in its file) is told apart
  const {writeFileSync} = await import('node:fs');
  const run = listRuns(out)[0], saved = JSON.parse(readFileSync(run.file, 'utf8')), {motions: _motions, ...old} = saved;
  writeFileSync(run.file, JSON.stringify(old));
  await assert.rejects(ask(out, 'duration-0', 'story'), {message: 'run 1 was kept before 0.43.0, which kept no motion records: run storyreel check again, then ask that run'});
  writeFileSync(run.file, JSON.stringify(saved));
  const {rmSync} = await import('node:fs');
  rmSync(listRuns(out)[0].motions[0].recordFile);
  await assert.rejects(ask(out, 'duration-0', 'story'), /run 1's moves for story kept no record \(it could not be written when the check ran\)/);
});

test('a critic\'s finding reaches the check\'s reply at its own level, naming the entry and the fix', async t => {
  const out = tempDir('motion-finding', t);
  const said = await check(await readInputs({cwd: project, out, straight: 'true'}));
  assert.match(said, /^fix 1 — 1 error, 1 piece of advice\n/, 'a critic\'s warn is a finding to fix: the check does not read clean over it (the advice: the cover the example accepts)');
  assert.match(said, /\nfix  0:\d\d\.\d–0:\d\d\.\d drop · a move that reads wrong: arc: its move runs straight \(it bows 0\.0% of its length\) — .* · at story\.motion\[3\] · fix: bow it: model: \{name: 'min-jerk', bend: 0\.06\}\n/);
  assert.match(await ask(out, 'findings-3', 'story', {straight: 'true'}), /^findings-3 = \[\{"critic":"arc","level":"warn","fix":"bow it: model: \{name: 'min-jerk', bend: 0\.06\}"\}\]\nfindings \(findings#6\)/);
});

test('a kit\'s motionRun is trusted for nothing: one that throws, returns nothing or never settles is said aloud, and the check goes on', async () => {
  const {motions} = await runMotions([
    {name: 'story', kit: 'isometric', run: async () => { throw new Error('boom'); }},
    {name: 'stages[0]', kit: 'isometric', run: async () => null},
    {name: 'stages[1]', kit: 'isometric', run: () => new Promise(() => {})},
    {name: 'stages[2]', kit: 'isometric', run: film.motionRuns[0].run},
  ], {ms: 200});
  assert.deepEqual(motions.map(m => m.differs ?? null), ['the motion flow failed where the kit planned the moves: boom', 'the motion flow failed where the kit planned the moves: the motion run returned no motion',
    'the motion flow failed where the kit planned the moves: the motion run did not finish within 0.2 s', null]);
  const lines = motionLines({motions, skipped: 0}, {run: 'r1'});
  assert.match(lines[0], /^drift · motion story: footprint-story's intent decider did not plan the moves the kit drew — .*boom \(the film draws the kit's; report it to footprint-story\)$/);
  assert.deepEqual(motionLines({motions: [], skipped: 0}, {run: 'r1'}), [], 'nothing said when nothing moves');
  // the compile's moves and the chart's are equal
  assert.equal((await film.motionRuns[0].run()).differs, null);
});

test('the intents are footprint-story\'s words on the frame: the box falls from its foot to the floor under it, the ball is thrown to the server\'s top', () => {
  const [fall, toss] = story.motionIntents, server = story.regionsAt(0).find(r => r.name === 'server').box;
  assert.deepEqual(Object.keys(fall), ['do', 'name', 'who', 'from', 'floor']);
  assert.equal(fall.who, 'isometric motion[0] ("box")', 'its words for where it was written, the recipe entry');
  assert.ok(fall.floor > fall.from[1], 'the floor is below the box');
  assert.deepEqual(Object.keys(toss), ['do', 'name', 'who', 'from', 'to', 'wrap']);
  assert.ok(Math.abs(toss.to[0] - (server[0] + server[2]) / 2) < 1e-6, 'it lands on the middle of the server\'s top');
  assert.ok(toss.to[1] < (server[1] + server[3]) / 2, 'on its top, not its foot');
  // the samples the kit draws are footprint-story's: the fall's last sample is its floor
  const move = planIntents([fall]).moves[0];
  near([sampleMove(move, move.plan.seconds).x, sampleMove(move, move.plan.seconds).y], [fall.from[0], fall.floor], 'the fall ends on its floor');
});

test('a fall lands on the highest top under it; a settle up a block\'s side is found passing through it', () => {
  const grid = {tile: 100, at: [800, 150]}, srv = {name: 'srv', at: [2, 2], size: [2, 2, 1.6]}, box = {name: 'box', at: [2.5, 2.5, 4], size: [1, 1, 1]};
  const w = worldOf({grid, blocks: [srv, box], motion: [{piece: 'box', do: 'fall'}]});
  assert.match(w.map.motions[0].reason, /a fall of [\d.]+ px/);
  const landed = worldOf({grid, blocks: [srv, {...box, at: [2.5, 2.5, 1.6]}]});
  const region = (world, t) => world.regionsAt(t).find(r => r.name === 'box').box.map(v => +v.toFixed(6));
  assert.deepEqual(region(w, w.map.motions[0].seconds + 0.1), region(landed, 0), 'on srv\'s top, not inside it');
  assert.deepEqual(w.motionFindings, [], 'a fall onto a top passes through nothing');
  assert.throws(() => worldOf({grid, blocks: [srv, {...box, at: [2.5, 2.5, 1.6]}], motion: [{piece: 'box', do: 'fall'}]}, 'stage s'),
    /^Error: stage s: isometric motion\[0\] \("box"\): a fall drops the block from where it stands, and it stands on "srv"'s top \(lift 1\.6\) already — lift it first \(its at: \[col, row, 4\.6\]\)/);
  // beside srv on the floor, settled onto its top: the straight way rises through srv's side — a finding, with the fix
  const up = worldOf({grid, blocks: [srv, {...box, at: [5, 2.5]}], motion: [{piece: 'box', do: 'settle', to: 'srv'}]});
  assert.deepEqual(up.motionFindings.map(f => [f.path, f.critic, f.level]), [['motion[0]', 'reel:contact', 'warn']]);
  assert.match(up.motionFindings[0].what, /^at [\d.]+ s it goes [\d.]+ tiles into "srv" — it passes through a block$/);
  assert.equal(up.motionFindings[0].fix, 'move it round "srv": a to clear of it, or throw it over (do: "throw")');
  // thrown onto the same top from the same place: over srv, through nothing
  assert.deepEqual(worldOf({grid, blocks: [srv, {...box, at: [5, 2.5]}], motion: [{piece: 'box', do: 'throw', to: 'srv'}]}).motionFindings, []);
});

test('a target that moved is aimed at where it went; one that moves meanwhile is refused', () => {
  const grid = {tile: 100, at: [800, 150]}, box = {name: 'box', at: [2, 2, 4], size: [1, 1, 1]}, ball = {name: 'ball', at: [6, 6], size: [1, 1, 1]};
  const w = worldOf({grid, blocks: [box, ball], motion: [{piece: 'box', do: 'fall'}, {piece: 'ball', do: 'throw', to: 'box', at: ['drop', 'It falls to the floor']}]});
  const [, toss] = w.motionIntents, onFloor = worldOf({grid, blocks: [{...box, at: [2, 2]}, ball]}).regionsAt(0).find(r => r.name === 'box').box;
  assert.ok(Math.abs(toss.to[0] - (onFloor[0] + onFloor[2]) / 2) < 1e-6 && toss.to[1] > onFloor[1], 'aimed at the box\'s top where it fell, on the floor');
  const end = w.map.motions[1].at + w.map.motions[1].seconds + 0.1, ballBox = w.regionsAt(end).find(r => r.name === 'ball').box;
  const resting = worldOf({grid, blocks: [{...box, at: [2, 2]}, {...ball, at: [2, 2, 1]}]}).regionsAt(0).find(r => r.name === 'ball').box;
  assert.deepEqual(ballBox.map(v => +v.toFixed(6)), resting.map(v => +v.toFixed(6)), 'it rests on the box, not in the air where the box was');
  assert.throws(() => worldOf({grid, blocks: [box, ball], motion: [{piece: 'box', do: 'fall', at: ['drop', 'It falls to the floor']}, {piece: 'ball', do: 'throw', to: 'box', at: ['drop', 'It falls to the floor', 0.1]}]}, 'stage s'),
    /motion\[1\] \("ball"\): it relies on "box" standing still from [\d.]+ s to [\d.]+ s, and motion\[0\] moves it from [\d.]+ s to [\d.]+ s — anchor this one at [\d.]+ s or later \(\["scene", "phrase", seconds after\]\), or that one after [\d.]+ s/);
  assert.throws(() => worldOf({grid: {tile: 100, at: [800, 450]}, blocks: [box, ball], motion: [{piece: 'box', do: 'hang', from: [2.5, 2.5, 7]}, {piece: 'ball', do: 'throw', to: 'box', at: ['drop', 'timed by hand']}]}, 'stage s'),
    /motion\[1\] \("ball"\): to names "box", which hangs from motion\[0\] — where its swing rests is not known before it is planned: aim at tiles instead/);
});

test('a hang\'s pin must be above the block\'s top; tiles off the frame are refused in tiles', () => {
  const blocks = [{name: 'box', at: [2, 2, 3]}, {name: 'ball', at: [0, 6]}];
  assert.throws(() => worldOf({blocks, motion: [{piece: 'box', do: 'hang', from: [2.5, 2.5, 0]}]}, 'stage s'),
    /^Error: stage s: isometric motion\[0\] \("box"\): from is its pin, at lift 0 — a block hangs below its pin, and its top is at lift 4: lift the pin above it \(from: \[2\.5, 2\.5, 7\]\)$/);
  assert.throws(() => worldOf({blocks, motion: [{piece: 'ball', do: 'throw', to: [500, 500]}]}, 'stage s'),
    /^Error: stage s: isometric motion\[0\] \("ball"\): to \[500, 500, 0\] is off the frame \([\d]+ px below\) — give tiles on the floor: the blocks stand between columns 0 and 4, rows 2 and 8$/);
  assert.throws(() => worldOf({blocks, motion: [{piece: 'ball', do: 'throw', to: [1e6, -1e6]}]}, 'stage s'), /to \[1000000, -1000000, 0\] is off the frame \(\d+ px to the right(?: and \d+ px (?:above|below))?\)/);
});

test('an entry accepts a critic it means: the finding is shown as accepted, the record says so, and the check reads clean', async t => {
  const out = tempDir('motion-accept', t);
  const said = await check(await readInputs({cwd: project, out, accept: 'true'}));
  assert.match(said, /^clean — nothing to fix · 2 pieces of advice\n/);
  assert.match(said, /\nnote 0:\d\d\.\d–0:\d\d\.\d drop · a move accepted as written: accepted: arc: its move runs straight .* · at story\.motion\[3\]\n/);
  assert.doesNotMatch(said.split('\n').find(l => l.includes('accepted as written')), /fix:/, 'nothing to fix in an accepted finding');
  const w = worldOf({...recipe.story, motion: [...recipe.story.motion, {piece: 'box', do: 'reach', to: [1, 1], at: ['drop', 'timed by hand'], model: {name: 'min-jerk', bend: 0}, accept: ['arc']}]});
  assert.deepEqual(w.map.motions[3].accepted, ['arc']);
  assert.ok(!('accepted' in w.map.motions[0]), 'only an entry that accepts one says so');
  const blocks = [{name: 'box', at: [2, 2, 3]}];
  assert.throws(() => worldOf({blocks, motion: [{piece: 'box', do: 'fall', accept: ['wobble']}]}, 'stage s'), /accept names "wobble", which is no critic — the critics are jerk, pen-speed, arc, spacing, volume, contact, stretch, pen-lifts, stroke-order, hatch-gaps, roll-slip, spin, reel:contact, reel:covers$/);
  assert.throws(() => worldOf({blocks, motion: [{piece: 'box', do: 'fall', accept: ['arc']}]}, 'stage s'), /accept names "arc", which its move \(ballistic\) is not checked by — its critics are spacing, contact, reel:contact/);
  assert.throws(() => worldOf({blocks, motion: [{piece: 'box', do: 'fall', accept: 'arc'}]}, 'stage s'), /accept is a list of the critics whose findings this move keeps, \["arc"\]/);
});

test('a move\'s finding is the same finding after a small edit: its numbers are no part of its key', async () => {
  const {problemsOf} = await import('../src/check/index.mjs');
  const keyOf = (what) => problemsOf({review: {findings: [{kind: 'motion', scene: 'drop', what}], lines: [what], verdicts: []}})[0].key;
  assert.equal(keyOf('arc: its move runs straight (it bows 0.0% of its length)'), keyOf('arc: its move runs straight (it bows 0.4% of its length)'));
});

test('reel:contact sweeps each stretch between samples: a block a tenth of a tile thin is not skipped by a fast move', () => {
  // a 30-tile reach along the floor and a 50-tile throw, each across a wall 0.1 tiles thin: more than a tile between
  // two samples, and each wall placed where a check of the samples alone stands it between two of them (found by
  // running that check: it says nothing for walls at 14 and 25.4)
  const reach = worldOf({grid: {tile: 20, at: [400, 300]}, blocks: [{name: 'box', at: [0, 0], size: [1, 1, 1]}, {name: 'wall', at: [14, -1.5], size: [0.1, 3, 3]}],
    motion: [{piece: 'box', do: 'reach', to: [30.5, 0.5]}]});
  assert.deepEqual(reach.motionFindings.map(f => [f.critic, f.level]), [['reel:contact', 'warn']]);
  assert.match(reach.motionFindings[0].what, /tiles into "wall" — it passes through a block$/);
  const toss = worldOf({grid: {tile: 16, at: [400, 500]}, blocks: [{name: 'ball', at: [0, 0], size: [1, 1, 1]}, {name: 'wall', at: [25.4, -1.5], size: [0.1, 3, 40]}],
    motion: [{piece: 'ball', do: 'throw', to: [50.5, 0.5]}]});
  assert.deepEqual(toss.motionFindings.map(f => f.critic), ['reel:contact']);
  assert.match(toss.motionFindings[0].fix, /throw it to a place clear of "wall"/);
  // the same throw with the wall low enough to clear: nothing
  assert.deepEqual(worldOf({grid: {tile: 16, at: [400, 500]}, blocks: [{name: 'ball', at: [0, 0], size: [1, 1, 1]}, {name: 'wall', at: [25, -1.5], size: [0.1, 3, 1]}],
    motion: [{piece: 'ball', do: 'throw', to: [50.5, 0.5]}]}).motionFindings, []);
});

test('a block resting on one that moves would be left on nothing: refused, naming both entries', () => {
  const grid = {tile: 100, at: [800, 250]}, box = {name: 'box', at: [2, 2], size: [2, 2, 1]}, ball = {name: 'ball', at: [6, 6], size: [1, 1, 1]};
  assert.throws(() => worldOf({grid, blocks: [box, ball], motion: [{piece: 'ball', do: 'throw', to: 'box'}, {piece: 'box', do: 'settle', to: [0, 4], at: ['drop', 'the ball is thrown']}]}, 'stage s'),
    /^Error: stage s: isometric motion\[1\] \("box"\): it moves "box" from under "ball", which rests on its top since motion\[0\], and would leave it on nothing — move "ball" off first \(a motion for it before [\d.]+ s\), or anchor this move before "ball" lands there$/);
  // resting as built
  assert.throws(() => worldOf({grid, blocks: [box, {...ball, at: [2.5, 2.5, 1]}], motion: [{piece: 'box', do: 'settle', to: [0, 4]}]}, 'stage s'), /which rests on its top as built, and would leave it on nothing/);
  // the rider moved off first: the box may go
  assert.doesNotThrow(() => worldOf({grid, blocks: [box, {...ball, at: [2.5, 2.5, 1]}], motion: [{piece: 'ball', do: 'throw', to: [6, 6]}, {piece: 'box', do: 'settle', to: [0, 4], at: ['drop', 'the ball is thrown']}]}));
});

test('the drawn way stays on the frame: a throw\'s top or a swinging rope off the frame is refused, in tiles', () => {
  assert.throws(() => worldOf({grid: {tile: 40, at: [400, 120]}, blocks: [{name: 'ball', at: [0, 0], size: [1, 1, 1]}], motion: [{piece: 'ball', do: 'throw', to: [30.5, 0.5]}]}, 'stage s'),
    /^Error: stage s: isometric motion\[0\] \("ball"\): its way leaves the frame — at [\d.]+ s the block is \d+ px above \(its foot at tiles \[[\d., ]+\]\) — a nearer to, or one lower on the frame$/);
  assert.throws(() => worldOf({grid: {tile: 40, at: [800, 300]}, blocks: [{name: 'sign', at: [0, 0], size: [1, 1, 1]}], motion: [{piece: 'sign', do: 'hang', from: [-20, 20, 6]}]}, 'stage s'),
    /its way leaves the frame — at [\d.]+ s (the block|its rope) is [1-9]\d* px [a-z ]+ \(its foot at tiles \[[-\d., ]+\]\) — a pin nearer the blocks, or lower \(from\)$/);
});

test('what of a drawn block is off the frame: its outline first, then its rope', async () => {
  // footprint-story's rule (/isometric · drawnOff), on the film's frame
  const {drawnOff} = await import('footprint-story/isometric');
  const inside = [[100, 100], [200, 100], [200, 200]];
  assert.equal(drawnOff(inside, [[150, 50], [150, 100]], MOTION_FRAME), null);
  assert.deepEqual(drawnOff(inside, [[150, -20], [150, 100]], MOTION_FRAME), {part: 'rope', off: '20 px above'});
  assert.deepEqual(drawnOff([[1700, 100], ...inside], [[150, -20]], MOTION_FRAME), {part: 'block', off: '100 px to the right'});
  assert.deepEqual(drawnOff([[-0.2, 950]], [], MOTION_FRAME), {part: 'block', off: '1 px to the left and 50 px below'}, 'a fraction of a pixel off is said as one');
});

test('sweptThrough finds a thin block anywhere on a stretch, not only at its ends or middle', async () => {
  const {sweptThrough} = await import('footprint-story/isometric');
  const wall = {block: {name: 'wall', size: [0.1, 3, 3]}, from: [3, -1, 0], to: [3, -1, 0]};
  const hit = sweptThrough([1, 1, 1], [0, 0, 0], [10, 0, 0], [wall]);
  assert.equal(hit.block.name, 'wall');
  assert.ok(Math.abs(hit.depth - 0.1) < 1e-9 && hit.share > 0.2 && hit.share < 0.31, `deepest a fifth to a third of the way (${hit.share})`);
  assert.equal(sweptThrough([1, 1, 1], [0, 0, 2], [10, 0, 2], [{...wall, block: {name: 'low', size: [0.1, 3, 1]}}]), null, 'over a low wall: nothing');
  assert.equal(sweptThrough([1, 1, 1], [0, 0, 1], [0, 0, 1], [{block: {name: 'under', size: [1, 1, 1]}, from: [0, 0, 0], to: [0, 0, 0]}]), null, 'resting on a top: touching is not passing through');
});

test('a moved block that comes to rest over another\'s name hides it: not drawn, not listed to read, and said (reel:covers)', () => {
  const grid = {tile: 100, at: [800, 250]}, server = {name: 'server', label: 'Server', at: [6, 1], size: [2, 2, 1.6]}, ball = {name: 'ball', label: 'Ball', at: [1, 5], size: [1, 1, 0.6]};
  const w = worldOf({grid, blocks: [server, ball], motion: [{piece: 'ball', do: 'throw', to: 'server'}]});
  const [f] = w.motionFindings, end = w.map.motions[0].seconds;
  assert.deepEqual([f.critic, f.level], ['reel:covers', 'warn']);
  assert.equal(f.what, 'it comes to rest over "server"\'s name ("Server"), which is hidden from then');
  assert.match(f.fix, /land it clear of the name .* or accept it when it is meant \("accept": \["reel:covers"\]\)/);
  // what the canvas is asked to write, at rest: the ball's name and not the server's — a word under a block is no word
  // to read, and the decision is the kit's numbers, never a font's width, so every host draws the same words
  const written = (t) => { const said = []; w.draw(new Proxy({}, {get: (_, k) => (k === 'fillText' ? (x) => said.push(x) : typeof k === 'string' ? () => ({width: 10}) : undefined), set: () => true}), t); return said; };
  assert.ok(written(0).includes('Server'), 'before the throw, the server\'s name is drawn');
  assert.deepEqual(written(end + 0.5).filter(x => x === 'Server' || x === 'Ball'), ['Ball'], 'at rest over it, the name is not drawn');
  const spans = w.texts().filter(x => x.path === 'blocks[0].label');
  assert.equal(spans.length, 1);
  assert.ok(Math.abs(spans[0].to - end) < 1e-3, `the server\'s name is listed to read until the ball comes to rest over it, at the throw's end (${spans[0].to} s)`);
  // landed beside the server: nothing hidden, nothing said
  const beside = worldOf({grid, blocks: [server, ball], motion: [{piece: 'ball', do: 'throw', to: [4, 4]}]});
  assert.deepEqual(beside.motionFindings, []);
  assert.deepEqual(beside.texts().filter(x => x.path === 'blocks[0].label').map(x => x.to), [Infinity]);
});

// 0.45.0: which block hides a name is footprint-story's rule (`/isometric` · hiddenNames), read from the paint order of
// EVERY block — the order the film paints by. 0.44.0 ordered the two blocks alone: two blocks that do not meet on the
// frame get no rule between them, so a block wholly behind the named one (at smaller rows, painted before it through a
// third) came out in front, and the name was hidden where the picture draws it over that block. footprint-story's test
// pins the same three blocks.
test('a block come to rest behind a named one, painted before it through a third, hides nothing: the name is drawn', () => {
  const grid = {tile: 100, at: [800, 150]};
  const payments = {name: 'payments', label: 'Payments', at: [5, 5, 0], size: [1, 2, 1]}, crate = {name: 'crate', at: [9, 3, 0], size: [3, 1, 2]}, third = {name: 'third', at: [2, 3, 0], size: [2, 1, 2]};
  const w = worldOf({grid, blocks: [payments, crate, third], motion: [{piece: 'crate', do: 'settle', to: [6.5, 3.5]}]});
  const [move] = w.map.motions, end = move.seconds;
  assert.equal(move.do, 'settle');
  assert.deepEqual(w.motionFindings, [], 'no reel:covers: the name is not hidden');
  const written = (t) => { const said = []; w.draw(new Proxy({}, {get: (_, k) => (k === 'fillText' ? (x) => said.push(x) : typeof k === 'string' ? () => ({width: 10}) : undefined), set: () => true}), t); return said; };
  assert.ok(written(end + 0.5).includes('Payments'), 'at rest behind it, the name is drawn');
  assert.deepEqual(w.texts().filter(x => x.path === 'blocks[0].label').map(x => x.to), [Infinity], 'and listed to read throughout');
});

test('only a block at rest hides a name: one passing over it in flight leaves it drawn, and the check reads no faint word', async t => {
  const over = {piece: 'ball', do: 'throw', to: [7, 11], at: ['drop', 'timed by hand']};
  const w = worldOf({...recipe.story, motion: [...recipe.story.motion, over]}), m = w.map.motions[3];
  const said = (at) => { const s = []; w.draw(new Proxy({}, {get: (_, k) => (k === 'fillText' ? (x) => s.push(x) : typeof k === 'string' ? () => ({width: 10}) : undefined), set: () => true}), at); return s; };
  let crossing = 0;
  for (let at = m.at; at <= m.at + m.seconds; at += 0.02) {
    const b = w.regionsAt(at).find(x => x.name === 'ball').box, you = w.regionsAt(at).find(x => x.name === 'you').box, cx = (you[0] + you[2]) / 2, ny = you[1] + 56;
    if (b[0] < cx + 20 && b[2] > cx - 20 && b[1] < ny + 15 && b[3] > ny - 15) crossing += 1;
    assert.ok(said(at).includes('You'), `at ${at.toFixed(2)} s the name "You" is drawn: a pass is no rest`);
  }
  assert.ok(crossing > 0, 'the ball does pass over the name of "You"');
  assert.deepEqual(w.motionFindings.filter(f => f.path === 'motion[3]'), [], 'a pass is said nowhere');
  // the whole film read as text: no word too faint (on CI this reads DejaVu Sans, the font that showed the peeking name)
  const out = tempDir('motion-over', t);
  assert.match(await check(await readInputs({cwd: project, out, over: 'true'})), /^clean — nothing to fix · 1 piece of advice\n/);
});

test('a name\'s cover box holds the widest letters in any font: "MW" measured in the host\'s own fonts fits it', async () => {
  const {NAME_WIDTH} = await import('footprint-story/isometric');
  const {createCanvas} = await import('@napi-rs/canvas');
  const c = createCanvas(10, 10).getContext('2d'), size = 26;
  for (const family of [theme.type?.sans ?? 'sans-serif', 'sans-serif', 'serif', 'monospace']) for (const word of ['MW', 'WWW', 'Ｗ']) {
    c.font = `700 ${size}px ${family}`;
    assert.ok(c.measureText(word).width <= [...word].length * size * NAME_WIDTH, `"${word}" in ${family}: ${c.measureText(word).width.toFixed(1)} px, the box ${[...word].length * size * NAME_WIDTH} px`);
  }
  // and a block named "MW" with a ball come to rest on its top: its name is hidden, as any name is
  const grid = {tile: 100, at: [800, 250]}, mw = {name: 'mw', label: 'MW', at: [6, 1], size: [2, 2, 1]}, ball = {name: 'ball', at: [1, 5], size: [1, 1, 0.6]};
  const w = worldOf({grid, blocks: [mw, ball], motion: [{piece: 'ball', do: 'throw', to: 'mw', accept: ['reel:covers']}]});
  assert.deepEqual(w.motionFindings.map(f => [f.critic, f.level]), [['reel:covers', 'accepted']]);
});
