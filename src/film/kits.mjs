/**
 * Stage 4 of the compile: the kits laid out — the story kits by name, the stage kits by type, the transitions a shot
 * may enter with — and the one way a world is built (compileWorld) and hung on its sheet (hung). Its own stage
 * because the director (the next stage) and every world after it are built through these, the same way.
 *
 * Reads: kits, clock, motion, notes, paper, root, cast, within.
 * Writes: allKits, storyKits, stageKits, stageKitNames, transitions, worldKits, context, readies, compileWorld(spec,
 * where), hung(instance, {hang, frame, from}).
 */
import {readFileSync} from 'node:fs';
import {insideRoot} from '../files.mjs';
import {whiteboardKit} from '../kits/whiteboard/index.mjs';
import {transitionCatalog} from '../transitions.mjs';

export function loadKits(state) {
  const {clock, motion, notes, paper, root, cast, within} = state;
  const allKits = [whiteboardKit, ...state.kits];
  const storyKits = Object.fromEntries(allKits.filter(k => k.story).map(k => [k.name, k.story]));
  const stageKits = Object.fromEntries(allKits.flatMap(k => Object.entries(k.stages ?? {})));
  const stageKitNames = Object.fromEntries(allKits.flatMap(k => Object.keys(k.stages ?? {}).map(type => [type, k.name])));
  // The transitions a shot may enter with: the built-in collection and every kit's own (transitions.mjs).
  const transitions = transitionCatalog(allKits);
  const worldKits = new Set();
  // What a context kit gets (kitContext); every world's `ready`, settled before recalls are drawn (readyWorlds).
  const context = kitContext({clock, motion, theme: paper, root, cast, inside: within}), readies = [];
  const compileWorld = (spec, where) => {
    const kit = storyKits[spec?.kit];
    if (!kit) throw new Error(`No story kit "${spec?.kit}" for ${where} (have: ${Object.keys(storyKits).join(', ')})`);
    // A camera speed covers EVERY camera move, so a world whose kit cannot follow it refuses the note.
    if (notes.speed !== 1 && !kit.motion?.includes('cameraSpeed')) throw new Error(`note "${notes.speedNote.note}": ${where} is drawn by the kit "${spec.kit}", which does not take a camera speed (a story kit that does lists motion: ['cameraSpeed'] and divides its camera moves' seconds by motion.cameraSpeed)`);
    worldKits.add(spec.kit);
    // A context kit's context also says which recipe entry the world is for (`where`: the story, or stage <scene>).
    const instance = usesContext(kit, spec.kit) ? kit.compile(spec, Object.freeze({...context, where})) : kit.compile(spec, clock, motion);
    checkCameraMoves(instance, spec.kit, where);
    readies.push(readyOf(instance, spec.kit, where));
    return instance;
  };
  /**
   * A world on its sheet: hung on the paper at scale S (`hang`, or the kit's own, or 0.9; 1 = full frame), or, with a
   * thought frame (thought/ · readThought), in its cloud: the sheet at the cloud's scale and place, the cloud's entrance
   * timed from `from` (its shot's start).
   */
  const hung = (instance, {hang, frame = null, from = 0} = {}) => {
    if (frame) { const {S, place: [BX, BY]} = frame.cloud; return {instance, S, BX, BY, frame, thoughtFrom: from}; }
    const S = hang ?? instance.hang ?? .9; return {instance, S, BX: 1600 * (1 - S) / 2, BY: 900 * (1 - S) / 2 + 7.5 * (S < 1 ? 1 : 0)};
  };
  Object.assign(state, {allKits, storyKits, stageKits, stageKitNames, transitions, worldKits, context, readies, compileWorld, hung});
}

/**
 * What a story kit that declares `context: true` is compiled with: kit.compile(spec, context) — `cast` is the
 * film's cast (cast.mjs; null without one). Frozen,
 * and with no way to draw the film (only the engine draws clips, and nothing can call the film while it
 * is still being built). `library` and `labels` are the recipe's; no recipe carries them yet, so both are
 * empty. A file the kit opens goes through `readFile`, which loads only from inside root (files.mjs ·
 * insideRoot, as the recipe's own files do).
 */
function kitContext({clock, motion, theme, root, cast = null, inside = file => insideRoot(root, file)}) {
  return Object.freeze({clock, motion, theme, root, cast, library: Object.freeze({}), labels: Object.freeze({}),
    insideRoot: inside, readFile: file => readFileSync(inside(file))});
}

/** Whether a story kit takes the context (`context: true`) or today's (spec, clock, motion). */
function usesContext(storyKit, name) {
  const asked = storyKit.context ?? false;
  if (typeof asked !== 'boolean') throw new Error(`The story kit "${name}" declares context: ${JSON.stringify(asked)}; context is true (compile(spec, context)) or false / left out (compile(spec, clock, motion))`);
  return asked;
}

/** A world's optional `cameraMoves` (when its kit's own camera moves: [{from, to}] in seconds), checked. */
function checkCameraMoves(instance, name, where) {
  const moves = instance?.cameraMoves;
  if (moves === undefined) return;
  if (!Array.isArray(moves) || !moves.every(m => m && Number.isFinite(m.from) && Number.isFinite(m.to) && m.to > m.from)) throw new Error(`${where}: the kit "${name}" returned cameraMoves that are not [{from, to}]; cameraMoves is optional, and when given it lists when the kit's own camera moves, in seconds on the film's clock (to after from)`);
}

/**
 * A world's optional `ready` (a Promise: e.g. its images decoding), settled at once into
 * {error} | null so a refusal that comes early is never an unhandled rejection while the film is built.
 */
function readyOf(instance, name, where) {
  const ready = instance?.ready;
  if (ready === undefined) return null;
  if (typeof ready?.then !== 'function') throw new Error(`${where}: the kit "${name}" returned ready that is not a Promise; ready is optional, and when given it is a Promise that settles once the world can draw (e.g. its images have decoded)`);
  return Promise.resolve(ready).then(() => null, error => ({error, name, where}));
}

