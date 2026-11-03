/**
 * feedback.md on disk (feedback.mjs is its format): read only as a plain file of its own — never through a link, which
 * could hand the studio another file's text to copy into a file the person shares — and at most FILE_MOST bytes; written
 * as every output is (files.mjs · writeOutput: made under a new name, renamed onto its own, a link there replaced).
 */
import {closeSync, constants, fstatSync, openSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {writeOutput} from '../files.mjs';
import {FEEDBACK} from './feedback.mjs';

/** The most bytes a feedback.md may hold: notes are short lines; one this big is ticked notes to clear. */
export const FILE_MOST = 1024 * 1024;
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;

/** The feedback.md beside a recipe's file. */
export const feedbackFile = recipeFile => path.join(path.dirname(path.resolve(recipeFile)), FEEDBACK);

/** feedback.md's text: '' when there is none yet; a refusal when it is a link, not a plain file, or too big. */
export function readFeedbackFile(file) {
  let fd;
  try {
    fd = openSync(file, constants.O_RDONLY | NOFOLLOW);
  } catch (e) {
    if (e.code === 'ENOENT') return '';
    if (e.code === 'ELOOP' || e.code === 'EMLINK') throw new Error(`${file} is a link: StoryReel reads and writes feedback.md only as a file of its own — put the file itself there`, {cause: e});
    throw e;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw new Error(`${file} is not a plain file: feedback.md is one`);
    if (st.size > FILE_MOST) throw new Error(`${file} holds ${st.size} bytes, more than the ${FILE_MOST} a feedback.md may: clear the notes done, or move it aside`);
    return readFileSync(fd, 'utf8');
  } finally {
    closeSync(fd);
  }
}

/** feedback.md written, as every output is (files.mjs · writeOutput). */
export const writeFeedbackFile = (file, text) => writeOutput(file, text);
