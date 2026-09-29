#!/usr/bin/env node
/** The cartoon kit's first scene: a shepherd counts sheep with pebbles (silent, even word times). */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeFilm, evenTimings, cartoonKit} from 'footprint-storyreel';

const here = fileURLToPath(new URL('.', import.meta.url));
const storyboard = JSON.parse(readFileSync(here + 'storyboard.json', 'utf8'));
const recipe = JSON.parse(readFileSync(here + 'recipe.json', 'utf8'));
const out = process.argv[2] ?? `${here}out/shepherd.mp4`;
const result = await makeFilm({storyboard, recipe, kits: [cartoonKit], root: here, timings: evenTimings(storyboard, {tail: 3.5}), out,
  render: {stamp: 'FOOTPRINT STORYREEL · CARTOON KIT PROOF'}});
console.log(`${result.out} · ${result.seconds.toFixed(1)} s · making-of: ${result.makingOf}`);
