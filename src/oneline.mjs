// oneline — a row of a reply is one line, whatever the film's own files put in it.
//
// WHY: a reply is read by a model as the tool's own words. A scene's id, a phrase, drawn words and a file's name come
// from the film's files, which anyone may have written: a line break inside one would start a line that reads like the
// tool's ("verdicts: 5 passed"). So every row a reply lists is passed through oneLine before the rows are joined, and
// every error through errorText where it is printed. Nothing is dropped: what is not obeyed is shown as its escape
// (a line break as \n, any other as its code point), so the words can still be found in the recipe.
//
// What is shown and not obeyed: line breaks and controls (Cc, Zl, Zp), marks that turn the reading direction, and
// characters that draw nothing and can hide words (a byte-order mark, the word joiner and invisible operators, the tag
// characters). A joiner inside an emoji or a script that needs one (U+200C, U+200D) is left: those words are written with it.
const SET = '[\\p{Cc}\\p{Zl}\\p{Zp}\\u061C\\u200E\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF\\u{E0000}-\\u{E007F}]';
const BREAKS = new RegExp(SET, 'gu'), HAS = new RegExp(SET, 'u');
const NAMED = {'\n': '\\n', '\r': '\\r', '\t': '\\t'};

/** `text` as one line: its line breaks, control characters, direction marks and unseen characters shown as escapes. */
export const oneLine = text => String(text).replace(BREAKS, c => NAMED[c] ?? `\\u{${c.codePointAt(0).toString(16)}}`);

/** Whether a name (a scene's id) would stay one line as written: it has none of those characters. */
export const isOneLine = text => !HAS.test(String(text));

/**
 * An error as a reply says it. Its message is one line, whatever it quotes from the film's files; an error the tool
 * itself wrote on several lines carries them as `rows`, and each is one line.
 */
export const errorText = e => (Array.isArray(e?.rows) ? e.rows : [e?.message ?? e]).map(oneLine).join('\n');
