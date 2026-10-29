/**
 * A JSON file's text, read where it stands: where each value is (jsonSpans: its line and its offsets; jsonLines: its
 * line), with paths spelled the way a film names its recipe entries ("story.items[3].at") — the studio uses it to point
 * at the line a drawing came from — and values set in place, every other byte kept (spliceJson: what `storyreel apply`
 * writes). Reads the text; never evaluates it.
 */

/**
 * Where each value of a JSON text is: path → {line, start, end} — its first line and its text's offsets (end just past
 * it); a member of an object also has keyStart and keyEnd, its key's text (quotes and all).
 */
export function jsonSpans(text) {
  const spans = new Map();
  let i = 0, line = 1;
  const space = () => { while (i < text.length && /\s/.test(text[i])) { if (text[i] === '\n') line++; i++; } };
  const string = () => {
    const start = i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i));
  };
  const value = (path, key = {}) => {
    space();
    const span = {line, start: i, ...key};
    spans.set(path, span);
    const c = text[i];
    if (c === '{' || c === '[') {
      const close = c === '{' ? '}' : ']'; let n = 0;
      i++; space();
      if (text[i] === close) { i++; span.end = i; return; }
      for (;;) {
        if (c === '{') { space(); const keyStart = i, name = string(), keyEnd = i; space(); i++; value(path ? `${path}.${name}` : name, {keyStart, keyEnd}); }
        else value(`${path}[${n++}]`);
        space();
        if (text[i] === ',') { i++; continue; }
        if (text[i] !== close) throw new Error(`Not JSON near line ${line}: a comma or a closing ${close} is missing there`);
        i++; span.end = i; return;
      }
    }
    if (c === '"') string();
    else while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
    span.end = i;
  };
  value('');
  return spans;
}

/** Where each entry of a JSON text starts: path → line number. */
export const jsonLines = text => new Map([...jsonSpans(text)].map(([path, span]) => [path, span.line]));

/** A path as its holder's path and its last key: "stages[2].enter" → ["stages[2]", "enter"]. */
const lastKey = path => { const m = /^(?:(.*)\.)?([^.[\]]+)$/.exec(path); return m ? [m[1] ?? '', m[2]] : [null, null]; };

/**
 * The text with each edit's value set, every other byte as it was: [{path, value}] — value the JSON text to write
 * ('"torn"'), a later edit of a path winning. A value there is replaced where it stands; a key not there goes just after
 * its object's first member that `beside` names, laid out as the members around it are — on a line of its own with
 * their indent and line ending, or inline beside it.
 * @param beside  the members a new key goes after, the first there (['scene', 'kit'])
 */
export function spliceJson(text, edits, {beside}) {
  const spans = jsonSpans(text), last = new Map(edits.map(e => [e.path, e.value]));
  const cuts = [...last].map(([path, value]) => {
    if (spans.has(path)) return {at: spans.get(path).start, end: spans.get(path).end, text: value};
    const [holder, key] = lastKey(path), anchor = beside.map(b => spans.get(holder ? `${holder}.${b}` : b)).find(Boolean);
    if (!anchor) throw new Error(`${path}: its object has none of ${beside.join(', ')} for it to go beside — add one`);
    return {at: anchor.end, end: anchor.end, text: `,${gapOf(text, anchor)}${JSON.stringify(key)}${text.slice(anchor.keyEnd, anchor.start)}${value}`};
  });
  // From the end back, so each cut's offsets are still the text's own.
  return cuts.sort((a, b) => b.at - a.at).reduce((out, c) => `${out.slice(0, c.at)}${c.text}${out.slice(c.end)}`, text);
}

/**
 * What goes between two members of the anchor's object, as its text has it: what follows the comma after the anchor
 * (the gap a new member just after it takes), else what comes before the anchor's key — a line break and an indent,
 * a space, or nothing.
 */
function gapOf(text, anchor) {
  let k = anchor.end;
  while (/\s/.test(text[k] ?? '')) k++;
  if (text[k] === ',') { const from = k + 1; k = from; while (/\s/.test(text[k] ?? '')) k++; return text.slice(from, k); }
  let j = anchor.keyStart;
  while (j > 0 && /\s/.test(text[j - 1])) j--;
  return text.slice(j, anchor.keyStart);
}

/** The value at a path ("stages[2].reveal[0]") in a parsed JSON value, or undefined. */
export function valueAt(root, path) {
  if (!path) return root;
  let at = root;
  for (const [, key, index] of path.matchAll(/\.?([^.[\]]+)|\[(\d+)\]/g)) {
    if (at === null || typeof at !== 'object') return undefined;
    at = index !== undefined ? at[Number(index)] : at[key];
  }
  return at;
}
