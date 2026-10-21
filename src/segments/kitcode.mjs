/**
 * The kits' code in a piece's key, with no wiring: each kit may say where its drawing code lives —
 *
 *   sources: {entry: spec => [files that draw this spec], shared?: [files every spec uses], transition?: name => [files]}
 *
 * (files: paths or file URLs, e.g. new URL(`./shots/${spec.shot}.mjs`, import.meta.url)) — and a piece is keyed by the
 * code of the entries it draws: each entry's files and everything they import (followed: codegraph.mjs), the kit's
 * shared files as they are (a kit's index imports every shot, so its imports are not followed), and the files of a
 * kit's transition it plays. Editing one shot then redraws only the pieces that show it. `spec` is what the kit
 * compiles: the story's spec, a world stage's `world`, a kit stage's own spec.
 *
 * A kit that says nothing is keyed by `fallback` — a fingerprint of all the kits' code (makeFilm's `code`:
 * codeFingerprint([kitsFolder])) — in every piece it draws, or, without one, by nothing: then only the spot check sees
 * an edit to its code, and the report says so (unkeyedKits).
 */
import {statSync} from 'node:fs';
import path from 'node:path';
import {moduleReader} from '../codegraph.mjs';
import {fileSetHash, asFile} from './code.mjs';
import {entryAt} from './material.mjs';

/** What a kit compiles for the entry at `path`: a world stage's `world`, otherwise the entry itself. */
const specOf = (recipe, p) => { const entry = entryAt(recipe, p); return entry?.type === 'world' ? entry.world : entry; };

/** A kit's `sources`, checked once: {entry, shared, transition} or a refusal naming the kit. */
export function readSources(kit) {
  const s = kit?.sources, who = `kit "${kit?.name}" sources`;
  if (s === undefined || s === null) return null;
  if (typeof s !== 'object' || Array.isArray(s)) throw new Error(`${who} must be {entry: spec => [files], shared?: [files], transition?: name => [files]}`);
  for (const key of Object.keys(s)) if (!['entry', 'shared', 'transition'].includes(key)) throw new Error(`${who} has unsupported key ${key} (it takes entry, shared, transition)`);
  if (typeof s.entry !== 'function') throw new Error(`${who}.entry(spec) names the files that draw an entry (its shot's module, say)`);
  if (s.shared !== undefined && !Array.isArray(s.shared)) throw new Error(`${who}.shared is a list of the files every entry uses`);
  if (s.transition !== undefined && typeof s.transition !== 'function') throw new Error(`${who}.transition(name) names the files that draw one of its transitions`);
  return {entry: s.entry, shared: (s.shared ?? []).map(f => asFile(f, `${who}.shared`)), transition: s.transition ?? null};
}

/**
 * The kits that draw a film's pieces and say nothing of where their code lives (keyed only by `fallback`, or not at all):
 * those drawing an entry with no `sources`, and those whose transition plays with no `sources.transition`.
 */
export function unkeyedKits(film) {
  const kits = Object.values(film.kits ?? {}), drawing = new Set(Object.values(film.drawnBy ?? {}));
  const played = new Set((film.rows ?? []).map(r => r.enter?.type).filter(Boolean));
  return kits.filter(k => (drawing.has(k.name) && !k.sources) || (Object.keys(k.transitions ?? {}).some(t => played.has(t)) && typeof k.sources?.transition !== 'function'))
    .map(k => k.name).sort();
}

/**
 * The code key of a piece, per piece (segments.mjs passes it as `code`): code(entries, piece) for a piece of `film`
 * (its paths and the transitions it plays: piece.paths, piece.enters). Null for a piece no kit draws.
 */
export function kitCode(film, {fallback = null} = {}) {
  const kits = film.kits ?? {}, drawnBy = film.drawnBy ?? {}, read = moduleReader('kit sources'), declared = new Map();
  // What the reading saw: the newest change to a file read (a render whose code changed after it started keeps nothing),
  // and the imports chosen at run time, which no key can follow (the report names them, so they can be named in sources).
  let newest = 0; const runtime = new Set();
  const seen = (f, e) => {
    try { newest = Math.max(newest, statSync(f).mtimeMs); } catch { newest = Infinity; }
    for (const code of e.unfollowed ?? []) runtime.add(`${path.basename(f)}: ${code}`);
    for (const spec of e.missing ?? []) runtime.add(`${path.basename(f)}: ${spec} (not there)`);
  };
  const sourcesOf = name => { if (!declared.has(name)) declared.set(name, readSources(kits[name])); return declared.get(name); };
  const owner = type => Object.values(kits).find(k => k.transitions && Object.hasOwn(k.transitions, type))?.name ?? null;
  const code = (_entries, piece) => {
    const followed = [], shared = new Set(), bare = new Set();
    const take = (name, files, what) => { for (const f of files ?? []) followed.push(asFile(f, `kit "${name}" sources.${what}`)); };
    for (const p of piece.paths ?? []) {
      const name = drawnBy[p]; if (!name) continue;   // the engine draws it: its code is in the drawing fingerprint
      const s = sourcesOf(name);
      if (!s) { bare.add(name); continue; }
      take(name, s.entry(specOf(film.recipe, p)), 'entry'); s.shared.forEach(f => shared.add(f));
    }
    for (const type of piece.enters ?? []) {
      const name = owner(type); if (!name) continue;   // a built-in transition: the drawing fingerprint
      const s = sourcesOf(name);
      if (!s?.transition) { bare.add(name); continue; }
      take(name, s.transition(type), 'transition'); s.shared.forEach(f => shared.add(f));
    }
    if (!followed.length && !shared.size && !bare.size) return null;
    const own = followed.length || shared.size ? fileSetHash(read, followed, [...shared], {seen}) : '';
    return bare.size ? `${own}+${fallback ?? `unkeyed:${[...bare].sort().join(',')}`}` : own;
  };
  /** The newest change to any file read so far (ms since the epoch), and what the kits load at run time. */
  Object.defineProperties(code, {newest: {get: () => newest}, runtime: {get: () => [...runtime].sort()}});
  return code;
}
