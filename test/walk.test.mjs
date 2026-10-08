// A walk, the whole flow of it (walk.mjs): it sets off, steps with feet that never slide, stops with the feet together
// and settles — numbers a kit draws a figure from, a pure function of time, in a style (a strategy).
import test from 'node:test';
import assert from 'node:assert/strict';
import {walk, WALKS, WALK_NAMES, readWalk} from '../src/walk.mjs';

const samples = (w, every = .001) => Array.from({length: Math.ceil((w.end - w.start + 1) / every)}, (_, i) => w.start - .5 + i * every).map(t => [t, w.at(t)]);

test('the feet never slide: a planted foot stays exactly where it was put, in every style, either way, at any size', () => {
  for (const style of WALK_NAMES) for (const [from, to, size] of [[100, 1000, 475], [1800, -250, 520], [300, 360, 380], [0, 0, 400]]) {
    const w = walk({from, to, start: 2, size, style});
    let prev = null;
    for (const [t, p] of samples(w)) {
      if (prev) p.feet.forEach((f, j) => { if (f.lift === 0 && prev.feet[j].lift === 0) assert.equal(f.x, prev.feet[j].x, `${style} ${from}→${to}: foot ${j} slid at ${t}`); });
      prev = p;
    }
  }
});

test('the body is always over its feet while it steps, and it gets there: feet together at `to` when it arrives', () => {
  for (const style of WALK_NAMES) {
    const w = walk({from: 100, to: 1000, start: 1, size: 475, style});
    for (const [, p] of samples(w)) if (p.phase === 'step') {
      const [a, b] = [Math.min(p.feet[0].x, p.feet[1].x), Math.max(p.feet[0].x, p.feet[1].x)];
      assert.ok(p.x >= a - 1e-9 && p.x <= b + 1e-9, `${style}: body ${p.x} outside its feet ${a}–${b}`);
    }
    const done = w.at(w.end + 1);
    assert.deepEqual([done.x, done.feet[0].x, done.feet[1].x, done.phase, done.walking], [1000, 1000, 1000, 'after', false]);
    assert.deepEqual([w.at(0).x, w.at(0).phase], [100, 'before']);
  }
});

test('the whole flow is smooth: nothing jumps from one millisecond to the next, from standing to standing', () => {
  for (const style of WALK_NAMES) {
    const w = walk({from: 100, to: 1000, start: 1, size: 475, style});
    let prev = null;
    for (const [t, p] of samples(w)) {
      if (prev) {
        // Per millisecond, from standing to standing: a snap of a hundredth of a radian (5 px at the head) fails.
        const most = {x: 2, lift: 1, lean: .002, swing: .012, turn: .01};
        for (const [k, limit] of Object.entries(most)) assert.ok(Math.abs(p[k] - prev[k]) < limit, `${style}: ${k} jumps at ${t} (${prev[k]} → ${p[k]})`);
      }
      prev = p;
    }
  }
});

test('before, during and after: it sets off (dips, leans back, turns), steps (leans in, bobs, swings its arms), and settles (rocks on past its feet, turns back)', () => {
  const w = walk({from: 100, to: 1000, start: 1, size: 475, style: 'stroll'}), S = WALKS.stroll;
  const off = w.at(1 + S.anticipate / 2);
  assert.equal(off.phase, 'set off'); assert.ok(off.lift < 0 && off.lean < 0 && off.turn > 0 && off.turn < 1);
  assert.deepEqual(off.feet.map(f => f.x), [100, 100], 'setting off, the feet stay put');
  const mid = samples(w).map(([, p]) => p).filter(p => p.phase === 'step');
  assert.ok(Math.max(...mid.map(p => p.lift)) > 0 && Math.max(...mid.map(p => p.swing)) > .5 && Math.min(...mid.map(p => p.swing)) < -.5 && mid.every(p => p.turn === 1));
  const settle = samples(w).map(([, p]) => p).filter(p => p.phase === 'settle');
  assert.ok(Math.max(...settle.map(p => p.lean)) > S.rock * .9, 'it rocks on past its feet as it stops');
  assert.ok(w.at(w.end - .001).turn < .01 && w.at(w.end).turn === 0, 'and turns back to us');
  assert.ok(Math.abs(w.at(w.end - 1e-6).lean) < 1e-6 && w.at(w.end).phase === 'after', 'the rock has come back to 0 when it ends');
});

test('the steps come from the distance and the figure\'s size; `seconds` fits them to a length; a style is a strategy', () => {
  const w = walk({from: 0, to: 900, start: 0, size: 500, style: 'stroll'});
  assert.equal(w.steps, Math.round(900 / (.42 * 500)) + 1);
  assert.equal(w.stepSeconds, 1 / WALKS.stroll.cadence);
  const fit = walk({from: 0, to: 900, start: 0, size: 500, seconds: 3});
  assert.ok(Math.abs(fit.arrive - (WALKS.stroll.anticipate + 3)) < 1e-9);
  assert.equal(walk({from: 900, to: 0, start: 0, size: 500}).facing, -1);
  assert.ok(Math.max(...samples(walk({from: 0, to: 900, start: 0, size: 500, style: 'bouncy'})).map(([, p]) => p.lift)) > Math.max(...samples(w).map(([, p]) => p.lift)), 'bouncy bobs more than stroll');
  assert.ok(Math.max(...samples(walk({from: 0, to: 900, start: 0, size: 500, style: 'tiptoe'})).flatMap(([, p]) => p.feet.map(f => f.lift))) > Math.max(...samples(w).flatMap(([, p]) => p.feet.map(f => f.lift))), 'tiptoe lifts its feet higher');
  const mine = {...WALKS.stroll, anticipate: 0, settle: 0};
  const plain = walk({from: 0, to: 900, start: 0, size: 500, style: mine});
  assert.ok(plain.at(.01).turn > 0 && plain.at(.01).turn < 1, 'no set-off: it turns during its first step');
  assert.equal(plain.at(plain.end).turn, 0);
  assert.deepEqual(WALK_NAMES, ['stroll', 'brisk', 'bouncy', 'tiptoe']);
  // A style of your own is copied when the walk is planned: changing it afterwards changes no walk.
  const own = {...WALKS.stroll}, planned = walk({from: 0, to: 900, start: 0, size: 500, style: own}), before = planned.at(2);
  own.bob = 1; own.cadence = 9; assert.deepEqual(planned.at(2), before);
  // Nowhere to go: no steps, standing there before and after.
  const still = walk({from: 40, to: 40, start: 1, size: 400});
  assert.deepEqual([still.steps, still.at(0).phase, still.at(2).phase, still.at(2).x, still.end], [0, 'before', 'after', 40, 1]);
  // A tiny shuffle lifts its feet a little, not a full step's height.
  assert.ok(Math.max(...samples(walk({from: 0, to: 2, start: 0, size: 500})).flatMap(([, p]) => p.feet.map(f => f.lift))) < 1);
});

test('walk refusals name the fix', () => {
  assert.throws(() => readWalk('skip'), /no walk called "skip" \(the walks are stroll, brisk, bouncy, tiptoe, or \{cadence, stride, bob, bounce, lift, lean, arms, anticipate, dip, settle, rock\} of your own\)/);
  assert.throws(() => readWalk({...WALKS.stroll, cadence: 0}), /cadence and stride above 0/);
  assert.throws(() => readWalk({...WALKS.stroll, bob: -1}), /check bob/);
  assert.throws(() => readWalk({...WALKS.stroll, bounce: 2}), /bounce and arms 0–1/);
  assert.throws(() => readWalk({...WALKS.stroll, arms: 2}), /bounce and arms 0–1/);
  assert.throws(() => readWalk('constructor'), /no walk called "constructor"/);
  assert.throws(() => walk({from: 0, to: 900, start: 0, size: 500, seconds: .05}), /5 steps in 0.05 s is 100.00 steps a second, and this style walks 1.8 — give between 1.39 and 5.56 seconds/);
  assert.throws(() => walk({from: 0, to: 100, start: 0}), /size is the figure's standing height in px/);
  assert.throws(() => walk({from: 0, to: NaN, start: 0, size: 400}), /from and to are places on the floor/);
  assert.throws(() => walk({from: 0, to: 100, start: 0, size: 400, seconds: 0}), /seconds is how long the stepping takes/);
  assert.throws(() => walk({from: 0, to: 100, start: 0, size: 400}).at(NaN), /at\(t\) takes seconds/);
});
