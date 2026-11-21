#!/usr/bin/env node
/**
 * A request on a map: StoryDeck's isometric look in a film (kits/isometric). The first scene's blocks are placed from
 * their wires and come in as the voice names them, a group on its own labelled floor, packets riding each cable on the
 * film's clock, the camera framing the database by its name; the second places its blocks by hand on a grid written in
 * numbers, with a cable that plugs into ports. Silent (evenly spaced word times).
 *   node examples/iso-world/make.mjs [out.mp4]
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeFilm, evenTimings} from 'footprint-storyreel';
import {isometricKit} from 'footprint-storyreel/kits/isometric';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = (file) => JSON.parse(readFileSync(here + file, 'utf8'));
const storyboard = read('storyboard.json');
const result = await makeFilm({storyboard, recipe: read('recipe.json'), kits: [isometricKit], root: here,
  timings: evenTimings(storyboard, {tail: 1.5}), out: process.argv[2] ?? `${here}out/iso-world.mp4`, render: {stamp: 'FOOTPRINT STORYREEL · ISOMETRIC'}});
console.log(`${result.out} · ${result.seconds.toFixed(1)} s · making-of: ${result.makingOf}`);
