/**
 * The project's own code, read fresh after an edit: what lets the studio compile a kit's change without a restart.
 *
 * Node keeps a module once it has loaded it, by its URL. So the studio imports the config under a version of its own
 * code — `?storyreel-code=<hash of every file it reaches>` — and a resolve hook hands that version on to every module the
 * config reaches inside its folder. A changed kit is a new hash, so a new set of modules; StoryReel and every package
 * (node_modules) stay the one copy loaded. A version comes back to the modules it loaded before when an edit is undone.
 * Node never drops a module, so every version loaded stays in memory until the studio stops: a kit is small, and a
 * restart frees them.
 *
 * What is followed is what codegraph.mjs reads (relative imports, transitively; assets loaded by `new URL`): the files
 * inside the config's folder and outside any node_modules. A module the config reaches outside that folder (a linked
 * package, a helper one folder up) is loaded once, as before: an edit to it needs a restart. An import chosen at run
 * time (`import(name)`) cannot be followed: it is listed (`unfollowed`), so the studio can say it is not watched; a file
loaded by a computed path (`new URL('./' + name, import.meta.url)`) is data, read again by film() on every compile.
 *
 * The hook (module.registerHooks) is Node 22.15 and later; on an older Node `reloads` is false and the studio says a
 * code change needs a restart, as it did before.
 */
import module from 'node:module';
import {createHash} from 'node:crypto';
import {realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {moduleReader, PARSED} from '../codegraph.mjs';

/** The query a version of the project's code rides on. */
export const CODE_PARAM = 'storyreel-code';
/** Whether this Node can load a module graph again (module.registerHooks). */
export const reloads = typeof module.registerHooks === 'function';

/** The folders whose code is versioned (each project's config folder, a real path ending in the separator). */
const folders = new Set();
let hooked = false;

/** Whether `file` (a real path) is inside `dir` (a real path ending in the separator) and in no node_modules there. */
const inside = (dir, file) => file.startsWith(dir) && !file.slice(dir.length).split(path.sep).includes('node_modules');
/** Whether `file` (a real path) is a project's own code: inside one of the folders. */
const ownCode = file => [...folders].some(dir => inside(dir, file));

/** The version a module URL was loaded under, or null. */
const versionOf = url => { try { return new URL(url).searchParams.get(CODE_PARAM); } catch { return null; } };

function hook() {
  if (hooked) return;
  hooked = true;
  module.registerHooks({resolve(specifier, context, next) {
    const resolved = next(specifier, context), version = context.parentURL && versionOf(context.parentURL);
    if (!version || !resolved.url.startsWith('file:') || versionOf(resolved.url)) return resolved;
    let file;
    try { file = realpathSync(fileURLToPath(resolved.url)); } catch { return resolved; }
    if (!ownCode(file)) return resolved;
    const url = new URL(resolved.url);
    url.searchParams.set(CODE_PARAM, version);
    return {...resolved, url: url.href};
  }});
}

/**
 * The project's code as it is now: {version, files, unfollowed, url}. `files` (real paths, sorted): every own file the
 * config reaches, its modules and the files they load. `version`: a hash of its modules, each one's path from the folder
 * and its bytes. `unfollowed` ([{from, code}]): the imports chosen at run time. `url`: the config's URL under that
 * version (its plain URL where this Node cannot reload). Every file is read again on each call.
 */
export function projectCode(config) {
  const real = realpathSync(config), folder = path.dirname(real) + path.sep;
  if (reloads) { folders.add(folder); hook(); }
  const read = moduleReader('studio'), files = new Set(), unfollowed = [];
  const follow = file => {
    let f;
    try { f = realpathSync(file); } catch { return; }
    if (files.has(f) || !inside(folder, f)) return;
    files.add(f);
    const m = read(f);
    m.unfollowed.filter(code => code.startsWith('import(')).forEach(code => unfollowed.push({from: f, code}));
    m.files.forEach(follow);
  };
  follow(real);
  // The version is the code's (an asset read as data — the storyboard, a JSON file — is read again by film() anyway).
  const sorted = [...files].sort(), h = createHash('sha256');
  for (const f of sorted.filter(f => PARSED.test(f))) h.update(path.relative(folder, f).split(path.sep).join('/')).update('\0').update(read(f).bytes).update('\0');
  const version = h.digest('hex').slice(0, 16), url = pathToFileURL(real);
  if (reloads) url.searchParams.set(CODE_PARAM, version);
  return {version, files: sorted, unfollowed, url: url.href};
}
