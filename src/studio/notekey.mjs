/**
 * Which notes in a project's feedback.md the person left in their own studio (note.mjs writes them, feedback-read.mjs
 * reads them). Files someone sends you can carry a feedback.md, and its lines must never pass for your requests: the
 * studio signs each note it writes with a key that lives with the person, not the project (STORYREEL_HOME, or
 * ~/.storyreel), and a reader lists only the notes that key signed for that project.
 *
 * A note is signed against the project id the file's first line holds (made once, at random: feedback.mjs), never the
 * folder's path: a project moved or renamed keeps its notes yours. What is signed is the note's body — its anchors and
 * words — with its id, and not its checkbox, so ticking it keeps it yours. Each line also names the key that signed it,
 * for that project only (keyName): a line it names with another key is someone else's, one that names yours and does
 * not check is edited, and two projects' lines cannot be told for one person's.
 *
 * The key is read from the file it opened, never through a link, and must be a plain file of this user's that no one
 * else can read (StoryDeck's noteKey.js holds its key to the same checks); and it never lives inside the project's
 * folder, which may be shared.
 *
 *   noteKey(home, {create: true, project})   → {key} (a Buffer) | {key: null, why}
 *   keyName(key, project)                    the key's name in that project's lines: 8 hex
 *   signNote(key, {project, id, by, body})   the signature: 32 hex
 *   signedBy(key, note, project)             whether the key signed this note (read back) for that project
 */
import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {closeSync, constants, fstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';

/** Where the person's StoryReel state lives: STORYREEL_HOME (a relative one from the home folder), or ~/.storyreel. */
export const storyreelHome = () => path.resolve(homedir(), process.env.STORYREEL_HOME || '.storyreel');

const KEY = /^[0-9a-f]{64}$/;
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;

/** Why an opened key file cannot be trusted to sign — not a plain file, open to others, someone else's — or null. */
function untrusted(st) {
  if (!st.isFile()) return 'is not a plain file';
  if (st.nlink > 1) return 'has another name (a hard link) — a copy of the key may sit where others can read it';
  if (process.platform === 'win32') return null;
  if (st.mode & 0o077) return 'can be read or written by others (chmod 600 it)';
  return typeof process.getuid === 'function' && st.uid !== process.getuid() ? 'belongs to another user' : null;
}

/** The key file opened for reading without following a link: its descriptor, null when there is none, -1 a link. */
function openKey(file) {
  try {
    return openSync(file, constants.O_RDONLY | NOFOLLOW);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    if (e.code === 'ELOOP' || e.code === 'EMLINK') return -1;
    throw e;
  }
}

/** A path's real place, even before it exists: its nearest existing folder's real path, and the rest of the way. */
function realPlace(p) {
  const rest = [];
  for (let at = path.resolve(p); ; at = path.dirname(at)) {
    try { return path.join(realpathSync(at), ...rest.reverse()); } catch { /* not there yet */ }
    if (path.dirname(at) === at) return path.resolve(p);
    rest.push(path.basename(at));
  }
}
const inside = (folder, p) => { const r = path.relative(folder, p); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };

/** A new key file, made only where none is: 32 random bytes, readable by its owner only. */
function makeKey(home, file) {
  mkdirSync(home, {recursive: true, mode: 0o700});
  let fd;
  try {
    fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
  } catch (e) {
    if (e.code === 'EEXIST') return;   // made meanwhile: read as any key is
    throw e;
  }
  try { writeSync(fd, randomBytes(32).toString('hex')); } finally { closeSync(fd); }
}

/**
 * The person's note key: {key} (a Buffer), or {key: null, why} when there is none yet (`create` makes it), it cannot be
 * trusted, or it would live inside `project` (the folder feedback.md is in, which may be shared). `missing` is true when
 * there is simply none yet: a reader then finds no note of yours, a writer makes one.
 */
export function noteKey(home = storyreelHome(), {create = false, project = null} = {}) {
  const file = path.join(home, 'key');
  if (project && inside(realPlace(project), realPlace(home))) {
    return {key: null, why: `the note key's folder ${home} is inside the project's folder, which may be shared — set STORYREEL_HOME elsewhere`};
  }
  let fd = openKey(file);
  if (fd === null && create) { makeKey(home, file); fd = openKey(file); }
  if (fd === null) return {key: null, missing: true, why: `there is no note key yet (${file}): the studio makes it with your first note`};
  if (fd === -1) return {key: null, why: `the note key ${file} is a link, not a plain file`};
  try {
    const why = untrusted(fstatSync(fd));
    if (why) return {key: null, why: `the note key ${file} ${why}`};
    const hex = readFileSync(fd, 'utf8').trim();
    return KEY.test(hex) ? {key: Buffer.from(hex, 'hex')} : {key: null, why: `the note key ${file} is not a key (64 hex characters)`};
  } finally {
    closeSync(fd);
  }
}

/** The key's name in one project's lines: 8 hex, the same for every note it signs there, another in any other project. */
export const keyName = (key, project) => createHmac('sha256', key).update(JSON.stringify(['storyreel-key', 1, project])).digest('hex').slice(0, 8);

/**
 * A note's signature under `key`: 32 hex over the project id, the note's id, the key's name and its body — its anchors
 * and the person's words as the line has them (feedback.mjs · noteLine), never the checkbox.
 */
export const signNote = (key, {project, id, by, body}) =>
  createHmac('sha256', key).update(JSON.stringify(['storyreel-note', 1, project, id, by, body])).digest('hex').slice(0, 32);

/** Whether `key` signed this note (feedback.mjs · noteLines: {id, by, body, sig}) for `project`. */
export function signedBy(key, note, project) {
  if (!key || !project || typeof note.sig !== 'string' || !/^[0-9a-f]{32}$/.test(note.sig)) return false;
  return timingSafeEqual(Buffer.from(signNote(key, {project, id: note.id, by: note.by, body: note.body})), Buffer.from(note.sig));
}
