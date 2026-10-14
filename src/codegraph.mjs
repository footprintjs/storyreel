/**
 * The code a module reads, followed: what a code fingerprint covers (segments.mjs · codeFingerprint, sourceCode).
 *
 * A module is read as code by a small tokenizer — comments dropped, strings and template literals read as values, a
 * regular expression skipped — so an import written in a comment (`// import {old} from './gone.mjs'`) or held as sample
 * code in a string is no import. What it finds:
 *   imports   import … from '…', import '…', export … from '…', require('…'), import('…') with one literal
 *   assets    new URL('…', import.meta.url): a file the module loads, read and hashed
 *   computed  import(expression): a module chosen at run time, which no reader can follow — listed, never guessed
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

/** The source as tokens: {type: 'name' | 'string' | 'template' | 'punct' | 'number', value}; comments are dropped. */
export function tokenize(source) {
  const s = String(source), out = []; let i = 0;
  const last = () => out.at(-1);
  const regexAllowed = () => { const t = last(); return !t || (t.type === 'punct' && !')]}'.includes(t.value)) || (t.type === 'name' && BEFORE_REGEX.has(t.value)); };
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { const end = s.indexOf('*/', i + 2); i = end < 0 ? s.length : end + 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, value = '';
      while (j < s.length && s[j] !== c && s[j] !== '\n') { if (s[j] === '\\') { value += s[j + 1] ?? ''; j += 2; } else value += s[j++]; }
      out.push({type: 'string', value}); i = j + 1; continue;
    }
    if (c === '`') {   // a template: its text (when it holds no ${…}), its expressions skipped with their own strings and braces
      let j = i + 1, value = '', plain = true;
      while (j < s.length && s[j] !== '`') {
        if (s[j] === '\\') { value += s[j + 1] ?? ''; j += 2; continue; }
        if (s[j] === '$' && s[j + 1] === '{') {
          plain = false; let depth = 1; j += 2;
          while (j < s.length && depth) { const d = s[j]; if (d === '{') depth++; else if (d === '}') depth--; else if (d === '"' || d === "'" || d === '`') { const q = d; j++; while (j < s.length && s[j] !== q) j += s[j] === '\\' ? 2 : 1; } j++; }
          continue;
        }
        value += s[j++];
      }
      out.push({type: 'template', value: plain ? value : null}); i = j + 1; continue;
    }
    if (c === '/' && regexAllowed()) {   // a regular expression: up to its closing slash (not one in a class), then its flags
      let j = i + 1, inClass = false;
      while (j < s.length && s[j] !== '\n') { const d = s[j]; if (d === '\\') { j += 2; continue; } if (d === '[') inClass = true; else if (d === ']') inClass = false; else if (d === '/' && !inClass) break; j++; }
      j++; while (j < s.length && /[a-z]/i.test(s[j])) j++;
      out.push({type: 'regex', value: ''}); i = j; continue;
    }
    if (/[A-Za-z_$\u0080-￿]/.test(c)) { let j = i + 1; while (j < s.length && /[\w$\u0080-￿]/.test(s[j])) j++; out.push({type: 'name', value: s.slice(i, j)}); i = j; continue; }
    if (/\d/.test(c)) { let j = i + 1; while (j < s.length && /[\w.]/.test(s[j])) j++; out.push({type: 'number', value: s.slice(i, j)}); i = j; continue; }
    out.push({type: 'punct', value: c}); i++;
  }
  return out;
}

const text = t => (t.type === 'string' ? JSON.stringify(t.value) : t.type === 'template' ? `\`${t.value ?? '…'}\`` : t.value);
const literal = t => t && (t.type === 'string' || (t.type === 'template' && t.value !== null));

/** What a module's source reads: {imports, assets, computed} (see the module's header). */
export function scanModule(source) {
  const tok = tokenize(source), imports = [], assets = [], computed = [];
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
    // new URL('…', import.meta.url): an asset the module loads beside itself.
    if (is(k, 'name', 'new') && is(k + 1, 'name', 'URL') && is(k + 2, 'punct', '(') && literal(tok[k + 3]) && is(k + 4, 'punct', ',')
      && is(k + 5, 'name', 'import') && is(k + 6, 'punct', '.') && is(k + 7, 'name', 'meta') && is(k + 8, 'punct', '.') && is(k + 9, 'name', 'url')) assets.push(tok[k + 3].value);
  }
  return {imports, assets, computed};
}

const isFile = f => existsSync(f) && statSync(f).isFile();
/** A relative specifier's file: as named, as TypeScript's ESM spelling names it, with an extension, or an index; or null. */
export function resolveRelative(spec, from) {
  const base = path.resolve(path.dirname(from), spec), ext = path.extname(base).toLowerCase();
  const candidates = [base, ...(TS_FOR[ext] ?? []).map(e => base.slice(0, -ext.length) + e), ...EXTENSIONS.map(e => base + e), ...EXTENSIONS.map(e => path.join(base, `index${e}`))];
  return candidates.find(isFile) ?? null;
}

/** A package's entry for a subpath ('' for the package itself), by its exports, module or main; or null. */
function packageEntry(dir, subpath, manifest) {
  const pick = v => (typeof v === 'string' ? v : v && typeof v === 'object' ? pick(v.import ?? v.default ?? v.node ?? v.require) : null);
  const exp = manifest.exports, key = subpath ? `./${subpath}` : '.';
  const named = typeof exp === 'string' ? (key === '.' ? exp : null) : exp && typeof exp === 'object' ? pick(key in exp ? exp[key] : key === '.' && !Object.keys(exp).some(k => k.startsWith('.')) ? exp : null) : null;
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

/**
 * A reader of modules, each read once: {bytes, hash, files, packages, missing, unfollowed} — its bytes, the files it
 * reads (relative imports, linked packages' entries, assets: never inside node_modules), the packages it imports by
 * version, the relative specifiers that lead nowhere (`missing`) and the imports chosen at run time (`unfollowed`).
 */
export function moduleReader(who) {
  const known = new Map();
  return file => {
    if (known.has(file)) return known.get(file);
    if (!existsSync(file)) throw new Error(`${who}: ${file} does not exist`);
    const bytes = readFileSync(file), files = [], packages = [], missing = [], unfollowed = [];
    const take = f => { if (!f.split(path.sep).includes('node_modules')) files.push(f); };
    if (PARSED.test(file)) {
      const {imports, assets, computed} = scanModule(bytes.toString('utf8'));
      for (const spec of imports) {
        if (spec.startsWith('.') || spec.startsWith('/')) { const f = resolveRelative(spec, file); if (f) take(f); else missing.push(spec); continue; }
        const r = resolvePackage(spec, file);
        if (r?.file) take(r.file); else if (r?.pkg) packages.push(r.pkg);
      }
      for (const spec of assets) { const f = path.resolve(path.dirname(file), spec); if (isFile(f)) take(f); else missing.push(spec); }
      unfollowed.push(...computed);
    }
    const entry = {bytes, hash: createHash('sha256').update(bytes).digest('hex'), files, packages, missing, unfollowed};
    known.set(file, entry);
    return entry;
  };
}
