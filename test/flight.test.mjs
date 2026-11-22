// The focus camera's flights between shots (flight/, attention.mjs): each key a shot, the flight between two shots
// footprint-story's (footprint-story/shot · planCameraMove), drawn by the film; its critics at their own level in the
// check; the same steps run as a chart whose record `log --why --camera focus` answers from.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {planCameraMove, checkCameraMove, project as projectPoint, CAMERA_CRITICS} from 'footprint-story/shot';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {cameraOf, viewOfCamera, planFlights, viewAt, movingOf, WIDE_VIEW, FLIGHT_KEYS, PER_FLIGHT, REEL_FLIGHT_CRITICS} from '../src/flight/steps.mjs';
import {runFlights, flightRunOf} from '../src/flight/run.mjs';
import {FLIGHT_CRITICS, framedView, keyFlightSeconds} from '../src/attention.mjs';
import {readInputs, check, log} from '../src/tools.mjs';
import {listRuns, RUNS} from '../src/runlog.mjs';
import {runCameras, cameraLines} from '../src/check/index.mjs';
import {planPieces} from '../src/segments/plan.mjs';
import {segmentKey} from '../src/segments/material.mjs';
import config from './fixtures/focus-flight/storyreel.config.mjs';
import {tempDir} from './tmp.mjs';

const project = fileURLToPath(new URL('./fixtures/focus-flight/', import.meta.url));
const filmOf = async (flags = {}) => { const {storyboard, recipe, kits} = config.film(flags); return compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .38}), recipe, kits}); };
const ask = (out, why, camera, more = {}) => log({cwd: project, out, run: '1', why, camera, ...more});
const cameraFiles = out => readdirSync(path.join(out, ...RUNS)).filter(n => /\.camera-\d+\.record\.jsonl$/.test(n));
const RED = [500, 300, 700, 450], BLUE = [900, 450, 1140, 610];
const shot = (k, t, on, box, more = {}) => ({path: `focus.keys[${k}]`, t, on: on ? [on] : [], view: on ? framedView([box], 'medium') : {...WIDE_VIEW, box: [...WIDE_VIEW.box]}, do: 'fly', seconds: null, accept: [], things: on ? [{name: on, box}] : [], ...more});

test('a focus view is a camera seen from the front: a point of the picture lands exactly where the view puts it, and back', () => {
  const v = {cx: 600, cy: 375, z: 2.6, sx: 800, sy: 350};
  for (const [x, y] of [[600, 375], [0, 0], [1600, 900], [512, 731]]) {
    const at = projectPoint([x, -y, 0], cameraOf(v), [1600, 900]);
    assert.ok(Math.abs(at.x - (v.sx + (x - v.cx) * v.z)) < 1e-6 && Math.abs(at.y - (v.sy + (y - v.cy) * v.z)) < 1e-6, `(${x}, ${y}) lands at ${at.x}, ${at.y}`);
  }
  const back = viewOfCamera(cameraOf(v));
  for (const k of Object.keys(v)) assert.ok(Math.abs(back[k] - v[k]) < 1e-9, k);
});

test('a flight is footprint-story\'s planned move between the two shots as cameras: its kind, its seconds, its path; both ends exact', () => {
  const flown = planFlights({shots: [shot(0, 1, 'red', RED), shot(1, 9, 'blue', BLUE), shot(2, 15, null)]});
  const asked = planCameraMove({do: 'fly', from: cameraOf(WIDE_VIEW), to: cameraOf(framedView([RED], 'medium')), who: 'focus.keys[0]'});
  assert.deepEqual(flown.flights[0].move, asked, 'the very move footprint-story plans');
  assert.deepEqual(flown.flights.map(f => [f.kind, f.rule]), [['slerp', 'small-turn'], ['slerp', 'small-turn'], ['slerp', 'small-turn']], 'a front view never turns: a slerp of 0°');
  assert.deepEqual(flown['flight-0'], {path: 'focus.keys[0]', at: 1, kind: 'slerp', rule: 'small-turn', seconds: asked.seconds, limitedBy: asked.basis.limitedBy, comfortSeconds: asked.basis.comfortSeconds,
    secondsGiven: false, from: {cx: 800, cy: 450, z: 1}, to: {cx: 600, cy: 375, z: 3}, reason: asked.reason});
  const f = flown.flights[0], to = framedView([RED], 'medium');
  assert.deepEqual(viewAt(flown.flights, .99), WIDE_VIEW, 'the whole frame before the first key');
  for (const k of ['cx', 'cy', 'z', 'sx', 'sy']) assert.ok(Math.abs(viewAt(flown.flights, 1 + f.seconds)[k] - to[k]) < 1e-9, `arrived: ${k}`);
  // half way in time is half way along: minimum jerk is symmetric; the zoom grows by equal ratios (√3 at the middle)
  const mid = viewAt(flown.flights, 1 + f.seconds / 2);
  assert.ok(Math.abs(mid.cx - 700) < 1e-6 && Math.abs(mid.z - Math.sqrt(3)) < 1e-6, JSON.stringify(mid));
  // the veil's box and how focused ride the same progress
  assert.ok(Math.abs(mid.w - .5) < 1e-9 && Math.abs(mid.box[0] - 250) < 1e-6);
  assert.deepEqual(movingOf(flown.flights).map(m => [m.from, +(m.to - m.from).toFixed(2)]), flown.flights.map(x => [x.t, x.seconds]));
  assert.deepEqual(flown.findings, [], 'nothing looks wrong: each subject stays in sight, under the limits');
});

test('a cut is the key\'s own: no path, its view at once; and a key that lands before the flight above it arrives cuts that one short', () => {
  const cut = planFlights({shots: [shot(0, 1, 'red', RED, {do: 'cut'})]});
  assert.deepEqual([cut.flights[0].kind, cut.flights[0].rule, cut.flights[0].seconds, cut.flights[0].move], ['cut', 'asked', 0, null]);
  assert.deepEqual(viewAt(cut.flights, 1).z, 3);
  assert.deepEqual(movingOf(cut.flights).map(m => [m.from, m.to]), [[1, 1]], 'a cut moves the camera for a moment');
  const short = planFlights({shots: [shot(0, 1, 'red', RED), shot(1, 2, 'blue', BLUE)]}), [a, b] = short.flights;
  assert.deepEqual(a.cutShort, {after: 1, by: 'focus.keys[1]'});
  // the next sets off from where the camera is: no jump in where it looks
  const before = viewAt(short.flights, 2 - 1e-9), after = viewAt(short.flights, 2);
  for (const k of ['cx', 'cy', 'z']) assert.ok(Math.abs(before[k] - after[k]) < 1e-4, `${k}: ${before[k]} → ${after[k]}`);
  const from = viewOfCamera(b.move.from), there = viewAt(short.flights, 2);
  for (const k of ['cx', 'cy', 'z']) assert.ok(Math.abs(from[k] - there[k]) < 1e-9, `planned from the view on screen: ${k}`);
  const [warn] = short.findings;
  assert.deepEqual([warn.critic, warn.level, warn.path, warn.from, warn.to], ['reel:cut-short', 'warn', 'focus.keys[0]', 1, 2]);
  assert.equal(warn.fix, `move focus.keys[1] ${+(a.seconds - 1).toFixed(3)} s later, so this one arrives first; or give focus.keys[1] "do": "cut"`);
  const kept = planFlights({shots: [shot(0, 1, 'red', RED, {accept: ['reel:cut-short']}), shot(1, 2, 'blue', BLUE)]});
  assert.equal(kept.findings[0].level, 'accepted', 'a critic the key accepts is kept, marked');
});

test('footprint-story\'s critics reach the flight at their own level, the fix in the recipe\'s words; following it clears them', () => {
  // red to blue in half a second: faster than an eye can follow
  const rushed = planFlights({shots: [shot(0, 1, 'red', RED, {seconds: .5})]}), speed = rushed.findings.find(f => f.critic === 'travel-speed');
  assert.equal(speed.level, 'warn');
  const asked = checkCameraMove(rushed.flights[0].move, {scene: {unit: 'px', things: [{name: 'red', at: [600, -375, 0], size: [200, 150]}]}, frame: [1600, 900], on: ['red']}).findings.find(f => f.critic === 'travel-speed');
  assert.equal(speed.what, asked.message.slice('focus.keys[0]: '.length), 'footprint-story\'s words');
  const [, seconds] = /^slow it: give focus\.keys\[0\] "seconds": ([\d.]+)$/.exec(speed.fix);
  assert.deepEqual(planFlights({shots: [shot(0, 1, 'red', RED, {seconds: +seconds})]}).findings.filter(f => f.critic === 'travel-speed'), [], 'given those seconds, it is under the limit');
  // two close-ups far apart at one zoom: both leave the frame on the way — said, with a fix a flat picture can take
  const close = b => ({...framedView([b], 'close')}), apart = planFlights({shots: [shot(0, 1, 'red', [100, 100, 160, 140], {view: close([100, 100, 160, 140])}), shot(1, 9, 'blue', [1400, 700, 1460, 740], {view: close([1400, 700, 1460, 740])})]});
  const lost = apart.findings.find(f => f.critic === 'in-sight' && f.path === 'focus.keys[1]');
  assert.equal(lost.level, 'warn');
  assert.match(lost.what, /it leaves the frame on the way$/);
  assert.match(lost.fix, /^frame its ends wider: a wider size on focus\.keys\[0\] and focus\.keys\[1\] \("medium"\), or "on": "wide"/);
  assert.doesNotMatch(apart.findings.map(f => f.fix).join(' '), /\b(?:lift|cutPast|by): /, 'never a fix that turns or lifts a flat picture');
  assert.deepEqual(FLIGHT_CRITICS, [...CAMERA_CRITICS, ...REEL_FLIGHT_CRITICS]);
});

test('the film draws the flights: a camera focus flies, records each flight, and hands the check its run', async () => {
  const film = await filmOf(), keys = film.attention.focus.keys;
  assert.deepEqual(keys.map(k => [k.on, k.flight.kind, k.flight.limitedBy]), [['red', 'slerp', 'zoom'], ['blue', 'slerp', 'slide'], ['wide', 'slerp', 'zoom']]);
  assert.ok(keys.every(k => k.flight.reason.startsWith("do: 'fly' → slerp: the look turns 0°")));
  const red = keys[0], z = film.focusAt(red.t + red.flight.seconds).z;
  assert.ok(Math.abs(z - 3) < 1e-9, 'it arrives on its framing');
  assert.equal(film.cameraRuns.length, 1);
  assert.deepEqual([film.cameraRuns[0].name, film.cameraRuns[0].kit, film.cameraRuns[0].findings], ['focus', 'camera', []]);
  assert.equal((await film.cameraRuns[0].run()).differs, null, 'the chart plans what the compile planned');
  assert.equal(film.attentionFrames.focus.feel, undefined, 'a camera focus has no feel: a cached piece is keyed by its flights');
  assert.deepEqual(film.attentionFrames.focus.keys.map(k => k.flight.seconds), keys.map(k => k.flight.seconds));
  // a cut key is there at once
  const cut = await filmOf({cut: 'true'}), blue = cut.attentionFrames.focus.keys[1];
  assert.equal(blue.flight.kind, 'cut');
  assert.ok(Math.abs(cut.focusAt(blue.t).z - blue.z) < 1e-9 && Math.abs(cut.focusAt(blue.t - 1e-6).z - 3) < 1e-9, 'on red until the key, on blue at it');
  // a film whose focus moves no camera hands out no run, and is drawn on its springs as before
  assert.equal((await filmOf({plain: 'true'})).cameraRuns, undefined);
  const {storyboard, kits} = config.film({});
  const lit = await compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .38}), kits, recipe: {story: {kit: 'flat'}, focus: {strategy: 'spotlight', keys: [{at: ['a', 'red square'], on: 'red'}]}}});
  assert.equal(lit.cameraRuns, undefined);
  assert.equal(lit.attention.focus.keys[0].flight, undefined);
});

test('a camera focus refuses what it cannot fly, naming the key and the fix', async () => {
  const {storyboard, kits} = config.film({});
  const make = focus => compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .38}), kits, recipe: {story: {kit: 'flat'}, focus}});
  const key = more => ({strategy: 'camera', keys: [{at: ['a', 'red square'], on: 'red', ...more}]});
  await assert.rejects(make(key({do: 'orbit'})), /focus\.keys\[0\]\.do: "orbit" circles the subject in 3D \(footprint-story\/shot\), and a picture here is drawn flat, seen from the front.*the camera list's "orbit" slides them/);
  await assert.rejects(make(key({do: 'zoom'})), /focus\.keys\[0\]\.do is "fly" or "cut" .* not "zoom"/);
  await assert.rejects(make(key({do: 'cut', seconds: 1})), /focus\.keys\[0\]: a cut takes no time, so it takes no seconds/);
  await assert.rejects(make(key({seconds: 0})), /focus\.keys\[0\]\.seconds is how long the flight to this shot takes, a number from 0\.2 to 60/);
  await assert.rejects(make(key({accept: ['arc']})), /focus\.keys\[0\]\.accept lists the critics this flight keeps as written, each once: in-sight, turn-speed, travel-speed, line-of-action, horizon, reel:cut-short/);
  await assert.rejects(make({...key({}), feel: 'heavy'}), /focus\.feel: the focus "camera" moves the camera, and the camera flies between its keys at the pace footprint-story's camera planner sets .* leave feel out/);
  await assert.rejects(make({strategy: 'dim', keys: [{at: ['a', 'red square'], on: 'red', seconds: 1}]}), /focus\.keys\[0\]\.seconds: the focus "dim" does not move the camera, so no flight reaches its keys/);
});

test('the compile and the chart are one: the same steps, the same result, for keys of every kind', async () => {
  const sets = [[shot(0, 1, 'red', RED)], [shot(0, 1, 'red', RED), shot(1, 2.2, 'blue', BLUE, {do: 'cut'}), shot(2, 3, null)], [shot(0, .5, null, null), shot(1, 4, 'blue', BLUE, {seconds: 2, accept: ['travel-speed']})]];
  for (const shots of sets) {
    const planned = planFlights({shots}), {result} = await runFlights({shots});
    assert.deepEqual(result, JSON.parse(JSON.stringify(planned)));
    assert.equal((await flightRunOf({shots}, planned)()).differs, null);
  }
  assert.deepEqual(FLIGHT_KEYS, ['shots', 'flights', 'findings']);
  assert.deepEqual(PER_FLIGHT, ['flight', 'findings']);
  // a plan that parted from the run's is said, where they first part
  const shots = sets[0], planned = JSON.parse(JSON.stringify(planFlights({shots})));
  planned['flight-0'].seconds = 9;
  assert.match((await flightRunOf({shots}, planned)()).differs, /^flights\.flight-0\.seconds: [\d.]+ here, 9 in the film$/);
});

test('a check runs the flights as a chart, keeps its record, and log --why --camera answers from it', async t => {
  const out = tempDir('flight-why', t);
  const said = await check(await readInputs({cwd: project, out}));
  assert.ok(said.endsWith(`\ncameras: focus — why a flight takes its time: storyreel log --run ${listRuns(out)[0].id} --why flight-0 --camera focus (findings-<k>: what its critics found)`), said.split('\n').at(-1));
  assert.doesNotMatch(said, /drift|not kept|a move that reads wrong/);
  assert.equal(cameraFiles(out).length, 1, 'one record of the flights, beside the run');
  const why = (await ask(out, 'flight-1', 'focus')).split('\n');
  assert.match(why[0], /^flight-1 = \{"path":"focus\.keys\[1\]","at":[\d.]+,"kind":"slerp","rule":"small-turn","seconds":[\d.]+,"limitedBy":"slide",.*"reason":"do: 'fly' → slerp: the look turns 0°/);
  assert.equal(why[1], 'plan (plan#1) [wrote: flights, flight-0, flight-1, flight-2]');
  assert.match(why.join('\n'), /read \(read#0\) ← via shots \[wrote: shots\]/);
  assert.match(await ask(out, 'findings-1', 'focus'), /^findings-1 = \[\]\ncheck \(check#2\)/);
  assert.match(await ask(out, 'nothing', 'focus'), /the flights' steps write shots, flights, findings, and for focus\.keys\[k\] alone flight-<k>, findings-<k>/);
});

test('a critic\'s finding on a flight reaches the check at its own level, and an accepted one is advice', async t => {
  const out = tempDir('flight-finding', t);
  const said = await check(await readInputs({cwd: project, out, short: 'true'}));
  assert.match(said, /^fix \d+ — /);
  assert.match(said, /\nfix  0:0\d\.\d–0:0\d\.\d a · a move that reads wrong: reel:cut-short: focus\.keys\[1\] lands [\d.]+ s into this flight of [\d.]+ s, so the camera stops where it is and sets off again · at focus\.keys\[0\] · fix: move focus\.keys\[1\] [\d.]+ s later, so this one arrives first; or give focus\.keys\[1\] "do": "cut"\n/);
  assert.match(await ask(out, 'findings-0', 'focus', {short: 'true'}), /^findings-0 = \[\{"critic":"reel:cut-short","level":"warn",/);
  const accepted = await check(await readInputs({cwd: project, out: tempDir('flight-accept', t), accept: 'true'}));
  // (the fixture's short film also holds still too long — the slideshow verdict, not the flight's to say)
  assert.doesNotMatch(accepted, /a move that reads wrong/, 'not a finding to fix');
  assert.match(accepted, /\nnote .* a move accepted as written: accepted: reel:cut-short: focus\.keys\[1\] lands/);
});

test('refusals of --camera name what there is', async t => {
  const out = tempDir('flight-refused', t);
  await check(await readInputs({cwd: project, out}));
  await assert.rejects(ask(out, 'flight-0', 'story'), {message: 'run 1 has no flights for "story": what flies its camera is focus'});
  await assert.rejects(log({cwd: project, out, run: '1', camera: 'focus'}), /--camera picks the record --why reads: ask with --why/);
  await assert.rejects(ask(out, 'flight-0', true), /--camera names what flies the camera: --camera focus/);
  await assert.rejects(ask(out, true, 'focus'), /^Error: --why names a value of the flights, one of what their steps write: shots, flights, findings/);
  await assert.rejects(ask(out, 'flight-0', 'focus', {motion: 'story'}), /--map, --motion and --camera each pick the record --why reads: give one of them/);
  // a check kept before 0.47.0 (no cameras in its file) is told apart
  const run = listRuns(out)[0], saved = JSON.parse(readFileSync(run.file, 'utf8')), {cameras: _cameras, ...old} = saved;
  writeFileSync(run.file, JSON.stringify(old));
  await assert.rejects(ask(out, 'flight-0', 'focus'), {message: 'run 1 was kept before 0.47.0, which kept no camera records: run storyreel check again, then ask that run'});
  writeFileSync(run.file, JSON.stringify(saved));
  rmSync(listRuns(out)[0].cameras[0].recordFile);
  await assert.rejects(ask(out, 'flight-0', 'focus'), /run 1's flights for focus kept no record \(it could not be written when the check ran\)/);
  // a film whose focus flies nothing: the run keeps an empty list, and says why
  const plain = tempDir('flight-plain', t);
  await check(await readInputs({cwd: project, out: plain, plain: 'true'}));
  await assert.rejects(log({cwd: project, out: plain, plain: 'true', run: '1', why: 'flight-0', camera: 'focus'}), /run 1 kept no flights: its film's focus does not fly the camera/);
});

test('a camera run is trusted for nothing: one that throws, returns nothing or never settles is said aloud, and the check goes on', async () => {
  const film = await filmOf();
  const {cameras} = await runCameras([{name: 'focus', kit: 'camera', run: async () => { throw new Error('boom'); }}, {name: 'focus', kit: 'camera', run: () => new Promise(() => {})}, film.cameraRuns[0]], {ms: 200});
  assert.deepEqual(cameras.map(c => c.differs ?? null), ["the camera flow failed where the film planned the focus's flights: boom", "the camera flow failed where the film planned the focus's flights: the camera run did not finish within 0.2 s", null]);
  assert.match(cameraLines({cameras, skipped: 0}, {run: 'r1'})[0], /^drift · camera focus: the camera run did not plan the flights the film draws — .*boom/);
  assert.deepEqual(cameraLines({cameras: [], skipped: 0}, {run: 'r1'}), [], 'nothing said when no focus flies');
});

test('the director spaces the focus\'s keys by the flights: none before the flight above it arrives', async () => {
  const {kits} = config.film({});
  const storyboard = {title: 'Two boxes', scenes: [{id: 'a', narration: 'The red box sits here now. The blue box waits there. And that is all of it, the whole page, for now.'}]};
  const f = await compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .5}), kits, recipe: {story: {kit: 'flat'}, director: 'on'}});
  const [red] = f.attention.focus.keys;
  // the blue key comes 2.5 s after red's — past the gap (2 s), before the flight to red has arrived (3.31 s)
  assert.deepEqual(f.attention.focus.keys.map(k => k.on), ['red', 'wide']);
  assert.deepEqual(f.director.dropped.map(d => [d.on, d.why]), [['blue', `the camera is still flying to the insert key on "red" (it arrives at ${(red.t + red.flight.seconds).toFixed(2)} s): one camera move at a time`]]);
  assert.deepEqual(f.cameraRuns[0].findings, [], 'so no flight is cut short');
  // the director's estimate is the film's own plan
  const named = n => ({red: RED, blue: BLUE})[n];
  assert.equal(keyFlightSeconds(null, {on: 'red', size: 'medium', t: 0}, named), planCameraMove({do: 'fly', from: cameraOf(WIDE_VIEW), to: cameraOf(framedView([RED], 'medium'))}).seconds);
  assert.equal(keyFlightSeconds({on: 'red', t: 0}, {on: 'wide'}, named), planCameraMove({do: 'fly', from: cameraOf(framedView([RED], 'medium')), to: cameraOf(WIDE_VIEW)}).seconds);
});

test('a cached piece is keyed by the flights that reach it: a key flown over seconds of its own redraws every piece it moves', async () => {
  const {storyboard, recipe, kits} = config.film({});
  const compiled = r => compileFilm({storyboard, timings: evenTimings(storyboard, {wordSeconds: .38}), recipe: r, kits});
  const slow = structuredClone(recipe);
  slow.focus.keys[0].seconds = 5;
  const [a, b] = [await compiled(recipe), await compiled(slow)];
  const keys = f => planPieces(f, {fps: 10}).map(piece => [piece, segmentKey(f, piece, {recipe: f.recipe, storyboard, pixels: {w: 160, h: 90}, fps: 10})]);
  const [ka, kb] = [keys(a), keys(b)], red = a.attentionFrames.focus.keys[0];
  const moved = new Set(ka.filter(([, k], i) => k !== kb[i][1]).map(([p]) => `${p.from}-${p.to}`));
  const during = ka.map(([p]) => p).filter(p => p.to > red.t && p.from < red.t + 5);
  assert.ok(during.length > 0 && during.every(p => moved.has(`${p.from}-${p.to}`)), 'every piece the slower flight draws is redrawn');
  // (a piece the key reaches as the last one before it is keyed by its flight too: conservative, never a stale piece)
});
