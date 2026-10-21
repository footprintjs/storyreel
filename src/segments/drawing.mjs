/**
 * StoryReel's drawing fingerprint: the code a cached piece's frames depend on, and nothing else. Narrower than the
 * whole engine (segments/code.mjs · engineFingerprint, what an approval locks), so a release that changes sounds,
 * reviews, the command line or a transition a film never uses keeps every piece it has drawn.
 *
 *   core     the painter's import closure: paint.mjs (one picture at a film second, the encoder's settings, the
 *            frame loop), film.mjs (every frame's picture) and layout.mjs (the bands and burned captions), every
 *            module they import, followed (codegraph.mjs), the assets they load (the fonts) and the themes; the
 *            installed versions of the packages that draw (versions.mjs · DRAWING) — in every key;
 *   catalog  a module that draws ONE entry of a catalog a recipe names things from (a transition, the steps track),
 *            and the registry that lists them — pruned from the core and keyed only by the pieces that draw that entry
 *            (catalogCode), so editing `eraser` redraws only the pieces an eraser crosses.
 *
 * NOT_DRAWING names the modules the painter imports that never decide a pixel (they read files whose bytes are keyed
 * anyway, check, record, or make sound): they are not followed. A module missed here is still caught: a cached
 * piece is reused only when its spot check passes (segments.mjs), and test/drawing.test.mjs holds the map to the
 * code — every module the painter reaches is in the core or the catalog, every catalog name is mapped, every package
 * is a drawing one or named as drawing nothing.
 *
 * A new transition or piece in a catalog module of its own: add its name and file to CATALOG (the test refuses one
 * that is missing). A new module the painter imports that draws nothing: NOT_DRAWING, with why.
 */
import {realpathSync, existsSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {moduleReader} from '../codegraph.mjs';
import {installedVersion, DRAWING} from '../versions.mjs';
import {filesUnder, CODE_EXTENSIONS} from './code.mjs';

/** StoryReel's src folder, where the names below live. */
export const SRC = fileURLToPath(new URL('../', import.meta.url));

/** Where painting starts (paths in src/). */
export const PAINTER_ROOTS = Object.freeze(['paint.mjs', 'film.mjs', 'layout.mjs']);
/** Loaded by a path built at run time, which no reader follows: the themes (theme.mjs · loadTheme). From src/. */
export const PAINTER_ASSETS = Object.freeze(['../themes/']);

/** Modules the painter imports that never decide a pixel, and why: never followed into the core. */
export const NOT_DRAWING = Object.freeze({
  'files.mjs': 'reads and writes files: a file the film shows is keyed by its own bytes (film.inputs.files)',
  'sound.mjs': 'the sound accents: their names, counts and synthesis',
  'found/index.mjs': 'the found sounds: recorded effects, their licences and records',
  'listening.mjs': 'what the sound asks of the ear: checks on the film\'s sound',
  'record.mjs': 'the compile\'s footprintjs record',
  'reading.mjs': 'the reading check: a line on screen too short to read refuses or is reported, never drawn',
  'shots.mjs': 'the shot plan\'s checks (intent, continuity, reads, too much too fast): they refuse or report, never draw',
});
/** Packages the painter's modules import that draw nothing (every other one must be in versions.mjs · DRAWING). */
export const NOT_DRAWING_PACKAGES = Object.freeze(['footprintjs', 'foottrace']);

/**
 * The catalogs: each entry a recipe names, and the module that draws it (paths in src/). A registry lists a catalog's
 * modules (and wraps their draws), so it is keyed with any of its entries, never in the core.
 */
export const CATALOG = Object.freeze({
  transitions: Object.freeze({registry: 'transitions/paper/index.mjs', entries: Object.freeze({
    torn: 'transitions/paper/torn.mjs', eraser: 'transitions/paper/eraser.mjs', inkBleed: 'transitions/paper/ink.mjs',
    ringIris: 'transitions/paper/ring.mjs', glassSheet: 'transitions/paper/glass.mjs', curl: 'transitions/paper/page.mjs',
    fold: 'transitions/paper/page.mjs', morph: 'transitions/paper/morph.mjs', cloudBurst: 'transitions/paper/burst.mjs'})}),
  // A piece of the film drawn over or around a shot: the steps track (recipe.stepsTrack, an overlay) and the thought
  // cloud a world is framed in (a story's or a world stage's "frame": "thought").
  pieces: Object.freeze({registry: null, entries: Object.freeze({stepsTrack: 'kits/paper/steps-track.mjs', thought: 'thought/index.mjs'})}),
});

/** Every catalog entry's name → {group, file, registry}. */
export const CATALOG_ENTRIES = Object.freeze(Object.fromEntries(Object.entries(CATALOG).flatMap(([group, c]) =>
  Object.entries(c.entries).map(([name, file]) => [name, Object.freeze({group, file, registry: c.registry})]))));

/**
 * Follow `roots` through their imports (codegraph.mjs): {files (real paths, a Set), packages ('name@version'),
 * unfollowed ([{from, code}])}. A file `stop` answers true for is neither taken nor followed.
 */
function closure(read, roots, stop) {
  const files = new Set(), packages = new Set(), unfollowed = [], missing = [];
  const follow = f => {
    const real = realpathSync(f);
    if (files.has(real) || stop(real)) return;
    files.add(real);
    const m = read(real);
    m.packages.forEach(p => packages.add(p)); m.unfollowed.forEach(code => unfollowed.push({from: real, code})); m.missing.forEach(spec => missing.push({from: real, spec}));
    m.files.forEach(follow);
  };
  roots.forEach(follow);
  return {files, packages, unfollowed, missing};
}

const hashFiles = (read, files, src) => {
  const h = createHash('sha256');
  // Each file by its path in the package (never an absolute path: two installs of one version hash the same).
  for (const f of [...files].sort()) h.update(path.relative(src, f).split(path.sep).join('/')).update('\0').update(read(f).bytes).update('\0');
  return h.digest('hex').slice(0, 24);
};

/**
 * The drawing code of a StoryReel source tree (`src`, StoryReel's own by default — a test passes a copy it edits):
 * {core, coreFiles, catalog(name) → fingerprint | null, cover()}. `core` is "<hash>+<drawing packages>", the part every
 * key holds; catalog(name) is the fingerprint of one catalog entry's module and its registry, whatever they import that
 * the core does not. Each file is read once.
 */
export function drawingCode({src = SRC, versionOf = installedVersion} = {}) {
  const read = moduleReader('drawingCode'), real = rel => realpathSync(path.join(src, rel));
  const notDrawing = new Set(Object.keys(NOT_DRAWING).filter(f => existsSync(path.join(src, f))).map(real));
  const registries = new Set(Object.values(CATALOG).map(c => c.registry).filter(Boolean).map(real));
  const leaves = new Set(Object.values(CATALOG_ENTRIES).map(e => real(e.file)));
  const assets = filesUnder(PAINTER_ASSETS.map(p => path.join(src, p)).filter(existsSync), CODE_EXTENSIONS, 'drawingCode');
  const core = closure(read, [...PAINTER_ROOTS.map(real), ...assets], f => notDrawing.has(f) || registries.has(f) || leaves.has(f));
  const versions = DRAWING.map(n => `${n}@${versionOf(n)}`).join(',');
  const fingerprint = `${hashFiles(read, core.files, src)}+${versions}`;
  /** One catalog entry: its module and its registry, with what they import beyond the core (a registry's other entries left out). */
  const coverOf = name => {
    const {group, file, registry} = CATALOG_ENTRIES[name], own = new Set(Object.values(CATALOG[group].entries).map(real));
    const leaf = closure(read, [real(file)], f => notDrawing.has(f) || registries.has(f) || core.files.has(f));
    const listed = registry ? closure(read, [real(registry)], f => notDrawing.has(f) || own.has(f) || core.files.has(f)) : {files: new Set(), packages: new Set(), unfollowed: [], missing: []};
    const files = new Set([...leaf.files, ...listed.files]);
    return {files, packages: new Set([...leaf.packages, ...listed.packages]), unfollowed: [...leaf.unfollowed, ...listed.unfollowed], fingerprint: hashFiles(read, files, src)};
  };
  // Every entry read now, with the core: the code as it is when the render starts, whichever entries a piece names.
  const entries = new Map(Object.keys(CATALOG_ENTRIES).map(n => [n, coverOf(n)]));
  const entryCover = name => entries.get(name) ?? null;
  // When the newest of these files was last changed: a render whose code changed on disk after its process started draws
  // with the code it loaded, not the code a key names, and so keeps none of its pieces (segments.mjs).
  const newest = Math.max(0, ...[...core.files, ...[...entries.values()].flatMap(e => [...e.files])].map(f => { try { return statSync(f).mtimeMs; } catch { return Infinity; } }));
  return {
    core: fingerprint,
    coreFiles: core.files,
    newest,
    catalog: name => entryCover(name)?.fingerprint ?? null,
    /** What it all covers (for the tests and the record): the core's files, packages and unfollowed imports, and each entry's. */
    cover: () => ({core: {files: [...core.files].sort(), packages: [...core.packages].sort(), unfollowed: core.unfollowed, missing: core.missing},
      catalog: Object.fromEntries(Object.keys(CATALOG_ENTRIES).map(n => { const e = entryCover(n); return [n, {files: [...e.files].sort(), packages: [...e.packages].sort(), unfollowed: e.unfollowed}]; })),
      notDrawing: [...notDrawing].sort(), registries: [...registries].sort()}),
  };
}

/** StoryReel's own drawing code, read once per process (a key is made many times a render). */
let own = null;
export const ownDrawingCode = () => own ??= drawingCode();
