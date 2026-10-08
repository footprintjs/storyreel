/**
 * Where a film's files may be read from and written to.
 *
 * Files a recipe names (code excerpts today, pictures next) load only from inside the film's root
 * folder. The check compares REAL paths, so a symbolic link cannot lead out of the folder, and it
 * asks path.relative rather than how the paths begin: with root /x/film, the path
 * ../film-private/x.png begins like the root and is still outside it.
 *
 * A voice is paced in a copy, never in place: copyVoice copies exactly what the render reads, as new
 * files, and requireVoiceApart refuses a render whose out folder and voice folder overlap.
 */
import path from 'node:path';
import {existsSync, realpathSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';

/**
 * The real path of `file` (relative to `root`, or absolute), or a refusal when it is outside `root`.
 * A file that does not exist yet is judged by its nearest folder that does (resolved for links too).
 */
export function insideRoot(root, file) {
  const base = realRoot(root), real = realPathOf(path.resolve(root, file));
  if (!within(base, real)) throw new Error(`${file} is outside ${root}: a recipe loads files only from inside the film's root folder (the root option); move the file inside it, or point root at a folder that holds it`);
  return real;
}

/** The root folder's real path, or a refusal that names the fix when it does not exist. */
function realRoot(root) {
  try { return realpathSync(path.resolve(root)); } catch {
    throw new Error(`root ${root} is not a folder that exists: pass the film's folder as the root option (default the working folder)`);
  }
}

/**
 * A path with every symbolic link resolved: the file's own when it exists, else its nearest existing folder's plus the rest.
 * `real` resolves an existing path (realpathSync.native gives the disk's own spelling of each name).
 */
function realPathOf(abs, real = realpathSync) {
  if (existsSync(abs)) return real(abs);
  const parent = path.dirname(abs);
  return parent === abs ? abs : path.join(realPathOf(parent, real), path.basename(abs));
}

/** Whether absolute path `p` is `base` or inside it: asked with path.relative, never by how the two paths begin. */
function within(base, p) {
  const rel = path.relative(base, p);
  return !(rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel));
}

/**
 * Copy a voice for pacing: exactly what the render reads — the voice's timings.json and each scene's audio, plus the
 * .unpaced.wav pacing leaves beside an audio file when the voice has one (so pacing.mjs · applyPacing still refuses a
 * voice paced before). Each is written as a NEW regular file at the same path inside `to` (a folder made here, so it
 * must not exist yet), its bytes read through any link: pacing rewrites the copy, and that never changes the voice,
 * and a read-only voice gives a writable copy. Nothing else in the voice folder is copied, or even listed: a folder of
 * takes linked beside the voice is never walked.
 *
 * A scene's audio is named by a path inside the voice folder: one that leads out of it (../takes/a.wav, an absolute
 * path) is refused before anything is written. Links inside the folder are followed, wherever they lead: they are
 * only read. An audio file that does not exist is left out; pacing then names it, or gives a silent scene generated
 * silence. Returns the voice's timings, as read.
 */
export function copyVoice(voice, to) {
  const base = path.resolve(voice), timingsFile = path.join(base, 'timings.json');
  if (!existsSync(timingsFile)) throw new Error(`voice: ${voice} has no timings.json: give narrationDir the voice folder (its timings.json beside the scene audio)`);
  const bytes = readFileSync(timingsFile), timings = JSON.parse(bytes.toString('utf8')), files = new Set();
  for (const scene of Array.isArray(timings?.scenes) ? timings.scenes : []) {
    if (!scene?.audio) continue;
    // Pacing and the render JOIN the name to the copy's folder (path.join), so the name must mean the same thing joined
    // as resolved: a relative path that stays inside. An absolute one resolves from the disk's root but joins below
    // the copy, and its "/../.." can join back up to the voice itself, so it is refused even when it names a file inside.
    const rel = typeof scene.audio === 'string' ? path.normalize(scene.audio) : '';
    // (A control character — a line break — has no place in a file's name: it would break the lists ffmpeg is given.)
    if (!rel || path.isAbsolute(scene.audio) || /[\u0000-\u001f\u007f]/.test(scene.audio) || rel === '..' || rel.startsWith(`..${path.sep}`)) throw new Error(`voice: scene "${scene.id}" names its audio ${JSON.stringify(scene.audio)}, outside the voice folder ${voice}: name each scene's audio by a path inside the voice folder, relative to it (audio/${scene.id}.wav)`);
    const file = path.join(base, rel);
    for (const f of [file, file.replace(/\.wav$/, '.unpaced.wav')]) if (existsSync(f)) files.add(path.relative(base, f));
  }
  mkdirSync(to);
  writeFileSync(path.join(to, 'timings.json'), bytes);
  for (const f of files) {
    const target = path.join(to, f);
    mkdirSync(path.dirname(target), {recursive: true});
    writeFileSync(target, readFileSync(path.join(base, f)));
  }
  return timings;
}

/**
 * Refuse a render whose out folder and voice folder overlap. makeFilm paces a copy of the voice in the out folder and
 * then replaces <out folder>/narration with it: a voice folder that is that folder, or lies inside it, would be
 * deleted, and one that holds it, or holds the out folder, would be written into. Compared by real path as the disk
 * spells it (realpathSync.native: on a disk that ignores case, Narration and narration are one folder); a folder that
 * does not exist yet is judged by its nearest one that does. A voice folder elsewhere inside the out folder is fine.
 */
export function requireVoiceApart(voice, outDir) {
  const real = p => realPathOf(path.resolve(p), realpathSync.native);
  const v = real(voice), out = real(outDir), narration = real(path.join(outDir, 'narration'));
  if (within(v, out) || within(v, narration) || within(narration, v)) throw new Error(`voice: the voice folder ${voice} and the render's out folder ${outDir} overlap — the render paces a copy of the voice in the out folder, then replaces ${path.join(outDir, 'narration')} with it, so it would write into the voice folder or delete it: keep the voice folder outside the render's out folder, and render outside the voice folder`);
}
