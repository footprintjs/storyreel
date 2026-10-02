/**
 * Reading time: a line the viewer is meant to read stays on screen, whole, long enough to read —
 * about 0.3 s a word (at least a second), counted from when the whole line is shown until it
 * starts to leave. The film lists the lines that are too short (film.reading); a recipe that says
 * "reading": "refuse" is refused while any line is. Code is left out: it is studied, not read in a beat.
 */
export const READING = Object.freeze({perWord: .3, least: 1});
/**
 * The letters pace (`"reading": {"pace": "letters"}`): a second and a half to find the line, then a
 * fifteenth of a second a letter — fairer to short labels, which the words pace lets go too soon
 * ("change the picture": 0.9 s by words, 2.7 s by letters).
 */
export const LETTERS = Object.freeze({perLetter: 1 / 15, base: 1.5});

export const wordsIn = text => String(text).split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
export const lettersIn = text => (String(text).match(/[\p{L}\p{N}]/gu) ?? []).length;

/** The seconds a line needs on screen to be read, at a pace (READING: by words; LETTERS: by letters). */
export const secondsToRead = (text, rule = READING) => rule.perLetter !== undefined ? rule.base + rule.perLetter * lettersIn(text) : Math.max(rule.least, rule.perWord * wordsIn(text));

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

/**
 * Check a recipe's `reading` setting: 'report' (the default: the film lists short lines), 'refuse', or
 * {rule?: 'report' | 'refuse', pace?: 'words' | 'letters'}. Returns the rule.
 */
export function readingMode(value) {
  if (value === undefined) return 'report';
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(value)) if (key !== 'rule' && key !== 'pace') throw new Error(`reading has ${key}; it takes rule ("report" or "refuse") and pace ("words" or "letters")`);
    if (value.pace !== undefined && value.pace !== 'words' && value.pace !== 'letters') throw new Error('reading.pace must be "words" (0.3 s a word, at least 1 s) or "letters" (1.5 s + a fifteenth of a second a letter)');
    return readingMode(value.rule);
  }
  if (value !== 'report' && value !== 'refuse') throw new Error('reading must be "report", "refuse", or {rule, pace}');
  return value;
}

/** The pace a recipe's `reading` asks for: READING (by words, the default) or LETTERS. */
export const readingPace = value => (value && typeof value === 'object' && value.pace === 'letters' ? LETTERS : READING);
