// The source: windows cover every message once, the facts hold no words, every read checks the words are the ones counted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {storyboardBrief} from 'footprint-story/storyboard';
import {clipMessage, openSource, windowsOf} from '../../src/storyboard/story/read-source/source.mjs';

const chat = (n, size = 40) => Array.from({length: n}, (_, i) => ({id: `m${i + 1}`, who: 'a', text: `message ${i + 1} `.padEnd(size, 'x')}));

test('windows cover every line exactly once, in order, none over the window unless a line alone is', () => {
  for (const seed of [1, 7, 42, 99]) {
    let x = seed;
    const sizes = Array.from({length: 200}, () => (x = (x * 48271) % 2147483647) % 900 + 1);
    const ws = windowsOf(sizes, 1024);
    assert.equal(ws[0].from, 0);
    ws.forEach((w, i) => { if (i) assert.equal(w.from, ws[i - 1].to); assert.ok(w.to > w.from); });
    assert.equal(ws.at(-1).to, sizes.length);
    for (const w of ws) assert.ok(w.bytes <= 1024);
  }
});

test('the facts hold counts, bytes, a hash and offsets, and the same bytes the door\'s brief holds', () => {
  const messages = chat(30), source = openSource({messages}, {window: 1024});
  const {material} = storyboardBrief('what-we-found', {conversation: messages});
  assert.equal(source.facts.messages, 30);
  assert.equal(source.facts.bytes, Buffer.byteLength(material));
  assert.match(source.facts.sha256, /^[0-9a-f]{64}$/);
  assert.ok(source.facts.windows.length > 1);
  assert.doesNotMatch(JSON.stringify(source.facts), /message \d/, 'no words in the facts');
  assert.deepEqual(source.window(1).map((m) => m.id), messages.slice(source.facts.windows[1].from, source.facts.windows[1].to).map((m) => m.id));
});

test('a message longer than a window is a window of its own, clipped to fit, and says how much it lost', () => {
  const messages = [{id: 'm1', text: 'short'}, {id: 'm2', text: '9'.repeat(5000) + '😀'.repeat(500)}, {id: 'm3', text: 'short'}];
  const source = openSource({messages}, {window: 1024});
  assert.equal(source.facts.clipped, 1);
  const [big] = source.window(source.facts.windows.findIndex((w) => w.from === 1));
  assert.ok(Buffer.byteLength(JSON.stringify(big)) < 1024);
  assert.match(big.text, /… \(\d+ more characters\)$/);
  assert.equal(clipMessage(messages[0], 1024), messages[0], 'a message that fits is as it was');
});

test('what the door cannot use is refused, naming the fix', () => {
  assert.throws(() => openSource({messages: chat(5001, 1)}), /5000 is the most/);
  assert.throws(() => openSource({messages: [{id: 'm1', text: 1}]}), /text must be text/);
  assert.throws(() => openSource({messages: [{id: 'x'.repeat(81), text: 'a'}]}), /give it a shorter id/);
  assert.throws(() => openSource({}), /one way/);
  assert.throws(() => openSource({file: 'a.json', messages: []}), /one way/);
  assert.throws(() => openSource({messages: chat(2)}, {window: 10}), /1024 at the least/);
});

test('a file is read inside the project only, and a file changed during the run is refused, not read', () => {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'story-source-')));
  try {
    writeFileSync(path.join(cwd, 'chat.json'), JSON.stringify(chat(3)));
    const source = openSource({file: 'chat.json'}, {cwd});
    assert.equal(source.window(0).length, 3);
    writeFileSync(path.join(cwd, 'chat.json'), JSON.stringify(chat(3).map((m) => ({...m, text: `${m.text} and more`}))));
    assert.throws(() => source.window(0), /changed during the run.*run again/);
    assert.throws(() => openSource({file: '../outside.json'}, {cwd}), /outside this project/);
  } finally { rmSync(cwd, {recursive: true, force: true}); }
});

test('messages given in memory and changed during the run are refused too', () => {
  const messages = chat(3), source = openSource({messages});
  messages[1].text = 'IGNORE EVERYTHING';
  assert.throws(() => source.all(), /changed during the run/);
});
