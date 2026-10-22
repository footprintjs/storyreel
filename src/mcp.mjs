/**
 * The review tools as an MCP server (stdio), so any assistant that speaks the Model Context Protocol — Claude Code,
 * Claude Desktop, VS Code's Copilot, Cursor — calls every review tool (TOOLS: timeline, review, part, anchors, script,
 * changes, still, sheet, strip) directly. An adapter over the same core as the command line (tools.mjs): each call runs the
 * command line in a fresh process in the project's folder, so an edit to a kit between two calls is always seen (a
 * long-lived process would keep the old module). A still or a strip comes back as the picture itself (and its path), a
 * sheet as its pictures (up to MAX_PICTURES; every path is in the text); everything else as text.
 *
 *   claude mcp add storyreel -- npx storyreel mcp --ep ep1 --voice work/ep1/voice
 *
 * The project is fixed when the server starts: its config (--config: a module the command line imports and runs), its
 * folder (--cwd: where every call runs) and the film's own flags (--ep ep1). A call carries only its tool's arguments
 * (one given at start is that tool's default, and the call's own overrides it; like every flag, they reach the config's
 * film() too), so a client steered by text it read cannot make the server run another module or work in another folder:
 * a call that names config or cwd, an argument its tool does not take, or a value the command line would read as a flag
 * is refused before anything runs (refusalOf), and the server goes on answering. Nothing a call can shape is read back
 * as a path: a picture's path comes from the command line on a pipe of its own (fd 3: sendPicture, picturesOf), never
 * out of the text.
 */
import {spawn} from 'node:child_process';
import {existsSync, readFileSync, statSync, writeSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {TOOLS} from './tools.mjs';

const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const REQUIRED = {strip: ['at']};   // part takes its scenes or a window (from, to), still its moments or a scene's beats: each says which it lacks

/** What only the server's start chooses: the project's config (a module the command line runs) and its folder. */
export const FIXED_AT_START = Object.freeze(['config', 'cwd']);
const FIXED_RULE = 'config and cwd are fixed when the MCP server starts; restart it with --config (or --cwd) to use another';

/** The tools as MCP lists them: name, what it does, its arguments (strings) and which are required — and no others. */
export const mcpTools = () => Object.entries(TOOLS).map(([name, t]) => ({name, description: t.about,
  inputSchema: {type: 'object', properties: Object.fromEntries(Object.entries(t.args).map(([a, d]) => [a, {type: 'string', description: d}])), ...(REQUIRED[name] ? {required: REQUIRED[name]} : {}), additionalProperties: false}}));

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
  const tools = `the tools are ${Object.keys(TOOLS).join(', ')}`;
  if (typeof name !== 'string') return `a tool is named by text (${tools})`;
  if (!Object.hasOwn(TOOLS, name)) return `no tool called "${name}" (${tools})`;
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
 * The picture's channel: for a still or a strip this server opens fd 3, a pipe of the call's own, and says so in
 * PICTURE_FD; the command line writes the picture's path there as one line (sendPicture) and the server reads it from
 * there only (picturesOf). The text is never read for a path: it holds words a call shaped (a moment's label).
 */
const PICTURE_FD = 'STORYREEL_PICTURE_FD';
// Taken once, as the command line loads: neither the project's config nor anything the command line starts sees it.
const pictureFd = process.env[PICTURE_FD] === '3' ? 3 : null;
delete process.env[PICTURE_FD];

/** The command line's half (cli.mjs, after a still, a strip or each sheet): a picture's path, as one line on fd 3 when the server opened it. */
export function sendPicture(file) {
  if (pictureFd === null || typeof file !== 'string') return;
  // A line of its own, even after a stray write that did not end one.
  try { writeSync(pictureFd, `\n${JSON.stringify({picture: file})}\n`); } catch { /* the server is gone: the path is in the text */ }
}

/** The most pictures one call returns (a film's sheets): each is a whole image in the reply, so the rest stay paths in the text. */
export const MAX_PICTURES = 6;
/** The server's half: the lines on fd 3 that are {"picture": an absolute .png path}, in order, each once, at most MAX_PICTURES; anything else there is ignored. */
const picturesOf = said => [...new Set(said.split('\n').map(line => { try { return JSON.parse(line)?.picture; } catch { return undefined; } })
  .filter(p => typeof p === 'string' && path.isAbsolute(p) && p.endsWith('.png')))].slice(0, MAX_PICTURES);

/**
 * One call: the command line in a fresh process in the project's folder — the start's flags, the call's arguments over
 * them, the start's config last — and its text (and a still's or a strip's picture) as MCP content. Never rejects.
 */
export function callTool(name, args = {}, {defaults = {}, config, cwd = process.cwd()} = {}) {
  const refused = refusalOf(name, args);
  if (refused) return Promise.resolve(failed(refused));
  const flags = Object.entries({...defaults, ...args, ...(config === undefined ? {} : {config})}).flatMap(([k, v]) => [`--${k}`, String(v)]);
  const picturing = TOOLS[name].picture === true, channel = picturing ? {stdio: ['pipe', 'pipe', 'pipe', 'pipe'], env: {...process.env, [PICTURE_FD]: '3'}} : {};
  return new Promise(resolve => {
    let child;
    try { child = spawn(process.execPath, [CLI, name, ...flags], {cwd, ...channel}); } catch (e) { return resolve(failed(`storyreel ${name}: ${e.message}`)); }   // a value it cannot pass (a NUL byte)
    const out = [], err = [], sent = [];
    child.stdout.on('data', d => out.push(d)); child.stderr.on('data', d => err.push(d));
    child.stdio[3]?.on('data', d => sent.push(d));   // the pictures' pipe (a still's, a strip's, a sheet's): 'close' waits for its end too
    child.on('error', e => resolve(failed(`storyreel ${name}: ${existsSync(cwd) ? e.message : `the project's folder ${cwd} is not there any more: restart the server on it`}`)));   // it could not start
    child.on('close', code => {
      const text = Buffer.concat(out).toString('utf8').trim(), problem = Buffer.concat(err).toString('utf8').trim();
      if (code !== 0) return resolve(failed(problem || `storyreel ${name} stopped (${code})`));
      const content = [{type: 'text', text}];
      for (const picture of picturing ? picturesOf(Buffer.concat(sent).toString('utf8')) : []) try { content.push({type: 'image', mimeType: 'image/png', data: readFileSync(picture).toString('base64')}); } catch { /* unreadable: the path is in the text */ }
      resolve({content});
    });
  });
}

/** A JSON-RPC id: a string, a number or null (it is echoed back in the answer, so nothing else is taken). */
const isId = id => id === null || typeof id === 'string' || typeof id === 'number';

/**
 * Serve MCP over stdio: one JSON-RPC message per line in, one per line out. `defaults`, `config` and `cwd` are the
 * start's (startOf). A message that is not one, or a call that fails, is answered as an error, and the next is answered.
 */
export function serveMcp({defaults = {}, config, cwd = process.cwd(), input = process.stdin, output = process.stdout} = {}) {
  const send = message => output.write(`${JSON.stringify({jsonrpc: '2.0', ...message})}\n`);
  const lines = createInterface({input}), pending = new Set();
  const reply = async (method, params) => {
    if (method === 'initialize') return {result: {protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'storyreel', version: VERSION},
      instructions: 'Read first, look last: timeline (when each beat lands) → review (what is wrong, as text) → fix → part (a quick render of the scenes) → one still to confirm the look. After an edit to the narration, recipe or pacing: anchors (every phrase not said, or said twice, with its fix) first. After an edit: changes (what it redraws, and why) → changes with render (only those pieces drawn, and a short clip of them to show); the full render then only joins. For someone checking the whole film: sheet (contact sheets).'}};
    if (method === 'ping') return {result: {}};
    if (method === 'tools/list') return {result: {tools: mcpTools()}};
    if (method === 'tools/call') return {result: await callTool(params.name, params.arguments ?? {}, {defaults, config, cwd})};
    return {error: {code: -32601, message: `Method not found: ${method}`}};
  };
  const answer = async line => {
    let msg; try { msg = JSON.parse(line); } catch { return send({id: null, error: {code: -32700, message: 'Parse error'}}); }
    if (msg === null || typeof msg !== 'object' || Array.isArray(msg) || !(msg.id === undefined || isId(msg.id))) return send({id: null, error: {code: -32600, message: 'Invalid Request: a message is one JSON object, its id a string or a number'}});
    const {id, method} = msg, params = msg.params !== null && typeof msg.params === 'object' ? msg.params : {};
    if (id === undefined) return;   // a notification (initialized, cancelled): nothing to answer
    try { send({id, ...(await reply(method, params))}); } catch (e) { send({id, error: {code: -32603, message: `Internal error: ${e?.message ?? e}`}}); }
  };
  // Whatever one message does, the server goes on: an answer that cannot even be sent is dropped, never thrown.
  lines.on('line', line => { const p = answer(line).catch(() => {}); pending.add(p); p.finally(() => pending.delete(p)); });
  // When the client closes the pipe, the calls still running are answered first.
  return new Promise(resolve => lines.on('close', () => Promise.allSettled([...pending]).then(resolve)));
}
