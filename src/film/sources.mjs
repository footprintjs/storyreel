/**
 * Stage 3 of the compile: what the film reads besides the recipe — the theme, the files under its root (each hashed
 * as it is read: fileLedger), the facts and example scenes its claims are checked against, how its scenes differ
 * from the real thing, the open claims a release may show, the rubric and the pace. Its own stage because these are
 * the film's sources: read once, checked before anything is built, and hashed into its inputs later.
 *
 * Reads: theme, root, recipe, storyboard, filmLang.
 * Writes: paper, files, within(file), factList, examples, declaredDiffers, allowOpen, rubricRule, pace, labels (empty
 * until the reading stage), differsUp (empty until the reading stage).
 */
import {readFileSync, statSync, realpathSync, existsSync} from 'node:fs';
import path from 'node:path';
import {insideRoot} from '../files.mjs';
import {hashBytes} from '../hash.mjs';
import {loadTheme} from '../theme.mjs';
import {readFacts, exampleScenes, readAllowOpen} from '../claims.mjs';
import {differsOf} from '../differs.mjs';
import {readRubricRule} from '../rubric.mjs';
import {readPace} from 'footprint-story/motion';

export function readSources(state) {
  const {theme, root, recipe, storyboard, filmLang} = state;
  const paper = typeof theme === 'object' && theme ? theme : loadTheme(theme ?? recipe.paperStyle ?? 'paper');
  // Files the recipe names load only from inside root (files.mjs · insideRoot: real paths, so no link leads out),
  // and every one the film reads is hashed into its inputs (fileLedger).
  const files = fileLedger(root), within = file => files.note(insideRoot(root, file));
  // Claims (claims.mjs): the facts the storyboard names — from inside the root, hashed for an approval but in no
  // segment's key (they draw nothing) — and the scenes it marks as example data, checked before anything is built.
  const factList = storyFacts(storyboard.facts, root, filmLang), examples = exampleScenes(storyboard), declaredDiffers = differsOf(storyboard, {lang: filmLang});
  // The open claims a release may show anyway, each with its reason (claims.mjs · readAllowOpen), and the rubric's minimum.
  const allowOpen = readAllowOpen(recipe.evidence, factList), rubricRule = readRubricRule(recipe.rubric);
  // How long its picture may sit still (footprint-story/motion · PACES): a lesson may pause, a promo may not — the slideshow check reads it.
  const pace = recipe.pace === undefined ? null : readPace(recipe.pace, 'recipe pace');
  const labels = [];   // when the example label is up (claims.mjs · labelSpans): set once the film's lines are known
  const differsUp = [];   // when a scene says how it differs from the real thing (differs.mjs): set with them
  Object.assign(state, {paper, files, within, factList, examples, declaredDiffers, allowOpen, rubricRule, pace, labels, differsUp});
}

/**
 * The files a film reads through its root (code excerpts, a kit's readFile and insideRoot), each hashed when
 * it is first asked for: `note(realPath)` records it, `list()` gives {path relative to root: hash}. A folder,
 * or a file that does not exist, is not recorded.
 */
function fileLedger(root) {
  const seen = new Map(), base = (() => { try { return realpathSync(path.resolve(root)); } catch { return path.resolve(root); } })();
  return {
    note(real) {
      if (!seen.has(real)) { let hash = null; try { if (statSync(real).isFile()) hash = hashBytes(readFileSync(real)); } catch { /* not there: nothing read */ } seen.set(real, hash); }
      return real;
    },
    list: () => Object.fromEntries([...seen].filter(([, h]) => h).map(([real, h]) => [path.relative(base, real).split(path.sep).join('/'), h]).sort(([a], [b]) => a.localeCompare(b))),
  };
}

/**
 * The facts a storyboard names (claims.mjs · readFacts): `facts` is a JSON file inside the film's root (files.mjs ·
 * insideRoot) or the list itself; null when it names none. The facts draw nothing, so they are not among the files that
 * reach every frame (film.inputs.files, in every segment's key): they are hashed on their own (film.inputs.facts), for
 * an approval to lock — a source corrected redraws nothing.
 */
function storyFacts(given, root, lang = null) {
  if (given === undefined) return null;
  if (typeof given !== 'string') return Object.freeze(readFacts(given, 'storyboard.facts', {root, lang}));
  const file = insideRoot(root, given);
  if (!existsSync(file)) throw new Error(`storyboard.facts names ${given}, which is not a file in the film's root (${root}): write the facts there ([{"value", "text"?, "source"}]), or give the list itself`);
  let list; try { list = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`storyboard.facts: ${given} is not JSON (${e.message}); it is a list of facts, [{"value", "text"?, "source"}]`); }
  return Object.freeze(readFacts(list, `storyboard.facts (${given})`, {root, lang}));
}

