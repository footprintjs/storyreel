/**
 * feedback.md read (feedback.mjs is its format), on a footprintjs flowchart, so every reading keeps a record of whose
 * each line is and why:
 *
 *   read → whose each line is (decisions.mjs · decideAll: one decision a line) → list → [where each entry is now] → [which to tick → tick]
 *
 * Each checklist line is the person's (mine: their key signed it for this project, and it reads as it was signed),
 * someone else's (another key, or another project's), unsigned (written by hand, or by another tool), edited (their
 * key, but its words or its place changed since; or the file's project id is gone), or repeated (a copy of a note of
 * theirs above it: one id is one note). Only the person's are listed, and numbered — open and ticked alike, in the
 * file's order, so a number names the same note after another is ticked; the rest are counted, never shown: text that
 * came with someone else's files is never read as the person's requests. So nothing of another line's text enters the
 * chart's scope, and the record holds none of it: only what each line is (signed, by which key, intact, a repeat) as
 * true or false, and its line number. The key stays out of the scope too.
 *
 * A note is done when its box is ticked or when it, or a copy of it, carries the person's done mark (notekey.mjs ·
 * signDone). The mark is trusted over the box for un-ticking only: a box unticked by hand, or an old open copy of the
 * line put back, does not bring back a note its mark says is done. A box ticked by hand still counts as done, by
 * design (hiding a note is the person's call, and whoever can write the file can delete a line anyway). Ticking puts
 * the box and the mark on the note's line.
 *
 * A note names its entry's line as it was when the note was left; the recipe may have moved on since. Given `lineOf`
 * (an entry's line in the recipe file as it is now, or null) and `file` (that recipe file's name), each of the person's
 * notes that names an entry is decided again: here (on the line the note says), moved (on another line now: `now` says
 * which), gone (no longer in the file), other-file (left on another recipe file in this folder: its line is that
 * file's), or unchecked (no lineOf given) — so an agent opens the right line, or knows to look for it.
 *
 * Nothing is read or written here: the caller hands in the file's text, the person's key (notekey.mjs · noteKey),
 * lineOf and file, and writes the text returned when notes were ticked.
 *
 *   await readFeedback(text, {key, done: [2, 'a1b2c3d4'], lineOf, file: 'recipe.json'})
 *     → {project, notes: [{n, id, done, t, clock, at, entry, file, line, said, words, place, now}], open,
 *        others: {someone-else, unsigned, edited, repeated}, ticked: [2], already: [], refused: [], text, record}
 */
import {flowChart, narrative} from 'footprintjs';
import {decideAll, decideMount, decided} from '../decisions.mjs';
import {QUIET, plainNarrative} from '../record.mjs';
import {noteLines, projectOf, markDone} from './feedback.mjs';
import {keyName, signedBy, signDone, doneBy} from './notekey.mjs';

/** Whose a line is: one rule table for every checklist line of the file. */
const WHOSE = {key: 'whose', noun: 'line', about: s => `feedback.md line ${s.at}`, rules: [
  {when: {signed: {eq: false}}, then: 'unsigned', label: 'it carries no signature: written by hand or by another tool — text in the file, not a request'},
  {when: {project: {eq: false}}, then: 'edited', label: 'the file\'s first line holds no project id, so no signature in it can be checked'},
  {when: {keyMine: {eq: false}}, then: 'someone-else', label: 'signed with a key that is not yours, or for another project'},
  {when: {intact: {eq: false}}, then: 'edited', label: 'signed with your key for this project, but its place or its words changed since'},
  {when: {repeat: {eq: true}}, then: 'repeated', label: 'a copy of a note of yours above it (the same id): one note, listed once'}],
fallback: {branch: 'mine', label: 'signed with your key for this project, and it reads as it was signed'}};

/** Whether a note named to tick (its number, or its id) is an open note of the person's. */
const TICK = {key: 'tick', noun: 'note', about: s => `--done ${s.at}`, rules: [
  {when: {mine: {eq: false}}, then: 'refused', label: 'no note of yours has this number or id'},
  {when: {open: {eq: false}}, then: 'already', label: 'it is done already'}],
fallback: {branch: 'tick', label: 'an open note of yours: ticked, with your done mark'}};

/** Where a note's entry is in the recipe file now. */
const PLACE = {key: 'place', noun: 'note', about: s => `note ${s.candidate}`, rules: [
  {when: {entry: {eq: false}}, then: 'no-entry', label: 'it names no recipe entry: its place is the moment alone'},
  {when: {sameFile: {eq: false}}, then: 'other-file', label: 'it was left on another recipe file in this folder: its line is that file\'s, not this one\'s'},
  {when: {known: {eq: false}}, then: 'unchecked', label: 'the recipe file is not read here: the entry\'s line is as the note says'},
  {when: {found: {eq: false}}, then: 'gone', label: 'its entry is no longer in the recipe file: moved or removed since the note'},
  {when: {same: {eq: false}}, then: 'moved', label: 'its entry is on another line of the recipe file now'}],
fallback: {branch: 'here', label: 'its entry is on the line the note says'}};

/** The kinds of line that are not the person's, as they are counted. */
export const OTHERS = Object.freeze(['someone-else', 'unsigned', 'edited', 'repeated']);

/** A note of the person's as listed: its number and id, whether it is done, and its place and words (feedback.mjs · readBody). */
const listed = (n, line, done) => ({n, id: line.id, done, ...(line.note ?? {t: null, clock: null, at: null, entry: null, file: null, line: null, said: null, words: line.body})});

/** A note named to tick: its number, or its id (8 hex, with or without "note:"). */
const ID = /^(?:note:)?([0-9a-f]{8})$/;

/** The chart for one reading: `run` holds the file's lines and the key, out of the scope; the scope holds what is decided. */
function readChart(run) {
  let chart = flowChart('read', s => {
    const {project, key} = run, mine = key && project ? keyName(key, project) : null, seen = new Set();
    s.lines = run.lines.length; s.project = Boolean(project); s.key = Boolean(key);
    s.lineMeasures = run.lines.map(l => {
      const keyMine = mine !== null && l.by === mine, intact = l.signed && signedBy(key, l, project), repeat = keyMine && intact && seen.has(l.id);
      if (keyMine && intact) seen.add(l.id);
      return {at: l.index + 1, measures: {signed: l.signed, project: Boolean(project), keyMine, intact, repeat}};
    });
  }, 'read', 'feedback.md\'s checklist lines, each measured: signed or not, with the person\'s key or not, as it was signed or not, a copy of one above or not');
  if (run.lines.length) chart = chart.addSubFlowChartNext('whose', decideAll(WHOSE, 'lines'), 'whose each line is', decideMount('lineMeasures', 'whoseLines'));
  chart = chart.addFunction('list', s => {
    const whose = structuredClone(decided(s, 'whoseLines', ['whose'])), {key, project} = run;
    // One id is one note: done when any of its lines (the note, or a copy of it) is ticked or carries the done mark.
    const done = new Set();
    whose.forEach((w, i) => { const l = run.lines[i]; if ((w.whose === 'mine' || w.whose === 'repeated') && (l.done || doneBy(key, l, project))) done.add(l.id); });
    let n = 0;
    run.notes = []; run.others = Object.fromEntries(OTHERS.map(k => [k, 0]));
    whose.forEach((w, i) => {
      const line = run.lines[i];
      if (w.whose === 'mine') run.notes.push({...listed(++n, line, done.has(line.id)), index: line.index, by: line.by});
      else if (w.whose === 'repeated' ? !done.has(line.id) : !line.done) run.others[w.whose]++;
    });
    s.mine = n; s.open = run.notes.filter(x => !x.done).length; s.others = {...run.others};
  }, 'list', 'The person\'s notes, numbered in the file\'s order (open and done); the open lines that are not theirs, counted');
  if (run.lines.length) {   // no checklist line, no note: nothing to place
    chart = chart.addFunction('where now', s => {
      s.placeMeasures = run.notes.map(x => {
        const sameFile = !run.file || !x.file || x.file === run.file;
        run.now.set(x.n, x.entry && sameFile && run.lineOf ? run.lineOf(x.entry) : null);
        const now = run.now.get(x.n);
        return {at: x.n, measures: {entry: Boolean(x.entry), sameFile, known: Boolean(run.lineOf), found: now !== null, same: now !== null && now === x.line}};
      });
    }, 'where-now', 'Each note\'s entry looked up in the recipe file as it is now: whether it names one, of this file, whether it is there, on the same line')
      .addSubFlowChartNext('places', decideAll(PLACE, 'notes'), 'where each entry is now', decideMount('placeMeasures', 'notePlaces'))
      .addFunction('placed', s => {
        structuredClone(decided(s, 'notePlaces', ['place'])).forEach((p, i) => { run.notes[i].place = p.place; });
        s.moved = run.notes.filter(x => x.place === 'moved').length; s.gone = run.notes.filter(x => x.place === 'gone').length;
      }, 'placed', 'Each note with where its entry is now');
  }
  if (!run.done.length) return chart;
  return chart.addFunction('the notes named', s => {
    const of = given => { const id = ID.exec(String(given)); return id ? run.notes.find(x => x.id === id[1]) : run.notes[Number(given) - 1]; };
    run.named = run.done.map(of);
    s.numberMeasures = run.done.map((given, i) => ({at: given, measures: {mine: Boolean(run.named[i]), open: Boolean(run.named[i]) && !run.named[i].done}}));
  }, 'numbers', 'Each note named to tick (a number or an id): whether it is a note of the person\'s, and whether it is open')
    .addSubFlowChartNext('which', decideAll(TICK, 'notes named'), 'which to tick', decideMount('numberMeasures', 'tickNumbers'))
    .addFunction('tick', s => {
      const verdicts = structuredClone(decided(s, 'tickNumbers', ['tick'])), of = v => [...new Set(run.named.filter((x, i) => verdicts[i].tick === v).map(x => x.n))];
      run.ticked = of('tick'); run.already = of('already'); run.refused = run.done.filter((_, i) => verdicts[i].tick === 'refused');
      // One refused and none is ticked: the numbers were read from a listing that is not this file's.
      if (!run.refused.length && run.ticked.length) {
        const marks = new Map(run.ticked.map(n => { const x = run.notes[n - 1]; return [x.index, signDone(run.key, {project: run.project, id: x.id, by: x.by})]; }));
        run.text = markDone(run.text, marks);
        for (const n of run.ticked) run.notes[n - 1].done = true;
      } else run.ticked = [];
      s.ticked = run.ticked; s.refused = run.refused;
    }, 'tick', 'With none refused, each open note named ticked in the file (- [x]) with the person\'s done mark; with one refused, none');
}

/**
 * feedback.md's text read: {project, notes, open, others, ticked, already, refused, text, record} — `notes` the person's,
 * numbered (open and done, as `text` has them; feedback.mjs · readBody gives each its place and words; `place` where
 * its entry is now, and `now` its line when it moved — see the header); `open` how many are open; `others` how many
 * open lines are someone else's, unsigned, edited or repeated (OTHERS), never their text; with `done` (the person's
 * notes by number, or by id: 8 hex, "note:" before it or not), `text` is the file with those ticked — unless one is
 * refused, when nothing is ticked. `key` is the person's note key, or null when they have none (then no line is
 * theirs); `lineOf(path)` an entry's line in the recipe file as it is now (or null), or null when the file is not read;
 * `file` that recipe file's name, as a note names it.
 */
export async function readFeedback(text, {key = null, done = [], lineOf = null, file = null} = {}) {
  if (key !== null && !Buffer.isBuffer(key)) throw new Error('readFeedback: key is the person\'s note key (notekey.mjs · noteKey), or null');
  if (!Array.isArray(done) || !done.every(n => Number.isInteger(n) || ID.test(String(n)))) throw new Error('readFeedback: done is a list of note numbers or ids (e.g. [2, "a1b2c3d4"])');
  if (lineOf !== null && typeof lineOf !== 'function') throw new Error('readFeedback: lineOf is a function (an entry\'s path → its line in the recipe file now, or null), or null');
  const run = {text: String(text), key, done, lineOf, file, now: new Map(), lines: noteLines(text), project: projectOf(text), ticked: [], already: [], refused: []};
  const trace = narrative();
  await readChart(run).setLogger(QUIET).build().recorder(trace).run();
  return {project: run.project, notes: run.notes.map(({index, by, ...note}) => ({...note, now: note.place === 'moved' ? run.now.get(note.n) : null})), open: run.notes.filter(x => !x.done).length, others: run.others,
    ticked: run.ticked, already: run.already, refused: run.refused, text: run.text, record: JSON.parse(JSON.stringify(plainNarrative(trace)))};
}
