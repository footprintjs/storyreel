/**
 * No slideshows. A film whose shots do not move inside themselves is a slideshow, however well it cuts: a still
 * picture, a cut, another still picture. Borrowed from huashu-art-motion's film_gate, which fails a film on it.
 *
 * Each shot (film.shots: the story, then each stage, from its scene's start to the next one's) is measured in its
 * middle: its time with every change of picture cut out (film.changes — its own arrival, the next shot's, a hand-over
 * on its page, a cut), so a transition never counts as the shot moving. The middle is read as frames drawn small (160
 * px wide: each pixel the average of a 10×10 cell of the 1600×900 frame) every `every` seconds, and each step between
 * two frames MOVES when enough of the picture changed in it. A shot is still when most of its middle is still; the
 * film is a slideshow when most of its shots' running time is.
 *
 * Not the review's `stale` check, which asks whether anything NEW comes (a scene, a beat, a word not on screen a
 * moment before) while the picture moves; this asks whether the picture MOVES between the new things. A code stage
 * that reveals a line every few seconds is never stale and can still be a slide; a world that drifts for ten seconds
 * with nothing new is stale and moves.
 */
import {filmPainter} from './finished.mjs';

/**
 * The thresholds. A frame is deterministic (a pure function of time), so a picture that does not move draws exactly the
 * same grey levels: every threshold is about what the eye counts as movement, never about noise.
 *   width  the frames are read this wide (160 px: as finished.mjs reads a video), each pixel a 10×10 cell of the frame
 *   level  a cell has changed when its grey moved more than this (0–255): a 1-px line of ink drawn across a cell of
 *          paper moves it 19 levels (measured); the tail of a fade moves less (measured: one step of the recap
 *          example's summary stage changes 1,818 cells, none by more than 4 levels)
 *   area   a step moves when at least this share of the cells changed (0.0002: 3 of 14,400, about 300 px² of the
 *          frame — a 40-px thing moving 12 px in a quarter second sweeps 1,000 px²). A blink is a change too, but a
 *          rare one: it moves a step or two in a still shot, never most of it. On the example films the verdicts are
 *          the same from 0.0001 to 0.001: a still step is almost always exactly still
 *   most   a shot is still, and a film a slideshow, when MORE than this share of the running time is still (a half)
 */
export const SLIDESHOW = Object.freeze({width: 160, level: 4, area: .0002, most: .5});

/** [a, b) less the change [c0, c1]: a cut (c0 = c1) splits it there, so no step crosses it. */
const cut = ([a, b], [c0, c1]) => (c1 < a || c0 >= b ? [[a, b]] : [[a, Math.min(b, c0)], [Math.max(a, c1), b]].filter(([x, y]) => y - x > 1e-6));

/**
 * Each shot's middle: [{path, where, scene, pieces: [[from, to)]}] — its time inside [from, to) with every change of
 * picture cut out (film.changes). A shot with nothing left is left out.
 */
export function shotInsides(film, {from = 0, to = film.total} = {}) {
  const changes = film.changes ?? [];
  return (film.shots ?? []).map(shot => {
    let pieces = [[Math.max(shot.from, from), Math.min(shot.to, to)]].filter(([a, b]) => b - a > 1e-6);
    for (const c of changes) pieces = pieces.flatMap(p => cut(p, [c.from, c.to]));
    return {path: shot.path, where: shot.where, scene: shot.scene, pieces};
  }).filter(s => s.pieces.length);
}

/** Whether the picture moved from one frame to the next: at least `area` of the cells changed by more than `level`. */
export function moved(before, after, rule = SLIDESHOW) {
  let changed = 0;
  for (let i = 0; i < before.length; i++) if (Math.abs(before[i] - after[i]) > rule.level) changed++;
  return changed >= rule.area * before.length;
}

/**
 * How much each shot moves inside itself: [{path, where, scene, pieces, seconds, still, stillAt}] — its middle (pieces,
 * as shotInsides), the `seconds` of it measured (steps of `every` seconds), `still` the seconds that did not move, and
 * `stillAt`, when each still step starts. The frames are read every `every` seconds from each piece's start, drawn
 * small (filmPainter); or, given `times` (moments `every` apart) and `frameAt(t)` (the grey frame drawn at each), at
 * those moments inside each piece — the review reads the picture once for all its checks.
 */
export function shotMotion(film, {from = 0, to = film.total, every = .25, rule = SLIDESHOW, times = null, frameAt = null} = {}) {
  if (!(Number.isFinite(every) && every > 0)) throw new Error(`slideshow: every is seconds between the frames read, more than 0, not ${JSON.stringify(every)}`);
  if (frameAt && !times) throw new Error('slideshow: frameAt gives the frames drawn at the moments in times: give both, or neither (the frames are then drawn here)');
  const paint = frameAt ?? filmPainter(film, rule.width);
  const moments = (a, b) => (times ? times.filter(t => t >= a - 1e-9 && t < b - 1e-9) : Array.from({length: Math.ceil((b - a) / every - 1e-9)}, (_, k) => a + k * every));
  return shotInsides(film, {from, to}).map(shot => {
    let steps = 0; const stillAt = [];
    for (const [a, b] of shot.pieces) {
      let before = null, last = null;
      for (const t of moments(a, b)) {
        const now = paint(t);
        if (before && t - last <= every * 1.5) { steps++; if (!moved(before, now, rule)) stillAt.push(+last.toFixed(3)); }
        before = now; last = t;
      }
    }
    return {path: shot.path, where: shot.where, scene: shot.scene, pieces: shot.pieces, seconds: +(steps * every).toFixed(3), still: +(stillAt.length * every).toFixed(3), stillAt};
  });
}

/**
 * The film (or [from, to) of it) as a slideshow or not, options as shotMotion's: {shots, seconds, still, stillShare,
 * stillShots} — the shots measured (a shot with no step is left out), the seconds of middle measured and of it still,
 * the share still, and the shots that are still (more than `most` of their middle), each {path, where, scene, pieces,
 * seconds, still, stillShare, stillAt}.
 */
export function slideshowOf(film, options = {}) {
  const rule = options.rule ?? SLIDESHOW, shots = shotMotion(film, options).filter(s => s.seconds > 0);
  const seconds = shots.reduce((n, s) => n + s.seconds, 0), still = shots.reduce((n, s) => n + s.still, 0);
  const share = (a, b) => (b > 0 ? +(a / b).toFixed(3) : 0);
  return {shots: shots.length, seconds: +seconds.toFixed(3), still: +still.toFixed(3), stillShare: share(still, seconds),
    stillShots: shots.map(s => ({...s, stillShare: share(s.still, s.seconds)})).filter(s => s.stillShare > rule.most)};
}

/** The verdict (verdict.mjs): not run with no middle to measure; failed when most of the shots' running time is still. */
export const SLIDESHOW_VERDICT = Object.freeze({
  rules: Object.freeze([
    Object.freeze({when: Object.freeze({shots: Object.freeze({eq: 0})}), then: 'not run', label: 'no shot has a middle to measure (every moment is a change of picture)'}),
    Object.freeze({when: Object.freeze({stillShare: Object.freeze({gt: SLIDESHOW.most})}), then: 'failed', label: 'most of the running time inside the shots is still: a slideshow'}),
  ]),
  passed: 'the shots move inside themselves for most of their running time',
});
