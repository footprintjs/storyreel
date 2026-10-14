// Every entry point the package publishes (package.json · exports) loads: `await import(…)` settles, by the package's
// own name, as a user's code imports it. A module that exports a function named `then` is a thenable, and awaiting its
// import never settles (regions.mjs once did, with its view composition) — so no entry point may export `then`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const entries = Object.keys(manifest.exports).filter(key => key !== './package.json');

/** The module, or a refusal that names the entry point when it does not settle in time. */
const settled = (specifier, ms = 10000) => {
  let timer;
  return Promise.race([import(specifier), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${specifier}: await import() did not settle in ${ms} ms (does it export a function named then?)`)), ms); })])
    .finally(() => clearTimeout(timer));
};

test('every published entry point settles when awaited, and none exports then', async () => {
  assert.ok(entries.length > 40, `the entry points are read from package.json (${entries.length})`);
  for (const key of entries) {
    const specifier = key === '.' ? manifest.name : `${manifest.name}/${key.slice(2)}`;
    const module = await settled(specifier);
    assert.equal(typeof module, 'object', `${specifier} is a module`);
    assert.ok(!('then' in module), `${specifier} exports then: awaiting its import would never settle — give that export a plain name`);
  }
});

test('regions composes views with compose, not then', async () => {
  const regions = await settled(`${manifest.name}/regions`);
  assert.deepEqual(regions.compose(regions.view(2, 10, 0), regions.view(1, 5, 5)), {z: 2, tx: 20, ty: 10});
});
