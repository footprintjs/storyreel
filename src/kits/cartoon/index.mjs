/**
 * The cartoon kit (a story kit): a flat, friendly cartoon world drawn in code — sky and sun that
 * move from morning to evening, rolling hills, a stone pen and a gate, a shepherd, a flock of
 * sheep that walk with a bounce, and a bag of pebbles. No image files: every shape is drawn, so
 * any frame is exact, deterministic and free of licences.
 *
 * Story data (all times are spoken phrases):
 *   {kit: 'cartoon',
 *    evening: [scene, phrase],                                  // the sky turns to evening
 *    flock: {count, missing, out: {at, every}, home: {at, every}},
 *    eureka: {at, text?},                                       // bulb + chime + the shepherd's line
 *    spots: [{from, to, at: [x, y], r, zoom}],
 *    captions: [{at, until, text}],                             // big friendly words at the top
 *    camera: [{at, to: [x, y], zoom}]}                          // eased moves; the frame always stays covered
 */
import {ease} from '../whiteboard/board.mjs';
import {moodAt, idleAt} from '../../acting.mjs';

const clamp01 = n => Math.max(0, Math.min(1, n));
const lerp = (a, b, u) => a + (b - a) * u;
const mix = (a, b, u) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], u))).join(',')})`; };
const C = {
  skyDay: ['#9fd8ff', '#e6f6ff'], skyEve: ['#5a4b9e', '#ffb07a'], sunDay: '#ffd84d', sunEve: '#ff8a3d',
  hillFar: ['#a9df8c', '#8a7fb8'], hillMid: ['#7fcb62', '#6d6aa3'], ground: ['#63b64e', '#4e7f5a'], path: ['#ecd7a4', '#b89d8a'],
  stone: '#b9b1a6', stoneDark: '#8d857a', wood: '#a0683f', woodDark: '#7a4c2c',
  wool: '#ffffff', woolShade: '#e3e3ee', face: '#3a3846', skin: '#f3c39b', robe: '#4f86d9', robeDark: '#3b6cb8', beard: '#8a5a3a',
  sack: '#caa06a', sackDark: '#a57d4c', pebble: '#9ea5ad', pebbleLight: '#c9cfd5', ink: '#2e2c38', bulb: '#ffe45c',
};
const LAYOUT = {pen: [80, 600, 380, 800], gate: 440, shepherd: [590, 790], sack: [680, 780], homePile: [770, 800],
  penSpots: [[150, 700], [250, 740], [320, 680], [180, 770], [300, 770]], fieldSpots: [[930, 720], [1110, 760], [1270, 705], [1420, 745], [1030, 690]]};
const WALK = 2.4;

export function compileCartoon(spec, clock, motion = {cameraSpeed: 1}) {
  // Camera moves and spotlights take their seconds divided by the film's camera speed (a director's note).
  const speed = motion.cameraSpeed ?? 1, MOVE = 1.6 / speed, IN = .6 / speed, OUT = .7 / speed;
  const n = spec.flock.count, missing = spec.flock.missing ?? 0;
  const outAt = clock.at(spec.flock.out.at), homeAt = clock.at(spec.flock.home.at), every = spec.flock.out.every ?? 1.2, everyHome = spec.flock.home.every ?? every;
  const evening = spec.evening ? clock.at(spec.evening) : Infinity;
  const sheep = Array.from({length: n}, (_, i) => {
    const out = outAt + i * every, stays = i >= n - missing;
    return {i, pen: LAYOUT.penSpots[i % LAYOUT.penSpots.length], field: stays ? [1700, 700] : LAYOUT.fieldSpots[i % LAYOUT.fieldSpots.length],
      out, outGate: out + WALK * .38, home: stays ? Infinity : homeAt + i * everyHome, homeGate: stays ? Infinity : homeAt + i * everyHome + WALK * .62};
  });
  const eureka = spec.eureka ? {at: clock.at(spec.eureka.at), text: spec.eureka.text} : null;
  const captions = (spec.captions ?? []).map(c => ({text: c.text, at: clock.at(c.at), until: clock.at(c.until)}));
  const camera = [{t: -Infinity, to: [800, 450], zoom: 1}, ...(spec.camera ?? []).map(k => ({t: clock.at(k.at), to: k.to, zoom: k.zoom ?? 1}))];
  const spots = (spec.spots ?? []).map(s => ({at: clock.at(s.from), until: clock.at(s.to), cx: s.at[0], cy: s.at[1], r: s.r, zoom: s.zoom ?? 1.12}));
  const sounds = [
    ...sheep.flatMap(s => [{time: s.outGate + .45, type: 'tap'}, ...(Number.isFinite(s.homeGate) ? [{time: s.homeGate + .35, type: 'tap'}] : [])]),
    ...(Number.isFinite(evening) ? [{time: evening, type: 'slide'}] : []),
    ...(eureka ? [{time: eureka.at + .05, type: 'chime'}] : []),
    ...captions.map(c => ({time: c.at, type: 'settle'})),
  ];
  return {
    hang: 1, sounds,
    // The captions, for the reading-time check: whole once popped in (.35 s), leaving at until.
    texts: () => (spec.captions ?? []).map((c, i) => ({text: captions[i].text, from: captions[i].at + .35, to: captions[i].until, path: `captions[${i}]`})),
    spotAt: t => { let best = null; for (const f of spots) { const w = Math.min(ease((t - f.at) / IN), 1 - ease((t - f.until) / OUT)); if (w > 0 && (!best || w > best.w)) best = {...f, w}; } return best; },
    draw: (ctx, t, spot) => {
      // The camera: eased moves between keys; scaled about its point and clamped so the world always fills the frame.
      let cam = camera[0];
      for (const k of camera.slice(1)) { if (t < k.t) break; const u = ease(clamp01((t - k.t) / MOVE)); cam = {to: [lerp(cam.to[0], k.to[0], u), lerp(cam.to[1], k.to[1], u)], zoom: lerp(cam.zoom, k.zoom, u)}; }
      const z = cam.zoom, tx = Math.min(0, Math.max(1600 - 1600 * z, 800 - cam.to[0] * z)), ty = Math.min(0, Math.max(900 - 900 * z, 450 - cam.to[1] * z));
      ctx.save(); ctx.translate(tx, ty); ctx.scale(z, z);
      drawWorld(ctx, t, {sheep, evening, eureka, captions: [], spot});
      ctx.restore();
      drawCaptions(ctx, t, captions);
    },
  };
}

/** Where a sheep is at t, how fast it moves (for the walk), and which way it faces. */
function sheepAt(s, t) {
  const path = (from, to, u) => {
    const gate = [LAYOUT.gate, 735], k = .38;
    return u < k ? [lerp(from[0], gate[0], ease(u / k)), lerp(from[1], gate[1], ease(u / k))] : [lerp(gate[0], to[0], ease((u - k) / (1 - k))), lerp(gate[1], to[1], ease((u - k) / (1 - k)))];
  };
  if (t >= s.home) { const u = clamp01((t - s.home) / WALK); return {pos: pathBack(s, u), walking: u < 1, facing: -1}; }
  if (t >= s.out) { const u = clamp01((t - s.out) / WALK); return {pos: path(s.pen, s.field, u), walking: u < 1, facing: 1}; }
  return {pos: s.pen, walking: false, facing: 1};
}
function pathBack(s, u) {
  const gate = [LAYOUT.gate, 735], k = .62;
  return u < k ? [lerp(s.field[0], gate[0], ease(u / k)), lerp(s.field[1], gate[1], ease(u / k))] : [lerp(gate[0], s.pen[0], ease((u - k) / (1 - k))), lerp(gate[1], s.pen[1], ease((u - k) / (1 - k)))];
}

function drawWorld(ctx, t, {sheep, evening, eureka, captions, spot}) {
  const m = ease(clamp01((t - evening) / 1.6));
  // Sky, sun (sets as evening comes), a few stars at dusk.
  const sky = ctx.createLinearGradient(0, 0, 0, 620);
  sky.addColorStop(0, mix(C.skyDay[0], C.skyEve[0], m)); sky.addColorStop(1, mix(C.skyDay[1], C.skyEve[1], m));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 1600, 900);
  if (m > .3) { ctx.fillStyle = `rgba(255,255,240,${(m - .3) * .9})`; for (const [x, y, r] of [[160, 90, 2.5], [420, 60, 2], [700, 120, 2.2], [980, 70, 2], [1450, 110, 2.6], [1250, 50, 1.8]]) { ctx.beginPath(); ctx.arc(x, y, r + Math.sin(t * 3 + x) * .6, 0, 7); ctx.fill(); } }
  const sunY = lerp(170, 470, m), sunX = lerp(1240, 1330, m), glow = ctx.createRadialGradient(sunX, sunY, 20, sunX, sunY, 170);
  glow.addColorStop(0, `rgba(255,236,150,${.55 - .2 * m})`); glow.addColorStop(1, 'rgba(255,236,150,0)'); ctx.fillStyle = glow; ctx.fillRect(sunX - 170, sunY - 170, 340, 340);
  ctx.fillStyle = mix(C.sunDay, C.sunEve, m); ctx.beginPath(); ctx.arc(sunX, sunY, 62, 0, 7); ctx.fill();
  // Clouds drifting.
  ctx.fillStyle = `rgba(255,255,255,${.85 - .5 * m})`;
  for (const [cx, cy, s] of [[260, 150, 1], [760, 110, .8], [1500, 220, .9]]) { const x = ((cx + t * 8 * s) % 1800) - 100; for (const [dx, dy, r] of [[0, 0, 34], [36, -14, 40], [76, 0, 32], [36, 10, 30]]) { ctx.beginPath(); ctx.arc(x + dx * s, cy + dy * s, r * s, 0, 7); ctx.fill(); } }
  // Hills: far, mid, then the ground with a dirt path from the pen to the field.
  const hill = (base, amp, color, phase) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, 900); for (let x = 0; x <= 1600; x += 20) ctx.lineTo(x, base + Math.sin(x / 260 + phase) * amp + Math.sin(x / 90 + phase * 2) * amp * .15); ctx.lineTo(1600, 900); ctx.fill(); };
  hill(505, 38, mix(C.hillFar[0], C.hillFar[1], m), .4); hill(575, 30, mix(C.hillMid[0], C.hillMid[1], m), 2.1); hill(640, 14, mix(C.ground[0], C.ground[1], m), 4.2);
  ctx.fillStyle = mix(C.path[0], C.path[1], m); ctx.beginPath(); ctx.moveTo(380, 712); ctx.bezierCurveTo(700, 690, 1000, 770, 1600, 740); ctx.lineTo(1600, 790); ctx.bezierCurveTo(1000, 820, 700, 760, 380, 768); ctx.fill();
  ctx.fillStyle = `rgba(40,90,40,${.35 - .15 * m})`; for (let i = 0; i < 70; i++) { const x = (i * 97) % 1600, y = 680 + ((i * 53) % 210); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4, y - 12); ctx.lineTo(x + 8, y); ctx.fill(); }
  // The stone pen and its gate.
  const [px0, py0, px1, py1] = LAYOUT.pen;
  ctx.fillStyle = `rgba(0,0,0,.12)`; ctx.beginPath(); ctx.ellipse((px0 + px1) / 2, py1 + 6, (px1 - px0) / 2 + 20, 14, 0, 0, 7); ctx.fill();
  for (let x = px0; x < px1; x += 38) stone(ctx, x, py0 + 40, 36, 26, m);
  for (let y = py0 + 60; y < py1; y += 30) stone(ctx, px0, y, 30, 26, m);
  for (let x = px0; x < px1 - 40; x += 38) stone(ctx, x, py1 - 10, 36, 26, m);
  const g = LAYOUT.gate;
  ctx.fillStyle = C.woodDark; ctx.fillRect(g - 34, 640, 14, 120); ctx.fillRect(g + 20, 640, 14, 120);
  ctx.fillStyle = C.wood; for (const y of [660, 700, 740]) ctx.fillRect(g + 34, y, 70, 11); ctx.save(); ctx.translate(g + 34, 650); ctx.rotate(-.9); ctx.fillStyle = C.wood; ctx.fillRect(0, 0, 90, 10); ctx.restore();
  // The bag, with its pebbles showing at the mouth; the pile of pebbles that came out.
  const inBag = sheep.filter(s => t >= s.outGate + .45).length - sheep.filter(s => t >= s.homeGate + .35).length;
  drawSack(ctx, t, LAYOUT.sack, inBag, m);
  const outOfBag = sheep.filter(s => t >= s.homeGate + .35).length;
  for (let i = 0; i < outOfBag; i++) pebble(ctx, LAYOUT.homePile[0] + i * 30, LAYOUT.homePile[1] - (i % 2) * 6, 1);
  // Pebbles in flight: into the bag as a sheep goes out, out of the bag as one comes home.
  for (const s of sheep) {
    const d = t - s.outGate; if (d >= 0 && d < .45) { const u = d / .45, [hx, hy] = [LAYOUT.shepherd[0] + 40, 660], [bx, by] = [LAYOUT.sack[0], LAYOUT.sack[1] - 64]; pebble(ctx, lerp(hx, bx, u), lerp(hy, by, u) - Math.sin(u * Math.PI) * 60, 1 + (u > .85 ? (1 - u) * 1.6 : 0)); }
    const e = t - s.homeGate; if (e >= 0 && e < .35) { const u = e / .35, [bx, by] = [LAYOUT.sack[0], LAYOUT.sack[1] - 64], [px, py] = [LAYOUT.homePile[0] + (sheep.filter(x => x.homeGate < s.homeGate).length) * 30, LAYOUT.homePile[1]]; pebble(ctx, lerp(bx, px, u), lerp(by, py, u) - Math.sin(u * Math.PI) * 70, 1); }
  }
  // The shepherd, dropping a pebble each time a sheep passes the gate.
  const dropping = sheep.some(s => t >= s.outGate - .15 && t < s.outGate + .35) || sheep.some(s => t >= s.homeGate - .15 && t < s.homeGate + .3);
  drawShepherd(ctx, t, LAYOUT.shepherd, {dropping, eureka, m});
  // The flock, back to front.
  const drawn = sheep.map(s => ({s, ...sheepAt(s, t)})).filter(x => x.pos[0] < 1680).sort((a, b) => a.pos[1] - b.pos[1]);
  for (const x of drawn) drawSheep(ctx, t + x.s.i * .7, x.pos, {walking: x.walking, facing: x.facing, m, seed: x.s.i + 2});
  // The eureka: a bulb over the shepherd and his line.
  if (eureka && t >= eureka.at) {
    const u = clamp01((t - eureka.at) / .45), s = u < 1 ? 1 + .3 * Math.sin(u * Math.PI) : 1, [x, y] = [LAYOUT.shepherd[0], LAYOUT.shepherd[1] - 300];
    const halo = ctx.createRadialGradient(x, y, 10, x, y, 110); halo.addColorStop(0, 'rgba(255,230,90,.75)'); halo.addColorStop(1, 'rgba(255,230,90,0)'); ctx.fillStyle = halo; ctx.fillRect(x - 110, y - 110, 220, 220);
    ctx.save(); ctx.translate(x, y); ctx.scale(s * u, s * u);
    ctx.fillStyle = C.bulb; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill(); ctx.fillStyle = '#c9ccd2'; ctx.fillRect(-13, 26, 26, 18);
    ctx.strokeStyle = '#e8a33a'; ctx.lineWidth = 5; ctx.lineCap = 'round'; for (let k = 0; k < 7; k++) { const a = -Math.PI + k * Math.PI / 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 42, Math.sin(a) * 42); ctx.lineTo(Math.cos(a) * 58, Math.sin(a) * 58); ctx.stroke(); }
    ctx.restore();
    if (eureka.text) speech(ctx, [x + 250, y + 10], [x + 40, y + 120], eureka.text, clamp01((t - eureka.at - .4) / .5));
  }
  if (spot) { const gr = ctx.createRadialGradient(spot.cx, spot.cy, spot.r * .85, spot.cx, spot.cy, spot.r * 2); gr.addColorStop(0, 'rgba(20,20,40,0)'); gr.addColorStop(1, `rgba(20,20,40,${.4 * spot.w})`); ctx.fillStyle = gr; ctx.fillRect(0, 0, 1600, 900); }
}

/** Captions: big friendly words at the top of the screen (not moved by the camera). */
function drawCaptions(ctx, t, captions) {
  for (const c of captions) {
    const a = Math.min(clamp01((t - c.at) / .35), 1 - clamp01((t - c.until) / .35)); if (a <= 0) continue;
    const pop = 1 + .15 * (1 - ease(clamp01((t - c.at) / .35)));
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(800, 120); ctx.scale(pop, pop);
    ctx.font = '700 64px Caveat'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineJoin = 'round'; ctx.strokeText(c.text, 0, 0);
    ctx.fillStyle = C.ink; ctx.fillText(c.text, 0, 0); ctx.restore();
  }
}

function stone(ctx, x, y, w, h, m) {
  ctx.fillStyle = mix(C.stone, '#8e8aa5', m * .6); ctx.beginPath(); ctx.roundRect(x, y, w - 3, h - 3, 9); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.roundRect(x, y + h * .55, w - 3, h * .45 - 3, [0, 0, 9, 9]); ctx.fill();
}
function pebble(ctx, x, y, squash = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1 / Math.sqrt(squash), squash > 1 ? 1 / squash : 1);
  ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(2, 10, 14, 4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = C.pebble; ctx.beginPath(); ctx.ellipse(0, 0, 14, 11, 0, 0, 7); ctx.fill();
  ctx.fillStyle = C.pebbleLight; ctx.beginPath(); ctx.ellipse(-4, -4, 5, 3, -.4, 0, 7); ctx.fill(); ctx.restore();
}
function drawSack(ctx, t, [x, y], count, m) {
  ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(x, y + 4, 60, 12, 0, 0, 7); ctx.fill();
  const bulge = Math.min(count, 5) * 3;
  ctx.fillStyle = mix(C.sack, '#9b7c6c', m * .5); ctx.beginPath(); ctx.moveTo(x - 38, y - 70); ctx.bezierCurveTo(x - 62 - bulge, y - 40, x - 60 - bulge, y, x - 30, y); ctx.lineTo(x + 30, y); ctx.bezierCurveTo(x + 60 + bulge, y, x + 62 + bulge, y - 40, x + 38, y - 70); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.sackDark; ctx.fillRect(x - 40, y - 76, 80, 12);
  for (let i = 0; i < Math.min(count, 5); i++) pebble(ctx, x - 26 + i * 13, y - 82 - (i % 2) * 5, 1);
}
/** Eyes that blink and squint: a line when nearly shut, else an ellipse `shut` flattens. */
function eye(ctx, x, y, r, shut) {
  if (shut > .8) { ctx.fillRect(x - r - .5, y - 1, 2 * r + 1, 2.5); return; }
  ctx.beginPath(); ctx.ellipse(x, y, r, r * (1 - shut), 0, 0, 7); ctx.fill();
}
function drawShepherd(ctx, t, [x, y], {dropping, eureka, m}) {
  // His eureka is acted (acting.mjs): the eyes squint just before it, the face swaps under the squint, the head
  // jumps up and settles. Between changes he breathes and blinks on his own uneven rhythm.
  const act = moodAt(eureka ? (eureka.at > 0 ? [{at: 0, mood: 'calm'}, {at: eureka.at, mood: 'surprised'}] : [{at: 0, mood: 'surprised'}]) : [{at: 0, mood: 'calm'}], t), idle = idleAt(t, {seed: 1});
  const surprised = act.mood === 'surprised', shut = Math.max(idle.blink, act.anticipation), take = act.take;
  const bob = Math.sin(t * 2) * 2;
  ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(x, y + 4, 60, 12, 0, 0, 7); ctx.fill();
  // Staff.
  ctx.strokeStyle = C.woodDark; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 58, y); ctx.lineTo(x - 58, y - 250); ctx.arc(x - 38, y - 250, 20, Math.PI, 0); ctx.stroke();
  // Robe and belt.
  ctx.fillStyle = mix(C.robe, '#4a5b9a', m * .5); ctx.beginPath(); ctx.moveTo(x - 34, y - 150 + bob - 8 * take); ctx.lineTo(x + 34, y - 150 + bob - 8 * take); ctx.lineTo(x + 52, y); ctx.lineTo(x - 52, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.robeDark; ctx.fillRect(x - 42, y - 86 + bob, 84, 12);
  // Arms: one on the staff; the other drops a pebble (raised while dropping).
  ctx.strokeStyle = mix(C.robe, '#4a5b9a', m * .5); ctx.lineWidth = 16;
  ctx.beginPath(); ctx.moveTo(x - 26, y - 135 + bob); ctx.lineTo(x - 52, y - 110); ctx.stroke();
  const lift = dropping ? -40 : 0; ctx.beginPath(); ctx.moveTo(x + 26, y - 135 + bob); ctx.lineTo(x + 52, y - 110 + lift * .6); ctx.stroke();
  ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(x - 55, y - 108, 9, 0, 7); ctx.arc(x + 55, y - 108 + lift * .6, 9, 0, 7); ctx.fill();
  // Head: face, beard, eyes (blink and squint; wide when surprised), a hood. The take lifts it.
  const hy = y - 185 + bob - 16 * take;
  ctx.fillStyle = C.robeDark; ctx.beginPath(); ctx.arc(x, hy - 4, 44, Math.PI, 0); ctx.fill();
  ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(x, hy, 34, 0, 7); ctx.fill();
  ctx.fillStyle = C.beard; ctx.beginPath(); ctx.arc(x, hy + 12, 30, .1, Math.PI - .1); ctx.fill();
  ctx.fillStyle = C.ink;
  for (const dx of [-12, 12]) eye(ctx, x + dx, hy - 5, surprised ? lerp(4.5, 6, act.u) : 4.5, shut);
  ctx.strokeStyle = '#6b3f26'; ctx.lineWidth = 3; ctx.beginPath(); if (surprised) ctx.ellipse(x, hy + 14, 7, 9 * (1 + .3 * Math.max(0, take)), 0, 0, 7); else ctx.arc(x, hy + 8, 9, .3, Math.PI - .3); ctx.stroke();
}
function drawSheep(ctx, t, [x, y], {walking, facing, m, seed}) {
  // Each sheep blinks on its own uneven rhythm (acting.mjs · idleAt): a flock never blinks in step.
  const phase = t * 11, bob = walking ? Math.abs(Math.sin(phase)) * 5 : Math.sin(t * 1.8) * 1.2, blink = idleAt(t, {seed}).blink;
  ctx.save(); ctx.translate(x, y); ctx.scale(facing, 1);
  ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.beginPath(); ctx.ellipse(0, 38, 48, 9, 0, 0, 7); ctx.fill();
  ctx.fillStyle = C.face;
  [-24, -8, 10, 26].forEach((lx, k) => { const swing = walking ? Math.sin(phase + k * Math.PI / 2) * 7 : 0; ctx.beginPath(); ctx.roundRect(lx - 4 + swing * .3, 14, 8, 26 - Math.abs(swing) * .3, 4); ctx.fill(); });
  ctx.translate(0, -bob);
  const wool = mix(C.wool, '#d9d5ee', m * .5), shade = mix(C.woolShade, '#b8b3d6', m * .5);
  for (const [dx, dy, r] of [[-26, 6, 26], [0, -8, 30], [26, 4, 26], [-10, 14, 24], [14, 14, 24]]) { ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(dx, dy + 3, r, 0, 7); ctx.fill(); }
  for (const [dx, dy, r] of [[-26, 2, 25], [0, -12, 29], [26, 0, 25], [-10, 10, 23], [14, 10, 23], [0, 0, 26]]) { ctx.fillStyle = wool; ctx.beginPath(); ctx.arc(dx, dy, r, 0, 7); ctx.fill(); }
  // Head, ears, eyes.
  ctx.fillStyle = C.face; ctx.beginPath(); ctx.ellipse(46, -8, 16, 20, .2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(36, -22, 9, 5, -.6, 0, 7); ctx.fill();
  ctx.fillStyle = wool; ctx.beginPath(); ctx.arc(40, -26, 10, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; eye(ctx, 50, -11, 4.5, blink);
  if (blink <= .8) { ctx.fillStyle = C.ink; ctx.beginPath(); ctx.ellipse(51.5, -11, 2.2, 2.2 * (1 - blink), 0, 0, 7); ctx.fill(); }
  ctx.restore();
}
function speech(ctx, [cx, cy], [tx, ty], text, a) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.font = '700 44px Caveat'; const w = ctx.measureText(text).width / 2 + 40, h = 48;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = C.ink; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(cx, cy, w, h, 0, 0, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - w * .5, cy + h * .6); ctx.lineTo(tx, ty); ctx.lineTo(cx - w * .2, cy + h * .85); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(cx, cy, w - 3, h - 3, 0, 0, 7); ctx.fill();
  ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, cy + 2); ctx.restore();
}

export const cartoonKit = {name: 'cartoon', story: {compile: compileCartoon, motion: ['cameraSpeed']}};
