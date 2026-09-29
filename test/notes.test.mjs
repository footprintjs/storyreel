import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings, paceTimings, makeClock, cartoonKit} from '../src/index.mjs';
import {compileWhiteboard, spotAt} from '../src/kits/whiteboard/index.mjs';

// Four scenes: a red story, a blue world with a white square in the middle (a push shows it grow), two pages.
const storyboard = {title: 'Notes', scenes: [
  {id: 'a', narration: 'This is the first world, all in red. It stays red for a while, and then it is gone.'},
  {id: 'b', narration: 'Now the second world arrives, all in blue. Look at the square in the middle of it, and look again at it once more.'},
  {id: 'c', narration: 'And here is a page of paper with some code on it.'},
  {id: 'd', narration: 'And a second page, right after it, with the same code.'},
]};
const world = (name, draw, more = {}) => ({name, story: {compile: () => ({hang: 1, spotAt: () => null, sounds: [], draw, ...more})}});
const red = world('red', c => { c.fillStyle = '#ff0000'; c.fillRect(0, 0, 1600, 900); });
const squareDraw = c => { c.fillStyle = '#0000ff'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#ffffff'; c.fillRect(750, 400, 100, 100); };
const square = world('square', squareDraw);
const kits = [red, square];
const root = fileURLToPath(new URL('../examples/worlds/', import.meta.url));
const recipe = (more = {}, enter = 'fade') => ({story: {kit: 'red'}, stages: [
  {type: 'world', scene: 'b', enter, world: {kit: 'square'}},
  {type: 'code', scene: 'c', chrome: false, code: {file: 'count.ts'}, reveal: [[0, ['c', 'a page of paper']]]},
  {type: 'code', scene: 'd', chrome: false, code: {file: 'count.ts'}, reveal: [[0, ['d', 'a second page']]]},
], ...more});
const timings = evenTimings(storyboard);
const film = (more, enter, k = kits) => compileFilm({storyboard, timings, recipe: recipe(more, enter), kits: k, root});
const pixel = (f, t, x, y) => { const c = createCanvas(1600, 900), ctx = c.getContext('2d'); f.frame(ctx, t); return [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)]; };
const look = (f, t) => { const c = createCanvas(320, 180), ctx = c.getContext('2d'); ctx.scale(.2, .2); f.frame(ctx, t); return createHash('sha256').update(c.data()).digest('hex'); };
const stagesAt = (f, t) => [...new Set(f.regionsAt(t).map(r => r.path.match(/^stages\[\d+\]/)?.[0]).filter(Boolean))];

const hello = fileURLToPath(new URL('../examples/hello/', import.meta.url)), read = f => JSON.parse(readFileSync(hello + f, 'utf8'));
const helloBoard = read('storyboard.json'), helloRecipe = read('recipe.json'), helloTimings = evenTimings(helloBoard, {tail: 4});
const helloFilm = notes => compileFilm({storyboard: helloBoard, timings: helloTimings, recipe: {...helloRecipe, notes}, root: hello});

test('a note carries its words and exactly one camera word; anything else refuses', async () => {
  await assert.rejects(film({notes: [{speed: .8}]}), /note 0 needs its words/);
  await assert.rejects(film({notes: [{note: 'slower and cut', speed: .8, cut: 'c'}]}), /exactly one camera word \(speed, cut, push\); it has speed and cut/);
  await assert.rejects(film({notes: [{note: 'dissolve', fade: 'c'}]}), /unsupported key fade; the camera words are speed, cut, push/);
  await assert.rejects(film({notes: [{note: 'too slow', speed: .1}]}), /speed must be a number between 0.25 and 4/);
  await assert.rejects(film({notes: [{note: 'slow', speed: .8}, {note: 'slower', speed: .7}]}), /already has a speed \("slow"\); one speed for the whole film/);
  await assert.rejects(film({notes: [{note: 'cut', cut: 'c'}, {note: 'cut again', cut: 'c'}]}), /scene c already has a cut/);
  const push = {at: [800, 450], from: ['b', 'Look at the square'], to: ['b', 'look again']};
  await assert.rejects(film({notes: [{note: 'off the frame', push: {...push, at: [1700, 450]}}]}), /push.at must be \[x, y\] on the 1600×900 frame/);
  await assert.rejects(film({notes: [{note: 'no zoom', push: {...push, zoom: 1}}]}), /push.zoom must be above 1 and at most 3/);
  await assert.rejects(film({notes: [{note: 'slow ease', push: {...push, seconds: 5}}]}), /push.seconds .* between 0.2 and 3/);
  await assert.rejects(film({notes: [{note: 'no end', push: {at: [800, 450], from: push.from}}]}), /push needs from and to/);
  await assert.rejects(film({notes: [{note: 'spin', push: {...push, spin: 1}}]}), /push has unsupported key spin/);
  assert.deepEqual((await film()).notes, [], 'a film without notes applies none');
});

test('speed: every camera move takes its seconds divided by the speed; a world that cannot follow refuses', async () => {
  // A spotlight on the whiteboard eases in over 0.6 s; at half speed, over 1.2 s.
  const clock = makeClock(helloBoard, helloTimings), spec = {items: [], spots: [{from: ['story', 'a shepherd'], to: ['story', 'came home'], at: [500, 500], r: 200}]};
  const at = clock.at(['story', 'a shepherd']);
  assert.equal(spotAt(compileWhiteboard(spec, clock), at + .6).w, 1);
  assert.ok(Math.abs(spotAt(compileWhiteboard(spec, clock, {cameraSpeed: .5}), at + .6).w - .5) < 1e-9, 'half way in at half speed');
  // The push-in takes turn / speed; the film says what the note changed.
  const quicker = await helloFilm([{note: 'The push-in drags', speed: 1.2}]);
  assert.deepEqual(quicker.notes, [{note: 'The push-in drags', speed: 1.2, pushIn: {seconds: 1.5, was: 1.8}, worlds: ['whiteboard'], pushes: 0}]);
  // A slower push-in must still be done before the card moves aside for the first stage.
  await assert.rejects(helloFilm([{note: 'Slow it all', speed: .5}]), /The push-in ends at .* \(at camera speed 0.5 it takes 3.60 s\), after the card moves aside for the first stage .*: give the scene before rule a longer tail/);
  // The cartoon's camera moves follow the speed too (its move lasts 1.6 s; at half speed it is still moving at 2 s).
  const dir = fileURLToPath(new URL('../examples/worlds/', import.meta.url)), w = f => JSON.parse(readFileSync(dir + f, 'utf8'));
  const sb = w('storyboard.json'), paced = paceTimings(sb, evenTimings(sb, {tail: .8}), w('pacing.json'));
  const worlds = notes => compileFilm({storyboard: sb, timings: paced, recipe: {...w('recipe.json'), notes}, kits: [cartoonKit], root: dir, strings: w('strings/en.json')});
  const [plain, slow] = [await worlds(), await worlds([{note: 'Slower camera', speed: .5}])], move = plain.clock.at(['valley', 'lets the sheep out']);
  assert.notEqual(look(plain, move + 2), look(slow, move + 2), 'mid-move, the slow camera is elsewhere');
  assert.equal(look(plain, move + 3.4), look(slow, move + 3.4), 'and both have arrived once the slow move is done');
  assert.deepEqual(slow.notes[0].worlds.sort(), ['cartoon', 'whiteboard']);
  // A kit that does not take a camera speed cannot honour "every camera move".
  await assert.rejects(film({notes: [{note: 'Slower', speed: .8}]}), /note "Slower": the story is drawn by the kit "red", which does not take a camera speed/);
});

test('cut: the scene starts whole on its first frame, instead of its entrance or hand-over', async () => {
  const faded = await film(), cut = await film({notes: [{note: 'Hard cut to blue', cut: 'b'}]}), b = cut.clock.start('b');
  assert.notDeepEqual(pixel(faded, b - .05, 10, 10), [255, 0, 0], 'the fade has begun before the scene');
  assert.deepEqual(pixel(cut, b - .01, 10, 10), [255, 0, 0], 'with the cut: all red until the scene starts');
  assert.deepEqual(pixel(cut, b + .001, 10, 10), [0, 0, 255], 'and all blue on its first frame');
  assert.deepEqual(cut.notes, [{note: 'Hard cut to blue', cut: 'b', at: +b.toFixed(3), was: 'fade'}]);
  // The same cut written into the recipe as the entrance; a cut takes no seconds.
  const written = await film({}, 'cut');
  assert.deepEqual(pixel(written, b - .01, 10, 10), [255, 0, 0]);
  assert.deepEqual(pixel(written, b + .001, 10, 10), [0, 0, 255]);
  await assert.rejects(film({}, {type: 'cut', seconds: 1}), /a cut takes no seconds and no centre/);
  const wiped = await film({notes: [{note: 'cut, not wipe', cut: 'b'}]}, 'wipe');
  assert.ok(!wiped.sounds.some(s => s.type === 'slide'), 'a cut makes no whoosh');
  // Paper after paper on one page: the hand-over becomes a step.
  const d = faded.clock.start('d'), pages = await film({notes: [{note: 'cut the pages', cut: 'd'}]});
  assert.deepEqual(stagesAt(faded, d - .1), ['stages[2]'], 'the hand-over: the second page already arriving');
  assert.deepEqual(stagesAt(pages, d - .1), ['stages[1]'], 'the cut: the first page, whole, until the scene starts');
  assert.deepEqual(stagesAt(pages, d + .01), ['stages[2]']);
  await assert.rejects(film({notes: [{note: 'into the story', cut: 'a'}]}), /no stage starts at scene a; a cut goes into a stage's scene/);
  await assert.rejects(helloFilm([{note: 'cut to the rule', cut: 'rule'}]), /rule is the first stage, which arrives with the push-in/);
});

test('cut in a lesson (pushIn): a later stage replaces the one before on its scene\'s first frame', async () => {
  const board = {...helloBoard, scenes: [...helloBoard.scenes, {id: 'more', narration: 'And here is the same rule once more, on a second page.'}]};
  const lesson = {...helloRecipe, stages: [...helloRecipe.stages, {type: 'code', scene: 'more', chrome: false, code: {file: 'rule.ts'}, reveal: [[0, ['more', 'the same rule']]]}]};
  const make = notes => compileFilm({storyboard: board, timings: evenTimings(board, {tail: 4}), recipe: {...lesson, notes}, root: hello});
  const [handOver, cut] = [await make(), await make([{note: 'Cut to the second page', cut: 'more'}])], start = cut.clock.start('more');
  assert.ok(!stagesAt(handOver, start - .1).includes('stages[0]'), 'the hand-over: the first page has left');
  assert.ok(stagesAt(cut, start - .1).includes('stages[0]') && !stagesAt(cut, start - .1).includes('stages[1]'), 'the cut: it stays until the scene starts');
  assert.ok(stagesAt(cut, start + .01).includes('stages[1]') && !stagesAt(cut, start + .01).includes('stages[0]'));
});

test('push: the camera pushes in on a point from one phrase to another, and back out', async () => {
  const note = {note: 'Push in on the square', push: {at: [800, 450], zoom: 2, from: ['b', 'Look at the square'], to: ['b', 'look again'], seconds: .5}};
  const [plain, pushed] = [await film(), await film({notes: [note]})], [p] = pushed.notes;
  assert.deepEqual(p, {note: 'Push in on the square', push: {at: [800, 450], zoom: 2}, from: p.from, to: p.to, seconds: .5});
  const mid = (p.from + .5 + p.to) / 2;
  assert.deepEqual(pixel(plain, mid, 880, 450), [0, 0, 255], 'without the note, beside the square is blue');
  assert.deepEqual(pixel(pushed, mid, 880, 450), [255, 255, 255], 'pushed in 2×, the square covers it');
  assert.deepEqual(pixel(pushed, p.to + .51, 880, 450), [0, 0, 255], 'and the camera has come back');
  // What a click means during the push: the frame point before the push, and the world's own point.
  assert.deepEqual(pushed.pointAt(mid, 900, 450), {frame: [850, 450], world: {path: 'stages[0].world', at: [850, 450]}});
  assert.ok(pushed.regionsAt(mid).find(r => r.path === 'stages[0].world').box[0] < 0, 'the regions are pushed too');
  assert.deepEqual(pushed.beats.filter(b => b.path?.startsWith('notes')).map(b => b.path), ['notes[0].push.from', 'notes[0].push.to'], 'its phrases are beats of the record');
  // One picture, one camera move at a time.
  await assert.rejects(film({notes: [{...note, push: {...note.push, to: ['c', 'some code']}}]}), /across the fade into c .*; a push stays on one picture/);
  await assert.rejects(film({notes: [note, {note: 'again', push: {...note.push, from: ['b', 'in the middle'], to: ['b', 'once more']}}]}), /"again": its push starts while "Push in on the square" is still pushing/);
  const lit = world('square', squareDraw, {spotAt: t => t > 6 && t < 30 ? {cx: 800, cy: 450, r: 200, zoom: 1.1, w: 1} : null});
  await assert.rejects(film({notes: [note]}, 'fade', [red, lit]), /the push runs over the world in b's spotlight/);
  await assert.rejects(film({notes: [{...note, push: {...note.push, from: note.push.to, to: note.push.from}}]}), /must end on a phrase after the one it starts on/);
});
