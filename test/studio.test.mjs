import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync, writeFileSync, copyFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {startStudio} from '../src/studio/server.mjs';
import {jsonLines, valueAt} from '../src/studio/lines.mjs';

const hello = fileURLToPath(new URL('../examples/hello/', import.meta.url));
const wait = ms => new Promise(r => setTimeout(r, ms));
/** GET with a chosen Host header (fetch will not send a foreign one). */
const raw = (port, pathName, {host = `127.0.0.1:${port}`, method = 'GET'} = {}) => new Promise((resolve, reject) => {
  const req = http.request({host: '127.0.0.1', port, path: pathName, method, headers: {host}}, res => { let body = ''; res.on('data', d => (body += d)); res.on('end', () => resolve({status: res.statusCode, body})); });
  req.on('error', reject); req.end();
});

test('jsonLines: every entry of a recipe file, by the path a film names it with', () => {
  const text = readFileSync(hello + 'recipe.json', 'utf8'), lines = jsonLines(text), recipe = JSON.parse(text);
  assert.match(text.split('\n')[lines.get('story.items[0].at') - 1], /"a shepherd"/);
  assert.match(text.split('\n')[lines.get('stages[0].reveal[1]') - 1], /"reveal"/);
  assert.deepEqual(valueAt(recipe, 'stages[0].reveal[1]'), [1, ['rule', 'If a pebble is left over']]);
  assert.equal(valueAt(recipe, 'story.items[99]'), undefined);
  assert.throws(() => jsonLines('{"a": [1, 2}'), /Not JSON/);
});

test('the studio: frames, the film, what drew a spot; loopback only, read only; compiled again on a change', async () => {
  // A copy of the hello film to edit while the studio runs.
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-')), file = path.join(dir, 'recipe.json');
  copyFileSync(hello + 'recipe.json', file); copyFileSync(hello + 'rule.ts', path.join(dir, 'rule.ts'));
  const storyboard = JSON.parse(readFileSync(hello + 'storyboard.json', 'utf8'));
  const load = async () => {
    const recipe = JSON.parse(readFileSync(file, 'utf8'));
    return {film: await compileFilm({storyboard, recipe, root: dir, timings: evenTimings(storyboard, {tail: 4})}), storyboard, recipe, source: {file}};
  };
  const studio = await startStudio({load, watch: [file], port: 0, log: () => {}}), url = studio.url, port = studio.port;
  try {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /default-src 'none'; script-src 'self'/);
    assert.match(await page.text(), /<script src="\/studio.js" defer>/);
    const film = await (await fetch(url + 'api/film')).json();
    assert.equal(film.scenes.length, 2);
    assert.deepEqual(film.beats[0].said, {scene: 'story', phrase: 'a shepherd', plus: 0});
    assert.equal(film.beats[0].path, 'story.items[0].at');
    assert.equal(film.beats[0].line, jsonLines(readFileSync(file, 'utf8')).get('story.items[0].at'));
    assert.ok(film.scenes[0].words.length > 10, 'the transcript\'s words, on the film clock');
    const frame = await fetch(url + 'api/frame?t=5&w=320');
    assert.equal(frame.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual([...new Uint8Array(await frame.arrayBuffer()).slice(0, 2)], [0xff, 0xd8]);
    const hit = await (await fetch(url + 'api/hit?t=4.3&x=350&y=560')).json();
    assert.equal(hit.hits[0].path, 'story.items[0]');
    assert.equal(hit.hits[0].line, film.beats[0].line);
    assert.deepEqual(hit.point.world, {path: 'story', at: [300, 564]});
    assert.match((await (await fetch(url + 'api/entry?path=story.items[0]')).json()).json, /"figure"/);
    // Loopback by name, read only, nothing else served.
    assert.equal((await raw(port, '/api/film', {host: 'studio.example.com'})).status, 403);
    assert.equal((await raw(port, '/api/film', {method: 'POST'})).status, 405);
    assert.equal((await fetch(url + 'api/audio')).status, 404, 'no voice, no audio');
    const sheet = await fetch(url + 'api/transitions');
    assert.equal(sheet.headers.get('content-type'), 'image/png', 'the transitions a shot can enter with, on one sheet');
    assert.equal((await fetch(url + '../package.json')).status, 404);
    assert.equal((await fetch(url + 'server.mjs')).status, 404);
    // A note added to the recipe: the studio compiles again and lists it.
    const recipe = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(file, JSON.stringify({...recipe, notes: [{note: 'A quicker push-in', speed: 1.2}]}, null, 1));
    let again; for (let i = 0; i < 40 && !(again?.notes?.length); i++) { await wait(100); again = await (await fetch(url + 'api/film')).json(); }
    assert.deepEqual(again.notes.map(n => n.note), ['A quicker push-in']);
    assert.ok(again.version > film.version);
    // A recipe that refuses: the reason is shown, and the last good film stays.
    writeFileSync(file, JSON.stringify({...recipe, notes: [{note: 'no camera word'}]}, null, 1));
    let refused; for (let i = 0; i < 40 && !refused?.error; i++) { await wait(100); refused = await (await fetch(url + 'api/version')).json(); }
    assert.match(refused.error, /needs exactly one camera word/);
    const kept = await (await fetch(url + 'api/film')).json();
    assert.equal(kept.error, refused.error);
    assert.deepEqual(kept.notes.map(n => n.note), ['A quicker push-in'], 'the last good film is still served');
  } finally { await studio.close(); }
});
