/**
 * Where each entry of a JSON file starts: path → line number, with paths spelled the way a film
 * names its recipe entries ("story.items[3].at"). The studio uses it to point at the line a drawing
 * came from. Reads the text; never evaluates it.
 */
export function jsonLines(text) {
  const lines = new Map();
  let i = 0, line = 1;
  const space = () => { while (i < text.length && /\s/.test(text[i])) { if (text[i] === '\n') line++; i++; } };
  const string = () => {
    const start = i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i));
  };
  const value = path => {
    space(); lines.set(path, line);
    const c = text[i];
    if (c === '{' || c === '[') {
      const close = c === '{' ? '}' : ']'; let n = 0;
      i++; space();
      if (text[i] === close) { i++; return; }
      for (;;) {
        if (c === '{') { space(); const key = string(); space(); i++; value(path ? `${path}.${key}` : key); }
        else value(`${path}[${n++}]`);
        space();
        if (text[i] === ',') { i++; continue; }
        if (text[i] !== close) throw new Error(`Not JSON near line ${line}`);
        i++; return;
      }
    }
    if (c === '"') { string(); return; }
    while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
  };
  value('');
  return lines;
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
