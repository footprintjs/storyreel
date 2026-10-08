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

/**
 * The film's speech as tracks, for footprint-narration's captionChunks: each spoken scene at its offset on the film
 * clock, its words as shown (number slots in digits: clock.mjs · makeClock · shownWords). A silent scene is not
 * spoken, so it has no track.
 */
export function spokenTracks(film) {
  return film.timings.scenes.flatMap((scene, i) => (scene.alignment?.method === 'directions' ? []
    : [{offset: film.clock.offsets[i], duration: scene.duration, words: film.clock.shownWords ? film.clock.shownWords(i) : scene.words ?? []}]));
}

/**
 * Draw a caption centred in box [x, y, w, h] (output pixels): bold words on a soft dark pill, the word
 * being said in the accent colour. Long chunks wrap onto a second line.
 */
export function drawCaption(ctx, caption, [x, y, w, h], {size = 54, font = '"Helvetica Neue", Helvetica, Arial, sans-serif', ink = '#ffffff', accent = '#ffd34d', pill = 'rgba(20, 22, 30, .82)'} = {}) {
  if (!caption) return;
  ctx.save();
  ctx.font = `800 ${size}px ${font}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const space = ctx.measureText(' ').width, widths = caption.words.map(word => ctx.measureText(word.text).width);
  // Greedy wrap into lines that fit the box.
  const lines = [[]]; let lineWidth = 0;
  caption.words.forEach((_, i) => {
    const add = (lines.at(-1).length ? space : 0) + widths[i];
    if (lines.at(-1).length && lineWidth + add > w - size) { lines.push([]); lineWidth = 0; }
    lineWidth += (lines.at(-1).length ? space : 0) + widths[i]; lines.at(-1).push(i);
  });
  const lineH = size * 1.25, top = y + h / 2 - (lines.length * lineH) / 2;
  lines.forEach((line, n) => {
    const lw = line.reduce((s, i, k) => s + widths[i] + (k ? space : 0), 0), cy = top + lineH * (n + .5);
    let cx = x + w / 2 - lw / 2;
    ctx.fillStyle = pill; ctx.beginPath(); ctx.roundRect(cx - size * .35, cy - lineH / 2, lw + size * .7, lineH, lineH * .3); ctx.fill();
    for (const i of line) { ctx.fillStyle = i === caption.active ? accent : ink; ctx.fillText(caption.words[i].text, cx, cy + 1); cx += widths[i] + space; }
  });
  ctx.restore();
}
