/**
 * How a render is made ready, the one way makeFilm (pipeline.mjs) and a preview of what changed (changes.mjs) do it,
 * step by step: the cast put into the text, the inputs checked, the out folder taken, the voice paced in a copy of its
 * own, the film compiled, its picture planned. makeFilm runs each step in a stage of its own; prepareFull runs the same
 * steps in the same order, up to the plan. A step makeFilm adds before its plan belongs here — or a preview's keys
 * drift from the full render's (test/changes.test.mjs pins them equal: silent, voiced, cast, a layout, a scene grown).
 */
import path from 'node:path';
import {rmSync} from 'node:fs';
import {readCast, withCast} from './cast.mjs';
import {copyVoice, requireVoiceApart, writeOutput, securePath, makeFolder} from './files.mjs';
import {applyPacing, validatePacing, paceTimings} from './pacing.mjs';
import {withDirections} from './clock.mjs';
import {compileFilm} from './film.mjs';
import {prepareRender, closeRender} from './render.mjs';
import {checkVideoStrategy} from './whole.mjs';
import {pictureStrategy, checkPictureOptions} from './picture.mjs';
import {makeScratch, sweepScratch} from './scratch.mjs';

/** The cast's names put into the text before anything reads it (cast.mjs): the storyboard, the recipe and the strings a render reads. */
export function castFilm({storyboard, recipe, strings = null, cast = null}) {
  if (!cast) return {storyboard, recipe, strings};
  const c = readCast(cast);
  return {storyboard: withCast(storyboard, c, 'storyboard'), recipe: withCast(recipe, c, 'recipe'), strings: strings ? withCast(strings, c, 'strings') : strings};
}

/** The kits' code fingerprint a render keys its pieces by (makeFilm's `code`): a fingerprint, or left out. */
export function checkCode(code) {
  if (code !== null && !(typeof code === 'string' && code.trim())) throw new Error("code is a fingerprint of the kits' drawing code (codeFingerprint([kitsFolder])), or left out");
}

/** What a render refuses before it paces anything: a storyboard without scenes, and its pacing (a silent cut's has no voice speed to check). */
export function checkInputs({storyboard, narrationDir = null, pacing = null}) {
  if (!storyboard?.scenes?.length) throw new Error('The storyboard has no scenes: give it scenes: [{id, narration} or {id, silent: [[what happens, seconds]]}]');
  if (pacing) validatePacing(narrationDir ? pacing : {voiceSpeed: 1, ...pacing}, storyboard);
}

/**
 * The out folder's REAL path (files.mjs · securePath: no folder on the way another user could rearrange), the out file
 * in it, and the voice kept apart from it (it is paced there and then replaces its narration folder: files.mjs ·
 * requireVoiceApart). Nothing is made yet. Returns {dir, out}.
 */
export function outFolder({out, narrationDir = null}) {
  const dir = securePath(path.dirname(path.resolve(out)));
  if (narrationDir) requireVoiceApart(narrationDir, dir);
  return {dir, out: path.join(dir, path.basename(path.resolve(out)))};
}

/**
 * The film's timings as a render paces them: a voice's, copied into `copy` (a new folder of the run's own: files.mjs ·
 * copyVoice) and paced there — its audio rewritten, its timings.json the paced one — or a silent film's word times,
 * paced. A voice knows only the spoken scenes: a silent scene it left out gets its directions' timing (clock.mjs ·
 * withDirections).
 */
export async function pacedTimings({storyboard, narrationDir = null, timings = null, pacing = null, copy = null}) {
  if (narrationDir) {
    const raw = copyVoice(narrationDir, copy);
    const paced = pacing ? await applyPacing({runDir: copy, board: storyboard, timings: raw, pacing}) : withDirections(storyboard, raw);
    writeOutput(path.join(copy, 'timings.json'), JSON.stringify(paced, null, 2));
    return paced;
  }
  if (!timings) throw new Error('A silent film needs timings (word times per scene)');
  return pacing ? paceTimings(storyboard, timings, pacing) : withDirections(storyboard, timings);
}

/** The film a render draws: compiled from its inputs (makeFilm's, with its defaults) and its paced timings, recorded. */
export const compileForRender = ({storyboard, recipe, data = null, kits = [], theme, root = process.cwd(), hostKeys = [], strings = null, lang = null, cast = null, strategies = null, reducedMotion = false}, timings) =>
  compileFilm({storyboard, timings, recipe, data, kits, theme, root, strings, lang, hostKeys, cast, strategies, reducedMotion, record: true});

/**
 * The render's job and its picture strategy for a compiled film (render.mjs · prepareRender, picture.mjs ·
 * pictureStrategy): what the plan is made from. `music` is the song as the render places it. `held(job)` is told the
 * job as soon as it is made, so a caller's record keeps it (what its sweep removed) even when the strategy refuses —
 * which leaves no working folder.
 */
export function planPicture({film, storyboard, timings, narrationDir, out, render = {}, code = null, music = null}, held = () => {}) {
  const job = prepareRender({film, storyboard, timings, narrationDir, out, ...render, ...(music ? {music} : {})});
  held(job);
  try { return {job, video: checkVideoStrategy(pictureStrategy(render, job, {kitsCode: code}))}; } catch (e) { closeRender(job); throw e; }
}

/**
 * The full render made ready as makeFilm makes it, up to its plan, for a preview: makeFilm's options in (out, render
 * and code too), every step above in makeFilm's order. A film fitted to a song is refused: the fit moves its scenes,
 * and a preview does not run it. Returns {job, video, close}: close() removes the render's working files and the
 * voice's copy.
 */
export async function prepareFull({out, render = {}, code = null, music = null, narrationDir = null, timings = null, pacing = null, ...inputs}) {
  if (music) throw new Error('previewChanges: this film is fitted to a song (music), whose fit moves its scenes, and a preview does not run it: render it with makeFilm');
  if (typeof out !== 'string' || !out.trim()) throw new Error('previewChanges: give the full render\'s out (the video makeFilm writes): the cache beside it is what the preview compares with');
  if (!render || typeof render !== 'object' || Array.isArray(render)) throw new Error(`previewChanges: render is the full render's options (makeFilm's render), not ${JSON.stringify(render)}`);
  checkCode(code);
  const {storyboard, recipe, strings} = castFilm(inputs);
  checkPictureOptions(render);
  checkInputs({storyboard, narrationDir, pacing});
  const {dir, out: file} = outFolder({out, narrationDir});
  makeFolder(dir);
  sweepScratch(dir, '.narration');
  const copy = narrationDir ? makeScratch(dir, '.narration') : null;
  let job = null;
  const close = () => { closeRender(job); if (copy) rmSync(copy, {recursive: true, force: true}); };
  try {
    const paced = await pacedTimings({storyboard, narrationDir, timings, pacing, copy});
    const film = await compileForRender({...inputs, storyboard, recipe, strings}, paced);
    const {video} = planPicture({film, storyboard, timings: paced, narrationDir: copy, out: file, render, code}, made => { job = made; });
    return {job, video, close};
  } catch (e) { close(); throw e; }
}
