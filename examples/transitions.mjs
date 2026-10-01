#!/usr/bin/env node
/**
 * The transitions sheet: every transition a shot can enter with, a row each, as a few moments of
 * picture A becoming picture B (the README's picture is this file's output).
 *   node examples/transitions.mjs [out.png]          → docs/transitions.png
 */
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {transitionSheet} from 'footprint-storyreel';

const out = process.argv[2] ?? fileURLToPath(new URL('../docs/transitions.png', import.meta.url));
writeFileSync(out, await transitionSheet({width: 1000}));
console.log(`wrote ${out}`);
