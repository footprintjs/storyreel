// The skills tell the truth: every page under plugin/skills is held to the code, so a skill can never drift from what
// the library does (an earlier usage skill for another library drifted into five false claims).
//
// What a page may say, and what this test checks:
//   - `npx storyreel <command> --flag` — the command is one the CLI's --help lists, and so is each flag of it;
//   - `footprint-storyreel/<subpath>` — the subpath is in package.json's exports;
//   - `import {a, b} from 'footprint-storyreel/<subpath>'` in a code block — each name is a real export of it;
//   - `footprint-storyreel/<subpath>` · `name` in prose — the name is a real export of it;
//   - [a link](other.md#a-heading) — the file is there, inside the plugin (a plugin carries only plugin/), with that heading;
//   - node_modules/footprint-storyreel/<path> — the path is in the repo and ships in the package (package.json files);
//   - a SKILL.md has a name (its folder's) and a description, and stays short;
//   - the code blocks run. Each page's blocks run in order, in a temp folder of the page's own, with the package
//     installed there (a link to this checkout):
//       ```json file=storyboard.json``` and ```js file=farm.mjs```   written into the folder, not run
//       ```js run``` (or ```js run file=check.mjs```)               run with node: it must exit 0
//       ```sh run```                                              each line an `npx storyreel …` command: it must exit 0
//     A block marked `run` is small and fast: it compiles, reviews or computes, and never renders (a render is minutes
//     of FFmpeg, not a check), so a run block that renders, or calls a command that does, is refused here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, symlinkSync} from 'node:fs';
import {spawn, execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {tempDir} from './tmp.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const plugin = path.join(repo, 'plugin');
const skills = path.join(plugin, 'skills');
const pkg = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8'));
const cli = path.join(repo, 'src', 'cli.mjs');
const rel = file => path.relative(repo, file);

/** Every .md file under a folder, sorted. */
const markdownIn = dir => readdirSync(dir).sort().flatMap(name => {
  const p = path.join(dir, name);
  return statSync(p).isDirectory() ? markdownIn(p) : name.endsWith('.md') ? [p] : [];
});
const pages = markdownIn(skills).map(file => ({file, text: readFileSync(file, 'utf8')}));

/** A page's fenced code blocks: {lang, run, file, code, line}. A fence may be indented (inside a list item). */
function blocksOf(text) {
  const out = [], lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)```(\S*)\s*(.*)$/.exec(lines[i]);
    if (!open) continue;
    const [, indent, lang, info] = open, body = [];
    let j = i + 1;
    for (; j < lines.length && !new RegExp(`^${indent}\`\`\`\\s*$`).test(lines[j]); j++) body.push(lines[j].startsWith(indent) ? lines[j].slice(indent.length) : lines[j]);
    if (j >= lines.length) throw new Error(`a code block opened on line ${i + 1} is never closed`);
    const words = info.split(/\s+/).filter(Boolean);
    out.push({lang, run: words.includes('run'), file: words.find(w => w.startsWith('file='))?.slice(5) ?? null, code: body.join('\n'), line: i + 1});
    i = j;
  }
  return out;
}
const CODE = new Set(['js', 'mjs', 'javascript', 'ts', 'typescript']);

// ── What the CLI says it has ────────────────────────────────────────────────────────────────────────────────────────
/** {command: Set(flags)} as `storyreel --help` lists them (and `storyreel breakdown --help`); mcp takes any flag. */
function cliCommands() {
  const help = execFileSync(process.execPath, [cli, '--help'], {encoding: 'utf8'}), commands = {};
  let current = null;
  for (const line of help.split('\n')) {
    const named = /^ {2}([a-z][\w-]*)\s/.exec(line), flag = /^\s+--([a-z][\w-]*)\s/.exec(line);
    if (named) commands[current = named[1]] = new Set(['help']);
    else if (flag && current) commands[current].add(flag[1]);
  }
  for (const tool of ['mcp', 'breakdown']) if (new RegExp(`storyreel ${tool}\\b`).test(help)) commands[tool] = new Set(['help']);
  const breakdownHelp = execFileSync(process.execPath, [cli, 'breakdown', '--help'], {encoding: 'utf8'});
  for (const [, f] of breakdownHelp.matchAll(/--([a-z][\w-]*)/g)) commands.breakdown?.add(f);
  return commands;
}
const ANY_FLAG = new Set(['mcp']);   // its flags are every call's defaults: the film's own flags (--ep ep1) too
const TOOL_FLAGS = ['config'];       // every tool reads --config (another config file)

/** Every `npx storyreel <command> --flags…` (and inline `storyreel <command>`) on a page: {command, flags, line}. */
function commandsOn(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/(?:npx storyreel|(?<=`)storyreel) ([a-z][\w-]*)([^`|;#&\n]*)/g)) {
      out.push({command: m[1], flags: [...m[2].matchAll(/(?:^|\s)--([a-z][\w-]*)/g)].map(f => f[1]), line: i + 1});
    }
  });
  return out;
}

// ── What the package exports ────────────────────────────────────────────────────────────────────────────────────────
const exported = sub => (sub === '' ? '.' : `./${sub}`);
const fileOf = sub => { const e = pkg.exports[exported(sub)]; return path.join(repo, typeof e === 'string' ? e : e.default); };
/**
 * The names each subpath exports. Read through one module that re-exports each as a namespace (export * as), never
 * by awaiting import(subpath) itself: a module that exports a function called `then` (regions does) is a thenable,
 * and awaiting its namespace never settles.
 */
async function exportsOf(subs) {
  const dir = tempDir('skills-exports'), list = [...subs], file = path.join(dir, 'names.mjs');
  writeFileSync(file, list.map((s, i) => `export * as s${i} from ${JSON.stringify(pathToFileURL(fileOf(s)).href)};`).join('\n'));
  const names = await import(pathToFileURL(file).href);
  return new Map(list.map((s, i) => [s, new Set(Object.keys(names[`s${i}`]))]));
}

/** Every `import … from 'footprint-storyreel[/sub]'` in a page's code: {sub, names, defaultName, line}. */
function importsOn(page) {
  const out = [];
  for (const block of blocksOf(page.text).filter(b => CODE.has(b.lang))) {
    for (const m of block.code.matchAll(/import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\}\s*)?from\s*['"]footprint-storyreel(?:\/([\w/-]+))?['"]/g)) {
      const names = (m[2] ?? '').split(',').map(s => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean);
      out.push({sub: m[3] ?? '', names, defaultName: m[1] ?? null, line: block.line});
    }
  }
  return out;
}
/** Every subpath a page names anywhere, and the names it gives one in prose (`footprint-storyreel/x` · `name`). */
const subpathsOn = text => [...text.matchAll(/(?<!node_modules\/)footprint-storyreel\/([a-z][\w/-]*[\w])/g)].map(m => m[1]);   // (a path into the installed package is not a subpath)
const proseNamesOn = text => [...text.matchAll(/`footprint-storyreel(?:\/([a-z][\w/-]*[\w]))?`\s*·\s*`([A-Za-z_$][\w$]*)`/g)].map(m => ({sub: m[1] ?? '', name: m[2]}));

// ── Links ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A heading's anchor as GitHub writes it: lower case, punctuation dropped, spaces to hyphens. */
const slug = heading => heading.trim().toLowerCase().replace(/[`*_]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
const anchorsOf = file => new Set(readFileSync(file, 'utf8').split('\n').filter(l => /^#{1,6}\s/.test(l)).map(l => slug(l.replace(/^#+\s*/, ''))));
const linksOn = text => [...text.replace(/```[\s\S]*?```/g, '').matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)].map(m => m[1]).filter(href => !/^(https?:|mailto:)/.test(href));

/** Whether a path in the repo ships in the package: package.json files, as npm reads them (a folder, or a glob). */
function ships(relPath) {
  return pkg.files.some(pattern => {
    if (!pattern.includes('*')) return relPath === pattern || relPath.startsWith(`${pattern}/`);
    return new RegExp(`^${pattern.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`).test(relPath);
  });
}

// ── Running a page's blocks ─────────────────────────────────────────────────────────────────────────────────────────
const RENDERS = /\b(makeFilm|renderFilm|makeRelease|checkVideo|breakdown|beatMap|peakOf)\s*\(|storyreel (part|breakdown|beats)\b/;
// A block runs as a program of its own, never as part of this test run (the runner's NODE_TEST_CONTEXT stays here).
const {NODE_TEST_CONTEXT: _runner, ...ownEnv} = process.env;
const run = (args, cwd) => new Promise(resolve => {
  const child = spawn(process.execPath, args, {cwd, env: ownEnv}), out = [], err = [];
  const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
  child.stdout.on('data', d => out.push(d)); child.stderr.on('data', d => err.push(d));
  child.on('close', code => { clearTimeout(timer); resolve({code, out: Buffer.concat(out).toString(), err: Buffer.concat(err).toString()}); });
});
/** A folder with the package installed in it, as `npm i` would leave it: node_modules/footprint-storyreel. */
function project(t) {
  const dir = tempDir('skills', t);
  mkdirSync(path.join(dir, 'node_modules'));
  symlinkSync(repo, path.join(dir, 'node_modules', 'footprint-storyreel'), 'dir');
  return dir;
}
/** `npx storyreel review --scene farm` → the CLI's arguments (words, or "quoted words"). */
const argsOf = line => [...line.replace(/^npx storyreel\s+/, '').matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3]);

// ── The tests ───────────────────────────────────────────────────────────────────────────────────────────────────────
test('the skills are there: every skill folder has a SKILL.md with its name and a description, and it stays short', () => {
  const folders = readdirSync(skills).filter(n => statSync(path.join(skills, n)).isDirectory());
  assert.ok(folders.includes('storyreel') && folders.includes('storyreel-cartoon') && folders.includes('storyreel-review'), `the skills are ${folders.join(', ')}`);
  for (const folder of folders) {
    const file = path.join(skills, folder, 'SKILL.md');
    assert.ok(existsSync(file), `${folder} has no SKILL.md`);
    const text = readFileSync(file, 'utf8'), head = /^---\n([\s\S]*?)\n---\n/.exec(text);
    assert.ok(head, `${rel(file)} starts with its frontmatter (--- name, description ---)`);
    const field = key => new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(head[1])?.[1].trim();
    assert.equal(field('name'), folder, `${rel(file)}: name is its folder's`);
    const description = field('description') ?? '';
    assert.ok(description.length > 40 && description.length <= 1024, `${rel(file)}: a description says when to load the skill (41–1024 characters, not ${description.length})`);
    const lines = text.trimEnd().split('\n').length;
    assert.ok(lines <= 160, `${rel(file)} is ${lines} lines: a SKILL.md is the main path (about 150 lines); move the detail into a page beside it`);
  }
  for (const manifest of ['plugin/.claude-plugin/plugin.json', '.claude-plugin/marketplace.json']) JSON.parse(readFileSync(path.join(repo, manifest), 'utf8'));
});

test('every `npx storyreel <command>` a skill names is a command the CLI lists, and every flag of it is one it takes', () => {
  const commands = cliCommands(), wrong = [];
  for (const {file, text} of pages) {
    for (const {command, flags, line} of commandsOn(text)) {
      if (!commands[command]) { wrong.push(`${rel(file)}:${line}: storyreel ${command} is not a command (the CLI lists ${Object.keys(commands).join(', ')})`); continue; }
      if (ANY_FLAG.has(command)) continue;
      for (const f of flags) if (!commands[command].has(f) && !(command !== 'beats' && command !== 'breakdown' && TOOL_FLAGS.includes(f))) wrong.push(`${rel(file)}:${line}: storyreel ${command} takes no --${f} (it takes ${[...commands[command]].map(x => `--${x}`).join(', ')})`);
    }
  }
  assert.deepEqual(wrong, []);
  assert.ok(pages.some(p => commandsOn(p.text).length), 'the skills name commands, and this test reads them');
});

test('every footprint-storyreel subpath a skill names is in the package\'s exports, and every name imported from one is a real export', async () => {
  const wrong = [], subs = new Set();
  for (const {file, text} of pages) {
    for (const sub of subpathsOn(text)) { if (!pkg.exports[exported(sub)]) wrong.push(`${rel(file)}: footprint-storyreel/${sub} is not in package.json exports`); else subs.add(sub); }
    for (const {sub} of [...importsOn({text}), ...proseNamesOn(text)]) if (pkg.exports[exported(sub)]) subs.add(sub);
  }
  const names = await exportsOf(subs);
  for (const {file, text} of pages) {
    for (const {sub, names: wanted, defaultName, line} of importsOn({text})) {
      const door = `footprint-storyreel${sub ? `/${sub}` : ''}`;
      if (!names.has(sub)) continue;   // (a subpath that is not there is named above)
      if (defaultName && !names.get(sub).has('default')) wrong.push(`${rel(file)}:${line}: ${door} has no default export (import {…} from it)`);
      for (const n of wanted) if (!names.get(sub).has(n)) wrong.push(`${rel(file)}:${line}: ${door} does not export ${n}`);
    }
    for (const {sub, name} of proseNamesOn(text)) if (names.has(sub) && !names.get(sub).has(name)) wrong.push(`${rel(file)}: footprint-storyreel${sub ? `/${sub}` : ''} does not export ${name}`);
  }
  assert.deepEqual(wrong, []);
  assert.ok(subs.size >= 10, `the skills name the subpaths they teach (${subs.size} read)`);
});

test('every link between skill pages resolves, inside the plugin, to a heading that is there', () => {
  const wrong = [];
  for (const {file, text} of pages) {
    for (const href of linksOn(text)) {
      const [target, anchor] = href.split('#'), to = target ? path.resolve(path.dirname(file), target) : file;
      if (path.relative(plugin, to).startsWith('..')) { wrong.push(`${rel(file)}: ${href} leaves the plugin (a plugin carries only plugin/): name the package's file in words instead`); continue; }
      if (!existsSync(to)) { wrong.push(`${rel(file)}: ${href} is not there`); continue; }
      if (anchor && to.endsWith('.md') && !anchorsOf(to).has(anchor)) wrong.push(`${rel(file)}: ${href}: ${rel(to)} has no heading #${anchor}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('every path a skill names inside the installed package ships in it', () => {
  const wrong = [];
  for (const {file, text} of pages) {
    for (const [, p] of text.matchAll(/node_modules\/footprint-storyreel\/([\w.-]+(?:\/[\w.-]+)*)/g)) {
      if (!existsSync(path.join(repo, p))) wrong.push(`${rel(file)}: node_modules/footprint-storyreel/${p} is not in the package`);
      else if (statSync(path.join(repo, p)).isFile() && !ships(p) && p !== 'package.json') wrong.push(`${rel(file)}: ${p} is in the repo but not in package.json files, so an install does not have it`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('the code blocks run: each page\'s files are written and its run blocks exit 0, in a folder of its own', {concurrency: true}, async t => {
  const runnable = pages.filter(p => blocksOf(p.text).some(b => b.run));
  assert.ok(runnable.length >= 8, `the pages carry blocks marked run (${runnable.length})`);
  await Promise.all(runnable.map(page => t.test(rel(page.file), async t2 => {
    const dir = project(t2);
    for (const block of blocksOf(page.text)) {
      const where = `${rel(page.file)}:${block.line}`;
      if (block.run && RENDERS.test(block.code.replace(/\/\/.*$/gm, ''))) assert.fail(`${where}: a block marked run renders (or reads a song or a video); mark only blocks that compile, review or compute`);
      if (block.file) writeFileSync(path.join(dir, block.file), block.code);
      if (!block.run) continue;
      if (block.lang === 'sh') {
        for (const line of block.code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))) {
          assert.match(line, /^npx storyreel /, `${where}: a sh run block holds only npx storyreel commands, not ${line}`);
          const r = await run([cli, ...argsOf(line)], dir);
          assert.equal(r.code, 0, `${where}: ${line} exited ${r.code}\n${r.err || r.out}`);
        }
        continue;
      }
      assert.ok(CODE.has(block.lang), `${where}: only js and sh blocks run, not ${block.lang}`);
      const script = block.file ?? `block-${block.line}.mjs`;
      if (!block.file) writeFileSync(path.join(dir, script), block.code);
      const r = await run([script], dir);
      assert.equal(r.code, 0, `${where}: the block exited ${r.code}\n${r.err || r.out}`);
    }
  })));
});
