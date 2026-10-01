/**
 * Make a film as a footprintjs flowchart. Each stage is recorded as it runs, so every film comes
 * with its making-of record (making-of.json): the stages and how long they took, every phrase
 * that triggered a drawing and when (and the recipe entry that asked for it), the director's notes
 * as applied, the pacing, the tools and versions used.
 *
 * Heavy things (the compiled film, canvases) never enter the flowchart's tracked scope; stages
 * pass small values and file paths, as footprintjs expects.
 */
import {readFileSync, writeFileSync, mkdirSync, cpSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {flowChart, narrative} from 'footprintjs';
import {applyPacing, validatePacing, paceTimings} from './pacing.mjs';
import {compileFilm} from './film.mjs';
import {renderFilm} from './render.mjs';

const require = createRequire(import.meta.url);
/** A dependency's installed version (from its package.json, even when its exports hide that file). */
const version = name => {
  try { return require(`${name}/package.json`).version; } catch {}
  try { let dir = path.dirname(require.resolve(name)); for (let i = 0; i < 6; i++, dir = path.dirname(dir)) { try { const p = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')); if (p.name === name) return p.version; } catch {} } } catch {}
  return 'unknown';
};
const TOOLS = () => [
  {name: 'footprintjs', version: version('footprintjs'), license: 'MIT', detail: 'the making-of pipeline and its record'},
  {name: '@napi-rs/canvas', version: version('@napi-rs/canvas'), license: 'MIT', detail: 'drawing'},
  {name: 'perfect-freehand', version: version('perfect-freehand'), license: 'MIT', detail: 'marker strokes'},
  {name: 'roughjs', version: version('roughjs'), license: 'MIT', detail: 'sketched shapes'},
  {name: 'shiki', version: version('shiki'), license: 'MIT', detail: 'code tokens'},
  {name: 'Caveat', license: 'SIL OFL 1.1', detail: 'handwriting font'},
  {name: 'FFmpeg', license: 'LGPL/GPL (separate program)', detail: 'encoding and mixing'},
];
const sha = text => createHash('sha256').update(text).digest('hex').slice(0, 16);

/**
 * @param storyboard, recipe, data, kits, theme, root, hostKeys — as compileFilm
 * @param narrationDir a folder with the UNPACED timings.json and the scene audio (or null → silent;
 *                     then pass `timings` with word times, e.g. evenTimings(storyboard))
 * @param pacing       {sceneTail, holds, tails?, voiceSpeed?} — applied to a copy of the narration, or
 *                     to the word times of a silent cut (the same holds, so a pause-and-guess waits)
 * @param strings      the string table for the film's language ({key: text}); lang names it
 * @param out          the .mp4 to write; making-of.json is written beside it
 * @param render       extra options for renderFilm (intro, stamp, from, to, width, height…)
 */
export async function makeFilm({storyboard, recipe, data = null, kits = [], theme, root = process.cwd(), hostKeys = [], narrationDir = null, timings = null, pacing = null, strings = null, lang = null, out, render = {}}) {
  const dir = path.dirname(path.resolve(out)); mkdirSync(dir, {recursive: true});
  let film, paced, result;
  const stages = {
    'check-inputs': scope => {
      if (!storyboard?.scenes?.length) throw new Error('The storyboard has no scenes');
      // A silent cut has no voice speed to check; its holds and tails are checked the same way.
      if (pacing) validatePacing(narrationDir ? pacing : {voiceSpeed: 1, ...pacing}, storyboard);
      scope.scenes = storyboard.scenes.length;
      scope.storyboardHash = sha(JSON.stringify(storyboard)); scope.recipeHash = sha(JSON.stringify(recipe));
      if (strings) { scope.stringsHash = sha(JSON.stringify(strings)); scope.lang = lang; }
    },
    'pace-narration': async scope => {
      if (narrationDir) {
        const copy = path.join(dir, 'narration'); rmSync(copy, {recursive: true, force: true}); cpSync(narrationDir, copy, {recursive: true});
        const raw = JSON.parse(readFileSync(path.join(copy, 'timings.json'), 'utf8'));
        paced = pacing ? await applyPacing({runDir: copy, board: storyboard, timings: raw, pacing}) : raw;
        writeFileSync(path.join(copy, 'timings.json'), JSON.stringify(paced, null, 2));
        scope.narration = copy;
      } else {
        if (!timings) throw new Error('A silent film needs timings (word times per scene)');
        paced = pacing ? paceTimings(storyboard, timings, pacing) : timings; scope.narration = null;
      }
      scope.seconds = +paced.scenes.reduce((n, s) => n + s.duration, 0).toFixed(3);
      scope.pacing = paced.pacing ?? null;
    },
    'compile-film': async scope => {
      film = await compileFilm({storyboard, timings: paced, recipe, data, kits, theme, root, strings, hostKeys});
      scope.beats = film.beats.length; scope.sounds = film.sounds.length; scope.total = +film.total.toFixed(3);
    },
    'render-film': async scope => {
      result = await renderFilm({film, storyboard, timings: paced, narrationDir: scope.narration, out, ...render});
      scope.out = result.out; scope.chapters = result.chapters;
    },
  };
  const ids = Object.keys(stages), trace = narrative();
  let chart = flowChart(ids[0], stages[ids[0]], ids[0]);
  for (const id of ids.slice(1)) chart = chart.addFunction(id, stages[id], id);
  const run = await chart.build().recorder(trace).run();
  const record = {
    schemaVersion: 1, made: new Date().toISOString(), out: result.out, seconds: result.seconds, chapters: result.chapters,
    inputs: {storyboard: run.state?.storyboardHash, recipe: run.state?.recipeHash, scenes: storyboard.scenes.length, ...(strings ? {strings: run.state?.stringsHash} : {})},
    ...(strings ? {strings: {lang, used: film.strings}} : {}),
    pacing: paced.pacing ?? null,
    ...(result.poster ? {poster: {file: path.basename(result.poster), at: film.posterAt}} : {}),
    ...(film.reading.length ? {reading: {tooShort: film.reading}} : {}),
    // Each beat: what was said, when, and the recipe entry that asked for it.
    beats: film.beats.map(({ref, t, path}) => ({said: Array.isArray(ref) ? {scene: ref[0], phrase: ref[1], plus: ref[2] ?? 0} : ref, at: t, ...(path ? {entry: path} : {})})),
    ...(film.notes.length ? {notes: film.notes} : {}),
    sounds: film.sounds.length,
    tools: TOOLS(),
    pipeline: trace.getEntries(),
  };
  const makingOf = path.join(dir, 'making-of.json');
  writeFileSync(makingOf, JSON.stringify(record, null, 2));
  return {...result, makingOf};
}
