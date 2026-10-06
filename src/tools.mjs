/**
 * The review tools: one core for every way they are called — the command line (cli.mjs: `storyreel review`),
 * a skill that teaches the order (plugin/skills/storyreel-review/SKILL.md) and an MCP server. Each tool takes the
 * project (the film's inputs, from the project's storyreel.config.mjs) and returns text to read; a still returns
 * the picture's file too. Read first, look last: the timeline and the review are text, a still is the one picture.
 *
 * A project names its film in storyreel.config.mjs:
 *   export default {film: flags => ({storyboard, recipe, kits, root, narrationDir?, pacing?, layout?, out?, …})}
 * film() gets the command's flags (--ep ep1 --voice work/ep1/voice), so one config serves every episode.
 */
import path from 'node:path';
import {existsSync, readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {compileFilm, evenTimings, paceTimings, makeFilm} from './index.mjs';
import {contactSheet} from './sheet.mjs';
import {partWindow, partTimeline, timelineText} from './render.mjs';
import {formatScale} from './layout.mjs';
import {reviewPart} from './review.mjs';

export const CONFIG = 'storyreel.config.mjs';
const FILM_KEYS = ['storyboard', 'timings', 'recipe', 'kits', 'root', 'strings', 'data', 'theme', 'cast', 'lang', 'hostKeys'];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

/** The project: its config's film, compiled once (paced from the voice folder's timings.json when it names one). */
export async function loadProject({config = CONFIG, cwd = process.cwd(), ...flags} = {}) {
  const file = path.resolve(cwd, config);
  if (!existsSync(file)) throw new Error(`no ${config} in ${cwd}: a project names its film there — export default {film: flags => ({storyboard, recipe, kits, root, narrationDir?, pacing?, layout?, out?})}`);
  const made = (await import(pathToFileURL(file).href)).default;
  if (!made || typeof made.film !== 'function') throw new Error(`${config} must export default {film(flags)}, returning the film's inputs`);
  const inputs = await made.film(flags);
  for (const key of ['storyboard', 'recipe']) if (!inputs?.[key]) throw new Error(`${config}: film() must return the ${key}`);
  const voiced = inputs.narrationDir && existsSync(path.join(inputs.narrationDir, 'timings.json'));
  const timings = inputs.timings ?? (voiced ? paceTimings(inputs.storyboard, JSON.parse(readFileSync(path.join(inputs.narrationDir, 'timings.json'), 'utf8')), {voiceSpeed: 1, ...(inputs.pacing ?? {})}) : evenTimings(inputs.storyboard));
  const film = await compileFilm({...pick(inputs, FILM_KEYS), timings, root: inputs.root ?? cwd});
  return {film, inputs: {...inputs, timings, voiced}, cwd};
}

const scenesOf = v => (typeof v === 'string' ? v.split(',') : Array.isArray(v) ? v : []).map(s => String(s).trim()).filter(Boolean);
const partOf = ({scene, scenes, handles} = {}) => { const list = scenesOf(scenes ?? scene); return list.length ? {scenes: list, handles: handles === undefined ? 1.5 : +handles} : null; };
const head = (film, part, w) => `${part ? part.scenes.join(' + ') : 'the whole film'}: ${w.from.toFixed(2)}–${w.to.toFixed(2)} s of ${film.total.toFixed(2)} s`;

/** When each scene starts and each beat lands (times from the part's start). */
export async function timeline(project, args = {}) {
  const part = partOf(args), w = part ? partWindow(project.film, part) : {from: 0, to: project.film.total};
  return `${head(project.film, part, w)} (times from its start)\n${timelineText(partTimeline(project.film, w))}`;
}

/** What is wrong, read from the picture as text (review.mjs): times on the film clock. */
export async function review(project, args = {}) {
  const part = partOf(args), r = await reviewPart(project.film, {...(part ? {part} : {}), layout: project.inputs.layout ?? null});
  return `${head(project.film, part, r.window)} — review (${r.ran.join(', ') || 'no check fits'}):\n${r.text || 'nothing found'}`;
}

/** A quick look: the scenes with their handles, half size where the format allows, the draft encode; reviewed first. */
export async function part(project, args = {}) {
  const p = partOf(args); if (!p) throw new Error('part: name the scenes (scene: "a,b")');
  const read = await review(project, args), layout = project.inputs.layout ?? null;
  const half = layout && (() => { try { return formatScale(layout.format, .5); } catch { return 1; } })();
  const out = path.resolve(project.cwd, project.inputs.out ?? 'out', 'parts', `${p.scenes.join('+')}.mp4`), started = Date.now();
  const {inputs} = project;
  const result = await makeFilm({...pick(inputs, FILM_KEYS.filter(k => k !== 'timings')), root: inputs.root ?? project.cwd, out, check: 'report',
    ...(inputs.voiced ? {narrationDir: inputs.narrationDir, pacing: {voiceSpeed: 1, ...(inputs.pacing ?? {})}} : {timings: inputs.timings}),
    render: {part: p, quality: 'draft', stamp: `PART · ${p.scenes.join(' + ')}`, ...(layout ? {layout: {...layout, scale: half}} : {})}});
  const finished = JSON.parse(readFileSync(result.makingOf, 'utf8')).finished ?? {};
  return `${read}\n${result.out} · ${result.seconds.toFixed(1)} s · made in ${((Date.now() - started) / 1000).toFixed(1)} s · checks ${finished.ok ? 'clean' : finished.ok === false ? 'problems found' : 'not run'}${(finished.findings ?? []).map(f => `\n  ${f.text ?? JSON.stringify(f)}`).join('')}`;
}

/** Moments as "scene+seconds", or seconds on the film clock. */
function momentsOf(film, at) {
  const list = scenesOf(at); if (!list.length) throw new Error('still: name the moments (at: "scene+seconds,…")');
  return list.map(m => {
    const [id, off] = m.includes('+') ? m.split('+') : [null, m], known = !id || film.timings.scenes.some(s => s.id === id), t = known ? (id ? film.clock.start(id) : 0) + Number(off) : NaN;
    if (!Number.isFinite(t)) throw new Error(`still: "${m}" is not a moment (scene+seconds, or seconds; the scenes are ${film.timings.scenes.map(s => s.id).join(', ')})`);
    return {t: +Math.min(film.total - .001, Math.max(0, t)).toFixed(3), label: m};
  });
}
/** One picture to confirm the look: the moments side by side as a PNG. Returns {text, file}. */
export async function still(project, args = {}) {
  const moments = momentsOf(project.film, args.at), file = path.resolve(project.cwd, project.inputs.out ?? 'out', 'stills', `${scenesOf(args.at).join('_').replace(/[^\w+.-]/g, '-')}.png`);
  mkdirSync(path.dirname(file), {recursive: true});
  writeFileSync(file, await contactSheet(project.film, {moments, columns: Math.min(3, moments.length), width: +(args.width ?? 1200)}));
  return {text: `${file} · ${moments.length} frame${moments.length > 1 ? 's' : ''}: ${moments.map(m => `${m.label} (${m.t.toFixed(2)} s)`).join(', ')}`, file};
}

/** The tools, as the command line and an MCP server list them: what each does and what it takes. */
export const TOOLS = Object.freeze({
  timeline: {run: timeline, about: 'When each scene starts and each beat lands, as text (times from the part\'s start). Read it before choosing a moment to look at.',
    args: {scene: 'scene ids, comma-separated (default: the whole film)', handles: 'seconds of the film shown either side of the scenes (1.5)'}},
  review: {run: review, about: 'What is wrong, read from the picture as text: words under the captions, over each other, cut off at the edge, nothing changing for 5 s. Times on the film clock.',
    args: {scene: 'scene ids, comma-separated (default: the whole film)', handles: 'seconds either side (1.5)'}},
  part: {run: part, about: 'A quick look at scenes: rendered with 1.5 s of the film either side (both cuts seen), half size, draft encode; reviewed first. Prints the video\'s path.',
    args: {scene: 'scene ids, comma-separated (required)', handles: 'seconds either side (1.5)'}},
  still: {run: still, about: 'One picture to confirm the look: frames at the moments given, side by side, as a PNG. Look at it last, after the timeline and the review.',
    args: {at: 'moments: scene+seconds (or seconds), comma-separated (required)', width: 'the picture\'s width in pixels (1200)'}},
});
