/**
 * Where drawn pieces are kept between renders: one folder, each piece as <key>.mp4 and <key>.json (its manifest). A
 * cache read back into films, so nothing in it is trusted:
 *   - a key is 24 hex digits, and a piece's files are named from its key alone (never from what a manifest says);
 *   - the folder is reached through its real path (files.mjs · securePath), and a piece's files must be plain files
 *     there — a link at either name is never read;
 *   - a manifest is read only when small (MANIFEST_BYTES), and only when it has the shape a piece's has, for this key;
 *   - the video must be the bytes the manifest recorded (its size and SHA-256), so a file cut short, damaged or put
 *     there by something else is drawn again, never reused;
 *   - the folder is held to a size (`cap`, 4 GB by default): after a render, the pieces used longest ago go first,
 *     never one the render used, and never one used in the last GRACE minutes (another render may be about to join it).
 * A piece lands whole or not at all: its file is renamed into place (files.mjs · writeOutput), and its manifest —
 * written last — records the file's size and hash.
 */
import {readFileSync, readdirSync, lstatSync, statSync, rmSync, utimesSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {writeOutput, securePath, makeFolder} from '../files.mjs';

/** The manifest's version: what a kept piece's spot check reads (samples by frame offset in the piece). */
export const MANIFEST = 3;
/** The store's defaults: its size cap, and how long a piece just used is safe from eviction. */
export const STORE_DEFAULTS = Object.freeze({cap: 4 * 1024 ** 3, grace: 10 * 60 * 1000});
/** The largest manifest read (a piece's is a few kilobytes). */
const MANIFEST_BYTES = 256 * 1024;
const KEY = /^[0-9a-f]{24}$/, HASH16 = /^[0-9a-f]{16}$/, SHA256 = /^[0-9a-f]{64}$/, PART = /^(?:[a-z]{1,16}|catalog:[A-Za-z][A-Za-z0-9]{0,39})$/;

/** A store's key: 24 hex digits, or a refusal (a key is made by segments/material.mjs; anything else is a bug or worse). */
export function checkKey(key) {
  if (typeof key !== 'string' || !KEY.test(key)) throw new Error(`folderStore: ${JSON.stringify(String(key).slice(0, 40))} is not a piece's key (24 hex digits): a key names the files it is kept in, so nothing else is taken`);
  return key;
}

const plainFile = f => { try { const st = lstatSync(f); return st.isFile() && !st.isSymbolicLink() ? st : null; } catch { return null; } };
/** A file's SHA-256 (a piece is a few megabytes, read once), or null when it cannot be read: the piece is drawn again. */
const sha256Of = file => { try { return createHash('sha256').update(readFileSync(file)).digest('hex'); } catch { return null; } };

/**
 * Whether a manifest has the shape a piece's has, for this key: its version, key, frames, the spot check's samples
 * (offsets inside the piece, 16-hex hashes), the video's size and hash, and its parts and slot when it says them.
 */
export function manifestProblem(m, key) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return 'not an object';
  if (m.v !== MANIFEST) return `version ${JSON.stringify(m.v)}, not ${MANIFEST}`;
  if (m.key !== key) return 'kept under another key';
  if (!(Number.isInteger(m.frames) && m.frames > 0)) return 'no frame count';
  if (!m.samples || typeof m.samples !== 'object' || Array.isArray(m.samples)) return 'no samples';
  for (const [o, h] of Object.entries(m.samples)) if (!/^\d+$/.test(o) || +o >= m.frames || typeof h !== 'string' || !HASH16.test(h)) return `a sample ${JSON.stringify(o)} that is not a frame of the piece with its hash`;
  if (!(Number.isInteger(m.bytes) && m.bytes > 0)) return 'no size';
  if (typeof m.sha256 !== 'string' || !SHA256.test(m.sha256)) return 'no hash';
  if (m.from !== undefined && !Number.isFinite(m.from)) return 'a start that is not a number';
  if (m.parts !== undefined && (!m.parts || typeof m.parts !== 'object' || Array.isArray(m.parts) || Object.values(m.parts).some(h => typeof h !== 'string' || !HASH16.test(h)))) return 'parts that are not hashes';
  // A part's name is said back in a reason a person or an agent reads ("torn code changed"): only a part's own shape.
  if (m.parts !== undefined && Object.keys(m.parts).some(k => !PART.test(k))) return 'a part that is not a part\'s name';
  for (const k of ['slot', 'film', 'label']) if (m[k] !== undefined && !(typeof m[k] === 'string' && m[k].length <= 200)) return `a ${k} that is not a short text`;
  return null;
}

/**
 * Keep pieces as files in one folder (see the module's header). Returns {name, dir, get(key), put(key, file, manifest),
 * newest(group), trim({keep, cap, now})}: get answers a kept piece only when every check passes (null otherwise, and
 * the piece is drawn again); newest(group) is the newest manifest of each group `group(manifest)` names (what each slot
 * was last drawn from: segments.mjs says why a piece was drawn again); trim evicts the pieces used longest ago until
 * the folder fits the cap.
 */
export function folderStore(dir, {cap = STORE_DEFAULTS.cap, grace = STORE_DEFAULTS.grace, make = makeFolder} = {}) {
  if (typeof dir !== 'string' || !dir) throw new Error('folderStore: give the folder the segments are kept in');
  if (!(Number.isFinite(cap) && cap >= 1024 ** 2)) throw new Error(`folderStore: cap is the most the folder holds, in bytes (at least 1 MB; ${STORE_DEFAULTS.cap / 1024 ** 3} GB by default), not ${JSON.stringify(cap)}`);
  // The store's REAL path, nothing on the way another user could rearrange (files.mjs · securePath): checked when it is
  // made and again at each put, and the pieces written through it only.
  const home = securePath(dir), at = key => ({file: path.join(home, `${checkKey(key)}.mp4`), json: path.join(home, `${key}.json`)});
  /** A manifest, read when it is a plain small file and parses, or null. */
  const manifestAt = json => {
    const st = plainFile(json);
    if (!st || st.size > MANIFEST_BYTES) return null;
    try { return JSON.parse(readFileSync(json, 'utf8')); } catch { return null; }
  };
  /** The names in the folder that are a piece's (<key>.json or <key>.mp4): anything else there is never read, moved or removed. */
  const named = ext => { try { return readdirSync(home).filter(n => n.endsWith(ext) && KEY.test(n.slice(0, -ext.length))).map(n => n.slice(0, -ext.length)); } catch { return []; } };
  const keys = () => named('.json');
  return {
    name: 'folder', dir: home,
    /**
     * A kept piece, or null. `into`: a file in the render's own working folder that takes the piece first (a hard link,
     * or a copy on another disk) — the bytes checked are the ones the render will join, so a put after this one (this
     * render's or another's) cannot change them.
     */
    get(key, {into = null} = {}) {
      const {file, json} = at(key), st = plainFile(file), manifest = st ? manifestAt(json) : null;
      if (!manifest || manifestProblem(manifest, key) || manifest.bytes !== st.size) return null;
      let held = file;
      if (into) { try { writeOutput(into, {copy: file, link: true}); held = into; } catch { return null; } }
      let same = false;
      try { same = statSync(held).size === manifest.bytes && sha256Of(held) === manifest.sha256; } catch { same = false; }
      if (!same) { if (into) rmSync(into, {force: true}); return null; }
      try { const now = new Date(); utimesSync(json, now, now); } catch { /* read-only: the piece is still good, it only ages */ }   // used now: the last to be evicted
      return {file: held, manifest};
    },
    put(key, file, manifest) {
      make(home);   // checked again, made, and checked once more (files.mjs · makeFolder)
      const to = at(key), bytes = lstatSync(file).size, sha256 = sha256Of(file);
      if (sha256 === null) throw new Error(`folderStore: ${path.basename(file)} could not be read to keep it`);
      rmSync(to.json, {force: true});
      writeOutput(to.file, {move: file});
      writeOutput(to.json, JSON.stringify({...manifest, v: MANIFEST, key, bytes, sha256}, null, 2));
      return to.file;
    },
    newest(group) {
      const out = new Map();
      for (const key of keys()) {
        const m = manifestAt(at(key).json), g = m && !manifestProblem(m, key) ? group(m) : null;
        if (g !== null && g !== undefined && (!out.has(g) || String(m.made) > String(out.get(g).made))) out.set(g, m);
      }
      return out;
    },
    trim({keep = new Set(), cap: limit = cap, now = Date.now()} = {}) {
      const kept = keys().map(key => {
        const {file, json} = at(key), a = plainFile(file), b = plainFile(json);
        return {key, file, json, bytes: (a?.size ?? 0) + (b?.size ?? 0), used: b?.mtimeMs ?? a?.mtimeMs ?? 0};
      }).sort((a, b) => a.used - b.used);
      // A video with no manifest (a render stopped between the two) is kept by nothing: removed once it is old enough
      // that no render can still be writing its manifest.
      const listed = new Set(kept.map(k => k.key));
      for (const key of named('.mp4').filter(k => !listed.has(k))) { const {file} = at(key), st = plainFile(file); if (st && now - st.mtimeMs >= grace && !keep.has(key)) rmSync(file, {force: true}); }
      let total = kept.reduce((n, k) => n + k.bytes, 0);
      const evicted = [];
      for (const k of kept) {
        if (total <= limit) break;
        if (keep.has(k.key) || now - k.used < grace) continue;
        rmSync(k.json, {force: true}); rmSync(k.file, {force: true});
        total -= k.bytes; evicted.push(k.key);
      }
      return {bytes: total, evicted};
    },
  };
}
