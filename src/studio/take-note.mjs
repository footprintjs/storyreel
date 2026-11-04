/**
 * The studio's one write: a note left on the film from its own page (server.mjs · POST /api/note), written as one
 * signed line of feedback.md beside the recipe's file. Three steps, each refusing with its fix:
 *
 *   readJsonBody(req)          the body: JSON, one object, at most NOTE_BODY_MOST bytes (413 past it, never kept)
 *   noteRequest(body, film)    its fields: {version, t, x?, y?, words} and nothing else — the page never says the place
 *   noteTaker({home}).take()   the place read from the film itself (note.mjs), signed with the person's key
 *                              (notekey.mjs), appended to feedback.md (feedback-file.mjs: files.mjs reads and writes it)
 *
 * The version the spot was clicked under rides along: a note aimed at a film compiled since is refused (409), so a
 * spot clicked on one film never names a drawing of the next; the film it is placed against and the recipe file's
 * lines are taken together, from the one film on screen. One note is taken at a time in the studio, and each holds
 * feedback.md's lock and reads it again under it before its one appended write (feedback-file.mjs), so neither another
 * note nor a tick from `storyreel feedback` meanwhile is lost.
 */
import path from 'node:path';
import {Refusal} from './refusal.mjs';
import {writeNote} from './note.mjs';
import {readFeedback} from './feedback-read.mjs';
import {addToFeedback, feedbackFile, readFeedbackFile, withFeedback} from './feedback-file.mjs';
import {noteKey, storyreelHome} from './notekey.mjs';

/** The most bytes a note's request may hold: its words are at most 1000 characters (feedback.mjs · NOTE_MOST). */
export const NOTE_BODY_MOST = 16 * 1024;
/** What a note's request may say: the film it was aimed at, the moment, the spot (both or neither), the words. */
export const NOTE_FIELDS = Object.freeze(['version', 't', 'x', 'y', 'words']);

/**
 * A request's body read as one JSON object, at most `most` bytes: a body that says it is longer is refused before a
 * byte is read, one that turns out longer as soon as it does (413; the connection closed after the answer, the rest
 * never kept); JSON that is not one object, 400.
 */
export function readJsonBody(req, most = NOTE_BODY_MOST) {
  const tooBig = () => new Refusal(`a note's request is at most ${most} bytes: shorten the note`, 413);
  if (Number(req.headers['content-length']) > most) return Promise.reject(tooBig());
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, done = false;
    const end = (fn, value) => { if (!done) { done = true; fn(value); } };
    req.on('data', chunk => {
      if (done) return;
      size += chunk.length;
      if (size > most) { chunks.length = 0; end(reject, tooBig()); return; }
      chunks.push(chunk);
    });
    req.on('error', e => end(reject, e));
    req.on('end', () => {
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return end(reject, new Refusal('a note\'s request is JSON: {"version", "t", "words"} (and "x", "y" for a spot)', 400)); }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return end(reject, new Refusal('a note\'s request is one JSON object: {"version", "t", "words"} (and "x", "y" for a spot)', 400));
      end(resolve, body);
    });
  });
}

const finite = v => typeof v === 'number' && Number.isFinite(v);

/**
 * A note's request checked against the film on screen ({version, total}): only NOTE_FIELDS; `version` the film the page
 * drew (409 when it was compiled again since); `t` a moment on its clock; `x` and `y` a spot on the 1600 × 900 frame,
 * both or neither; `words` text. Returns {t, x?, y?, words} — the words are cleaned when the note is made.
 */
export function noteRequest(body, {version, total}) {
  const other = Object.keys(body).find(k => !NOTE_FIELDS.includes(k));
  if (other !== undefined) throw new Refusal(`a note's request takes ${NOTE_FIELDS.join(', ')}, not ${JSON.stringify(other.slice(0, 40))}: the place is read from the film, never sent`, 400);
  if (!Number.isInteger(body.version)) throw new Refusal('version is the film the page drew: /api/film\'s version, a whole number', 400);
  if (body.version !== version) throw new Refusal('the film was compiled again since the page drew it: look at it again, then leave the note', 409);
  if (!finite(body.t) || body.t < 0 || body.t > total) throw new Refusal(`t is a moment on the film clock, 0–${total} seconds`, 400);
  if ((body.x === undefined) !== (body.y === undefined)) throw new Refusal('give a spot as x and y together (or neither, for the playhead alone)', 400);
  if (body.x !== undefined && !(finite(body.x) && finite(body.y) && body.x >= 0 && body.x <= 1600 && body.y >= 0 && body.y <= 900)) throw new Refusal('x and y are a spot on the 1600 × 900 frame: x 0–1600, y 0–900', 400);
  if (typeof body.words !== 'string') throw new Refusal('words is the note, as text: say what should change here', 400);
  return {t: body.t, ...(body.x === undefined ? {} : {x: body.x, y: body.y}), words: body.words};
}

/**
 * What takes notes for one studio: take(film, request) — `film` the one on screen ({film, storyboard, recipeFile,
 * lineOf}), `request` noteRequest's — writes the note into feedback.md beside the recipe's file, one at a time, and
 * returns {note (its place and words, read back), open (the person's open notes now), file}. `home` is where the
 * person's note key lives (notekey.mjs · storyreelHome).
 */
export function noteTaker({home = storyreelHome()} = {}) {
  let last = Promise.resolve();
  async function write({film, storyboard, recipeFile, lineOf}, {t, x, y, words}) {
    if (!recipeFile) throw new Refusal('the recipe\'s file is not known, so there is nowhere to keep notes: start the studio with --recipe file (or give load() source.file)', 501);
    const file = feedbackFile(recipeFile);
    const {key, why} = noteKey(home, {create: true, project: path.dirname(file)});
    if (!key) throw new Refusal(`${why} — a note is signed with it, so it is known for yours`, 409);
    // Under the lock: the file read, the note made against it, written; when it changed under us (a file that appeared
    // where none was), read again and the note made again against it as it is now — twice at most.
    const held = async at => {
      for (let pass = 0; ; pass++) {
        let fileText;
        try { fileText = readFeedbackFile(at); } catch (e) { throw new Refusal(e.message, 409); }
        let made;
        try { made = await writeNote({film, storyboard, t, x, y, words, fileText, key, lineOf, file: path.basename(recipeFile)}); } catch (e) { throw new Refusal(e.message, 400); }
        let written;
        try { written = addToFeedback(at, fileText, made.text); } catch (e) { throw new Refusal(e.message, 409); }
        if (written) return made;
        if (pass) throw new Refusal('feedback.md keeps changing while the note is written (a tool that takes no lock is writing it): try again in a moment', 409);
      }
    };
    let made;
    try { made = await withFeedback(file, held); } catch (e) { throw e instanceof Refusal ? e : new Refusal(e.message, 409); }
    const {open} = await readFeedback(made.text, {key});
    return {note: made.note, open, file};
  }
  return {take: (film, request) => { const turn = last.then(() => write(film, request)); last = turn.catch(() => {}); return turn; }};
}
