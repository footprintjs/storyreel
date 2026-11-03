// Notes left on the film in the studio, end to end: the studio's one write (POST /api/note) taken only from its own page
// and only in a note's shape, the place read from the film, the line signed into feedback.md beside the recipe; then
// `storyreel feedback` (and the MCP tool) reading them back for an agent, and ticking one.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync, writeFileSync, copyFileSync, existsSync, statSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {startStudio} from '../src/studio/server.mjs';
import {jsonLines} from '../src/studio/lines.mjs';
import {readFeedback} from '../src/studio/feedback-read.mjs';
import {noteKey} from '../src/studio/notekey.mjs';
import {callTool} from '../src/mcp.mjs';
import {tempDir} from './tmp.mjs';
import {installed, studioIn, stopped} from './studio-run.mjs';

const hello = fileURLToPath(new URL('../examples/hello/', import.meta.url));
const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

/** A request with every header chosen (fetch picks some itself): {status, body (parsed when JSON), allow}. */
const raw = (port, pathName, {method = 'POST', headers = {}, body} = {}) => new Promise((resolve, reject) => {
  const sent = Object.fromEntries(Object.entries({host: `127.0.0.1:${port}`, ...headers}).filter(([, v]) => v !== undefined));   // undefined: the header is not sent
  const req = http.request({host: '127.0.0.1', port, path: pathName, method, headers: sent}, res => {
    let text = ''; res.on('data', d => (text += d));
    res.on('end', () => { let parsed = text; try { parsed = JSON.parse(text); } catch { /* not JSON */ } resolve({status: res.statusCode, body: parsed, allow: res.headers.allow}); });
  });
  req.on('error', reject); req.end(body);
});
/** A note as the studio's own page sends it. */
const fromPage = (port, note, headers = {}) => raw(port, '/api/note', {body: typeof note === 'string' ? note : JSON.stringify(note),
  headers: {'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: `http://127.0.0.1:${port}`, ...headers}});

/** The hello film in a folder of its own, its recipe file known: a studio on it, its note key in `home` (or `homeIn(dir)`). */
async function helloStudio(t, {homeIn = () => path.join(tempDir('notes-home', t), 'storyreel'), source = true} = {}) {
  const dir = tempDir('notes', t), file = path.join(dir, 'recipe.json'), home = homeIn(dir);
  copyFileSync(hello + 'recipe.json', file); copyFileSync(hello + 'rule.ts', path.join(dir, 'rule.ts'));
  const storyboard = JSON.parse(readFileSync(hello + 'storyboard.json', 'utf8'));
  const load = async () => {
    const recipe = JSON.parse(readFileSync(file, 'utf8'));
    return {film: await compileFilm({storyboard, recipe, root: dir, timings: evenTimings(storyboard, {tail: 4})}), storyboard, recipe, ...(source ? {source: {file}} : {})};
  };
  const studio = await startStudio({load, watch: [], port: 0, log: () => {}, home});
  t.after(() => studio.close());
  return {studio, dir, file, home, film: await (await fetch(`${studio.url}api/film`)).json()};
}

test('a note from the studio\'s own page: one signed line of feedback.md beside the recipe, its place read from the film', async t => {
  const {studio, dir, file, home, film} = await helloStudio(t), port = studio.port;
  assert.equal(film.feedbackFile, path.join(dir, 'feedback.md'));
  const left = await fromPage(port, {version: film.version, t: 4.3, x: 350, y: 560, words: 'the shepherd walks in too fast'});
  assert.equal(left.status, 200, JSON.stringify(left.body));
  const {note, open} = left.body;
  assert.deepEqual([note.entry, note.file, note.line, note.words, open], ['story.items[0]', 'recipe.json', jsonLines(readFileSync(file, 'utf8')).get('story.items[0]'), 'the shepherd walks in too fast', 1]);
  assert.match(note.at, /^story\+4\.30$/);
  const text = readFileSync(path.join(dir, 'feedback.md'), 'utf8');
  assert.match(text, /^<!-- storyreel feedback · project [0-9a-f]{16} · keep this line/);
  assert.match(text, /\n- \[ \] 0:04\.3 · story\+4\.30 · story\.items\[0\] \(recipe\.json:\d+\) · ".+" — the shepherd walks in too fast <!-- note:[0-9a-f]{8} by:[0-9a-f]{8} sig:[0-9a-f]{32} -->\n$/);
  if (process.platform !== 'win32') assert.equal(statSync(path.join(home, 'key')).mode & 0o777, 0o600, 'the key: the person\'s alone, outside the project');
  // At the playhead alone; and two at once, both kept (one note is written at a time).
  const [a, b] = await Promise.all([fromPage(port, {version: film.version, t: 1, words: 'one'}), fromPage(port, {version: film.version, t: 2, words: 'two'})]);
  assert.deepEqual([a.status, b.status, a.body.note.entry], [200, 200, null]);
  const {key} = noteKey(home);
  assert.deepEqual((await readFeedback(readFileSync(path.join(dir, 'feedback.md'), 'utf8'), {key})).notes.map(n => n.words), ['the shepherd walks in too fast', 'one', 'two']);
});

test('the one write is the narrowest: POST only, from the studio\'s own page only (no Sec-Fetch-Site is refused), JSON, bounded, a note\'s fields only', async t => {
  const {studio, dir, film} = await helloStudio(t), port = studio.port, ok = {version: film.version, t: 1, words: 'fine'};
  assert.deepEqual(await raw(port, '/api/note', {method: 'GET'}).then(r => [r.status, r.allow]), [405, 'POST']);
  assert.equal((await raw(port, '/api/film', {method: 'POST'})).status, 405, 'no other route takes a POST');
  const refused = async (headers, body, status, re) => { const r = await fromPage(port, body, headers); assert.equal(r.status, status, JSON.stringify(r.body)); assert.match(r.body.error, re); };
  await refused({'sec-fetch-site': undefined}, ok, 403, /does not say where it came from \(no Sec-Fetch-Site\): leave it in the studio's page, in a current browser/);
  await refused({'sec-fetch-site': 'cross-site'}, ok, 403, /came from elsewhere \(Sec-Fetch-Site: cross-site\)/);
  await refused({'sec-fetch-site': 'none'}, ok, 403, /came from elsewhere \(Sec-Fetch-Site: none\)/);
  await refused({origin: 'http://evil.example'}, ok, 403, /its Origin/);
  await refused({origin: undefined}, ok, 403, /its Origin/);
  await refused({'content-type': 'text/plain'}, ok, 415, /give it Content-Type: application\/json/);
  await refused({'content-length': '20000'}, ok, 413, /at most 16384 bytes: shorten the note/);
  await refused({}, {...ok, words: 'x'.repeat(17000)}, 413, /at most 16384 bytes/);
  await refused({}, '{not json', 400, /is JSON/);
  await refused({}, '[1]', 400, /one JSON object/);
  await refused({}, {...ok, entry: 'stages[0]', line: 3}, 400, /takes version, t, x, y, words, not "entry": the place is read from the film, never sent/);
  await refused({}, {...ok, version: film.version + 1}, 409, /compiled again since the page drew it/);
  await refused({}, {t: 1, words: 'w'}, 400, /version is the film the page drew/);
  await refused({}, {...ok, t: 9999}, 400, /t is a moment on the film clock, 0–/);
  await refused({}, {...ok, x: 3}, 400, /give a spot as x and y together/);
  await refused({}, {...ok, x: 3, y: 5000}, 400, /x 0–1600, y 0–900/);
  await refused({}, {...ok, words: 7}, 400, /words is the note, as text/);
  await refused({}, {...ok, words: '  \n '}, 400, /a note needs words: say what should change here/);
  await refused({host: 'studio.example.com'}, ok, 403, /127\.0\.0\.1 only/);
  assert.ok(!existsSync(path.join(dir, 'feedback.md')), 'nothing refused wrote anything');
});

test('a studio with no recipe file, or a note key inside the project, takes no note, and says why', async t => {
  const none = await helloStudio(t, {source: false});
  assert.equal(none.film.feedbackFile, null);
  const r = await fromPage(none.studio.port, {version: none.film.version, t: 1, words: 'w'});
  assert.deepEqual([r.status, /start the studio with --recipe file/.test(r.body.error)], [501, true]);
  const shared = await helloStudio(t, {homeIn: dir => path.join(dir, '.storyreel')});   // the key's folder inside the project's, which may be shared
  const s = await fromPage(shared.studio.port, {version: shared.film.version, t: 1, words: 'w'});
  assert.equal(s.status, 409); assert.match(s.body.error, /is inside the project's folder, which may be shared — set STORYREEL_HOME elsewhere — a note is signed with it/);
});

test('storyreel studio, then storyreel feedback (and its MCP tool): an agent reads the note with its place, edits, and ticks it', async t => {
  const dir = installed(tempDir('notes-project', t)), home = path.join(tempDir('notes-home', t), 'storyreel');
  writeFileSync(path.join(dir, 'storyreel.config.mjs'), `import {readFileSync} from 'node:fs';\nimport {kineticKit} from 'footprint-storyreel/kits/kinetic';\nconst read = name => JSON.parse(readFileSync(new URL('./' + name, import.meta.url), 'utf8'));\nexport default {film: () => ({storyboard: read('storyboard.json'), recipe: read('recipe.json'), kits: [kineticKit]})};\n`);
  writeFileSync(path.join(dir, 'storyboard.json'), JSON.stringify({title: 'Notes', scenes: [{id: 'one', narration: 'Every word here lands on the screen. Then it waits.'}]}));
  writeFileSync(path.join(dir, 'recipe.json'), JSON.stringify({story: {kit: 'kinetic', scene: 'one', words: ['Every', 'word', 'Then', 'waits']}}, null, 2));
  const was = process.env.STORYREEL_HOME; process.env.STORYREEL_HOME = home;   // the studio and the commands it starts take it from here
  t.after(() => { if (was === undefined) delete process.env.STORYREEL_HOME; else process.env.STORYREEL_HOME = was; });
  const run = studioIn(dir);
  try {
    const url = await run.url, port = Number(new URL(url).port), film = await (await fetch(`${url}api/film`)).json();
    const left = await fromPage(port, {version: film.version, t: 2, x: 800, y: 450, words: 'the second word lands too early'});
    assert.equal(left.status, 200, JSON.stringify(left.body));
  } finally { assert.equal(await stopped(run.child), 0); }
  const feedback = (...args) => spawnSync(process.execPath, [cli, 'feedback', ...args], {cwd: dir, encoding: 'utf8', env: {...process.env, STORYREEL_HOME: home}});
  const read = feedback();
  assert.equal(read.status, 0, read.stderr);
  assert.match(read.stdout, /^1 open note from your studio in feedback\.md \(tick one when done: storyreel feedback --done 1\):\n1\. at "one\+2\.00" \(0:02\.0\) · entry "story" · line 2 of "recipe\.json" · said ".+"\n {3}note: the second word lands too early\n?$/);
  const mcp = await callTool('feedback', {}, {cwd: dir});
  assert.equal(mcp.isError, undefined, JSON.stringify(mcp)); assert.match(mcp.content[0].text, /note: the second word lands too early/);
  assert.match((await callTool('feedback', {config: 'other.mjs'}, {cwd: dir})).content[0].text, /config and cwd are fixed when the MCP server starts/);
  const ticked = feedback('--done', '1');
  assert.equal(ticked.status, 0, ticked.stderr); assert.match(ticked.stdout, /^ticked 1 in .*feedback\.md\nno open note from your studio/);
  assert.match(readFileSync(path.join(dir, 'feedback.md'), 'utf8'), /\n- \[x\] 0:02\.0 · one\+2\.00 · story/);
  const again = feedback('--done', '2');
  assert.equal(again.status, 1); assert.match(again.stderr, /no note of yours has the number 2 \(yours is 1\): nothing was ticked/);
});
