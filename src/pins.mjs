/**
 * Pixel pins: hash a film's frames at evenly spaced moments, or at the moments a test names. A test
 * records them once (a JSON file beside it) and compares on every run, so a change to the engine or a
 * kit that alters any drawn pixel is caught. The hashes depend on the machine's fonts: re-record on a
 * new machine, and otherwise only for an intended change (and say so in the commit).
 */
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';

/**
 * {moment (seconds): hash}, drawn `width` pixels wide: at `count` evenly spaced moments across the film,
 * or at the moments in `times` (e.g. film.moments() plus the middle of a short pop that even spacing
 * would miss), not both. Each moment is rounded to the millisecond, which is also its key.
 */
export function frameHashes(film, {count, width = 400, times} = {}) {
  const height = Math.round(width * 9 / 16), c = createCanvas(width, height), x = c.getContext('2d'), out = {};
  if (times !== undefined && count !== undefined) throw new Error('frameHashes: give count (evenly spaced moments) or times (the moments you name), not both');
  for (const t of times === undefined ? evenMoments(film, count ?? 24) : givenMoments(film, times)) {
    x.resetTransform(); x.clearRect(0, 0, width, height); x.scale(width / 1600, width / 1600); film.frame(x, t);
    out[t] = createHash('sha256').update(c.data()).digest('hex').slice(0, 16);
  }
  return out;
}

/** `count` moments from the start to just before the end. */
const evenMoments = (film, count) => Array.from({length: count}, (_, i) => +(film.total * i / (count - 1) * .999).toFixed(3));

/**
 * The moments asked for, each a number of seconds inside the film, rounded to the millisecond (the key).
 * Anything else refuses, and so do two moments that round to the same millisecond (one would be lost).
 */
function givenMoments(film, times) {
  if (!Array.isArray(times) || !times.length) throw new Error('frameHashes: times must be a list of moments in seconds (or leave it out for evenly spaced ones)');
  const seen = new Map();
  return times.map(t => {
    if (!(typeof t === 'number' && t >= 0 && t <= film.total)) throw new Error(`frameHashes: the moment ${shown(t)} is not a number of seconds from 0 to the film's end (${film.total.toFixed(3)} s)`);
    const key = +t.toFixed(3);
    if (seen.has(key)) throw new Error(`frameHashes: the moments ${seen.get(key)} and ${t} are the same millisecond (${key}); name each moment once`);
    seen.set(key, t);
    return key;
  });
}

/** A bad moment as written: a number as itself (NaN too), anything else quoted ('2' is not 2). */
const shown = t => typeof t === 'number' ? String(t) : JSON.stringify(t) ?? String(t);

/** The moments whose pixels differ from the pins (empty when the film draws what was pinned). */
export const changedFrames = (pinned, now) => Object.keys(pinned).filter(t => pinned[t] !== now[t]);
