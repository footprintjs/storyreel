/**
 * The code a module reads, followed: what a code fingerprint covers (segments.mjs · codeFingerprint, sourceCode).
 *
 * A module is read as code by a small tokenizer — comments dropped, strings and template literals read as values, a
 * regular expression skipped — so an import written in a comment (`// import {old} from './gone.mjs'`) or held as sample
 * code in a string is no import. What it finds:
 *   imports   import … from '…', import '…', export … from '…', require('…'), import('…') with one literal
 *   assets    new URL('…', import.meta.url): a file the module loads, read and hashed
 *   computed  import(expression), new URL(expression, import.meta.url): chosen at run time, which no reader can
 *             follow — listed, never guessed
 * JavaScript and TypeScript alike (.mjs .js .cjs .ts .mts .cts .tsx .jsx); TypeScript's ESM spelling ('./x.js' for
 * x.ts) resolves to the .ts file. JSX text is read as code, so an apostrophe in it can hide what follows: best effort.
 *
 * A relative import is followed to its file, transitively; one that leads nowhere is listed as missing (never a throw:
 * a stale import in a kit is reported, and the fingerprint still names what is there). A package in node_modules is
 * named by its installed version; a package linked or in a workspace (its real path outside node_modules: a `file:`
 * dependency, `npm link`) is the film's own code, and its files are followed like any other.
 */
import {readFileSync, existsSync, statSync, realpathSync} from 'node:fs';
import {isBuiltin} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';

/** The files read as code, whose imports are followed. */
export const PARSED = /\.(mjs|js|cjs|ts|mts|cts|tsx|jsx)$/i;
const EXTENSIONS = ['.mjs', '.js', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx', '.json'];
/** TypeScript's ESM spelling: an import names the .js file the .ts one compiles to. */
const TS_FOR = {'.js': ['.ts', '.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'], '.jsx': ['.tsx']};
/** A `/` after one of these starts a regular expression, not a division. */
const BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/** The keywords whose parenthesised condition may be followed by a statement that opens with a regular expression. */
const CONDITIONS = new Set(['if', 'while', 'for', 'with']);

/**
 * The source as tokens — {type: 'name' | 'string' | 'template' | 'regex' | 'punct' | 'number', value}, comments dropped
 * — and `unparsed`: the line where a comment, string, template or regular expression opened that the file ends inside
 * (null when none did). A `/` is a regular expression where a value cannot stand before it: at the start, after an
 * operator or an opening bracket, after a keyword (return, typeof, …), after the `)` of an if/while/for/with condition,
 * and after a `}` that ends its line; anywhere else, a division. What that still misreads (a regular expression whose
 * backtick then opens a template) ends the file inside a template — reported, never silent.
 */
export function tokenize(source) {
  const s = String(source), lineAt = k => s.slice(0, k).split('\n').length;
  let unparsed = null;
  /** Tokens from i, to the `}` that closes a template's ${…} when inside one: {tokens, end}. */
  function lex(i, inTemplate) {
    const out = [], parens = []; let depth = 0;
    const last = () => out.at(-1);
    const regexAllowed = k => {
      const t = last();
      if (!t) return true;
      if (t.type === 'name') return BEFORE_REGEX.has(t.value);
      if (t.type !== 'punct') return false;
      if (t.value === ')') return Boolean(t.condition);
      if (t.value === '}') return /\n/.test(s.slice(t.end, k));   // a block that ended its line
      // After a postfix ++ or -- (i++ / 2) a value stands before it: a division.
      const before = out.at(-2), value = out.at(-3);
      if ((t.value === '+' || t.value === '-') && before?.value === t.value && before.end === t.end - 1 && value && (value.type === 'name' || value.type === 'number' || value.value === ')' || value.value === ']')) return false;
      return t.value !== ']';
    };
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '#' && s[i + 1] === '!' && i === 0) { while (i < s.length && s[i] !== '\n') i++; continue; }   // a shebang
      if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
      if (c === '/' && s[i + 1] === '*') { const end = s.indexOf('*/', i + 2); if (end < 0) { unparsed ??= lineAt(i); return {tokens: out, end: s.length}; } i = end + 2; continue; }
      if (c === '"' || c === "'") {
        let j = i + 1, value = '';
        while (j < s.length && s[j] !== c && s[j] !== '\n') { if (s[j] === '\\') { value += s[j + 1] ?? ''; j += 2; } else value += s[j++]; }
        if (j >= s.length) unparsed ??= lineAt(i);
        out.push({type: 'string', value}); i = j + 1; continue;
      }
      if (c === '`') {   // a template: its text (when it holds no ${…}), its source, and its expressions read as code (inner)
        let j = i + 1, value = '', plain = true; const inner = [];
        while (j < s.length && s[j] !== '`') {
          if (s[j] === '\\') { value += s[j + 1] ?? ''; j += 2; continue; }
          if (s[j] === '$' && s[j + 1] === '{') { plain = false; const expr = lex(j + 2, true); inner.push(expr.tokens); j = expr.end + 1; continue; }
          value += s[j++];
        }
        if (j >= s.length) unparsed ??= lineAt(i);
        out.push({type: 'template', value: plain ? value : null, raw: s.slice(i, Math.min(j + 1, s.length)), inner}); i = j + 1; continue;
      }
      if (c === '/' && regexAllowed(i)) {   // a regular expression: up to its closing slash (not one in a class), then its flags
        let j = i + 1, inClass = false;
        while (j < s.length && s[j] !== '\n') { const d = s[j]; if (d === '\\') { j += 2; continue; } if (d === '[') inClass = true; else if (d === ']') inClass = false; else if (d === '/' && !inClass) break; j++; }
        if (s[j] === '/') {
          j++; while (j < s.length && /[a-z]/i.test(s[j])) j++;
          out.push({type: 'regex', value: ''}); i = j; continue;
        }
        // No closing slash on its line: no regular expression after all — a division, read as one below.
      }
      if (/[A-Za-z_$\u0080-￿]/.test(c)) { let j = i + 1; while (j < s.length && /[\w$\u0080-￿]/.test(s[j])) j++; out.push({type: 'name', value: s.slice(i, j)}); i = j; continue; }
      if (/\d/.test(c)) { let j = i + 1; while (j < s.length && /[\w.]/.test(s[j])) j++; out.push({type: 'number', value: s.slice(i, j)}); i = j; continue; }
      if (c === '(') parens.push(last()?.type === 'name' && CONDITIONS.has(last().value));
      if (c === '{') depth++;
      if (c === '}') { if (inTemplate && depth === 0) return {tokens: out, end: i}; depth--; }
      out.push({type: 'punct', value: c, end: i + 1, ...(c === ')' && parens.pop() ? {condition: true} : {})}); i++;
    }
    if (inTemplate) unparsed ??= lineAt(i);
    return {tokens: out, end: s.length};
  }
  const {tokens} = lex(0, false);
  return {tokens, unparsed};
}

const text = t => (t.type === 'string' ? JSON.stringify(t.value) : t.type === 'template' ? t.raw : t.value);
const literal = t => t && (t.type === 'string' || (t.type === 'template' && t.value !== null));

/** What a module's source reads: {imports, assets, computed, unparsed} (see the module's header; unparsed: tokenize's). */
export function scanModule(source) {
  const {tokens, unparsed} = tokenize(source), imports = [], assets = [], computed = [];
  const scan = tok => {
    const is = (k, type, value) => tok[k]?.type === type && (value === undefined || tok[k].value === value);
    const afterDot = k => is(k - 1, 'punct', '.');
    /** The index of the bracket that closes the one at k. */
    const closing = k => { const open = tok[k].value, close = {'(': ')', '{': '}', '[': ']'}[open]; let depth = 0; for (let j = k; j < tok.length; j++) { if (is(j, 'punct', open)) depth++; else if (is(j, 'punct', close) && !--depth) return j; } return tok.length; };
    for (let k = 0; k < tok.length; k++) {
      if (afterDot(k)) continue;
      if (is(k, 'name', 'import')) {
        if (is(k + 1, 'punct', '(')) {   // import(…): one literal is followed; anything else is chosen at run time
          const end = closing(k + 1), inside = tok.slice(k + 2, end);
          if (inside.length === 1 && literal(inside[0])) imports.push(inside[0].value); else computed.push(`import(${inside.map(text).join(' ')})`);
          continue;
        }
        if (is(k + 1, 'punct', '.')) continue;   // import.meta
        if (literal(tok[k + 1])) { imports.push(tok[k + 1].value); continue; }   // import '…'
        for (let j = k + 1; j < Math.min(tok.length, k + 400); j++) {   // import … from '…'
          if (is(j, 'punct', ';')) break;
          if (is(j, 'name', 'from') && literal(tok[j + 1])) { imports.push(tok[j + 1].value); break; }
        }
        continue;
      }
      if (is(k, 'name', 'export')) {   // export * from '…', export * as n from '…', export {…} from '…'
        let j = k + 1;
        if (is(j, 'punct', '*')) { j++; if (is(j, 'name', 'as')) j += 2; }
        else if (is(j, 'punct', '{')) j = closing(j) + 1;
        else continue;
        if (is(j, 'name', 'from') && literal(tok[j + 1])) imports.push(tok[j + 1].value);
        continue;
      }
      if (is(k, 'name', 'require') && is(k + 1, 'punct', '(') && literal(tok[k + 2]) && is(k + 3, 'punct', ')')) { imports.push(tok[k + 2].value); continue; }
      // new URL(path, import.meta.url): an asset the module loads beside itself — a literal path is followed, a computed one listed.
      if (is(k, 'name', 'new') && is(k + 1, 'name', 'URL') && is(k + 2, 'punct', '(')) {
        const end = closing(k + 2), args = tok.slice(k + 3, end), n = args.length;
        const relative = n >= 7 && args[n - 6].value === ',' && args[n - 5].value === 'import' && args[n - 4].value === '.' && args[n - 3].value === 'meta' && args[n - 2].value === '.' && args[n - 1].value === 'url';
        if (!relative) continue;
        if (n === 7 && literal(args[0])) assets.push(args[0].value); else computed.push(`new URL(${args.slice(0, n - 6).map(text).join(' ')}, import.meta.url)`);
      }
    }
    for (const t of tok) if (t.type === 'template') t.inner.forEach(scan);   // a template's expressions are code too
  };
  scan(tokens);
  return {imports, assets, computed, unparsed};
}

const isFile = f => existsSync(f) && statSync(f).isFile();
/** A relative specifier's file: as named, as TypeScript's ESM spelling names it, with an extension, or an index; or null. */
export function resolveRelative(spec, from) {
  const base = path.resolve(path.dirname(from), spec), ext = path.extname(base).toLowerCase();
  const candidates = [base, ...(TS_FOR[ext] ?? []).map(e => base.slice(0, -ext.length) + e), ...EXTENSIONS.map(e => base + e), ...EXTENSIONS.map(e => path.join(base, `index${e}`))];
  return candidates.find(isFile) ?? null;
}

/** The conditions an import of a package matches, as Node's ESM loader has them. */
const CONDITION_NAMES = new Set(['node', 'import', 'default']);
/**
 * An exports target: a path, the first of an array that is one, or — conditions — the first key IN ORDER that the
 * import matches (node, import, default), as Node walks them ({"node": "./node.mjs", "default": "./browser.mjs"} → node).
 */
function pick(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) { for (const x of v) { const p = pick(x); if (p) return p; } return null; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (CONDITION_NAMES.has(k)) { const p = pick(x); if (p) return p; }
  return null;
}
/** The exports entry for a key: as written, or a "./*" pattern with the rest put in for its * ("./x/y" by "./*": "./src/*.mjs"). */
function exportFor(exp, key) {
  if (key in exp) return pick(exp[key]);
  for (const [pattern, target] of Object.entries(exp)) {
    const star = pattern.indexOf('*'); if (star < 0) continue;
    const head = pattern.slice(0, star), tail = pattern.slice(star + 1);
    if (key.startsWith(head) && key.endsWith(tail) && key.length >= head.length + tail.length) { const t = pick(target); if (t) return t.replaceAll('*', key.slice(head.length, key.length - tail.length)); }
  }
  return null;
}
/** A package's entry for a subpath ('' for the package itself), by its exports, module or main; or null. */
function packageEntry(dir, subpath, manifest) {
  const exp = manifest.exports, key = subpath ? `./${subpath}` : '.';
  const conditionsOnly = exp && typeof exp === 'object' && !Array.isArray(exp) && !Object.keys(exp).some(k => k.startsWith('.'));
  const named = typeof exp === 'string' || Array.isArray(exp) || conditionsOnly ? (key === '.' ? pick(exp) : null) : exp && typeof exp === 'object' ? exportFor(exp, key) : null;
  const target = named ?? (subpath || manifest.module || manifest.main || 'index.js');
  const file = path.resolve(dir, target);
  return isFile(file) ? file : resolveRelative(`./${path.relative(dir, file)}`, path.join(dir, 'package.json'));
}

/**
 * A bare specifier from a file: null for a built-in; {pkg: 'name@version'} for a package in node_modules (its version
 * is what is hashed); {file} for a package linked or in a workspace (its real path is outside node_modules: its code
 * is followed), or for a package importing itself by name; {pkg: 'name@?'} when it is not installed beside the code.
 */
export function resolvePackage(spec, from) {
  if (spec.startsWith('node:') || isBuiltin(spec)) return null;
  const parts = spec.split('/'), name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0], subpath = spec.slice(name.length + 1);
  for (let dir = path.dirname(from); ; dir = path.dirname(dir)) {
    const installed = path.join(dir, 'node_modules', name), own = path.join(dir, 'package.json');
    if (existsSync(path.join(installed, 'package.json'))) {
      const real = realpathSync(installed), manifest = JSON.parse(readFileSync(path.join(real, 'package.json'), 'utf8'));
      if (real.split(path.sep).includes('node_modules')) return {pkg: `${name}@${manifest.version ?? '?'}`};
      const file = packageEntry(real, subpath, manifest);
      return file ? {file} : {pkg: `${name}@${manifest.version ?? '?'}`};
    }
    if (existsSync(own)) {
      const manifest = JSON.parse(readFileSync(own, 'utf8'));
      if (manifest.name === name) { const file = packageEntry(dir, subpath, manifest); return file ? {file} : {pkg: `${name}@${manifest.version ?? '?'}`}; }
    }
    if (path.dirname(dir) === dir) return {pkg: `${name}@?`};
  }
}

/** The installed package a file is in (…/node_modules/<name> or …/node_modules/@scope/<name>), or null outside node_modules. */
export function packageRoot(file) {
  const parts = file.split(path.sep), i = parts.lastIndexOf('node_modules');
  if (i < 0 || i + 1 >= parts.length) return null;
  return parts.slice(0, i + (parts[i + 1].startsWith('@') ? 3 : 2)).join(path.sep);
}

/**
 * A reader of modules, each read once: {bytes, hash, files, packages, missing, unfollowed, unparsed} — its bytes, the
 * files it reads (relative imports, linked packages' entries, assets: never inside node_modules, but for a file of the
 * reading file's own installed package — StoryReel's modules as npm installs them), the packages it imports
 * by version, the relative specifiers that lead nowhere (`missing`), the imports and assets chosen at run time
 * (`unfollowed`), and the line the reading lost its way at, when the file ends inside a string or template (`unparsed`).
 */
export function moduleReader(who) {
  const known = new Map();
  return file => {
    if (known.has(file)) return known.get(file);
    if (!existsSync(file)) throw new Error(`${who}: ${file} does not exist: name a file that is there (relative to the folder the command runs in)`);
    const bytes = readFileSync(file), files = [], packages = [], missing = [], unfollowed = []; let unparsed = null;
    // A file in node_modules is a package's, named by its version — except a file of the same installed package as the
    // one reading it: a package's own modules (StoryReel's, installed) are its code, followed like any other.
    const own = packageRoot(file), take = f => { const root = packageRoot(f); if (root === null || root === own) files.push(f); };
    if (PARSED.test(file)) {
      const scanned = scanModule(bytes.toString('utf8')), {imports, assets, computed} = scanned; unparsed = scanned.unparsed;
      for (const spec of imports) {
        if (spec.startsWith('.') || spec.startsWith('/')) { const f = resolveRelative(spec, file); if (f) take(f); else missing.push(spec); continue; }
        const r = resolvePackage(spec, file);
        if (r?.file) take(r.file); else if (r?.pkg) packages.push(r.pkg);
      }
      for (const spec of assets) { const f = path.resolve(path.dirname(file), spec); if (isFile(f)) take(f); else missing.push(spec); }
      unfollowed.push(...computed);
    }
    const entry = {bytes, hash: createHash('sha256').update(bytes).digest('hex'), files, packages, missing, unfollowed, unparsed};
    known.set(file, entry);
    return entry;
  };
}
