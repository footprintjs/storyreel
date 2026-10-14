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
 *
 * What StoryReel leaves in a folder the caller names — the video, poster.jpg, chapters.txt, the caption files,
 * making-of.json, a release's posts, a breakdown's spec and sheets, a tool's stills, a paced voice's files, a kept
 * segment — goes there one way, writeOutput: made under a new name nobody can have planted (or in the render's own
 * work folder), then renamed onto its name. A rename replaces whatever is at the name, a link included, and never
 * follows a link — so a link another user planted at an output's name in a shared folder (/tmp) is replaced, and the
 * file it points at is never written. The folders StoryReel names inside the caller's (a release's <target>, a
 * breakdown's shots) are made by outputFolder, which refuses a link there.
 */
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {existsSync, realpathSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync, chmodSync, copyFileSync, linkSync, lstatSync, constants} from 'node:fs';
import {ownedFolder} from './scratch.mjs';

/** A name beside `final` nobody can have planted: random, and created exclusively by whoever writes it. */
const besideName = final => path.join(path.dirname(final), `.storyreel-${randomBytes(8).toString('hex')}.part`);

/** Refuse a folder at an output's name: an output is a file, and StoryReel never removes a folder to make room. */
function refuseFolderAt(final, lstat) {
  let st; try { st = lstat(final); } catch { return; }
  if (st.isDirectory()) throw new Error(`${final} is a folder: StoryReel writes a file there, and never removes a folder to make room — move or rename the folder, or give another out`);
}

/** Make a file under a new name beside `final` (`make` must create it exclusively), then rename it onto `final`; a failure leaves nothing beside it. */
function viaBeside(final, make, ops) {
  const temp = besideName(final);
  try { make(temp); ops.renameSync(temp, final); } catch (e) { try { ops.rmSync(temp, {force: true}); } catch { /* the failure that matters is e */ } throw e; }
}

/**
 * Write an output — a file left under a name the caller (or anyone) can predict — so a link already at that name is
 * replaced, never written through. `what` is the bytes (a Buffer or a string), {move: file} (a file StoryReel made in
 * its own folder: FFmpeg's video in the render's work folder), or {copy: file, link?} (a file that stays where it is:
 * a hard link where one can be made, when `link`, else a copy). The file is renamed onto `final`: bytes and copies are
 * first made beside it under a new random name, created exclusively (so the same folder: the rename never crosses a
 * disk); a move renames straight from its folder, and when that folder is on another disk (EXDEV: a `work` folder the
 * caller named elsewhere) it is copied beside `final` the same way first. A folder at `final` is refused, never
 * removed. Returns `final`. `fs` replaces any of {writeFileSync, renameSync, copyFileSync, linkSync, rmSync, lstatSync}
 * (a test hands in its own to cross a disk on cue).
 */
export function writeOutput(final, what, fs = {}) {
  const ops = {writeFileSync, renameSync, copyFileSync, linkSync, rmSync, lstatSync, ...fs};
  refuseFolderAt(final, ops.lstatSync);
  const copyBeside = from => viaBeside(final, temp => ops.copyFileSync(from, temp, constants.COPYFILE_EXCL), ops);
  if (typeof what === 'string' || ArrayBuffer.isView(what)) viaBeside(final, temp => ops.writeFileSync(temp, what, {flag: 'wx'}), ops);
  else if (typeof what?.move === 'string') {
    try { ops.renameSync(what.move, final); } catch (e) {
      if (e?.code !== 'EXDEV') throw e;
      copyBeside(what.move);
      ops.rmSync(what.move, {force: true});
    }
  } else if (typeof what?.copy === 'string') {
    if (what.link) viaBeside(final, temp => { try { ops.linkSync(what.copy, temp); } catch { ops.copyFileSync(what.copy, temp, constants.COPYFILE_EXCL); } }, ops);
    else copyBeside(what.copy);
  } else throw new Error('writeOutput: give the bytes (a Buffer or a string), {move: file} or {copy: file, link?}');
  return final;
}

/** Writable by group or others, with no sticky bit: anyone who may write there may swap what is in it for a link. */
const openToOthers = st => (st.mode & 0o022) !== 0 && (st.mode & 0o1000) === 0;

/** Why StoryReel may not write into the folder lstat describes as `st`, or null when it may (see outputFolder). */
function notOurs(st) {
  if (st.isSymbolicLink()) return 'is a link';
  if (!st.isDirectory()) return 'is a file';
  if (!ownedFolder(st)) return 'belongs to another user';
  if (openToOthers(st) && process.platform !== 'win32') return `can be changed by other users (mode ${(st.mode & 0o7777).toString(8).padStart(4, '0')}, no sticky bit)`;
  return null;
}

/**
 * The folders StoryReel names inside the caller's `parent` (a release's <target> and work/<target>, a breakdown's
 * shots/, the tools' stills/), each made when it is not there (0755 less the umask: never writable by others) and,
 * made now or found, written into only when it is a real folder this user owns (scratch.mjs · ownedFolder) that no
 * other user can change (not writable by group or others, unless sticky: there an entry is only its owner's to
 * replace). Anything else is refused, naming the fix: what is written in it could land wherever another user points
 * it. `parent` is the caller's own choice (made if missing, never judged: a shared one, like /tmp, can at worst make a
 * write fail, never land elsewhere). `names` is a name or a list of them, each a folder inside the one before. Returns
 * the last folder's path. `fs.lstat` is fs.lstatSync (a test hands in its own to play another user).
 */
export function outputFolder(parent, names, fs = {}) {
  const lstat = fs.lstat ?? lstatSync;
  let at = path.resolve(parent);
  mkdirSync(at, {recursive: true});
  for (const name of [].concat(names)) {
    at = path.join(at, name);
    try { mkdirSync(at, {mode: 0o755}); } catch (e) { if (e?.code !== 'EEXIST') throw e; }
    const why = notOurs(lstat(at));
    if (why) throw new Error(`${at} ${why}: StoryReel writes only into a folder of its own there, that no one else can change — remove it, or give another out`);
  }
  return at;
}

/**
 * Refuse, before anything is made, an output whose name holds a folder (writeOutput would refuse it only when it is
 * written, after the outputs before it): the paths a render, a film, a release or a breakdown will write, checked at
 * its start. Returns nothing; throws writeOutput's refusal.
 */
export function refuseFolders(finals, lstat = lstatSync) {
  for (const final of finals) refuseFolderAt(final, lstat);
}

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
 * voice paced before). Each is written as a NEW regular file at the same path inside `to` — a new, empty folder the
 * caller made (scratch.mjs · makeScratch) — created exclusively, so nothing already there is written over or through
 * (a file, a link: EEXIST); its bytes are read through any link: pacing rewrites the copy, and that never changes the
 * voice, and a read-only voice gives a writable copy. Nothing else in the voice folder is copied, or even listed: a folder of
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
  writeFileSync(path.join(to, 'timings.json'), bytes, {flag: 'wx'});
  for (const f of files) {
    const target = path.join(to, f);
    mkdirSync(path.dirname(target), {recursive: true});
    writeFileSync(target, readFileSync(path.join(base, f)), {flag: 'wx'});
  }
  return timings;
}

/** The mode a plain mkdir gives a folder: 0777 less the process's umask. */
export const plainFolderMode = () => 0o777 & ~process.umask();

/**
 * Put a paced copy of the voice in place as <out folder>/narration. First the copy — made for this user only
 * (scratch.mjs · makeScratch: 0700) — gets the mode a plain mkdir would give it (plainFolderMode), while it is still
 * ours and unnamed: never after the rename (a chmod follows links, and the name is then in a shared folder), and never
 * taken from the out folder (a sticky 1777 folder such as /tmp would make it writable by everyone). Then what is there
 * goes, and the copy takes its name. Another run placing its own voice at the same moment can slip a folder in between
 * the two (ENOTEMPTY, EEXIST): then once more — the film is made by then, and its record must still be written. Returns
 * the code it tried again on, or null. `fs` replaces any of {rmSync, renameSync, chmodSync} (a test hands in its own
 * to make the race happen on cue, or to see the order of the steps).
 */
export function placeVoice(copy, final, fs = {}) {
  const ops = {rmSync, renameSync, chmodSync, ...fs};
  ops.chmodSync(copy, plainFolderMode());
  const place = () => { ops.rmSync(final, {recursive: true, force: true}); ops.renameSync(copy, final); };
  try { place(); return null; } catch (e) {
    if (e?.code !== 'ENOTEMPTY' && e?.code !== 'EEXIST') throw e;
    place();
    return e.code;
  }
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
