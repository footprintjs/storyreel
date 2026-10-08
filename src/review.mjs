/**
 * Reviewing a part by reading it, so a reviewer (or a model) reads first and looks at a frame only to confirm.
 * The picture is read as text — every line a frame draws (fillText / strokeText) with its box in output pixels
 * and the alpha it was drawn at (wordsAt) — and fingerprinted, a few times a second over the part; then checks
 * name what is wrong, with times: words under the captions while a caption shows, words over other words, words
 * cut off at the frame's edge, a picture frozen for a while — and a director's checks on the whole: a hook in the
 * first 3 s, not too much to read at once, real silences (a breath before the peak), something new every few
 * seconds while the picture moves, and — for a part made to loop — an end that comes round to its start.
 *
 * The review is a footprintjs flowchart, so it leaves its own record — what was read, which checks ran and why
 * (the selector's evidence), what each found:
 *
 *   read-part     the part's window and facts; the picture read and fingerprinted once, and its frozen stretches
 *                 found, for every check
 *   pick-checks   a selector: each check is a strategy, run as its own subflow, picked by what the part has
 *                 (a caption band, words, enough length to stand still); a check of your own has the same shape
 *   <check>       reads the shared samples, names what it finds (or the error it threw, carried out)
 *   report        the findings merged into spans, with the scene each starts in
 *
 * reviewPart is the facade: one call, a report as data and as text, the timeline, and the record. A check that
 * throws fails the review, naming it, so "nothing found" always means every check picked has run. Text drawn into
 * a scratch picture (a crossfade's ghost) is not read, and a drawing that is not text is seen only as the picture
 * changing or not (the still, hook and loop checks).
 */
import {createCanvas} from '@napi-rs/canvas';
import {flowChart, narrative, select} from 'footprintjs';
import {compileLayout} from './layout.mjs';
import {frameHashes} from './pins.mjs';
import {partScenes, partWindow, partTimeline, timelineText} from './render.mjs';
import {clockText} from './clock.mjs';

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
 * A moment on the film clock to the millisecond (how frameHashes keys it), never past the film's end: rounding can
 * carry the end over it (21.299999999999997 is 21.300 to the millisecond, a moment the film never reaches).
 */
const onClock = (film, t) => Math.min(film.total, +t.toFixed(3));
/** The last moment before t: the largest number under it, near enough (one or two steps of a double below). */
const justBefore = t => t - Math.abs(t) * Number.EPSILON;
/**
 * The picture at t exactly, as the eye takes it in: drawn at the film's own size (drawn smaller, a thin line or small
 * text drops out) and averaged over cells of 4×4 pixels, RGB. Something turned a hair (an image, a card, a word) is
 * redrawn a few pixels off along its edges where nothing moved; the average loses that and keeps a jump.
 */
function cellsAt(film, t) {
  const c = createCanvas(1600, 900); film.frame(c.getContext('2d'), t);
  const px = c.data(), cells = new Float32Array(400 * 225 * 3);
  for (let y = 0; y < 900; y++) for (let x = 0; x < 1600; x++) { const i = (y * 1600 + x) * 4, o = ((y >> 2) * 400 + (x >> 2)) * 3; cells[o] += px[i]; cells[o + 1] += px[i + 1]; cells[o + 2] += px[i + 2]; }
  return cells.map(v => v / 16);
}
/**
 * Two pictures the same to the eye: no cell more than 32 levels apart, and less than 0.02 of a level apart on average.
 * Measured over 1,800 seamless loops (cards, images, hands, dots and words turning, read at their last moment): a
 * cell at most 18.9 levels off, 0.0061 on average. A jump is far past one or the other: a 12-px dot 600 px away is
 * 221 off in a cell, a 1-px hand turned 90° is 64, a 300×120 card 32 levels bluer is 0.53 off on average.
 */
function alike(p, q) {
  let sum = 0, most = 0;
  for (let i = 0; i < p.length; i++) { const d = Math.abs(p[i] - q[i]); sum += d; if (d > most) most = d; }
  return most <= 32 && sum / p.length < .02;
}
/** The words drawn at t that the review counts (at minAlpha or more), as one text: a label's digit can change in fewer pixels than a turning card's edges are redrawn. */
const wordsSaid = (film, t, minAlpha) => wordsAt(film, t).filter(w => w.alpha >= minAlpha).map(w => w.text).sort().join('\n');

/**
 * The stretches where the picture is frozen — the same from sample to sample for `stillFor` seconds or more — as
 * [{from, to}] sample times. Found once, when the part is read, and shared: the still check names them, and the
 * stale check leaves them to it, so a frozen stretch is said once.
 */
function frozenRuns({samples, hashes, stillFor}) {
  const out = []; let run = [];
  const close = () => { if (run.length && run.at(-1) - run[0] >= stillFor) out.push({from: run[0], to: run.at(-1)}); run = []; };
  samples.forEach(({t}, i) => { if (i && hashes[t] === hashes[samples[i - 1].t]) { if (!run.length) run.push(samples[i - 1].t); run.push(t); } else close(); });
  close(); return out;
}

/**
 * The checks, each a strategy: label, why (said when it is picked), when(scope) (picked when true: scope.facts
 * holds {seconds, captions, words}), find(review) → [{kind, t, what}] from the shared samples. Same shape for a
 * check of your own, passed in reviewPart's `checks`. find answers at once, and its hits are copied as {kind, t, what}
 * (plainHits): a find that throws or returns anything else fails the review, naming the check. review.picked says
 * which checks run beside it, so one can leave a finding to another (stale leaves a frozen picture to still). A
 * check's `what` names one stretch: hits with the same kind and `what` merge into one span.
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
  // The picture moves, but nothing new comes (a frozen picture is the still check's).
  stale: {label: 'Nothing new', why: 'the part is long enough to need something new every few seconds', when: s => s.facts.seconds > s.facts.newEvery,
    find: ({film, window, samples, newEvery, frozen, picked}) => {
      // What is new: a scene starting, a beat landing (the recipe acting on a phrase), a word that was not on screen a
      // moment before. A gap runs from one new moment (or the window's edge) to the next and holds the samples between
      // them: a new moment's own sample shows something new, so it is in no gap; the window's edges are in one.
      const ms = t => +t.toFixed(3), inside = t => t >= window.from - 1e-6 && t <= window.to + 1e-6;
      const fresh = new Set([...film.clock.offsets, ...(film.beats ?? []).map(b => b.t)].filter(inside).map(ms));
      samples.forEach((x, i) => { if (i && x.words.some(w => !samples[i - 1].words.some(p => p.text === w.text))) fresh.add(ms(x.t)); });
      // A frozen picture is the still check's to name when it runs, so a frozen stretch is said once.
      const left = picked.includes('still') ? frozen : [], quiet = t => !fresh.has(ms(t)) && !left.some(r => t >= r.from && t <= r.to);
      const edges = [...new Set([ms(window.from), ...fresh, ms(window.to)])].sort((a, b) => a - b), out = [];
      for (let i = 1; i < edges.length; i++) {
        const [a, b] = [edges[i - 1], edges[i]];
        if (!(b - a > newEvery)) continue;
        const what = `nothing new for ${(b - a).toFixed(1)} s since ${clockText(a)} (no scene, no beat, no new words)`;   // its own words: two gaps never merge into one span
        out.push(...samples.filter(x => x.t >= a - 1e-9 && x.t <= b + 1e-9 && quiet(x.t)).map(x => ({kind: 'stale', t: x.t, what})));
      }
      return out;
    }},
  loop: {label: 'The loop seam', why: 'the part is made to loop', when: s => s.facts.loop && s.facts.seconds > .1,
    find: ({film, part, minAlpha}) => {
      // A clip that loops goes from its end straight to its start: what it shows at its end must be what it shows at its
      // start (motion that runs on comes round to where it began), or the loop jumps. The part is its own scenes, not
      // their handles. Its end is read at its last moment (justBefore) — a frame is a pure function of time, so that is
      // the picture the part ends on, never one after the cut (the next scene, a handle); read a millisecond early, a
      // dot circling at 18 px a second has moved on — and the two ends are compared as the eye takes them in (cellsAt,
      // alike) and as words (wordsSaid).
      const end = Math.max(part.from, justBefore(part.to));
      if (wordsSaid(film, part.from, minAlpha) === wordsSaid(film, end, minAlpha) && alike(cellsAt(film, part.from), cellsAt(film, end))) return [];
      return [{kind: 'loop', t: onClock(film, Math.max(part.from, part.to - .001)), what: 'the end is not the start: the loop jumps'}];   // said in the part's last millisecond, so in its own scene
    }},
  // The picture is frozen: the same frame for stillFor seconds or more.
  still: {label: 'Nothing changes', why: 'the part is long enough to stand still', when: s => s.facts.seconds >= s.facts.stillFor,
    find: ({samples, frozen}) => frozen.flatMap(({from, to}) => {
      const what = `the picture does not change for ${(to - from).toFixed(1)} s from ${clockText(from)}`;   // its own words: two stretches never merge into one span
      return samples.filter(x => x.t >= from && x.t <= to).map(x => ({kind: 'still', t: x.t, what}));
    })},
});

const LABEL = {'under-captions': 'under the captions', 'words-overlap': 'words over words', 'cut-off': 'cut off at the edge', still: 'nothing changes', hook: 'no hook', 'text-density': 'too much to read', silences: 'no breath', stale: 'nothing new', loop: 'the loop jumps'};
/** The findings as lines: "1:21.5–1:23.0 chapters · under the captions: \"requests in\"". */
export const findingsText = findings => findings.map(f => `${clockText(f.from)}–${clockText(f.to)} ${f.scene ?? ''} · ${LABEL[f.kind] ?? f.kind}: ${f.what}`).join('\n');

/**
 * What a check found, as plain {kind, t, what}: all the review's record can copy and its report reads. Anything else
 * is refused, saying what find returned instead — a promise (a check reads the shared samples and answers at once),
 * no list, or a hit without its name, its time or its words.
 */
function plainHits(hits) {
  if (typeof hits?.then === 'function') { Promise.resolve(hits).catch(() => {}); throw new Error('find returned a promise: a check reads the shared samples and returns its hits, [{kind, t, what}]'); }
  if (!Array.isArray(hits)) throw new Error(`find must return a list of hits, [{kind, t, what}], not ${hits === null ? 'null' : typeof hits}`);
  return Array.from(hits, (h, i) => {   // every slot, a hole too (map would pass it by)
    const wrong = h == null ? 'there is none (an empty slot)' : typeof h.kind !== 'string' ? 'kind must be a name (a string)' : !Number.isFinite(h.t) ? 't must be seconds on the film clock' : typeof h.what !== 'string' ? 'what must be words (a string)' : null;
    if (wrong) throw new Error(`find's hit ${i}: ${wrong}; a hit is {kind, t, what}`);
    return {kind: h.kind, t: h.t, what: h.what};
  });
}

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
  return out.filter(f => ['still', 'hook', 'silences', 'stale', 'loop'].includes(f.kind) || f.to - f.from + every >= lasting - 1e-9).sort((a, b) => a.from - b.from || a.kind.localeCompare(b.kind)).map(f => ({...f, scene: sceneAt(f.from)}));
}

/**
 * Review a part of the film (or all of it) by reading it. part: {scenes, handles?} (render.mjs · partWindow), or
 * from/to on the film clock; layout: the render's layout spec (read at the format's own size, whatever its scale).
 * Words count when drawn at `minAlpha` (0.5) or more and for `lasting` seconds (1) or more — shorter is a fade or a
 * page turning; the picture is frozen when unchanged for `stillFor` seconds (5: the still check); more than
 * `maxWords` (35) words on screen at once is too much to read; a real silence is a pause of `minSilence` seconds (0.8)
 * with nothing playing; text smaller than `minHeight` of the frame (0.011: 12 px at 1080) is texture, not reading, and
 * is not counted; something new (a scene, a beat, a word not on screen a moment before) should come at least every
 * `newEvery` seconds (5) while the picture moves (the stale check); `loop: true` says the part is made to loop: the
 * picture at the end of its own scenes (a part's handles are not the part), read at its last moment, must be the
 * picture at their start. Motion that steps rather than runs (a flipbook, a blink, a part drawn on twos) is read one
 * drawing short of coming round — its last moment still shows its last drawing — so such a loop reads as a jump even
 * when it loops cleanly: look at a strip of the seam before changing it.
 * A window past the film's ends is held to the film. A check that fails (it throws, or answers with anything but
 * what it should) fails the review: one error names every check that failed and why.
 * Returns {window, facts, findings, text, timeline, ran, record}: findings [{kind, from, to, scene, what}] on the
 * film clock, text as lines, the part's timeline (scenes and beats), the checks that ran, and the review's own
 * footprintjs record.
 */
export async function reviewPart(film, {part = null, from = 0, to = film.total, layout = null, every = .25, stillFor = 5, lasting = 1, minAlpha = .5, minHeight = .011, maxWords = 35, minSilence = .8, newEvery = 5, loop = false, checks = REVIEW_CHECKS} = {}) {
  if (!(Number.isFinite(newEvery) && newEvery > 0)) throw new Error(`review: newEvery must be seconds, more than 0, not ${JSON.stringify(newEvery)}`);
  // What is read: a part with its handles, or from/to held to the film as a render's is (no moment past its ends).
  const window = part ? partWindow(film, part) : {from: Math.max(0, from), to: Math.min(film.total, to)};
  if (!(window.from <= window.to)) throw new Error(`review: nothing to read in ${window.from.toFixed(2)}–${window.to.toFixed(2)} s: from must come before to, inside the film (0–${film.total.toFixed(2)} s)`);
  // The part itself, its own scenes without the handles and exactly where they lie (what a loop comes round on: rounded
  // to the millisecond, a scene paced to 10 µs is read inside its neighbour); the window when no part is named.
  const own = part ? partScenes(film, part) : window;
  const framed = layout ? compileLayout(film, (({scale, ...rest}) => rest)(layout)) : null;
  for (const [id, c] of Object.entries(checks)) if (!c || typeof c.find !== 'function' || typeof c.when !== 'function' || typeof c.label !== 'string') throw new Error(`review check "${id}" must be {label, why?, when(scope), find(review)}`);
  const review = {film, window, part: own, layout: framed, width: framed?.width ?? 1600, height: framed?.height ?? 900, every, stillFor, maxWords, minSilence, newEvery, minAlpha, samples: [], hashes: {}, frozen: [], picked: []};
  let findings = [];
  const read = async s => {
    const times = []; for (let t = window.from; t <= window.to + 1e-9; t += every) times.push(onClock(film, t));
    // Only what is on screen counts: a word the camera has framed out is not shown (its box misses the frame).
    // What is on screen counts. While the film's camera is pushed in (its focus), a word with less than half of it in
    // the frame has been framed out — a camera crops the page — and is not shown; at the camera's rest every word
    // that reaches the frame counts, so a word running off the edge of the layout is still cut off.
    const W = framed?.width ?? 1600, H = framed?.height ?? 900, inside = b => Math.max(0, Math.min(b[2], W) - Math.max(b[0], 0)) * Math.max(0, Math.min(b[3], H) - Math.max(b[1], 0));
    const shown = (w, zoomed) => inside(w.box) >= (zoomed ? .5 * Math.max(1, (w.box[2] - w.box[0]) * (w.box[3] - w.box[1])) : 1e-6);
    // Text smaller than `minHeight` of the frame (1.1 %: 12 px at 1080) cannot be read: it is texture (a photo of a page), not reading.
    const legible = w => w.box[3] - w.box[1] >= minHeight * H;
    review.samples = times.map(t => { const zoomed = (film.focusAt?.(t)?.z ?? 1) > 1.001; return {t, words: wordsAt(film, t, {layout: framed}).filter(w => w.alpha >= minAlpha && legible(w) && shown(w, zoomed))}; });
    // frameHashes keys a moment by its millisecond, and the film's end can sit a hair under its own (21.2999…97 is
    // 21.300): the hashes are keyed by each sample's own time, so a check reads hashes[t].
    const pictures = frameHashes(film, {times, width: 160});
    review.hashes = Object.fromEntries(times.map(t => [t, pictures[+t.toFixed(3)]]));
    review.frozen = frozenRuns(review);
    s.facts = {from: window.from, to: window.to, seconds: +(window.to - window.from).toFixed(3), stillFor, newEvery, loop: Boolean(loop), captions: Boolean(framed?.boxes.captions), samples: times.length, words: review.samples.reduce((n, x) => n + x.words.length, 0),
      spoken: film.timings.scenes.some((sc, i) => (sc.words ?? []).some(w => film.clock.offsets[i] + w.end > window.from && film.clock.offsets[i] + w.start < window.to))};
    s.ran = []; s.hits = []; s.failed = [];
  };
  // The picks go on the review too, so a check can leave a finding to another that runs. A when() that throws is a
  // failure, not a check that does not fit: select() records it as unmatched and goes on, so it is carried out here.
  // So is a when() that answers with a promise, which select() would take for yes.
  const answers = c => s => {
    const fits = c.when(s);
    if (typeof fits?.then === 'function') { Promise.resolve(fits).catch(() => {}); throw new Error('when returned a promise: a check says at once whether it fits the part (true or false)'); }
    return fits;
  };
  const pick = s => {
    const picked = select(s, Object.entries(checks).map(([id, c]) => ({when: answers(c), then: id, label: c.why ?? c.label})));
    review.picked = picked.branches;
    s.failed = picked.evidence.rules.filter(r => r.matchError !== undefined).map(r => ({id: r.branch, message: r.matchError}));
    return picked;
  };
  // A check that throws, or finds what the record cannot keep (plainHits), is carried out as a failure too: left to the
  // selector, its error would be contained — the check missing from `ran`, the review clean.
  const told = e => { try { return e instanceof Error ? e.message : String(e); } catch { return 'a thrown value that cannot be printed'; } };
  const runCheck = (id, c) => async s => { try { s.hits = plainHits(c.find(review)); } catch (e) { s.failed = [{id, message: told(e)}]; } };
  // The engine's own lines (an error it contained, say) are kept for the report, never printed: stdout is where a
  // tool's answer goes (an MCP client reads it as the answer).
  const engine = [], heard = (message, detail) => { engine.push(detail?.error === undefined ? String(message) : `${message} ${told(detail.error)}`); };
  let chart = flowChart('read-part', read, 'read-part', 'The part read as text and fingerprinted, once for every check')
    .addSelectorFunction('pick-checks', pick, 'pick-checks', 'Each check that fits the part');
  for (const [id, c] of Object.entries(checks)) chart = chart.addSubFlowChartBranch(id, flowChart(c.label, runCheck(id, c), id).build(), c.label, {outputMapper: out => ({hits: out.hits ?? [], ran: [id], failed: out.failed ?? []})});
  const built = chart.end().addFunction('report', async s => { findings = spans(film, s.hits ?? [], every, lasting); s.findings = findings.length; }, 'report', 'The findings as spans, each with its scene')
    .setLogger({info: heard, warn: heard, error: heard, log() {}, debug() {}}).build();
  const trace = narrative(), run = await built.recorder(trace).run();
  const state = run?.state ?? run?.sharedState ?? {}, failed = [...(state.failed ?? [])], ran = new Set(state.ran ?? []);
  // A check picked that neither ran nor failed was lost on the way (its result never reached the review): a failure too.
  for (const id of review.picked) if (!ran.has(id) && !failed.some(f => f.id === id)) failed.push({id, message: `it did not finish${engine.length ? ` (the engine: ${engine.join('; ')})` : ''}`});
  if (failed.length) throw new Error(`review: ${failed.length > 1 ? `${failed.length} checks` : 'a check'} failed, so the review is incomplete — ${failed.map(f => `"${f.id}": ${f.message}`).join('; ')}`);
  return {window, facts: state.facts ?? null, findings, text: findingsText(findings), timeline: timelineText(partTimeline(film, window)), ran: state.ran ?? [], record: trace.getEntries()};
}
