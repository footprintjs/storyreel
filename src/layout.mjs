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
 */
import {captionChunks, captionAt, drawCaption} from './captions.mjs';
import {inOut} from './ease.mjs';

const FORMATS = Object.freeze({
  landscape: {width: 1920, height: 1080, film: [0, 0, 1920, 1080], crop: null, header: null, captions: [160, 860, 1600, 160], captionSize: 52, maxWords: 7},
  square: {width: 1080, height: 1080, film: [0, 236, 1080, 608], crop: null, header: [60, 36, 960, 180], captions: [120, 852, 840, 180], captionSize: 50, maxWords: 5},
  portrait: {width: 1080, height: 1350, film: [0, 240, 1080, 810], crop: [1200, 900], header: [60, 40, 960, 180], captions: [120, 1060, 840, 150], captionSize: 50, maxWords: 5},
  vertical: {width: 1080, height: 1920, film: [0, 480, 1080, 810], crop: [1200, 900], header: [100, 285, 880, 185], captions: [120, 1298, 840, 162], captionSize: 54, maxWords: 4},
});
export const FORMAT_NAMES = Object.freeze(Object.keys(FORMATS));
const KEYS = ['format', 'header', 'captions', 'crop', 'background', 'ink', 'scale'];
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
export function compileLayout(film, spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error(`layout must be {format: ${FORMAT_NAMES.join(' | ')}, …}`);
  for (const key of Object.keys(spec)) if (!KEYS.includes(key)) throw new Error(`layout has unsupported key ${key} (the keys are ${KEYS.join(', ')})`);
  const f = formatOf(spec.format), k = formatScale(spec.format, spec.scale);
  const header = readHeader(spec.header, f, spec.format), captions = readCaptions(spec.captions, f);
  if (spec.crop !== undefined && !f.crop) throw new Error(`layout.crop: the ${spec.format} format shows the whole frame; a crop applies to portrait and vertical`);
  for (const key of ['background', 'ink']) if (spec[key] !== undefined && !(typeof spec[key] === 'string' && spec[key].trim())) throw new Error(`layout.${key} must be a colour (e.g. "#f3eee3")`);
  const crop = f.crop ? cropKeys(film, spec.crop ?? [], f.crop) : null;
  const chunks = captions ? captionChunks(film, {maxWords: captions.maxWords}) : null;
  const palette = film.theme?.palette ?? {}, sans = film.theme?.type?.sans ?? SANS;
  const bg = spec.background ?? palette.bg ?? '#f3eee3', ink = spec.ink ?? palette.ink ?? '#23211c';
  const sized = b => b.map(v => v * k);   // the boxes in output pixels; the bands themselves are drawn in the format's
  const boxes = Object.freeze({film: sized(f.film), ...(header ? {header: sized(header.box)} : {}), ...(captions ? {captions: sized(captions.box)} : {})});
  return {
    width: f.width * k, height: f.height * k, format: spec.format, boxes,
    picture(ctx, t) {
      ctx.save(); ctx.scale(k, k); ctx.fillStyle = bg; ctx.fillRect(0, 0, f.width, f.height);
      const [bx, by, bw, bh] = f.film;
      ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
      if (crop) {
        const {x0, y0, w} = cropWindow(crop, t, f.crop), s = bw / w;
        ctx.translate(bx - x0 * s, by - y0 * s); ctx.scale(s, s);
      } else { ctx.translate(bx, by); ctx.scale(bw / 1600, bh / 900); }
      film.frame(ctx, t);
      ctx.restore();
    },
    /** The bands at t; a still (the poster, a thumbnail) takes the title band without a caption. */
    overlay(ctx, t, {still = false} = {}) {
      ctx.save(); ctx.scale(k, k);
      if (header) drawHeader(ctx, header, ink, sans);
      if (chunks && !still) drawCaption(ctx, captionAt(chunks, t), captions.box, {size: captions.size, font: sans});
      ctx.restore();
    },
  };
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

/** Crop keys on the film clock: [{t, x, width}] in spoken order; x a centre on the 1600-wide frame, width the crop's (default: the format's). */
function cropKeys(film, keys, [cw]) {
  if (!Array.isArray(keys)) throw new Error('layout.crop must be a list of {at: beat, x, width?}');
  const out = keys.map((k, i) => {
    if (!k || typeof k !== 'object' || Array.isArray(k)) throw new Error(`layout.crop[${i}] must be {at: beat, x, width?}`);
    for (const key of Object.keys(k)) if (!['at', 'x', 'width'].includes(key)) throw new Error(`layout.crop[${i}] has unsupported key ${key} (a crop key is {at, x, width?})`);
    if (!(typeof k.x === 'number' && k.x >= 0 && k.x <= 1600)) throw new Error(`layout.crop[${i}].x must be a centre on the 1600-wide frame (0–1600)`);
    if (k.width !== undefined && !(typeof k.width === 'number' && k.width >= 400 && k.width <= 1600)) throw new Error(`layout.crop[${i}].width must be 400–1600 (how much of the frame's width the crop shows; ${cw} is the format's)`);
    return {t: film.clock.at(k.at), x: k.x, width: k.width ?? cw};
  });
  out.forEach((k, i) => { if (i && k.t < out[i - 1].t) throw new Error(`layout.crop[${i}] comes before the key above it; list crop keys in the order they are spoken`); });
  return out;
}

/**
 * The crop window at t on the frame, {x0, y0, w, h}: its centre and width eased from key to key, its
 * height in the format's proportion, kept inside the frame's width. A window taller than the frame
 * (a wide crop in a tall format) shows the whole height, with the paper above and below.
 */
export function cropWindow(keys, t, [cw, ch]) {
  let x = 800, w = cw;
  for (const k of keys) { if (t < k.t) break; const u = inOut((t - k.t) / MOVE); x += (k.x - x) * u; w += ((k.width ?? cw) - w) * u; }
  const h = w * ch / cw;
  return {x0: Math.max(0, Math.min(1600 - w, x - w / 2)), y0: 450 - h / 2, w, h};
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

/** The title band: the title, bold, wrapped into balanced lines that fit its box, and a smaller line under it. */
function drawHeader(ctx, {title, sub, box: [x, y, w, h]}, ink, sans) {
  ctx.save(); ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = 64; const font = s => `800 ${s}px ${sans}`;
  const lines = text => balancedLines(ctx, text, w);
  ctx.font = font(size); let wrapped = lines(title);
  while (size > 34 && wrapped.length * size * 1.15 + (sub ? 44 : 0) > h) { size -= 4; ctx.font = font(size); wrapped = lines(title); }
  const total = wrapped.length * size * 1.15 + (sub ? 44 : 0); let cy = y + h / 2 - total / 2 + size * .55;
  for (const line of wrapped) { ctx.fillText(line, x + w / 2, cy); cy += size * 1.15; }
  if (sub) { ctx.font = `600 32px ${sans}`; ctx.globalAlpha *= .7; ctx.fillText(sub, x + w / 2, cy + 6); }
  ctx.restore();
}
