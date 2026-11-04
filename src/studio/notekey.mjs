/**
 * Which notes in a project's feedback.md the person left in their own studio (note.mjs writes them, feedback-read.mjs
 * reads them). Files someone sends you can carry a feedback.md, and its lines must never pass for your requests: the
 * studio signs each note it writes with a key that lives with the person, not the project (STORYREEL_HOME, or
 * ~/.storyreel), and a reader lists only the notes that key signed for that project id.
 *
 * What a signature proves, and no more: this person's studio wrote this body under this id for the project id the
 * file's first line holds. It does not prove the line is in the project it was written for — a feedback.md copied whole
 * (its id line with it) from one of the person's projects into another still verifies there, so a project shared once
 * can hand an old note back — nor that the line is still wanted. A done mark (signDone) proves the note was ticked in
 * the person's own tools, so a box unticked by hand, or an old copy of the line, never brings it back; a line deleted
 * and replayed from an older copy does come back. Nor does it make the anchors the person's: they are recipe text.
 *
 * A note is signed against the project id the file's first line holds (made once, at random: feedback.mjs), never the
 * folder's path: a project moved or renamed keeps its notes yours. What is signed is the note's body — its anchors and
 * words — with its id, and not its checkbox, so ticking it keeps it yours. Each line also names the key that signed it,
 * for that project only (keyName): a line it names with another key is someone else's, one that names yours and does
 * not check is edited, and two projects' lines cannot be told for one person's.
 *
 * The key is read as a plain file of its own (files.mjs · readPlainFile: never through a link, a FIFO or a device),
 * and must be one of this user's that no one else can read and that has no second name (StoryDeck's noteKey.js holds
 * its key to the same checks); it is made once, a new 0600 file written whole and linked into place (files.mjs ·
 * writeNewFile: no reader ever sees it empty, and two studios making one at once keep the first); and
 * it never lives inside the project's folder, which may be shared.
 *
 *   noteKey(home, {create: true, project})   → {key} (a Buffer) | {key: null, why, missing?}
 *   keyName(key, project)                    the key's name in that project's lines: 8 hex
 *   signNote(key, {project, id, by, body})   the signature: 32 hex
 *   signedBy(key, note, project)             whether the key signed this note (read back) for that project
 */
import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {makeFolder, readPlainFile, writeNewFile} from '../files.mjs';

/** Where the person's StoryReel state lives: STORYREEL_HOME (a relative one from the home folder), or ~/.storyreel. */
export const storyreelHome = () => path.resolve(homedir(), process.env.STORYREEL_HOME || '.storyreel');

const KEY = /^[0-9a-f]{64}$/;
/** A key file is 64 hex characters and a line ending at most: anything longer is not one. */
const KEY_MOST = 256;

/** Why an opened key file cannot be trusted to sign — a second name, open to others, someone else's — or null. */
function untrusted(st) {
  if (st.nlink > 1) return 'has another name (a hard link), so a copy of the key may sit where others can read it: remove the other name';
  if (process.platform === 'win32') return null;
  if (st.mode & 0o077) return 'can be read or written by others: chmod 600 it';
  return typeof process.getuid === 'function' && st.uid !== process.getuid() ? 'belongs to another user: make your own (move it aside; the studio makes a new one)' : null;
}

/** A path's real place, even before it exists: its nearest existing folder's real path, and the rest of the way. */
function realPlace(p) {
  const rest = [];
  for (let at = path.resolve(p); ; at = path.dirname(at)) {
    try { return path.join(realpathSync.native(at), ...rest.reverse()); } catch { /* not there yet */ }
    if (path.dirname(at) === at) return path.resolve(p);
    rest.push(path.basename(at));
  }
}
/** Whether `p` is `folder` or inside it: a name that only begins with two dots (`..x`) is inside. */
const inside = (folder, p) => { const r = path.relative(folder, p); return r === '' || !(r === '..' || r.startsWith(`..${path.sep}`) || path.isAbsolute(r)); };

/** A pause of `ms`, waited where it stands (noteKey is not async): only for the one read again below. */
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * The key file's text, as readPlainFile reads it (null when there is none), held to `untrusted`. Read again once, after
 * a moment, when it had two names or no bytes yet: that is how it looks for the instant another studio puts a new key
 * in place (files.mjs · writeNewFile links it, or on a disk with no hard links creates it, then writes it). A second
 * name or an empty file still there then is refused (or read as not a key), as any would be.
 */
function keyText(file) {
  let twoNames = false;
  const read = () => readPlainFile(file, {most: KEY_MOST, judge: st => { twoNames = st.nlink > 1; return untrusted(st); }, fix: 'the note key must be a plain file of yours alone (STORYREEL_HOME, or ~/.storyreel/key)'});
  try {
    const text = read();
    if (text !== '') return text;
  } catch (e) { if (!twoNames) throw e; }
  pause(50);
  return read();
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
  try {
    let hex = keyText(file);
    if (hex === null && create) {
      const folder = makeFolder(home, {fix: 'set STORYREEL_HOME to a folder of your own'});
      writeNewFile(path.join(folder, 'key'), randomBytes(32).toString('hex'), {mode: 0o600});   // made meanwhile by another studio: that one is read
      hex = keyText(file);
    }
    if (hex === null) return {key: null, missing: true, why: `there is no note key yet (${file}): the studio makes it with your first note`};
    hex = hex.trim();
    return KEY.test(hex) ? {key: Buffer.from(hex, 'hex')} : {key: null, why: `the note key ${file} is not a key (64 hex characters): move it aside, and the studio makes a new one`};
  } catch (e) {
    return {key: null, why: e.message};
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

/** A note's done mark under `key`: 32 hex over the project id, the note's id and the key's name — what a reader trusts as done. */
export const signDone = (key, {project, id, by}) =>
  createHmac('sha256', key).update(JSON.stringify(['storyreel-done', 1, project, id, by])).digest('hex').slice(0, 32);

/** Whether the note's done mark (feedback.mjs · noteLines: {id, by, mark}) is `key`'s for `project`. */
export function doneBy(key, note, project) {
  if (!key || !project || typeof note.mark !== 'string' || !/^[0-9a-f]{32}$/.test(note.mark)) return false;
  return timingSafeEqual(Buffer.from(signDone(key, {project, id: note.id, by: note.by})), Buffer.from(note.mark));
}
