// A hang from a block (src/kits/isometric/motion-hang.mjs): `"from": "<block>"` is tied where a real one would be —
// under a block in the air above the piece, else beside the block's top edge on an arm half the piece's depth long — so
// the piece reads as hung from that block, with no contact finding; a swing that really goes into a block still warns.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTheme} from '../src/index.mjs';
import {compileIsometric} from '../src/kits/isometric/index.mjs';
import {hangPin} from '../src/kits/isometric/motion-hang.mjs';
import {compileExample} from './golden.mjs';

const film = await compileExample('iso-motion');
const worldOf = (spec, where = 'the story') => compileIsometric(spec, {clock: film.clock, theme: loadTheme('paper'), where});
const grid = {tile: 100, at: [800, 150]};
const shelf = {name: 'shelf', at: [2, 4, 0], size: [1, 1, 4]};
const hang = (blocks, from = 'shelf') => worldOf({grid, blocks, motion: [{piece: 'sign', do: 'hang', from}]});
/** Every call a draw makes, on a canvas that records them. */
const drawn = (w, t) => {
  const calls = [], rec = new Proxy({}, {get: (_, k) => (typeof k === 'string' ? (...a) => { calls.push([k, ...a]); return {width: 10}; } : undefined), set: (_, k, v) => { calls.push(['=' + String(k), v]); return true; }});
  w.draw(rec, t);
  return calls;
};

test('beside a block standing on the floor: tied at the middle of the top edge that faces the piece, on an arm half its depth out, it hangs flush against that side — no contact', () => {
  // the sign (2 × 2, the usual size) stands against the shelf's east side: the arm leaves the edge at col 3 and the pin is a tile out
  const w = hang([{name: 'sign', at: [3, 4, 0]}, shelf]), [m] = w.map.motions;
  assert.deepEqual(m.hung, {on: 'shelf', rule: 'beside', pin: [4, 4.5, 4]});
  assert.deepEqual(w.motionFindings, [], 'it hangs from the shelf, not inside it');
  // the rope is drawn from the arm's start on the shelf's edge, out to the pin, then down to the sign
  // (on this grid a tile along the columns is 50 px across and 25 px down the frame: the edge, a column back from the pin)
  const [intent] = w.motionIntents, pin = intent.from, calls = drawn(w, m.at + m.seconds + 1);
  const at = calls.findIndex(([k, x, y]) => k === 'lineTo' && Math.abs(x - pin[0]) < 1e-9 && Math.abs(y - pin[1]) < 1e-9);
  assert.ok(at > 0, 'the rope goes through the pin');
  const start = calls[at - 1];
  assert.deepEqual([start[0], +(start[1] - pin[0]).toFixed(9), +(start[2] - pin[1]).toFixed(9)], ['moveTo', -50, -25], 'and starts at the shelf\'s top edge, a column back: the arm');
  // the arm is framed with the rope: a camera that frames the sign frames what it hangs from
  const box = w.regionsAt(m.at + m.seconds + 1).find(r => r.name === 'sign').box;
  assert.ok(box[0] <= start[1] + 1e-6 && box[1] <= start[2] + 1e-6, 'the sign\'s region holds the arm');
  // along a side longer than the piece, the edge's middle: it swings along the side, clear of it
  const long = hang([{name: 'sign', at: [3, 4.5, 0]}, {...shelf, at: [2, 3, 0], size: [1, 4, 4]}]);
  assert.deepEqual(long.map.motions[0].hung, {on: 'shelf', rule: 'beside', pin: [4, 5, 4]});
  assert.deepEqual(long.motionFindings, []);
  // any side: south of it (+row), the edge across the rows
  const south = hang([{name: 'sign', at: [2, 5, 0], size: [1, 1, 1]}, shelf]);
  assert.deepEqual(south.map.motions[0].hung, {on: 'shelf', rule: 'beside', pin: [2.5, 5.5, 4]});
  assert.deepEqual(south.motionFindings, []);
});

test('under a block in the air above the piece: tied to the middle of its underside, it hangs beneath — no contact, no arm', () => {
  const beam = {name: 'shelf', at: [2, 3, 5], size: [3, 3, 0.5]};
  for (const at of [[4, 4, 0], [3, 4, 0]]) {
    const w = hang([{name: 'sign', at}, beam]);
    assert.deepEqual(w.map.motions[0].hung, {on: 'shelf', rule: 'under', pin: [3.5, 4.5, 5]});
    assert.deepEqual(w.motionFindings, [], `from ${at}: it hangs beneath the beam`);
  }
  assert.deepEqual(hangPin({size: [3, 3, 0.5]}, [2, 3, 5], {size: [2, 2, 1]}, [4, 5, 0]), {pin: [3.5, 4.5, 5], arm: null, rule: 'under'});
});

test('a hang that really passes through a block still warns: a swing into its own pin\'s side, or into another block in the way', () => {
  // a tile out from the shelf: the rope swings it past its rest and back, into the shelf's side
  const off = hang([{name: 'sign', at: [4, 4, 0]}, shelf]);
  assert.deepEqual(off.motionFindings.map(f => [f.critic, f.level]), [['reel:contact', 'warn']]);
  assert.match(off.motionFindings[0].what, /it goes [\d.]+ tiles into "shelf" — it passes through a block/);
  assert.match(off.motionFindings[0].fix, /move "shelf" out of its swing, or the pin \(from\) so it swings clear/);
  // under a beam, with a crate in the way of its swing: through the crate (and with no crate, clear)
  const beam = {name: 'shelf', at: [2, 3, 5], size: [3, 3, 0.5]}, sign = {name: 'sign', at: [5, 4, 0], size: [1, 1, 1]};
  assert.deepEqual(hang([sign, beam]).motionFindings, []);
  const crate = hang([sign, beam, {name: 'crate', at: [4.2, 4, 0], size: [0.5, 1, 1]}]);
  assert.deepEqual(crate.motionFindings.map(f => [f.critic, f.level, /into "crate"/.test(f.what)]), [['reel:contact', 'warn', true]]);
  // the rule of 0.50.0 — the rope tied to the middle of the shelf's top, written here as tiles — rests it inside the shelf:
  // the warn every hang from a block used to give
  const old = hang([{name: 'sign', at: [3, 4, 0]}, shelf], [2.5, 4.5, 4]);
  assert.deepEqual(old.motionFindings.map(f => [f.critic, f.level]), [['reel:contact', 'warn']]);
});

test('a block no higher than the piece is no pin: refused, naming a pin of tiles above it', () => {
  assert.throws(() => hang([{name: 'sign', at: [3, 4, 0], size: [1, 1, 2]}, {...shelf, size: [1, 1, 1]}], 'shelf'),
    /^Error: the story: isometric motion\[0\] \("sign"\): from names "shelf", whose top is at lift 1 — a block hangs below its pin, and its top is at lift 2: hang it from a block that stands higher than it, or from tiles above it \(from: \[3\.5, 4\.5, 5\]\)$/);
  // a hang from tiles is as it was: no block named, no arm — the rope starts at the pin
  const tiles = hang([{name: 'sign', at: [4, 4, 0]}, shelf], [3, 4, 5]), [m] = tiles.map.motions;
  assert.equal(m.hung, undefined, 'a pin of tiles names no block');
  const calls = drawn(tiles, m.at + m.seconds + 1), pin = tiles.motionIntents[0].from;
  assert.ok(calls.some(([k, x, y]) => k === 'moveTo' && Math.abs(x - pin[0]) < 1e-9 && Math.abs(y - pin[1]) < 1e-9), 'the rope is drawn from the pin');
});
