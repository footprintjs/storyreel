/** Engineering paper: a lit centre, a faint grid, and a fixed grain tile (deterministic). */
import {createCanvas} from '@napi-rs/canvas';
import {rgba} from './pen.mjs';

const GRAIN = new Map();
/** Paint the paper ground on P.ctx (1600×900 units). bg = theme.background ({gridSize, grain}). */
export function paperGround(P, bg, {vignette = .13} = {}) {
  const ctx = P.ctx, C = P.C;
  const light = ctx.createRadialGradient(800, 430, 60, 800, 450, 980);
  light.addColorStop(0, rgba(C.glow, .9)); light.addColorStop(1, rgba(C.bg, 0));
  ctx.fillStyle = light; ctx.fillRect(0, 0, 1600, 900);
  if (bg.gridSize) {
    ctx.save(); ctx.strokeStyle = rgba(C.edge, .45); ctx.lineWidth = .8;
    ctx.beginPath();
    for (let x = bg.gridSize / 2; x < 1600; x += bg.gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, 900); }
    for (let y = bg.gridSize / 2; y < 900; y += bg.gridSize) { ctx.moveTo(0, y); ctx.lineTo(1600, y); }
    ctx.stroke(); ctx.restore();
  }
  if (bg.grain > 0) {
    if (!GRAIN.has(bg.grain)) {
      const tile = createCanvas(192, 192), t = tile.getContext('2d'), img = t.createImageData(192, 192);
      let seed = 0x9e3779b9;
      for (let i = 0; i < img.data.length; i += 4) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        const v = (seed >>> 0) % 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = Math.round(255 * bg.grain);
      }
      t.putImageData(img, 0, 0); GRAIN.set(bg.grain, tile);
    }
    ctx.save(); ctx.fillStyle = ctx.createPattern(GRAIN.get(bg.grain), 'repeat'); ctx.globalCompositeOperation = 'multiply'; ctx.fillRect(0, 0, 1600, 900); ctx.restore();
  }
  const edge = ctx.createRadialGradient(800, 450, 520, 800, 450, 1050);
  edge.addColorStop(0, 'rgba(90,70,40,0)'); edge.addColorStop(1, `rgba(90,70,40,${vignette})`);
  ctx.fillStyle = edge; ctx.fillRect(0, 0, 1600, 900);
}
