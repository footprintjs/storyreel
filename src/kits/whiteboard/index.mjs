/**
 * The whiteboard scene type: props drawn by hand on spoken phrases, erased by named erasers, eureka
 * beats (bulb + ding) and spotlights. Everything is data; this module only interprets it (see
 * README.md here).
 *
 *   {erasers: {name: {at, dur, box}}, defaultErase: name,
 *    items: [{at, dur, draw: [[shape, …numbers]] | write: text, x, y, size, align, color, erase, seed, accept}
 *            | {at, eureka: [x, y], erase, accept}],
 *    spots: [{from, to, at: [x, y], r, zoom}]}
 *
 * A drawing (`draw`, and a eureka's bulb) is drawn as a hand draws it: footprint-story decides its stroke order, the
 * pen's pace and its lifts, the author only what to draw, when and for how long (sketch.mjs). Words (`write`) are
 * written on left to right, as before: footprint-story has no letters to draw them by.
 */
import {createCanvas} from '@napi-rs/canvas';
import {INK, shapes, icons, stickFigure, robotHead, bubble, lightBulb, bulbRays, drawGlow, drawWriting, renderTimeline, drawBoard, ease} from './board.mjs';
import {planSketches, sketchDraw, shapeOf} from './sketch.mjs';

const SHAPES = {
  figure: (x, y, s = 1, parts = 4, pose = 'stand') => stickFigure(x, y, s, pose).slice(0, parts),
  robot: (x, y, s = 1) => robotHead(x, y, s),
  rect: (x, y, w, h) => [shapes.rect(x, y, w, h)],
  line: (x0, y0, x1, y1) => [shapes.line(x0, y0, x1, y1)],
  ellipse: (cx, cy, rx, ry) => [shapes.ring(cx, cy, rx, ry)],
  bubble: (cx, cy, rx, ry, tx, ty) => bubble(cx, cy, rx, ry, tx, ty),
  tick: (x, y, s = 1) => [shapes.tick(x, y, s)],
  arrow: (x0, y0, x1, y1, head = 18) => shapes.arrow(x0, y0, x1, y1, head),
  poly: points => [points],
  tag: (x, y, s = 1) => icons.tag(x, y, s),
  clock: (x, y, s = 1) => icons.clock(x, y, s),
  flashlight: (x, y, s = 1, dir = 1) => icons.flashlight(x, y, s, dir),
};
const ITEM_KEYS = new Set(['at', 'dur', 'draw', 'write', 'x', 'y', 'size', 'align', 'color', 'erase', 'seed', 'eureka', 'name', 'accept']);
/**
 * A eureka's bulb: its marker's width, its seconds (the glass, then the rays). 0.75 s since 0.49.0: footprint-story's
 * `pace` critic (0.36.0) found the bulb drawn at 2.1× a hand's pace in the 0.7 s it took before (the times the bulb
 * and its rays took before 0.48.0, end to end), and named 0.75 s, the least that a hand draws it in. An author cannot
 * give a bulb a `dur`, so the kit gives it the seconds its own drawing needs.
 */
const EUREKA = Object.freeze({size: 5, seconds: .75});
const clamp01 = n => Math.max(0, Math.min(1, n));
const color = name => { if (name === undefined) return INK.black; if (!(name in INK)) throw new Error(`Unknown ink colour ${name} (the inks are ${Object.keys(INK).join(', ')})`); return INK[name]; };

export function compileWhiteboard(spec, clock, motion = {cameraSpeed: 1}) {
  const erasers = Object.fromEntries(Object.entries(spec.erasers ?? {}).map(([name, e]) => [name, {at: clock.at(e.at) + (e.plus ?? 0), dur: e.dur, box: e.box}]));
  const eraseOf = item => {
    const name = 'erase' in item ? item.erase : spec.defaultErase;
    if (name === null || name === undefined) return undefined;
    if (!erasers[name]) throw new Error(`Unknown eraser ${name} (the erasers are ${Object.keys(erasers).join(', ')})`);
    return erasers[name];
  };
  if (!Array.isArray(spec.items)) throw new Error(`whiteboard: items is the list of what the board draws ([] for an empty board), not ${JSON.stringify(spec.items)}`);
  // first every item read, its drawing (if it draws) handed on to be planned with the rest in one list (sketch.mjs);
  // then the timeline, each drawing painted by its plan
  const items = [], dings = [], places = [], drawings = [], drawn = [];
  spec.items.forEach((item, n) => {
    for (const key of Object.keys(item)) if (!ITEM_KEYS.has(key)) throw new Error(`whiteboard item ${n} has unsupported key ${key} (an item takes ${[...ITEM_KEYS].join(', ')})`);
    // A name makes the item a thing a push can frame and a transition can go through (regionsAt → name).
    if (item.name !== undefined && !(typeof item.name === 'string' && /^[a-z][a-zA-Z0-9-]*$/.test(item.name))) throw new Error(`whiteboard item ${n}: name is one word for the thing it draws (e.g. "pebble"), not ${JSON.stringify(item.name)}`);
    const accept = item.accept ?? [];
    if (!(Array.isArray(accept) && accept.every(a => typeof a === 'string' && a))) throw new Error(`whiteboard item ${n}: accept is a list of the critics whose findings this drawing keeps as written (e.g. ["pen-lifts"]), not ${JSON.stringify(item.accept)}`);
    if (item.accept !== undefined && typeof item.write === 'string') throw new Error(`whiteboard item ${n}: accept is for a drawing's critics, and words written on (write) have none — leave accept out`);
    const at = clock.at(item.at), erase = eraseOf(item), path = `items[${n}]`, who = `items[${n}]${item.name ? ` ("${item.name}")` : ''}`;
    places.push({at, erase, path, dur: item.dur, write: typeof item.write === 'string', ...placeOf(item), ...(item.name ? {name: item.name} : {})});
    if (item.eureka) {
      const [x, y] = item.eureka;
      items.push({at, draw: (ctx, s) => drawGlow(ctx, x, y + 8, 95, ease(clamp01(s / .5))), erase});
      // the bulb is one drawing: its glass and base first, then its rays (footprint-story's order: outline, then detail)
      const shapesOf = [...lightBulb(x, y, 1).map(p => shapeOf(p, {group: 'bulb'})), ...bulbRays(x, y, 1).map(p => shapeOf(p, {group: 'bulb', layer: 'detail'}))];
      drawn.push({item: items.push({at, color: INK.orange, erase}) - 1, ink: INK.orange});
      drawings.push({path, who, at, seconds: EUREKA.seconds, shapes: shapesOf, size: EUREKA.size, seed: item.seed ?? 31, accept, eureka: true});
      dings.push(at + .05);
      return;
    }
    if (!(item.dur > 0)) throw new Error(`whiteboard item ${n} needs a duration: dur, its seconds of drawing (e.g. "dur": 1.2)`);
    const ink = color(item.color);
    if (typeof item.write === 'string') {
      const opts = {size: item.size ?? 48, align: item.align ?? 'left', color: ink};
      items.push({at, color: ink, draw: (ctx, s) => drawWriting(ctx, item.write, item.x, item.y, ease(clamp01(s / item.dur)), opts), erase});
      return;
    }
    if (!Array.isArray(item.draw)) throw new Error(`whiteboard item ${n} draws nothing: give it write: "words", or draw: [[shape, …args], …] (the shapes are ${Object.keys(SHAPES).join(', ')})`);
    const lines = item.draw.flatMap(([kind, ...args]) => { if (!SHAPES[kind]) throw new Error(`Unknown shape ${kind} (the shapes are ${Object.keys(SHAPES).join(', ')})`); return SHAPES[kind](...args); });
    drawn.push({item: items.push({at, color: ink, erase}) - 1, ink});
    drawings.push({path, who, at, seconds: item.dur, shapes: lines.map(p => shapeOf(p)), size: item.size ?? 6, seed: item.seed ?? n + 1, accept});
  });
  const sketch = planSketches(drawings);
  sketch.byDrawing.forEach((parts, k) => { items[drawn[k].item].draw = sketchDraw(parts, drawn[k].ink); });
  // A spotlight is a camera move: it eases in and out at the film's camera speed (a director's note).
  const speed = motion.cameraSpeed ?? 1, spotEase = {in: .6 / speed, out: .7 / speed};
  const spots = (spec.spots ?? []).map(s => ({at: clock.at(s.from), until: clock.at(s.to), cx: s.at[0], cy: s.at[1], r: s.r, zoom: s.zoom ?? 1.09, ...spotEase}));
  return {items, dings, spots, places, sketch};
}

const measurer = createCanvas(8, 8).getContext('2d');
/**
 * The shapes that frame words inside them (a box, a ring, a speech bubble, a tag): each such shape of an item is a room,
 * so a word wholly inside one is its label, not laid over it — a table of rects and lines with words in its cells, a
 * title box with an underline, "SALE" on a tag (the review's words-over-drawing check).
 */
const HOLDS = new Set(['rect', 'ellipse', 'bubble', 'tag']);
/**
 * Where an item is drawn on the board, and what to call it: {box, label, drawing?, holds?} (for the preview studio's hit
 * test, and for the review: `drawing` marks ink that is not words, so words laid over it and a drawing half off the
 * board can be found and named by their item; `holds` the boxes of its shapes that frame words, HOLDS).
 */
function placeOf(item) {
  if (item.eureka) { const [x, y] = item.eureka; return {box: [x - 95, y - 95, x + 95, y + 110], label: 'eureka', drawing: true}; }
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
  const rooms = shapesOf.filter(([kind]) => HOLDS.has(kind)).map(([kind, ...args]) => (SHAPES[kind]?.(...args) ?? []).flat()).filter(p => p.length)
    .map(p => [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))]);
  return {box: [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad], label: shapesOf.map(([kind]) => kind).join(', '), drawing: true,
    ...(rooms.length ? {holds: rooms} : {})};
}

/**
 * The words written on the board: [{text, from (fully written), to (the eraser starts), gone? (the eraser's end: its last
 * ink), path}] — for the reading-time check (from–to) and the example label, which stays while any ink does (to gone).
 */
export function boardTexts(board) {
  return board.places.filter(p => p.write).map(p => ({text: p.label, from: p.at + p.dur, to: p.erase ? p.erase.at : Infinity, ...(p.erase ? {gone: p.erase.at + p.erase.dur} : {}), path: p.path}));
}

/** What the board shows at t, item by item: [{box, path: 'items[n]', label, name?, drawing?, holds?}] (drawn, and not yet wiped away). */
export function boardRegions(board, t) {
  return board.places.filter(p => p.box && t >= p.at && !(p.erase && t >= p.erase.at + p.erase.dur))
    .map(({box, path, label, name, drawing, holds}) => ({box, path, label, ...(name ? {name} : {}), ...(drawing ? {drawing} : {}), ...(holds ? {holds} : {})}));
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
  // Where its drawing code lives (segments/kitcode.mjs): nowhere a piece must name — the whiteboard is built in, and
  // its code is in StoryReel's drawing fingerprint, which every cached piece's key holds (film.mjs imports it).
  sources: {entry: () => []},
  story: {
    motion: ['cameraSpeed'],
    compile(spec, clock, motion) {
      const board = compileWhiteboard(spec, clock, motion);
      const erasers = Object.values(spec.erasers ?? {}).map(e => ({time: clock.at(e.at) + (e.plus ?? 0), type: 'slide'}));
      const {sketch} = board;
      return {hang: .9, spotAt: t => spotAt(board, t), draw: (c, t, spot) => drawWhiteboard(c, board, t, spot), regionsAt: t => boardRegions(board, t), texts: () => boardTexts(board),
        sounds: [...board.dings.map(time => ({time, type: 'chime'})), ...erasers],
        // the drawings run again through footprint-story's intent decider as a chart, its run recorded (`storyreel
        // check`: check/motions.mjs, `log --why duration-<k> --motion whiteboard`), and what its critics found, each
        // naming its item and the fix (the review's `motion` check) — as an isometric world hands out its moves
        ...(sketch.run ? {motionRun: sketch.run, motionFindings: sketch.findings, motionIntents: sketch.intents} : {}),
        // what the film's record keeps of the board (film/summaries.mjs): each drawing's strokes, lifts and seconds
        ...(sketch.sketches.length ? {summary: sketch.summary} : {}),
        ...(sketch.notes.length ? {notes: Object.freeze(sketch.notes.map(n => Object.freeze(n)))} : {})};
    },
  },
};
