// moves — the one change that clears a box: the smallest move that takes it clear of another (or inside its frame), or
// the size it must shrink to, said in the recipe entry's own units.
//
// WHY: "move it" is a hunt; "move it 48 up: set x, y to (300, 312)" is an edit. The move is found on the frame (where the
// boxes are), then said in the units the entry is written in (places.mjs · delta) — and, when the entry itself carries
// x and y (a whiteboard item's words), as the new x and y.

/** The gap a move leaves between a thing and what it clears, in pixels. */
export const GAP = 8;

/**
 * The smallest move [dx, dy] that takes `box` clear of `obstacle` (GAP between) and keeps it inside `bounds`, trying
 * the `ways` given (up, down, left and right; the caption band is cleared only upward — below it is the frame's last
 * strip, no place for words); null when no single move does. A move that lands on one of `others` (the other words and
 * drawings up at that moment) goes on past it the same way, so following the fix never makes a new overlap.
 */
export function clearOf(box, obstacle, bounds, {gap = GAP, ways = ['up', 'down', 'left', 'right'], others = []} = {}) {
  const [x0, y0, x1, y1] = box, [b0, c0, b1, c1] = bounds;
  const past = {up: o => [0, o[1] - y1 - gap], down: o => [0, o[3] - y0 + gap], left: o => [o[0] - x1 - gap, 0], right: o => [o[2] - x0 + gap, 0]};
  const fits = ([dx, dy]) => x0 + dx >= b0 - .5 && y0 + dy >= c0 - .5 && x1 + dx <= b1 + .5 && y1 + dy <= c1 + .5;
  const meets = ([dx, dy], o) => Math.min(x1 + dx, o[2]) - Math.max(x0 + dx, o[0]) > .5 && Math.min(y1 + dy, o[3]) - Math.max(y0 + dy, o[1]) > .5;
  const tries = ways.map(way => {
    let d = past[way](obstacle);
    for (let k = 0; k <= others.length && fits(d); k++) {
      const hit = others.find(o => meets(d, o));
      if (!hit) return d;
      const further = past[way](hit);
      d = way === 'up' ? [0, Math.min(d[1], further[1])] : way === 'down' ? [0, Math.max(d[1], further[1])] : way === 'left' ? [Math.min(d[0], further[0]), 0] : [Math.max(d[0], further[0]), 0];
    }
    return null;
  }).filter(d => d && fits(d));
  return tries.sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0] ?? null;
}

/**
 * What brings `box` inside `bounds` (GAP from its edges): {move: [dx, dy]} when it fits there, or {shrink: k} — the scale
 * it must take (under 1) — when it is wider or taller than the room. null when it is inside already.
 */
export function intoBounds(box, bounds, gap = GAP) {
  const [x0, y0, x1, y1] = box, [b0, c0, b1, c1] = bounds, w = x1 - x0, h = y1 - y0, roomW = b1 - b0 - 2 * gap, roomH = c1 - c0 - 2 * gap;
  if (w > roomW || h > roomH) return {shrink: Math.max(.05, Math.min(roomW / w, roomH / h))};
  const dx = x0 < b0 + gap ? b0 + gap - x0 : x1 > b1 - gap ? b1 - gap - x1 : 0, dy = y0 < c0 + gap ? c0 + gap - y0 : y1 > c1 - gap ? c1 - gap - y1 : 0;
  return dx || dy ? {move: [dx, dy]} : null;
}

const n = v => Math.round(v);
/** A move in words: "48 up and 10 left" (rounded; a part under half a unit is left out). */
export function moveWords([dx, dy]) {
  const parts = [...(n(dy) < 0 ? [`${-n(dy)} up`] : n(dy) > 0 ? [`${n(dy)} down`] : []), ...(n(dx) < 0 ? [`${-n(dx)} left`] : n(dx) > 0 ? [`${n(dx)} right`] : [])];
  return parts.join(' and ') || 'a little';
}

/**
 * The fix for a move of `d` (recipe units). `entry` the recipe's value at the thing's path: when it carries x and y the fix
 * says the new ones; `corner` (a drawing's top-left in recipe units) says where a drawing goes, and that its shapes'
 * points shift with it.
 */
export function moveFix(d, {entry = null, corner = null, clear = ''} = {}) {
  const by = `move it ${moveWords(d)}${clear ? `, clear of ${clear}` : ''}`;
  if (entry && Number.isFinite(entry.x) && Number.isFinite(entry.y)) return `${by}: set x, y to (${n(entry.x + d[0])}, ${n(entry.y + d[1])})`;
  if (corner) return `${by}: its box to (${n(corner[0] + d[0])}, ${n(corner[1] + d[1])}), each point of its shapes shifted by (${n(d[0])}, ${n(d[1])})`;
  return by;
}

/**
 * The fix for a thing too big for its room: the size it shrinks to (recipe units), where its box then goes (`corner`,
 * recipe units: shrunk where it is, it can still be off), and its `size` when the entry has one.
 */
export function shrinkFix(k, [w, h], {entry = null, corner = null} = {}) {
  const to = `shrink it to ${n(w * k)}×${n(h * k)} (now ${n(w)}×${n(h)})${corner ? `, its box at (${n(corner[0])}, ${n(corner[1])})` : ''}`;
  return entry && Number.isFinite(entry.size) ? `${to}: set size to ${Math.max(1, Math.floor(entry.size * k))}` : to;
}

/** Where a box shrunk by k goes to sit inside bounds (GAP from its edges), nearest where it was: its new top-left corner. */
export function shrunkCorner(box, k, bounds, gap = GAP) {
  const [x0, y0, x1, y1] = box, [b0, c0, b1, c1] = bounds, w = (x1 - x0) * k, h = (y1 - y0) * k;
  return [Math.min(Math.max(x0, b0 + gap), b1 - gap - w), Math.min(Math.max(y0, c0 + gap), c1 - gap - h)];
}
