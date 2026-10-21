/**
 * Render a compiled film to an MP4: frames from film.frame(ctx, t), the paced narration scene by
 * scene (a silent scene with no audio plays generated silence), the sound accents per scene (at most
 * 64 each), loudness in two passes. FFmpeg must be on PATH.
 */
import {writeFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {createMotionSound, soundsByScene, SOUND_AT, FOUND} from './sound.mjs';
import {useFound, addCommand, trimOf, AUDIO_ONLY} from './found/index.mjs';
import {compileLayout, draftSize} from './layout.mjs';
import {captionChunks, captionFile, FILE_CHUNKS, clockText} from 'footprint-narration';
import {spokenTracks} from './captions.mjs';
import {effectsUnderVoice, musicUnderVoice} from './listening.mjs';
import {readSongPlacement, requireOverlap} from './music.mjs';
import {makeScratch, sweepScratch} from './scratch.mjs';
import {writeOutput, refuseFolders, securePath, makeFolder} from './files.mjs';

/**
 * Loudness in two passes (FFmpeg's loudnorm): measure the whole mixed film, then set it with ONE fixed
 * gain (`linear=true`) from what was measured, so a quiet opening stays quiet instead of being raised to
 * the voice's level. A film with no measurable loudness (pure silence: FFmpeg reports -inf) is left as
 * it is; loudnorm's varying mode turns silence into NaN and the AAC encoder refuses it. In linear mode
 * loudnorm reads the range target only as a gate (measured range above it → varying mode), so when the
 * caller set no LRA the second pass raises it to the measured range (render.mjs · effectiveTarget); what
 * can still force the varying mode is the true-peak limit, a film under 3 s, or an LRA the caller set.
 * The type it reports says so, and the making-of record flags it (pipeline.mjs · loudnessRecord).
 */
const LOUDNESS_FORMAT = 'aformat=channel_layouts=stereo';
const finite = s => { const n = Number(s); return Number.isFinite(n) ? n : null; };
const loudnormTarget = ({I, TP, LRA}) => `I=${I}:TP=${TP}${LRA === undefined ? '' : `:LRA=${LRA}`}`;

/** The last JSON report loudnorm printed on stderr (print_format=json), or null. */
export function parseLoudnormReport(stderr) {
  const found = String(stderr).match(/\{[^{}]*"input_i"[^{}]*\}/g);
  return found ? JSON.parse(found[found.length - 1]) : null;
}

/** A report's input measurement as numbers; -inf (silence) and anything unreadable become null. */
export function measuredLoudness(report) {
  return {I: finite(report.input_i), TP: finite(report.input_tp), LRA: finite(report.input_lra), thresh: finite(report.input_thresh), offset: finite(report.target_offset)};
}

/** The second pass's filter: the target, what the first pass measured, one fixed gain, a report. */
// measured_LRA=0 is FFmpeg's "not measured" sentinel (the option's default), answered with the varying
// mode; a steady film really measures 0, the easiest case for one gain, so it is sent as 0.1 (the range
// only gates linear mode). loudness.measured keeps the true value.
export function linearLoudnorm(target, m) {
  return `loudnorm=${loudnormTarget(target)}:measured_I=${m.I}:measured_TP=${m.TP}:measured_LRA=${Math.max(m.LRA, 0.1)}:measured_thresh=${m.thresh}:offset=${m.offset}:linear=true:print_format=json`;
}

/**
 * The second pass's target: the caller's, and when the caller set no LRA, the measured range rounded up
 * (at least FFmpeg's 7, at most its 50) — linear mode reads LRA only to decide whether to stay linear, so
 * raising it changes no sound; it only stops a quiet stretch from forcing the varying gain.
 */
export function effectiveTarget(target, m) {
  return target.LRA !== undefined ? target : {...target, LRA: Math.min(50, Math.max(7, Math.ceil(m.LRA)))};
}

/** Run FFmpeg and keep what it reports (loudnorm prints its JSON at the info level, on stderr); a missing or killed FFmpeg fails here. */
function runReporting(ffmpeg, args) {
  const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-nostats', '-loglevel', 'info', ...args], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (r.error || r.status !== 0) {
    const why = r.error ? r.error.message : r.status === null ? `killed by ${r.signal}` : `exit ${r.status}`;
    throw new Error(`ffmpeg failed (${why}): ${args.join(' ').slice(0, 200)}\n${String(r.stderr ?? '').slice(-800)}`);
  }
  return r.stderr;
}

/** Why a measurement cannot drive the second pass, or null: silence (no integrated loudness), else the fields FFmpeg left unreadable. */
export function unusableReason(m) {
  if (m.I === null) return 'the audio is silent: there is no loudness to measure';
  const missing = Object.keys(m).filter(k => m[k] === null);
  return missing.length ? `could not read: ${missing.join(', ')}` : null;
}

/**
 * A sound's integrated loudness (LUFS), or null when it is silent or cannot be read: FFmpeg's ebur128 meter, which
 * reads a 10-minute file in under a second (loudnorm's measuring pass takes tens).
 */
export function integratedLoudness(ffmpeg, wav) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-i', wav, '-filter_complex', 'ebur128=framelog=quiet', '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 1 << 24});
  const all = [...String(r.stderr ?? '').matchAll(/I:\s+(-?[\d.]+|-inf)\s+LUFS/g)], last = all.at(-1)?.[1];
  const I = last === undefined || last === '-inf' ? null : Number(last);
  return Number.isFinite(I) && I > -69 ? I : null;
}

/** Pass 1: measure the mixed film's loudness (render.mjs · measuredLoudness), and why it is unusable, if it is. */
function measureFilm(ffmpeg, wav, target) {
  const report = parseLoudnormReport(runReporting(ffmpeg, ['-i', wav, '-af', `${LOUDNESS_FORMAT},loudnorm=${loudnormTarget(target)}:print_format=json`, '-f', 'null', '-']));
  if (!report) throw new Error('ffmpeg loudnorm printed no measurement (print_format=json): use an FFmpeg built with loudnorm (ffmpeg -filters lists it)');
  const measured = measuredLoudness(report);
  return {measured, reason: unusableReason(measured)};
}

/**
 * Pass 2, while the video and sound are muxed: one fixed gain from the measurement, or none for a silent
 * film. Returns {type, target, measured, reason?}: type is FFmpeg's reported normalization type
 * ('linear' when one fixed gain was kept, 'dynamic' when loudnorm fell back to varying it) or 'skipped';
 * target is what the second pass asked for (render.mjs · effectiveTarget).
 */
function muxWithLoudness({ffmpeg, video, wav, out, target, seconds}) {
  const {measured, reason} = measureFilm(ffmpeg, wav, target);
  // The sound is padded to the picture's exact length (frames / fps) and both end there. FFmpeg's -shortest
  // stopped a copied picture a few frames early (the finished-file check found 4 frames missing at 30 fps).
  const mux = af => ['-i', video, '-i', wav, '-map', '0:v', '-map', '1:a', '-af', `${af},apad`, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', seconds.toFixed(6), '-movflags', '+faststart', out];
  if (reason) {
    runReporting(ffmpeg, mux(`${LOUDNESS_FORMAT},aresample=48000`));
    return {type: 'skipped', target, measured, reason};
  }
  const asked = effectiveTarget(target, measured);
  const report = parseLoudnormReport(runReporting(ffmpeg, mux(`${LOUDNESS_FORMAT},${linearLoudnorm(asked, measured)},aresample=48000`)));
  if (!report?.normalization_type) throw new Error('ffmpeg loudnorm did not report its normalization type in the second pass');
  return {type: report.normalization_type, target: asked, measured};
}

const LOUDNESS_KEYS = {I: 'integrated loudness, LUFS, -70..-5', TP: 'true peak, dBTP, -9..0', LRA: 'loudness range, LU, 1..50'};
const LOUDNESS_RANGE = {I: [-70, -5], TP: [-9, 0], LRA: [1, 50]};

/** The `loudness` render option: I and TP required, LRA optional, each a finite number in FFmpeg's range; anything else refuses with the fix. */
export function checkLoudnessTarget(loudness) {
  const all = 'loudness takes {I, TP, LRA?}: ' + Object.entries(LOUDNESS_KEYS).map(([k, v]) => `${k} (${v})`).join(', ');
  if (!loudness || typeof loudness !== 'object' || Array.isArray(loudness)) throw new Error(`loudness must be an object, e.g. {I: -16, TP: -1.5}; ${all}`);
  for (const key of Object.keys(loudness)) {
    if (LOUDNESS_KEYS[key]) continue;
    const near = Object.keys(LOUDNESS_KEYS).find(k => k.toLowerCase() === key.toLowerCase());
    throw new Error(near ? `loudness.${key} is not a key: use ${near} (${LOUDNESS_KEYS[near]})` : `loudness.${key} is not a key; ${all}`);
  }
  for (const [key, [lo, hi]] of Object.entries(LOUDNESS_RANGE)) {
    const v = loudness[key];
    if (v === undefined && key === 'LRA') continue;
    if (v === undefined) throw new Error(`loudness.${key} is missing: give ${key} (${LOUDNESS_KEYS[key]}), e.g. {I: -16, TP: -1.5}`);
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`loudness.${key} must be a finite number (${LOUDNESS_KEYS[key]}), not ${JSON.stringify(v)}`);
    if (v < lo || v > hi) throw new Error(`loudness.${key} = ${v} is outside FFmpeg's range: use ${lo}..${hi} (${LOUDNESS_KEYS[key]})`);
  }
}

/**
 * An ffmpeg concat list of files: each path absolute and quoted, a quote in it written '\'' (a folder called
 * "Sanjay's films" is fine). A line break cannot be written in such a list (it would end the entry and start another,
 * naming any file), so a path with one is refused.
 */
function concatList(files) {
  return files.map(f => {
    const p = path.resolve(f);
    if (/[\r\n]/.test(p)) throw new Error(`render: ${JSON.stringify(p)} has a line break, which ffmpeg's concat list cannot hold: rename it`);
    return `file '${p.replace(/'/g, "'\\''")}'`;
  }).join('\n') + '\n';
}

/**
 * The voice, scene by scene, into `voice`: each scene's audio from narrationDir, and generated silence
 * of its duration for a silent scene whose timing names no audio (clock.mjs · directionTimings). FFmpeg's
 * concat joins only files of one format, so when any silence is generated every part is first made
 * 48 kHz mono; a film with audio for every scene is joined as it always was.
 */
function joinVoice(run, {dir, storyboard, timings, narrationDir, voice}) {
  const given = timings.scenes.map((s, i) => {
    if (s.audio) return path.resolve(narrationDir, s.audio);
    if (storyboard.scenes[i]?.silent === undefined) throw new Error(`scene ${s.id} has no audio in its timing: only a silent scene's audio is generated`);
    return null;
  });
  const parts = !given.includes(null) ? given : given.map((file, i) => {
    const part = path.join(dir, `film-voice-${i}.wav`);
    run(file ? ['-i', file, '-ar', '48000', '-ac', '1', part] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(timings.scenes[i].duration), part]);
    return part;
  });
  writeFileSync(path.join(dir, 'film-narration.txt'), concatList(parts));
  run(['-f', 'concat', '-safe', '0', '-i', path.join(dir, 'film-narration.txt'), '-ar', '48000', '-ac', '1', voice]);
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
 * takes no blur and no caption (a thumbnail shows the picture and the title band). Every call leaves ctx
 * with an identity transform and full alpha.
 */
export function makePainter({film, framed, blur, width, height, fps, ctx}) {
  const k = width / 1600;
  const picture = (c, t) => { c.resetTransform(); c.globalAlpha = 1; c.clearRect(0, 0, width, height); if (framed) framed.picture(c, t); else { c.scale(k, k); film.frame(c, t); } c.resetTransform(); };
  const sub = blur ? createCanvas(width, height) : null, subCtx = sub?.getContext('2d');
  return (t, {still = false} = {}) => {
    if (!blur || still) picture(ctx, t);
    else {
      // A running average: subframe i is laid over the first i at 1 / (i + 1), so each counts once.
      const moments = blurMoments(t, blur, fps).map(at => Math.max(0, Math.min(film.total, at)));
      for (const [i, at] of moments.entries()) {
        if (i === 0) { picture(ctx, at); continue; }
        picture(subCtx, at); ctx.globalAlpha = 1 / (i + 1); ctx.drawImage(sub, 0, 0); ctx.globalAlpha = 1;
      }
    }
    if (framed) { framed.overlay(ctx, t, {still}); ctx.resetTransform(); ctx.globalAlpha = 1; }
  };
}

/**
 * @param film       from compileFilm
 * @param storyboard the storyboard (a titled scene starts a chapter: render.mjs · sceneChapters)
 * @param timings    the PACED timings ({scenes: [{id, duration, audio}]}); audio paths relative to narrationDir
 *                   (a silent scene may name none: render.mjs · joinVoice generates its silence)
 * @param narrationDir where the paced scene audio lives (null → a silent film)
 * @param out        the .mp4 to write (its folder receives the working files)
 * @param intro      optional {seconds, draw(ctx, t, {width, height, handoff}), wav?: Buffer} — a title before the film
 * @param stamp      optional text stamped on every frame (e.g. 'DRAFT · NOT APPROVED')
 * @param from,to    render part of the film (seconds on the film clock); the intro plays only when from < 0
 * @param part       instead of from/to: {scenes: [id, …], handles?} — those scenes and `handles` seconds (1.5) of the
 *                   film around them, so both of the part's cuts are seen (render.mjs · partWindow)
 * @param poster     the film second to use as the poster (default: the recipe's `poster`, film.posterAt): it is
 *                   written beside the video (poster.jpg) and REPLACES the video's first frame, so every
 *                   platform's thumbnail shows it (the length and the sound's sync are unchanged)
 * @param posterFrame true (the default): the poster replaces the first frame; false: it is written beside the video
 *                   only — for a platform that takes an uploaded thumbnail, so the video starts on the film's own frame
 * @param loudness   the target {I, TP, LRA?} (LUFS, dBTP, LU) for the two loudness passes (render.mjs · muxWithLoudness)
 * @param layout     a format for a platform ({format: landscape | square | portrait | vertical, header?, captions?, crop?};
 *                   layout.mjs · compileLayout): the output takes that format's size (width or height beside it refuses)
 * @param motionBlur {subframes, shutter?} (or a number of subframes): each frame is the average of that many moments
 *                   spread over `shutter` (0.5 by default) of the frame's time, so fast moves blur as a camera's would
 * @param captionFiles true (both) or a list of 'vtt' / 'srt': caption files beside the video (captions.vtt,
 *                   captions.srt) on the video's clock, for players that show their own captions (footprint-narration · captionFile)
 * @param video      how the picture is made (a strategy, segments.mjs): wholeVideo() — every frame in one pass, the
 *                   default — or segmentedVideo({...}) — the film in segments, each reused from a cache when nothing
 *                   that draws it changed, then joined. The sound is always mixed for the whole film, once.
 * @param quality    'standard' (the default: quick to make, fine to watch), 'draft' (quickest, for looking while
 *                   editing) or 'high' (for posting: a slower, finer
 *                   encode, its colours converted and tagged as HD video's, BT.709, the way players read them)
 * @param music      a song under the film: {file, start?, gain?, fadeOut?} (music.mjs · readSongPlacement) — its first
 *                   second plays at film second `start` (negative: the song begins that far in), at `gain` (0..1 of its
 *                   own level, 0.2), fading out over the film's last `fadeOut` seconds (1.5); measured apart as a role
 * @param soundAt    'start' (the default: each sound begins on its moment) or 'peak' (each sound's loudest transient
 *                   lands on its moment: sound.mjs · soundPeak)
 * @param work       a folder for the render's working files (the picture without its sound, the voice and the
 *                   effects as WAVs, the lists FFmpeg joins), kept after the render; left out, they go in a hidden
 *                   folder beside the video (.storyreel-work-<host>-<pid>-<XXXXXX>), removed when the render ends, finished
 *                   or failed — and one a stopped render left (Ctrl-C, a killed process) is swept by the next render
 *                   into that folder on the same host (scratch.mjs). Only the outputs stay beside the video: the
 *                   video, poster.jpg, chapters.txt, the caption files
 * @returns {out, seconds, chapters, poster?, format?, captions?: {vtt?, srt?}, loudness: {type, target, measured, reason?},
 *          video?: the strategy's report (segmentedVideo: each segment, rendered or reused)}
 */
export async function renderFilm(options) {
  const job = prepareRender(options);
  try {
    const video = await checkVideoStrategy(options.video ?? wholeVideo()).render(job);
    return await finishRender(job, video);
  } finally { closeRender(job); }   // the working files go, finished or failed (kept only in a `work` folder the caller named)
}

/**
 * How the frames are encoded. 'standard': quick, fine to watch. 'high', for posting: a slower, finer encode, and the
 * colours converted with HD video's matrix and tagged so (BT.709): FFmpeg converts RGB with the older SD matrix unless
 * told, and players read HD video as BT.709, which shifts reds and greens a little.
 */
const ENCODE = Object.freeze({
  standard: ['-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p'],
  draft: ['-preset', 'ultrafast', '-crf', '24', '-pix_fmt', 'yuv420p'],
  // The frames carry the tags too (setparams): a newer FFmpeg takes them from the frames, an older one from the flags.
  high: ['-preset', 'slow', '-crf', '16', '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
    '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'],
});
export const QUALITIES = Object.freeze(Object.keys(ENCODE));

/**
 * A render's defaults, as data (the skills quote them; test/skills.test.mjs holds the pages to them): the frame size
 * without a layout (a layout's format sets its own), frames a second, and a part's handles (seconds of the film either
 * side of its scenes).
 */
export const RENDER_DEFAULTS = Object.freeze({width: 1280, height: 720, fps: 30, handles: 1.5});

/**
 * The film's chapters on its own clock, [[seconds, name]]: a titled scene starts a chapter and an untitled one goes
 * on with the chapter before it; a storyboard without any titles makes every scene a chapter, named by its id.
 */
export function sceneChapters(scenes, offsets) {
  const titled = scenes.some(s => s.title);
  return scenes.flatMap((s, i) => s.title ? [[offsets[i], s.title]] : titled ? [] : [[offsets[i], s.id]]);
}

/**
 * A render's job: everything checked and sized once, and the one way frames are made (encodeFrames), so a
 * strategy (segments.mjs) decides only WHICH frames to encode into which files.
 */
/**
 * Where a part's own scenes lie on the film clock, exactly: {from, to}, the first one's start and the last one's end
 * (held to the film). Unrounded: a voice paces a scene to 10 µs (pacing.mjs), and a millisecond either way is inside
 * its neighbour. part: {scenes: [id, …], handles?} or {scene: id, handles?}.
 */
export function partScenes(film, part) {
  const scenes = typeof part?.scene === 'string' ? [part.scene] : part?.scenes;
  if (!Array.isArray(scenes) || !scenes.length || !scenes.every(s => typeof s === 'string')) throw new Error('part must be {scenes: [scene id, …], handles?} or {scene: id, handles?}');
  for (const key of Object.keys(part)) if (!['scene', 'scenes', 'handles'].includes(key)) throw new Error(`part has unsupported key ${key} (a part is {scenes | scene, handles?})`);
  const ids = film.timings.scenes.map(s => s.id), missing = scenes.filter(s => !ids.includes(s));
  if (missing.length) throw new Error(`part: no scene called ${missing.map(s => `"${s}"`).join(', ')} (the scenes are ${ids.join(', ')})`);
  return {from: Math.min(...scenes.map(id => film.clock.start(id))), to: Math.min(film.total, Math.max(...scenes.map(id => film.clock.end(id))))};
}

/**
 * A part of the film with its handles, as a render's from/to (seconds on the film clock): the part's scenes, and
 * `handles` seconds of the film before and after them (1.5 by default) — the end of the part before and the start
 * of the part after, so both of its cuts are seen. part: {scenes: [id, …], handles?} or {scene: id, handles?}.
 */
export function partWindow(film, part) {
  const {from, to} = partScenes(film, part), handles = part.handles ?? RENDER_DEFAULTS.handles;
  if (!(typeof handles === 'number' && handles >= 0 && handles <= 10)) throw new Error('part.handles is the seconds shown before and after the part, 0–10 (1.5 by default)');
  // Rounded to the millisecond, then held to the film: rounding after would carry an end of 21.2999…97 to 21.3, past it.
  return {from: Math.max(0, +(from - handles).toFixed(3)), to: Math.min(film.total, +(to + handles).toFixed(3))};
}
const withPart = options => {
  if (options.part === undefined || options.part === null) return options;
  if (options.from !== undefined || options.to !== undefined) throw new Error('a render takes a part or from/to, not both');
  const {part, ...rest} = options;
  return {...rest, ...partWindow(options.film, part)};
};

/**
 * What happens in a stretch of the film, as text to read instead of frames: each scene that starts and each beat
 * that lands — its time on the stretch's own clock, the phrase it waits for, the recipe entry it moves. A reviewer
 * (or a model) finds "when does 'the network does the waiting' land" here, without rendering a still to guess.
 * Returns [{t, kind: 'scene' | 'beat', scene, phrase?, entry?}]; timelineText(rows) is the same as lines.
 */
export function partTimeline(film, {from = 0, to = film.total} = {}) {
  const inside = t => t >= from - 1e-6 && t <= to + 1e-6, seen = new Set(), rows = [];
  film.timings.scenes.forEach((s, i) => { const t = film.clock.offsets[i]; if (inside(t)) rows.push({t, kind: 'scene', scene: s.id}); });
  for (const b of film.beats ?? []) {
    if (!inside(b.t)) continue;
    const scene = Array.isArray(b.ref) ? b.ref[0] : b.ref?.scene ?? null, phrase = Array.isArray(b.ref) ? b.ref[1] : b.ref?.phrase ?? null;
    const key = `${b.t}|${scene}|${phrase}|${b.path}`; if (seen.has(key)) continue; seen.add(key);
    rows.push({t: b.t, kind: 'beat', scene, phrase, entry: b.path ?? null});
  }
  return rows.sort((a, b) => a.t - b.t || (a.kind === 'scene' ? -1 : b.kind === 'scene' ? 1 : 0)).map(r => ({...r, t: +(r.t - from).toFixed(2)}));
}
export const timelineText = rows => rows.map(r => r.kind === 'scene' ? `${r.t.toFixed(2)}  ── ${r.scene}` : `${r.t.toFixed(2)}  "${r.phrase}"${r.entry ? ` → ${r.entry}` : ''}`).join('\n');

/** The render's job from its options; a part ({scenes, handles}) becomes its from/to first (partWindow). Close it with closeRender. */
export const prepareRender = options => prepareJob(withPart(options));

/**
 * The end of a render, finished or failed: its working files are removed — unless they are in a `work` folder the
 * caller named, which is theirs to keep. renderFilm and makeFilm call it in a finally; a strategy of your own that
 * prepares a job (prepareRender) calls it too.
 */
export function closeRender(job) {
  if (job?.work && !job.keepWork) rmSync(job.work, {recursive: true, force: true});
}

function prepareJob({film, storyboard, timings, narrationDir = null, out, width: givenWidth, height: givenHeight, fps = RENDER_DEFAULTS.fps, intro = null, stamp = null,
  from = intro ? -intro.seconds : 0, to = film.total, poster = film.posterAt ?? null, posterFrame = true, peakCeilingDBFS = -20, loudness = {I: -16, TP: -1.5}, layout = null, motionBlur = null,
  captionFiles = false, quality = 'standard', ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg', video: _strategy, music = null, soundAt = 'start', work = null}) {
  checkLoudnessTarget(loudness);
  if (work !== null && !(typeof work === 'string' && work.trim())) throw new Error(`work is a folder for the render's working files, kept after the render (left out: a hidden folder beside the video, removed when the render ends), not ${JSON.stringify(work)}`);
  if (!SOUND_AT.includes(soundAt)) throw new Error(`soundAt is 'start' (each sound begins on its moment, the default) or 'peak' (its loudest transient lands on it), not ${JSON.stringify(soundAt)}`);
  const song = music === null || music === undefined ? null : readSongPlacement(music);
  // A song placed where it never plays during the film refuses before a frame is drawn (it would be mixed as silence).
  if (song) requireOverlap({start: song.start, seconds: songSeconds(ffmpeg, song.file), total: film.total, who: 'renderFilm music'});
  if (typeof posterFrame !== 'boolean') throw new Error('posterFrame must be true (the poster replaces the first frame) or false (written beside the video only)');
  if (!ENCODE[quality]) throw new Error(`quality must be ${QUALITIES.map(q => `'${q}'`).join(' or ')}`);
  const blur = readMotionBlur(motionBlur), captionKinds = readCaptionFiles(captionFiles);
  const framed = layout ? compileLayout(film, layout) : null;
  // A layout's format sets the size; a size given beside it would be silently ignored, so it refuses.
  if (framed && (givenWidth !== undefined || givenHeight !== undefined)) throw new Error(`renderFilm: the ${framed.format} layout is ${framed.width}×${framed.height}; leave width and height out (they size a render without a layout) and size it with layout.scale: 2/3 makes ${draftSize(framed.format)}, a draft (0.5–2)`);
  const width = framed?.width ?? givenWidth ?? RENDER_DEFAULTS.width, height = framed?.height ?? givenHeight ?? RENDER_DEFAULTS.height;
  if (framed && intro && framed.format !== 'landscape') throw new Error(`renderFilm: an intro is drawn for the landscape frame; the ${framed.format} layout takes none (leave intro out)`);
  // First, the out folder and a `work` named elsewhere: their REAL paths, with no folder on the way another user could
  // rearrange (files.mjs · securePath) — everything is written through these paths only. Then every output's name,
  // before anything is made: a folder at one refuses now, not after the outputs before it.
  const dir = securePath(path.dirname(path.resolve(out))), workReal = work === null ? null : securePath(work);
  out = path.join(dir, path.basename(path.resolve(out)));
  refuseFolders([out, ...(poster !== null ? [path.join(dir, 'poster.jpg')] : []), path.join(dir, 'chapters.txt'), ...captionKinds.map(k => path.join(dir, `captions.${k}`))]);
  makeFolder(dir);
  // The working files' folder: the caller's (kept, never swept), or a new hidden one beside the video, removed by
  // closeRender — made by scratch.mjs · makeScratch (a fresh folder only this user can open, never a path already there),
  // after sweeping the ones stopped renders left there.
  const {swept, failed: unswept} = work === null ? sweepScratch(dir, '.storyreel-work') : {swept: [], failed: []};
  const workDir = work === null ? makeScratch(dir, '.storyreel-work') : makeFolder(workReal);
  to = Math.min(to, film.total);
  // A render starts on the film's frame grid (a part's window is rounded to the millisecond): frame f shows film second
  // start + f / fps, so a drawing held on twos (motion.mjs · heldTime) pairs the same frames in a part as in the film.
  const withIntro = intro && from < 0, start = Math.floor(Math.max(0, from) * fps + 1e-6) / fps;
  const job = {film, storyboard, timings, narrationDir, out, dir, work: workDir, keepWork: work !== null, swept, unswept, width, height, fps, intro, withIntro, stamp, start, to, poster, posterFrame, peakCeilingDBFS, loudness, layout, framed, blur, captionKinds, ffmpeg, song, soundAt,
    /** How many frames the film part has (the intro's are extra). */
    frames: Math.ceil((to - start) * fps),
    /** What changes a frame's pixels besides the film itself: a segment's cache key includes it (segments.mjs). */
    pixels: {width, height, fps, layout: layout ?? null, stamp: stamp ?? null, motionBlur: blur, poster: posterFrame ? poster : null, ...(quality === 'standard' ? {} : {quality})},
  };
  /**
   * Encode film frames [f0, f1) (frame f shows film second start + f / fps) into `file`; withIntro puts the
   * intro's frames first; posterFirst replaces the first frame with the poster still. Each call has its own
   * canvas and painter, so strategies may encode several parts at once.
   */
  job.encodeFrames = async ({f0 = 0, f1 = job.frames, file, withIntro: introHere = false, posterFirst = false}) => {
    const k = width / 1600, canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
    const paint = makePainter({film, framed, blur, width, height, fps, ctx});
    const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${width}x${height}`, '-framerate', String(fps), '-i', 'pipe:0', '-c:v', 'libx264', ...ENCODE[quality], file], {stdio: ['pipe', 'ignore', 'inherit']});
    // FFmpeg that cannot start, or that stops taking frames, is a refusal (not a crash): every failure lands on `closed`.
    let failed = null;
    const closed = new Promise(resolve => { ff.once('error', e => { failed ??= e; resolve([null]); }); ff.once('close', code => resolve([code])); });
    ff.stdin.on('error', e => { failed ??= e; });
    const push = async () => {
      drawStamp(ctx, stamp, width);
      if (failed) throw new Error(`ffmpeg (${ffmpeg}) could not encode ${path.basename(file)}: ${failed.message}`);
      if (!ff.stdin.write(canvas.data())) await Promise.race([once(ff.stdin, 'drain'), closed]);
    };
    let posterNext = posterFirst && poster !== null && posterFrame;
    const frameOrPoster = async draw => { if (posterNext) { posterNext = false; paint(poster, {still: true}); } else draw(); await push(); };
    if (introHere) {
      const handoff = createCanvas(width, height); { const c = handoff.getContext('2d'); c.scale(k, k); film.frame(c, 0); }
      for (let f = 0; f < Math.round(intro.seconds * fps); f++) await frameOrPoster(() => { ctx.resetTransform(); ctx.globalAlpha = 1; ctx.clearRect(0, 0, width, height); intro.draw(ctx, f / fps, {width, height, handoff}); });
    }
    for (let f = f0; f < f1; f++) await frameOrPoster(() => paint(start + f / fps));
    ff.stdin.end();
    const [code] = await closed;
    if (failed) throw new Error(`ffmpeg (${ffmpeg}) could not encode ${path.basename(file)}: ${failed.message}`);
    if (code !== 0) throw new Error(`ffmpeg failed encoding frames ${f0}–${f1} into ${path.basename(file)} (exit ${code}): FFmpeg's own error is printed above it`);   // refusal: FFmpeg's stderr says why
    return file;
  };
  /**
   * A frame hasher with its own canvas: hash(f, {poster}) fingerprints frame f exactly as encodeFrames paints
   * it — the layout, the motion blur, the stamp; the poster still when `poster` — so a spot check sees what
   * the video shows. Each caller makes its own, so parts checked at once never share a canvas.
   */
  job.frameHasher = () => {
    const canvas = createCanvas(width, height), ctx = canvas.getContext('2d'), paint = makePainter({film, framed, blur, width, height, fps, ctx});
    return (f, {poster: asPoster = false} = {}) => {
      if (asPoster && poster !== null) paint(poster, {still: true}); else paint(start + f / fps);
      drawStamp(ctx, stamp, width);
      return createHash('sha256').update(canvas.data()).digest('hex').slice(0, 16);
    };
  };
  return job;
}

/** A draft stamp in the frame's top right corner (nothing without one). */
function drawStamp(ctx, stamp, width) {
  if (!stamp) return;
  ctx.save(); ctx.resetTransform(); ctx.globalAlpha = 1; ctx.font = '600 16px Menlo'; const w = ctx.measureText(stamp).width + 24;
  ctx.fillStyle = 'rgba(179,63,54,.92)'; ctx.fillRect(width - w - 16, 14, w, 28); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(stamp, width - w - 4, 28); ctx.restore();
}

/** The default strategy: every frame in one pass, the intro first (if any), the poster as the first frame. */
export function wholeVideo() {
  return {
    name: 'whole',
    plan: job => [{index: 0, f0: 0, f1: job.frames, whole: true}],
    async one(job) {
      const file = path.join(job.work, 'film-video.mp4');   // the picture without its sound: a working file
      await job.encodeFrames({file, withIntro: Boolean(job.withIntro), posterFirst: true});
      return {index: 0, status: 'rendered', frames: job.frames, file};
    },
    join: (job, [done]) => ({file: done.file}),
    async render(job) { return this.join(job, [await this.one(job, this.plan(job)[0])]); },
  };
}

/** A picture strategy has plan(job), one(job, item) and join(job, done); render(job) runs them in order. */
export function checkVideoStrategy(video) {
  if (!video || typeof video !== 'object' || !['plan', 'one', 'join', 'render'].every(k => typeof video[k] === 'function')) throw new Error('video must be a picture strategy: wholeVideo() or segmentedVideo({...}) (an object with plan, one, join and render)');
  return video;
}

/** Write the poster still beside the video (poster.jpg), when the render has one. */
async function writePoster(job) {
  if (job.poster === null) return null;
  const canvas = createCanvas(job.width, job.height), ctx = canvas.getContext('2d');
  makePainter({film: job.film, framed: job.framed, blur: job.blur, width: job.width, height: job.height, fps: job.fps, ctx})(job.poster, {still: true});
  return writeOutput(path.join(job.dir, 'poster.jpg'), await canvas.encode('jpeg', 90));
}

/** The sound (mixed for the whole part, once), the mux with loudness, the chapters and the caption files. */
export async function finishRender(job, video) {
  const {film, storyboard, timings, narrationDir, dir, work, intro, withIntro, start, to, peakCeilingDBFS, loudness, framed, captionKinds, ffmpeg, song, soundAt} = job;
  const posterFile = await writePoster(job);
  // Audio: narration end to end (or silence), the accents on the same clock, the intro's sound first.
  const run = args => { const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], {stdio: 'inherit'}); if (r.status) throw new Error(`ffmpeg failed: ${args.join(' ').slice(0, 200)}`); };   // refusal: FFmpeg's own error is printed above it
  const voice = path.join(work, 'film-voice.wav');   // the working files in the work folder; the outputs beside the video
  if (narrationDir) joinVoice(run, {dir: work, storyboard, timings, narrationDir, voice});
  else run(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(film.total), voice]);
  // Each scene's synthesized sounds on its own clock (sound.mjs · soundsByScene, the rule compileFilm counted them by);
  // the found ones (recordings: found/) are mixed from their files after (mixFound).
  const found = film.sounds.filter(s => s.type === FOUND);
  const byScene = soundsByScene(film.sounds.filter(s => s.type !== FOUND), film.clock.offsets, timings.scenes.map(s => s.duration));
  const sfxParts = timings.scenes.map((s, i) => {
    const file = path.join(work, `film-sfx-${i}.wav`);
    writeFileSync(file, createMotionSound({duration: s.duration, events: byScene[i], peakCeilingDBFS, soundAt}).wav);
    return file;
  });
  writeFileSync(path.join(work, 'film-sfx.txt'), concatList(sfxParts));
  run(['-f', 'concat', '-safe', '0', '-i', path.join(work, 'film-sfx.txt'), '-ar', '48000', '-ac', '1', path.join(work, 'film-sfx.wav')]);
  const effects = found.length ? mixFound(run, {ffmpeg, events: found, sounds: film.foundSounds ?? [], dir: work, sfx: path.join(work, 'film-sfx.wav'), ceiling: peakCeilingDBFS}) : path.join(work, 'film-sfx.wav');
  // Each role measured apart (listening.mjs): the effects — found sounds and all — stay well under the voice, so the words stay clear.
  const integrated = wav => integratedLoudness(ffmpeg, wav);
  const roles = {voice: narrationDir ? integrated(voice) : null, effects: film.sounds.length ? integrated(effects) : null};
  const tooLoud = effectsUnderVoice(roles), lesson = path.join(work, 'film-lesson.wav');
  run(['-i', voice, '-i', effects, '-filter_complex', '[0:a]aresample=48000[a];[1:a]aresample=48000[b];[a][b]amix=inputs=2:normalize=0:duration=first', '-ac', '1', song ? path.join(work, 'film-dry.wav') : lesson]);
  // The song, when there is one, under the voice and the effects: placed on the film clock, measured as its own role
  // (its working files with the others, in the work folder).
  const musicLoud = song ? mixSong(run, {song, total: film.total, dir: work, lesson, roles, integrated}) : null;
  const parts = [];
  if (withIntro) {
    const introWav = path.join(work, 'film-intro.wav');
    if (intro.wav) writeFileSync(introWav, intro.wav); else run(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(intro.seconds), introWav]);
    run(['-i', introWav, '-ar', '48000', '-ac', '1', path.join(work, 'film-intro48.wav')]); parts.push(path.join(work, 'film-intro48.wav'));
  }
  run(['-ss', String(start), '-t', String(to - start), '-i', path.join(work, 'film-lesson.wav'), path.join(work, 'film-part.wav')]); parts.push(path.join(work, 'film-part.wav'));
  writeFileSync(path.join(work, 'film-audio.txt'), concatList(parts));
  run(['-f', 'concat', '-safe', '0', '-i', path.join(work, 'film-audio.txt'), '-ar', '48000', '-ac', '1', path.join(work, 'film-audio.wav')]);
  const pictureSeconds = (job.frames + (withIntro ? Math.round(intro.seconds * job.fps) : 0)) / job.fps;
  // FFmpeg writes the finished video in the work folder (by its extension, the container); it is then renamed onto `out`
  // (files.mjs · writeOutput), so a link at that name is replaced, never written through.
  const muxed = path.join(work, `film-out${path.extname(job.out)}`);
  const loudnessSet = muxWithLoudness({ffmpeg, video: video.file, wav: path.join(work, 'film-audio.wav'), out: muxed, target: loudness, seconds: pictureSeconds});
  writeOutput(path.resolve(job.out), {move: muxed});
  // Chapters on the output's clock, for review and YouTube.
  const lead = withIntro ? intro.seconds : 0;
  const length = lead + to - start;   // a part's chapters are the ones it shows: none before its start or past its end
  const chapters = [...(withIntro ? [[0, String(intro.title ?? '').trim() || 'Title']] : []), ...sceneChapters(storyboard.scenes, film.clock.offsets).map(([t, name]) => [lead + t - start, name])].filter(([t]) => t >= 0 && t < length);
  writeOutput(path.join(dir, 'chapters.txt'), chapters.map(([t, n]) => `${clockText(t)} ${n}`).join('\n') + '\n');
  // Caption files on the output's clock too (the same shift as the chapters), for the cues the render covers.
  const captions = {};
  if (captionKinds.length) {
    const chunks = captionChunks(spokenTracks(film), FILE_CHUNKS);
    for (const kind of captionKinds) captions[kind] = writeOutput(path.join(dir, `captions.${kind}`), captionFile(chunks, kind, {offset: lead - start, from: start, to}));
  }
  return {out: path.resolve(job.out), seconds: length, chapters: chapters.map(([t, n]) => `${clockText(t)} ${n}`), loudness: {...loudnessSet, roles}, listening: [tooLoud, musicLoud].filter(Boolean),
    ...(posterFile ? {poster: posterFile} : {}), ...(framed ? {format: framed.format} : {}), ...(captionKinds.length ? {captions} : {}), ...(video.report ? {video: video.report} : {})};
}

/** A sound file's length as FFmpeg reports it (its Duration line), or null when it reports none. */
function songSeconds(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-i', file], {encoding: 'utf8'});
  const m = String(r.stderr ?? '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

/**
 * The song on the film clock, mixed under the lesson (render.mjs · finishRender): it begins at film second `start` (a
 * negative start begins the song that far in), at its gain, padded or cut to the film's length and faded out over its
 * last `fadeOut` seconds, mono at 48 kHz like the voice. Its loudness joins the roles; returns the music-loud finding, or null.
 */
function mixSong(run, {song, total, dir, lesson, roles, integrated}) {
  const placed = path.join(dir, 'film-music.wav'), seek = song.start < 0 ? ['-ss', String(-song.start)] : [];
  const delay = song.start > 0 ? `adelay=delays=${Math.round(song.start * 48000)}S:all=1,` : '';
  const fade = song.fadeOut > 0 ? `,afade=t=out:st=${Math.max(0, total - song.fadeOut)}:d=${Math.min(song.fadeOut, total)}` : '';
  run([...seek, '-i', song.file, '-af', `aresample=48000,${delay}volume=${song.gain},apad${fade}`, '-t', String(total), '-ac', '1', placed]);
  roles.music = integrated(placed);
  run(['-i', path.join(dir, 'film-dry.wav'), '-i', placed, '-filter_complex', '[0:a][1:a]amix=inputs=2:normalize=0:duration=first', '-ac', '1', lesson]);
  return musicUnderVoice(roles);
}

/** The filter that cuts a found sound to its trim (from/to, seconds into it), the cuts faded over 10 ms so they never click. */
const trimFilter = ({from, to}) => `atrim=start=${from.toFixed(6)}${to === null ? '' : `:end=${to.toFixed(6)}`},asetpts=PTS-STARTPTS,afade=t=in:d=0.01${to === null ? '' : `,afade=t=out:st=${Math.max(0, to - from - .01).toFixed(6)}:d=0.01`}`;
/** A found sound's loudest sample in dBFS over its trimmed span, as FFmpeg's volumedetect measures it mono at 48 kHz; a file it cannot read refuses. */
function peakDB(ffmpeg, {file, record}, trim) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-nostdin', ...AUDIO_ONLY, '-i', file, '-af', `${trimFilter(trim)},aresample=48000,aformat=channel_layouts=mono,volumedetect`, '-f', 'null', '-'], {encoding: 'utf8', timeout: 60000});
  const m = r.status === 0 ? /max_volume:\s*(-?\d+(?:\.\d+)?|-inf) dB/.exec(String(r.stderr ?? '')) : null;
  if (!m) throw new Error(`FFmpeg could not read the found sound "${record.name}" (sounds/${record.file}): add it again with ${addCommand(record)}`);
  return m[1] === '-inf' ? -Infinity : Number(m[1]);
}

/**
 * The found sounds (found/) mixed onto the synthesized accents, the way the song is mixed (mixSong). Each sound is
 * checked in full once more, just before it is read: its stored record through the licence gate and its file the
 * record's (found/library.mjs · useFound — a render never fetches), and the record still the one the film was built
 * with. Then FFmpeg, as its own program, reads each file once (AUDIO_ONLY: a local file, an audio format), mono at 48
 * kHz, turned DOWN when its peak is over the effects' ceiling (never up: the synthesized accents' rule), split into
 * one copy per event, each at its gain (default 1) and placed at its second on the film clock. Returns the effects
 * track (film-effects.wav, the length of the accents': the film's), which the listening check measures against the voice.
 */
function mixFound(run, {ffmpeg, events, sounds, dir, sfx, ceiling}) {
  const byName = new Map(sounds.map(f => [f.name, f])), names = [...new Set(events.map(e => e.name))], inputs = [], filters = [], placed = [];
  names.forEach((name, k) => {
    const f = byName.get(name);
    if (!f) throw new Error(`the found sound "${name}" was not checked when the film was built: render a film compileFilm made (it checks every found sound it plays)`);   // refusal: a film object not from compileFilm
    const now = useFound(f.root, name, {allowShareAlike: f.allowShareAlike});
    if (now.record.sha256 !== f.record.sha256) throw new Error(`the found sound "${name}" was added again after the film was built: build the film again (compileFilm), so its record and its approval name the sound it plays`);
    const mine = events.filter(e => e.name === name), peaks = new Map();
    inputs.push(...AUDIO_ONLY, '-i', now.file);
    filters.push(`[${k + 1}:a]asplit=${mine.length}${mine.map((_, j) => `[s${k}_${j}]`).join('')}`);
    mine.forEach((event, j) => {
      // Each event its own span of the recording (found/record.mjs · trimOf), turned down by that span's own peak.
      const trim = trimOf(event, now.record), key = `${trim.from}|${trim.to}`;
      if (!peaks.has(key)) peaks.set(key, Math.min(1, 10 ** ((ceiling - peakDB(ffmpeg, now, trim)) / 20)));
      filters.push(`[s${k}_${j}]${trimFilter(trim)},aresample=48000,aformat=channel_layouts=mono,volume=${(peaks.get(key) * (event.gain ?? 1)).toFixed(6)},adelay=delays=${Math.round(event.time * 48000)}S:all=1[f${placed.length}]`);
      placed.push(`[f${placed.length}]`);
    });
  });
  const out = path.join(dir, 'film-effects.wav'), mix = `${filters.join(';')};[0:a]${placed.join('')}amix=inputs=${placed.length + 1}:normalize=0:duration=first[fx]`;
  run(['-i', sfx, ...inputs, '-filter_complex', mix, '-map', '[fx]', '-ac', '1', '-ar', '48000', out]);
  return out;
}

/** The captionFiles option: false, true (both kinds) or a list of 'vtt' / 'srt'. */
export function readCaptionFiles(v) {
  if (v === false || v === undefined || v === null) return [];
  if (v === true) return ['vtt', 'srt'];
  if (!Array.isArray(v) || !v.length || !v.every(k => k === 'vtt' || k === 'srt') || new Set(v).size !== v.length) throw new Error(`captionFiles must be true or a list of 'vtt' and/or 'srt', not ${JSON.stringify(v)}`);
  return v;
}
