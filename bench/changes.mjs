#!/usr/bin/env node
/**
 * What the chat edit loop costs: a film of about three minutes (bench/counting-film.mjs, drawn as the series' drafts
 * are: 1280×720, burned captions, the draft encode, a DRAFT stamp) in a project folder, its full render made from the
 * project's config (tools.mjs · fullRender), then one-scene recipe edits — frames drawn and wall time, per step:
 *
 *   node bench/changes.mjs [--fps 30] [--out <folder>]
 *
 * The steps, in order, each from the cache the one before left: a cold full render; one edit to a scene's recipe entry
 * (a beat of the `right` shot moved), seen the old way — a full render; another edit to the same entry, seen the new way
 * — `storyreel changes` (what it redraws), `storyreel changes --render` (only those pieces drawn, and the review clip),
 * then the full render, which should draw nothing. Each step runs in a fresh process, as an agent runs it; its CPU time
 * (the process and the FFmpeg it runs, from /usr/bin/time) is beside its wall time: on a busy machine quote the CPU
 * time. Quote a figure only from a run of this script; the PR that changes it says which.
 */
import {cpSync, mkdirSync, writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {countingFilm} from './counting-film.mjs';

const here = fileURLToPath(new URL('.', import.meta.url)), repo = path.join(here, '..'), cli = path.join(repo, 'src', 'cli.mjs');
const flag = (name, otherwise) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : otherwise; };
const fps = Number(flag('fps', 30)), ws = path.resolve(flag('out', mkdtempSync(path.join(tmpdir(), 'storyreel-changes-'))));

// The project: the kit, the film's inputs, and the config the command line reads (its full render's options with it).
cpSync(path.join(here, 'quick-edit-kit'), path.join(ws, 'kit'), {recursive: true});
mkdirSync(path.join(ws, 'film'), {recursive: true});
cpSync(path.join(repo, 'examples', 'worlds', 'count.ts'), path.join(ws, 'film', 'count.ts'));
const {storyboard, recipe} = countingFilm();
writeFileSync(path.join(ws, 'film', 'storyboard.json'), JSON.stringify(storyboard, null, 1));
writeFileSync(path.join(ws, 'film', 'recipe.json'), JSON.stringify(recipe, null, 1));
const sr = pathToFileURL(path.join(repo, 'src')).href;
writeFileSync(path.join(ws, 'storyreel.config.mjs'), `import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {cartoonKit} from '${sr}/index.mjs';
import {benchKit} from './kit/index.mjs';
const read = f => JSON.parse(readFileSync(new URL('./film/' + f, import.meta.url), 'utf8'));
export default {film: () => ({storyboard: read('storyboard.json'), recipe: read('recipe.json'), kits: [cartoonKit, benchKit],
  root: fileURLToPath(new URL('./film/', import.meta.url)), out: fileURLToPath(new URL('./out/', import.meta.url)),
  layout: {format: 'landscape', captions: true, scale: 2 / 3}, render: {quality: 'draft', stamp: 'DRAFT', fps: ${fps}}})};
`);
// The full render, as a project's own script makes it: makeFilm on the config's full render. Prints what it drew.
writeFileSync(path.join(ws, 'render.mjs'), `import {readFileSync} from 'node:fs';
const {makeFilm} = await import('${sr}/index.mjs'), {loadInputs, fullRender} = await import('${sr}/tools.mjs');
const result = await makeFilm(fullRender(await loadInputs()));
const picture = JSON.parse(readFileSync(result.makingOf, 'utf8')).picture;
const drawn = picture.segments.filter(s => s.status === 'rendered').reduce((n, s) => n + s.frames, 0), frames = picture.segments.reduce((n, s) => n + s.frames, 0);
console.log(JSON.stringify({drawn, frames, line: picture.line}));
`);

const TIME = existsSync('/usr/bin/time') ? '/usr/bin/time' : null;
/** One step in a process of its own, in the project folder: its output, wall time and CPU time (the process and its FFmpeg). */
const run = args => {
  const t0 = performance.now(), r = TIME ? spawnSync(TIME, ['-p', process.execPath, ...args], {cwd: ws, encoding: 'utf8', maxBuffer: 1 << 26}) : spawnSync(process.execPath, args, {cwd: ws, encoding: 'utf8', maxBuffer: 1 << 26});
  const wall = (performance.now() - t0) / 1000;
  if (r.status !== 0) throw new Error(`${args.join(' ')} failed:\n${String(r.stderr).slice(-2000)}`);
  const cpu = ['user', 'sys'].map(k => Number(String(r.stderr).match(new RegExp(`^${k}\\s+([\\d.]+)`, 'm'))?.[1] ?? NaN)).reduce((a, b) => a + b, 0);
  return {out: String(r.stdout).trim(), wall, cpu};
};
const full = () => { const r = run(['render.mjs']), said = JSON.parse(r.out.split('\n').at(-1)); return {...r, drawn: said.drawn, frames: said.frames, said: said.line}; };
const changes = (...more) => {
  const r = run([cli, 'changes', ...more]), drawn = Number(/drawn \((\d+) frames\)/.exec(r.out)?.[1] ?? 0);
  return {...r, drawn, said: r.out.replace(ws, '<project>')};
};
/** A one-scene recipe edit: a beat of the evening shot (the `right` world, the fifth scene) waits for another phrase. */
const edit = (beat, phrase) => {
  const file = path.join(ws, 'film', 'recipe.json'), r = JSON.parse(readFileSync(file, 'utf8')), world = r.stages.find(s => s.scene === 'right').world;
  world.beats[beat] = ['right', phrase];
  writeFileSync(file, JSON.stringify(r, null, 1));
};

console.log(`StoryReel at ${repo} · ${fps} fps · project ${ws}`);
const rows = [];
const step = (what, r) => { rows.push({what, ...r}); console.log(`${what}: ${r.drawn} frames drawn, ${r.wall.toFixed(1)} s, ${r.cpu.toFixed(1)} CPU s\n  ${r.said.split('\n').join('\n  ')}`); return r; };
const cold = step('cold full render (an empty cache)', full());
edit(0, 'the bar fills');
step('one-scene edit, seen the old way: the full render', full());
edit(1, 'the row shrinks');
step('another edit to that scene: storyreel changes', changes());
step('storyreel changes --render', changes('--render'));
step('then the full render', full());
console.log(`\nfilm: ${cold.frames} frames (${(cold.frames / fps / 60).toFixed(1)} min at ${fps} fps)\n\n| step | frames drawn | wall time | CPU time |\n|---|---|---|---|\n${rows.map(r => `| ${r.what} | ${r.drawn} | ${r.wall.toFixed(1)} s | ${r.cpu.toFixed(1)} s |`).join('\n')}`);
if (!flag('out')) rmSync(ws, {recursive: true, force: true});
