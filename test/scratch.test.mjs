// Scratch folders (scratch.mjs): a render's working files and makeFilm's paced voice are named by host, process and
// count, and a stopped run's are swept by the next run on this host — never a live run's, another host's, or a folder
// the caller named. And the hygiene script (scripts/temp-hygiene.mjs) cleans up after itself when it is stopped.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tempDir} from './tmp.mjs';
import {scratchName, scratchHost, sweepScratch} from '../src/scratch.mjs';
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
  assert.deepEqual(sweepScratch(dir, '.storyreel-work'), [stale]);
  assert.deepEqual(readdirSync(dir).sort(), [live, elsewhere, named, voice].sort(), 'the live run\'s, the other host\'s (its own next run sweeps it), the named folder and the voice copy stay');
  assert.deepEqual(sweepScratch(dir, '.narration'), [voice], 'a voice copy is swept by its own prefix');
  assert.deepEqual(sweepScratch(path.join(dir, 'missing'), '.storyreel-work'), [], 'no folder, nothing to sweep');
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
