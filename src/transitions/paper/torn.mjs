/**
 * Torn: the old picture is a sheet torn off, a rip that runs across it in `direction` (default right: from the left
 * edge to the right). Behind the rip front the torn flap peels up and curls back on itself, and the new picture is
 * uncovered right behind the curl, in step with the front (optionally drifting in with the tear, `drift`); at the end
 * the curl is carried off the far edge and the new picture settles.
 *
 * What sells it as paper:
 *   - the rip runs at a seeded, uneven pace (tearPace): slow to start (the paper resists), quicker in the middle, with a
 *     few small stutters where it catches — never linear;
 *   - the torn edge is two-tone: the picture's surface, then a ragged white fibrous core with stray fibres, on the sheet
 *     and, a hair apart, on the flap;
 *   - the flap bends rather than turning as a card: next to the edge it still shows the old picture, foreshortened as it
 *     rises (the outgoing pixels carried and displaced), then it rolls over to show the paper's back, shaded as a curl;
 *   - the curl casts a soft shadow on the new picture, moving with it.
 *
 * Worked in tear space (AXES): u runs in the rip's direction from the edge it starts at, v along the front. The front is
 * the line u = f + SLANT · (v − middle) plus its seeded raggedness (tearShape). Every frame is a pure function of e and
 * the settings.
 */
import {W, H, clamp01, lerp, smooth} from '../../frame.mjs';
import {rgba, mixColor} from '../../colour.mjs';
import {paperTokens} from './tokens.mjs';
import {seeded} from './seeded.mjs';

const ROWS = 150, SLANT = .18, RAGGED = 14;
/** The curl's radius as it grows from a lip to a roll, how far the lifting strip reaches, how much it is foreshortened. */
const CURL = Object.freeze({start: 10, most: 44, lift: 1.15, squeeze: .5});
const SHADOW = Object.freeze({length: 54, alpha: .3});
/** The share of the change the rip takes; the rest is the settle. */
const RIP = .9;

/** Each direction the rip can travel, as tear space: `point(u, v)` the frame point of (u, v), the sheet's spans. */
const AXES = Object.freeze({
  right: {point: (u, v) => [u, v], spanU: W, spanV: H},
  left: {point: (u, v) => [W - u, v], spanU: W, spanV: H},
  bottom: {point: (u, v) => [v, u], spanU: H, spanV: W},
  top: {point: (u, v) => [v, H - u], spanU: H, spanV: W},
});
const DIRECTIONS = Object.freeze(Object.keys(AXES));

/**
 * The torn edge from the seed, a row each: its raggedness (a slow wander, a middle wobble and a fine grain, as paper
 * fibres part) and how wide its white core is on the sheet and on the flap. The two lips meet: the new picture never
 * shows through the tear as a line (a dark card would draw it black).
 */
function tearShape(seed) {
  const next = seeded(seed), [a, b] = [next() * 2 * Math.PI, next() * 2 * Math.PI];
  let wobble = 0, grain = 0;
  return Array.from({length: ROWS + 1}, (_, i) => {
    wobble = .8 * wobble + .2 * (2 * next() - 1); grain = .45 * grain + .55 * (2 * next() - 1);
    return {
      ragged: RAGGED * (.42 * Math.sin(i * .045 + a) + .23 * Math.sin(i * .13 + b) + .9 * wobble) + 2.6 * grain,
      core: 2.5 + 6 * next() ** 1.5, flapCore: 1.5 + 4 * next() ** 1.5,
    };
  });
}
/** Stray fibres along the edge, from the seed: where (a row, between two), how long, at what angle. */
function fibres(seed) {
  const next = seeded(seed + 7);
  return Array.from({length: 46}, () => ({at: next(), length: 4 + 12 * next(), angle: (next() - .5) * 1.2, side: next() < .6 ? 'sheet' : 'flap'}));
}

const paces = new Map();
/**
 * The rip's progress, 0..1, at x (0..1 of the rip): a seeded speed curve integrated — slow to start, quicker in the
 * middle, easing as it leaves, with a few short stutters where the speed drops nearly to nothing. The same seed, the
 * same curve.
 */
export function tearPace(seed) {
  if (!paces.has(seed)) {
    const next = seeded(seed + 101), stutters = Array.from({length: 6}, () => ({at: .12 + .76 * next(), width: .01 + .016 * next(), depth: .6 + .35 * next()}));
    const speed = x => (.22 + .78 * smooth(0, .3, x)) * (1 - .45 * smooth(.78, 1, x)) * stutters.reduce((k, s) => k * (1 - s.depth * Math.exp(-(((x - s.at) / s.width) ** 2))), 1);
    const N = 480, sum = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) sum[i] = sum[i - 1] + speed((i - .5) / N);
    if (paces.size >= 64) paces.delete(paces.keys().next().value);   // a few seeds kept, never a growing pile
    paces.set(seed, x => { const k = clamp01(x) * N, i = Math.min(N - 1, Math.floor(k)); return (sum[i] + (sum[i + 1] - sum[i]) * (k - i)) / sum[N]; });
  }
  return paces.get(seed);
}

/**
 * Where the change is at e: the front's mean position `f`, the curl's radius, the lifting strip's reach, how far the new
 * picture still sits back along the rip (`behind`, from `drift`), and its settle (`swell`, a scale ≥ 1), all in tear
 * space. Exported for the tests.
 */
export function tornAt(e, p, ax = AXES[p.direction]) {
  const reach = SLANT * ax.spanV / 2 + RAGGED + 12;
  const flap = CURL.lift * CURL.most + 2 * CURL.most + SHADOW.length + 16;
  const ripped = tearPace(p.seed)(e / RIP), f = lerp(-reach, ax.spanU + reach + flap, ripped);
  const r = lerp(CURL.start, CURL.most, smooth(0, .45, clamp01(f / ax.spanU)));
  // The new picture comes in with the tear: back by `drift` at the start, home as the front leaves. It is never further
  // back than the uncovered part leaves room for (its far edge, set back, would show the ground behind the curl).
  const uncovered = f + SLANT * ax.spanV / 2 - CURL.lift * r - 2 * r;
  const behind = -Math.min(p.drift * (1 - clamp01(ripped * 1.08)), Math.max(0, ax.spanU - uncovered));
  // Then the settle: a slight swell of the new picture about the frame's centre, damped, never below full size (so no
  // edge ever shows), exactly 1 at e = 1.
  const u = clamp01((e - RIP) / (1 - RIP)), swell = 1 + .006 * (1 - Math.cos(u * Math.PI * 4)) / 2 * (1 - u) ** 2;
  return {f, r, lift: CURL.lift * r, behind, swell, ripped};
}

/** An affine map taking three frame points to three others: [a, b, c, d, e, f] for ctx.transform. */
function affine([p0, p1, p2], [q0, q1, q2]) {
  const det = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
  const solve = k => {
    const a = ((q1[k] - q0[k]) * (p2[1] - p0[1]) - (q2[k] - q0[k]) * (p1[1] - p0[1])) / det;
    const b = ((q2[k] - q0[k]) * (p1[0] - p0[0]) - (q1[k] - q0[k]) * (p2[0] - p0[0])) / det;
    return [a, b, q0[k] - a * p0[0] - b * p0[1]];
  };
  const [a, c, e] = solve(0), [b, d, f] = solve(1);
  return [a, b, c, d, e, f];
}

function torn(ctx, {e, from, to, p, theme}) {
  const t = paperTokens(theme), ax = AXES[p.direction], at = tornAt(e, p, ax), mid = ax.spanV / 2;
  const shape = tearShape(p.seed), rows = shape.map((s, i) => ({...s, v: i / ROWS * ax.spanV}));
  const mean = v => at.f + SLANT * (v - mid), edge = row => mean(row.v) + row.ragged;
  const pt = (u, v) => ax.point(u, v);
  /** A polygon in tear space: from row to row along uOf(row), then back along uOfBack(row). */
  const band = (uOf, uOfBack) => {
    ctx.beginPath(); ctx.moveTo(...pt(uOf(rows[0]), rows[0].v));
    for (const row of rows) ctx.lineTo(...pt(uOf(row), row.v));
    for (const row of [...rows].reverse()) ctx.lineTo(...pt(uOfBack(row), row.v));
    ctx.closePath();
  };
  /** A gradient across the front (in the rip's direction) from u0 to u1 at the middle row, with colour stops. */
  const across = (u0, u1, stops) => {
    const n = Math.hypot(1, SLANT), [x0, y0] = pt(u0, mid), [x1, y1] = pt(u0 + (u1 - u0) / n / n, mid - SLANT * (u1 - u0) / n / n);
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [k, c] of stops) g.addColorStop(k, c);
    return g;
  };
  const far = 6000, curlOut = row => mean(row.v) - at.lift - 2 * at.r, liftOut = row => mean(row.v) - at.lift;

  // The new picture, uncovered behind the curl: drawn whole, set back along the rip by `behind` (drift, settle).
  ctx.fillStyle = t.ground; ctx.fillRect(0, 0, W, H);
  ctx.save(); const [bx, by] = pt(at.behind, 0), [ox, oy] = pt(0, 0); ctx.translate(bx - ox, by - oy);
  ctx.translate(W / 2, H / 2); ctx.scale(at.swell, at.swell); ctx.translate(-W / 2, -H / 2); to(ctx); ctx.restore();
  // The curl's shadow on it, moving with the curl.
  ctx.save(); band(row => curlOut(row) - SHADOW.length, curlOut); ctx.fillStyle = across(at.f - at.lift - 2 * at.r - SHADOW.length, at.f - at.lift - 2 * at.r,
    [[0, rgba(t.ink, 0)], [.7, rgba(t.ink, SHADOW.alpha * .55)], [1, rgba(t.ink, SHADOW.alpha)]]); ctx.fill(); ctx.restore();

  // The sheet still on, ahead of the front: the old picture, its torn edge two-tone (surface, then the white core).
  const core = mixColor(t.paper, '#ffffff', .7);
  ctx.save(); band(edge, () => far); ctx.clip(); from(ctx);
  band(edge, row => edge(row) + row.core); ctx.fillStyle = core; ctx.fill(); ctx.restore();

  // The flap: next to its torn edge it still shows the old picture, foreshortened as it rises (the strip that lay just
  // behind the front, squeezed toward it), shading darker as it turns away.
  const flapEdge = edge;
  // The squeeze is pinned to the slanted front, so on every row the flap shows the strip that lay just behind it.
  const [a0, a1, a2] = [[mean(0), 0], [mean(ax.spanV), ax.spanV], [mean(0) - 100, 0]];
  const squeeze = affine([pt(...a0), pt(...a1), pt(...a2)], [pt(...a0), pt(...a1), pt(mean(0) - 100 * CURL.squeeze, 0)]);
  // Paper first: near the far edge the squeezed picture runs out (the sheet ends at the frame), and the flap is paper there.
  ctx.save(); band(liftOut, flapEdge); ctx.clip(); ctx.fillStyle = t.back; ctx.fillRect(-W, -H, 3 * W, 3 * H);
  ctx.save(); ctx.transform(...squeeze); from(ctx); ctx.restore();
  band(liftOut, flapEdge); ctx.fillStyle = across(at.f - at.lift, at.f, [[0, rgba(t.ink, .42)], [.55, rgba(t.ink, .14)], [1, rgba(t.ink, .04)]]); ctx.fill();
  band(row => flapEdge(row) - row.flapCore, flapEdge); ctx.fillStyle = core; ctx.fill(); ctx.restore();

  // The curl: the paper rolled over on itself, its back showing, shaded as a cylinder (dark where it turns under, lit on
  // top), with a few faint lines where the layers lie.
  // The back of paper is a shade warmer and duller than its face: the back mixed toward the crease shade.
  const underside = mixColor(t.back, t.fold, .45);
  ctx.save(); band(curlOut, liftOut);
  ctx.fillStyle = across(at.f - at.lift - 2 * at.r, at.f - at.lift, [[0, mixColor(underside, t.ink, .38)], [.12, mixColor(underside, t.ink, .16)], [.4, mixColor(underside, t.back, .6)],
    [.55, mixColor(underside, t.back, .75)], [.8, mixColor(underside, t.ink, .1)], [1, mixColor(underside, t.ink, .3)]]);
  ctx.fill(); ctx.clip();
  // Where the curl rests on the new picture: a thin dark line of contact.
  ctx.strokeStyle = rgba(t.ink, .3); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(...pt(curlOut(rows[0]), rows[0].v)); ctx.lineTo(...pt(curlOut(rows[ROWS]), rows[ROWS].v)); ctx.stroke();
  ctx.strokeStyle = rgba(t.ink, .08); ctx.lineWidth = 1.2;
  for (const k of [.22, .58, .8]) { ctx.beginPath(); ctx.moveTo(...pt(curlOut(rows[0]) + 2 * at.r * k, rows[0].v)); ctx.lineTo(...pt(curlOut(rows[ROWS]) + 2 * at.r * k, rows[ROWS].v)); ctx.stroke(); }
  ctx.restore();

  // Stray fibres where the paper parted, on both lips.
  ctx.save(); ctx.strokeStyle = rgba(core, .9); ctx.lineWidth = 1.1; ctx.lineCap = 'round';
  for (const fb of fibres(p.seed)) {
    const k = fb.at * ROWS, i = Math.min(ROWS - 1, Math.floor(k)), row = rows[i], next = rows[i + 1], v = lerp(row.v, next.v, k - i);
    const u0 = fb.side === 'sheet' ? lerp(edge(row), edge(next), k - i) : lerp(flapEdge(row) - row.flapCore, flapEdge(next) - next.flapCore, k - i);
    const toward = fb.side === 'sheet' ? -1 : 1, u1 = u0 + toward * fb.length * Math.cos(fb.angle), v1 = v + fb.length * Math.sin(fb.angle);
    ctx.beginPath(); ctx.moveTo(...pt(u0, v)); ctx.lineTo(...pt(u1, v1)); ctx.stroke();
  }
  ctx.restore();
}

export const TORN = {family: 'wipe', seconds: 3.2, ease: 'linear', sound: 'crumble',
  params: {direction: {oneOf: DIRECTIONS, default: 'right'}, drift: {number: [0, 200], default: 0}, seed: {number: [0, 10000], default: 5}}, draw: torn};
