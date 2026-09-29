/**
 * A contact sheet: stills of a film on one image, so a whole film can be checked at a glance —
 * each picture once it has settled, AND each change of picture half way through, where a muddy
 * double exposure, a collision or text mid-flight shows up. Every still is labelled with its time.
 */
import {createCanvas} from '@napi-rs/canvas';

const clockText = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/**
 * @param film     from compileFilm
 * @param moments  [{t, label}] (default: film.moments() — settled pictures and mid-changes)
 * @param columns  stills per row (default 4) · width: the sheet's width in pixels (default 1600)
 * @returns a PNG Buffer
 */
export async function contactSheet(film, {moments = film.moments(), columns = 4, width = 1600} = {}) {
  const pad = 12, label = 26, w = Math.floor((width - pad * (columns + 1)) / columns), h = Math.round(w * 9 / 16);
  const rows = Math.max(1, Math.ceil(moments.length / columns)), sheet = createCanvas(width, pad + rows * (h + label + pad)), c = sheet.getContext('2d');
  c.fillStyle = '#20232a'; c.fillRect(0, 0, sheet.width, sheet.height);
  moments.forEach((m, i) => {
    const x = pad + (i % columns) * (w + pad), y = pad + Math.floor(i / columns) * (h + label + pad);
    c.save(); c.translate(x, y); c.beginPath(); c.rect(0, 0, w, h); c.clip(); c.scale(w / 1600, w / 1600); film.frame(c, m.t); c.restore();
    c.fillStyle = m.kind === 'moving' ? '#f5b400' : '#c9cdd4'; c.font = '600 13px Menlo'; c.textBaseline = 'middle';
    c.fillText(`${clockText(m.t)}  ${m.label}`.slice(0, Math.floor(w / 8)), x, y + h + label / 2);
  });
  return sheet.encode('png');
}
