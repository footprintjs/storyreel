// What StoryReel leaves in a folder the caller names goes there one way (files.mjs · writeOutput): made under a new
// name, then renamed onto its own. A rename replaces a link already at that name and never follows it, so a link
// another user planted in a shared folder (/tmp: macOS has no protected_symlinks) never makes StoryReel write the file
// it points at. Here: the helper, each place a film, a release, a breakdown, a tool still, a paced voice and the
// segment store write, and a guard that no write in src/ goes around it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, symlinkSync, existsSync, chmodSync, statSync, renameSync, copyFileSync, realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tempDir} from './tmp.mjs';
import {writeOutput, outputFolder, refuseFolders, refuseShared, makeFolder, placeVoice, copyVoice} from '../src/files.mjs';
import {evenTimings, applyPacing, compileFilm, renderFilm, makeFilm} from '../src/index.mjs';
import {makeRelease} from '../src/release.mjs';
import {breakdown} from '../src/breakdown.mjs';
import {loadProject, still} from '../src/tools.mjs';
import {folderStore} from '../src/segments.mjs';
import {fitVoice} from '../src/music.mjs';
import {makeScratch} from '../src/scratch.mjs';

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

test('outputFolder: makes the folders StoryReel names inside the caller\'s (never writable by others), keeps a real one of ours, refuses a link or a file there', t => {
  const out = tempDir('out', t), elsewhere = tempDir('elsewhere', t);
  const was = process.umask(0o002);   // a umask that leaves folders group-writable: what StoryReel makes is 0755 all the same
  t.after(() => process.umask(was));
  assert.equal(outputFolder(path.join(out, 'new'), ['work', 'youtube']), path.join(out, 'new', 'work', 'youtube'));
  if (posix) assert.deepEqual(['work', path.join('work', 'youtube')].map(f => statSync(path.join(out, 'new', f)).mode & 0o7777), [0o755, 0o755]);
  writeFileSync(path.join(out, 'new', 'work', 'youtube', 'kept'), 'k');
  outputFolder(path.join(out, 'new'), ['work', 'youtube']);
  assert.deepEqual(readdirSync(path.join(out, 'new', 'work', 'youtube')), ['kept'], 'a real folder of ours is kept as it is');
  symlinkSync(elsewhere, path.join(out, 'stills'), 'dir'); writeFileSync(path.join(out, 'shots'), 'a file');
  assert.throws(() => outputFolder(out, 'stills'), /stills is a link: StoryReel writes only into a folder of its own there, that no one else can change — remove it, or give another out/);
  assert.throws(() => outputFolder(out, 'shots'), /shots is a file: StoryReel writes only into a folder of its own there/);
  assert.deepEqual(readdirSync(elsewhere), [], 'nothing written where the link points');
});

test('outputFolder: an existing folder another user owns, or one of ours that others can change (0777), is refused; a sticky 1777 one of ours is not', {skip: posix ? false : 'no POSIX owners or modes'}, t => {
  const out = tempDir('shared', t);
  // Another user made <out>/work (as in a shared /tmp): lstat says whose — played here by a stubbed lstat.
  mkdirSync(path.join(out, 'work'));
  const theirs = at => { const st = lstatSync(at); return at === path.join(out, 'work') ? {isDirectory: () => true, isSymbolicLink: () => false, uid: process.getuid() + 1, mode: st.mode} : st; };
  assert.throws(() => outputFolder(out, ['work', 'youtube'], {lstat: theirs}), /work belongs to another user: StoryReel writes only into a folder of its own there, that no one else can change — remove it, or give another out/);
  assert.ok(!existsSync(path.join(out, 'work', 'youtube')), 'nothing made inside it');
  chmodSync(path.join(out, 'work'), 0o777);
  assert.throws(() => outputFolder(out, ['work', 'youtube']), /work can be changed by other users \(mode 0777, no sticky bit\): StoryReel writes only into a folder of its own there/);
  chmodSync(path.join(out, 'work'), 0o1777);
  assert.equal(outputFolder(out, ['work', 'youtube']), path.join(out, 'work', 'youtube'), 'sticky: others may add an entry, never replace one of ours');
});

test('refuseShared: an out folder another user could rearrange is refused — 0777, 0775, another user\'s, or one inside a 0777 folder; a private one or a sticky 1777 one is not', {skip: posix ? false : 'no POSIX owners or modes'}, t => {
  const shared = (mode, ...below) => { const dir = tempDir('shared', t); chmodSync(dir, mode); return path.join(dir, ...below); };
  const why = mode => new RegExp(`can be changed by other users \\(mode ${mode}, no sticky bit\\): another user could swap what StoryReel writes there for a link to a file of yours — render into a folder of your own and copy the film out, or give the shared folder the sticky bit \\(chmod \\+t `);
  assert.throws(() => refuseShared(shared(0o777)), why('0777'));
  assert.throws(() => refuseShared(shared(0o775)), why('0775'), 'a team folder, writable by its group');
  const inOpen = shared(0o777, 'mine'); mkdirSync(inOpen); chmodSync(inOpen, 0o755);
  assert.throws(() => refuseShared(inOpen), why('0777'), 'a private out inside a 0777 folder: the out itself can be swapped');
  assert.throws(() => refuseShared(shared(0o777, 'not', 'there', 'yet')), why('0777'), 'an out still to be made, under a 0777 folder');
  const theirs = tempDir('theirs', t), foreign = at => { const st = lstatSync(at); return at === realpathSync(theirs) ? {...st, mode: st.mode, uid: process.getuid() + 1, isDirectory: () => true, isSymbolicLink: () => false} : st; };
  assert.throws(() => refuseShared(theirs, {lstat: foreign}), /belongs to another user \(and has no sticky bit\): another user could swap/);
  refuseShared(shared(0o1777));                       // sticky, like /tmp: at worst a write fails
  const inSticky = shared(0o1777, 'mine'); mkdirSync(inSticky); refuseShared(inSticky);
  refuseShared(shared(0o755)); refuseShared(shared(0o700)); refuseShared(shared(0o755, 'missing', 'film'));
});

test('every entry that writes into a folder the caller names refuses a shared, non-sticky one before anything is written', {skip: posix ? false : 'no POSIX modes'}, async t => {
  const open = tempDir('open', t); chmodSync(open, 0o777);
  const refused = /can be changed by other users \(mode 0777, no sticky bit\)/, at = (...p) => path.join(open, ...p);
  const compiled = await compileFilm({...film, render: undefined});
  await assert.rejects(renderFilm({film: compiled, storyboard, timings: film.timings, out: at('film.mp4'), width: 160, height: 90, fps: 5}), refused);
  await assert.rejects(renderFilm({film: compiled, storyboard, timings: film.timings, out: path.join(tempDir('private', t), 'film.mp4'), work: at('work'), width: 160, height: 90, fps: 5}), refused, 'a `work` named in a shared folder');
  await assert.rejects(makeFilm({...film, out: at('made', 'film.mp4')}), refused);
  await assert.rejects(makeRelease({...film, out: at('release'), targets: ['youtube'], post: {title: 'Links', description: 'A test.', audience: 'general'}}), refused);
  writeFileSync(at('v.mp4'), 'never read');
  await assert.rejects(breakdown(at('v.mp4'), {out: at('breakdown')}), refused);
  const project = fileURLToPath(new URL('./fixtures/tools/', import.meta.url));
  await assert.rejects(still(await loadProject({cwd: project, out: at('tools')}), {at: 'one+2.5'}), refused);
  assert.throws(() => folderStore(at('store')), refused);
  await assert.rejects(applyPacing({runDir: open, board: {scenes: []}, timings: {scenes: []}, pacing: {voiceSpeed: 1, sceneTail: 1, holds: []}}), refused);
  assert.throws(() => fitVoice(open, {scenes: []}, {scenes: []}), refused);
  assert.deepEqual(readdirSync(open), ['v.mp4'], 'nothing written there');
});

test('every folder StoryReel makes is 0755, whatever the umask — even 000 — and so is the placed narration/', {skip: posix ? false : 'no POSIX modes'}, async t => {
  const was = process.umask(0o000);
  t.after(() => process.umask(was));
  const mode = f => statSync(f).mode & 0o7777, top = tempDir('umask', t);
  makeFolder(path.join(top, 'a', 'b', 'c'));
  assert.deepEqual(['a', 'a/b', 'a/b/c'].map(f => mode(path.join(top, f))), [0o755, 0o755, 0o755]);
  outputFolder(path.join(top, 'out'), ['work', 'youtube']);
  assert.deepEqual(['out', 'out/work', 'out/work/youtube'].map(f => mode(path.join(top, f))), [0o755, 0o755, 0o755]);
  // makeFilm's out folder, made before its first stage (which refuses this storyboard).
  await assert.rejects(makeFilm({...film, storyboard: {title: 'x', scenes: []}, out: path.join(top, 'made', 'deep', 'film.mp4')}), /no scenes/);
  assert.deepEqual(['made', 'made/deep'].map(f => mode(path.join(top, f))), [0o755, 0o755]);
  // The voice copy's folders, and narration/ once placed.
  const voice = path.join(top, 'voice'); makeFolder(path.join(voice, 'audio'));
  writeFileSync(path.join(voice, 'timings.json'), JSON.stringify({scenes: [{id: 'a', audio: 'audio/a.wav'}]})); writeFileSync(path.join(voice, 'audio', 'a.wav'), 'A');
  const copy = makeScratch(top, '.narration');
  copyVoice(voice, copy);
  assert.equal(mode(path.join(copy, 'audio')), 0o755);
  placeVoice(copy, path.join(top, 'narration'));
  assert.equal(mode(path.join(top, 'narration')), 0o755, '0755 at most, never 0777');
});

test('refuseFolders: a folder at any of the names refuses before anything is written; the others are fine missing or as files', t => {
  const out = tempDir('names', t);
  mkdirSync(path.join(out, 'chapters.txt')); writeFileSync(path.join(out, 'film.mp4'), 'old');
  refuseFolders([path.join(out, 'film.mp4'), path.join(out, 'poster.jpg')]);
  assert.throws(() => refuseFolders([path.join(out, 'film.mp4'), path.join(out, 'chapters.txt')]), /chapters\.txt is a folder: StoryReel writes a file there, and never removes a folder to make room/);
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
  await assert.rejects(makeRelease({...film, out, targets: ['youtube'], post: {title: 'Links', description: 'A test.', audience: 'general'}}), /youtube is a link: StoryReel writes only into a folder of its own there, that no one else can change — remove it, or give another out/);
  assert.deepEqual(readdirSync(elsewhere), []);
});

test('a folder at any output\'s name refuses before anything is drawn or written: a render, a film, a release, a breakdown', async t => {
  const visible = dir => readdirSync(dir).sort();
  // A render: the folder at chapters.txt is found while the job is prepared, before film.mp4 or poster.jpg exist.
  const dir = tempDir('early', t), compiled = await compileFilm({...film, render: undefined});
  mkdirSync(path.join(dir, 'chapters.txt'));
  await assert.rejects(renderFilm({film: compiled, storyboard, timings: film.timings, out: path.join(dir, 'film.mp4'), width: 160, height: 90, fps: 5}), /chapters\.txt is a folder: StoryReel writes a file there, and never removes a folder to make room — move or rename the folder, or give another out/);
  assert.deepEqual(visible(dir), ['chapters.txt'], 'no video, no poster, no working folder');
  // A film: its record is written last, so it is checked first.
  const made = tempDir('early-film', t); mkdirSync(path.join(made, 'making-of.json'));
  await assert.rejects(makeFilm({...film, out: path.join(made, 'film.mp4'), render: {width: 160, height: 90, fps: 5}}), /making-of\.json is a folder/);
  assert.deepEqual(visible(made), ['making-of.json']);
  // A release: every target's names, before the first target renders.
  const out = tempDir('early-release', t); mkdirSync(path.join(out, 'youtube', 'post.json'), {recursive: true});
  await assert.rejects(makeRelease({...film, out, targets: ['youtube'], post: {title: 'Links', description: 'A test.', audience: 'general'}}), /youtube\/post\.json is a folder/);
  assert.deepEqual(readdirSync(path.join(out, 'work', 'youtube')), [], 'nothing rendered');
  // A breakdown: its files' names, before a frame is read (the video need not even be read).
  const broken = tempDir('early-breakdown', t), video = path.join(broken, 'v.mp4'); writeFileSync(video, 'not read'); mkdirSync(path.join(broken, 'out', 'breakdown.md'), {recursive: true});
  await assert.rejects(breakdown(video, {out: path.join(broken, 'out')}), /breakdown\.md is a folder/);
  assert.deepEqual(visible(path.join(broken, 'out')), ['breakdown.md']);
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
  await assert.rejects(breakdown(video, {out: linked}), /shots is a link: StoryReel writes only into a folder of its own there/);
  assert.deepEqual(readdirSync(elsewhere), []);
});

test('a tool\'s still replaces a link planted at its name, and refuses a link at the stills folder', async t => {
  const project = fileURLToPath(new URL('./fixtures/tools/', import.meta.url)), out = tempDir('tools', t), p = await loadProject({cwd: project, out});
  const planted = plant(t, out, [path.join('stills', 'one+2.5.png')]);
  assert.equal((await still(p, {at: 'one+2.5'})).file, path.join(out, 'stills', 'one+2.5.png'));
  replaced(planted);
  const linked = tempDir('tools-linked', t), elsewhere = tempDir('elsewhere', t);
  symlinkSync(elsewhere, path.join(linked, 'stills'), 'dir');
  await assert.rejects(still(await loadProject({cwd: project, out: linked}), {at: 'one+2.5'}), /stills is a link: StoryReel writes only into a folder of its own there/);
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

// The guard. A source file in src/ may write a file only through files.mjs · writeOutput, except where it writes into
// StoryReel's own folder, each such place listed here with where it writes:
//   - by import: only the files in IMPORTS may import an fs function that writes or changes a file (write, open, append,
//     truncate, copy, rename, link, chmod, chown, utimes, a write stream, fs.promises), each by name; fs or
//     child_process taken whole (a default or namespace import, {default as x}, a re-export), loaded at run time (a
//     dynamic import, require, createRequire()(…), any call given the module's name) or reached through
//     process.getBuiltinModule is refused anywhere;
//   - by call: every call of such a function, under whatever local name it was imported as, is one listed in OWN;
//   - by program: every program StoryReel runs (spawn, spawnSync, spawned, exec…, fork — by their local names) is one
//     listed in RUNS, with what it is and where its output goes; and every flag that makes FFmpeg or ffprobe write a
//     file (-y, -report, -progress, -vstats, -vstats_file, -passlogfile, -dump_attachment, -sdp_file, -o, FFREPORT),
//     wherever it is written in src/, is on a line listed in OWN.
// A new write fails until it goes through writeOutput or is listed with its reason; a listed one that is gone fails too.
const WRITERS = ['writeFileSync', 'writeFile', 'openSync', 'open', 'writeSync', 'write', 'writevSync', 'writev', 'appendFileSync', 'appendFile',
  'truncateSync', 'truncate', 'ftruncateSync', 'ftruncate', 'copyFileSync', 'copyFile', 'cpSync', 'cp', 'renameSync', 'rename', 'linkSync', 'link',
  'symlinkSync', 'symlink', 'chmodSync', 'chmod', 'chownSync', 'chown', 'utimesSync', 'utimes', 'createWriteStream', 'promises'];
const RUNNERS = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'];
const FLAGS = ['-y', '-report', '-progress', '-vstats', '-vstats_file', '-passlogfile', '-dump_attachment', '-sdp_file', '-o'];
const IMPORTS = {
  'files.mjs': ['writeFileSync', 'renameSync', 'chmodSync', 'copyFileSync', 'linkSync'],   // the owner: writeOutput, makeFolder, copyVoice, placeVoice
  'pipeline.mjs': ['writeFileSync'], 'render.mjs': ['writeFileSync'], 'segments.mjs': ['writeFileSync'], 'stills.mjs': ['writeFileSync'],
};
const OWN = [
  ['files.mjs', 'ops.copyFileSync(from, temp, constants.COPYFILE_EXCL)', 'writeOutput: a new random name beside the output, created exclusively'],
  ['files.mjs', 'ops.writeFileSync(temp, what, {flag: \'wx\'})', 'writeOutput: the same'],
  ['files.mjs', 'ops.linkSync(what.copy, temp)', 'writeOutput: the same'],
  ['files.mjs', 'try { make(temp); ops.renameSync(temp, final); }', 'writeOutput: that name renamed onto the output (a rename replaces a link, never follows it)'],
  ['files.mjs', 'try { ops.renameSync(what.move, final); }', 'writeOutput: a move, renamed the same way'],
  ['files.mjs', 'chmodSync(at, FOLDER_MODE);', 'makeFolder: a folder it has just made, set to 0755'],
  ['files.mjs', 'try { mkdirSync(at, {mode: FOLDER_MODE}); chmodSync(at, FOLDER_MODE); }', 'outputFolder: the same'],
  ['files.mjs', "writeFileSync(path.join(to, 'timings.json'), bytes, {flag: 'wx'})", 'copyVoice: into the voice copy makeScratch made (0700), exclusively'],
  ['files.mjs', "writeFileSync(target, readFileSync(path.join(base, f)), {flag: 'wx'})", 'copyVoice: the same'],
  ['files.mjs', 'ops.chmodSync(copy, plainFolderMode())', 'placeVoice: the voice copy, before it is renamed'],
  ['files.mjs', 'ops.renameSync(copy, final)', 'placeVoice: the copy renamed onto narration/'],
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
const RUNS = [
  ['mcp.mjs', 'spawn(process.execPath, [CLI, name, ...flags]', 'Node running StoryReel\'s own CLI (src/, held to this guard)'],
  ['spawned.mjs', 'const child = spawn(command, args, options);', 'the wrapper: its callers are listed below'],
  ['beats.mjs', 'spawnSync(ffmpeg, decodeArgs(file, rate)', 'FFmpeg decoding to a pipe'],
  ['beats.mjs', 'spawnSync(ffprobeBeside(ffmpeg), [', 'ffprobe, to stdout'],
  ['beats.mjs', 'spawned(ffmpeg, decodeArgs(file, rate)', 'FFmpeg decoding to a pipe'],
  ['stills.mjs', "spawnSync(ffmpeg, ['-version']", 'FFmpeg\'s version'],
  ['stills.mjs', 'spawned(ffmpeg, args, {stdio:', 'FFmpeg reading stills to a pipe (stills.mjs · stillsArgs)'],
  ['render.mjs', "spawnSync(ffmpeg, ['-y', '-hide_banner'", 'FFmpeg: the mux, into the work folder'],
  ['render.mjs', "spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-i', wav, '-filter_complex', 'ebur128", 'FFmpeg measuring, to null'],
  ['render.mjs', "spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'rawvideo'", 'FFmpeg encoding into the work folder'],
  ['render.mjs', "spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args]", 'FFmpeg: the sound, in the work folder'],
  ['render.mjs', "spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-i', file]", 'FFmpeg reading a song\'s length, no output'],
  ['finished.mjs', 'spawnSync(cmd, args, {encoding:', 'ffprobe / FFmpeg reading a file, to stdout'],
  ['finished.mjs', "spawned(ffmpeg, ['-v', 'error', '-i', file, '-vf', vf, '-f', 'rawvideo', 'pipe:1']", 'FFmpeg frames to a pipe'],
  ['finished.mjs', "spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-vn', '-ac', '1'", 'FFmpeg sound to a pipe'],
  ['finished.mjs', "spawned(ffmpeg, ['-hide_banner', '-nostats', '-v', 'info', '-reinit_filter'", 'FFmpeg frames to a pipe'],
  ['segments.mjs', "spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat'", 'FFmpeg joining into the work folder'],
];
const MODULE = String.raw`(?:node:)?(?:fs(?:/promises)?|child_process)`, QUOTED = String.raw`[\x60'"]${MODULE}[\x60'"]`;
const isFs = spec => /^(?:node:)?fs(?:\/promises)?$/.test(spec), isCp = spec => /^(?:node:)?child_process$/.test(spec);
/** What a source file takes from fs and child_process: each name and its local name, and every way it takes a module whole or late. */
function moduleUse(code) {
  const named = [], whole = [];
  for (const m of code.matchAll(new RegExp(String.raw`import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]`, 'g'))) {
    if (!isFs(m[2]) && !isCp(m[2])) continue;
    for (const part of m[1].split(',').map(p => p.trim()).filter(Boolean)) {
      const [name, local = name] = part.split(/\s+as\s+/).map(x => x.trim());
      if (name === 'default') whole.push(`{default as ${local}} from '${m[2]}'`); else named.push({module: isFs(m[2]) ? 'fs' : 'cp', name, local});
    }
  }
  for (const m of code.matchAll(new RegExp(String.raw`import\s+(?:\*\s*as\s+\w+|\w+)\s*(?:,\s*(?:\{[^}]*\}|\*\s*as\s+\w+))?\s*from\s*` + QUOTED, 'g'))) whole.push(m[0].replace(/\s+/g, ' '));
  for (const m of code.matchAll(new RegExp(String.raw`export\s*(?:\*(?:\s*as\s+\w+)?|\{[^}]*\})\s*from\s*` + QUOTED, 'g'))) whole.push(m[0].replace(/\s+/g, ' '));
  for (const m of code.matchAll(new RegExp(String.raw`\(\s*` + QUOTED + String.raw`\s*\)`, 'g'))) whole.push(`a call given ${m[0].replace(/\s+/g, '')} (import(), require(), createRequire()(…))`);
  for (const m of code.matchAll(/getBuiltinModule/g)) whole.push('process.getBuiltinModule');
  return {named, whole};
}
const srcFiles = () => {
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  const walk = (at = '') => readdirSync(path.join(src, at), {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(at, e.name)) : e.name.endsWith('.mjs') ? [path.join(at, e.name)] : []);
  return walk().map(file => ({file, code: readFileSync(path.join(src, file), 'utf8')}));
};
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const callsOf = names => new RegExp(String.raw`(?<![\w.$])(${names.map(escape).join('|') || '(?!)'})\s*\(`);
const flagged = new RegExp(String.raw`[\x60'"](${FLAGS.map(escape).join('|')})[\x60'"]|\bFFREPORT\b`);   // a flag as written, or FFmpeg's report variable

/** Every way src/ could write a file around writeOutput, or run a program not listed (empty when there is none). */
function rawWrites(files = srcFiles()) {
  const problems = [];
  for (const {file, code} of files) {
    const {named, whole} = moduleUse(code), allowed = IMPORTS[file] ?? [];
    for (const w of whole) problems.push(`${file}: ${w} — import fs and child_process functions by name`);
    const writers = named.filter(n => n.module === 'fs' && WRITERS.includes(n.name));
    for (const {name} of writers.filter(n => !allowed.includes(n.name))) problems.push(`${file}: imports ${name}, which writes a file — write the output through files.mjs · writeOutput`);
    for (const name of allowed.filter(n => !writers.some(w => w.name === n))) problems.push(`${file}: listed as importing ${name}, and it does not — remove it from IMPORTS`);
    // The programs: child_process's runners and spawned.mjs's wrapper, by the names this file gives them.
    const runners = [...named.filter(n => n.module === 'cp' && RUNNERS.includes(n.name)).map(n => n.local),
      ...[...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/spawned\.mjs['"]/g)].flatMap(m => m[1].split(',').map(p => p.trim().split(/\s+as\s+/)).filter(([n]) => n === 'spawned').map(([n, l = n]) => l))];
    const writes = callsOf(writers.map(n => n.local)), runs = callsOf(runners);
    code.split('\n').forEach((line, i) => {
      const text = line.trim(), at = `${file}:${i + 1} ${text.slice(0, 120)}`;
      if (text.startsWith('//') || text.startsWith('/*') || text.startsWith('*')) return;
      if ((writes.test(text) || flagged.test(text)) && !OWN.some(([f, has]) => f === file && text.includes(has))) problems.push(`${at} — write the output through files.mjs · writeOutput, or list it in OWN with where it writes`);
      if (runs.test(text) && !RUNS.some(([f, has]) => f === file && text.includes(has))) problems.push(`${at} — a program StoryReel runs: list it in RUNS with what it is and where its output goes`);
    });
  }
  for (const [list, entries] of [['OWN', OWN], ['RUNS', RUNS]]) for (const [f, has] of entries) if (!files.some(({file, code}) => file === f && code.includes(has))) problems.push(`${f}: "${has}" is listed in ${list} and gone — remove it`);
  return problems;
}

test('no write in src/ goes around writeOutput, and every program it runs is listed: by import, by call (under any local name), by flag', () => {
  assert.deepEqual(rawWrites(), []);
});

test('the guard catches each way around it, planted in src/: openSync + writeSync, a local alias, {default as fs}, getBuiltinModule, createRequire, a template import, fs/promises, an unlisted program, a writing FFmpeg flag', () => {
  const files = srcFiles(), plant = (file, edit) => files.map(f => f.file === file ? {file, code: edit(f.code)} : f);
  const caught = (planted, re) => { const found = rawWrites(planted); assert.ok(found.some(p => re.test(p)), `not caught: ${re}\n${found.join('\n')}`); return found; };
  const fsImport = "import {writeFileSync, rmSync} from 'node:fs';";
  assert.ok(files.find(f => f.file === 'render.mjs').code.includes(fsImport), 'render.mjs imports fs as the plants expect');
  // openSync + writeSync in render.mjs, in place of the chapters' writeOutput: both imports and the line.
  const opened = rawWrites(plant('render.mjs', c => c.replace(fsImport, "import {writeFileSync, rmSync, openSync, writeSync} from 'node:fs';").replace("writeOutput(path.join(dir, 'chapters.txt'), ", "writeSync(openSync(path.join(dir, 'chapters.txt'), 'w'), ")));
  assert.equal(opened.length, 3, opened.join('\n'));
  assert.match(opened[0], /^render\.mjs: imports openSync, which writes a file — write the output through files\.mjs · writeOutput$/);
  assert.match(opened[1], /^render\.mjs: imports writeSync, which writes a file/);
  assert.match(opened[2], /^render\.mjs:\d+ writeSync\(openSync\(path\.join\(dir, 'chapters\.txt'\), 'w'\), .* — write the output through files\.mjs · writeOutput, or list it in OWN/);
  // A writer it may import, called under another name.
  caught(plant('render.mjs', c => c.replace(fsImport, "import {writeFileSync, writeFileSync as put, rmSync} from 'node:fs';").replace("writeOutput(path.join(dir, 'chapters.txt'), ", "put(path.join(dir, 'chapters.txt'), ")), /^render\.mjs:\d+ put\(path\.join\(dir, 'chapters\.txt'\)/);
  // fs taken whole, or late.
  caught(plant('tools.mjs', c => `import {default as fs} from 'node:fs';\n${c}`), /^tools\.mjs: \{default as fs\} from 'node:fs' — import fs and child_process functions by name$/);
  caught(plant('tools.mjs', c => `${c}\nconst fs = process.getBuiltinModule('node:fs');\n`), /^tools\.mjs: process\.getBuiltinModule/);
  caught(plant('tools.mjs', c => `import {createRequire} from 'node:module';\n${c}\nconst fs = createRequire(import.meta.url)('node:fs');\n`), /^tools\.mjs: a call given \('node:fs'\)/);
  caught(plant('tools.mjs', c => `${c}\nconst later = () => import(\x60node:fs\x60);\n`), /^tools\.mjs: a call given \(\x60node:fs\x60\)/);
  caught(plant('tools.mjs', c => `import * as cp from 'node:child_process';\n${c}`), /^tools\.mjs: import \* as cp from 'node:child_process'/);
  caught(plant('tools.mjs', c => `export * from 'node:fs';\n${c}`), /^tools\.mjs: export \* from 'node:fs'/);
  caught(plant('tools.mjs', c => `import {open} from 'node:fs/promises';\n${c}`), /^tools\.mjs: imports open, which writes a file/);
  caught(plant('tools.mjs', c => `import {promises as fsp} from 'fs';\n${c}`), /^tools\.mjs: imports promises, which writes a file/);
  // A program not listed (curl writing a file), under its own name and under another.
  caught(plant('tools.mjs', c => `import {spawnSync} from 'node:child_process';\n${c}\nspawnSync('curl', ['-o', 'film.mp4', 'https://example.com']);\n`), /^tools\.mjs:\d+ spawnSync\('curl'.* — a program StoryReel runs: list it in RUNS/);
  caught(plant('tools.mjs', c => `import {execFileSync as run} from 'node:child_process';\n${c}\nrun('cp', ['a', 'b']);\n`), /^tools\.mjs:\d+ run\('cp', \['a', 'b'\]\);/);
  // A flag that makes FFmpeg or ffprobe write a file, wherever it is written.
  for (const flag of ['-progress', '-report', '-vstats_file', '-y']) caught(plant('beats.mjs', c => `${c}\nconst extra = ['${flag}', 'out.txt'];\n`), new RegExp(`^beats\\.mjs:\\d+ const extra = \\['${escape(flag)}'`));
  caught(plant('beats.mjs', c => `${c}\nconst env = {FFREPORT: 'file=report.log'};\n`), /^beats\.mjs:\d+ const env = \{FFREPORT/);
});
