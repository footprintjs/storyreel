/**
 * The skills' code blocks, read and run (test/skills.test.mjs, test/skills-render.mjs). A fence's info names the
 * language, `run` when the block is run, and `file=<name>` when it is written into the folder under that name:
 *   ```json file=storyboard.json```   ```js file=farm.mjs```   ```js run```   ```js run file=check.mjs```   ```sh run```
 */
import {mkdirSync, symlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tempDir} from './tmp.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));

/** A page's fenced code blocks: {lang, run, file, code, line}. A fence may be indented (inside a list item). */
export function blocksOf(text) {
  const out = [], lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)```(\S*)\s*(.*)$/.exec(lines[i]);
    if (!open) continue;
    const [, indent, lang, info] = open, body = [];
    let j = i + 1;
    for (; j < lines.length && !new RegExp(`^${indent}\`\`\`\\s*$`).test(lines[j]); j++) body.push(lines[j].startsWith(indent) ? lines[j].slice(indent.length) : lines[j]);
    if (j >= lines.length) throw new Error(`a code block opened on line ${i + 1} is never closed`);
    const words = info.split(/\s+/).filter(Boolean);
    out.push({lang, run: words.includes('run'), file: words.find(w => w.startsWith('file='))?.slice(5) ?? null, code: body.join('\n'), line: i + 1});
    i = j;
  }
  return out;
}
export const CODE = new Set(['js', 'mjs', 'javascript', 'ts', 'typescript']);

// A block runs as a program of its own, never as part of this test run (the runner's NODE_TEST_CONTEXT stays here).
const {NODE_TEST_CONTEXT: _runner, ...ownEnv} = process.env;
/** node with these arguments in `cwd` → {code, out, err}; killed after `timeout` ms (code null). */
export const run = (args, cwd, {timeout = 30_000} = {}) => new Promise(resolve => {
  const child = spawn(process.execPath, args, {cwd, env: ownEnv}), out = [], err = [];
  const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
  child.stdout.on('data', d => out.push(d)); child.stderr.on('data', d => err.push(d));
  child.on('close', code => { clearTimeout(timer); resolve({code, out: Buffer.concat(out).toString(), err: Buffer.concat(err).toString()}); });
});
/** A folder with the package installed in it, as `npm i` would leave it: node_modules/footprint-storyreel. */
export function project(t) {
  const dir = tempDir('skills', t);
  mkdirSync(path.join(dir, 'node_modules'));
  symlinkSync(repo, path.join(dir, 'node_modules', 'footprint-storyreel'), 'dir');
  return dir;
}
