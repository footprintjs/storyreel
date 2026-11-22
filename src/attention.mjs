/**
 * Attention: where the viewer looks, and how the picture shows it — one interface, a strategy per film. The
 * recipe says WHAT the voice is about and WHEN (a beat and a named thing); the strategy says HOW, so the same
 * film can be shown another way tomorrow by changing one word.
 *
 *   "focus": {"strategy": "camera", "keys": [
 *     {"at": ["leak", "leaves the building"], "on": "database", "size": "medium"},
 *     {"at": ["turn", "the front door"], "on": "wide", "do": "cut"},
 *     {"at": ["talk", "Is it late"], "on": ["mia", "sam"]}]}     several things together: the box round all of them
 *   "emphasis": {"strategy": "pop", "words": [{"at": ["rules", "acts as"], "text": "YOUR RULES"}]}
 *
 * Focus (FOCUS): `camera` flies the camera to frame the named thing (sizes as a director's push: medium, close,
 * insert; `on: "wide"` is the whole frame); each key is a shot, and the flight between two shots is footprint-story's
 * (footprint-story/shot · planCameraMove, flight/steps.mjs): its path and its seconds, by minimum jerk under its limits.
 * A key says only how its shot is reached: `do` "fly" (the default) or "cut", `seconds` to fly over a length of its own,
 * `accept` the critics it keeps as written. `spotlight` darkens the rest; `dim` lays a veil of the paper over the
 * rest; `circle` draws a teacher's marker loop round the named thing as the voice names it (it draws itself in under
 * half a second at each key, round each named thing in turn, and is gone at a "wide" key; the theme's palette.marker,
 * else a bright pink); `none`. A list composes them in order — ["camera", "dim"] moves the camera and veils the rest
 * of its view; ["camera", "circle"] frames the thing and circles it.
 * A film has one camera: a moving focus and the director's push notes refuse each other, and the recipe's camera
 * moves (camerawork.mjs) take turns with a moving focus — never both at once; the camera's view is the outer lens,
 * so it frames whatever the focus has framed.
 * A focus that does not move the camera eases its veil or its loop on a spring (motion.mjs · FEELS; `feel`); a camera
 * focus takes no feel: its pace is the planner's. Emphasis (EMPHASIS): `pop` lands the words big on their beat, then settles them
 * into a label in the top corner until the next words; `corner` is the label only; `label` sits the words on the
 * thing in focus (above its top-left corner, travelling with the camera), or at the top middle with no focus, gliding
 * between the two as the focus comes and goes; `none`.
 *
 * A strategy of your own has the same shape, passed to compileFilm (and makeFilm) as
 * `strategies: {focus: {name: {show(ctx, view, paint, theme)}}, emphasis: {name: {draw(ctx, t, word, theme)}}}`:
 * view = {cx, cy, z, sx, sy, box, w, on, thing, since} (the point framed, the zoom, where on the frame it sits, the
 * named thing's box as the focus eases to it, how focused, 0–1; the current key's thing — its name ("wide" too), its
 * box as it is at the key, not eased — and the seconds since that key; before the first key, on and thing null). `safe` ([x0, y0, x1, y1] on the 1600×900 frame) is where a framed thing may sit — a film with
 * burned-in captions keeps it above them ([0, 0, 1600, 700]); it is centred there and sized to it.
 */
import {frameZoom} from 'footprint-story/layout';
import {CAMERA_CRITICS} from 'footprint-story/shot';
import {FRAMINGS} from './notes.mjs';
import {track, pop, readFeel} from './motion.mjs';
import {planFlights, viewAt as flightViewAt, movingOf, flightSeconds, WIDE_VIEW, REEL_FLIGHT_CRITICS} from './flight/steps.mjs';
import {flightRunOf} from './flight/run.mjs';
import {inOut as ease} from './ease.mjs';
import {rgba, isHex} from './colour.mjs';

const W = 1600, H = 900;
const FOCUS_KEYS = ['strategy', 'feel', 'keys', 'safe'], KEY_KEYS = ['at', 'on', 'size'];
/** What a key of a focus that moves the camera may say besides: how its shot is reached (`do`, `seconds`) and the critics it accepts. */
const FLIGHT_WORDS = ['do', 'seconds', 'accept'];
/** How a key's shot is reached: footprint-story plans a fly; a cut is the key's own. */
export const FLIGHT_DOS = Object.freeze(['fly', 'cut']);
/** The critics a key may accept: footprint-story's camera critics and the reel's own. */
export const FLIGHT_CRITICS = Object.freeze([...CAMERA_CRITICS, ...REEL_FLIGHT_CRITICS]);
const EMPHASIS_KEYS = ['strategy', 'feel', 'words'], WORD_KEYS = ['at', 'text', 'until'];
const clamp01 = v => Math.max(0, Math.min(1, v));

/** A hex colour at an alpha, for a veil (colour.mjs · rgba); anything else, the paper theme's bg. */
const withAlphaOf = (color, a) => rgba(isHex(color) ? color : '#f3eee3', a);
/** Everything but the named thing (with a margin), under a colour, as strong as the view is focused. */
function veil(ctx, v, color) {
  if (!(v.w > .01)) return;
  const m = 18, feather = 54, steps = 6, base = ctx.globalAlpha * clamp01(v.w);
  // Bands around the named thing, plain rectangles (a reader of the picture sees which words they cover): the far
  // ones at full strength, then a soft edge of thin rings fading to nothing at the thing — no hard-edged hole.
  const around = ([x0, y0, x1, y1], [X0, Y0, X1, Y1]) => {   // the ring between an inner and an outer rectangle
    ctx.fillRect(X0, Y0, X1 - X0, Math.max(0, y0 - Y0)); ctx.fillRect(X0, y1, X1 - X0, Math.max(0, Y1 - y1));
    ctx.fillRect(X0, y0, Math.max(0, x0 - X0), y1 - y0); ctx.fillRect(x1, y0, Math.max(0, X1 - x1), y1 - y0);
  };
  const grow = d => [v.box[0] - m - d, v.box[1] - m - d, v.box[2] + m + d, v.box[3] + m + d];
  ctx.save(); ctx.fillStyle = color;
  ctx.globalAlpha = base; around(grow(feather), [Math.min(0, grow(feather)[0]), Math.min(0, grow(feather)[1]), Math.max(W, grow(feather)[2]), Math.max(H, grow(feather)[3])]);
  for (let i = 0; i < steps; i++) { ctx.globalAlpha = base * (i + .5) / steps; around(grow(feather * i / steps), grow(feather * (i + 1) / steps)); }
  ctx.restore();
}

/** The marker loop's timing and size: drawn in DRAW s from its key, MARGIN px clear of the thing, WIDTH px thick. */
export const LOOP = Object.freeze({draw: .45, margin: 24, width: 7});
/**
 * A teacher's marker loop round the thing in focus: a loose hand-drawn ring that starts at its top left and goes a
 * little past where it began, drawing itself over LOOP.draw seconds from each key (its drawing is its entrance: it does
 * not wait for the focus to ease in). None at a "wide" key or before the first. (Drawn the same every time: no
 * randomness, so a kept piece stays true.)
 */
function markerLoop(ctx, v, theme) {
  if (!v.on || v.on === 'wide' || !(v.since >= 0)) return;
  const drawn = ease(clamp01(v.since / LOOP.draw)), [x0, y0, x1, y1] = v.thing;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 + LOOP.margin, ry = (y1 - y0) / 2 + LOOP.margin;
  const steps = Math.max(2, Math.ceil(64 * drawn)), sweep = Math.PI * 2 * 1.08 * drawn, from = -2.4;
  ctx.save(); ctx.strokeStyle = theme?.palette?.marker ?? '#e8467c'; ctx.lineWidth = LOOP.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let k = 0; k <= steps; k++) {
    const a = from + sweep * k / steps, grow = 1 + .04 * k / steps + Math.sin(a * 2 + 1.3) * .015, x = cx + Math.cos(a) * rx * grow, y = cy + Math.sin(a) * ry * grow;
    if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.stroke(); ctx.restore();
}

/** The focus strategies: how a frame shows what the voice is about. */
export const FOCUS = Object.freeze({
  camera: Object.freeze({name: 'camera', moves: true, show(ctx, v, paint) {
    ctx.save(); ctx.translate(v.sx, v.sy); ctx.scale(v.z, v.z); ctx.translate(-v.cx, -v.cy); paint(ctx); ctx.restore();
  }}),
  spotlight: Object.freeze({name: 'spotlight', show(ctx, v, paint) { paint(ctx); veil(ctx, v, 'rgba(18, 16, 26, .58)'); }}),
  dim: Object.freeze({name: 'dim', show(ctx, v, paint, theme) { paint(ctx); veil(ctx, v, withAlphaOf(theme?.palette?.bg, .62)); }}),
  circle: Object.freeze({name: 'circle', show(ctx, v, paint, theme) { paint(ctx); markerLoop(ctx, v, theme); }}),
  none: Object.freeze({name: 'none', show(ctx, v, paint) { paint(ctx); }}),
});

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
/** A word's label in the top corner: ink ground, paper letters (also an example scene's label: film/labels.mjs · exampleLabel). */
export function chip(ctx, text, alpha, theme, {x = 40, y = 26, k = 1, right = null} = {}) {
  const ink = theme?.palette?.ink ?? '#23211c', bg = theme?.palette?.bg ?? '#f3eee3', font = theme?.type?.sans ?? SANS;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.font = `800 24px ${font}`;
  const w = ctx.measureText(text).width + 32;
  if (right !== null) x = right - w;   // set against a right edge instead (an example scene's label, top right)
  ctx.translate(x + w / 2, y + 20); ctx.scale(k, k); ctx.translate(-(x + w / 2), -(y + 20));
  ctx.fillStyle = ink; ctx.beginPath(); ctx.roundRect(x, y, w, 40, 20); ctx.fill();
  ctx.fillStyle = bg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(text, x + 16, y + 21);
  ctx.restore();
  return w;
}
const GRAPHEMES = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
/** How wide a chip of these words is. */
export function chipWidth(ctx, text, theme) {
  ctx.save(); ctx.font = `800 24px ${theme?.type?.sans ?? SANS}`;
  const w = ctx.measureText(text).width + 32;
  ctx.restore();
  return w;
}
/**
 * A label's words as chips that fit `most` px across: one line when it fits, else broken between words, and a word too
 * wide for a chip of its own (a script written without spaces, a long compound) broken between its graphemes.
 */
export function chipLines(ctx, text, theme, most) {
  const fits = line => chipWidth(ctx, line, theme) <= most, lines = [''];
  const add = (piece, gap) => {
    const longer = lines.at(-1) ? `${lines.at(-1)}${gap}${piece}` : piece;
    if (lines.at(-1) && !fits(longer)) lines.push(piece); else lines[lines.length - 1] = longer;
  };
  for (const word of text.split(' ')) {
    if (fits(word)) { add(word, ' '); continue; }
    if (lines.at(-1)) lines.push('');
    for (const {segment} of GRAPHEMES.segment(word)) add(segment, '');
  }
  return lines;
}
/** Where a box in the picture lands on the frame, through the focus view (the camera), or as it is without one. */
const onFrame = (box, v) => !v ? box : [(box[0] - v.cx) * v.z + v.sx, (box[1] - v.cy) * v.z + v.sy, (box[2] - v.cx) * v.z + v.sx, (box[3] - v.cy) * v.z + v.sy];
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
  label: Object.freeze({name: 'label', draw(ctx, t, word, theme, view) {
    // The words sit on the thing the voice is about (the focus), just above its top-left corner, and travel with it;
    // with nothing in focus they sit at the top of the frame, in the middle — and glide between the two as the focus
    // comes and goes (by how focused the view is), never jumping.
    const a = clamp01((t - word.t) / .25) * (1 - clamp01((t - (word.next - .25)) / .25)); if (!(a > 0)) return;
    const font = theme?.type?.sans ?? SANS; ctx.save(); ctx.font = `800 24px ${font}`; const w = ctx.measureText(word.text).width + 32; ctx.restore();
    const home = [W / 2 - w / 2, 20], f = view ? ease(clamp01((view.w - .2) / .6)) : 0;
    const on = f > 0 ? onFrame(view.box, view) : null;
    const spot = on ? [Math.max(16, Math.min(W - w - 16, on[0])), Math.max(12, Math.min(H - 64, on[1] - 52))] : home;
    chip(ctx, word.text, a, theme, {x: home[0] + (spot[0] - home[0]) * f, y: home[1] + (spot[1] - home[1]) * f, k: .7 + .3 * clamp01(pop(t, word.t, 'snappy'))});
  }}),
  corner: Object.freeze({name: 'corner', draw(ctx, t, word, theme) { chip(ctx, word.text, clamp01((t - word.t) / .25) * (1 - clamp01((t - (word.next - .25)) / .25)), theme); }}),
  none: Object.freeze({name: 'none', draw() {}}),
});

function pick(kind, name, builtIn, mine, needs) {
  const all = {...builtIn, ...(mine ?? {})};
  if (typeof name !== 'string' || !all[name]) throw new Error(`${kind}.strategy must be ${Object.keys(all).map(n => `"${n}"`).join(', ')} (a strategy of your own goes in compileFilm's strategies.${kind}), not ${JSON.stringify(name)}`);
  if (typeof all[name][needs] !== 'function') throw new Error(`${kind} strategy "${name}" must have ${needs}(…)`);
  // A strategy of your own is code the film draws with: its function's text is what a cached piece's key holds of it
  // (segments/material.mjs). What it calls or imports is in no key — the render's line says so — so keep a strategy
  // self-contained, or render with whole: true after changing what it uses.
  const custom = Boolean(mine && Object.hasOwn(mine, name));
  return {...all[name], name, ...(custom ? {code: String(all[name][needs])} : {})};
}
/** The box round several boxes. */
const around = boxes => [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))];
const inOrder = (list, kind) => list.forEach((k, i) => { if (i && k.t < list[i - 1].t) throw new Error(`${kind}[${i}] comes before the one above it; list them in the order they are spoken`); });

/**
 * How a key frames the things it names (their boxes as drawn at the key): the box round them, centred in the safe area
 * at the zoom that makes it fill its framing's share, from 1× to 3× — footprint-story/layout · frameZoom, the rule
 * StoryDeck's cameras frame by too. A view {cx, cy, z, sx, sy, box, w}; the wide key is WIDE_VIEW.
 */
export function framedView(boxes, size, safe = [0, 0, W, H]) {
  const box = around(boxes), [x0, y0, x1, y1] = box;
  return {cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, z: frameZoom([x1 - x0, y1 - y0], [safe[2] - safe[0], safe[3] - safe[1]], {share: FRAMINGS[size], least: 1, most: 3}),
    sx: (safe[0] + safe[2]) / 2, sy: (safe[1] + safe[3]) / 2, box: [...box], w: 1};
}

/**
 * How long a camera focus takes to fly from one key to the next, as the film will plan it (flight/steps.mjs): a key is
 * {on (a name, names or "wide"), size?, t}, null the whole frame before any key. What the director spaces its keys by.
 */
export function keyFlightSeconds(from, to, named) {
  const view = k => (!k || k.on === 'wide' ? WIDE_VIEW : framedView([k.on].flat().map(n => named(n, k.t)), k.size ?? 'medium'));
  return flightSeconds(view(from), view(to));
}

/** The focus as written, checked and placed on the clock: {strategy, viewAt(t), show(ctx, t, paint), record}. */
function readFocus(spec, {clock, named, strategies, pushes, theme}) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('focus must be {strategy, keys: [{at, on, size?}], feel?}');
  for (const key of Object.keys(spec)) if (!FOCUS_KEYS.includes(key)) throw new Error(`focus has unsupported key ${key} (focus takes ${FOCUS_KEYS.join(', ')})`);
  const list = Array.isArray(spec.strategy) ? spec.strategy : [spec.strategy];
  if (!list.length) throw new Error('focus.strategy is a name, or a list of names applied in order (e.g. ["camera", "dim"])');
  const parts = list.map(name => pick('focus', name, FOCUS, strategies?.focus, 'show'));
  if (parts.filter(p => p.moves).length > 1) throw new Error(`focus.strategy lists ${parts.filter(p => p.moves).map(p => `"${p.name}"`).join(' and ')}: only one of them may move the camera`);
  const strategy = parts.length === 1 ? parts[0] : {name: parts.map(p => p.name).join('+'), moves: parts.some(p => p.moves),
    show: (ctx, v, paint, theme) => parts.reduceRight((inner, p) => c => p.show(c, v, inner, theme), paint)(ctx)};
  // A camera focus flies at the pace footprint-story plans (flight/steps.mjs): a spring's feel would be a second pace.
  if (strategy.moves && spec.feel !== undefined) throw new Error(`focus.feel: the focus "${strategy.name}" moves the camera, and the camera flies between its keys at the pace footprint-story's camera planner sets (footprint-story/shot · planCameraMove), so it takes no feel: leave feel out (a key's "seconds" gives one flight a length of its own)`);
  const feel = strategy.moves ? null : readFeel(spec.feel ?? 'heavy');
  const safe = spec.safe ?? [0, 0, W, H];
  if (!(Array.isArray(safe) && safe.length === 4 && safe.every(Number.isFinite) && safe[0] >= 0 && safe[1] >= 0 && safe[2] <= W && safe[3] <= H && safe[2] - safe[0] >= 200 && safe[3] - safe[1] >= 200))
    throw new Error('focus.safe is [x0, y0, x1, y1] on the 1600×900 frame, at least 200 × 200: where a framed thing may sit (e.g. [0, 0, 1600, 700] above burned-in captions)');
  if (strategy.moves && pushes.length) throw new Error(`focus "${strategy.name}" moves the camera, and the director's notes push it too: a film has one camera — leave the push notes out, or show the focus with "spotlight" or "dim"`);
  if (!Array.isArray(spec.keys) || !spec.keys.length) throw new Error('focus.keys is a list of {at: beat, on: a named thing or "wide", size?}');
  const keys = spec.keys.map((k, i) => {
    if (!k || typeof k !== 'object' || Array.isArray(k)) throw new Error(`focus.keys[${i}] must be {at, on, size?}`);
    for (const key of Object.keys(k)) {
      if (FLIGHT_WORDS.includes(key) && !strategy.moves) throw new Error(`focus.keys[${i}].${key}: the focus "${strategy.name}" does not move the camera, so no flight reaches its keys; ${key} belongs to a camera focus ("strategy": "camera")`);
      if (!KEY_KEYS.includes(key) && !FLIGHT_WORDS.includes(key)) throw new Error(`focus.keys[${i}] has unsupported key ${key} (a key is {at, on, size?${strategy.moves ? ', do?, seconds?, accept?' : ''}})`);
    }
    const flight = strategy.moves ? readFlight(k, `focus.keys[${i}]`) : null;
    const names = Array.isArray(k.on) ? k.on : [k.on];
    if (!names.length || !names.every(n => typeof n === 'string' && n)) throw new Error(`focus.keys[${i}].on names a thing in the picture (a kit names things in regionsAt), several of them (a list: the box round all of them), or "wide"`);
    if (Array.isArray(k.on) && names.includes('wide')) throw new Error(`focus.keys[${i}].on lists "wide", which is the whole frame, not a thing: write "on": "wide" alone, or list the things to frame`);
    const on = names.length === 1 ? names[0] : [...names];   // a list of one is its one name
    const t = clock.at(k.at);
    if (on === 'wide') { if (k.size !== undefined) throw new Error(`focus.keys[${i}]: "wide" is the whole frame; leave the size out`); return {t, on: 'wide', ...WIDE_VIEW, box: [...WIDE_VIEW.box], flight, things: []}; }
    const size = k.size ?? 'medium';
    if (!Object.hasOwn(FRAMINGS, size)) throw new Error(`focus.keys[${i}].size is ${Object.keys(FRAMINGS).join(', ')} (how much of the frame "${names.join('" + "')}" fills), not ${JSON.stringify(size)}`);
    let boxes; try { boxes = names.map(n => named(n, t)); } catch (e) { throw new Error(`focus.keys[${i}]: ${e.message}`, {cause: e}); }
    return {t, on, size, ...framedView(boxes, size, safe), flight, things: names.map((name, n) => ({name, box: [...boxes[n]]}))};
  });
  inOrder(keys, 'focus.keys');
  const key = t => keys.findLast(k => t >= k.t);
  const held = (v, t) => { const k = key(t); return {...v, on: k?.on ?? null, thing: k ? k.box : null, since: k ? t - k.t : null}; };
  let viewAt, moving = [], flights = null, run = null;
  if (strategy.moves) {
    // Each key a shot; the flight between two shots is footprint-story's (flight/steps.mjs), the same steps the check runs.
    const shots = keys.map((k, i) => ({path: `focus.keys[${i}]`, t: k.t, on: k.on === 'wide' ? [] : [k.on].flat(), view: {cx: k.cx, cy: k.cy, z: k.z, sx: k.sx, sy: k.sy, box: [...k.box], w: k.w},
      do: k.flight.do, seconds: k.flight.seconds, accept: k.flight.accept, things: k.things}));
    flights = planFlights({shots});
    run = Object.freeze({name: 'focus', kit: strategy.name, run: flightRunOf({shots}, flights), findings: flights.findings});
    /** Where the focus is at t: the flight's camera (kept covering the frame), its veil's box and how focused, the key it is on. */
    viewAt = t => held(flightViewAt(flights.flights, t), t);
    // While it moves the camera: from each key until its flight arrives (the camera's moves take turns with it: camerawork.mjs).
    moving = movingOf(flights.flights).map(m => ({...m, on: [keys[m.key].on].flat().join('" + "')}));
  } else {
    const along = pick => [[0, pick({cx: W / 2, cy: H / 2, z: 1, sx: W / 2, sy: H / 2, box: [0, 0, W, H], w: 0})], ...keys.map(k => [k.t, pick(k)])];
    const tracks = {cx: along(k => k.cx), cy: along(k => k.cy), z: along(k => k.z), sx: along(k => k.sx), sy: along(k => k.sy), w: along(k => k.w), box: [0, 1, 2, 3].map(i => along(k => k.box[i]))};
    /** Where the focus is at t, on its springs (it moves no camera, so only its veil, its loop and a label read it). */
    viewAt = t => {
      const z = Math.max(1, track(t, tracks.z, feel)), sx = track(t, tracks.sx, feel), sy = track(t, tracks.sy, feel);
      return held({cx: Math.min(W - (W - sx) / z, Math.max(sx / z, track(t, tracks.cx, feel))), cy: Math.min(H - (H - sy) / z, Math.max(sy / z, track(t, tracks.cy, feel))), z, sx, sy,
        box: tracks.box.map(b => track(t, b, feel)), w: clamp01(track(t, tracks.w, feel))}, t);
    };
  }
  const flightOf = i => flights?.[`flight-${i}`] ?? null;
  return {strategy: strategy.name, moves: Boolean(strategy.moves), moving, viewAt, show: (ctx, t, paint) => strategy.show(ctx, viewAt(t), paint, theme), ...(run ? {run} : {}),
    record: {strategy: strategy.name, ...(spec.safe ? {safe} : {}), keys: keys.map((k, i) => ({t: +k.t.toFixed(3), on: k.on, ...(k.size ? {size: k.size} : {}), ...(flightOf(i) ? {flight: flightSummary(flightOf(i), k.flight)} : {})}))},
    // Each key as it frames the picture (where the camera points, how close, the box it holds, and how its flight goes):
    // what a cached piece's key holds.
    frames: {strategy: strategy.name, ...(feel ? {feel} : {}), safe, ...(parts.some(p => p.code) ? {code: parts.map(p => p.code ?? p.name)} : {}),
      keys: keys.map((k, i) => ({t: k.t, on: k.on, size: k.size ?? null, cx: k.cx, cy: k.cy, z: k.z, sx: k.sx, sy: k.sy, box: [...k.box], w: k.w,
        ...(flightOf(i) ? {flight: flightFrame(flights.flights[i])} : {})}))}};
}

/**
 * A key's flight as a cached piece's key holds it: how it goes, how long, and where it sets off from (the view on
 * screen as its key lands — which an earlier key, or one cutting it short, decides: a piece drawn mid-flight changes
 * with them).
 */
const flightFrame = f => ({kind: f.kind, seconds: f.seconds, from: [f.from.cx, f.from.cy, f.from.z, f.from.sx, f.from.sy], ...(f.cutShort ? {cutShort: f.cutShort.after} : {})});

/** What the film's record keeps of a key's flight: how it was reached and why (footprint-story's reason), its seconds and what set them. */
const flightSummary = (f, asked) => ({kind: f.kind, rule: f.rule, seconds: f.seconds, ...(f.limitedBy ? {limitedBy: f.limitedBy} : {}), reason: f.reason,
  ...(f.cutShort ? {cutShort: f.cutShort} : {}), ...(asked.accept.length ? {accepted: [...asked.accept]} : {})});

/** A camera focus key's flight words: {do, seconds (or null), accept}, each checked, naming the key. */
function readFlight(k, where) {
  const how = k.do ?? 'fly';
  if (how === 'orbit') throw new Error(`${where}.do: "orbit" circles the subject in 3D (footprint-story/shot), and a picture here is drawn flat, seen from the front, so it cannot be drawn from round its side: fly ("do": "fly", or leave do out) or cut; for depth in a world with layers, the camera list's "orbit" slides them`);
  if (!FLIGHT_DOS.includes(how)) throw new Error(`${where}.do is ${FLIGHT_DOS.map(d => `"${d}"`).join(' or ')} (how the camera reaches this shot: "fly", the default, is planned by footprint-story; "cut" is there at once), not ${JSON.stringify(k.do)}`);
  if (k.seconds !== undefined && how === 'cut') throw new Error(`${where}: a cut takes no time, so it takes no seconds: leave seconds out, or fly ("do": "fly")`);
  if (k.seconds !== undefined && !(typeof k.seconds === 'number' && k.seconds >= .2 && k.seconds <= 60)) throw new Error(`${where}.seconds is how long the flight to this shot takes, a number from 0.2 to 60 (left out, footprint-story's camera planner sets it), not ${JSON.stringify(k.seconds)}`);
  const accept = k.accept ?? [];
  if (!Array.isArray(accept) || !accept.every(c => FLIGHT_CRITICS.includes(c)) || new Set(accept).size !== accept.length) throw new Error(`${where}.accept lists the critics this flight keeps as written, each once: ${FLIGHT_CRITICS.join(', ')} (not ${JSON.stringify(k.accept)})`);
  return {do: how, seconds: k.seconds ?? null, accept: [...accept]};
}

/** The emphasis as written, checked and placed on the clock: {strategy, draw(ctx, t), record}. */
function readEmphasis(spec, {clock, strategies, theme, focus = null}) {
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
  return {strategy: strategy.name, draw(ctx, t) { const w = words.findLast(x => t >= x.t); if (w && t < w.next) strategy.draw(ctx, t, w, theme, focus?.viewAt(t) ?? null); },
    record: {strategy: strategy.name, words: words.map(w => ({t: +w.t.toFixed(3), text: w.text}))},
    frames: {strategy: strategy.name, feel, ...(strategy.code ? {code: strategy.code} : {}), words: words.map(w => ({t: w.t, text: w.text, next: w.next}))}};
}

/**
 * A film's attention, read from its recipe (`focus`, `emphasis`), or null when it has neither. named(name, t) is
 * the film's box of a named thing; pushes, the director's pushes (a camera focus and a push cannot share the camera).
 */
export function readAttention(recipe, {clock, named, strategies = null, pushes = [], theme = null}) {
  if (strategies !== null && (typeof strategies !== 'object' || Array.isArray(strategies))) throw new Error('strategies is {focus?: {name: strategy}, emphasis?: {name: strategy}}');
  const focus = recipe.focus === undefined ? null : readFocus(recipe.focus, {clock, named, strategies, pushes, theme});
  const emphasis = recipe.emphasis === undefined ? null : readEmphasis(recipe.emphasis, {clock, strategies, theme, focus});
  if (!focus && !emphasis) return null;
  return {focus, emphasis, record: {...(focus ? {focus: focus.record} : {}), ...(emphasis ? {emphasis: emphasis.record} : {})},
    frames: {focus: focus?.frames ?? null, emphasis: emphasis?.frames ?? null}};
}
