// The review tools (tools.mjs) and the command line (cli.mjs): read first (timeline, review), look last (part, still).
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadProject, timeline, review, still, TOOLS, strip} from '../src/tools.mjs';
import {pictureIn} from '../src/mcp.mjs';
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

test('the picture a tool printed is on the last line that starts with its path, and only when the file is there', () => {
  const dir = tempDir('picture'), png = path.join(dir, 'one two.png');
  writeFileSync(png, 'png');
  assert.equal(pictureIn(`${png} · 1 frame: one+2.5 (2.50 s)`), png, 'its path, then " · ", a space in it too');
  assert.equal(pictureIn(`TREE PIPELINE: executeNodeChildren - Error for id: loop {\n  error: no frame\n}\n${png} · 1 frame`), png, 'a logger\'s lines printed before it');
  assert.equal(pictureIn(`/nowhere/frame.png · noise\n${png}`), png, 'the last such line, the path alone on it');
  assert.equal(pictureIn(`${png} · 1 frame\nwrote ${path.join(dir, 'other.png')}`), png, 'a line that does not start with a path names no picture');
  assert.equal(pictureIn(`${png} · 1 frame\n/nowhere/frame.png · noise`), null, 'the last one is not there: no picture (its path is still in the text)');
  assert.equal(pictureIn('one two.png · 1 frame'), null, 'a path is absolute, as the tools print it');
  assert.equal(pictureIn('review: nothing found'), null);
});

test('the same tools over MCP (stdio): the handshake, the list with each tool\'s arguments, a call as text, a still as the picture, an error as an error', async () => {
  const out = tempDir('mcp'), {spawn} = await import('node:child_process');
  const server = spawn(process.execPath, [cli, 'mcp', '--out', out], {cwd: project}), replies = new Map();
  let buffered = '';
  server.stdout.on('data', d => { buffered += d; let i; while ((i = buffered.indexOf('\n')) >= 0) { const m = JSON.parse(buffered.slice(0, i)); buffered = buffered.slice(i + 1); replies.set(m.id, m); } });
  const ask = (id, method, params) => server.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id, method, params})}\n`);
  ask(1, 'initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'test', version: '0'}});
  server.stdin.write(`${JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'})}\n`);
  ask(2, 'tools/list', {}); ask(3, 'tools/call', {name: 'review', arguments: {scene: 'one'}}); ask(4, 'tools/call', {name: 'still', arguments: {at: 'one+2.5'}});
  ask(5, 'tools/call', {name: 'still', arguments: {at: 'nowhere+1'}}); ask(6, 'resources/list', {}); ask(7, 'tools/call', {name: 'strip', arguments: {at: 'one+2', frames: '4'}});
  ask(8, 'tools/call', {name: 'still', arguments: {at: 'two+0', config: 'noisy.config.mjs'}});
  server.stdin.end();
  await new Promise(r => server.on('close', r));
  assert.equal(replies.get(1).result.serverInfo.name, 'storyreel'); assert.ok(replies.get(1).result.capabilities.tools);
  const tools = replies.get(2).result.tools;
  assert.deepEqual(tools.map(t => t.name), ['timeline', 'review', 'part', 'changes', 'still', 'strip']);
  assert.deepEqual(Object.keys(tools.find(t => t.name === 'part').inputSchema.properties), ['scene', 'from', 'to', 'handles', 'full']);
  assert.equal(tools.find(t => t.name === 'part').inputSchema.required, undefined, 'a part takes its scenes or a window: it says which it lacks');
  assert.deepEqual(Object.keys(tools.find(t => t.name === 'changes').inputSchema.properties), ['render', 'handles']);
  assert.deepEqual(tools.find(t => t.name === 'strip').inputSchema.required, ['at']);
  assert.deepEqual(tools.find(t => t.name === 'still').inputSchema.required, ['at']);
  assert.match(replies.get(3).result.content[0].text, /words over words: "Alpha" and "Beta"/);
  const [text, image] = replies.get(4).result.content;
  assert.match(text.text, /stills\/one\+2\.5\.png · 1 frame/); assert.equal(image.type, 'image'); assert.equal(image.mimeType, 'image/png');
  assert.equal(replies.get(5).result.isError, true); assert.match(replies.get(5).result.content[0].text, /"nowhere\+1" is not a moment/);
  assert.equal(replies.get(6).error.code, -32601);
  const [stripText, stripImage] = replies.get(7).result.content;
  assert.match(stripText.text, /strip-one\+2\.png · 4 frames/); assert.equal(stripImage.type, 'image', 'a strip comes back as the picture too');
  const [noisyText, noisyImage] = replies.get(8).result.content;
  assert.match(noisyText.text, /^TREE PIPELINE: [\s\S]*\n\/.*stills\/two\+0\.png · 1 frame/, 'the project printed first; the picture\'s line came last');
  assert.equal(noisyImage?.type, 'image', 'and the picture still comes back');
});
