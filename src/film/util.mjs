/**
 * Small helpers several stages of the compile share: the hand-over ramp, the canvas aimed through a camera, recipe
 * paths, a value read from the film's data, a deep freeze and the names a picture gives once. Its own module because
 * each is used by more than one stage, and none of them holds any state of the film.
 */
import {ramp} from '../clock.mjs';

/**
 * How far the hand-over INTO a stage has come at t: eased over `seconds`, starting `lead` before
 * the stage's scene starts — or a step on the scene's first frame when the director cut into it.
 */
export const into = (st, t, lead, seconds) => st.cut ? (t >= st.start ? 1 : 0) : ramp(t, st.start - lead, seconds);

/** Point the canvas through a camera {sx, sy, z, tx, ty}: translate to (tx, ty), scale z, about (sx, sy). */
export const aim = (ctx, c) => { ctx.translate(c.tx, c.ty); ctx.scale(c.z, c.z); ctx.translate(-c.sx, -c.sy); };

/** The names a picture gives once each at a moment (a name two things share frames neither): a Set. */
export function onlyNames(regions) {
  const count = new Map();
  for (const r of regions) if (r.name) count.set(r.name, (count.get(r.name) ?? 0) + 1);
  return new Set([...count].filter(([, n]) => n === 1).map(([name]) => name));
}

/** A value frozen all the way down (a copy the caller cannot change under the film's keys). */
export const deepFreeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(deepFreeze); } return v; };

/** Every list and object in the recipe → its path ("story.items[3].at"), so a beat can name the entry that asked for it. */
export function recipePaths(recipe) {
  const paths = new Map();
  const walk = (value, where) => {
    if (!value || typeof value !== 'object' || paths.has(value)) return;
    paths.set(value, where);
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${where}[${i}]`));
    else for (const [k, v] of Object.entries(value)) walk(v, where ? `${where}.${k}` : k);
  };
  walk(recipe, '');
  return paths;
}

/** A value shown on screen, read from the film's data by a small path (e.g. "paused.status"). */
export function valueFrom(data, value) {
  if (typeof value === 'string') return value;
  const got = value.path.split('.').reduce((o, k) => o?.[k], data);
  if (got === undefined) throw new Error(`The data has no ${value.path}: give it in the film's data (compileFilm({…, data})), or name a path it has`);
  return value.format.replace('{}', Array.isArray(got) ? `['${got.join("', '")}']` : String(got));
}
