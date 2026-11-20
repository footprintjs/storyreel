/**
 * Stage 1 of the compile: the options read and checked, the cast's names and the string table put into the text, the
 * director's rules and the director's notes read. Its own stage because every later one reads the film as it is said
 * (cast and strings in), and a bad option should refuse before anything is built.
 *
 * Reads: storyboard (or board), recipe, data (or capture), strings, lang, hostKeys, cast, strategies, reducedMotion, anchors.
 * Writes: storyboard, data, recipe (strings in), given (the recipe with the cast in, before the strings), used (the
 * string keys used), strings, cast, castGiven, filmLang, entries, directed, directing, notes, motion.
 */
import {readCast, withCast} from '../cast.mjs';
import {withStrings} from '../strings.mjs';
import {numberLocale} from '../claims.mjs';
import {readDirector} from '../director/settings.mjs';
import {readNotes} from '../notes.mjs';
import {checkRecipeKeys} from './keys.mjs';
import {recipePaths} from './util.mjs';

export function readOptions(state) {
  state.storyboard ??= state.board; state.data ??= state.capture ?? null;
  const {reducedMotion, anchors, hostKeys, lang, strategies} = state;
  if (typeof reducedMotion !== 'boolean') throw new Error(`compileFilm: reducedMotion must be true (the camera's moves cut to their end framing; handheld off) or false (the default), not ${JSON.stringify(reducedMotion)}`);
  if (anchors !== 'refuse' && anchors !== 'note') throw new Error(`compileFilm: anchors must be 'refuse' (the default: a phrase its scene does not say stops the compile) or 'note' (every phrase not as written is noted in film.anchors, so all are checked in one pass), not ${JSON.stringify(anchors)}`);
  let recipe = state.recipe;
  checkRecipeKeys(recipe, hostKeys);
  // The film's first shot is its story world (the shots are the story, then each stage): a recipe names it. An empty
  // board is said ("items": []), never assumed — a recipe that lost its story would otherwise open on a blank board.
  const storyGiven = recipe.story ?? recipe.whiteboard;
  if (storyGiven === undefined) throw new Error('compileFilm: the recipe has no story, and the film\'s first shot is its story world: give "story": {"kit": "whiteboard", "items": []} for an empty board, or {"kit": "<your kit>", …}');
  if (!storyGiven || typeof storyGiven !== 'object' || Array.isArray(storyGiven)) throw new Error(`compileFilm: the recipe's ${recipe.story !== undefined ? 'story' : 'whiteboard'} is the story world, {"kit": "whiteboard", "items": […]} or {"kit": "<your kit>", …}, not ${JSON.stringify(storyGiven)}`);
  // The language the film is shown in (a BCP 47 tag, or none): the numbers on screen are read by it (claims.mjs).
  let filmLang; try { filmLang = numberLocale(lang)?.lang ?? null; } catch (e) { throw new Error(`compileFilm: ${e.message}`); }
  // The cast's names go into the text first ({{role}} → name; cast.mjs), so every reader sees the film as it is said.
  const castGiven = state.cast, cast = readCast(castGiven);
  const storyboard = withCast(state.storyboard, cast, 'storyboard'); recipe = withCast(recipe, cast, 'recipe'); const strings = state.strings === null ? null : withCast(state.strings, cast, 'strings');
  const given = recipe, used = new Set(); recipe = withStrings(recipe, strings, used);
  const entries = recipePaths(recipe), directed = given;
  // The director (director.mjs): off (no "director", or "off") reads nothing and changes nothing. On, its rules are
  // the recipe's, the application's for the film's language (strategies.director), then the neutral ones.
  const directing = readDirector(recipe.director, {lang: filmLang, tables: strategies?.director ?? null});
  // The director's notes: one camera speed for the film (story kits take it as motion.cameraSpeed), cuts, pushes.
  const notes = readNotes(recipe.notes), motion = Object.freeze({cameraSpeed: notes.speed});
  Object.assign(state, {storyboard, recipe, given, used, strings, cast, castGiven, filmLang, entries, directed, directing, notes, motion});
}
