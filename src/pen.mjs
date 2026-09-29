/**
 * Drawing helpers bound to a style manifest. Every text call can be recorded
 * (content, effective size, on-screen box) so layout checks measure what was
 * actually drawn rather than what a layout was meant to be.
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import rough from 'roughjs';

const clamp01 = n => Math.max(0, Math.min(1, n));
// The board's handwriting (Caveat, SIL OFL 1.1), registered once for every canvas in this process.
const {GlobalFonts} = createRequire(import.meta.url)('@napi-rs/canvas');
GlobalFonts.registerFromPath(fileURLToPath(new URL('../fonts/caveat/Caveat.ttf', import.meta.url)), 'Caveat');
const ROUGH = rough.generator();
/** A stable seed per shape: the same box is drawn the same way on every frame (no jitter). */
const seedOf = (...n) => { let h = 2166136261; for (const v of n) { h ^= Math.round(v * 10); h = Math.imul(h, 16777619); } return (h >>> 0) % 2147483646 + 1; };

/** Parse #rrggbb[aa] and return an rgba() string with alpha multiplied. */
export function rgba(hex, alpha = 1) {
  const h = hex.slice(1), a = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${(a * clamp01(alpha)).toFixed(3)})`;
}
export function mixColor(a, b, t) {
  const p = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
  const [r, g, bl] = p(a).map((v, i) => Math.round(v + (p(b)[i] - v) * clamp01(t)));
  return `#${[r, g, bl].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * @param ctx 2-D context already scaled so 1600×900 logical units fill the frame
 * @param style validated style manifest
 * @param {{baseScale:number, record?:Function}} options baseScale = output px per logical unit
 */
export function makePen(ctx, style, {baseScale = 1, record} = {}) {
  const C = style.palette, T = style.type;
  const P = {C, T, ctx, baseScale, safeMargin: style.canvas.safeMargin};
  P.alpha = (a, fn) => { if (a <= 0.002) return; ctx.save(); try { ctx.globalAlpha *= clamp01(a); fn(); } finally { ctx.restore(); } };
  P.with = (fn) => { ctx.save(); try { fn(); } finally { ctx.restore(); } };
  P.board = style.surface.kind === 'board';
  P.roughness = style.surface.roughness ?? 0;
  // On a board, big words are handwritten (Caveat reads ~20% smaller, so it is drawn larger); small text and code stay clean.
  const hand = (size, mono) => P.board && !mono && size >= 24;
  P.font = (size, {mono = false, weight = 500, display = false} = {}) => hand(size, mono)
    ? `700 ${Math.round(size * 1.22)}px ${T.display}` : `${weight} ${size}px ${mono ? T.mono : display ? T.display : T.sans}`;
  P.paper = style.surface.kind === 'paper' || P.board;
  P.measure = (s, size, opts) => { ctx.save(); ctx.font = P.font(size, opts); const w = ctx.measureText(String(s)).width; ctx.restore(); return w; };
  P.text = (s, x, y, size = T.body, color = C.ink, {align = 'center', mono = false, weight = 500, max = Infinity, role = 'read', display = false} = {}) => {
    s = String(s);
    ctx.save();
    try {
      ctx.font = P.font(size, {mono, weight, display});
      let w = ctx.measureText(s).width, drawn = size;
      if (w > max) { drawn = size * max / w; ctx.font = P.font(drawn, {mono, weight, display}); w = max; }
      ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
      ctx.fillText(s, x, y);
      if (record && ctx.globalAlpha > .05) {
        const m = ctx.getTransform(), k = Math.hypot(m.a, m.b) / baseScale;
        const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
        const pts = [[left, y - drawn * .55], [left + w, y - drawn * .55], [left, y + drawn * .55], [left + w, y + drawn * .55]]
          .map(([px, py]) => [(m.a * px + m.c * py + m.e) / baseScale, (m.b * px + m.d * py + m.f) / baseScale]);
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        record({text: s, role, size: drawn * k, alpha: ctx.globalAlpha,
          box: {left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys)}});
      }
    } finally { ctx.restore(); }
  };
  /** Record the on-screen box of a shape (logical units) for clipping checks. */
  const shape = (x0, y0, x1, y1) => {
    if (!record || ctx.globalAlpha <= .05 || !P.actor) return;
    const m = ctx.getTransform();
    const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([px, py]) => [(m.a * px + m.c * py + m.e) / baseScale, (m.b * px + m.d * py + m.f) / baseScale]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    record({shape: true, actor: P.actor, alpha: ctx.globalAlpha, box: {left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys)}});
  };
  /** Stroke a roughjs drawable in the current transform (board only). */
  const sketch = (drawable, color, width, dash) => {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash(dash);
    for (const set of drawable.sets) {
      if (set.type !== 'path') continue;
      ctx.beginPath();
      for (const op of set.ops) { const d = op.data; if (op.op === 'move') ctx.moveTo(d[0], d[1]); else if (op.op === 'lineTo') ctx.lineTo(d[0], d[1]); else ctx.bezierCurveTo(...d); }
      ctx.stroke();
    }
    ctx.restore();
  };
  const roughOpts = (seed, width) => ({roughness: P.roughness, bowing: .8, seed, strokeWidth: width, disableMultiStroke: P.roughness < .3, preserveVertices: true});
  P.line = (x, y, u, v, color = C.edge, width = 2, dash = []) => {
    if (P.board && P.roughness > 0 && Math.hypot(u - x, v - y) > 6) {
      shape(Math.min(x, u), Math.min(y, v), Math.max(x, u), Math.max(y, v));
      return sketch(ROUGH.line(x, y, u, v, roughOpts(seedOf(x, y, u, v), width)), color, width * 1.1, dash);
    }
    shape(Math.min(x, u), Math.min(y, v), Math.max(x, u), Math.max(y, v));
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(u, v); ctx.stroke(); ctx.restore();
  };
  /** Cubic curve drawn up to fraction f of its parameter range. */
  P.curve = (a, b, c, d, f, color, width = 2, dash = []) => {
    if (f <= 0) return;
    const pt = t => { const s = 1 - t; return [s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * d[0], s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * d[1]]; };
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(...a);
    const n = Math.max(2, Math.ceil(40 * f));
    for (let i = 1; i <= n; i++) ctx.lineTo(...pt(f * i / n));
    ctx.stroke(); ctx.restore();
    return pt(f);
  };
  P.path = (points, fill, stroke = C.edge, width = 2, dash = []) => {
    shape(Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1])));
    ctx.save(); ctx.beginPath(); ctx.moveTo(...points[0]); for (const v of points.slice(1)) ctx.lineTo(...v); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke && P.board && P.roughness > 0) { ctx.restore(); return sketch(ROUGH.polygon(points, roughOpts(seedOf(...points.flat()), width)), stroke, width * 1.1, dash); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(); }
    ctx.restore();
  };
  P.round = (x, y, w, h, r = 16, fill = C.panel, stroke = C.edge, width = 1.5, dash = []) => {
    shape(x, y, x + w, y + h);
    // Very round shapes (the model's face, pills) stay smooth: only boxes are redrawn by hand.
    if (P.board && P.roughness > 0 && w > 12 && h > 12 && r < Math.min(w, h) * .3) {
      // A marker box: the fill stays solid (text on it must read), the outline is drawn by hand.
      if (fill) { ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(r * .4, w / 2, h / 2)); ctx.fillStyle = fill; ctx.fill(); ctx.restore(); }
      if (stroke) sketch(ROUGH.rectangle(x, y, w, h, roughOpts(seedOf(x, y, w, h), width)), stroke, Math.max(1.6, width * 1.25), dash);
      return;
    }
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(); }
    ctx.restore();
  };
  P.circle = (x, y, r, fill, stroke = null, width = 2, dash = []) => {
    shape(x - r, y - r, x + r, y + r);
    if (P.board && P.roughness > 0 && r > 8 && stroke) {
      if (fill) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.restore(); }
      return sketch(ROUGH.circle(x, y, r * 2, roughOpts(seedOf(x, y, r), width)), stroke, width * 1.1, dash);
    }
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(); }
    ctx.restore();
  };
  /** A lifted surface: glass (gradient + rim light) or paper (card + soft shadow), per style. */
  P.glass = (x, y, w, h, edge = C.edge, r = 24) => {
    if (P.board) { P.round(x, y, w, h, r, C.card, edge, 2); return; }
    if (P.paper) {
      ctx.save();
      ctx.shadowColor = 'rgba(70,55,30,.16)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8;
      P.round(x, y, w, h, r, C.card, null);
      ctx.restore();
      P.round(x, y, w, h, r, null, edge, 1.4);
      return;
    }
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, 'rgba(85,108,147,.26)'); g.addColorStop(.5, 'rgba(33,48,77,.55)'); g.addColorStop(1, 'rgba(14,23,40,.9)');
    P.round(x, y, w, h, r, g, edge, 1.6);
    P.line(x + r, y + 1, x + w - r, y + 1, 'rgba(170,182,208,.3)', 1);
  };
  /** Lift an object off the page (paper only): a soft contact shadow for the draws in fn. */
  P.lift = fn => {
    if (!P.paper || P.board) return fn();
    ctx.save(); ctx.shadowColor = 'rgba(70,55,30,.2)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 7;
    try { fn(); } finally { ctx.restore(); }
  };
  P.glow = (x, y, r, color, a = .25) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  };
  P.check = (x, y, color, s = 1) => { P.line(x - 9 * s, y, x - 2 * s, y + 7 * s, color, 3 * s); P.line(x - 2 * s, y + 7 * s, x + 13 * s, y - 10 * s, color, 3 * s); };
  P.cross = (x, y, color, s = 1) => { P.line(x - 9 * s, y - 9 * s, x + 9 * s, y + 9 * s, color, 3 * s); P.line(x + 9 * s, y - 9 * s, x - 9 * s, y + 9 * s, color, 3 * s); };
  /** Reveal fn through a horizontal (dir 'x') or vertical mask covering fraction f. */
  P.mask = (f, x, y, w, h, fn, dir = 'x') => {
    if (f <= 0) return;
    ctx.save();
    try { ctx.beginPath(); if (dir === 'x') ctx.rect(x, y, w * clamp01(f), h); else ctx.rect(x, y, w, h * clamp01(f)); ctx.clip(); fn(); }
    finally { ctx.restore(); }
  };
  return P;
}
