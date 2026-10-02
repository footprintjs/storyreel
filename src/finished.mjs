/**
 * Checks on the finished file: what a person would catch watching the render — a frame that flashes, a
 * blank stretch, a hand-over a frame early or late, a join that repeats or skips a frame, picture and sound
 * of different lengths, a voice that is not there, captions that drift — read from the video itself, after
 * it is made. A render can be right in every check before it and still come out wrong (a segment joined a
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
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {normSpeech} from './clock.mjs';

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
});

/**
 * The default probe: FFmpeg and ffprobe (beside the FFmpeg given, or on the PATH). probe(file) → {seconds, video: {seconds, fps, width, height, frames},
 * audio: {seconds} | null}; frames(file, {width, height}) → every frame as grey levels (limited range, as
 * the video stores them); sound(file, {rate}) → mono samples.
 */
export function ffmpegProbe({ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg', ffprobe = process.env.FFPROBE_BIN || (ffmpeg.includes('/') ? path.join(path.dirname(ffmpeg), 'ffprobe') : 'ffprobe')} = {}) {
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

/** The checks, each a strategy over what the probe read: {needs, run(c) → findings}. */
export const FINISHED_CHECKS = Object.freeze({
  /** The picture and the sound run as long as each other, as the film, and as the brief. */
  duration: {needs: [], run(c) {
    const out = [], {video, audio} = c.meta, frame = 1 / video.fps;
    if (audio && Math.abs(audio.seconds - video.seconds) > frame + .05) out.push({at: Math.min(audio.seconds, video.seconds), severity: 'problem', text: `the sound runs ${(audio.seconds - video.seconds).toFixed(2)} s ${audio.seconds > video.seconds ? 'longer' : 'shorter'} than the picture (${audio.seconds.toFixed(2)} s against ${video.seconds.toFixed(2)} s)`});
    if (c.film) { const meant = c.film.total + c.intro; if (Math.abs(video.seconds - meant) > 1.5 * frame) out.push({at: video.seconds, severity: 'problem', text: `the picture is ${video.seconds.toFixed(2)} s; the film is ${meant.toFixed(2)} s${c.intro ? ' with its intro' : ''}`}); }
    if (c.expect.seconds !== undefined) {
      const tolerance = c.expect.tolerance ?? Math.max(1, c.expect.seconds * .02);
      if (Math.abs(video.seconds - c.expect.seconds) > tolerance) out.push({at: video.seconds, severity: 'problem', text: `it is ${video.seconds.toFixed(1)} s; the brief asks for ${c.expect.seconds} s (± ${tolerance} s)`});
    }
    return out;
  }},
  /** No blank stretch (one colour) the film does not mean: a dip to black is meant, a frame of nothing is not. */
  blank: {needs: ['frames'], run(c) {
    const out = [], {spreads} = c.frames;
    for (let f = 0; f < spreads.length;) {
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
    for (let f = 1; f + 1 < d.length; f++) {
      if (!(d[f] > T && d[f + 1] > T && skip[f + 1] < .35 * Math.min(d[f], d[f + 1]))) continue;
      if (c.paint) {
        const [a, b, e] = [f - 1, f, f + 1].map(k => c.paint(c.filmTime(k)));
        if (diff(a, b) > T && diff(b, e) > T && diff(a, e) < .35 * Math.min(diff(a, b), diff(b, e))) continue;   // the film flashes there itself
      }
      out.push({at: c.timeOf(f), severity: 'problem', text: `a flash frame at ${c.timeOf(f).toFixed(2)} s (frame ${f}): it differs from the frames on both sides, which are alike`});
    }
    return out;
  }},
  /** Every cut lands on its frame, and a join (where segments meet) neither repeats a frame nor skips one. */
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
      if (j < 2 || j + 1 >= d.length) continue;
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
      const words = c.film.clock.words(scene);
      if (words.length < 3) continue;
      const quiet = words.filter(w => dB(w.start + c.intro, w.end + c.intro) < FINISHED.quiet);
      if (quiet.length >= .6 * words.length) out.push({at: words[0].start + c.intro, severity: 'problem', text: `the voice is not there in scene ${scene}: ${quiet.length} of ${words.length} words are quieter than ${FINISHED.quiet} dBFS`});
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
    if (!c.meta.audio || typeof c.film.mouthsAt !== 'function') return [];
    // Mouth and voice every 10 ms, whatever the frame rate: a mouth is a function of time, and a syllable
    // (about six a second) is lost between frames at a low frame rate.
    const out = [], step = .01, rate = c.sound.rate, samples = c.sound.samples, n = Math.floor(c.film.total / step);
    const level = i => { const i0 = Math.floor((i * step + c.intro) * rate), i1 = Math.min(samples.length, Math.floor(((i + 1) * step + c.intro) * rate)); let e = 0; for (let k = i0; k < i1; k++) e += samples[k] * samples[k]; return i1 > i0 ? Math.sqrt(e / (i1 - i0)) : 0; };
    const voice = Float64Array.from({length: n}, (_, i) => level(i)), dB = v => 20 * Math.log10(v || 1e-9);
    // Every mouth (NaN where it is not drawn).
    const mouths = new Map();
    for (let i = 0; i < n; i++) for (const m of c.film.mouthsAt(i * step)) {
      if (!mouths.has(m.who)) mouths.set(m.who, new Float64Array(n).fill(NaN));
      const a = mouths.get(m.who); a[i] = Math.max(Number.isNaN(a[i]) ? 0 : a[i], m.open);
    }
    if (!mouths.size) return [];
    const smooth = a => Float64Array.from(a, (_, i) => { let s = 0, k = 0; for (let g = i - 1; g <= i + 1; g++) if (g >= 0 && g < a.length && !Number.isNaN(a[g])) { s += a[g]; k++; } return k ? s / k : 0; });
    const v = smooth(voice), when = i => +(i * step + c.intro).toFixed(2);
    for (const [who, open] of mouths) {
      const name = who ?? 'the narrator', m = smooth(open), drawn = Array.from(open, x => !Number.isNaN(x));
      // How far the mouth is from the voice: the shift that lines the two up best, where the mouth is drawn.
      const corr = lag => { let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, k = 0;
        for (let i = 0; i < n; i++) { const g = i - lag; if (g < 0 || g >= n || !drawn[i]) continue; const x = m[i], y = v[g]; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; k++; }
        const cov = sxy / k - (sx / k) * (sy / k), sd = Math.sqrt(Math.max(0, sxx / k - (sx / k) ** 2) * Math.max(0, syy / k - (sy / k) ** 2)); return k * step > 1 && sd > 0 ? cov / sd : -1; };
      const reach = Math.round(.4 / step), lags = Array.from({length: 2 * reach + 1}, (_, i) => i - reach), score = new Map(lags.map(l => [l, corr(l)]));
      const best = lags.reduce((b, l) => (score.get(l) > score.get(b) ? l : b), 0), seconds = best * step;
      if (score.get(best) > .3 && (seconds > FINISHED.soundLeads || -seconds > FINISHED.soundTrails))
        out.push({at: when(drawn.indexOf(true)), severity: 'problem', text: `${name}'s mouth ${seconds > 0 ? 'trails' : 'leads'} the voice by ${Math.round(Math.abs(seconds) * 1000)} ms (the eye notices sound ${seconds > 0 ? 'more than 45 ms ahead' : 'more than 125 ms behind'})`});
      // A mouth moving while nothing is heard (a run of at least a tenth of a second).
      for (let i = 0; i < n;) {
        if (!(open[i] > FINISHED.open && dB(voice[i]) < FINISHED.quiet)) { i++; continue; }
        let g = i; while (g < n && (open[g] > .05 || g - i < 5) && dB(voice[g]) < FINISHED.quiet) g++;
        if ((g - i) * step >= .1) out.push({at: when(i), severity: 'problem', text: `${name}'s mouth moves for ${((g - i) * step).toFixed(2)} s at ${when(i).toFixed(2)} s while nothing is heard`});
        i = g;
      }
      // Heard speaking with the mouth shut: words said by this speaker, loud, while the drawn mouth stays closed.
      const said = c.film.timings.scenes.flatMap(sc => c.film.clock.words(sc.id)).filter(w => (c.film.clock.speaking((w.start + w.end) / 2)?.speaker ?? null) === who);
      const shut = said.filter(w => { let drawnHere = false, loud = false, moved = false;
        for (let i = Math.floor(w.start / step); i < Math.min(n, Math.ceil(w.end / step)); i++) { if (drawn[i]) drawnHere = true; if (dB(voice[i]) > FINISHED.quiet + 10) loud = true; if (open[i] > .05) moved = true; }
        return drawnHere && loud && !moved; });
      if (shut.length >= Math.max(2, .3 * said.length)) out.push({at: when(Math.floor(shut[0].start / step)), severity: 'problem', text: `${name} is heard saying ${shut.length} word${shut.length > 1 ? 's' : ''} with the mouth shut (from "${shut[0].text}" at ${(shut[0].start + c.intro).toFixed(2)} s)`});
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
        const drift = q.start - (said[j].start + c.intro);
        if (!worst || Math.abs(drift) > Math.abs(worst.drift)) worst = {drift, at: q.start, text: q.text};
        k = j + tokens.length;
      }
      if (worst && Math.abs(worst.drift) > FINISHED.drift) out.push({at: worst.at, severity: 'problem', text: `a caption ("${worst.text.slice(0, 40)}") starts ${Math.abs(worst.drift).toFixed(2)} s ${worst.drift > 0 ? 'after' : 'before'} its first word is said`});
    }
    return out;
  }},
});
export const FINISHED_CHECK_NAMES = Object.freeze(Object.keys(FINISHED_CHECKS));

/** A caption file's cues: [{start, end, text}] (WebVTT or SRT). */
export function readCaptions(text) {
  const time = s => { const p = s.trim().replace(',', '.').split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
  return String(text).replace(/\r/g, '').split(/\n{2,}/).map(block => {
    const lines = block.split('\n'), at = lines.findIndex(l => l.includes('-->'));
    if (at < 0) return null;
    const [a, b] = lines[at].split('-->');
    return {start: time(a), end: time(b.trim().split(/\s+/)[0]), text: lines.slice(at + 1).join(' ').trim()};
  }).filter(Boolean);
}

/**
 * Check a finished video. Returns {file, seconds, fps, frames, checked: [names], skipped: [{check, why}],
 * findings: [{check, at, severity, text}], ok}.
 * @param file      the video
 * @param film      the compiled film it was made from (compileFilm): with it the checks know what was meant
 * @param intro     seconds of intro before the film (renderFilm's intro), 0 by default
 * @param captions  a caption file (.vtt or .srt) to check against the film
 * @param joins     frame indexes where segments meet (a segmented render's report: segments[i].f0)
 * @param voiced    true when the render mixed a voice (makeFilm: a narration folder): the voice check needs it
 * @param expect    {seconds, tolerance?}: the length the brief asks for
 * @param checks    which checks (FINISHED_CHECK_NAMES); a check that needs what is not given is skipped, saying why
 * @param probe     the adapter that reads the file (ffmpegProbe())
 */
export async function checkVideo({file, film = null, intro = 0, captions = null, joins = [], voiced = false, expect = {}, checks = FINISHED_CHECK_NAMES, probe = ffmpegProbe()}) {
  if (typeof file !== 'string' || !file) throw new Error('checkVideo: give the video file');
  for (const name of checks) if (!Object.hasOwn(FINISHED_CHECKS, name)) throw new Error(`checkVideo: "${name}" is not a check; the checks are ${FINISHED_CHECK_NAMES.join(', ')}`);
  if (!(Number.isFinite(intro) && intro >= 0)) throw new Error('checkVideo: intro is the seconds of intro before the film, 0 or more');
  const meta = probe.probe(file), fps = meta.video.fps;
  const has = {film: Boolean(film), captions: Boolean(captions), frames: true, voiced: voiced === true};
  const why = {film: 'it compares the file with the film: give the film', captions: 'give the caption file', voiced: 'the render has no voice (voiced: true when it does)'};
  const run = checks.filter(n => FINISHED_CHECKS[n].needs.every(x => has[x])), skipped = checks.filter(n => !run.includes(n)).map(n => ({check: n, why: why[FINISHED_CHECKS[n].needs.find(x => !has[x])]}));
  const c = {meta, film, intro, expect, timeOf: f => f / fps, filmTime: f => f / fps - intro, paint: film ? filmPainter(film, FINISHED.width) : null, joins, cuts: []};
  if (film?.rows) c.cuts = film.rows.filter(r => r.enter?.type === 'cut').map(r => ({frame: Math.ceil((r.start + intro) * fps - 1e-6), what: r.paths[0]}));
  if (film) c.words = film.timings.scenes.flatMap((s, i) => (film.clock.shownWords?.(i) ?? []).filter(w => normSpeech(w.text)).map(w => ({text: w.text, start: film.clock.offsets[i] + w.start})));
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
  if ((run.includes('voice') || run.includes('lipsync')) && meta.audio) { const rate = 8000; c.sound = {rate, samples: probe.sound(file, {rate})}; }
  if (captions) c.captions = readCaptions(readFileSync(captions, 'utf8'));
  const findings = run.flatMap(name => FINISHED_CHECKS[name].run(c).map(f => ({check: name, ...f}))).sort((a, b) => a.at - b.at);
  return {file, seconds: meta.video.seconds, fps, frames: c.frames ? c.frames.spreads.length : meta.video.frames, checked: run, skipped, findings, ok: !findings.some(f => f.severity === 'problem')};
}
