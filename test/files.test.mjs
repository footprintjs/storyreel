import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {insideRoot} from '../src/files.mjs';
import {compileFilm, evenTimings} from '../src/index.mjs';

// A film folder beside a private one whose name begins the same way: /…/film and /…/film-private.
const top = mkdtempSync(path.join(tmpdir(), 'storyreel-root-')), root = path.join(top, 'film'), secret = path.join(top, 'film-private');
mkdirSync(path.join(root, 'code'), {recursive: true}); mkdirSync(path.join(root, '..notes')); mkdirSync(secret);
const block = '// --- on-screen code\nconst x = 1;\n// --- end on-screen code ---\n';
writeFileSync(path.join(root, 'code', 'rule.ts'), block); writeFileSync(path.join(root, '..notes', 'a.ts'), block); writeFileSync(path.join(secret, 'x.ts'), block);
symlinkSync(path.join(secret, 'x.ts'), path.join(root, 'link.ts'));
symlinkSync(secret, path.join(root, 'shelf'));

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
