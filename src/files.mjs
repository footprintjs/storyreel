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
import {spawnSync} from 'node:child_process';
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

const modeText = st => (st.mode & 0o7777).toString(8).padStart(4, '0');
const FIX = 'render into a folder of your own and copy the film out';

/**
 * This system's accounts, read once: {group, passwd, nsswitch} — /etc/group, /etc/passwd and /etc/nsswitch.conf (null
 * when it cannot be read) — and the platform; or null when the account files cannot be read.
 */
let accountsRead;
const readOrNull = file => { try { return readFileSync(file, 'utf8'); } catch { return null; } };
const systemAccounts = () => {
  if (accountsRead === undefined) {
    const group = readOrNull('/etc/group'), passwd = readOrNull('/etc/passwd');
    accountsRead = group === null || passwd === null ? null : {group, passwd, nsswitch: readOrNull('/etc/nsswitch.conf'), platform: process.platform};
  }
  return accountsRead;
};

/**
 * Whether the account files are the whole story: /etc/nsswitch.conf names exactly `files` for both `passwd` and `group`
 * — or `compat`, with no `+` line (an entry pulled in from a directory) in /etc/passwd or /etc/group. A directory
 * (sss, ldap, nis, winbind, systemd's userdb…) can hold members and accounts the files never show.
 */
export function filesOnly({nsswitch, passwd, group}) {
  if (typeof nsswitch !== 'string') return false;
  const lines = nsswitch.split('\n').map(l => l.replace(/#.*/, '').trim());
  const sources = db => lines.find(l => new RegExp(`^${db}\\s*:`).test(l))?.replace(/^\w+\s*:/, '').trim().split(/\s+/).filter(t => t && !t.startsWith('[')) ?? null;
  const fromFiles = db => {
    const s = sources(db);
    if (s?.length !== 1) return false;
    return s[0] === 'files' || (s[0] === 'compat' && ![passwd, group].some(text => /^\+/m.test(String(text))));
  };
  return fromFiles('passwd') && fromFiles('group');
}

/**
 * Whether group `gid` is this user's own and no one else's — a user private group (Linux's: umask 002 makes a project
 * folder 0775): the account files are the whole story (filesOnly), no member is listed in /etc/group but this user,
 * and no other account in /etc/passwd has it as its primary group. Never on macOS: its groups come from Directory
 * Services, and `staff` (20) is every user's primary group. `accounts` is {group, passwd, nsswitch, platform} (the
 * files' text), or null when they could not be read — then no group is private: a group-writable folder stays refused.
 */
export function privateGroup(gid, accounts) {
  if (!accounts || (accounts.platform ?? process.platform) === 'darwin' || !filesOnly(accounts)) return false;
  const rows = text => String(text).split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split(':'));
  const me = typeof process.getuid === 'function' ? process.getuid() : -1, users = rows(accounts.passwd);
  const myName = users.find(u => Number(u[2]) === me)?.[0];
  if (users.some(u => Number(u[3]) === gid && Number(u[2]) !== me)) return false;
  const row = rows(accounts.group).find(g => Number(g[2]) === gid);
  return Boolean(row) && (row[3] ?? '').split(',').map(m => m.trim()).filter(Boolean).every(m => m === myName);
}

/**
 * Who besides the folder's owner could change it (`st` as lstat describes it), in words, or null when no one: writable
 * by others, or by a group other than this user's own private one (privateGroup) — unless sticky.
 */
function changeableBy(st, accounts) {
  if (st.mode & 0o1000) return null;
  if (st.mode & 0o002) return {why: `can be changed by other users (mode ${modeText(st)}, no sticky bit)`, fix: FIX};
  const own = typeof process.getgid === 'function' && st.gid === process.getgid() && privateGroup(st.gid, accounts);
  if ((st.mode & 0o020) && !own) return {why: `can be changed by its group (mode ${modeText(st)}, no sticky bit; not provably a group of yours alone)`, fix: `chmod g-w it, or ${FIX}`};
  return null;
}

/** Why a folder on the way to an out, as lstat describes it (`st`), is not safe to write below ({why, fix}) — or null when it is. */
function unsafe(st, accounts) {
  if (!st.isDirectory() || st.isSymbolicLink()) return {why: 'is not a folder', fix: FIX};
  if (!ownedFolder(st) && st.uid !== 0) return {why: 'belongs to another user', fix: FIX};
  return changeableBy(st, accounts);
}

/** The mount table, as macOS's /sbin/mount prints it, read once (a reader: it writes nothing); null when it cannot be read. */
let mountsRead;
const systemMounts = () => {
  if (mountsRead === undefined) { const r = spawnSync('/sbin/mount', [], {encoding: 'utf8'}); mountsRead = r.error || r.status !== 0 ? null : r.stdout; }
  return mountsRead;
};

/**
 * The mounts in /sbin/mount's text: [{point, flags}], one per line "<device> on <point> (<flag>, <flag>, …)". A mount
 * point is absolute and a device's name may itself hold " on " (an SMB share "Films on tour"), so the point begins at
 * the LAST " on /" before the final " (…)".
 */
export function parseMounts(text) {
  return String(text).split('\n').map(l => /^(.*) on (\/.*) \(([^()]*)\)$/.exec(l.trim())).filter(Boolean)
    .map(([, , point, flags]) => ({point, flags: flags.split(',').map(f => f.trim()).filter(Boolean)}));
}

/** The mount holding `real` (the longest mount point it is at or below), or null. */
export function mountOf(real, mounts) {
  const below = m => real === m.point || real.startsWith(m.point.endsWith('/') ? m.point : `${m.point}/`);
  return mounts.filter(below).sort((a, b) => b.point.length - a.point.length)[0] ?? null;
}

/**
 * The one rule for where StoryReel writes (sshd's StrictModes, sudo's secure_path): a folder is safe to write below
 * only when no other user can rearrange any folder on its real path. Returns the REAL path of `dir` — every caller
 * writes only through it — after checking EVERY folder from it (or, for a `dir` still to be made, from the nearest
 * folder above it that exists) up to the root. Each must be a real folder (the path is resolved first, so a link is
 * judged by where it leads), owned by this user or root (scratch.mjs · ownedFolder), and writable by no one else —
 * unless it is sticky, where anyone may add an entry but only its owner (this user or root, as above) may replace or
 * remove one. Group-write is no one else's when the group is this user's own private group (privateGroup: Linux's
 * user private groups, umask 002, when the account files are the whole story; never on macOS). The first that fails
 * refuses, naming it and the fix. The real path is the disk's own spelling (realpathSync.native: on a disk that
 * ignores case, /volumes/ext is /Volumes/Ext). On macOS, a drive mounted with "Ignore ownership" (noowners) shows every
 * entry as the viewer's, so it is refused outright (the mount table, read once; unreadable, a path under /Volumes/
 * is refused). Node has no openat, so a check of a path is only as good as every folder above it: in a folder another user
 * could rearrange, they could swap one StoryReel made (its work folder, a target's folder) for a link to a file of
 * yours between the check and the write. Not read: a folder's ACL (macOS's chmod +a), and a network folder's owners
 * are what the server says — keep out in a folder of your own, on a local disk. Checked first, at every entry that
 * writes into a folder the caller names: renderFilm (and its `work`), makeFilm, makeRelease, breakdown, the tools'
 * stills, folderStore, pacing. `fs` replaces any of {lstat, realpath, exists, accounts, mounts, platform} (a test plays
 * another user, another system's folders, groups or drives; `mounts: null` is a table that cannot be read). On Windows (no POSIX modes) it returns the path resolved, unchecked.
 */
export function securePath(dir, fs = {}) {
  const wanted = path.resolve(dir);
  if (process.platform === 'win32') return wanted;
  const {lstat = lstatSync, realpath = realpathSync.native, exists = existsSync, platform = process.platform} = fs;
  const accounts = 'accounts' in fs ? fs.accounts : systemAccounts();
  let found = wanted;
  while (!exists(found) && path.dirname(found) !== found) found = path.dirname(found);
  const real = realpath(found);
  for (let at = real; ; at = path.dirname(at)) {
    const bad = unsafe(lstat(at), accounts);
    if (bad) throw new Error(`${at} ${bad.why}: StoryReel writes only below folders no other user can change (each yours or root's, writable by no one else unless sticky) — ${bad.fix}`);
    if (path.dirname(at) === at) break;
  }
  if (platform === 'darwin') refuseNoOwners(real, 'mounts' in fs ? fs.mounts : systemMounts());
  return path.join(real, path.relative(found, wanted));
}

/**
 * On macOS, refuse a real path on a drive mounted with "Ignore ownership" (noowners), read from the mount table (its
 * text; null when it could not be read). An unreadable table fails closed under /Volumes/, where external drives mount;
 * the internal disk (the system volume, /) is never refused for it.
 */
function refuseNoOwners(real, table) {
  const external = real === '/Volumes' || real.startsWith('/Volumes/');
  if (table === null) {
    if (external) throw new Error(`${real} is on a drive whose mount table cannot be read (/sbin/mount), so whether it ignores ownership cannot be told — render on the internal disk and copy the film out`);
    return;
  }
  const drive = mountOf(real, parseMounts(table));
  if (drive?.flags.includes('noowners')) throw new Error(`${real} is on ${drive.point}, a drive that ignores ownership (noowners): every folder on it looks like yours — render on the internal disk and copy the film out`);
}

/** The mode every folder StoryReel makes asks for: 0755. mkdir only narrows it by the umask (077 gives 0700), never widens it. */
export const FOLDER_MODE = 0o755;

/**
 * Make `dir` and any missing folder above it, each asking FOLDER_MODE — so never wider than 0755 under any umask (000
 * included), and narrower under a stricter one; nothing is chmod-ed afterwards (a chmod follows a link, and would widen
 * a stricter umask). The path is checked before (securePath: the folders that exist) and again after (every folder
 * now, those just made included): a folder another user made on the way, or a link they planted there between the two
 * — mkdir follows one — refuses, as does a path that now leads anywhere else. Returns the checked real path; write
 * through it only. `fs` is securePath's, plus `mkdir` (a test plants a link between the check and the mkdir).
 */
export function makeFolder(dir, fs = {}) {
  const planned = securePath(dir, fs);
  (fs.mkdir ?? mkdirSync)(planned, {recursive: true, mode: FOLDER_MODE});
  const made = securePath(planned, fs);
  if (made !== planned) throw new Error(`${planned} changed while StoryReel made it: a folder on the way now leads to ${made} — ${FIX}`);   // refusal: FIX names it
  return made;
}

/** Why StoryReel may not write into the folder lstat describes as `st`, or null when it may (see outputFolder). */
function notOurs(st, accounts) {
  if (st.isSymbolicLink()) return 'is a link';
  if (!st.isDirectory()) return 'is a file';
  if (!ownedFolder(st)) return 'belongs to another user';
  if (process.platform !== 'win32') return changeableBy(st, accounts)?.why ?? null;
  return null;
}

/**
 * The folders StoryReel names inside the caller's `parent`, checked as outputFolder checks them but never made: each one
 * that is there must be a real folder this user owns that no other user can change (a link there is refused, never
 * followed); the first one missing ends the check, and outputFolder makes the rest when something is first written.
 * Returns where the last one is (or will be), inside the parent's real path. (The segment cache beside a video:
 * picture.mjs.)
 */
export function ownFoldersIn(parent, names, fs = {}) {
  const lstat = fs.lstat ?? lstatSync, accounts = 'accounts' in fs ? fs.accounts : systemAccounts();
  const base = securePath(parent, fs), list = [].concat(names);
  let at = base;
  for (const name of list) {
    at = path.join(at, name);
    let st; try { st = lstat(at); } catch { break; }   // not there yet
    const why = notOurs(st, accounts);
    if (why) throw new Error(`${at} ${why}: StoryReel keeps its cache only in a folder of its own there, that no one else can change — remove it, or name another folder (segments.dir)`);
  }
  return path.join(base, ...list);
}

/**
 * The folders StoryReel names inside the caller's `parent` (a release's <target> and work/<target>, a breakdown's
 * shots/, the tools' stills/), inside the parent's real path (securePath: every folder above it checked, and the
 * folders made there through that path only), each made when it is not there (0755 less the umask) and,
 * made now or found, written into only when it is a real folder this user owns (scratch.mjs · ownedFolder) that no
 * other user can change (not writable by group or others, unless sticky: there an entry is only its owner's to
 * replace). Anything else is refused, naming the fix: what is written in it could land wherever another user points
 * it. `names` is a name or a list of them, each a folder inside the one before. Returns the last folder's real path.
 * `fs.lstat` is fs.lstatSync (a test hands in its own to play another user).
 */
export function outputFolder(parent, names, fs = {}) {
  const lstat = fs.lstat ?? lstatSync, accounts = 'accounts' in fs ? fs.accounts : systemAccounts();
  let at = makeFolder(parent, fs);
  for (const name of [].concat(names)) {
    at = path.join(at, name);
    try { mkdirSync(at, {mode: FOLDER_MODE}); } catch (e) { if (e?.code !== 'EEXIST') throw e; }
    const why = notOurs(lstat(at), accounts);
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
    makeFolder(path.dirname(target));
    writeFileSync(target, readFileSync(path.join(base, f)), {flag: 'wx'});
  }
  return timings;
}

/** The mode the placed narration/ gets: FOLDER_MODE (0755) less the process's umask — never more than 0755, whatever the umask. */
export const plainFolderMode = () => FOLDER_MODE & ~process.umask();

/**
 * Put a paced copy of the voice in place as <out folder>/narration. First the copy — made for this user only
 * (scratch.mjs · makeScratch: 0700) — gets a folder's own mode, 0755 at most (plainFolderMode), while it is still
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
