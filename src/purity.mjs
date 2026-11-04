/**
 * Whether the film draws each moment the same, whatever was drawn before: the law every frame keeps (a frame is a pure
 * function of time) and everything after the drawing trusts — a piece re-rendered alone (segments.mjs), a still, a part,
 * the studio's frame at the playhead. StoryReel tests its own kits for it; a film's own kits are checked here.
 *
 * The review has drawn its samples once, in order (review.mjs · read). A few of them, spread over the part, are drawn
 * again in the other order — the last first — and each must give the very picture it gave the first time. A kit that
 * keeps state between frames (a position stepped on each draw, a list grown as it plays), or draws with Math.random or
 * the clock (Date.now, performance.now), gives another one.
 *
 *   purityOf(film, {times, hashes, width}) → {moments, changed: [t, …]}
 */
import {frameHashes} from './pins.mjs';

/** How many moments are drawn again: spread over the part, its first and last among them. */
export const PURITY_MOMENTS = 8;

/** Up to `most` of `times` (in order), spread evenly, the first and the last kept. */
export function spreadTimes(times, most = PURITY_MOMENTS) {
  if (times.length <= most) return [...times];
  return Array.from({length: most}, (_, i) => times[Math.round(i * (times.length - 1) / (most - 1))]);
}

/**
 * The moments drawn again, last first, against the pictures they gave the first time (`hashes`: t → hash, drawn at
 * `width`, as frameHashes draws them): {moments, changed} — `changed` the moments that gave another picture, in order.
 */
export function purityOf(film, {times, hashes, width = 160}) {
  const again = spreadTimes(times).reverse(), drawn = frameHashes(film, {times: again, width});
  const changed = again.filter(t => drawn[+t.toFixed(3)] !== hashes[t]).reverse();
  return {moments: again.length, changed};
}

/** A moment drawn again gives another picture: the verdict. */
export const PURITY_VERDICT = Object.freeze({
  rules: Object.freeze([
    Object.freeze({when: Object.freeze({moments: Object.freeze({lt: 2})}), then: 'not run', label: 'the part has fewer than two moments to draw in another order'}),
    Object.freeze({when: Object.freeze({changed: Object.freeze({gt: 0})}), then: 'failed', label: 'a moment drawn again, after later ones, gives another picture: a kit keeps state between frames, or draws with Math.random or the clock'}),
  ]),
  passed: 'every moment drawn again, in the other order, gives the same picture',
});

/** A changed moment as a finding's words (the review adds its scene). */
export const PURITY_FINDING = 'drawn again after later moments, this moment gives another picture: make the kit draw from t alone — seeded randomness (never Math.random), no clock, nothing kept from the frame before';
