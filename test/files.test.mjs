import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync, realpathSync, rmSync, lstatSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {insideRoot, copyRealFiles} from '../src/files.mjs';
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

test('copyRealFiles: a folder copied by its contents — no link survives, wherever it was, and writing into the copy changes nothing it came from', () => {
  const from = mkdtempSync(path.join(tmpdir(), 'storyreel-copy-')), real = mkdtempSync(path.join(tmpdir(), 'storyreel-real-'));
  mkdirSync(path.join(real, 'audio')); writeFileSync(path.join(real, 'audio', 'a.wav'), 'A'); writeFileSync(path.join(real, 'timings.json'), '{}');
  symlinkSync(path.join(real, 'audio'), path.join(from, 'audio'), 'dir'); symlinkSync(path.join(real, 'timings.json'), path.join(from, 'timings.json'));
  const link = path.join(mkdtempSync(path.join(tmpdir(), 'storyreel-link-')), 'voice'); symlinkSync(from, link, 'dir');
  const to = path.join(mkdtempSync(path.join(tmpdir(), 'storyreel-to-')), 'copy');
  copyRealFiles(link, to);
  const kinds = p => { const s = lstatSync(p); return s.isSymbolicLink() ? 'link' : s.isDirectory() ? 'dir' : 'file'; };
  assert.deepEqual([kinds(to), kinds(path.join(to, 'audio')), kinds(path.join(to, 'audio', 'a.wav')), kinds(path.join(to, 'timings.json'))], ['dir', 'dir', 'file', 'file']);
  writeFileSync(path.join(to, 'audio', 'a.wav'), 'paced'); writeFileSync(path.join(to, 'timings.json'), '{"paced": true}');
  assert.equal(readFileSync(path.join(real, 'audio', 'a.wav'), 'utf8'), 'A'); assert.equal(readFileSync(path.join(real, 'timings.json'), 'utf8'), '{}');
  // A link back into a folder being copied would never end: refused, naming it.
  symlinkSync(from, path.join(real, 'audio', 'loop'), 'dir');
  assert.throws(() => copyRealFiles(from, path.join(mkdtempSync(path.join(tmpdir(), 'storyreel-to-')), 'copy')), /leads back into .* a folder being copied \(a link loop\): remove the link/);
});
