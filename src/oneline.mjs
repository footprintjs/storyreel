// oneline — a row of a reply is one line, whatever the film's own files put in it.
//
// WHY: a reply is read by a model as the tool's own words. A scene's id, a phrase, drawn words and a file's name come
// from the film's files, which anyone may have written: a line break inside one would start a line that reads like the
// tool's ("verdicts: 5 passed"). So every row a reply lists is passed through oneLine before the rows are joined: a
// line break, any other control character and a character that turns the reading direction are shown as their escape
// (\n, \u{202e}), never obeyed. Nothing is dropped: the words can still be found in the recipe as shown.
const BREAKS = /[\p{Cc}\p{Zl}\p{Zp}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;
const NAMED = {'\n': '\\n', '\r': '\\r', '\t': '\\t'};

/** `text` as one line: its line breaks, control characters and direction marks shown as escapes. */
export const oneLine = text => String(text).replace(BREAKS, c => NAMED[c] ?? `\\u{${c.codePointAt(0).toString(16)}}`);

/** Whether a name (a scene's id) would stay one line as written: it has none of those characters. */
export const isOneLine = text => { BREAKS.lastIndex = 0; return !BREAKS.test(String(text)); };
