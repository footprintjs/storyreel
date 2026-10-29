// The studio's gallery (studio/gallery.mjs, server.mjs): a card per transition and per word move, each playing on a loop
// of frames drawn by the code that draws a film; Try on the scene at the playhead — a copy of the film compiled in
// memory, the film itself unchanged — and Keep's one line; every refusal shown with its words; still loopback-only and
// read-only. And `storyreel studio` (studio/cli.mjs): the studio on the project in a folder, as made by
// `storyreel remake --starter`.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdirSync, symlinkSync, writeFileSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createCanvas, loadImage} from '@napi-rs/canvas';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {kineticKit, compileKinetic, WORD_MOVES} from '../src/kits/kinetic/index.mjs';
import {transitionCatalog, TRANSITION_NAMES} from '../src/transitions.mjs';
import {transitionSample} from '../src/sheet.mjs';
import {startStudio} from '../src/studio/server.mjs';
import {galleryCards, cardFrames, boundedCache, CARD} from '../src/studio/gallery.mjs';
import {remakePlan, remakeStarter} from '../src/breakdown.mjs';
import {shot, specOf, quickWords} from './remake-specs.mjs';
import {tempDir} from './tmp.mjs';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
/** GET (or another method) with a chosen Host header (fetch will not send a foreign one). */
const raw = (port, pathName, {host = `127.0.0.1:${port}`, method = 'GET'} = {}) => new Promise((resolve, reject) => {
  const req = http.request({host: '127.0.0.1', port, path: pathName, method, headers: {host}}, res => { let body = ''; res.on('data', d => (body += d)); res.on('end', () => resolve({status: res.statusCode, body})); });
  req.on('error', reject); req.end();
});

// A film of kinetic worlds: the story (scene a), a stage cut in (b), a stage that fades in (c); a kit adds a curtain.
const storyboard = {title: 'Gallery', scenes: [{id: 'a', silent: [['first words land', 2]]}, {id: 'b', silent: [['second words land', 2]]}, {id: 'c', silent: [['third words land', 2]]}]};
const recipe = {story: {kit: 'kinetic', scene: 'a', words: [{text: 'ONE', at: ['a', 'first']}], colors: ['#f3eee3', '#1a1a1a']},
  stages: [{type: 'world', scene: 'b', enter: 'cut', world: {kit: 'kinetic', scene: 'b', words: [{text: 'TWO', at: ['b', 'second']}], colors: ['#2d5c9a', '#ffffff']}},
    {type: 'world', scene: 'c', world: {kit: 'kinetic', scene: 'c', words: [{text: 'THREE', at: ['c', 'third', .3]}], colors: ['#b33f36', '#ffffff']}}]};
const curtain = {family: 'theatre', seconds: 1, ease: 'inOut', sound: null, params: {}, draw(ctx, {e, from, to}) { (e < .5 ? from : to)(ctx); }};
const kits = [kineticKit, {name: 'stage', transitions: {curtain}}];
const timings = evenTimings(storyboard, {tail: 0});
const compile = r => compileFilm({storyboard, timings, recipe: r, kits});
const studioOf = (extra = {}) => startStudio({load: async () => ({film: await compile(recipe), storyboard, recipe, kits, compile, ...extra}), port: 0, log: () => {}});
const bytes = async r => Buffer.from(await r.arrayBuffer());
/** A card's frame i, cut out of its PNG. */
async function frameOf(png, card, i) {
  const img = await loadImage(png), c = createCanvas(card.width, card.height), x = c.getContext('2d');
  x.drawImage(img, (i % card.columns) * card.width, Math.floor(i / card.columns) * card.height, card.width, card.height, 0, 0, card.width, card.height);
  return x.getImageData(0, 0, card.width, card.height).data;
}
/** How many bytes of two frames differ by more than `by` (a frame drawn at another place in the card's PNG may differ by a shade where its edges are smoothed). */
const differ = (a, b, by = 2) => a.reduce((n, v, k) => n + (Math.abs(v - b[k]) > by ? 1 : 0), 0);
/** Two frames are the same picture: no byte off by more than a shade of smoothing. */
const same = (a, b) => differ(a, b, 16) === 0;

test('the gallery lists a card per transition of the film (its kits\' too) and per word move, saying only what the data says', async () => {
  const studio = await studioOf();
  try {
    const g = await (await fetch(`${studio.url}api/gallery`)).json();
    assert.deepEqual(g.cards.filter(c => c.kind === 'enter').map(c => c.name), [...TRANSITION_NAMES, 'curtain']);
    assert.deepEqual(g.cards.filter(c => c.kind === 'move').map(c => c.name), WORD_MOVES);
    assert.deepEqual(g.cards.find(c => c.name === 'torn'), {kind: 'enter', name: 'torn', about: 'wipe · 3.2 s', seconds: 3.2, frames: Math.round((CARD.before + 3.2 + CARD.after) * CARD.fps), columns: CARD.columns, fps: CARD.fps, width: CARD.width, height: CARD.height});
    assert.equal(g.cards.find(c => c.name === 'pop').about, 'bouncy · 0.78 s', 'a move: its feel and seconds');
    assert.deepEqual(g.takes, {enter: ['b', 'c'], move: ['a', 'b', 'c']}, 'the scenes that take each kind of pick');
  } finally { await studio.close(); }
});

test('a card plays: a PNG of frames drawn by the code that draws a film — a transition between the sample pictures, a move by the kinetic kit', async () => {
  const studio = await studioOf();
  try {
    const cards = galleryCards(transitionCatalog(kits));
    for (const name of ['torn', 'curtain', 'cut']) {
      const card = cards.find(c => c.name === name), r = await fetch(`${studio.url}api/card?kind=enter&name=${name}`), png = await bytes(r);
      assert.equal(r.headers.get('content-type'), 'image/png');
      const img = await loadImage(png);
      assert.deepEqual([img.width, img.height], [card.columns * card.width, Math.ceil(card.frames / card.columns) * card.height], `${name}: its frames in rows`);
      const first = await frameOf(png, card, 0), last = await frameOf(png, card, card.frames - 1);
      assert.ok(differ(first, last) > 1000, `${name}: the loop starts on picture A and ends on picture B`);
      // Frame i is the sample transition at its moment on the card's clock (sheet.mjs · transitionSample), as the transitions sheet draws it.
      const mid = Math.floor((CARD.before + card.seconds / 2) * CARD.fps), sample = transitionSample(name, transitionCatalog(kits));
      const c = createCanvas(card.width, card.height), x = c.getContext('2d'); x.scale(card.width / 1600, card.width / 1600);
      sample.draw(x, card.seconds ? (mid / CARD.fps - CARD.before) / card.seconds : mid / CARD.fps >= CARD.before ? 1 : 0);   // a cut, 0 s, jumps at the hold's end
      assert.ok(same(await frameOf(png, card, mid), x.getImageData(0, 0, card.width, card.height).data), `${name}: frame ${mid} is the transition at that moment`);
    }
    // Two transitions half way through are two different pictures: the card is the transition's own drawing.
    const half = async name => { const card = cards.find(c => c.name === name); return frameOf(await bytes(await fetch(`${studio.url}api/card?kind=enter&name=${name}`)), card, Math.floor((CARD.before + card.seconds / 2) * CARD.fps)); };
    assert.ok(differ(await half('fade'), await half('wipe')) > 1000);
    // A word move: the kinetic kit's own draw, one word (the move's name) landing after the hold.
    const card = cards.find(c => c.name === 'pop'), png = await bytes(await fetch(`${studio.url}api/card?kind=move&name=pop`));
    const world = compileKinetic({words: [{text: 'pop', at: ['card', 'pop']}], move: 'pop'}, {at: () => CARD.before, total: CARD.before + card.seconds + CARD.after});
    for (const i of [0, 9, card.frames - 1]) {
      const c = createCanvas(card.width, card.height), x = c.getContext('2d'); x.scale(card.width / 1600, card.width / 1600); world.draw(x, i / CARD.fps);
      assert.ok(same(await frameOf(png, card, i), x.getImageData(0, 0, card.width, card.height).data), `pop: frame ${i}`);
    }
    assert.ok(differ(await frameOf(png, card, 0), await frameOf(png, card, card.frames - 1)) > 1000, 'before the word lands, the ground alone; after, the word');
    // Only a card the gallery lists is drawn.
    for (const q of ['kind=enter&name=nope', 'kind=move&name=drop-in', 'kind=x&name=torn', 'kind=enter&name=__proto__']) assert.equal((await fetch(`${studio.url}api/card?${q}`)).status, 404, q);
  } finally { await studio.close(); }
});

test('the cards drawn are held in a cache bounded by count and by bytes, the oldest used dropped first', async () => {
  const cache = boundedCache({most: 2, bytes: 10}), made = [];
  const get = (key, size) => cache.get(key, async () => { made.push(key); return Buffer.alloc(size); });
  await get('a', 3); await get('b', 3); await get('a', 3);
  assert.deepEqual(made, ['a', 'b'], 'a card asked again is not drawn again');
  await get('c', 3);
  assert.deepEqual([cache.size, made], [2, ['a', 'b', 'c']], 'past the count, the oldest used (b) goes');
  await get('b', 3);
  assert.deepEqual(made, ['a', 'b', 'c', 'b']);
  await get('d', 9);
  assert.deepEqual([cache.size, cache.bytes], [1, 9], 'past the bytes, the oldest go');
  const card = galleryCards(transitionCatalog([])).find(c => c.name === 'fade');
  assert.ok((await cardFrames(card, transitionCatalog([]))).length < 2 ** 20, 'a card is a small PNG');
});

test('Try: the scene with the pick, a copy compiled in memory — its frames differ at the scene\'s start, the film\'s do not', async () => {
  const studio = await studioOf(), url = studio.url;
  try {
    const at = 2.1, base = await bytes(await fetch(`${url}api/frame?t=${at}&w=320`));
    const tried = await (await fetch(`${url}api/try?scene=b&kind=enter&name=fade`)).json();
    assert.deepEqual({...tried, key: undefined}, {key: undefined, line: 'b enter fade', scene: 'b', kind: 'enter', name: 'fade', path: 'stages[0].enter', start: 2, end: 4, from: 0.9},
      'it plays from a second before the scene, or from before its change when that starts earlier (fade: 0.6 s before)');
    const variant = await bytes(await fetch(`${url}api/frame?t=${at}&w=320&try=${tried.key}`));
    assert.ok(!variant.equals(base), 'a cut became a fade: the picture differs at the scene\'s start');
    assert.ok((await bytes(await fetch(`${url}api/frame?t=${at}&w=320`))).equals(base), 'the film itself is unchanged');
    assert.equal(recipe.stages[0].enter, 'cut', 'and so is its recipe');
    const torn = await (await fetch(`${url}api/try?scene=c&kind=enter&name=torn`)).json();
    assert.equal(torn.from, 4 - 2.4 - .5, 'torn takes 3.2 s, 2.4 of them before the scene: it plays from half a second before its change');
    const moved = await (await fetch(`${url}api/try?scene=c&kind=move&name=blur-in`)).json();
    assert.deepEqual([moved.line, moved.from, moved.path], ['c move blur-in', 3, 'stages[1].world.move']);
    const t = moved.start + .4, plain = await bytes(await fetch(`${url}api/frame?t=${t}&w=320`)), blurred = await bytes(await fetch(`${url}api/frame?t=${t}&w=320&try=${moved.key}`));
    assert.ok(!plain.equals(blurred), 'the word lands another way');
    // One pick is tried at a time; a reload drops it.
    const gone = await fetch(`${url}api/frame?t=${at}&w=320&try=${tried.key}`);
    assert.equal(gone.status, 410);
    assert.match((await gone.json()).error, /That pick is no longer being tried/);
    await studio.reload();
    assert.equal((await fetch(`${url}api/frame?t=${t}&w=320&try=${moved.key}`)).status, 410, 'the film compiled again: the copy is gone');
    // Keep: the line, checked, without compiling.
    assert.deepEqual(await (await fetch(`${url}api/pick?scene=b&kind=enter&name=torn`)).json(), {line: 'b enter torn', scene: 'b', kind: 'enter', name: 'torn', path: 'stages[0].enter'});
  } finally { await studio.close(); }
});

test('Try and Keep refuse with their words: a story scene, a transition that needs a thing named, a scene with no kinetic world, a pushIn film, no compile', async () => {
  const studio = await studioOf(), url = studio.url;
  const refused = async (q, status, pattern, at = url) => { const r = await fetch(`${at}api/${q}`); assert.equal(r.status, status, q); assert.match((await r.json()).error, pattern, q); };
  try {
    await refused('try?scene=a&kind=enter&name=torn', 422, /a enter torn: no stage plays its scene, so nothing enters there .* — a transition goes on a stage's scene: b, c/);
    await refused('try?scene=b&kind=enter&name=match', 422, /b enter match: its transition needs a setting a line cannot give .* a match needs enter\.region/);
    await refused('try?scene=b&kind=enter&name=nope', 422, /its name is not a transition of this film — the transitions are .*, curtain/);
    await refused('try?scene=b&kind=move&name=drop-in', 422, /its move is not an entrance a whole word makes/);
    await refused('try?scene=zz&kind=move&name=pop', 422, /its scene is not in the storyboard — the scenes are a, b, c/);
    await refused('pick?scene=b&kind=colour&name=red', 422, /kind must be enter or move \(e\.g\. kind=enter\), not "colour"/);
    await refused('pick?kind=enter&name=fade', 422, /" enter fade" is not a pick/);
    await refused(`frame?t=1&try=99`, 410, /no longer being tried/);
  } finally { await studio.close(); }
  // A film whose stages hand over on one page, and a studio whose load() gives no compile.
  const noCompile = await studioOf({compile: undefined});
  try { await refused('try?scene=b&kind=enter&name=fade', 501, /Try compiles a copy of the recipe: this studio's load\(\) gives no compile\(recipe\)/, noCompile.url); } finally { await noCompile.close(); }
  const pushed = await startStudio({load: async () => ({film: await compile(recipe), storyboard, recipe: {...recipe, pushIn: {after: 'a', rest: 1}}, kits, compile}), port: 0, log: () => {}});
  try { await refused('try?scene=b&kind=enter&name=fade', 422, /the film has a pushIn, which hands its stages over on one page/, pushed.url); } finally { await pushed.close(); }
});

test('the gallery\'s routes keep the studio\'s laws: loopback by name, read only, nothing else served', async () => {
  const studio = await studioOf();
  try {
    for (const p of ['/api/gallery', '/api/card?kind=enter&name=fade', '/api/try?scene=b&kind=enter&name=fade', '/api/pick?scene=b&kind=enter&name=fade']) {
      assert.equal((await raw(studio.port, p, {host: 'studio.example.com'})).status, 403, `${p}: a name that points here is not the studio's`);
      assert.equal((await raw(studio.port, p, {method: 'POST'})).status, 405, `${p}: the studio only reads`);
      assert.equal((await raw(studio.port, p, {method: 'PUT'})).status, 405);
    }
    const page = await fetch(studio.url), html = await page.text();
    assert.match(page.headers.get('content-security-policy'), /default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:/);
    assert.match(html, /id="gallery"/);
    const js = readFileSync(new URL('../src/studio/page.js', import.meta.url), 'utf8');
    assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/, 'the page is built with textContent only');
  } finally { await studio.close(); }
});

// ── storyreel studio, on a folder ────────────────────────────────────────────────────────────────────────────────
/** `storyreel studio …` in `cwd`, until its address is printed: {url, child, out()}. */
function studioIn(cwd, args = []) {
  const child = spawn(process.execPath, [cli, 'studio', '--port', '0', ...args], {cwd});
  let out = '', err = '';
  child.stdout.on('data', d => (out += d)); child.stderr.on('data', d => (err += d));
  const url = new Promise((resolve, reject) => {
    child.stdout.on('data', () => { const m = /StoryReel Studio: (\S+)/.exec(out); if (m) resolve(m[1]); });
    child.on('exit', code => reject(Object.assign(new Error(`storyreel studio exited ${code}: ${err}`), {code, err})));
  });
  return {url, child, out: () => out, err: () => err};
}
const stopped = child => new Promise(resolve => { if (child.exitCode !== null) resolve(child.exitCode); else { child.on('exit', resolve); child.kill('SIGINT'); } });

test('storyreel studio on a starter folder (storyreel remake --starter): the film, the gallery and Try, with no flag but the port', async t => {
  const folder = path.join(tempDir('studio-cli', t), 'like-it');
  mkdirSync(path.join(folder, 'node_modules'), {recursive: true});
  symlinkSync(fileURLToPath(new URL('..', import.meta.url)), path.join(folder, 'node_modules', 'footprint-storyreel'), 'dir');
  const starter = remakeStarter(await remakePlan(specOf([...quickWords(4), shot(2, {blank: true}), shot(1.2, {text: true}), shot(.4), shot(.4)])));
  for (const [name, text] of Object.entries(starter.files)) writeFileSync(path.join(folder, name), text);
  const run = studioIn(folder);
  try {
    const url = await run.url, film = await (await fetch(`${url}api/film`)).json();
    assert.deepEqual(film.scenes.map(s => s.id), starter.storyboard.scenes.map(s => s.id));
    assert.match(film.recipeFile, /like-it[\\/]recipe\.json$/, 'a click names its line in the starter\'s recipe.json');
    assert.equal(film.error, null);
    assert.match(run.out(), /watching recipe\.json, storyboard\.json; local only \(127\.0\.0\.1\); Ctrl\+C stops it/);
    const g = await (await fetch(`${url}api/gallery`)).json();
    assert.deepEqual(g.takes.move, starter.storyboard.scenes.map(s => s.id), 'every scene of a starter is a kinetic world');
    const tried = await (await fetch(`${url}api/try?scene=scene-03&kind=enter&name=fade`)).json();
    assert.equal(tried.line, 'scene-03 enter fade', JSON.stringify(tried));
    // An edit to the recipe or the storyboard is compiled again (the starter's own files are watched).
    const file = path.join(folder, 'recipe.json'), edited = JSON.parse(readFileSync(file, 'utf8'));
    edited.stages[0].enter = 'swirl';
    writeFileSync(file, JSON.stringify(edited));
    let version; for (let i = 0; i < 50 && !version?.error; i++) { await new Promise(r => setTimeout(r, 100)); version = await (await fetch(`${url}api/version`)).json(); }
    assert.match(version.error, /stage scene-02: enter must be a transition/, 'compiled again: the refusal is shown, the last good film kept');
    assert.equal(readFileSync(file, 'utf8'), JSON.stringify(edited), 'the studio writes nothing');
    const board = path.join(folder, 'storyboard.json'), retitled = {...JSON.parse(readFileSync(board, 'utf8')), title: 'Retitled'};
    edited.stages[0].enter = 'fade'; writeFileSync(file, JSON.stringify(edited)); writeFileSync(board, JSON.stringify(retitled));
    let again; for (let i = 0; i < 50 && again?.title !== 'Retitled'; i++) { await new Promise(r => setTimeout(r, 100)); again = await (await fetch(`${url}api/film`)).json(); }
    assert.deepEqual([again.title, again.error], ['Retitled', null]);
  } finally { assert.equal(await stopped(run.child), 0, 'Ctrl+C stops it'); }
});

test('storyreel studio refuses a wrong command line (2) and a project it cannot read (1), naming the fix', async t => {
  const dir = tempDir('studio-refuse', t);
  for (const [args, code, pattern] of [[['--port', 'x'], 2, /--port is a whole number 0–65535/], [['--recipe'], 2, /--recipe needs the recipe's JSON file/], [['stray'], 2, /"stray" is not a flag/],
    [[], 1, /no storyreel\.config\.mjs in .*: a project names its film there/]]) {
    const run = studioIn(dir, args), error = await run.url.then(() => null, e => e);
    if (!error) await stopped(run.child);
    assert.equal(error?.code, code, `${args.join(' ')}: ${error?.err}`);
    assert.match(error.err, pattern);
  }
});
