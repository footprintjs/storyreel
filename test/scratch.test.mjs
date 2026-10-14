// Scratch folders (scratch.mjs): a render's working files and makeFilm's paced voice are named by host, process and
// count, and a stopped run's are swept by the next run on this host — never a live run's, another host's, or a folder
// the caller named. And the hygiene script (scripts/temp-hygiene.mjs) cleans up after itself when it is stopped.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, chmodSync, utimesSync, rmSync, renameSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tempDir} from './tmp.mjs';
import {scratchName, scratchHost, sweepScratch, tempScratch, STALE_AFTER} from '../src/scratch.mjs';
import {eachStill} from '../src/stills.mjs';
import {placeVoice} from '../src/files.mjs';
import {compileFilm, evenTimings, renderFilm, makeFilm} from '../src/index.mjs';

const ffmpeg = spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-version']).status === 0;
/** A process id that has ended: a child run to its end. */
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;
/** A scratch folder as a stopped run leaves one: a partial picture inside. */
const plant = (dir, name) => { mkdirSync(path.join(dir, name)); writeFileSync(path.join(dir, name, 'film-video.mp4'), 'partial'); return name; };
const escaped = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const storyboard = {scenes: [{id: 'a', narration: 'One two three four five six.'}]};
const kit = {name: 'plain', story: {compile: () => ({hang: 1, draw: c => { c.fillStyle = '#d6e6c8'; c.fillRect(0, 0, 1600, 900); }})}};
const timings = evenTimings(storyboard, {tail: .5});
const film = () => compileFilm({storyboard, timings, recipe: {story: {kit: 'plain'}}, kits: [kit]});
const small = {width: 160, height: 90, fps: 4};

test('a scratch name holds the host, the process and a count: two in one process never share one', () => {
  const a = scratchName('.storyreel-work'), b = scratchName('.storyreel-work');
  assert.match(a, new RegExp(`^\\.storyreel-work-${escaped(scratchHost)}-${process.pid}-\\d+$`));
  assert.notEqual(a, b);
});

test('a sweep takes what this host\'s dead processes left, and only that: a live run\'s, another host\'s, a named folder stay', t => {
  const dir = tempDir('sweep', t), dead = deadPid();
  const stale = plant(dir, `.storyreel-work-${scratchHost}-${dead}-1`), live = plant(dir, `.storyreel-work-${scratchHost}-${process.pid}-99`);
  const elsewhere = plant(dir, `.storyreel-work-elsewhere.example-${dead}-1`), named = plant(dir, 'work'), voice = plant(dir, `.narration-${scratchHost}-${dead}-2`);
  assert.deepEqual(sweepScratch(dir, '.storyreel-work'), {swept: [stale], failed: []});
  assert.deepEqual(readdirSync(dir).sort(), [live, elsewhere, named, voice].sort(), 'the live run\'s, the other host\'s (its own next run sweeps it), the named folder and the voice copy stay');
  assert.deepEqual(sweepScratch(dir, '.narration'), {swept: [voice], failed: []}, 'a voice copy is swept by its own prefix');
  assert.deepEqual(sweepScratch(path.join(dir, 'missing'), '.storyreel-work'), {swept: [], failed: []}, 'no folder, nothing to sweep');
});

test('a render sweeps the working folders a stopped render left beside it; one given `work` sweeps nothing, and its folder is never swept', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async t => {
  const dir = tempDir('swept', t), dead = deadPid(), f = await film();
  const stale = plant(dir, `.storyreel-work-${scratchHost}-${dead}-1`), live = plant(dir, `.storyreel-work-${scratchHost}-${process.pid}-99`), elsewhere = plant(dir, `.storyreel-work-elsewhere.example-${dead}-7`);
  // Named work: no sweep (the caller chose the place), and the working files kept there.
  await renderFilm({film: f, storyboard, timings, out: path.join(dir, 'named.mp4'), ...small, work: path.join(dir, 'kept')});
  assert.ok(existsSync(path.join(dir, stale)) && existsSync(path.join(dir, 'kept', 'film-video.mp4')), 'a render given `work` sweeps nothing and keeps its working files');
  // Default: the stale folder from this host's dead process goes; the live one's, the other host's and the named one stay.
  await renderFilm({film: f, storyboard, timings, out: path.join(dir, 'film.mp4'), ...small});
  assert.deepEqual(readdirSync(dir).filter(n => n.startsWith('.')).sort(), [live, elsewhere].sort());
  assert.ok(existsSync(path.join(dir, 'kept', 'film-video.mp4')), 'a folder the caller named is never swept');
});

test('makeFilm sweeps a stopped run\'s voice copy and working files, and its making-of says which', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async t => {
  const dir = tempDir('making', t), dead = deadPid();
  const work = plant(dir, `.storyreel-work-${scratchHost}-${dead}-1`), voice = plant(dir, `.narration-${scratchHost}-${dead}-2`);
  const made = await makeFilm({storyboard, timings, recipe: {story: {kit: 'plain'}}, kits: [kit], out: path.join(dir, 'film.mp4'), render: small});
  assert.deepEqual(JSON.parse(readFileSync(made.makingOf, 'utf8')).swept, {count: 2, names: [voice, work]});
  assert.deepEqual(readdirSync(dir).filter(n => n.startsWith('.')), [], 'nothing hidden left');
  const again = await makeFilm({storyboard, timings, recipe: {story: {kit: 'plain'}}, kits: [kit], out: path.join(dir, 'film.mp4'), render: small});
  assert.equal(JSON.parse(readFileSync(again.makingOf, 'utf8')).swept, undefined, 'nothing swept: no `swept` in the record');
});

test('the hygiene script, stopped (SIGINT or SIGTERM), stops its suite, removes its own folder and exits with the signal\'s code', async t => {
  const script = fileURLToPath(new URL('../scripts/temp-hygiene.mjs', import.meta.url)), slow = tempDir('slow', t), tmp = tempDir('hygiene-tmp', t);
  writeFileSync(path.join(slow, 'slow.test.mjs'), "import test from 'node:test'; test('waits', () => new Promise(r => setTimeout(r, 30000)));\n");
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const run = spawn(process.execPath, [script, path.join(slow, 'slow.test.mjs')], {env: {...process.env, TMPDIR: tmp}, stdio: 'ignore'});
    let closed = null;
    const ended = new Promise(r => run.once('close', (status, sig) => { closed = {status, sig}; r(closed); }));
    const started = Date.now();
    while (!closed && !readdirSync(tmp).some(n => n.startsWith('storyreel-hygiene-')) && Date.now() - started < 10000) await new Promise(r => setTimeout(r, 50));
    await new Promise(r => setTimeout(r, 500));   // the suite has started
    assert.equal(closed, null, `${signal}: the script is still running its suite when it is stopped`);
    run.kill(signal);
    assert.deepEqual(await ended, {status: code, sig: null}, `${signal}: exits ${code}`);
    assert.deepEqual(readdirSync(tmp), [], `${signal}: its own folder is gone`);
  }
});

/** Set a folder and everything in it to have been last written `ms` ago. */
function age(dir, ms) {
  const when = new Date(Date.now() - ms);
  for (const name of readdirSync(dir)) utimesSync(path.join(dir, name), when, when);
  utimesSync(dir, when, when);
}

test('a folder untouched for more than a day is swept whatever its name says — an old name, another host, a reused pid; a fresh one from another host, or one still being written, stays', t => {
  const dir = tempDir('aged', t), day = STALE_AFTER;
  const oldFormat = plant(dir, '.narration-12345');                                         // 0.12's name: no host
  const renamedHost = plant(dir, `.narration-old-laptop-name.local-${process.pid}-4`);      // a host renamed since (and a pid now reused)
  const freshForeign = plant(dir, `.narration-elsewhere.example-${deadPid()}-1`);
  const writing = plant(dir, `.narration-elsewhere.example-${process.pid}-5`);
  age(path.join(dir, oldFormat), day + 3600e3); age(path.join(dir, renamedHost), day + 60e3);
  age(path.join(dir, writing), day + 3600e3); utimesSync(path.join(dir, writing, 'film-video.mp4'), new Date(), new Date());   // its folder is old; a file in it was written just now
  assert.deepEqual(sweepScratch(dir, '.narration'), {swept: [oldFormat, renamedHost].sort(), failed: []});
  assert.deepEqual(readdirSync(dir).sort(), [freshForeign, writing].sort(), 'a fresh folder from another host, and one still being written, stay');
});

test('cleaning up never fails a run: a left folder that cannot be removed is skipped, and the making-of says so', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async t => {
  const dir = tempDir('stuck', t), dead = deadPid();
  // A stopped run's folder holding a read-only folder with a file in it: removing it fails (EACCES, or ENOTEMPTY).
  const stuck = plant(dir, `.storyreel-work-${scratchHost}-${dead}-1`), locked = path.join(dir, stuck, 'locked');
  mkdirSync(locked); writeFileSync(path.join(locked, 'part.wav'), 'x'); chmodSync(locked, 0o555);   // tempDir makes it writable again to remove it
  const result = sweepScratch(dir, '.storyreel-work');
  assert.deepEqual(result.swept, []); assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].name, stuck); assert.match(result.failed[0].why, /^(EACCES|ENOTEMPTY|EPERM)$/);
  const made = await makeFilm({storyboard, timings, recipe: {story: {kit: 'plain'}}, kits: [kit], out: path.join(dir, 'film.mp4'), render: small});
  assert.ok(existsSync(made.out), 'the film is made all the same');
  const swept = JSON.parse(readFileSync(made.makingOf, 'utf8')).swept;
  assert.deepEqual({count: swept.count, names: swept.names, failed: swept.failed.map(f => f.name)}, {count: 0, names: [], failed: [stuck]}, 'and the record says what could not be removed');
});

test('placing the voice: another film slipping its folder in between is tried once more, and said; any other error is not', t => {
  const dir = tempDir('place', t), copy = path.join(dir, '.narration-copy'), final = path.join(dir, 'narration');
  mkdirSync(copy); writeFileSync(path.join(copy, 'timings.json'), '{}');
  let tries = 0;
  const race = {rmSync, renameSync: (a, b) => { if (!tries++) { mkdirSync(path.join(b, 'theirs'), {recursive: true}); const e = new Error('directory not empty'); e.code = 'ENOTEMPTY'; throw e; } renameSync(a, b); }};
  assert.equal(placeVoice(copy, final, race), 'ENOTEMPTY', 'tried once more, and the code it tried again on is returned');
  assert.deepEqual(readdirSync(final), ['timings.json'], 'the voice is in place, the other film\'s folder gone');
  mkdirSync(copy); writeFileSync(path.join(copy, 'timings.json'), '{}');
  assert.equal(placeVoice(copy, final), null, 'no race: placed at once');
  mkdirSync(copy);
  const denied = {rmSync, renameSync: () => { const e = new Error('permission denied'); e.code = 'EACCES'; throw e; }};
  assert.throws(() => placeVoice(copy, final, denied), /permission denied/, 'any other error stops the film, as before');
});

test('this host\'s live run is never swept by age: a voiced makeFilm that renders for days keeps its voice copy', t => {
  const dir = tempDir('quiet', t), quiet = plant(dir, `.narration-${scratchHost}-${process.pid}-1`);
  age(path.join(dir, quiet), 3 * STALE_AFTER);   // last written 3 days ago, by a process still running (this one)
  assert.deepEqual(sweepScratch(dir, '.narration'), {swept: [], failed: []});
  assert.deepEqual(readdirSync(dir), [quiet], 'kept');
});

test('a pass that needs the system temp folder (stills, a breakdown\'s sound) names its folder like the others and sweeps what killed passes left first', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async t => {
  const video = path.join(tempDir('stills-video', t), 'v.mp4'), bin = process.env.FFMPEG_BIN || 'ffmpeg';
  assert.equal(spawnSync(bin, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=0.4:size=64x36:rate=10', '-pix_fmt', 'yuv420p', video]).status, 0);
  // A private system temp folder for this test (os.tmpdir reads TMPDIR each time).
  const tmp = tempDir('system-tmp', t), was = process.env.TMPDIR;
  process.env.TMPDIR = tmp;
  t.after(() => { if (was === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = was; });
  const killed = plant(tmp, `storyreel-scratch-${scratchHost}-${deadPid()}-1`), aged = plant(tmp, 'storyreel-scratch-elsewhere.example-41-1');
  age(path.join(tmp, aged), STALE_AFTER + 60e3);
  const live = plant(tmp, `storyreel-scratch-${scratchHost}-${process.pid}-999`);
  const dir = tempScratch();
  assert.match(path.basename(dir), new RegExp(`^storyreel-scratch-${escaped(scratchHost)}-${process.pid}-\\d+$`));
  assert.deepEqual(readdirSync(tmp).sort(), [live, path.basename(dir)].sort(), 'the killed pass\'s and the day-old one went; the live one stays');
  rmSync(dir, {recursive: true, force: true});
  // The stills pass itself: a killed pass's folder swept, its own removed after.
  const again = plant(tmp, `storyreel-scratch-${scratchHost}-${deadPid()}-2`);
  assert.equal(await eachStill(bin, video, [0, 2], {width: 16, height: 9}, () => {}), 2);
  assert.ok(!existsSync(path.join(tmp, again)));
  assert.deepEqual(readdirSync(tmp), [live], 'nothing of its own left either');
  assert.ok(!readdirSync(tmp).includes(killed));
});
