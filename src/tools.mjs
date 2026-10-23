/**
 * The review tools: one core for every way they are called — the command line (cli.mjs: `storyreel review`),
 * a skill that teaches the order (plugin/skills/storyreel-review/SKILL.md) and an MCP server. Each tool takes the
 * project (the film's inputs, from the project's storyreel.config.mjs) and returns text to read; a still or a strip
 * returns the picture's file too. Read first, look last: the timeline and the review are text, a still is the one picture.
 *
 * A project names its film in storyreel.config.mjs:
 *   export default {film: flags => ({storyboard, recipe, kits, root, narrationDir?, pacing?, layout?, out?, render?, code?, …})}
 * film() gets the command's flags (--ep ep1 --voice work/ep1/voice), so one config serves every episode. `render` and
 * `code` are the full render's (makeFilm's own): it writes its video into `out`, and `changes` compares with its cache
 * (fullRender).
 */
import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {writeOutput, outputFolder} from './files.mjs';
import {pathToFileURL} from 'node:url';
import {compileFilm, evenTimings, paceTimings, makeFilm, makeClock, withDirections} from './index.mjs';
import {checkPhrase, anchorsText, phrasesIn, exactPhrases} from './anchors.mjs';
export {shareCopy, SHARE_DEFAULTS} from './share.mjs';
import {previewChanges} from './changes.mjs';
import {castFilm} from './prepare.mjs';
import {CHANGES_DEFAULTS} from './segments.mjs';
import {clockOf, clockSeconds} from './clocktext.mjs';
import {clockTenths, checkScene, spokenText, spokenIn} from './clock.mjs';
import {sceneScript} from './script.mjs';
import {contactSheet} from './sheet.mjs';
import {partWindow, filmTimeline, timelineText, RENDER_DEFAULTS} from './render.mjs';
import {momentAt, sceneTime, sceneIds, placeOf, HUNDREDTH} from './momenttext.mjs';
import {formatScale} from './layout.mjs';
import {hashOf} from './hash.mjs';
import {reviewPart, reviewSummary, REVIEW_DEFAULTS, SUMMARY_TOP} from './review.mjs';

export const CONFIG = 'storyreel.config.mjs';
export {clockSeconds};
/** What the config's film() gives that draws the film (compileFilm's and makeFilm's own), and what only its full render reads (makeFilm's). */
const FILM_KEYS = ['storyboard', 'timings', 'recipe', 'kits', 'root', 'strings', 'data', 'theme', 'cast', 'lang', 'hostKeys', 'strategies', 'reducedMotion'];
const FULL_KEYS = ['music', 'check', 'expect', 'voiceCheck', 'claims', 'approval'];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

/**
 * The project's inputs as its config's film(flags) gives them, not yet timed: {inputs, cwd, said, raw} — `said` the
 * storyboard with the cast's names in it (prepare.mjs · castFilm), as a voice says it; `raw` its timings before any
 * pacing (the voice folder's timings.json, else even). What a tool that times the film itself reads (anchors).
 */
export async function readInputs({config = CONFIG, cwd = process.cwd(), ...flags} = {}) {
  const file = path.resolve(cwd, config);
  if (!existsSync(file)) throw new Error(`no ${config} in ${cwd}: a project names its film there — export default {film: flags => ({storyboard, recipe, kits, root, narrationDir?, pacing?, layout?, out?})}`);
  const made = (await import(pathToFileURL(file).href)).default;
  if (!made || typeof made.film !== 'function') throw new Error(`${config} must export default {film(flags)}, returning the film's inputs`);
  const inputs = await made.film(flags);
  for (const key of ['storyboard', 'recipe']) if (!inputs?.[key]) throw new Error(`${config}: film() must return the ${key}`);
  const voiced = Boolean(inputs.narrationDir && existsSync(path.join(inputs.narrationDir, 'timings.json')));
  const said = castFilm(inputs).storyboard;
  const raw = inputs.timings ?? (voiced ? JSON.parse(readFileSync(path.join(inputs.narrationDir, 'timings.json'), 'utf8')) : evenTimings(said));
  return {inputs: {...inputs, voiced}, cwd, said, raw};
}

/** Timings paced by the config's pacing (holds given, or the config's own), as makeFilm paces them; given timings as they are. */
const pacedOf = ({inputs, said, raw}, holds = inputs.pacing?.holds) => (inputs.timings ? inputs.timings
  : inputs.voiced || inputs.pacing ? paceTimings(said, raw, {voiceSpeed: 1, ...(inputs.pacing ?? {}), ...(inputs.pacing ? {holds} : {})}) : raw);

/**
 * The project's inputs: its config's film(flags), timed — paced from the voice folder's timings.json when it names one,
 * else evenly (and paced, when the config names a pacing, as makeFilm paces given timings) — and not compiled (what a
 * tool that prepares the film itself reads: changes).
 */
export async function loadInputs(options = {}) {
  const read = await readInputs(options);
  return {inputs: {...read.inputs, timings: pacedOf(read)}, cwd: read.cwd};
}

/** The project: its config's film, compiled once (paced from the voice folder's timings.json when it names one). */
export async function loadProject(options = {}) {
  const {inputs, cwd} = await loadInputs(options);
  return {film: await compileFilm({...pick(inputs, FILM_KEYS), timings: inputs.timings, root: inputs.root ?? cwd}), inputs, cwd};
}

/** The film's inputs as makeFilm takes them: a voiced film's voice and pacing (the voice paced as a render paces it), a silent one's timings. */
const filmOf = ({inputs, cwd}) => ({...pick(inputs, FILM_KEYS.filter(k => k !== 'timings')), root: inputs.root ?? cwd,
  ...(inputs.voiced ? {narrationDir: inputs.narrationDir, pacing: {voiceSpeed: 1, ...(inputs.pacing ?? {})}} : {timings: inputs.timings})});

/**
 * The project's full render, as makeFilm's options: the film, its video in the project's out folder (film.mp4: the cache
 * beside it is what `changes` compares with), the config's `render` (its layout, by default, the config's), `code`, and
 * the rest of makeFilm's own options the config gives (music, check, expect, voiceCheck, claims, approval). A project's
 * own render script makes the film the tools preview with makeFilm(fullRender(await loadInputs(flags))).
 */
export function fullRender(project) {
  const {inputs, cwd} = project, render = inputs.render ?? {};
  if (!render || typeof render !== 'object' || Array.isArray(render)) throw new Error(`${CONFIG}: render is the full render's options (makeFilm's render: quality, stamp, layout, …), not ${JSON.stringify(render)}`);
  return {...filmOf(project), ...pick(inputs, FULL_KEYS), out: path.join(path.resolve(cwd, inputs.out ?? 'out'), 'film.mp4'),
    render: {...(inputs.layout ? {layout: inputs.layout} : {}), ...render}, ...(inputs.code ? {code: inputs.code} : {})};
}

/**
 * The tools' defaults, as data: a part's handles (seconds either side, a render's), a strip's frames and their rate, a
 * still's width (px); a sheet's seconds between frames, frames to a sheet and width (px).
 */
export const TOOL_DEFAULTS = Object.freeze({handles: RENDER_DEFAULTS.handles, frames: 12, fps: 30, width: 1200, every: 4, per: 20, sheetWidth: 1600});

/** A flag that is on: true, or 'true' as the command line and MCP hand it. */
const yes = v => v === true || v === 'true';
/** What a summary says to list the rest: the review's own flag. */
const FULL_HINT = '--full lists every one';
const scenesOf = v => (typeof v === 'string' ? v.split(',') : Array.isArray(v) ? v : []).map(s => String(s).trim()).filter(Boolean);


/** A part: its scenes (scene: "a,b"), or a window on the film clock (from and to), with the seconds shown either side. */
const partOf = ({scene, scenes, handles, from, to} = {}) => {
  const list = scenesOf(scenes ?? scene), timed = from !== undefined || to !== undefined, h = handles === undefined ? TOOL_DEFAULTS.handles : +handles;
  if (list.length && timed) throw new Error('name the scenes (scene) or a window (from, to), not both');
  if (!timed) return list.length ? {scenes: list, handles: h} : null;
  if (from === undefined || to === undefined) throw new Error('a window needs both from and to (seconds, or m:ss)');
  const window = {from: clockSeconds(from, 'from'), to: clockSeconds(to, 'to')};
  if (!(window.to > window.from)) throw new Error(`to must come after from (${clockOf(window.from, 'exact')} to ${clockOf(window.to, 'exact')})`);
  return {window, handles: h};
};
/** Where a part lies on the film clock with its handles: its scenes' (render.mjs · partWindow), or its window's, held to the film. */
const spanOf = (film, part) => {
  if (!part.window) return partWindow(film, part);
  if (!(typeof part.handles === 'number' && part.handles >= 0 && part.handles <= 10)) throw new Error('handles is the seconds shown before and after the part, 0–10 (1.5 by default)');
  if (part.window.from >= film.total) throw new Error(`from (${clockOf(part.window.from, 'exact')}) is past the film's end (${clockOf(film.total, 'exact')})`);
  return {from: Math.max(0, +(part.window.from - part.handles).toFixed(3)), to: Math.min(film.total, +(part.window.to + part.handles).toFixed(3))};
};
/** A part as it is said: its scenes, or its window on the film clock. */
const nameOf = part => (part.window ? `${clockOf(part.window.from, 'exact')}–${clockOf(part.window.to, 'exact')}` : part.scenes.join(' + '));
const head = (film, part, w) => `${part ? nameOf(part) : 'the whole film'}: ${w.from.toFixed(2)}–${w.to.toFixed(2)} s of ${film.total.toFixed(2)} s`;

/** What a timeline's times count from, as its header says: a scene's, or the film's. */
const SCENE_TIMES = 'times: scene+seconds from that scene\'s start, then the film clock', FILM_TIMES = 'times: seconds from the film\'s start';

/**
 * When each scene starts and each beat lands, in the still tool's own words (momenttext.mjs), so a time read here goes
 * to still --at or strip --at as it is. For scenes: scene+seconds from the start of the scene each line falls in — a
 * line in the handles counts from its own scene, the one before or after, so no time is negative and none needs a
 * new form — then the film clock (m:ss.t). For a window or the whole film: seconds on the film clock.
 */
export async function timeline(project, args = {}) {
  const {film} = project, part = partOf(args), w = part ? spanOf(film, part) : {from: 0, to: film.total}, scenes = Boolean(part?.scenes);
  const time = scenes ? r => `${sceneTime(film, r.t)} (${clockTenths(r.t)})` : r => r.t.toFixed(2);
  return `${head(film, part, w)} (${scenes ? SCENE_TIMES : FILM_TIMES})\n${timelineText(filmTimeline(film, w), {time})}`;
}

/**
 * What is wrong, read from the picture as text (review.mjs): times on the film clock. "Nothing changes" is a frozen
 * picture; "nothing new" is a picture that moves while nothing new comes. loop: 'true' when the part is made to loop:
 * the end of its own scenes (the handles are not the part) must come round to their start.
 */
export async function review(project, args = {}) {
  const part = partOf(args), loop = yes(args.loop);
  const r = await reviewPart(project.film, {...(part?.window ? spanOf(project.film, part) : part ? {part} : {}), layout: project.inputs.layout ?? null, loop});
  const said = yes(args.full) ? `${r.text || 'nothing found'}${r.verdicts?.length ? `\nverdicts:\n${r.verdictText}` : ''}` : reviewSummary(r, {more: FULL_HINT});
  return `${head(project.film, part, r.window)} — review (${r.ran.join(', ') || 'no check fits'}):\n${said}`;
}

/** A quick look: the scenes (or a window: from, to) with their handles, half size where the format allows, the draft encode; reviewed first. */
export async function part(project, args = {}) {
  const p = partOf(args); if (!p) throw new Error('part: name the scenes (scene: "a,b") or a window on the film clock (from, to: seconds or m:ss)');
  const read = await review(project, args), layout = project.inputs.layout ?? null;
  const half = layout && (() => { try { return formatScale(layout.format, .5); } catch { return 1; } })();
  const name = p.window ? `window-${p.window.from}-${p.window.to}` : p.scenes.join('+');
  const out = path.resolve(project.cwd, project.inputs.out ?? 'out', 'parts', `${name}.mp4`), started = Date.now();
  const result = await makeFilm({...filmOf(project), out, check: 'report',
    render: {...(p.window ? spanOf(project.film, p) : {part: p}), quality: 'draft', stamp: `PART · ${nameOf(p)}`, ...(layout ? {layout: {...layout, scale: half}} : {})}});
  const finished = JSON.parse(readFileSync(result.makingOf, 'utf8')).finished ?? {};
  const found = finished.findings ?? [], shown = yes(args.full) ? found : found.slice(0, SUMMARY_TOP);
  return `${read}\n${result.out} · ${result.seconds.toFixed(1)} s · made in ${((Date.now() - started) / 1000).toFixed(1)} s · checks ${finished.ok ? 'clean' : finished.ok === false ? 'problems found' : 'not run'}${shown.map(f => `\n  ${f.text ?? JSON.stringify(f)}`).join('')}${found.length > shown.length ? `\n  … ${found.length - shown.length} more: ${FULL_HINT}` : ''}`;
}

/**
 * Moments as a still or a strip takes them (momenttext.mjs · momentAt), each held to the film and labelled as written;
 * `tool` is the tool that asked, so a refusal names it.
 */
function momentsOf(film, at, tool) {
  const list = scenesOf(at); if (!list.length) throw new Error(`${tool}: name the moments (at: "scene+seconds,…")`);
  return list.map(m => ({t: heldTo(film, momentAt(film, m, tool)), label: m}));
}
/**
 * A time held to the film: a picture is taken at the film's last millisecond at most. Never rounded: a scene a voice
 * paced starts between milliseconds, and a time rounded down to one would show the scene before.
 */
const heldTo = (film, t) => Math.min(film.total - .001, Math.max(0, t));
/** A still's or a strip's width: whole pixels, 100–4000 (a call names it, and the picture is made that wide). */
function widthOf(args, tool) {
  const width = Number(args.width ?? TOOL_DEFAULTS.width);
  if (!(Number.isInteger(width) && width >= 100 && width <= 4000)) throw new Error(`${tool}: width must be a whole number of pixels 100–4000, not ${JSON.stringify(args.width)}`);
  return width;
}
/** The project's stills folder, <out>/stills: a real folder of its own, never a link (files.mjs · outputFolder). */
const stillsFolder = project => outputFolder(path.resolve(project.cwd, project.inputs.out ?? 'out'), 'stills');
/** The longest name a picture is given (a file name holds 255 bytes): past it, cut, with a short hash of the whole. */
const NAME_MOST = 100;
/**
 * A picture's file name from what it shows: letters, digits, _ + . and - kept (ASCII), anything else a -. One that lost
 * a letter or a digit (words in another script: two phrases would meet in one name) ends in a hash of the whole, and so
 * does a longer one (a still of many moments), cut first: every name can be written, and two never meet.
 */
function pictureName(text) {
  const name = text.replace(/[^\w+.-]/g, '-'), lost = /[\p{L}\p{N}]/u.test(text.replace(/\w/g, ''));
  return name.length <= NAME_MOST && !lost ? name : `${name.slice(0, NAME_MOST - 17)}-${hashOf(text)}`;
}

/** The most frames one still holds. */
const MOST_FRAMES = 30;

/**
 * One picture to confirm the look: frames side by side as a PNG, at the moments named (at: namedFrames) or at every
 * beat of one scene (beats: sceneBeats). Returns {text, file}.
 */
export async function still(project, args = {}) {
  if (args.at !== undefined && args.beats !== undefined) throw new Error('still: give the moments (at) or a scene whose every beat to show (beats), not both');
  const {film} = project, shot = args.beats === undefined ? namedFrames(film, args) : sceneBeats(film, args), width = widthOf(args, 'still');
  const {moments} = shot, file = path.join(stillsFolder(project), `${pictureName(shot.name)}.png`);
  writeOutput(file, await contactSheet(film, {moments, columns: Math.min(3, moments.length), width}));
  return {text: `${file} · ${moments.length} frame${moments.length > 1 ? 's' : ''}${shot.of ?? ''}: ${moments.map(m => `${m.label} (${m.t.toFixed(2)} s)`).join(', ')}${shot.rest ?? ''}`, file};
}

/** The moments a still names (at), at most MOST_FRAMES: {moments, name}. from and to belong to beats. */
function namedFrames(film, args) {
  if (args.at === undefined) throw new Error('still: name the moments (at: "scene+seconds,…") or a scene whose every beat to show (beats: "scene")');
  if (args.from !== undefined || args.to !== undefined) throw new Error('still: from and to choose which of a scene\'s beats to show (beats: "scene"); with at, name the moments themselves');
  const moments = momentsOf(film, args.at, 'still');
  if (moments.length > MOST_FRAMES) throw new Error(`still: at most ${MOST_FRAMES} moments in one picture, not ${moments.length}`);
  return {moments, name: scenesOf(args.at).join('_')};
}

/**
 * A frame at each beat in one scene (beatTimes), labelled with its scene+seconds and what is said there. from and to
 * (moments, as at takes them) keep the beats between, each to half a hundredth, so a time the timeline printed keeps
 * its own beat. At most MOST_FRAMES: the rest are counted, never dropped unsaid, and the text says the call that shows
 * them. {moments, name, of, rest}.
 */
function sceneBeats(film, {beats, from, to}) {
  const scene = oneScene(film, beats), bound = (v, name) => (v === undefined ? null : momentAt(film, String(v).trim(), `still (${name})`));
  const lo = bound(from, 'from') ?? -Infinity, hi = bound(to, 'to') ?? Infinity, all = beatTimes(film, scene);
  const frames = all.filter(f => f.t >= lo - HUNDREDTH && f.t <= hi + HUNDREDTH), range = `${from !== undefined ? ` from ${from}` : ''}${to !== undefined ? ` to ${to}` : ''}`;
  if (!all.length) throw new Error(`still: ${scene} has no beats: the recipe keys nothing to what is said there (name moments instead: at: "${scene}+1.5")`);
  if (!frames.length) throw new Error(`still: no beat in ${scene}${range} (its beats: ${sceneTime(film, all[0].t)} to ${sceneTime(film, all.at(-1).t)})`);
  const moments = frames.slice(0, MOST_FRAMES).map(f => ({t: heldTo(film, f.t), label: `${sceneTime(film, f.t)} ${f.said.join(' ')}`}));
  const rest = frames.length - moments.length;
  return {moments, name: `beats-${scene}${from !== undefined ? `-from-${from}` : ''}${to !== undefined ? `-to-${to}` : ''}`,
    of: `${rest ? ` of ${frames.length}` : ''}, one at each beat in ${scene}${range}`,
    rest: rest ? `; the other ${rest}: the same call with --from ${shellWord(sceneTime(film, frames[MOST_FRAMES].t))}` : ''};
}

/**
 * Each time a beat lands in one scene, with what is said there: [{t, said}], in order — the beats the timeline prints
 * against it (render.mjs · filmTimeline; momenttext.mjs · placeOf), several landing together one time. A scene id given
 * twice is its last scene, as on the clock. A beat a hair before its scene's start (its time kept to the millisecond)
 * is taken at the start, so its frame is that scene's.
 */
function beatTimes(film, scene) {
  const index = sceneIds(film).lastIndexOf(scene), start = film.clock.offsets[index], out = [];
  for (const r of filmTimeline(film)) {
    if (r.kind !== 'beat' || placeOf(film, r.t).index !== index) continue;
    const t = Math.max(r.t, start), said = `"${r.phrase}"`, last = out.at(-1);
    if (last?.t === t) { if (!last.said.includes(said)) last.said.push(said); } else out.push({t, said: [said]});
  }
  return out;
}

/** The one scene a still's beats are of, or a refusal naming the fix. */
function oneScene(film, beats) {
  const ids = sceneIds(film), list = scenesOf(beats), scenes = `the scenes are ${ids.join(', ')}`;
  if (list.length === 1 && ids.includes(list[0])) return list[0];
  if (list.length > 1) throw new Error(`still: beats names one scene, not ${list.length}: one still a scene (${scenes})`);
  throw new Error(list.length && !yes(beats) ? `still: no scene called "${list[0]}" (${scenes})` : `still: beats names the scene whose every beat to show (${scenes})`);
}
/** A value as a shell takes it in a command a line suggests: as it is when plain, else in quotes. */
const shellWord = v => (/^[\w+.:@{}-]+$/.test(v) ? v : JSON.stringify(v));

/**
 * The whole film (or its scenes, or a window) at a glance, for a reviewer — a person, or an agent that reads pictures:
 * a frame every `every` seconds, `per` to a sheet (five across), each labelled with its time and scene. A sheet of
 * scenes shows them alone (handles 0 unless asked). Returns {text, file, files}: the sheets' paths and the times each spans.
 */
export async function sheet(project, args = {}) {
  const part = partOf({...args, handles: args.handles ?? 0}), w = part ? spanOf(project.film, part) : {from: 0, to: project.film.total};
  const every = Number(args.every ?? TOOL_DEFAULTS.every), per = Number(args.per ?? TOOL_DEFAULTS.per), width = widthOf({width: args.width ?? TOOL_DEFAULTS.sheetWidth}, 'sheet');
  if (!(every >= .25 && every <= 60)) throw new Error(`sheet: every is the seconds between frames, 0.25–60, not ${JSON.stringify(args.every)}`);
  if (!(Number.isInteger(per) && per >= 2 && per <= 60)) throw new Error(`sheet: per is how many frames a sheet holds, a whole number 2–60, not ${JSON.stringify(args.per)}`);
  const moments = [];
  for (let k = 0; w.from + k * every < w.to - 1e-6; k++) { const t = +(w.from + k * every).toFixed(3); moments.push({t, label: project.film.clock.locate(t).id}); }
  const name = pictureName(part ? nameOf(part) : 'film'), files = [];
  for (let k = 0; k * per < moments.length; k++) {
    const frames = moments.slice(k * per, (k + 1) * per), file = path.join(stillsFolder(project), `sheet-${name}-${k + 1}.png`);
    writeOutput(file, await contactSheet(project.film, {moments: frames, columns: Math.min(5, frames.length), width}));
    files.push({file, from: frames[0].t, to: frames.at(-1).t});
  }
  return {text: `${head(project.film, part, w)}: ${moments.length} frames, one every ${every} s, ${files.length} sheet${files.length > 1 ? 's' : ''} of up to ${per}\n${files.map(f => `${f.file} · ${clockTenths(f.from)}–${clockTenths(f.to)}`).join('\n')}`,
    file: files[0].file, files: files.map(f => f.file)};
}

/**
 * A strip: consecutive frames around one moment, side by side as a PNG — a fast move read frame by frame, so a
 * pop, a jump or two things crossing shows. Returns {text, file}.
 */
export async function strip(project, args = {}) {
  const named = scenesOf(args.at);
  if (named.length !== 1) throw new Error(`strip: name one moment (at: "scene+seconds")${named.length ? '; a still shows several (a phrase\'s own commas are left out: the moments are split at commas)' : ''}`);
  const [moment] = momentsOf(project.film, named, 'strip'), frames = +(args.frames ?? TOOL_DEFAULTS.frames), fps = +(args.fps ?? TOOL_DEFAULTS.fps), width = widthOf(args, 'strip');
  if (!(Number.isInteger(frames) && frames >= 2 && frames <= 30)) throw new Error(`strip: frames must be a whole number 2–30, not ${JSON.stringify(args.frames)}`);
  if (!(Number.isFinite(fps) && fps >= 1 && fps <= 120)) throw new Error(`strip: fps must be 1–120 frames a second, not ${JSON.stringify(args.fps)}`);
  const first = moment.t - Math.floor(frames / 2) / fps, moments = [];
  for (let k = 0; k < frames; k++) {
    const t = +(first + k / fps).toFixed(3);
    if (t >= 0 && t < project.film.total) moments.push({t, label: `${k - Math.floor(frames / 2) >= 0 ? '+' : ''}${k - Math.floor(frames / 2)}`});
  }
  const file = path.join(stillsFolder(project), `strip-${pictureName(moment.label)}.png`);
  writeOutput(file, await contactSheet(project.film, {moments, columns: Math.min(6, moments.length), width}));
  return {text: `${file} · ${moments.length} frames at ${fps} fps around ${moment.label} (${moment.t.toFixed(2)} s): frame 0 is the moment`, file};
}

/**
 * Every phrase the film is keyed to, checked in one pass (anchors.mjs): the pacing's holds against the voice as it
 * was said, then the recipe's beats in a compile that notes each phrase not as written instead of stopping at the first
 * (compileFilm's anchors: 'note'). A hold not said is paced at the nearest words said instead — with none (a moment its
 * scene does not have), after the scene's last word (lastWords) — its place in the list kept, so a pacing refusal names
 * the right hold. When the compile stops anyway (a kit refusing a time stood in for),
 * the recipe's phrases are read from the recipe itself (anchors.mjs · phrasesIn), so none is lost. The count, then
 * each phrase not said (with the nearest words said), said more than once (with words said only at each place), past
 * its nth or in no scene — where it is named. full: every one (default: the first 10 a kind).
 */
export async function anchors(project, args = {}) {
  const {inputs, cwd, said, raw} = project, holds = inputs.pacing?.holds ?? [], holdRef = h => ({scene: h.scene, phrase: h.after});
  // (The voice leaves its silent scenes out: they are filled in as pacing fills them, so the clock has every scene.)
  const spoken = makeClock(said, withDirections(said, raw));
  const held = holds.map((h, i) => ({ref: holdRef(h), path: `pacing.holds[${i}]`, how: 'pauseAfter', ...checkPhrase(spoken, holdRef(h))}));
  const placed = holds.map((h, i) => {
    if ([null, 'ambiguous'].includes(held[i].problem)) return h;
    const words = held[i].problem === 'missing' ? (held[i].near?.phrase ?? lastWords(spoken, h.scene)) : null;
    return words ? {...h, after: words} : null;
  });
  let film = null, stopped = null, noted = [];
  try { film = await compileFilm({...pick(inputs, FILM_KEYS), timings: pacedOf(project, placed.filter(Boolean)), root: inputs.root ?? cwd, anchors: 'note'}); noted = film.anchors; }
  catch (e) { stopped = e.message; noted = e.anchors ?? []; }
  // Every place is said on the film's clock (the paced film says the same words), so the report has one clock: the
  // holds are read again on it, so their times and their fixes are the film's too.
  const clock = film?.clock ?? spoken, recipe = path => (path === null ? null : `recipe.${path}`);
  const heldOn = film ? holds.map((h, i) => ({ref: holdRef(h), path: `pacing.holds[${i}]`, how: 'pauseAfter', ...checkPhrase(clock, holdRef(h))})) : held;
  const notes = [...heldOn.filter(n => n.problem), ...noted.map(n => ({...n, path: recipe(n.path)}))];
  let checked = holds.length + new Set((film?.beats ?? []).filter(b => b.path !== null).map(b => b.ref)).size;
  if (stopped) {
    // (Read from the recipe as written: what the compile noted before it stopped is said once, as it noted it.)
    const read = phrasesIn(inputs.recipe, new Set(said.scenes.map(sc => sc.id))), seen = new Set(noted.map(n => recipe(n.path)));
    for (const {ref, path} of read) { const c = checkPhrase(clock, ref); if (c.problem && !seen.has(recipe(path))) notes.push({ref, path: recipe(path), ...c}); }
    checked = holds.length + read.length;
  }
  return anchorsText({clock, notes, checked, stopped}, {full: yes(args.full)});
}

/**
 * Words that name a scene's last word alone, ending on it (anchors.mjs · exactPhrases, keeping its end): where a hold
 * with no nearest words stands in, so its pause is after the last word — its text alone would name the first place it
 * is said. null when no run of words names it alone: the hold is left out.
 */
function lastWords(clock, scene) {
  const last = clock.words(scene).at(-1);
  return last ? exactPhrases(clock, scene, [last], {keep: 'end'})[0]?.phrase ?? null : null;
}

/** JSON as one line that every reader splits as one line: U+0085, U+2028 and U+2029 written as escapes, as Python's splitlines() would break a line at them. */
const oneLine = value => JSON.stringify(value).replace(/[\u0085\u2028\u2029]/gu, ch => `\\u${ch.codePointAt(0).toString(16).padStart(4, '0')}`);

/**
 * The film's script, for a voice step in any language: script.mjs owns the grammar, and this hands it over as JSON, one
 * spoken scene a line — {id, speaker?, said, spoken?, lines, moments}: `speaker` the scene's own (the storyboard's);
 * `said` what is said and shown (the narration without its marks, the cast's names in); `lines` who says each quoted
 * line ({by, say, offset}, and `spoken` when the voice says something else in it); `moments` each mark's name and the
 * offset in `said` where its next word starts; `spoken` what the voice says, only when it is not `said` (number slots
 * in words: clock.mjs · spokenText, spokenIn). A speaker tag moves no mouth by itself: the voice step writes each
 * word's `speaker` from the lines into the timings, and the clock reads those. A silent scene says nothing: it is left
 * out. Every scene is checked first (clock.mjs · checkScene), so a mark not as written refuses here as in the compile.
 */
export async function script(project) {
  const scenes = project.said.scenes.flatMap((scene, i) => {
    if (checkScene(scene, i) === 'silent') return [];
    const {id, said, lines, moments} = sceneScript(scene, i), spoken = spokenText(scene);
    const voiced = lines.map(line => { const words = spokenIn(scene, line.offset, line.offset + line.say.length); return words === line.say ? line : {...line, spoken: words}; });
    return [{id, ...(scene.speaker ? {speaker: scene.speaker} : {}), said, ...(spoken === said ? {} : {spoken}), lines: voiced, moments}];
  });
  return `[\n${scenes.map(oneLine).join(',\n')}\n]`;
}

/**
 * What an edit changed, before the full render (changes.mjs · previewChanges, on the project's fullRender): one line per
 * changed stretch with why, then the count; render: 'true' draws only those pieces (kept: the full render draws none of
 * them again) and writes a short clip of them, <out>/changes/review.mp4.
 */
export async function changes(project, args = {}) {
  const handles = args.handles === undefined ? CHANGES_DEFAULTS.handles : Number(args.handles);
  return (await previewChanges(fullRender(project), {render: yes(args.render), handles})).text;
}

/** The full flag: by default a review says the counts, the verdicts that did not pass and the first findings (review.mjs · reviewSummary). */
const FULL_ARG = `true for every finding and every verdict's why (default: the counts, what did not pass, the first ${SUMMARY_TOP} findings)`;
/** The tools, as the command line and an MCP server list them: what each does and what it takes. */
export const TOOLS = Object.freeze({
  timeline: {run: timeline, about: 'When each scene starts and each beat lands, as text. For scenes, each time is scene+seconds from the start of the scene it falls in (today+64.70), the film clock beside it; for a window or the whole film, seconds on the film clock. Either goes to still --at or strip --at as it is. Read it before choosing a moment to look at.',
    args: {scene: 'scene ids, comma-separated (default: the whole film; or a window: from and to)', from: 'the window\'s start on the film clock: seconds or m:ss (0:12)', to: 'the window\'s end: seconds or m:ss',
      handles: `seconds of the film shown either side of the scenes or the window (${TOOL_DEFAULTS.handles})`}},
  review: {run: review, about: `What is wrong, read from the picture as text: words under the captions, over each other, cut off at the edge, the picture frozen for ${REVIEW_DEFAULTS.stillFor} s, nothing new for ${REVIEW_DEFAULTS.newEvery} s while it moves. Times on the film clock. Then three verdicts (passed, failed, or not run): no slideshow, drawn parts hold together, every number on screen has a source.`,
    args: {scene: 'scene ids, comma-separated (default: the whole film)', handles: `seconds either side (${TOOL_DEFAULTS.handles})`, loop: 'true when the part is made to loop: the end of its scenes (not the handles) must come round to their start', full: FULL_ARG}},
  part: {run: part, about: `A quick look at scenes, or at a window of the film (from, to): rendered with ${TOOL_DEFAULTS.handles} s of the film either side (both cuts seen), the draft encode (half size when the config names a layout); reviewed first. Prints the video's path.`,
    args: {scene: 'scene ids, comma-separated (or a window: from and to)', from: 'the window\'s start on the film clock: seconds or m:ss (0:12)', to: 'the window\'s end: seconds or m:ss', handles: `seconds either side (${TOOL_DEFAULTS.handles})`, full: FULL_ARG}},
  anchors: {run: anchors, load: 'config', about: 'Every phrase the film is keyed to (the recipe\'s beats, the pacing\'s holds), checked in one pass: each not said (with the nearest words said), each said more than once with no nth (with words said only at each place), where each is named. Run it after any edit to the narration, the recipe or the pacing.',
    args: {full: 'true for every phrase found (default: the first 10 of each kind)'}},
  script: {run: script, load: 'config', about: 'The film\'s script as JSON, one spoken scene a line, for a voice step in any language: {id, speaker?, said, spoken?, lines, moments} — what is said (its marks out), who says each quoted line ({@who}), each moment ({name}) and the offset in said where its next word starts; spoken where the voice says something else (number slots).',
    args: {}},
  changes: {run: changes, load: 'inputs', about: 'What an edit changed, before the full render: each changed stretch of the picture and why ("0:12–0:18 left · its recipe entries changed"), then the count. With render: only those pieces drawn (kept: the full render draws none of them again) and a short clip of them back to back, labelled with their times, the film either side and its voice under them. Compares with the cache of the config\'s full render (render, code) into out.',
    args: {render: 'true to draw the changed pieces and write the clip, <out>/changes/review.mp4', handles: `seconds of the film either side of each change in the clip (${CHANGES_DEFAULTS.handles})`}},
  still: {run: still, picture: true, about: 'One picture to confirm the look: frames side by side as a PNG, at the moments given (at) or at every beat of a scene (beats), each labelled. Look at it last, after the timeline and the review.',
    args: {at: 'moments: scene+seconds (today+64.70, as the timeline prints a scene\'s times), seconds or m:ss on the film clock, or what is said there — scene:phrase or scene:{moment}, +seconds after either (today:{hop}+0.5); comma-separated (a phrase\'s own commas left out), at most 30 (or beats)',
      beats: `a scene: a frame at each of its beats (the ones the timeline lists for it), labelled with its scene+seconds and what is said there; at most ${MOST_FRAMES} a picture, the rest named with the call that shows them (or at)`,
      from: 'with beats: the beats from this moment on (a moment as at takes it)', to: 'with beats: the beats up to this moment', width: `the picture's width in pixels, 100–4000 (${TOOL_DEFAULTS.width})`}},
  sheet: {run: sheet, picture: true, about: `The whole film at a glance, for a reviewer: a frame every ${TOOL_DEFAULTS.every} s, ${TOOL_DEFAULTS.per} to a sheet, each labelled with its time and scene, as PNGs (paths printed). Hand them with the script to someone checking the film.`,
    args: {scene: 'scene ids, comma-separated (default: the whole film; or a window: from and to)', from: 'the window\'s start on the film clock: seconds or m:ss', to: 'the window\'s end: seconds or m:ss',
      every: `seconds between frames (${TOOL_DEFAULTS.every})`, per: `frames a sheet (${TOOL_DEFAULTS.per})`, width: `each sheet's width in pixels, 100–4000 (${TOOL_DEFAULTS.sheetWidth})`}},
  strip: {run: strip, picture: true, about: 'A fast move frame by frame: consecutive frames around one moment, side by side, as a PNG — to catch a pop, a jump or two things crossing.',
    args: {at: 'the moment: scene+seconds (as the timeline prints a scene\'s times), seconds or m:ss on the film clock, or what is said there — scene:phrase or scene:{moment}, +seconds after either (required)', frames: `how many frames (${TOOL_DEFAULTS.frames})`, fps: `frames a second (${TOOL_DEFAULTS.fps})`, width: `the picture's width in pixels, 100–4000 (${TOOL_DEFAULTS.width})`}},
});
