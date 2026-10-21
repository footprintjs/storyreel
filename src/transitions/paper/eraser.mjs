/**
 * Eraser: a board eraser wipes the old picture off, from one side to the other, the new picture underneath. The block
 * is a whiteboard eraser at 3× (kits/whiteboard/board.mjs · drawEraser), drawn here so a transition never imports a kit.
 */
import {W, H, lerp} from '../../frame.mjs';
import {rgba} from '../../colour.mjs';
import {paperTokens} from '../../paper-tokens.mjs';

const BLOCK = Object.freeze({w: 270, h: 360, felt: 48, shadow: [15, 24]});
/** How far past the frame the eraser starts and ends: half its width, its shadow and a margin. */
const REACH = BLOCK.w / 2 + BLOCK.shadow[0] + 30;

function eraserBlock(ctx, x, y, {body, felt, shade}) {
  const {w, h} = BLOCK;
  ctx.fillStyle = shade; ctx.fillRect(x - w / 2 + BLOCK.shadow[0], y - h / 2 + BLOCK.shadow[1], w, h);
  ctx.fillStyle = body; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 30); ctx.fill();
  ctx.fillStyle = felt; ctx.fillRect(x - w / 2, y + h / 2 - BLOCK.felt, w, BLOCK.felt);
}

function eraser(ctx, {e, from, to, p, theme}) {
  const t = paperTokens(theme), fromRight = p.from === 'right';
  const x = fromRight ? lerp(W + REACH, -REACH, e) : lerp(-REACH, W + REACH, e);
  to(ctx);
  ctx.save(); ctx.beginPath();
  if (fromRight) ctx.rect(0, 0, Math.max(0, x), H); else ctx.rect(x, 0, Math.max(0, W - x), H);
  ctx.clip(); from(ctx); ctx.restore();
  eraserBlock(ctx, x, H / 2 + Math.sin(e * 22) * 60, {body: p.color, felt: t.fold, shade: rgba(t.ink, .12)});
}

export const ERASER = {family: 'wipe', seconds: 1.1, ease: 'inOut', sound: 'slide',
  params: {from: {oneOf: ['left', 'right'], default: 'left'}, color: {color: true, default: '#3b4a63'}}, draw: eraser};
