/**
 * What recording the compile costs (compileFilm({…, record: true}); record.mjs · recordSteps): each example
 * film compiled with the record off and on, RUNS times each, in turn (after a warm-up of each), and the median
 * milliseconds printed. `node bench/compile.mjs [runs]`. Quote a figure only from a run of this script on a quiet machine.
 */
import {FILMS, compileExample} from '../test/golden.mjs';

const RUNS = Number(process.argv[2] ?? 15);
const median = list => { const s = [...list].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** One compile's wall time in milliseconds. */
async function timed(name, record) {
  const t0 = performance.now(); await compileExample(name, {record}); return performance.now() - t0;
}
/** Both medians of RUNS compiles, off and on taken in turn (so a slow moment hits both), after a warm-up of each. */
async function medians(name) {
  await timed(name, false); await timed(name, true);
  const off = [], on = [];
  for (let i = 0; i < RUNS; i++) { off.push(await timed(name, false)); on.push(await timed(name, true)); }
  return {off: median(off), on: median(on)};
}

console.log(`compileFilm, median of ${RUNS} runs (ms), node ${process.version}`);
console.log('film       off      on       extra');
for (const name of Object.keys(FILMS)) {
  const {off, on} = await medians(name);
  console.log(`${name.padEnd(10)} ${off.toFixed(1).padStart(7)}  ${on.toFixed(1).padStart(7)}  ${(on - off).toFixed(1).padStart(7)}`);
}
