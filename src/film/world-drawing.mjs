/**
 * Stage 15 of the compile: how a world is drawn — its kit draws on a sheet, the sheet hangs on the paper (or in its
 * thought cloud), the camera follows the world's spotlight, and for the story of a pushIn film pushes into the prop;
 * while a depth move has moved its layers, layer by layer, each slid, scaled and blurred. Its own stage because the
 * spotlight's and the push-in's cameras are read by the regions too, so a box is where the world is drawn.
 *
 * Reads: paper, blank, boardEnd, TURN, ZOOM, propCentre, camerawork (at draw time).
 * Writes: drawWorld(ctx, w, t, spot, until, camera), spotOf(w, t), spotCamera(w, spot), pushInCamera(t).
 */
import {createCanvas} from '@napi-rs/canvas';
import {inOut as ease} from '../ease.mjs';
import {drawThought} from '../thought/index.mjs';
import {SHEET_SHADOW} from '../frame.mjs';
import {aim} from './util.mjs';

export function worldDrawing(state) {
  const {paper, blank, boardEnd, TURN, ZOOM, propCentre} = state;
  const sheet = createCanvas(1600, 900);
  /**
   * A world at t: its kit draws on the sheet, the sheet hangs on the paper, the camera follows the
   * world's spotlight (and, for the story of a pushIn film, pushes into the prop: `camera`).
   */
  function drawWorld(ctx, w, t, spot, until = Infinity, camera = null) {
    { const c = sheet.getContext('2d'); c.resetTransform(); c.clearRect(0, 0, 1600, 900); paintWorld(c, w, t, Math.min(t, until), spot); }
    ctx.drawImage(blank, 0, 0); // the page under the camera: a push never uncovers the frame edge
    ctx.save();
    if (spot) aim(ctx, spotCamera(w, spot));
    if (camera) aim(ctx, camera);
    ctx.drawImage(blank, 0, 0);
    if (w.frame) drawThought(ctx, w.frame.cloud, c => c.drawImage(sheet, w.BX, w.BY, 1600 * w.S, 900 * w.S), {age: t - w.thoughtFrom, color: w.frame.color, ink: w.frame.ink, backdrop: w.frame.backdrop, theme: paper});
    else if (w.S < 1) { ctx.save(); ctx.shadowColor = SHEET_SHADOW; ctx.shadowBlur = 26; ctx.shadowOffsetY = 8; ctx.drawImage(sheet, w.BX, w.BY, 1600 * w.S, 900 * w.S); ctx.restore(); }
    else ctx.drawImage(sheet, 0, 0);
    ctx.restore();
  }
  const layerSheet = createCanvas(1600, 900), softSheets = new Map();
  /**
   * A world on its sheet at t (drawn as at `shown`): by its kit's draw, or — while a depth move has moved its layers
   * (camerawork.mjs · depthAt) — layer by layer, back to front, each drawn whole (drawLayer), then slid, scaled
   * about the sheet's centre and blurred by its depth (softened).
   */
  function paintWorld(c, w, t, shown, spot) {
    const layers = state.camerawork?.depthAt(w, t);
    if (!layers) { w.instance.draw(c, shown, spot); return; }
    const lc = layerSheet.getContext('2d');
    for (const l of layers) {
      lc.resetTransform(); lc.clearRect(0, 0, 1600, 900); w.instance.drawLayer(lc, shown, l.name, spot);
      const picture = l.blur >= .5 ? softened(l.blur) : layerSheet;   // under half a pixel a blur shows nothing: not drawn
      c.save(); c.translate(800 + l.dx, 450); c.scale(l.scale, l.scale); c.translate(-800, -450); c.drawImage(picture, 0, 0, 1600, 900); c.restore();
    }
  }
  /**
   * The layer just drawn on layerSheet, blurred by `blur` px: drawn at 1/k of its size (k about blur/1.5, 1–8) with
   * blur/k, then scaled back up as it is laid down — the same softness, a fraction of the work of a full-size blur
   * (a rack focus costs a few times a plain frame, not thirty: README · Camera moves by name).
   */
  function softened(blur) {
    const k = Math.max(1, Math.min(8, Math.round(blur / 1.5))), w = Math.ceil(1600 / k), h = Math.ceil(900 / k);
    if (!softSheets.has(k)) softSheets.set(k, createCanvas(w, h));
    const soft = softSheets.get(k), sc = soft.getContext('2d');
    sc.resetTransform(); sc.clearRect(0, 0, w, h);
    sc.save(); sc.filter = `blur(${(blur / k).toFixed(2)}px)`; sc.drawImage(layerSheet, 0, 0, w, h); sc.restore();
    return soft;
  }
  const spotOf = (w, t) => w.instance.spotAt ? w.instance.spotAt(t) : null;
  /** A spotlight's camera on a world: {sx, sy, z, tx, ty} (translate to (tx, ty), scale z, about (sx, sy)). */
  function spotCamera(w, spot) {
    const sx = w.BX + spot.cx * w.S, sy = w.BY + spot.cy * w.S, z = 1 + (spot.zoom - 1) * spot.w;
    let tx = sx + (800 - sx) * .25 * spot.w, ty = sy + (450 - sy) * .25 * spot.w;
    // A full-frame world must stay covering the frame while the camera pushes (no edge showing).
    if (w.S >= 1) { tx = Math.min(sx * z, Math.max(1600 - (1600 - sx) * z, tx)); ty = Math.min(sy * z, Math.max(900 - (900 - sy) * z, ty)); }
    return {sx, sy, z, tx, ty};
  }
  /** The push into the story prop at t (from boardEnd): a camera like spotCamera's. */
  function pushInCamera(t) {
    const e = ease((t - boardEnd) / (TURN * .6)), z = 1 + (ZOOM - 1) * e;
    return {sx: propCentre[0], sy: propCentre[1], z, tx: propCentre[0] + (800 - propCentre[0]) * e, ty: propCentre[1] + (450 - propCentre[1]) * e};
  }
  Object.assign(state, {drawWorld, spotOf, spotCamera, pushInCamera});
}
