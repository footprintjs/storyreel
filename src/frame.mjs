/**
 * The frame every picture is drawn on: 1600 × 900 logical units, and the few numbers a drawing on it asks again and again.
 * A leaf: it imports nothing, so the transitions (transitions.mjs and transitions/paper/) share it without a cycle.
 */
export const W = 1600, H = 900;

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const clamp01 = n => clamp(n, 0, 1);
export const lerp = (a, b, u) => a + (b - a) * u;
/** Smoothstep: 0 at or before a, 1 at or after b, an S between. */
export const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
/** How far the frame's farthest corner is from (cx, cy): the radius a circle there needs to cover the frame. */
export const farthest = ([cx, cy]) => Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
