/**
 * What each verb does, one event at a time (events.mjs): it checks the story as it stands at the event's moment
 * (checks.mjs), moves things (holders.mjs), plans walks, arms, looks and fingers, makes its sounds, and records the
 * beat (ledger.mjs). `S` is the plan being built (plan.mjs); `e` is {at, a, beat}.
 */
import {walk as planWalk} from '../walk.mjs';
import {fingersAt} from '../fingers.mjs';
import {MOVES} from '../moves.mjs';
import {STAGE, swingSeconds} from './timing.mjs';
import {TRAVELS} from './travel.mjs';
import {BADGE_NAMES} from './vocabulary.mjs';
import {personX, itemPoint} from './positions.mjs';
import {own} from './own.mjs';
import {person, group, container, howMany, travelOf, onStage, ready, occupy, face, reachable, landed, isOpen, target, xOf} from './checks.mjs';
import {takeSlot, move, release} from './holders.mjs';
import {record} from './ledger.mjs';
import {EPS, shown, s2, list, ordinal, holderKey, describe} from './say.mjs';

const some = (n, items, what) => `${n > 1 || items.length > 1 ? `${n} of ` : ''}${what}`;
const names = people => `${people.map(P => P.id).join(' and ')}`;
const edge = (side, P) => (side === 'left' ? -(P.size / 2 + STAGE.offstage) : 1600 + P.size / 2 + STAGE.offstage);
const side = (v, path, key) => { if (v === undefined || v === 'left' || v === 'right') return v; throw new Error(`${path}: ${key} is "left" or "right", not ${shown(v)}`); };
const arm = (P, start, end, on, why, track = null) => { const w = {start, end, on, why, ...(track ? {track} : {})}; P.arms.push(w); return w; };

function walkFor(P, from, to, start, style, path) {
  let w;
  try { w = planWalk({from, to, start, size: P.size, style: style ?? P.adapter.walk ?? 'stroll'}); } catch (e) { throw new Error(`${path}: ${e.message}`, {cause: e}); }
  P.walks.push({start, end: w.end, plan: w});
  if (w.steps) P.facings.push({at: start, facing: w.facing});
  return w;
}

/** A prop pops in or out: its presence (positions.mjs · itemShown) and its pop (scene.mjs) over time. */
function propEnters(S, e, enters) {
  const {a, at: t} = e, items = group(S, a.what, a.path);
  if (enters) {
    if (items.some(I => I.on)) throw new Error(`${a.path}: ${a.what} is already on stage at ${s2(t)}: leave this enter out, or give it an exit before it`);
    const gone = Math.max(...items.map(I => I.pops.at(-1)?.kind === 'out' ? I.pops.at(-1).at + S.popOut : -Infinity));
    if (t < gone - EPS) throw new Error(`${a.path}: ${a.what} is still going until ${s2(gone)}: give its enter at ${s2(gone)} or later`);
    for (const I of items) { I.on = true; I.presence.push({at: t, on: true}); I.pops.push({at: t, kind: 'in'}); }
    S.sound(t, 'settle'); S.until(t + MOVES.pop.seconds);
    return record(S, t, a, `${a.what} appears`);
  }
  if (!items.some(I => I.on)) throw new Error(`${a.path}: ${a.what} is not on stage at ${s2(t)}: give it an enter before this exit`);
  for (const I of items) if (I.on) { I.on = false; I.presence.push({at: t + S.popOut, on: false}); I.pops.push({at: t, kind: 'out'}); }
  S.until(t + S.popOut);
  record(S, t, a, `${a.what} goes`);
}

function door(S, e, open) {
  const {a, at: t} = e, items = group(S, a.what, a.path), C = S.containers.get(a.what), D = S.doors.get(a.what);
  if (!D) throw new Error(`${a.path}: ${a.what} has no door or lid (the kit's "${items[0].kind}" does not open)`);
  if (D.open === open) throw new Error(`${a.path}: ${a.what} is already ${open ? 'open' : 'shut'} at ${s2(t)}`);
  if (!open && C && t < C.busyUntil - EPS) throw new Error(`${a.path}: ${a.what} shuts at ${s2(t)} while things still go in or out: close it at ${s2(C.busyUntil)} or later`);
  if (a.who !== undefined) {
    const P = person(S, a.who, a.path); onStage(P, t, a.path); reachable(S, P, t, items[0], a.path, a.what); face(P, t, itemPoint(S, items[0], t)[0]);
    occupy(S, P, t, t + STAGE.door.move, a); arm(P, t, t + STAGE.door.move, a.what, open ? 'open' : 'close');
  }
  D.doors.push({at: t, open}); D.open = open; S.until(t + swingSeconds(STAGE.door));
  S.sound(t, a.rule.sound);
  record(S, t, a, `${a.what} ${open ? 'opens' : 'shuts'}`);
}

/** A count's first beat: what it counts from, into, who points, its badge. Kept for its later beats. */
function startCount(S, e) {
  const {a, at: t} = e, C = container(S, a.into, a.path, 'into'), travel = travelOf(a, a.path), badge = a.badge ?? 'total', items = group(S, a.what, a.path);
  if (!BADGE_NAMES.includes(badge)) throw new Error(`${a.path}: badge is one of ${BADGE_NAMES.join(', ')}, not ${shown(badge)}`);
  if (!S.items.get(C.id).on) throw new Error(`${a.path}: ${C.id} is not on stage at ${s2(t)}: give it an enter before the count`);
  const pool = items.filter(I => I.on && I.now.type !== 'gone' && !(I.now.type === 'in' && I.now.id === C.id));
  let source;
  if (a.from !== undefined) {
    if (!S.containers.has(a.from) && !S.people.has(a.from) && a.from !== 'ground') throw new Error(`${a.path}: from is a container, a cast member or "ground", not ${shown(a.from)}`);
    source = a.from;
  } else {
    const at = new Set(pool.map(I => holderKey(I.now)));
    if (at.size > 1) throw new Error(`${a.path}: ${a.what} to count are ${describe(pool)}: say which with from`);
    source = [...at][0] ?? null;
  }
  const c = {C, travel, badge, source, lands: [], track: [], P: a.who !== undefined ? person(S, a.who, a.path) : null, total: null};
  const last = a.times.at(-1) + TRAVELS[travel].seconds;
  if (c.P) { onStage(c.P, t, a.path); occupy(S, c.P, t, last, a); arm(c.P, t, last, null, 'count', c.track); }
  if (badge === 'total') { c.total = {mode: 'total', on: C.id, lands: c.lands, until: Infinity, from: Infinity}; S.badges.push(c.total); }
  S.counting.set(a.i, c);
  return c;
}

export const VERBS = Object.freeze({
  walkTo(S, {a, at: t}) {
    const who = list(a.who).map(id => person(S, id, a.path)), lead = who[0], x0 = personX(lead, t);
    who.forEach(P => { onStage(P, t, a.path); ready(P, t, a); });
    let to;
    if (Number.isFinite(a.to)) to = a.to;
    else if (typeof a.to === 'string') {
      const thing = target(S, a.to, t, `${a.path}.to`), x = xOf(S, thing, t), dir = Math.sign(x - x0) || 1;
      to = own(S.stage.place.adapter.spots, a.to) ? x : x - dir * (S.people.has(a.to) ? (lead.size + S.people.get(a.to).size) * .3 : lead.reach * .55);
    } else throw new Error(`${a.path}: to is an x on the floor, a spot, a prop or a cast member, not ${shown(a.to)}`);
    for (const P of who) { const w = walkFor(P, personX(P, t), to + personX(P, t) - x0, t, a.style, a.path); occupy(S, P, t, w.end, a); }
    record(S, t, a, `${names(who)} walk${who.length > 1 ? '' : 's'} to ${typeof a.to === 'string' ? a.to : `x ${Math.round(to)}`}`);
  },
  enter(S, e) {
    const {a, at: t} = e;
    if (a.what !== undefined) return propEnters(S, e, true);
    const who = list(a.who).map(id => person(S, id, a.path)), from = side(a.from, a.path, 'from');
    for (const P of who) {
      if (P.on) throw new Error(`${a.path}: ${P.id} is already on stage at ${s2(t)}: leave this enter out, or give them an exit before it`);
      ready(P, t, a);
      const w = walkFor(P, edge(from ?? (P.x0 < 800 ? 'left' : 'right'), P), P.x0, t, a.style, a.path);
      P.presence.push({at: t, on: true}); P.on = true; occupy(S, P, t, w.end, a);
    }
    record(S, t, a, `${names(who)} come${who.length > 1 ? '' : 's'} in`);
  },
  exit(S, e) {
    const {a, at: t} = e;
    if (a.what !== undefined) return propEnters(S, e, false);
    const who = list(a.who).map(id => person(S, id, a.path)), to = side(a.to, a.path, 'to');
    who.forEach(P => { onStage(P, t, a.path); ready(P, t, a); });
    const s = to ?? (personX(who[0], t) < 800 ? 'left' : 'right'), lead = who.reduce((b, P) => ((s === 'right' ? personX(P, t) > personX(b, t) : personX(P, t) < personX(b, t)) ? P : b));
    for (const P of who) {
      const x = personX(P, t), w = walkFor(P, x, edge(s, P) + (s === 'right' ? 1 : -1) * Math.abs(x - personX(lead, t)), t, a.style, a.path);
      occupy(S, P, t, w.end, a); P.presence.push({at: w.end, on: false}); P.on = false;
    }
    record(S, t, a, `${names(who)} go${who.length > 1 ? '' : 'es'} out`);
  },
  pickUp(S, {a, at: t}) {
    const P = person(S, a.who, a.path), n = howMany(a, a.path), travel = travelOf(a, a.path), items = group(S, a.what, a.path);
    onStage(P, t, a.path); ready(P, t, a);
    const lying = items.filter(I => I.on && I.now.type === 'ground' && landed(I, t));
    if (lying.length < n) throw new Error(`${a.path}: ${P.id} picks up ${n} of ${a.what}, and ${lying.length} ${lying.length === 1 ? 'is' : 'are'} on the ground at ${s2(t)} (${describe(items)}): ${items.some(I => I.now.type === 'in') ? 'take a thing out of a container with takeOutOf' : 'a thing someone holds is handed over with give'}`);
    const chosen = lying.slice(-n), go = t + STAGE.arm.move;
    chosen.forEach(I => reachable(S, P, t, I, a.path, a.what));
    face(P, t, itemPoint(S, chosen[0], t)[0]);
    const end = Math.max(go, ...chosen.map((I, k) => move(S, I, {type: 'with', id: P.id}, go + k * .08, travel, a.path)));
    occupy(S, P, t, end, a); arm(P, t, end, chosen[0].key, 'pickUp'); S.sound(go, a.rule.sound);
    record(S, t, a, `${P.id} picks up ${some(n, items, a.what)}`);
  },
  give(S, {a, at: t}) {
    const F = person(S, a.from, a.path, 'from'), T = person(S, a.to, a.path, 'to'), n = howMany(a, a.path), travel = travelOf(a, a.path), items = group(S, a.what, a.path);
    if (F === T) throw new Error(`${a.path}: ${F.id} gives to themself: name someone else in to`);
    onStage(F, t, a.path); onStage(T, t, a.path); ready(F, t, a); ready(T, t, a);
    const held = items.filter(I => I.now.type === 'with' && I.now.id === F.id && landed(I, t));
    if (held.length < n) throw new Error(`${a.path}: ${F.id} gives ${n} of ${a.what} at ${s2(t)} but holds ${held.length} (${a.what}: ${describe(items)}): ${items.some(I => I.now.type === 'in') ? 'take it out of its container first (takeOutOf)' : 'pick it up or be given it first'}`);
    face(F, t, personX(T, t)); face(T, t, personX(F, t));
    const end = Math.max(t, ...held.slice(-n).map((I, k) => move(S, I, {type: 'with', id: T.id}, t + k * .08, travel, a.path)));
    occupy(S, F, t, end, a); occupy(S, T, t, end, a); arm(F, t, end, T.id, 'give'); arm(T, t, end, F.id, 'take'); S.sound(t, a.rule.sound);
    record(S, t, a, `${F.id} gives ${some(n, items, a.what)} to ${T.id}`);
  },
  putInto(S, {a, at: t}) {
    const P = person(S, a.who, a.path), C = container(S, a.into, a.path, 'into'), n = howMany(a, a.path), travel = travelOf(a, a.path), items = group(S, a.what, a.path);
    onStage(P, t, a.path); ready(P, t, a);
    if (!S.items.get(C.id).on) throw new Error(`${a.path}: ${C.id} is not on stage at ${s2(t)}: give it an enter before this`);
    const held = items.filter(I => I.now.type === 'with' && I.now.id === P.id && landed(I, t));
    if (held.length < n) throw new Error(`${a.path}: ${P.id} puts ${n} of ${a.what} into ${C.id} at ${s2(t)} but holds ${held.length} (${a.what}: ${describe(items)}): pick it up or be given it first`);
    const used = C.used.size;
    if (used + n > C.capacity) throw new Error(`${a.path}: ${C.id} holds ${C.capacity} and has ${used} in it at ${s2(t)}: putting ${n} more makes ${used + n} (put at most ${C.capacity - used}, or give ${C.id} more slots)`);
    const box = S.items.get(C.id);
    isOpen(S, C, t, a.path); reachable(S, P, t, box, a.path, C.id); face(P, t, itemPoint(S, box, t)[0]);
    const end = Math.max(t, ...held.slice(-n).map((I, k) => move(S, I, {type: 'in', id: C.id}, t + .1 + k * .12, travel, a.path)));
    occupy(S, P, t, end, a); arm(P, t, end, C.id, 'putInto'); S.sound(end, a.rule.sound);
    record(S, t, a, `${P.id} puts ${some(n, items, a.what)} into ${C.id}`);
  },
  takeOutOf(S, {a, at: t}) {
    const P = person(S, a.who, a.path), C = container(S, a.from, a.path, 'from'), n = howMany(a, a.path), travel = travelOf(a, a.path), items = group(S, a.what, a.path);
    onStage(P, t, a.path); ready(P, t, a);
    const inside = items.filter(I => I.now.type === 'in' && I.now.id === C.id && landed(I, t));
    if (inside.length < n) throw new Error(`${a.path}: ${P.id} takes ${n} of ${a.what} out of ${C.id} at ${s2(t)}, and ${C.id} has ${inside.length} (${a.what}: ${describe(items)}): take at most ${inside.length}`);
    const box = S.items.get(C.id);
    if (!box.on) throw new Error(`${a.path}: ${C.id} is not on stage at ${s2(t)}: give it an enter before this`);
    isOpen(S, C, t, a.path); reachable(S, P, t, box, a.path, C.id); face(P, t, itemPoint(S, box, t)[0]);
    const go = t + STAGE.arm.move, chosen = inside.sort((x, y) => y.now.slot - x.now.slot).slice(0, n);
    const end = Math.max(go, ...chosen.map((I, k) => move(S, I, {type: 'with', id: P.id}, go + k * .12, travel, a.path)));
    occupy(S, P, t, end, a); arm(P, t, end, C.id, 'takeOutOf'); S.sound(go, a.rule.sound);
    record(S, t, a, `${P.id} takes ${some(n, items, a.what)} out of ${C.id}`);
  },
  count(S, e) {
    const {a, at: t, beat: k} = e, c = k === 0 ? startCount(S, e) : S.counting.get(a.i), path = `${a.path}.at[${k}]`, items = group(S, a.what, a.path);
    const pool = items.filter(I => I.on && I.now.type !== 'gone' && holderKey(I.now) === c.source && !(I.now.type === 'in' && I.now.id === c.C.id) && landed(I, t));
    if (!pool.length) throw new Error(`${path}: the count's ${ordinal(k + 1)} beat (${s2(t)}) finds no ${a.what} left to count (${a.what}: ${describe(items)}): ${k ? `count at most ${k}` : `put some ${a.what} where it counts from first`}`);
    if (takeSlot(c.C.used, c.C.capacity) < 0) throw new Error(`${path}: ${c.C.id} holds ${c.C.capacity} and has ${c.C.used.size} in it at ${s2(t)}, so the count's ${ordinal(k + 1)} thing does not fit: count at most ${k} into it, or give ${c.C.id} more slots`);
    pool.sort((x, y) => (y.now.slot ?? 0) - (x.now.slot ?? 0) || x.k - y.k);
    if (k === 0 && c.P) face(c.P, t, itemPoint(S, pool[0], t)[0]);
    const end = move(S, pool[0], {type: 'in', id: c.C.id}, t, c.travel, path);
    S.sound(end, k === a.times.length - 1 ? 'chime' : a.rule.sound);
    c.lands.push(end); c.track.push({at: t, on: pool[0].key});
    if (c.total) c.total.from = Math.min(c.total.from, end);
    if (c.badge === 'each') S.badges.push({mode: 'each', on: pool[0].key, lands: [end], n: k + 1, until: Infinity, from: end});
    record(S, t, a, `${a.what}: ${k + 1} of ${a.times.length} into ${c.C.id}`, {count: k + 1}, path);
  },
  fade(S, {a, at: t}) {
    const items = group(S, a.what, a.path), n = items.length === 1 ? 1 : howMany(a, a.path);
    let pool = items.filter(I => I.on && I.now.type !== 'gone' && landed(I, t));
    if (a.from !== undefined) pool = pool.filter(I => holderKey(I.now) === a.from);
    else if (new Set(pool.map(I => holderKey(I.now))).size > 1) throw new Error(`${a.path}: ${a.what} are ${describe(pool)} at ${s2(t)}: say which go with from`);
    if (pool.length < n) throw new Error(`${a.path}: ${n} of ${a.what} fade at ${s2(t)}, and ${pool.length} ${pool.length === 1 ? 'is' : 'are'} there (${describe(items)}): fade at most ${pool.length}`);
    for (const I of pool.slice(-n)) {
      if (S.containers.get(I.key)?.used.size) throw new Error(`${a.path}: ${I.key} still holds things: move them out first (takeOutOf)`);
      I.fade = {start: t, end: t + STAGE.fade};
      const from = I.now; I.now = {type: 'gone'}; I.stays.push({at: t + STAGE.fade, holder: I.now}); I.freeAt = t + STAGE.fade;
      release(S, from);
    }
    S.sound(t, a.rule.sound); S.until(t + STAGE.fade);
    record(S, t, a, `${some(n, items, a.what)} gone`);
  },
  point(S, {a, at: t}) {
    const P = person(S, a.who, a.path), on = target(S, a.on, t, `${a.path}.on`), end = a.until ?? t + STAGE.hold;
    if (!(end > t)) throw new Error(`${a.path}: until (${s2(end)}) comes before the point starts (${s2(t)}): give an until after it`);
    onStage(P, t, a.path); occupy(S, P, t, end, a); face(P, t, xOf(S, on, t)); arm(P, t, end, on, 'point');
    record(S, t, a, `${P.id} points at ${on}`);
  },
  open(S, e) { door(S, e, true); },
  close(S, e) { door(S, e, false); },
  lookAt(S, {a, at: t}) {
    const on = target(S, a.on, t, `${a.path}.on`, {viewer: true}), who = list(a.who).map(id => person(S, id, a.path));
    for (const P of who) {
      onStage(P, t, a.path);
      if (on === P.id) throw new Error(`${a.path}: ${P.id} looks at themself: name someone or something else`);
      P.looks.push({at: t, on});
    }
    S.until(t + STAGE.look);
    record(S, t, a, `${names(who)} look${who.length > 1 ? '' : 's'} at ${on ?? 'the viewer'}`);
  },
  countOnFingers(S, {a, at: t, beat}) {
    const P = person(S, a.who, a.path);
    if (beat !== null) {
      const up = fingersAt(S.fingerKeys.get(a.i), t).up;
      return record(S, t, a, `${P.id}: ${up} up`, {fingers: up}, `${a.path}.${a.fold ? 'fold' : 'raise'}[${beat}]`);
    }
    if (a.fold && a.raise) throw new Error(`${a.path}: give fold or raise, not both (one count at a time)`);
    const keys = [{at: t, up: a.up}, ...(a.fold ?? []).map(at => ({at, fold: 1})), ...(a.raise ?? []).map(at => ({at, raise: 1}))];
    try { fingersAt(keys, t); } catch (err) { throw new Error(`${a.path}: ${err.message}`, {cause: err}); }
    const last = keys.at(-1).at, end = a.until ?? last + STAGE.fingers;
    if (!(end > last)) throw new Error(`${a.path}: until (${s2(end)}) comes before the last finger moves (${s2(last)}): give an until after it`);
    onStage(P, t, a.path); occupy(S, P, t, end, a);
    P.fingers.push({start: t, end, keys}); S.fingerKeys.set(a.i, keys);
    record(S, t, a, `${P.id} holds up ${a.up}`, {fingers: a.up});
  },
});

