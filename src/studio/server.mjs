/**
 * The preview studio: a local page for directing a film. It draws any moment of the film on
 * request, lays the scenes, the spoken phrases and the director's notes along a timeline, plays
 * the voice, and answers a click on the picture with the recipe entry that drew it — and the line
 * of the recipe file it is on. Change the recipe (or anything `watch` names) and the film is
 * compiled again; a recipe that refuses keeps the last good film on screen, with the reason.
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
import {transitionCatalog} from '../transitions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = {'/': ['page.html', 'text/html; charset=utf-8'], '/studio.js': ['page.js', 'text/javascript; charset=utf-8'], '/studio.css': ['page.css', 'text/css; charset=utf-8']};
const HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin',
};

/**
 * @param load   async () => {film, storyboard, recipe, title?, source?: {file, prefix?}, audio?, kits?}
 *               film: from compileFilm · recipe: the recipe object the film was compiled from ·
 *               source.file: the file the recipe is written in (prefix: where in that file the recipe
 *               sits, e.g. 'recipe') · audio: a WAV of the paced narration, for playback · kits: the
 *               kits the film was compiled with, so the transitions sheet shows their transitions too
 * @param watch  files that, when changed, make the studio call load() again
 * @param port   the port on 127.0.0.1 (0: any free port)
 * @returns {url, port, reload(), close()}
 */
export async function startStudio({load, watch = [], port = 4321, log = console.log}) {
  const state = {version: 0, error: null, loaded: null, lines: new Map(), loadedAt: null};
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
    state.version++;
    return state.error;
  }
  await reload();

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
      // A silent scene's words are its directions (clock.mjs · directionTimings): shown, never spoken.
      scenes: storyboard.scenes.map((s, i) => ({id: s.id, title: s.title ?? s.id, start: clock.offsets[i], end: clock.end(s.id), narration: s.narration,
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

  async function frame(t, width) {
    const w = Math.round(width), h = Math.round(w * 9 / 16);
    // One canvas per width, and only the two latest widths (a window being resized asks for many).
    if (!canvases.has(w)) { canvases.set(w, createCanvas(w, h)); while (canvases.size > 2) canvases.delete(canvases.keys().next().value); }
    const c = canvases.get(w), ctx = c.getContext('2d');
    ctx.resetTransform(); ctx.globalAlpha = 1; ctx.clearRect(0, 0, w, h); ctx.scale(w / 1600, w / 1600);
    state.loaded.film.frame(ctx, t);
    ctx.resetTransform();
    return c.encode('jpeg', 86);
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
      if (u.pathname === '/api/frame') return send(res, 200, await frame(t, number(q.get('w'), 160, 1920, 960)), 'image/jpeg');
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
      return send(res, 500, {error: e.message});
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

/** The narration WAV, with byte ranges so the page's player can seek. */
function sendAudio(req, res, file) {
  const size = statSync(file).size, range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
  const start = range ? Number(range[1]) : 0, end = range && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start > end) { res.writeHead(416, {...HEADERS, 'content-range': `bytes */${size}`}); res.end(); return; }
  res.writeHead(range ? 206 : 200, {...HEADERS, 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'content-length': end - start + 1, ...(range ? {'content-range': `bytes ${start}-${end}/${size}`} : {})});
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file, {start, end}).on('error', () => res.destroy()).pipe(res);
}
