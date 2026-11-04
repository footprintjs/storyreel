/**
 * storyreel studio [--port n] [--config file] [--recipe file] [--flag value …]: the preview studio (server.mjs) on the
 * project here — the film its storyreel.config.mjs names, read and compiled as the review tools read it (tools.mjs ·
 * loadInputs: every other flag reaches its film(flags), a voice's timings paced). The gallery's Try compiles a copy of
 * the recipe from the same inputs (tools.mjs · compileProject); nothing is written.
 *
 * What it watches, and compiles again on: the recipe's file (tools.mjs · projectRecipe: --recipe, else recipe.json
 * beside the config — when it holds the recipe the config gives), storyboard.json beside that file, every file the
 * config's film() lists in `watch` (a path relative to the config's folder, or absolute), and the project's own code:
 * the config and every module and file it reaches inside its folder (code.mjs), loaded again when one changes, and the
 * files its imports name that are not there yet. A module it reaches outside that folder, or an import chosen at run
 * time, is said when the studio starts: it needs a restart.
 * The voice is not played: its paced narration is made by a render (makeFilm), so the picture plays on its own clock.
 * studioCommand returns the exit code once the studio is stopped (Ctrl+C): 0; 1 the project cannot be read or the
 * studio cannot listen; 2 the command line is wrong.
 */
import {existsSync, realpathSync, watchFile, unwatchFile} from 'node:fs';
import path from 'node:path';
import {once} from 'node:events';
import {CONFIG, readInputs, loadInputs, compileProject, projectRecipe, outFolderOf} from '../tools.mjs';
import {startStudio} from './server.mjs';
import {projectCode, reloads} from './code.mjs';
import {STUDIO_USAGE as USAGE} from './help.mjs';

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
 * The studio's project: what it watches (the recipe's file and storyboard.json beside it, the config's `watch`), its
 * code (code.mjs: `code()` the code as last loaded) and its load() — the film compiled as the tools compile it, from the
 * code as it is now, with compile(recipe) for Try. Returns {load, watch, code, config, recipeFile, notes}: notes say
 * what it could not find (a recipe file it cannot link to, an import it cannot follow).
 */
export async function projectStudio({film: flags, recipe}) {
  const config = path.resolve(flags.cwd ?? process.cwd(), flags.config ?? CONFIG), folder = path.dirname(config), notes = [];
  let code = existsSync(config) ? projectCode(config) : null;   // none: readInputs refuses, naming the fix
  const read = await readInputs(flags, {url: code?.url});
  let recipeFile = null;
  try { recipeFile = projectRecipe(read, {config: flags.config, recipe}).file; } catch (e) {
    if (recipe) throw e;
    notes.push(`the recipe's file is not known, so a click shows a drawing's entry without its line and the recipe is not watched (${e.message})`);
  }
  const besides = recipeFile ? [recipeFile, path.join(path.dirname(recipeFile), 'storyboard.json')] : [];
  const watch = [...new Set([...besides.filter(f => existsSync(f)), ...configWatch(read.inputs.watch, folder)])];
  for (const {from, code: spec} of code.unfollowed) notes.push(`${path.relative(folder, from)} imports ${spec}, chosen at run time: an edit to that module needs a restart`);
  for (const file of code.outside) notes.push(`${path.relative(folder, file)} is outside the config's folder: it is loaded once, so an edit to it needs a restart`);
  const load = async () => {
    code = projectCode(config);
    const project = await loadInputs(flags, {url: code.url}), {storyboard, recipe: given, kits = []} = project.inputs;
    return {film: await compileProject(project), storyboard, recipe: given, kits, title: storyboard.title, out: outFolderOf(project),
      ...(recipeFile ? {source: {file: recipeFile}} : {}), compile: copy => compileProject(project, copy)};
  };
  return {load, watch, code: () => code, config, recipeFile, notes};
}

/**
 * Watch the project's code (project.code().files, the files the studio does not watch already) and compile again when
 * one changes, from the code as it is then; the files are watched again after each compile, so a module a kit starts
 * to import is watched from then on. Where this Node cannot load a module again (code.mjs · reloads), a change is said:
 * it needs a restart. Returns {files() (how many it watches), close()}.
 */
function watchCode(project, studio, out) {
  const real = f => { try { return realpathSync(f); } catch { return f; } };
  const watched = new Map(), data = new Set(project.watch.map(real));
  let pending, closed = false;
  const changed = (now, before) => {
    if (closed || (now.mtimeMs === before.mtimeMs && now.size === before.size)) return;
    if (!reloads) { out(`studio: the project's code changed — restart the studio to use it (Node ${process.versions.node} keeps a module once it has loaded it; Node 22.15 and later loads it again)`); return; }
    clearTimeout(pending);
    pending = setTimeout(() => studio.reload().then(err => { out(err ? `studio: the code changed, and the film refused — ${err}` : 'studio: the code changed — compiled again'); sync(); }), 150);
  };
  // A file an import names but nobody has written yet is watched too: creating it compiles again.
  const sync = () => {
    if (closed) return;
    const {files, missing} = project.code(), now = new Set([...files, ...missing].filter(f => !data.has(f)));
    for (const [f, fn] of watched) if (!now.has(f)) { unwatchFile(f, fn); watched.delete(f); }
    for (const f of now) if (!watched.has(f)) { watchFile(f, {interval: 300}, changed); watched.set(f, changed); }
  };
  sync();
  return {files: () => project.code().files.filter(f => !data.has(f)).length, close: () => { closed = true; clearTimeout(pending); for (const [f, fn] of watched) unwatchFile(f, fn); watched.clear(); }};
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
  const code = watchCode(project, studio, out);
  out(`StoryReel Studio: ${studio.url}`);
  for (const note of project.notes) out(`studio: ${note}`);
  const named = project.watch.map(f => path.relative(process.cwd(), f) || f), files = code.files();
  out(`watching ${named.length ? named.join(', ') : 'nothing'}, and the project's code (${files} file${files === 1 ? '' : 's'}); local only (127.0.0.1); Ctrl+C stops it`);
  await (stop ?? Promise.race([once(process, 'SIGINT'), once(process, 'SIGTERM')]));
  code.close();
  await studio.close();
  return 0;
}
