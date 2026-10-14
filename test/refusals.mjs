/**
 * Every refusal StoryReel throws, read from its source: the message's literal text (each `${…}` kept as "…"), where
 * it is thrown, and whether it names the fix (test/refusals.test.mjs). A refusal names the fix when it says what to
 * write instead: a value it takes ("must be", "is one of", "not …" after the right value), an example ({…}, [..], e.g.),
 * or an imperative (give, add, use, remove …). A refusal that passes on another's message (`${e.message}`) is that
 * message's to name. One that cannot name a fix — an internal invariant, a bug in StoryReel that nothing a film does
 * can reach — says so on its line, `// refusal: <why>`, and is not asked for one.
 */
import {readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

/** A JS string or template literal starting at text[i] → {text, end}: each `${…}` becomes "…". Null when none starts there. */
function literalAt(text, i) {
  const q = text[i]; if (q !== '"' && q !== "'" && q !== '`') return null;
  let out = '';
  for (let j = i + 1; j < text.length; j++) {
    const c = text[j];
    if (c === '\\') { out += text[j + 1] ?? ''; j++; continue; }
    if (c === q) return {text: out, end: j + 1};
    if (q === '`' && c === '$' && text[j + 1] === '{') {
      // the expression: braces balanced; the words of a string inside it are kept (a ternary's two fixes), the rest is "…"
      let depth = 1, inner = ''; j += 2;
      for (; j < text.length && depth; j++) {
        const d = text[j];
        if (d === '{') depth++; else if (d === '}') depth--;
        else if (d === '"' || d === "'" || d === '`') { const lit = literalAt(text, j); if (lit) { inner += ` ${lit.text}`; j = lit.end - 1; } }
      }
      j--; out += inner.trim() ? `…${inner}…` : '…'; continue;
    }
    out += c;
  }
  return null;
}

/** The message a throw's call starts with: string literals joined by `+` (other operands become "…"). */
function messageAt(text, i) {
  let msg = '', j = i;
  for (;;) {
    while (/\s/.test(text[j])) j++;
    const lit = literalAt(text, j);
    if (lit) { msg += lit.text; j = lit.end; } else return msg || null;
    while (/\s/.test(text[j])) j++;
    if (text[j] !== '+') return msg;
    j++; while (/\s/.test(text[j])) j++;
    if (!literalAt(text, j)) { msg += '…'; return msg; }
  }
}

const THROW = /throw\s+(?:new\s+)?(\w+)\(/g;
/** Every refusal in src/: {file, line, message, exempt (the line's `refusal:` reason, or null), wraps}. A throw whose message is not written at the throw (a rethrow, a built error) is not read here. */
export function refusals() {
  const out = [], files = [];
  const walk = d => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.mjs')) files.push(p); } };
  walk(SRC);
  for (const file of files.sort()) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(THROW)) {
      const message = messageAt(text, m.index + m[0].length);
      if (message === null || !/[a-z]{3}/i.test(message.replace(/…/g, ''))) continue;
      const line = text.slice(0, m.index).split('\n').length, lineText = text.split('\n')[line - 1];
      out.push({file: path.relative(SRC, file), line, message, exempt: /refusal: /.exec(lineText) ? lineText.slice(lineText.indexOf('refusal: ') + 9).trim() : null,
        wraps: /\.message\b|\$\{(e|err|error|why|problems|refused)\b/.test(lineText)});
    }
  }
  return out;
}

// What a fix part says: a value or shape to write, or what to do. Read from the house style (e.g. "x is a number
// of seconds, not …", "give narrationDir the voice folder", "{at, text}").
const FIX = [
  /\b(must|needs?|takes?|expects?|is one of|are one of|only|either|e\.g\.|for example|such as|at least|at most|between|within|or later)\b/i,
  /\b(give|add|use|write|name|set|pass|put|remove|leave|drop|move|check|choose|pick|render|run|install|make|mark|declare|rename|call|return|say|keep|split|shorten|fix|replace|spell|draw|try|approve|erase|delete|change|wrap|show|record|read|start|end|cut|load|delete|lower|raise|open|update|re-?run|upgrade|space|hold|lengthen|slow|speed|turn|list|convert|mount|pace|time)\b/i,
  /[{[][^{}[\]]*[}\]]/,                 // a shape or example: {at, text}, [x, y]
  /\bnot\b[^.]*…/,                     // "x is a list of …, not …": the right value said first
  /\b(is|are) (a|an|the|text|true|false|seconds|how|when|where|what|\d)\b/i, // "x is a number", "x is how many …"
  /\((the|a|an|one|every|it|its|have)\b/i,   // "(the scenes are …)", "(a part is …)"
  /\b(the|its)\s+[\w\s]{1,30}\bare\b/i,   // "the scenes are …", "its layers are …": the values to choose from
  /\b(lists|says|names|in words|or more|or less|is missing|the (first|last) is)\b/i,   // "x lists where the film goes", "x says what passing means, in words"
];
export const namesFix = message => FIX.some(re => re.test(message));
