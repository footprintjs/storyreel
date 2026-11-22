// What a resting block covers is read from its outline as drawn (src/kits/isometric/motion-cover.mjs over turn.mjs ·
// drawnOutline): a body left turned covers by its turned corners — never by its outline as built, moved. Pinned both
// ways: a turned rest that hides a name its built outline would not, and one whose built outline would hide a name its
// turned one does not.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTheme} from '../src/index.mjs';
import {readMap} from '../src/kits/isometric/read.mjs';
import {buildMap} from '../src/kits/isometric/build.mjs';
import {groundedStyle} from '../src/kits/isometric/looks.mjs';
import {lookOf} from '../src/kits/isometric/draw.mjs';
import {coversOf} from '../src/kits/isometric/motion-cover.mjs';
import {turning, turnAxis, onFace} from '../src/kits/isometric/turn.mjs';

/** A world's built map, as compileIsometric builds it (index.mjs): read, its style on the film's ground, built. */
function mapOf(spec) {
  const read = readMap(spec, 'the story'), grounded = groundedStyle(read.style, lookOf(loadTheme('paper')), 'the story: isometric style');
  return buildMap(Object.assign(read, {style: grounded.style, look: grounded.look}), 'the story');
}
/** The server, named on its top, and a crate beside it that comes to rest where it stands — turned by `turn`, or not. */
function rest(at, turn) {
  const map = mapOf({grid: {tile: 100, at: [800, 300]}, blocks: [{name: 'server', at: [0, 0], size: [2, 2, 1], label: 'Server'}, {name: 'crate', at, size: [1, 1, 1]}]});
  const crate = map.blocks[1], moves = [{piece: crate, start: 0, seconds: 1, times: [0, 1]}];
  const poseAt = (b, t) => (b === crate && t >= 1 ? {dx: 0, dy: 0, pivot: [0, 0], sx: 1, sy: 1, at: [...crate.at], ...(turn ? {turn} : {})} : null);
  const {hidden, findings} = coversOf(map, moves, poseAt);
  return {hidden: [...hidden.keys()].map(b => b.name), findings: findings.map(f => f.critic)};
}

test('a turned rest covers by its turned outline: it hides a name its built outline would not', () => {
  // an eighth of a turn about the line across a way along the rows: its corners reach over the server's name
  const turn = turning(turnAxis([0, 1]), Math.PI / 4);
  assert.ok(!onFace(turn), 'turned off its faces: drawn by its turned corners');
  assert.deepEqual(rest([2.25, 0, 0], turn), {hidden: ['server'], findings: ['reel:covers']});
  assert.deepEqual(rest([2.25, 0, 0], null), {hidden: [], findings: []}, 'the same block at rest as built hides nothing there');
});

test('and a built outline that would hide a name, turned away from it, does not', () => {
  const turn = turning(turnAxis([1, 0]), Math.PI / 4);
  assert.deepEqual(rest([2, 0, 0], null), {hidden: ['server'], findings: ['reel:covers']}, 'as built it reaches over the name');
  assert.deepEqual(rest([2, 0, 0], turn), {hidden: [], findings: []}, 'turned, its outline as drawn clears it');
});

test('a block turned onto a face again is drawn as built, so it covers as built', () => {
  // a quarter turn: each axis onto an axis — the tumble's rest, which shows the very block built there
  const quarter = turning(turnAxis([0, 1]), Math.PI / 2);
  assert.ok(onFace(quarter.map(v => Math.round(v))));
  for (const at of [[2, 0, 0], [2.25, 0, 0]]) assert.deepEqual(rest(at, quarter.map(v => Math.round(v))), rest(at, null), `at ${at}: as built`);
});
