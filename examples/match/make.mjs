#!/usr/bin/env node
/**
 * Through a thing: a whiteboard circle becomes the cartoon's sun (a match cut), the shepherd acts his eureka,
 * and the camera goes through his idea (the bulb, a round opening) back to the board — then the finished file
 * is checked.
 *   node examples/match/make.mjs [out.mp4]
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeFilm, evenTimings, cartoonKit} from 'footprint-storyreel';

const here = fileURLToPath(new URL('.', import.meta.url));
const storyboard = JSON.parse(readFileSync(here + 'storyboard.json', 'utf8'));
const recipe = JSON.parse(readFileSync(here + 'recipe.json', 'utf8'));
const out = process.argv[2] ?? `${here}out/match.mp4`;
const result = await makeFilm({storyboard, recipe, kits: [cartoonKit], root: here, timings: evenTimings(storyboard, {tail: 2.2}), out, check: 'report',
  render: {stamp: 'FOOTPRINT STORYREEL · MATCH CUTS', captionFiles: ['srt']}});
const record = JSON.parse(readFileSync(result.makingOf, 'utf8'));
console.log(`${result.out} · ${result.seconds.toFixed(1)} s · checks ${record.finished.ok ? 'clean' : 'found problems'} · making-of: ${result.makingOf}`);
for (const f of record.finished.findings) console.log(`  ${f.severity} · ${f.check}: ${f.text}`);
