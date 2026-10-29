// `storyreel studio` run in a folder, for the tests that drive it (test/gallery.test.mjs, test/studio-project.test.mjs).
import {mkdirSync, symlinkSync} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

/** A folder that loads footprint-storyreel as an installed package (this checkout): node_modules/footprint-storyreel. */
export function installed(folder) {
  mkdirSync(path.join(folder, 'node_modules'), {recursive: true});
  symlinkSync(fileURLToPath(new URL('..', import.meta.url)), path.join(folder, 'node_modules', 'footprint-storyreel'), 'dir');
  return folder;
}

/** `storyreel studio …` in `cwd`, until its address is printed: {url, child, out(), err()} — url rejects when it exits first. */
export function studioIn(cwd, args = []) {
  const child = spawn(process.execPath, [cli, 'studio', '--port', '0', ...args], {cwd});
  let out = '', err = '';
  child.stdout.on('data', d => (out += d)); child.stderr.on('data', d => (err += d));
  const url = new Promise((resolve, reject) => {
    child.stdout.on('data', () => { const m = /StoryReel Studio: (\S+)/.exec(out); if (m) resolve(m[1]); });
    child.on('exit', code => reject(Object.assign(new Error(`storyreel studio exited ${code}: ${err}`), {code, err})));
  });
  return {url, child, out: () => out, err: () => err};
}

/** The studio stopped as Ctrl+C stops it: its exit code. */
export const stopped = child => new Promise(resolve => { if (child.exitCode !== null) resolve(child.exitCode); else { child.on('exit', resolve); child.kill('SIGINT'); } });

/** `ask()` again every 100 ms until `done(answer)`, at most 5 s: the last answer. */
export async function until(ask, done) {
  let answer;
  for (let i = 0; i < 50 && !(answer !== undefined && done(answer)); i++) { await new Promise(r => setTimeout(r, 100)); answer = await ask(); }
  return answer;
}
