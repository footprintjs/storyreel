#!/usr/bin/env node
/**
 * What an agent must READ and WRITE to make the main path's farm film (plugin/skills/storyreel-cartoon/SKILL.md), as
 * numbers: StoryReel must not make an AI waste tokens. An LLM cannot run in CI, so the cost is measured where it is
 * paid — in bytes, and in tokens estimated as characters / 4:
 *   - ctx: the three skills' descriptions, which an agent's context holds in every session, before it opens a page;
 *   - read: the skill pages on the main path (the router, the cartoon skill, the review skill), and the default output of `storyreel timeline`, `review`, `part --scene farm` and `still --at farm+12` for the farm
 *     film (the folder's path in it said as "<project>", so the numbers are the same on every machine);
 *   - write: the JSON an agent writes, the farm film's storyboard and recipe.
 *
 *   node scripts/agent-cost.mjs              the table
 *   node scripts/agent-cost.mjs --json       the numbers, as test/agent-cost.baseline.json holds them
 *   node scripts/agent-cost.mjs --baseline   writes test/agent-cost.baseline.json: a deliberate act, reviewed, with a
 *                                            line in the CHANGELOG (test/agent-cost.test.mjs fails on a number that
 *                                            grows more than GROWTH over it)
 */
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, symlinkSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url)), cli = path.join(repo, 'src', 'cli.mjs');
export const BASELINE = path.join(repo, 'test', 'agent-cost.baseline.json');
/** How much a number may grow over the baseline before the test fails: about 10 %. */
export const GROWTH = .1;
/** The pages on the main path, read in this order: the router names the cartoon skill, which ends in the review loop. */
export const PAGES = ['storyreel/SKILL.md', 'storyreel-cartoon/SKILL.md', 'storyreel-review/SKILL.md'];
/** The commands the main path runs, as an agent types them after `npx storyreel`. */
export const COMMANDS = [['timeline'], ['review'], ['part', '--scene', 'farm'], ['still', '--at', 'farm+12']];

const tokens = text => Math.ceil(text.length / 4);
const skill = page => readFileSync(path.join(repo, 'plugin', 'skills', page), 'utf8');
/** A page's fenced blocks written into a folder under their names (```lang file=name```), as test/skills-blocks.mjs reads them. */
function filesOf(text) {
  const out = {}, re = /^```\S*[^\n]*\bfile=(\S+)[^\n]*\n([\s\S]*?)\n```\s*$/gm;
  for (const m of text.matchAll(re)) out[m[1]] = m[2];
  return out;
}

/** The farm film's folder, as `npm i footprint-storyreel` leaves it, with the cartoon skill's files written in. */
export function farmProject(dir) {
  mkdirSync(path.join(dir, 'node_modules'), {recursive: true});
  symlinkSync(repo, path.join(dir, 'node_modules', 'footprint-storyreel'), 'dir');
  const files = filesOf(skill('storyreel-cartoon/SKILL.md'));
  for (const [name, code] of Object.entries(files)) writeFileSync(path.join(dir, name), code);
  return files;
}

/**
 * Every number, by name: {group, name, bytes, tokens}. `dir`: an empty folder for the farm film (the script makes its
 * own); `commands`: the commands to run (COMMANDS; a machine with no FFmpeg leaves `part` out).
 */
export function measure(dir, {commands = COMMANDS} = {}) {
  const rows = [], add = (group, name, text) => rows.push({group, name, bytes: Buffer.byteLength(text), tokens: tokens(text)});
  const descriptions = PAGES.map(p => /^description: (.*)$/m.exec(skill(p))?.[1] ?? '').join('\n');
  add('ctx', 'the skills\' descriptions', descriptions);
  for (const page of PAGES) add('read', page, skill(page));
  const files = farmProject(dir);
  for (const args of commands) {
    const r = spawnSync(process.execPath, [cli, ...args], {cwd: dir, encoding: 'utf8', timeout: 300_000});
    if (r.status !== 0) throw new Error(`storyreel ${args.join(' ')} failed (exit ${r.status}): ${r.stderr}`);
    add('read', `storyreel ${args.join(' ')}`, r.stdout.split(dir).join('<project>').replace(/made in [\d.]+ s/, 'made in 0.0 s'));
  }
  for (const name of ['storyboard.json', 'recipe.json']) add('write', name, files[name]);
  return rows;
}

/** The totals: what every session holds (ctx: the descriptions, before any page opens), what is read, what is written. */
export const totals = rows => Object.fromEntries(['ctx', 'read', 'write'].map(g => [g, rows.filter(r => r.group === g).reduce((n, r) => n + r.tokens, 0)]));

export function table(rows) {
  const width = Math.max(...rows.map(r => r.name.length));
  const line = r => `${r.group.padEnd(5)}  ${r.name.padEnd(width)}  ${String(r.bytes).padStart(6)} B  ${String(r.tokens).padStart(5)} tok`;
  const t = totals(rows);
  return [`${'what'.padEnd(5)}  ${''.padEnd(width)}  ${'bytes'.padStart(8)}  ${'tokens'.padStart(9)}`, ...rows.map(line), `total: ${t.ctx} tokens in every session, ${t.read} read, ${t.write} written`].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = mkdtempSync(path.join(tmpdir(), 'storyreel-agentcost-'));
  try {
    const rows = measure(dir), json = Object.fromEntries(rows.map(r => [r.name, {bytes: r.bytes, tokens: r.tokens}]));
    if (process.argv.includes('--baseline')) { writeFileSync(BASELINE, `${JSON.stringify(json, null, 2)}\n`); console.log(`wrote ${path.relative(process.cwd(), BASELINE)}`); }
    console.log(process.argv.includes('--json') ? JSON.stringify(json, null, 2) : table(rows));
  } finally { rmSync(dir, {recursive: true, force: true}); }
}
