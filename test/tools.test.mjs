// The review tools (tools.mjs) and the command line (cli.mjs): read first (timeline, review), look last (part, still).
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {loadProject, timeline, review, still, TOOLS, strip} from '../src/tools.mjs';
import {tempDir} from './tmp.mjs';

const project = fileURLToPath(new URL('./fixtures/tools/', import.meta.url)), cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const run = (args, cwd = project) => spawnSync(process.execPath, [cli, ...args], {cwd, encoding: 'utf8'});
const has = cmd => !spawnSync(cmd, ['-version']).error;

test('the tools read the project\'s film: its timeline and its review as text, a still as one picture', async () => {
  const out = tempDir('tools'), p = await loadProject({cwd: project, out});
  assert.match(await timeline(p, {scene: 'two', handles: 0}), /^two: [\d.]+–[\d.]+ s of [\d.]+ s \(times from its start\)\n0\.00  ── two$/m);
  const read = await review(p, {full: 'true'});
  assert.match(read, /review \(under-captions, words-overlap, cut-off, hook, text-density, stale, still, slideshow, claims\):\n[\s\S]*0:02\.0–0:03\.8 one · words over words: "Alpha" and "Beta"/);
  const short = await review(p);
  assert.match(short, /review \(.*\):\n1 finding: 1 words over words · verdicts: 2 passed, 1 not run\nDrawn parts hold together · not run: no kit on screen gives its parts \(parts\(t\)\)\n0:02\.0–0:03\.8 one · words over words: "Alpha" and "Beta"$/, 'by default: the counts, what did not pass, the findings');
  assert.ok(short.length < read.length);
  assert.match(read, /\nverdicts:\nNo slideshow · passed: the shots move inside themselves: most of their running time is never held still for more than 3 s \(0 % of [\d.]+ s dead, \d+ % still\)\nDrawn parts hold together · not run: no kit on screen gives its parts \(parts\(t\)\)\nEvery number has a source · passed: the film shows no number/, 'the verdicts follow the findings, each with why');
  const s = await still(p, {at: 'one+2.5,two+0'});
  assert.ok(existsSync(s.file) && s.file.endsWith('.png'), s.text);
  await assert.rejects(still(p, {at: 'three+1'}), /"three\+1" is not a moment \(scene\+seconds, or seconds; the scenes are one, two\)/);
  assert.deepEqual(Object.keys(TOOLS), ['timeline', 'review', 'part', 'changes', 'still', 'strip']);
  const st = await strip(p, {at: 'one+2', frames: 6});
  assert.ok(existsSync(st.file) && st.file.endsWith('strip-one+2.png'), st.text);
  assert.match(st.text, /6 frames at 30 fps around one\+2 \([\d.]+ s\): frame 0 is the moment/);
  await assert.rejects(strip(p, {at: 'one+2,two+0'}), /strip: name one moment \(at: "scene\+seconds"\); a still shows several/);
  await assert.rejects(strip(p, {}), /^Error: strip: name one moment \(at: "scene\+seconds"\)$/, 'a strip\'s refusals name the strip, not the still');
  await assert.rejects(strip(p, {at: 'three+1'}), /^Error: strip: "three\+1" is not a moment \(scene\+seconds, or seconds; the scenes are one, two\)$/);
  await assert.rejects(still(p, {}), /^Error: still: name the moments \(at: "scene\+seconds,…"\)$/);
  await assert.rejects(strip(p, {at: 'one+2', frames: 1}), /frames must be a whole number 2–30/);
  // A moment is exactly scene+seconds: its words are printed as its label, so nothing may ride after them.
  await assert.rejects(still(p, {at: 'one+2+/elsewhere/secret.png'}), /^Error: still: "one\+2\+\/elsewhere\/secret\.png" is not a moment/);
  await assert.rejects(strip(p, {at: 'one+\n2'}), /^Error: strip: "one\+\\n2" is not a moment/, 'a control character');
  await assert.rejects(still(p, {at: 'one+1', width: 60000}), /^Error: still: width must be a whole number of pixels 100–4000, not 60000$/);
  await assert.rejects(strip(p, {at: 'one+1', width: '12.5'}), /^Error: strip: width must be a whole number of pixels 100–4000, not "12\.5"$/);
  await assert.rejects(still(p, {at: Array(31).fill('one+1').join(',')}), /^Error: still: at most 30 moments in one picture, not 31$/);
  assert.match(await review(p, {loop: 'true'}), /review \(.*loop.*\):[\s\S]*the loop jumps: the end is not the start/);
});

test('a film with no voice is paced from its config: the even timings take its holds and tails, as makeFilm takes them', async () => {
  const plain = await loadProject({cwd: project}), paced = await loadProject({cwd: project, paced: 'true'});
  // A 2 s hold after "a few words", and each scene's 0.8 s tail made 1.5 s (counted from its last word's end, as a voice's is).
  const grew = paced.film.total - plain.film.total;
  assert.ok(Math.abs(grew - (2 + 2 * (1.5 - .8))) < .1, `the paced film is ${grew.toFixed(3)} s longer`);
  assert.match(await timeline(paced, {scene: 'two', handles: 0}), /^two: /);
  await assert.rejects(loadProject({cwd: project, paced: 'notail'}), /pacing\.sceneTail is missing: give the settle after each scene's last word, 0\.3–3 seconds \(e\.g\. "sceneTail": 0\.8\)/);
});

test('the command line: each tool by name, its flags to the film too; refusals name the fix', () => {
  const help = run(['help']);
  assert.equal(help.status, 0); assert.match(help.stdout, /Read first, look last: timeline → review → fix → part → still\./);
  const r = run(['review', '--scene', 'one']);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /words over words: "Alpha" and "Beta"/);
  const none = run(['review'], tempDir('empty'));   // a folder with no project in it (its own, not the shared temp folder)
  assert.equal(none.status, 1); assert.match(none.stderr, /no storyreel\.config\.mjs in .*: a project names its film there/);
  assert.equal(run(['draw']).status, 2, 'an unknown tool is a usage error');
  for (const command of ['timeline', 'review', 'part', 'changes', 'still', 'strip', 'beats', 'breakdown', 'mcp']) {
    const h = run([command, '--help']);
    assert.equal(h.status, 0, `${command} --help: ${h.stderr}`); assert.match(h.stdout, new RegExp(`^storyreel ${command} `), `${command} --help gives its own usage`);
  }
  assert.match(run(['still', '--help']).stdout, /--at {2}moments: scene\+seconds/);
  assert.match(run(['review', '--help']).stdout, /--full {2}true for every finding/);
});

test('part: the scenes with their handles, rendered quickly, reviewed first', {skip: has('ffmpeg') ? false : 'needs ffmpeg'}, () => {
  const out = tempDir('part'), r = run(['part', '--scene', 'two', '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /two: [\d.]+–[\d.]+ s .* — review/);
  assert.match(r.stdout, new RegExp(`${out.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/parts/two\\.mp4 · [\\d.]+ s · made in [\\d.]+ s · checks`));
});

/**
 * An MCP server started with `flags` in `cwd`: each message written (an object as JSON-RPC, a string as the line itself),
 * its input closed, and once it has answered and ended, its replies by id (and all of them, in order), its exit code and
 * what it said on stderr.
 */
async function mcpSession(flags, messages, {cwd = project} = {}) {
  const server = spawn(process.execPath, [cli, 'mcp', ...flags], {cwd}), replies = new Map(), all = [];
  let buffered = '', stderr = '';
  server.stdout.on('data', d => { buffered += d; let i; while ((i = buffered.indexOf('\n')) >= 0) { const m = JSON.parse(buffered.slice(0, i)); buffered = buffered.slice(i + 1); replies.set(m.id, m); all.push(m); } });
  server.stderr.on('data', d => { stderr += d; });
  for (const m of messages) server.stdin.write(`${typeof m === 'string' ? m : JSON.stringify({jsonrpc: '2.0', ...m})}\n`);
  server.stdin.end();
  const code = await new Promise(r => server.on('close', r));
  return {replies, all, code, stderr};
}
const ask = (id, method, params) => ({id, method, params});
const call = (id, name, args) => ask(id, 'tools/call', {name, arguments: args});

test('the same tools over MCP (stdio): the handshake, the list with each tool\'s arguments, a call as text, a still as the picture, an error as an error', async () => {
  const out = tempDir('mcp');
  const {replies} = await mcpSession(['--out', out], [
    ask(1, 'initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'test', version: '0'}}), {method: 'notifications/initialized'},
    ask(2, 'tools/list', {}), call(3, 'review', {scene: 'one'}), call(4, 'still', {at: 'one+2.5'}),
    call(5, 'still', {at: 'nowhere+1'}), ask(6, 'resources/list', {}), call(7, 'strip', {at: 'one+2', frames: '4'})]);
  assert.equal(replies.get(1).result.serverInfo.name, 'storyreel'); assert.ok(replies.get(1).result.capabilities.tools);
  const tools = replies.get(2).result.tools;
  assert.deepEqual(tools.map(t => t.name), ['timeline', 'review', 'part', 'changes', 'still', 'strip']);
  assert.deepEqual(Object.keys(tools.find(t => t.name === 'part').inputSchema.properties), ['scene', 'from', 'to', 'handles', 'full']);
  assert.equal(tools.find(t => t.name === 'part').inputSchema.required, undefined, 'a part takes its scenes or a window: it says which it lacks');
  assert.deepEqual(Object.keys(tools.find(t => t.name === 'changes').inputSchema.properties), ['render', 'handles']);
  assert.deepEqual(tools.find(t => t.name === 'strip').inputSchema.required, ['at']);
  assert.deepEqual(tools.find(t => t.name === 'still').inputSchema.required, ['at']);
  assert.ok(tools.every(t => t.inputSchema.additionalProperties === false), 'a tool takes its own arguments and no others');
  assert.match(replies.get(3).result.content[0].text, /words over words: "Alpha" and "Beta"/);
  const [text, image] = replies.get(4).result.content;
  assert.match(text.text, /stills\/one\+2\.5\.png · 1 frame/); assert.equal(image.type, 'image'); assert.equal(image.mimeType, 'image/png');
  assert.equal(replies.get(5).result.isError, true); assert.match(replies.get(5).result.content[0].text, /"nowhere\+1" is not a moment/);
  assert.equal(replies.get(6).error.code, -32601);
  const [stripText, stripImage] = replies.get(7).result.content;
  assert.match(stripText.text, /strip-one\+2\.png · 4 frames/); assert.equal(stripImage.type, 'image', 'a strip comes back as the picture too');
  // Another config is named when the server starts, never by a call.
  const noisy = await mcpSession(['--config', 'noisy.config.mjs', '--out', out], [call(8, 'still', {at: 'two+0'})]);
  const [noisyText, noisyImage] = noisy.replies.get(8).result.content;
  assert.match(noisyText.text, /^TREE PIPELINE: [\s\S]*\n\/.*stills\/two\+0\.png · 1 frame/, 'the project printed first; the picture\'s line came last');
  assert.equal(noisyImage?.type, 'image', 'and the picture still comes back');
});

test('over MCP the project is fixed at start: a call that names config or cwd, another argument, or a value read as a flag is refused, runs nothing, and the server answers the next call', async t => {
  const out = tempDir('mcp-fixed', t), elsewhere = tempDir('mcp-elsewhere', t), ran = path.join(elsewhere, 'ran.txt'), secret = path.join(elsewhere, 'secret.png');
  // A config that leaves a mark when it is imported: what a call naming it would run. And a picture outside the project.
  writeFileSync(path.join(elsewhere, 'storyreel.config.mjs'), `import {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(ran)}, 'ran');\nexport default {film: () => ({})};\n`);
  writeFileSync(secret, 'not yours to see');
  const {replies, all, code} = await mcpSession(['--out', out], [
    call(1, 'review', {config: path.join(elsewhere, 'storyreel.config.mjs')}), call(2, 'review', {scene: 'one', cwd: elsewhere}),
    call(3, 'still', {at: 'one+1', out: elsewhere}), call(4, 'timeline', {scene: '--config'}), call(5, 'constructor', {}),
    call(6, 'timeline', {scene: 'one\u0000'}), ask(7, 'tools/call', null), 'null', call(9, 'still', {at: `one+2+\n${secret}\nx`}),
    call(10, ['timeline'], {}), `{"jsonrpc":"2.0","method":"ping","id":${'['.repeat(9000)}${']'.repeat(9000)}}`, call(12, 'review', {scene: 'one'})]);
  const said = id => { assert.ok(replies.has(id), `no answer to call ${id}: the server stopped (exit ${code})`); return replies.get(id).result; };
  const rule = 'config and cwd are fixed when the MCP server starts; restart it with --config (or --cwd) to use another';
  for (const id of [1, 2]) assert.deepEqual(said(id), {isError: true, content: [{type: 'text', text: rule}]});
  assert.equal(said(3).content[0].text, 'still takes no "out" (it takes at, width): the rest — the config, the folder, the film\'s own flags — is fixed when the MCP server starts');
  assert.equal(said(4).content[0].text, 'timeline: scene "--config" would be read as a flag: a value never starts with --');
  assert.match(said(5).content[0].text, /^no tool called "constructor"/, 'a name every object inherits is not a tool');
  assert.equal(said(6).isError, true, 'a value the command line cannot be given (a NUL byte) is an error, not the server\'s end');
  assert.equal(said(7).isError, true);
  assert.deepEqual(said(9).content.map(c => c.type), ['text'], 'a moment with a line naming another picture is refused, and no picture comes back');
  assert.match(said(9).content[0].text, /is not a moment/);
  assert.match(said(10).content[0].text, /^a tool is named by text/);
  assert.equal(all.filter(m => m.id === null && m.error?.code === -32600).length, 2, 'a message that is not an object, and an id that is neither a string nor a number');
  assert.match(said(12).content[0].text, /words over words: "Alpha" and "Beta"/, 'and the server answers the next call');
  assert.equal(code, 0);
  assert.equal(existsSync(ran), false, 'the config a call named never ran');
  assert.deepEqual(readdirSync(elsewhere).sort(), ['secret.png', 'storyreel.config.mjs'], 'and nothing was written in the folder a call named');
});

test('over MCP a still\'s picture is the one it made, sent on a pipe of its own: a path printed after it, or whatever else the project does, is never taken for it', {timeout: 60_000}, async t => {
  const out = tempDir('mcp-picture', t), decoyProject = tempDir('mcp-decoy', t), decoy = path.join(decoyProject, 'decoy.png');
  writeFileSync(decoy, 'a picture the still did not make');
  // A project that listens for messages (a channel it held open would never let a call end), writes junk on fd 3 (only a
  // still's command line has the pipe there) and prints another picture's path as the very last line, as it exits.
  writeFileSync(path.join(decoyProject, 'storyreel.config.mjs'), [
    'import {writeSync} from \'node:fs\';',
    `import project from ${JSON.stringify(pathToFileURL(path.join(project, 'storyreel.config.mjs')).href)};`,
    'process.on(\'message\', () => {});',
    `if (process.argv[2] === 'still') writeSync(3, ${JSON.stringify(`not json\n{"picture": 5}\n{"picture": "relative.png"}`)});   // no line end: the picture's line still stands alone`,
    `process.on('exit', () => writeSync(1, ${JSON.stringify(`${decoy}\n`)}));`,
    'export default project;', ''].join('\n'));
  const {replies, code} = await mcpSession(['--out', out], [call(1, 'still', {at: 'one+2'}), call(2, 'timeline', {scene: 'two', handles: 0})], {cwd: decoyProject});
  const [text, image] = replies.get(1).result.content;
  assert.match(text.text, new RegExp(`\\n${decoy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), 'the decoy\'s path is the last line of the text');
  assert.equal(image?.data, readFileSync(path.join(realpathSync(out), 'stills', 'one+2.png')).toString('base64'), 'and the picture is the still\'s own');
  assert.match(replies.get(2)?.result.content[0].text ?? '', /^two: /, 'a call with no picture is answered too');
  assert.equal(code, 0);
});

test('over MCP the project is chosen at start: --cwd is the folder every call runs in, and one that is not a folder refuses to start', async t => {
  const out = tempDir('mcp-cwd', t), from = tempDir('mcp-from', t), folder = tempDir('mcp-project', t);
  // A config that reads its storyboard by a path relative to the folder the command line runs in.
  writeFileSync(path.join(folder, 'storyboard.json'), JSON.stringify({title: 'Near', scenes: [{id: 'near', narration: 'A scene read from beside the config.'}]}));
  writeFileSync(path.join(folder, 'storyreel.config.mjs'), `import {readFileSync} from 'node:fs';\nimport project from ${JSON.stringify(pathToFileURL(path.join(project, 'storyreel.config.mjs')).href)};\nexport default {film: flags => ({...project.film(flags), storyboard: JSON.parse(readFileSync('storyboard.json', 'utf8'))})};\n`);
  const {replies} = await mcpSession(['--cwd', folder, '--out', out], [call(1, 'timeline', {})], {cwd: from});
  assert.match(replies.get(1).result.content?.[0].text ?? JSON.stringify(replies.get(1)), /^the whole film: [\d.]+–[\d.]+ s of [\d.]+ s \(times from its start\)\n0\.00 {2}── near$/m);
  const none = spawnSync(process.execPath, [cli, 'mcp', '--cwd', 'nowhere'], {cwd: from, encoding: 'utf8', input: ''});
  assert.equal(none.status, 2); assert.equal(none.stderr.trim(), 'storyreel mcp: --cwd nowhere is not a folder: start the server on the project\'s folder');
});
