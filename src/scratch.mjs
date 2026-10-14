/**
 * A run's scratch folders — a render's working files (render.mjs · prepareRender), makeFilm's paced copy of the voice
 * (pipeline.mjs), a pass's scratch in the system's temp folder (tempScratch) — are named by the host, the process and
 * a random suffix, <prefix>-<host>-<pid>-<XXXXXX>, and made by makeScratch alone: mkdtemp, which creates a new folder
 * atomically, exclusively and readable by this user only (0700), and never takes a path that is already there — so a
 * folder or a link another user planted at a name we might pick is never written into (CWE-377). Two runs never share
 * one, and a folder a stopped run left (Ctrl-C, a killed process: no library can catch SIGKILL, and a library installs
 * no signal handler) can be told from one still in use. Before it makes its own, a run sweeps the scratch folders
 * beside it that were left behind — only real folders (never a link) that this user owns; anything else is ignored:
 *   - THIS host's, whose process is gone (process.kill(pid, 0) says ESRCH): a live run's are never touched, however
 *     long it has been quiet (a voiced makeFilm that renders for more than a day reads its voice copy only at the end);
 *   - and any other with the prefix untouched for more than a day (STALE_AFTER) — what the name check cannot judge: an
 *     older name (0.12's .narration-<pid>), another host's, including this one under a name it had before (a laptop's
 *     name changes with its network). Untouched means the newest time anything inside it was written, never the
 *     folder's own.
 * A folder from another host, written to within the day, is left alone (its process cannot be seen from here): on a
 * shared folder, that host's own next run sweeps it. Cleaning up never fails a run: a folder that cannot be removed (a
 * read-only folder inside it, a locked file) is skipped and reported.
 */
import {hostname, tmpdir} from 'node:os';
import {readdirSync, rmSync, lstatSync, mkdtempSync} from 'node:fs';
import path from 'node:path';

/** This host, as a scratch folder's name holds it. */
export const scratchHost = hostname().replace(/[^A-Za-z0-9._-]/g, '_') || 'host';
/** How long a scratch folder may sit untouched before any run sweeps it, whatever its name says: a day. */
export const STALE_AFTER = 24 * 60 * 60 * 1000;

/**
 * A new scratch folder in `parent`: <prefix>-<host>-<pid>-<XXXXXX>, made by mkdtemp (atomic, exclusive, mode 0700, a
 * random suffix: never a path already there). Returns its path. The only way StoryReel makes a scratch folder.
 */
export const makeScratch = (parent, prefix) => mkdtempSync(path.join(parent, `${prefix}-${scratchHost}-${process.pid}-`));

/** Whether a process is running on this host (signal 0 only asks; EPERM: it runs, as another user). */
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** The newest time (ms) anything in a folder was written: the folder, and everything under it (links not followed). */
function newestWrite(dir) {
  let newest = 0;
  const stack = [dir];
  while (stack.length) {
    const at = stack.pop();
    let st; try { st = lstatSync(at); } catch { continue; }
    newest = Math.max(newest, st.mtimeMs);
    if (!st.isDirectory()) continue;
    let names; try { names = readdirSync(at); } catch { continue; }
    for (const name of names) stack.push(path.join(at, name));
  }
  return newest;
}

/** Whether a scratch folder was left behind: this host's, by whether its process is gone (never by age); any other, by age. */
function leftBehind(dir, name, prefix, now) {
  const m = /^(.+)-(\d+)-([A-Za-z0-9]+)$/.exec(name.slice(prefix.length + 1));   // host (it may hold "-"), pid, suffix (or an older count)
  if (m && m[1] === scratchHost) return !alive(Number(m[2]));
  return now - newestWrite(path.join(dir, name)) > STALE_AFTER;
}

/** Whether an entry is a scratch folder this user may sweep: a real folder (lstat: a link is not one), owned by this user (no uid on Windows). */
function ours(at, lstat) {
  let st; try { st = lstat(at); } catch { return false; }
  return st.isDirectory() && !st.isSymbolicLink() && (typeof process.getuid !== 'function' || st.uid === process.getuid());
}

/**
 * Sweep the scratch folders in `dir` named with `prefix` that were left behind (see above): {swept: [names], failed:
 * [{name, why}]}. Only real folders this user owns are swept; anything else with the name (a link, another user's
 * folder) is ignored — not ours to touch or to report. A folder of ours that cannot be removed is skipped and reported,
 * never a reason to stop. `lstat` is fs.lstatSync (a test hands in its own to play another user).
 */
export function sweepScratch(dir, prefix, {now = Date.now(), lstat = lstatSync} = {}) {
  const swept = [], failed = [];
  let names;
  try { names = readdirSync(dir); } catch { return {swept, failed}; }
  for (const name of names.sort()) {
    if (!name.startsWith(`${prefix}-`) || !ours(path.join(dir, name), lstat) || !leftBehind(dir, name, prefix, now)) continue;
    try { rmSync(path.join(dir, name), {recursive: true, force: true}); swept.push(name); } catch (e) { failed.push({name, why: e.code ?? e.message}); }
  }
  return {swept, failed};
}

/**
 * A scratch folder in the system's temp folder, for a pass that needs one for a moment and removes it in a finally
 * (stills.mjs · eachStill's FFmpeg filter, breakdown.mjs · readBeatsStage's sound): storyreel-scratch-<host>-<pid>-<XXXXXX>,
 * made after sweeping the ones stopped passes left there (a killed process's, or any a day old), so a SIGKILL never
 * leaves one for good.
 */
export function tempScratch() {
  const parent = tmpdir();
  sweepScratch(parent, 'storyreel-scratch');
  return makeScratch(parent, 'storyreel-scratch');
}
