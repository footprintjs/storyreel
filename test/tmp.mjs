/**
 * Temp folders for tests, each removed when its test ends — or, made outside a test (a file's helper, a fixture made
 * once), when the test file ends. Every one is named storyreel-<name>-…, so a count of what is left finds them all
 * (scripts/temp-hygiene.mjs runs the suite with a temp folder of its own and refuses anything left).
 *
 *   const dir = tempDir('seg', t);     // gone after this test
 *   const fixture = tempDir('voice');  // gone after this file
 */
import {after} from 'node:test';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const made = new Set();
const remove = dir => { rmSync(dir, {recursive: true, force: true}); made.delete(dir); };
// The file's own end: whatever its tests left (and every folder made outside a test).
after(() => { for (const dir of [...made]) remove(dir); });

/** A new folder storyreel-<name>-XXXXXX in the temp folder, removed after `t` (a test's context) ends, or after the file. */
export function tempDir(name, t = null) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`tempDir: name is a short word (e.g. 'seg'), not ${JSON.stringify(name)}`);
  const dir = mkdtempSync(path.join(tmpdir(), `storyreel-${name}-`));
  made.add(dir);
  if (t) t.after(() => remove(dir));
  return dir;
}
