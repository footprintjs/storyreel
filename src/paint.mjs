/**
 * The painter: how a compiled film becomes encoded frames — one picture at a film second (the layout, the motion blur),
 * the draft stamp, the encoder's settings, and the frame loop that pipes pictures into FFmpeg. Everything here decides
 * a frame's pixels, so it is the root of the drawing fingerprint (segments/drawing.mjs) with film.mjs and layout.mjs; the
 * render's sound, mux and records (render.mjs) are not, so a change there keeps every cached piece.
 */
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {editFrame, captionInCut} from './edit.mjs';
import {drawEndCard} from './endcard.mjs';

/**
 * How the frames are encoded. 'standard': quick, fine to watch. 'high', for posting: a slower, finer encode, and the
 * colours converted with HD video's matrix and tagged so (BT.709): FFmpeg converts RGB with the older SD matrix unless
 * told, and players read HD video as BT.709, which shifts reds and greens a little.
 */
export const ENCODE = Object.freeze({
  standard: ['-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p'],
  draft: ['-preset', 'ultrafast', '-crf', '24', '-pix_fmt', 'yuv420p'],
  // The frames carry the tags too (setparams): a newer FFmpeg takes them from the frames, an older one from the flags.
  high: ['-preset', 'slow', '-crf', '16', '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
    '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'],
});
export const QUALITIES = Object.freeze(Object.keys(ENCODE));

/**
 * The encoder's settings for a quality, for a pass that draws its own filter graph (the stamp's overlay at the join:
 * segments/join.mjs): the same preset, quality and tags, without the -vf a graph replaces. `colour` is the filter that
 * converts a picture laid over the frames the way their own pixels were converted (BT.709 for 'high'; FFmpeg's default
 * otherwise), so a stamp burned at the join has the colours it has when drawn into the frames.
 */
export function encodeWithoutFilter(quality) {
  const args = [...ENCODE[quality]], i = args.indexOf('-vf');
  if (i >= 0) args.splice(i, 2);
  return {args, colour: quality === 'high' ? 'scale=out_color_matrix=bt709:out_range=tv,' : ''};
}

const encoders = new Map();
/**
 * The FFmpeg a render encodes with, as it names itself (`ffmpeg -version`: its version, its libraries, its build),
 * hashed, once per program: a cached piece's key holds it. Pieces are joined by copying, and an MP4 keeps one set of
 * H.264 parameters (the first piece's), so a piece another build encoded is never joined to this build's: it is drawn
 * again. An FFmpeg that cannot run is 'unknown' (the render refuses when it encodes).
 */
export function encoderOf(ffmpeg) {
  if (!encoders.has(ffmpeg)) {
    const r = spawnSync(ffmpeg, ['-version'], {encoding: 'utf8', timeout: 10000});
    encoders.set(ffmpeg, r.status === 0 ? createHash('sha256').update(String(r.stdout)).digest('hex').slice(0, 16) : 'unknown');
  }
  return encoders.get(ffmpeg);
}

/** The motionBlur option: null, a number of subframes, or {subframes 2–16, shutter 0.1–1 (default 0.5)}. */
export function readMotionBlur(v) {
  if (v === null || v === undefined || v === false) return null;
  const o = typeof v === 'number' ? {subframes: v} : v;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('motionBlur must be a number of subframes or {subframes, shutter}');
  for (const key of Object.keys(o)) if (!['subframes', 'shutter'].includes(key)) throw new Error(`motionBlur has unsupported key ${key} (the keys are subframes, shutter)`);
  const shutter = o.shutter ?? .5;
  if (!(Number.isInteger(o.subframes) && o.subframes >= 2 && o.subframes <= 16)) throw new Error('motionBlur.subframes must be a whole number 2–16');
  if (!(typeof shutter === 'number' && shutter >= .1 && shutter <= 1)) throw new Error('motionBlur.shutter must be 0.1–1 (the share of a frame\'s time the blur spans)');
  return {subframes: o.subframes, shutter};
}

/**
 * The moments one frame's motion blur averages: `subframes` of them spread evenly over `shutter` of the frame's time,
 * centred on it. Always strictly inside the frame (a shutter of 1 reaches 0.4999995 of a frame either side, not the
 * half-way point the next frame shares), so a drawing held on twos (motion.mjs · heldTime) is the same drawing at
 * every moment of its frame.
 */
export function blurMoments(t, {subframes: n, shutter}, fps) {
  const span = Math.min(shutter, 1 - 1e-6) / fps;
  return Array.from({length: n}, (_, i) => t + (i / (n - 1) - .5) * span);
}

/**
 * The painter: one output picture at film time t into ctx — the film (in its layout, if any), averaged
 * over the motion-blur subframes, then the layout's bands on top (never blurred). A still (the poster)
 * takes no blur and no caption (a thumbnail shows the picture and the title band); `bands: false` leaves the bands
 * off (an edit lays its own over: makeEditPainter). Every call leaves ctx with an identity transform and full alpha.
 */
export function makePainter({film, framed, blur, width, height, fps, ctx}) {
  const k = width / 1600;
  const picture = (c, t) => { c.resetTransform(); c.globalAlpha = 1; c.clearRect(0, 0, width, height); if (framed) framed.picture(c, t); else { c.scale(k, k); film.frame(c, t); } c.resetTransform(); };
  const sub = blur ? createCanvas(width, height) : null, subCtx = sub?.getContext('2d');
  return (t, {still = false, bands = true} = {}) => {
    if (!blur || still) picture(ctx, t);
    else {
      // A running average: subframe i is laid over the first i at 1 / (i + 1), so each counts once.
      const moments = blurMoments(t, blur, fps).map(at => Math.max(0, Math.min(film.total, at)));
      for (const [i, at] of moments.entries()) {
        if (i === 0) { picture(ctx, at); continue; }
        picture(subCtx, at); ctx.globalAlpha = 1 / (i + 1); ctx.drawImage(sub, 0, 0); ctx.globalAlpha = 1;
      }
    }
    if (framed && bands) { framed.overlay(ctx, t, {still}); ctx.resetTransform(); ctx.globalAlpha = 1; }
  };
}

/**
 * The painter of an edit (edit.mjs): output frame f into ctx. Each cut is painted by its own layout (its crop), its
 * caption only one its own stretch says (edit.mjs · captionInCut); in an overlap the later side is laid over the
 * earlier at `a` and its bands are the ones drawn; a pop covers the picture with the paper; the end card is drawn in
 * the film's theme under the title band. `framedCuts` holds each cut's compiled layout (null without a layout).
 */
export function makeEditPainter({film, edit, framedCuts, blur, width, height, fps, ctx}) {
  const sub = createCanvas(width, height), subCtx = sub.getContext('2d');
  const on = c => framedCuts.map(framed => makePainter({film, framed, blur, width, height, fps, ctx: c}));
  const painters = on(ctx), under = on(subCtx), base = framedCuts[0];
  const box = base ? base.boxes.film : [0, 0, width, height], paper = base?.paper ?? film.theme?.palette?.bg ?? '#f3eee3';
  const done = c => { c.resetTransform(); c.globalAlpha = 1; };
  const bands = (i, t) => { const framed = framedCuts[i]; if (!framed) return; framed.overlay(ctx, t, {caption: captionInCut(edit.cuts[i], fps, t, framed.captionAt)}); done(ctx); };
  const card = c => { drawEndCard(c, {lines: edit.end.lines, box, width, height, theme: film.theme}); done(c); };
  const pop = () => { ctx.fillStyle = paper; ctx.fillRect(...box); };
  return f => {
    const s = editFrame(edit, f);
    if (s.kind === 'cut') { painters[s.cut](s.t, {bands: false}); if (s.pop) pop(); bands(s.cut, s.t); return; }
    if (s.kind === 'end') { card(ctx); if (s.pop) pop(); if (base) { base.overlay(ctx, 0, {still: true}); done(ctx); } return; }
    painters[s.under.cut](s.under.t, {bands: false});
    if (s.over.end) card(subCtx); else under[s.over.cut](s.over.t, {bands: false});
    ctx.globalAlpha = s.a; ctx.drawImage(sub, 0, 0); done(ctx);
    if (s.over.end) { if (base) { base.overlay(ctx, 0, {still: true}); done(ctx); } } else bands(s.over.cut, s.over.t);
  };
}

/** A draft stamp in the frame's top right corner (nothing without one). */
export function drawStamp(ctx, stamp, width) {
  if (!stamp) return;
  ctx.save(); ctx.resetTransform(); ctx.globalAlpha = 1; ctx.font = '600 16px Menlo'; const w = ctx.measureText(stamp).width + 24;
  ctx.fillStyle = 'rgba(179,63,54,.92)'; ctx.fillRect(width - w - 16, 14, w, 28); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(stamp, width - w - 4, 28); ctx.restore();
}

/** The stamp alone, as a PNG the size of the frame, clear everywhere else: burned over the joined pieces (segments/join.mjs). */
export async function stampPicture({stamp, width, height}) {
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  drawStamp(ctx, stamp, width);
  return canvas.encode('png');
}

/**
 * The frame loop for a render's job (render.mjs · prepareRender): encode film frames [f0, f1) (frame f shows film
 * second start + f / fps) into `file`; withIntro puts the intro's frames first; posterFirst replaces the first frame with
 * the poster still; stamp: false leaves the draft stamp out (a segmented render burns it once, at the join). Each call
 * has its own canvas and painter, so strategies may encode several parts at once.
 */
export function frameEncoder({film, framed, blur, width, height, fps, start, frames, intro, poster, posterFrame, stamp, quality, ffmpeg, edit = null, framedCuts = null}) {
  return async ({f0 = 0, f1 = frames, file, withIntro: introHere = false, posterFirst = false, stamp: stamped = true}) => {
    const k = width / 1600, canvas = createCanvas(width, height), ctx = canvas.getContext('2d'), label = stamped ? stamp : null;
    const paint = makePainter({film, framed, blur, width, height, fps, ctx});
    const editPaint = edit ? makeEditPainter({film, edit, framedCuts, blur, width, height, fps, ctx}) : null;
    const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${width}x${height}`, '-framerate', String(fps), '-i', 'pipe:0', '-c:v', 'libx264', ...ENCODE[quality], file], {stdio: ['pipe', 'ignore', 'inherit']});
    // FFmpeg that cannot start, or that stops taking frames, is a refusal (not a crash): every failure lands on `closed`.
    let failed = null;
    const closed = new Promise(resolve => { ff.once('error', e => { failed ??= e; resolve([null]); }); ff.once('close', code => resolve([code])); });
    ff.stdin.on('error', e => { failed ??= e; });
    const push = async () => {
      drawStamp(ctx, label, width);
      if (failed) throw new Error(`ffmpeg (${ffmpeg}) could not encode ${path.basename(file)}: ${failed.message}`);
      if (!ff.stdin.write(canvas.data())) await Promise.race([once(ff.stdin, 'drain'), closed]);
    };
    let posterNext = posterFirst && poster !== null && posterFrame;
    const frameOrPoster = async draw => { if (posterNext) { posterNext = false; paint(poster, {still: true}); } else draw(); await push(); };
    if (introHere) {
      const handoff = createCanvas(width, height); { const c = handoff.getContext('2d'); c.scale(k, k); film.frame(c, 0); }
      for (let f = 0; f < Math.round(intro.seconds * fps); f++) await frameOrPoster(() => { ctx.resetTransform(); ctx.globalAlpha = 1; ctx.clearRect(0, 0, width, height); intro.draw(ctx, f / fps, {width, height, handoff}); });
    }
    for (let f = f0; f < f1; f++) await frameOrPoster(editPaint ? () => editPaint(f) : () => paint(start + f / fps));
    ff.stdin.end();
    const [code] = await closed;
    if (failed) throw new Error(`ffmpeg (${ffmpeg}) could not encode ${path.basename(file)}: ${failed.message}`);
    if (code !== 0) throw new Error(`ffmpeg failed encoding frames ${f0}–${f1} into ${path.basename(file)} (exit ${code}): FFmpeg's own error is printed above it`);   // refusal: FFmpeg's stderr says why
    return file;
  };
}

/**
 * A frame hasher with its own canvas: hash(f, {poster}) fingerprints frame f exactly as the frame loop paints it — the
 * layout, the motion blur, the stamp (unless `stamp: false`: a segmented render's pieces are drawn without it); the
 * poster still when `poster` — so a spot check sees what the piece shows. Each caller makes its own, so parts checked
 * at once never share a canvas.
 */
export function frameHasher({film, framed, blur, width, height, fps, start, poster, posterFrame = true, stamp, edit = null, framedCuts = null}, {stamp: stamped = true} = {}) {
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d'), paint = makePainter({film, framed, blur, width, height, fps, ctx});
  const editPaint = edit ? makeEditPainter({film, edit, framedCuts, blur, width, height, fps, ctx}) : null;
  return (f, {poster: asPoster = false} = {}) => {
    // The poster is the first frame only when it replaces it (posterFrame): otherwise frame 0 is the film's own.
    if (asPoster && poster !== null && posterFrame) paint(poster, {still: true}); else if (editPaint) editPaint(f); else paint(start + f / fps);
    drawStamp(ctx, stamped ? stamp : null, width);
    return createHash('sha256').update(canvas.data()).digest('hex').slice(0, 16);
  };
}
