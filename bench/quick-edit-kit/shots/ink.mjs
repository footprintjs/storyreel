/** What the bench's shots share: the paper and the ink. */
export const PAPER = '#f3eee3', INK = '#23211c';
/** A row of `n` dots that arrive one by one from `at`, every `every` seconds (a shot's own clock). */
export function dots(c, {n, at, every, y, color}, u) {
  for (let i = 0; i < n; i++) {
    const k = Math.max(0, Math.min(1, (u - at - i * every) / .4));
    if (k <= 0) continue;
    c.globalAlpha = k; c.fillStyle = color; c.beginPath(); c.arc(220 + i * 120, y, 24 + 10 * k, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
}
