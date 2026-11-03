/**
 * feedback.md on disk (feedback.mjs is its format), beside the recipe's file. Read only as a plain file of its own and
 * at most FILE_MOST bytes (files.mjs · readPlainFile: never through a link — which could hand the studio another file's
 * text to copy into a file the person shares — never from a FIFO or a device, which would hold the studio); written as
 * every output is (files.mjs · writeOutput: made under a new name, renamed onto its own, a link there replaced), into
 * the folder's real path, checked first (files.mjs · securePath).
 */
import path from 'node:path';
import {readPlainFile, securePath, writeOutput} from '../files.mjs';
import {FEEDBACK} from './feedback.mjs';

/** The most bytes a feedback.md may hold: notes are short lines; one this big is ticked notes to clear. */
export const FILE_MOST = 1024 * 1024;

/** The feedback.md beside a recipe's file. */
export const feedbackFile = recipeFile => path.join(path.dirname(path.resolve(recipeFile)), FEEDBACK);

/** feedback.md's text: '' when there is none yet; a refusal when it is a link, not a plain file, or too big. */
export const readFeedbackFile = file =>
  readPlainFile(file, {most: FILE_MOST, fix: 'put feedback.md itself there, a plain file under 1 MB (move the notes done aside)'}) ?? '';

/** feedback.md written, as every output is (files.mjs · writeOutput), into its folder's checked real path. Returns where. */
export const writeFeedbackFile = (file, text) => writeOutput(path.join(securePath(path.dirname(path.resolve(file))), path.basename(file)), text);
