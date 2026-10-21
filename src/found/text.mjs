/**
 * Text from a source made plain, the one rule: a title, a creator, an attribution came over the network, and are shown
 * in a terminal, written into CREDITS.txt and read by agents. A leaf: it imports nothing.
 */

/**
 * Never shown: control characters (C0, C1), the soft hyphen, line and paragraph separators, zero-width and bidi
 * controls, the byte-order mark, interlinear annotation marks, and the tag characters (invisible text an agent would
 * still read).
 */
const UNSHOWN = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb\u{e0000}-\u{e007f}]/gu;
/** Whether text holds nothing unshown. */
export const shown = text => !new RegExp(UNSHOWN.source, 'u').test(String(text));
/** Unshown characters become spaces, runs of space one, at most `max` characters (an ellipsis when cut). */
export function plainText(value, max) {
  const chars = [...String(value ?? '').replace(UNSHOWN, ' ').replace(/\s+/gu, ' ').trim()];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('');
}
