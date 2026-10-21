/**
 * The review tools as an MCP server (stdio), so any assistant that speaks the Model Context Protocol — Claude Code,
 * Claude Desktop, VS Code's Copilot, Cursor — calls timeline, review, part, changes, still and strip directly. An adapter over
 * the same core as the command line (tools.mjs): each call runs the command line in a fresh process in the project's
 * folder, so an edit to a kit between two calls is always seen (a long-lived process would keep the old module).
 * A still or a strip comes back as the picture itself (and its path); everything else as text.
 *
 *   claude mcp add storyreel -- npx storyreel mcp --ep ep1 --voice work/ep1/voice
 *
 * The project is fixed when the server starts: its config (--config: a module the command line imports and runs), its
 * folder (--cwd: where every call runs) and the film's own flags (--ep ep1). A call carries only its tool's arguments
 * (one given at start is that tool's default, and the call's own overrides it), so a client steered by text it read
 * cannot make the server run another module or work in another folder: a call that names config or cwd, an argument
 * its tool does not take, or a value the command line would read as a flag is refused before anything runs
 * (refusalOf), and the server goes on answering.
 */
import {spawn} from 'node:child_process';
import {existsSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {TOOLS} from './tools.mjs';

const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const REQUIRED = {still: ['at'], strip: ['at']};   // part takes its scenes or a window (from, to): it says which it lacks

/** What only the server's start chooses: the project's config (a module the command line runs) and its folder. */
export const FIXED_AT_START = Object.freeze(['config', 'cwd']);
const FIXED_RULE = 'config and cwd are fixed when the MCP server starts; restart it with --config (or --cwd) to use another';

/** The tools as MCP lists them: name, what it does, its arguments (strings) and which are required — and no others. */
export const mcpTools = () => Object.entries(TOOLS).map(([name, t]) => ({name, description: t.about,
  inputSchema: {type: 'object', properties: Object.fromEntries(Object.entries(t.args).map(([a, d]) => [a, {type: 'string', description: d}])), ...(REQUIRED[name] ? {required: REQUIRED[name]} : {}), additionalProperties: false}}));

/**
 * The picture a tool printed: the path on the LAST line that starts with one (absolute, as the tools print it, ending
 * in .png, then " · " or the line's end), so a line a kit or a library printed before it (a logger's, on stdout)
 * never hides it; null unless that file is there.
 */
export function pictureIn(text) {
  const named = text.split('\n').map(line => /^(.+?\.png)(?: · |$)/.exec(line.trimEnd())?.[1]).filter(p => p && path.isAbsolute(p)).at(-1);
  return named && existsSync(named) ? named : null;
}

/**
 * The server's start, from its flags: the project — its config (as given: the command line reads it from the folder)
 * and the folder every call runs in (cwd, resolved from `from`; refused when it is not a folder) — and every other flag,
 * which each call is given (defaults).
 */
export function startOf(flags = {}, from = process.cwd()) {
  const {config, cwd, ...defaults} = flags, folder = path.resolve(from, cwd ?? '.');
  if (!statSync(folder, {throwIfNoEntry: false})?.isDirectory()) throw new Error(`--cwd ${cwd} is not a folder: start the server on the project's folder`);
  return {defaults, cwd: folder, ...(config === undefined ? {} : {config})};
}

const takes = name => Object.keys(TOOLS[name].args).join(', ');

/** Why a call is refused before anything runs, or null when it may run (the rule is the header's). */
export function refusalOf(name, args) {
  if (!Object.hasOwn(TOOLS, name)) return `no tool called "${name}" (the tools are ${Object.keys(TOOLS).join(', ')})`;
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return `${name}: the arguments are an object (${takes(name)})`;
  const keys = Object.keys(args);
  if (keys.some(k => FIXED_AT_START.includes(k))) return FIXED_RULE;
  const other = keys.find(k => !Object.hasOwn(TOOLS[name].args, k));
  if (other !== undefined) return `${name} takes no "${other}" (it takes ${takes(name)}): the rest — the config, the folder, the film's own flags — is fixed when the MCP server starts`;
  const flag = keys.find(k => String(args[k]).startsWith('--'));
  if (flag !== undefined) return `${name}: ${flag} ${JSON.stringify(String(args[flag]))} would be read as a flag: a value never starts with --`;
  return null;
}

/** A call answered as an error: its words, as MCP content. */
const failed = text => ({isError: true, content: [{type: 'text', text}]});

/**
 * One call: the command line in a fresh process in the project's folder — the start's flags, the call's arguments over
 * them, the start's config last — and its text (and a still's or a strip's picture) as MCP content. Never rejects.
 */
export function callTool(name, args = {}, {defaults = {}, config, cwd = process.cwd()} = {}) {
  const refused = refusalOf(name, args);
  if (refused) return Promise.resolve(failed(refused));
  const flags = Object.entries({...defaults, ...args, ...(config === undefined ? {} : {config})}).flatMap(([k, v]) => [`--${k}`, String(v)]);
  return new Promise(resolve => {
    let child;
    try { child = spawn(process.execPath, [CLI, name, ...flags], {cwd}); } catch (e) { return resolve(failed(`storyreel ${name}: ${e.message}`)); }   // a value it cannot pass (a NUL byte)
    const out = [], err = [];
    child.stdout.on('data', d => out.push(d)); child.stderr.on('data', d => err.push(d));
    child.on('error', e => resolve(failed(`storyreel ${name}: ${existsSync(cwd) ? e.message : `the project's folder ${cwd} is not there any more: restart the server on it`}`)));   // it could not start
    child.on('close', code => {
      const text = Buffer.concat(out).toString('utf8').trim(), problem = Buffer.concat(err).toString('utf8').trim();
      if (code !== 0) return resolve(failed(problem || `storyreel ${name} stopped (${code})`));
      const content = [{type: 'text', text}];
      const png = TOOLS[name].picture ? pictureIn(text) : null;   // a tool that makes a picture: it comes back as the image
      if (png) try { content.push({type: 'image', mimeType: 'image/png', data: readFileSync(png).toString('base64')}); } catch { /* unreadable: the path is in the text */ }
      resolve({content});
    });
  });
}

/**
 * Serve MCP over stdio: one JSON-RPC message per line in, one per line out. `defaults`, `config` and `cwd` are the
 * start's (startOf). A message that is not one, or a call that fails, is answered as an error, and the next is answered.
 */
export function serveMcp({defaults = {}, config, cwd = process.cwd(), input = process.stdin, output = process.stdout} = {}) {
  const send = message => output.write(`${JSON.stringify({jsonrpc: '2.0', ...message})}\n`);
  const lines = createInterface({input}), pending = new Set();
  const reply = async (method, params) => {
    if (method === 'initialize') return {result: {protocolVersion: params.protocolVersion ?? '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'storyreel', version: VERSION},
      instructions: 'Read first, look last: timeline (when each beat lands) → review (what is wrong, as text) → fix → part (a quick render of the scenes) → one still to confirm the look. After an edit: changes (what it redraws, and why) → changes with render (only those pieces drawn, and a short clip of them to show); the full render then only joins.'}};
    if (method === 'ping') return {result: {}};
    if (method === 'tools/list') return {result: {tools: mcpTools()}};
    if (method === 'tools/call') return {result: await callTool(params.name, params.arguments ?? {}, {defaults, config, cwd})};
    return {error: {code: -32601, message: `Method not found: ${method}`}};
  };
  const answer = async line => {
    let msg; try { msg = JSON.parse(line); } catch { return send({id: null, error: {code: -32700, message: 'Parse error'}}); }
    if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) return send({id: null, error: {code: -32600, message: 'Invalid Request: a message is one JSON object'}});
    const {id, method} = msg, params = msg.params !== null && typeof msg.params === 'object' ? msg.params : {};
    if (id === undefined) return;   // a notification (initialized, cancelled): nothing to answer
    try { send({id, ...(await reply(method, params))}); } catch (e) { send({id, error: {code: -32603, message: `Internal error: ${e?.message ?? e}`}}); }
  };
  lines.on('line', line => { const p = answer(line); pending.add(p); p.finally(() => pending.delete(p)); });
  // When the client closes the pipe, the calls still running are answered first.
  return new Promise(resolve => lines.on('close', () => Promise.allSettled([...pending]).then(resolve)));
}
