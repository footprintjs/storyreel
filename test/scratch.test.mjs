// Scratch folders (scratch.mjs): a render's working files and makeFilm's paced voice are made by makeScratch (mkdtemp:
// host, process and a random suffix; a new folder only this user can open), and a stopped run's are swept by the next
// run on this host — never a live run's, another host's, a folder the caller named, a link or another user's folder.
// And the hygiene script (scripts/temp-hygiene.mjs) cleans up after itself when it is stopped.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, chmodSync, utimesSync, rmSync, renameSync, symlinkSync, lstatSync, statSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tempDir} from './tmp.mjs';
import {makeScratch, scratchHost, sweepScratch, tempScratch, STALE_AFTER} from '../src/scratch.mjs';
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

const posix = process.platform !== 'win32';
const mode = f => statSync(f).mode & 0o777;

test('makeScratch: a new folder named by the host, the process and a random suffix, only this user can open; two never share one', t => {
  const dir = tempDir('make', t), a = makeScratch(dir, '.storyreel-work'), b = makeScratch(dir, '.storyreel-work');
  assert.match(path.basename(a), new RegExp(`^\\.storyreel-work-${escaped(scratchHost)}-${process.pid}-[A-Za-z0-9]{6}$`));
  assert.notEqual(a, b);
  assert.ok(lstatSync(a).isDirectory() && !lstatSync(a).isSymbolicLink());
  if (posix) assert.deepEqual([mode(a), mode(b)], [0o700, 0o700], 'mode 0700: no other user can look in, or write');
});

test('makeScratch never takes a path that is already there: a folder or a link planted at the names a run would once have picked is never written into', t => {
  const dir = tempDir('planted', t), outside = tempDir('outside', t), prefix = `.storyreel-work-${scratchHost}-${process.pid}`;
  // What another user could plant in a shared folder, at the names 0.13's scheme picked next (-1, -2, …): a folder of theirs, and links to one.
  const folder = plant(dir, `${prefix}-1`), links = [2, 3, 4].map(n => { symlinkSync(outside, path.join(dir, `${prefix}-${n}`), 'dir'); return `${prefix}-${n}`; });
  const made = [0, 1, 2, 3].map(() => makeScratch(dir, '.storyreel-work'));
  for (const m of made) {
    assert.ok(![folder, ...links].includes(path.basename(m)), 'a fresh name');
    assert.ok(lstatSync(m).isDirectory() && !lstatSync(m).isSymbolicLink(), 'a real folder, not a link');
    assert.deepEqual(readdirSync(m), [], 'and a new, empty one');
  }
  assert.deepEqual(readdirSync(path.join(dir, folder)), ['film-video.mp4'], 'the planted folder holds only what it held');
  assert.deepEqual(readdirSync(outside), [], 'nothing reached through a planted link');
  for (const l of links) assert.ok(lstatSync(path.join(dir, l)).isSymbolicLink(), 'the links are still links');
});

test('a sweep touches only real folders this user owns: a link named like a dead run\'s scratch stays, and so does its target', t => {
  const tmp = tempDir('link-sweep', t), outside = tempDir('target', t), dead = deadPid();
  writeFileSync(path.join(outside, 'precious.txt'), 'keep');
  const link = `storyreel-scratch-${scratchHost}-${dead}-x`, aged = `storyreel-scratch-elsewhere.example-${dead}-y`;
  symlinkSync(outside, path.join(tmp, link), 'dir'); symlinkSync(outside, path.join(tmp, aged), 'dir');
  age(outside, 3 * STALE_AFTER);
  assert.deepEqual(sweepScratch(tmp, 'storyreel-scratch'), {swept: [], failed: []}, 'ignored, not reported');
  assert.deepEqual(readdirSync(tmp).sort(), [link, aged].sort());
  assert.ok(lstatSync(path.join(tmp, link)).isSymbolicLink());
  assert.equal(readFileSync(path.join(outside, 'precious.txt'), 'utf8'), 'keep', 'the link\'s target is untouched');
});

test('a sweep skips a folder another user owns (lstat says whose), however dead its process or old its files; this user\'s goes', {skip: typeof process.getuid === 'function' ? false : 'no user ids on this platform'}, t => {
  const dir = tempDir('owner', t), dead = deadPid();
  const theirs = plant(dir, `.storyreel-work-${scratchHost}-${dead}-aB3dE9`), mine = plant(dir, `.storyreel-work-${scratchHost}-${dead}-Zx81Qw`);
  const old = plant(dir, '.storyreel-work-12345'); age(path.join(dir, old), 3 * STALE_AFTER);
  // Another user's: the same folders, as lstat would describe them had another uid made them.
  const other = new Set([theirs, old].map(n => path.join(dir, n)));
  const lstat = at => { const st = lstatSync(at); return other.has(at) ? {isDirectory: () => st.isDirectory(), isSymbolicLink: () => st.isSymbolicLink(), uid: process.getuid() + 1} : st; };
  assert.deepEqual(sweepScratch(dir, '.storyreel-work', {lstat}), {swept: [mine], failed: []}, 'theirs ignored (not reported); mine — a random-suffix name — swept');
  assert.deepEqual(readdirSync(dir).sort(), [theirs, old].sort());
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
  // (.storyreel is the picture's cache, kept beside the video by design: picture.mjs.)
  assert.deepEqual(readdirSync(dir).filter(n => n.startsWith('.') && n !== '.storyreel').sort(), [live, elsewhere].sort());
  assert.ok(existsSync(path.join(dir, 'kept', 'film-video.mp4')), 'a folder the caller named is never swept');
});

test('makeFilm sweeps a stopped run\'s voice copy and working files, and its making-of says which', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async t => {
  const dir = tempDir('making', t), dead = deadPid();
  const work = plant(dir, `.storyreel-work-${scratchHost}-${dead}-1`), voice = plant(dir, `.narration-${scratchHost}-${dead}-2`);
  const made = await makeFilm({storyboard, timings, recipe: {story: {kit: 'plain'}}, kits: [kit], out: path.join(dir, 'film.mp4'), render: small});
  assert.deepEqual(JSON.parse(readFileSync(made.makingOf, 'utf8')).swept, {count: 2, names: [voice, work]});
  assert.deepEqual(readdirSync(dir).filter(n => n.startsWith('.') && n !== '.storyreel'), [], 'nothing hidden left but the picture\'s cache');
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

test('placing the voice: the copy gets a plain folder\'s mode before the rename, never after, and never the out folder\'s — in a shared 1777 folder it is not world-writable', {skip: posix ? false : 'no POSIX modes'}, t => {
  const was = process.umask(0o022);
  t.after(() => process.umask(was));
  for (const shared of [true, false]) {
    const dir = tempDir(shared ? 'sticky' : 'plain', t);
    if (shared) chmodSync(dir, 0o1777);   // like /tmp: anyone may add an entry
    const copy = makeScratch(dir, '.narration'), final = path.join(dir, 'narration');
    writeFileSync(path.join(copy, 'timings.json'), '{}');
    assert.equal(mode(copy), 0o700, 'made for this user only');
    assert.equal(placeVoice(copy, final), null);
    assert.equal(statSync(final).mode & 0o7777, 0o755, `${shared ? 'a 1777' : 'a plain'} out folder: 0777 less the umask, no sticky or world-writable bit`);
  }
  // The steps, in order: the chmod is on the copy, before the rename — never on the placed name (a chmod follows links).
  const steps = [], dir = tempDir('order', t), copy = makeScratch(dir, '.narration'), final = path.join(dir, 'narration');
  placeVoice(copy, final, {chmodSync: (p, m) => steps.push(['chmod', p, m]), rmSync: p => steps.push(['rm', p]), renameSync: (a, b) => steps.push(['rename', a, b])});
  assert.deepEqual(steps, [['chmod', copy, 0o755], ['rm', final], ['rename', copy, final]]);
  // And once more after a race: still no chmod after any rename.
  steps.length = 0; let tries = 0;
  placeVoice(copy, final, {chmodSync: (p, m) => steps.push(['chmod', p, m]), rmSync: p => steps.push(['rm', p]), renameSync: (a, b) => { steps.push(['rename', a, b]); if (!tries++) { const e = new Error('exists'); e.code = 'EEXIST'; throw e; } }});
  assert.deepEqual(steps.map(s => s[0]), ['chmod', 'rm', 'rename', 'rm', 'rename']);
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
  assert.match(path.basename(dir), new RegExp(`^storyreel-scratch-${escaped(scratchHost)}-${process.pid}-[A-Za-z0-9]{6}$`));
  if (posix) assert.equal(mode(dir), 0o700);
  assert.deepEqual(readdirSync(tmp).sort(), [live, path.basename(dir)].sort(), 'the killed pass\'s and the day-old one went; the live one stays');
  rmSync(dir, {recursive: true, force: true});
  // The stills pass itself: a killed pass's folder swept, its own removed after.
  const again = plant(tmp, `storyreel-scratch-${scratchHost}-${deadPid()}-2`);
  assert.equal(await eachStill(bin, video, [0, 2], {width: 16, height: 9}, () => {}), 2);
  assert.ok(!existsSync(path.join(tmp, again)));
  assert.deepEqual(readdirSync(tmp), [live], 'nothing of its own left either');
  assert.ok(!readdirSync(tmp).includes(killed));
});
