import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {MOVES, MOVE_NAMES, MOVE_KINDS, MOVE_USES, MOVE_FEEL_NAMES, REST, WORD_GAP, EXIT_SHARE, readMove, moveAt, stagger, movesBy, applyMove} from '../src/moves.mjs';
import {spring} from '../src/motion.mjs';
import {overshoots, EASES} from '../src/ease.mjs';
import {readEntrance, ghostPainter, transitionCatalog} from '../src/transitions.mjs';

const PROPS = Object.keys(REST);
const atRest = v => PROPS.every(p => Math.abs(v[p] - REST[p]) < 1e-9);
const same = (a, b, tol = 1e-9) => PROPS.every(p => Math.abs(a[p] - b[p]) <= tol) && a.mask === b.mask;
const times = n => Array.from({length: n + 1}, (_, i) => i / n);

test('the vocabulary: at least 20 moves, each data, every feel and every use covered', () => {
  assert.ok(MOVE_NAMES.length >= 20, `${MOVE_NAMES.length} moves`);
  for (const name of ['fade-slide', 'soft-rise', 'mask-wipe', 'iris-open', 'overshoot', 'bounce-landing', 'spring-follow', 'pop', 'shake',
    'text-reveal-word', 'text-reveal-letter', 'count-up', 'line-draw', 'blur-in', 'scale-in', 'drop-in', 'marquee', 'pulse', 'wiggle']) assert.ok(MOVE_NAMES.includes(name), name);
  assert.ok(Object.isFrozen(MOVES) && Object.isFrozen(MOVES.pop) && Object.isFrozen(MOVES.pop.props.scale) && Object.isFrozen(MOVES.pop.uses));
  for (const m of Object.values(MOVES)) {
    assert.ok(MOVE_KINDS.includes(m.kind) && MOVE_FEEL_NAMES.includes(m.feel) && m.uses.every(u => MOVE_USES.includes(u)), m.name);
    assert.equal(JSON.parse(JSON.stringify(m)).name, m.name, `${m.name} is plain data`);
    assert.equal(readMove(m.name), m);
  }
  for (const feel of MOVE_FEEL_NAMES) assert.ok(movesBy({feel}).length >= 2, `${feel} has moves`);
  for (const use of MOVE_USES) assert.ok(movesBy({use}).length >= 3, `${use} has moves`);
  for (const kind of MOVE_KINDS) assert.ok(movesBy({kind}).length >= 3, `${kind} has moves`);
});

test('the timing rules practitioners use are numbers in the data', () => {
  const exits = movesBy({kind: 'exit'});
  assert.ok(exits.length >= 6);
  for (const exit of exits) {
    const entrance = MOVES[exit.pairs];
    assert.equal(entrance?.kind, 'entrance', `${exit.name} closes an entrance`);
    assert.ok(Math.abs(exit.seconds / entrance.seconds - EXIT_SHARE) < .02, `${exit.name} takes about half of ${entrance.name}'s seconds (${exit.seconds} of ${entrance.seconds})`);
  }
  assert.equal(WORD_GAP, .09); assert.equal(MOVES['text-reveal-word'].gap, .09, 'about 0.09 s between words');
  assert.equal(MOVES.overshoot.ease, 'outBack', 'overshoot moves ride outBack');
  for (const m of Object.values(MOVES)) if (m.ease && overshoots(m.ease)) assert.equal(m.ease, 'outBack', `${m.name}: an eased overshoot is outBack`);
});

test('the laws: an entrance ends at rest, an exit starts at rest, feedback starts and ends there, an ambient move loops from rest', () => {
  for (const m of Object.values(MOVES)) {
    const start = moveAt(m.name, 5, {start: 5}), end = moveAt(m.name, 5 + m.seconds, {start: 5}), long = moveAt(m.name, 50, {start: 5});
    if (m.kind === 'entrance') assert.ok(atRest(end) && atRest(long), `${m.name} ends at rest`);
    if (m.kind === 'exit') assert.ok(atRest(start), `${m.name} starts at rest`);
    if (m.kind === 'feedback') assert.ok(atRest(start) && atRest(end) && atRest(long), `${m.name} starts and ends at rest`);
    if (m.kind === 'ambient') {
      assert.ok(atRest(start) && atRest(end), `${m.name} starts each loop at rest`);
      for (const k of [.13, .5, .77]) assert.ok(same(moveAt(m.name, 5 + k * m.seconds, {start: 5}), moveAt(m.name, 5 + (k + 3) * m.seconds, {start: 5}), 1e-6), `${m.name} repeats`);
    }
    if (m.kind !== 'ambient') assert.ok(same(moveAt(m.name, 2, {start: 5}), start), `${m.name} waits at its start before it begins`);
  }
});

test('reduced motion jumps: the start until the move starts, then the end; an ambient move stays at rest', () => {
  for (const m of Object.values(MOVES)) for (const t of [0, 4.99, 5, 5.01, 5 + m.seconds / 2, 9, 40]) {
    const v = moveAt(m.name, t, {start: 5, reduced: true});
    if (m.kind === 'ambient') { assert.ok(atRest(v), `${m.name} at ${t}`); continue; }
    assert.ok(same(v, t < 5 ? moveAt(m.name, 5, {start: 5}) : moveAt(m.name, 5 + m.seconds, {start: 5})), `${m.name} reduced at ${t}`);
  }
  assert.equal(moveAt('fade-slide', 5.1, {start: 5, reduced: true}).opacity, 1, 'no in-between');
  assert.throws(() => moveAt('pop', 1, {reduced: 'yes'}), /moveAt: reduced is true \(reduced motion: jump to the end\) or false, not "yes"/);
});

test('a move goes only forward on a curve that does not overshoot, and an overshoot move overshoots', () => {
  const forward = Object.values(MOVES).filter(m => m.ease && !overshoots(m.ease) && m.ease !== 'bounce' && !m.loop);
  assert.ok(forward.length > 10);
  for (const m of forward) for (const [prop, spec] of Object.entries(m.props)) {
    if (!Array.isArray(spec) && spec.from === undefined) continue;   // a swing goes both ways by design
    const values = times(240).map(k => moveAt(m.name, k * m.seconds)[prop]), up = (Array.isArray(spec) ? spec[1] - spec[0] : spec.to - spec.from) > 0;
    for (let i = 1; i < values.length; i++) assert.ok(up ? values[i] >= values[i - 1] - 1e-12 : values[i] <= values[i - 1] + 1e-12, `${m.name}.${prop} goes back at ${i}/240`);
  }
  const peak = Math.max(...times(240).map(k => moveAt('overshoot', k * .5).scale));
  assert.ok(peak > 1.02, `overshoot passes its rest (${peak})`);
  const fall = times(400).map(k => moveAt('bounce-landing', k * .9).y);
  assert.ok(fall.every(y => y <= 1e-9), 'a landing never goes through the floor');
  assert.ok(fall.some((y, i) => i > 0 && i < fall.length - 1 && y < fall[i - 1] && y < fall[i + 1]), 'and bounces off it');
});

test('a spring move plays its spring in real time at its own seconds, and seconds stretch any move', () => {
  for (const [name, prop, feel] of [['pop', 'scale', 'playful'], ['spring-follow', 'x', 'default'], ['drop-in', 'y', 'heavy']]) {
    const [from, to] = MOVES[name].props[prop];
    for (const k of times(60)) {
      const t = k * MOVES[name].seconds, want = from + (to - from) * spring(t, feel);
      assert.ok(Math.abs(moveAt(name, t)[prop] - want) < .006 * Math.abs(to - from), `${name}.${prop} at ${t}: ${moveAt(name, t)[prop]} against the ${feel} spring's ${want}`);
    }
  }
  for (const name of ['fade-slide', 'pop', 'shake', 'marquee']) for (const k of times(20)) {
    assert.ok(same(moveAt(name, 3 + k * 2, {start: 3, seconds: 2}), moveAt(name, 3 + k * MOVES[name].seconds, {start: 3})), `${name} stretched to 2 s at ${k}`);
  }
  assert.throws(() => moveAt('pop', 1, {seconds: 0}), /moveAt: seconds is how long "pop" takes, above 0 \(its own is 0.78\), not 0/);
  assert.throws(() => moveAt('pop', NaN), /moveAt: t and start are seconds, not t NaN, start 0/);
  assert.throws(() => moveAt('pop', 1, {delay: 1}), /moveAt: no option delay \(moveAt takes start, seconds, feel, reduced\)/);
});

test('a feel drives a move on another curve: a move feel, a spring feel, or {k, d}', () => {
  const ys = feel => times(200).map(k => moveAt('fade-slide', k * .4, feel === undefined ? {} : {feel}).y);
  assert.ok(ys().every(y => y >= 0), 'fade-slide on its own ease never passes its place');
  assert.ok(ys('bouncy').some(y => y < -.5), 'bouncy: the playful spring overshoots it');
  assert.ok(ys({k: 300, d: 8}).some(y => y < -1), 'a spring of your own');
  assert.equal(ys('smooth').at(-1), 0); assert.equal(ys('heavy').at(-1), 0, 'every feel ends where the move does');
  assert.notDeepEqual(ys('snappy'), ys()); assert.equal(ys('snappy').at(-1), 0, 'a spring feel by its motion.mjs name drives it too');
  assert.throws(() => moveAt('pop', 0, {feel: 'wobbly'}), /moveAt: feel is a move feel \(smooth, crisp, soft, heavy, bouncy\), a spring's \(snappy, default, heavy, playful\) or \{k, d\}, not "wobbly"/);
  assert.throws(() => moveAt('pop', 0, {feel: {k: -1, d: 2}}), /a feel is a name .* or \{k, d\}/);
});

test('stagger: each item\'s delay, by seconds or by a text reveal\'s own gap', () => {
  const words = 'one sheep one pebble'.split(' ');
  assert.deepEqual(stagger(words, 'text-reveal-word').map(w => w.delay), [0, .09, .18, .27].map((d, i) => i * WORD_GAP));
  assert.deepEqual(stagger(['a', 'b'], .5), [{item: 'a', index: 0, delay: 0}, {item: 'b', index: 1, delay: .5}]);
  assert.deepEqual(stagger([], .1), []);
  assert.equal(stagger([...'abc'], 'text-reveal-letter')[2].delay, 2 * MOVES['text-reveal-letter'].gap);
  // A word's own move is the reveal started at its delay: the second word is still on its way when the first is in place.
  const at = .45, [first, second] = stagger(words, 'text-reveal-word').map(w => moveAt('text-reveal-word', at, {start: w.delay}));
  assert.ok(atRest(first) && second.opacity < 1);
  assert.throws(() => stagger(words, 'pop'), /stagger: "pop" does not split text, so it has no gap; give seconds \(0.09 between words\) or a move that splits: text-reveal-word, text-reveal-letter/);
  assert.throws(() => stagger(words, -1), /stagger: gap is seconds between items, 0 or more/);
  assert.throws(() => stagger('one two', .1), /stagger: items is a list/);
});

test('movesBy: the moves matching every filter, in the table\'s order; an unknown filter refuses', () => {
  assert.deepEqual(movesBy().map(m => m.name), MOVE_NAMES);
  const bouncyLogos = movesBy({feel: 'bouncy', use: 'logo'});
  assert.ok(bouncyLogos.length && bouncyLogos.every(m => m.feel === 'bouncy' && m.uses.includes('logo')));
  assert.deepEqual(movesBy({kind: 'ambient'}).map(m => m.name), ['marquee', 'pulse', 'float']);
  assert.deepEqual(movesBy({feel: 'heavy', kind: 'entrance'}).map(m => m.name), ['drop-in', 'slam']);
  assert.throws(() => movesBy({mood: 'happy'}), /movesBy: no filter mood \(the filters are feel, use, kind\)/);
  assert.throws(() => movesBy({use: 'video'}), /movesBy: use is ui, text, logo, character, 3d, not "video"/);
  assert.throws(() => movesBy({feel: 'snappy'}), /movesBy: feel is smooth, crisp, soft, heavy, bouncy, not "snappy"/);
});

test('a name that is not a move refuses, listing the moves by kind', () => {
  assert.throws(() => moveAt('fadeslide', 0), /moveAt: no move called "fadeslide"; the moves are entrance: fade-slide, soft-rise, .*; exit: fade-slide-out, .*; feedback: shake, .*; ambient: marquee, pulse, float \(or \{name, kind, feel, uses, seconds, ease, props\} of your own\)/);
  assert.throws(() => readMove('constructor'), /no move called "constructor"/);
  assert.throws(() => readMove(42), /move: a move is a name \(fade-slide, soft-rise, mask-wipe, iris-open, …\) or \{name, kind, feel, uses, seconds, ease \| spring, props\}/);
});

test('a move of your own is data, checked against the vocabulary and the laws', () => {
  const nudge = {name: 'nudge-in', kind: 'entrance', feel: 'crisp', uses: ['ui'], seconds: .3, ease: 'cubic-bezier(0.16, 1, 0.3, 1)', props: {x: [30, 0], opacity: [0, 1]}};
  const m = readMove(nudge);
  assert.ok(Object.isFrozen(m) && m !== nudge && !Object.isFrozen(nudge) && readMove(m) === m, 'a frozen copy, given back as it is');
  assert.deepEqual(readMove(nudge), m, 'yours is checked each time it is given: the same move while it is the same');
  assert.ok(atRest(moveAt(nudge, 1)) && moveAt(nudge, .1).x > 0);
  const bad = (change, re) => assert.throws(() => readMove({...nudge, ...change}), re);
  bad({kind: 'arrival'}, /move "nudge-in": kind is entrance, exit, feedback, ambient, not "arrival"/);
  bad({feel: 'snappy'}, /feel is how it feels — smooth, crisp, soft, heavy, bouncy — not "snappy"/);
  bad({uses: ['video']}, /uses lists what it is for, from ui, text, logo, character, 3d/);
  bad({spring: 'playful'}, /give it one curve: ease \(a name from the ease table\) or spring/);
  bad({ease: 'wobble'}, /move "nudge-in": ease: "wobble" is not an ease/);
  bad({ease: undefined, spring: 'playful'}, /move "nudge-in": its spring \(playful\) is still moving at 0.3 s: it comes within 1% of rest for good only at 0.593 s; give it seconds of at least 0.6$/);
  bad({props: {x: [30, 10]}}, /move "nudge-in": an entrance ends at rest, and its x is not at rest there \(x rests at 0\)/);
  bad({props: {spin: [1, 0]}}, /props.spin is not a property; a move animates opacity, x, y, scale, rotate, blur, clip, progress/);
  bad({props: {clip: [0, 1]}}, /a move that animates clip names its mask \(left, right, top, bottom, iris\)/);
  bad({props: {x: {rest: 0, wave: 4, cycles: 1.5}}}, /props.x cycles is a whole number above 0 \(so a swing ends at rest\)/);
  bad({props: {x: {from: 30, to: 0, span: [.5, .2]}}}, /props.x span is \[a, b\], the share of the move it runs over, 0 ≤ a < b ≤ 1/);
  bad({loop: true}, /an ambient move loops \(loop: true\), and only an ambient move does/);
  bad({split: 'word'}, /gives split \(word, letter\) and gap \(seconds between the pieces: 0.09 between words\) together/);
  bad({pairs: 'fade-slide'}, /pairs names the entrance an exit closes; only an exit has it/);
  bad({name: 'Nudge In'}, /a move's name is lower-case words joined by hyphens \(e.g. "soft-rise"\), not "Nudge In"/);
  bad({speed: 2}, /a move has no key speed/);
  assert.throws(() => readMove({...nudge, kind: 'feedback', props: {x: [0, 0], y: {rest: 2, wave: 1, cycles: 1}}}), /feedback starts at rest, and its y is not at rest there/);
});

test('a spring move lasts until its spring has settled, not only until it passes its rest', () => {
  const popIn = {name: 'cut-short', kind: 'entrance', feel: 'bouncy', uses: ['ui'], spring: 'playful', props: {scale: [0, 1]}};
  // At 0.1558 s the playful spring is at 1 on its way up to its 19% overshoot: right where it is, but still moving.
  assert.ok(Math.abs(spring(.1558, 'playful') - 1) < .01);
  assert.throws(() => readMove({...popIn, seconds: .1558}), /move "cut-short": its spring \(playful\) is still moving at 0.1558 s: it comes within 1% of rest for good only at 0.593 s; give it seconds of at least 0.6$/);
  assert.equal(readMove({...popIn, seconds: .6}).seconds, .6, 'the number the refusal gives is enough');
  // The settling time is exact: after it the spring never strays 1% from rest again, and just before it, it does.
  const after = Array.from({length: 4000}, (_, i) => .593 + i / 1000).map(t => Math.abs(1 - spring(t, 'playful')));
  assert.ok(after.every(d => d < .01) && Math.abs(1 - spring(.5925, 'playful')) >= .01);
  for (const m of Object.values(MOVES).filter(m => m.spring)) {
    const late = Array.from({length: 200}, (_, i) => m.seconds + i / 100).map(t => Math.abs(1 - spring(t, m.spring)));
    assert.ok(late.every(d => d < .01), `${m.name} has settled by its seconds`);
  }
});

test('a spring that does not settle within 10 s cannot drive a move, and the refusal says how long it would take', () => {
  assert.throws(() => moveAt('fade-slide', .1, {feel: {k: 1, d: .01}}), /moveAt: the spring \{k: 1, d: 0.01\} takes 921 s to come within 1% of rest, and a move's spring must settle within 10 s: give it more damping \(d\) or more stiffness \(k\)/);
  assert.throws(() => readMove({name: 'lazy', kind: 'entrance', feel: 'soft', uses: ['ui'], seconds: 10, spring: {k: 1, d: .05}, props: {x: [10, 0]}}), /move "lazy": the spring \{k: 1, d: 0.05\} takes 183 s to come within 1% of rest/);
  assert.throws(() => readEntrance({move: 'pop', feel: {k: 1, d: .5}}, 'stage b'), /stage b: enter.feel: the spring \{k: 1, d: 0.5\} takes 17.27 s to come within 1% of rest/);
  assert.equal(moveAt('fade-slide', .4, {feel: {k: 4, d: 1}}).y, 0, 'one that settles in time is fine, however slowly (8.6 s)');
});

test('a move of yours is read as it is now: a change after its first use counts, and what you pass is never frozen', () => {
  const mine = {name: 'nudge-in', kind: 'entrance', feel: 'crisp', uses: ['ui'], seconds: .3, ease: 'outQuint', props: {x: [30, 0]}};
  const before = moveAt(mine, .15).x;
  mine.seconds = 3; mine.props.x = [300, 0];
  assert.equal(moveAt(mine, .15).x, 300 * (1 - EASES.outQuint(.05)), 'the new seconds and the new start');
  assert.notEqual(moveAt(mine, .15).x, before);
  mine.kind = 'nonsense';
  assert.throws(() => moveAt(mine, 1), /moveAt "nudge-in": kind is entrance, exit, feedback, ambient, not "nonsense"/);
  const feel = {k: 200, d: 30}, sprung = {...mine, kind: 'entrance', seconds: 1.5, ease: undefined, spring: feel};
  const m = readMove(sprung);
  assert.ok(!Object.isFrozen(feel) && !Object.isFrozen(sprung) && !Object.isFrozen(sprung.props) && Object.isFrozen(m.spring) && m.spring !== feel, 'your spring stays yours; the move keeps its own copy');
  feel.d = 2;
  assert.equal(m.spring.d, 30, 'and a change to yours does not reach the copy');
});

test('applyMove: opacity, offset, scale about the box, the mask and the blur, on a canvas', () => {
  const c = createCanvas(400, 200), ctx = c.getContext('2d'), box = [100, 50, 300, 150];
  const paint = values => { ctx.clearRect(0, 0, 400, 200); ctx.save(); if (applyMove(ctx, values, {box})) { ctx.fillStyle = '#0000ff'; ctx.fillRect(...box.slice(0, 2), 200, 100); } ctx.restore(); };
  const alpha = (x, y) => ctx.getImageData(x, y, 1, 1).data[3];
  paint(moveAt('mask-wipe', .25));   // half way through an inOutCubic wipe from the left: half uncovered
  assert.ok(alpha(120, 100) === 255 && alpha(280, 100) === 0, 'the left half is uncovered, the right not yet');
  paint(moveAt('scale-in', 0));
  assert.equal(alpha(200, 100), 0, 'opacity 0: nothing');
  paint({...REST, mask: null, x: 50, scale: .5});
  assert.ok(alpha(250, 100) === 255 && alpha(140, 100) === 0 && alpha(305, 100) === 0, 'half size about the box centre, moved 50 px right');
  paint({...REST, mask: null, opacity: .5});
  assert.ok(Math.abs(alpha(200, 100) - 128) <= 1, 'half see-through');
  assert.equal(applyMove(ctx, moveAt('iris-open', 0), {box}), false, 'nothing uncovered: nothing to draw');
  const m = ctx.getTransform();
  assert.ok(m.a === 1 && m.e === 0 && ctx.globalAlpha === 1, 'save and restore leave the canvas as it was');
});

// In a film: a shot enters with a move, the new picture over the old one.
const storyboard = {title: 'M', scenes: [{id: 'a', narration: 'This is the first world, all in red.'}, {id: 'b', narration: 'Now the second world arrives, all in blue.'}]};
const world = (name, color) => ({name, story: {compile: () => ({hang: 1, spotAt: () => null, sounds: [], draw: c => { c.fillStyle = color; c.fillRect(0, 0, 1600, 900); }})}});
const root = fileURLToPath(new URL('../examples/worlds/', import.meta.url));
const film = enter => compileFilm({storyboard, timings: evenTimings(storyboard), root, kits: [world('red', '#ff0000'), world('blue', '#0000ff')],
  recipe: {story: {kit: 'red'}, stages: [{type: 'world', scene: 'b', enter, world: {kit: 'blue'}}]}});
const pixel = (f, t, x, y) => { const c = createCanvas(1600, 900), ctx = c.getContext('2d'); f.frame(ctx, t); return [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)]; };
const RED = [255, 0, 0], BLUE = [0, 0, 255];

test('in a film: a shot enters with a move, from the old picture to exactly the new one, on the film clock', async () => {
  const iris = await film({move: 'iris-open'}), b = iris.clock.start('b'), t0 = b - .6 * .75;
  assert.deepEqual(iris.rows[1].enter, {type: 'move', move: 'iris-open', seconds: .6, lead: .6 * .75}, 'the row names the move');
  assert.deepEqual(pixel(iris, t0, 800, 450), RED, 'nothing has arrived at the first moment');
  assert.deepEqual(pixel(iris, t0 + .3, 800, 450), BLUE, 'the iris opens from the centre');
  assert.deepEqual(pixel(iris, t0 + .3, 10, 10), RED, 'and has not reached the corner half way');
  assert.deepEqual(pixel(iris, t0 + .6, 10, 10), BLUE, 'the end is the new picture, whole');
  assert.ok(!iris.sounds.some(s => s.type === 'slide' || s.type === 'whoosh'), 'a move enters quietly unless it names a sound');
  const blur = await film({move: 'blur-in', seconds: 1, sound: 'whoosh'}), t1 = blur.clock.start('b') - .75;
  const mid = pixel(blur, t1 + .3, 800, 450);
  assert.ok(mid[0] > 20 && mid[2] > 20, `blur-in fades the new picture in over the old (${mid})`);
  assert.deepEqual(pixel(blur, t1 + 1, 800, 450), BLUE);
  assert.ok(blur.sounds.some(s => s.type === 'whoosh' && Math.abs(s.time - t1) < 1e-9), 'with its sound where it starts');
  const own = await film({move: {name: 'drift-in', kind: 'entrance', feel: 'soft', uses: ['ui'], seconds: .5, ease: 'outQuint', props: {x: [400, 0]}}});
  assert.deepEqual(pixel(own, own.clock.start('b') - .375 + .01, 100, 450), RED, 'a move of the recipe\'s own, as data: the new picture still to the right');
});

/**
 * When a move first brings a whole picture to its place — every property that moves its edges (x, y, turn, scale, clip)
 * at rest, each for the first time — found by scanning the move itself, independently of the entrance's own reckoning.
 */
function coversAt(name, feel) {
  const NEAR = {x: .1, y: .1, rotate: .005, scale: 1e-4, clip: 1e-4}, start = moveAt(name, 0), seconds = MOVES[name].seconds, first = {};
  for (let i = 0; i <= 8000 && Object.keys(first).length < 5; i++) {
    const v = moveAt(name, i / 8000 * seconds, feel === undefined ? {} : {feel});
    for (const [prop, near] of Object.entries(NEAR)) if (!(prop in first) && (v[prop] - REST[prop]) * Math.sign(start[prop] - REST[prop]) <= near) first[prop] = i / 8000;
  }
  return Math.max(...Object.keys(NEAR).map(prop => first[prop] ?? 1));
}

test('a move entrance shows the old picture only where the move\'s own start shows it, and only until the new one is in place — never past the frame\'s edge, never again after', () => {
  // The old picture is a sentinel colour: wherever the move's start does not open the frame, none of it may show; once
  // the new picture has first reached its place, none of it may show anywhere at the edge (a pop's dip after its swell,
  // a bouncy picture swinging back toward where it came from).
  const SENTINEL = [255, 0, 255], NEW = [0, 0, 255], solid = ([r, g, b]) => c => { c.fillStyle = `rgb(${r},${g},${b})`; c.fillRect(0, 0, 1600, 900); };
  // The middle of each edge (an edge's ends may lie in the band another edge's offset opens), and once in place the corners.
  const EDGES = {left: [[0, 112]], right: [[399, 112]], top: [[200, 0]], bottom: [[200, 224]]}, CORNERS = [[0, 0], [399, 0], [0, 224], [399, 224]];
  const pictureMoves = MOVE_NAMES.filter(n => { try { readEntrance({move: n}, 'test'); return true; } catch { return false; } });
  assert.equal(pictureMoves.length, 12);
  assert.ok(coversAt('pop') < .3 && coversAt('bounce-landing') < .4 && coversAt('fade-slide', 'bouncy') < .3, 'the swell, the bounces and the swing come after the picture is first in place');
  for (const name of pictureMoves) for (const feel of [undefined, 'bouncy', {k: 400, d: 6}]) {
    const en = readEntrance(feel === undefined ? {move: name} : {move: name, feel}, 'test'), s = en.p.start, label = `${name}${feel ? ` on ${JSON.stringify(feel)}` : ''}`;
    // The edges the start opens: the side its offset leaves bare; every side when it starts smaller, turned or masked.
    const opening = new Set(s.scale < 1 || s.rotate !== 0 || s.clip < 1 ? Object.keys(EDGES) : [...(s.x > 0 ? ['left'] : s.x < 0 ? ['right'] : []), ...(s.y > 0 ? ['top'] : s.y < 0 ? ['bottom'] : [])]);
    const covered = coversAt(name, feel);
    // One canvas and one ghost painter for the move's steps, as a film keeps them, the canvas reset to new before each
    // step (ctx.reset): a new canvas per step held 2,900 native pictures (2.6 GB) until the test ended.
    const c = createCanvas(400, 225), ctx = c.getContext('2d'), ghost = ghostPainter();
    for (let i = 0; i <= 80; i++) {
      const e = i / 80, inPlace = e > covered, open = inPlace ? new Set() : opening;
      ctx.reset(); ctx.scale(.25, .25);
      en.draw(ctx, {e, from: solid(SENTINEL), to: solid(NEW), p: en.p, ghost: (alpha, paint) => ghost(ctx, alpha, paint), theme: null, boxes: {from: {}, to: {}}});
      const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data], centre = px(200, 112);
      for (const [edge, points] of Object.entries(EDGES)) if (!open.has(edge)) for (const [x, y] of points) {
        const p = px(x, y);
        assert.ok(p[3] === 255 && p.slice(0, 3).every((v, j) => Math.abs(v - centre[j]) <= 6), `${label} at ${e}${inPlace ? `, in place since ${covered}` : ''}: the old picture shows at the ${edge} edge (${p} against the middle's ${centre})`);
      }
      if (inPlace) for (const [x, y] of CORNERS) { const p = px(x, y); assert.ok(p.slice(0, 3).every((v, j) => Math.abs(v - centre[j]) <= 6), `${label} at ${e}, in place since ${covered}: the old picture shows at the corner (${x}, ${y}) (${p})`); }
      if (e === 0) assert.deepEqual(centre.slice(0, 3), SENTINEL, `${label} starts on the old picture`);
      if (e === 1) for (const [x, y] of [...CORNERS, ...Object.values(EDGES).flat(), [200, 112]]) assert.deepEqual(px(x, y).slice(0, 3), NEW, `${label} ends on the new picture at (${x}, ${y})`);
      const m = ctx.getTransform();
      assert.ok(m.a === .25 && m.d === .25 && m.e === 0 && m.f === 0 && ctx.globalAlpha === 1 && ctx.filter === 'none', `${label} at ${e} restores the canvas`);
    }
  }
});

test('a blurred move entrance blurs the picture whole, where it is, at any size of canvas, the frame\'s edge into its own colours', () => {
  // Blue to the left of x = 400, green to the right: a seam off the middle, so a picture drawn larger would move it.
  const halves = c => { c.fillStyle = '#0000ff'; c.fillRect(0, 0, 400, 900); c.fillStyle = '#00ff00'; c.fillRect(400, 0, 1200, 900); };
  const en = readEntrance({move: 'blur-in'}, 'test');
  for (const scale of [.25, .5, .1]) {
    const c = createCanvas(1600 * scale, 900 * scale), ctx = c.getContext('2d'), ghost = ghostPainter();
    ctx.scale(scale, scale);
    // Early on (e = 0.1) the picture is faint and still well blurred: 8.7 frame pixels.
    en.draw(ctx, {e: .1, from: c2 => { c2.fillStyle = '#ff0000'; c2.fillRect(0, 0, 1600, 900); }, to: halves, p: en.p, ghost: (alpha, paint) => ghost(ctx, alpha, paint), theme: null, boxes: {from: {}, to: {}}});
    const px = (x, y) => [...ctx.getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data];
    const left = px(150, 450), right = px(1200, 450), across = (px(400 - 1 / scale, 450)[1] + px(400, 450)[1]) / 2;
    assert.ok(Math.abs(across - (left[1] + right[1]) / 2) <= .12 * (right[1] - left[1]), `at ${scale}: the seam is blurred and still at 400, exactly where the picture has it (${across} between ${left[1]} and ${right[1]})`);
    assert.ok(Math.abs(px(0, 450)[2] - left[2]) <= 6 && Math.abs(px(1599, 450)[1] - right[1]) <= 6 && Math.abs(px(800, 0)[1] - right[1]) <= 6, `at ${scale}: the frame's edges keep the picture's own colours`);
  }
});

test('in a film: a move a whole picture cannot make refuses, naming the ones it can', async () => {
  const can = /the moves a whole picture can make are fade-slide, soft-rise, mask-wipe, iris-open, overshoot, bounce-landing, spring-follow, pop, blur-in, scale-in, drop-in, slam/;
  await assert.rejects(film({move: 'count-up'}), /stage b: a shot cannot enter with "count-up": it shows a thing's own content \(progress\), which a picture does not have/);
  await assert.rejects(film({move: 'text-reveal-word'}), /it reveals text word by word/);
  await assert.rejects(film({move: 'shake'}), /it is a feedback move, not an entrance/);
  await assert.rejects(film({move: 'marquee'}), /it is an ambient move, not an entrance/);
  await assert.rejects(film({move: 'pop-out'}), can);
  await assert.rejects(film({move: 'pop', ease: 'out'}), /stage b: enter has unsupported key ease \(a move entrance takes move, seconds, feel, sound; its curve is the move's, or its feel's\)/);
  await assert.rejects(film({move: 'pop', type: 'push'}), /enter has unsupported key type/);
  await assert.rejects(film({move: 'scale-in', seconds: .1}), /stage b: enter.seconds must be between 0.2 and 3 \(the move "scale-in" takes 0.3 on its own\)/);
  await assert.rejects(film({move: 'pop', feel: 'wobbly'}), /stage b: enter.feel: feel is a move feel/);
  await assert.rejects(film({move: 'nope'}), /stage b: enter.move: no move called "nope"/);
  assert.throws(() => readEntrance('dissolve', 'stage b'), /\(not "dissolve"\); or \{"move": …\}, a move a whole picture can make: fade-slide, /);
  // A kit's transition may not take `move` as a setting: an entrance that names a move is a move entrance.
  const curtain = {family: 'theatre', seconds: 1, ease: 'inOut', sound: null, params: {move: {oneOf: ['open', 'close'], default: 'open'}}, draw: () => {}};
  assert.throws(() => transitionCatalog([{name: 'stage', transitions: {curtain}}]), /the kit "stage"'s transition "curtain": a setting may not be called "move" \(an entrance that names a move is a move entrance\)/);
  assert.throws(() => transitionCatalog([{name: 'stage', transitions: {curtain: {...curtain, params: {sound: {oneOf: ['a'], default: 'a'}}}}}]), /a setting may not be called "sound" \(every entrance has it\)/);
});
