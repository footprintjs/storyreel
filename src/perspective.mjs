/**
 * Perspective: one grid for a scene, so flat drawings sit in a room that has depth. This is what an animation
 * studio's layout artist does before anything is drawn: pick the camera's eye height (the horizon) and a vanishing
 * point, then place every thing by where it stands on the FLOOR — across the room and how far back — and let the grid
 * say where it lands on the frame and how small it looks. Nothing is sized by guesswork, angled things line up with
 * the room, and things drawn back to front always overlap the right way.
 *
 *   const room = perspective({horizon: 430, vanish: 860, front: 900, focal: 900})
 *   room.at(x, depth, height?)     → {x, y, scale}   a floor point (x on the front line, depth px back) on the frame;
 *                                                   height lifts it off the floor (a rail 300 px up), shrinking with it
 *   room.along(a, b, n)            → [{x, y, scale, depth}, …]   n evenly spaced points from a to b ({x, depth,
 *                                                   height?}), back to front order kept as given: a rail into the room
 *   room.backToFront(items, depthOf?) → items sorted so the furthest is drawn first (painter's order)
 *   room.toward(x)                 → [[x, front], [vanish, horizon]]: a floor line running into the room (boards, a path)
 *   room.parallax(depth, shift)    → how far a thing at that depth moves when the camera pans by `shift` at the front
 *
 * One-point perspective, the cartoon room's: the back wall faces us (flat things on it stay flat), and everything
 * that runs into the room meets at the vanishing point. `front` is the floor's front edge on the frame (y, where
 * scale is 1); `focal` is how deep the room feels (a smaller focal: a stronger shrink with depth). Pure numbers: a
 * kit draws with them (translate to {x, y}, scale by `scale`); for an angled flat thing (a rail seen at three-quarters)
 * draw each item at its own `along` point, back to front.
 */
const fin = n => typeof n === 'number' && Number.isFinite(n);
const shown = v => (typeof v === 'number' ? String(v) : JSON.stringify(v));

/** A room's grid, checked: horizon above the front edge, focal above 0. */
export function perspective({horizon, vanish = 800, front = 900, focal = 900} = {}) {
  if (![horizon, vanish, front, focal].every(fin)) throw new Error(`perspective: horizon, vanish, front and focal are numbers (px), not horizon ${shown(horizon)}, vanish ${shown(vanish)}, front ${shown(front)}, focal ${shown(focal)}`);
  if (!(horizon < front)) throw new Error(`perspective: the horizon (${horizon}) must be above the floor's front edge (${front}): give it a smaller y, e.g. {horizon: 430, front: 900}`);
  if (!(focal > 0)) throw new Error(`perspective: focal is above 0 (how deep the room feels), not ${focal}`);
  /** How small a thing looks at a depth: 1 on the front line, toward 0 far back. */
  const scaleAt = depth => {
    if (!fin(depth) || depth <= -focal) throw new Error(`perspective: depth is a number of px back from the front line, above ${-focal}, not ${shown(depth)}`);
    return focal / (focal + depth);
  };
  const at = (x, depth = 0, height = 0) => {
    if (!fin(x) || !fin(height)) throw new Error(`perspective: at(x, depth, height) takes numbers, not x ${shown(x)}, height ${shown(height)}`);
    const scale = scaleAt(depth);
    return {x: vanish + (x - vanish) * scale, y: horizon + (front - horizon) * scale - height * scale, scale};
  };
  const point = (p, name) => {
    if (!p || typeof p !== 'object' || !fin(p.x) || !fin(p.depth)) throw new Error(`perspective: along's ${name} is {x, depth, height?}, not ${shown(p)}`);
    return {x: p.x, depth: p.depth, height: p.height ?? 0};
  };
  return Object.freeze({
    horizon, vanish, front, focal, scaleAt, at,
    along(a, b, n) {
      const A = point(a, 'start'), B = point(b, 'end');
      if (!(Number.isInteger(n) && n >= 1)) throw new Error(`perspective: along places 1 or more things, not ${shown(n)}`);
      return Array.from({length: n}, (_, i) => {
        const u = n === 1 ? .5 : i / (n - 1), depth = A.depth + (B.depth - A.depth) * u;
        return {...at(A.x + (B.x - A.x) * u, depth, A.height + (B.height - A.height) * u), depth};
      });
    },
    backToFront(items, depthOf = it => it.depth) {
      if (!Array.isArray(items)) throw new Error('perspective: backToFront sorts a list');
      return items.map((it, i) => ({it, i, d: depthOf(it)})).sort((p, q) => q.d - p.d || p.i - q.i).map(p => p.it);
    },
    toward(x) {
      if (!fin(x)) throw new Error(`perspective: toward(x) takes x on the front line, not ${shown(x)}`);
      return [[x, front], [vanish, horizon]];
    },
    parallax(depth, shift) {
      if (!fin(shift)) throw new Error(`perspective: parallax(depth, shift) takes the camera's shift in px, not ${shown(shift)}`);
      return shift * scaleAt(depth);
    },
  });
}
