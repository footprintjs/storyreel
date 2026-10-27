/**
 * The stage's action vocabulary: a small fixed list, as data. Each verb says the keys it takes, the ones it needs,
 * the travel a thing it moves goes by (travel.mjs · TRAVELS, a strategy the action may change) and the sound it makes.
 * An unknown verb or key refuses, naming the verbs or the keys. What each verb DOES is plan.mjs's.
 *
 *   who      a cast id (a list where `group` says so)       what   a prop id      n   how many (1 by default)
 *   at       a beat (a list of beats for count)             on     a thing to point or look at (a cast id, a prop id,
 *   to/from  a person, a container, a place, or a side                 a spot, or 'viewer' for lookAt)
 */

export const ACTIONS = Object.freeze({
  walkTo: Object.freeze({keys: ['who', 'to', 'at', 'style'], needs: ['who', 'to', 'at'], group: true}),
  enter: Object.freeze({keys: ['who', 'what', 'at', 'from', 'style'], needs: ['at'], either: ['who', 'what'], group: true}),
  exit: Object.freeze({keys: ['who', 'what', 'at', 'to', 'style'], needs: ['at'], either: ['who', 'what'], group: true}),
  pickUp: Object.freeze({keys: ['who', 'what', 'n', 'at', 'travel'], needs: ['who', 'what', 'at'], travel: 'lift', sound: 'slide'}),
  give: Object.freeze({keys: ['from', 'to', 'what', 'n', 'at', 'travel'], needs: ['from', 'to', 'what', 'at'], travel: 'toss', sound: 'whoosh'}),
  putInto: Object.freeze({keys: ['who', 'what', 'n', 'into', 'at', 'travel'], needs: ['who', 'what', 'into', 'at'], travel: 'drop', sound: 'tap'}),
  takeOutOf: Object.freeze({keys: ['who', 'what', 'n', 'from', 'at', 'travel'], needs: ['who', 'what', 'from', 'at'], travel: 'lift', sound: 'tap'}),
  count: Object.freeze({keys: ['what', 'into', 'from', 'who', 'at', 'badge', 'travel'], needs: ['what', 'into', 'at'], travel: 'hop', sound: 'tap'}),
  fade: Object.freeze({keys: ['what', 'n', 'from', 'at'], needs: ['what', 'at'], sound: 'crumble'}),
  point: Object.freeze({keys: ['who', 'on', 'at', 'until'], needs: ['who', 'on', 'at']}),
  open: Object.freeze({keys: ['what', 'who', 'at'], needs: ['what', 'at'], sound: 'door'}),
  close: Object.freeze({keys: ['what', 'who', 'at'], needs: ['what', 'at'], sound: 'door'}),
  lookAt: Object.freeze({keys: ['who', 'on', 'at'], needs: ['who', 'on', 'at'], group: true}),
  countOnFingers: Object.freeze({keys: ['who', 'at', 'up', 'fold', 'raise', 'until'], needs: ['who', 'at', 'up']}),
});
export const ACTION_NAMES = Object.freeze(Object.keys(ACTIONS));

/** A count's badge, a strategy: one number over the container, a number over each thing, or none. */
export const BADGES = Object.freeze({
  total: 'one number over the container, counting up as each thing lands',
  each: 'a number over each thing as it lands',
  none: 'no number',
});
export const BADGE_NAMES = Object.freeze(Object.keys(BADGES));

const shown = v => JSON.stringify(v) ?? String(v);

/**
 * One action as written → its verb and keys, checked against the vocabulary: `{do}` names a verb, every key is one it
 * takes, every key it needs is there (`either`: exactly one of them). Values are checked where they are used.
 */
export function readAction(action, path) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw new Error(`${path}: an action is {"do": a verb, …}, not ${shown(action)}`);
  const verb = action.do, spec = typeof verb === 'string' && Object.hasOwn(ACTIONS, verb) ? ACTIONS[verb] : null;
  if (!spec) throw new Error(`${path}: "do" is one of ${ACTION_NAMES.join(', ')}, not ${shown(verb)}`);
  for (const key of Object.keys(action)) if (key !== 'do' && !spec.keys.includes(key)) throw new Error(`${path}: ${verb} has no key "${key}" (it takes ${spec.keys.join(', ')})`);
  for (const key of spec.needs) if (action[key] === undefined) throw new Error(`${path}: ${verb} needs ${key} (it takes ${spec.keys.join(', ')})`);
  if (spec.either && spec.either.filter(k => action[k] !== undefined).length !== 1) throw new Error(`${path}: ${verb} takes ${spec.either.join(' or ')} (a person walks, a prop pops), exactly one`);
  return spec;
}
