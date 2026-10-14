/**
 * A program run as a child (FFmpeg, ffprobe), its output read as it comes. One rule for every such run: a program that
 * cannot start — not installed, a wrong path — is a refusal the caller can catch, never an unhandled 'error' event that
 * stops Node. `finished` settles on the child's end (its exit code) or rejects with the start error, and is safe to
 * await late: it is caught at once, so a start error before the caller awaits it is not an unhandled rejection.
 */
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';

/** spawn(command, args, options), plus `finished`: a promise of the exit code that rejects when the program cannot start. */
export function spawned(command, args, options) {
  const child = spawn(command, args, options);
  const finished = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve(code));
  });
  finished.catch(() => {});
  return {child, finished};
}

/** Why a program could not start, in words: not there (ENOENT), or the system's own message. */
export const startError = (command, error) => (error?.code === 'ENOENT' ? `there is no ${path.basename(command)} at ${command}` : error?.message ?? String(error));

/** ffprobe beside the FFmpeg given (a folder holding both), or the one on the PATH. */
export function ffprobeBeside(ffmpeg) {
  const beside = ffmpeg.includes('/') || ffmpeg.includes(path.sep) ? path.join(path.dirname(ffmpeg), path.extname(ffmpeg) === '.exe' ? 'ffprobe.exe' : 'ffprobe') : null;
  return beside && existsSync(beside) ? beside : 'ffprobe';
}
