/**
 * Counting on fingers: a child holds up ten fingers and folds one on each beat (taking away), or starts with none and
 * raises one a beat (counting back while keeping track of the steps: "nineteen" raises one, "eighteen" raises two).
 * The library says WHICH finger moves and WHEN, as numbers; the kit draws the hands.
 *
 * Each finger moves the way an animator times it: a small wind-back first (a finger about to fold lifts a little; one
 * about to rise curls a little), a quick move, a small overshoot past where it is going, and a settle. The fingers
 * that are up are always the first ones in the counting order, so a fold takes down the finger raised last.
 *
 * The counting order is data: which finger counts first on each hand, and which hand counts first. The default is the
 * habit most Western adults reported in the published surveys: the thumb first, the left hand first (Lindemann,
 * Alipour & Fischer 2011, "Finger counting habits in Middle Eastern and Western individuals", Frontiers in
 * Psychology 2:40; Bender & Beller 2012, "Nature and culture of finger counting", Cognition 124). The same surveys
 * find many North Americans start with the index finger, and many people in the Middle East with the right hand's
 * little finger: `order: 'index-first'` and `{order: 'pinky-first', first: 'right'}`.
 *
 * Pure functions of time, like every frame: `fingersAt(keys, t)` reads the keys each time and returns the hands.
 */

/** The fingers of one hand, in the order every hand's numbers are returned in. */
export const FINGER_NAMES = Object.freeze(['thumb', 'index', 'middle', 'ring', 'little']);

/** The counting orders by name: the finger that counts first on a hand, then the next … (the second hand repeats it). */
export const COUNTING_ORDERS = Object.freeze({
  'thumb-first': Object.freeze(['thumb', 'index', 'middle', 'ring', 'little']),
  'index-first': Object.freeze(['index', 'middle', 'ring', 'little', 'thumb']),
  'pinky-first': Object.freeze(['little', 'ring', 'middle', 'index', 'thumb']),
});

/**
 * The timing every finger moves with: seconds (anticipate, move, settle, stagger), or how far in extension units
 * (lift: the wind-back before a move; overshoot: how far it passes where it goes). Stagger: the gap between fingers
 * when one key moves several.
 */
export const FINGERS = Object.freeze({anticipate: .08, move: .12, settle: .2, lift: .08, overshoot: .1, stagger: .06});

const OPTIONS = [...Object.keys(FINGERS), 'order', 'first'];
const VERBS = ['up', 'fold', 'raise'];
const smooth = x => x * x * (3 - 2 * x);

/**
 * The hands at t. keys: [{at, up: n}, {at, fold: k}, {at, raise: k}, …] in time order (at: seconds). The first key
 * says how many fingers are up from the start ({at, up: 10}: ten up; before it, the same); after it, each key folds k
 * (taking away), raises k (counting on), or sets the count (`up`: the fingers between move). Returns:
 *   up     how many fingers are up now: the count after the latest key at or before t (draw this number)
 *   from   the count before the latest change (null before the first change)
 *   hands  {left, right}: each finger's extension in FINGER_NAMES order (thumb … little), 0 folded … 1 straight —
 *          a moving finger passes either end by at most `lift` before it moves and `overshoot` as it arrives
 * One change at a time: a key starts at least anticipate + move after the last finger of the key before it starts
 * moving, and a finger moves again only after it has settled. Options: the timing (FINGERS), `order` (a counting
 * order's name, or the five finger names in the order they count), `first` ('left' or 'right': the hand that counts
 * first).
 */
export function fingersAt(keys, t, options = {}) {
  const o = readOptions(options ?? {}), plan = readFingerKeys(keys, o);
  if (!Number.isFinite(t)) throw new Error('fingersAt: t is a time in seconds');
  let i = 0; while (i + 1 < plan.counts.length && plan.counts[i + 1].at <= t) i++;
  const left = [0, 0, 0, 0, 0], right = [0, 0, 0, 0, 0];
  for (let slot = 0; slot < 10; slot++) {
    let e = slot < plan.counts[0].up ? 1 : 0;
    for (const m of plan.moves[slot]) e += m.dir * shape(t - m.at, o);
    const {hand, finger} = o.slots[slot];
    (hand === 'left' ? left : right)[finger] = e;
  }
  return {up: plan.counts[i].up, from: i ? plan.counts[i - 1].up : null, hands: {left, right}};
}

/**
 * One finger's way from where it was (0) to where it goes (1), τ seconds after its move starts: a wind-back of
 * `lift` over `anticipate` before it, a quick move past the end by `overshoot` over `move`, and a settle back over
 * `settle`. Smooth everywhere (the speed is 0 at every join), exactly 0 before and 1 after.
 */
function shape(τ, {anticipate, move, settle, lift, overshoot}) {
  if (τ < -anticipate) return 0;
  if (τ < 0) return -lift * smooth((τ + anticipate) / anticipate);
  if (τ < move) { const c = Math.cos(Math.PI * τ / move); return -lift * (1 + c) / 2 + (1 + overshoot) * (1 - c) / 2; }
  if (τ < move + settle) return 1 + overshoot * (1 - smooth((τ - move) / settle));
  return 1;
}

/** The options, checked: the timing, the counting order and the first hand → the timing plus each count's {hand, finger}. */
function readOptions(options) {
  for (const key of Object.keys(options)) if (!OPTIONS.includes(key)) throw new Error(`fingersAt: unknown option ${key}; it takes ${OPTIONS.join(', ')}`);
  const o = {...FINGERS, ...Object.fromEntries(Object.entries(options).filter(([k, v]) => Object.hasOwn(FINGERS, k) && v !== undefined))};
  for (const name of ['anticipate', 'move', 'settle']) if (!(Number.isFinite(o[name]) && o[name] > 0)) throw new Error(`fingersAt: ${name} is seconds, above 0`);
  if (!(Number.isFinite(o.stagger) && o.stagger >= 0)) throw new Error('fingersAt: stagger is the seconds between fingers that one key moves, 0 or more');
  for (const name of ['lift', 'overshoot']) if (!(o[name] >= 0 && o[name] < .5)) throw new Error(`fingersAt: ${name} is how far a finger passes its end, in extension (0 folded … 1 straight): 0 or more, under 0.5`);
  const {order = 'thumb-first', first = 'left'} = options;
  const fingers = typeof order === 'string' ? COUNTING_ORDERS[order] : order;
  if (typeof order === 'string' && !Object.hasOwn(COUNTING_ORDERS, order)) throw new Error(`fingersAt: no counting order called "${order}" (the orders are ${Object.keys(COUNTING_ORDERS).join(', ')}, or the five finger names in the order they count)`);
  if (!Array.isArray(fingers) || fingers.length !== 5 || new Set(fingers).size !== 5 || !fingers.every(f => FINGER_NAMES.includes(f))) throw new Error(`fingersAt: order is a counting order's name or the five fingers in the order they count, each once (${FINGER_NAMES.join(', ')}), not ${JSON.stringify(order)}`);
  if (first !== 'left' && first !== 'right') throw new Error(`fingersAt: first is the hand that counts first, 'left' or 'right', not ${JSON.stringify(first)}`);
  const second = first === 'left' ? 'right' : 'left';
  o.slots = [first, second].flatMap(hand => fingers.map(f => ({hand, finger: FINGER_NAMES.indexOf(f)})));
  return o;
}

/** A key's words in a message: "fold 2 at 3.5 s". */
const said = k => `${VERBS.find(v => k[v] !== undefined)} ${k[VERBS.find(v => k[v] !== undefined)]} at ${k.at} s`;

/**
 * The keys, checked, as the count after each key ([{at, up}]; the first is the start) and each count slot's moves
 * ([{at, dir}]: +1 rises, −1 folds). Refuses keys out of order, a key with no verb or two, counts that leave 0..10,
 * and changes closer than one change takes.
 */
function readFingerKeys(keys, o) {
  if (!Array.isArray(keys) || !keys.length) throw new Error('fingersAt: keys is a list of {at, up | fold | raise} in time order, starting with {at, up: n} (how many fingers are up from the start)');
  const counts = [], moves = Array.from({length: 10}, () => []), settled = Array(10).fill(-Infinity);
  let lastStart = -Infinity, count = 0;
  keys.forEach((k, i) => {
    const verbs = k && typeof k === 'object' ? VERBS.filter(v => k[v] !== undefined) : [];
    if (!k || !Number.isFinite(k.at) || verbs.length !== 1) throw new Error(`fingersAt: key ${i} must be {at: seconds} with one of up, fold or raise, not ${JSON.stringify(k)}`);
    const [verb] = verbs, n = k[verb];
    if (!Number.isInteger(n) || n < 0 || n > 10 || (verb !== 'up' && n === 0)) throw new Error(`fingersAt: key ${i}'s ${verb} is ${verb === 'up' ? 'how many fingers are up, a whole number 0..10' : 'how many fingers move, a whole number 1..10'}, not ${JSON.stringify(n)}`);
    if (i && k.at < keys[i - 1].at) throw new Error(`fingersAt: key ${i} (${said(k)}) comes before key ${i - 1} (${keys[i - 1].at} s); give the keys in time order`);
    if (i === 0 && verb !== 'up') throw new Error(`fingersAt: the first key says how many fingers are up from the start, {at, up: n}, not ${said(k)}`);
    if (i === 0) { count = n; counts.push({at: k.at, up: n}); return; }
    const to = verb === 'up' ? n : verb === 'fold' ? count - n : count + n;
    if (to < 0) throw new Error(`fingersAt: key ${i} (${said(k)}) folds ${n} but only ${count} ${count === 1 ? 'is' : 'are'} up: fold at most ${count}`);
    if (to > 10) throw new Error(`fingersAt: key ${i} (${said(k)}) raises ${n} but ${count} are already up: two hands hold ten fingers, so raise at most ${10 - count}`);
    if (to === count) return;   // no change: the count it already has
    if (k.at - lastStart < o.anticipate + o.move - 1e-9) throw new Error(`fingersAt: key ${i} (${said(k)}) comes ${(k.at - lastStart).toFixed(2)} s after the last finger of the change before it starts moving; a finger takes ${+(o.anticipate + o.move).toFixed(3)} s to wind back and move, so space the keys at least that far apart (or make anticipate and move shorter)`);
    const dir = to > count ? 1 : -1, slots = dir > 0 ? range(count, to) : range(to, count).reverse();
    slots.forEach((slot, j) => {
      const at = k.at + j * o.stagger;
      if (at - o.anticipate < settled[slot] - 1e-9) throw new Error(`fingersAt: key ${i} (${said(k)}) moves a finger at ${+at.toFixed(3)} s that is still settling until ${+settled[slot].toFixed(3)} s; a finger moves again only after it settles (anticipate + move + settle: ${+(o.anticipate + o.move + o.settle).toFixed(3)} s)`);
      moves[slot].push({at, dir}); settled[slot] = at + o.move + o.settle; lastStart = at;
    });
    count = to; counts.push({at: k.at, up: to});
  });
  return {counts, moves};
}

const range = (a, b) => Array.from({length: b - a}, (_, j) => a + j);
