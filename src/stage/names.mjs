/**
 * The stage's names for the camera: boxes on the 1600×900 sheet, each with the name a push or a camera move frames
 * (regions.mjs's shape: {box, path, label, name}). Each person on stage by their id, each prop by its id (a group: the
 * box around all its things on stage), and the place's own regions. Names are unique (read.mjs refuses a clash).
 */

const grow = (a, b) => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b);

/** The regions at t from the stage's state (scene.mjs · stateAt). */
export function regionsOf(plan, state) {
  const out = [];
  for (const p of state.people) out.push({box: [p.x - .22 * p.size, p.y - p.size, p.x + .22 * p.size, p.y], path: `cast.${p.who}`, label: p.who, name: p.who});
  const boxes = new Map();
  for (const i of state.items) {
    if (!(i.opacity > .05)) continue;
    const [w, h] = plan.items.get(i.key).size, s = i.scale;
    boxes.set(i.prop, grow(boxes.get(i.prop), [i.x - w / 2 * s, i.y - h * s, i.x + w / 2 * s, i.y]));
  }
  for (const [prop, box] of boxes) out.push({box, path: `props.${prop}`, label: prop, name: prop});
  for (const [name, box] of Object.entries(plan.stage.place.adapter.regions ?? {})) out.push({box: [...box], path: `place.${name}`, label: name, name});
  return out;
}
