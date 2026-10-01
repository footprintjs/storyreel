import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {behaviourOf} from './behaviour.mjs';
import {FILMS} from './golden.mjs';

// What each example film decides beyond its pixels (test/behaviour.mjs): re-record with
// `node test/behaviour.mjs --write` only for an intended change.
const pinned = JSON.parse(readFileSync(new URL('./behaviour.json', import.meta.url), 'utf8'));

test('behaviour pins cover every example film', () => assert.deepEqual(Object.keys(pinned).sort(), Object.keys(FILMS).sort()));

for (const name of Object.keys(FILMS)) test(`behaviour pins: ${name} reads, rests and refuses pushes as recorded`, async () => {
  const now = await behaviourOf(name), was = pinned[name];
  assert.deepEqual(now.reading, was.reading, `${name}: film.reading changed`);
  assert.deepEqual(now.moments, was.moments, `${name}: film.moments() changed`);
  assert.deepEqual(now.pushes, was.pushes, `${name}: the push check answers differently`);
});

test('behaviour pins hold a refusal for every change of picture that has words on both sides', () => {
  for (const [name, b] of Object.entries(pinned)) for (const p of b.pushes.filter(p => p.across.startsWith('mid '))) {
    assert.match(p.says, /a push stays on one picture|one camera move at a time|after the film ends/, `${name}: a push across ${p.across} should refuse`);
  }
});
