/**
 * Whether a word can be read against what is behind it: its contrast ratio, as WCAG measures it (relative luminance,
 * (lighter + 0.05) / (darker + 0.05)), read from the very pixels the frame drew. A word is measured where the review
 * reads it (review.mjs): its box on the finished frame, the ground around it, and its ink inside it.
 *
 *   the ground  the median luminance of a ring just outside the word's box (a card, a band, the picture behind it)
 *   the ink     the pixel inside the box that is furthest from the ground, at the 95th percentile (one stray pixel
 *               never decides; a thin stroke's anti-aliased edge is the other 5 %)
 *
 * WCAG asks 4.5:1 of text, 3:1 of large text (18 pt, about 24 px at 1080). Large here: a word whose box is at least
 * CONTRAST.large of the frame's height tall (the box is the word's own ink: a cap height, about 0.7 of the type size).
 * Only a word fully drawn is measured (alpha 1): a word fading in is on its way, not read yet. A word is judged by its
 * best moment over the part (faintWords), so one written on stroke by stroke is read once it is whole.
 *
 *   wordContrast(data, width, height, box) → {ratio, ink, ground, large} | null (a box too small, or off the frame)
 */

/** The thresholds: the ratios WCAG asks, and what counts as large (a box's height, a share of the frame's). */
export const CONTRAST = Object.freeze({normal: 4.5, large: 3, largeHeight: .016, ring: .3, inkPercentile: .95, seen: 1.1});

/** WCAG relative luminance of an sRGB colour (0–255 channels): 0 black, 1 white. */
export function luminance(r, g, b) {
  const lin = c => { const s = c / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; };
  return .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b);
}

/** The contrast ratio of two luminances: 1 (the same) to 21 (black on white). */
export const contrastRatio = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);

/**
 * A word's contrast on the frame: `data` the frame's RGBA bytes (`width` × `height`), `box` [x0, y0, x1, y1] in its
 * pixels. Returns {ratio, ink, ground, large} (the luminances, and whether the word is large), or null when the box is
 * under 3 px tall or wide, or leaves no ring on the frame to read the ground from.
 */
/**
 * The pixels a word's contrast reads: the word's box and the ring around it, held to the frame: {x, y, w, h, x0…ry1}, or
 * null when the word is too small to read. A review asks for only these: a frame's worth of pixels for each moment it
 * reads is memory the garbage collector does not see.
 */
export function wordArea(box, width, height, thresholds = CONTRAST) {
  const [x0, y0, x1, y1] = [Math.max(0, Math.floor(box[0])), Math.max(0, Math.floor(box[1])), Math.min(width, Math.ceil(box[2])), Math.min(height, Math.ceil(box[3]))];
  if (x1 - x0 < 3 || y1 - y0 < 3) return null;
  const pad = Math.max(2, Math.round((y1 - y0) * thresholds.ring));
  const [rx0, ry0, rx1, ry1] = [Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(width, x1 + pad), Math.min(height, y1 + pad)];
  return {x: rx0, y: ry0, w: rx1 - rx0, h: ry1 - ry0, x0, y0, x1, y1, rx0, ry0, rx1, ry1};
}

export function wordContrast(data, width, height, box, thresholds = CONTRAST, area = null) {
  const near = wordArea(box, width, height, thresholds);
  if (!near) return null;
  const {x0, y0, x1, y1, rx0, ry0, rx1, ry1} = near;
  // `data` is the whole frame, or only the part `area` names (wordArea): the same pixels either way.
  const stride = area ? area.w : width, left = area ? area.x : 0, top = area ? area.y : 0;
  const at = (x, y) => { const k = ((y - top) * stride + x - left) * 4; return luminance(data[k], data[k + 1], data[k + 2]); };
  const ring = [], inside = [];
  for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) (x >= x0 && x < x1 && y >= y0 && y < y1 ? inside : ring).push(at(x, y));
  if (ring.length < 8) return null;
  ring.sort((a, b) => a - b);
  const ground = ring[Math.floor(ring.length / 2)];
  const far = inside.map(l => [Math.abs(l - ground), l]).sort((a, b) => a[0] - b[0]);
  const ink = far[Math.min(far.length - 1, Math.floor(far.length * thresholds.inkPercentile))][1];
  return {ratio: +contrastRatio(ink, ground).toFixed(2), ink: +ink.toFixed(4), ground: +ground.toFixed(4), large: (y1 - y0) >= thresholds.largeHeight * height};
}

/**
 * The words too faint to read, from every sample's measurements ([{t, contrasts: [{text, box, ratio, needs, large}]}]):
 * a word (its text, where it stands) is judged by its BEST moment — a word written on, typed or wiped in is read once it
 * is all there — and one never seen (its best under CONTRAST.seen: no ink at all, as text clipped away or not revealed
 * yet) is not read, only counted. Returns {words, unseen, low: [{text, box, ratio, needs, large, t}], closest}, low at
 * their best moment; closest the word read nearest its threshold (the smallest ratio / needs), passing or not — what a
 * pass stood on — or null when no word was seen.
 */
export function faintWords(samples, thresholds = CONTRAST) {
  const best = new Map();
  for (const x of samples) for (const c of x.contrasts ?? []) {
    const key = `${c.text}\u0000${c.box.map(v => Math.round(v / 4)).join(',')}`, was = best.get(key);
    if (!was || c.ratio > was.ratio) best.set(key, {...c, t: x.t});
  }
  const all = [...best.values()], seen = all.filter(w => w.ratio >= thresholds.seen);
  const closest = seen.reduce((m, w) => (m === null || w.ratio / w.needs < m.ratio / m.needs ? w : m), null);
  return {words: seen.length, unseen: all.length - seen.length, low: seen.filter(w => w.ratio < w.needs).sort((a, b) => a.t - b.t), closest};
}

/** The ratio a word needs: 3 when large, else 4.5. */
export const needs = (c, thresholds = CONTRAST) => (c.large ? thresholds.large : thresholds.normal);

/** Words too faint to read: the verdict. */
export const CONTRAST_VERDICT = Object.freeze({
  rules: Object.freeze([
    Object.freeze({when: Object.freeze({words: Object.freeze({eq: 0})}), then: 'not run', label: 'no word fully drawn and seen on the frame could be measured'}),
    Object.freeze({when: Object.freeze({low: Object.freeze({gt: 0})}), then: 'failed', label: 'a word is read at less than 4.5:1 against what is behind it (3:1 when large): too faint to read'}),
  ]),
  passed: 'every word read stands at least 4.5:1 against what is behind it (3:1 when large)',
});

/** A faint word as a finding's words. */
export const contrastText = w => `"${w.text}" stands ${w.ratio}:1 against what is behind it (it needs ${w.needs}:1${w.large ? ', large' : ''}): darken or lighten the word, or put a band behind it`;
