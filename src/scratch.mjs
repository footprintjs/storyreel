/**
 * A run's scratch folders — a render's working files (render.mjs · prepareRender), makeFilm's paced copy of the voice
 * (pipeline.mjs) — are named by the host, the process and a count: <prefix>-<host>-<pid>-<n>. Two runs never share
 * one, even in one process, and a folder a stopped run left (Ctrl-C, a killed process: no library can catch SIGKILL,
 * and a library installs no signal handler) can be told from one still in use. Before it makes its own, a run sweeps
 * the scratch folders beside it that were left behind:
 *   - THIS host's, whose process is gone (process.kill(pid, 0) says ESRCH): a live run's are never touched;
 *   - and any with the prefix untouched for more than a day (STALE_AFTER), whatever its host or pid — what the name
 *     check cannot judge: an older name (0.12's .narration-<pid>), a host renamed since (a laptop's name changes with
 *     its network), a pid reused. Untouched means the newest time anything inside it was written, never the folder's
 *     own, so a long render still writing is never swept.
 * A folder from another host, written to within the day, is left alone (its process cannot be seen from here): on a
 * shared folder, that host's own next run sweeps it. Cleaning up never fails a run: a folder that cannot be removed (a
 * read-only folder inside it, another user's, a locked file) is skipped and reported.
 */
import {hostname} from 'node:os';
import {readdirSync, rmSync, lstatSync} from 'node:fs';
import path from 'node:path';

/** This host, as a scratch folder's name holds it. */
export const scratchHost = hostname().replace(/[^A-Za-z0-9._-]/g, '_') || 'host';
/** How long a scratch folder may sit untouched before any run sweeps it, whatever its name says: a day. */
export const STALE_AFTER = 24 * 60 * 60 * 1000;
let made = 0;

/** A new scratch folder's name: <prefix>-<host>-<pid>-<n>. */
export const scratchName = prefix => `${prefix}-${scratchHost}-${process.pid}-${++made}`;

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

/** Whether a scratch folder was left behind: this host's and its process gone, or untouched for more than a day. */
function leftBehind(dir, name, prefix, now) {
  const m = /^(.+)-(\d+)-(\d+)$/.exec(name.slice(prefix.length + 1));   // host (it may hold "-"), pid, count
  if (m && m[1] === scratchHost && !alive(Number(m[2]))) return true;
  return now - newestWrite(path.join(dir, name)) > STALE_AFTER;
}

/**
 * Sweep the scratch folders in `dir` named with `prefix` that were left behind (see above): {swept: [names], failed:
 * [{name, why}]} — a folder that cannot be removed is skipped, never a reason to stop.
 */
export function sweepScratch(dir, prefix, {now = Date.now()} = {}) {
  const swept = [], failed = [];
  let names;
  try { names = readdirSync(dir); } catch { return {swept, failed}; }
  for (const name of names.sort()) {
    if (!name.startsWith(`${prefix}-`) || !leftBehind(dir, name, prefix, now)) continue;
    try { rmSync(path.join(dir, name), {recursive: true, force: true}); swept.push(name); } catch (e) { failed.push({name, why: e.code ?? e.message}); }
  }
  return {swept, failed};
}
