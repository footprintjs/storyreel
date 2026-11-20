/**
 * Stage 20 of the compile: what the checks ask of a moment without drawing it — the mouths drawn at t (the lip-sync
 * check, finished.mjs), the parts drawn at t (the geometry audit, geometry.mjs), and a point on the frame in the
 * recipe's own coordinates (pointAt: the preview studio's click). Its own stage because each reads the kits on
 * screen through the regions stage's world, on the picture's clock, and none of them draws.
 *
 * Reads: push, shots, shotAt, teaser, pictureClock, stateAt, worldOnScreen, stagePath; at call time underView and
 * camerawork (the camera stage).
 * Writes: mouthsAt(t), partsAt(t), pointAt(t, x, y).
 */
import {back} from '../regions.mjs';

export function probesStage(state) {
  const {push, shots, shotAt, teaser, pictureClock, stateAt, worldOnScreen, stagePath} = state;
  /**
   * The mouths drawn at t, for the lip-sync check (finished.mjs): each kit on screen that draws one says so —
   * a world's instance.mouthsAt(t), a kit stage's mouthsAt(handle, t) → [{who, open: 0..1}] (who: the speaker
   * it belongs to, null for the narrator). [{who, open, path}].
   */
  function mouthsAt(at) {
    if (teaser && at >= teaser.at) return [];
    const t = pictureClock(at), out = [], world = worldOnScreen(t), add = (list, path) => { for (const m of list ?? []) out.push({who: m.who ?? null, open: Math.max(0, Math.min(1, Number(m.open) || 0)), path}); };
    if (world) add(world.w.instance.mouthsAt?.(Math.min(t, world.until)), world.path);
    else {
      const shown = push ? stateAt(t).shown.map(([st]) => st) : shots[shotAt(t)].stages;
      for (const st of shown) add(st.kit?.mouthsAt?.(st.handle, t), stagePath(st));
    }
    return out;
  }
  /**
   * The parts drawn at t, for the geometry audit (geometry.mjs): each kit on screen that gives its parts says so — a
   * world's instance.parts(t), a kit stage's parts(handle, t) → {segments, regions, apart}, in the kit's own coordinates.
   * [{path, segments, regions, apart}], checked by the audit (geometry.mjs · readParts). Read on the picture's clock, as the
   * mouths are: a camera's freeze holds the parts with the picture.
   */
  function partsAt(at) {
    if (teaser && at >= teaser.at) return [];
    const t = pictureClock(at), out = [], world = worldOnScreen(t), add = (parts, path) => {
      if (parts === undefined || parts === null) return;
      if (typeof parts !== 'object' || Array.isArray(parts)) throw new Error(`${path}: parts(t) returns {segments, regions?, apart?} (or nothing), not ${JSON.stringify(parts)}`);
      out.push({...parts, path});
    };
    if (world) add(world.w.instance.parts?.(Math.min(t, world.until)), world.path);
    else {
      const shown = push ? stateAt(t).shown.map(([st]) => st) : shots[shotAt(t)].stages;
      for (const st of shown) add(st.kit?.parts?.(st.handle, t), stagePath(st));
    }
    return out;
  }
  /**
   * A point on the frame at t in the recipe's own coordinates: `frame` (as a push note's `at` means it:
   * before any push, focus or camera move) and, over a world, `world` {path, at} (the sheet's, as its items are placed).
   */
  function pointAt(t, x, y) {
    const teasing = teaser && t >= teaser.at, lens = teasing ? null : state.camerawork?.viewOn(t), [lx, ly] = lens ? back(lens, [x, y]) : [x, y];
    const under = teasing ? null : state.underView(t), [fx, fy] = under ? back(under, [lx, ly]) : [lx, ly], world = !teasing && worldOnScreen(pictureClock(t));
    const round = n => Math.round(n);
    return {frame: [round(fx), round(fy)], ...(world ? {world: {path: world.path, at: back(world.view, [fx, fy]).map(round)}} : {})};
  }
  Object.assign(state, {mouthsAt, partsAt, pointAt});
}
