/**
 * Perspective (src/perspective.mjs): one grid for a scene. Pinned: the front line is scale 1 and lands where it is
 * placed; depth shrinks things toward the vanishing point on the horizon; height lifts and shrinks with depth;
 * `along` spaces things evenly and keeps their order; painter's order draws the furthest first; parallax moves far
 * things less; bad input refuses with words that say what it takes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {perspective} from '../src/perspective.mjs';

const room = perspective({horizon: 400, vanish: 800, front: 900, focal: 1000});
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test('the front line is itself: scale 1, x and y as placed', () => {
  assert.deepEqual(room.at(300, 0), {x: 300, y: 900, scale: 1});
});

test('depth shrinks toward the vanishing point on the horizon', () => {
  const p = room.at(300, 1000);
  near(p.scale, .5, 'half as big at focal depth'); near(p.x, 550, 'halfway to the vanishing point'); near(p.y, 650, 'halfway up to the horizon');
  const far = room.at(300, 1e9); assert.ok(Math.abs(far.x - 800) < 1 && Math.abs(far.y - 400) < 1, 'very far: at the vanishing point');
});

test('height lifts a thing off the floor, shrinking with its depth', () => {
  near(room.at(500, 0, 300).y, 600, 'at the front, 300 up'); near(room.at(500, 1000, 300).y, 650 - 150, 'at half scale, half as high');
});

test('along: n evenly spaced points from a to b, in the order given, each with its depth', () => {
  const rail = room.along({x: 1100, depth: 0, height: 300}, {x: 1100, depth: 900, height: 300}, 10);
  assert.equal(rail.length, 10); near(rail[0].depth, 0, 'first at a'); near(rail[9].depth, 900, 'last at b'); near(rail[4].depth - rail[3].depth, 100, 'even steps');
  assert.ok(rail.every((p, i) => !i || p.scale < rail[i - 1].scale), 'each further back is smaller');
  assert.deepEqual(room.along({x: 0, depth: 0}, {x: 100, depth: 0}, 1).map(p => p.x), [50], 'one thing: in the middle');
});

test('backToFront: the furthest first; ties keep their order', () => {
  const items = [{n: 'a', depth: 10}, {n: 'b', depth: 300}, {n: 'c', depth: 10}, {n: 'd', depth: 50}];
  assert.deepEqual(room.backToFront(items).map(i => i.n), ['b', 'd', 'a', 'c']);
  assert.deepEqual(room.backToFront([3, 1, 2], d => d), [3, 2, 1]);
});

test('toward and parallax', () => {
  assert.deepEqual(room.toward(100), [[100, 900], [800, 400]]);
  near(room.parallax(1000, 80), 40, 'half as far at half scale'); near(room.parallax(0, 80), 80, 'the front moves with the camera');
});

test('bad input refuses, saying what it takes', () => {
  assert.throws(() => perspective({horizon: 950}), /horizon \(950\) is above the floor's front edge/);
  assert.throws(() => perspective({horizon: 'x'}), /are numbers/);
  assert.throws(() => perspective({horizon: 400, focal: 0}), /focal is above 0/);
  assert.throws(() => room.at(0, -2000), /depth is a number of px back/);
  assert.throws(() => room.along({x: 0}, {x: 1, depth: 0}, 3), /start is \{x, depth, height\?\}/);
  assert.throws(() => room.along({x: 0, depth: 0}, {x: 1, depth: 0}, 0), /1 or more things/);
});
