/**
 * feedback.md, the notes a person leaves on the film in the studio: a markdown checklist beside the project's recipe
 * file, one note a line, each carrying the exact place it was left so an agent never looks at a frame or reads a whole
 * file to find what the person meant. Pure: text in, text out — note.mjs writes a note, feedback-read.mjs reads them,
 * feedback-file.mjs reads and writes the file.
 *
 *   <!-- storyreel feedback · project 3f9c2a7b8e1d4c60 · keep this line: notes are signed against it -->
 *   # Feedback
 *   …
 *   - [ ] 0:42.3 · walk+8.10 · stages[1].world.squirrels (recipe.json:212) · "Then a little squirrel scampers up" — the oranges vanish too fast <!-- note:1a2b3c4d by:5e6f7a8b sig:… -->
 *
 * A note's line is its checkbox, its body and its stamp. The body is what is signed (notekey.mjs): the film clock, the
 * scene and the seconds into it (momenttext.mjs · sceneTime, what `--at` reads back), the recipe entry the click named
 * with its line in the recipe file, the words said around that moment, then " — " and the person's words. The stamp
 * says the note's id, the key that signed it (its name in this project) and the signature. The file's first line holds
 * the project id, made once: notes are signed against it, so a project moved or renamed keeps its notes.
 *
 * Nothing a person or a recipe writes can break a line: each field is one line of visible characters, and the
 * characters that separate the fields (`·`, `—`, `"`, the parentheses of a line number) or could open a comment or a
 * tag (`<`, `>`) are escaped with a backslash where they appear in a value — markdown shows `\<` as `<`.
 */
import {clockSeconds} from '../clocktext.mjs';

/** The checklist's name, beside the recipe's file. */
export const FEEDBACK = 'feedback.md';
/** The most characters a note's words keep (more are cut, with "…"). */
export const NOTE_MOST = 1000;
/** The most characters of what is said that a note quotes. */
export const SAID_MOST = 80;

const PROJECT = /^﻿?<!-- storyreel feedback · project ([0-9a-f]{16}) /;
const CHECKBOX = /^(\s*[-*] \[)([ xX])(\] )(.*?)(\r?)$/;
const STAMP = / <!-- note:([0-9a-f]{8}) by:([0-9a-f]{8}) sig:([0-9a-f]{32}) -->$/;

/** The project id the file's first line holds, or null. */
export function projectOf(text) {
  const m = PROJECT.exec(String(text).split('\n', 1)[0]);
  return m ? m[1] : null;
}

const projectLine = project => `<!-- storyreel feedback · project ${project} · keep this line: notes are signed against it -->`;
const HEAD = project => `${projectLine(project)}\n# Feedback\n\nNotes left on the film in \`storyreel studio\`, each with its place. \`storyreel feedback\` lists yours; \`storyreel feedback --done <n>\` ticks one.\n`;

/** The line ending a file uses: CRLF when it has one, else LF. */
const endingOf = text => (String(text).includes('\r\n') ? '\r\n' : '\n');

/** The file with its project id first: as it is when its first line holds one; else the id's line above it (a new file: its heading too). */
export function withProject(text, project) {
  if (projectOf(text)) return text;
  return String(text).trim() ? `${projectLine(project)}${endingOf(text)}${text}` : HEAD(project);
}

/** The file with one more line at the end of its notes, in its own line ending: a blank line first when the last line is not a note (a list starts). */
export function appendLine(text, line) {
  const nl = endingOf(text);
  let end = text.length;
  while (end > 0 && /\s/.test(text[end - 1])) end--;
  const kept = text.slice(0, end), last = kept.slice(kept.lastIndexOf('\n') + 1);
  return `${kept}${CHECKBOX.test(last) ? nl : nl + nl}${line}${nl}`;
}

/** What a reader cannot see or a line cannot hold: control and format characters (but the joiner emoji are made of), line and paragraph separators. */
const UNSEEN = /[\p{Cc}\p{Zl}\p{Zp}]|(?!‍)\p{Cf}/gu;
/** Text as one plain line of visible characters, spaces collapsed. */
const oneLine = text => String(text).replace(UNSEEN, ' ').replace(/\s+/g, ' ').trim();
/** Text cut to `most` characters (whole characters, never half of one), ending in "…" when cut. */
const capped = (text, most) => { const chars = [...text]; return chars.length > most ? `${chars.slice(0, most - 1).join('').trimEnd()}…` : text; };

/** The person's words, as a note keeps them: one line, at most NOTE_MOST characters — or a refusal when nothing is left. */
export function cleanWords(text) {
  const words = capped(oneLine(text), NOTE_MOST);
  if (!words) throw new Error('a note needs words: say what should change here');
  return words;
}
/** What is said around a moment, as a note quotes it: one line, at most SAID_MOST characters. */
export const cleanSaid = text => capped(oneLine(text), SAID_MOST);

/** An anchor's value escaped: what separates the fields, opens a comment or a tag, and the backslash itself. */
const field = value => oneLine(value).replace(/[\\·—"<>()]/g, c => `\\${c}`);
/** The person's words escaped: nothing in them can open a comment or a tag. */
const wordsText = words => words.replace(/[\\<>]/g, c => `\\${c}`);
/** A value as written, its escapes undone. */
const unescaped = text => text.replace(/\\(.)/gu, '$1');

/**
 * A note's body, as signed: the film clock, scene+seconds, the entry (with its file and line when known), what is said
 * (quoted), then " — " and the words. {clock, at, entry?, file?, line?, said?, words}.
 */
export function noteBody({clock, at, entry, file, line, said, words}) {
  const where = entry ? `${field(entry)}${file && line ? ` (${field(file)}:${line})` : ''}` : null;
  return [field(clock), field(at), where, said ? `"${field(said)}"` : null].filter(Boolean).join(' · ') + ` — ${wordsText(words)}`;
}

/** A note's line: its checkbox (open), its body, its stamp. */
export const noteLine = ({body, id, by, sig}) => `- [ ] ${body} <!-- note:${id} by:${by} sig:${sig} -->`;

/**
 * A body read back: {t, clock, at, entry, file, line, said, words} as written (t: the clock's seconds), or null when it is
 * not in a note's shape (a line edited by hand, or written by another tool).
 */
export function readBody(body) {
  const split = body.indexOf(' — ');
  if (split < 0) return null;
  const [clock, at, ...rest] = body.slice(0, split).split(' · ');
  if (at === undefined || rest.length > 2) return null;
  const said = rest.find(r => r.startsWith('"') && r.endsWith('"') && r.length > 1), where = rest.find(r => r !== said);
  if (rest.length === 2 && (!said || !where || rest[0] !== where)) return null;
  const located = where === undefined ? null : /^(.*) \((.+):(\d+)\)$/.exec(where);
  let t = null;
  try { t = clockSeconds(clock); } catch { return null; }
  return {t, clock, at: unescaped(at), entry: where === undefined ? null : unescaped(located ? located[1] : where),
    file: located ? unescaped(located[2]) : null, line: located ? Number(located[3]) : null, said: said ? unescaped(said.slice(1, -1)) : null,
    words: unescaped(body.slice(split + 3))};
}

/**
 * Every checklist line of the file, in order: {index (its line, from 0), done, body, signed} — and, when it carries a
 * stamp, {id, by, sig} (its body then stops before the stamp); `note` its body read back (readBody), or null. Lines that
 * are not a checklist's are not notes: a heading, a paragraph, the project id.
 */
export function noteLines(text) {
  const out = [];
  String(text).split('\n').forEach((raw, index) => {
    const m = CHECKBOX.exec(raw);
    if (!m) return;
    const rest = m[4], stamp = STAMP.exec(rest), body = stamp ? rest.slice(0, stamp.index) : rest;
    out.push({index, done: m[2] !== ' ', body, signed: Boolean(stamp), ...(stamp ? {id: stamp[1], by: stamp[2], sig: stamp[3]} : {}), note: readBody(body)});
  });
  return out;
}

/** The file with the checklist lines at `indexes` ticked (`- [x]`), every other byte as it was. */
export function tickLines(text, indexes) {
  const ticked = new Set(indexes);
  return String(text).split('\n').map((raw, i) => (ticked.has(i) ? raw.replace(CHECKBOX, (all, open, box, close, rest, cr) => `${open}x${close}${rest}${cr}`) : raw)).join('\n');
}

/** A note as an agent reads it, in one line: scene+seconds, the entry (file:line), what is said, and the words. */
export function noteText(note) {
  if (!note) return null;
  const where = note.entry ? ` ${note.entry}${note.file ? ` (${note.file}:${note.line})` : ''}` : '';
  return `${note.at}${where}${note.said ? ` "${note.said}"` : ''} — ${note.words}`;
}
