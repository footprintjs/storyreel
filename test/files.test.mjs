import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync, realpathSync, rmSync, lstatSync, readdirSync, existsSync, chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {insideRoot, copyVoice, requireVoiceApart} from '../src/files.mjs';
import {compileFilm, evenTimings} from '../src/index.mjs';

// A film folder beside a private one whose name begins the same way: /…/film and /…/film-private.
const top = mkdtempSync(path.join(tmpdir(), 'storyreel-root-')), root = path.join(top, 'film'), secret = path.join(top, 'film-private');
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

const made = name => mkdtempSync(path.join(tmpdir(), `storyreel-${name}-`));
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
  const to = path.join(made('to'), 'copy');
  assert.deepEqual(copyVoice(link, to), timings, 'it returns the voice\'s timings, as read');
  assert.deepEqual(contents(to), [['a.unpaced.wav', 'file'], ['a.wav', 'file'], ['audio', 'folder'], [path.join('audio', 'b.wav'), 'file'], ['timings.json', 'file']],
    'no link, no takes, no notes; an audio file missing or behind a dangling link is left out; the .unpaced.wav beside an audio file comes with it');
  const named = ['a.wav', 'audio/b.wav', 'timings.json'], bytes = dir => named.map(f => readFileSync(path.join(dir, f), 'utf8'));
  assert.deepEqual(bytes(to), ['A', 'B', JSON.stringify(timings)]);
  // Pacing rewrites the copy: it can (a read-only take gives a writable copy), and nothing the copy came from changes.
  for (const f of named) writeFileSync(path.join(to, f), 'paced');
  assert.deepEqual(bytes(real), ['A', 'B', JSON.stringify(timings)]);
  assert.throws(() => copyVoice(voice, to), /EEXIST/, 'a copy goes into a new folder only, never into one already there');
});

test('copyVoice: a scene\'s audio named outside the voice folder is refused before anything is written, naming the scene, the path and the fix', () => {
  const top = made('voice'), voice = path.join(top, 'voice'), takes = path.join(top, 'takes'); mkdirSync(voice); mkdirSync(takes); writeFileSync(path.join(takes, 'a.wav'), 'A');
  const refuses = (audio, why) => {
    writeFileSync(path.join(voice, 'timings.json'), JSON.stringify({scenes: [{id: 'open'}, {id: 'story', audio}]}));
    const to = path.join(made('to'), 'copy');
    assert.throws(() => copyVoice(voice, to), why);
    assert.ok(!existsSync(to), `${audio}: nothing is written`);
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
  assert.equal(readFileSync(path.join(voice, 'a.wav'), 'utf8'), 'V');
  assert.equal(readFileSync(path.join(takes, 'a.wav'), 'utf8'), 'A');
  assert.throws(() => copyVoice(takes, path.join(made('to'), 'copy')), new RegExp(`voice: ${esc(takes)} has no timings.json: give narrationDir the voice folder`));
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
