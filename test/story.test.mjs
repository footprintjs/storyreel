// The story chart's tests, one file per stage folder in test/story/ (src/ holds shipped code only: its guards scan every
// file there): this loads each into the suite, so a test file added there runs without being listed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('./story/', import.meta.url));
const files = readdirSync(root, {recursive: true}).filter((f) => f.endsWith('.test.mjs')).sort();
for (const file of files) await import(pathToFileURL(path.join(root, file)).href);

test('the story chart\'s own tests are found and loaded', () => {
  assert.ok(files.length >= 10, `found ${files.length} test files in test/story`);
});
