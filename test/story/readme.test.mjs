// The README draws the chart from toMermaid() on the real chart: this fails when the drawing and the chart differ.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {storyMermaid} from '../../src/storyboard/story.mjs';

const here = fileURLToPath(new URL('../../src/storyboard/story/', import.meta.url));

test('the README\'s drawing is the chart, as toMermaid() draws it', () => {
  const readme = readFileSync(path.join(here, 'README.md'), 'utf8');
  const drawn = /```mermaid\n([\s\S]*?)\n```/.exec(readme)?.[1];
  assert.ok(drawn, 'the README has a mermaid drawing');
  assert.equal(drawn.trim(), storyMermaid(), 'redraw it: node -e "import(\'./src/storyboard/story.mjs\').then(m => console.log(m.storyMermaid()))"');
});

test('every stage folder has a small README that names its threats, and no code file is long', () => {
  for (const name of readdirSync(here).filter((f) => statSync(path.join(here, f)).isDirectory())) {
    const readme = readFileSync(path.join(here, name, 'README.md'), 'utf8');
    assert.match(readme, /\*\*Threats/, `${name}/README.md names its threats`);
  }
  for (const file of readdirSync(here, {recursive: true}).filter((f) => f.endsWith('.mjs'))) {
    const lines = readFileSync(path.join(here, file), 'utf8').split('\n').length;
    assert.ok(lines < 300, `${file} has ${lines} lines: split it`);
  }
});
