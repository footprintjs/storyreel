/**
 * The bench's kit (bench/quick-edit.mjs): a story kit whose shots are modules of their own, as a series' kit is, and
 * which says where each shot's code lives (`sources`), so the default cache keys each piece by its own shot.
 */
import {compileLeft} from './shots/left.mjs';
import {compileRight} from './shots/right.mjs';

const SHOTS = {left: compileLeft, right: compileRight};

export const benchKit = {name: 'bench', story: {compile(spec, clock) {
  const make = SHOTS[spec.shot];
  if (!make) throw new Error(`bench: unknown shot "${spec.shot}"`);
  return make(spec, clock);
}},
sources: {entry: spec => [new URL(`./shots/${spec.shot}.mjs`, import.meta.url)], shared: [new URL('./index.mjs', import.meta.url)]}};
