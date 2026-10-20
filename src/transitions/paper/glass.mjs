/**
 * Glass sheet: the old picture steps back a little and dims on the paper it lies on, while the new one arrives on a
 * lifted sheet of glass from `from`, tilted, and settles flat; the glass (its sheen, its tinted edge, a lit rim) fades
 * as it lands. The sheet starts past the frame's edge, its tilt and its shadow.
 */
import {W, H, pixelScale} from '../../frame.mjs';
import {rgba, mixColor} from '../../colour.mjs';
import {paperTokens} from './tokens.mjs';

const SIDES = Object.freeze({left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1]});
/** How far off the frame the sheet starts: past its tilt and its shadow. */
const REACH = 200;

function glassSheet(ctx, {e, from, to, p, theme}) {
  const t = paperTokens(theme), lift = 1 - e, [sx, sy] = SIDES[p.from], back = 1 - .08 * e, px = pixelScale(ctx);
  ctx.save(); ctx.fillStyle = t.ground; ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2); ctx.scale(back, back); ctx.translate(-W / 2, -H / 2); from(ctx);
  ctx.fillStyle = rgba(t.ink, .18 * e); ctx.fillRect(0, 0, W, H); ctx.restore();
  const ox = sx * (W + REACH) * lift, oy = sy * (H + REACH) * lift, tilt = -.05 * lift * (sx || -sy), s = 1 - .06 * lift;
  ctx.translate(ox + W / 2, oy + H / 2); ctx.rotate(tilt); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
  ctx.save(); ctx.shadowColor = rgba(t.ink, .35 * lift); ctx.shadowBlur = 60 * lift * px; ctx.shadowOffsetY = 30 * lift * px;
  ctx.fillStyle = t.paper; ctx.fillRect(0, 0, W, H); ctx.restore();
  to(ctx);
  if (lift > .01) glassOver(ctx, p.tint, t, lift);
}

/** The glass, fading as it settles: a sheen across it, a tinted edge and a lit rim along two sides. */
function glassOver(ctx, tint, t, lift) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, rgba(mixColor(tint, t.paper, .7), .35 * lift)); g.addColorStop(1, rgba(tint, .12 * lift));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = rgba(mixColor(tint, t.ink, .45), .8 * lift); ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, H - 6);
  ctx.strokeStyle = rgba(t.paper, .95 * lift); ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(20, 12); ctx.lineTo(W - 20, 12); ctx.moveTo(12, 20); ctx.lineTo(12, H * .6); ctx.stroke();
}

export const GLASS_SHEET = {family: 'motion', seconds: 1.1, ease: 'outCubic', sound: 'slide',
  params: {from: {oneOf: ['right', 'left', 'top', 'bottom'], default: 'right'}, tint: {color: true, default: '#b2d0f0'}}, draw: glassSheet};
