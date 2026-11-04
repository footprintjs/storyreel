/**
 * feedback.md on disk (feedback.mjs is its format), beside the recipe's file. Read only as a plain file of its own and
 * at most FILE_MOST bytes (files.mjs · readPlainFile: never through a link — which could hand the studio another file's
 * text to copy into a file the person shares — never from a FIFO or a device, which would hold the studio).
 *
 * Two kinds of process change it — the studio adds notes, `storyreel feedback` (the command line, the MCP server) ticks
 * them — so it is changed only under its lock (withFeedback: files.mjs · withFileLock, a lock file made exclusively),
 * and read again under it before anything is written: a note is added by one appended write (or, the first time, a new
 * file linked into place), a tick by the whole new text renamed over the file with its mode kept. None of them loses
 * another's line. Every write goes through files.mjs, into the folder's real path, checked first (securePath).
 */
import path from 'node:path';
import {appendToFile, readPlainFile, rewriteFile, securePath, withFileLock, writeNewFile} from '../files.mjs';
import {FEEDBACK} from './feedback.mjs';

/** The most bytes a feedback.md may hold: notes are short lines; one this big is ticked notes to clear. */
export const FILE_MOST = 1024 * 1024;
/** What to do when feedback.md's folder is not one StoryReel may write in. */
const FOLDER_FIX = 'keep the project in a folder of your own (notes are written beside its recipe file)';
const FILE_FIX = 'put feedback.md itself there, a plain file under 1 MB (move the notes done aside)';

/** The feedback.md beside a recipe's file. */
export const feedbackFile = recipeFile => path.join(path.dirname(path.resolve(recipeFile)), FEEDBACK);

/** feedback.md's text: '' when there is none yet; a refusal when it is a link, not a plain file, or too big. */
export const readFeedbackFile = file => readPlainFile(file, {most: FILE_MOST, fix: FILE_FIX}) ?? '';

/** The file at its folder's checked real path (securePath), refused with the notes' own advice. */
const placed = file => path.join(securePath(path.dirname(path.resolve(file)), {fix: FOLDER_FIX}), path.basename(file));

/** `fn(file)` run holding feedback.md's lock, `file` its checked real path: read it again in fn before writing it. */
export const withFeedback = (file, fn) => { const at = placed(file); return withFileLock(at, () => fn(at)); };

/**
 * A note added: `after` is `before` (the file as read under the lock) with the note's line. A file that is not there
 * yet is made whole (files.mjs · writeNewFile: linked into place); when `after` only adds to `before` it is appended in
 * one write; anything else (a project id put above a file the person wrote) is the whole text renamed over it, its mode
 * kept. Returns false — nothing written — when the file was not there as read: one appeared meanwhile (made by hand, or
 * by a tool that takes no lock), so the caller reads it again and makes the note against it as it is now (a note made
 * for an empty file carries a header and a fresh project id, which must never be appended to another).
 */
export function addToFeedback(file, before, after) {
  if (before === '') {
    if (writeNewFile(file, after)) return true;
    if (readFeedbackFile(file) !== '') return false;   // it has lines now: the note is made again against them
  }
  if (after.startsWith(before)) appendToFile(file, after.slice(before.length), {fix: FILE_FIX});
  else rewriteFile(file, after, {fix: FILE_FIX});
  return true;
}

/** Notes ticked: the whole new text, renamed over the file with its mode kept (read under the lock: withFeedback). */
export const rewriteFeedback = (file, text) => rewriteFile(file, text, {fix: FILE_FIX});
