// The typed entry points (scripts/typed-entrypoints.mjs): the one list CI and the publish both hand attw, so the two can
// never check different entry points again (they had drifted: the publish missed camera, moves, principles and
// breakdown; both missed walk, pose, mocap and kits/cartoon/figure).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {typedEntrypoints} from '../scripts/typed-entrypoints.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8'));
/** Every `types` path in an export's conditions, at any depth (read here on its own, not through the script). */
const typesOf = target => (target && typeof target === 'object' ? Object.entries(target).flatMap(([k, v]) => (k === 'types' ? [v] : typesOf(v))) : []);

test('the script lists exactly the exports that have types — none missed, none extra — each as attw names it, and each types file exists', () => {
  const printed = execFileSync(process.execPath, [path.join(repo, 'scripts', 'typed-entrypoints.mjs')], {encoding: 'utf8'}).trim().split(/\s+/);
  const expected = Object.entries(pkg.exports).filter(([, target]) => typesOf(target).length).map(([key]) => key);
  assert.deepEqual(printed.map(e => (e === '.' ? '.' : `./${e}`)), expected, 'an export with types the script misses, or one it lists without types');
  assert.deepEqual(typedEntrypoints(pkg), printed);
  for (const [key, target] of Object.entries(pkg.exports)) for (const file of typesOf(target)) assert.ok(existsSync(path.join(repo, file)), `${key}: its types file ${file} exists`);
  // The untyped ones are the drawing internals (README) and package.json itself.
  assert.deepEqual(Object.keys(pkg.exports).filter(k => !expected.includes(k)), ['./sound', './pen', './ground', './kits/whiteboard/board', './kits/paper', './kits/paper/code', './notes', './package.json']);
});

test('the script reads types at any depth of an export\'s conditions, and skips a bare path or an export without types', () => {
  assert.deepEqual(typedEntrypoints({exports: {
    '.': {types: './a.d.ts', default: './a.mjs'},
    './nested': {import: {types: './n.d.ts', default: './n.mjs'}},
    './bare': './bare.mjs',
    './plain': {default: './p.mjs'},
  }}), ['.', 'nested']);
  assert.deepEqual(typedEntrypoints({}), []);
});

test('CI and the publish both check the script\'s list, and neither carries a list of its own', () => {
  for (const workflow of ['ci.yml', 'publish.yml']) {
    const text = readFileSync(path.join(repo, '.github', 'workflows', workflow), 'utf8');
    const attw = text.split('\n').filter(l => l.includes('@arethetypeswrong/cli'));
    assert.equal(attw.length, 1, `${workflow}: one attw run`);
    assert.match(attw[0], /--entrypoints \$\(node scripts\/typed-entrypoints\.mjs\)/, `${workflow}: attw takes the script's list`);
  }
});
