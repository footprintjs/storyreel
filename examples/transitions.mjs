#!/usr/bin/env node
/**
 * The transitions sheet: every transition a shot can enter with, a row each, as a few moments of
 * picture A becoming picture B (the README's picture is this file's output). `--names` draws only the ones
 * named, a small sheet to choose between (e.g. the paper ones for a recap → new episode cut).
 *   node examples/transitions.mjs [out.png]                              → docs/transitions.png
 *   node examples/transitions.mjs --names torn,inkBleed,curl picks.png   → three rows
 */
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {transitionSheet, TRANSITIONS, TRANSITION_NAMES} from 'footprint-storyreel';

const {values, positionals} = parseArgs({options: {names: {type: 'string'}}, allowPositionals: true});
const out = positionals[0] ?? fileURLToPath(new URL('../docs/transitions.png', import.meta.url));
const names = values.names?.split(',').map(n => n.trim()).filter(Boolean) ?? null;
const unknown = names?.filter(n => !TRANSITION_NAMES.includes(n)) ?? [];
if (unknown.length) {
  console.error(`--names: ${unknown.join(', ')} ${unknown.length > 1 ? 'are not transitions' : 'is not a transition'}; the transitions are ${TRANSITION_NAMES.join(', ')}`);
  process.exit(2);
}
if (names && !names.some(n => n !== 'cut')) {
  console.error(`--names: no transition to draw (a cut draws nothing); name one of ${TRANSITION_NAMES.filter(n => n !== 'cut').join(', ')}`);
  process.exit(2);
}
const catalog = names ? Object.fromEntries(names.map(n => [n, TRANSITIONS[n]])) : TRANSITIONS;
writeFileSync(out, await transitionSheet({catalog, width: 1000}));
console.log(`wrote ${out}`);
