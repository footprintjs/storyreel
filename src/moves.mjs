/**
 * Moves: a vocabulary of named motions, asked for by name — the way motion-reference libraries sort them, by
 * how a motion FEELS (smooth, crisp, soft, heavy, bouncy) and what it is FOR (ui, text, logo, character, 3d). A
 * move is DATA, never code: what kind of moment it is, how long it takes, the curve that drives it (an ease from
 * the table, or a spring feel) and which properties it animates, from what to what.
 *
 *   moveAt('soft-rise', t, {start})          → {opacity, x, y, scale, rotate, blur, clip, progress, mask}
 *   movesBy({feel: 'bouncy', use: 'logo'})   → the moves that feel bouncy and suit a logo
 *   stagger(words, 'text-reveal-word')       → each word's delay: 0.09 s apart
 *
 * The properties, and their rest (a thing at rest is where the kit drew it):
 *   opacity  0..1 (1)             x, y    pixels on the 1600×900 frame, an offset (0)
 *   scale    a factor (1)         rotate  degrees (0)               blur  pixels of blur (0)
 *   clip     0..1, how much of the thing its mask uncovers (1); the move's `mask` says the shape: left, right,
 *            top, bottom (uncovered from that edge) or iris (a circle from the centre)
 *   progress 0..1, how much of the thing's own content shows (1): a line drawn, a number counted
 *
 * A property is animated one of three ways: [from, to] on the move's curve; {from, to, ease?, span?} on an ease
 * of its own, over a part of the move (span: [a, b], shares of it); or around its rest — {rest, wave, cycles}
 * swings either side (a shake), {rest, swell, cycles} rises and falls back (a pulse) — dying away with the curve,
 * or steady in a loop.
 *
 * The timing rules practitioners use are numbers in the data: an exit takes about half its entrance's seconds
 * (`pairs` names the entrance it closes); a reveal puts 0.09 s between words (`gap`); overshoot moves ride outBack.
 * The laws every move keeps, built in or your own (readMove checks them): an entrance ends at rest, an exit starts
 * at rest, feedback starts and ends at rest, an ambient move loops and starts at rest. Reduced motion jumps: the
 * start values until the move starts, then the end (an ambient move: its rest).
 *
 * Pure functions of time, like every frame: moveAt(name, t) draws the same pixels whichever frames came before.
 */
import {easeNamed} from './ease.mjs';
import {spring, readFeel, FEELS} from './motion.mjs';

/** A value as a message shows it: a number as itself (NaN, Infinity), anything else as JSON. */
const shown = v => (typeof v === 'number' ? String(v) : JSON.stringify(v));
const clamp01 = n => Math.max(0, Math.min(1, n));

/** What each property is when nothing moves it. */
export const REST = Object.freeze({opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, blur: 0, clip: 1, progress: 1});
const PROPS = Object.freeze(Object.keys(REST));
export const MOVE_KINDS = Object.freeze(['entrance', 'exit', 'feedback', 'ambient']);
export const MOVE_USES = Object.freeze(['ui', 'text', 'logo', 'character', '3d']);
export const MASKS = Object.freeze(['left', 'right', 'top', 'bottom', 'iris']);
const SPLITS = Object.freeze(['word', 'letter']);

/**
 * The feelings, and the curve each one drives a move with when moveAt is asked for it (`{feel}`): smooth eases
 * out on a cubic; crisp is a snappy spring (fast, a hair of overshoot); soft glides on a quint; heavy is the heavy
 * spring (slow, no overshoot); bouncy is the playful spring (a visible overshoot).
 */
export const MOVE_FEELS = Object.freeze({
  smooth: Object.freeze({ease: 'outCubic'}),
  crisp: Object.freeze({spring: 'snappy'}),
  soft: Object.freeze({ease: 'outQuint'}),
  heavy: Object.freeze({spring: 'heavy'}),
  bouncy: Object.freeze({spring: 'playful'}),
});
export const MOVE_FEEL_NAMES = Object.freeze(Object.keys(MOVE_FEELS));

/** Practitioners' numbers: the pause between words in a reveal, between letters, and an exit's share of its entrance. */
export const WORD_GAP = .09, LETTER_GAP = .03, EXIT_SHARE = .5;

const fadeIn = span => ({from: 0, to: 1, ease: 'out', span});
const fadeOut = span => ({from: 1, to: 0, ease: 'in', span});
/** An exit, from the entrance it closes: half its seconds, accelerating away (in), the same feel and uses. */
const exitOf = (entrance, move) => ({kind: 'exit', feel: entrance.feel, uses: entrance.uses, seconds: +(entrance.seconds * EXIT_SHARE).toFixed(3), ease: 'in', pairs: entrance.name, ...move});

const ENTRANCES = [
  {name: 'fade-slide', feel: 'smooth', uses: ['ui', 'text'], seconds: .4, ease: 'outCubic', props: {opacity: [0, 1], y: [24, 0]}},
  {name: 'soft-rise', feel: 'soft', uses: ['ui', 'text', 'logo'], seconds: .7, ease: 'outQuint', props: {opacity: fadeIn([0, .6]), y: [40, 0], scale: [.97, 1]}},
  {name: 'mask-wipe', feel: 'crisp', uses: ['text', 'logo', 'ui'], seconds: .5, ease: 'inOutCubic', mask: 'left', props: {clip: [0, 1]}},
  {name: 'iris-open', feel: 'smooth', uses: ['logo', 'ui', '3d'], seconds: .6, ease: 'standard', mask: 'iris', props: {clip: [0, 1]}},
  {name: 'overshoot', feel: 'bouncy', uses: ['ui', 'logo'], seconds: .5, ease: 'outBack', props: {opacity: fadeIn([0, .4]), scale: [.6, 1]}},
  {name: 'bounce-landing', feel: 'bouncy', uses: ['logo', 'character', 'ui'], seconds: .9, ease: 'bounce', props: {y: [-260, 0], opacity: fadeIn([0, .15])}},
  {name: 'spring-follow', feel: 'smooth', uses: ['ui', 'character', '3d'], seconds: .57, spring: 'default', props: {x: [-160, 0], opacity: fadeIn([0, .3])}},
  {name: 'pop', feel: 'bouncy', uses: ['ui', 'logo', 'text'], seconds: .78, spring: 'playful', props: {scale: [0, 1], opacity: fadeIn([0, .15])}},
  {name: 'text-reveal-word', feel: 'smooth', uses: ['text'], seconds: .45, ease: 'outCubic', split: 'word', gap: WORD_GAP, props: {opacity: [0, 1], y: [16, 0]}},
  {name: 'text-reveal-letter', feel: 'crisp', uses: ['text'], seconds: .3, ease: 'outCubic', split: 'letter', gap: LETTER_GAP, props: {opacity: [0, 1], y: [10, 0]}},
  {name: 'count-up', feel: 'smooth', uses: ['text', 'ui'], seconds: 1.2, ease: 'outExpo', props: {progress: [0, 1]}},
  {name: 'line-draw', feel: 'smooth', uses: ['ui', 'logo', 'character'], seconds: .8, ease: 'inOutCubic', props: {progress: [0, 1]}},
  {name: 'blur-in', feel: 'soft', uses: ['text', 'logo', '3d'], seconds: .6, ease: 'outCubic', props: {opacity: [0, 1], blur: [12, 0]}},
  {name: 'scale-in', feel: 'crisp', uses: ['ui', 'logo'], seconds: .3, ease: 'outQuint', props: {opacity: [0, 1], scale: [.85, 1]}},
  {name: 'drop-in', feel: 'heavy', uses: ['ui', 'logo', '3d'], seconds: .78, spring: 'heavy', props: {y: [-180, 0], opacity: fadeIn([0, .25])}},
  {name: 'slam', feel: 'heavy', uses: ['text', 'logo', '3d'], seconds: .4, ease: 'outExpo', props: {scale: [1.6, 1], opacity: fadeIn([0, .3]), blur: {from: 6, to: 0, span: [0, .5]}}},
].map(m => ({kind: 'entrance', ...m}));
const entrance = name => ENTRANCES.find(m => m.name === name);

const EXITS = [
  exitOf(entrance('fade-slide'), {name: 'fade-slide-out', props: {opacity: [1, 0], y: [0, -12]}}),
  exitOf(entrance('soft-rise'), {name: 'soft-sink', props: {opacity: [1, 0], y: [0, 20], scale: [1, .98]}}),
  exitOf(entrance('mask-wipe'), {name: 'mask-wipe-out', ease: 'inOutCubic', mask: 'right', props: {clip: [1, 0]}}),
  exitOf(entrance('iris-open'), {name: 'iris-close', mask: 'iris', props: {clip: [1, 0]}}),
  exitOf(entrance('pop'), {name: 'pop-out', props: {scale: [1, 0], opacity: fadeOut([.6, 1])}}),
  exitOf(entrance('blur-in'), {name: 'blur-out', props: {opacity: [1, 0], blur: [0, 12]}}),
  exitOf(entrance('scale-in'), {name: 'scale-out', props: {opacity: [1, 0], scale: [1, .85]}}),
  exitOf(entrance('drop-in'), {name: 'drop-out', props: {y: [0, 180], opacity: fadeOut([.5, 1])}}),
];

const FEEDBACK = [
  {name: 'shake', feel: 'crisp', uses: ['ui'], seconds: .4, ease: 'out', props: {x: {rest: 0, wave: 10, cycles: 4}}},
  {name: 'wiggle', feel: 'bouncy', uses: ['ui', 'character', 'logo'], seconds: .6, ease: 'out', props: {rotate: {rest: 0, wave: 6, cycles: 3}}},
  {name: 'nod', feel: 'soft', uses: ['character', 'ui'], seconds: .5, ease: 'inOut', props: {y: {rest: 0, wave: 6, cycles: 1}}},
].map(m => ({kind: 'feedback', ...m}));

const AMBIENT = [
  {name: 'marquee', feel: 'smooth', uses: ['text', 'ui'], seconds: 10, ease: 'linear', loop: true, props: {x: [0, -1600]}},
  {name: 'pulse', feel: 'soft', uses: ['ui', 'logo'], seconds: 1.6, ease: 'linear', loop: true, props: {scale: {rest: 1, swell: .05, cycles: 1}}},
  {name: 'float', feel: 'soft', uses: ['character', 'logo', '3d'], seconds: 3, ease: 'linear', loop: true, props: {y: {rest: 0, wave: 8, cycles: 1}}},
].map(m => ({kind: 'ambient', ...m}));

const MOVE_KEYS = ['name', 'kind', 'feel', 'uses', 'seconds', 'ease', 'spring', 'props', 'mask', 'split', 'gap', 'loop', 'pairs'];
/** The moves this module checked: each move given (the table's, and each of yours) → its checked, frozen copy, so a move is checked once. */
const checked = new WeakMap();

/** How long a spring feel takes to settle within 0.5% of its end, in steps of 1/240 s (at most 10 s): per feel, once. */
const settled = new Map();
function settleTime(f) {
  const key = `${f.k}|${f.d}`;
  if (!settled.has(key)) {
    let last = 0;
    for (let i = 1; i <= 2400; i++) if (Math.abs(1 - spring(i / 240, f)) >= .005) last = i / 240;
    settled.set(key, Math.min(10, last + 1 / 240));
  }
  return settled.get(key);
}
/**
 * A spring as a curve of u: its first `window` seconds (a move's own seconds; a feel asked for instead, its settling
 * time), what is left of it closed evenly so it ends at exactly 1. A move's own spring so plays in real time.
 */
function springCurve(feel, window) {
  const f = readFeel(feel), S = window ?? settleTime(f), end = spring(S, f);
  return u => { u = clamp01(u); return u >= 1 ? 1 : spring(u * S, f) + (1 - end) * u; };
}
/** The curve a drive gives: {ease} → the ease table's; {spring, seconds?} → that spring, over those seconds or its settling. */
const curveOf = drive => (drive.spring !== undefined ? springCurve(drive.spring, drive.seconds) : easeNamed(drive.ease));

/** A feel as moveAt takes it: a move feel (smooth, crisp, soft, heavy, bouncy), a spring feel's name, or {k, d}. */
function driveOfFeel(feel, where) {
  if (typeof feel === 'string' && Object.hasOwn(MOVE_FEELS, feel)) return MOVE_FEELS[feel];
  if (typeof feel === 'string' && Object.hasOwn(FEELS, feel)) return {spring: feel};
  if (feel && typeof feel === 'object' && !Array.isArray(feel)) {
    try { return {spring: readFeel(feel)}; } catch (e) { throw new Error(`${where}: ${e.message}`, {cause: e}); }
  }
  throw new Error(`${where}: feel is a move feel (${MOVE_FEEL_NAMES.join(', ')}), a spring's (${Object.keys(FEELS).join(', ')}) or {k, d}, not ${shown(feel)}`);
}

/** One property's value at u (0..1 through the move), given the move's curve and whether it loops. */
function propAt(spec, u, curve, loop) {
  if (Array.isArray(spec)) return spec[0] + (spec[1] - spec[0]) * curve(u);
  const [a, b] = spec.span ?? [0, 1], v = loop ? u : clamp01((u - a) / (b - a)), c = spec.ease ? easeNamed(spec.ease) : curve;
  if (spec.from !== undefined) return spec.from + (spec.to - spec.from) * c(v);
  const fade = loop ? 1 : 1 - c(v);   // a swing dies away as the move's curve arrives; a loop's never does
  if (spec.wave !== undefined) return spec.rest + spec.wave * Math.sin(2 * Math.PI * spec.cycles * v) * fade;
  return spec.rest + spec.swell * Math.sin(Math.PI * spec.cycles * v) ** 2 * fade;
}

/** Every property at u: the move's own, the rest at rest; opacity, clip and progress held to 0..1, scale and blur to 0 or more. */
function valuesAt(move, u, curve) {
  const out = {};
  for (const prop of PROPS) {
    const spec = move.props[prop];
    out[prop] = spec === undefined ? REST[prop] : propAt(spec, u, curve, move.loop) + 0;   // (+ 0: never −0)
  }
  for (const prop of ['opacity', 'clip', 'progress']) out[prop] = clamp01(out[prop]);
  out.scale = Math.max(0, out.scale); out.blur = Math.max(0, out.blur);
  out.mask = move.mask ?? null;
  return out;
}

/** The moves listed by kind, for a refusal. */
const byKind = names => MOVE_KINDS.map(kind => `${kind}: ${names.filter(n => MOVES[n].kind === kind).join(', ')}`).join('; ');

/**
 * A move as given — a name from the table, or {name, kind, feel, uses, seconds, ease | spring, props, …} of your
 * own — checked and frozen; a name that is not a move refuses, naming the moves by kind.
 */
export function readMove(move, where = 'move') {
  if (typeof move === 'string') {
    if (Object.hasOwn(MOVES, move)) return MOVES[move];
    throw new Error(`${where}: no move called "${move}"; the moves are ${byKind(MOVE_NAMES)} (or {name, kind, feel, uses, seconds, ease, props} of your own)`);
  }
  if (move && typeof move === 'object' && checked.has(move)) return checked.get(move);
  const m = checkMove(move, where);
  checked.set(move, m); checked.set(m, m);
  return m;
}

/** A move of your own, checked against the vocabulary and the laws (see the top of this file). */
function checkMove(move, where) {
  if (!move || typeof move !== 'object' || Array.isArray(move)) throw new Error(`${where}: a move is a name (${MOVE_NAMES.slice(0, 4).join(', ')}, …) or {name, kind, feel, uses, seconds, ease | spring, props}`);
  for (const key of Object.keys(move)) if (!MOVE_KEYS.includes(key)) throw new Error(`${where}: a move has no key ${key} (a move has ${MOVE_KEYS.join(', ')})`);
  const who = `${where} "${move.name}"`;
  if (!(typeof move.name === 'string' && /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(move.name))) throw new Error(`${where}: a move's name is lower-case words joined by hyphens (e.g. "soft-rise"), not ${shown(move.name)}`);
  if (!MOVE_KINDS.includes(move.kind)) throw new Error(`${who}: kind is ${MOVE_KINDS.join(', ')}, not ${shown(move.kind)}`);
  if (!MOVE_FEEL_NAMES.includes(move.feel)) throw new Error(`${who}: feel is how it feels — ${MOVE_FEEL_NAMES.join(', ')} — not ${shown(move.feel)}`);
  if (!(Array.isArray(move.uses) && move.uses.length && move.uses.every(u => MOVE_USES.includes(u)))) throw new Error(`${who}: uses lists what it is for, from ${MOVE_USES.join(', ')}, not ${shown(move.uses)}`);
  if (!(Number.isFinite(move.seconds) && move.seconds > 0)) throw new Error(`${who}: seconds is how long it takes, above 0, not ${shown(move.seconds)}`);
  if ((move.ease === undefined) === (move.spring === undefined)) throw new Error(`${who}: give it one curve: ease (a name from the ease table) or spring (a spring feel: ${Object.keys(FEELS).join(', ')}, or {k, d})`);
  try { curveOf(move); } catch (e) { throw new Error(`${who}: ${e.message}`, {cause: e}); }
  if (move.spring !== undefined) {
    const f = readFeel(move.spring), left = Math.abs(1 - spring(move.seconds, f));
    if (left > .01) throw new Error(`${who}: its spring is still moving at ${move.seconds} s (${+(left * 100).toFixed(1)}% from rest); give it seconds of at least ${+settleTime(f).toFixed(2)}, the time that spring takes to settle`);
  }
  checkShape(move, who);
  const props = checkProps(move, who), m = deepFreeze({...move, uses: [...move.uses], props});
  checkLaws(m, who);
  return m;
}

/** The keys that only some moves have: a mask with a clip, a split with its gap, a loop on an ambient move, pairs on an exit. */
function checkShape(move, who) {
  const clips = move.props && Object.hasOwn(move.props, 'clip');
  if (clips !== (move.mask !== undefined)) throw new Error(`${who}: a move that animates clip names its mask (${MASKS.join(', ')}), and only such a move does`);
  if (move.mask !== undefined && !MASKS.includes(move.mask)) throw new Error(`${who}: mask is ${MASKS.join(', ')}, not ${shown(move.mask)}`);
  if ((move.split === undefined) !== (move.gap === undefined)) throw new Error(`${who}: a move that splits text gives split (${SPLITS.join(', ')}) and gap (seconds between the pieces: ${WORD_GAP} between words) together`);
  if (move.split !== undefined && !SPLITS.includes(move.split)) throw new Error(`${who}: split is ${SPLITS.join(', ')}, not ${shown(move.split)}`);
  if (move.gap !== undefined && !(Number.isFinite(move.gap) && move.gap >= 0)) throw new Error(`${who}: gap is seconds between the pieces, 0 or more (${WORD_GAP} between words), not ${shown(move.gap)}`);
  if ((move.kind === 'ambient') !== (move.loop === true)) throw new Error(`${who}: an ambient move loops (loop: true), and only an ambient move does`);
  if (move.pairs !== undefined && !(move.kind === 'exit' && typeof move.pairs === 'string')) throw new Error(`${who}: pairs names the entrance an exit closes; only an exit has it`);
}

/** The properties, each checked: [from, to], {from, to, ease?, span?}, {rest, wave, cycles} or {rest, swell, cycles}. */
function checkProps(move, who) {
  if (!move.props || typeof move.props !== 'object' || Array.isArray(move.props) || !Object.keys(move.props).length) throw new Error(`${who}: props names what it animates, from ${PROPS.join(', ')}: {y: [24, 0]}`);
  const out = {};
  for (const [prop, spec] of Object.entries(move.props)) {
    const bad = what => new Error(`${who}: props.${prop} ${what}`);
    if (!PROPS.includes(prop)) throw bad(`is not a property; a move animates ${PROPS.join(', ')}`);
    if (Array.isArray(spec)) {
      if (!(spec.length === 2 && spec.every(Number.isFinite))) throw bad(`is [from, to], two numbers, not ${shown(spec)}`);
      out[prop] = [...spec]; continue;
    }
    if (!spec || typeof spec !== 'object') throw bad('is [from, to], {from, to, ease?, span?}, {rest, wave, cycles} or {rest, swell, cycles}');
    const shape = spec.from !== undefined || spec.to !== undefined ? ['from', 'to', 'ease', 'span'] : spec.wave !== undefined ? ['rest', 'wave', 'cycles', 'span'] : ['rest', 'swell', 'cycles', 'span'];
    for (const key of Object.keys(spec)) if (!shape.includes(key)) throw bad(`has no key ${key} (this one takes ${shape.join(', ')})`);
    const numbers = shape.filter(k => k !== 'ease' && k !== 'span');
    if (!numbers.every(k => Number.isFinite(spec[k]))) throw bad(`needs ${numbers.join(', ')} as numbers`);
    if (spec.cycles !== undefined && !(Number.isInteger(spec.cycles) && spec.cycles > 0)) throw bad(`cycles is a whole number above 0 (so a swing ends at rest), not ${shown(spec.cycles)}`);
    if (spec.ease !== undefined) { try { easeNamed(spec.ease); } catch (e) { throw bad(e.message); } }
    if (spec.span !== undefined && !(Array.isArray(spec.span) && spec.span.length === 2 && spec.span.every(Number.isFinite) && spec.span[0] >= 0 && spec.span[0] < spec.span[1] && spec.span[1] <= 1)) throw bad(`span is [a, b], the share of the move it runs over, 0 ≤ a < b ≤ 1, not ${shown(spec.span)}`);
    if (spec.span !== undefined && move.loop) throw bad('has a span, and a loop has no part of itself to run over');
    out[prop] = {...spec, ...(spec.span ? {span: [...spec.span]} : {})};
  }
  return out;
}

/** The laws by kind: where a move must start and end, so a kit can rely on it. */
function checkLaws(move, who) {
  const curve = curveOf(move), at = u => valuesAt(move, u, curve), off = v => PROPS.filter(p => Math.abs(v[p] - REST[p]) > 1e-9);
  const law = (u, what) => { const wrong = off(at(u)); if (wrong.length) throw new Error(`${who}: ${what}, and its ${wrong.join(', ')} ${wrong.length > 1 ? 'are' : 'is'} not at rest there (${wrong.map(p => `${p} rests at ${REST[p]}`).join(', ')})`); };
  if (move.kind === 'entrance') law(1, 'an entrance ends at rest');
  if (move.kind === 'exit') law(0, 'an exit starts at rest');
  if (move.kind === 'feedback') { law(0, 'feedback starts at rest'); law(1, 'feedback ends at rest'); }
  if (move.kind === 'ambient') law(0, 'an ambient move starts its loop at rest');
}

function deepFreeze(v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) deepFreeze(x); } return v; }

/** The table, by name: entrances, then exits, feedback and ambient moves. Every one passes the same check as yours. */
export const MOVES = Object.freeze(Object.fromEntries([...ENTRANCES, ...EXITS, ...FEEDBACK, ...AMBIENT].map(m => {
  const c = checkMove(m, 'MOVES'); checked.set(c, c); return [c.name, c];
})));
export const MOVE_NAMES = Object.freeze(Object.keys(MOVES));

const MOVE_AT_KEYS = ['start', 'seconds', 'feel', 'reduced'];

/**
 * A move's values at t: {opacity, x, y, scale, rotate, blur, clip, progress, mask} — every property, at rest where
 * the move leaves it alone. `start` (0) is when it begins; `seconds` stretches or shortens it (its own by default);
 * `feel` drives it on another curve (a move feel, a spring feel, or {k, d}); `reduced: true` is reduced motion: no
 * in-between, the start values until `start`, then the end (an ambient move: its rest). Before `start` a move is at
 * its start; after its seconds, at its end; an ambient move repeats every `seconds`.
 */
export function moveAt(move, t, options = {}) {
  const m = readMove(move, 'moveAt');
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error(`moveAt: options is {${MOVE_AT_KEYS.join(', ')}}`);
  for (const key of Object.keys(options)) if (!MOVE_AT_KEYS.includes(key)) throw new Error(`moveAt: no option ${key} (moveAt takes ${MOVE_AT_KEYS.join(', ')})`);
  const {start = 0, seconds = m.seconds, feel, reduced = false} = options;
  if (!(Number.isFinite(t) && Number.isFinite(start))) throw new Error(`moveAt: t and start are seconds, not t ${shown(t)}, start ${shown(start)}`);
  if (!(Number.isFinite(seconds) && seconds > 0)) throw new Error(`moveAt: seconds is how long "${m.name}" takes, above 0 (its own is ${m.seconds}), not ${shown(seconds)}`);
  if (typeof reduced !== 'boolean') throw new Error(`moveAt: reduced is true (reduced motion: jump to the end) or false, not ${shown(reduced)}`);
  const curve = feel === undefined ? curveOf(m) : curveOf(driveOfFeel(feel, 'moveAt'));
  if (reduced) return valuesAt(m, t < start || m.loop ? 0 : 1, curve);
  const u = (t - start) / seconds;
  return valuesAt(m, m.loop ? (u <= 0 ? 0 : u - Math.floor(u)) : clamp01(u), curve);
}

/**
 * Each item's delay in a staggered move: [{item, index, delay}], delay = index × gap. gap is seconds (0 or more), or
 * a move that splits text, whose own gap it takes (stagger(words, 'text-reveal-word'): 0.09 s apart).
 */
export function stagger(items, gap) {
  if (!Array.isArray(items)) throw new Error(`stagger: items is a list (the words, the letters, the cards), not ${shown(items)}`);
  let step = gap;
  if (typeof gap === 'string' || (gap && typeof gap === 'object')) {
    const m = readMove(gap, 'stagger');
    if (m.gap === undefined) throw new Error(`stagger: "${m.name}" does not split text, so it has no gap; give seconds (${WORD_GAP} between words) or a move that splits: ${MOVE_NAMES.filter(n => MOVES[n].split).join(', ')}`);
    step = m.gap;
  }
  if (!(Number.isFinite(step) && step >= 0)) throw new Error(`stagger: gap is seconds between items, 0 or more (${WORD_GAP} between words), or a move that splits text, not ${shown(gap)}`);
  return items.map((item, index) => ({item, index, delay: index * step}));
}

const BY_KEYS = {feel: MOVE_FEEL_NAMES, use: MOVE_USES, kind: MOVE_KINDS};

/** The moves (the table's data, in its order) that match every filter given: {feel, use, kind}; none given, all of them. */
export function movesBy(filter = {}) {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) throw new Error('movesBy: the filter is {feel?, use?, kind?}');
  for (const [key, value] of Object.entries(filter)) {
    if (!Object.hasOwn(BY_KEYS, key)) throw new Error(`movesBy: no filter ${key} (moves are found by ${Object.keys(BY_KEYS).join(', ')})`);
    if (!BY_KEYS[key].includes(value)) throw new Error(`movesBy: ${key} is ${BY_KEYS[key].join(', ')}, not ${shown(value)}`);
  }
  const {feel, use, kind} = filter;
  return MOVE_NAMES.map(n => MOVES[n]).filter(m => (feel === undefined || m.feel === feel) && (use === undefined || m.uses.includes(use)) && (kind === undefined || m.kind === kind));
}

/**
 * Apply a move's values to a canvas, for a thing drawn in `box` ([x0, y0, x1, y1], the whole 1600×900 frame by
 * default): its opacity, its offset, its scale and turn about the box's centre, its mask, its blur (in frame pixels,
 * scaled to the canvas). Save the context before and restore it after; returns false when nothing of the thing shows
 * (draw nothing then). Blur applies to each drawing operation: blur a picture of many shapes as one layer.
 */
export function applyMove(ctx, values, {box = [0, 0, 1600, 900]} = {}) {
  const v = values, [x0, y0, x1, y1] = box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (!(v.opacity > 0 && v.clip > 0 && v.scale > 0)) return false;
  const device = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
  ctx.globalAlpha *= v.opacity;
  ctx.translate(cx + v.x, cy + v.y); ctx.rotate(v.rotate * Math.PI / 180); ctx.scale(v.scale, v.scale); ctx.translate(-cx, -cy);
  if (v.mask && v.clip < 1) maskTo(ctx, v.mask, v.clip, box);
  if (v.blur > 0) ctx.filter = `blur(${+(v.blur * device).toFixed(3)}px)`;
  return true;
}

/** Clip to the share of the box a mask uncovers: from an edge (left, right, top, bottom), or a circle from its centre (iris). */
function maskTo(ctx, mask, clip, [x0, y0, x1, y1]) {
  const w = x1 - x0, h = y1 - y0;
  ctx.beginPath();
  if (mask === 'left') ctx.rect(x0, y0, w * clip, h);
  else if (mask === 'right') ctx.rect(x1 - w * clip, y0, w * clip, h);
  else if (mask === 'top') ctx.rect(x0, y0, w, h * clip);
  else if (mask === 'bottom') ctx.rect(x0, y1 - h * clip, w, h * clip);
  else ctx.arc((x0 + x1) / 2, (y0 + y1) / 2, clip * Math.hypot(w, h) / 2, 0, Math.PI * 2);
  ctx.clip();
}
