/**
 * The whiteboard kit: a real board (aluminium frame, glossy surface, optional ghosts of old
 * writing), marker strokes that draw themselves stroke by stroke with the marker visible at the
 * tip, handwriting that is written on, and an eraser that wipes a region.
 *
 * Everything is a pure function of time and a seed, so any frame can be drawn in any order.
 * A drawing is data: strokes (polylines in 1600×900 board units) plus handwritten text items.
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {getStroke} from 'perfect-freehand';
import {inOut} from '../../ease.mjs';

const {GlobalFonts} = createRequire(import.meta.url)('@napi-rs/canvas');
GlobalFonts.registerFromPath(fileURLToPath(new URL('../../../fonts/caveat/Caveat.ttf', import.meta.url)), 'Caveat');

export const INK = {black: '#23262b', blue: '#1f4f9c', red: '#c0392b', green: '#1e7a4c', orange: '#c26a12', grey: '#8a8f96'};
const clamp01 = n => Math.max(0, Math.min(1, n));
/** Slow, fast, slow: the core ease table's `inOut` (src/ease.mjs · inOut), kept under its old name. */
export const ease = inOut;

/** Deterministic noise: the same wobble on every frame (a drawing never jitters). */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; }; }

/** Densify a polyline and give it a hand-drawn wobble. */
export function hand(points, seed = 1, wobble = 1.6, step = 6) {
  const r = rng(seed), out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let j = 0; j < n; j++) out.push([x0 + (x1 - x0) * j / n + (r() - .5) * wobble, y0 + (y1 - y0) * j / n + (r() - .5) * wobble]);
  }
  out.push(points.at(-1));
  return out;
}
/** Shapes as polylines. */
export const shapes = {
  line: (x0, y0, x1, y1) => [[x0, y0], [x1, y1]],
  rect: (x, y, w, h) => [[x, y], [x + w, y + 1], [x + w - 1, y + h], [x + 1, y + h - 1], [x, y + 3]],
  ellipse: (cx, cy, rx, ry, a0 = -Math.PI / 2, sweep = Math.PI * 2.08) => Array.from({length: 49}, (_, i) => { const a = a0 + sweep * i / 48; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; }),
  arrow: (x0, y0, x1, y1, head = 18) => { const a = Math.atan2(y1 - y0, x1 - x0); return [[[x0, y0], [x1, y1]], [[x1 - head * Math.cos(a - .5), y1 - head * Math.sin(a - .5)], [x1, y1], [x1 - head * Math.cos(a + .5), y1 - head * Math.sin(a + .5)]]]; },
  tick: (x, y, s = 1) => [[x - 12 * s, y], [x - 3 * s, y + 10 * s], [x + 16 * s, y - 14 * s]],
  cross: (x, y, s = 1) => [[[x - 12 * s, y - 12 * s], [x + 12 * s, y + 12 * s]], [[x + 12 * s, y - 12 * s], [x - 12 * s, y + 12 * s]]],
};
/**
 * Three signs for what a note says about itself: a TAG (its source: who told you), a CLOCK (when:
 * how old it is) and a FLASHLIGHT (its scope: how far the search looked). Polylines in board units,
 * about 64 × 44 at s = 1, centred on (x, y); `dir` = -1 points the flashlight to the left.
 */
export const icons = {
  tag: (x, y, s = 1) => [
    [[x - 30 * s, y], [x - 14 * s, y - 18 * s], [x + 30 * s, y - 18 * s], [x + 30 * s, y + 18 * s], [x - 14 * s, y + 18 * s], [x - 30 * s, y]],
    shapes.ellipse(x - 13 * s, y, 4.5 * s, 4.5 * s)],
  clock: (x, y, s = 1) => [shapes.ellipse(x, y, 22 * s, 22 * s), [[x, y - 14 * s], [x, y], [x + 10 * s, y + 6 * s]]],
  flashlight: (x, y, s = 1, dir = 1) => {
    const X = v => x + v * s * dir, Y = v => y + v * s;
    return [
      [[X(-32), Y(-7)], [X(-8), Y(-7)], [X(-8), Y(7)], [X(-32), Y(7)], [X(-32), Y(-7)]],
      [[X(-8), Y(-7)], [X(4), Y(-15)], [X(4), Y(15)], [X(-8), Y(7)]],
      [[X(9), Y(-17)], [X(32), Y(-30)]], [[X(10), Y(0)], [X(34), Y(0)]], [[X(9), Y(17)], [X(32), Y(30)]],
    ];
  },
};
/** A sign drawn crisp and at once (on paper: beside a code line, on a tag), in the current transform. */
export function drawIcon(ctx, name, x, y, s, color, width = 2) {
  if (!icons[name]) throw new Error(`Unknown icon ${name}`);
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const line of icons[name](x, y, s)) { ctx.beginPath(); line.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke(); }
  ctx.restore();
}

/** A stick figure: head, body, arms, legs. `pose` 'stand' | 'point' (right arm raised). */
export function stickFigure(x, y, s = 1, pose = 'stand') {
  const head = shapes.ellipse(x, y - 118 * s, 26 * s, 28 * s);
  const arms = pose === 'point' ? [[x - 48 * s, y - 40 * s], [x, y - 70 * s], [x + 52 * s, y - 104 * s]] : [[x - 44 * s, y - 30 * s], [x, y - 70 * s], [x + 44 * s, y - 30 * s]];
  return [head, [[x, y - 90 * s], [x, y - 10 * s]], arms, [[x - 34 * s, y + 70 * s], [x, y - 10 * s], [x + 34 * s, y + 70 * s]]];
}
/** A friendly AI head: rounded box, two eyes, an antenna. */
export function robotHead(x, y, s = 1) {
  const w = 110 * s, h = 90 * s;
  return [shapes.rect(x - w / 2, y - h / 2, w, h), shapes.ellipse(x - 22 * s, y - 6 * s, 9 * s, 11 * s), shapes.ellipse(x + 22 * s, y - 6 * s, 9 * s, 11 * s),
    [[x - 18 * s, y + 24 * s], [x + 18 * s, y + 24 * s]], [[x, y - h / 2], [x, y - h / 2 - 26 * s]], shapes.ellipse(x, y - h / 2 - 34 * s, 8 * s, 8 * s),
    [[x - 60 * s, y + h / 2 + 10 * s], [x - 70 * s, y + h / 2 + 90 * s]], [[x + 60 * s, y + h / 2 + 10 * s], [x + 70 * s, y + h / 2 + 90 * s]], [[x - 70 * s, y + h / 2 + 90 * s], [x + 70 * s, y + h / 2 + 90 * s]]];
}
/** An idea light bulb: glass open at the bottom, neck, base, filament. Rays come separately. */
export function lightBulb(x, y, s = 1) {
  const glass = shapes.ellipse(x, y, 26 * s, 28 * s, Math.PI / 2 + .4, Math.PI * 2 - .8);
  return [glass, [[x - 10 * s, y + 26 * s], [x - 9 * s, y + 40 * s]], [[x + 10 * s, y + 26 * s], [x + 9 * s, y + 40 * s]],
    [[x - 11 * s, y + 40 * s], [x + 11 * s, y + 40 * s]], [[x - 9 * s, y + 47 * s], [x + 9 * s, y + 47 * s]],
    [[x - 6 * s, y + 20 * s], [x - 4 * s, y + 6 * s], [x, y + 12 * s], [x + 4 * s, y + 6 * s], [x + 6 * s, y + 20 * s]]];
}
export function bulbRays(x, y, s = 1) {
  return [-150, -115, -90, -65, -30].map(d => { const a = d * Math.PI / 180; return [[x + 40 * s * Math.cos(a), y + 40 * s * Math.sin(a)], [x + 56 * s * Math.cos(a), y + 56 * s * Math.sin(a)]]; });
}
/** The bulb's glow, faded in by f. */
export function drawGlow(ctx, x, y, r, f) {
  if (f <= 0) return null;
  ctx.save(); const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,214,70,${.6 * f})`); g.addColorStop(1, 'rgba(255,214,70,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  return null;
}
/** A speech bubble with a tail pointing at (tx, ty). */
export function bubble(cx, cy, rx, ry, tx, ty) {
  const a = Math.atan2(ty - cy, tx - cx), gap = .22;
  const outline = shapes.ellipse(cx, cy, rx, ry, a + gap, Math.PI * 2 - gap * 2);
  const b0 = outline[0], b1 = outline.at(-1);
  return [outline, [b1, [tx, ty], b0]];
}

/** The board: frame, surface, gloss. `ghosts` adds faint never-quite-erased marks (off by default: they read as dirt). */
export function drawBoard(ctx, {seed = 11, ghosts = 0} = {}) {
  ctx.save();
  const frame = ctx.createLinearGradient(0, 0, 0, 900);
  frame.addColorStop(0, '#d9dde2'); frame.addColorStop(.5, '#b9bec5'); frame.addColorStop(1, '#a5abb3');
  ctx.fillStyle = frame; ctx.fillRect(0, 0, 1600, 900);
  const surface = ctx.createLinearGradient(0, 0, 1600, 900);
  surface.addColorStop(0, '#fbfbf9'); surface.addColorStop(.55, '#f3f4f2'); surface.addColorStop(1, '#eceeec');
  ctx.fillStyle = surface; ctx.beginPath(); ctx.roundRect(22, 22, 1556, 856, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(80,86,94,.35)'; ctx.lineWidth = 2; ctx.stroke();
  // A soft diagonal gloss, as on a real glossy board.
  const gloss = ctx.createLinearGradient(300, 0, 900, 900);
  gloss.addColorStop(0, 'rgba(255,255,255,0)'); gloss.addColorStop(.5, 'rgba(255,255,255,.35)'); gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss; ctx.beginPath(); ctx.roundRect(22, 22, 1556, 856, 10); ctx.fill();
  // Ghosts: faint, never-quite-erased marks.
  const r = rng(seed);
  ctx.strokeStyle = 'rgba(120,130,140,.07)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  for (let i = 0; i < ghosts; i++) { const x = 80 + r() * 1400, y = 80 + r() * 720; ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 60, y - 30 * r(), x + 120, y + 30 * r(), x + 90 + 160 * r(), y + 10 * r()); ctx.stroke(); }
  // The marker tray along the bottom edge.
  ctx.fillStyle = '#9aa1a9'; ctx.fillRect(420, 872, 760, 14);
  ctx.restore();
}

/** Length-parametrised prefix of a polyline (0..1). Returns the partial line and its tip. */
function prefix(points, f) {
  if (f >= 1) return {pts: points, tip: points.at(-1), angle: 0};
  const lens = [0]; for (let i = 1; i < points.length; i++) lens.push(lens[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const target = lens.at(-1) * f, out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (lens[i] <= target) { out.push(points[i]); continue; }
    const k = (target - lens[i - 1]) / (lens[i] - lens[i - 1] || 1), p = [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * k, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * k];
    out.push(p); return {pts: out, tip: p, angle: Math.atan2(points[i][1] - points[i - 1][1], points[i][0] - points[i - 1][0])};
  }
  return {pts: out, tip: out.at(-1), angle: 0};
}

/** Draw marker strokes up to fraction f of their total length; returns the tip if still drawing. */
export function drawStrokes(ctx, strokes, f, {color = INK.black, size = 6, seed = 1} = {}) {
  const lines = strokes.map((s, i) => hand(s, seed * 97 + i));
  const lens = lines.map(l => l.reduce((n, p, i) => i ? n + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0, 0));
  const total = lens.reduce((a, b) => a + b, 0);
  let budget = total * clamp01(f), tip = null;
  ctx.save(); ctx.fillStyle = color;
  for (const [i, l] of lines.entries()) {
    if (budget <= 0) break;
    const part = prefix(l, Math.min(1, budget / (lens[i] || 1)));
    budget -= lens[i];
    const outline = getStroke(part.pts.map(p => [p[0], p[1], .5]), {size, thinning: .35, smoothing: .6, streamline: .45, simulatePressure: false, last: budget >= 0});
    if (outline.length) { ctx.beginPath(); outline.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); }
    if (budget < 0) tip = part.tip;
  }
  ctx.restore();
  return f < 1 ? tip : null;
}

/** Handwriting written on left to right; returns the pen position while writing. */
export function drawWriting(ctx, text, x, y, f, {size = 48, color = INK.black, align = 'left'} = {}) {
  if (f <= 0) return null;
  ctx.save(); ctx.font = `700 ${size}px Caveat`; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width, left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.beginPath(); ctx.rect(left - 6, y - size, (w + 12) * clamp01(f), size * 2); ctx.clip();
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(text, left, y);
  ctx.restore();
  return f < 1 ? [left + w * f, y + size * .15] : null;
}
export function textWidth(ctx, text, size) { ctx.save(); ctx.font = `700 ${size}px Caveat`; const w = ctx.measureText(text).width; ctx.restore(); return w; }

/** The marker in the hand: body angled toward the tip, coloured cap = the ink. */
export function drawMarker(ctx, [x, y], color = INK.black) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-.9);
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.roundRect(4, 10, 22, 120, 9); ctx.fill();
  ctx.fillStyle = '#f2f3f5'; ctx.strokeStyle = '#7b8189'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-11, 16, 22, 110, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(-11, 96, 22, 30, 6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-6, 16); ctx.lineTo(0, 0); ctx.lineTo(6, 16); ctx.closePath(); ctx.fill();
  ctx.restore();
}
/** The eraser mid-wipe at x, over a region. */
export function drawEraser(ctx, x, y0, y1) {
  ctx.save();
  const h = Math.min(120, y1 - y0 + 40), y = (y0 + y1) / 2 - h / 2;
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(x - 40, y + 8, 90, h);
  ctx.fillStyle = '#3b4a63'; ctx.beginPath(); ctx.roundRect(x - 45, y, 90, h, 10); ctx.fill();
  ctx.fillStyle = '#d8d2c4'; ctx.fillRect(x - 45, y + h - 16, 90, 16);
  ctx.restore();
}

/**
 * Render a timeline of board items at time t. Each item:
 *   {at, dur, draw(ctx, f) → tip|null, color, erase?: {at, dur, box:[x0,y0,x1,y1]}}
 * An item draws progressively over [at, at+dur]; an erase wipes its box left to right.
 * The marker is shown at the tip of whatever is being drawn; the eraser while wiping.
 */
export function renderTimeline(ctx, items, t) {
  let pen = null, eraser = null;
  for (const it of items) {
    if (t < it.at) continue;
    const f = clamp01((t - it.at) / it.dur);
    const e = it.erase ? clamp01((t - it.erase.at) / it.erase.dur) : 0;
    if (e >= 1) continue;
    ctx.save();
    if (e > 0) {
      const [x0, y0, x1, y1] = it.erase.box, cut = x0 + (x1 - x0) * ease(e);
      ctx.beginPath(); ctx.rect(cut, 0, 1600, 900); ctx.clip();
      eraser = [cut, y0, y1];
    }
    const tip = it.draw(ctx, ease(f));
    ctx.restore();
    if (tip && f < 1) pen = {tip, color: it.color ?? INK.black};
  }
  if (eraser) drawEraser(ctx, ...eraser);
  if (pen) drawMarker(ctx, pen.tip, pen.color);
}
