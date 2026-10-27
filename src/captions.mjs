/**
 * Captions: most people watch a post with the sound off. They are built from the word timings the film
 * already has (the voice's forced alignment, or even timings in a silent cut), so they say exactly what
 * is spoken, when it is spoken. A silent scene's directions are never captioned (they are not spoken).
 *
 * Two uses, one set of chunks — footprint-narration's (captionChunks over the film's spoken tracks):
 *   burned in  — short chunks (a few words, broken after punctuation), the word being said highlighted
 *                (layout.mjs draws them through drawCaption)
 *   a file     — WebVTT or SRT beside the video (footprint-narration · captionFile), for players that show their
 *                own captions (YouTube, LinkedIn and X take a file): longer cues, broken at sentences, two lines at most
 */
import {fitBlock} from './zones.mjs';

/**
 * The film's speech as tracks, for footprint-narration's captionChunks: each spoken scene at its offset on the film
 * clock, its words as shown (number slots in digits: clock.mjs · makeClock · shownWords). A silent scene is not
 * spoken, so it has no track.
 */
export function spokenTracks(film) {
  return film.timings.scenes.flatMap((scene, i) => (scene.alignment?.method === 'directions' ? []
    : [{offset: film.clock.offsets[i], duration: scene.duration, words: film.clock.shownWords ? film.clock.shownWords(i) : scene.words ?? []}]));
}

const CAPTION_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * Draw a caption centred in box [x, y, w, h] (output pixels): bold words on a soft dark pill, the word
 * being said in the accent colour. Long chunks wrap onto a second line. `zones` (zones.mjs · zoneRects: where the
 * app draws over the video, in the same pixels) lays it out clear of them (captionFit); left out, it is drawn as always.
 */
export function drawCaption(ctx, caption, box, {size = 54, font = CAPTION_FONT, ink = '#ffffff', accent = '#ffd34d', pill = 'rgba(20, 22, 30, .82)', zones = null, height = Infinity} = {}) {
  if (!caption) return;
  ctx.save();
  ctx.font = `800 ${size}px ${font}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const {lines, widths, space, lineH} = zones?.length ? fitCaptionLines(ctx, caption, box, size, zones, height).placed : captionLines(ctx, caption, box, size);
  for (const {line, x: x0, cy, lw} of lines) {
    let cx = x0;
    ctx.fillStyle = pill; ctx.beginPath(); ctx.roundRect(cx - size * .35, cy - lineH / 2, lw + size * .7, lineH, lineH * .3); ctx.fill();
    for (const i of line) { ctx.fillStyle = i === caption.active ? accent : ink; ctx.fillText(caption.words[i].text, cx, cy + 1); cx += widths[i] + space; }
  }
  ctx.restore();
}

/**
 * A caption laid out in box [x, y, w, h] (ctx's font already set): greedy-wrapped into lines that fit the box, centred
 * in it — `balance` (a caption the fitting narrowed): at the narrowest width that keeps as many lines, so no word is left
 * alone on the last. {lines: [{line: word indexes, x: where its first word starts, cy, lw: its width}], rects: each
 * line's pill [x0, y0, x1, y1], widths, space, lineH}.
 */
function captionLines(ctx, caption, [x, y, w, h], size, {balance = false} = {}) {
  const space = ctx.measureText(' ').width, widths = caption.words.map(word => ctx.measureText(word.text).width);
  // Greedy wrap into lines no wider than `limit`.
  const wrapAt = limit => {
    const out = [[]]; let lineWidth = 0;
    caption.words.forEach((_, i) => {
      const add = (out.at(-1).length ? space : 0) + widths[i];
      if (out.at(-1).length && lineWidth + add > limit) { out.push([]); lineWidth = 0; }
      lineWidth += (out.at(-1).length ? space : 0) + widths[i]; out.at(-1).push(i);
    });
    return out;
  };
  let lines = wrapAt(w - size);
  if (balance && lines.length > 1) {
    let lo = 0, hi = w - size;
    for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (wrapAt(mid).length > lines.length) lo = mid; else hi = mid; }
    lines = wrapAt(hi);
  }
  const lineH = size * 1.25, top = y + h / 2 - (lines.length * lineH) / 2;
  const placed = lines.map((line, n) => {
    const lw = line.reduce((s, i, k) => s + widths[i] + (k ? space : 0), 0);
    return {line, x: x + w / 2 - lw / 2, cy: top + lineH * (n + .5), lw};
  });
  return {lines: placed, rects: placed.map(l => [l.x - size * .35, l.cy - lineH / 2, l.x + l.lw + size * .35, l.cy + lineH / 2]), widths, space, lineH};
}

/**
 * The caption laid out clear of the zones (zones.mjs · fitBlock): moved out of a band, or narrowed off a column — wrapped
 * balanced, at most two lines, inside its box's rows — else left as it is for the check to report.
 */
function fitCaptionLines(ctx, caption, [x, y, w, h], size, zones, height) {
  return fitBlock(([x0, x1], dy) => captionLines(ctx, caption, [x0, y + dy, x1 - x0, h], size, {balance: x1 - x0 < w - .5}), [x, x + w], zones, {height, rows: [y, y + h]});
}

/**
 * Where a caption is drawn in box [x, y, w, h] with these zones over the picture (`height` tall): {rects, fitted,
 * covered} — each line's pill, whether the fitting moved or narrowed it, and what is still under a zone
 * ([{rect, zone, overlap}]). What the check reads (zones.mjs · uiFindings); nothing is drawn.
 */
export function captionFit(ctx, caption, box, {size = 54, font = CAPTION_FONT, zones = [], height = Infinity} = {}) {
  ctx.save(); ctx.font = `800 ${size}px ${font}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  try {
    const fit = zones.length ? fitCaptionLines(ctx, caption, box, size, zones, height) : {placed: captionLines(ctx, caption, box, size), fitted: false, covered: []};
    return {rects: fit.placed.rects, fitted: fit.fitted, covered: fit.covered};
  } finally { ctx.restore(); }
}
