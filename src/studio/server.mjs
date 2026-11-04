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
 * Notes: the person leaves a note on the film at the playhead, or on a spot of the picture, and it lands as one signed
 * line of feedback.md beside the recipe's file, with its exact place read from the film (take-note.mjs, note.mjs);
 * `storyreel feedback` reads them back for an agent.
 *
 * Local only: it listens on 127.0.0.1, answers only requests addressed to it by that name and to its own address — a
 * path made of a random key (`http://127.0.0.1:4321/<key>/`), which only the person who started it is shown: another
 * user of the same machine can reach the port, but not the key, so they can neither read the film nor leave a note
 * signed as the person (403). Its pages use relative paths, so the key rides along on every request; no cookie, since a
 * cookie for 127.0.0.1 is sent to every port of it, another user's server among them. It
 * reads (GET; HEAD only for the page's own files and the voice). The routes that draw, check or compile what a
 * query names (a frame, a card, a pick, a Try) answer the studio's own page only: a request another site's page makes
 * (Sec-Fetch-Site) is refused. It runs nothing from the recipe. Its one write is a note (POST /api/note), taken only
 * from its own page: Sec-Fetch-Site same-origin (a request that does not say is refused), the studio's own Origin, a
 * JSON body of at most 16 KB with only the fields a note has — never the place, which is read from the film. A note and
 * a Try each leave their run for `storyreel log` in the project's out folder (load()'s `out`; runlog.mjs), bounded as
 * every run is: what a request names only as far as the checks passed it, and never in place of the answer.
 */
import http from 'node:http';
import {randomBytes, timingSafeEqual} from 'node:crypto';
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
import {pickTries} from './tries.mjs';
import {keepRun} from '../runlog.mjs';
import {Refusal} from './refusal.mjs';
import {noteTaker, readJsonBody, noteRequest} from './take-note.mjs';
import {feedbackFile} from './feedback-file.mjs';
import {storyreelHome} from './notekey.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = {'/': ['page.html', 'text/html; charset=utf-8'], '/studio.js': ['page.js', 'text/javascript; charset=utf-8'], '/studio.css': ['page.css', 'text/css; charset=utf-8']};
/** What HEAD may ask of: the page's own files and the voice (its player asks for its size); every other route is GET only. */
const HEADED = new Set([...Object.keys(PAGE), '/api/audio']);
/** The routes that draw, check or compile what their query names: the studio's own page asks them, no other site's. */
const OWN_PAGE_ONLY = new Set(['/api/frame', '/api/card', '/api/pick', '/api/try']);
/** Who may ask them (Sec-Fetch-Site): the page itself, or the person typing the address; a browser that does not say is let through. */
const OWN = new Set(['same-origin', 'none']);
/** The one route that writes, and its one method: a note, from the studio's own page only (a browser that does not say is refused). */
const NOTE = '/api/note';
/** The studio's key, in hex characters: 128 random bits. */
const KEY_LENGTH = 32;
/** The longest query the studio reads: its own page's are a fraction of it. */
const QUERY_MOST = 1024;
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
 *               from another recipe — what the gallery's Try plays (a copy with a pick in it; nothing written) ·
 *               out: the project's out folder, where a note's and a Try's runs are kept for `storyreel log` (none: not kept)
 * @param watch  files that, when changed, make the studio call load() again
 * @param port   the port on 127.0.0.1 (0: any free port)
 * @param home   where the person's note key lives (notekey.mjs · storyreelHome: STORYREEL_HOME, or ~/.storyreel): notes
 *               are signed with it, so `storyreel feedback` knows them for theirs; never inside the project's folder
 * @returns {url, port, reload(), held(), close()} — held: what it keeps in memory, each bounded ({cards, cardBytes, tries})
 */
export async function startStudio({load, watch = [], port = 4321, log = console.log, home = storyreelHome()}) {
  const state = {version: 0, error: null, loaded: null, lines: new Map(), loadedAt: null};
  // One load at a time: a change while one runs asks for one more, after it, so the last load always reads the last
  // edit (two watchers — the data's here, the code's in cli.mjs — can fire together). Every caller gets the last answer.
  let running = null, again = false;
  function reload() {
    if (running) { again = true; return running; }
    running = (async () => { let error; do { again = false; error = await loadOnce(); } while (again); running = null; return error; })();
    return running;
  }
  async function loadOnce() {
    try {
      const loaded = await load();
      if (!loaded?.film || !loaded?.storyboard) throw new Error('load() must return {film, storyboard, recipe}');
      state.loaded = loaded; state.error = null; state.loadedAt = new Date().toISOString();
      state.lines = loaded.source?.file ? jsonLines(readFileSync(loaded.source.file, 'utf8')) : new Map();
    } catch (e) {
      // Keep the last good film on screen; the page shows why this one refused.
      state.error = e.message;
    }
    // A pick being tried was a copy of the film before: it goes. The gallery's cards are drawn again for this one: each is
    // kept under the version it was drawn for, so one still being drawn for the film before is never shown for this one.
    tries.drop(); cards.clear(); catalog = null;
    state.version++;
    return state.error;
  }
  /** A run the studio made kept for the log, in the out folder of the film on screen; one that cannot be saved is said in the studio's own log. */
  const keep = run => {
    const unsaved = state.loaded?.out ? keepRun(state.loaded.out, run) : null;
    if (unsaved) log(`studio: ${unsaved}`);
  };
  const cards = boundedCache(), tries = pickTries(), notes = noteTaker({home, keep});
  // The studio's key: its address's first step, shown only to whoever started it (the address it returns and prints).
  const key = randomBytes(KEY_LENGTH / 2).toString('hex'), keyBytes = Buffer.from(key);
  let catalog = null;
  await reload();
  if (state.error) log(`studio: refused — ${state.error}`);

  // Watch by polling the files' times: an editor that saves by replacing the file is still seen.
  let pending = null;
  const changed = (now, before) => { if (now.mtimeMs === before.mtimeMs && now.size === before.size) return; clearTimeout(pending); pending = setTimeout(() => reload().then(err => log(err ? `studio: refused — ${err}` : 'studio: compiled again')), 150); };
  for (const file of watch) watchFile(file, {interval: 300}, changed);

  const canvases = new Map();
  let sheet = null, transitions = null;
  /** An entry's line in the recipe file, as `lines` (that file read when `loaded` was) says it. */
  const linesOf = (loaded, lines) => p => { const prefix = loaded?.source?.prefix; return lines.get(prefix ? (p ? `${prefix}.${p}` : prefix) : p) ?? null; };
  const lineOf = p => linesOf(state.loaded, state.lines)(p);
  const number = (v, lo, hi, fallback) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback; };

  function filmJson() {
    const {film, storyboard, title, source, audio} = state.loaded, clock = film.clock;
    return {
      version: state.version, error: state.error, loadedAt: state.loadedAt, title: title ?? storyboard.title ?? 'Untitled film', total: film.total,
      recipeFile: source?.file ?? null, feedbackFile: source?.file ? feedbackFile(source.file) : null, audio: Boolean(audio),
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
    try { return await applyPicks(recipe, [{scene: String(q.get('scene') ?? ''), kind, name: String(q.get('name') ?? '')}], {scenes, catalog: catalogNow()}); } catch (e) { throw Object.assign(new Refusal(e.message), {record: e.record}); }
  }
  /**
   * Try: the film compiled again in memory from a copy of the recipe with the pick in it (tries.mjs: one compile at a
   * time, the last few kept), the one tried until the next pick tried or the next reload; the page plays it from a
   * second before the scene starts (or from before its change starts, when that is earlier). A recipe the pick makes
   * refuse is said with the compile's own words. Its run stays in the log: the pick's checks and what became of it.
   */
  async function tryPick(q) {
    const {loaded, version} = state;
    if (typeof loaded.compile !== 'function') throw new Refusal('Try compiles a copy of the recipe: this studio\'s load() gives no compile(recipe)', 501);
    let picked;
    try { picked = await pickOf(q); } catch (e) { if (e.record) keep({feature: 'try', record: e.record, failure: e.message}); throw e; }
    const {recipe, changes: [change], record} = picked;
    const compile = async () => { try { return await loaded.compile(recipe); } catch (e) { keep({feature: 'try', summary: change.line, record, failure: e.message}); throw new Refusal(`${change.line}: ${e.message}`); } };
    const key = await tries.run(change.line, version, compile, () => state.version);
    keep({feature: 'try', summary: `${change.line}, tried on the film of version ${version}`, record});
    const clock = loaded.film.clock, start = clock.start(change.scene), end = clock.end(change.scene);
    const lead = change.kind === 'enter' ? readEntrance(change.name, change.line, catalogNow()).lead : 0;
    return {key, line: change.line, scene: change.scene, kind: change.kind, name: change.name, path: change.path, start, end, from: Math.max(0, +(start - Math.max(1, lead + .5)).toFixed(3))};
  }
  /** The film a frame is asked of: this one, or the pick being tried (`try`: its key) — a pick gone with a reload is said. */
  const filmOf = key => (key === null ? state.loaded.film : tries.filmOf(key));

  function hit(t, x, y) {
    const {film} = state.loaded;
    return {t, point: film.pointAt(t, x, y), hits: hitTest(film.regionsAt(t), x, y).map(r => ({...r, box: r.box.map(v => Math.round(v)), line: lineOf(r.path)}))};
  }

  function entry(p) {
    const value = valueAt(state.loaded.recipe, p), text = JSON.stringify(value, null, 2) ?? 'undefined';
    return {path: p, line: lineOf(p), json: text.length > 6000 ? `${text.slice(0, 6000)}\n…` : text};
  }

  /**
   * A note, from the studio's own page only: Sec-Fetch-Site same-origin — a request that does not say is refused here,
   * as no other route refuses it, for this one writes what the request says — the studio's own Origin, JSON; then its body (take-note.mjs).
   */
  async function takeNote(req, bound) {
    const site = req.headers['sec-fetch-site'], origin = req.headers.origin;
    if (site !== 'same-origin') throw new Refusal(`a note comes from the studio's own page only, and this request ${site === undefined ? 'does not say where it came from (no Sec-Fetch-Site)' : `came from elsewhere (Sec-Fetch-Site: ${site.slice(0, 40)})`}: leave it in the studio's page, in a current browser`, 403);
    if (![`http://127.0.0.1:${bound}`, `http://localhost:${bound}`].includes(origin)) throw new Refusal('a note comes from the studio\'s own page only (its Origin): leave it in the studio\'s page, at its own address', 403);
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] ?? ''))) throw new Refusal('a note\'s request is JSON: give it Content-Type: application/json', 415);
    const body = await readJsonBody(req);
    if (!state.loaded) throw new Refusal('no film is loaded yet: fix the recipe the studio shows, then leave the note', 503);
    // The film the note is placed against and its recipe file's lines, taken together now: a reload while the note waits changes neither.
    const {loaded, lines, version} = state, {film, storyboard, source} = loaded;
    return notes.take({film, storyboard, recipeFile: source?.file ?? null, lineOf: linesOf(loaded, lines)}, noteRequest(body, {version, total: film.total}));
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
      const u = new URL(req.url, `http://127.0.0.1:${bound}`), [, given = ''] = u.pathname.split('/');
      // The studio's own address: its key first, compared in constant time; anything else is refused before it is read.
      if (Buffer.byteLength(given) !== KEY_LENGTH || !timingSafeEqual(Buffer.from(given), keyBytes)) return send(res, 403, {error: 'The studio answers its own address only: open the one storyreel studio printed (its path carries the studio\'s key)'});
      if (u.pathname === `/${key}`) { res.setHeader('Location', `/${key}/`); return send(res, 308, {error: 'The studio\'s page is its address with a / at the end'}); }
      const route = u.pathname.slice(key.length + 1);
      if (route === NOTE) {
        if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, {error: `${NOTE} takes a note: POST it from the studio's page`}); }
        try { return send(res, 200, await takeNote(req, bound)); } catch (e) {
          if (e instanceof Refusal && e.status === 413) res.setHeader('Connection', 'close');   // the rest of the body is never read
          throw e;
        }
      }
      if (req.method !== 'GET' && !(req.method === 'HEAD' && HEADED.has(route))) {
        res.setHeader('Allow', HEADED.has(route) ? 'GET, HEAD' : 'GET');
        return send(res, 405, {error: `The studio reads, and takes one write (a note: POST ${NOTE}): ask ${route.slice(0, 80)} with GET`});
      }
      if (PAGE[route]) { const [file, type] = PAGE[route]; return send(res, 200, readFileSync(path.join(here, file)), type); }
      const q = queryOf(u);
      // Another site's page can ask by an image or a link, never reading the answer: it still costs a drawing or a compile.
      const site = req.headers['sec-fetch-site'];
      if (OWN_PAGE_ONLY.has(route) && site !== undefined && !OWN.has(site)) return send(res, 403, {error: `${route} answers the studio's own page only, and this request came from another site's (Sec-Fetch-Site: ${site.slice(0, 40)}): open the studio at its own address`});
      if (route === '/api/version') return send(res, 200, {version: state.version, error: state.error});
      if (!state.loaded) return send(res, 503, {error: state.error ?? 'Nothing loaded yet', version: state.version});
      const total = state.loaded.film.total, t = number(q.get('t'), 0, total, 0);
      if (route === '/api/film') return send(res, 200, filmJson());
      if (route === '/api/frame') return send(res, 200, await frame(filmOf(q.get('try')), t, number(q.get('w'), 160, 1920, 960)), 'image/jpeg');
      // The cards, and the scenes that take each kind of pick (a stage's scene an entrance; a kinetic world's a word move).
      if (route === '/api/gallery') return send(res, 200, {version: state.version, cards: galleryCards(catalogNow()), takes: pickScenes(state.loaded.recipe)});
      if (route === '/api/card') {
        // Only a card the gallery lists is drawn: the cache holds at most one PNG per card, and is bounded besides.
        const shown = catalogNow(), card = galleryCards(shown).find(c => c.kind === q.get('kind') && c.name === q.get('name'));
        if (!card) return send(res, 404, {error: 'No such card in the gallery: open /api/gallery for the ones it has'});
        return send(res, 200, await cards.get(`${state.version} ${card.kind} ${card.name}`, () => cardFrames(card, shown)), 'image/png');
      }
      if (route === '/api/pick') { const {changes: [c]} = await pickOf(q); return send(res, 200, {line: c.line, scene: c.scene, kind: c.kind, name: c.name, path: c.path}); }
      if (route === '/api/try') return send(res, 200, await tryPick(q));
      if (route === '/api/hit') return send(res, 200, hit(t, number(q.get('x'), 0, 1600, 800), number(q.get('y'), 0, 900, 450)));
      if (route === '/api/sheet') { if (sheet?.version !== state.version) sheet = {version: state.version, png: await contactSheet(state.loaded.film)}; return send(res, 200, sheet.png, 'image/png'); }
      if (route === '/api/transitions') {
        // The collection a shot can enter with (transitions.mjs): the built-in ones and the film's kits' own.
        if (transitions?.version !== state.version) transitions = {version: state.version, png: await transitionSheet({catalog: transitionCatalog(state.loaded.kits ?? [])})};
        return send(res, 200, transitions.png, 'image/png');
      }
      if (route === '/api/entry') return send(res, 200, entry(String(q.get('path') ?? '')));
      if (route === '/api/audio' && state.loaded.audio) return sendAudio(req, res, state.loaded.audio);
      return send(res, 404, {error: 'Not found'});
    } catch (e) {
      return send(res, e instanceof Refusal ? e.status : 500, {error: e.message});
    }
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  const bound = server.address().port, url = `http://127.0.0.1:${bound}/${key}/`;
  return {
    url, port: bound, reload,
    /** What the studio holds in memory, each bounded: the cards drawn (count and bytes), the picks tried kept compiled. */
    held: () => ({cards: cards.size, cardBytes: cards.bytes, tries: tries.kept}),
    close: async () => { for (const file of watch) unwatchFile(file, changed); clearTimeout(pending); server.closeAllConnections?.(); server.close(); await once(server, 'close'); },
  };
}

/**
 * A query, read: each parameter given once, the whole of it at most QUERY_MOST characters (the page's own are short);
 * anything else is refused before a value is read (400, 414).
 */
function queryOf(u) {
  if (u.search.length > QUERY_MOST) throw new Refusal(`The query is ${u.search.length} characters long: the studio reads at most ${QUERY_MOST}`, 414);
  const q = u.searchParams;
  for (const name of new Set(q.keys())) if (q.getAll(name).length > 1) throw new Refusal(`${JSON.stringify(name)} is given ${q.getAll(name).length} times: give each parameter once`, 400);
  return q;
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
