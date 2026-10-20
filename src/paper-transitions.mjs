/**
 * The paper transitions: eight changes of picture drawn as things done to paper and ink. They are built-in entries of
 * the one collection (transitions.mjs · TRANSITIONS) and draw through its one contract,
 * draw(ctx, {e, from, to, p, ghost, theme, boxes}):
 *
 *   torn       the old page is torn away along a ragged edge          leave the old page behind (a recap → a new episode)
 *   inkBleed   ink spreads from a point; the new picture rises in it  a new chapter seeping in; a mood turning
 *   eraser     a board eraser wipes the old picture off               a clean slate: the same lesson, started again
 *   ringIris   a ring opens from a point, a dot running round it      through a loop or a cycle: once more, round again
 *   glassSheet the new picture arrives on a lifted sheet of glass     a layer laid over the last: one more on the stack
 *   curl       the old page's corner curls over, the new page beneath turn the page, as in a book
 *   fold       the old picture folds shut; the new one pops open      close one thing, open the next (a card, a map)
 *   morph      a box in the old picture becomes a box in the new one  this thing becomes that thing
 *
 * Three laws every one keeps (pinned by test/transitions.test.mjs):
 *   - e = 0 is the leaving picture and e = 1 the arriving one, exactly (landed): the shapes start and end off the
 *     frame, and the two ends are drawn as the pictures themselves, so nothing pops when the shot takes over;
 *   - a frame is a pure function of e and the settings: a ragged edge or an ink blot comes from a seeded shape
 *     (seeded · `seed` setting), never Math.random, so the same frame index gives the same pixels;
 *   - paper and ink are the film's theme's (paperTokens): its card, its well, its ink. A colour a transition adds (a
 *     ring, an outline, the glass) is a setting whose default, null, is the theme's own.
 */
import {loadTheme} from './theme.mjs';

const W = 1600, H = 900, TAU = Math.PI * 2;
const clamp01 = n => Math.max(0, Math.min(1, n));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
/** How far the frame's farthest corner is from (cx, cy). */
const farthest = ([cx, cy]) => Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));

/** The two ends exactly: e = 0 is the leaving picture, e = 1 the arriving one; between, the transition's own draw (the canvas left as it was found). */
const landed = draw => function drawLanded(ctx, args) {
  if (!(args.e > 0)) { args.from(ctx); return; }
  if (!(args.e < 1)) { args.to(ctx); return; }
  ctx.save();
  try { draw(ctx, args); } finally { ctx.restore(); }
};

let paperTheme = null;
/**
 * The paper and ink a transition draws with: the film's theme's palette (theme.mjs), or the built-in paper theme's
 * when the caller passes none. `paper` is a sheet's face, `back` its back, `fold` the shade in a crease, `ground` what
 * the paper lies on, `ink` the ink; `accent` and `second` are the theme's own colours for a setting left at null.
 */
export function paperTokens(theme) {
  const p = theme?.palette ?? (paperTheme ??= loadTheme('paper')).palette;
  return {paper: p.card ?? p.panel, back: p.panel ?? p.card, fold: p.well ?? p.edge, ground: p.bg, ink: p.ink, accent: p.accent, second: p.available};
}

/** A hex colour (#rgb, #rrggbb or #rrggbbaa) as [r, g, b, a]. */
function rgbaOf(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
}
/** A hex colour at alpha a (times its own). */
export function withAlpha(hex, a) { const [r, g, b, k] = rgbaOf(hex); return `rgba(${r}, ${g}, ${b}, ${+(clamp01(a) * k).toFixed(4)})`; }
/** Two hex colours mixed, u of the way from the first to the second, at alpha a. */
function mixed(hexA, hexB, u, a = 1) {
  const x = rgbaOf(hexA), y = rgbaOf(hexB), c = k => Math.round(lerp(x[k], y[k], u));
  return `rgba(${c(0)}, ${c(1)}, ${c(2)}, ${+clamp01(a).toFixed(4)})`;
}

/**
 * A seeded stream of numbers in [0, 1) (mulberry32): the same seed gives the same stream on every frame and every
 * machine, so a ragged edge is a shape, not noise. Any finite seed works; its whole and fractional parts both count.
 */
export function seeded(seed) {
  const whole = Math.floor(seed);
  let s = (Math.imul(whole, 0x9e3779b1) ^ Math.round((seed - whole) * 1e6)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── torn ────────────────────────────────────────────────────────────────────────────────────────────────────────

const TEAR_ROWS = 48, TEAR_SLANT = .25, TEAR_RAGGED = 26;
/** How far past the frame the tear starts and ends: the slant, the ragged edge, the fibre strip and its shadow. */
const TEAR_REACH = TEAR_SLANT * H / 2 + TEAR_RAGGED + 10 + 60;
/** The torn edge's offsets, a row each, from the seed: a slow wander and alternate fibre teeth. */
function tearShape(seed) {
  const next = seeded(seed), phase = next() * TAU;
  return Array.from({length: TEAR_ROWS + 1}, (_, i) => {
    const wander = .55 * (2 * next() - 1) + .45 * Math.sin(i * 1.7 + phase), tooth = i % 2 ? 2 + 4 * next() : 0;
    return (wander * (TEAR_RAGGED - 6)) + tooth;
  });
}
/** The old page as it is torn away: the edge travels across the frame, the page beyond it pulled a little after it. */
function torn(ctx, {e, from, to, p, theme}) {
  const t = paperTokens(theme), dir = p.from === 'left' ? -1 : 1, shape = tearShape(p.seed);
  // The edge's x on each row, in the frame (a tear from the right travels left; from the left, mirrored).
  const x0 = lerp(W + TEAR_REACH, -TEAR_REACH, e);
  const edge = shape.map((dx, i) => { const y = i / TEAR_ROWS * H, x = x0 + (y - H / 2) * TEAR_SLANT + dx; return [dir > 0 ? x : W - x, y]; });
  const keep = dir > 0 ? -W : 2 * W;   // the side the old page is still on, far enough out that its shadow never reaches the frame
  const outline = dx => { ctx.beginPath(); ctx.moveTo(keep, -10); for (const [x, y] of edge) ctx.lineTo(x + dx * dir, y); ctx.lineTo(keep, H + 10); ctx.closePath(); };
  to(ctx);
  // The torn fibres: a strip of the paper's back along the tear, casting a soft shadow on the new picture.
  ctx.save(); ctx.shadowColor = withAlpha(t.ink, .35); ctx.shadowBlur = 24; ctx.shadowOffsetX = 10 * dir; outline(10); ctx.fillStyle = t.back; ctx.fill(); ctx.restore();
  ctx.save(); outline(0); ctx.clip(); ctx.translate(-30 * e * dir, 0); from(ctx); ctx.restore();
}

// ── ink bleed ───────────────────────────────────────────────────────────────────────────────────────────────────

const BLOT_POINTS = 96, BLOT_DROPS = 9;
/** An ink blot's shape from the seed: a ragged rim (radius factors round the circle) and a few splashed drops. */
function blotShape(seed) {
  const next = seeded(seed), a = next() * TAU, b = next() * TAU;
  const rim = Array.from({length: BLOT_POINTS}, (_, i) => { const ang = i / BLOT_POINTS * TAU; return 1 + .16 * Math.sin(5 * ang + a) + .08 * Math.sin(13 * ang + b) + .05 * (2 * next() - 1); });
  const drops = Array.from({length: BLOT_DROPS}, (_, i) => ({angle: i * 2.4 + a, out: 1.18 + .14 * next(), size: .05 + .03 * next()}));
  // The rim's nearest reach (its polygon's edges sag at most cos(π/n) inside its points): the blot covers every point
  // within r · least of its centre.
  return {rim, drops, least: Math.min(...rim) * Math.cos(Math.PI / BLOT_POINTS)};
}
function blotPath(ctx, {rim, drops}, cx, cy, r) {
  ctx.beginPath();
  rim.forEach((k, i) => { const ang = i / BLOT_POINTS * TAU, x = cx + Math.cos(ang) * r * k, y = cy + Math.sin(ang) * r * k; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.closePath();
  for (const d of drops) { const x = cx + Math.cos(d.angle) * r * d.out, y = cy + Math.sin(d.angle) * r * d.out; ctx.moveTo(x + r * d.size, y); ctx.arc(x, y, r * d.size, 0, TAU); }
}
/** Ink spreads across the old picture from `at`; the new picture comes up through the ink a beat behind it. */
function inkBleed(ctx, {e, from, to, p, theme}) {
  const ink = p.color ?? paperTokens(theme).ink, inkShape = blotShape(p.seed), riseShape = blotShape(p.seed + 1);
  // The radius at which each blot's ragged rim clears the farthest corner, with a little to spare.
  const cover = shape => farthest(p.at) / shape.least * 1.04, spread = clamp01(e * 1.35), rise = clamp01((e - .3) / .7);
  from(ctx);
  if (spread > 0) { ctx.save(); blotPath(ctx, inkShape, ...p.at, cover(inkShape) * spread); ctx.fillStyle = ink; ctx.fill(); ctx.restore(); }
  if (rise > 0) { ctx.save(); blotPath(ctx, riseShape, ...p.at, cover(riseShape) * rise); ctx.clip(); to(ctx); ctx.restore(); }
}

// ── eraser ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** The eraser block at 3× a whiteboard eraser (kits/whiteboard/board.mjs · drawEraser): 270 × 360 with its felt and shadow. */
const ERASER = {w: 270, h: 360, felt: 48, shadow: [15, 24]};
/** How far past the frame the eraser starts and ends: half its width, its shadow and a margin. */
const ERASER_REACH = ERASER.w / 2 + ERASER.shadow[0] + 30;
function eraserBlock(ctx, x, y, body, felt, shade) {
  const {w, h} = ERASER;
  ctx.save();
  ctx.fillStyle = shade; ctx.fillRect(x - w / 2 + ERASER.shadow[0], y - h / 2 + ERASER.shadow[1], w, h);
  ctx.fillStyle = body; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 30); ctx.fill();
  ctx.fillStyle = felt; ctx.fillRect(x - w / 2, y + h / 2 - ERASER.felt, w, ERASER.felt);
  ctx.restore();
}
/** A board eraser wipes the old picture off, from one side to the other; the new picture is underneath. */
function eraser(ctx, {e, from, to, p, theme}) {
  const t = paperTokens(theme), right = p.from === 'right';
  const x = right ? lerp(W + ERASER_REACH, -ERASER_REACH, e) : lerp(-ERASER_REACH, W + ERASER_REACH, e);
  to(ctx);
  ctx.save(); ctx.beginPath();
  if (right) ctx.rect(0, 0, Math.max(0, x), H); else ctx.rect(x, 0, Math.max(0, W - x), H);
  ctx.clip(); from(ctx); ctx.restore();
  eraserBlock(ctx, x, H / 2 + Math.sin(e * 22) * 60, p.color, t.fold, withAlpha(t.ink, .12));
}

// ── ring iris ───────────────────────────────────────────────────────────────────────────────────────────────────

/** A ring opens from `at` (from `radius`, or a point) onto the new picture, a dot running round it twice. */
function ringIris(ctx, {e, from, to, p, ghost, theme}) {
  const t = paperTokens(theme), [cx, cy] = p.at, R = farthest(p.at) + p.width + 12, r = Math.max(.5, lerp(p.radius, R, e));
  from(ctx);
  const inside = c => { c.save(); c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.clip(); to(c); c.restore(); };
  // A ring that starts with a size (one already drawn in the old picture) dissolves its inside to the new picture.
  if (p.radius > 0) ghost(smooth(0, .25, e), inside); else inside(ctx);
  ctx.save(); ctx.globalAlpha *= smooth(0, .12, e); ctx.lineCap = 'round'; ctx.lineWidth = p.width * (1 - .5 * e);
  ctx.strokeStyle = t.fold; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  [p.color ?? t.accent, p.accent ?? t.second].forEach((c, i) => {
    ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2 + i * Math.PI + .06, Math.PI / 2 + i * Math.PI - .06); ctx.stroke();
  });
  const a = -Math.PI / 2 + e * 2 * TAU, dx = cx + Math.cos(a) * r, dy = cy + Math.sin(a) * r;
  ctx.fillStyle = t.ink; ctx.beginPath(); ctx.arc(dx, dy, p.width * .7, 0, TAU); ctx.fill();
  ctx.fillStyle = t.paper; ctx.beginPath(); ctx.arc(dx, dy, p.width * .27, 0, TAU); ctx.fill();
  ctx.restore();
}

// ── glass sheet ─────────────────────────────────────────────────────────────────────────────────────────────────

const SIDES = {left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1]};
/** How far off the frame the sheet starts: past its tilt and its shadow. */
const GLASS_REACH = 200;
/** The old picture steps back and dims on the paper it lies on; the new one arrives on a lifted sheet of glass and settles flat. */
function glassSheet(ctx, {e, from, to, p, theme}) {
  const t = paperTokens(theme), lift = 1 - e, [sx, sy] = SIDES[p.from], back = 1 - .08 * e;
  ctx.save(); ctx.fillStyle = t.ground; ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2); ctx.scale(back, back); ctx.translate(-W / 2, -H / 2); from(ctx);
  ctx.fillStyle = withAlpha(t.ink, .18 * e); ctx.fillRect(0, 0, W, H); ctx.restore();
  const ox = sx * (W + GLASS_REACH) * lift, oy = sy * (H + GLASS_REACH) * lift, tilt = -.05 * lift * (sx || -sy), s = 1 - .06 * lift;
  ctx.save(); ctx.translate(ox + W / 2, oy + H / 2); ctx.rotate(tilt); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
  ctx.shadowColor = withAlpha(t.ink, .35 * lift); ctx.shadowBlur = 60 * lift; ctx.shadowOffsetY = 30 * lift;
  ctx.fillStyle = t.paper; ctx.fillRect(0, 0, W, H); ctx.shadowColor = 'transparent';
  to(ctx);
  if (lift > .01) glassOver(ctx, p.tint, lift);
  ctx.restore();
}
/** The glass itself, fading as it settles: a sheen across it, a tinted edge and a lit rim along two sides. */
function glassOver(ctx, tint, lift) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, mixed(tint, '#ffffff', .7, .35 * lift)); g.addColorStop(1, withAlpha(tint, .12 * lift));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = mixed(tint, '#1e3c64', .45, .8 * lift); ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, H - 6);
  ctx.strokeStyle = withAlpha('#ffffff', .95 * lift); ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(20, 12); ctx.lineTo(W - 20, 12); ctx.moveTo(12, 20); ctx.lineTo(12, H * .6); ctx.stroke();
}

// ── corner curl ─────────────────────────────────────────────────────────────────────────────────────────────────

const CORNERS = {'bottom-right': [W, H], 'bottom-left': [0, H], 'top-right': [W, 0], 'top-left': [0, 0]};
/**
 * A page's corner curls over: the fold line crosses the page's diagonal, from the corner (nothing lifted) to just past
 * the far corner (the whole page lifted and its back off the frame). Beyond the fold the new picture is uncovered;
 * the lifted part lies folded back over the old page, its back showing, darker at the crease.
 */
function curl(ctx, {e, from, to, p, theme}) {
  const t = paperTokens(theme), c0 = CORNERS[p.corner], diag = Math.hypot(W, H);
  const n = [(2 * c0[0] - W) / diag, (2 * c0[1] - H) / diag];        // across the page, toward the lifting corner
  const m = [c0[0] - n[0] * diag * 1.05 * e, c0[1] - n[1] * diag * 1.05 * e], d = [-n[1], n[0]], L = 6000;
  const half = sign => {   // the half-plane on the `sign` side of the fold line
    ctx.beginPath(); ctx.moveTo(m[0] + d[0] * L, m[1] + d[1] * L); ctx.lineTo(m[0] - d[0] * L, m[1] - d[1] * L);
    ctx.lineTo(m[0] - d[0] * L + sign * n[0] * L, m[1] - d[1] * L + sign * n[1] * L); ctx.lineTo(m[0] + d[0] * L + sign * n[0] * L, m[1] + d[1] * L + sign * n[1] * L); ctx.closePath();
  };
  to(ctx);
  ctx.save(); half(-1); ctx.clip(); from(ctx); ctx.restore();
  // The flap: the lifted part, reflected over the fold line, showing the page's back.
  const r00 = d[0] * d[0] - d[1] * d[1], r01 = 2 * d[0] * d[1], r11 = d[1] * d[1] - d[0] * d[0];
  ctx.save(); ctx.transform(r00, r01, r01, r11, m[0] - (r00 * m[0] + r01 * m[1]), m[1] - (r01 * m[0] + r11 * m[1]));
  half(1); ctx.clip(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  const g = ctx.createLinearGradient(m[0], m[1], m[0] + n[0] * 400, m[1] + n[1] * 400); g.addColorStop(0, t.fold); g.addColorStop(1, t.back);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  // A soft shade along the crease, on the page side.
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  const sg = ctx.createLinearGradient(m[0], m[1], m[0] - n[0] * 70, m[1] - n[1] * 70); sg.addColorStop(0, withAlpha(t.ink, .3)); sg.addColorStop(1, withAlpha(t.ink, 0));
  ctx.fillStyle = sg; half(-1); ctx.fill(); ctx.restore();
}

// ── fold ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The old picture folds shut along its middle line; the new one pops open from the crease. */
function fold(ctx, {e, from, to, p, theme}) {
  const t = paperTokens(theme), down = p.line === 'vertical', crease = (down ? W : H) / 2;
  ctx.fillStyle = t.ground; ctx.fillRect(0, 0, W, H);
  const half = (paint, k, first) => {
    const at = first ? 0 : crease, rect = down ? [at, 0, crease, H] : [0, at, W, crease];
    ctx.save(); ctx.beginPath(); ctx.rect(...rect); ctx.clip();
    if (down) { ctx.translate(crease, 0); ctx.scale(Math.max(.001, k), 1); ctx.translate(-crease, 0); } else { ctx.translate(0, crease); ctx.scale(1, Math.max(.001, k)); ctx.translate(0, -crease); }
    paint(ctx);
    ctx.fillStyle = withAlpha(t.ink, .35 * (1 - k)); ctx.fillRect(...rect); ctx.restore();
  };
  // Closing: the halves turn edge-on (cos); opening: they spring back open a little early, the pop (1.06 sin, held at 1).
  const k = e < .5 ? Math.cos(e / .5 * Math.PI / 2) : Math.min(1, 1.06 * Math.sin((e - .5) / .5 * Math.PI / 2)), paint = e < .5 ? from : to;
  half(paint, k, true); half(paint, k, false);
  ctx.strokeStyle = withAlpha(t.ink, .4 * Math.sin(e * Math.PI)); ctx.lineWidth = 3; ctx.beginPath();
  if (down) { ctx.moveTo(crease, 0); ctx.lineTo(crease, H); } else { ctx.moveTo(0, crease); ctx.lineTo(W, crease); }
  ctx.stroke();
}

// ── morph ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Where the morph's box starts and ends: a named thing's box (found by the film, boxes) or the box setting. */
function morphBoxes({p, boxes}) {
  const into = p.into ?? p.region;
  return [p.region ? boxes.from[p.region] ?? p.fromBox : p.fromBox, into ? boxes.to[into] ?? p.toBox : p.toBox];
}
/** A box becomes a box: the old picture dims away while its box travels and reshapes into the new one's. */
function morph(ctx, args) {
  const {e, from, to, p, ghost, theme} = args, t = paperTokens(theme), [a, b] = morphBoxes(args);
  ctx.fillStyle = t.ground; ctx.fillRect(0, 0, W, H);
  if (e < .55) ghost(1 - clamp01(e / .55), from);
  if (e > .45) ghost(clamp01((e - .45) / .55), to);
  const u = clamp01((e - .15) / .7), box = [0, 1, 2, 3].map(k => lerp(a[k], b[k], u));
  const rad = lerp(10, Math.min(box[2] - box[0], box[3] - box[1]) / 2, u * .6);
  ctx.save(); ctx.globalAlpha *= Math.sin(Math.PI * clamp01(e * 1.05)); ctx.lineWidth = 6;
  ctx.strokeStyle = p.color ?? t.accent; ctx.fillStyle = withAlpha(t.paper, .55);
  ctx.beginPath(); ctx.roundRect(box[0], box[1], box[2] - box[0], box[3] - box[1], Math.max(0, rad)); ctx.fill(); ctx.stroke(); ctx.restore();
}

// ── the catalog entries ─────────────────────────────────────────────────────────────────────────────────────────

const themed = {color: true, default: null};   // a colour the transition adds: null is the film's theme's
const seed = fallback => ({number: [0, 10000], default: fallback});
const CARD = Object.freeze([600, 320, 1000, 580]), WIDE = Object.freeze([160, 90, 1440, 810]);

/** The eight, by family (transitions.mjs · TRANSITIONS splices each into its family's place). */
export const PAPER_TRANSITIONS = Object.freeze({
  torn: {family: 'wipe', seconds: 1.1, ease: 'inOut', sound: 'slide', params: {from: {oneOf: ['right', 'left'], default: 'right'}, seed: seed(5)}, draw: landed(torn)},
  eraser: {family: 'wipe', seconds: 1.1, ease: 'inOut', sound: 'slide', params: {from: {oneOf: ['left', 'right'], default: 'left'}, color: {color: true, default: '#3b4a63'}}, draw: landed(eraser)},
  inkBleed: {family: 'iris', seconds: 1.3, ease: 'inOut', sound: 'whoosh', params: {at: {point: true, default: [220, 760]}, color: themed, seed: seed(7)}, draw: landed(inkBleed)},
  ringIris: {family: 'iris', seconds: 1.2, ease: 'inOut', sound: 'slide', params: {at: {point: true, default: [800, 450]}, radius: {number: [0, 900], default: 0}, width: {number: [4, 80], default: 26}, color: themed, accent: themed}, draw: landed(ringIris)},
  glassSheet: {family: 'motion', seconds: 1.1, ease: 'outCubic', sound: 'slide', params: {from: {oneOf: ['right', 'left', 'top', 'bottom'], default: 'right'}, tint: {color: true, default: '#b2d0f0'}}, draw: landed(glassSheet)},
  curl: {family: 'page', seconds: 1.2, ease: 'inOut', sound: 'slide', params: {corner: {oneOf: Object.keys(CORNERS), default: 'bottom-right'}}, draw: landed(curl)},
  fold: {family: 'page', seconds: 1.2, ease: 'inOut', sound: 'slide', params: {line: {oneOf: ['horizontal', 'vertical'], default: 'horizontal'}}, draw: landed(fold)},
  morph: {family: 'match', seconds: 1.2, ease: 'inOut', sound: null,
    params: {region: {name: true, default: null}, into: {name: true, default: null}, fromBox: {box: true, default: CARD}, toBox: {box: true, default: WIDE}, color: themed},
    regions: p => ({from: p.region ? [p.region] : [], to: (p.into ?? p.region) ? [p.into ?? p.region] : []}), draw: landed(morph)},
});
