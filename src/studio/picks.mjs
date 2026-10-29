/**
 * Picks: a choice made by eye in the studio's gallery, kept as one line that a person, an agent or a command applies
 * without reading the recipe —
 *
 *   scene-05 enter torn     the stage that plays scene-05 comes in with the transition torn   (its "enter")
 *   scene-05 move pop       each word of scene-05's kinetic world lands with the move pop       (its "move")
 *
 * What a line is and what is true of it, as plain facts: its form (pickLine, readPick), where each kind of pick can go
 * in a recipe (placesIn), the facts a check reads (lineFacts) and the picks put in their places (putPicks). The checks
 * themselves are rule tables decided on a flowchart (apply.mjs · applyPicks), so every run keeps its record.
 * A pick names a transition or a move with its own defaults; a transition that needs a setting with no default (the
 * thing a match or a through goes through) is given in the recipe itself.
 */
import {readEntrance} from '../transitions.mjs';
import {readWordMove} from '../kits/kinetic/index.mjs';

/** What a pick sets: a stage's entrance, or a kinetic world's move. */
export const PICK_KINDS = Object.freeze(['enter', 'move']);
export const PICK_FORM = '"<scene> enter <transition>" or "<scene> move <move>" (e.g. "scene-05 enter torn")';

/** The members a key not there yet goes just after, the first there: beside the scene it is for (a world with none: its kit). */
export const BESIDE = Object.freeze(['scene', 'kit']);

/** A pick as its line: the scene, what it sets, the name. */
export const pickLine = ({scene, kind, name}) => `${scene} ${kind} ${name}`;

/**
 * A line read as a pick: {scene, kind, name, line}. The last two words are what it sets and the name (a name is one
 * word); the scene is what comes before them. A line that is not one refuses, naming the form.
 */
export function readPick(line) {
  const text = typeof line === 'string' ? line.trim() : '';
  const m = /^(\S(?:.*\S)?)\s+(\S+)\s+(\S+)$/.exec(text);
  if (/[\r\n]/.test(text) || !m || !PICK_KINDS.includes(m[2])) throw new Error(`${JSON.stringify(line)} is not a pick: write ${PICK_FORM}`);
  return {scene: m[1], kind: m[2], name: m[3], line: pickLine({scene: m[1], kind: m[2], name: m[3]})};
}

/** A recipe value as a change shows it: a name as it is, settings as JSON, nothing as "(not set)". */
const shown = value => (value === undefined ? '(not set)' : typeof value === 'string' ? value : JSON.stringify(value));
/** A change as `storyreel apply` prints it: `scene-05 enter: cut → torn`. */
export const changeText = ({scene, kind, before, after}) => `${scene} ${kind}: ${shown(before)} → ${shown(after)}`;

/**
 * Where each kind of pick can go in a recipe, by scene: {enter: Map(scene → path), move: Map(scene → path)} — the path
 * of the object the pick sets its key on.
 *   enter  the stage that plays the scene; none in a film with a pushIn (it hands its stages over on one page)
 *   move   the kinetic world whose words the scene says: the story's (kit kinetic, its scene that one), or a world
 *          stage's — by the world's own scene (the one whose voice its words follow), which need not be the stage's;
 *          a world that names none, by the stage's
 */
function placesIn(recipe) {
  const stages = Array.isArray(recipe.stages) ? recipe.stages : [], enter = new Map(), move = new Map();
  if (recipe.story?.kit === 'kinetic' && typeof recipe.story.scene === 'string') move.set(recipe.story.scene, ['story']);
  stages.forEach((s, i) => {
    if (typeof s?.scene !== 'string') return;
    if (recipe.pushIn === undefined && !enter.has(s.scene)) enter.set(s.scene, ['stages', i]);
    const words = typeof s.world?.scene === 'string' ? s.world.scene : s.scene;
    if (s.type === 'world' && s.world?.kit === 'kinetic' && !move.has(words)) move.set(words, ['stages', i, 'world']);
  });
  return {enter, move};
}

/** The scenes that take each kind of pick, in the recipe's order: {enter: [scene], move: [scene]} — what the studio's gallery shows. */
export function pickScenes(recipe) {
  const {enter, move} = placesIn(recipe);
  return {enter: [...enter.keys()], move: [...move.keys()]};
}

/**
 * What is true of a line, as the checks read it (apply.mjs: each a top-level measure for decide()) — `facts`: form (it
 * is a pick), kind, sceneKnown (in the storyboard), pushIn (the film has one), stagePlays (a stage plays its scene),
 * inCatalog (its name is a transition of the film), defaults (that transition takes its defaults: no setting it must be
 * given), kineticWorld (its scene has one), wordMove (its name is a move a whole word makes: the kinetic kit's own
 * reader, kits/kinetic · readWordMove); and what a refusal names: `pick`, `place` (where it goes), `takes` (the scenes
 * that take its kind), `formError`, `settingsError` and `moveError` (each reader's own words).
 * @param scenes   the film's scene ids · catalog: its transitions (transitions.mjs · transitionCatalog(kits))
 */
export function lineFacts(recipe, line, {scenes, catalog}) {
  let pick = null, formError = null;
  try { pick = readPick(line); } catch (e) { formError = e.message; }
  const places = placesIn(recipe), kind = pick?.kind ?? null, name = pick?.name ?? null;
  let defaults = false, settingsError = null, wordMove = false, moveError = null;
  if (kind === 'enter' && Object.hasOwn(catalog, name)) { try { readEntrance(name, pick.line, catalog); defaults = true; } catch (e) { settingsError = e.message; } }
  if (kind === 'move') { try { readWordMove(name, pick.line); wordMove = true; } catch (e) { moveError = e.message; } }
  const facts = {form: Boolean(pick), kind, sceneKnown: Boolean(pick) && scenes.includes(pick.scene), pushIn: recipe.pushIn !== undefined,
    stagePlays: Boolean(pick) && places.enter.has(pick.scene), inCatalog: kind === 'enter' && Object.hasOwn(catalog, name), defaults,
    kineticWorld: Boolean(pick) && places.move.has(pick.scene), wordMove};
  return {facts, pick, place: pick ? places[kind].get(pick.scene) ?? null : null, takes: kind ? [...places[kind].keys()] : [], formError, settingsError, moveError};
}

/** The value at a path of the recipe. */
const at = (recipe, path) => path.reduce((o, k) => o[k], recipe);
/** A path as a film names it: stages[3].world.move. */
const pathText = path => path.map((k, i) => (typeof k === 'number' ? `[${k}]` : i ? `.${k}` : k)).join('');
/** `o` with `key` set to `value`: in its place when it is there, else just after the first member of BESIDE there, else last. */
function withKey(o, key, value) {
  const after = BESIDE.find(b => Object.hasOwn(o, b));
  if (Object.hasOwn(o, key) || after === undefined) return {...o, [key]: value};
  return Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (k === after ? [[k, v], [key, value]] : [[k, v]])));
}

/**
 * Checked picks put in their places, in order, in a copy of the recipe (a later pick of the same scene and kind replaces
 * an earlier one; the caller's recipe is never edited): {recipe, changes: [{line, scene, kind, name, path, before, after}]}.
 * @param placed  [{pick, place}] (lineFacts)
 */
export function putPicks(recipe, placed) {
  const out = structuredClone(recipe);
  const changes = placed.map(({pick: {scene, kind, name, line}, place}) => {
    const holder = at(out, place.slice(0, -1)), key = place.at(-1), before = holder[key][kind];
    holder[key] = withKey(holder[key], kind, name);
    return {line, scene, kind, name, path: pathText([...place, kind]), before, after: name};
  });
  return {recipe: out, changes};
}
