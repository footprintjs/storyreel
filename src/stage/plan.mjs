/**
 * The stage's plan: the actions played through once, in time order, as data the frame reads (positions.mjs,
 * scene.mjs). Each action is checked against the story so far and refused, naming the fix, when it cannot happen:
 * a thing you do not hold, an 11th thing into 10 slots, a shut lid, someone out of reach, off stage, or busy.
 *
 * What it builds:
 *   people   each person's walks, the way they face, presence, arms, looks and fingers over time
 *   items    each thing's stays (holder from a time) and trips (from one holder to another, by a travel)
 *   badges   each count's number, sounds  the stage's own sounds
 *   ledger   after every beat: who holds what, how many are where, who is on stage (the continuity record)
 *   facts    {start, end}: flat facts for the film's continuity check ("apples in bag": 10, "bag": "with customer")
 */
import {walk as planWalk} from '../walk.mjs';
import {fingersAt} from '../fingers.mjs';
import {MOVES} from '../moves.mjs';
import {STAGE, swingSeconds} from './timing.mjs';
import {TRAVELS, readTravel} from './travel.mjs';
import {BADGE_NAMES} from './vocabulary.mjs';
import {personX, presentAt, itemPoint, holderPoint, headAt, itemShown} from './positions.mjs';

const shown = v => JSON.stringify(v) ?? String(v);
const s2 = t => `${t.toFixed(2)} s`;
const list = v => (Array.isArray(v) ? v : [v]);
const EPS = 1e-9;

/** Where a holder is, in words: "in bag", "with customer", "on the ground", "gone", "off stage". */
const holderName = h => (h.type === 'in' ? `in ${h.id}` : h.type === 'with' ? `with ${h.id}` : h.type === 'ground' ? 'on the ground' : h.type === 'gone' ? 'gone' : 'off stage');
/** The ledger's short key for a holder: the container's or person's id, or ground, gone, offstage. */
const holderKey = h => (h.type === 'in' || h.type === 'with' ? h.id : h.type === 'off' ? 'offstage' : h.type);

export function planStage(stage) {
  const {where, place, cast, props, actions} = stage, floor = place.adapter.floor;
  const plan = {stage, floor, popOut: MOVES['pop-out'].seconds, people: new Map(), items: new Map(), groups: new Map(), containers: new Map(),
    doors: new Map(), badges: [], sounds: [], ledger: [], end: 0};
  const sound = (time, type) => { if (stage.sounds && type) plan.sounds.push({time, type}); };
  const until = t => { plan.end = Math.max(plan.end, t); };

  // ── who and what ────────────────────────────────────────────────────────────────────────────────────────────────
  const names = a => [a.who, a.from, a.to].flatMap(v => (v === undefined ? [] : list(v))).filter(v => typeof v === 'string');
  for (const c of cast) {
    const first = actions.find(a => names(a).includes(c.id)), off = first?.do === 'enter' && list(first.who ?? []).includes(c.id);
    plan.people.set(c.id, {id: c.id, kind: c.kind, adapter: c.adapter, size: c.size, reach: c.reach ?? STAGE.reach * c.size, x0: c.x,
      presence: [{at: -Infinity, on: !off}], walks: [], facings: [{at: -Infinity, facing: c.facing}], arms: [], looks: [], fingers: [], doing: [],
      on: !off, busyUntil: -Infinity, busyWith: null, hands: new Map()});
  }
  for (const p of props) {
    const keys = p.count === 1 ? [p.id] : Array.from({length: p.count}, (_, k) => `${p.id}#${k + 1}`);
    const first = actions.find(a => a.what === p.id), off = first?.do === 'enter';
    plan.groups.set(p.id, keys);
    keys.forEach((key, k) => plan.items.set(key, {key, prop: p.id, k, kind: p.kind, adapter: p.adapter, size: p.adapter.size, stays: [], trips: [],
      fade: null, pops: {in: off ? Infinity : null, out: null}, on: !off, now: null, freeAt: -Infinity}));
    if (p.container) plan.containers.set(p.id, {id: p.id, adapter: p.adapter, capacity: p.capacity, used: new Map(), busyUntil: -Infinity});
    if (p.opens) plan.doors.set(p.id, {doors: [{at: -Infinity, open: p.open}], open: p.open});
  }
  const person = (id, path, what = 'who') => {
    const P = typeof id === 'string' ? plan.people.get(id) : null;
    if (!P) throw new Error(`${path}: ${what} is a cast member (${[...plan.people.keys()].join(', ') || 'the cast is empty'}), not ${shown(id)}`);
    return P;
  };
  const group = (id, path, what = 'what') => {
    const keys = typeof id === 'string' ? plan.groups.get(id) : null;
    if (!keys) throw new Error(`${path}: ${what} is a prop (${[...plan.groups.keys()].join(', ') || 'there are no props'}), not ${shown(id)}`);
    return keys.map(k => plan.items.get(k));
  };
  const container = (id, path, what) => {
    const C = typeof id === 'string' ? plan.containers.get(id) : null;
    if (!C) throw new Error(`${path}: ${what} is a container (${[...plan.containers.keys()].join(', ') || 'there are none: a container is a prop whose kind has slots'}), not ${shown(id)}`);
    return C;
  };
  const howMany = (a, path) => {
    if (a.n === undefined) return 1;
    if (!(Number.isInteger(a.n) && a.n >= 1)) throw new Error(`${path}: n is how many, a whole number of 1 or more, not ${shown(a.n)}`);
    return a.n;
  };

  // ── placing things in holders ───────────────────────────────────────────────────────────────────────────────────
  const takeSlot = (map, capacity) => { for (let s = 0; s < capacity; s++) if (!map.has(s)) return s; return -1; };
  const holderFor = (spec, I) => {
    if (spec.type === 'ground') return spec;
    if (spec.type === 'in') { const C = plan.containers.get(spec.id), slot = takeSlot(C.used, C.capacity); C.used.set(slot, I.key); return {type: 'in', id: spec.id, slot}; }
    const P = plan.people.get(spec.id), slot = takeSlot(P.hands, Infinity); P.hands.set(slot, I.key); return {type: 'with', id: spec.id, slot};
  };
  const release = h => { if (h.type === 'in') plan.containers.get(h.id).used.delete(h.slot); else if (h.type === 'with') plan.people.get(h.id).hands.delete(h.slot); };
  for (const p of props) {
    const keys = plan.groups.get(p.id);
    keys.forEach((key, k) => {
      const I = plan.items.get(key), w = p.adapter.size[0] * 1.1;
      I.now = p.start.type === 'ground' ? {type: 'ground', at: p.start.at, dx: (k - (keys.length - 1) / 2) * w} : holderFor(p.start, I);
      I.stays.push({at: -Infinity, holder: I.now});
    });
  }

  // ── the state the story is in, and its record ───────────────────────────────────────────────────────────────────
  const snapshot = () => {
    const whereNow = {}, holds = {};
    for (const [prop, keys] of plan.groups) {
      const counts = {};
      for (const key of keys) {
        const I = plan.items.get(key), h = I.on || I.now.type === 'gone' ? I.now : {type: 'off'}, k = holderKey(h);
        counts[k] = (counts[k] ?? 0) + 1;
        if (h.type === 'with') (holds[h.id] ??= {})[prop] = (holds[h.id][prop] ?? 0) + 1;
      }
      whereNow[prop] = counts;
    }
    return {where: whereNow, holds, on: [...plan.people.values()].filter(P => P.on).map(P => P.id)};
  };
  const facts = () => {
    const out = {}, people = [...plan.people.keys()], conts = [...plan.containers.keys()];
    for (const [prop, keys] of plan.groups) {
      const items = keys.map(k => plan.items.get(k)), now = I => (I.on || I.now.type === 'gone' ? I.now : {type: 'off'});
      if (keys.length === 1) { out[prop] = holderName(now(items[0])); continue; }
      const count = test => items.filter(I => test(now(I))).length;
      for (const c of conts) if (c !== prop) out[`${prop} in ${c}`] = count(h => h.type === 'in' && h.id === c);
      for (const p of people) out[`${prop} with ${p}`] = count(h => h.type === 'with' && h.id === p);
      out[`${prop} on the ground`] = count(h => h.type === 'ground');
    }
    return out;
  };
  const record = (at, a, said, extra = {}) => plan.ledger.push({at: +at.toFixed(3), path: a.path.slice(where.length + 2), do: a.do, said, ...snapshot(), ...extra});
  const startFacts = facts();

  // ── refusals every action shares ────────────────────────────────────────────────────────────────────────────────
  const onStage = (P, t, path) => { if (!P.on) throw new Error(`${path}: ${P.id} is off stage at ${s2(t)}: give them an enter before this action`); };
  /** One action at a time: a person is ready for an action once the one before has ended. */
  const ready = (P, from, a) => {
    if (from < P.busyUntil - EPS) throw new Error(`${a.path} (${a.do}): ${P.id} is still busy with ${P.busyWith} until ${s2(P.busyUntil)}, and this starts at ${s2(from)}: one action at a time (start it after, or give the one before less to do)`);
  };
  const occupy = (P, from, to, a) => {
    ready(P, from, a);
    P.busyUntil = Math.max(P.busyUntil, to); P.busyWith = `${a.path.slice(where.length + 2)} (${a.do})`; P.doing.push({start: from, end: to, verb: a.do});
    until(to);
  };
  const face = (P, t, x) => { const d = Math.sign(x - personX(P, t)); if (d) P.facings.push({at: t, facing: d}); };
  const reachable = (P, t, I, path, what) => {
    const at = itemPoint(plan, I, t), x = personX(P, t);
    if (Math.abs(at[0] - x) > P.reach + EPS) throw new Error(`${path}: ${P.id} (at x ${Math.round(x)}) is ${Math.round(Math.abs(at[0] - x))} px from ${what} (at x ${Math.round(at[0])}) at ${s2(t)}, and reaches ${Math.round(P.reach)}: give ${P.id} a walkTo to it first`);
  };
  const isOpen = (C, t, path) => {
    if (plan.doors.get(C.id)?.open === false) throw new Error(`${path}: ${C.id} is shut at ${s2(t)}: open it first`);
  };
  const free = (I, t, path) => {
    if (t < I.freeAt - EPS) throw new Error(`${path}: ${I.key} is still on its way until ${s2(I.freeAt)}; it moves again only once it has landed`);
  };
  const describe = items => {
    const by = new Map();
    for (const I of items) { const n = I.on || I.now.type === 'gone' ? holderName(I.now) : 'off stage'; by.set(n, (by.get(n) ?? 0) + 1); }
    return [...by].map(([n, k]) => `${k} ${n}`).join(', ') || 'none';
  };

  /** Move a thing to a holder on a trip: it leaves its holder as it sets off and takes its new slot as it lands. */
  const move = (I, to, start, travel, path) => {
    free(I, start, path);
    const from = I.now;
    if (from.type === 'in') { const C = plan.containers.get(from.id); isOpen(C, start, path); C.busyUntil = Math.max(C.busyUntil, start + TRAVELS[travel].seconds); }
    const C = to.type === 'in' ? plan.containers.get(to.id) : null;
    if (C) {
      for (let c = C; c; c = plan.containers.get(plan.items.get(c.id).now.id)) if (c.id === I.key) throw new Error(`${path}: ${I.key} cannot go into ${to.id}, which is inside it: put it somewhere else`);
      if (takeSlot(C.used, C.capacity) < 0) throw new Error(`${path}: ${C.id} holds ${C.capacity}, and it is full: give it more slots, or put the thing somewhere else`);
      isOpen(C, start, path);
    }
    const self = plan.containers.get(I.key);
    if (self && start < self.busyUntil - EPS) throw new Error(`${path}: ${I.key} is still being filled or emptied until ${s2(self.busyUntil)}; move it once the last thing has landed`);
    release(from);
    const holder = holderFor(to, I), end = start + TRAVELS[travel].seconds;
    I.trips.push({start, end, from, to: holder, travel});
    I.stays.push({at: end, holder});
    I.now = holder; I.freeAt = end;
    if (C) C.busyUntil = Math.max(C.busyUntil, end);
    until(end);
    return end;
  };
  const travelOf = (a, path) => readTravel(a.travel ?? a.rule.travel, `${path}.travel`);

  /** A thing a person may point or look at, at t: a person on stage, a prop on stage, a spot, a region of the place. */
  const target = (on, t, path, {viewer = false} = {}) => {
    if (viewer && on === 'viewer') return null;
    if (plan.people.has(on)) { if (!plan.people.get(on).on) throw new Error(`${path}: ${on} is off stage at ${s2(t)}: give them an enter before this, or name someone on stage`); return on; }
    if (plan.groups.has(on)) { if (!group(on, path).some(I => I.on && I.now.type !== 'gone')) throw new Error(`${path}: no ${on} is on stage at ${s2(t)}: give it an enter before this, or name a thing on stage`); return on; }
    if (place.adapter.spots?.[on] || place.adapter.regions?.[on]) return on;
    throw new Error(`${path}: on is a cast member, a prop, a spot or a region of the place${viewer ? ', or "viewer"' : ''} (${[...plan.people.keys(), ...plan.groups.keys(), ...Object.keys(place.adapter.spots ?? {}), ...Object.keys(place.adapter.regions ?? {})].join(', ')}), not ${shown(on)}`);
  };
  const xOf = (on, t) => {
    if (plan.people.has(on)) return personX(plan.people.get(on), t);
    if (plan.groups.has(on)) { const xs = group(on, '').filter(I => I.on && I.now.type !== 'gone').map(I => itemPoint(plan, I, t)[0]); return xs.reduce((a, b) => a + b, 0) / xs.length; }
    const s = place.adapter.spots?.[on]; if (s) return s[0];
    const r = place.adapter.regions[on]; return (r[0] + r[2]) / 2;
  };
  const arm = (P, start, end, on, why, track = null) => P.arms.push({start, end, on, why, ...(track ? {track} : {})});

  // ── the actions ─────────────────────────────────────────────────────────────────────────────────────────────────
  const edge = (side, P) => (side === 'left' ? -(P.size / 2 + STAGE.offstage) : 1600 + P.size / 2 + STAGE.offstage);
  const side = (v, path, key) => { if (v === undefined || v === 'left' || v === 'right') return v; throw new Error(`${path}: ${key} is "left" or "right", not ${shown(v)}`); };
  const walkTo = (P, from, to, start, style, path) => {
    let w;
    try { w = planWalk({from, to, start, size: P.size, style: style ?? P.adapter.walk ?? 'stroll'}); } catch (e) { throw new Error(`${path}: ${e.message}`, {cause: e}); }
    P.walks.push({start, end: w.end, plan: w});
    if (w.steps) P.facings.push({at: start, facing: w.facing});
    return w;
  };
  const DO = {
    walkTo(a, path) {
      const who = list(a.who).map(id => person(id, path)), t = a.start, lead = who[0], x0 = personX(lead, t);
      who.forEach(P => onStage(P, t, path));
      let to;
      if (Number.isFinite(a.to)) to = a.to;
      else if (typeof a.to === 'string') {
        const thing = target(a.to, t, `${path}.to`), x = xOf(thing, t), dir = Math.sign(x - x0) || 1;
        to = place.adapter.spots?.[a.to] ? x : x - dir * (plan.people.has(a.to) ? (lead.size + plan.people.get(a.to).size) * .3 : lead.reach * .55);
      } else throw new Error(`${path}: to is an x on the floor, a spot, a prop or a cast member, not ${shown(a.to)}`);
      for (const P of who) { const w = walkTo(P, personX(P, t), to + personX(P, t) - x0, t, a.style, path); occupy(P, t, w.end, a); }
      record(t, a, `${who.map(P => P.id).join(' and ')} walk${who.length > 1 ? '' : 's'} to ${typeof a.to === 'string' ? a.to : `x ${Math.round(to)}`}`);
    },
    enter(a, path) {
      const t = a.start;
      if (a.what !== undefined) {
        const items = group(a.what, path);
        if (items[0].on) throw new Error(`${path}: ${a.what} is already on stage at ${s2(t)} (a prop enters once, at its first action)`);
        for (const I of items) { I.pops.in = t; I.on = true; }
        sound(t, 'settle'); until(t + MOVES.pop.seconds);
        return record(t, a, `${a.what} appears`);
      }
      const who = list(a.who).map(id => person(id, path)), from = side(a.from, path, 'from');
      for (const P of who) {
        if (P.on) throw new Error(`${path}: ${P.id} is already on stage at ${s2(t)}: leave this enter out, or give them an exit before it`);
        const s = from ?? (P.x0 < 800 ? 'left' : 'right'), w = walkTo(P, edge(s, P), P.x0, t, a.style, path);
        P.presence.push({at: t, on: true}); P.on = true; occupy(P, t, w.end, a);
      }
      record(t, a, `${who.map(P => P.id).join(' and ')} come${who.length > 1 ? '' : 's'} in`);
    },
    exit(a, path) {
      const t = a.start;
      if (a.what !== undefined) {
        const items = group(a.what, path);
        if (!items.some(I => I.on)) throw new Error(`${path}: ${a.what} is not on stage at ${s2(t)}`);
        for (const I of items) if (I.on) { I.pops.out = t; I.on = false; }
        until(t + plan.popOut);
        return record(t, a, `${a.what} goes`);
      }
      const who = list(a.who).map(id => person(id, path)), to = side(a.to, path, 'to');
      who.forEach(P => onStage(P, t, path));
      const s = to ?? (personX(who[0], t) < 800 ? 'left' : 'right'), lead = who.reduce((b, P) => ((s === 'right' ? personX(P, t) > personX(b, t) : personX(P, t) < personX(b, t)) ? P : b));
      for (const P of who) {
        const x = personX(P, t), w = walkTo(P, x, edge(s, P) + (s === 'right' ? 1 : -1) * Math.abs(x - personX(lead, t)), t, a.style, path);
        occupy(P, t, w.end, a); P.presence.push({at: w.end, on: false}); P.on = false;
      }
      record(t, a, `${who.map(P => P.id).join(' and ')} go${who.length > 1 ? '' : 'es'} out`);
    },
    pickUp(a, path) {
      const P = person(a.who, path), t = a.start, n = howMany(a, path), travel = travelOf(a, path), items = group(a.what, path);
      onStage(P, t, path); ready(P, t, a);
      const lying = items.filter(I => I.on && I.now.type === 'ground');
      if (lying.length < n) throw new Error(`${path}: ${P.id} picks up ${n} of ${a.what}, and ${lying.length} ${lying.length === 1 ? 'is' : 'are'} on the ground at ${s2(t)} (${describe(items)}): ${items.some(I => I.now.type === 'in') ? 'take a thing out of a container with takeOutOf' : 'a thing someone holds is handed over with give'}`);
      const chosen = lying.slice(-n), go = t + STAGE.arm.move;
      chosen.forEach(I => reachable(P, t, I, path, a.what));
      face(P, t, itemPoint(plan, chosen[0], t)[0]);
      let end = go;
      chosen.forEach((I, k) => { end = Math.max(end, move(I, {type: 'with', id: P.id}, go + k * .08, travel, path)); });
      arm(P, t, end, chosen[0].key, 'pickUp'); occupy(P, t, end, a); sound(go, a.rule.sound);
      record(t, a, `${P.id} picks up ${n > 1 || items.length > 1 ? `${n} of ` : ''}${a.what}`);
    },
    give(a, path) {
      const F = person(a.from, path, 'from'), T = person(a.to, path, 'to'), t = a.start, n = howMany(a, path), travel = travelOf(a, path), items = group(a.what, path);
      if (F === T) throw new Error(`${path}: ${F.id} gives to themself; give names two cast members`);
      onStage(F, t, path); onStage(T, t, path); ready(F, t, a); ready(T, t, a);
      const held = items.filter(I => I.now.type === 'with' && I.now.id === F.id);
      if (held.length < n) throw new Error(`${path}: ${F.id} gives ${n} of ${a.what} at ${s2(t)} but holds ${held.length} (${a.what}: ${describe(items)}): ${items.some(I => I.now.type === 'in') ? 'take it out of its container first (takeOutOf)' : 'pick it up or be given it first'}`);
      const chosen = held.slice(-n);
      face(F, t, personX(T, t)); face(T, t, personX(F, t));
      let end = t;
      chosen.forEach((I, k) => { end = Math.max(end, move(I, {type: 'with', id: T.id}, t + k * .08, travel, path)); });
      arm(F, t, end, T.id, 'give'); arm(T, t, end, F.id, 'take');
      occupy(F, t, end, a); occupy(T, t, end, a); sound(t, a.rule.sound);
      record(t, a, `${F.id} gives ${n > 1 || items.length > 1 ? `${n} of ` : ''}${a.what} to ${T.id}`);
    },
    putInto(a, path) {
      const P = person(a.who, path), C = container(a.into, path, 'into'), t = a.start, n = howMany(a, path), travel = travelOf(a, path), items = group(a.what, path);
      onStage(P, t, path); ready(P, t, a);
      if (!plan.items.get(C.id).on) throw new Error(`${path}: ${C.id} is not on stage at ${s2(t)}`);
      const held = items.filter(I => I.now.type === 'with' && I.now.id === P.id);
      if (held.length < n) throw new Error(`${path}: ${P.id} puts ${n} of ${a.what} into ${C.id} at ${s2(t)} but holds ${held.length} (${a.what}: ${describe(items)}): pick it up or be given it first`);
      const used = C.used.size;
      if (used + n > C.capacity) throw new Error(`${path}: ${C.id} holds ${C.capacity} and has ${used} in it at ${s2(t)}: putting ${n} more makes ${used + n} (put at most ${C.capacity - used}, or give ${C.id} more slots)`);
      isOpen(C, t, path); reachable(P, t, plan.items.get(C.id), path, C.id); face(P, t, itemPoint(plan, plan.items.get(C.id), t)[0]);
      let end = t;
      held.slice(-n).forEach((I, k) => { end = Math.max(end, move(I, {type: 'in', id: C.id}, t + .1 + k * .12, travel, path)); });
      arm(P, t, end, C.id, 'putInto'); occupy(P, t, end, a); sound(end, a.rule.sound);
      record(t, a, `${P.id} puts ${n > 1 || items.length > 1 ? `${n} of ` : ''}${a.what} into ${C.id}`);
    },
    takeOutOf(a, path) {
      const P = person(a.who, path), C = container(a.from, path, 'from'), t = a.start, n = howMany(a, path), travel = travelOf(a, path), items = group(a.what, path);
      onStage(P, t, path); ready(P, t, a);
      const inside = items.filter(I => I.now.type === 'in' && I.now.id === C.id);
      if (inside.length < n) throw new Error(`${path}: ${P.id} takes ${n} of ${a.what} out of ${C.id} at ${s2(t)}, and ${C.id} has ${inside.length} (${a.what}: ${describe(items)})`);
      if (!itemShown(plan, plan.items.get(C.id), t)) throw new Error(`${path}: ${C.id} is not on stage at ${s2(t)}`);
      isOpen(C, t, path); reachable(P, t, plan.items.get(C.id), path, C.id); face(P, t, itemPoint(plan, plan.items.get(C.id), t)[0]);
      const go = t + STAGE.arm.move, chosen = inside.sort((x, y) => y.now.slot - x.now.slot).slice(0, n);
      let end = go;
      chosen.forEach((I, k) => { end = Math.max(end, move(I, {type: 'with', id: P.id}, go + k * .12, travel, path)); });
      arm(P, t, end, C.id, 'takeOutOf'); occupy(P, t, end, a); sound(go, a.rule.sound);
      record(t, a, `${P.id} takes ${n > 1 || items.length > 1 ? `${n} of ` : ''}${a.what} out of ${C.id}`);
    },
    count(a, path) {
      const C = container(a.into, path, 'into'), items = group(a.what, path), travel = travelOf(a, path), times = a.times, badge = a.badge ?? 'total';
      if (!BADGE_NAMES.includes(badge)) throw new Error(`${path}: badge is one of ${BADGE_NAMES.join(', ')}, not ${shown(badge)}`);
      if (!plan.items.get(C.id).on) throw new Error(`${path}: ${C.id} is not on stage at ${s2(times[0])}`);
      let pool = items.filter(I => I.on && !(I.now.type === 'in' && I.now.id === C.id) && I.now.type !== 'gone');
      if (a.from !== undefined) {
        if (!plan.containers.has(a.from) && !plan.people.has(a.from) && a.from !== 'ground') throw new Error(`${path}: from is a container, a cast member or "ground", not ${shown(a.from)}`);
        pool = pool.filter(I => holderKey(I.now) === a.from);
      } else if (new Set(pool.map(I => holderKey(I.now))).size > 1) throw new Error(`${path}: ${a.what} to count are ${describe(pool)}: say which with from`);
      if (pool.length < times.length) throw new Error(`${path}: count names ${times.length} beats, one per thing, but ${pool.length} of ${a.what} ${pool.length === 1 ? 'is' : 'are'} there to count (${describe(items)})`);
      const used = C.used.size;
      if (used + times.length > C.capacity) throw new Error(`${path}: ${C.id} holds ${C.capacity} and has ${used} in it: counting ${times.length} into it makes ${used + times.length} (count at most ${C.capacity - used}, or give ${C.id} more slots)`);
      pool.sort((x, y) => (y.now.slot ?? 0) - (x.now.slot ?? 0) || x.k - y.k);
      const P = a.who !== undefined ? person(a.who, path) : null;
      if (P) { onStage(P, times[0], path); occupy(P, times[0], times.at(-1) + TRAVELS[travel].seconds, a); face(P, times[0], itemPoint(plan, pool[0], times[0])[0]); }
      const lands = times.map((t, k) => {
        const I = pool[k], end = move(I, {type: 'in', id: C.id}, t, travel, `${path}.at[${k}]`);
        sound(end, k === times.length - 1 ? 'chime' : a.rule.sound);
        record(t, {...a, path: `${a.path}.at[${k}]`}, `${a.what}: ${k + 1} of ${times.length} into ${C.id}`, {count: k + 1});
        return {key: I.key, at: end};
      });
      if (P) arm(P, times[0], lands.at(-1).at, lands[0].key, 'count', times.map((t, k) => ({at: t, on: lands[k].key})));
      if (badge === 'total') plan.badges.push({mode: 'total', on: C.id, lands: lands.map(l => l.at), until: Infinity, from: lands[0].at});
      if (badge === 'each') lands.forEach((l, k) => plan.badges.push({mode: 'each', on: l.key, lands: [l.at], n: k + 1, until: Infinity, from: l.at}));
    },
    fade(a, path) {
      const t = a.start, items = group(a.what, path), n = items.length === 1 ? 1 : howMany(a, path);
      let pool = items.filter(I => I.on && I.now.type !== 'gone' && t >= I.freeAt - EPS);
      if (a.from !== undefined) pool = pool.filter(I => holderKey(I.now) === a.from);
      else if (new Set(pool.map(I => holderKey(I.now))).size > 1) throw new Error(`${path}: ${a.what} are ${describe(pool)} at ${s2(t)}: say which go with from`);
      if (pool.length < n) throw new Error(`${path}: ${n} of ${a.what} fade at ${s2(t)}, and ${pool.length} ${pool.length === 1 ? 'is' : 'are'} there (${describe(items)}): fade at most ${pool.length}`);
      for (const I of pool.slice(-n)) {
        if (plan.containers.get(I.key)?.used.size) throw new Error(`${path}: ${I.key} still holds things: move them out first (takeOutOf)`);
        I.fade = {start: t, end: t + STAGE.fade}; release(I.now); I.now = {type: 'gone'}; I.stays.push({at: t + STAGE.fade, holder: I.now}); I.freeAt = t + STAGE.fade;
      }
      sound(t, a.rule.sound); until(t + STAGE.fade);
      record(t, a, `${n > 1 || items.length > 1 ? `${n} of ` : ''}${a.what} gone`);
    },
    point(a, path) {
      const P = person(a.who, path), t = a.start, on = target(a.on, t, `${path}.on`), end = a.until ?? t + STAGE.hold;
      if (!(end > t)) throw new Error(`${path}: until (${s2(end)}) comes before the point starts (${s2(t)}): give an until after it`);
      onStage(P, t, path); face(P, t, xOf(on, t)); arm(P, t, end, on, 'point'); occupy(P, t, end, a);
      record(t, a, `${P.id} points at ${on}`);
    },
    open(a, path) { door(a, path, true); },
    close(a, path) { door(a, path, false); },
    lookAt(a, path) {
      const t = a.start, on = target(a.on, t, `${path}.on`, {viewer: true});
      for (const P of list(a.who).map(id => person(id, path))) {
        onStage(P, t, path);
        if (on === P.id) throw new Error(`${path}: ${P.id} looks at themself: name someone or something else`);
        P.looks.push({at: t, on});
      }
      until(t + STAGE.look);
      record(t, a, `${list(a.who).join(' and ')} look${list(a.who).length > 1 ? '' : 's'} at ${on ?? 'the viewer'}`);
    },
    countOnFingers(a, path) {
      const P = person(a.who, path), t = a.start;
      if (a.fold && a.raise) throw new Error(`${path}: give fold or raise, not both (one count at a time)`);
      const keys = [{at: t, up: a.up}, ...(a.fold ?? []).map(at => ({at, fold: 1})), ...(a.raise ?? []).map(at => ({at, raise: 1}))];
      try { fingersAt(keys, t); } catch (e) { throw new Error(`${path}: ${e.message}`, {cause: e}); }
      const last = keys.at(-1).at, end = a.until ?? last + STAGE.fingers;
      if (!(end > last)) throw new Error(`${path}: until (${s2(end)}) comes before the last finger moves (${s2(last)}): give an until after it`);
      onStage(P, t, path); occupy(P, t, end, a);
      P.fingers.push({from: t, until: end, keys});
      record(t, a, `${P.id} holds up ${a.up}`, {fingers: a.up});
      keys.slice(1).forEach((k, i) => { const up = fingersAt(keys, k.at).up; record(k.at, {...a, path: `${a.path}.${a.fold ? 'fold' : 'raise'}[${i}]`}, `${P.id}: ${up} up`, {fingers: up}); });
    },
  };
  function door(a, path, open) {
    const t = a.start, items = group(a.what, path), C = plan.containers.get(a.what), D = plan.doors.get(a.what);
    if (!D) throw new Error(`${path}: ${a.what} has no door or lid (the kit's "${items[0].kind}" does not open)`);
    if (D.open === open) throw new Error(`${path}: ${a.what} is already ${open ? 'open' : 'shut'} at ${s2(t)}`);
    if (!open && C && t < C.busyUntil - EPS) throw new Error(`${path}: ${a.what} shuts at ${s2(t)} while things still go in or out: close it at ${s2(C.busyUntil)} or later`);
    if (a.who !== undefined) {
      const P = person(a.who, path); onStage(P, t, path); reachable(P, t, items[0], path, a.what); face(P, t, itemPoint(plan, items[0], t)[0]);
      arm(P, t, t + STAGE.door.move, a.what, open ? 'open' : 'close'); occupy(P, t, t + STAGE.door.move, a);
    }
    D.doors.push({at: t, open}); D.open = open; until(t + swingSeconds(STAGE.door));
    sound(t, a.rule.sound);
    record(t, a, `${a.what} ${open ? 'opens' : 'shuts'}`);
  }

  for (const a of actions) DO[a.do](a, a.path);

  // A count's number stays until something next goes in or out of that container (or the thing itself moves on).
  for (const b of plan.badges) {
    const after = b.lands.at(-1), next = (I, from) => I.trips.find(tr => tr.start >= from - EPS)?.start ?? I.fade?.start ?? Infinity;
    if (b.mode === 'each') b.until = next(plan.items.get(b.on), after);
    else b.until = Math.min(next(plan.items.get(b.on), after), ...[...plan.items.values()].flatMap(I => I.trips.filter(tr => tr.start > after + EPS && ((tr.from.type === 'in' && tr.from.id === b.on) || (tr.to.type === 'in' && tr.to.id === b.on))).map(tr => tr.start)));
  }
  plan.ledger = Object.freeze(plan.ledger.map(Object.freeze));
  plan.facts = Object.freeze({start: Object.freeze(startFacts), end: Object.freeze(facts())});
  plan.sounds.sort((x, y) => x.time - y.time);
  return plan;
}

export {headAt, holderPoint, presentAt};
