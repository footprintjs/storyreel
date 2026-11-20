/**
 * Stage 22 of the compile: everything that moves the camera over the picture, placed on the clock — the director's
 * framing in the focus (its keys land there), the director's pushes (notes.mjs), where the viewer looks (attention.mjs:
 * the focus and the emphasis) and the camera's moves by name (camerawork.mjs: one picture each, one camera, played as
 * moves or, for reduced motion, as cuts) — and the view they put under the camera (underView). Its own stage because
 * these four take turns with each other, so they are placed together, after the picture's changes and regions are known.
 *
 * Reads: direction, recipe, directed, entries, storyboard, story, stages, storyPathName, notes, clock, paper, blank,
 * strategies, reducedMotion, pictureChanges, spotlightAt, kitCameraIn, named, regionsUnder, worldOnScreen.
 * Writes: recipe, directed and entries (when the director framed the focus), underView(t), pushes, attention, camerawork.
 */
import {directFocus} from '../director/film.mjs';
import {applyPlacements} from '../director/land.mjs';
import {planCamera} from '../camerawork.mjs';
import {placePushes, pushAt} from '../notes.mjs';
import {readAttention} from '../attention.mjs';
import {compose, about} from '../regions.mjs';
import {onlyNames, recipePaths} from './util.mjs';

export async function cameraStage(state) {
  const {direction, storyboard, story, stages, storyPathName, notes, clock, paper, blank, strategies, reducedMotion,
    pictureChanges, spotlightAt, kitCameraIn, named, regionsUnder, worldOnScreen} = state;
  /**
   * What lies between the picture and the camera at t, as a view (regions.mjs): the director's push, then a moving
   * focus (attention.mjs), as frame() composes them; null when neither moves the picture. The camera, regionsAt and
   * pointAt all read through it, so a box and a click agree with what is drawn.
   */
  function underView(t) {
    const cam = pushAt(state.pushes, t), f = state.attention?.focus, v = f?.moves ? f.viewAt(t) : null;
    const pushed = cam ? about(cam) : null, focused = v ? about({sx: v.cx, sy: v.cy, z: v.z, tx: v.sx, ty: v.sy}) : null;
    return pushed && focused ? compose(focused, pushed) : pushed ?? focused;
  }
  state.underView = underView;
  // The director's framing in the film's focus (when its keys land there): what the picture names at each moment.
  // A world whose own camera moves (its kit's cameraMoves) takes no framing from the focus (one camera).
  const ownCamera = path => Boolean((path === storyPathName ? story : stages[+path.slice(7, -1)]?.world?.instance)?.cameraMoves?.length);
  const focusPlaced = direction ? directFocus(direction, {recipe: state.recipe, storyboard, names: t => onlyNames(regionsUnder(t)), ownCamera}) : null;
  if (focusPlaced) { state.directed = applyPlacements(state.directed, [focusPlaced]); state.recipe = applyPlacements(state.recipe, [focusPlaced]); for (const [value, path] of recipePaths({focus: state.recipe.focus})) state.entries.set(value, path); }
  const recipe = state.recipe;
  const pushes = state.pushes = placePushes(notes.pushes, {clock, speed: notes.speed, changes: pictureChanges(), spotlight: spotlightAt, kitCamera: kitCameraIn, total: clock.total, named});
  // Where the viewer looks (attention.mjs): the recipe's focus and emphasis, each shown by a strategy.
  const attention = state.attention = readAttention(recipe, {clock, named, strategies, pushes, theme: paper});
  // The camera's moves by name (camera.mjs), placed on the clock by camerawork.mjs: one picture each, one camera
  // (they take turns with a moving focus and the pushes), played as moves or (reducedMotion) as cuts.
  state.camerawork = recipe.camera === undefined ? null : await planCamera(recipe.camera, {clock, total: clock.total, changes: pictureChanges(),
    named, under: underView, worldAt: t => { const on = worldOnScreen(t); return on ? {world: on.w, path: on.path} : null; },
    focus: attention?.focus ?? null, pushes, spotlight: spotlightAt, kitCamera: kitCameraIn, reducedMotion, ground: c => c.drawImage(blank, 0, 0)});
}
