/**
 * Drawing the thought cloud: its outline as a path (cloudPath, also cloudBurst's mask), and the cloud with a picture in
 * it at a moment of its entrance (drawThought): the trail, the cloud's paper with a soft shadow, the picture softening
 * into the paper at the edge, the ink outline.
 */
import {W, H, pixelScale, scaleAbout, SHEET_SHADOW} from '../frame.mjs';
import {rgba, mixColor} from '../colour.mjs';
import {paperTokens} from '../paper-tokens.mjs';
import {circleOf} from './shape.mjs';
import {thoughtAt} from './entrance.mjs';

const TAU = 2 * Math.PI;
/** The paper softening in at the cloud's edge, inside it: wide to narrow strokes of thin paper, deepest at the outline. */
const SOFT_EDGE = Object.freeze([[44, .1], [32, .1], [22, .1], [13, .12], [6, .14]]);
/** The cloud's ink line, and a trail circle's. */
export const CLOUD_LINE = 4.5;
const TRAIL_LINE = 3.5;

/** The cloud's outline as the current path on ctx: its scallops in order, each bulging bulge[i] of its depth (null: all full). */
export function cloudPath(ctx, cloud, bulge = null) {
  ctx.beginPath();
  cloud.lobes.forEach((lobe, i) => { const {x, y, r, a0, a1} = bulge ? circleOf(lobe.v0, lobe.v1, lobe.out, lobe.h * bulge[i]) : lobe; ctx.arc(x, y, r, a0, a1); });
  ctx.closePath();
}

/** The soft shadow a sheet hung on the paper casts, k of its full size, in frame units (a shadow ignores the transform). */
function shade(ctx, k) {
  const px = pixelScale(ctx);
  ctx.shadowColor = SHEET_SHADOW; ctx.shadowBlur = 26 * k * px; ctx.shadowOffsetY = 8 * k * px;
}

/** How much lighter the backdrop is round the cloud, and darker at the frame's edges, at full vignette. */
const VIGNETTE_LIGHT = .22, VIGNETTE_DARK = .45;

/**
 * The cloud on ctx at `age` seconds into its shot (entrance.mjs · thoughtAt): the backdrop round it, if it has one
 * (recipe.mjs · readBackdrop), darkening in with the entrance; the trail; then the cloud — its paper, casting a soft
 * shadow; the picture inside it, softening into the paper at the edge (paint(c) draws the picture in frame units: a
 * world's sheet at the cloud's `place`, scale `S`); the ink outline. Colours: `color` and `ink`, or the theme's card
 * and ink (paper-tokens.mjs). ctx is left as it was found.
 */
export function drawThought(ctx, cloud, paint, {age = Infinity, color = null, ink = null, theme, backdrop = null} = {}) {
  const tokens = paperTokens(theme), paper = color ?? tokens.paper, line = ink ?? tokens.ink, now = thoughtAt(cloud, age);
  ctx.save();
  try {
    if (backdrop && now.backdrop > 0) drawBackdrop(ctx, cloud, backdrop, now.backdrop);
    cloud.trail.forEach((circle, i) => { if (now.trail[i] > 0) trailCircle(ctx, circle, now.trail[i], paper, line); });
    if (now.open > 0) drawCloud(ctx, cloud, now, paint, paper, line);
  } finally { ctx.restore(); }
}
/**
 * The ground round the cloud, `alpha` of the way in: its colour, flat, or (vignette) lighter round the cloud and darker
 * toward the frame's edges, on an ellipse the cloud's shape. Drawn under the cloud, which covers it inside.
 */
function drawBackdrop(ctx, cloud, {color, vignette}, alpha) {
  ctx.save(); ctx.globalAlpha *= alpha;
  if (vignette > 0) {
    const [cx, cy] = cloud.centre, [x0, y0, x1, y1] = cloud.box, k = (y1 - y0) / (x1 - x0);
    const far = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - cx, (y - cy) / k)));
    ctx.translate(cx, cy); ctx.scale(1, k);
    const g = ctx.createRadialGradient(0, 0, (x1 - x0) / 2 * .9, 0, 0, far);
    g.addColorStop(0, mixColor(color, '#ffffff', VIGNETTE_LIGHT * vignette)); g.addColorStop(1, mixColor(color, '#000000', VIGNETTE_DARK * vignette));
    ctx.fillStyle = g; ctx.fillRect(-2 * far, -2 * far / k, 4 * far, 4 * far / k);
  } else { ctx.fillStyle = color; ctx.fillRect(-W, -H, 3 * W, 3 * H); }
  ctx.restore();
}
function trailCircle(ctx, {c, r}, k, paper, line) {
  ctx.save(); scaleAbout(ctx, c, k);
  ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, TAU);
  ctx.save(); shade(ctx, .5); ctx.fillStyle = paper; ctx.fill(); ctx.restore();
  ctx.lineWidth = TRAIL_LINE; ctx.strokeStyle = line; ctx.stroke();
  ctx.restore();
}
function drawCloud(ctx, cloud, {open, bulge}, paint, paper, line) {
  scaleAbout(ctx, cloud.anchor, open);
  ctx.save(); shade(ctx, 1); ctx.fillStyle = paper; cloudPath(ctx, cloud, bulge); ctx.fill(); ctx.restore();
  ctx.save(); cloudPath(ctx, cloud, bulge); ctx.clip(); paint(ctx);
  ctx.lineJoin = 'round';
  for (const [width, alpha] of SOFT_EDGE) { ctx.lineWidth = width; ctx.strokeStyle = rgba(paper, alpha); cloudPath(ctx, cloud, bulge); ctx.stroke(); }
  ctx.restore();
  ctx.lineWidth = CLOUD_LINE; ctx.lineJoin = 'round'; ctx.strokeStyle = line; cloudPath(ctx, cloud, bulge); ctx.stroke();
}
