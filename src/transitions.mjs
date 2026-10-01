/**
 * Transitions: how one picture becomes the next when a shot enters. This is the collection a video
 * editor keeps (Premiere's Video Transitions, Final Cut's Transitions browser, DaVinci Resolve's Effects
 * library): many looks for the one behaviour, each with a family, a default length and a few settings,
 * chosen by name at the change of picture —
 *
 *   "enter": "push"                                         the default settings
 *   "enter": {"type": "push", "from": "left", "seconds": 0.5, "ease": "out", "sound": "whoosh"}
 *
 *   family     transitions
 *   cut        cut                 the new picture, whole, on the scene's first frame
 *   dissolve   fade · dip          a cross-fade; a dip through a colour (black by default)
 *   wipe       wipe · split · clock an edge crosses the frame; doors open from the middle; a clock hand sweeps
 *   iris       iris                a circle opens from a point
 *   motion     push · slide · whip the new picture pushes the old out; slides over it; a fast push that streaks
 *   zoom       zoom                the old picture rushes forward and fades while the new one settles
 *   page       page                the old picture is a page that lifts and turns over
 *
 * A kit adds its own, as Final Cut takes Motion templates and Premiere takes .mogrt files:
 * `{name, transitions: {swirl: {family, seconds, ease, sound, params, draw}}}`. Every transition draws
 * through one contract, `draw(ctx, {e, from, to, p, ghost, theme})`:
 *   e      how far the change has come, 0..1, already eased
 *   from   from(c) draws the leaving picture into c, to(c) the arriving one (the 1600×900 frame through
 *   to     c's transform; draw each one at most a few times — it is a whole picture)
 *   p      the settings, checked, with the defaults filled in
 *   ghost  ghost(alpha, paint): paint(c) into a scratch picture, laid over ctx at that alpha (a picture
 *          drawn see-through must be drawn whole first; canvas alpha on its parts would show the seams)
 *   theme  the film's theme (its palette: the page turn's paper)
 * A transition covers the whole frame at every e: the picture under it is not cleared to anything.
 * Every change happens on the film clock (most of it in the silence before the scene's first word:
 * `lead` = 0.75 of its seconds), so a frame is a pure function of time like any other.
 */
import {createCanvas} from '@napi-rs/canvas';
import {easeNamed} from './ease.mjs';
import {SOUND_NAMES} from './sound.mjs';

const W = 1600, H = 900;
const DIRECTIONS = Object.freeze(['left', 'right', 'top', 'bottom']);
/** Where a picture that comes FROM a side starts, as a unit offset. */
const FROM = {left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1]};
/** Eases that go past 1 on the way: only a transition that says it can show that takes them. */
const OVERSHOOTING = new Set(['back', 'spring']);
const SHADE = 'rgba(40,32,20,.22)', SHADE_CLEAR = 'rgba(40,32,20,0)', EDGE = 'rgba(40,32,20,.28)';

/** Clip to the frame moved by (x, y), with `grow` px more on every side (to close the seam under the next picture), and paint. */
function shifted(ctx, x, y, paint, grow = 0) {
  ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(-grow, -grow, W + 2 * grow, H + 2 * grow); ctx.clip(); paint(ctx); ctx.restore();
}
/** Paint scaled by s about (cx, cy), clipped to the frame. */
function scaled(ctx, [cx, cy], s, paint) {
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); paint(ctx); ctx.restore();
}
/** A soft shadow along a moving edge at `at` (an x, or a y when alongY), falling `depth` px toward +1 / -1. */
function edgeShade(ctx, at, toward, alongY, depth = 40, from = SHADE) {
  ctx.save();
  const g = alongY ? ctx.createLinearGradient(0, at, 0, at + toward * depth) : ctx.createLinearGradient(at, 0, at + toward * depth, 0);
  g.addColorStop(0, from); g.addColorStop(1, SHADE_CLEAR); ctx.fillStyle = g;
  if (alongY) ctx.fillRect(0, Math.min(at, at + toward * depth), W, depth); else ctx.fillRect(Math.min(at, at + toward * depth), 0, depth, H);
  ctx.restore();
}
const irisRadius = ([cx, cy]) => Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));

function fade(ctx, {e, from, to, ghost}) { from(ctx); ghost(e, to); }

function dip(ctx, {e, from, to, p}) {
  // Out to the colour by the middle, then in from it: the two pictures never show at once.
  (e < .5 ? from : to)(ctx);
  ctx.save(); ctx.globalAlpha *= Math.max(0, Math.min(1, e < .5 ? e * 2 : (1 - e) * 2)); ctx.fillStyle = p.color; ctx.fillRect(0, 0, W, H); ctx.restore();
}

function wipe(ctx, {e, from, to, p}) {
  from(ctx);
  const [dx, dy] = FROM[p.from], alongY = dy !== 0, span = alongY ? H : W;
  // The edge moves away from the side the new picture comes from; the shade falls on the old picture ahead of it.
  const edge = (dx || dy) < 0 ? span * e : span * (1 - e), toward = (dx || dy) < 0 ? 1 : -1;
  ctx.save(); ctx.beginPath();
  if (alongY) ctx.rect(0, toward > 0 ? 0 : edge, W, span * e); else ctx.rect(toward > 0 ? 0 : edge, 0, span * e, H);
  ctx.clip(); to(ctx); ctx.restore();
  edgeShade(ctx, edge, toward, alongY);
}

function split(ctx, {e, from, to, p}) {
  from(ctx);
  // A vertical line opens sideways; a horizontal one opens up and down.
  const alongY = p.line === 'horizontal', half = (alongY ? H : W) / 2, open = half * e;
  ctx.save(); ctx.beginPath();
  if (alongY) ctx.rect(0, half - open, W, open * 2); else ctx.rect(half - open, 0, open * 2, H);
  ctx.clip(); to(ctx); ctx.restore();
  edgeShade(ctx, half + open, 1, alongY); edgeShade(ctx, half - open, -1, alongY);
}

function clockWipe(ctx, {e, from, to}) {
  from(ctx);
  const R = Math.hypot(W / 2, H / 2) + 2, a0 = -Math.PI / 2, a1 = a0 + 2 * Math.PI * Math.max(0, Math.min(1, e));
  ctx.save(); ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, R, a0, a1); ctx.closePath(); ctx.clip(); to(ctx); ctx.restore();
  ctx.save(); ctx.strokeStyle = EDGE; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(W / 2 + R * Math.cos(a1), H / 2 + R * Math.sin(a1)); ctx.stroke(); ctx.restore();
}

function iris(ctx, {e, from, to, p}) {
  from(ctx);
  const [cx, cy] = p.at, r = e * irisRadius(p.at);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip(); to(ctx); ctx.restore();
  // The moving edge, softly shaded so the eye follows it.
  ctx.save(); ctx.strokeStyle = EDGE; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}

/** Both pictures move together: the new one comes from p.from, the old one leaves the other way. */
function pushPair(ctx, e, from, to, side) {
  const [dx, dy] = FROM[side];
  shifted(ctx, -dx * W * e, -dy * H * e, from, 2);
  shifted(ctx, dx * W * (1 - e), dy * H * (1 - e), to);
}
function push(ctx, {e, from, to, p}) { pushPair(ctx, e, from, to, p.from); }

function slide(ctx, {e, from, to, p}) {
  from(ctx);
  const [dx, dy] = FROM[p.from], x = dx * W * (1 - e), y = dy * H * (1 - e);
  // The arriving picture's leading edge casts a soft shadow on the one it covers.
  if (dx) edgeShade(ctx, dx > 0 ? x : x + W, dx > 0 ? -1 : 1, false, 36, 'rgba(30,20,10,.26)');
  else edgeShade(ctx, dy > 0 ? y : y + H, dy > 0 ? -1 : 1, true, 36, 'rgba(30,20,10,.26)');
  shifted(ctx, x, y, to);
}

/** A whip pan: a fast push, smeared along its move the way a camera turned quickly blurs (the smear is widest mid-move). */
const WHIP_SUBFRAMES = 6;
function whip(ctx, {e, from, to, p, ghost}) {
  const spread = .14 * 4 * e * (1 - e), at = i => Math.max(0, Math.min(1, e + spread * (i / (WHIP_SUBFRAMES - 1) - .5)));
  pushPair(ctx, at(0), from, to, p.from);
  if (spread < 1e-3) return;
  for (let i = 1; i < WHIP_SUBFRAMES; i++) ghost(1 / (i + 1), c => pushPair(c, at(i), from, to, p.from));
}

function zoom(ctx, {e, from, to, p, ghost}) {
  scaled(ctx, p.at, 1 + .25 * (1 - e), to);
  ghost(1 - e, c => scaled(c, p.at, 1 + .6 * e, from));
}

/**
 * A page turn: the old picture is a page lifting from its right edge and folding over to the left. Right
 * of the fold, the new picture is uncovered (in the lifting page's shadow); left of it, the page's back —
 * paper, darker at the fold; further left, what is still flat of the old page.
 */
function page(ctx, {e, from, to, theme}) {
  from(ctx);
  const f = W * (1 - e), back = Math.max(0, 2 * f - W), paperBack = theme?.palette?.card ?? theme?.palette?.bg ?? '#fffdf8';
  ctx.save(); ctx.beginPath(); ctx.rect(f, 0, W - f, H); ctx.clip(); to(ctx); ctx.restore();
  ctx.save();
  const shade = ctx.createLinearGradient(f, 0, f + 80, 0); shade.addColorStop(0, 'rgba(30,20,10,.3)'); shade.addColorStop(1, 'rgba(30,20,10,0)');
  ctx.fillStyle = shade; ctx.fillRect(f, 0, 80, H);
  if (f > back) {
    ctx.fillStyle = paperBack; ctx.fillRect(back, 0, f - back, H);
    const curl = ctx.createLinearGradient(back, 0, f, 0);
    curl.addColorStop(0, 'rgba(255,255,255,.35)'); curl.addColorStop(.7, 'rgba(60,40,20,.06)'); curl.addColorStop(1, 'rgba(60,40,20,.28)');
    ctx.fillStyle = curl; ctx.fillRect(back, 0, f - back, H);
    ctx.strokeStyle = 'rgba(60,40,20,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(back, 0); ctx.lineTo(back, H); ctx.stroke();
  }
  ctx.restore();
}

const side = fallback => ({oneOf: DIRECTIONS, default: fallback});
const centre = {point: true, default: [800, 450]};

/** The built-in collection, in the order a browser shows it. */
export const TRANSITIONS = deepFreeze({
  cut: {family: 'cut', seconds: 0, ease: 'jump', sound: null, params: {}, draw: null},
  fade: {family: 'dissolve', seconds: .8, ease: 'inOut', sound: null, params: {}, draw: fade},
  dip: {family: 'dissolve', seconds: 1, ease: 'inOut', sound: null, params: {color: {color: true, default: '#000000'}}, draw: dip},
  wipe: {family: 'wipe', seconds: .8, ease: 'inOut', sound: 'slide', params: {from: side('left')}, draw: wipe},
  split: {family: 'wipe', seconds: .8, ease: 'inOut', sound: 'slide', params: {line: {oneOf: ['vertical', 'horizontal'], default: 'vertical'}}, draw: split},
  clock: {family: 'wipe', seconds: .9, ease: 'inOut', sound: 'slide', params: {}, draw: clockWipe},
  iris: {family: 'iris', seconds: .8, ease: 'inOut', sound: 'slide', params: {at: centre}, draw: iris},
  push: {family: 'motion', seconds: .7, ease: 'inOut', sound: 'slide', params: {from: side('right')}, draw: push},
  slide: {family: 'motion', seconds: .7, ease: 'out', sound: 'slide', overshoot: true, params: {from: side('right')}, draw: slide},
  whip: {family: 'motion', seconds: .4, ease: 'inOut', sound: 'whoosh', params: {from: side('right')}, draw: whip},
  zoom: {family: 'zoom', seconds: .6, ease: 'inOut', sound: 'whoosh', params: {at: centre}, draw: zoom},
  page: {family: 'page', seconds: 1.1, ease: 'inOut', sound: 'slide', params: {}, draw: page},
});
export const TRANSITION_NAMES = Object.freeze(Object.keys(TRANSITIONS));
const COMMON = ['type', 'seconds', 'ease', 'sound'];
const DEF_KEYS = ['family', 'seconds', 'ease', 'sound', 'overshoot', 'params', 'draw'];

/** A hard cut: the new shot is there, whole, on the scene's first frame. */
export const CUT = Object.freeze({type: 'cut', seconds: 0, lead: 0, sound: null, p: Object.freeze({}), at: Object.freeze([800, 450])});

/**
 * A shot's entrance, read from the recipe: a transition's name, or {type, seconds?, ease?, sound?, …its
 * settings}; left out, a fade. Returns {type, seconds, lead, ease, sound, p, draw, at}; a cut is CUT.
 */
export function readEntrance(enter, where, catalog = TRANSITIONS) {
  const e = typeof enter === 'string' ? {type: enter} : enter ?? {type: 'fade'};
  if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.type !== 'string' || !Object.hasOwn(catalog, e.type)) {
    const named = typeof e === 'object' && e && typeof e.type === 'string' ? ` (not "${e.type}")` : '';
    throw new Error(`${where}: enter must be a transition: ${Object.keys(catalog).join(', ')}${named}`);
  }
  const tr = catalog[e.type], params = tr.params ?? {};
  if (e.type === 'cut') {
    if (Object.keys(e).length > 1) throw new Error(`${where}: a cut takes no seconds and no centre`);
    return CUT;
  }
  const allowed = [...COMMON, ...Object.keys(params)];
  for (const key of Object.keys(e)) if (!allowed.includes(key)) throw new Error(`${where}: enter has unsupported key ${key} (a ${e.type} takes ${allowed.slice(1).join(', ')})`);
  const seconds = e.seconds ?? tr.seconds;
  if (!(typeof seconds === 'number' && seconds >= .2 && seconds <= 3)) throw new Error(`${where}: enter.seconds must be between 0.2 and 3`);
  const easeName = e.ease ?? tr.ease, ease = easeNamed(easeName, `${where}: enter.ease`);
  if (OVERSHOOTING.has(easeName) && !tr.overshoot) throw new Error(`${where}: a ${e.type} cannot take the ease "${easeName}" (it goes past the end, and the frame's edge would show); ${Object.entries(catalog).filter(([, t]) => t.overshoot).map(([n]) => n).join(', ')} can`);
  const sound = e.sound === false ? null : e.sound ?? tr.sound;
  if (sound !== null && !SOUND_NAMES.includes(sound)) throw new Error(`${where}: enter.sound must be false or a sound: ${SOUND_NAMES.join(', ')} (not ${JSON.stringify(sound)})`);
  const p = readParams(params, e, where);
  // Most of the change happens in the silence before the scene's first word.
  return {type: e.type, seconds, lead: seconds * .75, ease, sound, p, draw: tr.draw, at: p.at ?? [800, 450]};
}

/** A transition's settings from an entrance, each checked against its kind, the defaults filled in. */
function readParams(params, e, where) {
  const out = {};
  for (const [name, spec] of Object.entries(params)) {
    const v = e[name] ?? spec.default, bad = what => new Error(`${where}: enter.${name} must be ${what}`);
    if (spec.oneOf && !spec.oneOf.includes(v)) throw bad(spec.oneOf.join(', '));
    if (spec.point && !(Array.isArray(v) && v.length === 2 && v.every(Number.isFinite))) throw bad('[x, y]');
    if (spec.color && !isColor(v)) throw bad('a hex colour such as "#000000"');
    if (spec.number && !(typeof v === 'number' && v >= spec.number[0] && v <= spec.number[1])) throw bad(`a number ${spec.number[0]}–${spec.number[1]}`);
    out[name] = Array.isArray(v) ? Object.freeze([...v]) : v;
  }
  return Object.freeze(out);
}
const isColor = v => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v);

/**
 * The film's collection: the built-in transitions and every kit's own (kit.transitions), each checked.
 * A kit may not reuse a built-in name or another kit's.
 */
export function transitionCatalog(kits = []) {
  const catalog = {...TRANSITIONS}, owner = {};
  for (const kit of kits) {
    if (kit.transitions === undefined) continue;
    if (!kit.transitions || typeof kit.transitions !== 'object' || Array.isArray(kit.transitions)) throw new Error(`The kit "${kit.name}" has transitions that are not {name: transition}`);
    for (const [name, def] of Object.entries(kit.transitions)) {
      const who = `the kit "${kit.name}"'s transition "${name}"`;
      if (Object.hasOwn(TRANSITIONS, name)) throw new Error(`${who} has a built-in transition's name; name it something else (the built-in ones are ${TRANSITION_NAMES.join(', ')})`);
      if (owner[name]) throw new Error(`${who}: the kit "${owner[name]}" already has a transition named "${name}"`);
      if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) throw new Error(`${who}: a transition's name is one word in camelCase (e.g. "swirl", "inkBleed")`);
      catalog[name] = checkTransition(def, who); owner[name] = kit.name;
    }
  }
  return catalog;
}

/** A kit's transition, checked: {family, seconds, ease, sound, overshoot?, params?, draw}. */
function checkTransition(def, who) {
  if (!def || typeof def !== 'object' || Array.isArray(def)) throw new Error(`${who} must be {family, seconds, ease, sound, params?, draw}`);
  for (const key of Object.keys(def)) if (!DEF_KEYS.includes(key)) throw new Error(`${who} has unsupported key ${key} (a transition has ${DEF_KEYS.join(', ')})`);
  if (typeof def.family !== 'string' || !def.family.trim()) throw new Error(`${who} needs a family (e.g. "wipe"; a browser groups by it)`);
  if (typeof def.draw !== 'function') throw new Error(`${who} needs draw(ctx, {e, from, to, p, ghost, theme})`);
  if (!(typeof def.seconds === 'number' && def.seconds >= .2 && def.seconds <= 3)) throw new Error(`${who}: seconds must be between 0.2 and 3`);
  easeNamed(def.ease, `${who}: ease`);
  if (def.sound !== null && !SOUND_NAMES.includes(def.sound)) throw new Error(`${who}: sound must be null or a sound: ${SOUND_NAMES.join(', ')}`);
  if (def.overshoot !== undefined && typeof def.overshoot !== 'boolean') throw new Error(`${who}: overshoot must be true or false`);
  const params = def.params ?? {};
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error(`${who}: params must be {name: {oneOf | point | color | number, default}}`);
  for (const [name, spec] of Object.entries(params)) {
    if (COMMON.includes(name)) throw new Error(`${who}: a setting may not be called "${name}" (every entrance has it)`);
    const kinds = ['oneOf', 'point', 'color', 'number'].filter(k => spec?.[k] !== undefined);
    if (kinds.length !== 1 || !('default' in spec)) throw new Error(`${who}: the setting "${name}" must be one of {oneOf: [...]}, {point: true}, {color: true}, {number: [min, max]}, with a default`);
    if (spec.oneOf && !(Array.isArray(spec.oneOf) && spec.oneOf.length && spec.oneOf.every(v => typeof v === 'string'))) throw new Error(`${who}: the setting "${name}" lists its choices as words`);
    if (spec.number && !(Array.isArray(spec.number) && spec.number.length === 2 && spec.number.every(Number.isFinite) && spec.number[0] < spec.number[1])) throw new Error(`${who}: the setting "${name}" gives number as [min, max]`);
    readParams({[name]: spec}, {}, who);   // the default must pass its own check
  }
  return Object.freeze({...def, params});
}

/**
 * A ghost painter: ghost(ctx, alpha, paint) paints paint(c) into a scratch picture the size of ctx's frame
 * in device pixels (ctx's scale, no move), then lays it over ctx at alpha — a see-through picture drawn
 * whole, at full resolution. One scratch picture per size and per level (a paint may ghost again).
 * ctx's transform must be a scale and a move (no rotation), as the film's always is.
 */
export function ghostPainter() {
  const layers = new Map(); let level = 0;
  return function ghost(ctx, alpha, paint) {
    const m = ctx.getTransform(), w = Math.ceil(W * Math.abs(m.a)), h = Math.ceil(H * Math.abs(m.d)), key = `${w}x${h}#${level}`;
    if (!layers.has(key)) layers.set(key, createCanvas(w, h));
    const layer = layers.get(key), lc = layer.getContext('2d');
    lc.resetTransform(); lc.clearRect(0, 0, layer.width, layer.height); lc.setTransform(m.a, 0, 0, m.d, 0, 0);
    level++;
    try { paint(lc); } finally { level--; }
    ctx.save(); ctx.globalAlpha *= alpha; ctx.setTransform(1, 0, 0, 1, m.e, m.f); ctx.drawImage(layer, 0, 0); ctx.restore();
  };
}

function deepFreeze(v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) deepFreeze(x); } return v; }
