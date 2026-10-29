/**
 * The picks tried in the studio (server.mjs · /api/try), in memory, nothing written. One compile runs at a time: a Try
 * while one does is told so (409), so a flood of requests cannot queue compiles. The last few films compiled are kept,
 * each by what it is — the pick's line (its scene, kind and name) and the version of the film it is a copy of — so
 * trying a pick again costs nothing. The pick tried last is the one whose frames are drawn (its key, a frame's `try`);
 * the one before it, or any from before a reload, is gone (410).
 */
import {Refusal} from './refusal.mjs';

/** How many compiled picks are kept: each is a whole film in memory. */
export const KEPT_TRIES = 4;

/** The studio's picks being tried: {run, filmOf, drop, kept}. */
export function pickTries({most = KEPT_TRIES} = {}) {
  const kept = new Map();
  let current = null, count = 0, compiling = false;
  return {
    /**
     * The pick `line` tried on the film of `version`: its film — one kept, else `compile()`d — made the one being tried;
     * returns its key. `now()` is the film's version once the compile is done: a film compiled again meanwhile makes this
     * one a copy of a film no longer shown (409).
     */
    async run(line, version, compile, now) {
      if (compiling) throw new Refusal('Another pick is being compiled: try this one again when it is done', 409);
      const id = `${version} ${line}`;
      let film = kept.get(id);
      if (film) kept.delete(id);
      else {
        compiling = true;
        try { film = await compile(); } finally { compiling = false; }
        if (now() !== version) throw new Refusal('The film was compiled again while this pick was: try it again', 409);
      }
      kept.set(id, film);
      while (kept.size > most) kept.delete(kept.keys().next().value);
      current = {key: String(++count), film};
      return current.key;
    },
    /** The film of the pick being tried, by its key: any other key is a pick no longer tried (410). */
    filmOf(key) {
      if (current?.key !== key) throw new Refusal('That pick is no longer being tried (the film was compiled again, or another pick was tried)', 410);
      return current.film;
    },
    /** A reload: the film the picks are copies of is gone, and so are they. */
    drop() { kept.clear(); current = null; },
    /** How many compiled picks are kept. */
    get kept() { return kept.size; },
  };
}
