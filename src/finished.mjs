/**
 * Checks on the finished file: what a person would catch watching the render — a frame that flashes, a
 * blank stretch, a cut a frame early or late, a frame repeated where two segments join (or a jump there in a
 * still picture), picture and sound of different lengths, a voice that is not there, lips out of step with it,
 * captions that drift — read from the video itself, after it is made. An intro is the caller's own drawing:
 * the checks read the film's frames after it. A render can be right in every check before it and still come out wrong (a segment joined a
 * frame off, a voice file that went silent); these look at what was actually made.
 *
 * Three parts, each replaceable:
 *   - a probe (the adapter) reads the file: ffmpegProbe() — the streams' lengths, the frames as small grey
 *     pictures, the sound as samples;
 *   - the checks (the strategies) each look at what the probe read: FINISHED_CHECKS;
 *   - the film, when given, says what was meant: a dip to black, a cut, a silent scene are never reported.
 * Each finding is {check, at (seconds in the file), severity: 'problem' | 'look', text}; a report is `ok`
 * when it has no problem ('look': worth a look, not wrong on its face).
 */
import {spawn, spawnSync} from 'node:child_process';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {normSpeech, readCaptions} from 'footprint-narration';
import {spokenTracks} from './captions.mjs';

/** The thresholds the checks use, on the mean grey level difference between frames (0–255) and on loudness. */
export const FINISHED = Object.freeze({
  width: 160,          // the frames are read this wide
  blank: 1.5,          // a frame whose grey levels spread less than this is blank (one colour)
  blankFrames: 3,      // a blank run this long (frames) is reported
  change: 6,           // a change between two frames at least this big is a change you see
  quiet: -50,          // dBFS: a word quieter than this was not heard
  drift: .3,           // seconds a caption may start away from its first word
  soundLeads: .045,    // seconds the sound may come before the mouth before the eye notices (ITU-R BT.1359)
  soundTrails: .125,   // seconds it may come after
  open: .3,            // a mouth this open is moving
  silentMouth: .15,    // seconds a mouth may move with nothing heard before it is a problem (shorter: worth a look)
});

/**
 * The default probe: FFmpeg and ffprobe (beside the FFmpeg given, or on the PATH). probe(file) → {seconds, video: {seconds, fps, width, height, frames},
 * audio: {seconds} | null}; frames(file, {width, height}) → every frame as grey levels (limited range, as
 * the video stores them); sound(file, {rate}) → mono samples.
 */
export function ffmpegProbe({ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg', ffprobe = process.env.FFPROBE_BIN || besideOrPath(ffmpeg)} = {}) {
  const run = (cmd, args) => { const r = spawnSync(cmd, args, {encoding: 'utf8', maxBuffer: 1 << 26}); if (r.error || r.status !== 0) throw new Error(`${cmd} could not read the file: ${r.error?.message ?? String(r.stderr).slice(-300)}`); return r.stdout; };
  return {
    name: 'ffmpeg',
    probe(file) {
      const info = JSON.parse(run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
      const v = info.streams.find(s => s.codec_type === 'video'), a = info.streams.find(s => s.codec_type === 'audio');
      if (!v) throw new Error(`checkVideo: ${file} has no picture`);
      const [n, d] = String(v.avg_frame_rate || v.r_frame_rate).split('/').map(Number), fps = d ? n / d : n;
      return {seconds: Number(info.format.duration), video: {seconds: Number(v.duration ?? info.format.duration), fps, width: v.width, height: v.height, frames: Number(v.nb_frames) || null},
        audio: a ? {seconds: Number(a.duration ?? info.format.duration)} : null};
    },
    async frames(file, {width, height}, each) {
      const size = width * height, ff = spawn(ffmpeg, ['-v', 'error', '-i', file, '-vf', `scale=${width}:${height}:flags=area,format=gray`, '-f', 'rawvideo', 'pipe:1'], {stdio: ['ignore', 'pipe', 'pipe']});
      let held = Buffer.alloc(0), index = 0, err = '';
      ff.stderr.on('data', b => { err += b; });
      for await (const chunk of ff.stdout) {
        held = held.length ? Buffer.concat([held, chunk]) : chunk;
        while (held.length >= size) { each(index++, new Uint8Array(held.subarray(0, size))); held = held.subarray(size); }
      }
      const code = await new Promise(r => ff.once('close', r));
      if (code !== 0) throw new Error(`${ffmpeg} could not read the frames: ${err.slice(-300)}`);
      return index;
    },
    sound(file, {rate = 8000} = {}) {
      const r = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1'], {maxBuffer: 1 << 30});
      if (r.error || r.status !== 0) throw new Error(`${ffmpeg} could not read the sound: ${r.error?.message ?? String(r.stderr).slice(-300)}`);
      return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
    },
  };
}

/** ffprobe beside the FFmpeg given (a folder holding both), or the one on the PATH. */
function besideOrPath(ffmpeg) {
  const beside = ffmpeg.includes('/') || ffmpeg.includes(path.sep) ? path.join(path.dirname(ffmpeg), path.extname(ffmpeg) === '.exe' ? 'ffprobe.exe' : 'ffprobe') : null;
  return beside && existsSync(beside) ? beside : 'ffprobe';
}

/** Grey levels of a picture drawn on a canvas (the same weights a video's grey uses), full range. */
function greyOf(rgba) {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(.299 * rgba[4 * i] + .587 * rgba[4 * i + 1] + .114 * rgba[4 * i + 2]);
  return out;
}
/** The mean difference between two grey pictures, and one picture's spread (both on 0–255). */
const diff = (a, b, scale = 1) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return scale * s / a.length; };
const spread = (a, scale = 1) => { let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) ** 2; return scale * Math.sqrt(s / a.length); };
/** A video's grey is limited range (16–235): differences read 219 / 255 of a canvas's. */
const VIDEO = 255 / 219;

/** The film drawn small, as the checks compare it: draw(t) → grey levels (the frame, 16:9). */
function filmPainter(film, width) {
  const height = Math.round(width * 9 / 16), canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  return t => { ctx.resetTransform(); ctx.globalAlpha = 1; ctx.clearRect(0, 0, width, height); ctx.scale(width / 1600, height / 900); film.frame(ctx, Math.max(0, Math.min(film.total, t))); return greyOf(ctx.getImageData(0, 0, width, height).data); };
}

/** The checks, each a strategy over what the probe read: {needs, run(c) → findings, or {skip: why} when there is nothing to compare}. */
export const FINISHED_CHECKS = Object.freeze({
  /** The picture and the sound run as long as each other, as the film, and as the brief. */
  duration: {needs: [], run(c) {
    const out = [], {video, audio} = c.meta, frame = 1 / video.fps;
    if (audio && Math.abs(audio.seconds - video.seconds) > frame + .05) out.push({at: Math.min(audio.seconds, video.seconds), severity: 'problem', text: `the sound runs ${(audio.seconds - video.seconds).toFixed(2)} s ${audio.seconds > video.seconds ? 'longer' : 'shorter'} than the picture (${audio.seconds.toFixed(2)} s against ${video.seconds.toFixed(2)} s)`});
    if (c.film) {
      // As many frames as the encoder draws: the intro's, then the part's (renderFilm · prepareRender).
      const meant = (c.introFrames + Math.ceil((c.to - c.from) * video.fps)) / video.fps, part = c.from > 0 || c.to < c.film.total - 1e-6;
      if (Math.abs(video.seconds - meant) > 1.5 * frame) out.push({at: video.seconds, severity: 'problem', text: `the picture is ${video.seconds.toFixed(2)} s; the film${part ? ` (its part ${c.from.toFixed(2)}–${c.to.toFixed(2)} s)` : ''} is ${meant.toFixed(2)} s${c.intro ? ' with its intro' : ''}`});
    }
    if (c.expect.seconds !== undefined) {
      const tolerance = c.expect.tolerance ?? Math.max(1, c.expect.seconds * .02);
      if (Math.abs(video.seconds - c.expect.seconds) > tolerance) out.push({at: video.seconds, severity: 'problem', text: `it is ${video.seconds.toFixed(1)} s; the brief asks for ${c.expect.seconds} s (± ${tolerance} s)`});
    }
    return out;
  }},
  /** No blank stretch (one colour) the film does not mean: a dip to black is meant, a frame of nothing is not. */
  blank: {needs: ['frames'], run(c) {
    const out = [], {spreads} = c.frames;
    for (let f = c.introFrames; f < spreads.length;) {
      if (spreads[f] >= FINISHED.blank) { f++; continue; }
      let g = f; while (g < spreads.length && spreads[g] < FINISHED.blank) g++;
      if (g - f >= FINISHED.blankFrames) {
        const mid = Math.floor((f + g) / 2), meant = c.paint && spread(c.paint(c.filmTime(mid))) < FINISHED.blank;
        if (!meant) out.push({at: c.timeOf(f), severity: c.film ? 'problem' : 'look', text: `${g - f} blank frames (one colour) from ${c.timeOf(f).toFixed(2)} s${c.film ? '; the film draws a picture there' : ''}`});
      }
      f = g;
    }
    return out;
  }},
  /** No flash frame: one frame unlike both its neighbours, which are alike — a glitch the eye catches. */
  flash: {needs: ['frames'], run(c) {
    const out = [], {d, skip} = c.frames, T = FINISHED.change;
    for (let f = c.introFrames + 1; f + 1 < d.length; f++) {
      if (!(d[f] > T && d[f + 1] > T && skip[f + 1] < .35 * Math.min(d[f], d[f + 1]))) continue;
      if (c.paint) {
        const [a, b, e] = [f - 1, f, f + 1].map(k => c.paint(c.filmTime(k)));
        if (diff(a, b) > T && diff(b, e) > T && diff(a, e) < .35 * Math.min(diff(a, b), diff(b, e))) continue;   // the film flashes there itself
      }
      out.push({at: c.timeOf(f), severity: 'problem', text: `a flash frame at ${c.timeOf(f).toFixed(2)} s (frame ${f}): it differs from the frames on both sides, which are alike`});
    }
    return out;
  }},
  /**
   * Every cut lands on its frame (the first frame the encoder draws at or after the cut), and a join (where
   * segments meet) repeats no frame — nor, in a still picture, jumps. A frame skipped at a join while the picture
   * moves looks like any moving frame, and is not seen.
   */
  handovers: {needs: ['frames', 'film'], run(c) {
    const out = [], {d} = c.frames, T = FINISHED.change;
    for (const cut of c.cuts) {
      const b = cut.frame, near = [b - 2, b - 1, b, b + 1, b + 2].filter(k => k >= 1 && k < d.length);
      if (!near.includes(b)) continue;
      const peak = near.reduce((p, k) => (d[k] > d[p] ? k : p), near[0]), rest = near.filter(k => k !== peak).map(k => d[k]);
      if (d[peak] < T || d[peak] < 2 * Math.max(0, ...rest)) continue;   // no clear change to place
      if (peak !== b) out.push({at: c.timeOf(b), severity: 'problem', text: `the cut into ${cut.what} lands ${Math.abs(peak - b)} frame${Math.abs(peak - b) > 1 ? 's' : ''} ${peak > b ? 'late' : 'early'} (frame ${peak}, not ${b})`});
    }
    for (const j of c.joins) {
      if (j < c.introFrames + 2 || j + 1 >= d.length) continue;
      const meant = diff(c.paint(c.filmTime(j - 1)), c.paint(c.filmTime(j)));
      if (meant >= 1.5 && d[j] < .25 * meant && d[j - 1] > .5 * meant && d[j + 1] > .5 * meant) out.push({at: c.timeOf(j), severity: 'problem', text: `a frame repeats where two segments join (frame ${j}, ${c.timeOf(j).toFixed(2)} s)`});
      else if (meant < T / 2 && d[j] > T && d[j] > 3 * Math.max(d[j - 1], d[j + 1])) out.push({at: c.timeOf(j), severity: 'problem', text: `the picture jumps where two segments join (frame ${j}, ${c.timeOf(j).toFixed(2)} s): a frame is missing or out of place`});
    }
    return out;
  }},
  /** The voice is there: the words the film times are heard (not quieter than FINISHED.quiet). For a voiced render only. */
  voice: {needs: ['film', 'voiced'], run(c) {
    const out = [];
    if (!c.meta.audio) return c.words.length ? [{at: 0, severity: 'problem', text: 'the film has words and the file has no sound'}] : [];
    const rate = c.sound.rate, samples = c.sound.samples, dB = (a, b) => {
      const i0 = Math.max(0, Math.floor(a * rate)), i1 = Math.min(samples.length, Math.ceil(b * rate)); if (i1 <= i0) return -Infinity;
      let s = 0; for (let i = i0; i < i1; i++) s += samples[i] * samples[i]; return 10 * Math.log10(s / (i1 - i0) || 1e-12);
    };
    for (const scene of c.film.timings.scenes.map(s => s.id)) {
      const words = c.film.clock.words(scene).filter(c.inPart);
      if (words.length < 3) continue;
      const quiet = words.filter(w => dB(c.audioAt(w.start), c.audioAt(w.end)) < FINISHED.quiet);
      if (quiet.length >= .6 * words.length) out.push({at: c.audioAt(words[0].start), severity: 'problem', text: `the voice is not there in scene ${scene}: ${quiet.length} of ${words.length} words are quieter than ${FINISHED.quiet} dBFS`});
    }
    return out;
  }},
  /**
   * Lips in sync with the voice (voiced renders, with the film): every mouth a kit draws (film.mouthsAt) against
   * the loudness of the finished file's sound — how far the mouths lead or trail it (judged as broadcast is:
   * sound more than 45 ms ahead, or 125 ms behind, is seen), a mouth moving while nothing is heard, and a
   * character heard speaking with its mouth shut.
   */
  lipsync: {needs: ['film', 'voiced'], run(c) {
    if (!c.meta.audio) return [];
    if (typeof c.film.mouthsAt !== 'function') return {skip: 'no kit on screen draws a mouth (a world\'s mouthsAt)'};
    // Mouth and voice every 10 ms over the part rendered, whatever the frame rate: a mouth is a function of time,
    // and a syllable (about six a second) is lost between frames at a low frame rate.
    const out = [], step = .01, rate = c.sound.rate, samples = c.sound.samples, n = Math.floor((c.to - c.from) / step), filmAt = i => c.from + i * step;
    const level = i => { const i0 = Math.floor(c.audioAt(filmAt(i)) * rate), i1 = Math.min(samples.length, Math.floor(c.audioAt(filmAt(i + 1)) * rate)); let e = 0; for (let k = i0; k < i1; k++) e += samples[k] * samples[k]; return i1 > i0 ? Math.sqrt(e / (i1 - i0)) : 0; };
    const voice = Float64Array.from({length: n}, (_, i) => level(i)), dB = v => 20 * Math.log10(v || 1e-9);
    // Every mouth (NaN where it is not drawn).
    const mouths = new Map();
    for (let i = 0; i < n; i++) for (const m of c.film.mouthsAt(filmAt(i))) {
      if (!mouths.has(m.who)) mouths.set(m.who, new Float64Array(n).fill(NaN));
      const a = mouths.get(m.who); a[i] = Math.max(Number.isNaN(a[i]) ? 0 : a[i], m.open);
    }
    if (!mouths.size) return {skip: 'no kit on screen draws a mouth (a world\'s mouthsAt)'};
    const smooth = a => Float64Array.from(a, (_, i) => { let s = 0, k = 0; for (let g = i - 1; g <= i + 1; g++) if (g >= 0 && g < a.length && !Number.isNaN(a[g])) { s += a[g]; k++; } return k ? s / k : 0; });
    const v = smooth(voice), when = i => +c.audioAt(filmAt(i)).toFixed(2);
    // Each speaker's words in the part (who says each: clock.speaking), on the grid.
    const allWords = c.film.timings.scenes.flatMap(sc => c.film.clock.words(sc.id)).filter(c.inPart)
      .map(w => ({...w, who: c.film.clock.speaking((w.start + w.end) / 2)?.speaker ?? null}));
    for (const [who, open] of mouths) {
      const name = who ?? 'the narrator', m = smooth(open), drawn = Array.from(open, x => !Number.isNaN(x));
      // Lined up only around this speaker's own words (± 0.4 s): elsewhere the mouth is shut by right while
      // somebody else's voice is loud, which says nothing about this mouth's timing.
      const near = new Uint8Array(n);
      for (const w of allWords.filter(x => x.who === who)) for (let i = Math.max(0, Math.floor((w.start - .4 - c.from) / step)); i < Math.min(n, Math.ceil((w.end + .4 - c.from) / step)); i++) near[i] = 1;
      // How far the mouth is from the voice: the shift that lines the two up best, where the mouth is drawn.
      const corr = lag => { let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, k = 0;
        for (let i = 0; i < n; i++) { const g = i - lag; if (g < 0 || g >= n || !drawn[i] || !near[i]) continue; const x = m[i], y = v[g]; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; k++; }
        const cov = sxy / k - (sx / k) * (sy / k), sd = Math.sqrt(Math.max(0, sxx / k - (sx / k) ** 2) * Math.max(0, syy / k - (sy / k) ** 2)); return k * step > 1 && sd > 0 ? cov / sd : -1; };
      const reach = Math.round(.4 / step), lags = Array.from({length: 2 * reach + 1}, (_, i) => i - reach), score = new Map(lags.map(l => [l, corr(l)]));
      const best = lags.reduce((b, l) => (score.get(l) > score.get(b) ? l : b), 0), seconds = best * step;
      if (score.get(best) > .3 && (seconds > FINISHED.soundLeads || -seconds > FINISHED.soundTrails))
        out.push({at: when(drawn.indexOf(true)), severity: 'problem', text: `${name}'s mouth ${seconds > 0 ? 'trails' : 'leads'} the voice by ${Math.round(Math.abs(seconds) * 1000)} ms (the eye notices sound ${seconds > 0 ? 'more than 45 ms ahead' : 'more than 125 ms behind'})`});
      // A mouth moving while nothing is heard: a run of a tenth of a second is worth a look (an aligner often pads a
      // word's end with the silence after it, and the mouth closes that much late); FINISHED.silentMouth or more is a problem.
      for (let i = 0; i < n;) {
        if (!(open[i] > FINISHED.open && dB(voice[i]) < FINISHED.quiet)) { i++; continue; }
        let g = i; while (g < n && (open[g] > .05 || g - i < 5) && dB(voice[g]) < FINISHED.quiet) g++;
        const run = (g - i) * step;
        if (run >= .1 - 1e-9) out.push({at: when(i), severity: run >= FINISHED.silentMouth - 1e-9 ? 'problem' : 'look',
          text: `${name}'s mouth moves for ${run.toFixed(2)} s at ${when(i).toFixed(2)} s while nothing is heard${run < FINISHED.silentMouth ? ' (short: often a word\'s end timed into the silence after it)' : ''}`});
        i = g;
      }
      // Heard speaking with the mouth shut: words said by this speaker, loud, while the drawn mouth stays closed.
      const said = allWords.filter(w => w.who === who);
      const shut = said.filter(w => { let drawnHere = false, loud = false, moved = false;
        for (let i = Math.max(0, Math.floor((w.start - c.from) / step)); i < Math.min(n, Math.ceil((w.end - c.from) / step)); i++) { if (drawn[i]) drawnHere = true; if (dB(voice[i]) > FINISHED.quiet + 10) loud = true; if (open[i] > .05) moved = true; }
        return drawnHere && loud && !moved; });
      if (shut.length >= Math.max(2, .3 * said.length)) out.push({at: +c.audioAt(shut[0].start).toFixed(2), severity: 'problem', text: `${name} is heard saying ${shut.length} word${shut.length > 1 ? 's' : ''} with the mouth shut (from "${shut[0].text}" at ${c.audioAt(shut[0].start).toFixed(2)} s)`});
    }
    return out;
  }},
  /** Captions in order, inside the film, each starting with its first word (with the film). */
  captions: {needs: ['captions'], run(c) {
    const out = [], cues = c.captions;
    cues.forEach((q, i) => {
      if (q.end <= q.start) out.push({at: q.start, severity: 'problem', text: `caption ${i + 1} ends before it starts`});
      if (i && q.start < cues[i - 1].end - 1e-3) out.push({at: q.start, severity: 'problem', text: `caption ${i + 1} starts before caption ${i} ends`});
    });
    const last = cues.at(-1);
    if (last && last.end > c.meta.video.seconds + .05) out.push({at: last.start, severity: 'problem', text: `the last caption ends at ${last.end.toFixed(2)} s, after the picture (${c.meta.video.seconds.toFixed(2)} s)`});
    if (c.film) {
      // Each cue against the word it starts with, word by word in order: the captions drift if they wander from the voice.
      const said = c.words.flatMap(w => w.text.split(/\s+/).map(normSpeech).filter(Boolean).map(t => ({t, start: w.start})));
      let k = 0, worst = null;
      for (const q of cues) {
        const tokens = q.text.split(/\s+/).map(normSpeech).filter(Boolean);
        if (!tokens.length) continue;
        let j = k; while (j < said.length && said[j].t !== tokens[0]) j++;
        if (j >= said.length) break;
        const drift = q.start - c.audioAt(said[j].start);
        if (!worst || Math.abs(drift) > Math.abs(worst.drift)) worst = {drift, at: q.start, text: q.text};
        k = j + tokens.length;
      }
      if (worst && Math.abs(worst.drift) > FINISHED.drift) out.push({at: worst.at, severity: 'problem', text: `a caption ("${worst.text.slice(0, 40)}") starts ${Math.abs(worst.drift).toFixed(2)} s ${worst.drift > 0 ? 'after' : 'before'} its first word is said`});
    }
    return out;
  }},
});
export const FINISHED_CHECK_NAMES = Object.freeze(Object.keys(FINISHED_CHECKS));

/**
 * Check a finished video. Returns {file, seconds, fps, frames, checked: [names], skipped: [{check, why}],
 * findings: [{check, at, severity, text}], ok}.
 * @param file      the video
 * @param film      the compiled film it was made from (compileFilm): with it the checks know what was meant
 * @param intro     seconds of intro before the film (renderFilm's intro), 0 by default
 * @param from, to  the part of the film the file shows (renderFilm's from, to): the whole film by default
 * @param captions  a caption file (.vtt or .srt) to check against the film
 * @param joins     frame indexes where segments meet (a segmented render's report: segments[i].f0)
 * @param voiced    true when the render mixed a voice (makeFilm: a narration folder): the voice check needs it
 * @param expect    {seconds, tolerance?}: the length the brief asks for
 * @param checks    which checks (FINISHED_CHECK_NAMES); a check that needs what is not given is skipped, saying why
 * @param probe     the adapter that reads the file (ffmpegProbe())
 */
export async function checkVideo({file, film = null, intro = 0, from = 0, to = null, captions = null, joins = [], voiced = false, expect = {}, checks = FINISHED_CHECK_NAMES, probe = ffmpegProbe()}) {
  if (typeof file !== 'string' || !file) throw new Error('checkVideo: give the video file');
  for (const name of checks) if (!Object.hasOwn(FINISHED_CHECKS, name)) throw new Error(`checkVideo: "${name}" is not a check; the checks are ${FINISHED_CHECK_NAMES.join(', ')}`);
  if (!(Number.isFinite(intro) && intro >= 0)) throw new Error('checkVideo: intro is the seconds of intro before the film, 0 or more');
  if (!(Number.isFinite(from) && from >= 0)) throw new Error('checkVideo: from is where the part starts on the film\'s clock, 0 or more');
  if (to !== null && !(Number.isFinite(to) && to > from)) throw new Error('checkVideo: to is where the part ends on the film\'s clock, after from');
  const meta = probe.probe(file), fps = meta.video.fps;
  // The time model, as the renderer makes the file: the intro's frames (round(intro × fps)), then frame f of the part
  // shows the film at from + f / fps; the sound is the intro's (intro seconds), then the part's from `from` on.
  const end = Math.min(to ?? film?.total ?? Infinity, film?.total ?? Infinity), introFrames = Math.round(intro * fps);
  const part = {from, to: Number.isFinite(end) ? end : from + Math.max(0, meta.video.seconds - intro), intro, introFrames};
  const has = {film: Boolean(film), captions: Boolean(captions), frames: true, voiced: voiced === true};
  const why = {film: 'it compares the file with the film: give the film', captions: 'give the caption file', voiced: 'the render has no voice (voiced: true when it does)'};
  const run = checks.filter(n => FINISHED_CHECKS[n].needs.every(x => has[x])), skipped = checks.filter(n => !run.includes(n)).map(n => ({check: n, why: why[FINISHED_CHECKS[n].needs.find(x => !has[x])]}));
  const c = {meta, film, expect, ...part, joins, cuts: [], timeOf: f => f / fps,
    /** The film's time at file frame f (the intro's frames show none: the part's first frame then). */
    filmTime: f => from + Math.max(0, f - introFrames) / fps,
    /** Where film time t is heard in the file. */
    audioAt: t => intro + (t - from),
    /** Whether a word is in the part rendered. */
    inPart: w => w.start >= from - 1e-9 && w.start < part.to,
    paint: film ? filmPainter(film, FINISHED.width) : null};
  // A cut shows on the first frame the encoder draws at or after it (from + f / fps >= start, as the film decides).
  const firstFrameAt = s => { let f = Math.max(0, Math.ceil((s - from) * fps) - 1); while (from + f / fps < s) f++; while (f > 0 && from + (f - 1) / fps >= s) f--; return f; };
  if (film?.rows) c.cuts = film.rows.filter(r => r.enter?.type === 'cut' && r.start > from && r.start < part.to).map(r => ({frame: introFrames + firstFrameAt(r.start), what: r.stage ?? r.paths[0]}));
  // What is said, as the captions show it: spoken scenes only (a silent scene's directions are never captioned).
  if (film) c.words = spokenTracks(film).flatMap(t => t.words.filter(w => normSpeech(w.text)).map(w => ({text: w.text, start: t.offset + w.start}))).filter(c.inPart);
  if (run.some(n => FINISHED_CHECKS[n].needs.includes('frames'))) {
    const width = FINISHED.width, height = Math.max(2, 2 * Math.round(width * meta.video.height / meta.video.width / 2));
    const d = [0], skip = [0, 0], spreads = []; let prev = null, prev2 = null;
    await probe.frames(file, {width, height}, (i, grey) => {
      spreads.push(spread(grey, VIDEO));
      if (prev) d.push(diff(prev, grey, VIDEO));
      if (prev2) skip.push(diff(prev2, grey, VIDEO));
      prev2 = prev; prev = grey;
    });
    c.frames = {d, skip, spreads};
  }
  // The sound at 16 kHz: an /s/ or /sh/ lives above 4 kHz, and read at 8 kHz it would be taken for silence.
  if ((run.includes('voice') || run.includes('lipsync')) && meta.audio) { const rate = 16000; c.sound = {rate, samples: probe.sound(file, {rate})}; }
  if (captions) c.captions = readCaptions(readFileSync(captions, 'utf8'));
  // A check may find it has nothing to compare ({skip: why}): it is then skipped, saying why, not counted as passed.
  const checked = [], findings = [];
  for (const name of run) {
    const result = FINISHED_CHECKS[name].run(c);
    if (result && !Array.isArray(result) && result.skip) { skipped.push({check: name, why: result.skip}); continue; }
    checked.push(name); findings.push(...result.map(f => ({check: name, ...f})));
  }
  findings.sort((a, b) => a.at - b.at);
  return {file, seconds: meta.video.seconds, fps, frames: c.frames ? c.frames.spreads.length : meta.video.frames, checked, skipped, findings, ok: !findings.some(f => f.severity === 'problem')};
}
