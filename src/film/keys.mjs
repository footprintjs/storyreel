/**
 * The keys a recipe, a stage, a world stage and a guess may carry, and the check on the recipe's own top-level keys.
 * Its own module because three stages of the compile read these lists (the options, the stages, the guesses), and a
 * list read in three places is written once.
 */
import {QUESTIONS} from '../progression.mjs';

/** The recipe's own top-level keys: anything else refuses, unless the host application names it in `hostKeys`. */
const RECIPE_KEYS = ['story', 'whiteboard', 'pushIn', 'card', 'stages', 'guesses', 'stepsTrack', 'notes', 'recalls', 'poster', 'reading', 'watching', 'listening', 'paperStyle', 'focus', 'emphasis', 'camera', 'foundSounds', 'progression', 'evidence', 'rubric', 'director', 'pace'];
/**
 * What every shot may say about itself (shots.mjs): what it is for, what is true when it starts and ends, what the
 * viewer must take in — and its answers to the five scene questions (progression.mjs).
 */
export const PLAN_KEYS = ['intent', 'continuity', 'reads', ...QUESTIONS];
export const STAGE_KEYS = new Set(['type', 'scene', 'chip', 'chipDark', 'title', 'file', 'label', 'code', 'lh', 'reveal', 'focus', 'glows', 'footer', 'list', 'loop', 'cards', 'closing', 'hero', 'frames', 'keys', 'teaser', 'enter', 'chrome', 'marks', 'columns', 'card', ...PLAN_KEYS]);
/** What every stage may carry; a stage kit that lists its own `keys` accepts these plus its own. */
export const COMMON_KEYS = ['type', 'scene', 'chip', 'chipDark', 'title', 'enter', 'chrome', 'card', ...PLAN_KEYS];
/**
 * The engine's stage features (code, reveal, focus, glows, marks, columns, list, cards…) are read on
 * the BUILT-IN stage types only. A kit stage gets the common keys and the footer; every key a kit
 * declares is the kit's own, and the engine never reads it (a kit's `marks` may mean tally marks).
 */
export const KIT_STAGE_ENGINE_KEYS = new Set(['footer']);
export const WORLD_KEYS = new Set(['type', 'scene', 'world', 'enter', 'frame', ...PLAN_KEYS]);
export const BUILT_IN_STAGES = new Set(['code', 'api', 'recap', 'summary', 'world']);
export const GUESS_KEYS = new Set(['after', 'question', 'answer', 'place', 'until']);

/**
 * Refuse a recipe key the engine does not read (law 1: an unknown key refuses). A host application that
 * keeps its own data in the recipe (e.g. a glossary under "terms") names those keys in `hostKeys`: they
 * are allowed and the engine ignores them.
 */
export function checkRecipeKeys(recipe, hostKeys) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) throw new Error('The recipe must be an object ({story, stages, …})');
  if (!Array.isArray(hostKeys) || !hostKeys.every(k => typeof k === 'string' && k)) throw new Error('compileFilm: hostKeys must be a list of key names (e.g. ["terms"])');
  for (const k of hostKeys) if (RECIPE_KEYS.includes(k)) throw new Error(`compileFilm: hostKeys names "${k}", which is the recipe's own key (the engine reads it); hostKeys are only for keys your application reads itself`);
  for (const key of Object.keys(recipe)) if (!RECIPE_KEYS.includes(key) && !hostKeys.includes(key)) throw new Error(`The recipe has unsupported key "${key}". A recipe takes ${RECIPE_KEYS.join(', ')}. If your application reads "${key}" itself, name it: compileFilm({…, hostKeys: ["${key}"]})`);
}
