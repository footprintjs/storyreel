/**
 * Files a recipe names (code excerpts today, pictures next) load only from inside the film's root
 * folder. The check compares REAL paths, so a symbolic link cannot lead out of the folder, and it
 * asks path.relative rather than how the paths begin: with root /x/film, the path
 * ../film-private/x.png begins like the root and is still outside it. A folder the pipeline writes into is copied by
 * its contents (copyRealFiles), so writing into the copy never writes through a link into what the user passed in.
 */
import path from 'node:path';
import {existsSync, realpathSync, statSync, mkdirSync, readdirSync, copyFileSync} from 'node:fs';

/**
 * The real path of `file` (relative to `root`, or absolute), or a refusal when it is outside `root`.
 * A file that does not exist yet is judged by its nearest folder that does (resolved for links too).
 */
export function insideRoot(root, file) {
  const base = realRoot(root), real = realPathOf(path.resolve(root, file)), rel = path.relative(base, real);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error(`${file} is outside ${root}: a recipe loads files only from inside the film's root folder (the root option); move the file inside it, or point root at a folder that holds it`);
  return real;
}

/** The root folder's real path, or a refusal that names the fix when it does not exist. */
function realRoot(root) {
  try { return realpathSync(path.resolve(root)); } catch {
    throw new Error(`root ${root} is not a folder that exists: pass the film's folder as the root option (default the working folder)`);
  }
}

/** A path with every symbolic link resolved: the file's own when it exists, else its nearest existing folder's plus the rest. */
function realPathOf(abs) {
  if (existsSync(abs)) return realpathSync(abs);
  const parent = path.dirname(abs);
  return parent === abs ? abs : path.join(realPathOf(parent), path.basename(abs));
}

/**
 * Copy a folder by its contents: every folder a new folder and every file a new file, links followed wherever they
 * are (the folder itself, a folder in it, a file in it), so nothing in the copy is a link and writing into it never
 * changes what was copied. (fs.cpSync with dereference follows only a link given as the folder itself: one inside
 * it is copied as a link.) A link that leads back into a folder being copied is refused (the copy would never end);
 * anything that is neither a file nor a folder (a socket) is left out.
 */
export function copyRealFiles(from, to, within = new Set()) {
  const real = realpathSync(from), stat = statSync(real);
  if (stat.isDirectory()) {
    if (within.has(real)) throw new Error(`copyRealFiles: ${from} leads back into ${real}, a folder being copied (a link loop): remove the link`);
    within.add(real); mkdirSync(to, {recursive: true});
    for (const name of readdirSync(real)) copyRealFiles(path.join(real, name), path.join(to, name), within);
    within.delete(real);
  } else if (stat.isFile()) copyFileSync(real, to);
}
