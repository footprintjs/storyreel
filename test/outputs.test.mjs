// What StoryReel leaves in a folder the caller names goes there one way (files.mjs · writeOutput): made under a new
// name, then renamed onto its own. A rename replaces a link already at that name and never follows it, so a link
// another user planted in a shared folder (/tmp: macOS has no protected_symlinks) never makes StoryReel write the file
// it points at. Here: the helper, each place a film, a release, a breakdown, a tool still, a paced voice and the
// segment store write, and a guard that no write in src/ goes around it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, symlinkSync, existsSync, chmodSync, statSync, renameSync, copyFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tempDir} from './tmp.mjs';
import {writeOutput, outputFolder} from '../src/files.mjs';
import {evenTimings, applyPacing} from '../src/index.mjs';
import {makeRelease} from '../src/release.mjs';
import {breakdown} from '../src/breakdown.mjs';
import {loadProject, still} from '../src/tools.mjs';
import {folderStore} from '../src/segments.mjs';
import {fitVoice} from '../src/music.mjs';

const has = cmd => !spawnSync(cmd, ['-version']).error;
const posix = process.platform !== 'win32';

/** Links planted at `names` in `dir`, each to a file of ours elsewhere (or to `missing` names: dangling); returns what to check after. */
function plant(t, dir, names, {missing = []} = {}) {
  const victims = tempDir('victims', t), planted = [];
  for (const name of [...names, ...missing]) {
    const victim = path.join(victims, name.replace(/[\\/]/g, '_')), dangling = missing.includes(name);
    if (!dangling) writeFileSync(victim, `ours: ${name}`);
    mkdirSync(path.dirname(path.join(dir, name)), {recursive: true});
    symlinkSync(victim, path.join(dir, name));
    planted.push({name, at: path.join(dir, name), victim, dangling});
  }
  return planted;
}
/** Each planted link was replaced by a file of StoryReel's, and the file it pointed at is as it was (or still absent). */
function replaced(planted) {
  for (const {name, at, victim, dangling} of planted) {
    const st = lstatSync(at);
    assert.ok(!st.isSymbolicLink() && st.isFile(), `${name}: the link is replaced by a file`);
    if (dangling) assert.ok(!existsSync(victim), `${name}: nothing was made where the dangling link pointed`);
    else assert.equal(readFileSync(victim, 'utf8'), `ours: ${name}`, `${name}: the file the link pointed at is untouched`);
  }
}
/** What is left beside the outputs under writeOutput's temporary names (nothing, after a write). */
const parts = dir => readdirSync(dir).filter(n => n.startsWith('.storyreel-') && n.endsWith('.part'));

test('writeOutput: bytes, a move and a copy (linked or not) each replace a link at the name, never write through it', t => {
  const dir = tempDir('out', t), work = tempDir('work', t);
  const planted = plant(t, dir, ['a.txt', 'b.bin', 'c.mp4', 'd.mp4', 'e.jpg']);
  writeOutput(path.join(dir, 'a.txt'), 'text\n');
  writeOutput(path.join(dir, 'b.bin'), Buffer.from([1, 2, 3]));
  writeFileSync(path.join(work, 'video.mp4'), 'video'); writeOutput(path.join(dir, 'c.mp4'), {move: path.join(work, 'video.mp4')});
  writeFileSync(path.join(work, 'kept.mp4'), 'kept'); writeOutput(path.join(dir, 'd.mp4'), {copy: path.join(work, 'kept.mp4'), link: true});
  writeOutput(path.join(dir, 'e.jpg'), {copy: path.join(work, 'kept.mp4')});
  replaced(planted);
  assert.deepEqual(['a.txt', 'c.mp4', 'd.mp4', 'e.jpg'].map(f => readFileSync(path.join(dir, f), 'utf8')), ['text\n', 'video', 'kept', 'kept']);
  assert.deepEqual([...readFileSync(path.join(dir, 'b.bin'))], [1, 2, 3]);
  assert.ok(!existsSync(path.join(work, 'video.mp4')), 'a move takes the file');
  assert.ok(existsSync(path.join(work, 'kept.mp4')), 'a copy leaves it');
  if (posix) assert.equal(statSync(path.join(dir, 'd.mp4')).ino, statSync(path.join(work, 'kept.mp4')).ino, 'linked: one copy on disk');
  assert.deepEqual(parts(dir), [], 'nothing left under a temporary name');
});

test('writeOutput: a folder at an output\'s name is refused, naming the fix, and kept with all it holds', t => {
  const dir = tempDir('out', t), work = tempDir('work', t), folder = path.join(dir, 'chapters.txt');
  mkdirSync(folder); writeFileSync(path.join(folder, 'theirs'), 'x'); writeFileSync(path.join(work, 'v.mp4'), 'v');
  const why = new RegExp(`${folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is a folder: StoryReel writes a file there, and never removes a folder to make room — move or rename the folder, or give another out`);
  assert.throws(() => writeOutput(folder, 'text'), why);
  assert.throws(() => writeOutput(folder, {move: path.join(work, 'v.mp4')}), why);
  assert.throws(() => writeOutput(folder, {copy: path.join(work, 'v.mp4'), link: true}), why);
  assert.deepEqual(readdirSync(folder), ['theirs']);
  assert.ok(existsSync(path.join(work, 'v.mp4')), 'and what was to be moved stays');
  assert.deepEqual(parts(dir), []);
  assert.throws(() => writeOutput(path.join(dir, 'x'), 42), /writeOutput: give the bytes \(a Buffer or a string\), \{move: file\} or \{copy: file, link\?\}/);
});

test('writeOutput: a move across disks (EXDEV) is copied beside the output under a new name, created exclusively, then renamed; a failure leaves nothing beside it', t => {
  const dir = tempDir('out', t), work = tempDir('work', t), from = path.join(work, 'film-out.mp4'), final = path.join(dir, 'film.mp4');
  const planted = plant(t, dir, ['film.mp4']);
  writeFileSync(from, 'the video');
  const steps = [];
  const fs = {
    renameSync: (a, b) => { steps.push(['rename', path.basename(path.dirname(a)) === path.basename(work) ? 'work' : 'beside', b === final]); if (a === from) { const e = new Error('cross-device link not permitted'); e.code = 'EXDEV'; throw e; } renameSync(a, b); },
    copyFileSync: (a, b, mode) => { steps.push(['copy', path.dirname(b) === dir, mode]); copyFileSync(a, b, mode); },
  };
  writeOutput(final, {move: from}, fs);
  assert.deepEqual(steps, [['rename', 'work', true], ['copy', true, 1], ['rename', 'beside', true]], 'tried as a rename; across disks, copied beside it exclusively (COPYFILE_EXCL), then renamed');
  replaced(planted);
  assert.equal(readFileSync(final, 'utf8'), 'the video');
  assert.ok(!existsSync(from), 'the work folder\'s file is removed after the copy');
  assert.deepEqual(parts(dir), []);
  // Any other error is the caller's to see, and the temporary file goes.
  writeFileSync(from, 'again');
  const denied = {renameSync: (a, b) => { const e = new Error(a === from ? 'cross-device link not permitted' : 'permission denied'); e.code = a === from ? 'EXDEV' : 'EACCES'; throw e; }};
  assert.throws(() => writeOutput(final, {move: from}, denied), /permission denied/);
  assert.deepEqual(parts(dir), [], 'nothing left beside the output');
  assert.equal(readFileSync(final, 'utf8'), 'the video', 'the output as it was');
  assert.throws(() => writeOutput(final, {move: path.join(work, 'gone.mp4')}), /ENOENT/, 'a move of nothing is not quietly a copy');
});

test('outputFolder: makes the folders StoryReel names inside the caller\'s, keeps a real one, refuses a link or a file there', t => {
  const out = tempDir('out', t), elsewhere = tempDir('elsewhere', t);
  assert.equal(outputFolder(path.join(out, 'new'), 'work', 'youtube'), path.join(out, 'new', 'work', 'youtube'));
  writeFileSync(path.join(out, 'new', 'work', 'youtube', 'kept'), 'k');
  outputFolder(path.join(out, 'new'), 'work', 'youtube');
  assert.deepEqual(readdirSync(path.join(out, 'new', 'work', 'youtube')), ['kept'], 'a real folder is kept as it is');
  symlinkSync(elsewhere, path.join(out, 'stills'), 'dir'); writeFileSync(path.join(out, 'shots'), 'a file');
  assert.throws(() => outputFolder(out, 'stills'), /stills is a link: StoryReel writes into a folder of its own there — remove it, or give another out/);
  assert.throws(() => outputFolder(out, 'shots'), /shots is a file: StoryReel writes into a folder of its own there/);
  assert.deepEqual(readdirSync(elsewhere), [], 'nothing written where the link points');
});

// A release: makeFilm's outputs in <out>/work/<target>/ (the video FFmpeg writes, poster.jpg, chapters.txt, the
// captions, making-of.json) and the post in <out>/<target>/ (the video, captions, thumbnail, post.json, post.txt,
// CREDITS.txt), every name with a link planted at it, in a shared out folder (1777).
const storyboard = {title: 'Links', scenes: [{id: 'a', title: 'The start', narration: 'One pebble, two sheep, three.'}]};
const slide = {name: 'slide', story: {compile: () => ({hang: 1, draw: c => { c.fillStyle = '#2a77a8'; c.fillRect(0, 0, 1600, 900); }})}};
const film = {storyboard, timings: evenTimings(storyboard, {wordSeconds: .3}), recipe: {story: {kit: 'slide'}, poster: ['a', 'two sheep']}, kits: [slide], render: {fps: 5}};

test('a release replaces a link planted at every output\'s name — the film\'s and the post\'s — and never writes the file it points at', {skip: has('ffmpeg') ? false : 'needs ffmpeg'}, async t => {
  const out = tempDir('release', t);
  if (posix) chmodSync(out, 0o1777);   // shared, like /tmp: anyone may add an entry
  const made = ['links.mp4', 'poster.jpg', 'chapters.txt', 'captions.srt', 'captions.vtt', 'making-of.json'].map(f => path.join('work', 'youtube', f));
  const posted = ['links.mp4', 'captions.srt', 'captions.vtt', 'thumbnail.jpg', 'post.json', 'post.txt', 'CREDITS.txt'].map(f => path.join('youtube', f));
  const planted = plant(t, out, [...made, ...posted.slice(1)], {missing: [posted[0]]});
  const [yt] = await makeRelease({...film, out, targets: ['youtube'], post: {title: 'Links', description: 'A test.', audience: 'general', thumbnail: 'poster'}});
  replaced(planted);
  assert.equal(yt.video, path.join(out, 'youtube', 'links.mp4'));
  assert.equal(JSON.parse(readFileSync(path.join(out, 'youtube', 'post.json'), 'utf8')).video, 'links.mp4');
  assert.match(readFileSync(path.join(out, 'work', 'youtube', 'chapters.txt'), 'utf8'), /^0:00 The start\n$/);
  assert.deepEqual([...parts(path.join(out, 'youtube')), ...parts(path.join(out, 'work', 'youtube'))], []);
});

test('a release refuses a link planted where it makes a target\'s folder, before anything is drawn', async t => {
  const out = tempDir('release', t), elsewhere = tempDir('elsewhere', t);
  symlinkSync(elsewhere, path.join(out, 'youtube'), 'dir');
  await assert.rejects(makeRelease({...film, out, targets: ['youtube'], post: {title: 'Links', description: 'A test.', audience: 'general'}}), /youtube is a link: StoryReel writes into a folder of its own there — remove it, or give another out/);
  assert.deepEqual(readdirSync(elsewhere), []);
});

test('a breakdown replaces a link planted at each of its files, and refuses a link at its shots folder', {skip: has('ffmpeg') && has('ffprobe') ? false : 'needs ffmpeg and ffprobe'}, async t => {
  const dir = tempDir('breakdown', t), video = path.join(dir, 'v.mp4');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x36:rate=10', '-pix_fmt', 'yuv420p', video], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  const out = path.join(dir, 'out');
  const planted = plant(t, out, ['breakdown.json', 'breakdown.md', 'record.json', 'overview.png', path.join('shots', 'shot-01.png')]);
  const {files} = await breakdown(video, {out});
  replaced(planted);
  assert.deepEqual(files.sheets, [path.join(out, 'shots', 'shot-01.png')]);
  const linked = path.join(dir, 'linked'), elsewhere = tempDir('elsewhere', t);
  mkdirSync(linked); symlinkSync(elsewhere, path.join(linked, 'shots'), 'dir');
  await assert.rejects(breakdown(video, {out: linked}), /shots is a link: StoryReel writes into a folder of its own there/);
  assert.deepEqual(readdirSync(elsewhere), []);
});

test('a tool\'s still replaces a link planted at its name, and refuses a link at the stills folder', async t => {
  const project = fileURLToPath(new URL('./fixtures/tools/', import.meta.url)), out = tempDir('tools', t), p = await loadProject({cwd: project, out});
  const planted = plant(t, out, [path.join('stills', 'one+2.5.png')]);
  assert.equal((await still(p, {at: 'one+2.5'})).file, path.join(out, 'stills', 'one+2.5.png'));
  replaced(planted);
  const linked = tempDir('tools-linked', t), elsewhere = tempDir('elsewhere', t);
  symlinkSync(elsewhere, path.join(linked, 'stills'), 'dir');
  await assert.rejects(still(await loadProject({cwd: project, out: linked}), {at: 'one+2.5'}), /stills is a link: StoryReel writes into a folder of its own there/);
  assert.deepEqual(readdirSync(elsewhere), []);
});

/** A PCM16 mono WAV: a soft tone of `seconds` at 24 kHz (a stand-in for a voice). */
function toneWav(seconds, rate = 24000) {
  const n = Math.round(seconds * rate), body = Buffer.alloc(n * 2), header = Buffer.alloc(44);
  for (let i = 0; i < n; i++) body.writeInt16LE(Math.round(3000 * Math.sin(2 * Math.PI * 220 * i / rate)), i * 2);
  header.write('RIFF', 0, 'ascii'); header.writeUInt32LE(36 + body.length, 4); header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii'); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii'); header.writeUInt32LE(body.length, 40);
  return Buffer.concat([header, body]);
}

test('pacing a voice in place replaces a link at the scene\'s audio and at the unpaced copy beside it, and never writes where they point', async t => {
  const run = tempDir('voice', t), board = {scenes: [{id: 'a', narration: 'One two three.'}]}, timings = evenTimings(board, {tail: .5});
  timings.scenes[0].audio = 'a.wav';
  const victims = tempDir('victims', t), take = path.join(victims, 'take.wav'), tone = toneWav(timings.scenes[0].duration);
  writeFileSync(take, tone); symlinkSync(take, path.join(run, 'a.wav'));                                 // the scene's audio given through a link
  const nowhere = path.join(victims, 'created.wav'); symlinkSync(nowhere, path.join(run, 'a.unpaced.wav'));   // a dangling link where the unpaced copy goes
  await applyPacing({runDir: run, board, timings, pacing: {voiceSpeed: 1, sceneTail: 1, holds: []}});
  for (const f of ['a.wav', 'a.unpaced.wav']) assert.ok(lstatSync(path.join(run, f)).isFile(), `${f} is a file of the run's own`);
  assert.deepEqual(readFileSync(take), tone, 'the take the link pointed at is untouched');
  assert.ok(!existsSync(nowhere), 'nothing made where the dangling link pointed');
  assert.deepEqual(readFileSync(path.join(run, 'a.unpaced.wav')), tone, 'the unpaced audio kept beside the paced one');
  assert.ok(readFileSync(path.join(run, 'a.wav')).length > tone.length, 'the paced audio, with its tail');
});

test('fitting a voice to a song replaces a link at a scene\'s audio, and never writes the take it points at', t => {
  const run = tempDir('fit', t), victims = tempDir('victims', t), take = path.join(victims, 'take.wav'), tone = toneWav(1);
  writeFileSync(take, tone); symlinkSync(take, path.join(run, 'a.wav'));
  const before = {scenes: [{id: 'a', audio: 'a.wav', duration: 1, words: []}]}, after = {scenes: [{id: 'a', audio: 'a.wav', duration: 1.5, words: []}]};
  assert.equal(fitVoice(run, before, after).scenes[0].duration, 1.5);
  assert.ok(lstatSync(path.join(run, 'a.wav')).isFile(), 'a file of the run\'s own');
  assert.equal(readFileSync(path.join(run, 'a.wav')).length, tone.length + 24000, 'padded by half a second at 24 kHz, 16-bit');
  assert.deepEqual(readFileSync(take), tone, 'the take is untouched');
});

test('the segment store replaces a link planted at a segment\'s file or its manifest, and reuses the segment', t => {
  const dir = tempDir('store', t), work = tempDir('work', t), store = folderStore(dir), key = 'k'.repeat(24);
  const planted = plant(t, dir, [`${key}.mp4`, `${key}.json`]);
  writeFileSync(path.join(work, 'segment.mp4'), 'frames');
  store.put(key, path.join(work, 'segment.mp4'), {version: 1});
  replaced(planted);
  const got = store.get(key);
  assert.equal(got.file, path.join(dir, `${key}.mp4`)); assert.equal(got.manifest.bytes, 6);
  assert.deepEqual(parts(dir), []);
});

// The guard: every write in src/ that could land in a folder the caller names goes through writeOutput. A raw write
// (writeFileSync, copyFileSync, linkSync, …, or FFmpeg's -y) is allowed only where it writes into StoryReel's own
// folder; each such line is listed here with where it writes. A new raw write fails this test until it moves to
// writeOutput or is listed with its reason; a line listed and gone fails it too.
const RAW = /\b(writeFileSync|writeFile|appendFileSync|appendFile|copyFileSync|copyFile|linkSync|symlinkSync|createWriteStream|cpSync)\s*\(|'-y'/;
const OWN = [
  ['files.mjs', 'ops.copyFileSync(from, temp, constants.COPYFILE_EXCL)', 'writeOutput: a new random name beside the output, created exclusively'],
  ['files.mjs', 'ops.writeFileSync(temp, what, {flag: \'wx\'})', 'writeOutput: the same'],
  ['files.mjs', 'ops.linkSync(what.copy, temp)', 'writeOutput: the same'],
  ['files.mjs', "writeFileSync(path.join(to, 'timings.json'), bytes, {flag: 'wx'})", 'copyVoice: into the voice copy makeScratch made (0700), exclusively'],
  ['files.mjs', "writeFileSync(target, readFileSync(path.join(base, f)), {flag: 'wx'})", 'copyVoice: the same'],
  ['pipeline.mjs', "writeFileSync(path.join(copy, 'timings.json')", 'the voice copy makeScratch made'],
  ['pipeline.mjs', "if (scope.narration) writeFileSync(path.join(scope.narration, 'timings.json')", 'fit-to-music: the same copy (place-narration, the last stage, makes it narration/)'],
  ['render.mjs', "spawnSync(ffmpeg, ['-y', '-hide_banner'", 'runReporting: the mux, into the work folder (finishRender renames it onto out)'],
  ['render.mjs', "writeFileSync(path.join(dir, 'film-narration.txt')", 'joinVoice: called with the work folder'],
  ['render.mjs', "spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'rawvideo'", 'encodeFrames: a picture in the work folder (wholeVideo, segmentedVideo)'],
  ['render.mjs', "spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args]", 'finishRender: the sound, in the work folder'],
  ['render.mjs', 'writeFileSync(file, createMotionSound(', 'finishRender: the work folder'],
  ['render.mjs', "writeFileSync(path.join(work, 'film-sfx.txt')", 'finishRender: the work folder'],
  ['render.mjs', 'writeFileSync(introWav, intro.wav)', 'finishRender: the work folder'],
  ['render.mjs', "writeFileSync(path.join(work, 'film-audio.txt')", 'finishRender: the work folder'],
  ['segments.mjs', 'writeFileSync(list, files.map(', 'ffmpegJoin: beside its out, the joined picture in the work folder'],
  ['segments.mjs', "spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat'", 'ffmpegJoin: the same'],
  ['stills.mjs', 'writeFileSync(script, filter)', 'the stills pass\'s tempScratch folder'],
];

test('no write in src/ goes around writeOutput: every raw write is one listed as writing into StoryReel\'s own folder', () => {
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  const files = (dir, at = '') => readdirSync(path.join(dir, at), {withFileTypes: true}).flatMap(e => e.isDirectory() ? files(dir, path.join(at, e.name)) : e.name.endsWith('.mjs') ? [path.join(at, e.name)] : []);
  const raw = files(src).flatMap(file => readFileSync(path.join(src, file), 'utf8').split('\n').map((line, i) => ({file, line: i + 1, text: line.trim()})))
    .filter(({text}) => RAW.test(text) && !text.startsWith('//') && !text.startsWith('*'));
  const unlisted = raw.filter(({file, text}) => !OWN.some(([f, has]) => f === file && text.includes(has)));
  assert.deepEqual(unlisted.map(({file, line, text}) => `${file}:${line} ${text.slice(0, 120)}`), [], 'a raw write not listed: write the output through files.mjs · writeOutput, or list it with where it writes');
  const stale = OWN.filter(([f, has]) => !raw.some(({file, text}) => file === f && text.includes(has)));
  assert.deepEqual(stale.map(([f, has]) => `${f}: ${has}`), [], 'a listed write that is gone: remove it from the list');
});
