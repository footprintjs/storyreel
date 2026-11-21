// text — how much of a finding's words a reply and a record hold, and how a film's own words are quoted in them.
//
// WHY: `where`, `fix` and the labels they quote come from the film (a kit's path, an item's label, a word drawn), so
// they are as long as the film makes them: one whiteboard item of 4000 ticks made a 24,067-character fix and a 1.46 MB
// record. Each is cut by whole characters to a set length, the way check/problems.mjs · row cuts a row. A film's word
// is quoted with its quotes escaped and the reply's field mark (" · ") shown as its escape, so a word that reads
// `" · fix: …` stays inside its quotes and can never stand for a field of the line.

/** The most characters a recipe entry (`where`) holds, a fix holds, and a film's word or label holds when it is quoted. */
export const WHERE_MOST = 80, FIX_MOST = 200, QUOTE_MOST = 40;
/** The most characters one line of the reply holds (check/problems.mjs · ROW_MOST: its rows are these lines). */
export const LINE_MOST = 300;

/** Text cut to `most` characters (whole characters: never half a pair), ending in "…" when cut. */
export function cutText(text, most) {
  const chars = [...String(text).slice(0, 2 * most + 2)];
  return chars.length > most ? `${chars.slice(0, Math.max(0, most - 1)).join('')}…` : String(text);
}

/** The field mark of a reply's line, shown as its escape wherever a film's words could hold it. */
export const unmarked = text => String(text).replace(/·/g, '\\u{b7}');

/** A film's word or label, quoted: cut to QUOTE_MOST, its quotes and backslashes escaped (JSON's), the field mark escaped. */
export const quote = (text, most = QUOTE_MOST) => unmarked(JSON.stringify(cutText(text, most)));
