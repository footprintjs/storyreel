/**
 * Code shown on screen: real TypeScript, tokenized by Shiki (MIT) and coloured with the
 * course's semantic tones — keywords in the accent, comments dim, and the literals a recipe names
 * in their state colours. Code is display text only; nothing here runs it.
 */
import {readFileSync} from 'node:fs';
import {createHighlighter} from 'shiki';
import {createJavaScriptRegexEngine} from 'shiki/engine/javascript';

let highlighter;
async function ts() {
  highlighter ??= await createHighlighter({themes: ['github-light'], langs: ['typescript'], engine: createJavaScriptRegexEngine()});
  return highlighter;
}

/**
 * A tone for one token from its TextMate scopes. `emphasis` (from the recipe) names string
 * literals or identifiers that carry a state colour, e.g. {"'unknown'": "unknown", "requestInput": "known"}.
 */
function toneOf(token, emphasis) {
  const text = token.content.trim();
  if (emphasis[text]) return emphasis[text];
  const scopes = (token.explanation ?? []).flatMap(e => e.scopes.map(s => s.scopeName));
  if (scopes.some(s => s.startsWith('comment'))) return 'dim';
  if (scopes.some(s => s.startsWith('storage.type') || s.startsWith('storage.modifier') || s.startsWith('keyword.control'))) return 'kw';
  return 'ink';
}

/**
 * Lines of [[text, tone]] for a block of TypeScript. No time limit (`tokenizeTimeLimit: 0`): Shiki's
 * default stops a line after 500 ms of wall-clock time, so on a busy machine the same code would come
 * out differently, or its two passes (colours, scopes) would disagree and throw. A film is a pure function.
 */
export async function tokenize(source, emphasis = {}) {
  const h = await ts();
  return h.codeToTokensBase(source, {lang: 'typescript', theme: 'github-light', includeExplanation: true, tokenizeTimeLimit: 0})
    .map(line => line.filter(t => t.content.length).map(t => [t.content, toneOf(t, emphasis)]));
}

/**
 * The block of a file between `// --- on-screen code` and `// --- end on-screen code ---`,
 * with elided property lines (e.g. description, inputSchema) folded into one comment — the same
 * rule the 01B excerpt test uses.
 */
export function excerpt(file, {elide = []} = {}) {
  const src = readFileSync(file, 'utf8');
  // The end marker may be indented (a block inside an object literal); the block is dedented to its first line.
  const block = src.split('// --- on-screen code')[1]?.split(/\n[ \t]*\/\/ --- end on-screen code ---/)[0];
  if (block === undefined) throw new Error(`${file} has no on-screen code block`);
  const lines = block.split('\n').slice(1), out = [];
  let folded = false;
  // Elide on the lines as written (a property is an indented `key:`), then dedent to the first line.
  for (const line of lines) {
    const key = line.match(/^\s+(\w+):/)?.[1];
    if (key && elide.includes(key)) { if (!folded) { out.push(`${line.match(/^\s+/)[0]}// ${elide.join(', ')} …`); folded = true; } continue; }
    out.push(line);
  }
  const indent = out.find(l => l.trim())?.match(/^\s*/)[0] ?? '';
  return out.map(l => l.startsWith(indent) ? l.slice(indent.length) : l).join('\n');
}
