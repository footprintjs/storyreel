// StoryReel Studio — the page. Everything it shows comes from the local studio server (server.mjs):
// frames drawn on request, the film's scenes, phrases and notes, and what drew each spot.
const $ = id => document.getElementById(id);
const state = {film: null, version: -1, t: 0, playing: false, clock0: 0, busy: false, dirty: false, width: 960,
  beat: null, hit: null, sceneIndex: -1, nearKey: '', drag: false};
const COLOURS = {story: '#3867d6', whiteboard: '#3867d6', stages: '#1e9e6a', card: '#d9822b', guesses: '#8e44ad', notes: '#c0392b', pushIn: '#7f8c8d', recalls: '#7f8c8d'};
const colourOf = path => COLOURS[(path ?? '').match(/^[a-zA-Z]+/)?.[0]] ?? '#95a5a6';
const clockText = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; };
/** The entry a phrase belongs to: its path without the last step ("story.items[3].at" → "story.items[3]"). */
const ownerOf = path => path.replace(/(\.[^.[\]]+|\[\d+\])$/, '');
const el = (tag, props = {}, ...kids) => { const n = document.createElement(tag); Object.assign(n, props); for (const k of kids) n.append(k); return n; };

async function getJson(url) {
  const r = await fetch(url), body = await r.json();
  if (!r.ok) throw new Error(body.error ?? r.statusText);
  return body;
}

// ── The film: loaded once, again whenever the server compiled it again ──
async function loadFilm() {
  const film = await getJson('/api/film');
  state.film = film; state.version = film.version; state.sceneIndex = -1; state.nearKey = '';
  $('title').textContent = film.title; document.title = `${film.title} · StoryReel Studio`;
  showStatus(film.error, film.loadedAt);
  const voice = $('voice');
  if (film.audio) voice.src = `/api/audio?v=${film.version}`; else voice.removeAttribute('src');
  renderNotes(); renderReading();
  seek(Math.min(state.t, film.total));
}
function showStatus(error, loadedAt) {
  $('status').textContent = error ? (state.film ? 'refused — the last good film is shown' : 'refused') : `compiled ${new Date(loadedAt).toLocaleTimeString()}`;
  $('status').classList.toggle('bad', Boolean(error));
  $('error').hidden = !error; $('error').textContent = error ?? '';
}
async function poll() {
  try {
    const v = await getJson('/api/version');
    if (v.version !== state.version) {
      try { await loadFilm(); } catch (e) { state.version = v.version; showStatus(v.error ?? e.message); }
    }
  } catch { /* the server is restarting: keep asking */ }
  setTimeout(poll, 800);
}

// ── The picture ──
function requestFrame() {
  if (state.busy || !state.film) return;
  state.busy = true; state.dirty = false;
  const t = state.t;
  fetch(`/api/frame?t=${t.toFixed(3)}&w=${state.width}&v=${state.version}`)
    .then(r => (r.ok ? r.blob() : null))
    .then(blob => { if (!blob) return; const img = $('frame'), old = img.src; img.src = URL.createObjectURL(blob); if (old.startsWith('blob:')) URL.revokeObjectURL(old); })
    .catch(() => {})
    .finally(() => { state.busy = false; if (state.dirty) requestFrame(); });
}
function seek(t) {
  if (!state.film) return;
  state.t = Math.max(0, Math.min(state.film.total, t)); state.dirty = true;
  requestFrame();
  $('time').textContent = `${clockText(state.t)} / ${clockText(state.film.total)}`;
  const i = sceneIndexAt(state.t);
  if (i !== state.sceneIndex) { state.sceneIndex = i; $('scene').textContent = state.film.scenes[i]?.title ?? ''; renderTranscript(); }
  markWord(); renderNear(); drawTimeline();
  if (!state.playing) { const v = $('voice'); if (state.film.audio && Math.abs(v.currentTime - state.t) > .05) v.currentTime = state.t; }
  if (state.hit && Math.abs(state.hit.t - state.t) > 1e-3) { $('box').hidden = true; $('dot').hidden = true; }
}
const sceneIndexAt = t => { const s = state.film.scenes; let i = s.length - 1; while (i > 0 && t < s[i].start) i--; return i; };

// ── Play: the voice is the clock when there is one ──
function play() {
  if (!state.film) return;
  if (state.playing) { pause(); return; }
  if (state.t >= state.film.total - .05) seek(0);
  state.playing = true; $('play').textContent = 'Pause';
  if (state.film.audio) { const v = $('voice'); v.currentTime = state.t; v.play().catch(() => {}); }
  state.clock0 = performance.now() - state.t * 1000;
  requestAnimationFrame(tick);
}
function pause() { state.playing = false; $('play').textContent = 'Play'; $('voice').pause(); }
function tick() {
  if (!state.playing) return;
  const t = state.film.audio ? $('voice').currentTime : (performance.now() - state.clock0) / 1000;
  if (t >= state.film.total) { pause(); seek(state.film.total); return; }
  seek(t);
  requestAnimationFrame(tick);
}

// ── The timeline: scene bands, a tick per spoken phrase (coloured by recipe section), notes, the playhead ──
function drawTimeline() {
  const c = $('timeline'), film = state.film; if (!film) return;
  const dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
  if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const g = c.getContext('2d'), x = t => t / film.total * W, css = getComputedStyle(document.documentElement);
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  film.scenes.forEach((s, i) => {
    g.fillStyle = css.getPropertyValue(i % 2 ? '--band-b' : '--band-a'); g.fillRect(x(s.start), 0, x(s.end) - x(s.start), H);
    g.fillStyle = css.getPropertyValue('--muted'); g.font = '600 11px system-ui, sans-serif';
    const room = x(s.end) - x(s.start) - 8; if (room > 24) { g.save(); g.beginPath(); g.rect(x(s.start), 0, room + 4, 20); g.clip(); g.fillText(s.title, x(s.start) + 4, 14); g.restore(); }
  });
  for (const b of film.beats) {
    const on = state.beat === b; g.fillStyle = colourOf(b.path);
    g.fillRect(x(b.t) - (on ? 1.5 : .75), on ? 20 : 26, on ? 3 : 1.5, on ? 40 : 28);
  }
  for (const n of film.notes) {
    g.fillStyle = '#c0392b'; g.strokeStyle = '#c0392b';
    if (n.push) { g.globalAlpha = .28; g.fillRect(x(n.from), 66, x(n.to + n.seconds) - x(n.from), 12); g.globalAlpha = 1; g.font = '600 10px system-ui'; g.fillText('push', x(n.from) + 3, 91); }
    if (n.cut) { g.fillRect(x(n.at) - 1, 62, 2, 20); g.font = '600 10px system-ui'; g.fillText('cut', x(n.at) + 3, 91); }
  }
  g.fillStyle = css.getPropertyValue('--ink'); g.fillRect(x(state.t) - 1, 0, 2, H);
}
function beatNear(px) {
  const W = $('timeline').clientWidth, film = state.film; let best = null, bestD = 5;
  for (const b of film.beats) { const d = Math.abs(b.t / film.total * W - px); if (d < bestD) { best = b; bestD = d; } }
  return best;
}
function onTimeline(e) {
  const r = $('timeline').getBoundingClientRect(), px = e.clientX - r.left, t = px / r.width * state.film.total;
  if (e.type === 'mousedown') {
    state.drag = true;
    const b = beatNear(px);
    if (b) { selectBeat(b); return; }
  }
  if (state.drag) seek(t);
}
function onTimelineHover(e) {
  if (!state.film) return;
  const r = $('timeline').getBoundingClientRect(), b = beatNear(e.clientX - r.left), tip = $('tip');
  if (!b) { tip.hidden = true; return; }
  tip.textContent = `${clockText(b.t)} · “${b.said.phrase}”${b.said.plus ? ` +${b.said.plus}s` : ''} → ${b.path ?? 'made by a kit'}`;
  tip.hidden = false; tip.style.left = `${Math.min(e.clientX - r.left + 8, r.width - 300)}px`; tip.style.top = '-34px';
}

// ── Phrases, the transcript, the notes ──
function selectBeat(b) {
  state.beat = b; seek(b.t);
  if (b.path) showEntry(ownerOf(b.path)); else { $('entry').replaceChildren(el('span', {className: 'muted', textContent: 'This phrase was named by a kit, not by a recipe entry.'})); }
  drawTimeline(); state.nearKey = ''; renderNear();
}
function renderNear() {
  const film = state.film, near = film.beats.filter(b => Math.abs(b.t - state.t) <= 2.5).sort((a, b) => a.t - b.t), key = near.map(b => b.t + b.path).join('|') + (state.beat?.t ?? '');
  if (key === state.nearKey) return; state.nearKey = key;
  $('now').replaceChildren(...near.map(b => {
    const li = el('li', {className: state.beat === b ? 'on' : ''}, el('span', {className: 'at', textContent: clockText(b.t)}),
      el('span', {}, el('span', {className: 'swatch'}), `“${b.said.phrase}” `, el('span', {className: 'path', textContent: b.path ?? '(a kit)'})));
    li.querySelector('.swatch').style.background = colourOf(b.path);
    li.addEventListener('click', () => selectBeat(b));
    return li;
  }));
  if (!near.length) $('now').replaceChildren(el('li', {className: 'muted empty', textContent: 'No phrase within 2.5 s.'}));
}
function renderTranscript() {
  const s = state.film.scenes[state.sceneIndex];
  $('transcript').replaceChildren(...(s?.words ?? []).flatMap(w => {
    // A direction's words (a silent scene) are shown dim and slanted: they are seen, never spoken.
    const span = el('span', {textContent: w.text}); span.dataset.start = w.start; span.dataset.end = w.end;
    if (w.spoken === false) { span.dataset.direction = ''; span.title = 'a direction: shown, not spoken'; }
    span.addEventListener('click', () => seek(w.start + .001));
    return [span, ' '];
  }));
}
function markWord() {
  // The word being said is the last one started (until a pause after it); the words before it are said.
  const spans = [...$('transcript').querySelectorAll('span')], at = spans.findLastIndex(sp => Number(sp.dataset.start) <= state.t);
  spans.forEach((sp, i) => { sp.className = i < at ? 'said' : i === at ? (state.t < Number(sp.dataset.end) + .25 ? 'now' : 'said') : ''; });
}
function renderNotes() {
  const notes = state.film.notes;
  if (!notes.length) { $('notes').replaceChildren(el('li', {className: 'muted empty', textContent: 'None yet. A recipe\'s notes can say: speed, cut, push.'})); return; }
  $('notes').replaceChildren(...notes.map(n => {
    const what = n.speed !== undefined ? `camera speed ${n.speed}×` : n.cut ? `cut into ${n.cut} (was ${n.was})` : `push ×${n.push.zoom} at [${n.push.at.join(', ')}]`;
    const at = n.cut ? n.at : n.push ? n.from : 0;
    const li = el('li', {}, el('span', {className: 'at', textContent: n.speed !== undefined ? 'film' : clockText(at)}), el('span', {}, el('strong', {textContent: what}), el('br'), el('span', {className: 'label', textContent: n.note})));
    li.addEventListener('click', () => seek(at));
    return li;
  }));
}

function renderReading() {
  const short = state.film.reading ?? [];
  if (!short.length) { $('reading').replaceChildren(el('li', {className: 'muted empty', textContent: 'Every line stays up long enough to read (0.3 s a word).'})); return; }
  $('reading').replaceChildren(...short.map(l => {
    const li = el('li', {}, el('span', {className: 'at', textContent: clockText(l.at)}), el('span', {}, `“${l.text.slice(0, 60)}” `, el('span', {className: 'label', textContent: `${l.seconds} s of ${l.needs} s`}), el('br'), el('span', {className: 'path', textContent: l.path})));
    li.addEventListener('click', () => { seek(l.at + .05); showEntry(l.path.replace(/\.(question|answer)$/, '')); });
    return li;
  }));
}

// ── Ask the picture: what drew this spot? ──
async function ask(e) {
  if (!state.film) return;
  const r = $('frame').getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 1600, y = (e.clientY - r.top) / r.height * 900;
  const answer = await getJson(`/api/hit?t=${state.t.toFixed(3)}&x=${x.toFixed(1)}&y=${y.toFixed(1)}`);
  state.hit = answer;
  const dot = $('dot'); dot.hidden = false; dot.style.left = `${x / 16}%`; dot.style.top = `${y / 9}%`;
  const coords = el('div', {className: 'coords'}, el('span', {className: 'label', textContent: `at ${clockText(answer.t)}`}), coordinate('frame', answer.point.frame, 'a push note\'s at'));
  if (answer.point.world) coords.append(coordinate(answer.point.world.path, answer.point.world.at, 'a new item on this world'));
  const list = el('ol', {className: 'hits'}, ...answer.hits.map((h, i) => {
    const li = el('li', {className: i === 0 ? 'on' : ''}, el('span', {className: 'swatch'}), el('span', {className: 'path', textContent: h.path}), ' ', el('span', {className: 'label', textContent: h.label ? `«${h.label.slice(0, 60)}»` : ''}));
    li.querySelector('.swatch').style.background = colourOf(h.path);
    li.addEventListener('click', () => { for (const o of list.children) o.className = ''; li.className = 'on'; outline(h.box); showEntry(h.path); });
    return li;
  }));
  $('here').replaceChildren(coords, answer.hits.length ? list : el('p', {className: 'muted', textContent: 'Nothing drawn here names a recipe entry.'}));
  if (answer.hits[0]) { outline(answer.hits[0].box); showEntry(answer.hits[0].path); } else $('box').hidden = true;
}
function coordinate(name, [x, y], use) {
  const text = `[${x}, ${y}]`, button = el('button', {type: 'button', textContent: 'copy', title: `Copy — for ${use}`});
  button.addEventListener('click', () => navigator.clipboard?.writeText(text).then(() => { button.textContent = 'copied'; setTimeout(() => (button.textContent = 'copy'), 1200); }, () => {}));
  return el('span', {}, `${name} `, el('code', {textContent: text}), ' ', button);
}
function outline([x0, y0, x1, y1]) {
  const box = $('box'); box.hidden = false;
  box.style.left = `${Math.max(0, x0) / 16}%`; box.style.top = `${Math.max(0, y0) / 9}%`;
  box.style.width = `${(Math.min(1600, x1) - Math.max(0, x0)) / 16}%`; box.style.height = `${(Math.min(900, y1) - Math.max(0, y0)) / 9}%`;
}
async function showEntry(path) {
  const e = await getJson(`/api/entry?path=${encodeURIComponent(path)}`), film = state.film;
  const where = e.line && film.recipeFile ? el('a', {href: `vscode://file/${film.recipeFile}:${e.line}`, textContent: `${film.recipeFile.split('/').pop()}:${e.line}`, title: 'Open in VS Code'}) : el('span', {className: 'muted', textContent: 'line unknown'});
  $('entry').replaceChildren(el('div', {}, el('span', {className: 'path', textContent: e.path || '(the recipe)'}), ' · ', where), el('pre', {className: 'json', textContent: e.json}));
}

// ── Wiring ──
function fit() { state.width = Math.min(1920, Math.max(320, Math.round($('screen').clientWidth * (window.devicePixelRatio || 1)))); drawTimeline(); state.dirty = true; requestFrame(); }
$('play').addEventListener('click', play);
$('frame').addEventListener('click', e => ask(e).catch(err => $('here').replaceChildren(el('span', {className: 'muted', textContent: err.message}))));
$('timeline').addEventListener('mousedown', onTimeline);
window.addEventListener('mousemove', e => { if (state.drag) onTimeline(e); });
window.addEventListener('mouseup', () => { state.drag = false; });
$('timeline').addEventListener('mousemove', onTimelineHover);
$('timeline').addEventListener('mouseleave', () => { $('tip').hidden = true; });
$('voice').addEventListener('ended', () => { if (state.playing) { pause(); seek(state.film.total); } });
window.addEventListener('resize', fit);
window.addEventListener('keydown', e => {
  if (!state.film || e.target.closest?.('input, textarea, button')) return;
  const beats = state.film.beats, scenes = state.film.scenes;
  if (e.key === ' ') { e.preventDefault(); play(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); seek(state.t + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / 30)); }
  else if (e.key === ']') { const b = beats.find(x => x.t > state.t + 1e-3); if (b) selectBeat(b); }
  else if (e.key === '[') { const b = [...beats].reverse().find(x => x.t < state.t - 1e-3); if (b) selectBeat(b); }
  else if (e.key === '.') { const s = scenes.find(x => x.start > state.t + 1e-3); if (s) seek(s.start); }
  else if (e.key === ',') { const s = [...scenes].reverse().find(x => x.start < state.t - .5); seek(s ? s.start : 0); }
});
loadFilm().catch(e => showStatus(e.message)).finally(() => { fit(); poll(); });
