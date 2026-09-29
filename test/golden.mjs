/**
 * Pixel pins for the example films. `node test/golden.mjs --write` records test/golden.json; the
 * test compares against it. Re-record only for an intended change (see src/pins.mjs).
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {compileFilm, evenTimings, paceTimings, cartoonKit, frameHashes} from '../src/index.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
/** How each example is compiled: its word times (silent), kits, pacing and strings. */
const FILMS = {
  hello: {tail: 4, kits: []},
  shepherd: {tail: 3.5, kits: [cartoonKit]},
  worlds: {tail: .8, kits: [cartoonKit], pacing: 'pacing.json', strings: 'strings/en.json'},
};

export async function compileExample(name) {
  const {tail, kits, pacing, strings} = FILMS[name], dir = fileURLToPath(new URL(`../examples/${name}/`, import.meta.url));
  const read = file => JSON.parse(readFileSync(dir + file, 'utf8')), storyboard = read('storyboard.json');
  const even = evenTimings(storyboard, {tail}), timings = pacing ? paceTimings(storyboard, even, read(pacing)) : even;
  return compileFilm({storyboard, timings, recipe: read('recipe.json'), kits, root: dir, strings: strings ? read(strings) : null});
}

export async function hashFilms() {
  const out = {};
  for (const name of Object.keys(FILMS)) out[name] = frameHashes(await compileExample(name));
  return out;
}

if (process.argv.includes('--write')) {
  writeFileSync(here + 'golden.json', JSON.stringify(await hashFilms(), null, 1) + '\n');
  console.log('pinned', here + 'golden.json');
}
