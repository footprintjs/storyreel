/**
 * storyreel studio [--port n] [--config file] [--recipe file] [--flag value …]: the preview studio (server.mjs) on the
 * project here — the film its storyreel.config.mjs names, read and compiled as the review tools read it (tools.mjs ·
 * loadInputs: every other flag reaches its film(flags), a voice's timings paced). The gallery's Try compiles a copy of
 * the recipe from the same inputs (tools.mjs · compileProject); nothing is written.
 *
 * What it watches, and compiles again on: the recipe's file (tools.mjs · projectRecipe: --recipe, else recipe.json
 * beside the config — when it holds the recipe the config gives), storyboard.json beside that file, and every file the
 * config's film() lists in `watch` (a path relative to the config's folder, or absolute). An edit to the config's own
 * code is said, not compiled: Node keeps a module once it has loaded it, so the studio needs a restart for it.
 * The voice is not played: its paced narration is made by a render (makeFilm), so the picture plays on its own clock.
 * studioCommand returns the exit code once the studio is stopped (Ctrl+C): 0; 1 the project cannot be read or the
 * studio cannot listen; 2 the command line is wrong.
 */
import {existsSync, watchFile, unwatchFile} from 'node:fs';
import path from 'node:path';
import {once} from 'node:events';
import {CONFIG, readInputs, loadInputs, compileProject, projectRecipe} from '../tools.mjs';
import {startStudio} from './server.mjs';

/** The usage, as `storyreel --help` lists it (test/skills.test.mjs reads its command and flag lines). */
export const STUDIO_HELP = `  studio   — the preview studio on this project: the picture at the playhead, the timeline, what drew each spot, and a
           gallery of every transition and word move playing, to Try on the scene at the playhead and Keep as one line
           (storyreel apply); it compiles again when the recipe or storyboard changes. Local only (127.0.0.1), it writes
           nothing; any other flag reaches the config's film(flags), as the tools' do (--ep ep1)
             --port  the port, 0–65535 (4321; 0: any free one)
             --recipe  the recipe's JSON file, for the line a click names and to watch (default: recipe.json beside the config)`;
const USAGE = `storyreel studio [--port n] [--config file] [--recipe file] [--flag value …]\n${STUDIO_HELP}`;
const OWN = ['port', 'recipe'];

/** The command line read: {port, recipe, film (the flags its film() gets, --config among them)}, or {error}. */
function readArgs(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) return {error: `"${args[i]}" is not a flag (flags are --name value)`};
    const next = args[i + 1];
    flags[args[i].slice(2)] = next === undefined || next.startsWith('--') ? 'true' : (i++, next);
  }
  if (flags.port !== undefined && !(/^\d{1,5}$/.test(flags.port) && Number(flags.port) <= 65535)) return {error: `--port is a whole number 0–65535 (0: any free port), not ${JSON.stringify(flags.port)}`};
  if (flags.recipe === 'true') return {error: '--recipe needs the recipe\'s JSON file (e.g. --recipe ep1/recipe.json)'};
  const film = Object.fromEntries(Object.entries(flags).filter(([k]) => !OWN.includes(k)));
  return {port: flags.port === undefined ? 4321 : Number(flags.port), recipe: flags.recipe, film};
}

/** The files the config's film() asks to be watched (`watch`): each a path from the config's folder, or absolute. */
function configWatch(watch, folder) {
  if (watch === undefined) return [];
  if (!Array.isArray(watch) || !watch.every(f => typeof f === 'string' && f.trim())) throw new Error(`${CONFIG}: watch is a list of files the studio compiles again on (paths from the config's folder, or absolute), not ${JSON.stringify(watch)}`);
  return watch.map(f => path.resolve(folder, f));
}

/**
 * The studio's project: what it watches (the recipe's file and storyboard.json beside it, the config's `watch`) and
 * its load() — the film compiled as the tools compile it, with compile(recipe) for Try. Returns {load, watch, config,
 * recipeFile, notes}: notes say what it could not find (a recipe file it cannot link to).
 */
export async function projectStudio({film: flags, recipe}) {
  const read = await readInputs(flags), config = path.resolve(read.cwd, flags.config ?? CONFIG), folder = path.dirname(config), notes = [];
  let recipeFile = null;
  try { recipeFile = projectRecipe(read, {config: flags.config, recipe}).file; } catch (e) {
    if (recipe) throw e;
    notes.push(`the recipe's file is not known, so a click shows a drawing's entry without its line and the recipe is not watched (${e.message})`);
  }
  const besides = recipeFile ? [recipeFile, path.join(path.dirname(recipeFile), 'storyboard.json')] : [];
  const watch = [...new Set([...besides.filter(f => existsSync(f)), ...configWatch(read.inputs.watch, folder)])];
  const load = async () => {
    const project = await loadInputs(flags), {storyboard, recipe: given, kits = []} = project.inputs;
    return {film: await compileProject(project), storyboard, recipe: given, kits, title: storyboard.title,
      ...(recipeFile ? {source: {file: recipeFile}} : {}), compile: copy => compileProject(project, copy)};
  };
  return {load, watch, config, recipeFile, notes};
}

/** Run `storyreel studio …` until it is stopped (Ctrl+C); `out` and `err` print a line. Returns the exit code. */
export async function studioCommand(args, {out = console.log, err = console.error, stop = null} = {}) {
  if (args.includes('--help') || args[0] === 'help') { out(USAGE); return 0; }
  const given = readArgs(args);
  if (given.error) { err(`storyreel studio: ${given.error}\n${USAGE}`); return 2; }
  let project, studio;
  try { project = await projectStudio(given); } catch (e) { err(`storyreel studio: ${e.message}`); return 1; }
  try { studio = await startStudio({load: project.load, watch: project.watch, port: given.port, log: out}); } catch (e) {
    err(`storyreel studio: ${e.message}${e.code === 'EADDRINUSE' ? ` — another port: --port ${given.port + 1} (or --port 0, any free one)` : ''}`); return 1;
  }
  // The config is code: a change to it is said, never compiled with the module Node already holds.
  const restart = (now, before) => { if (now.mtimeMs !== before.mtimeMs) out(`studio: ${path.basename(project.config)} changed — restart the studio to use it (Node keeps a module once it has loaded it)`); };
  watchFile(project.config, {interval: 1000}, restart);
  out(`StoryReel Studio: ${studio.url}`);
  for (const note of project.notes) out(`studio: ${note}`);
  out(`watching ${project.watch.length ? project.watch.map(f => path.relative(process.cwd(), f) || f).join(', ') : 'nothing'}; local only (127.0.0.1); Ctrl+C stops it`);
  await (stop ?? Promise.race([once(process, 'SIGINT'), once(process, 'SIGTERM')]));
  unwatchFile(project.config, restart);
  await studio.close();
  return 0;
}
