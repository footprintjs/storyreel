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
 *   match      through · match     through a thing in the old picture (a window, a screen) into the new one;
 *                                  a thing in the old picture becomes the same thing in the new one
 *
 * A kit adds its own, as Final Cut takes Motion templates and Premiere takes .mogrt files:
 * `{name, transitions: {swirl: {family, seconds, ease, sound, params, regions?, draw}}}`. Every transition
 * draws through one contract, `draw(ctx, {e, from, to, p, ghost, theme, boxes})`:
 *   e      how far the change has come, 0..1, already eased
 *   from   from(c) draws the leaving picture into c, to(c) the arriving one (the 1600×900 frame through
 *   to     c's transform; draw each one at most a few times — it is a whole picture)
 *   p      the settings, checked, with the defaults filled in
 *   ghost  ghost(alpha, paint): paint(c) into a scratch picture, laid over ctx at that alpha (a picture
 *          drawn see-through must be drawn whole first; canvas alpha on its parts would show the seams)
 *   theme  the film's theme (its palette: the page turn's paper)
 *   boxes  {from: {name: box}, to: {name: box}}: where the things the transition names are, [x0, y0, x1, y1]
 *          on the frame — the leaving picture's at the change's first moment, the arriving one's at its
 *          last, found once when the film is built. A transition says which names it looks for with
 *          regions(p) → {from?: [names], to?: [names]} (a name is a thing a kit names: regionsAt → {box,
 *          name}); a name the picture does not have refuses then, naming the ones it has.
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
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const centreOf = ([x0, y0, x1, y1]) => [(x0 + x1) / 2, (y0 + y1) / 2];
const sizeOf = ([x0, y0, x1, y1]) => Math.sqrt((x1 - x0) * (y1 - y0));
const lerp = (a, b, u) => a + (b - a) * u;

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

/**
 * Through: the camera goes through a thing in the old picture — a window, a screen, a doorway — and the new
 * picture is what was inside it. The new picture sits in the opening, fitted to cover it; the camera zooms
 * about the one point that zoom leaves still, until the new picture fills the frame; near the end the
 * opening widens to the frame's edges, so the last frame is the new picture exactly.
 */
function throughPlan(box) {
  const [x0, y0, x1, y1] = [clamp(box[0], 0, W), clamp(box[1], 0, H), clamp(box[2], 0, W), clamp(box[3], 0, H)];
  const c = Math.max((x1 - x0) / W, (y1 - y0) / H);
  // An opening about the frame's own size: nothing to zoom through, only the opening to widen.
  if (c >= .98) return {opening: [x0, y0, x1, y1], fit: [0, 0, W, H], zoom: 1, still: null};
  // The new picture, fitted to cover the opening and kept on the frame (so the zoom never uncovers an edge).
  const rw = W * c, rh = H * c;
  const rx = clamp((x0 + x1 - rw) / 2, Math.max(0, x1 - rw), Math.min(x0, W - rw)), ry = clamp((y0 + y1 - rh) / 2, Math.max(0, y1 - rh), Math.min(y0, H - rh));
  return {opening: [x0, y0, x1, y1], fit: [rx, ry, rw, rh], zoom: 1 / c, still: [rx / (1 - c), ry / (1 - c)]};
}
function goThrough(ctx, {e, from, to, p, ghost, boxes}) {
  const {opening, fit, zoom, still} = throughPlan(boxes.from[p.region]), s = Math.pow(zoom, e);
  const at = (v, k) => (still ? still[k] + s * (v - still[k]) : v);   // a frame coordinate (k: 0 for x, 1 for y), zoomed
  if (still) scaled(ctx, still, s, from); else from(ctx);
  // The opening, zoomed; near the end it widens until it holds the whole frame (a round one, until the frame's corners are inside it).
  const open = smooth(.55, 1, e), round = p.shape === 'round', grow = round ? Math.SQRT2 * 1.02 : 1;
  const [zx0, zy0, zx1, zy1] = [at(opening[0], 0), at(opening[1], 1), at(opening[2], 0), at(opening[3], 1)];
  const cx = lerp((zx0 + zx1) / 2, W / 2, open), cy = lerp((zy0 + zy1) / 2, H / 2, open), hw = lerp((zx1 - zx0) / 2, W / 2 * grow, open), hh = lerp((zy1 - zy0) / 2, H / 2 * grow, open);
  if (e > 0) ghost(Math.min(1, e / .25), c => {
    c.save(); c.beginPath();
    if (round) c.ellipse(cx, cy, Math.max(.01, hw), Math.max(.01, hh), 0, 0, Math.PI * 2); else c.rect(cx - hw, cy - hh, 2 * hw, 2 * hh);
    c.clip();
    c.translate(at(fit[0], 0), at(fit[1], 1)); c.scale(s * fit[2] / W, s * fit[2] / W); to(c); c.restore();
  });
}

/**
 * Match: a thing in the old picture becomes the same thing in the new one — a ring, a window, a face. The old
 * picture pushes in on its thing while the new one pulls back from its own, and the two things meet (the same
 * place, half way between them; the same size: at least 1.3 times the larger) at a quick dissolve in the
 * middle, the moment the motion is fastest. Each picture's camera only ever zooms in and stays on the frame, so
 * the frame is always covered — which is why things far apart meet larger: a camera must zoom in far enough
 * to carry its thing to the meeting point without uncovering an edge. The last frame is the new picture exactly.
 */
function meetingSize(box, meet) {
  // The least zoom that lets this picture's thing sit at the meeting point with the picture still covering the frame.
  const [cx, cy] = centreOf(box), least = (m, c, span) => Math.max(c > 0 ? m / c : 1, c < span ? (span - m) / (span - c) : 1);
  return sizeOf(box) * Math.max(1, least(meet[0], cx, W), least(meet[1], cy, H));
}
function matchCamera(box, meet, scale, k) {
  // The thing's centre travels from where it is (k = 0) to the meeting point (k = 1) while the picture
  // zooms by scale^k about it; the picture's offset is kept so it still covers the frame.
  const [cx, cy] = centreOf(box), z = Math.pow(scale, k), px = cx + (meet[0] - cx) * k, py = cy + (meet[1] - cy) * k;
  return {z, ox: clamp(px - z * cx, W - z * W, 0), oy: clamp(py - z * cy, H - z * H, 0)};
}
const drawWith = (ctx, {z, ox, oy}, paint) => { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); ctx.translate(ox, oy); ctx.scale(z, z); paint(ctx); ctx.restore(); };
function matchCut(ctx, {e, from, to, p, ghost, boxes}) {
  const a = boxes.from[p.region], b = boxes.to[p.into ?? p.region], [ax, ay] = centreOf(a), [bx, by] = centreOf(b);
  const meet = [clamp((ax + bx) / 2, 0, W), clamp((ay + by) / 2, 0, H)], size = Math.max(1.3 * Math.max(sizeOf(a), sizeOf(b)), meetingSize(a, meet), meetingSize(b, meet));
  const leaving = matchCamera(a, meet, size / sizeOf(a), e / .5), arriving = matchCamera(b, meet, size / sizeOf(b), (1 - e) / .5);
  const shown = smooth(.35, .65, e);   // how much of the new picture shows: the dissolve, around the meeting
  if (e < .5) { drawWith(ctx, leaving, from); if (shown > 0) ghost(shown, c => drawWith(c, arriving, to)); }
  else { drawWith(ctx, arriving, to); if (shown < 1) ghost(1 - shown, c => drawWith(c, leaving, from)); }
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
  through: {family: 'match', seconds: 1.2, ease: 'inOut', sound: 'whoosh', params: {region: {name: true}, shape: {oneOf: ['box', 'round'], default: 'box'}}, regions: p => ({from: [p.region]}), draw: goThrough},
  match: {family: 'match', seconds: 1, ease: 'inOut', sound: null, params: {region: {name: true}, into: {name: true, default: null}}, regions: p => ({from: [p.region], to: [p.into ?? p.region]}), draw: matchCut},
});
export const TRANSITION_NAMES = Object.freeze(Object.keys(TRANSITIONS));
const COMMON = ['type', 'seconds', 'ease', 'sound'];
const DEF_KEYS = ['family', 'seconds', 'ease', 'sound', 'overshoot', 'params', 'regions', 'draw'];

/** A hard cut: the new shot is there, whole, on the scene's first frame. */
export const CUT = Object.freeze({type: 'cut', seconds: 0, lead: 0, sound: null, p: Object.freeze({}), at: Object.freeze([800, 450])});

/**
 * A shot's entrance, read from the recipe: a transition's name, or {type, seconds?, ease?, sound?, …its
 * settings}; left out, a fade. Returns {type, seconds, lead, ease, sound, p, draw, regions, at}; a cut is CUT.
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
  return {type: e.type, seconds, lead: seconds * .75, ease, sound, p, draw: tr.draw, regions: tr.regions ?? null, at: p.at ?? [800, 450]};
}

/** A transition's settings from an entrance, each checked against its kind, the defaults filled in. */
function readParams(params, e, where) {
  const out = {};
  for (const [name, spec] of Object.entries(params)) {
    const v = e[name] ?? spec.default, bad = what => new Error(`${where}: enter.${name} must be ${what}`);
    if (spec.name && v === undefined) throw new Error(`${where}: a ${e.type} needs enter.${name}: the name of a thing in the picture (a kit names what it draws: regionsAt → {box, path, name})`);
    if (spec.name && v !== null && !(typeof v === 'string' && v.trim())) throw bad('the name of a thing in the picture');
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
  if (typeof def.draw !== 'function') throw new Error(`${who} needs draw(ctx, {e, from, to, p, ghost, theme, boxes})`);
  if (!(typeof def.seconds === 'number' && def.seconds >= .2 && def.seconds <= 3)) throw new Error(`${who}: seconds must be between 0.2 and 3`);
  easeNamed(def.ease, `${who}: ease`);
  if (def.sound !== null && !SOUND_NAMES.includes(def.sound)) throw new Error(`${who}: sound must be null or a sound: ${SOUND_NAMES.join(', ')}`);
  if (def.overshoot !== undefined && typeof def.overshoot !== 'boolean') throw new Error(`${who}: overshoot must be true or false`);
  if (def.regions !== undefined && typeof def.regions !== 'function') throw new Error(`${who}: regions must be p => ({from?: [names], to?: [names]}): the things it looks for in the picture it leaves and the one it arrives at`);
  const params = def.params ?? {};
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error(`${who}: params must be {name: {oneOf | point | color | number, default}}`);
  for (const [name, spec] of Object.entries(params)) {
    if (COMMON.includes(name)) throw new Error(`${who}: a setting may not be called "${name}" (every entrance has it)`);
    const kinds = ['oneOf', 'point', 'color', 'number', 'name'].filter(k => spec?.[k] !== undefined);
    if (kinds.length !== 1 || !(spec.name === true || 'default' in spec)) throw new Error(`${who}: the setting "${name}" must be one of {oneOf: [...]}, {point: true}, {color: true}, {number: [min, max]}, with a default; or {name: true} (a thing in the picture; default: null when it may be left out)`);
    if (spec.oneOf && !(Array.isArray(spec.oneOf) && spec.oneOf.length && spec.oneOf.every(v => typeof v === 'string'))) throw new Error(`${who}: the setting "${name}" lists its choices as words`);
    if (spec.number && !(Array.isArray(spec.number) && spec.number.length === 2 && spec.number.every(Number.isFinite) && spec.number[0] < spec.number[1])) throw new Error(`${who}: the setting "${name}" gives number as [min, max]`);
    if (!(spec.name && spec.default === undefined)) readParams({[name]: spec}, {type: 'transition'}, who);   // the default must pass its own check
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
