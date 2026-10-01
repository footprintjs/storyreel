import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings, makeClock} from '../src/index.mjs';
import {readIntent, checkContinuity, tooMuchTooFast, distinctMoments} from '../src/shots.mjs';
import {FRAMINGS} from '../src/notes.mjs';

// Words for long scenes: "w0 w1 w2 …" (every word its own, so a phrase names one moment).
const words = (n, from = 0) => Array.from({length: n}, (_, i) => `w${from + i}`).join(' ');
const storyboard = {title: 'Shots', scenes: [
  {id: 'a', narration: `The first shot opens here. ${words(40)}`},
  {id: 'b', narration: `The second shot looks at the square. ${words(40, 100)}`},
  {id: 'c', narration: 'The third shot closes the film.'},
]};
const timings = evenTimings(storyboard);

/** A world kit that refuses any key it does not know (the strict kits a film is drawn with) and reads `beats`. */
const strict = (name, {regions = []} = {}) => ({name, story: {compile(spec, clock) {
  for (const key of Object.keys(spec)) if (!['kit', 'beats'].includes(key)) throw new Error(`${name}: unsupported key ${key}`);
  for (const beat of spec.beats ?? []) clock.at(beat);
  return {hang: 1, draw: c => { c.fillStyle = '#336'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#fc0'; c.fillRect(600, 300, 400, 300); }, regionsAt: () => regions};
}}});
const named = (name, box) => ({box, path: name, label: `the ${name}`, name});
const kits = [strict('one'), strict('two', {regions: [named('square', [600, 300, 1000, 600]), named('sheet', [0, 0, 1600, 900]), named('big', [350, 150, 1250, 750]),
  named('dot', [780, 430, 820, 470]), named('dup', [0, 0, 100, 100]), named('dup', [200, 200, 300, 300])]}), strict('three')];
const recipe = (more = {}) => ({
  story: {kit: 'one', ...more.story},
  stages: [
    {type: 'world', scene: 'b', world: {kit: 'two', ...more.world}, ...more.b},
    {type: 'world', scene: 'c', world: {kit: 'three'}, ...more.c},
  ],
  ...more.top,
});
const film = more => compileFilm({storyboard, timings, recipe: recipe(more), kits});
const look = (f, t) => { const c = createCanvas(320, 180), ctx = c.getContext('2d'); ctx.scale(.2, .2); f.frame(ctx, t); return createHash('sha256').update(c.data()).digest('hex'); };

test('intent: each shot says what it is for, in one sentence; the film lists it, and the kit never sees it', async () => {
  const f = await film({story: {intent: 'Open on the question.'}, b: {intent: 'Show the square, close up.'}});
  assert.deepEqual(f.shots.map(s => [s.path, s.where, s.intent]), [['story', 'the story', 'Open on the question.'], ['stages[0]', 'stage b', 'Show the square, close up.'], ['stages[1]', 'stage c', null]]);
  assert.ok(f.shots[0].from === 0 && f.shots[0].to === f.shots[1].from && f.shots[2].to === f.total, 'each shot runs until the next one starts');
  await assert.rejects(film({b: {intent: 'Show the square. Then the circle.'}}), /stage b: intent reads as two sentences at "…w the square\. Then the circ…"; a shot carries one beat/);
  await assert.rejects(film({b: {intent: 42}}), /stage b: intent says what the shot is for, in words/);
  await assert.rejects(film({b: {intent: 'x'.repeat(141)}}), /intent is 141 characters; a shot's purpose fits in 140/);
  await assert.rejects(film({world: {intent: 'Inside the world.'}}), /stage b: intent belongs on the stage, beside world/);
  // Abbreviations and initials are not sentence ends.
  for (const one of ['Show Mr. Robot waving.', 'Show the U.S. Army count.', 'Open at 3 p.m. Monday with the shop.', 'Show No. 1 winning.', 'Show it, e.g. Here it is.', 'Show what i.e. Bob sees.', '  Show it, e.g. here  '])
    assert.equal(readIntent(one, 'x'), one.trim(), one);
});

test('the shots are listed in film order, whatever order the recipe gives its stages; the record keeps each stage its own', async () => {
  const f = await compileFilm({storyboard, timings, kits, record: true, recipe: {story: {kit: 'one'}, stages: [
    {type: 'world', scene: 'c', world: {kit: 'three'}, intent: 'Close.'}, {type: 'world', scene: 'b', world: {kit: 'two'}, intent: 'Look.'}]}});
  assert.deepEqual(f.shots.map(s => s.intent), [null, 'Look.', 'Close.']);
  assert.ok(f.shots.every(s => s.to > s.from), 'every interval runs forward');
  const state = f.record.snapshot.sharedState;
  assert.deepEqual([state['stage.stages[0]'].scene, state['stage.stages[0]'].intent, state['stage.stages[1]'].scene, state['stage.stages[1]'].intent], ['c', 'Close.', 'b', 'Look.']);
});

test('continuity: a shot starts where the story is; what it ends with is carried on; a contradiction refuses with a fix that works', async () => {
  const agree = await film({
    story: {continuity: {end: {order: 'none', size: 'M'}}},
    b: {continuity: {start: {order: 'none'}, end: {order: 'placed'}}},
    c: {continuity: {start: {order: 'placed', size: 'M'}}},
  });
  assert.deepEqual(agree.shots.map(s => [s.start, s.end]), [[{}, {order: 'none', size: 'M'}], [{order: 'none'}, {order: 'placed'}], [{order: 'placed', size: 'M'}, {}]]);
  await assert.rejects(film({
    b: {continuity: {end: {order: 'placed'}}},
    c: {continuity: {start: {order: 'none'}}},
  }), /Continuity: stage c starts with order = "none", but stage b left order = "placed"\. Show the change \(end stage b with order = "none"\), or start stage c where the story is \(order = "placed"\)/);
  // A → B (agrees) → C: the fix names the shot just before C, and following it compiles.
  const chain = (bEnd = {}) => film({story: {continuity: {end: {x: 1}}}, b: {continuity: {start: {x: 1}, end: bEnd}}, c: {continuity: {start: {x: 2}}}});
  await assert.rejects(chain(), /stage c starts with x = 2, but stage b starts with x = 1\. Show the change \(end stage b with x = 2\)/);
  await chain({x: 2});
  await assert.rejects(film({b: {continuity: {start: {size: ['M']}}}}), /stage b: continuity.start.size must be a word, a number or true\/false/);
  await assert.rejects(film({b: {continuity: {before: {}}}}), /stage b: continuity has before; it takes start and end/);
  await assert.rejects(film({b: {continuity: {}}}), /continuity needs start or end/);
  await assert.rejects(film({b: {continuity: {start: null}}}), /stage b: continuity.start is a list of facts/);
  assert.deepEqual(checkContinuity([{where: 'x', continuity: {start: {door: 'open'}, end: {}}}, {where: 'y', continuity: {start: {door: 'open'}, end: {door: 'shut'}}}]), {door: 'shut'});
  assert.throws(() => checkContinuity([{where: 'x', continuity: {start: {door: 'open'}, end: {}}}, {where: 'y', continuity: {start: {door: 'shut'}, end: {}}}]), /y starts with door = "shut", but x starts with door = "open"\. Show the change \(end x with door = "shut"\)/);
});

test('watching: a burst — more than 4 moments in 2 s — is reported, or refused; a shot\'s moments are information, never a verdict', async () => {
  const quiet = await film();
  assert.deepEqual(quiet.watching, [], 'a film whose shots name few phrases is calm');
  const burstBeats = [0, 1, 2, 3, 4, 5].map(i => ['b', `w${100 + i}`]);
  const burst = await film({world: {beats: burstBeats}});
  assert.deepEqual(burst.watching.map(w => ({...w, at: undefined})), [{kind: 'burst', path: 'stages[0]', where: 'stage b', at: undefined, moments: 6, seconds: 1.9}]);
  await assert.rejects(film({world: {beats: burstBeats}, top: {watching: 'refuse'}}), /Too much, too fast \(the recipe says watching: "refuse"\): stage b has 6 moments in 1.9 s/);
  await assert.rejects(film({top: {watching: 'loud'}}), /watching must be "report" or "refuse"/);
  // Thirteen phrases three words apart: many moments, one pace; counted, not judged.
  const many = await film({world: {beats: Array.from({length: 13}, (_, i) => ['b', `w${100 + i * 3}`])}});
  assert.deepEqual([many.watching, many.shots[1].moments], [[], 13]);
  assert.deepEqual(distinctMoments([1, 1.1, 1.2, 1.3, 1.4, 1.5]), [1, 1.3], 'moments closer than a quarter of a second merge');
  assert.deepEqual(tooMuchTooFast([{path: 'p', where: 'w', moments: [1, 1.1, 1.2, 1.3, 1.4, 1.5]}]), []);
  // A push's camera words are not moments: four phrases and a push starting on a fifth, inside two seconds, is no burst.
  const pushed = await film({world: {beats: [0, 1, 2, 3].map(i => ['b', `w${100 + i}`])}, top: {notes: [{note: 'In', push: {at: [800, 450], from: ['b', 'w104'], to: ['b', 'w120']}}]}});
  assert.deepEqual([pushed.watching, pushed.shots[1].moments], [[], 4]);
});

test('watching: a teaser\'s rewind names the past, so it is no moment of the shot it is said in', async () => {
  const dir = new URL('../examples/recap/', import.meta.url), read = f => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  const board = read('storyboard.json'), rec = read('recipe.json'), f = await compileFilm({storyboard: board, timings: evenTimings(board, {tail: 4}), recipe: rec, root: dir.pathname});
  const rewind = f.beats.filter(b => /teaser\.rewind\.(from|to)$/.test(b.path ?? '')), story = f.shots[0];
  assert.ok(rewind.length && rewind.some(b => b.t >= story.from && b.t < story.to), 'the rewind is said while the story is on screen');
  const counted = distinctMoments(f.beats.filter(b => !/teaser\.rewind|^notes|^poster|^recalls/.test(b.path ?? '') && b.t >= story.from && b.t < story.to).map(b => b.t)).length;
  assert.equal(story.moments, counted);
});

test('framing: a push on a named thing frames it medium, close or insert; the zoom follows from its size', async () => {
  const push = {from: ['b', 'looks at the square'], to: ['b', 'w110']}, note = (p, n = 'Push') => ({top: {notes: [{note: n, push: {...push, ...p}}]}});
  const f = await film(note({on: 'square', size: 'close'}));
  // The square is 400×300 on the frame: close makes it fill 72% of the width or height, whichever binds first.
  assert.deepEqual(f.notes[0].push, {at: [800, 450], zoom: +(FRAMINGS.close / Math.max(400 / 1600, 300 / 900)).toFixed(3), on: 'square', size: 'close'});
  const medium = (await film(note({on: 'square'}))).notes[0].push;
  assert.deepEqual([medium.size, medium.zoom], ['medium', 1.5], 'medium when size is left out: half the frame');
  // The same pixels as the push written by hand.
  const byHand = await film(note({at: [800, 450], zoom: medium.zoom})), byName = await film(note({on: 'square'}));
  const mid = (byName.notes[0].from + byName.notes[0].to) / 2;
  assert.equal(look(byName, mid), look(byHand, mid));
  await assert.rejects(film(note({on: 'robot'}, 'On the robot')), /note "On the robot": nothing in the picture is called "robot" at [\d.]+ s; the names there are square, sheet, big, dot, dup/);
  await assert.rejects(film(note({on: 'dup'}, 'Two')), /note "Two": 2 things are called "dup" at [\d.]+ s; a name frames one thing/);
  await assert.rejects(film(note({on: 'square', size: 'wide'})), /size is medium, close, insert .* wide is the shot itself, so leave the push out/);
  await assert.rejects(film(note({on: 'square', zoom: 2})), /takes its zoom from size/);
  await assert.rejects(film(note({})), /aims at a point \(at\) or at a named thing \(on\), exactly one of them/);
  await assert.rejects(film(note({at: [800, 450], size: 'close'})), /size frames a named thing \(on\); a push at a point takes zoom/);
  await assert.rejects(film(note({on: 'big', size: 'medium'}, 'Big')), /"big" already fills 67% of the frame, so a medium framing would not push in; a close or insert framing would/);
  await assert.rejects(film(note({on: 'sheet', size: 'insert'}, 'All')), /"sheet" already fills 100% of the frame, so a insert framing would not push in; no framing pushes in on it/);
  await assert.rejects(film(note({on: 'dot', size: 'close'}, 'Tiny')), /"dot" fills 4% of the frame; a close framing needs ×16\.2, more than the ×3 a push goes to .*: frame a larger named thing, or push at a point with at and zoom/);
  // A thing a close framing would push past ×3, and a medium one would not: the refusal names medium.
  const kitsMid = [kits[0], strict('two', {regions: [named('card', [700, 360, 900, 540])]}), kits[2]];
  await assert.rejects(compileFilm({storyboard, timings, kits: kitsMid, recipe: recipe(note({on: 'card', size: 'close'}, 'Card'))}), /"card" fills 20% of the frame; a close framing needs ×3\.6, .*: a medium framing would; or frame a larger named thing/);
  // A named push after another push is read against the picture itself, not the first push's camera.
  const two = await compileFilm({storyboard, timings, kits, recipe: recipe({top: {notes: [
    {note: 'First', push: {at: [300, 300], zoom: 2, from: ['b', 'w100'], to: ['b', 'w104']}},
    {note: 'Then', push: {on: 'square', size: 'medium', from: ['b', 'w115'], to: ['b', 'w120']}}]}})});
  assert.deepEqual(two.notes[1].push, {at: [800, 450], zoom: 1.5, on: 'square', size: 'medium'});
});

test('framing: a stage kit\'s regions may be named and pushed on, like a world\'s', async () => {
  const boxKit = {name: 'boxes', stages: {box: {keys: [], compile: () => ({}), draw: () => {}, regions: () => [{box: [500, 250, 1100, 650], path: 'the box', label: 'a box', name: 'box'}]}}};
  const f = await compileFilm({storyboard, timings, kits: [...kits, boxKit], recipe: {story: {kit: 'one'}, stages: [{type: 'box', scene: 'b', enter: 'fade', chrome: false}],
    notes: [{note: 'On the box', push: {on: 'box', size: 'medium', from: ['b', 'looks at the square'], to: ['b', 'w110']}}]}});
  assert.deepEqual(f.notes[0].push, {at: [800, 450], zoom: 1.125, on: 'box', size: 'medium'});
});

test('gaze: a listener looks at whoever is speaking, turning just before and back just after; nobody looks at itself', () => {
  const board = {scenes: [{id: 'n', narration: 'A narrator talks first.'}, {id: 'r', speaker: 'robot', narration: 'Hi! Mind if I join?'}, {id: 'u', speaker: 'user', narration: 'Who are you?'}]};
  const clock = makeClock(board, evenTimings(board));
  const [robot, user] = clock.turns();
  assert.deepEqual([robot.speaker, user.speaker, clock.turns().length], ['robot', 'user', 2], 'a narrator is nobody on screen');
  assert.equal(clock.gaze(robot.start - 1, 'user'), null, 'before the turn');
  assert.ok(clock.gaze(robot.start - .1, 'user').amount > 0, 'turning toward the robot just before it speaks');
  assert.deepEqual(clock.gaze((robot.start + robot.end) / 2, 'user'), {at: 'robot', amount: 1});
  assert.equal(clock.gaze((robot.start + robot.end) / 2, 'robot'), null, 'the speaker does not look at itself');
  assert.ok(clock.gaze(robot.end + .2, 'user').amount < 1 && clock.gaze(robot.end + .6, 'user') === null, 'and back after a half-second hold');
  assert.equal(clock.gaze((user.start + user.end) / 2, 'robot').at, 'user');
});

test('gaze: one speaker twice in a row holds the look; a hand-over to another speaker names both, so a kit can blend', () => {
  // Hand-made timings: robot, robot again 0.3 s later, then a cat 0.7 s after that.
  const board = {scenes: [{id: 'r1', speaker: 'robot', narration: 'One two'}, {id: 'r2', speaker: 'robot', narration: 'three four'}, {id: 'k', speaker: 'cat', narration: 'five six'}]};
  const scene = (id, list) => ({id, duration: 1.2, words: list.map(([text, start, end]) => ({text, start, end})), alignment: {status: 'available'}});
  const clock = makeClock(board, {scenes: [scene('r1', [['One', .2, .5], ['two', .6, 1]]), scene('r2', [['three', .1, .5], ['four', .6, .9]]), scene('k', [['five', .4, .7], ['six', .8, 1.1]])]});
  for (const t of [1.05, 1.15, 1.25]) assert.deepEqual(clock.gaze(t, 'user'), {at: 'robot', amount: 1}, `the look holds between the robot's turns (${t} s)`);
  // The robot's last word ends at 2.1 s (the look lets go by 2.6 s); the cat's first starts at 2.8 s (the look begins at 2.5 s).
  const handOver = clock.gaze(2.55, 'user');
  assert.ok(handOver.also && new Set([handOver.at, handOver.also.at]).size === 2, 'both speakers, the stronger first');
  assert.ok(handOver.amount >= handOver.also.amount);
});
