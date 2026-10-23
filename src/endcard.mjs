/**
 * The end card of an edit (edit.mjs): a card after the last cut that says where the whole story is ("Watch the whole
 * story", then its name). Drawn in the film's theme — its paper behind, a panel with the theme's edge, the first line
 * the biggest in its ink, the second in its accent, any others smaller and dimmer, in its display and sans type — inside
 * `box` (the layout's film box: the title band above stays). Pure: the same card every time, for any moment of it.
 */

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const DEFAULTS = {bg: '#f3eee3', panel: '#fffaf0', edge: '#d8cfbd', ink: '#23211c', accent: '#c4553f', dim: '#6b665c'};

/** Words wrapped greedily into lines no wider than `width` (a word wider than that has a line to itself). */
function wrap(ctx, text, width) {
  const out = [''];
  for (const word of text.split(/\s+/).filter(Boolean)) { const next = out.at(-1) ? `${out.at(-1)} ${word}` : word; if (ctx.measureText(next).width > width && out.at(-1)) out.push(word); else out[out.length - 1] = next; }
  return out;
}

/**
 * The card into ctx (output pixels): `lines` (1–4 texts), `box` [x, y, w, h] where it sits, `theme` the film's
 * ({palette, type}), `width`/`height` the whole picture (its paper is filled first). Leaves ctx as it found it.
 */
export function drawEndCard(ctx, {lines, box, width, height, theme}) {
  const p = {...DEFAULTS, ...(theme?.palette ?? {})}, sans = theme?.type?.sans ?? SANS, display = theme?.type?.display ?? sans;
  const [bx, by, bw, bh] = box, pad = bw * .08, card = [bx + pad, by + bh * .12, bw - 2 * pad, bh * .76], inner = card[2] - bw * .1;
  ctx.save(); ctx.resetTransform(); ctx.globalAlpha = 1;
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, width, height);
  ctx.save(); ctx.shadowColor = 'rgba(0, 0, 0, .14)'; ctx.shadowBlur = bw * .03; ctx.shadowOffsetY = bw * .008;
  ctx.beginPath(); ctx.roundRect(...card, bw * .045); ctx.fillStyle = p.panel; ctx.fill(); ctx.restore();
  ctx.lineWidth = Math.max(2, bw * .006); ctx.strokeStyle = p.edge; ctx.beginPath(); ctx.roundRect(...card, bw * .045); ctx.stroke();
  // Each line its size and colour by its place: the call to watch, the story's name, then who made it.
  const styles = lines.map((_, i) => i === 0 ? {size: bw * .085, font: display, weight: 800, fill: p.ink, alpha: 1}
    : i === 1 ? {size: bw * .056, font: sans, weight: 700, fill: p.accent, alpha: 1} : {size: bw * .042, font: sans, weight: 600, fill: p.ink, alpha: .7});
  const blocks = lines.map((text, i) => { const s = styles[i]; ctx.font = `${s.weight} ${s.size}px ${s.font}`; return {s, rows: wrap(ctx, text, inner)}; });
  const gap = bw * .04, total = blocks.reduce((n, b, i) => n + b.rows.length * b.s.size * 1.18 + (i ? gap : 0), 0);
  let y = card[1] + card[3] / 2 - total / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  blocks.forEach((b, i) => {
    if (i) y += gap;
    ctx.font = `${b.s.weight} ${b.s.size}px ${b.s.font}`; ctx.fillStyle = b.s.fill; ctx.globalAlpha = b.s.alpha;
    for (const row of b.rows) { ctx.fillText(row, card[0] + card[2] / 2, y + b.s.size * .59); y += b.s.size * 1.18; }
  });
  ctx.restore();
}
