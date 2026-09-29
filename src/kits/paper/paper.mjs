/**
 * Paper pieces of a recipe: the typed card the board prop becomes, a stage (chip, title, code
 * panel, list, footer) and the summary cards. All drawing is in 1600×900 units on the course's
 * paper style; the caller owns the canvas transform.
 */
import {INK, lightBulb, drawStrokes, drawIcon, ease} from '../whiteboard/board.mjs';

/**
 * Where the card sits as it moves (aside for the first stage, into a kit's scene): its box on the
 * page before the move, and the move as a camera {sx, sy, z, tx, ty} (translate, scale, about the
 * card's centre). drawCard draws with it; the preview studio's hit test reads it.
 */
export function cardPlacement(geo, card, place = {}) {
  const [x0, y0] = geo.pushed(card.prop[0], card.prop[1]), [x1, y1] = geo.pushed(card.prop[2], card.prop[3]);
  const m = ease(place.move ?? 0), cen = ease(place.center ?? 0), cx0 = (x0 + x1) / 2, cy0 = (y0 + y1) / 2;
  const aside = place.aside ?? {at: [cx0, cy0], scale: 1}, loop = place.loop ?? aside;
  const tx = aside.at[0] + (loop.at[0] - aside.at[0]) * cen, ty = aside.at[1] + (loop.at[1] - aside.at[1]) * cen;
  const sc = 1 + (aside.scale + (loop.scale - aside.scale) * cen - 1) * m;
  return {box: [x0, y0, x1, y1], camera: {sx: cx0, sy: cy0, z: sc, tx: cx0 + (tx - cx0) * m, ty: cy0 + (ty - cy0) * m}};
}

/** Each card row's box on the page before the card moves (the row's glow band): [{box, index, label}]. */
export function cardRowBoxes(geo, card) {
  const [x0] = geo.pushed(card.prop[0], card.prop[1]), [x1] = geo.pushed(card.prop[2], card.prop[3]);
  return card.rows.map((row, index) => { const [, ly] = geo.pushed(card.labelX, row.by); return {box: [x0 + 14, ly - 36, x1 - 14, ly + 48], index, label: row.label}; });
}

/**
 * The typed card. Each row shows {value, tone, note | tags: [{label, text}], source}.
 * `geo.pushed(bx, by)` maps a board point to paper units once the camera has
 * pushed into the prop; `place` = {move, center, to: [x, y], scale, loop: {at: [x, y], scale}}
 * moves the card aside (move) and then into the middle of the loop (center).
 */
export function drawCard(c, P, geo, card, {rows, glow = {}, pop = {}, named = 0, alpha = 1, place = {}, columns = {}}) {
  if (alpha <= 0) return;
  const {box: [x0, y0, x1, y1], camera: k} = cardPlacement(geo, card, place);
  c.save(); c.globalAlpha *= alpha;
  c.translate(k.tx, k.ty); c.scale(k.z, k.z); c.translate(-k.sx, -k.sy);
  P.glass(x0, y0, x1 - x0, y1 - y0, P.C.accent, 18);
  c.strokeStyle = P.C.ink; c.lineWidth = 3;
  for (const rx of card.rings) { const [cx, cy] = geo.pushed(rx, card.prop[1]); c.beginPath(); c.arc(cx, cy, card.ringR * geo.zoomScale, 0, Math.PI * 2); c.stroke(); }
  P.alpha(1 - named, () => P.text(card.header, (x0 + x1) / 2, y0 + 48, 17, P.C.accent, {mono: true, weight: 700}));
  if (card.named) P.alpha(named, () => { P.text(card.named.title, (x0 + x1) / 2, y0 + 44, 24, P.C.accent, {mono: true, weight: 700}); P.text(card.named.sub, (x0 + x1) / 2, y0 + 74, 17, P.C.dim, {}); });
  for (const row of card.rows) {
    const {value, tone, note, source} = rows[row.key], [lx, ly] = geo.pushed(card.labelX, row.by), g = glow[row.key] ?? 0, color = P.C[tone];
    if (g > 0) { c.save(); c.globalAlpha *= g * .14; c.fillStyle = color; c.beginPath(); c.roundRect(x0 + 14, ly - 36, x1 - x0 - 28, 84, 10); c.fill(); c.restore(); }
    P.text(row.label, lx, ly, 30, P.C.ink, {align: 'left', mono: true, weight: 600});
    // A value that just landed pops in (anticipation → settle); its source slides in after it.
    const p = pop[row.key] === undefined ? 1 : Math.min(1, pop[row.key] / .45), grow = 1 + .38 * (1 - p) ** 2;
    c.save(); c.translate(lx + 190, ly); c.scale(grow, grow); P.text(value, 0, 0, 28, color, {align: 'left', mono: true, weight: 700}); c.restore();
    if (note) P.alpha(p, () => P.text(note, lx + 190, ly + 36, 19, P.C.dim, {align: 'left'}));
    // More of where the line came from (e.g. WHEN it was checked, what it COVERS): small tags under the value.
    const tags = rows[row.key].tags;
    if (tags?.length) P.alpha(pop[row.key] === undefined ? 1 : Math.max(0, Math.min(1, (pop[row.key] - .3) / .4)), () => drawTags(c, P, lx, ly + 38, tags, color, columns));
    // Where the line came from: every known line carries its source (the card's SOURCE column).
    if (source) {
      const q = pop[row.key] === undefined ? 1 : Math.max(0, Math.min(1, (pop[row.key] - .15) / .4));
      if (q <= 0) continue;
      c.save(); c.globalAlpha *= ease(q);
      // A card may put a sign in its SOURCE chips (card.sourceIcon, e.g. 'tag': who told you).
      const iw = card.sourceIcon ? 24 : 0;
      c.font = '700 17px Menlo'; const w = c.measureText(source).width + 26 + iw, sx = x1 - 26 - w + (1 - ease(q)) * 36;
      c.save(); c.fillStyle = color; c.globalAlpha *= .12; c.beginPath(); c.roundRect(sx, ly - 16, w, 32, 16); c.fill(); c.restore();
      c.strokeStyle = color; c.lineWidth = 1.5; c.beginPath(); c.roundRect(sx, ly - 16, w, 32, 16); c.stroke();
      if (iw) drawIcon(c, card.sourceIcon, sx + 20, ly, .3, color, 1.6);
      P.text(source, sx + iw + (w - iw) / 2, ly, 17, color, {mono: true, weight: 700});
      if (columns.source > 0) { c.save(); c.globalAlpha *= columns.source; c.strokeStyle = color; c.lineWidth = 3.5; c.beginPath(); c.roundRect(sx - 6, ly - 22, w + 12, 44, 22); c.stroke(); c.restore(); }
      c.restore();
    }
  }
  if (card.sourceHead) P.text(card.sourceHead, x1 - 30, geo.pushed(0, card.rows[0].by)[1] - 48, 14, P.C.dim, {align: 'right', mono: true, weight: 700});
  c.restore();
}

/**
 * Tags in a row, left to right from (x, y): each a small outlined chip, "[icon] LABEL text".
 * `hilite` (label → 0..1) rings the tags of one kind while the voice names them.
 */
export function drawTags(c, P, x, y, tags, color, hilite = {}) {
  let at = x;
  for (const {label, text, icon} of tags) {
    const iw = icon ? 24 : 0, lw = P.measure(label, 13, {mono: true, weight: 700}), tw = P.measure(text, 16, {mono: true}), w = iw + lw + tw + 30;
    c.save(); c.fillStyle = color; c.globalAlpha *= .1; c.beginPath(); c.roundRect(at, y - 14, w, 28, 8); c.fill(); c.restore();
    c.save(); c.strokeStyle = color; c.lineWidth = 1.2; c.beginPath(); c.roundRect(at, y - 14, w, 28, 8); c.stroke(); c.restore();
    if (icon) drawIcon(c, icon, at + 18, y, .28, color, 1.5);
    P.text(label, at + 10 + iw, y, 13, color, {align: 'left', mono: true, weight: 700});
    P.text(text, at + 20 + iw + lw, y, 16, P.C.ink, {align: 'left', mono: true});
    if (hilite[label] > 0) { c.save(); c.globalAlpha *= hilite[label]; c.strokeStyle = color; c.lineWidth = 3.5; c.beginPath(); c.roundRect(at - 5, y - 19, w + 10, 38, 12); c.stroke(); c.restore(); }
    at += w + 10;
  }
}

/** Spring settle for a pop: overshoots a little, then rests at 1 (p: 0..1). */
export const spring = p => { if (p >= 1) return 1; if (p <= 0) return 0; return 1 - Math.exp(-6 * p) * Math.cos(9 * p); };

/** A light running around a box's border (the "border beam" micro-interaction). box = [x, y, w, h]. */
export function drawBorderBeam(c, [x, y, w, h], t, color, alpha = 1) {
  const per = 2 * (w + h), head = ((t * 520) % per + per) % per, len = 170, pt = d => {
    d = ((d % per) + per) % per;
    if (d < w) return [x + d, y]; if (d < w + h) return [x + w, y + d - w]; if (d < 2 * w + h) return [x + w - (d - w - h), y + h]; return [x, y + h - (d - 2 * w - h)];
  };
  c.save(); c.lineCap = 'round'; c.strokeStyle = color;
  for (let i = 0; i < 24; i++) {
    const [ax, ay] = pt(head - len * (i + 1) / 24), [bx, by] = pt(head - len * i / 24);
    c.globalAlpha = alpha * .9 * (1 - i / 24); c.lineWidth = 5 - i * .15; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
  }
  c.restore();
}

/** A small success burst: rays and dots flying out, fading (age in seconds). */
export function drawBurst(c, [x, y], age, color) {
  if (age < 0 || age > .9) return;
  const q = age / .9;
  c.save(); c.strokeStyle = color; c.fillStyle = color; c.globalAlpha *= 1 - q; c.lineWidth = 4; c.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 + .3, r0 = 70 + 40 * ease(q), r1 = r0 + 22 * (1 - q);
    c.beginPath(); c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); c.stroke();
    c.beginPath(); c.arc(x + Math.cos(a + .3) * (r0 + 18), y + Math.sin(a + .3) * (r0 + 18), 3, 0, 7); c.fill();
  }
  c.restore();
}

/** The recap's story strip: seven frames on a snake path (four across, then three back). */
export const RECAP_SLOTS = [[230, 330], [570, 330], [910, 330], [1250, 330], [1250, 650], [910, 650], [570, 650]];
const FRAME = [300, 169];
const strip = i => RECAP_SLOTS[Math.max(0, Math.min(RECAP_SLOTS.length - 1, i))];
/** A point on the strip's path at a fractional frame index. */
export function recapPoint(f) {
  const i = Math.max(0, Math.min(RECAP_SLOTS.length - 1.0001, f)), a = strip(Math.floor(i)), b = strip(Math.floor(i) + 1), u = i - Math.floor(i);
  if (a[1] !== b[1]) { const cx = 1460, cy = (a[1] + b[1]) / 2; return [(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * cx + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * cy + u * u * b[1]]; }
  return [a[0] + (b[0] - a[0]) * u, a[1]];
}
/**
 * The recap: the lesson's own frames along a path, the playhead (focus f, fractional) lighting
 * each as the voice names it. `enter` (0..1) fades the strip in; `hide` names a frame drawn by
 * the caller instead (the match cut into or out of the strip).
 */
export function drawRecap(c, P, frames, {f, enter = 1, hide = -1, t = 0}) {
  // The path first, dotted, so the frames sit on it.
  c.save(); c.globalAlpha *= .5 * enter; c.strokeStyle = P.C.dim; c.lineWidth = 3; c.setLineDash([2, 10]); c.lineCap = 'round'; c.lineDashOffset = -t * 20;
  c.beginPath(); for (let k = 0; k <= 60; k++) { const [x, y] = recapPoint(k / 60 * (RECAP_SLOTS.length - 1)); k ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); c.restore();
  const order = frames.map((_, i) => i).sort((a, b) => Math.abs(f - b) - Math.abs(f - a));
  for (const i of order) {
    if (i === hide) continue;
    const near = Math.max(0, 1 - Math.abs(f - i)), [x, y] = strip(i), sc = 1 + .55 * ease(near), w = FRAME[0] * sc, h = FRAME[1] * sc;
    const a = enter * (.45 + .55 * near);
    c.save(); c.globalAlpha *= a;
    drawRecallFramed(c, P, frames[i].image, x - w / 2, y - h / 2, w, h, near);
    c.fillStyle = near > .5 ? P.C.accent : P.C.dim; c.beginPath(); c.arc(x - w / 2 + 4, y - h / 2 + 4, 15, 0, 7); c.fill();
    P.text(String(i + 1), x - w / 2 + 4, y - h / 2 + 5, 15, '#fff', {mono: true, weight: 700});
    P.alpha(ease(Math.max(0, (near - .6) / .4)), () => P.text(frames[i].caption, x, y + h / 2 + 32, 30, P.C.ink, {display: true, weight: 700}));
    c.restore();
  }
  // The playhead: a glowing dot on the path.
  const [px, py] = recapPoint(f), g = c.createRadialGradient(px, py, 0, px, py, 30);
  g.addColorStop(0, `rgba(255,200,80,${.95 * enter})`); g.addColorStop(1, 'rgba(255,200,80,0)'); c.fillStyle = g; c.fillRect(px - 30, py - 30, 60, 60);
}
function drawRecallFramed(c, P, image, x, y, w, h, near) {
  c.save(); c.shadowColor = `rgba(60,50,35,${.18 + .2 * near})`; c.shadowBlur = 14 + 20 * near; c.shadowOffsetY = 5 + 6 * near;
  c.fillStyle = '#fff'; c.beginPath(); c.roundRect(x, y, w, h, 10); c.fill(); c.restore();
  if (image) { c.save(); c.beginPath(); c.roundRect(x, y, w, h, 10); c.clip(); c.drawImage(image, x, y, w, h); c.restore(); }
  c.strokeStyle = near > .5 ? P.C.accent : P.C.edge; c.lineWidth = near > .5 ? 3 : 2; c.beginPath(); c.roundRect(x, y, w, h, 10); c.stroke();
}
export const recapSlotBox = (i, scale = 1) => { const [x, y] = strip(i), w = FRAME[0] * scale, h = FRAME[1] * scale; return [x - w / 2, y - h / 2, w, h]; };
export {drawRecallFramed};

/** A dashed curve that draws itself from `from` to `to`, flowing while it is shown, with an arrowhead. */
export function drawConnector(c, P, from, to, color, w, t) {
  const [ax, ay] = from, [bx, by] = to, mx = (ax + bx) / 2;
  c.save(); c.globalAlpha *= Math.min(1, w * 1.4); c.strokeStyle = color; c.lineWidth = 4.5; c.lineCap = 'round';
  c.setLineDash([1, 9]); c.lineDashOffset = -t * 30;
  c.beginPath(); c.moveTo(ax, ay); c.bezierCurveTo(mx, ay, mx, by, bx, by); c.stroke(); c.setLineDash([]);
  c.fillStyle = color; c.beginPath(); c.moveTo(bx - 2, by); c.lineTo(bx + 12, by - 7); c.lineTo(bx + 12, by + 7); c.fill();
  c.beginPath(); c.arc(ax, ay, 5, 0, 7); c.fill(); c.restore();
}

/** Where a pause-and-guess card sits: its vertical centre for each place. */
export const GUESS_PLACES = {top: 130, center: 450, bottom: 770};

/** A closed rounded rectangle as one polyline (for strokes drawn by hand, e.g. an inked border). */
function roundedRectPoints(x, y, w, h, r) {
  const pts = [], arc = (cx, cy, a0) => { for (let i = 0; i <= 6; i++) { const a = a0 + Math.PI / 2 * i / 6; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, Math.PI / 2); arc(x + r, y + r, Math.PI);
  pts.push(pts[0]);
  return pts;
}
/** The storybook card: a warm paper card, darker toward its edges, with an inked, hand-drawn border. */
function storybookCard(c, x, y, w, h, fill, ink) {
  c.save(); c.shadowColor = 'rgba(60,40,20,.28)'; c.shadowBlur = 18; c.shadowOffsetY = 6; c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, 18); c.fill(); c.restore();
  const g = c.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * .3, x + w / 2, y + h / 2, Math.max(w, h) * .62);
  g.addColorStop(0, 'rgba(120,90,40,0)'); g.addColorStop(1, 'rgba(120,90,40,.18)');
  c.fillStyle = g; c.beginPath(); c.roundRect(x, y, w, h, 18); c.fill();
  drawStrokes(c, [roundedRectPoints(x + 7, y + 7, w - 14, h - 14, 14)], 1, {color: ink, size: 4.5, seed: 91});
  drawStrokes(c, [roundedRectPoints(x + 13, y + 13, w - 26, h - 26, 11)], 1, {color: ink, size: 1.6, seed: 92});
}

/** How long each half of the reveal flip takes (the card closes on the question, opens on the answer). */
export const GUESS_FLIP = .2;

/**
 * Pause and guess, over any scene: the question on a card with a ring that runs out over the
 * pause the narration holds, then the reveal — the card FLIPS: it closes on the question and opens
 * on the answer (the two texts never overlap), with a tick and a small burst. The card sits at the
 * top, centre or bottom so the picture the question is about stays in view. A theme's `guess`
 * section sets its look: {look: 'clean' | 'storybook', card, ink, answer} (storybook = a paper
 * card with an inked, hand-drawn border).
 * g = {question, answer?, place, start, end (the pause), until (the card leaves)}.
 */
export function drawGuess(c, P, paperStyle, g, t) {
  const inA = Math.max(0, Math.min(1, (t - g.start) / .35)), out = 1 - ease(Math.max(0, Math.min(1, (t - g.until) / .5)));
  const a = Math.min(ease(inA), out); if (a <= 0) return;
  const look = paperStyle.guess ?? {}, story = look.look === 'storybook';
  const ink = look.ink ?? P.C.ink, answerInk = look.answer ?? P.C.available, fill = look.card ?? paperStyle.palette.card ?? paperStyle.palette.bg;
  const k = g.answer ? (t - g.end) / GUESS_FLIP : -1, onAnswer = Boolean(g.answer) && k >= 1;
  const squash = k < 0 || k >= 2 ? 1 : k < 1 ? 1 - ease(k) : ease(k - 1);
  const text = onAnswer ? g.answer : g.question, cy = GUESS_PLACES[g.place], size = 54, font = {display: true, weight: 700};
  const w = Math.min(1440, P.measure(text, size, font) + 230), h = 150, x = 800 - w / 2, y = cy - h / 2, rx = x + 88, sc = .86 + .14 * spring(inA);
  c.save(); c.globalAlpha *= a; c.translate(800, cy); c.scale(sc * Math.max(squash, .002), sc); c.translate(-800, -cy);
  const edge = onAnswer ? (story ? answerInk : P.C.available) : (story ? ink : P.C.accent);
  if (story) storybookCard(c, x, y, w, h, fill, edge);
  else {
    c.save(); c.shadowColor = 'rgba(40,32,20,.25)'; c.shadowBlur = 24; c.shadowOffsetY = 8; c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, 28); c.fill(); c.restore();
    c.strokeStyle = edge; c.lineWidth = 4; c.beginPath(); c.roundRect(x, y, w, h, 28); c.stroke();
  }
  // The ring: the pause, running out, with the whole seconds left inside; on the answer's face, a tick.
  const left = Math.max(0, g.end - t), track = story ? 'rgba(80,60,40,.22)' : P.C.edge;
  c.lineCap = 'round'; c.lineWidth = 12; c.strokeStyle = track; c.beginPath(); c.arc(rx, cy, 46, 0, Math.PI * 2); c.stroke();
  if (!onAnswer) {
    c.strokeStyle = story ? ink : P.C.accent; c.beginPath(); c.arc(rx, cy, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left / (g.end - g.start)); c.stroke();
    if (left > 0) P.text(String(Math.ceil(left)), rx, cy + 2, 50, story ? ink : P.C.accent, font);
  } else {
    c.strokeStyle = answerInk; c.beginPath(); c.arc(rx, cy, 46, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 10; c.lineJoin = 'round'; c.beginPath(); c.moveTo(rx - 20, cy + 2); c.lineTo(rx - 5, cy + 18); c.lineTo(rx + 22, cy - 16); c.stroke();
  }
  P.text(text, x + 160, cy + 4, size, onAnswer ? answerInk : ink, {...font, align: 'left'});
  // Mid-flip, the turning card darkens a little, as a card does when it turns away from the light.
  if (squash < 1) { c.fillStyle = `rgba(30,20,10,${(.22 * (1 - squash)).toFixed(3)})`; c.beginPath(); c.roundRect(x, y, w, h, story ? 18 : 28); c.fill(); }
  c.restore();
  if (onAnswer && k >= 2) { c.save(); c.globalAlpha *= a; drawBurst(c, [rx, cy], t - g.end - 2 * GUESS_FLIP, answerInk); c.restore(); }
}

/** Where a card row's right edge sits in paper units after the card moved to `place`. */
export function cardEdge(geo, card, place, by) {
  const [x0, y0] = geo.pushed(card.prop[0], card.prop[1]), [x1, y1] = geo.pushed(card.prop[2], card.prop[3]), [, py] = geo.pushed(card.prop[2], by);
  const s = place.scale, cx0 = (x0 + x1) / 2, cy0 = (y0 + y1) / 2;
  return [(x1 - cx0) * s + place.at[0], (py - cy0) * s + place.at[1]];
}

/** Panel geometry shared by every stage. */
export const PANEL = {X0: 690, Y0: 190, PW: 830, PH: 640};

/**
 * One paper stage: {chip, chipDark, title, chrome, panel, panelX, file, label, lh, code: [[[text, tone]]], codeSize, marks: [{line, icon, w}],
 * shown(i) → 0..1, focus: [{from, to, tone, w}], list: [[what, detail, alpha]], footer: [text, tone, alpha],
 * caption: [text, alpha], custom(c, P, box)}.
 */
export function drawStage(c, P, paperStyle, a, st) {
  if (a <= 0) return;
  c.save(); c.globalAlpha *= a; c.translate(0, (1 - ease(a)) * 18); // stages rise into place and sink away
  const tone = {kw: P.C.accent, ink: P.C.ink, known: P.C.available, unknown: P.C.unknown, dim: P.C.dim};
  // The chrome (the chip and the title); a chrome-free stage (chrome: false) is the picture alone.
  if (st.chrome !== false) {
    c.font = '700 16px Menlo'; const cw = c.measureText(st.chip).width + 36;
    c.fillStyle = st.chipDark ? P.C.ink : P.C.accent; c.beginPath(); c.roundRect(96, 84, cw, 36, 18); c.fill();
    c.fillStyle = paperStyle.palette.bg; c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillText(st.chip, 96 + cw / 2, 103);
    P.text(st.title, 800, 104, 50, P.C.ink, {display: true, weight: 600});
  }
  // The panel sits right of the card in a lesson; a stage with the page to itself centres it (panelX).
  const {Y0, PW, PH} = PANEL, X0 = st.panelX ?? PANEL.X0, LH = st.lh ?? 36, TOP = Y0 + 92, base = c.globalAlpha;
  if (st.panel !== false) P.glass(X0, Y0, PW, PH, P.C.accent, 18);
  if (st.file) P.text(st.file, X0 + 30, Y0 + 40, 17, P.C.dim, {align: 'left', mono: true});
  if (st.label) P.text(st.label, X0 + PW - 30, Y0 + 40, 15, P.C.dim, {align: 'right', mono: true, weight: 700});
  for (const fb of st.focus ?? []) if (fb.w > 0) { c.fillStyle = P.C[fb.tone]; c.globalAlpha = base * .11 * fb.w; c.fillRect(X0 + 12, TOP + fb.from * LH - LH / 2, PW - 24, (fb.to - fb.from + 1) * LH); c.globalAlpha = base; }
  if (st.custom) st.custom(c, P, {X0, Y0, PW, PH});
  // Signs beside code lines (e.g. the tag, clock and flashlight a lesson taught), popping in as named.
  for (const m of st.marks ?? []) if (m.w > 0) {
    const y = TOP + m.line * LH, k = .7 + .3 * spring(Math.min(1, m.w));
    c.save(); c.globalAlpha *= Math.min(1, m.w * 1.5); c.translate(X0 + 17, y); c.scale(k, k); drawIcon(c, m.icon, 0, 0, .32, P.C.accent, 2); c.restore();
  }
  c.font = `500 ${st.codeSize ?? 23}px Menlo`; c.textAlign = 'left'; c.textBaseline = 'middle';
  (st.code ?? []).forEach((line, i) => {
    const f = st.shown(i); if (!(f > 0) || !line.length) return;
    const y = TOP + i * LH, width = line.reduce((n, [txt]) => n + c.measureText(txt).width, 0);
    c.save(); c.beginPath(); c.rect(X0 + 30, y - LH / 2, width * ease(Math.min(1, f)) + 4, LH); c.clip();
    let x = X0 + 36; for (const [txt, kind] of line) { c.fillStyle = tone[kind]; c.fillText(txt, x, y); x += c.measureText(txt).width; }
    c.restore();
  });
  (st.list ?? []).forEach(([what, detail, al], n) => {
    if (!(al > 0)) return;
    const y = TOP + ((st.code ?? []).length + .8 + n) * LH;
    P.alpha(ease(al), () => { P.text('•  ' + what, X0 + 36, y, 21, P.C.ink, {align: 'left', weight: 600}); P.text(detail, X0 + PW - 36, y, 19, P.C.accent, {align: 'right', mono: true}); });
  });
  if (st.footer && st.footer[2] > 0) P.alpha(ease(st.footer[2]), () => P.text(st.footer[0], X0 + PW / 2, Y0 + PH + 38, 22, P.C[st.footer[1]], {weight: 700}));
  if (st.caption && st.caption[1] > 0) P.alpha(ease(st.caption[1]), () => P.text(st.caption[0], 800, 872, 30, P.C.ink, {display: true, weight: 600}));
  c.restore();
}

/**
 * Where a stage's parts are, for the preview studio's hit test: [{box, part, index?}] with part one of
 * title · panel · focus · line · mark · list · footer. The same geometry drawStage draws with (the
 * rise of a stage mid hand-over is left out).
 */
export function stageBoxes(st) {
  const boxes = [], {Y0, PW, PH} = PANEL, X0 = st.panelX ?? PANEL.X0, LH = st.lh ?? 36, TOP = Y0 + 92;
  if (st.chrome !== false) boxes.push({box: [96, 64, 1504, 144], part: 'title'});
  if (st.panel !== false) boxes.push({box: [X0, Y0, X0 + PW, Y0 + PH], part: 'panel'});
  (st.focus ?? []).forEach((fb, index) => { if (fb.w > 0) boxes.push({box: [X0 + 12, TOP + fb.from * LH - LH / 2, X0 + PW - 12, TOP + (fb.to + .5) * LH], part: 'focus', index}); });
  (st.code ?? []).forEach((line, index) => { if (st.shown(index) > 0 && line.length) boxes.push({box: [X0 + 30, TOP + index * LH - LH / 2, X0 + PW - 30, TOP + index * LH + LH / 2], part: 'line', index}); });
  (st.marks ?? []).forEach((m, index) => { if (m.w > 0) { const y = TOP + m.line * LH; boxes.push({box: [X0 + 1, y - 16, X0 + 33, y + 16], part: 'mark', index}); } });
  (st.list ?? []).forEach(([, , al], index) => { if (al > 0) { const y = TOP + ((st.code ?? []).length + .8 + index) * LH; boxes.push({box: [X0 + 30, y - LH / 2, X0 + PW - 30, y + LH / 2], part: 'list', index}); } });
  if (st.footer && st.footer[2] > 0) boxes.push({box: [X0, Y0 + PH + 18, X0 + PW, Y0 + PH + 58], part: 'footer'});
  return boxes;
}

/** A lesson frame, reused as a picture: rounded, framed, with a soft shadow. */
function drawRecall(c, P, image, x, y, w, h) {
  c.save(); c.shadowColor = 'rgba(60,50,35,.25)'; c.shadowBlur = 18; c.shadowOffsetY = 6;
  c.fillStyle = '#fff'; c.beginPath(); c.roundRect(x, y, w, h, 12); c.fill(); c.restore();
  c.save(); c.beginPath(); c.roundRect(x, y, w, h, 12); c.clip(); c.drawImage(image, x, y, w, h); c.restore();
  c.strokeStyle = P.C.edge; c.lineWidth = 2; c.beginPath(); c.roundRect(x, y, w, h, 12); c.stroke();
}
const wrap = (P, text, size, width) => {
  const lines = [''];
  for (const wd of text.split(' ')) { const next = lines.at(-1) ? `${lines.at(-1)} ${wd}` : wd; if (P.measure(next, size, {display: true, weight: 600}) > width && lines.at(-1)) lines.push(wd); else lines[lines.length - 1] = next; }
  return lines;
};

/**
 * The summary: first a hero (a lesson frame, large, with the name of what it shows), then three
 * cards in the lesson's order, each led by a picture the viewer already saw, and a closing line.
 */
export function drawSummary(c, P, cards, closing, hero) {
  const slot = i => [150 + i * 450 + 18, 190 + 18, 364, 364 * 9 / 16];
  const m = hero ? ease(hero.morph) : 1;
  if (hero && hero.alpha > 0 && m < 1) P.alpha(ease(hero.alpha), () => {
    // The hero picture flies into its card's picture slot as the cards arrive (a match cut).
    const to = slot(hero.into), r = [420, 170, 760, 428].map((v, j) => v + (to[j] - v) * m);
    if (hero.image) drawRecall(c, P, hero.image, ...r);
    P.alpha(1 - Math.min(1, m * 2.5), () => {
      P.text(hero.text, 800, 668, 54, P.C.ink, {display: true, weight: 700});
      if (hero.sub) P.text(hero.sub, 800, 728, 26, P.C.dim, {display: true});
    });
  });
  cards.forEach(({icon, head, text, alpha, image}, i) => {
    if (!(alpha > 0)) return;
    const x = 150 + i * 450, y = 190, w = 400, h = 470, cx = x + w / 2;
    P.alpha(ease(alpha), () => {
      P.glass(x, y, w, h, P.C.accent, 18);
      if (image && !(hero && i === hero.into && m < 1)) drawRecall(c, P, image, x + 18, y + 18, w - 36, (w - 36) * 9 / 16);
      else {
        c.strokeStyle = P.C.ink; c.fillStyle = P.C.ink; c.lineWidth = 3;
        if (icon === 'bulb') drawStrokes(c, lightBulb(cx, y + 80, 1.1), 1, {color: INK.orange, size: 5, seed: 41});
        if (icon === 'code') P.text('{ }', cx, y + 96, 54, P.C.accent, {mono: true, weight: 700});
      }
      P.text(`${i + 1}  ·  ${head}`, cx, y + 262, 22, P.C.accent, {mono: true, weight: 700});
      wrap(P, text, 28, w - 56).forEach((ln, j) => P.text(ln, cx, y + 312 + j * 38, 28, P.C.ink, {display: true, weight: 600}));
    });
  });
  if (closing && closing.alpha > 0) P.alpha(ease(closing.alpha), () => P.text(closing.text, 800, 730, 32, P.C.ink, {display: true, weight: 600}));
}
