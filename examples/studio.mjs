#!/usr/bin/env node
/**
 * The preview studio on an example film: scrub it, play it, click a drawing to see its recipe entry.
 *   node examples/studio.mjs [hello|worlds|shepherd|recap]      then open the address it prints
 * Edit the example's recipe.json while it runs: the film is compiled again (a refusal is shown, and
 * the last good film stays). Local only; Ctrl+C stops it.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {compileFilm, evenTimings, paceTimings, cartoonKit} from 'footprint-storyreel';
import {startStudio} from 'footprint-storyreel/studio';

// How each example is compiled (as in test/golden.mjs): its silent word times, kits, pacing and strings.
const FILMS = {
  hello: {tail: 4, kits: []},
  shepherd: {tail: 3.5, kits: [cartoonKit]},
  worlds: {tail: .8, kits: [cartoonKit], pacing: 'pacing.json', strings: 'strings/en.json'},
  recap: {tail: 2.6, kits: []},
};
const name = process.argv[2] ?? 'hello', how = FILMS[name];
if (!how) { console.error(`Usage: node examples/studio.mjs [${Object.keys(FILMS).join('|')}]`); process.exit(1); }
const dir = fileURLToPath(new URL(`./${name}/`, import.meta.url)), read = file => JSON.parse(readFileSync(dir + file, 'utf8'));
const file = dir + 'recipe.json';

async function load() {
  const storyboard = read('storyboard.json'), recipe = read('recipe.json'), even = evenTimings(storyboard, {tail: how.tail});
  const timings = how.pacing ? paceTimings(storyboard, even, read(how.pacing)) : even;
  const film = await compileFilm({storyboard, timings, recipe, kits: how.kits, root: dir, strings: how.strings ? read(how.strings) : null});
  return {film, storyboard, recipe, source: {file}};
}
const studio = await startStudio({load, watch: [file, dir + 'storyboard.json'], port: Number(process.env.PORT ?? 4321)});
console.log(`StoryReel Studio · ${name}: ${studio.url}\nLocal only (127.0.0.1). Ctrl+C stops it.`);
