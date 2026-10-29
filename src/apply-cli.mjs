/**
 * storyreel apply "<scene> enter <transition>" ["<scene> move <move>" …] [--recipe file] [--record] [--config file] [--flag value …]:
 * the picks kept in the studio's gallery written into the project's recipe file, so an agent applies a pick with one
 * command and never reads the recipe. A thin wrapper: the film the config gives with the same flags as every tool
 * (--ep ep1) names the scenes and the transitions (its kits' among them); the recipe's file is the one that film reads
 * (tools.mjs · projectRecipe: --recipe, else recipe.json beside the config); the lines are applied to its text on a
 * flowchart (studio/apply.mjs · applyLines: every line checked before any is applied, only the values set changed in
 * the text); the edited recipe is compiled once, as the tools compile the film (tools.mjs · compileProject), so a
 * recipe the edit breaks is refused before anything is written; and the result is written as every output is
 * (files.mjs · writeOutput). One line is printed per change; --record prints, in their place, one JSON object —
 * {file, written, changes, refusals, record} — the record being the run's narrative: every line, its kind and the rule
 * that took it or refused it, with why. Nothing is written beside the recipe.
 * applyCommand returns the exit code: 0 written; 1 the project cannot be read, or the file cannot be written; 2 a
 * line, the file, the edited recipe or the command line refuses — and then nothing is written.
 */
import {CONFIG, loadInputs, compileProject, projectRecipe} from './tools.mjs';
import {transitionCatalog} from './transitions.mjs';
import {applyLines} from './studio/apply.mjs';
import {changeText} from './studio/picks.mjs';
import {writeOutput} from './files.mjs';
import {APPLY_USAGE as USAGE} from './studio/help.mjs';

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
  try { project = await loadInputs(given.film); } catch (e) { err(`storyreel apply: ${e.message}`); return 1; }
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
  // The lines pass their checks; the film they make is compiled once, as the tools compile it: one it refuses is said in its own words.
  try { await compileProject(project, applied.recipe); } catch (e) {
    const refusal = `the recipe with ${given.lines.length === 1 ? 'this line' : 'these lines'} does not compile: ${e.message}`;
    err(`storyreel apply: ${refusal}\nNothing was written.`);
    report({file, refusals: [refusal], record: applied.record});
    return 2;
  }
  try { writeOutput(file, applied.text); } catch (e) { err(`storyreel apply: ${e.message}\nNothing was written.`); return 1; }
  const changes = applied.changes.map(changeText);
  if (given.record) report({file, written: true, changes, record: applied.record});
  else out([...changes, `${file}: ${changes.length} ${changes.length === 1 ? 'change' : 'changes'} written`].join('\n'));
  return 0;
}
