/**
 * storyreel apply "<scene> enter <transition>" ["<scene> move <move>" …] [--recipe file] [--record] [--config file] [--flag value …]:
 * the picks kept in the studio's gallery written into the project's recipe file, so an agent applies a pick with one
 * command and never reads the recipe. A thin wrapper: the film the config gives with the same flags as every tool
 * (--ep ep1) names the scenes and the transitions (its kits' among them); the recipe's file is the one that film reads
 * (tools.mjs · projectRecipe: --recipe, else recipe.json beside the config); the lines are applied to its text on a
 * flowchart (studio/apply.mjs · applyLines: every line checked before any is applied, the file's layout kept) and the
 * result is written as every output is (files.mjs · writeOutput). One line is printed per change; --record prints, in
 * their place, one JSON object — {file, written, changes, refusals, record} — the record being the run's narrative:
 * every line, its kind and the rule that took it or refused it, with why. Nothing is written beside the recipe.
 * applyCommand returns the exit code: 0 written; 1 the project cannot be read, or the file cannot be written; 2 a
 * line, the file or the command line refuses — and then nothing is written.
 */
import {CONFIG, readInputs, projectRecipe} from './tools.mjs';
import {transitionCatalog} from './transitions.mjs';
import {applyLines} from './studio/apply.mjs';
import {changeText} from './studio/picks.mjs';
import {writeOutput} from './files.mjs';

/** The usage, as `storyreel --help` lists it (test/skills.test.mjs reads its command and flag lines). */
export const APPLY_HELP = `  apply    "<scene> enter <transition>" | "<scene> move <move>" … — the lines kept in the studio's gallery, written into
           the project's recipe: a stage's entrance, or a kinetic world's word move. Every line is checked first (the
           scene, its stage or kinetic world, the name), and one that refuses writes nothing; one line printed per change.
           Any other flag reaches the config's film(flags), as the tools' do (--ep ep1)
             --recipe  the recipe's JSON file to write (default: recipe.json beside the config); it must hold the recipe that film reads
             --record  print one JSON object instead: {file, written, changes, refusals, record}, the record each line's checks and why`;
const USAGE = `storyreel apply "<scene> enter <transition>" ["<scene> move <move>" …] [--recipe file] [--record] [--config file] [--flag value …]\n${APPLY_HELP}`;

/** The command line read: {lines, recipe, record, film (the flags its film() gets, --config among them)}, or {error}. The lines come first. */
function readArgs(args) {
  const lines = [], flags = {};
  let i = 0;
  for (; i < args.length && !args[i].startsWith('--'); i++) lines.push(args[i]);
  for (; i < args.length; i++) {
    if (!args[i].startsWith('--')) return {error: `"${args[i]}" comes after a flag: give the lines first, each in quotes ("scene-05 enter torn")`};
    if (args[i] === '--record') { flags.record = true; continue; }
    const next = args[i + 1];
    flags[args[i].slice(2)] = next === undefined || next.startsWith('--') ? 'true' : (i++, next);
  }
  if (!lines.length) return {error: 'give the lines to apply, each in quotes: storyreel apply "scene-05 enter torn" "scene-03 move pop"'};
  if (flags.recipe === 'true') return {error: '--recipe needs the recipe\'s JSON file (e.g. --recipe ep1/recipe.json)'};
  const {recipe, record = false, ...film} = flags;
  return {lines, recipe, record, film};
}

/** Run `storyreel apply …`: `out` and `err` print a line (a test collects them). Returns the exit code. */
export async function applyCommand(args, {out = console.log, err = console.error} = {}) {
  if (args.includes('--help') || args[0] === 'help') { out(USAGE); return 0; }
  const given = readArgs(args);
  if (given.error) { err(`storyreel apply: ${given.error}\n${USAGE}`); return 2; }
  /** The result as --record prints it: one JSON object. */
  const report = fields => given.record && out(JSON.stringify({file: null, written: false, changes: [], refusals: [], record: [], ...fields}, null, 2));
  let project;
  try { project = await readInputs(given.film); } catch (e) { err(`storyreel apply: ${e.message}`); return 1; }
  let file = null, applied;
  try {
    const found = projectRecipe(project, {config: given.film.config ?? CONFIG, recipe: given.recipe}), {storyboard, kits = []} = project.inputs;
    file = found.file;
    applied = await applyLines(found.text, given.lines, {scenes: (storyboard.scenes ?? []).map(s => s?.id), catalog: transitionCatalog(kits)});
  } catch (e) {
    err(`storyreel apply: ${e.message}\nNothing was written.`);
    report({file, refusals: e.refusals ?? [e.message], record: e.record ?? []});
    return 2;
  }
  try { writeOutput(file, applied.text); } catch (e) { err(`storyreel apply: ${e.message}\nNothing was written.`); return 1; }
  const changes = applied.changes.map(changeText);
  if (given.record) report({file, written: true, changes, record: applied.record});
  else out([...changes, `${file}: ${changes.length} ${changes.length === 1 ? 'change' : 'changes'} written`].join('\n'));
  return 0;
}
