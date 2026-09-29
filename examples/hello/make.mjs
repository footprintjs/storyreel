#!/usr/bin/env node
/**
 * The smallest complete film: a whiteboard story, a push-in to a paper card, one code stage —
 * silent (evenly spaced word times), made through the footprintjs pipeline.
 *   node examples/hello/make.mjs [out.mp4]
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeFilm, evenTimings} from 'footprint-storyreel';

const here = fileURLToPath(new URL('.', import.meta.url));
const storyboard = JSON.parse(readFileSync(here + 'storyboard.json', 'utf8'));
const recipe = JSON.parse(readFileSync(here + 'recipe.json', 'utf8'));
const out = process.argv[2] ?? `${here}out/hello.mp4`;
const result = await makeFilm({storyboard, recipe, root: here, timings: evenTimings(storyboard, {tail: 4}), out,
  render: {stamp: 'FOOTPRINT STORYREEL · HELLO'}});
console.log(`${result.out} · ${result.seconds.toFixed(1)} s\nmaking-of: ${result.makingOf}\n${result.chapters.join('\n')}`);
