import test from 'node:test';
import assert from 'node:assert/strict';
import {anticipate, squash, envelope, envelopeShare, burst, BURSTS, BURST_NAMES, arc} from '../src/principles.mjs';

const steps = (from, to, n) => Array.from({length: n + 1}, (_, i) => from + (to - from) * i / n);

test('anticipate: a small counter-move before the move, scaled by its distance, smooth both ways', () => {
  const at = 2, o = t => anticipate(t, {at, distance: 300});
  for (const t of [0, 1.84, at + .1, at + .11, 9]) assert.equal(o(t), 0, `nothing at ${t}`);
  assert.equal(o(at), -30, 'wound back 10% of the distance, the other way, as the move starts');
  assert.ok(o(at - .075) < 0 && o(at - .075) > -30 && o(at + .05) < 0 && o(at + .05) > -30, 'easing into the wind-up and out of it');
  const path = steps(1.8, 2.2, 400).map(o);
  for (let i = 1; i < path.length; i++) assert.ok(Math.abs(path[i] - path[i - 1]) < 1, `no jump at ${i}`);
  assert.equal(anticipate(at, {at, distance: -300}), 30, 'a move left winds back right');
  assert.equal(anticipate(at, {at, distance: 1600}), -40, 'at most 40 px: still a small move');
  assert.equal(anticipate(at, {at, distance: 1600, max: Infinity}), -160);
  assert.deepEqual(anticipate(at, {at, distance: [300, -400]}), [-24, 32], 'a vector winds back along itself (10% of 500 is 50, capped at 40)');
  assert.deepEqual(anticipate(at, {at, distance: [0, 0]}), [0, 0]);
  assert.equal(anticipate(at, {at, distance: 100, amount: .2, lead: .3}), -20);
  assert.throws(() => anticipate(1, {distance: 10}), /anticipate: t and at \(when the move starts\) are seconds, not t 1, at undefined/);
  assert.throws(() => anticipate(1, {at, distance: 'far'}), /anticipate: distance is how far the move goes, a number or \[dx, dy\], not "far"/);
  assert.throws(() => anticipate(1, {at, distance: 1, amount: .8}), /anticipate: amount is the share of the distance it winds back, 0 to 0.5 \(a small counter-move: 0.1 by default\), not 0.8/);
  assert.throws(() => anticipate(1, {at, distance: 1, lead: 0}), /lead and release are seconds, above 0/);
});

test('squash: volume kept (sx × sy = 1), stretched by speed, squashed on landing, then a wobble that settles', () => {
  const land = {at: 1, speed: 1500}, s = t => squash(t, {landings: [land]});
  for (const t of steps(0, 3, 300)) { const {sx, sy} = s(t); assert.ok(Math.abs(sx * sy - 1) < 1e-12, `volume at ${t}`); }
  assert.deepEqual(squash(0), {sx: 1, sy: 1}, 'at rest: round');
  const fast = squash(0, {velocity: -1000});
  assert.ok(Math.abs(fast.sy - 1.2) < 1e-12 && fast.sx < 1, 'falling at 1000 px/s: 20% taller, thinner (either sign of speed)');
  assert.ok(Math.abs(s(1).sy - .7) < 1e-12 && s(1).sx > 1, 'on contact: flattened by k × speed (0.3), wider');
  assert.ok(s(.99).sy === 1, 'before it lands, nothing');
  assert.ok(steps(1, 1.3, 120).some(t => s(t).sy > 1), 'the wobble springs past round');
  assert.deepEqual(s(1.7), {sx: 1, sy: 1}, 'and has settled, exactly, well within a second');
  assert.ok(Math.abs(squash(1, {landings: [{at: 1, speed: 9000}]}).sy - .65) < 1e-12, 'never squashed past max (0.35)');
  assert.ok(squash(1.02, {landings: [land, {at: 1.02, speed: 500}]}).sy < s(1.02).sy, 'a second landing adds to the first');
  const sideways = squash(1, {landings: [land], axis: 'x'});
  assert.ok(Math.abs(sideways.sx - .7) < 1e-12, 'a sideways impact squashes along x');
  assert.throws(() => squash(0, {axis: 'z'}), /squash: axis is the motion's, 'y' \(a fall\) or 'x', not "z"/);
  assert.throws(() => squash(0, {landings: [{at: 1}]}), /squash: landings is a list of \{at, speed\}/);
  assert.throws(() => squash(0, {max: 1}), /max is the most it squashes or stretches, above 0 and below 1/);
});

test('envelope: a quick smooth rise (40–120 ms), then an exponential fade to nothing', () => {
  for (const name of BURST_NAMES) {
    const {attack, decay} = BURSTS[name], e = age => envelope(age, name);
    assert.ok(attack >= .04 && attack <= .12, `${name}'s attack is 40–120 ms`);
    assert.equal(e(-1), 0); assert.equal(e(0), 0); assert.equal(e(attack), 1, `${name} peaks at its attack`);
    assert.ok(e(attack / 20) < .01, `${name} starts gently (smoothstep: flat at the onset)`);
    assert.ok(Math.abs(e(attack + decay) - Math.exp(-1)) < 1e-12, `${name} falls to 1/e over its decay`);
    const rise = steps(0, attack, 50).map(e), fall = steps(attack, attack + 10 * decay, 200).map(e);
    for (let i = 1; i < rise.length; i++) assert.ok(rise[i] >= rise[i - 1]);
    for (let i = 1; i < fall.length; i++) assert.ok(fall[i] <= fall[i - 1]);
    assert.equal(e(attack + 7 * decay), 0, `${name} is over once below a thousandth`);
  }
  assert.equal(envelope(.05, {attack: .1, decay: .2}), .5, 'a shape of your own');
  assert.throws(() => envelope(.1, {attack: .5, decay: .2}), /envelope: attack is 0.04–0.12 s \(a one-shot event rises in 40–120 ms: quicker reads as a glitch, slower as a fade\), not 0.5/);
  assert.throws(() => envelope(.1, {attack: .01, decay: .2}), /attack is 0.04–0.12 s/);
  assert.throws(() => envelope(.1, 'boom'), /envelope: no shape called "boom" \(the shapes are flash, pop, shake, or \{attack, decay\} of your own\)/);
});

test('envelopeShare: the envelope added up, a share of all of it — how far a thing the event pushed has gone', () => {
  for (const shape of [...BURST_NAMES, {attack: .1, decay: .5}]) {
    const {attack, decay} = typeof shape === 'string' ? BURSTS[shape] : shape, all = attack / 2 + decay;
    assert.equal(envelopeShare(-1, shape), 0); assert.equal(envelopeShare(0, shape), 0);
    assert.ok(Math.abs(envelopeShare(attack, shape) - attack / 2 / all) < 1e-12, 'the rise adds half its length');
    // Against envelope itself, summed in small steps: the same share at every age (the closed form is envelope's own).
    for (const age of [attack / 2, attack * 2, decay, 3 * decay]) {
      let sum = 0; const n = 20000;
      for (let i = 0; i < n; i++) sum += envelope((i + .5) / n * age, shape) * age / n;
      assert.ok(Math.abs(envelopeShare(age, shape) - sum / all) < 2e-3, `${JSON.stringify(shape)} at ${age} s: ${envelopeShare(age, shape).toFixed(4)}, the envelope sums to ${(sum / all).toFixed(4)}`);
    }
    const ages = Array.from({length: 200}, (_, i) => i / 100);
    assert.ok(ages.every((a, i) => !i || envelopeShare(a, shape) >= envelopeShare(ages[i - 1], shape)), 'never back');
    assert.ok(envelopeShare(attack + 10 * decay, shape) > .999, 'all of it, given time');
  }
  assert.throws(() => envelopeShare(NaN), /envelopeShare: age is seconds since the event, not NaN/);
  assert.throws(() => envelopeShare(.1, 'thud'), /no shape called "thud"/);
});

test('burst: every event by its own age, so overlapping events add', () => {
  const hits = [1, 1.1, {at: 1.15, strength: .5}];
  for (const t of steps(.9, 2, 60)) assert.ok(Math.abs(burst(t, hits, 'flash') - (envelope(t - 1, 'flash') + envelope(t - 1.1, 'flash') + .5 * envelope(t - 1.15, 'flash'))) < 1e-12, `the sum at ${t}`);
  assert.ok(burst(1.14, [1, 1.1], 'flash') > envelope(.04, 'flash'), 'the second lands on what is left of the first');
  assert.equal(burst(5, [], 'pop'), 0);
  assert.equal(burst(.5, [1, 2]), 0, 'nothing before the first event');
  assert.throws(() => burst(1, [{when: 1}]), /burst: an event is a time or \{at, strength\?\}, numbers/);
  assert.throws(() => burst(1, 1), /burst: events is a list of times/);
});

test('arc: from and to exactly, the middle a little off the straight line, bulging toward the side asked', () => {
  const a = [100, 500], b = [900, 500];
  assert.deepEqual(arc(a, b, 0), a); assert.deepEqual(arc(a, b, 1), b);
  const mid = arc(a, b, .5);
  assert.ok(Math.abs(mid[0] - 500) < 1e-9 && Math.abs(mid[1] - (500 - .12 * 800)) < 1e-9, `the middle sits 12% of the distance up (${mid})`);
  assert.ok(Math.abs(arc(b, a, .5)[1] - (500 - 96)) < 1e-9, 'right to left bulges up too');
  assert.ok(Math.abs(arc(a, b, .5, {toward: 'down'})[1] - 596) < 1e-9);
  assert.ok(arc([500, 800], [500, 100], .5)[0] < 500, 'a move straight up, asked to bulge up, bulges to its own left');
  assert.ok(arc([100, 800], [900, 100], .5, {toward: 'left'})[0] < 500, 'a diagonal bulges toward the side asked');
  for (const u of steps(0, 1, 20)) assert.ok(Math.abs(arc(a, b, u, {bend: 0})[1] - 500) < 1e-9, 'bend 0 is the straight line');
  assert.ok(arc(a, b, 1.1)[0] > 900, 'past 1 (an overshooting ease) it carries on along the curve');
  assert.deepEqual(arc(a, a, .5), a, 'no distance, no path');
  assert.throws(() => arc([0, 0], [1], .5), /arc: from and to are points, \[x, y\]/);
  assert.throws(() => arc(a, b, .5, {toward: 'north'}), /arc: toward is the side it bulges to, up, down, left, right, not "north"/);
});
