/**
 * Pixel pins: hash a film's frames at evenly spaced moments. A test records them once (a JSON
 * file beside it) and compares on every run, so a change to the engine or a kit that alters any
 * drawn pixel is caught. The hashes depend on the machine's fonts: re-record on a new machine,
 * and otherwise only for an intended change (and say so in the commit).
 */
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';

/** {moment (seconds): hash} for `count` moments across the film, drawn `width` pixels wide. */
export function frameHashes(film, {count = 24, width = 400} = {}) {
  const height = Math.round(width * 9 / 16), c = createCanvas(width, height), x = c.getContext('2d'), out = {};
  for (let i = 0; i < count; i++) {
    const t = +(film.total * i / (count - 1) * .999).toFixed(3);
    x.resetTransform(); x.clearRect(0, 0, width, height); x.scale(width / 1600, width / 1600); film.frame(x, t);
    out[t] = createHash('sha256').update(c.data()).digest('hex').slice(0, 16);
  }
  return out;
}

/** The moments whose pixels differ from the pins (empty when the film draws what was pinned). */
export const changedFrames = (pinned, now) => Object.keys(pinned).filter(t => pinned[t] !== now[t]);
