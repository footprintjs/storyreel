#!/usr/bin/env node
/**
 * Worlds as scenes: a board, a cartoon valley with a pause-and-guess, code on paper, then the
 * board again — each world entering with a fade, a wipe or an iris. Silent, with the pacing a
 * voice would get (the guess waits in the pause), and every on-screen word from strings/en.json.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeFilm, evenTimings, cartoonKit} from 'footprint-storyreel';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = file => JSON.parse(readFileSync(here + file, 'utf8'));
const storyboard = read('storyboard.json');
const result = await makeFilm({storyboard, recipe: read('recipe.json'), kits: [cartoonKit], root: here,
  timings: evenTimings(storyboard), pacing: read('pacing.json'), strings: read('strings/en.json'), lang: 'en',
  out: process.argv[2] ?? `${here}out/worlds.mp4`, render: {stamp: 'FOOTPRINT STORYREEL · WORLDS'}});
console.log(`${result.out} · ${result.seconds.toFixed(1)} s · making-of: ${result.makingOf}`);
