// The project's own code, read fresh after an edit (studio/code.mjs · projectCode): its version follows its modules'
// bytes, an undone edit comes back to the modules loaded before, a package in node_modules stays the one copy loaded,
// a file read as data is watched but never versions the code, and an import chosen at run time is listed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, realpathSync} from 'node:fs';
import path from 'node:path';
import {projectCode, reloads, CODE_PARAM} from '../src/studio/code.mjs';
import {tempDir} from './tmp.mjs';

function project(t) {
  const dir = realpathSync(tempDir('studio-code-unit', t)), write = (f, text) => { mkdirSync(path.dirname(path.join(dir, f)), {recursive: true}); writeFileSync(path.join(dir, f), text); };
  write('node_modules/counted/package.json', JSON.stringify({name: 'counted', version: '1.0.0', type: 'module', exports: './index.mjs'}));
  write('node_modules/counted/index.mjs', 'globalThis.countedLoads = (globalThis.countedLoads ?? 0) + 1;\nexport const loads = () => globalThis.countedLoads;\n');
  write('kits/word.mjs', 'export const WORD = \'one\';\n');
  write('kits/kit.mjs', 'import {WORD} from \'./word.mjs\';\nimport {loads} from \'counted\';\nexport const said = () => [WORD, loads()];\nexport const pick = name => import(\'./\' + name);\n');
  write('data.json', '{"n": 1}');
  write('storyreel.config.mjs', 'import {said, pick} from \'./kits/kit.mjs\';\nexport const data = new URL(\'./data.json\', import.meta.url);\nexport default {said, pick};\n');
  return {dir, write, config: path.join(dir, 'storyreel.config.mjs')};
}

test('a project\'s code: its files, its version, what it cannot follow', t => {
  const {dir, write, config} = project(t), first = projectCode(config);
  assert.deepEqual(first.files.map(f => path.relative(dir, f)), ['data.json', 'kits/kit.mjs', 'kits/word.mjs', 'storyreel.config.mjs'], 'its modules and the file it loads; never a package');
  assert.deepEqual(first.unfollowed.map(u => [path.relative(dir, u.from), u.code]), [['kits/kit.mjs', 'import("./" + name)']]);
  assert.match(first.version, /^[0-9a-f]{16}$/);
  write('data.json', '{"n": 2}');
  assert.equal(projectCode(config).version, first.version, 'a file read as data never versions the code');
  write('kits/word.mjs', 'export const WORD = \'two\';\n');
  assert.notEqual(projectCode(config).version, first.version, 'a module imported two steps away does');
  write('kits/word.mjs', 'export const WORD = \'one\';\n');
  assert.equal(projectCode(config).version, first.version, 'undone, the version is the one before');
});

test('loaded under its version: an edited module is new, an undone edit is the module loaded before, a package is loaded once', {skip: !reloads && 'this Node has no module.registerHooks'}, async t => {
  const {write, config} = project(t), load = async () => (await import(projectCode(config).url)).default.said();
  assert.match(projectCode(config).url, new RegExp(`\\?${CODE_PARAM}=[0-9a-f]{16}$`));
  assert.deepEqual(await load(), ['one', 1]);
  write('kits/word.mjs', 'export const WORD = \'two\';\n');
  assert.deepEqual(await load(), ['two', 1], 'the edited module is loaded again; the package is not');
  write('kits/word.mjs', 'export const WORD = \'one\';\n');
  assert.deepEqual(await load(), ['one', 1], 'the edit undone: the modules loaded before');
});
