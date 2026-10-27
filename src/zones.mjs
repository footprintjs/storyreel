/**
 * The app's own UI over a video, as data, and what of a film falls under it. A phone player draws its own things over
 * the picture: a bar at the top, a strip at the foot (the title, the post's caption, the channel's name), a column of
 * buttons on the right. Text under them cannot be read.
 *
 *   zones     [{name, box: [x, y, width, height], basis?}] — each a rectangle in fractions of the frame (0–1), so one
 *             list serves every scale. `basis` says where its numbers come from: 'measured' (read off the platform's
 *             own published template or figure) or 'estimate'. A platform adapter declares its zones (src/targets/*).
 *   fitting   a block of text — the captions, the title band — laid out clear of them (fitBlock): tried as it is
 *             first and kept, untouched, when none of it lies under a zone, so a layout whose text is clear draws as
 *             it always did; else narrowed about its centre to what the zones leave clear across its rows, or moved
 *             out of a band that spans it.
 *   the check uiFindings: every caption, the title band and every named face region (ui.faces) still under a zone
 *             after the fitting — when, under which zone, and where — what a render reports, or refuses when the
 *             layout says so (ui.covered: 'refuse').
 *
 * Geometry is in the format's own pixels (1080×1920 for vertical), whatever the render's scale; rectangles drawn are
 * [x0, y0, x1, y1], boxes given are [x, y, width, height].
 */
import {createCanvas} from '@napi-rs/canvas';

/** What a layout does with something under the app's UI: report it (the render goes on) or refuse before a frame is drawn. */
export const COVERED = Object.freeze(['report', 'refuse']);
/** Where a zone's numbers come from: the platform's own template or figure, read off it ('measured'), or an estimate. */
export const BASES = Object.freeze(['measured', 'estimate']);
const ZONE_KEYS = ['name', 'box', 'basis'], UI_KEYS = ['zones', 'covered', 'faces'];
const MOST_ZONES = 16;
/** Two rectangles overlap when they share more than this many pixels each way: a shared edge is no overlap. */
export const EDGE = .5;
/** How many times fitBlock moves or narrows a block before it gives up (and the check reports what is still covered). */
const FITS = 6;
/** A face region is looked at this often (seconds) for the check. */
export const FACE_STEP = .25;

/**
 * A list of zones, checked: frozen [{name, box, basis?}]. Refuses naming the zone and the fix: a box is
 * [x, y, width, height] in fractions of the frame, inside it.
 */
export function readZones(zones, where = 'ui.zones') {
  if (!Array.isArray(zones) || zones.length > MOST_ZONES) throw new Error(`${where} lists where the app draws over the video, at most ${MOST_ZONES}: [{name, box: [x, y, width, height] in fractions of the frame (0–1), basis?: 'measured' | 'estimate'}]`);
  return Object.freeze(zones.map((z, i) => {
    const at = `${where}[${i}]`;
    if (!z || typeof z !== 'object' || Array.isArray(z)) throw new Error(`${at} is {name, box: [x, y, width, height], basis?}: one place the app draws over the video`);
    for (const key of Object.keys(z)) if (!ZONE_KEYS.includes(key)) throw new Error(`${at} has unsupported key ${key} (a zone is {${ZONE_KEYS.join(', ')}})`);
    if (!(typeof z.name === 'string' && z.name.trim())) throw new Error(`${at}.name says what the app draws there, in words ('action column', 'caption strip')`);
    const b = z.box, ok = Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[0] >= 0 && b[1] >= 0 && b[2] > 0 && b[3] > 0 && b[0] + b[2] <= 1 + 1e-9 && b[1] + b[3] <= 1 + 1e-9;
    if (!ok) throw new Error(`${at}.box is [x, y, width, height] in fractions of the frame, inside it (0–1): [0, 0.78, 1, 0.22] is the foot's 22%, not ${JSON.stringify(b)}`);
    if (z.basis !== undefined && !BASES.includes(z.basis)) throw new Error(`${at}.basis is ${BASES.map(s => `'${s}'`).join(' or ')} (where its numbers come from), not ${JSON.stringify(z.basis)}`);
    return Object.freeze({name: z.name, box: Object.freeze([...b]), ...(z.basis ? {basis: z.basis} : {})});
  }));
}

/**
 * A layout's `ui`, checked: {zones, covered, faces} — the zones (readZones), what to do with something under them
 * ('report', the default, or 'refuse'), and the named things (as the kits name them in their regions) that must stay
 * clear of them ([] by default: name the faces to check them).
 */
export function readUi(ui, where = 'layout.ui') {
  if (!ui || typeof ui !== 'object' || Array.isArray(ui)) throw new Error(`${where} is {zones, covered?, faces?}: where the app draws over the video, what to do when something falls under it (${COVERED.map(c => `'${c}'`).join(' or ')}), and the named faces that must stay clear`);
  for (const key of Object.keys(ui)) if (!UI_KEYS.includes(key)) throw new Error(`${where} has unsupported key ${key} (ui is {${UI_KEYS.join(', ')}})`);
  const zones = readZones(ui.zones, `${where}.zones`), covered = ui.covered ?? 'report', faces = ui.faces ?? [];
  if (!COVERED.includes(covered)) throw new Error(`${where}.covered is 'report' (the render goes on and says what is under the app's UI) or 'refuse' (it stops before a frame is drawn), not ${JSON.stringify(covered)}`);
  if (!(Array.isArray(faces) && faces.every(n => typeof n === 'string' && n.trim()))) throw new Error(`${where}.faces lists the named things (as the kits name them in their regions) that must stay clear of the app's UI, e.g. ['amaira face']`);
  return Object.freeze({zones, covered, faces: Object.freeze([...faces])});
}

/** The zones on a picture `width`×`height`: [{name, basis?, rect: [x0, y0, x1, y1]}] in its pixels. */
export const zoneRects = (zones, width, height) => zones.map(z => ({name: z.name, ...(z.basis ? {basis: z.basis} : {}),
  rect: [z.box[0] * width, z.box[1] * height, (z.box[0] + z.box[2]) * width, (z.box[1] + z.box[3]) * height]}));

/** Where two rectangles [x0, y0, x1, y1] overlap, or null: a shared edge, or less than EDGE px either way, is none. */
export function overlapOf(a, b) {
  const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]), x1 = Math.min(a[2], b[2]), y1 = Math.min(a[3], b[3]);
  return x1 - x0 > EDGE && y1 - y0 > EDGE ? [x0, y0, x1, y1] : null;
}

/** Each rectangle under a zone: [{rect, zone, overlap}] — a rectangle under two zones is listed under each. */
export const underZones = (rects, zones) => rects.flatMap(rect => zones.map(z => ({rect, zone: z.name, overlap: overlapOf(rect, z.rect)})).filter(h => h.overlap));

/**
 * The stretch of `span` [x0, x1] the zones leave clear, or null when they cover it all: the widest free stretch,
 * narrowed about the span's centre (so centred text stays centred) when that keeps at least 60% of it; else the
 * stretch itself.
 */
export function clearSpan([s0, s1], zones) {
  const cuts = zones.map(z => [Math.max(s0, z.rect[0]), Math.min(s1, z.rect[2])]).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  const free = []; let at = s0;
  for (const [a, b] of cuts) { if (a > at) free.push([at, a]); at = Math.max(at, b); }
  if (at < s1) free.push([at, s1]);
  if (!free.length) return null;
  const [w0, w1] = free.reduce((best, f) => (f[1] - f[0] > best[1] - best[0] ? f : best));
  const c = (s0 + s1) / 2, half = c >= w0 && c <= w1 ? Math.min(c - w0, w1 - c) : 0;
  return 2 * half >= .6 * (w1 - w0) ? [c - half, c + half] : [w0, w1];
}

/**
 * A block of text laid out clear of the zones (rects in the same pixels). `place([x0, x1], dy)` lays it out in the
 * horizontal span x0–x1, moved down by dy pixels (negative: up), and returns {rects, …}: what it draws. The block as
 * given (the whole span, not moved) comes first, and is kept untouched when none of it lies under a zone. Else, at
 * most FITS times: the zones across its rows leave the span's clear stretch (clearSpan), taken when it keeps at least
 * a third of the span; else a zone spans the rows, and the block moves out of it, the shorter way that keeps it inside
 * the picture (0–height). Returns {placed, fitted, covered}: `fitted` whether it was moved or narrowed, `covered` what
 * of it is still under a zone ([{rect, zone, overlap}]: the check reports these).
 */
export function fitBlock(place, span, zones, {height}) {
  let placed = place(span, 0), covered = underZones(placed.rects, zones);
  if (!covered.length || !placed.rects.length) return {placed, fitted: false, covered};
  let at = span, dy = 0;
  for (let i = 0; i < FITS && covered.length; i++) {
    const top = Math.min(...placed.rects.map(r => r[1])), bottom = Math.max(...placed.rects.map(r => r[3]));
    const across = zones.filter(z => z.rect[1] < bottom - EDGE && z.rect[3] > top + EDGE);
    const clear = clearSpan(span, across);
    if (clear && clear[1] - clear[0] >= (span[1] - span[0]) / 3 && (clear[0] !== at[0] || clear[1] !== at[1])) at = clear;
    else {
      // A zone spans the block's rows: out of the one it lies under most, toward the picture's middle when both ways fit.
      const most = covered.reduce((m, h) => (area(h.overlap) > area(m.overlap) ? h : m));
      const band = zones.find(z => z.name === most.zone && overlapOf(most.rect, z.rect)).rect;
      const up = band[1] - bottom, down = band[3] - top, fits = d => top + d >= 0 && bottom + d <= height;
      const first = (band[1] + band[3]) / 2 > (top + bottom) / 2 ? up : down, second = first === up ? down : up;
      const d = fits(first) ? first : fits(second) ? second : null;
      if (d === null) break;
      dy += d;
    }
    placed = place(at, dy); covered = underZones(placed.rects, zones);
  }
  return {placed, fitted: true, covered};
}
const area = r => (r[2] - r[0]) * (r[3] - r[1]);

/** A rectangle rounded to whole pixels, for a finding. */
const rounded = r => r.map(v => Math.round(v));
/** A zone's rectangle as words: "x 780–1080, y 840–1920". */
export const rectText = r => `x ${Math.round(r[0])}–${Math.round(r[2])}, y ${Math.round(r[1])}–${Math.round(r[3])}`;

/**
 * What of the film is still under the app's UI in a compiled layout (layout.mjs · compileLayout with `ui`), between
 * `from` and `to` on the film clock (`cut`, an edit's cut index, is said with each): [{kind: 'title' | 'caption' |
 * 'face', at, until?, zone, name?, said?, rect, overlap, cut?}], in time order — the title band once (at `from`), each
 * caption chunk said there (at its start), each named face (ui.faces) as runs of FACE_STEP samples. Also {fitted}: how
 * many captions the fitting moved or narrowed, and whether it moved the title. Pure: nothing is drawn.
 */
export function uiFindings(film, framed, {from = 0, to = film.total, cut} = {}) {
  const ui = framed.ui;
  if (!ui) return {findings: [], fitted: {captions: 0, title: false}};
  const ctx = createCanvas(2, 2).getContext('2d'), out = [], tag = cut === undefined ? {} : {cut};
  const title = framed.titleFit(ctx);
  for (const h of title?.covered ?? []) out.push({kind: 'title', at: +from.toFixed(3), zone: h.zone, rect: rounded(h.rect), overlap: rounded(h.overlap), ...tag});
  let captions = 0;
  for (const chunk of framed.captionChunks ?? []) {
    if (chunk.end <= from + 1e-6 || chunk.start >= to - 1e-6) continue;
    const fit = framed.captionFit(ctx, {words: chunk.words, active: 0});
    if (fit.fitted) captions++;
    for (const h of fit.covered) out.push({kind: 'caption', at: +chunk.start.toFixed(3), zone: h.zone, said: chunk.text, rect: rounded(h.rect), overlap: rounded(h.overlap), ...tag});
  }
  out.push(...faceRuns(film, framed, {from, to}).map(r => ({...r, ...tag})));
  return {findings: out.sort((a, b) => a.at - b.at), fitted: {captions, title: Boolean(title?.fitted)}};
}

/**
 * A render's report of what is under the app's UI, from its compiled layouts — [{framed, from, to, cut?}]: the whole
 * render's, or one per cut of an edit — or null when none has `ui`: {zones: [{name, basis?, rect}], covered, faces,
 * fitted: {captions, title}, findings: [{…, text, fix}], ok}. With covered: 'refuse' and anything under the UI it
 * refuses, naming the first few and their fixes — before a frame is drawn (render.mjs calls it as the render is prepared).
 */
export function uiReport(film, layouts) {
  const withUi = layouts.filter(l => l.framed?.ui);
  if (!withUi.length) return null;
  const {zones, covered, faces} = withUi[0].framed.ui, findings = [], fitted = {captions: 0, title: false};
  for (const {framed, from, to, cut} of withUi) {
    const r = uiFindings(film, framed, {from, to, cut});
    findings.push(...r.findings); fitted.captions += r.fitted.captions; fitted.title ||= r.fitted.title;
  }
  // An edit's title band is the same in every cut: said once.
  const seen = new Set(), said = findings.filter(f => { if (f.kind !== 'title') return true; const k = `${f.zone}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(f => ({...f, text: findingText(f), fix: findingFix(f, zones)}));
  if (covered === 'refuse' && said.length) {
    throw new Error(`layout.ui: ${said.length} ${said.length === 1 ? 'place is' : 'places are'} under the app's UI (covered: 'refuse'): ${said.slice(0, 3).map(f => `${f.text} — ${f.fix}`).join('; ')}${said.length > 3 ? `; and ${said.length - 3} more` : ''}. Or covered: 'report' to render and say so`);
  }
  return {zones: zones.map(z => ({...z, rect: rounded(z.rect)})), covered, faces: [...faces], fitted, findings: said, ok: !said.length};
}

/** Each named face (ui.faces) under a zone, as runs: {kind: 'face', name, zone, at, until, rect, overlap} (the first sample's). */
function faceRuns(film, framed, {from, to}) {
  const names = framed.ui.faces;
  if (!names.length || typeof film.regionsAt !== 'function') return [];
  const runs = [], open = new Map();
  for (let k = 0; from + k * FACE_STEP < to - 1e-6; k++) {
    const t = from + k * FACE_STEP, seen = new Set();
    for (const r of film.regionsAt(t)) {
      if (!r.name || !names.includes(r.name)) continue;
      const rect = framed.toOutput(t, r.box);
      if (!rect) continue;
      for (const z of framed.ui.zones) {
        const o = overlapOf(rect, z.rect); if (!o) continue;
        const key = `${r.name}\u0000${z.name}`; seen.add(key);
        if (open.has(key)) open.get(key).until = +Math.min(to, t + FACE_STEP).toFixed(3);
        else { const run = {kind: 'face', name: r.name, zone: z.name, at: +t.toFixed(3), until: +Math.min(to, t + FACE_STEP).toFixed(3), rect: rounded(rect), overlap: rounded(o)}; open.set(key, run); runs.push(run); }
      }
    }
    for (const key of [...open.keys()]) if (!seen.has(key)) open.delete(key);
  }
  return runs;
}

/** A finding as words: "the caption "for every sheep" at 12.30 s is under the action column (x 780–952, y 1345–1413)". */
export function findingText(f) {
  const where = `${f.cut !== undefined ? `cut ${f.cut}, ` : ''}${f.at.toFixed(2)} s${f.until !== undefined ? `–${f.until.toFixed(2)} s` : ''}`;
  const what = f.kind === 'title' ? 'the title band' : f.kind === 'caption' ? `the caption "${String(f.said).slice(0, 40)}"` : `"${f.name}"`;
  return `${what} at ${where} is under the ${f.zone} (${rectText(f.overlap)})`;
}

/**
 * The fix a finding names: a caption or the title moved inside what the zones leave clear (its box), or the face
 * framed off the zone. `zones` are the layout's (rects), so the fix can say where the zone is.
 */
export function findingFix(f, zones) {
  const z = zones.find(q => q.name === f.zone), at = z ? ` (it covers ${rectText(z.rect)})` : '';
  if (f.kind === 'face') return `frame "${f.name}" off the ${f.zone}${at}: a crop key that moves the window, or a smaller width; or take it out of ui.faces`;
  return `give layout.${f.kind === 'title' ? 'header' : 'captions'}.box a box clear of the ${f.zone}${at}, or a shorter ${f.kind === 'title' ? 'title' : 'chunk (captions.maxWords)'}`;
}
