import test from 'node:test';
import assert from 'node:assert/strict';
import {EASES, EASE_NAMES, bezier, easeNamed, overshoots} from '../src/ease.mjs';
import {readEntrance} from '../src/transitions.mjs';

// The four-number curves and the named curves added to the table (src/ease.mjs). The table's older names are pinned
// in kits.test.mjs; these tests hold the new ones to CSS and to their own definitions.
const grid = Array.from({length: 1001}, (_, i) => i / 1000);
/** The curve as a browser defines it, parametrically: at parameter s, (x(s), y(s)) is on it. An oracle with no solver. */
const onCurve = (x1, y1, x2, y2, s) => [3 * (1 - s) ** 2 * s * x1 + 3 * (1 - s) * s * s * x2 + s ** 3, 3 * (1 - s) ** 2 * s * y1 + 3 * (1 - s) * s * s * y2 + s ** 3];
const CURVES = [[.25, .1, .25, 1], [.42, 0, .58, 1], [.16, 1, .3, 1], [.34, 1.56, .64, 1], [.6, -.28, .735, .045], [1, 0, 0, 1], [0, 1, 1, 0], [0, 0, 1, 1], [.2, 0, 0, 1], [1, 1, 0, 0], [0, 2, 1, -1]];

test('bezier: exact at both ends, clamped outside its seconds', () => {
  for (const c of CURVES) {
    const f = bezier(...c);
    assert.equal(f(0), 0, `${c} at 0`); assert.equal(f(1), 1, `${c} at 1`);
    assert.equal(f(-2), 0, `${c} before its start`); assert.equal(f(3), 1, `${c} after its end`);
  }
});

test('bezier: the same curve a browser draws — every point of it, against the curve written parametrically', () => {
  for (const c of CURVES) {
    const f = bezier(...c);
    // Where x hardly moves with s (dx/ds near 0: (1, 0, 0, 1) at its middle), y is fixed by x only as well as the numbers allow.
    const flat = s => Math.abs(3 * (1 - s) ** 2 * c[0] + 6 * (1 - s) * s * (c[2] - c[0]) + 3 * s * s * (1 - c[2])) < 1e-2;
    for (const s of grid) { const [x, y] = onCurve(...c, s); assert.ok(Math.abs(f(x) - y) < (flat(s) ? 1e-4 : 1e-7), `cubic-bezier(${c}) at x = ${x}: ${f(x)} against ${y}`); }
  }
  // CSS's own named curves, at the middle: ease and ease-in-out (values every browser agrees on).
  assert.ok(Math.abs(bezier(.25, .1, .25, 1)(.5) - .8024033877) < 1e-8);
  assert.ok(Math.abs(bezier(.42, 0, .58, 1)(.5) - .5) < 1e-9, 'ease-in-out is symmetric about its middle');
  // Where Newton's method finds a flat slope (x1 = 1, x2 = 0 is flat at the middle), bisection still finds the point.
  assert.ok(Math.abs(bezier(1, 0, 0, 1)(.5) - .5) < 1e-6);
  assert.equal(bezier(.3, .3, .7, .7)(.37), .37, 'control points on the diagonal: a straight line');
});

test('bezier: with y within 0..1 it only goes forward, and stays within 0..1', () => {
  // A deterministic spread of curves over the unit square (a lattice, so a failure names its curve).
  const steps = [0, .1, .35, .5, .8, 1];
  for (const x1 of steps) for (const y1 of steps) for (const x2 of steps) for (const y2 of steps) {
    const f = bezier(x1, y1, x2, y2);
    let last = 0;
    for (const u of grid) { const v = f(u); assert.ok(v >= last - 1e-9 && v >= 0 && v <= 1, `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2}) goes back or out at ${u}`); last = v; }
  }
});

test('bezier: a refusal names the fix', () => {
  assert.throws(() => bezier(1.2, 0, .5, 1), /bezier: x1 and x2 are times, within 0..1 \(a curve cannot go back in time\), not x1 1.2, x2 0.5; y1 and y2 may leave 0..1/);
  assert.throws(() => bezier(.5, 0, -.1, 1), /x1 0.5, x2 -0.1/);
  assert.throws(() => bezier(.5, NaN, .5, 1), /bezier: four numbers, x1, y1, x2, y2 \(as CSS's cubic-bezier takes them\), not 0.5, NaN, 0.5, 1/);
  assert.throws(() => bezier(.5, 0, .5), /four numbers/);
});

test('easeNamed: a four-number curve as CSS writes it', () => {
  const f = easeNamed('cubic-bezier(0.16, 1, 0.3, 1)'), g = bezier(.16, 1, .3, 1);
  for (const u of grid) assert.equal(f(u), g(u));
  for (const text of ['cubic-bezier(.16,1,.3,1)', '  cubic-bezier( 0.16 , 1 , 0.3 , 1 ) ', 'cubic-bezier(1.6e-1, 1, 3e-1, 1)']) assert.equal(easeNamed(text)(.4), g(.4), text);
  assert.throws(() => easeNamed('cubic-bezier(1.5, 0, 0, 1)', 'stage b: enter.ease'), /stage b: enter.ease: "cubic-bezier\(1.5, 0, 0, 1\)" is not a curve: x1 and x2 are times, within 0..1/);
  assert.throws(() => easeNamed('cubic-bezier(a, 0, 0, 1)', 'e'), /e: "cubic-bezier\(a, 0, 0, 1\)" is not a curve: four numbers/);
  assert.throws(() => easeNamed('cubic-bezier(0, 0, 1)', 'e'), /e: "cubic-bezier\(0, 0, 1\)" is not an ease; the eases are linear, .*, or a four-number curve as CSS writes it/);
  assert.throws(() => easeNamed('steps(4)', 'e'), /"steps\(4\)" is not an ease/);
});

test('overshoots: the named ones that do, and a four-number curve exactly when its y leaves 0..1', () => {
  assert.deepEqual(EASE_NAMES.filter(overshoots), ['back', 'spring', 'outBack']);
  for (const c of CURVES) {
    const f = bezier(...c), ys = grid.map(s => onCurve(...c, s)[1]), past = Math.min(...ys) < -1e-9 || Math.max(...ys) > 1 + 1e-9;
    assert.equal(overshoots(`cubic-bezier(${c.join(', ')})`), past, `cubic-bezier(${c})`);
    assert.equal(grid.some(u => f(u) > 1 + 1e-9 || f(u) < -1e-9), past, `cubic-bezier(${c}) does what overshoots says`);
  }
  assert.equal(overshoots('cubic-bezier(0.1, 1.1, 0.3, 0.5)'), false, 'a y1 past 1 need not take the curve past 1');
  assert.equal(overshoots('wobble'), false);
});

test('the named curves: outCubic, outQuint, outExpo, outBack, inOutCubic, standard, emphasized, bounce', () => {
  assert.equal(EASES.outCubic(.5), .875); assert.equal(EASES.outQuint(.5), 1 - 1 / 32);
  assert.equal(EASES.outBack, EASES.back, 'outBack is back, under the name CSS libraries use');
  assert.equal(EASES.outExpo(1), 1, 'outExpo reaches exactly 1 (no last-frame jump)');
  assert.ok(EASES.outExpo(.3) > EASES.outQuint(.3) && EASES.outQuint(.3) > EASES.outCubic(.3) && EASES.outCubic(.3) > EASES.out(.3), 'the out curves, fastest start first');
  for (const u of grid) assert.ok(Math.abs(EASES.inOutCubic(u) + EASES.inOutCubic(1 - u) - 1) < 1e-12, 'inOutCubic slows down as it sped up');
  for (const u of grid) assert.equal(EASES.standard(u), bezier(.2, 0, 0, 1)(u), 'standard is Material 3\'s cubic-bezier(0.2, 0, 0, 1)');
  // Material 3's emphasized path: through (1/6, 0.4), on each piece the curve its tokens name.
  assert.ok(Math.abs(EASES.emphasized(1 / 6) - .4) < 1e-12);
  const path = [[0, 0, .05, 0, .133333, .06, .166666, .4], [.166666, .4, .208333, .82, .25, 1, 1, 1]];
  for (const [x0, y0, ax, ay, bx, by, x3, y3] of path) for (const s of grid) {
    const x = (1 - s) ** 3 * x0 + 3 * (1 - s) ** 2 * s * ax + 3 * (1 - s) * s * s * bx + s ** 3 * x3, y = (1 - s) ** 3 * y0 + 3 * (1 - s) ** 2 * s * ay + 3 * (1 - s) * s * s * by + s ** 3 * y3;
    assert.ok(Math.abs(EASES.emphasized(x) - y) < 2e-4, `emphasized at ${x}: ${EASES.emphasized(x)} against the path's ${y}`);
  }
  for (let i = 1; i < grid.length; i++) assert.ok(EASES.emphasized(grid[i]) >= EASES.emphasized(grid[i - 1]), 'emphasized only goes forward');
  // bounce lands on the end four times (the last at the end), each bounce a quarter the height of the one before.
  const d = 2.75;
  for (const u of [1 / d, 2 / d, 2.5 / d]) assert.ok(Math.abs(EASES.bounce(u) - 1) < 1e-12, `bounce lands at ${u}`);
  const dips = [1.5 / d, 2.25 / d, 2.625 / d].map(u => 1 - EASES.bounce(u));
  assert.ok(Math.abs(dips[0] - .25) < 1e-12 && Math.abs(dips[1] - .0625) < 1e-12 && Math.abs(dips[2] - .015625) < 1e-12, `bounce heights ${dips}`);
});

test('an entrance refuses an ease that goes past the end where the frame\'s edge would show — four-number curves too', () => {
  assert.throws(() => readEntrance({type: 'push', ease: 'outBack'}, 'stage b'), /stage b: a push cannot take the ease "outBack" \(it goes past the end, and the frame's edge would show\); slide can/);
  assert.throws(() => readEntrance({type: 'wipe', ease: 'cubic-bezier(0.34, 1.56, 0.64, 1)'}, 'stage b'), /a wipe cannot take the ease "cubic-bezier\(0.34, 1.56, 0.64, 1\)"/);
  assert.equal(readEntrance({type: 'push', ease: 'cubic-bezier(0.16, 1, 0.3, 1)'}, 'stage b').ease(.5), bezier(.16, 1, .3, 1)(.5));
  assert.equal(readEntrance({type: 'slide', ease: 'cubic-bezier(0.34, 1.56, 0.64, 1)'}, 'stage b').type, 'slide', 'slide shows an overshoot');
  assert.equal(readEntrance({type: 'push', ease: 'bounce'}, 'stage b').type, 'push', 'bounce never passes the end');
  assert.throws(() => readEntrance({type: 'push', ease: 'cubic-bezier(2, 0, 0, 1)'}, 'stage b'), /stage b: enter.ease: "cubic-bezier\(2, 0, 0, 1\)" is not a curve/);
});
