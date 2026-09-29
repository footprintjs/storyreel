/**
 * Reading time: a line the viewer is meant to read stays on screen, whole, long enough to read —
 * about 0.3 s a word (at least a second), counted from when the whole line is shown until it
 * starts to leave. The film lists the lines that are too short (film.reading); a recipe that says
 * "reading": "refuse" is refused while any line is. Code is left out: it is studied, not read in a beat.
 */
export const READING = Object.freeze({perWord: .3, least: 1});

export const wordsIn = text => String(text).split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;

/** The seconds a line needs on screen to be read. */
export const secondsToRead = (text, {perWord, least} = READING) => Math.max(least, perWord * wordsIn(text));

/**
 * The lines shown for less time than they need. lines: [{text, from, to, path}] (from: the whole line
 * is shown; to: it starts to leave — a line that is never whole on screen is up 0 s). Returns
 * [{path, text, seconds, needs, at}], earliest first.
 */
export function tooShortToRead(lines, rule = READING) {
  return lines.filter(l => typeof l.text === 'string' && l.text.trim() && Number.isFinite(l.from))
    .map(l => ({path: l.path, text: l.text, at: +l.from.toFixed(3), seconds: +Math.max(0, l.to - l.from).toFixed(2), needs: +secondsToRead(l.text, rule).toFixed(2)}))
    .filter(l => l.seconds < l.needs)
    .sort((a, b) => a.at - b.at);
}

/** Check a recipe's `reading` setting: 'report' (the default: the film lists short lines) or 'refuse'. */
export function readingMode(value) {
  if (value === undefined) return 'report';
  if (value !== 'report' && value !== 'refuse') throw new Error('reading must be "report" or "refuse"');
  return value;
}
