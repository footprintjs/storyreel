/**
 * The continuity record. After every event — each action's beat, and each beat of a count or a count on fingers — the
 * ledger says who holds what, how many are where (a thing on its way counts where it is going), and who is on stage;
 * the facts are the same story as flat names for the film's continuity check ("apples in bag": 10, "bag": "with
 * girl"). Records keyed by a recipe's names are Maps until they are handed out (own.mjs · plain).
 */
import {plain} from './own.mjs';
import {holderKey, holderName, nowOf} from './say.mjs';

/** The story as it stands: {where: {prop: {holder: n}}, holds: {person: {prop: n}}, on: [people on stage]}. */
export function snapshot(S) {
  const where = new Map(), holds = new Map(), add = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const [prop, keys] of S.groups) {
    const counts = new Map();
    for (const key of keys) {
      const h = nowOf(S.items.get(key));
      add(counts, holderKey(h));
      if (h.type === 'with') { if (!holds.has(h.id)) holds.set(h.id, new Map()); add(holds.get(h.id), prop); }
    }
    where.set(prop, counts);
  }
  return {where: plain(where), holds: plain(holds), on: [...S.people.values()].filter(P => P.on).map(P => P.id)};
}

/**
 * The story as flat facts: a single thing by where it is ("bag": "with girl"); a group by how many are in each
 * container, with each person and on the ground, zeros included, so the next shot that starts differently is caught.
 */
export function facts(S) {
  const out = new Map(), people = [...S.people.keys()], conts = [...S.containers.keys()];
  for (const [prop, keys] of S.groups) {
    const items = keys.map(k => S.items.get(k));
    if (keys.length === 1) { out.set(prop, holderName(nowOf(items[0]))); continue; }
    const count = test => items.filter(I => test(nowOf(I))).length;
    for (const c of conts) if (c !== prop) out.set(`${prop} in ${c}`, count(h => h.type === 'in' && h.id === c));
    for (const p of people) out.set(`${prop} with ${p}`, count(h => h.type === 'with' && h.id === p));
    out.set(`${prop} on the ground`, count(h => h.type === 'ground'));
  }
  return plain(out);
}

/** One ledger entry at t for an action (or one beat of it: `path`), in words, with the story as it now stands. */
export function record(S, t, a, said, extra = {}, path = a.path) {
  S.ledger.push({at: +t.toFixed(3), path: path.slice(S.where.length + 2), do: a.do, said, ...snapshot(S), ...extra});
}
