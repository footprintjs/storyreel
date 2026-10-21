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

const say = (...lines) => lines.join(' ');
const storyboard = {title: 'Counting', scenes: [
  {id: 'open', title: 'The board', narration: say('Here is our board. Today we count with pebbles, the way a shepherd did long ago, before anyone wrote numbers down.',
    'A shepherd had a flock to keep, and a field far from home. Every morning the sheep went out, and every evening they came back.',
    'But how could he know that every one of them came home? He had no numbers to count with, only his hands and the stones on the ground.',
    'So he picked up a pebble for each sheep. Watch the board, and we will do what he did, one stone at a time.')},
  {id: 'flock', title: 'The valley', narration: say('Now we are in the valley. The shepherd lets the sheep out, one by one, through the gate in the stone wall.',
    'As each sheep passes him, he drops one pebble into his bag. One sheep, one pebble. Another sheep, another pebble. He does not need to know any number.',
    'How many sheep went out? Three sheep went out, and there are three pebbles in the bag. The bag remembers for him.',
    'All day the sheep eat the grass, and the shepherd rests under the tree. In the evening, they all come home, and he takes one pebble out for each.',
    'If a pebble is left over, a sheep is missing, and he goes to look for it before the night comes down.')},
  {id: 'rule', title: 'The rule', narration: say('Here is the rule, written as code. One pebble for every sheep that goes out, and nothing else.',
    'The list of sheep is mapped to a list of pebbles, one for one. The length of that list is the count, and the code never needs to know it in advance.',
    'This is the same idea the shepherd had, written so a computer can follow it. A list on one side, a list on the other, matched one to one.',
    'When the lists match, the count is right. When they do not, something is missing, and the code can say so.')},
  {id: 'left', title: 'Morning', narration: say('In the morning the sun comes up over the hill, and the first sheep step out into the light.',
    'One, then another, then another: each one gets its pebble as it goes, and the row of pebbles grows across the page.',
    'The shepherd does not hurry. Each pebble is a promise that the sheep will be looked for if it does not come back.',
    'By the time the sun is high, the whole flock is out, and the row of pebbles is complete.')},
  {id: 'right', title: 'Evening', narration: say('In the evening the bar fills as the light goes, and the sheep come back down the hill.',
    'For every sheep through the gate, one pebble leaves the bag. The row shrinks as the flock comes home.',
    'When the last sheep is in, the bag is empty, and the shepherd knows that everyone is safe for the night.',
    'That is counting, the old way: one thing for one thing, matched until nothing is left over.')},
]};
const recipe = {
  story: {kit: 'whiteboard', defaultErase: null, erasers: {}, spots: [], items: [
    {at: ['open', 'Here is our board'], dur: 1.0, write: 'Counting with pebbles', x: 800, y: 200, size: 64, align: 'center'},
    {at: ['open', 'a pebble for each sheep'], dur: .4, draw: [['ellipse', 700, 480, 22, 16]], color: 'blue', size: 8, seed: 1},
    {at: ['open', 'a pebble for each sheep', .3], dur: .4, draw: [['ellipse', 800, 480, 22, 16]], color: 'blue', size: 8, seed: 2},
    {at: ['open', 'a pebble for each sheep', .6], dur: .4, draw: [['ellipse', 900, 480, 22, 16]], color: 'blue', size: 8, seed: 3}]},
  stages: [
    {type: 'world', scene: 'flock', enter: 'fade', world: {kit: 'cartoon', evening: ['flock', 'In the evening'],
      flock: {count: 3, missing: 0, out: {at: ['flock', 'lets the sheep out'], every: 1.2}, home: {at: ['flock', 'they all come home'], every: 1.0}},
      captions: [{at: ['flock', 'they all come home'], until: ['flock', 'they all come home', 3], text: 'three sheep · three pebbles'}],
      camera: [{at: ['flock', 'lets the sheep out'], to: [560, 640], zoom: 1.25}]}},
    {type: 'code', scene: 'rule', enter: 'wipe', chrome: false, file: 'count.ts', label: 'TYPESCRIPT', code: {file: 'count.ts', emphasis: {"'pebble'": 'known'}},
      reveal: [[0, ['rule', 'Here is the rule']], [1, ['rule', 'The length of that list']]],
      footer: {text: 'One pebble for every sheep.', at: ['rule', 'One pebble for every sheep']}},
    {type: 'world', scene: 'left', enter: 'torn', world: {kit: 'bench', shot: 'left', scene: 'left', beats: [['left', 'the first sheep step out'], ['left', 'the row of pebbles grows'], ['left', 'the whole flock is out']]}},
    {type: 'world', scene: 'right', enter: {type: 'iris', at: [800, 420]}, world: {kit: 'bench', shot: 'right', scene: 'right', beats: [['right', 'the sheep come back'], ['right', 'one pebble leaves the bag'], ['right', 'the bag is empty']]}},
  ],
};
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
