/**
 * A phone-size review still: the film as one platform shows it, at the size of a phone in the hand, with that app's own
 * UI laid over it as plain grey shapes — the bar at the top, the column of buttons, the strip of name and caption at the
 * foot (the target's zones: zones.mjs). Whatever of the title band, a caption or a named face is still under the UI is
 * outlined in red. So a caption too small to read, or one the buttons cover, shows before the upload, not after.
 *
 * The frame is drawn at the format's own size (1080×1920 for vertical) through the target's layout — its title band, its
 * captions fitted clear of the UI, its crop — then made phone-sized (PHONE.width: 390 px across, as most phones measure
 * in points), as a person sees it. Pure: a function of the film, the layout and the moments; nothing is rendered.
 */
import {createCanvas} from '@napi-rs/canvas';
import {compileLayout} from './layout.mjs';
import {overlapOf} from './zones.mjs';
import {clockTenths} from './clock.mjs';

/** A phone's width in pixels (390: most phones measure about that many points across), the gaps, the label, phones a row. */
export const PHONE = Object.freeze({width: 390, pad: 18, label: 30, columns: 3, bezel: 7});
const RED = '#ff3b30', SHAPE = 'rgba(48, 50, 56, .55)', LIGHT = 'rgba(232, 234, 238, .9)';

/**
 * What of the frame at t is under the app's UI, as drawn (format pixels): [{kind, zone, rect, name?}] — the title band,
 * the caption showing then, each named face (ui.faces) there. `ctx` measures the text.
 */
export function coveredAt(film, framed, t, ctx) {
  if (!framed.ui) return [];
  const caption = framed.captionAt(t), out = [];
  for (const h of framed.titleFit(ctx)?.covered ?? []) out.push({kind: 'title', zone: h.zone, rect: h.overlap});
  if (caption) for (const h of framed.captionFit(ctx, caption).covered) out.push({kind: 'caption', zone: h.zone, rect: h.overlap});
  for (const r of framed.ui.faces.length ? film.regionsAt?.(t) ?? [] : []) {
    if (!r.name || !framed.ui.faces.includes(r.name)) continue;
    const rect = framed.toOutput(t, r.box);
    for (const z of rect ? framed.ui.zones : []) { const o = overlapOf(rect, z.rect); if (o) out.push({kind: 'face', name: r.name, zone: z.name, rect: o}); }
  }
  return out;
}

/** The app's UI as plain shapes, over a picture `k` times the format's size: a bar's pills, a column's buttons, a strip's lines, an edge's tint. */
function drawUi(ctx, zones, {width, height}, k) {
  ctx.save();
  for (const {rect} of zones) {
    const [x0, y0, x1, y1] = rect.map(v => v * k), w = x1 - x0, h = y1 - y0;
    if (h >= .95 * height * k) { ctx.fillStyle = 'rgba(128, 132, 140, .3)'; ctx.fillRect(x0, y0, w, h); continue; }   // an edge the phone may crop
    ctx.fillStyle = SHAPE; ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = LIGHT;
    if (w >= .9 * width * k && y0 < height * k / 2) {   // the bar at the top: a few pills across its middle
      const r = Math.max(4, h * .12), cy = y0 + h * .55;
      for (const [f, l] of [[.08, .12], [.35, .3], [.82, .1]]) { ctx.beginPath(); ctx.roundRect(x0 + w * f, cy - r, w * l, 2 * r, r); ctx.fill(); }
    } else if (w >= .9 * width * k) {   // the strip at the foot: an avatar, a name, two lines of the post's text, the sound
      const u = Math.min(h / 6, 14), lx = x0 + w * .06;
      ctx.beginPath(); ctx.arc(lx + u, y0 + h * .22, u, 0, Math.PI * 2); ctx.fill();
      for (const [f, l] of [[.22, .3], [.45, .62], [.62, .5], [.82, .4]]) { ctx.beginPath(); ctx.roundRect(f === .22 ? lx + 3 * u : lx, y0 + h * f - u * .35, w * l, u * .7, u * .35); ctx.fill(); }
    } else {   // the column of buttons
      const r = Math.min(w * .28, 15), n = Math.max(1, Math.min(5, Math.floor(h / (3.4 * r)))), cx = x0 + w / 2;
      for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(cx, y0 + h * (i + .5) / n, r, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.restore();
}

/**
 * The frames at `moments` ([{t, label}]) as phones side by side: the film through `layout` (layout.mjs · compileLayout,
 * with the target's `ui`), PHONE.width across each (`width`), the app's UI over it, what is still under it outlined in
 * red. Returns {png, frames: [{t, label, covered}]}.
 */
export async function phoneSheet(film, {layout, moments, width = PHONE.width, columns = PHONE.columns}) {
  const framed = compileLayout(film, {...layout, scale: undefined}), W = framed.width, H = framed.height;
  const k = width / W, ph = Math.round(H * k), {pad, label, bezel} = PHONE, cols = Math.max(1, Math.min(columns, moments.length));
  const rows = Math.ceil(moments.length / cols), sheet = createCanvas(pad + cols * (width + 2 * bezel + pad), pad + rows * (ph + 2 * bezel + label + pad));
  const c = sheet.getContext('2d'), full = createCanvas(W, H), f = full.getContext('2d'), frames = [];
  c.fillStyle = '#20232a'; c.fillRect(0, 0, sheet.width, sheet.height);
  for (const [i, m] of moments.entries()) {
    const x = pad + (i % cols) * (width + 2 * bezel + pad) + bezel, y = pad + Math.floor(i / cols) * (ph + 2 * bezel + label + pad) + bezel;
    f.resetTransform(); f.globalAlpha = 1; f.clearRect(0, 0, W, H);
    framed.picture(f, m.t); framed.overlay(f, m.t);
    // The phone: a dark rounded body, the picture inside it, the app's shapes over the picture, red round what they cover.
    c.fillStyle = '#05060a'; c.beginPath(); c.roundRect(x - bezel, y - bezel, width + 2 * bezel, ph + 2 * bezel, 3 * bezel); c.fill();
    c.save(); c.beginPath(); c.roundRect(x, y, width, ph, 2 * bezel); c.clip(); c.translate(x, y);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(full, 0, 0, width, ph);
    if (framed.ui) drawUi(c, framed.ui.zones, {width: W, height: H}, k);
    const covered = coveredAt(film, framed, m.t, f);
    c.strokeStyle = RED; c.lineWidth = 2;
    for (const h of covered) { const [x0, y0, x1, y1] = h.rect.map(v => v * k); c.strokeRect(x0, y0, x1 - x0, y1 - y0); }
    c.restore();
    c.fillStyle = covered.length ? RED : '#c9cdd4'; c.font = '600 13px Menlo'; c.textBaseline = 'middle';
    c.fillText(`${clockTenths(m.t)}  ${m.label}${covered.length ? '  · under the UI' : ''}`.slice(0, Math.floor(width / 8)), x - bezel, y + ph + bezel + label / 2);
    frames.push({t: m.t, label: m.label, covered});
  }
  return {png: await sheet.encode('png'), frames};
}
