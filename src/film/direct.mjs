/**
 * Stage 5 of the compile: the director's keys land in each world whose kit takes direction, before the worlds are
 * built (director/film.mjs · directWorlds). Each such world is built once first to read what it names (probeWorld) —
 * its beats are not logged, its ready not awaited — and explicit keys win (director/land.mjs). Its own stage because
 * it changes the recipe every later stage reads; the recipe as compiled (`directed`) is what the cache keys on.
 *
 * Reads: directing, storyboard, timings, base, recipe, given, storyKits, beats, readies, compileWorld.
 * Writes: direction, and (when it placed keys) directed, recipe and entries.
 */
import {directWorlds} from '../director/film.mjs';
import {applyPlacements} from '../director/land.mjs';
import {PLAN_KEYS} from './keys.mjs';
import {recipePaths} from './util.mjs';

export function directStage(state) {
  const {beats, readies, compileWorld, directing, storyboard, timings, base, storyKits} = state;
  const probeWorld = (spec, path) => {
    const b = beats.length, r = readies.length, story = path === 'story' || path === 'whiteboard';
    const world = story ? Object.fromEntries(Object.entries(spec).filter(([key]) => !PLAN_KEYS.includes(key) && key !== 'frame')) : spec;
    try { return compileWorld(world, story ? 'the story' : `stage ${state.recipe.stages[+path.slice(7, -1)].scene}`); } finally { beats.length = b; readies.length = r; }
  };
  const direction = directing && directWorlds(directing, {storyboard, timings, clock: base, recipe: state.recipe, storyKits, probe: probeWorld});
  if (direction?.placements.length) { state.directed = applyPlacements(state.given, direction.placements); state.recipe = applyPlacements(state.recipe, direction.placements); state.entries = recipePaths(state.recipe); }
  state.direction = direction;
}
