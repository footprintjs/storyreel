/**
 * The frame every picture is drawn on: 1600 × 900 logical units, and the few numbers a drawing on it asks again and again.
 * A leaf: it imports nothing (pixelScale only asks a canvas for its transform), so the transitions (transitions.mjs and
 * transitions/paper/) share it without a cycle.
 */
export const W = 1600, H = 900;

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const clamp01 = n => clamp(n, 0, 1);
export const lerp = (a, b, u) => a + (b - a) * u;
/** Smoothstep: 0 at or before a, 1 at or after b, an S between. */
export const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
/** How many device pixels a frame unit is on ctx (a shadow's blur and offset ignore the transform, so they are scaled by hand). */
export const pixelScale = ctx => { const m = ctx.getTransform(); return Math.hypot(m.a, m.b) || 1; };
/** How far the frame's farthest corner is from (cx, cy): the radius a circle there needs to cover the frame. */
export const farthest = ([cx, cy]) => Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
/** ctx scaled by s about the point (x, y) of the frame: what is drawn after grows or shrinks about it. */
export const scaleAbout = (ctx, [x, y], s) => { ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-x, -y); };
/** The soft shadow a sheet casts on the paper it hangs on (film.mjs · drawWorld, a thought cloud): its colour. */
export const SHEET_SHADOW = 'rgba(60,50,35,.22)';
