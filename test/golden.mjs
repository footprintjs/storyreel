/**
 * Pixel pins for the example films. `node test/golden.mjs --write` records test/golden.json; the
 * test compares against it. Re-record only for an intended change (see src/pins.mjs).
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {compileFilm, evenTimings, paceTimings, cartoonKit, frameHashes} from '../src/index.mjs';
import {isometricKit} from '../src/kits/isometric/index.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
/**
 * Whether the pinned hashes can be compared here. The pins were recorded with macOS's fonts (the code panels
 * use Menlo): elsewhere the same film draws the same frames every time, but not these hashes.
 * STORYREEL_PINS=1 compares them anyway. Every test that compares against golden.json asks this.
 */
export const PINS_HERE = process.platform === 'darwin' || process.env.STORYREEL_PINS === '1';
/** How each example is compiled: its word times (silent), kits, pacing and strings. */
export const FILMS = {
  hello: {tail: 4, kits: []},
  shepherd: {tail: 3.5, kits: [cartoonKit]},
  worlds: {tail: .8, kits: [cartoonKit], pacing: 'pacing.json', strings: 'strings/en.json'},
  // A recap strip of the film's own frames (recalls) and a teaser: the tail leaves the teaser room to reach the next title.
  recap: {tail: 2.6, kits: []},
  // StoryDeck's isometric maps in a film: blocks placed from their wires, a labelled group floor, ports, packets riding.
  'iso-world': {tail: 1.5, kits: [isometricKit]},
  // An isometric world whose pieces move by intent: a box falls, a ball is thrown onto the server (kits/isometric, motion).
  'iso-motion': {tail: 1.5, kits: [isometricKit]},
  // A ball rolls, a crate slides, a cube tumbles off a shelf, each turn drawn as the grid sees it (footprint-story 0.31).
  'iso-roll': {tail: 1.5, kits: [isometricKit]},
  // A map drawn by hand (footprint-story 0.33's human:sketchy and human:hatch): each piece drawn as its pen goes.
  'iso-sketch': {tail: 8, kits: [isometricKit]},
  // One map in footprint-story's five named looks (0.34, 0.35, 0.37): outlined, line-art, paper-grain, duotone, sketchy, a stage each.
  'iso-looks': {tail: 1.5, kits: [isometricKit]},
};

/** An example compiled as pinned; `recipe` replaces its recipe (e.g. one with an extra note); `record` as compileFilm's. */
export async function compileExample(name, {recipe, record = false} = {}) {
  const {tail, kits, pacing, strings} = FILMS[name], dir = fileURLToPath(new URL(`../examples/${name}/`, import.meta.url));
  const read = file => JSON.parse(readFileSync(dir + file, 'utf8')), storyboard = read('storyboard.json');
  const even = evenTimings(storyboard, {tail}), timings = pacing ? paceTimings(storyboard, even, read(pacing)) : even;
  return compileFilm({storyboard, timings, recipe: recipe ?? read('recipe.json'), kits, root: dir, strings: strings ? read(strings) : null, record});
}

export async function hashFilms() {
  const out = {};
  for (const name of Object.keys(FILMS)) out[name] = frameHashes(await compileExample(name));
  return out;
}

// Only when run as the script itself: a module that imports this one (behaviour.mjs) may take --write too.
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  writeFileSync(here + 'golden.json', JSON.stringify(await hashFilms(), null, 1) + '\n');
  console.log('pinned', here + 'golden.json');
}
