#!/usr/bin/env node
/**
 * A recap and a teaser: a whiteboard story, a hard cut into one code stage, a summary handed over to
 * on the page, then a recap strip of the film's own frames (recalls) and a teaser for the next film.
 * Silent (evenly spaced word times). Pinned in test/golden.json and test/behaviour.json.
 *   node examples/recap/make.mjs [out.mp4]
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeFilm, evenTimings} from 'footprint-storyreel';

const here = fileURLToPath(new URL('.', import.meta.url));
const storyboard = JSON.parse(readFileSync(here + 'storyboard.json', 'utf8'));
const recipe = JSON.parse(readFileSync(here + 'recipe.json', 'utf8'));
const out = process.argv[2] ?? `${here}out/recap.mp4`;
const result = await makeFilm({storyboard, recipe, root: here, timings: evenTimings(storyboard, {tail: 2.6}), out,
  render: {stamp: 'FOOTPRINT STORYREEL · RECAP'}});
console.log(`${result.out} · ${result.seconds.toFixed(1)} s · making-of: ${result.makingOf}`);
