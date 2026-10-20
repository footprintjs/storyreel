/**
 * Hex colours, the one parser: a theme's palette and a recipe's colour are hex (#rgb, #rrggbb or #rrggbbaa), and a
 * drawing asks for one at an alpha, or two mixed. A leaf: pen.mjs (rgba, mixColor), attention.mjs and the paper
 * transitions all ask here.
 */
const clamp01 = n => Math.max(0, Math.min(1, n));

/** Whether `v` is a hex colour this module reads. */
export const isHex = v => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v);

/** A hex colour as [r, g, b, a] (a 0..1; #rgb is read as #rrggbb). */
export function channels(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
}

/** A hex colour as an rgba() string, its own alpha multiplied by `alpha`. */
export function rgba(hex, alpha = 1) {
  const [r, g, b, a] = channels(hex);
  return `rgba(${r},${g},${b},${(a * clamp01(alpha)).toFixed(3)})`;
}

/** Two hex colours mixed, t of the way from a to b, as #rrggbb. */
export function mixColor(a, b, t) {
  const x = channels(a), y = channels(b);
  return `#${[0, 1, 2].map(i => Math.round(x[i] + (y[i] - x[i]) * clamp01(t)).toString(16).padStart(2, '0')).join('')}`;
}
