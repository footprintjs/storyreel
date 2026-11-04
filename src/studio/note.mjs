/**
 * A note left on the film in the studio, made into a signed line of feedback.md (feedback.mjs) on a footprintjs
 * flowchart, so every note keeps a record of why it names what it names:
 *
 *   place → which entry? (a decider) → its line → around → what is said? (a decider) → project id? (a decider) → sign → append
 *
 * Everything a note says of its place is read here, from the film, from the moment and the spot alone ({t, x?, y?}):
 * the film clock, the scene and the seconds into it (momenttext.mjs · sceneTime), the recipe entry drawn at the spot
 * (regions.mjs · hitTest over film.regionsAt — what the studio's "what drew this spot" answers) and its line in the
 * recipe file, and the words said around the moment. A page never says them: whatever else it sends is not read.
 * Nothing is read or written here either: the caller hands in feedback.md's text and the person's key (notekey.mjs),
 * and writes the text returned. The key never enters the chart's scope, so it is never in the record.
 *
 *   await writeNote({film, storyboard, t: 42.3, x: 812, y: 430, words: 'the oranges vanish too fast', fileText, key, lineOf, file: 'recipe.json'})
 *     → {text, line, project, note: {clock, at, entry, file, line, said, words}, record}
 */
import {randomBytes} from 'node:crypto';
import {flowChart, narrative} from 'footprintjs';
import {withRecord} from '../runlog.mjs';
import {hitTest} from '../regions.mjs';
import {clockTenths} from '../clock.mjs';
import {placeOf, sceneTime} from '../momenttext.mjs';
import {addDecider} from '../decisions.mjs';
import {QUIET, plainNarrative} from '../record.mjs';
import {cleanWords, cleanSaid, noteBody, noteLine, projectOf, withProject, appendLine, readBody} from './feedback.mjs';
import {keyName, signNote} from './notekey.mjs';

/** What a note quotes of what is said: the words within `seconds` either side of its moment, at most `words` of them (the nearest). */
export const SAID_AROUND = Object.freeze({seconds: 1.5, words: 8});

// ── The choices: rule tables, decided with decide() so the record keeps the evidence ──────────────────────────────

/** Which recipe entry the note names: the drawing at the spot, or none. */
const ENTRY = {rules: [
  {when: {clicked: {eq: false}}, then: 'no-entry', label: 'no spot was clicked: a note at the playhead names no drawing'},
  {when: {named: {eq: 0}}, then: 'no-entry', label: 'nothing drawn at the spot names a recipe entry'}],
fallback: {branch: 'drawn', label: 'the smallest drawing at the spot (on a tie, the one drawn last) names its entry, as "what drew this spot" answers'}};

/** Whether the note quotes what is said there. */
const SAID = {rules: [
  {when: {silent: {eq: true}}, then: 'unquoted', label: 'a silent scene: its words are directions, seen and never said'},
  {when: {words: {eq: 0}}, then: 'unquoted', label: `no word is said within ${SAID_AROUND.seconds} s of the moment`}],
fallback: {branch: 'quoted', label: `the words said within ${SAID_AROUND.seconds} s either side of the moment (the nearest ${SAID_AROUND.words} at most), quoted`}};

/** The project id the note is signed against: the file's own, or a new one. */
const PROJECT = {rules: [
  {when: {hasProject: {eq: true}}, then: 'kept', label: 'the file\'s first line holds its project id: the note is signed against it'}],
fallback: {branch: 'made', label: 'the file holds no project id yet: one is made at random and written as its first line'}};

/** The words said around `t` in scene `index`: the nearest SAID_AROUND.words within SAID_AROUND.seconds, in the order said. */
function wordsAround(film, index, t) {
  const words = film.timings?.scenes?.[index]?.words ?? [], at = t - film.clock.offsets[index], {seconds, words: most} = SAID_AROUND;
  const near = words.map((w, i) => ({w, i})).filter(({w}) => w.end >= at - seconds && w.start <= at + seconds);
  const kept = near.length > most ? [...near].sort((a, b) => Math.abs((a.w.start + a.w.end) / 2 - at) - Math.abs((b.w.start + b.w.end) / 2 - at) || a.i - b.i).slice(0, most).sort((a, b) => a.i - b.i) : near;
  return kept.map(({w}) => w.text);
}

const hex = bytes => randomBytes(bytes).toString('hex');

/** The chart for one note: `run` holds what the stages read (the film, the moment, the file's text, the key) and what they make. */
function noteChart(run) {
  let chart = flowChart('place', s => {
    const {film, t, x, y} = run;
    run.place = placeOf(film, t);
    s.t = t; s.clock = clockTenths(t); s.at = sceneTime(film, t); s.scene = run.place.id;
    s.clicked = x !== undefined;
    // What drew the spot, as the studio answers a click: only drawings that name a recipe entry.
    run.hits = s.clicked ? hitTest(film.regionsAt(t), x, y).filter(h => typeof h.path === 'string' && h.path) : [];
    s.named = run.hits.length;
  }, 'place', 'The moment on the film clock, its scene and the seconds into it; the drawings at the spot, when one was clicked');
  chart = addDecider(chart, {name: 'which entry', id: 'entry', description: 'Which recipe entry the note names: the drawing at the spot, or none', table: ENTRY, key: 'entry', about: s => `the note at ${s.at}`})
    .addFunction('its line', s => {
      if (s.entry !== 'drawn') return;
      s.path = run.hits[0].path; s.line = run.lineOf(s.path);
    }, 'line', 'The entry\'s line in the recipe file (null when the file is not known, or the entry is not in it)')
    .addFunction('around', s => {
      run.said = wordsAround(run.film, run.place.index, run.t);
      s.silent = Boolean(run.storyboard.scenes?.[run.place.index]?.silent); s.words = run.said.length;
    }, 'around', 'The words said around the moment in its scene');
  chart = addDecider(chart, {name: 'what is said', id: 'said', description: 'Whether the note quotes what is said there', table: SAID, key: 'saying', about: s => `the note at ${s.at}`})
    .addFunction('project', s => { s.hasProject = projectOf(run.fileText) !== null; }, 'project', 'Whether feedback.md\'s first line holds its project id');
  chart = addDecider(chart, {name: 'project id', id: 'project-id', description: 'The project id the note is signed against: the file\'s, or a new one', table: PROJECT, key: 'projectIs', about: s => `the note at ${s.at}`})
    .addFunction('sign', s => {
      const project = s.projectIs === 'kept' ? projectOf(run.fileText) : hex(8), id = hex(4), by = keyName(run.key, project), drawn = s.entry === 'drawn';
      const body = noteBody({clock: s.clock, at: s.at, entry: drawn ? s.path : null, file: drawn && s.line ? run.file : null, line: drawn ? s.line : null,
        said: s.saying === 'quoted' ? cleanSaid(run.said.join(' ')) : null, words: run.words});
      run.project = project; run.line = noteLine({body, id, by, sig: signNote(run.key, {project, id, by, body})});
      s.project = project; s.note = id; s.by = by; s.written = run.line;
    }, 'sign', 'The note\'s line: its place and words, signed with the person\'s key against the project id')
    .addFunction('append', s => {
      run.text = appendLine(withProject(run.fileText, run.project), run.line);
      s.bytes = run.text.length;
    }, 'append', 'feedback.md with the note at the end of its list (and its project id first, when it was made)');
  return chart;
}

/**
 * A note made into feedback.md's next line: {text (the file's new text), line, project, note (the line read back:
 * {t, clock, at, entry, file, line, said, words}), record}. `film` and `storyboard` are the film's as compiled; t
 * (seconds on its clock), x and y (a spot on the 1600 × 900 frame: both or neither) are the moment and the spot;
 * `words` the person's (feedback.mjs · cleanWords: one line, capped — refused when empty); `fileText` feedback.md as it
 * is ('' for none); `key` the person's note key; `lineOf(path)` an entry's line in the recipe file (or null); `file` the
 * recipe file's name, as the line says it.
 */
export async function writeNote({film, storyboard, t, x, y, words, fileText = '', key, lineOf = () => null, file = 'recipe.json'}) {
  if (!Buffer.isBuffer(key)) throw new Error('writeNote: give the person\'s note key (notekey.mjs · noteKey)');
  if (!Number.isFinite(t)) throw new Error('writeNote: t is a time on the film clock, in seconds');
  if ((x === undefined) !== (y === undefined)) throw new Error('writeNote: give a spot as x and y together, or neither (the playhead alone)');
  const run = {film, storyboard, t, x, y, words: cleanWords(words), fileText, key, lineOf, file};
  const trace = narrative();
  try { await noteChart(run).setLogger(QUIET).build().recorder(trace).run(); } catch (e) { throw withRecord(e, trace); }
  return {text: run.text, line: run.line, project: run.project, note: readBody(run.line.slice('- [ ] '.length, run.line.lastIndexOf(' <!-- '))),
    record: JSON.parse(JSON.stringify(plainNarrative(trace)))};
}
