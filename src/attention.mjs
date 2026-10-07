/**
 * Attention: where the viewer looks, and how the picture shows it — one interface, a strategy per film. The
 * recipe says WHAT the voice is about and WHEN (a beat and a named thing); the strategy says HOW, so the same
 * film can be shown another way tomorrow by changing one word.
 *
 *   "focus": {"strategy": "camera", "feel": "heavy", "keys": [
 *     {"at": ["leak", "leaves the building"], "on": "database", "size": "medium"},
 *     {"at": ["turn", "the front door"], "on": "wide"}]}
 *   "emphasis": {"strategy": "pop", "words": [{"at": ["rules", "acts as"], "text": "YOUR RULES"}]}
 *
 * Focus (FOCUS): `camera` eases the camera to frame the named thing (sizes as a director's push: medium, close,
 * insert; `on: "wide"` is the whole frame); `spotlight` darkens the rest; `dim` lays a veil of the paper over the
 * rest; `none`. Every move is a spring (motion.mjs · FEELS), so a camera that is still easing toward one thing
 * turns smoothly toward the next. Emphasis (EMPHASIS): `pop` lands the words big on their beat, then settles them
 * into a label in the top corner until the next words; `corner` is the label only; `none`.
 *
 * A strategy of your own has the same shape, passed to compileFilm (and makeFilm) as
 * `strategies: {focus: {name: {show(ctx, view, paint, theme)}}, emphasis: {name: {draw(ctx, t, word, theme)}}}`:
 * view = {cx, cy, z, sx, sy, box, w} (the point framed, the zoom, where on the frame it sits, the named thing's box,
 * how focused, 0–1). `safe` ([x0, y0, x1, y1] on the 1600×900 frame) is where a framed thing may sit — a film with
 * burned-in captions keeps it above them ([0, 0, 1600, 700]); it is centred there and sized to it.
 */
import {FRAMINGS} from './notes.mjs';
import {track, pop, readFeel} from './motion.mjs';
import {inOut as ease} from './ease.mjs';

const W = 1600, H = 900;
const FOCUS_KEYS = ['strategy', 'feel', 'keys', 'safe'], KEY_KEYS = ['at', 'on', 'size'];
const EMPHASIS_KEYS = ['strategy', 'feel', 'words'], WORD_KEYS = ['at', 'text', 'until'];
const clamp01 = v => Math.max(0, Math.min(1, v));

/** A colour as given ('#rrggbb' or 'rgb…') at an alpha, for a veil. */
function withAlphaOf(color, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(color ?? '');
  if (!m) return `rgba(243, 238, 227, ${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
/** Everything but the named thing (with a margin), under a colour, as strong as the view is focused. */
function veil(ctx, v, color) {
  if (!(v.w > .01)) return;
  const [x0, y0, x1, y1] = v.box, m = 18;
  ctx.save(); ctx.globalAlpha *= clamp01(v.w); ctx.fillStyle = color;
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.roundRect(x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m, 22); ctx.fill('evenodd');
  ctx.restore();
}

/** The focus strategies: how a frame shows what the voice is about. */
export const FOCUS = Object.freeze({
  camera: Object.freeze({name: 'camera', moves: true, show(ctx, v, paint) {
    ctx.save(); ctx.translate(v.sx, v.sy); ctx.scale(v.z, v.z); ctx.translate(-v.cx, -v.cy); paint(ctx); ctx.restore();
  }}),
  spotlight: Object.freeze({name: 'spotlight', show(ctx, v, paint) { paint(ctx); veil(ctx, v, 'rgba(18, 16, 26, .58)'); }}),
  dim: Object.freeze({name: 'dim', show(ctx, v, paint, theme) { paint(ctx); veil(ctx, v, withAlphaOf(theme?.palette?.bg, .62)); }}),
  none: Object.freeze({name: 'none', show(ctx, v, paint) { paint(ctx); }}),
});

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
/** A word's label in the top corner: ink ground, paper letters. */
function chip(ctx, text, alpha, theme) {
  const ink = theme?.palette?.ink ?? '#23211c', bg = theme?.palette?.bg ?? '#f3eee3', font = theme?.type?.sans ?? SANS;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.font = `800 24px ${font}`;
  const w = ctx.measureText(text).width + 32;
  ctx.fillStyle = ink; ctx.beginPath(); ctx.roundRect(40, 26, w, 40, 20); ctx.fill();
  ctx.fillStyle = bg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(text, 56, 47);
  ctx.restore();
}
/** The emphasis strategies: how the words of a beat are put in front of the viewer. */
export const EMPHASIS = Object.freeze({
  pop: Object.freeze({name: 'pop', draw(ctx, t, word, theme) {
    const u = t - word.t, leave = 1 - clamp01((t - (word.next - .25)) / .25), settle = ease(clamp01((u - 1.1) / .6));
    if (settle < 1) {
      const ink = theme?.palette?.ink ?? '#23211c', bg = theme?.palette?.bg ?? '#f3eee3', font = theme?.type?.sans ?? SANS;
      // A veil of the paper under the words while they are big: they read alone, then the picture comes back.
      const veil = .78 * clamp01(u / .2) * (1 - settle) * leave;
      if (veil > 0) { ctx.save(); ctx.globalAlpha *= veil; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      const size = 96 + (24 - 96) * settle, k = pop(t, word.t, word.feel);
      ctx.save(); ctx.globalAlpha *= leave * (1 - settle * .4);
      ctx.font = `900 ${size}px ${font}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      const wide = ctx.measureText(word.text).width, x = 800 + (40 + 16 + wide / 2 - 800) * settle, y = 150 + (47 - 150) * settle;
      ctx.translate(x, y); ctx.scale(k, k);
      ctx.lineJoin = 'round'; ctx.lineWidth = 12; ctx.strokeStyle = bg; ctx.strokeText(word.text, 0, 0);
      ctx.fillStyle = ink; ctx.fillText(word.text, 0, 0);
      ctx.restore();
    }
    if (settle > .5) chip(ctx, word.text, leave * clamp01((settle - .5) * 2), theme);
  }}),
  corner: Object.freeze({name: 'corner', draw(ctx, t, word, theme) { chip(ctx, word.text, clamp01((t - word.t) / .25) * (1 - clamp01((t - (word.next - .25)) / .25)), theme); }}),
  none: Object.freeze({name: 'none', draw() {}}),
});

function pick(kind, name, builtIn, mine, needs) {
  const all = {...builtIn, ...(mine ?? {})};
  if (typeof name !== 'string' || !all[name]) throw new Error(`${kind}.strategy must be ${Object.keys(all).map(n => `"${n}"`).join(', ')} (a strategy of your own goes in compileFilm's strategies.${kind}), not ${JSON.stringify(name)}`);
  if (typeof all[name][needs] !== 'function') throw new Error(`${kind} strategy "${name}" must have ${needs}(…)`);
  return {...all[name], name};
}
const inOrder = (list, kind) => list.forEach((k, i) => { if (i && k.t < list[i - 1].t) throw new Error(`${kind}[${i}] comes before the one above it; list them in the order they are spoken`); });

/** The focus as written, checked and placed on the clock: {strategy, viewAt(t), show(ctx, t, paint), record}. */
function readFocus(spec, {clock, named, strategies, pushes, theme}) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('focus must be {strategy, keys: [{at, on, size?}], feel?}');
  for (const key of Object.keys(spec)) if (!FOCUS_KEYS.includes(key)) throw new Error(`focus has unsupported key ${key} (focus takes ${FOCUS_KEYS.join(', ')})`);
  const strategy = pick('focus', spec.strategy, FOCUS, strategies?.focus, 'show'), feel = readFeel(spec.feel ?? 'heavy');
  const safe = spec.safe ?? [0, 0, W, H];
  if (!(Array.isArray(safe) && safe.length === 4 && safe.every(Number.isFinite) && safe[0] >= 0 && safe[1] >= 0 && safe[2] <= W && safe[3] <= H && safe[2] - safe[0] >= 200 && safe[3] - safe[1] >= 200))
    throw new Error('focus.safe is [x0, y0, x1, y1] on the 1600×900 frame, at least 200 × 200: where a framed thing may sit (e.g. [0, 0, 1600, 700] above burned-in captions)');
  const [sw, sh] = [safe[2] - safe[0], safe[3] - safe[1]], [scx, scy] = [(safe[0] + safe[2]) / 2, (safe[1] + safe[3]) / 2];
  if (strategy.moves && pushes.length) throw new Error(`focus "${strategy.name}" moves the camera, and the director's notes push it too: a film has one camera — leave the push notes out, or show the focus with "spotlight" or "dim"`);
  if (!Array.isArray(spec.keys) || !spec.keys.length) throw new Error('focus.keys is a list of {at: beat, on: a named thing or "wide", size?}');
  const keys = spec.keys.map((k, i) => {
    if (!k || typeof k !== 'object' || Array.isArray(k)) throw new Error(`focus.keys[${i}] must be {at, on, size?}`);
    for (const key of Object.keys(k)) if (!KEY_KEYS.includes(key)) throw new Error(`focus.keys[${i}] has unsupported key ${key} (a key is {at, on, size?})`);
    if (typeof k.on !== 'string' || !k.on) throw new Error(`focus.keys[${i}].on names a thing in the picture (a kit names things in regionsAt), or "wide"`);
    const t = clock.at(k.at);
    if (k.on === 'wide') { if (k.size !== undefined) throw new Error(`focus.keys[${i}]: "wide" is the whole frame; leave the size out`); return {t, on: 'wide', cx: W / 2, cy: H / 2, z: 1, box: [0, 0, W, H], w: 0}; }
    const size = k.size ?? 'medium';
    if (!Object.hasOwn(FRAMINGS, size)) throw new Error(`focus.keys[${i}].size is ${Object.keys(FRAMINGS).join(', ')} (how much of the frame "${k.on}" fills), not ${JSON.stringify(size)}`);
    let box; try { box = named(k.on, t); } catch (e) { throw new Error(`focus.keys[${i}]: ${e.message}`, {cause: e}); }
    const [x0, y0, x1, y1] = box, share = Math.max((x1 - x0) / sw, (y1 - y0) / sh);
    return {t, on: k.on, size, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, z: Math.max(1, Math.min(3, FRAMINGS[size] / share)), box: [...box], w: 1};
  });
  inOrder(keys, 'focus.keys');
  // A wide key sits at the frame's centre; a framed thing at the safe area's centre.
  keys.forEach(k => { k.sx = k.on === 'wide' ? W / 2 : scx; k.sy = k.on === 'wide' ? H / 2 : scy; });
  const along = pick => [[0, pick({cx: W / 2, cy: H / 2, z: 1, sx: W / 2, sy: H / 2, box: [0, 0, W, H], w: 0})], ...keys.map(k => [k.t, pick(k)])];
  const tracks = {cx: along(k => k.cx), cy: along(k => k.cy), z: along(k => k.z), sx: along(k => k.sx), sy: along(k => k.sy), w: along(k => k.w), box: [0, 1, 2, 3].map(i => along(k => k.box[i]))};
  /** Where the focus is at t: the camera's point, zoom and place on the frame (the picture always covers the frame), the box, how focused. */
  const viewAt = t => {
    const z = Math.max(1, track(t, tracks.z, feel)), sx = track(t, tracks.sx, feel), sy = track(t, tracks.sy, feel);
    return {cx: Math.min(W - (W - sx) / z, Math.max(sx / z, track(t, tracks.cx, feel))), cy: Math.min(H - (H - sy) / z, Math.max(sy / z, track(t, tracks.cy, feel))), z, sx, sy,
      box: tracks.box.map(b => track(t, b, feel)), w: clamp01(track(t, tracks.w, feel))};
  };
  return {strategy: strategy.name, viewAt, show: (ctx, t, paint) => strategy.show(ctx, viewAt(t), paint, theme),
    record: {strategy: strategy.name, ...(spec.safe ? {safe} : {}), keys: keys.map(k => ({t: +k.t.toFixed(3), on: k.on, ...(k.size ? {size: k.size} : {})}))}};
}

/** The emphasis as written, checked and placed on the clock: {strategy, draw(ctx, t), record}. */
function readEmphasis(spec, {clock, strategies, theme}) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('emphasis must be {strategy, words: [{at, text, until?}], feel?}');
  for (const key of Object.keys(spec)) if (!EMPHASIS_KEYS.includes(key)) throw new Error(`emphasis has unsupported key ${key} (emphasis takes ${EMPHASIS_KEYS.join(', ')})`);
  const strategy = pick('emphasis', spec.strategy, EMPHASIS, strategies?.emphasis, 'draw'), feel = readFeel(spec.feel ?? 'playful');
  if (!Array.isArray(spec.words) || !spec.words.length) throw new Error('emphasis.words is a list of {at: beat, text, until?}');
  const words = spec.words.map((w, i) => {
    if (!w || typeof w !== 'object' || Array.isArray(w)) throw new Error(`emphasis.words[${i}] must be {at, text, until?}`);
    for (const key of Object.keys(w)) if (!WORD_KEYS.includes(key)) throw new Error(`emphasis.words[${i}] has unsupported key ${key} (words are {at, text, until?})`);
    if (typeof w.text !== 'string' || !w.text.trim()) throw new Error(`emphasis.words[${i}].text is the words to show`);
    return {t: clock.at(w.at), text: w.text, until: w.until === undefined ? Infinity : clock.at(w.until), feel};
  });
  inOrder(words, 'emphasis.words');
  words.forEach((w, i) => { w.next = Math.min(w.until, words[i + 1]?.t ?? Infinity); });
  return {strategy: strategy.name, draw(ctx, t) { const w = words.findLast(x => t >= x.t); if (w && t < w.next) strategy.draw(ctx, t, w, theme); },
    record: {strategy: strategy.name, words: words.map(w => ({t: +w.t.toFixed(3), text: w.text}))}};
}

/**
 * A film's attention, read from its recipe (`focus`, `emphasis`), or null when it has neither. named(name, t) is
 * the film's box of a named thing; pushes, the director's pushes (a camera focus and a push cannot share the camera).
 */
export function readAttention(recipe, {clock, named, strategies = null, pushes = [], theme = null}) {
  if (strategies !== null && (typeof strategies !== 'object' || Array.isArray(strategies))) throw new Error('strategies is {focus?: {name: strategy}, emphasis?: {name: strategy}}');
  const focus = recipe.focus === undefined ? null : readFocus(recipe.focus, {clock, named, strategies, pushes, theme});
  const emphasis = recipe.emphasis === undefined ? null : readEmphasis(recipe.emphasis, {clock, strategies, theme});
  if (!focus && !emphasis) return null;
  return {focus, emphasis, record: {...(focus ? {focus: focus.record} : {}), ...(emphasis ? {emphasis: emphasis.record} : {})}};
}
