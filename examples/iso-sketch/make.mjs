#!/usr/bin/env node
/**
 * A map drawn by hand: an isometric world in footprint-story's two hand-drawn style choices (kits/isometric, `style`,
 * footprint-story 0.33). `human:sketchy` draws each piece's edges as a hand would — the outline first, then the inner
 * edges, hooked at sharp corners, tapered, with a seeded tremor; `human:hatch` hatches the shaded faces after it. Every
 * stroke carries its own times, so each piece is drawn as its pen goes from the moment it comes in. Silent (evenly
 * spaced word times).
 *   node examples/iso-sketch/make.mjs [out.mp4]
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeFilm, evenTimings} from 'footprint-storyreel';
import {isometricKit} from 'footprint-storyreel/kits/isometric';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = (file) => JSON.parse(readFileSync(here + file, 'utf8'));
const storyboard = read('storyboard.json');
const result = await makeFilm({storyboard, recipe: read('recipe.json'), kits: [isometricKit], root: here,
  timings: evenTimings(storyboard, {tail: 8}), out: process.argv[2] ?? `${here}out/iso-sketch.mp4`, render: {stamp: 'FOOTPRINT STORYREEL · DRAWN BY HAND'}});
console.log(`${result.out} · ${result.seconds.toFixed(1)} s · making-of: ${result.makingOf}`);
