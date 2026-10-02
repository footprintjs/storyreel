/**
 * The whiteboard scene type: props drawn stroke by stroke on spoken phrases, erased by named
 * erasers, eureka beats (bulb + ding) and spotlights. Everything is data; this module only
 * interprets it (see docs/RECIPE.md).
 *
 *   {erasers: {name: {at, dur, box}}, defaultErase: name,
 *    items: [{at, dur, draw: [[shape, …numbers]] | write: text, x, y, size, align, color, erase, seed, size}
 *            | {at, eureka: [x, y], erase}],
 *    spots: [{from, to, at: [x, y], r, zoom}]}
 */
import {createCanvas} from '@napi-rs/canvas';
import {INK, shapes, icons, stickFigure, robotHead, bubble, lightBulb, bulbRays, drawGlow, drawStrokes, drawWriting, renderTimeline, drawBoard, ease} from './board.mjs';

const SHAPES = {
  figure: (x, y, s = 1, parts = 4, pose = 'stand') => stickFigure(x, y, s, pose).slice(0, parts),
  robot: (x, y, s = 1) => robotHead(x, y, s),
  rect: (x, y, w, h) => [shapes.rect(x, y, w, h)],
  line: (x0, y0, x1, y1) => [shapes.line(x0, y0, x1, y1)],
  ellipse: (cx, cy, rx, ry) => [shapes.ellipse(cx, cy, rx, ry)],
  bubble: (cx, cy, rx, ry, tx, ty) => bubble(cx, cy, rx, ry, tx, ty),
  tick: (x, y, s = 1) => [shapes.tick(x, y, s)],
  arrow: (x0, y0, x1, y1, head = 18) => shapes.arrow(x0, y0, x1, y1, head),
  poly: points => [points],
  tag: (x, y, s = 1) => icons.tag(x, y, s),
  clock: (x, y, s = 1) => icons.clock(x, y, s),
  flashlight: (x, y, s = 1, dir = 1) => icons.flashlight(x, y, s, dir),
};
const ITEM_KEYS = new Set(['at', 'dur', 'draw', 'write', 'x', 'y', 'size', 'align', 'color', 'erase', 'seed', 'eureka', 'name']);
const color = name => { if (name === undefined) return INK.black; if (!(name in INK)) throw new Error(`Unknown ink colour ${name}`); return INK[name]; };

export function compileWhiteboard(spec, clock, motion = {cameraSpeed: 1}) {
  const erasers = Object.fromEntries(Object.entries(spec.erasers ?? {}).map(([name, e]) => [name, {at: clock.at(e.at) + (e.plus ?? 0), dur: e.dur, box: e.box}]));
  const eraseOf = item => {
    const name = 'erase' in item ? item.erase : spec.defaultErase;
    if (name === null || name === undefined) return undefined;
    if (!erasers[name]) throw new Error(`Unknown eraser ${name}`);
    return erasers[name];
  };
  const items = [], dings = [], places = [];
  spec.items.forEach((item, n) => {
    for (const key of Object.keys(item)) if (!ITEM_KEYS.has(key)) throw new Error(`whiteboard item ${n} has unsupported key ${key}`);
    // A name makes the item a thing a push can frame and a transition can go through (regionsAt → name).
    if (item.name !== undefined && !(typeof item.name === 'string' && /^[a-z][a-zA-Z0-9-]*$/.test(item.name))) throw new Error(`whiteboard item ${n}: name is one word for the thing it draws (e.g. "pebble"), not ${JSON.stringify(item.name)}`);
    const at = clock.at(item.at), erase = eraseOf(item);
    places.push({at, erase, path: `items[${n}]`, dur: item.dur, write: typeof item.write === 'string', ...placeOf(item), ...(item.name ? {name: item.name} : {})});
    if (item.eureka) {
      const [x, y] = item.eureka;
      items.push({at, dur: .5, draw: (ctx, f) => drawGlow(ctx, x, y + 8, 95, f), erase});
      const bulb = lightBulb(x, y, 1), rays = bulbRays(x, y, 1);
      items.push({at, dur: .45, color: INK.orange, draw: (ctx, f) => drawStrokes(ctx, bulb, f, {color: INK.orange, size: 5, seed: 31}), erase});
      items.push({at: at + .4, dur: .3, color: INK.orange, draw: (ctx, f) => drawStrokes(ctx, rays, f, {color: INK.orange, size: 5, seed: 32}), erase});
      dings.push(at + .05);
      return;
    }
    if (!(item.dur > 0)) throw new Error(`whiteboard item ${n} needs a duration`);
    const ink = color(item.color);
    if (typeof item.write === 'string') {
      const opts = {size: item.size ?? 48, align: item.align ?? 'left', color: ink};
      items.push({at, dur: item.dur, color: ink, draw: (ctx, f) => drawWriting(ctx, item.write, item.x, item.y, f, opts), erase});
      return;
    }
    if (!Array.isArray(item.draw)) throw new Error(`whiteboard item ${n} draws nothing`);
    const strokes = item.draw.flatMap(([kind, ...args]) => { if (!SHAPES[kind]) throw new Error(`Unknown shape ${kind}`); return SHAPES[kind](...args); });
    const opts = {color: ink, size: item.size ?? 6, seed: item.seed ?? n + 1};
    items.push({at, dur: item.dur, color: ink, draw: (ctx, f) => drawStrokes(ctx, strokes, f, opts), erase});
  });
  // A spotlight is a camera move: it eases in and out at the film's camera speed (a director's note).
  const speed = motion.cameraSpeed ?? 1, spotEase = {in: .6 / speed, out: .7 / speed};
  const spots = (spec.spots ?? []).map(s => ({at: clock.at(s.from), until: clock.at(s.to), cx: s.at[0], cy: s.at[1], r: s.r, zoom: s.zoom ?? 1.09, ...spotEase}));
  return {items, dings, spots, places};
}

const measurer = createCanvas(8, 8).getContext('2d');
/** Where an item is drawn on the board, and what to call it: {box, label} (for the preview studio's hit test). */
function placeOf(item) {
  if (item.eureka) { const [x, y] = item.eureka; return {box: [x - 95, y - 95, x + 95, y + 110], label: 'eureka'}; }
  if (typeof item.write === 'string') {
    const size = item.size ?? 48, align = item.align ?? 'left';
    measurer.font = `700 ${size}px Caveat`; const w = measurer.measureText(item.write).width;
    const left = align === 'center' ? item.x - w / 2 : align === 'right' ? item.x - w : item.x;
    return {box: [left - 6, item.y - size * .6, left + w + 6, item.y + size * .6], label: item.write};
  }
  // (An item that draws nothing is refused by compileWhiteboard; here it just has no place.)
  const shapesOf = Array.isArray(item.draw) ? item.draw : [], pad = (item.size ?? 6) / 2 + 4;
  const points = shapesOf.flatMap(([kind, ...args]) => SHAPES[kind]?.(...args) ?? []).flat();
  if (!points.length) return {box: null, label: ''};
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  return {box: [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad], label: shapesOf.map(([kind]) => kind).join(', ')};
}

/** The words written on the board: [{text, from (fully written), to (the eraser starts), path}] — for the reading-time check. */
export function boardTexts(board) {
  return board.places.filter(p => p.write).map(p => ({text: p.label, from: p.at + p.dur, to: p.erase ? p.erase.at : Infinity, path: p.path}));
}

/** What the board shows at t, item by item: [{box, path: 'items[n]', label, name?}] (drawn, and not yet wiped away). */
export function boardRegions(board, t) {
  return board.places.filter(p => p.box && t >= p.at && !(p.erase && t >= p.erase.at + p.erase.dur)).map(({box, path, label, name}) => ({box, path, label, ...(name ? {name} : {})}));
}

/** The strongest spotlight at t, with its weight (0..1), or null. */
export function spotAt(board, t) {
  let best = null;
  for (const f of board.spots) {
    const w = Math.min(ease((t - f.at) / (f.in ?? .6)), 1 - ease((t - f.until) / (f.out ?? .7)));
    if (w > 0 && (!best || w > best.w)) best = {...f, w};
  }
  return best;
}

/** Draw the board at t in board units (1600×900): surface, props, spotlight. */
export function drawWhiteboard(ctx, board, t, spot = spotAt(board, t)) {
  drawBoard(ctx);
  renderTimeline(ctx, board.items, t);
  if (spot) {
    const g = ctx.createRadialGradient(spot.cx, spot.cy, spot.r * .85, spot.cx, spot.cy, spot.r * 1.9);
    g.addColorStop(0, 'rgba(24,28,38,0)'); g.addColorStop(1, `rgba(24,28,38,${.3 * spot.w})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1600, 900);
  }
}

/**
 * The whiteboard as a story kit: its props are drawn on a board that hangs on the paper
 * (hang .9); sound accents are the eureka chimes and the eraser whooshes. Its spotlights follow
 * the film's camera speed (motion.cameraSpeed).
 */
export const whiteboardKit = {
  name: 'whiteboard',
  story: {
    motion: ['cameraSpeed'],
    compile(spec, clock, motion) {
      const board = compileWhiteboard(spec, clock, motion);
      const erasers = Object.values(spec.erasers ?? {}).map(e => ({time: clock.at(e.at) + (e.plus ?? 0), type: 'slide'}));
      return {hang: .9, spotAt: t => spotAt(board, t), draw: (c, t, spot) => drawWhiteboard(c, board, t, spot), regionsAt: t => boardRegions(board, t), texts: () => boardTexts(board),
        sounds: [...board.dings.map(time => ({time, type: 'chime'})), ...erasers]};
    },
  },
};
