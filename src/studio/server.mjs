/**
 * The preview studio: a local page for directing a film. It draws any moment of the film on
 * request, lays the scenes, the spoken phrases and the director's notes along a timeline, plays
 * the voice, and answers a click on the picture with the recipe entry that drew it — and the line
 * of the recipe file it is on. Change the recipe (or anything `watch` names) and the film is
 * compiled again; a recipe that refuses keeps the last good film on screen, with the reason.
 * Its gallery plays every transition and every word move on a loop (gallery.mjs); Try puts one on the
 * scene at the playhead in a copy of the film, compiled in memory, and Keep gives the pick's one line
 * (picks.mjs) for `storyreel apply` (apply.mjs).
 *
 * Local only: it listens on 127.0.0.1, answers only requests addressed to it by that name, and
 * only reads (GET). It writes nothing and runs nothing from the recipe.
 */
import http from 'node:http';
import {readFileSync, statSync, createReadStream, watchFile, unwatchFile} from 'node:fs';
import {once} from 'node:events';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {hitTest} from '../regions.mjs';
import {jsonLines, valueAt} from './lines.mjs';
import {contactSheet, transitionSheet} from '../sheet.mjs';
import {transitionCatalog, readEntrance} from '../transitions.mjs';
import {said} from '../script.mjs';
import {pickScenes, PICK_KINDS} from './picks.mjs';
import {applyPicks} from './apply.mjs';
import {galleryCards, cardFrames, boundedCache} from './gallery.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = {'/': ['page.html', 'text/html; charset=utf-8'], '/studio.js': ['page.js', 'text/javascript; charset=utf-8'], '/studio.css': ['page.css', 'text/css; charset=utf-8']};
const HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin',
};

/**
 * @param load   async () => {film, storyboard, recipe, title?, source?: {file, prefix?}, audio?, kits?, compile?}
 *               film: from compileFilm · recipe: the recipe object the film was compiled from ·
 *               source.file: the file the recipe is written in (prefix: where in that file the recipe
 *               sits, e.g. 'recipe') · audio: a WAV of the paced narration, for playback · kits: the
 *               kits the film was compiled with, so the transitions sheet and the gallery show their
 *               transitions too · compile: async recipe => film, the film compiled as this one was but
 *               from another recipe — what the gallery's Try plays (a copy with a pick in it; nothing written)
 * @param watch  files that, when changed, make the studio call load() again
 * @param port   the port on 127.0.0.1 (0: any free port)
 * @returns {url, port, reload(), close()}
 */
export async function startStudio({load, watch = [], port = 4321, log = console.log}) {
  const state = {version: 0, error: null, loaded: null, lines: new Map(), loadedAt: null, variant: null};
  async function reload() {
    try {
      const loaded = await load();
      if (!loaded?.film || !loaded?.storyboard) throw new Error('load() must return {film, storyboard, recipe}');
      state.loaded = loaded; state.error = null; state.loadedAt = new Date().toISOString();
      state.lines = loaded.source?.file ? jsonLines(readFileSync(loaded.source.file, 'utf8')) : new Map();
    } catch (e) {
      // Keep the last good film on screen; the page shows why this one refused.
      state.error = e.message;
    }
    // A pick being tried was a copy of the film before: it goes, and the gallery's cards are drawn again for this one.
    state.variant = null; cards.clear(); catalog = null;
    state.version++;
    return state.error;
  }
  const cards = boundedCache();
  let catalog = null, tries = 0;
  await reload();
  if (state.error) log(`studio: refused — ${state.error}`);

  // Watch by polling the files' times: an editor that saves by replacing the file is still seen.
  let pending = null;
  const changed = (now, before) => { if (now.mtimeMs === before.mtimeMs && now.size === before.size) return; clearTimeout(pending); pending = setTimeout(() => reload().then(err => log(err ? `studio: refused — ${err}` : 'studio: compiled again')), 150); };
  for (const file of watch) watchFile(file, {interval: 300}, changed);

  const canvases = new Map();
  let sheet = null, transitions = null;
  const lineOf = p => { const prefix = state.loaded?.source?.prefix; return state.lines.get(prefix ? (p ? `${prefix}.${p}` : prefix) : p) ?? null; };
  const number = (v, lo, hi, fallback) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback; };

  function filmJson() {
    const {film, storyboard, title, source, audio} = state.loaded, clock = film.clock;
    return {
      version: state.version, error: state.error, loadedAt: state.loadedAt, title: title ?? storyboard.title ?? 'Untitled film', total: film.total,
      recipeFile: source?.file ?? null, audio: Boolean(audio),
      // A silent scene's words are its directions (clock.mjs · directionTimings): shown, never spoken. The narration is what is
      // said (script.mjs · said): its marks are never shown.
      scenes: storyboard.scenes.map((s, i) => ({id: s.id, title: s.title ?? s.id, start: clock.offsets[i], end: clock.end(s.id), narration: s.narration === undefined ? undefined : said(s.narration),
        ...(s.silent ? {silent: s.silent} : {}),
        words: (film.timings?.scenes?.[i]?.words ?? []).map(w => ({text: w.text, start: clock.offsets[i] + w.start, end: clock.offsets[i] + w.end, spoken: !s.silent}))})),
      beats: film.beats.map(b => ({t: b.t, said: Array.isArray(b.ref) ? {scene: b.ref[0], phrase: b.ref[1], plus: b.ref[2] ?? 0} : b.ref, path: b.path, line: b.path ? lineOf(b.path) : null})),
      notes: film.notes ?? [],
      reading: (film.reading ?? []).map(l => ({...l, line: l.path ? lineOf(l.path) : null})),
      // Each shot: what it is for and the facts it starts and ends with; and what asks too much, too fast.
      shots: (film.shots ?? []).map(s => ({...s, line: lineOf(s.path)})),
      watching: (film.watching ?? []).map(w => ({...w, line: lineOf(w.path)})),
    };
  }

  async function frame(film, t, width) {
    const w = Math.round(width), h = Math.round(w * 9 / 16);
    // One canvas per width, and only the two latest widths (a window being resized asks for many).
    if (!canvases.has(w)) { canvases.set(w, createCanvas(w, h)); while (canvases.size > 2) canvases.delete(canvases.keys().next().value); }
    const c = canvases.get(w), ctx = c.getContext('2d');
    ctx.resetTransform(); ctx.globalAlpha = 1; ctx.clearRect(0, 0, w, h); ctx.scale(w / 1600, w / 1600);
    film.frame(ctx, t);
    ctx.resetTransform();
    return c.encode('jpeg', 86);
  }

  // ── The gallery: a card per transition and per word move (gallery.mjs); Try and Keep a pick on a scene (picks.mjs) ──
  const catalogNow = () => (catalog ??= transitionCatalog(state.loaded.kits ?? []));
  /** The pick the query names — its scene, kind and name checked against the film's scenes and the catalog (apply.mjs) — applied to a copy of the recipe. */
  async function pickOf(q) {
    const kind = q.get('kind');
    if (!PICK_KINDS.includes(kind)) throw new Refusal(`kind must be ${PICK_KINDS.join(' or ')} (e.g. kind=enter), not ${JSON.stringify(kind)}`);
    const {storyboard, recipe} = state.loaded, scenes = storyboard.scenes.map(s => s.id);
    try { return await applyPicks(recipe, [{scene: String(q.get('scene') ?? ''), kind, name: String(q.get('name') ?? '')}], {scenes, catalog: catalogNow()}); } catch (e) { throw new Refusal(e.message); }
  }
  /**
   * Try: the film compiled again in memory from a copy of the recipe with the pick in it, kept until the next pick
   * tried or the next reload; the page plays it from a second before the scene starts (or from before its change
   * starts, when that is earlier). A recipe the pick makes refuse is said with the compile's own words.
   */
  async function tryPick(q) {
    if (typeof state.loaded.compile !== 'function') throw new Refusal('Try compiles a copy of the recipe: this studio\'s load() gives no compile(recipe)', 501);
    const {recipe, changes: [change]} = await pickOf(q), version = state.version;
    let film; try { film = await state.loaded.compile(recipe); } catch (e) { throw new Refusal(`${change.line}: ${e.message}`); }
    if (version !== state.version) throw new Refusal('The film was compiled again while this pick was: try it again', 409);
    const clock = state.loaded.film.clock, start = clock.start(change.scene), end = clock.end(change.scene);
    const lead = change.kind === 'enter' ? readEntrance(change.name, change.line, catalogNow()).lead : 0;
    state.variant = {key: String(++tries), version, film};
    return {key: state.variant.key, line: change.line, scene: change.scene, kind: change.kind, name: change.name, path: change.path, start, end, from: Math.max(0, +(start - Math.max(1, lead + .5)).toFixed(3))};
  }
  /** The film a frame is asked of: this one, or the pick being tried (`try`: its key) — a pick gone with a reload is said. */
  function filmOf(key) {
    if (key === null) return state.loaded.film;
    if (state.variant?.key !== key) throw new Refusal('That pick is no longer being tried (the film was compiled again, or another pick was tried)', 410);
    return state.variant.film;
  }

  function hit(t, x, y) {
    const {film} = state.loaded;
    return {t, point: film.pointAt(t, x, y), hits: hitTest(film.regionsAt(t), x, y).map(r => ({...r, box: r.box.map(v => Math.round(v)), line: lineOf(r.path)}))};
  }

  function entry(p) {
    const value = valueAt(state.loaded.recipe, p), text = JSON.stringify(value, null, 2) ?? 'undefined';
    return {path: p, line: lineOf(p), json: text.length > 6000 ? `${text.slice(0, 6000)}\n…` : text};
  }

  const send = (res, status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, {...HEADERS, 'content-type': type});
    res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
  };
  const server = http.createServer(async (req, res) => {
    try {
      const {port: bound} = server.address();
      // Loopback by name too: a page elsewhere cannot reach the studio through a name that points here.
      if (![`127.0.0.1:${bound}`, `localhost:${bound}`].includes(req.headers.host)) return send(res, 403, {error: 'The studio answers on 127.0.0.1 only'});
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, {error: 'The studio only reads'});
      const u = new URL(req.url, `http://127.0.0.1:${bound}`), q = u.searchParams;
      if (PAGE[u.pathname]) { const [file, type] = PAGE[u.pathname]; return send(res, 200, readFileSync(path.join(here, file)), type); }
      if (u.pathname === '/api/version') return send(res, 200, {version: state.version, error: state.error});
      if (!state.loaded) return send(res, 503, {error: state.error ?? 'Nothing loaded yet', version: state.version});
      const total = state.loaded.film.total, t = number(q.get('t'), 0, total, 0);
      if (u.pathname === '/api/film') return send(res, 200, filmJson());
      if (u.pathname === '/api/frame') return send(res, 200, await frame(filmOf(q.get('try')), t, number(q.get('w'), 160, 1920, 960)), 'image/jpeg');
      // The cards, and the scenes that take each kind of pick (a stage's scene an entrance; a kinetic world's a word move).
      if (u.pathname === '/api/gallery') return send(res, 200, {version: state.version, cards: galleryCards(catalogNow()), takes: pickScenes(state.loaded.recipe)});
      if (u.pathname === '/api/card') {
        // Only a card the gallery lists is drawn: the cache holds at most one PNG per card, and is bounded besides.
        const card = galleryCards(catalogNow()).find(c => c.kind === q.get('kind') && c.name === q.get('name'));
        if (!card) return send(res, 404, {error: 'No such card in the gallery'});
        return send(res, 200, await cards.get(`${card.kind} ${card.name}`, () => cardFrames(card, catalogNow())), 'image/png');
      }
      if (u.pathname === '/api/pick') { const {changes: [c]} = await pickOf(q); return send(res, 200, {line: c.line, scene: c.scene, kind: c.kind, name: c.name, path: c.path}); }
      if (u.pathname === '/api/try') return send(res, 200, await tryPick(q));
      if (u.pathname === '/api/hit') return send(res, 200, hit(t, number(q.get('x'), 0, 1600, 800), number(q.get('y'), 0, 900, 450)));
      if (u.pathname === '/api/sheet') { if (sheet?.version !== state.version) sheet = {version: state.version, png: await contactSheet(state.loaded.film)}; return send(res, 200, sheet.png, 'image/png'); }
      if (u.pathname === '/api/transitions') {
        // The collection a shot can enter with (transitions.mjs): the built-in ones and the film's kits' own.
        if (transitions?.version !== state.version) transitions = {version: state.version, png: await transitionSheet({catalog: transitionCatalog(state.loaded.kits ?? [])})};
        return send(res, 200, transitions.png, 'image/png');
      }
      if (u.pathname === '/api/entry') return send(res, 200, entry(String(q.get('path') ?? '')));
      if (u.pathname === '/api/audio' && state.loaded.audio) return sendAudio(req, res, state.loaded.audio);
      return send(res, 404, {error: 'Not found'});
    } catch (e) {
      return send(res, e instanceof Refusal ? e.status : 500, {error: e.message});
    }
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  const bound = server.address().port, url = `http://127.0.0.1:${bound}/`;
  return {
    url, port: bound, reload,
    close: async () => { for (const file of watch) unwatchFile(file, changed); clearTimeout(pending); server.closeAllConnections?.(); server.close(); await once(server, 'close'); },
  };
}

/** A request the studio refuses, with its reason for the page and its status (422: the pick or the recipe refuses). */
class Refusal extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}

/** The narration WAV, with byte ranges so the page's player can seek. */
function sendAudio(req, res, file) {
  const size = statSync(file).size, range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
  const start = range ? Number(range[1]) : 0, end = range && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start > end) { res.writeHead(416, {...HEADERS, 'content-range': `bytes */${size}`}); res.end(); return; }
  res.writeHead(range ? 206 : 200, {...HEADERS, 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'content-length': end - start + 1, ...(range ? {'content-range': `bytes ${start}-${end}/${size}`} : {})});
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file, {start, end}).on('error', () => res.destroy()).pipe(res);
}
