// Films without marks are the same as before marks came (script.mjs): every reader of a scene's words — the text spoken
// and shown, the even and paced timings, the clock's every phrase, the compile's beats, timings and anchors — gives what
// 0.20.1 gave, pinned by hash (test/unmarked.mjs; `node test/unmarked.mjs --write` re-records, only for a change meant).
// The example films' pixels are pinned on their own (golden.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unmarkedPins, PINS} from './unmarked.mjs';

test('films without marks read exactly as 0.20.1 read them: every reader of their words gives the same', async () => {
  const pinned = JSON.parse(readFileSync(PINS, 'utf8')), now = await unmarkedPins();
  assert.deepEqual(Object.keys(now), Object.keys(pinned), 'the same readings are pinned');
  assert.deepEqual(Object.keys(now).filter(name => now[name] !== pinned[name]), [], 'a film without marks reads differently now: find what changed, or re-record (node test/unmarked.mjs --write) only for a change meant, and say so in the commit');
});
