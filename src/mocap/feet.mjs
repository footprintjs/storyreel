/**
 * Feet on the floor: where the floor is, when a foot is still, and a planted foot locked to its spot so it never
 * slides. The measures are the rig's (rig.mjs: torso lengths, y up). Pure functions.
 */
import {runsOf} from './keypoints.mjs';
import {quantile, median} from './tracks.mjs';

const smooth = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

/** A joint's place in the room in each frame: where the body is plus where the joint is on it. */
export const absolute = (root, joints, name) => root.map((r, f) => ({x: r.x + joints[f][name].x, y: r.y + joints[f][name].y}));

/**
 * The floor: the height the ankles come down to. Of every height either ankle was at, the one a share `q` of the way
 * up (a low one, so the floor is where a foot stands, not where a lifted foot passes; not the lowest, so one noisy
 * frame does not set it).
 */
export const floorOf = (ankles, q = .1) => quantile(ankles.flat().map(p => p.y), q);

/** A point's speed in each frame (units a second), from the frame before to the frame after. */
export function speedsOf(track, fps) {
  const last = track.length - 1, step = (a, b) => Math.hypot(track[b].x - track[a].x, track[b].y - track[a].y) * fps / (b - a);
  return track.map((_, f) => step(Math.max(0, f - 1), Math.min(last, f + 1)));
}

/** Runs whose gap is at most `join` frames, joined: [[from, to, blips]] (blips: how many gaps were closed). */
function joined(runs, join) {
  const out = [];
  for (const [from, to] of runs) {
    const last = out.at(-1);
    if (last && from - last[1] - 1 <= join) { last[1] = to; last[2]++; } else out.push([from, to, 0]);
  }
  return out;
}

const range = (from, to) => Array.from({length: Math.max(0, to - from + 1)}, (_, i) => from + i);

/**
 * A stretch's frames as pieces of the clip: one, or for a stretch that wraps a loop's seam two — the start of the
 * clip (0 … to) and its end (from … the last frame, which is the next repeat's first).
 */
export const piecesOf = (run, n) => (run.wraps ? [{from: 0, to: run.to}, {from: run.from, to: n - 1}] : [{from: run.from, to: run.to}]);
/** The frames a stretch holds, each once: a wrapping stretch's last frame is its first. */
const framesOf = (run, n) => (run.wraps ? [...range(0, run.to), ...range(run.from, n - 2)] : range(run.from, run.to));

/**
 * The stretches a foot is still: runs of frames where it moves at most `still` units a second, each with how long
 * it lasts (seconds: its frames over fps), how high it is over the floor (its median height there) and `blips`: a
 * stretch broken by a move of at most `join` frames is one stretch (a blip of noise inside a stance is not a step,
 * and two spots for one stance would make the foot hop between them). Looped (`loop`), the clip's last frame is the
 * next repeat's first, so a stillness at the end and one at the start are one stretch across the seam (`wraps`:
 * from is near the end, to near the start).
 */
export function slowRuns(track, fps, still, floor, {join = 0, loop = false} = {}) {
  const n = track.length;
  let runs = joined(runsOf(speedsOf(track, fps).map(v => v <= still)), join);
  if (loop && runs.length > 1 && runs[0][0] === 0 && runs.at(-1)[1] === n - 1) {
    const [end, begin] = [runs.at(-1), runs[0]];
    runs = [...runs.slice(1, -1), [end[0], begin[1], end[2] + begin[2], true]];
  }
  return runs.map(([from, to, blips, wraps]) => {
    const run = {from, to, blips, ...(wraps ? {wraps} : {})}, frames = framesOf(run, n);
    return {...run, seconds: frames.length / fps, height: median(frames.map(f => track[f].y)) - floor};
  });
}

/**
 * Where a still stretch stands: its median place (a wrapping stretch's end measured back by the loop's `travel`, so
 * both ends are one spot), on the floor. Returns its pieces, each with its spot: the end piece of a wrapping
 * stretch stands `travel` on, where the next repeat finds it.
 */
export function spotsOf(track, run, floor, travel) {
  const n = track.length, pieces = piecesOf(run, n), back = f => (run.wraps && f >= run.from ? travel : 0);
  const x = median(framesOf(run, n).map(f => track[f].x - back(f)));
  return pieces.map(piece => ({...piece, spot: {x: x + back(piece.from), y: floor}}));
}

/** The contact nearest a frame, and how many frames away (0: inside it). */
function nearest(contacts, f) {
  let best = null, gap = Infinity;
  for (const c of contacts) { const d = f < c.from ? c.from - f : f > c.to ? f - c.to : 0; if (d < gap) { best = c; gap = d; } }
  return {contact: best, gap};
}

/**
 * A foot locked to its contacts' pieces ([{from, to, spot}], frame indices; spotsOf). Inside a piece it is exactly
 * the piece's spot, so it never slides; for `blend` frames either side it eases from where the video had it to the
 * spot, so it never pops. Two pieces can share a blend: the nearer holds a frame. Returns {track, weight}: the new
 * track, and how locked each frame is (1 inside a piece, 0 free).
 */
export function lockFoot(track, held, blend) {
  const weight = [], out = [];
  track.forEach((p, f) => {
    const {contact, gap} = nearest(held, f);
    const w = !contact || gap > blend ? 0 : gap === 0 ? 1 : smooth(1 - gap / (blend + 1));
    weight.push(w);
    out.push(w === 1 ? {...contact.spot} : w === 0 ? {...p} : {x: p.x + (contact.spot.x - p.x) * w, y: p.y + (contact.spot.y - p.y) * w});
  });
  return {track: out, weight};
}
