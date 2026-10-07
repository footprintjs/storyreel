/**
 * Reviewing a part by reading it, so a reviewer (or a model) reads first and looks at a frame only to confirm.
 * The picture is read as text — every line a frame draws (fillText / strokeText) with its box in output pixels
 * and the alpha it was drawn at (wordsAt) — and fingerprinted, a few times a second over the part; then checks
 * name what is wrong, with times: words under the captions while a caption shows, words over other words, words
 * cut off at the frame's edge, a picture that does not change for a while — and a director's checks on the
 * whole: a hook in the first 3 s, not too much to read at once, and real silences (a breath before the peak).
 *
 * The review is a footprintjs flowchart, so it leaves its own record — what was read, which checks ran and why
 * (the selector's evidence), what each found:
 *
 *   read-part     the part's window and facts; the picture read and fingerprinted once, for every check
 *   pick-checks   a selector: each check is a strategy, run as its own subflow, picked by what the part has
 *                 (a caption band, words, enough length to stand still); a check of your own has the same shape
 *   <check>       reads the shared samples, names what it finds
 *   report        the findings merged into spans, with the scene each starts in
 *
 * reviewPart is the facade: one call, a report as data and as text, the timeline, and the record. Text drawn into
 * a scratch picture (a crossfade's ghost) is not read, and a drawing that is not text is seen only by the still check.
 */
import {createCanvas} from '@napi-rs/canvas';
import {flowChart, narrative, select} from 'footprintjs';
import {compileLayout} from './layout.mjs';
import {frameHashes} from './pins.mjs';
import {partWindow, partTimeline, timelineText} from './render.mjs';

/**
 * The words a frame draws at t: [{text, box: [x0, y0, x1, y1], alpha}], in the layout's output pixels (or on the
 * 1600×900 frame). A kit draws on its world's own sheet, which the film then lays on the frame under the camera,
 * so the words are followed from canvas to canvas: each line is noted on the canvas it is drawn on, and carried
 * (box and alpha mapped) wherever that canvas is drawn. The 2D context's drawing calls are watched only while
 * this frame is painted (it paints synchronously), then put back.
 */
export function wordsAt(film, t, {layout = null} = {}) {
  const canvas = createCanvas(layout?.width ?? 1600, layout?.height ?? 900), ctx = canvas.getContext('2d');
  return readWords(canvas, () => { if (layout) layout.picture(ctx, t); else film.frame(ctx, t); });
}

// A word's place is its quad (its box's four corners through every transform, so a rotated stamp stays a
// rotated stamp); box is the quad's axis-aligned bounds, for reading.
const corners = ([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const apply = (T, quad) => quad.map(([x, y]) => [T.a * x + T.c * y + T.e, T.b * x + T.d * y + T.f]);
const bounds = quad => [Math.min(...quad.map(p => p[0])), Math.min(...quad.map(p => p[1])), Math.max(...quad.map(p => p[0])), Math.max(...quad.map(p => p[1]))];
const clamp01 = v => Math.max(0, Math.min(1, v));
/** How opaque a fill style is: an rgba()/hsla() alpha or a #rrggbbaa alpha; a solid colour, a gradient or a pattern is opaque. */
const fillAlpha = style => { if (typeof style !== 'string') return 1; const m = /^(?:rgba|hsla)\(([^)]+)\)$/.exec(style.trim()); if (m) { const p = m[1].split(/[,/\s]+/).filter(Boolean); return p.length === 4 ? Number(p[3]) : 1; } const h = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(style.trim()); return h ? parseInt(h[1], 16) / 255 : 1; };
function readWords(canvas, paint) {
  const proto = Object.getPrototypeOf(canvas.getContext('2d')), original = {fillText: proto.fillText, strokeText: proto.strokeText, drawImage: proto.drawImage, clearRect: proto.clearRect, fillRect: proto.fillRect};
  const notes = new WeakMap(), on = c => { if (!notes.has(c)) notes.set(c, []); return notes.get(c); };
  const note = (ctx, text, x, y) => {
    const s = String(text); if (!s.trim()) return;
    const m = ctx.measureText(s), box = [x - (m.actualBoundingBoxLeft ?? 0), y - (m.actualBoundingBoxAscent ?? 0), x + (m.actualBoundingBoxRight ?? m.width), y + (m.actualBoundingBoxDescent ?? 0)];
    on(ctx.canvas).push({text: s, quad: apply(ctx.getTransform(), corners(box)), alpha: ctx.globalAlpha});
  };
  proto.fillText = function (text, x, y, ...rest) { note(this, text, x, y); return original.fillText.call(this, text, x, y, ...rest); };
  proto.strokeText = function (text, x, y, ...rest) { note(this, text, x, y); return original.strokeText.call(this, text, x, y, ...rest); };
  proto.clearRect = function (x, y, w, h) {   // a whole canvas cleared forgets its words (a sheet is reused for every world)
    const [x0, y0, x1, y1] = bounds(apply(this.getTransform(), corners([x, y, x + w, y + h])));
    if (x0 <= 0 && y0 <= 0 && x1 >= this.canvas.width && y1 >= this.canvas.height) notes.set(this.canvas, []);
    return original.clearRect.call(this, x, y, w, h);
  };
  proto.fillRect = function (x, y, w, h) {   // a rectangle filled over words veils them, as much as it is opaque
    const [x0, y0, x1, y1] = bounds(apply(this.getTransform(), corners([x, y, x + w, y + h]))), a = clamp01(this.globalAlpha * fillAlpha(this.fillStyle));
    if (a > 0) for (const n of on(this.canvas)) { const [bx0, by0, bx1, by1] = bounds(n.quad); if (bx0 >= x0 - 1 && by0 >= y0 - 1 && bx1 <= x1 + 1 && by1 <= y1 + 1) n.alpha *= 1 - a; }
    return original.fillRect.call(this, x, y, w, h);
  };
  proto.drawImage = function (src, ...args) {   // a canvas drawn here brings its words, mapped from its pixels to these
    const carried = src && notes.get(src);
    if (carried?.length) {
      let [sx, sy, sw, sh] = [0, 0, src.width, src.height], dx, dy, dw, dh;
      if (args.length === 2) [dx, dy, dw, dh] = [args[0], args[1], sw, sh]; else if (args.length === 4) [dx, dy, dw, dh] = args; else [sx, sy, sw, sh, dx, dy, dw, dh] = args;
      const T = this.getTransform(), kx = dw / sw, ky = dh / sh, here = on(this.canvas);
      for (const n of carried) {
        const [x0, y0, x1, y1] = bounds(n.quad); if (!(x1 > sx && x0 < sx + sw && y1 > sy && y0 < sy + sh)) continue;
        here.push({text: n.text, quad: apply(T, n.quad.map(([x, y]) => [dx + (x - sx) * kx, dy + (y - sy) * ky])), alpha: n.alpha * this.globalAlpha});
      }
    }
    return original.drawImage.call(this, src, ...args);
  };
  try { paint(); } finally { Object.assign(proto, original); }
  const round = p => p.map(v => +v.toFixed(1));
  return (notes.get(canvas) ?? []).map(w => ({text: w.text, box: round(bounds(w.quad)), quad: w.quad.map(round), alpha: +w.alpha.toFixed(3)}));
}

// Areas of convex quads, and of where two meet (Sutherland–Hodgman: one clipped by the other's edges).
const area = poly => Math.abs(poly.reduce((s, [x, y], i) => { const [u, v] = poly[(i + 1) % poly.length]; return s + x * v - u * y; }, 0)) / 2;
function meet(subject, clipper) {
  const turn = clipper.reduce((s, [x, y], i) => { const [u, v] = clipper[(i + 1) % clipper.length]; return s + x * v - u * y; }, 0) > 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < clipper.length && out.length; i++) {
    const a = clipper[i], b = clipper[(i + 1) % clipper.length], input = out;
    const inside = p => turn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0;
    const cut = (p, q) => { const d = (p[0] - q[0]) * (a[1] - b[1]) - (p[1] - q[1]) * (a[0] - b[0]), k = ((p[0] - a[0]) * (a[1] - b[1]) - (p[1] - a[1]) * (a[0] - b[0])) / d; return [p[0] + k * (q[0] - p[0]), p[1] + k * (q[1] - p[1])]; };
    out = [];
    input.forEach((p, j) => { const q = input[(j + 1) % input.length]; if (inside(q)) { if (!inside(p)) out.push(cut(p, q)); out.push(q); } else if (inside(p)) out.push(cut(p, q)); });
  }
  return out.length > 2 ? area(out) : 0;
}
const band = ([x, y, w, h]) => corners([x, y, x + w, y + h]);
const same = (a, b) => a.text === b.text && a.box.every((v, i) => Math.abs(v - b.box[i]) <= 4);   // drawn twice: an outline, a shadow

/**
 * The checks, each a strategy: label, why (said when it is picked), when(scope) (picked when true: scope.facts
 * holds {seconds, captions, words}), find(review) → [{kind, t, what}] from the shared samples. Same shape for a
 * check of your own, passed in reviewPart's `checks`.
 */
export const REVIEW_CHECKS = Object.freeze({
  'under-captions': {label: 'Words under the captions', why: 'the layout shows captions', when: s => s.facts.captions,
    find: ({samples, layout}) => samples.flatMap(({t, words}) => !layout.captionAt(t) ? [] : words.filter(w => meet(w.quad, band(layout.boxes.captions)) > .05 * area(w.quad)).map(w => ({kind: 'under-captions', t, what: `"${w.text}"`})))},
  'words-overlap': {label: 'Words over words', why: 'the part draws words', when: s => s.facts.words > 0,
    find: ({samples}) => samples.flatMap(({t, words}) => words.flatMap((a, i) => words.slice(i + 1).filter(b => !same(a, b) && meet(a.quad, b.quad) > .2 * Math.min(area(a.quad), area(b.quad))).map(b => ({kind: 'words-overlap', t, what: `"${a.text}" and "${b.text}"`}))))},
  'cut-off': {label: 'Words cut off at the edge', why: 'the part draws words', when: s => s.facts.words > 0,
    find: ({samples, width, height}) => samples.flatMap(({t, words}) => words.filter(w => w.quad.some(([x, y]) => x < -2 || y < -2 || x > width + 2 || y > height + 2)).map(w => ({kind: 'cut-off', t, what: `"${w.text}"`})))},
  hook: {label: 'A hook in the first 3 s', why: 'the part starts the film', when: s => s.facts.from === 0 && s.facts.seconds >= 3,
    find: ({samples, hashes}) => {
      const first = samples.filter(x => x.t <= 3 + 1e-9);
      return first.length > 1 && first.every(x => hashes[x.t] === hashes[first[0].t]) ? first.map(x => ({kind: 'hook', t: x.t, what: 'nothing moves in the first 3 s'})) : [];
    }},
  'text-density': {label: 'Too much to read at once', why: 'the part draws words', when: s => s.facts.words > 0,
    find: ({samples, maxWords}) => samples.flatMap(({t, words}) => words.reduce((n, w) => n + w.text.split(/\s+/).filter(Boolean).length, 0) > maxWords ? [{kind: 'text-density', t, what: `more than ${maxWords} words on screen`}] : [])},
  silences: {label: 'Real silences', why: 'the part is spoken and long enough to need a breath', when: s => s.facts.spoken && s.facts.seconds >= 30,
    find: ({film, window, samples, minSilence}) => {
      // The pauses between spoken words (scene tails included) with no effect sound in them.
      const said = film.timings.scenes.flatMap((sc, i) => (sc.words ?? []).map(w => [film.clock.offsets[i] + w.start, film.clock.offsets[i] + w.end]))
        .filter(([a, b]) => b > window.from && a < window.to).sort((x, y) => x[0] - y[0]);
      const sounds = (film.sounds ?? []).map(s => s.time), quiet = [];
      for (let i = 1; i < said.length; i++) {
        const [from, to] = [said[i - 1][1], said[i][0]];
        if (to - from >= minSilence && !sounds.some(t => t > from - .1 && t < to)) quiet.push([from, to]);
      }
      return quiet.length >= 2 ? [] : samples.map(({t}) => ({kind: 'silences', t, what: `${quiet.length ? 'only one real silence' : 'no real silence'} (${minSilence} s or more with nothing playing): give the film a breath before its peak`}));
    }},
  still: {label: 'Nothing changes', why: 'the part is long enough to stand still', when: s => s.facts.seconds >= s.facts.stillFor,
    find: ({samples, hashes, stillFor}) => {
      const out = []; let run = [];
      const close = () => { if (run.length && run.at(-1) - run[0] >= stillFor) out.push(...run.map(t => ({kind: 'still', t, what: 'the picture does not change'}))); run = []; };
      samples.forEach(({t}, i) => { if (i && hashes[t] === hashes[samples[i - 1].t]) { if (!run.length) run.push(samples[i - 1].t); run.push(t); } else close(); });
      close(); return out;
    }},
});

const LABEL = {'under-captions': 'under the captions', 'words-overlap': 'words over words', 'cut-off': 'cut off at the edge', still: 'nothing changes', hook: 'no hook', 'text-density': 'too much to read', silences: 'no breath'};
const clock = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
/** The findings as lines: "1:21.5–1:23.0 chapters · under the captions: \"requests in\"". */
export const findingsText = findings => findings.map(f => `${clock(f.from)}–${clock(f.to)} ${f.scene ?? ''} · ${LABEL[f.kind] ?? f.kind}: ${f.what}`).join('\n');

/** Hits on sample times → spans of the same thing, each with the scene it starts in; a word's span shorter than `lasting` is passing (a fade, a page turning) and dropped. */
function spans(film, hits, every, lasting) {
  const groups = new Map();
  for (const h of hits) { const k = `${h.kind}\u0000${h.what}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(h.t); }
  const sceneAt = t => { let id = null; film.timings.scenes.forEach((s, i) => { if (film.clock.offsets[i] <= t + 1e-6) id = s.id; }); return id; };
  const out = [];
  for (const [k, times] of groups) {
    const [kind, what] = k.split('\u0000'), ts = [...new Set(times)].sort((a, b) => a - b);
    let from = ts[0], last = ts[0];
    for (const t of ts.slice(1)) { if (t - last > every * 1.5) { out.push({kind, from, to: last, what}); from = t; } last = t; }
    out.push({kind, from, to: last, what});
  }
  return out.filter(f => ['still', 'hook', 'silences'].includes(f.kind) || f.to - f.from + every >= lasting - 1e-9).sort((a, b) => a.from - b.from || a.kind.localeCompare(b.kind)).map(f => ({...f, scene: sceneAt(f.from)}));
}

/**
 * Review a part of the film (or all of it) by reading it. part: {scenes, handles?} (render.mjs · partWindow), or
 * from/to on the film clock; layout: the render's layout spec (read at the format's own size, whatever its scale).
 * Words count when drawn at `minAlpha` (0.5) or more and for `lasting` seconds (1) or more — shorter is a fade or a
 * page turning; the picture is still when unchanged for `stillFor` seconds (5); more than `maxWords` (35) words on
 * screen at once is too much to read; a real silence is a pause of `minSilence` seconds (0.8) with nothing playing;
 * text smaller than `minHeight` of the frame (0.011: 12 px at 1080) is texture, not reading, and is not counted.
 * Returns {window, facts, findings, text, timeline, ran, record}: findings [{kind, from, to, scene, what}] on the
 * film clock, text as lines, the part's timeline (scenes and beats), the checks that ran, and the review's own
 * footprintjs record.
 */
export async function reviewPart(film, {part = null, from = 0, to = film.total, layout = null, every = .25, stillFor = 5, lasting = 1, minAlpha = .5, minHeight = .011, maxWords = 35, minSilence = .8, checks = REVIEW_CHECKS} = {}) {
  const window = part ? partWindow(film, part) : {from, to};
  const framed = layout ? compileLayout(film, (({scale, ...rest}) => rest)(layout)) : null;
  for (const [id, c] of Object.entries(checks)) if (!c || typeof c.find !== 'function' || typeof c.when !== 'function' || typeof c.label !== 'string') throw new Error(`review check "${id}" must be {label, why?, when(scope), find(review)}`);
  const review = {film, window, layout: framed, width: framed?.width ?? 1600, height: framed?.height ?? 900, every, stillFor, maxWords, minSilence, samples: [], hashes: {}};
  let findings = [];
  const read = async s => {
    const times = []; for (let t = window.from; t <= window.to + 1e-9; t += every) times.push(+t.toFixed(3));
    // Only what is on screen counts: a word the camera has framed out is not shown (its box misses the frame).
    // What is on screen counts. While the film's camera is pushed in (its focus), a word with less than half of it in
    // the frame has been framed out — a camera crops the page — and is not shown; at the camera's rest every word
    // that reaches the frame counts, so a word running off the edge of the layout is still cut off.
    const W = framed?.width ?? 1600, H = framed?.height ?? 900, inside = b => Math.max(0, Math.min(b[2], W) - Math.max(b[0], 0)) * Math.max(0, Math.min(b[3], H) - Math.max(b[1], 0));
    const shown = (w, zoomed) => inside(w.box) >= (zoomed ? .5 * Math.max(1, (w.box[2] - w.box[0]) * (w.box[3] - w.box[1])) : 1e-6);
    // Text smaller than `minHeight` of the frame (1.1 %: 12 px at 1080) cannot be read: it is texture (a photo of a page), not reading.
    const legible = w => w.box[3] - w.box[1] >= minHeight * H;
    review.samples = times.map(t => { const zoomed = (film.focusAt?.(t)?.z ?? 1) > 1.001; return {t, words: wordsAt(film, t, {layout: framed}).filter(w => w.alpha >= minAlpha && legible(w) && shown(w, zoomed))}; });
    review.hashes = frameHashes(film, {times, width: 160});
    s.facts = {from: window.from, to: window.to, seconds: +(window.to - window.from).toFixed(3), stillFor, captions: Boolean(framed?.boxes.captions), samples: times.length, words: review.samples.reduce((n, x) => n + x.words.length, 0),
      spoken: film.timings.scenes.some((sc, i) => (sc.words ?? []).some(w => film.clock.offsets[i] + w.end > window.from && film.clock.offsets[i] + w.start < window.to))};
    s.ran = []; s.hits = [];
  };
  let chart = flowChart('read-part', read, 'read-part', 'The part read as text and fingerprinted, once for every check')
    .addSelectorFunction('pick-checks', s => select(s, Object.entries(checks).map(([id, c]) => ({when: c.when, then: id, label: c.why ?? c.label}))), 'pick-checks', 'Each check that fits the part');
  for (const [id, c] of Object.entries(checks)) chart = chart.addSubFlowChartBranch(id, flowChart(c.label, async s => { s.hits = c.find(review); }, id).build(), c.label, {outputMapper: out => ({hits: out.hits ?? [], ran: [id]})});
  const built = chart.end().addFunction('report', async s => { findings = spans(film, s.hits ?? [], every, lasting); s.findings = findings.length; }, 'report', 'The findings as spans, each with its scene').build();
  const trace = narrative(), run = await built.recorder(trace).run();
  const state = run?.state ?? run?.sharedState ?? {};
  return {window, facts: state.facts ?? null, findings, text: findingsText(findings), timeline: timelineText(partTimeline(film, window)), ran: state.ran ?? [], record: trace.getEntries()};
}
