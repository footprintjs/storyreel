/**
 * words — how an isometric world's reader quotes a value and checks an entry's keys and anchors: the few rules read.mjs
 * (the map) and motion-read.mjs (the moves) both refuse with. WHY a module of its own: each reader imports it, and
 * neither imports the other's helpers, so the kit's modules form no import cycle.
 */

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * A value as a refusal quotes it: JSON, at most 60 characters, one line (a value thousands of letters long gives a short
 * refusal). A function is "a function", as footprint-story says it: its source would run the refusal over several lines.
 */
export const shown = (v) => {
  if (typeof v === 'function') return 'a function';
  let s; try { s = JSON.stringify(v) ?? String(v); } catch { s = Object.prototype.toString.call(v); }
  s = s.replace(/[\p{Zl}\p{Zp}]/gu, ' ');
  return s.length > 60 ? `${s.slice(0, 59)}…` : s;
};

/** An at as an anchor is written: [scene, phrase, plus?] or {scene, phrase, …} (the clock checks the phrase). */
export const anchorLike = (a) => (Array.isArray(a) ? a.length >= 2 && a.length <= 3 && typeof a[0] === 'string' && typeof a[1] === 'string' && (a.length === 2 || Number.isFinite(a[2]))
  : isObject(a) && typeof a.scene === 'string' && typeof a.phrase === 'string');

/** An object whose every key is one of `keys`, refused naming the entry and the keys it takes. */
export function keysOf(o, keys, who) {
  if (!isObject(o)) throw new Error(`${who} is an object of ${keys.join(', ')} — not ${shown(o)}`);
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw new Error(`${who} takes ${keys.join(', ')} — not "${k}"`);
}
