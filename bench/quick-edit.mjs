#!/usr/bin/env node
/**
 * What an edit costs to see: a film of 2½ minutes drawn as the series' drafts are (1280×720, burned captions, the draft
 * encode, a DRAFT stamp), then the edits a film gets, each rendered again — frames drawn and wall time, per step.
 *
 *   node bench/quick-edit.mjs [--repo <a StoryReel checkout>] [--mode default | rows] [--fps 30] [--out <folder>]
 *
 *   default  makeFilm with no `video`: what a script that names no strategy gets (0.17: every frame each time; 0.18:
 *            pieces kept beside the video)
 *   rows     0.17's opt-in: segmentedVideo with a folder store and the kit's code per shot (sourceCode), as the series'
 *            full render wires it
 *
 * The steps, in order, each from the cache the one before left: a cold render; one word re-voiced in a long scene
 * (the 39 s code scene: half a second longer, the rest of the scene after it); one shot's code edited (the kit's
 * `right` shot); a StoryReel change to a transition the film never plays (eraser); the stamp's label changed; and one
 * word re-voiced in the cartoon scene, whose clouds drift on the film clock (every piece of it that moves is drawn
 * again: its spot check sees the clouds move). Each step renders in a fresh process,
 * from a copy of the StoryReel checkout and of the kit that the step edits — the code a render runs is the code on disk.
 * Each step reports its wall time and its CPU time (the render and the FFmpeg it runs, from /usr/bin/time): on a busy
 * machine quote the CPU time. Quote a figure only from a run of this script; the PR that changes it says which.
 */
import {cpSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, existsSync, mkdtempSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {countingFilm} from './counting-film.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const flag = (name, otherwise) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : otherwise; };
const repo = path.resolve(flag('repo', path.join(here, '..'))), mode = flag('mode', 'default'), fps = Number(flag('fps', 30));
if (!['default', 'rows'].includes(mode)) throw new Error('--mode is default or rows');
const ws = path.resolve(flag('out', mkdtempSync(path.join(tmpdir(), 'storyreel-bench-'))));

// The workspace: StoryReel as the checkout has it (its packages linked, never copied), the kit, the film's inputs.
mkdirSync(path.join(ws, 'storyreel'), {recursive: true});
for (const f of ['src', 'fonts', 'themes', 'package.json']) cpSync(path.join(repo, f), path.join(ws, 'storyreel', f), {recursive: true});
if (!existsSync(path.join(ws, 'storyreel', 'node_modules'))) symlinkSync(path.join(existsSync(path.join(repo, 'node_modules')) ? repo : path.join(here, '..'), 'node_modules'), path.join(ws, 'storyreel', 'node_modules'), 'dir');
cpSync(path.join(here, 'quick-edit-kit'), path.join(ws, 'kit'), {recursive: true});
mkdirSync(path.join(ws, 'film'), {recursive: true});
cpSync(path.join(here, '..', 'examples', 'worlds', 'count.ts'), path.join(ws, 'film', 'count.ts'));

const {storyboard, recipe} = countingFilm();
writeFileSync(path.join(ws, 'film', 'storyboard.json'), JSON.stringify(storyboard, null, 1));
writeFileSync(path.join(ws, 'film', 'recipe.json'), JSON.stringify(recipe, null, 1));

/** One render, in a process of its own: the StoryReel and the kit on disk now. Prints {seconds, frames, drawn, pieces, reused, line}. */
const RENDER = `
import {readFileSync} from 'node:fs';
const ws = process.argv[2], [mode, label, revoiced] = [process.argv[3], process.argv[4], process.argv[5] ? process.argv[5].split(',').filter(Boolean) : []], fps = Number(process.argv[6]);
const sr = await import(ws + '/storyreel/src/index.mjs'), segments = await import(ws + '/storyreel/src/segments.mjs');
const {benchKit} = await import(ws + '/kit/index.mjs');
const read = f => JSON.parse(readFileSync(ws + '/film/' + f, 'utf8')), storyboard = read('storyboard.json'), recipe = read('recipe.json');
const timings = sr.evenTimings(storyboard);
for (const scene of revoiced) {   // one word of the scene re-voiced half a second longer: the rest of that scene after it moves
  const s = timings.scenes.find(x => x.id === scene), k = 30;
  s.words = s.words.map((w, i) => i < k ? w : i === k ? {...w, end: +(w.end + .5).toFixed(3)} : {...w, start: +(w.start + .5).toFixed(3), end: +(w.end + .5).toFixed(3)});
  s.duration = +(s.duration + .5).toFixed(3);
}
const kits = [sr.cartoonKit, benchKit];
const video = mode === 'rows' ? segments.segmentedVideo({store: segments.folderStore(ws + '/cache-rows'), recipe,
  code: segments.sourceCode(e => (e.world ?? e).kit === 'bench' ? [ws + '/kit/shots/' + (e.world ?? e).shot + '.mjs'] : [], {shared: [ws + '/kit/index.mjs']})}) : undefined;
const t0 = performance.now();
const result = await sr.makeFilm({storyboard, recipe, kits, root: ws + '/film', timings, out: ws + '/out/draft.mp4',
  render: {quality: 'draft', stamp: 'DRAFT · ' + label, fps, layout: {format: 'landscape', captions: true, scale: 2 / 3}, ...(video ? {video} : {})}});
const seconds = (performance.now() - t0) / 1000, frames = Math.ceil(result.seconds * fps), v = result.video;
const drawn = v ? v.segments.filter(s => s.status === 'rendered').reduce((n, s) => n + s.frames, 0) : frames;
console.log(JSON.stringify({seconds, frames, drawn, pieces: v ? v.segments.length : 1, reused: v ? v.reused : 0, line: v?.line ?? (v ? v.rendered + ' drawn, ' + v.reused + ' reused' : 'whole')}));
`;
writeFileSync(path.join(ws, 'render.mjs'), RENDER);
// Each render under /usr/bin/time: its CPU seconds (user + system, the render and every FFmpeg it waited for) beside its
// wall time — CPU time hardly moves when other work shares the machine; wall time does.
const TIME = existsSync('/usr/bin/time') ? '/usr/bin/time' : null;
const run = (label, revoiced = []) => {
  const args = [path.join(ws, 'render.mjs'), ws, mode, label, revoiced.join(','), String(fps)];
  const r = TIME ? spawnSync(TIME, ['-p', process.execPath, ...args], {encoding: 'utf8', maxBuffer: 1 << 26}) : spawnSync(process.execPath, args, {encoding: 'utf8', maxBuffer: 1 << 26});
  if (r.status !== 0) throw new Error(`the render failed (${label}):\n${String(r.stderr).slice(-2000)}`);
  const cpu = ['user', 'sys'].map(k => Number(String(r.stderr).match(new RegExp(`^${k}\\s+([\\d.]+)`, 'm'))?.[1] ?? NaN)).reduce((a, b) => a + b, 0);
  return {...JSON.parse(String(r.stdout).trim().split('\n').at(-1)), cpu};
};
const edit = (file, from, to) => { const f = path.join(ws, file), text = readFileSync(f, 'utf8'); if (!text.includes(from)) throw new Error(`${file}: "${from}" is not there to edit`); writeFileSync(f, text.replace(from, to)); };

const steps = [
  ['cold render (an empty cache)', () => run('v1')],
  ['one word re-voiced in a long scene', () => run('v1', ['rule'])],
  ["one shot's code edited", () => { edit('kit/shots/right.mjs', "'#c0392b'", "'#a93226'"); return run('v1', ['rule']); }],
  ['a StoryReel change to an unused transition', () => { edit('storyreel/src/transitions/paper/eraser.mjs', 'export const ERASER', '// a release changed the eraser\nexport const ERASER'); return run('v1', ['rule']); }],
  ['the stamp\'s label changed', () => run('v2', ['rule'])],
  ['one word re-voiced in the cartoon scene (its clouds drift on the film clock)', () => run('v2', ['rule', 'flock'])],
];
console.log(`StoryReel at ${repo} · mode ${mode} · ${fps} fps · workspace ${ws}`);
const rows = [];
for (const [what, step] of steps) {
  const r = step();
  rows.push({what, ...r});
  console.log(`${what}: ${r.drawn} of ${r.frames} frames drawn, ${r.seconds.toFixed(1)} s, ${r.cpu.toFixed(0)} CPU s — ${r.line}`);
}
console.log(`\n| step | frames drawn | wall time | CPU time |\n|---|---|---|---|\n${rows.map(r => `| ${r.what} | ${r.drawn} of ${r.frames} | ${r.seconds.toFixed(1)} s | ${r.cpu.toFixed(0)} s |`).join('\n')}`);
if (!flag('out')) rmSync(ws, {recursive: true, force: true});
