import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, symlinkSync, readFileSync, realpathSync, rmSync, lstatSync, readdirSync, existsSync, chmodSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {insideRoot, copyVoice, requireVoiceApart, readPlainFile, writeNewFile, appendToFile, rewriteFile, withFileLock} from '../src/files.mjs';
import {spawnSync} from 'node:child_process';
import {statSync} from 'node:fs';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {tempDir} from './tmp.mjs';

// A film folder beside a private one whose name begins the same way: /…/film and /…/film-private.
const top = tempDir('root'), root = path.join(top, 'film'), secret = path.join(top, 'film-private');
mkdirSync(path.join(root, 'code'), {recursive: true}); mkdirSync(path.join(root, '..notes')); mkdirSync(secret);
const block = '// --- on-screen code\nconst x = 1;\n// --- end on-screen code ---\n';
writeFileSync(path.join(root, 'code', 'rule.ts'), block); writeFileSync(path.join(root, '..notes', 'a.ts'), block); writeFileSync(path.join(secret, 'x.ts'), block);
symlinkSync(path.join(secret, 'x.ts'), path.join(root, 'link.ts'));
symlinkSync(secret, path.join(root, 'shelf'));
after(() => rmSync(top, {recursive: true, force: true}));

test('insideRoot: a file inside the root folder passes, as its real path', () => {
  assert.equal(insideRoot(root, 'code/rule.ts'), realpathSync(path.join(root, 'code', 'rule.ts')));
  assert.equal(insideRoot(root, path.join(root, 'code', 'rule.ts')), realpathSync(path.join(root, 'code', 'rule.ts')), 'an absolute path inside passes too');
  assert.ok(insideRoot(root, '..notes/a.ts').endsWith(path.join('..notes', 'a.ts')), 'a folder whose name begins with two dots is still inside');
  assert.ok(insideRoot(root, 'code/not-yet.png').endsWith(path.join('code', 'not-yet.png')), 'a file not made yet is judged by its folder');
});

test('insideRoot: a sibling folder whose name begins like the root is refused (the old prefix check let it through)', () => {
  assert.throws(() => insideRoot(root, '../film-private/x.ts'), /\.\.\/film-private\/x\.ts is outside .*film: a recipe loads files only from inside the film's root folder/);
  assert.throws(() => insideRoot(root, path.join(secret, 'x.ts')), /is outside/, 'an absolute path outside is refused');
  assert.throws(() => insideRoot(root, '..'), /is outside/);
});

test('insideRoot: a symbolic link out of the folder is refused, to a file or through a folder', () => {
  assert.throws(() => insideRoot(root, 'link.ts'), /link\.ts is outside/);
  assert.throws(() => insideRoot(root, 'shelf/x.ts'), /shelf\/x\.ts is outside/);
  assert.throws(() => insideRoot(root, 'shelf/not-yet.png'), /is outside/, 'a missing file under a linked folder is judged by the real folder');
});

test('insideRoot: a root that does not exist refuses, naming the fix', () => {
  const missing = path.join(top, 'flim');
  assert.throws(() => insideRoot(missing, 'code/rule.ts'), new RegExp(`root ${missing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is not a folder that exists: pass the film's folder as the root option`));
});

test('insideRoot: a root reached through a symbolic link still holds its own files', () => {
  const alias = path.join(top, 'alias'); symlinkSync(root, alias);
  assert.equal(insideRoot(alias, 'code/rule.ts'), realpathSync(path.join(root, 'code', 'rule.ts')));
  assert.throws(() => insideRoot(alias, '../film-private/x.ts'), /is outside/);
});

test('compileFilm loads a code excerpt only from inside root', async () => {
  const hello = fileURLToPath(new URL('../examples/hello/', import.meta.url));
  const storyboard = JSON.parse(readFileSync(hello + 'storyboard.json', 'utf8')), recipe = JSON.parse(readFileSync(hello + 'recipe.json', 'utf8'));
  const timings = evenTimings(storyboard, {tail: 4}), withFile = file => ({...recipe, stages: [{...recipe.stages[0], code: {...recipe.stages[0].code, file}, reveal: [[0, ['rule', 'One pebble for one sheep']]], focus: []}]});
  await assert.rejects(compileFilm({storyboard, timings, recipe: withFile('../film-private/x.ts'), root}), /is outside/);
  await assert.rejects(compileFilm({storyboard, timings, recipe: withFile('link.ts'), root}), /is outside/);
  const film = await compileFilm({storyboard, timings, recipe: withFile('code/rule.ts'), root});
  assert.ok(film.total > 0);
});

const made = name => tempDir(name);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Everything in a folder, at every depth, never following a link: each path and what it is. */
const contents = (dir, at = '') => readdirSync(path.join(dir, at)).sort().flatMap(name => {
  const rel = path.join(at, name), s = lstatSync(path.join(dir, rel));
  return s.isSymbolicLink() ? [[rel, 'link']] : s.isDirectory() ? [[rel, 'folder'], ...contents(dir, rel)] : [[rel, 'file']];
});

test('copyVoice: the copy holds exactly what the render reads — timings.json and each scene\'s audio — as new, writable files read through any link; nothing else', () => {
  // The voice's files live elsewhere and are linked in: its timings.json, a read-only take, its audio folder. Beside
  // them: the .unpaced.wav pacing left beside a take, a dangling link, notes, and a linked folder of takes that links
  // back into itself (a walk of the folder would never end).
  const real = made('real'), voice = made('voice'), at = (...p) => path.join(real, ...p);
  const timings = {scenes: [{id: 'a', audio: 'a.wav'}, {id: 'b', audio: 'audio/b.wav'}, {id: 'c', audio: 'missing.wav'}, {id: 'd'}, {id: 'e', audio: 'gone.wav'}, {id: 'f', audio: 'a.wav'}]};
  writeFileSync(at('timings.json'), JSON.stringify(timings)); writeFileSync(at('a.wav'), 'A'); chmodSync(at('a.wav'), 0o444);
  mkdirSync(at('audio')); writeFileSync(at('audio', 'b.wav'), 'B'); mkdirSync(at('takes')); writeFileSync(at('takes', 'take-1.wav'), 'T'); symlinkSync(at('takes'), at('takes', 'again'), 'dir');
  for (const f of ['timings.json', 'a.wav']) symlinkSync(at(f), path.join(voice, f));
  for (const f of ['audio', 'takes']) symlinkSync(at(f), path.join(voice, f), 'dir');
  symlinkSync(at('deleted.wav'), path.join(voice, 'gone.wav')); writeFileSync(path.join(voice, 'a.unpaced.wav'), 'A0'); writeFileSync(path.join(voice, 'notes.txt'), 'n');
  const link = path.join(made('link'), 'voice'); symlinkSync(voice, link, 'dir');   // and the voice folder itself given through a link
  const to = made('to');   // a new, empty folder the caller made (scratch.mjs · makeScratch)
  assert.deepEqual(copyVoice(link, to), timings, 'it returns the voice\'s timings, as read');
  assert.deepEqual(contents(to), [['a.unpaced.wav', 'file'], ['a.wav', 'file'], ['audio', 'folder'], [path.join('audio', 'b.wav'), 'file'], ['timings.json', 'file']],
    'no link, no takes, no notes; an audio file missing or behind a dangling link is left out; the .unpaced.wav beside an audio file comes with it');
  const named = ['a.wav', 'audio/b.wav', 'timings.json'], bytes = dir => named.map(f => readFileSync(path.join(dir, f), 'utf8'));
  assert.deepEqual(bytes(to), ['A', 'B', JSON.stringify(timings)]);
  // Pacing rewrites the copy: it can (a read-only take gives a writable copy), and nothing the copy came from changes.
  for (const f of named) writeFileSync(path.join(to, f), 'paced');
  assert.deepEqual(bytes(real), ['A', 'B', JSON.stringify(timings)]);
  assert.throws(() => copyVoice(voice, to), /EEXIST/, 'a copy writes new files only, never over one already there');
  // Nor through a link planted where a file of the copy goes: the link's target is never written.
  const planted = made('planted'), target = path.join(made('target'), 'victim'); writeFileSync(target, 'mine');
  symlinkSync(target, path.join(planted, 'timings.json'));
  assert.throws(() => copyVoice(voice, planted), /EEXIST/);
  assert.equal(readFileSync(target, 'utf8'), 'mine', 'the link\'s target is untouched');
});

test('copyVoice: a scene\'s audio named outside the voice folder is refused before anything is written, naming the scene, the path and the fix', () => {
  const top = made('voice'), voice = path.join(top, 'voice'), takes = path.join(top, 'takes'); mkdirSync(voice); mkdirSync(takes); writeFileSync(path.join(takes, 'a.wav'), 'A');
  const refuses = (audio, why) => {
    writeFileSync(path.join(voice, 'timings.json'), JSON.stringify({scenes: [{id: 'open'}, {id: 'story', audio}]}));
    const to = made('to');
    assert.throws(() => copyVoice(voice, to), why);
    assert.deepEqual(readdirSync(to), [], `${audio}: nothing is written`);
  };
  refuses('../takes/a.wav', new RegExp(`voice: scene "story" names its audio "\\.\\./takes/a\\.wav", outside the voice folder ${esc(voice)}: name each scene's audio by a path inside the voice folder, relative to it \\(audio/story\\.wav\\)$`));
  refuses(path.join(takes, 'a.wav'), /names its audio ".*takes\/a\.wav", outside the voice folder/);   // an absolute path
  refuses('audio/../../takes/a.wav', /names its audio "audio\/\.\.\/\.\.\/takes\/a\.wav", outside the voice folder/);
  // Absolute names are refused even inside the folder: pacing JOINS a name to the copy, and "/../../…/voice/x.wav"
  // resolves inside the voice but joins back up to the voice itself — pacing would rewrite the voice in place.
  writeFileSync(path.join(voice, 'a.wav'), 'V');
  refuses(path.join(voice, 'a.wav'), /names its audio ".*voice\/a\.wav", outside the voice folder/);
  refuses('/..'.repeat(40) + path.join(voice, 'a.wav'), /names its audio "(\/\.\.)+.*voice\/a\.wav", outside the voice folder/);
  refuses(42, /names its audio 42, outside the voice folder/);
  refuses('audio/a.wav\nfile \'/etc/hosts', /names its audio "audio\/a\.wav\\nfile '\/etc\/hosts", outside the voice folder/);   // a line break would splice another file into ffmpeg's list
  assert.equal(readFileSync(path.join(voice, 'a.wav'), 'utf8'), 'V');
  assert.equal(readFileSync(path.join(takes, 'a.wav'), 'utf8'), 'A');
  assert.throws(() => copyVoice(takes, made('to')), new RegExp(`voice: ${esc(takes)} has no timings.json: give narrationDir the voice folder`));
});

test('requireVoiceApart: an out folder in the voice, or a voice that is, holds or lies inside <out>/narration, is refused — by real path, through links and the disk\'s own spelling', () => {
  const top = made('apart'), voice = path.join(top, 'voice'); mkdirSync(voice);
  const overlap = /voice: the voice folder .* and the render's out folder .* overlap — the render paces a copy of the voice in the out folder, then replaces .*narration with it, so it would write into the voice folder or delete it: keep the voice folder outside the render's out folder, and render outside the voice folder$/;
  assert.throws(() => requireVoiceApart(voice, voice), overlap, 'the out folder is the voice folder');
  assert.throws(() => requireVoiceApart(voice, path.join(voice, 'renders')), overlap, 'an out folder inside the voice, not made yet');
  assert.doesNotThrow(() => requireVoiceApart(voice, top), 'a voice elsewhere in the out folder, beside its narration, is fine');
  const named = path.join(top, 'narration'); mkdirSync(path.join(named, 'take'), {recursive: true});
  assert.throws(() => requireVoiceApart(named, top), overlap, 'the voice is <out>/narration: the render would replace it');
  assert.throws(() => requireVoiceApart(path.join(named, 'take'), top), overlap, 'a voice inside <out>/narration would go with it');
  const alias = path.join(made('alias'), 'voice'); symlinkSync(voice, alias, 'dir');
  assert.throws(() => requireVoiceApart(alias, path.join(voice, 'renders')), overlap, 'the voice given through a link');
  assert.throws(() => requireVoiceApart(voice, path.join(alias, 'renders')), overlap, 'the out folder given through a link');
  // On a disk that ignores case (macOS, Windows), Narration is the folder the render calls narration.
  const caps = made('caps'), spoken = path.join(caps, 'Narration'); mkdirSync(spoken);
  if (existsSync(path.join(caps, 'narration'))) assert.throws(() => requireVoiceApart(spoken, caps), overlap);
  else assert.doesNotThrow(() => requireVoiceApart(spoken, caps), 'a disk that tells case apart: two folders');
});

test('readPlainFile: a plain file read whole; none is null; a link, a folder, a FIFO, too many bytes or what judge names refused with the fix — never hanging', {skip: process.platform === 'win32' ? 'POSIX links and FIFOs' : false}, t => {
  const dir = tempDir('plain', t), file = path.join(dir, 'notes.md'), fix = 'put the file itself there';
  writeFileSync(file, 'héllo\n');
  assert.equal(readPlainFile(file, {most: 64, fix}), 'héllo\n');
  assert.equal(readPlainFile(path.join(dir, 'none.md'), {most: 64, fix}), null);
  symlinkSync(file, path.join(dir, 'link.md')); symlinkSync(path.join(dir, 'gone'), path.join(dir, 'dangling.md'));
  for (const name of ['link.md', 'dangling.md']) assert.throws(() => readPlainFile(path.join(dir, name), {most: 64, fix}), /is a link \(or a junction\), not a file of its own: StoryReel reads it only as a plain file — put the file itself there/);
  assert.throws(() => readPlainFile(dir, {most: 64, fix}), /is not a plain file \(a folder, a FIFO or a device\)/);
  assert.throws(() => readPlainFile(file, {most: 3, fix}), /holds 7 bytes, more than the 3 StoryReel reads of it: make it smaller — put the file itself there/);
  assert.throws(() => readPlainFile(file, {most: 64, fix, judge: st => (st.size > 2 ? 'is too chatty: trim it' : null)}), /notes\.md is too chatty: trim it — put the file itself there/);
  const fifo = path.join(dir, 'pipe.md');
  if (!spawnSync('mkfifo', [fifo]).error && existsSync(fifo)) assert.throws(() => readPlainFile(fifo, {most: 64, fix}), /is not a plain file/, 'refused before it is opened: nothing writes to it, and the test ends');
});

test('writeNewFile: a new file, written whole then linked into place — never over a file, never through a link, never seen half-written', {skip: process.platform === 'win32' ? 'POSIX modes and links' : false}, t => {
  const dir = tempDir('new-file', t), file = path.join(dir, 'key');
  assert.equal(writeNewFile(file, 'abc', {mode: 0o600}), true);
  assert.deepEqual([readFileSync(file, 'utf8'), statSync(file).mode & 0o777, statSync(file).nlink], ['abc', 0o600, 1]);
  assert.equal(writeNewFile(file, 'other'), false, 'one is there: kept');
  assert.equal(readFileSync(file, 'utf8'), 'abc');
  const victim = path.join(tempDir('victim', t), 'theirs'); writeFileSync(victim, 'theirs');
  symlinkSync(victim, path.join(dir, 'linked')); symlinkSync(path.join(dir, 'nowhere'), path.join(dir, 'dangling'));
  assert.equal(writeNewFile(path.join(dir, 'linked'), 'secret'), false);
  assert.equal(writeNewFile(path.join(dir, 'dangling'), 'secret'), false);
  assert.equal(readFileSync(victim, 'utf8'), 'theirs', 'never written through the link');
  assert.ok(!existsSync(path.join(dir, 'nowhere')), 'nothing made where a dangling link points');
  assert.deepEqual(readdirSync(dir).filter(n => n.endsWith('.part')), [], 'nothing left under a temporary name');
});

test('writeNewFile on a disk with no hard links (EPERM, ENOTSUP, EXDEV …): the file created exclusively at its name instead', t => {
  const dir = tempDir('no-links', t);
  for (const code of ['EPERM', 'ENOTSUP', 'EXDEV']) {
    const file = path.join(dir, `made-${code}`), noLinks = {linkSync: () => { throw Object.assign(new Error(code), {code}); }};
    assert.equal(writeNewFile(file, 'whole', {mode: 0o600}, noLinks), true, code);
    assert.equal(readFileSync(file, 'utf8'), 'whole');
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(writeNewFile(file, 'again', {}, noLinks), false, `${code}: one is there, kept`);
    assert.equal(readFileSync(file, 'utf8'), 'whole');
  }
  assert.throws(() => writeNewFile(path.join(dir, 'other'), 'x', {}, {linkSync: () => { throw Object.assign(new Error('EIO'), {code: 'EIO'}); }}), /EIO/, 'any other failure is said');
  assert.deepEqual(readdirSync(dir).filter(n => n.endsWith('.part')), []);
});

test('appendToFile and rewriteFile: one appended write that keeps what another wrote; a rewrite keeping the mode; neither through a link', {skip: process.platform === 'win32' ? 'POSIX modes and links' : false}, t => {
  const dir = tempDir('append', t), file = path.join(dir, 'notes.md');
  writeFileSync(file, 'one\n'); chmodSync(file, 0o664);
  appendToFile(file, 'two\n'); appendToFile(file, 'three\n');
  assert.equal(readFileSync(file, 'utf8'), 'one\ntwo\nthree\n');
  rewriteFile(file, 'all new\n');
  assert.deepEqual([readFileSync(file, 'utf8'), statSync(file).mode & 0o777], ['all new\n', 0o664]);
  const victim = path.join(tempDir('victim', t), 'theirs'); writeFileSync(victim, 'theirs'); symlinkSync(victim, path.join(dir, 'linked.md'));
  assert.throws(() => appendToFile(path.join(dir, 'linked.md'), 'x', {fix: 'put it there'}), /is not a plain file of its own \(a link, a folder, a FIFO\): StoryReel adds to it only as one — put it there/);
  assert.throws(() => rewriteFile(path.join(dir, 'linked.md'), 'x'), /is not a plain file \(a link, a folder, a FIFO\)/);
  assert.equal(readFileSync(victim, 'utf8'), 'theirs');
  assert.throws(() => appendToFile(path.join(dir, 'none.md'), 'x'), /ENOENT/, 'never made: appending is to a file that is there');
});

test('withFileLock: one holder at a time, the lock made exclusively and removed after; a stale lock refused naming the file to remove', async t => {
  const dir = tempDir('lock', t), file = path.join(dir, 'notes.md'), order = [];
  const hold = name => withFileLock(file, async () => { order.push(name); await new Promise(r => setTimeout(r, 30)); order.push(`${name} done`); return name; });
  assert.deepEqual(await Promise.all([hold('a'), hold('b')]), ['a', 'b']);
  assert.deepEqual(order, ['a', 'a done', 'b', 'b done']);
  assert.ok(!existsSync(`${file}.lock`));
  await assert.rejects(withFileLock(file, () => { throw new Error('inside'); }), /inside/);
  assert.ok(!existsSync(`${file}.lock`), 'removed when fn throws too');
  writeFileSync(`${file}.lock`, `${process.pid} held-by-this-test\n`);
  await assert.rejects(withFileLock(file, () => 1, {waitMs: 60}), /is being changed by another studio or storyreel feedback .*: try again in a moment/);
  writeFileSync(`${file}.lock`, 'no pid in it');
  await assert.rejects(withFileLock(file, () => 1, {staleMs: -1}), /notes\.md\.lock is \d+ s old and names no process: remove it, then try again/);
  rmSync(`${file}.lock`);
});

test('withFileLock: a lock whose process is gone is taken over; a holder removes only its own lock', async t => {
  const dir = tempDir('lock-heal', t), file = path.join(dir, 'notes.md'), lock = `${file}.lock`;
  const gone = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], {encoding: 'utf8'}).stdout;
  writeFileSync(lock, `${gone} left-behind\n`);
  assert.equal(await withFileLock(file, () => 'taken over', {waitMs: 500}), 'taken over');
  assert.ok(!existsSync(lock));
  await withFileLock(file, () => { rmSync(lock); writeFileSync(lock, `${process.pid} someone-else\n`); });
  assert.equal(readFileSync(lock, 'utf8'), `${process.pid} someone-else\n`, 'another holder\'s lock is left alone');
  rmSync(lock);
});

test('withFileLock: a lock that is not a plain file — a dangling link a shared project carried, a folder — is refused at once, naming it; never a spin', {skip: process.platform === 'win32' ? 'POSIX links' : false, timeout: 5000}, async t => {
  const dir = tempDir('lock-link', t), file = path.join(dir, 'notes.md');
  symlinkSync(path.join(dir, 'nowhere'), `${file}.lock`);
  const started = Date.now();
  await assert.rejects(withFileLock(file, () => 1), /notes\.md\.lock is not a lock StoryReel made \(a link, a folder or a FIFO\): remove it, then try again/);
  assert.ok(Date.now() - started < 1000, 'refused at once');
  rmSync(`${file}.lock`); mkdirSync(`${file}.lock`);
  await assert.rejects(withFileLock(file, () => 1), /is not a lock StoryReel made/);
});
