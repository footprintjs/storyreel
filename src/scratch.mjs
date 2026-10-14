/**
 * A run's scratch folders — a render's working files (render.mjs · prepareRender), makeFilm's paced copy of the voice
 * (pipeline.mjs) — are named by the host, the process and a count: <prefix>-<host>-<pid>-<n>. Two runs never share
 * one, even in one process, and a folder a stopped run left (Ctrl-C, a killed process: no library can catch SIGKILL,
 * and a library installs no signal handler) can be told from one still in use. Before it makes its own, a run sweeps
 * the scratch folders beside it that THIS host's dead processes left. A folder from another host is left alone (its
 * process cannot be seen from here): on a shared folder, that host's own next run sweeps it.
 */
import {hostname} from 'node:os';
import {readdirSync, rmSync} from 'node:fs';
import path from 'node:path';

/** This host, as a scratch folder's name holds it. */
export const scratchHost = hostname().replace(/[^A-Za-z0-9._-]/g, '_') || 'host';
let made = 0;

/** A new scratch folder's name: <prefix>-<host>-<pid>-<n>. */
export const scratchName = prefix => `${prefix}-${scratchHost}-${process.pid}-${++made}`;

/** Whether a process is running on this host (signal 0 only asks; EPERM: it runs, as another user). */
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** The scratch folders in `dir` named with `prefix` that this host's dead processes left: removed, their names returned. */
export function sweepScratch(dir, prefix) {
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  const swept = [];
  for (const name of names) {
    if (!name.startsWith(`${prefix}-`)) continue;
    const m = /^(.+)-(\d+)-(\d+)$/.exec(name.slice(prefix.length + 1));   // host (it may hold "-"), pid, count
    if (!m || m[1] !== scratchHost || alive(Number(m[2]))) continue;
    rmSync(path.join(dir, name), {recursive: true, force: true});
    swept.push(name);
  }
  return swept.sort();
}
