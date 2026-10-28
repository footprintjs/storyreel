/**
 * No slideshows. A film whose shots do not move inside themselves is a slideshow, however well it cuts: a still
 * picture, a cut, another still picture. Borrowed from huashu-art-motion's film_gate, which fails a film on it.
 *
 * Each shot (film.shots: the story, then each stage, from its scene's start to the next one's) is measured in its
 * middle: its time with every change of picture cut out (film.changes — its own arrival, the next shot's, a hand-over
 * on its page, a cut), so a transition never counts as the shot moving. The middle is read as frames drawn small (160
 * px wide: each pixel the average of a 10×10 cell of the 1600×900 frame) every `every` seconds, and each step between
 * two frames MOVES when enough of the picture changed in it. A still stretch is DEAD time when it holds for more than
 * `hold` seconds (a slide on screen), or when it is the whole of a shot that never moves; a shorter pause between
 * moves is a beat, not a slide. The film is a slideshow when most of its shots' running time is dead.
 *
 * Not the review's `stale` check, which asks whether anything NEW comes (a scene, a beat, a word not on screen a
 * moment before) while the picture moves; this asks whether the picture MOVES between the new things. A code stage
 * that reveals a line every few seconds is never stale and can still be a slide; a world that drifts for ten seconds
 * with nothing new is stale and moves.
 */
import {PACES} from 'footprint-story/motion';
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
 *   hold   a still stretch is dead when it lasts MORE than this (3 s: a pause that long reads as a slide held up; a
 *          beat between two moves is shorter) — or when it is all of a shot that never moves, however short the shot
 *   most   a film is a slideshow when MORE than this share of its shots' running time is dead (a half)
 *   cover  a shot whose changed cells, over all its steps together, cover less than this share of the frame never moves
 *          (0.0025, a quarter of a percent): a blinking caret, a twitching dot is a still card. Measured: the example
 *          shot that moves least (worlds' code stage) covers 0.94 %; a thin blinking caret changes no cell past `level`
 *   still  a film is a slideshow, too, when MORE than this share of its shots' running time is still at all, however
 *          short each stretch (0.85): a deck swapped every 3 s holds no stretch past `hold` and is still 93 % of the
 *          time. Measured: the stillest example film (hello) is still 63 % of the time; real code films, compiled
 *          with their own voices (one not voiced yet, at even timings), 18–54 % (two course lessons 29 % and 45 %, a
 *          starter film 54 %, two browser-series episodes 26 % and 18 %), their stillest shot 80 %. Their code stages animate what they reveal (one change
 *          in five or fewer moves for a single step), so counting only longer runs as motion would move none of them by
 *          more than 1.5 points — and would count a word swapped in one step stiller, not less still: the cap stays
 * A deck whose slides differ by one digit or short word is caught by one rule or the other, and which rides on the
 * font: a glyph of another width shifts the rest of the line (macOS's proportional digits: 1.1 % of the frame — the
 * still cap); one of the same width does not (tabular digits: under `cover` — never moving, all dead). Same verdict.
 */
// hold, most and still are the `lesson` pace of footprint-story/motion (PACES): the one table a film's check and a deck's share.
const {hold, most, still} = PACES.lesson;
export const SLIDESHOW = Object.freeze({width: 160, level: 4, area: .0002, hold, most, cover: .0025, still});

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

/**
 * Whether the picture moved from one frame to the next: at least `area` of the cells changed by more than `level`.
 * `seen`, when given (one flag a cell), is marked with every cell that changed: what a shot's steps cover together.
 */
export function moved(before, after, rule = SLIDESHOW, seen = null) {
  let changed = 0;
  for (let i = 0; i < before.length; i++) if (Math.abs(before[i] - after[i]) > rule.level) { changed++; if (seen) seen[i] = 1; }
  return changed >= rule.area * before.length;
}

/**
 * How much each shot moves inside itself: [{path, where, scene, pieces, seconds, still, stillAt, dead, deadAt, cover}] —
 * its middle (pieces, as shotInsides), the `seconds` of it measured (steps of `every` seconds), `still` the seconds that
 * did not move and `stillAt` when each still step starts, `dead` the seconds of still stretches longer than `hold` (or all
 * of a shot that never moves) and `deadAt` when each dead step starts, and `cover`, the share of the frame its changes
 * touched over all its steps together — under `rule.cover`, the shot never moves (a blinking caret is a still card). The frames are read every `every`
 * seconds from each piece's start, drawn small (filmPainter); or, given `times` (moments `every` apart) and `frameAt(t)`
 * (the grey frame drawn at each), at those moments inside each piece — the review reads the picture once for all its checks.
 */
export function shotMotion(film, {from = 0, to = film.total, every = .25, rule = SLIDESHOW, times = null, frameAt = null} = {}) {
  if (!(Number.isFinite(every) && every > 0)) throw new Error(`slideshow: every is seconds between the frames read, more than 0, not ${JSON.stringify(every)}`);
  if (frameAt && !times) throw new Error('slideshow: frameAt gives the frames drawn at the moments in times: give both, or neither (the frames are then drawn here)');
  const paint = frameAt ?? filmPainter(film, rule.width);
  const moments = (a, b) => (times ? times.filter(t => t >= a - 1e-9 && t < b - 1e-9) : Array.from({length: Math.ceil((b - a) / every - 1e-9)}, (_, k) => a + k * every));
  return shotInsides(film, {from, to}).map(shot => {
    let steps = 0, seen = null; const stepAt = [], stillAt = [], runs = [];   // runs: the still stretches, each the start of its still steps
    for (const [a, b] of shot.pieces) {
      let before = null, last = null, run = null;
      for (const t of moments(a, b)) {
        const now = paint(t);
        seen ??= new Uint8Array(now.length);
        if (before && t - last <= every * 1.5) {
          steps++; stepAt.push(+last.toFixed(3));
          if (moved(before, now, rule, seen)) run = null;
          else { stillAt.push(+last.toFixed(3)); if (!run) runs.push(run = []); run.push(+last.toFixed(3)); }
        } else run = null;   // a gap (a change of picture cut out) ends a stretch
        before = now; last = t;
      }
    }
    const cover = seen ? +(seen.reduce((n, v) => n + v, 0) / seen.length).toFixed(5) : 0;
    // A shot whose changes, all together, touch almost none of the frame never moves: all of it is still, and dead.
    const frozen = steps > 0 && cover < rule.cover, still = frozen ? stepAt : stillAt;
    // Dead: a stretch held longer than `hold`, or every still step of a shot that never moves.
    const deadAt = still.length === steps ? still : runs.filter(r => r.length * every > rule.hold + 1e-9).flat();
    return {path: shot.path, where: shot.where, scene: shot.scene, pieces: shot.pieces, seconds: +(steps * every).toFixed(3), still: +(still.length * every).toFixed(3), stillAt: still,
      dead: +(deadAt.length * every).toFixed(3), deadAt, cover};
  });
}

/**
 * The film (or [from, to) of it) as a slideshow or not, options as shotMotion's: {shots, seconds, still, stillShare, dead,
 * deadShare, deadShots, stillShots} — the shots measured (a shot with no step is left out), the seconds of middle
 * measured, of it still and of it dead, the shares still and dead, the shots that hold still (any dead time, each with its
 * `deadShare`) and the shots still nearly all their time (more than `still`, each with its `stillShare`).
 */
export function slideshowOf(film, options = {}) {
  const shots = shotMotion(film, options).filter(s => s.seconds > 0), sum = key => +shots.reduce((n, s) => n + s[key], 0).toFixed(3);
  const share = (a, b) => (b > 0 ? +(a / b).toFixed(3) : 0), seconds = sum('seconds'), still = sum('still'), dead = sum('dead');
  return {shots: shots.length, seconds, still, stillShare: share(still, seconds), dead, deadShare: share(dead, seconds),
    deadShots: shots.filter(s => s.dead > 0).map(s => ({...s, deadShare: share(s.dead, s.seconds)})),
    stillShots: shots.filter(s => share(s.still, s.seconds) > (options.rule ?? SLIDESHOW).still).map(s => ({...s, stillShare: share(s.still, s.seconds)}))};
}

/** The verdict (verdict.mjs): not run with no middle to measure; failed when most of the shots' running time is dead, or nearly all of it still. */
export const SLIDESHOW_VERDICT = Object.freeze({
  rules: Object.freeze([
    Object.freeze({when: Object.freeze({shots: Object.freeze({eq: 0})}), then: 'not run', label: 'no shot has a middle to measure (every moment is a change of picture)'}),
    Object.freeze({when: Object.freeze({deadShare: Object.freeze({gt: SLIDESHOW.most})}), then: 'failed', label: 'most of the running time inside the shots is dead (held still for more than 3 s at a time): a slideshow'}),
    Object.freeze({when: Object.freeze({stillShare: Object.freeze({gt: SLIDESHOW.still})}), then: 'failed', label: 'the shots are still nearly all of the time, in stretches of 3 s or less: a deck of slides'}),
  ]),
  passed: 'the shots move inside themselves: most of their running time is never held still for more than 3 s',
});
