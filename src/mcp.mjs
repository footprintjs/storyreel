/**
 * The review tools as an MCP server (stdio), so any assistant that speaks the Model Context Protocol — Claude Code,
 * Claude Desktop, VS Code's Copilot, Cursor — calls timeline, review, part and still directly. An adapter over the
 * same core as the command line (tools.mjs): each call runs the command line in a fresh process in the project's
 * folder, so an edit to a kit between two calls is always seen (a long-lived process would keep the old module).
 * A still comes back as the picture itself (and its path); everything else as text.
 *
 *   claude mcp add storyreel -- npx storyreel mcp --ep ep1 --voice work/ep1/voice
 * The flags given at start are every call's defaults; a call's arguments override them.
 */
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {TOOLS} from './tools.mjs';

const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const REQUIRED = {part: ['scene'], still: ['at'], strip: ['at']};

/** The tools as MCP lists them: name, what it does, its arguments (strings) and which are required. */
export const mcpTools = () => Object.entries(TOOLS).map(([name, t]) => ({name, description: t.about,
  inputSchema: {type: 'object', properties: Object.fromEntries(Object.entries(t.args).map(([a, d]) => [a, {type: 'string', description: d}])), ...(REQUIRED[name] ? {required: REQUIRED[name]} : {})}}));

/** One call: the command line in a fresh process; its text (and a still's picture) as MCP content. */
export function callTool(name, args = {}, {defaults = {}, cwd = process.cwd()} = {}) {
  if (!TOOLS[name]) return Promise.resolve({isError: true, content: [{type: 'text', text: `no tool called "${name}" (the tools are ${Object.keys(TOOLS).join(', ')})`}]});
  const flags = Object.entries({...defaults, ...args}).flatMap(([k, v]) => [`--${k}`, String(v)]);
  return new Promise(resolve => {
    const child = spawn(process.execPath, [CLI, name, ...flags], {cwd}), out = [], err = [];
    child.stdout.on('data', d => out.push(d)); child.stderr.on('data', d => err.push(d));
    child.on('close', code => {
      const text = Buffer.concat(out).toString('utf8').trim(), problem = Buffer.concat(err).toString('utf8').trim();
      if (code !== 0) return resolve({isError: true, content: [{type: 'text', text: problem || `storyreel ${name} stopped (${code})`}]});
      const content = [{type: 'text', text}];
      const png = TOOLS[name].picture && text.split(' · ')[0];   // a tool that makes a picture: it comes back as the image
      if (png) try { content.push({type: 'image', mimeType: 'image/png', data: readFileSync(png).toString('base64')}); } catch { /* the path is in the text */ }
      resolve({content});
    });
  });
}

/** Serve MCP over stdio: one JSON-RPC message per line in, one per line out. */
export function serveMcp({defaults = {}, cwd = process.cwd(), input = process.stdin, output = process.stdout} = {}) {
  const send = message => output.write(`${JSON.stringify({jsonrpc: '2.0', ...message})}\n`);
  const lines = createInterface({input}), pending = new Set();
  const answer = async line => {
    let msg; try { msg = JSON.parse(line); } catch { return send({id: null, error: {code: -32700, message: 'Parse error'}}); }
    const {id, method, params = {}} = msg; if (id === undefined) return;   // a notification (initialized, cancelled): nothing to answer
    if (method === 'initialize') return send({id, result: {protocolVersion: params.protocolVersion ?? '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'storyreel', version: VERSION},
      instructions: 'Read first, look last: timeline (when each beat lands) → review (what is wrong, as text) → fix → part (a quick render of the scenes) → one still to confirm the look.'}});
    if (method === 'ping') return send({id, result: {}});
    if (method === 'tools/list') return send({id, result: {tools: mcpTools()}});
    if (method === 'tools/call') return send({id, result: await callTool(params.name, params.arguments ?? {}, {defaults, cwd})});
    send({id, error: {code: -32601, message: `Method not found: ${method}`}});
  };
  lines.on('line', line => { const p = answer(line); pending.add(p); p.finally(() => pending.delete(p)); });
  // When the client closes the pipe, the calls still running are answered first.
  return new Promise(resolve => lines.on('close', () => Promise.allSettled([...pending]).then(resolve)));
}
