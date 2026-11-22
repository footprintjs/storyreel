// A world's pieces rolled, slid and tumbled by intent (footprint-story 0.31; src/kits/isometric/motion-side.mjs, turn.mjs):
// the author writes what happens, footprint-story decides each move's model, duration and curve, side on in the upright
// plane through its way, and the kit lays the samples back on the floor and draws each turn as the grid sees it — a
// ball's marks turning forward, a cube end over end — the angle always the sample's own. Everything 0.43.0 holds for a
// move holds for these: reel:contact swept, no block moved from under a rider, the outline kept on the frame, reel:covers,
// accept, the record, the check's run and log --why --motion. A turn the kit cannot draw truly is refused, saying why.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {planIntents, planMove, sampleMove, checkMove} from 'footprint-story/human';
import {frameHashes, loadTheme} from '../src/index.mjs';
import {compileIsometric, MOTION_FRAME} from '../src/kits/isometric/index.mjs';
import {readMap} from '../src/kits/isometric/read.mjs';
import {buildMap} from '../src/kits/isometric/build.mjs';
import {planMotions} from '../src/kits/isometric/motion.mjs';
import {worldPx} from '../src/kits/isometric/motion-side.mjs';
import {cornerOf} from '../src/kits/isometric/motion-place.mjs';
import {turnAxis, turning, compose, onFace, isUnturned, towardViewer, boxPicture, boxPaint, ballPicture, centreOf, reachOver, apply, UNTURNED} from '../src/kits/isometric/turn.mjs';
import {readInputs, check, log} from '../src/tools.mjs';
import {listRuns} from '../src/runlog.mjs';
import {compileExample} from './golden.mjs';
import {tempDir} from './tmp.mjs';

const dir = fileURLToPath(new URL('../examples/iso-roll/', import.meta.url));
const recipe = JSON.parse(readFileSync(dir + 'recipe.json', 'utf8'));
const film = await compileExample('iso-roll');
const theme = loadTheme('paper');
const worldOf = (spec, where = 'the story') => compileIsometric(spec, {clock: film.clock, theme, where});
const story = worldOf(recipe.story);
const project = fileURLToPath(new URL('./fixtures/iso-roll/', import.meta.url));
// a grid written in numbers, so a world and its "after" picture stand on the very same floor: 100 px tiles, so the
// world's own px are 100 / √2 a tile
const grid = {tile: 100, at: [800, 150]}, unit = 100 / Math.SQRT2;
const TOL = 1e-6;
const close = (a, b, what, tol = TOL) => {
  assert.equal(a.length, b.length, `${what}: ${a} has not the length of ${b}`);
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= tol, `${what}: ${a} is not ${b} (at ${i})`));
};
const region = (w, name, t) => w.regionsAt(t).find((r) => r.name === name).box;
/** A world's moves as the kit plans them over its built map, with their poses. */
const planned = (spec) => { const map = buildMap(readMap(spec, 's'), 's'); return {map, ...planMotions(map, map.motion, film.clock, 's')}; };
/** What a draw asks the canvas to write, at t. */
const written = (w, t) => { const said = []; w.draw(new Proxy({}, {get: (_, k) => (k === 'fillText' ? (x, ...at) => said.push([x, ...at]) : typeof k === 'string' ? () => ({width: 10}) : undefined), set: () => true}), t); return said; };

const ball = {name: 'ball', kind: 'ball', label: 'Ball', at: [1, 5]};
const crate = {name: 'crate', label: 'Crate', at: [1, 1], size: [1.4, 1.4, 1]};
const shelf = {name: 'shelf', label: 'Shelf', at: [6, 1], size: [2, 2, 1.5]};
const cube = {name: 'cube', label: 'Cube', at: [6.5, 1.5, 1.5], size: [1, 1, 1]};

test('the example: footprint-story decides each move — a roll without slipping, a slide under friction, a spinning tumble — and nothing reads wrong', () => {
  assert.deepEqual(story.map.motions.map((m) => [m.path, m.piece, m.do, m.model, m.by]), [
    ['motion[0]', 'ball', 'roll', 'no-slip', 'usual'], ['motion[1]', 'crate', 'slide', 'coulomb', 'usual'],
    ['motion[2]', 'cube', 'tumble', 'free-spin', 'usual'], ['motion[3]', 'ball', 'roll', 'no-slip', 'usual']]);
  assert.match(story.map.motions[0].reason, /^do: 'roll' → no-slip, the usual for do: 'roll' — a ball of radius [\d.]+ px rolling [\d.]+ px on a level floor from \d+ px a second \(the speed that brings it to rest at to under rolling resistance 0\.05\), to rest at to after [\d.]+ s, turning [\d.]+ turns: distance \/ radius$/);
  assert.match(story.map.motions[1].reason, /^do: 'slide' → coulomb, .* to rest at to after [\d.]+ s, slowed by kinetic friction 0\.2 \(static 0\.25\)$/);
  assert.match(story.map.motions[2].reason, /the spin nearest v \/ r that lands it on a face\), .* slides on at \d+ px a second, its spin stopped by the floor \(a box slides on\)/);
  assert.deepEqual(story.motionFindings, [], 'every move is true: no critic finds anything');
  assert.deepEqual(film.motionRuns.map((m) => [m.name, m.kit, m.findings.length]), [['story', 'isometric', 0]]);
  // the moves are footprint-story's: planIntents over the intents the kit handed it gives the very seconds and reasons
  const again = planIntents(story.motionIntents, {frame: [...MOTION_FRAME]});
  assert.deepEqual(again.durations.map((d) => +d.seconds.toFixed(3)), story.map.motions.map((m) => m.seconds));
  assert.deepEqual(again.moves.map((m) => m.reason), story.map.motions.map((m) => m.reason));
  // the same intents give the same moves, exactly: nothing in them is chance
  assert.deepEqual(worldOf(recipe.story).map.motions, story.map.motions);
  assert.deepEqual(worldOf(recipe.story).motionIntents, story.motionIntents);
});

test('the intents are footprint-story\'s words side on along the way, in the world\'s px: the radius is the ball\'s, a slide rides its floor, a cube lands its middle on to', () => {
  const w = worldOf({grid, blocks: [ball, crate, shelf, cube], motion: [{piece: 'ball', do: 'roll', to: [5, 6]}, {piece: 'crate', do: 'slide', to: [3, 2]}, {piece: 'cube', do: 'tumble', to: [9.5, 2]}]});
  const [roll, slide, tumble] = w.motionIntents;
  assert.deepEqual(Object.keys(roll), ['do', 'name', 'who', 'from', 'to', 'radius', 'shape']);
  close([...roll.from, ...roll.to, roll.radius], [0, -unit * 0.5, unit * Math.hypot(3.5, 0.5), -unit * 0.5, unit * 0.5], 'a ball of radius 0.5 tiles rolls from its start along its way, its middle half a tile up');
  assert.equal(roll.shape, 'ball');
  assert.deepEqual(Object.keys(slide), ['do', 'name', 'who', 'from', 'to'], 'a slide takes no radius: its foot rides the floor');
  close([...slide.from, ...slide.to], [0, 0, unit * Math.hypot(1.3, 0.3), 0], 'the crate slides from its foot to to');
  assert.ok(Object.is(slide.from[1], 0) && Object.is(slide.to[1], 0), 'on the floor: 0, never −0');
  close([...tumble.from, ...tumble.to, tumble.radius], [0, -unit * 2, unit * 2.5, -unit * 0.5, unit * 0.5], 'the cube flies from its middle on the shelf to its middle landed on the floor');
  assert.equal(tumble.shape, 'box');
  assert.equal(worldPx({tile: [100, 50]}), unit, 'a tile\'s width over √2: a level line across the frame at its true length');
});

test('a roll ends exactly on to and turns by distance / radius: the turn drawn is the sample\'s own angle about the line across its way, its top carried forward', () => {
  const spec = {grid, blocks: [ball, {name: 'box', at: [6, 1]}], motion: [{piece: 'ball', do: 'roll', to: [5, 6], wrap: [{wrapper: 'anticipate'}]}]};
  const p = planned(spec), [m] = p.moves, heading = [3.5, 0.5].map((v) => v / Math.hypot(3.5, 0.5));
  close(m.side.heading, heading, 'its way');
  const w = worldOf(spec), landed = worldOf({grid, blocks: [{...ball, at: [4.5, 5.5]}, {name: 'box', at: [6, 1]}]});
  close(region(w, 'ball', m.seconds + 0.1), region(landed, 'ball', 0), 'it comes to rest exactly where a ball built there stands');
  for (const t of [0.05, 0.3, 1, m.seconds / 2, m.seconds]) {
    const pose = p.poseAt(m.piece, t), s = sampleMove(m.move, Math.min(t, m.seconds));
    assert.equal(pose.angle, s.angle, `at ${t} s the angle is the sample's`);
    close(pose.turn, turning(turnAxis(heading), s.angle), `at ${t} s the turn is that angle about the line across its way`, 1e-12);
  }
  const last = sampleMove(m.move, m.seconds);
  close([last.angle * unit * 0.5], [unit * Math.hypot(3.5, 0.5)], 'its last angle times its radius is the way it rolled: no slip');
  // forward: a small turn carries its top along its way and down nothing
  const top = apply(turning(turnAxis(heading), 0.01), [0, 0, 1]);
  close([top[0] * heading[0] + top[1] * heading[1]], [Math.sin(0.01)], 'its top goes forward by the sine of the turn', 1e-12);
  // while it turns its name is not drawn (a name on a turning body is no part of it); at rest, on its middle
  assert.ok(!written(w, m.seconds / 2).some(([x]) => x === 'Ball'));
  const [, x, y] = written(w, m.seconds + 0.1).find(([x]) => x === 'Ball'), b = region(w, 'ball', m.seconds + 0.1);
  close([x, y], [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], 'its name sits on the ball\'s middle');
  assert.deepEqual(w.texts().filter((l) => l.path === 'blocks[0].label').map((l) => [+l.from.toFixed(6), l.to]), [[+m.seconds.toFixed(6), Infinity]]);
});

test('a ball rolled twice turns on from where its first roll left it: no jump back', () => {
  const p = planned(recipe.story), [first, , , second] = p.moves;
  assert.equal(p.poseAt(first.piece, first.start - 0.01), null, 'as built before its first move');
  const end = p.poseAt(first.piece, first.start + first.seconds).turn, start = p.poseAt(second.piece, second.start).turn;
  assert.ok(!isUnturned(end), 'turned by its first roll');
  close(start, end, 'its second roll starts from its first roll\'s turn', 1e-12);
  const between = p.poseAt(first.piece, (first.start + first.seconds + second.start) / 2).turn;
  close(between, end, 'at rest between, it keeps its turn', 1e-12);
});

test('a slide moves the block without turning it, its name drawn on it all the way, and it ends exactly on to', () => {
  const spec = {grid, blocks: [crate, shelf], motion: [{piece: 'crate', do: 'slide', to: [3, 2]}]};
  const p = planned(spec), [m] = p.moves, w = worldOf(spec);
  for (const t of [0.1, m.seconds / 2, m.seconds, m.seconds + 1]) assert.ok(!('turn' in p.poseAt(m.piece, t)) && !('angle' in p.poseAt(m.piece, t)), `no turn at ${t} s`);
  assert.ok(written(w, m.seconds / 2).some(([x]) => x === 'Crate'), 'its name rides on it');
  assert.deepEqual(w.texts().filter((l) => l.path === 'blocks[0].label').map((l) => [l.from, l.to]), [[0.35, Infinity]]);
  const landed = worldOf({grid, blocks: [{...crate, at: [3 - 0.7, 2 - 0.7]}, shelf]});
  close(region(w, 'crate', m.seconds + 0.1), region(landed, 'crate', 0), 'it rests exactly where a crate built there stands');
  assert.ok(region(w, 'crate', m.seconds / 2)[0] > region(w, 'crate', 0)[0], 'half way, it has moved along its way');
});

test('a tumble turns a block end over end, lands it on a face and slides it on: at rest it is the block built there', () => {
  const spec = {grid, blocks: [shelf, cube], motion: [{piece: 'cube', do: 'tumble', to: [9.5, 2]}]};
  const p = planned(spec), [m] = p.moves, w = worldOf(spec), last = sampleMove(m.move, m.seconds);
  close(m.end, [7 + last.x / unit, 2, 0], 'it rests where footprint-story\'s plan ends: its last sample laid on the floor along its way');
  assert.ok(m.end[0] > 9.5, 'past where it landed: it slid on');
  // the end is the plan of the intent alone, and the whole list's plan gives the same move
  close([sampleMove(planIntents(w.motionIntents).moves[0], m.seconds).x], [last.x], 'one plan, alone or in a list');
  const flying = p.poseAt(m.piece, m.move.plan.basis.flightSeconds / 2);
  assert.ok(flying.turn && !onFace(flying.turn), 'in the air it is turned off its faces');
  assert.ok(onFace(p.poseAt(m.piece, m.seconds).turn), 'it lands on a face');
  const built = worldOf({grid, blocks: [shelf, {...cube, at: cornerOf(m.end, cube.size)}]});
  close(region(w, 'cube', m.seconds + 0.1), region(built, 'cube', 0), 'at rest it is the block built there, to the pixel');
  // drawn turned: its outline is its turned corners', not the built one moved
  const mid = region(w, 'cube', m.move.plan.basis.flightSeconds / 2), plain = region(built, 'cube', 0);
  assert.ok(mid[2] - mid[0] > plain[2] - plain[0] + 1, 'turned corner on, it is wider than the block square on');
  // its name hidden while it turns, drawn again at rest
  assert.deepEqual(w.texts().filter((l) => l.path === 'blocks[1].label').map((l) => [+l.from.toFixed(6), l.to]), [[+m.seconds.toFixed(6), Infinity]]);
  assert.ok(!written(w, m.seconds / 2).some(([x]) => x === 'Cube') && written(w, m.seconds + 0.1).some(([x]) => x === 'Cube'));
  // wrapped, each move still rests where its plan ends (motion.mjs refuses a list plan that ends elsewhere than the kit placed it)
  for (const wrap of [[{wrapper: 'anticipate'}, {wrapper: 'overshoot'}], [{wrapper: 'follow-through'}], [{wrapper: 'hold', at: 0.3, seconds: 0.4}]]) {
    const q = planned({grid, blocks: [ball, crate, shelf, cube], motion: [{piece: 'ball', do: 'roll', to: [5, 6], wrap}, {piece: 'crate', do: 'slide', to: [3, 2], wrap}, {piece: 'cube', do: 'tumble', to: [9.5, 2], wrap}]});
    close(q.moves[0].end, [5, 6, 0], `the roll wrapped in ${wrap.map((x) => x.wrapper)} rests on to`);
    close(q.moves[1].end, [3, 2, 0], `the slide wrapped in ${wrap.map((x) => x.wrapper)} rests on to`);
    assert.ok(onFace(q.poseAt(q.moves[2].piece, q.moves[2].start + q.moves[2].seconds).turn), `the tumble wrapped in ${wrap.map((x) => x.wrapper)} lands on a face`);
  }
});

test('turn.mjs: unturned, a block\'s picture is the built one and a ball\'s outline a circle; turns compose; a turning block\'s reach', () => {
  const map = buildMap(readMap({grid, blocks: [{name: 'b', at: [2, 3, 0.5], size: [2, 1, 1.5]}, {name: 'o', kind: 'ball', at: [5, 5], size: [1.2, 1.2, 1.2]}]}, 's'), 's');
  const [b, o] = map.blocks, sorted = (pts) => [...pts].map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const faces = boxPicture(map.grid, centreOf(b), b.size, UNTURNED).faces;
  assert.equal(faces.length, 3, 'three faces seen');
  for (const item of b.paint) assert.ok(faces.some((f) => JSON.stringify(sorted(f.points)) === JSON.stringify(sorted(item.points))), `the built ${item.role} face is a seen face`);
  // the paint recipes square on are the built faces' (top 20% white, lower left 6% black, lower right 18% black)
  const recipes = boxPaint({faces}, (p) => p, {line: 2.5}).map((it, i) => [faces[i].normal.map((v) => Math.round(v)).join(), it.fill.mix[0], +it.fill.mix[1].toFixed(12)]);
  assert.deepEqual(recipes.sort(), [['0,0,1', '#ffffff', 0.2], ['0,1,0', '#000000', 0.06], ['1,0,0', '#000000', 0.18]].sort());
  for (const item of b.paint) assert.deepEqual(item.fill.mix, recipes.find(([n]) => n === {top: '0,0,1', left: '0,1,0', right: '1,0,0'}[item.role]).slice(1), `${item.role}'s recipe`);
  // a ball: its outline a circle of its radius in the world's px round its middle, on the usual grid
  const pic = ballPicture(map.grid, centreOf(o), 0.6, UNTURNED), mid = map.grid.at(5.6, 5.6, 0.6);
  close(pic.centre, [mid.x, mid.y], 'its middle');
  for (const [x, y] of pic.outline) close([Math.hypot(x - mid.x, y - mid.y)], [0.6 * unit], 'on its circle');
  close(o.shape.centre, pic.centre, 'the ball\'s shape is its own: its name goes on its middle');
  close(towardViewer(map.grid), [1, 1, Math.sqrt(2 / 3)].map((v) => v / Math.sqrt(2 + 2 / 3)), 'the viewer looks down at 30° from the corner');
  // turns
  const a = turnAxis([1, 0]);
  close(compose(turning(a, 0.3), turning(a, 0.4)), turning(a, 0.7), 'two turns about one line are their sum', 1e-12);
  assert.ok(onFace(turning(a, Math.PI / 2)) && onFace(turning(a, 3 * Math.PI)) && !onFace(turning(a, 0.3)));
  assert.ok(isUnturned(turning(a, 2 * Math.PI)) && !isUnturned(turning(a, Math.PI)));
  // reach: square on 1, corner on √2, at the most over a turn that passes a corner
  const f = (t) => Math.abs(Math.cos(t)) + Math.abs(Math.sin(t));
  close([reachOver(0, 0), reachOver(0, Math.PI / 4), reachOver(0.1, 0.2), reachOver(-0.1, 0.05), reachOver(2.3, 2.4), reachOver(-4, -3.9), reachOver(-3.9, -3.8)],
    [1, Math.SQRT2, f(0.2), f(-0.1), Math.SQRT2, Math.SQRT2, Math.max(f(-3.9), f(-3.8))], 'its reach', 1e-12);
});

test('refusals name the entry and the fix', () => {
  const blocks = [ball, crate, shelf, cube, {name: 'drum', kind: 'cylinder', at: [3, 7], size: [1, 1, 1]}, {name: 'slab', at: [1, 8], size: [2, 1, 1]}, {name: 'high', kind: 'ball', at: [4, 4, 2]}];
  const cases = [
    [{piece: 'crate', do: 'roll', to: [4, 2]}, /^Error: stage s: isometric motion\[0\] \("crate"\): a block does not roll — it would tip over its edges, not turn on a rim: slide it \(do: "slide"\), tumble it \(do: "tumble"\), or make it a ball \(kind: "ball"\)$/],
    [{piece: 'drum', do: 'roll', to: [5, 7]}, /\("drum"\): a cylinder stands on its flat end and the kit draws it upright, so it cannot be drawn rolling on its rim — make it a ball \(kind: "ball"\), or slide it \(do: "slide"\)$/],
    [{piece: 'drum', do: 'tumble', to: [5, 7]}, /\("drum"\): a cylinder tumbling end over end would land on its rim and roll on, .* make it a ball \(kind: "ball"\) or a block, or throw it \(do: "throw"\)$/],
    [{piece: 'ball', do: 'roll'}, /\("ball"\): a roll needs to, where it ends: a block's name \("crate"\) or tiles \(\[col, row\]\)$/],
    [{piece: 'ball', do: 'slide', to: [4, 6], from: [1, 1]}, /a slide takes no from — it starts where the block is \(to says where it ends\): take from out$/],
    [{piece: 'high', do: 'roll', to: [6, 4]}, /\("high"\): a roll goes along what "high" rests on, and it stands in the air at lift 2 \(under it is the floor\) — let it fall first \(do: "fall"\), or tumble it down \(do: "tumble"\)$/],
    [{piece: 'ball', do: 'roll', to: 'shelf'}, /\("ball"\): a roll keeps to the level it starts on, the floor, and to is at lift 1\.5 — roll it to tiles beside "shelf" \(\[7, 2\]\), or throw it up \(do: "throw"\)$/],
    [{piece: 'cube', do: 'slide', to: [7.5, 2]}, /\("cube"\): a slide keeps to the level it starts on, "shelf"'s top \(lift 1\.5\), and to is at lift 0 — give to at its level \(\[7\.5, 2, 1\.5\]\), or tumble it there \(do: "tumble"\)$/],
    [{piece: 'cube', do: 'slide', to: [9, 2, 1.5]}, /\("cube"\): its way runs off "shelf"'s top \(lift 1\.5\) — at to \[9, 2, 1\.5\] its middle is past the top's edge, and a slide keeps to the level it starts on: a to on that top, or throw it \(do: "throw"\)$/],
    [{piece: 'ball', do: 'roll', to: [1.5, 5.5]}, /\("ball"\): to is where it stands — a roll goes somewhere along the floor: give a place apart from where it stands$/],
    [{piece: 'cube', do: 'tumble', to: [9, 4]}, /\("cube"\): a block tumbles end over end about one of its own edges, so its way runs along a row or a column, and this one runs between them — to: \[9, 2\] or \[7, 4\]$/],
    [{piece: 'slab', do: 'tumble', to: [5, 8.5]}, /\("slab"\): a block tumbling end over end lands on a face, and shows the same block again only when it is as long along its way as it is high — "slab" is 2 tiles along its way and 1 high: make them equal \(size: \[1, 1, 1\]\), or slide it \(do: "slide"\)$/],
    [{piece: 'ball', do: 'tumble', to: 'shelf'}, /\("ball"\): a tumble flies down onto to, and to \(lift 1\.5\) is above where "ball" starts \(lift 0\) — throw it up \(do: "throw"\), or tumble it to a place no higher$/],
    [{piece: 'high', do: 'tumble', to: [6, 6, 1]}, /\("high"\): to \[6, 6, 1\] is in the air \(under it is the floor\) — land it on a block's top \(to: its name\) or on the floor \(to: \[col, row\]\)$/],
    [{piece: 'high', do: 'tumble', to: [4.5, 4.5, 0]}, /\("high"\): to is straight below it \(a tumble flies across: or let it fall, do: "fall"\) — a tumble goes somewhere along the floor: give a place apart from where it stands$/],
    [{piece: 'cube', do: 'tumble', to: [2, 2, 1]}, /\("cube"\): it lands on "crate"'s top \(lift 1\) and slides on [\d.]+ tiles, off its edge — it would come to rest on nothing: land it on the floor \(to: \[col, row\]\), nearer the top's far side, or slow it once it lands \(model: \{"name": "free-spin", "kinetic": …\}\)$/],
    [{piece: 'ball', do: 'roll', to: [5, 6], model: {name: 'no-slip', resistance: 7}}, /^Error: stage s: isometric motion\[0\] \("ball"\): model "no-slip"'s resistance is /],
  ];
  for (const [motion, message] of cases) assert.throws(() => worldOf({grid, blocks, motion: [motion]}, 'stage s'), message, JSON.stringify(motion));
  // a ball is round every way, has no ports, and is drawn only in today's look
  assert.throws(() => worldOf({grid, blocks: [{...ball, size: [1, 1, 2]}]}, 'stage s'), /^Error: stage s: isometric blocks\[0\] \("ball"\): a ball is round every way — its size is \[wide, wide, wide\], one number three times \(not \[1,1,2\]\)$/);
  assert.throws(() => worldOf({grid, blocks: [{...ball, ports: [{name: 'p', at: [0.5, 0, 0.5]}]}]}, 'stage s'), /\("ball"\): a ball has no ports — a wire joins it at its foot: take ports out$/);
  assert.throws(() => worldOf({grid, style: {line: 'none'}, blocks: [ball]}, 'stage s'), /\("ball"\): a ball is drawn in today's look, and this world names a style .* take style out, or make it a cylinder \(kind: "cylinder"\)$/);
});

test('reel:contact sweeps a roll and a tumble: a wall in the way is found with the fix, a turning cube by the box it fills', () => {
  const roll = worldOf({grid, blocks: [{...ball, at: [0, 3]}, {name: 'wall', at: [3, 2], size: [0.2, 3, 1]}], motion: [{piece: 'ball', do: 'roll', to: [6, 3.5]}]});
  assert.deepEqual(roll.motionFindings.map((f) => [f.path, f.critic, f.level]), [['motion[0]', 'reel:contact', 'warn']]);
  assert.match(roll.motionFindings[0].what, /^at [\d.]+ s it goes 0\.2 tiles into "wall" — it passes through a block$/);
  assert.equal(roll.motionFindings[0].fix, 'move it round "wall": a to clear of it, or throw it over (do: "throw")');
  const post = {name: 'post', at: [0, 3], size: [1, 1, 2]}, flier = {...cube, at: [0, 3, 2]};
  const tumble = (h) => worldOf({grid, blocks: [flier, post, {name: 'wall', at: [2.5, 2], size: [0.2, 3, h]}], motion: [{piece: 'cube', do: 'tumble', to: [4, 3.5]}]}).motionFindings;
  assert.deepEqual(tumble(1.5), [], 'over a low wall: nothing');
  const [hit] = tumble(2);
  assert.deepEqual([hit.critic, hit.level, hit.fix], ['reel:contact', 'warn', 'tumble it to a place clear of "wall", or move "wall" out of its way']);
  // what it fills turning is at least what it fills square on, and at most √2 of its half side out from its middle
  assert.ok(reachOver(0, 0.3) > 1 && reachOver(0, 0.3) <= Math.SQRT2);
  assert.deepEqual(worldOf({grid, blocks: [shelf, cube], motion: [{piece: 'cube', do: 'tumble', to: [9.5, 2]}]}).motionFindings, [], 'off the shelf it touches the shelf only where it stood');
});

test('a block resting on one that slides or tumbles would be left on nothing: refused, naming both', () => {
  const rider = {...ball, at: [1.2, 1.2, 1]};
  assert.throws(() => worldOf({grid, blocks: [crate, rider], motion: [{piece: 'crate', do: 'slide', to: [4, 2]}]}, 'stage s'),
    /^Error: stage s: isometric motion\[0\] \("crate"\): it moves "crate" from under "ball", which rests on its top as built, and would leave it on nothing — move "ball" off first/);
  assert.throws(() => worldOf({grid, blocks: [shelf, cube], motion: [{piece: 'shelf', do: 'slide', to: [3, 5]}]}, 'stage s'), /it moves "shelf" from under "cube"/);
  // a ball rolled along the crate's top relies on the crate standing still meanwhile (motion.mjs refuses one that moves)
  const p = planned({grid, blocks: [{...crate, size: [3, 3, 1]}, rider], motion: [{piece: 'ball', do: 'roll', to: [3.5, 3.5, 1]}]});
  assert.deepEqual(p.moves[0].leans.map((b) => b.name), ['crate']);
  assert.deepEqual(p.moves[0].end, [3.5, 3.5, 1], 'and stays on its top, at its lift');
});

test('the drawn way stays on the frame: a tumble that rolls on off the frame is refused, saying how to slow it', () => {
  const blocks = [{...ball, at: [0, 3, 2]}, {name: 'post', at: [0, 3], size: [1, 1, 2]}];
  assert.throws(() => worldOf({grid: {tile: 100, at: [800, 300]}, blocks, motion: [{piece: 'ball', do: 'tumble', to: [6, 3.5]}]}, 'stage s'),
    /^Error: stage s: isometric motion\[0\] \("ball"\): its way leaves the frame — at [\d.]+ s the block is \d+ px to the right \(its foot at tiles \[[\d.]+, 3\.5, 0\]\) — a nearer to, or slow it once it lands \(model: \{"name": "free-spin", "resistance": …\}\)$/);
  // slowed as it says, it stays on the frame
  assert.doesNotThrow(() => worldOf({grid: {tile: 100, at: [800, 300]}, blocks, motion: [{piece: 'ball', do: 'tumble', to: [6, 3.5], model: {name: 'free-spin', resistance: 0.4}}]}));
});

test('reel:covers: a block slid to rest in front of another\'s name hides it and says so', () => {
  const pad = {name: 'pad', label: 'Pad', at: [3, 3], size: [2, 2, 0.3]}, tower = {name: 'tower', label: 'T', at: [7, 4], size: [1, 1, 3]};
  const w = worldOf({grid, blocks: [pad, tower], motion: [{piece: 'tower', do: 'slide', to: [5.6, 5.6]}]}), end = w.motionFindings[0].to;
  assert.deepEqual(w.motionFindings.map((f) => [f.critic, f.level, f.what]), [['reel:covers', 'warn', 'it comes to rest over "pad"\'s name ("Pad"), which is hidden from then']]);
  assert.deepEqual(w.texts().filter((l) => l.path === 'blocks[0].label').map((l) => [l.from, +l.to.toFixed(6)]), [[0.35, +end.toFixed(6)]]);
  const meant = worldOf({grid, blocks: [pad, tower], motion: [{piece: 'tower', do: 'slide', to: [5.6, 5.6], accept: ['reel:covers']}]});
  assert.deepEqual(meant.motionFindings.map((f) => f.level), ['accepted']);
});

test('accept: a roll is checked by roll-slip, spin and contact, a slide by spin and contact, a tumble by all four with spacing', () => {
  const w = worldOf({grid, blocks: [ball], motion: [{piece: 'ball', do: 'roll', to: [5, 6], accept: ['roll-slip', 'spin']}]});
  assert.deepEqual(w.map.motions[0].accepted, ['roll-slip', 'spin']);
  assert.throws(() => worldOf({grid, blocks: [crate], motion: [{piece: 'crate', do: 'slide', to: [4, 2], accept: ['roll-slip']}]}, 'stage s'),
    /accept names "roll-slip", which its move \(coulomb\) is not checked by — its critics are spin, contact, reel:contact, reel:covers$/);
  assert.doesNotThrow(() => worldOf({grid, blocks: [shelf, cube], motion: [{piece: 'cube', do: 'tumble', to: [9.5, 2], accept: ['spin', 'spacing', 'roll-slip']}]}));
});

test('roll-slip and spin reach the check\'s reply at their own level, naming the entry and the fix: a skid is a fix, a spin too fast to read a note', async () => {
  const {reviewPart, REVIEW_CHECKS} = await import('../src/review.mjs');
  const {problemsOf} = await import('../src/check/index.mjs');
  // the kit's own moves roll true, so these critics find nothing in them (the example's test above): here footprint-story's
  // critics speak on moves spoiled by hand — a roll drawn turning the wrong way, and a 1 px ball rolled 100000 px, whose
  // spin no track of footprint-story's most samples can read — in its own words, as the kit records a finding
  const who = 'isometric motion[0] ("ball")', roll = planMove({do: 'roll', name: 'ball', who, from: [0, 0], to: [500, 0], radius: 20});
  const skid = checkMove({...roll, plan: {...roll.plan, turnSign: -1}}).findings.find((f) => f.critic === 'roll-slip');
  assert.equal(skid.level, 'warn');
  const fast = planMove({do: 'roll', name: 'ball', who, from: [0, 0], to: [1e5, 0], radius: 1, model: {name: 'no-slip', resistance: 1}});
  const blur = checkMove(fast).findings.find((f) => f.critic === 'spin');
  assert.equal(blur.level, 'note');
  assert.match(blur.message, /its spin is too fast to read/);
  // as motion.mjs · recordsOf keeps them: the entry's path, the move's span, the words less its name
  const kept = (f, from) => ({path: 'story.motion[0]', from, to: from + 1, critic: f.critic, level: f.level, what: f.message.slice(who.length + 2), fix: f.fix});
  const moved = {...film, motionRuns: [{name: 'story', kit: 'isometric', run: film.motionRuns[0].run, findings: [kept(skid, 1), kept(blur, 4)]}]};
  const r = await reviewPart(moved, {checks: {motion: REVIEW_CHECKS.motion}});
  assert.deepEqual(r.findings.map((f) => [f.kind, f.where]), [['motion', 'story.motion[0]'], ['motion-note', 'story.motion[0]']]);
  assert.match(r.findings[0].what, /^roll-slip: its drawn turn is -1× distance \/ radius .* it turns the wrong way for the way it goes$/);
  assert.match(r.findings[0].fix, /^turn it by distance \/ radius: do: 'roll' \(model: 'no-slip'\) with radius: 20$/);
  assert.match(r.findings[1].what, /^spin: its spin is too fast to read — even at \d+ samples a second some step turns more than 30°, so no jump is judged$/);
  const problems = problemsOf({review: {findings: r.findings, lines: r.findings.map((f) => f.what), verdicts: []}});
  assert.deepEqual(problems.map((p) => [p.level, p.kind]), [['error', 'motion'], ['advice', 'motion-note']], 'the skid is a fix; the note is advice');
});

test('a check runs the moves through footprint-story\'s chart and reads clean; log --why --motion says why each takes its time', async (t) => {
  const out = tempDir('roll-why', t);
  const said = await check(await readInputs({cwd: project, out}));
  assert.match(said, /^clean — nothing to fix\n/);
  assert.doesNotMatch(said, /drift|not kept/);
  const ask = (why) => log({cwd: project, out, run: '1', why, motion: 'story'});
  assert.match(await ask('duration-0'), /^duration-0 = \{"seconds":[\d.]+,"plane":"side","slope":0,"radius":[\d.]+,"shape":"ball","inertia":0\.4,"resistance":0\.05,.*"endedBy":"end",.*"rolledBack":false\}\nwrap \(wrap#3\)/);
  assert.match(await ask('model-2'), /^model-2 = \{"model":"free-spin","family":"tumble","by":"usual",/);
  assert.match(await ask('findings-1'), /^findings-1 = \[\]\nfindings \(findings#6\)/);
  assert.ok(said.includes(`--why duration-0 --motion story`) && listRuns(out).length === 1);
  // the same film with no motion moves nothing and says nothing of motion
  const still = await check(await readInputs({cwd: project, out: tempDir('roll-still', t), still: 'true'}));
  assert.doesNotMatch(still, /motions?[: ]/);
});

test('the same intents give the same frames, drawn in any order; the frames are pinned in golden.json', async () => {
  const times = Array.from({length: 14}, (_, k) => +((k + 0.5) * film.total / 14).toFixed(3));
  const first = frameHashes(film, {times, width: 320}), again = frameHashes(await compileExample('iso-roll'), {times: [...times].reverse(), width: 320});
  for (const t of times) assert.equal(again[t], first[t], `the frame at ${t} s is the same, drawn again last first`);
  const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
  assert.ok(golden['iso-roll'], 'iso-roll is pinned');
});

test('a ball at rest: built as the cylinder round it, drawn as a ball with its name on its middle, recorded as a ball', () => {
  const w = worldOf({grid, blocks: [{...ball, size: [1.2, 1.2, 1.2]}, {name: 'box', at: [5, 5]}]});
  assert.deepEqual(w.map.blocks[0].kind, 'ball');
  assert.ok(!('motions' in w.map), 'a world with a ball and no motion moves nothing');
  const b = region(w, 'ball', 0), mid = buildMap(readMap({grid, blocks: [{...ball, size: [1.2, 1.2, 1.2]}]}, 's'), 's').grid.at(1.6, 5.6, 0.6);
  close(b, [mid.x - 0.6 * unit, mid.y - 0.6 * unit, mid.x + 0.6 * unit, mid.y + 0.6 * unit], 'framed as the ball is drawn: its circle', 1e-3);
  const [, x, y] = written(w, 1).find(([text]) => text === 'Ball');
  close([x, y], [mid.x, mid.y], 'its name on its middle');
  // drawn the same at any moment and in any order
  const hash = (t) => frameHashes({...film, frame: (c, at) => w.draw(c, at), total: 1}, {times: [t], width: 160})[t];
  assert.equal(hash(0.5), hash(0.9));
});
