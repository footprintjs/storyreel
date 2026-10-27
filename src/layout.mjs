/**
 * Formats: one film, a version for every place it is posted. The film is always drawn on its
 * 1600×900 frame; a layout puts that frame into an output picture of another shape, with a title band
 * and a caption band where the shape leaves room:
 *
 *   landscape  1920×1080  16:9   YouTube, X, LinkedIn               the whole frame; captions over its foot
 *   square     1080×1080  1:1    LinkedIn, X, Facebook feeds        title band · the whole frame · captions
 *   portrait   1080×1350  4:5    Instagram and Facebook feeds       title band · a 4:3 crop · captions
 *   vertical   1080×1920  9:16   Shorts, Reels, TikTok              title band · a 4:3 crop · captions
 *
 * Where the bands sit is decided by the apps that play the film (their players as laid out in 2026): a full-screen phone
 * player covers its top ~250 px with its own bar, the bottom ~420 px with the account name and the post's
 * text, and the right ~120 px from the middle down with its buttons; Instagram shows a vertical video in
 * its feed cut to 4:5 (y 285–1635), and plays a 4:5 or square video in the same full-screen player. So
 * everything meant to be read — the title, the film, the captions — sits inside what all of them leave
 * clear (y 285–1460 of the vertical picture): there the film is a 4:3 crop, so the captions fit under it
 * and never cover the picture (a teaching film's picture has words in it too).
 *
 * A crop shows part of the frame and follows the action through `crop` keys tied to spoken phrases, like
 * every other key: {at: beat, x} puts the crop's centre at x on the 1600-wide frame; `width` (400–1600)
 * widens it to show more — up to the whole frame, with the paper above and below — or narrows it to come
 * closer. It eases from key to key (centred, at the format's width, until the first).
 *
 * A layout is data: unknown keys refuse. The bands take the film's own paper and ink and its sans type
 * (film.theme) unless the layout names a background or ink; a band's box may be moved (`box`) when an
 * app's controls change.
 *
 * Where one app draws over the video is the platform's own data (`ui`: zones.mjs; a release target passes its
 * adapter's): with it, the captions and the title band are laid out clear of the app's UI — a line that would be
 * under the buttons is narrowed about its centre, a block under a strip moves out of it — and a line already clear is
 * drawn exactly as without it. What is still under the UI (and every named face under it) is the check's to report
 * (zones.mjs · uiFindings).
 */
import {captionChunks, captionAt} from 'footprint-narration';
import {spokenTracks, drawCaption, captionFit} from './captions.mjs';
import {inOut} from './ease.mjs';
import {FOLLOW, keepWhole, filmSpeakers} from './follow.mjs';
import {readUi, zoneRects, fitBlock, EDGE} from './zones.mjs';
export {FOLLOW, followFocus, keepWhole, NUDGE} from './follow.mjs';

const FORMATS = Object.freeze({
  landscape: {width: 1920, height: 1080, film: [0, 0, 1920, 1080], crop: null, header: null, captions: [160, 860, 1600, 160], captionSize: 52, maxWords: 7},
  square: {width: 1080, height: 1080, film: [0, 236, 1080, 608], crop: null, header: [60, 36, 960, 180], captions: [120, 852, 840, 180], captionSize: 50, maxWords: 5},
  portrait: {width: 1080, height: 1350, film: [0, 240, 1080, 810], crop: [1200, 900], header: [60, 40, 960, 180], captions: [120, 1060, 840, 150], captionSize: 50, maxWords: 5},
  vertical: {width: 1080, height: 1920, film: [0, 480, 1080, 810], crop: [1200, 900], header: [100, 285, 880, 185], captions: [120, 1298, 840, 162], captionSize: 54, maxWords: 4,
    // Filled: the film from under the title band to below the captions (they sit over its foot, on their dark pill),
    // 61% of the height; the crop a window the box's shape, the frame's whole height at its default width.
    fill: [0, 475, 1080, 1165]},
});
export const FORMAT_NAMES = Object.freeze(Object.keys(FORMATS));
const KEYS = ['format', 'header', 'captions', 'crop', 'background', 'ink', 'scale', 'fill', 'keep', 'ui'];
const CROP_KEY_KEYS = ['at', 'x', 'y', 'width', 'cut'], FOLLOW_KEY_KEYS = ['at', 'follow', 'width'];
const MOVE = .8;   // seconds a crop takes to move to its next key
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/** A format's sizes and default boxes ([x, y, w, h] in output pixels), as a copy. */
export function formatOf(name) {
  const f = FORMATS[name];
  if (!f) throw new Error(`layout.format must be ${FORMAT_NAMES.join(', ')}, not ${JSON.stringify(name)}`);
  return structuredClone(f);
}

/**
 * Compile a layout for a film. spec: {format, header?: {title, sub?, box?}, captions?: true | {maxWords?,
 * size?, box?}, crop?: [{at: beat, x, width?}], background?, ink?, scale?} → {width, height, format, boxes,
 * picture(ctx, t), overlay(ctx, t, {still?})}: picture draws the background and the film (what motion blur
 * may average); overlay draws the bands (a still — the poster — without a caption); boxes are where the film
 * and the bands are, in output pixels. scale (0.5–2, default 1) draws the same picture that many times the format's
 * size: 2 makes landscape 3840×2160 (4K), every line and word drawn sharp at that size; 0.5, a quick draft to look
 * at while editing (layout.mjs · formatScale).
 */
export function compileLayout(film, spec, span = {from: 0, to: film.total}) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error(`layout must be {format: ${FORMAT_NAMES.join(' | ')}, …}`);
  for (const key of Object.keys(spec)) if (!KEYS.includes(key)) throw new Error(`layout has unsupported key ${key} (the keys are ${KEYS.join(', ')})`);
  const f = filled(formatOf(spec.format), spec), k = formatScale(spec.format, spec.scale);
  const header = readHeader(spec.header, f, spec.format), captions = readCaptions(spec.captions, f);
  if (spec.crop !== undefined && !f.crop) throw new Error(`layout.crop: the ${spec.format} format shows the whole frame; a crop applies to portrait and vertical: leave crop out, or use one of those formats`);
  for (const key of ['background', 'ink']) if (spec[key] !== undefined && !(typeof spec[key] === 'string' && spec[key].trim())) throw new Error(`layout.${key} must be a colour (e.g. "#f3eee3")`);
  if (spec.keep !== undefined && !(f.crop && Array.isArray(spec.keep) && spec.keep.every(n => typeof n === 'string' && n.trim()))) throw new Error(f.crop ? 'layout.keep lists the named things (as the kits name them in their regions) the crop\'s edge never cuts: [] keeps none; left out, every speaker' : `layout.keep: the ${spec.format} format shows the whole frame, so nothing is cut at its edge: leave keep out`);
  const framing = f.crop ? framingOf(film, spec, f, span) : null, crop = framing?.keys ?? null;
  const chunks = captions ? captionChunks(spokenTracks(film), {maxWords: captions.maxWords}) : null;
  const palette = film.theme?.palette ?? {}, sans = film.theme?.type?.sans ?? SANS;
  const bg = spec.background ?? palette.bg ?? '#f3eee3', ink = spec.ink ?? palette.ink ?? '#23211c';
  const sized = b => b.map(v => v * k);   // the boxes in output pixels; the bands themselves are drawn in the format's
  const boxes = Object.freeze({film: sized(f.film), ...(header ? {header: sized(header.box)} : {}), ...(captions ? {captions: sized(captions.box)} : {})});
  // The app's UI over the picture, in the format's pixels: the bands are fitted clear of it (fitted once a title, once a chunk).
  const ui = spec.ui === undefined ? null : readUi(spec.ui), zones = ui ? zoneRects(ui.zones, f.width, f.height) : null;
  const fits = new Map(), captionKey = c => c.words.map(w => w.text).join('\u0001');
  let titleFitted;
  const titleFit = ctx => {
    if (!header) return null;
    if (titleFitted) return titleFitted;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    try { titleFitted = fitTitle(ctx, header, sans, zones, f.height); } finally { ctx.restore(); }
    return titleFitted;
  };
  const captionStyle = captions ? {size: captions.size, font: sans, zones, height: f.height} : null;
  const fitCaption = (ctx, caption) => {
    const key = captionKey(caption);
    if (!fits.has(key)) fits.set(key, captionFit(ctx, caption, captions.box, captionStyle));
    return fits.get(key);
  };
  return {
    width: f.width * k, height: f.height * k, format: spec.format, boxes,
    /** The bands' paper (the film's, unless the layout names a background): what an edit's pop covers the picture with. */
    paper: bg,
    /** The caption shown at t (null when none is, or the layout has no captions). */
    captionAt: t => chunks ? captionAt(chunks, t) : null,
    /** Every caption chunk it burns in, on the film clock (null without captions): a cached piece's key holds the ones near it. */
    captionChunks: chunks,
    /** The crop's keys on the film clock, [{t, x, width}] (null for a format that shows the whole frame): keyed the same way. */
    cropKeys: crop,
    /** How the crop was framed, when it follows or fills: the keys as used, the keys nudged so no kept thing is cut, the ones that could not be. */
    ...(framing?.record ? {framing: framing.record} : {}),
    picture(ctx, t) {
      ctx.save(); ctx.scale(k, k); ctx.fillStyle = bg; ctx.fillRect(0, 0, f.width, f.height);
      const [bx, by, bw, bh] = f.film;
      ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
      // A crop shows a window of the frame: the film is told which, so a label the viewer must see sits inside it.
      const window = crop ? cropWindow(crop, t, f.crop) : null;
      if (window) { const s = bw / window.w; ctx.translate(bx - window.x0 * s, by - window.y0 * s); ctx.scale(s, s); }
      else { ctx.translate(bx, by); ctx.scale(bw / 1600, bh / 900); }
      film.frame(ctx, t, window ? {window} : undefined);
      ctx.restore();
    },
    /**
     * The bands at t; a still (the poster, a thumbnail) takes the title band without a caption. `caption` given (an edit:
     * edit.mjs · captionInCut) is the one drawn instead of the one at t — null for none.
     */
    overlay(ctx, t, {still = false, ...given} = {}) {
      ctx.save(); ctx.scale(k, k);
      if (header) drawHeader(ctx, header, ink, sans, zones ? titleFit : null);
      if (chunks && !still) drawCaption(ctx, 'caption' in given ? given.caption : captionAt(chunks, t), captions.box, zones ? captionStyle : {size: captions.size, font: sans});
      ctx.restore();
    },
    /**
     * With `ui` only: the app's UI over the picture — {zones: [{name, basis?, rect}] in the format's pixels, covered,
     * faces} — and what the check reads (zones.mjs · uiFindings): the title band and a caption as drawn (fitted clear
     * of the zones; `covered` what is still under one), and a box on the 1600×900 frame at t in the format's pixels
     * (cut to the film's box: null when none of it shows).
     */
    ...(ui ? {
      ui: Object.freeze({zones, covered: ui.covered, faces: ui.faces}),
      titleFit,
      captionFit: (ctx, caption) => (captions ? fitCaption(ctx, caption) : {rects: [], fitted: false, covered: []}),
      toOutput: (t, box) => toOutput(f, crop, t, box),
    } : {}),
  };
}

/**
 * A box [x0, y0, x1, y1] on the 1600×900 frame at t, in the format's pixels as the picture draws it (through the crop's
 * window, or the whole frame scaled to the film's box), cut to the film's box; null when none of it shows there.
 */
function toOutput(f, crop, t, [x0, y0, x1, y1]) {
  const [bx, by, bw, bh] = f.film, window = crop ? cropWindow(crop, t, f.crop) : null;
  const sx = window ? bw / window.w : bw / 1600, sy = window ? bw / window.w : bh / 900, ox = window?.x0 ?? 0, oy = window?.y0 ?? 0;
  const r = [Math.max(bx, bx + (x0 - ox) * sx), Math.max(by, by + (y0 - oy) * sy), Math.min(bx + bw, bx + (x1 - ox) * sx), Math.min(by + bh, by + (y1 - oy) * sy)];
  return r[2] - r[0] > EDGE && r[3] - r[1] > EDGE ? r : null;
}

/**
 * A layout's scale, checked: 0.5 (a draft) to 2 (1, the format's size, by default), keeping the size whole and even (as video needs).
 * Returns the scale; refuses naming the sizes it would make.
 */
export function formatScale(format, scale) {
  const f = formatOf(format);
  if (scale === undefined) return 1;
  if (!(typeof scale === 'number' && scale >= .5 && scale <= 2 && Number.isInteger(f.width * scale / 2) && Number.isInteger(f.height * scale / 2)))
    throw new Error(`layout.scale must be 0.5–2 and keep the ${format} size whole and even (${f.width}×${f.height} at 1; 2 makes ${f.width * 2}×${f.height * 2}${format === 'landscape' ? ', 4K' : ''})`);
  return scale;
}

/** The size a draft's scale (2/3) makes of a format: "1280×720" for landscape — what a refusal of width/height beside a layout names. */
export const draftSize = format => { const f = formatOf(format); return `${f.width * 2 / 3}×${f.height * 2 / 3}`; };

/** The title band: {title, sub?, box?}, only where the format has one; false or left out for none. */
function readHeader(h, f, format) {
  if (h === undefined || h === false) return null;
  if (!h || typeof h !== 'object' || Array.isArray(h) || typeof h.title !== 'string' || !h.title.trim()) throw new Error('layout.header must be {title, sub?, box?} with words in the title, or false');
  for (const key of Object.keys(h)) if (!['title', 'sub', 'box'].includes(key)) throw new Error(`layout.header has unsupported key ${key} (a header is {title, sub?, box?})`);
  if (!f.header) throw new Error(`layout.header: the ${format} format has no title band (it shows the whole frame); leave the header out`);
  if (h.sub !== undefined && !(typeof h.sub === 'string' && h.sub.trim())) throw new Error('layout.header.sub must be words');
  return {title: h.title, sub: h.sub ?? null, box: readBox(h.box, f, 'layout.header.box') ?? f.header};
}

/** The captions: true, or {maxWords?, size?, box?}; false or left out for none. */
function readCaptions(c, f) {
  if (c === undefined || c === false) return null;
  if (c === true) return {maxWords: f.maxWords, size: f.captionSize, box: f.captions};
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error('layout.captions must be true or {maxWords?, size?, box?}');
  for (const key of Object.keys(c)) if (!['maxWords', 'size', 'box'].includes(key)) throw new Error(`layout.captions has unsupported key ${key} (captions take maxWords, size, box)`);
  if (c.size !== undefined && !(typeof c.size === 'number' && c.size >= 24 && c.size <= 120)) throw new Error('layout.captions.size must be 24–120 (pixels of the output)');
  return {maxWords: c.maxWords ?? f.maxWords, size: c.size ?? f.captionSize, box: readBox(c.box, f, 'layout.captions.box') ?? f.captions};
}

/** A band moved by the caller: [x, y, w, h] inside the output picture. */
function readBox(box, f, where) {
  if (box === undefined) return null;
  const ok = Array.isArray(box) && box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0
    && box[0] >= 0 && box[1] >= 0 && box[0] + box[2] <= f.width && box[1] + box[3] <= f.height;
  if (!ok) throw new Error(`${where} must be [x, y, width, height] inside the ${f.width}×${f.height} picture`);
  return box;
}

/** The format filled (layout.fill: the film box from under the title band to below the captions), or as it is. */
function filled(f, spec) {
  if (spec.fill === undefined || spec.fill === false) return f;
  if (spec.fill !== true) throw new Error('layout.fill is true (the film fills the picture from under the title band to below the captions) or left out');
  if (!f.fill) throw new Error(`layout.fill: the ${spec.format} format has no filled picture; leave fill out, or use the vertical format`);
  const [, , bw, bh] = f.fill;
  return {...f, film: f.fill, crop: [900 * bw / bh, 900], filled: true};
}

/** A key's time: a beat (a phrase that is said), or seconds on the film clock. */
const keyTime = (film, at, where) => {
  if (typeof at === 'number') { if (!(at >= 0 && at <= film.total)) throw new Error(`${where}.at is ${at} s, outside the film: give a time from 0 to ${film.total.toFixed(2)} s`); return at; }
  return film.clock.at(at);
};

/**
 * Crop keys on the film clock: [{t, x, width}] in spoken order; x a centre on the 1600-wide frame, width the crop's
 * (default: the format's); y (a centre on the 900-high frame) and jump (cut: true, or a scene cut in a filled picture)
 * only where given. `{at, follow: 'focus', width?}` (or crop: 'focus') follows the film from there (follow.mjs) until
 * the next key; such keys, and every key of a filled picture, are kept off the kept things' edges (keepWhole).
 */
function framingOf(film, spec, f, span) {
  const given = spec.crop === 'focus' ? [{at: span.from, follow: 'focus'}] : spec.crop ?? [];
  const [cw] = f.crop;
  if (!Array.isArray(given)) throw new Error("layout.crop must be a list of {at: beat, x, y?, width?, cut?} (or {at, follow: 'focus', width?}), or 'focus'");
  const out = given.map((k, i) => {
    if (!k || typeof k !== 'object' || Array.isArray(k)) throw new Error(`layout.crop[${i}] must be {at: beat, x, width?}`);
    const follows = k.follow !== undefined;
    for (const key of Object.keys(k)) if (!(follows ? FOLLOW_KEY_KEYS : CROP_KEY_KEYS).includes(key)) throw new Error(`layout.crop[${i}] has unsupported key ${key} (a crop key is {at, x, y?, width?, cut?}, or {at, follow, width?})`);
    if (k.width !== undefined && !(typeof k.width === 'number' && k.width >= 400 && k.width <= 1600)) throw new Error(`layout.crop[${i}].width must be 400–1600 (how much of the frame's width the crop shows; ${Math.round(cw)} is the format's)`);
    if (follows) {
      if (!Object.hasOwn(FOLLOW, k.follow)) throw new Error(`layout.crop[${i}].follow is ${Object.keys(FOLLOW).map(n => `'${n}'`).join(', ')} (the crop follows what the film looks at), not ${JSON.stringify(k.follow)}`);
      return {t: keyTime(film, k.at, `layout.crop[${i}]`), follow: k.follow, width: k.width ?? cw};
    }
    if (!(typeof k.x === 'number' && k.x >= 0 && k.x <= 1600)) throw new Error(`layout.crop[${i}].x must be a centre on the 1600-wide frame (0–1600)`);
    if (k.y !== undefined && !(typeof k.y === 'number' && k.y >= 0 && k.y <= 900)) throw new Error(`layout.crop[${i}].y must be a centre on the 900-high frame (0–900)`);
    if (k.cut !== undefined && typeof k.cut !== 'boolean') throw new Error(`layout.crop[${i}].cut is true (the window jumps there, at a cut in the picture) or left out`);
    return {t: keyTime(film, k.at, `layout.crop[${i}]`), x: k.x, width: k.width ?? cw, ...(k.y !== undefined ? {y: k.y} : {}), ...(k.cut ? {jump: true} : {}), given: true};
  });
  out.forEach((k, i) => { if (i && k.t < out[i - 1].t) throw new Error(`layout.crop[${i}] comes before the key above it; list crop keys in the order they are spoken`); });
  const follows = out.some(k => k.follow), keep = spec.keep ?? filmSpeakers(film);
  if (!follows && !f.filled && spec.keep === undefined) return {keys: out.map(({given: _, ...k}) => k)};   // as it always was
  // A filled picture (or a crop kept off its people) with no key at its start opens centred, as any crop does, on a key
  // of its own, so that window too is kept off a kept thing.
  const opened = (f.filled || spec.keep !== undefined) && !out.some(k => k.t <= span.from + 1e-6) ? [{t: span.from, x: 800, width: cw, jump: true}, ...out] : out;
  const why = {}, expanded = opened.flatMap((k, i) => {
    if (!k.follow) return [k];
    const from = Math.max(k.t, span.from), to = Math.min(opened[i + 1]?.t ?? Infinity, span.to);
    if (!(to > from)) return [];
    const made = FOLLOW[k.follow](film, {from, to, crop: f.crop, width: k.width});
    for (const [n, c] of Object.entries(made.why ?? {})) why[n] = (why[n] ?? 0) + c;
    return made.keys;
  });
  // In a filled picture, and wherever the crop follows, a move never runs across a scene cut: a key whose move a cut
  // would fall inside jumps there at the cut instead — the keys written and the keys the film's focus made alike.
  const keys = f.filled || follows ? expanded.map((k, i) => {
    const cut = k.jump ? undefined : film.clock.offsets.find(s => s > k.t + 1e-6 && s < k.t + MOVE - 1e-6 && s < (expanded[i + 1]?.t ?? Infinity) - 1e-6);
    return cut === undefined ? k : {...k, t: cut, jump: true};
  }) : expanded;
  const kept = keepWhole(film, keys, {crop: f.crop, keep, until: span.to});
  const round = v => +v.toFixed(2);
  kept.keys = kept.keys.map(({given: _, ...k}) => k);
  return {keys: kept.keys, record: {...(follows ? {follow: why} : {}), keep, keys: kept.keys.map(k => ({t: round(k.t), x: round(k.x), ...(k.y !== undefined ? {y: round(k.y)} : {}), width: round(k.width), ...(k.jump ? {jump: true} : {})})),
    nudged: kept.nudged, clipped: kept.clipped}};
}

/**
 * The crop window at t on the frame, {x0, y0, w, h}: its centre and width eased from key to key, its
 * height in the format's proportion, kept inside the frame's width. A window taller than the frame
 * (a wide crop in a tall format) shows the whole height, with the paper above and below.
 */
export function cropWindow(keys, t, [cw, ch]) {
  let x = 800, w = cw, y = 450, vertical = false;
  for (const k of keys) {
    if (t < k.t) break;
    const u = k.jump ? 1 : inOut((t - k.t) / MOVE);
    x += (k.x - x) * u; w += ((k.width ?? cw) - w) * u;
    if (k.y !== undefined) { vertical = true; y += (k.y - y) * u; }
  }
  const h = w * ch / cw;
  // Up and down only when a key says where (y): a window shorter than the frame, kept inside it; else centred.
  const y0 = vertical && h < 900 ? Math.max(0, Math.min(900 - h, y - h / 2)) : 450 - h / 2;
  return {x0: Math.max(0, Math.min(1600 - w, x - w / 2)), y0, w, h};
}

/** Words wrapped greedily into lines no wider than `width` (a word wider than that has a line to itself). */
function wrap(ctx, words, width) {
  const out = [''];
  for (const word of words) { const next = out.at(-1) ? `${out.at(-1)} ${word}` : word; if (ctx.measureText(next).width > width && out.at(-1)) out.push(word); else out[out.length - 1] = next; }
  return out;
}
/** Wrapped, then balanced: the narrowest width that keeps the same number of lines, so no line ends with a word alone. */
function balancedLines(ctx, text, width) {
  const words = text.split(/\s+/).filter(Boolean), lines = wrap(ctx, words, width);
  if (lines.length < 2) return lines;
  let lo = 0, hi = width;
  for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (wrap(ctx, words, mid).length > lines.length) lo = mid; else hi = mid; }
  return wrap(ctx, words, hi);
}

/**
 * The title band: the title, bold, wrapped into balanced lines that fit its box, and a smaller line under it. `fit`
 * (with the app's UI: the compiled layout's titleFit) places it clear of the zones; left out, it is placed as always.
 */
function drawHeader(ctx, header, ink, sans, fit = null) {
  ctx.save(); ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const placed = fit ? fit(ctx).placed : titleLines(ctx, header, sans);
  ctx.font = placed.font;
  for (const line of placed.lines) ctx.fillText(line.text, placed.x, line.cy);
  if (placed.sub) { ctx.font = subFont(sans); ctx.globalAlpha *= .7; ctx.fillText(placed.sub.text, placed.x, placed.sub.cy); }
  ctx.restore();
}
const subFont = sans => `600 32px ${sans}`;

/**
 * The title band laid out in its box (ctx centred, middle baseline): the largest size (64 down to 34) whose balanced
 * lines fit, {font, x: the centre, lines: [{text, cy}], sub: {text, cy} | null}.
 */
function titleLines(ctx, {title, sub, box: [x, y, w, h]}, sans) {
  let size = 64; const font = s => `800 ${s}px ${sans}`;
  const lines = text => balancedLines(ctx, text, w);
  ctx.font = font(size); let wrapped = lines(title);
  while (size > 34 && wrapped.length * size * 1.15 + (sub ? 44 : 0) > h) { size -= 4; ctx.font = font(size); wrapped = lines(title); }
  const total = wrapped.length * size * 1.15 + (sub ? 44 : 0); let cy = y + h / 2 - total / 2 + size * .55;
  const placed = wrapped.map(text => { const at = cy; cy += size * 1.15; return {text, cy: at}; });
  return {font: font(size), x: x + w / 2, lines: placed, sub: sub ? {text: sub, cy: cy + 6} : null};
}

/** What a placed title draws: each line's ink, and the line under it, as [x0, y0, x1, y1] (measured with its own font). */
function titleRects(ctx, placed, sans) {
  const ink = (text, font, cy) => {
    ctx.font = font; const m = ctx.measureText(text), half = m.width / 2;
    const left = Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : half, right = Number.isFinite(m.actualBoundingBoxRight) ? m.actualBoundingBoxRight : half;
    const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)[1]), up = Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : size * .5, down = Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : size * .5;
    return [placed.x - left, cy - up, placed.x + right, cy + down];
  };
  return [...placed.lines.map(l => ink(l.text, placed.font, l.cy)), ...(placed.sub ? [ink(placed.sub.text, subFont(sans), placed.sub.cy)] : [])];
}

/** The title band placed clear of the zones (zones.mjs · fitBlock): {placed, fitted, covered}; with no zones, as always. */
function fitTitle(ctx, header, sans, zones, height) {
  const [x, y, w, h] = header.box;
  const place = ([x0, x1], dy) => { const p = titleLines(ctx, {...header, box: [x0, y + dy, x1 - x0, h]}, sans); return {...p, rects: titleRects(ctx, p, sans)}; };
  return zones?.length ? fitBlock(place, [x, x + w], zones, {height}) : {placed: place([x, x + w], 0), fitted: false, covered: []};
}
