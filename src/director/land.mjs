/**
 * Where the director's keys land in a recipe — the adapters. Two:
 *
 *   worlds   a world whose kit takes direction gets its keys in its own spec, under the keys the kit names. A story kit
 *            says so with `direction` (an object, or a function of the world's spec, null for a world it does not
 *            direct): {camera?: "camera", acting?: "acting", moods?: [..] | {who: [..]}, rest?: "calm", groups?: true} —
 *            camera: the spec key that takes framing keys [{at, on, size?}] (on: a name in its regionsAt, or "wide");
 *            acting: the spec key that takes mood keys {who: [{at, mood}]}; moods: what it can act; rest: the mood a
 *            held one returns to; groups: its camera frames several names together (on: [a, b], the box round them),
 *            so two people talking are framed as a two-shot.
 *   focus    the film's own focus (attention.mjs): {"strategy": "camera", "keys": [...]}, framing what the picture names
 *            (several names: the box round them). It frames the pictures whose kit takes no framing keys.
 *
 * One camera, one check (cameraTaken), for both: the recipe's own focus, a push note, the recipe's camera moves, a world
 * spec that frames itself, and — for the focus — a world whose own camera moves. Explicit keys always win: a world spec
 * that already has its camera key keeps it and takes none of the director's; acting is kept person by person (a person
 * the spec acts keeps their keys, the others get the director's). What did not land is kept in the record, with why.
 * Pure: a placement is data, applied to a copy.
 */

const DECLARATION_KEYS = ['camera', 'acting', 'moods', 'rest', 'groups'];

/** A kit's direction for one world spec, checked: {camera, acting, moods, rest} or null (it takes none). */
export function kitDirection(kit, spec, where) {
  const given = typeof kit?.direction === 'function' ? kit.direction(spec) : kit?.direction;
  if (given === undefined || given === null) return null;
  const name = `${where}: the kit "${spec.kit}"'s direction`;
  if (typeof given !== 'object' || Array.isArray(given)) throw new Error(`${name} is {camera?, acting?, moods?, rest?} (the spec keys that take the director's keys), or null, not ${JSON.stringify(given)}`);
  for (const key of Object.keys(given)) if (!DECLARATION_KEYS.includes(key)) throw new Error(`${name} has unsupported key ${key} (it takes ${DECLARATION_KEYS.join(', ')})`);
  for (const key of ['camera', 'acting', 'rest']) if (given[key] !== undefined && !(typeof given[key] === 'string' && given[key].trim())) throw new Error(`${name}.${key} names ${key === 'rest' ? 'the mood a held one returns to' : 'a key of the world\'s spec'}, not ${JSON.stringify(given[key])}`);
  if (given.camera === undefined && given.acting === undefined) throw new Error(`${name} takes neither camera nor acting: name the spec key for one, or return null`);
  if (given.groups !== undefined && typeof given.groups !== 'boolean') throw new Error(`${name}.groups is true (its camera frames several names together: on: [a, b]) or false, not ${JSON.stringify(given.groups)}`);
  const moods = given.moods ?? null, list = m => Array.isArray(m) && m.every(x => typeof x === 'string' && x);
  if (moods !== null && !list(moods) && !(typeof moods === 'object' && !Array.isArray(moods) && Object.values(moods).every(list))) throw new Error(`${name}.moods is the moods it can act — a list, or {who: list} — not ${JSON.stringify(moods)}`);
  return Object.freeze({camera: given.camera ?? null, acting: given.acting ?? null, moods, rest: given.rest ?? null, groups: given.groups === true});
}

/**
 * Which scenes each picture shows, in film order: [{path, spec, scenes: [ids]}] — the story first, then each stage
 * (spec: its world's spec, null for a page that is no world). With a push-in, the story holds through the scene it
 * pushes in after, and every stage is a page.
 */
export function pictures(recipe, storyboard) {
  const ids = storyboard.scenes.map(s => s.id), index = id => ids.indexOf(id);
  const storyPath = recipe.story !== undefined ? 'story' : 'whiteboard', story = recipe.story ?? {kit: 'whiteboard', ...recipe.whiteboard};
  const stages = (recipe.stages ?? []).map((spec, i) => ({path: `stages[${i}]`, spec: spec.type === 'world' ? spec.world : null, at: index(spec.scene)}))
    .filter(st => st.at >= 0).sort((a, b) => a.at - b.at);
  const push = recipe.pushIn ? index(recipe.pushIn.after) : -1;
  const storyEnd = push >= 0 ? push + 1 : stages[0]?.at ?? ids.length;
  const out = [{path: storyPath, spec: story, scenes: ids.slice(0, storyEnd)}];
  stages.forEach((st, k) => out.push({path: st.path, spec: st.spec, scenes: ids.slice(Math.max(st.at, storyEnd), stages[k + 1]?.at ?? ids.length)}));
  return out.filter(p => p.scenes.length);
}

/** A beat as a key carries it: its own copy, so two keys never share one (each names its own recipe entry). */
const own = at => (Array.isArray(at) ? [...at] : {...at});
/** A camera key as a recipe writes it: {at, on, size?}. */
export const cameraKey = k => ({at: own(k.at), on: Array.isArray(k.on) ? [...k.on] : k.on, ...(k.size ? {size: k.size} : {})});
/** Mood keys as a recipe writes them, by person: {who: [{at, mood}]}. */
export function actingKeys(keys) {
  const out = {};
  for (const k of keys) (out[k.who] ??= []).push({at: own(k.at), mood: k.mood});
  return out;
}

/** Where a world's spec key sits in the recipe ("story.camera", "stages[3].world.camera"). */
export const specPath = (path, key) => `${path === 'story' || path === 'whiteboard' ? path : `${path}.world`}.${key}`;
/** Whether the recipe's own focus moves the camera (its strategy, or one of its strategies, is "camera"). */
const focusMoves = focus => [focus?.strategy].flat().includes('camera');

/**
 * Why the director may not move the camera over a picture — a film has one camera — or null when it may. The one check
 * both landings ask (`landing`: 'worlds' or 'focus'): the recipe's own focus (any, for the focus; one that moves the
 * camera, for a world), a push note, the recipe's camera moves; a world spec that frames itself (its kit's camera key
 * written: `decl`, `spec`); and, for the focus, a world whose own camera moves (`moves`: its kit's cameraMoves).
 */
export function cameraTaken(recipe, {landing, path = null, spec = null, decl = null, moves = false}) {
  if (recipe.focus !== undefined && (landing === 'focus' || focusMoves(recipe.focus))) return landing === 'focus' ? 'the recipe has its own focus' : 'the recipe\'s focus moves the camera (a film has one camera)';
  if ((recipe.notes ?? []).some(n => n?.push !== undefined)) return 'the director\'s notes push the camera (a film has one camera)';
  if (recipe.camera !== undefined) return 'the recipe moves the camera by name (a film has one camera)';
  if (decl?.camera && spec?.[decl.camera] !== undefined) return `the recipe frames this world itself (${specPath(path, decl.camera)})`;
  if (moves) return `the world at ${path} moves its own camera (its kit's cameraMoves)`;
  return null;
}

/**
 * One world's placements: what lands in its spec ({path, key, value}) and the keys that did not ([{key, why}]).
 * `planned`: {camera: [keys], moods: [keys]} for its scenes — camera keys only when its kit names a camera key, moods
 * only when it names an acting key; `taken`: why its camera may not move (cameraTaken), or null.
 */
export function landWorld({path, spec}, decl, planned, taken) {
  const placements = [], kept = [];
  if (planned.camera.length) {
    if (taken) kept.push(...planned.camera.map(k => ({key: k, why: taken})));
    else placements.push({path, key: decl.camera, value: planned.camera.map(cameraKey)});
  }
  if (planned.moods.length) {
    const mine = spec[decl.acting];
    kept.push(...planned.moods.filter(k => mine?.[k.who]).map(k => ({key: k, why: `the recipe acts ${k.who} in this world itself (${specPath(path, decl.acting)}.${k.who})`})));
    const theirs = planned.moods.filter(k => !mine?.[k.who]);
    if (theirs.length) placements.push({path, key: decl.acting, value: {...actingKeys(theirs), ...(mine ?? {})}});
  }
  return {placements, kept};
}

/**
 * A recipe as the director placed its keys in a film (film.director.placed: {path: 'stages[3].world.camera' | 'story.acting'
 * | 'focus', keys}) — what an explicit recipe handed to the segment cache is keyed on. No director: the recipe as it is.
 */
export function asDirected(recipe, record) {
  if (!record?.placed?.length) return recipe;
  return applyPlacements(recipe, record.placed.map(({path, keys}) => {
    if (path === 'focus') return {path, key: 'focus', value: keys};
    const m = path.match(/^(story|whiteboard|stages\[\d+\])(?:\.world)?\.([^.]+)$/u);
    return {path: m[1], key: m[2], value: keys};
  }));
}

/** A recipe with the placements made: each world spec copied with its keys (the recipe and its other entries untouched). */
export function applyPlacements(recipe, placements) {
  if (!placements.length) return recipe;
  const out = {...recipe};
  for (const {path, key, value} of placements) {
    if (path === 'focus') { out.focus = value; continue; }
    if (path === 'story' || path === 'whiteboard') { out[path] = {...out[path], [key]: value}; continue; }
    const i = +path.match(/^stages\[(\d+)\]$/u)[1];
    if (out.stages === recipe.stages) out.stages = [...recipe.stages];
    out.stages[i] = {...out.stages[i], world: {...out.stages[i].world, [key]: value}};
  }
  return out;
}
