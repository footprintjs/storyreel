// A geometry audit for drawn parts (geometry.mjs): a kit that gives its parts — named segments and regions, in its own
// coordinates — is checked over time: a mounted end stays on its mount, a pair kept apart never crosses, a planted part
// does not slide. Proven on the cartoon kit and on a figure walked by walk.mjs; a verdict in the review.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings, cartoonKit} from '../src/index.mjs';
import {GEOMETRY, readParts, crosses, auditParts, breakText, geometryOf, GEOMETRY_VERDICT} from '../src/geometry.mjs';
import {walk} from '../src/walk.mjs';
import {reviewPart} from '../src/review.mjs';

const storyboard = {title: 'Parts', scenes: [{id: 'walk', narration: 'a figure walks across the floor from one side of the frame to the other and stops there to rest'}]};
const timings = evenTimings(storyboard, {wordSeconds: .45, tail: 1});

// A figure walked by walk.mjs, drawn as two legs from its hips to its feet: each foot is planted while its lift is 0
// (walk.mjs's pose). `skate` slides the feet along under the body instead; `loose` lets a leg come off the hips.
const walker = {name: 'walker', story: {compile: spec => {
  const w = walk({from: 200, to: 1300, start: 1, size: 400}), floor = 800;
  const parts = t => {
    const p = w.at(t), hips = [p.x - 30, floor - 230 + p.lift, p.x + 30, floor - 170 + p.lift], hip = [p.x, floor - 200 + p.lift];
    const feet = p.feet.map(f => (spec.skate ? {x: p.x, lift: 0} : f));
    const segments = {};
    feet.forEach((f, j) => {
      const at = [f.x, floor - f.lift];
      segments[`leg ${j + 1}`] = {a: spec.loose && j === 1 && t > 3 ? [hip[0], hip[1] + 60] : hip, b: at, width: 10, mount: 'hips'};
      segments[`foot ${j + 1}`] = {a: at, b: [f.x + 30 * p.facing, at[1]], width: 8, mount: `leg ${j + 1}`, ends: 'free', contact: f.lift === 0};
    });
    return {segments, regions: {hips}, apart: [['leg 1', 'leg 2']]};
  };
  return {hang: 1, parts, draw: (c, t) => {
    c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900); c.strokeStyle = '#222'; c.lineWidth = 10;
    for (const s of Object.values(parts(t).segments)) { c.beginPath(); c.moveTo(...s.a); c.lineTo(...s.b); c.stroke(); }
  }};
}}};
const filmOf = spec => compileFilm({storyboard, timings, recipe: {story: {kit: 'walker', ...spec}}, kits: [walker]});

test('a kit\'s parts are checked as written: a refusal names whose parts and the fix', () => {
  const ok = {segments: {arm: {a: [0, 0], b: [10, 0], mount: 'body'}}, regions: {body: [-5, -5, 5, 5]}};
  assert.deepEqual(readParts(ok, 'story at 1.00 s').apart, []);
  for (const [parts, message] of [
    [[], /story at 1\.00 s: parts\(t\) returns \{segments/],
    [{segments: {arm: {a: [0, 0]}}}, /segment "arm": a and b are its two ends, \[x, y\] each/],
    [{segments: {arm: {a: [0, 0], b: [1, 1], bend: 2}}}, /segment "arm" has bend; a segment takes a, b, width, mount, ends, contact/],
    [{segments: {arm: {a: [0, 0], b: [1, 1], mount: 'torso'}}}, /segment "arm" is mounted on "torso", which is not among its parts \(segments: arm; regions: none\)/],
    [{segments: {arm: {a: [0, 0], b: [1, 1], mount: 'arm'}}}, /segment "arm" is mounted on itself/],
    [{segments: {arm: {a: [0, 0], b: [1, 1], ends: 'mounted'}}}, /ends 'mounted' needs a mount/],
    [{segments: {arm: {a: [0, 0], b: [1, 1], ends: 'both'}}}, /ends is 'free' \(only a is held\) or 'mounted'/],
    [{segments: {arm: {a: [0, 0], b: [1, 1], contact: 1}}}, /contact names the end that rests on the ground \('a', 'b', or true for both\), or is false while it is in the air, not 1/],
    [{segments: {arm: {a: [0, 0], b: [1, 1], contact: 'heel'}}}, /contact names the end that rests on the ground/],
    [{segments: {}, regions: {body: [5, 5, 0, 0]}}, /region "body" is a box, \[x0, y0, x1, y1\]/],
    [{segments: {arm: {a: [0, 0], b: [1, 1]}}, apart: [['arm', 'leg']]}, /apart\[0\] names "leg", which is not one of its segments/],
  ]) assert.throws(() => readParts(parts, 'story at 1.00 s'), message);
});

test('two segments cross only through each other: a shared joint, a touch or parallel lines do not', () => {
  assert.equal(crosses([[0, 0], [10, 10]], [[0, 10], [10, 0]]), true, 'an X');
  assert.equal(crosses([[0, 0], [10, 10]], [[0, 0], [10, 0]]), false, 'a joint they share');
  assert.equal(crosses([[0, 0], [10, 0]], [[5, 0], [5, 10]]), false, 'one end touching the other');
  assert.equal(crosses([[0, 0], [10, 0]], [[0, 1], [10, 1]]), false, 'parallel');
});

test('the audit: an end off its mount, a pair crossing and a planted part sliding, each with its moment', () => {
  const at = (t, arm, foot, contact = true) => ({t, parts: [{path: 'story', segments: {
    body: {a: [0, 0], b: [0, 100], width: 20}, arm: {a: arm, b: [60, 0], width: 10, mount: 'body'}, other: {a: [40, -20], b: [40, 40]},
    foot: {a: foot, b: [foot[0] + 20, foot[1]], contact}}, apart: [['arm', 'other']]}]});
  const tenth = {...GEOMETRY, every: .1};   // these moments are a tenth of a second apart
  const {checked, breaks} = auditParts([at(0, [14, 50], [0, 200]), at(.1, [14, 50], [0, 200]), at(.2, [30, 50], [4, 200]), at(.3, [30, 50], [9, 200], false), at(.4, [30, 50], [20, 200])], tenth);
  assert.deepEqual(checked, {mounts: 5, pairs: 5, planted: 4}, 'both ends of a part planted flat, at each moment after the first; one lifted in between is not');
  const mount = breaks.filter(b => b.rule === 'mount');
  assert.deepEqual(mount.map(b => [b.t, b.px]), [[.2, 15], [.3, 15], [.4, 15]], `the arm's end 30 px from the body's line, past both half widths (5 + 10) by 15 px > ${GEOMETRY.reach}`);
  assert.equal(breaks.filter(b => b.rule === 'cross').length, 5, 'the arm crosses the other at every moment');
  assert.deepEqual(breaks.filter(b => b.rule === 'slide').map(b => [b.t, b.end, b.px]), [[.2, 'a', 4], [.2, 'b', 4]], 'the foot moved 4 px while planted; lifted, it may move');
  assert.equal(breakText(mount[0]), 'story: "arm" comes off "body", where it is mounted');
  assert.equal(breakText(breaks.find(b => b.rule === 'cross')), 'story: "arm" crosses "other", which it must keep apart from');
  assert.equal(breakText(breaks.find(b => b.rule === 'slide')), 'story: "foot" slides while it is planted');
});

test('a planted end is held to where it was first planted: a slow drift adds up and fails; a gap starts it again', () => {
  const foot = (t, x, contact = true) => ({t, parts: [{path: 'story', segments: {foot: {a: [x, 800], b: [x + 30, 800], contact}}}]});
  const step = GEOMETRY.every;
  // 0.9 px a moment: under the 1 px allowed between any two moments, but 1.8 px from where it was planted by the third.
  const drift = auditParts(Array.from({length: 5}, (_, k) => foot(k * step, 100 + .9 * k)));
  assert.deepEqual(drift.breaks.map(b => [b.end, b.px]), [['a', 1.8], ['b', 1.8], ['a', 2.7], ['b', 2.7], ['a', 3.6], ['b', 3.6]]);
  // The same foot off screen for a second, then back 10 px on: not the next moment, so nothing is known about it in between.
  const gap = auditParts([foot(0, 100), foot(step, 100), foot(1, 110), foot(1 + step, 110)]);
  assert.deepEqual(gap.breaks, []);
  assert.equal(gap.checked.planted, 4, 'compared at the moment after each planting');
});

test('a rolling foot names the end it rests on: about its heel as it lands, flat, about its toe as it pushes off', () => {
  // A foot 40 px long, planted with its heel at 100: its angle runs toes up (+0.3), flat, heel up (−0.3), on the 1/30 s grid.
  const L = 40, heel = [100, 800], toe = [140, 800], angles = Array.from({length: 31}, (_, k) => .3 - .02 * k);
  const rolled = (angle, pivot) => (pivot === 'heel'
    ? {a: heel, b: [heel[0] + L * Math.cos(angle), heel[1] - L * Math.sin(angle)]}
    : {a: [toe[0] - L * Math.cos(angle), toe[1] + L * Math.sin(angle)], b: toe});
  const pivotOf = angle => (angle > 1e-9 ? 'heel' : angle < -1e-9 ? 'toe' : 'flat');
  const sample = (angle, k, {draw, contact}) => ({t: k * GEOMETRY.every, parts: [{path: 'story', segments: {foot: {...rolled(angle, draw(angle)), contact: contact(angle)}}}]});
  const audit = how => auditParts(angles.map((angle, k) => sample(angle, k, how)));
  // Drawn about the end on the floor, and that end named: it passes.
  const right = audit({draw: a => (a >= 0 ? 'heel' : 'toe'), contact: a => ({heel: 'a', flat: true, toe: 'b'})[pivotOf(a)]});
  assert.deepEqual(right.breaks, []); assert.ok(right.checked.planted > 25);
  // Turned about its heel all the way (the toe sinks into the floor as the heel would rise): the toe it rests on moves.
  const heelOnly = audit({draw: () => 'heel', contact: a => ({heel: 'a', flat: true, toe: 'b'})[pivotOf(a)]});
  assert.ok(heelOnly.breaks.length && heelOnly.breaks.every(b => b.end === 'b'), JSON.stringify(heelOnly.breaks.slice(0, 2)));
  // Rolling, but said to be flat the whole time: an end it lifts moves, and fails.
  assert.ok(audit({draw: a => (a >= 0 ? 'heel' : 'toe'), contact: () => true}).breaks.length > 0);
});

test('walk.mjs plants its feet: a walked figure passes; one whose feet skate under it, or whose leg comes off, fails', async () => {
  const good = geometryOf(await filmOf({}));
  assert.ok(good.checked.planted > 50 && good.checked.mounts > 100, JSON.stringify(good.checked));
  assert.deepEqual(good.breaks, [], 'a planted foot stays where it was put, the legs share their hip (no crossing)');
  const skate = geometryOf(await filmOf({skate: true}));
  assert.ok(skate.breaks.length > 10 && skate.breaks.every(b => b.rule === 'slide'));
  assert.deepEqual(skate.worst.map(w => w.text), ['story: "foot 1" slides while it is planted', 'story: "foot 2" slides while it is planted']);
  const loose = geometryOf(await filmOf({loose: true}));
  assert.ok(loose.breaks.length && loose.breaks.every(b => b.rule === 'mount' && b.part === 'leg 2' && b.t > 3), JSON.stringify(loose.worst));
});

test('the review decides it with decide(): passed, failed with the breaks as findings, or not run without parts', async () => {
  const ok = await reviewPart(await filmOf({}));
  const v = ok.verdicts.find(x => x.check === 'geometry');
  assert.equal(v.verdict, 'passed'); assert.equal(v.why, GEOMETRY_VERDICT.passed);
  assert.match(v.summary, /^4 parts at \d+ moments$/);
  const bad = await reviewPart(await filmOf({skate: true}));
  const w = bad.verdicts.find(x => x.check === 'geometry');
  assert.equal(w.verdict, 'failed'); assert.equal(w.why, GEOMETRY_VERDICT.rules[1].label);
  assert.match(w.summary, /story: "foot 1" slides while it is planted \([\d.]+ px at 0:\d\d\.\d\)/);
  assert.ok(bad.findings.some(f => f.kind === 'geometry' && f.what === 'story: "foot 1" slides while it is planted'), bad.text);
  assert.match(bad.text, /· the drawing breaks: story: "foot 2" slides while it is planted$/m);
  assert.match(bad.record.filter(e => e.type === 'condition').map(e => e.text).join('\n'), /"a drawn part breaks[^"]*": broken 2 gt 0 ✓, and chose geometry\/failed/);
  const none = await reviewPart(await compileFilm({storyboard, timings, recipe: {story: {kit: 'whiteboard', items: []}}}));
  assert.deepEqual(none.verdicts.find(x => x.check === 'geometry'), {check: 'geometry', label: 'Drawn parts hold together', verdict: 'not run', why: 'no kit on screen gives its parts (parts(t))', measured: {}});
  // Parts with nothing declared to check: the audit runs and says it cannot answer.
  const bare = {name: 'bare', story: {compile: () => ({hang: 1, draw: c => { c.fillStyle = '#fff'; c.fillRect(0, 0, 1600, 900); }, parts: () => ({segments: {stick: {a: [0, 0], b: [10, 10]}}})})}};
  const idle = await reviewPart(await compileFilm({storyboard, timings, recipe: {story: {kit: 'bare'}}, kits: [bare]}));
  assert.equal(idle.verdicts.find(x => x.check === 'geometry').verdict, 'not run');
  assert.equal(idle.verdicts.find(x => x.check === 'geometry').why, GEOMETRY_VERDICT.rules[0].label);
});

test('a kit whose parts(t) is wrong fails the review, naming the check, the entry and the moment', async () => {
  const wrong = {name: 'wrong', story: {compile: () => ({hang: 1, draw: () => {}, parts: () => ({segments: {arm: {a: [0, 0], b: [1, 1], mount: 'torso'}}})})}};
  await assert.rejects(reviewPart(await compileFilm({storyboard, timings, recipe: {story: {kit: 'wrong'}}, kits: [wrong]}), {from: 0, to: 6}),
    /review: a check failed, so the review is incomplete — "geometry": story at 0\.00 s: segment "arm" is mounted on "torso", which is not among its parts/);
  const junk = {name: 'junk', story: {compile: () => ({hang: 1, draw: () => {}, parts: () => 42})}};
  await assert.rejects(reviewPart(await compileFilm({storyboard, timings, recipe: {story: {kit: 'junk'}}, kits: [junk]}), {from: 0, to: 6}), /"geometry": story: parts\(t\) returns \{segments, regions\?, apart\?\} \(or nothing\), not 42/);
});

test('the cartoon\'s parts are what it draws: the shepherd\'s staff and arms, stroke for stroke', async () => {
  const dir = fileURLToPath(new URL('../examples/shepherd/', import.meta.url)), read = f => JSON.parse(readFileSync(dir + f, 'utf8'));
  const sb = read('storyboard.json'), film = await compileFilm({storyboard: sb, timings: evenTimings(sb, {tail: 3.5}), recipe: read('recipe.json'), kits: [cartoonKit], root: dir});
  // Every straight stroke the frame draws, with its width, in the world's own coordinates (the arguments, before any camera).
  const proto = Object.getPrototypeOf(createCanvas(8, 8).getContext('2d')), {moveTo, lineTo} = proto, strokes = [];
  for (const t of [3, film.clock.at(['morning', 'he dropped a pebble']) + .1]) {
    strokes.length = 0;
    proto.moveTo = function (x, y) { strokes.push({width: this.lineWidth, a: [x, y]}); return moveTo.call(this, x, y); };
    proto.lineTo = function (x, y) { const s = strokes.at(-1); if (s && !s.b) s.b = [x, y]; return lineTo.call(this, x, y); };
    try { film.frame(createCanvas(1600, 900).getContext('2d'), t); } finally { Object.assign(proto, {moveTo, lineTo}); }
    const {segments} = film.partsAt(t)[0], drawn = s => strokes.some(k => k.width === s.width && k.b && k.a.every((v, i) => v === s.a[i]) && k.b.every((v, i) => v === s.b[i]));
    for (const name of ['shepherd staff', 'shepherd arm left', 'shepherd arm right']) assert.ok(drawn(segments[name]), `${name} at ${t.toFixed(2)} s is a stroke the frame draws: ${JSON.stringify(segments[name])}`);
  }
});

test('the cartoon kit gives its parts from the numbers it draws with, and they hold together', async () => {
  const dir = fileURLToPath(new URL('../examples/shepherd/', import.meta.url)), read = f => JSON.parse(readFileSync(dir + f, 'utf8'));
  const sb = read('storyboard.json'), film = await compileFilm({storyboard: sb, timings: evenTimings(sb, {tail: 3.5}), recipe: read('recipe.json'), kits: [cartoonKit], root: dir});
  const [world] = film.partsAt(2);
  assert.equal(world.path, 'story');
  assert.deepEqual(Object.keys(world.segments).slice(0, 5), ['shepherd staff', 'shepherd arm left', 'shepherd hand left', 'shepherd arm right', 'shepherd hand right']);
  assert.equal(world.segments['sheep 1 leg 1'].mount, 'sheep 1 body');
  assert.equal(world.segments['sheep 1 leg 1'].contact, 'b', 'a sheep standing in the pen has its feet planted (the leg\'s foot end)');
  const g = geometryOf(film);
  assert.ok(g.checked.mounts > 1000 && g.checked.pairs > 1000 && g.checked.planted > 1000, JSON.stringify(g.checked));
  assert.deepEqual(g.breaks, [], 'every arm on the robe, the left hand on the staff, every leg on its sheep, no foot sliding while it stands');
});
