// Small films for test/quick-edit.test.mjs: drawn by tiny kits, so a test sees exactly what changed.
import {writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {compileFilm, evenTimings} from '../src/index.mjs';

const root = fileURLToPath(new URL('../examples/worlds/', import.meta.url));

/** A film whose steps track rewinds its own shot (a nested picture of an earlier moment), over two bar worlds. */
export async function stepsFilm() {
  const storyboard = {title: 'Track', scenes: [
    {id: 'a', narration: 'Here is a picture. Let us walk backwards, need by need, one step at a time.'},
    {id: 'b', narration: 'First a place, then an order, then the layout of every box.'},
    {id: 'c', narration: 'Now play it forward: the page, the tree, the layout and the picture.'},
  ]};
  const bar = (name, color) => ({name, story: {compile: () => ({hang: 1, spotAt: () => null, sounds: [], draw: (c, t) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 1600, 900); c.fillStyle = color; c.fillRect(0, 300, Math.min(1600, t * 150), 200); }})}});
  const track = {place: 'bottom', direction: 'back', from: ['a', 'Let us walk backwards'], rewind: {to: ['a', 'Here is a picture']},
    stations: [{label: 'picture', at: ['a', 'need by need']}, {label: 'place', at: ['b', 'First a place']}, {label: 'layout', at: ['b', 'the layout']}],
    flip: {at: ['c', 'Now play it forward'], stations: [{label: 'page', at: ['c', 'the page']}, {label: 'tree', at: ['c', 'the tree']}, {label: 'picture', at: ['c', 'and the picture']}]}};
  return compileFilm({storyboard, timings: evenTimings(storyboard), kits: [bar('red', '#ff0000'), bar('blue', '#0000ff')], root,
    recipe: {story: {kit: 'red'}, stages: [{type: 'world', scene: 'b', world: {kit: 'blue'}}, {type: 'world', scene: 'c', world: {kit: 'red'}}], stepsTrack: track}});
}

/** Three scenes, each a world of a kit; `kits` names each scene's kit spec, `extra` adds recipe keys. */
export const threeScenes = {title: 'Three', scenes: [
  {id: 'one', narration: 'The first picture stays on screen for a while, so there is time to look at it closely and think.'},
  {id: 'two', narration: 'The second picture comes in now, and it stays for a while too, while the voice keeps talking about it.'},
  {id: 'three', narration: 'The third picture is the last one, and the film ends on it after a few more words are said.'},
]};
export async function threeFilm({kits, specs, extra = {}, timings = evenTimings(threeScenes)}) {
  return compileFilm({storyboard: threeScenes, timings, kits, root,
    recipe: {story: specs[0], stages: [{type: 'world', scene: 'two', enter: 'fade', world: specs[1]}, {type: 'world', scene: 'three', enter: 'fade', world: specs[2]}], ...extra}});
}

/** A kit of flat colour, its colour read when it draws (a test changes it under an unchanged key). */
export function tintKit(state) {
  return {name: 'tint', story: {compile: () => ({hang: 1, draw: (c, t) => { c.fillStyle = state.color; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#222'; c.fillRect(100 + t * 20, 400, 80, 80); }})}};
}

/**
 * A kit whose shots are modules of their own in `dir` (shots/<name>.mjs, each drawing its colour), declaring where its
 * code lives (kit.sources) — or not, with `declare: false`. Returns {kit, shotFile(name), dir}.
 */
export async function shotsKit(dir, {declare = true, colors = {left: '#c0392b', right: '#1f4f9c'}} = {}) {
  mkdirSync(path.join(dir, 'shots'), {recursive: true});
  writeFileSync(path.join(dir, 'ink.mjs'), 'export const ink = "#222";\n');
  for (const [name, color] of Object.entries(colors)) writeFileSync(path.join(dir, 'shots', `${name}.mjs`), `import {ink} from '../ink.mjs';\nexport const draw = (c, t) => { c.fillStyle = '${color}'; c.fillRect(0, 0, 1600, 900); c.fillStyle = ink; c.fillRect(200 + t * 10, 300, 60, 60); };\n`);
  const shots = Object.fromEntries(await Promise.all(Object.keys(colors).map(async n => [n, await import(`${pathToFileURL(path.join(dir, 'shots', `${n}.mjs`)).href}?${Date.now()}`)])));
  const kit = {name: 'shots', story: {compile: spec => ({hang: 1, draw: (c, t) => shots[spec.shot].draw(c, t)})},
    ...(declare ? {sources: {entry: spec => [pathToFileURL(path.join(dir, 'shots', `${spec.shot}.mjs`))], shared: [path.join(dir, 'ink.mjs')]}} : {})};
  return {kit, shotFile: name => path.join(dir, 'shots', `${name}.mjs`), dir};
}
