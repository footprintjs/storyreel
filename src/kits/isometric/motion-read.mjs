/**
 * motion-read — an isometric world's `motion` entries, checked: every refusal names the entry (`stage map: isometric
 * motion[1] ("ball")`) and the fix. Plain data in, plain data out; nothing is planned or drawn here (motion.mjs plans).
 *
 *   {"piece": "box", "do": "fall", "at": ["map", "the box drops"]}
 *   {"piece": "ball", "do": "throw", "to": "server", "wrap": [{"wrapper": "anticipate"}]}
 *
 * The words are footprint-story's (`footprint-story/human`): `do` is an intent's own word, `wrap` its wrappers and
 * `model` a model it knows, handed on as they are. WHY its words: the author writes intent only, and the tool that knows
 * how bodies move decides the model, the duration and the curve; a fix footprint-story gives (`model: 'bounce'`) is then
 * written in this entry as it is said.
 *
 * What a film adds: `piece` (a block of this world, by its name), `at` (when the move begins, an anchor on the voice),
 * and `to` / `from` as the world's own places — a block's name or tiles — never pixels: the kit works the pixels out
 * from the built map (motion.mjs).
 */
import {HUMAN_DOS, HUMAN_CRITICS, MOST_INTENTS, MOST_WRAPPERS} from 'footprint-story/human';
import {anchorLike, keysOf, shown} from './words.mjs';

/** The keys a motion entry takes. */
export const MOTION_KEYS = Object.freeze(['piece', 'do', 'at', 'to', 'from', 'wrap', 'model', 'accept']);

/**
 * The kit's own critics, beside footprint-story's: `reel:contact`, a move whose block passes through another block on
 * its way (motion.mjs · throughFindings). Named under the kit's prefix, as footprint-story names a tool's own.
 */
export const REEL_CRITICS = Object.freeze(['reel:contact']);
/** Every critic a motion entry may accept by name: footprint-story's and the kit's. */
const CRITIC_NAMES = Object.freeze([...HUMAN_CRITICS, ...REEL_CRITICS]);

/**
 * What a film's world lets a block do (footprint-story 0.30): each `do` word and the places it takes — `to` where it
 * ends (a block's name or tiles), `from` a hang's pin. WHY these five: each moves a whole block from one place to
 * another, and its model gives a place at every moment. `draw`, `write` and `sketch` move a pen's point along a line,
 * not a block (refused, saying so). roll, slide and tumble come with footprint-story 0.31: each is one row here and one
 * in motion.mjs · INTENT_OF, nothing else.
 */
export const MOTION_DOS = Object.freeze({
  fall: Object.freeze({to: false, from: false}),
  throw: Object.freeze({to: true, from: false}),
  hang: Object.freeze({to: false, from: true}),
  settle: Object.freeze({to: true, from: false}),
  reach: Object.freeze({to: true, from: false}),
});
/** The footprint-story words a block cannot do: each moves a pen, and why that is no move of a block. */
const PEN_DOS = Object.freeze(['draw', 'write', 'sketch']);

/** The most motion entries a world holds: footprint-story's most intents a list (64), each entry one intent. */
export const MOST_MOTIONS = MOST_INTENTS;

const own = (o, k) => Object.hasOwn(o, k) && o[k] !== undefined;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const either = (names) => names.map((n) => `"${n}"`).join(', ').replace(/, ([^,]*)$/, ' or $1');
const nums = (v, lengths) => Array.isArray(v) && lengths.includes(v.length) && v.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e6);

/**
 * A place in the world: a block's name ({block}) or tiles ({tiles: [col, row, lift]}). `key` names it in a refusal;
 * `self` is the moving block (a move onto itself is refused); `lift` whether tiles may give a height (a pin hangs in the air).
 */
function placeOf(v, key, who, {blocks, self}) {
  const form = `a block's name ("server") or tiles on the floor ([col, row], a third number lifting it)`;
  if (typeof v === 'string') {
    const block = blocks.find((b) => b.name === v);
    if (!block) throw new Error(`${who}: ${key} names ${shown(v)}, which is no block here — the blocks are ${blocks.map((b) => b.name).join(', ')}; or give tiles ([col, row])`);
    if (block === self) throw new Error(`${who}: ${key} names the piece itself — name another block, or give tiles ([col, row])`);
    return {block};
  }
  if (!nums(v, [2, 3])) throw new Error(`${who}: ${key} is ${form} — not ${shown(v)}`);
  if (v.length === 3 && v[2] < 0) throw new Error(`${who}: ${key}'s lift is how high above the floor, 0 or more — not ${v[2]}`);
  return {tiles: [v[0], v[1], v[2] ?? 0]};
}

/** One motion entry, checked: {index, path, who, piece, do, at, to, from, wrap, model, accept}. `blocks`, `wires`: the read map's. */
function readMotion(m, i, where, {blocks, floors, wires}) {
  const path = `motion[${i}]`, first = `${where}: isometric ${path}`;
  keysOf(m, MOTION_KEYS, first);
  const name = m.piece, piece = blocks.find((b) => b.name === name);
  if (typeof name !== 'string' || !name) throw new Error(`${first}: piece names the block that moves ("box") — the blocks are ${blocks.map((b) => b.name).join(', ')}; not ${shown(name)}`);
  if (!piece) {
    const other = [...floors, ...wires].find((p) => p.name === name);
    if (other) throw new Error(`${first}: piece "${name}" is ${other.path} — a motion moves a block (a packet later): name a block, ${blocks.map((b) => b.name).join(', ')}`);
    throw new Error(`${first}: piece names ${shown(name)}, which is no block here — the blocks are ${blocks.map((b) => b.name).join(', ')}`);
  }
  const who = `${first} ("${name}")`;
  // a cable is laid on the floor to where its block stands: it would not follow the block, so its end would hang in the air
  const joined = wires.find((w) => w.arrow.from.block === piece || w.arrow.to.block === piece);
  if (joined) throw new Error(`${who}: ${joined.path} joins "${name}": its cable is laid on the floor to where "${name}" stands and would not follow it — move a block no wire joins, or take the wire off`);
  const doWord = m.do, takes = MOTION_DOS[doWord], dos = either(Object.keys(MOTION_DOS));
  if (typeof doWord !== 'string' || !Object.hasOwn(MOTION_DOS, doWord)) {
    if (PEN_DOS.includes(doWord)) throw new Error(`${who}: do "${doWord}" moves a pen's point along a line, not a block — a block takes do ${dos}`);
    if (typeof doWord === 'string' && Object.hasOwn(HUMAN_DOS, doWord)) throw new Error(`${who}: do "${doWord}" is footprint-story's, and not yet a block's in a film — a block takes do ${dos}`);
    throw new Error(`${who}: do says what the block does, ${dos} (footprint-story's words) — not ${shown(doWord)}`);
  }
  const at = own(m, 'at') ? m.at : null;
  if (at !== null && !anchorLike(at)) throw new Error(`${who}: at is when the move begins, an anchor ["scene", "phrase"] (or ["scene", "phrase", seconds after]) — not ${shown(at)}; leave it out to begin when the block appears`);
  const place = (key) => {
    if (takes[key] && !own(m, key)) throw new Error(`${who}: a ${doWord} needs ${key === 'to' ? 'to, where it ends' : 'from, the pin it hangs from'}: ${key === 'to' ? `a block's name ("${blocks.find((b) => b !== piece)?.name ?? 'server'}")` : 'a block\'s name, or tiles in the air ([col, row, lift])'} or tiles ([col, row])`);
    if (!takes[key] && own(m, key)) throw new Error(`${who}: a ${doWord} takes no ${key} — ${doWord === 'fall' ? 'it falls straight down to the floor below it' : doWord === 'hang' ? 'it swings to rest below its pin (from)' : `it starts where the block is (to says where it ends)`}: take ${key} out`);
    return takes[key] ? placeOf(m[key], key, who, {blocks, self: piece}) : null;
  };
  const to = place('to'), from = place('from');
  let wrap = [];
  if (own(m, 'wrap')) {
    if (!Array.isArray(m.wrap) || m.wrap.length > MOST_WRAPPERS || !m.wrap.every(isObject)) throw new Error(`${who}: wrap is a list of at most ${MOST_WRAPPERS} wrappers, [{"wrapper": "anticipate"}] — footprint-story's: anticipate, follow-through, hold, overshoot; not ${shown(m.wrap)}`);
    wrap = structuredClone(m.wrap);
  }
  // a model is footprint-story's to check (its name, its options, the family it serves): its refusal comes back in this entry's name
  if (own(m, 'model') && !(typeof m.model === 'string' || isObject(m.model))) throw new Error(`${who}: model names one of footprint-story's models, "bounce" or {"name": "bounce", …its options} — or leave it out and the usual is chosen; not ${shown(m.model)}`);
  // a critic the author means to keep (a straight slide is wanted): its finding is shown as accepted, never as a fault;
  // motion.mjs checks, once the move is planned, that its model is checked by it
  let accept = [];
  if (own(m, 'accept')) {
    if (!Array.isArray(m.accept) || m.accept.length > CRITIC_NAMES.length || !m.accept.every((c) => typeof c === 'string')) throw new Error(`${who}: accept is a list of the critics whose findings this move keeps, ["arc"] — not ${shown(m.accept)}`);
    for (const c of m.accept) if (!CRITIC_NAMES.includes(c)) throw new Error(`${who}: accept names ${shown(c)}, which is no critic — the critics are ${CRITIC_NAMES.join(', ')}`);
    if (new Set(m.accept).size !== m.accept.length) throw new Error(`${who}: accept names a critic twice — name each once`);
    accept = [...m.accept];
  }
  return {index: i, path, who, piece, do: doWord, at, to, from, wrap, model: own(m, 'model') ? structuredClone(m.model) : null, accept};
}

/**
 * The world's `motion` list, checked: [] when it has none. Its length is checked before an entry is read. Each piece's
 * moves run one after another from where the one before left it, so a hang (whose end is wherever its swing settles)
 * is a piece's last; motion.mjs checks the moves do not overlap in time once it knows how long each takes.
 */
export function readMotions(list, where, map) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) throw new Error(`${where}: isometric motion is a list of moves, [{"piece": "box", "do": "fall"}] — not ${shown(list)}`);
  if (list.length > MOST_MOTIONS) throw new Error(`${where}: an isometric world holds at most ${MOST_MOTIONS} motions, and this one has ${list.length} — split it into two worlds`);
  return list.map((m, i) => readMotion(m, i, where, map));
}
