/**
 * Fingerprints of code: what a kit draws with (codeFingerprint, sourceCode), and the whole engine (engineFingerprint:
 * every StoryReel file, what an approval locks). A cached piece's key holds a narrower one — only the code that paints
 * (segments/drawing.mjs) — so a StoryReel release that changes sounds, reviews or a transition the film never uses
 * keeps the cache.
 */
import {readFileSync, existsSync, readdirSync, statSync, realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {installedVersion, DRAWING} from '../versions.mjs';
import {moduleReader} from '../codegraph.mjs';

/** The extensions a code fingerprint reads: code, data, images and fonts. */
export const CODE_EXTENSIONS = Object.freeze(['.mjs', '.js', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx', '.json', '.ttf', '.otf', '.woff', '.woff2', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

/**
 * A fingerprint of drawing code: every file under the given folders (or the files themselves), and every file they read
 * (codegraph.mjs): relative imports, resolved and read, transitively (a helper two folders up that a kit imports is the
 * kit's code too), TypeScript as well as JavaScript; the files a package linked or in a workspace holds; an asset a
 * module loads by `new URL('…', import.meta.url)` — never inside node_modules — and each package in node_modules by its
 * installed version (`pkg@1.2.3`), so an approval misses no change the kit draws with. A cycle is read once. What it
 * cannot follow it lists, never throws on: a relative import that leads nowhere (`missing`) and an import chosen at run
 * time (`unfollowed`) — name a kit's asset folder in `paths` when it loads files another way. codeCover(fingerprint)
 * gives it all back (the making-of record lists it).
 */
export function codeFingerprint(paths, {extensions = CODE_EXTENSIONS} = {}) {
  const given = filesUnder(paths, extensions), read = moduleReader('codeFingerprint'), files = new Set(), packages = new Set(), missing = [], unfollowed = [], unparsed = [];
  const follow = given => {
    const f = realpathSync(given);   // one name per file, through any link: a linked package's files sort with the rest
    if (files.has(f)) return;
    files.add(f); const m = read(f);
    m.packages.forEach(x => packages.add(x)); m.missing.forEach(spec => missing.push({from: f, spec})); m.unfollowed.forEach(code => unfollowed.push({from: f, code}));
    if (m.unparsed !== null) unparsed.push({file: f, from: m.unparsed});   // read only to that line: what follows may hold imports
    m.files.forEach(follow);
  };
  given.forEach(follow);
  const order = [...files].sort(), h = createHash('sha256');
  for (const f of order) h.update(path.basename(f)).update('\0').update(read(f).bytes).update('\0');
  for (const x of [...packages].sort()) h.update(x).update('\0');
  const fingerprint = h.digest('hex').slice(0, 24), by = (a, b) => a.from.localeCompare(b.from);
  COVERS.set(fingerprint, Object.freeze({files: Object.freeze(order), packages: Object.freeze([...packages].sort()), missing: Object.freeze(missing.sort(by)), unfollowed: Object.freeze(unfollowed.sort(by)),
    unparsed: Object.freeze(unparsed.sort((a, b) => a.file.localeCompare(b.file)))}));
  return fingerprint;
}
const COVERS = new Map();
/** Every file under the given folders (or the files themselves) with one of the extensions, in path order. */
export function filesUnder(paths, extensions = CODE_EXTENSIONS, who = 'codeFingerprint') {
  if (!Array.isArray(paths) || !paths.length) throw new Error(`${who}: give the folders or files that hold the drawing code (e.g. the film's kits folder)`);
  const files = [];
  const walk = p => {
    if (!existsSync(p)) throw new Error(`${who}: ${p} does not exist: name the kit's files as they are (relative to the folder the command runs in)`);
    if (statSync(p).isDirectory()) { for (const name of readdirSync(p).sort()) if (!name.startsWith('.') && name !== 'node_modules') walk(path.join(p, name)); }
    else if (extensions.includes(path.extname(p).toLowerCase())) files.push(p);
  };
  for (const p of paths) walk(path.resolve(p));
  return files;
}
/**
 * What a fingerprint made in this process covered: {files (absolute paths, sorted), packages ('name@version'), missing
 * ([{from, spec}]: relative imports that lead nowhere), unfollowed ([{from, code}]: imports and assets chosen at run time),
 * unparsed ([{file, from}]: a module read only up to the line where it was lost — it ends inside a string or template)}, or null.
 */
export const codeCover = fingerprint => COVERS.get(fingerprint) ?? null;

/**
 * Code per segment, for a kit that draws many shots: `sources(entry)` names the files that draw a recipe entry (its
 * shot's module, say), and a segment's code is the fingerprint of the files its own entries name, everything they
 * import (relative imports followed; a package by its installed version) and the `shared` files (hashed as they
 * are, their imports not followed: a kit's index imports every shot). Editing one shot then draws again only the
 * segments that show it; the rest are reused. Give the result to segmentedVideo as `code`. (A kit can declare the same
 * itself, `sources: {entry, shared}`, and the default cache uses it with no wiring: segments/kitcode.mjs.)
 */
export function sourceCode(sources, {shared = []} = {}) {
  if (typeof sources !== 'function') throw new Error("sourceCode: sources(entry) names the files that draw a recipe entry (e.g. its shot's module)");
  if (!Array.isArray(shared)) throw new Error('sourceCode: shared is a list of files every segment depends on');
  const read = moduleReader('sourceCode');   // a file's own bytes and what it reads (codegraph.mjs), read once
  return entries => fileSetHash(read, entries.flatMap(e => (sources(e) ?? []).map(f => asFile(f, 'sourceCode'))), shared.map(f => asFile(f, 'sourceCode')));
}

/**
 * A code file as a path: a file URL (`new URL('./shot.mjs', import.meta.url)`, or its 'file:' text), or a path —
 * relative ones from the folder the command runs in. Anything else refuses, naming who asked.
 */
export function asFile(f, who) {
  if (f instanceof URL) { if (f.protocol !== 'file:') throw new Error(`${who}: ${f.href} is not a file URL: name the file that draws it`); return fileURLToPath(f); }
  if (typeof f === 'string' && f.startsWith('file:')) return fileURLToPath(f);
  if (typeof f === 'string' && f && !f.includes('\0')) return path.resolve(f);
  throw new Error(`${who}: ${JSON.stringify(f)} is not a file: name a code file by its path or its file URL`);
}

/**
 * The hash of a set of code files: `followed` with everything they import (relative imports and linked packages; a
 * package in node_modules by its installed version), `shared` as they are. Each file is named by its folder and name,
 * so the same kit in two checkouts hashes the same.
 */
export function fileSetHash(read, followed, shared = []) {
  const files = new Map(), packages = new Set(), name = f => `${path.basename(path.dirname(f))}/${path.basename(f)}`;
  const follow = f => { if (files.has(f)) return; const e = read(f); files.set(f, e.hash); e.packages.forEach(p => packages.add(p)); e.files.forEach(follow); };
  followed.forEach(follow);
  for (const p of shared) files.set(p, read(p).hash);
  const h = createHash('sha256');
  for (const f of [...files.keys()].sort()) h.update(name(f)).update('\0').update(files.get(f)).update('\0');
  for (const p of [...packages].sort()) h.update(p).update('\0');
  return h.digest('hex').slice(0, 24);
}

/** StoryReel's own code, its fonts, and the installed versions of what it draws with, once per process. */
let ownCode = null;
/**
 * The engine's whole fingerprint: StoryReel's own files (its code and its fonts, each hashed as it is — no import
 * followed) and the installed versions of what draws a frame (versions.mjs · DRAWING). An approval locks it (pipeline.mjs:
 * `inputs.engine`), so any change to StoryReel between the draft someone watched and the final render is named. A cached
 * piece's key holds the narrower drawing fingerprint instead (segments/drawing.mjs), so a release that changes no code
 * that paints keeps the cache. A package that draws nothing (footprintjs) is in neither. `versionOf` names a version (a
 * test stubs it); storyreelCode() is it, once.
 */
export function engineFingerprint({versionOf = installedVersion} = {}) {
  const files = filesUnder(['../', '../../fonts/'].map(p => fileURLToPath(new URL(p, import.meta.url))).filter(existsSync), CODE_EXTENSIONS), h = createHash('sha256');
  for (const f of files) h.update(path.basename(f)).update('\0').update(readFileSync(f)).update('\0');
  return `${h.digest('hex').slice(0, 24)}+${DRAWING.map(n => `${n}@${versionOf(n)}`).join(',')}`;
}
export const storyreelCode = () => ownCode ??= engineFingerprint();
