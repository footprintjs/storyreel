// Breakdown specs written by hand, whose answers are known, and a reference film made with FFmpeg: what the remake tests
// plan from (remake.test.mjs, remake-starter.test.mjs).
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createCanvas, GlobalFonts} from '@napi-rs/canvas';

export const NOT_READ = Object.freeze({ran: false, why: 'no beat map was given (breakdown(file, {beatMap}))'});

/** A shot as a breakdown writes it: `seconds` long, coming in by `in`, lettered or not, still, moving or the camera. */
export const shot = (seconds, {enter = 'cut', took, text = false, motion = 'still', camera, blank = false} = {}) =>
  ({seconds, in: {kind: enter, ...(took ? {seconds: took} : {})}, motion: {verdict: motion, ...(camera ? {camera} : {})}, text: {verdict: text ? 'text' : 'no-text'}, ...(blank ? {blank: true} : {})});

/** A breakdown's spec of these shots, laid end to end: the first comes in by the start, the pacing counted from them. */
export function specOf(shots, {beats = NOT_READ, flashes = [], sound = true} = {}) {
  let at = 0;
  const laid = shots.map((x, i) => { const s = {index: i + 1, start: at, end: +(at + x.seconds).toFixed(3), seconds: x.seconds, ...x, in: i ? x.in : {kind: x.in.kind === 'fade-in' ? 'fade-in' : 'start', ...(x.in.kind === 'fade-in' ? {seconds: x.in.seconds} : {})}, out: {kind: 'cut'}}; at = s.end; return s; });
  const lengths = laid.map(x => x.seconds).sort((a, b) => a - b), m = lengths.length >> 1;
  const median = lengths.length % 2 ? lengths[m] : (lengths[m - 1] + lengths[m]) / 2;
  return {schemaVersion: 1, file: 'ref.mp4', video: {seconds: at, sound}, shots: laid, transitions: [], flashes: flashes.map(f => ({at: f})),
    pacing: {shots: laid.length, median, cutsPerMinute: +((laid.length - 1) / at * 60).toFixed(1)}, audio: {sound, beats}};
}
export const quickWords = n => Array.from({length: n}, () => shot(.3, {text: true}));
/** Beats read at `bpm`, sure or not, `on` of `of` judged cuts on a beat. */
export const beatsOf = ({bpm = 120, sure = true, on, of}) => ({ran: true, bpm, sure, judged: {grid: 'every', beats: 4, of: 4}, beats: [], drop: null,
  cuts: Array.from({length: of}, (_, i) => ({at: i, kind: 'cut', beat: i, off: 0, onBeat: i < on})), onBeat: on, of, within: .05});

const has = cmd => !spawnSync(cmd, ['-version']).error;
export const skip = has('ffmpeg') && has('ffprobe') ? false : 'needs ffmpeg and ffprobe';

/** Four lettered cards of 0.32 s, cut one to the next, then a blue card held 2 s, then a box moving across black for 2 s. */
export function makeReference(dir) {
  GlobalFonts.registerFromPath(fileURLToPath(new URL('../fonts/caveat/Caveat.ttf', import.meta.url)), 'Caveat');
  const cards = [['ONE', '#2b2d33'], ['TWO', '#7a1f1f'], ['MORE', '#1f4f7a'], ['NOW', '#2f6b2f']].map(([word, ground], i) => {
    const c = createCanvas(320, 180), x = c.getContext('2d');
    x.fillStyle = ground; x.fillRect(0, 0, 320, 180); x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '700 64px Caveat'; x.fillText(word, 160, 90);
    const file = path.join(dir, `word-${i}.png`); writeFileSync(file, c.toBuffer('image/png')); return file;
  });
  const V = 'format=yuv420p,setsar=1', file = path.join(dir, 'reference.mp4');
  const graph = [...cards.map((_, i) => `[${i}:v]fps=25,${V}[w${i}]`), `color=c=blue:s=320x180:r=25:d=2,${V}[b]`,
    'color=c=black:s=320x180:r=25:d=2[bg]', 'color=c=white:s=40x40:r=25:d=2[box]', `[bg][box]overlay=x='20+120*t':y=70,${V}[m]`,
    `${cards.map((_, i) => `[w${i}]`).join('')}[b][m]concat=n=${cards.length + 2}:v=1:a=0[v]`].join(';');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...cards.flatMap(f => ['-loop', '1', '-framerate', '25', '-t', '0.32', '-i', f]), '-filter_complex', graph, '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  return file;
}
