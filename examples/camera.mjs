#!/usr/bin/env node
/**
 * Camera moves by name: a dolly in on the shepherd, an orbit that slides the world's layers by their depth, a rack
 * focus from him to the hills — then the same film for a viewer who asks for reduced motion (each move a cut).
 *   node examples/camera.mjs [out.png]          → camera.png: stills of both, and what each move did
 */
import {writeFileSync} from 'node:fs';
import {compileFilm, evenTimings, contactSheet} from 'footprint-storyreel';

const storyboard = {title: 'At the gate', scenes: [{id: 'farm', narration: 'The shepherd counts his sheep at the gate, and the hills go quiet behind him.'}]};
// A world in three layers, back to front, each at its depth: 1 is the subject's plane, 6 far off, 0.6 nearer the camera.
const paint = {
  hills: c => { c.fillStyle = '#9cc29a'; c.fillRect(0, 0, 1600, 900); c.fillStyle = '#7fae7c'; c.beginPath(); c.ellipse(500, 900, 700, 380, 0, 0, Math.PI * 2); c.fill(); },
  shepherd: c => { c.fillStyle = '#8a5a2b'; c.fillRect(700, 380, 200, 420); c.beginPath(); c.arc(800, 330, 70, 0, Math.PI * 2); c.fill(); },
  gate: c => { c.fillStyle = '#5b4636'; for (let x = 1100; x < 1560; x += 70) c.fillRect(x, 560, 26, 340); c.fillRect(1100, 620, 460, 22); },
};
const farm = {name: 'farm', story: {compile: () => ({hang: 1,
  draw: c => Object.values(paint).forEach(layer => layer(c)),
  layers: [{name: 'hills', depth: 6}, {name: 'shepherd', depth: 1}, {name: 'gate', depth: .6}],
  drawLayer: (c, t, name) => paint[name](c),
  regionsAt: () => [{box: [700, 260, 900, 800], path: 'shepherd', label: 'the shepherd', name: 'shepherd'}],
})}};
const recipe = {story: {kit: 'farm'}, camera: [
  {move: 'dolly-in', at: ['farm', 'shepherd'], until: ['farm', 'his sheep'], on: 'shepherd', amount: 1.4},
  {move: 'orbit', at: ['farm', 'at the gate'], seconds: 2, amount: 140},
  {move: 'rack-focus', at: ['farm', 'the hills'], from: 'shepherd', on: 'hills'},
]};
const timings = evenTimings(storyboard);
const film = await compileFilm({storyboard, timings, recipe, kits: [farm]});
const calm = await compileFilm({storyboard, timings, recipe, kits: [farm], reducedMotion: true});
for (const f of [film, calm]) console.log(`${f.camera.motion}: ${f.camera.moves.map(m => `${m.move} at ${m.at} s (${m.played})`).join(', ')}`);
const stills = f => [1, 2.5, 4.5, 6.5].map(t => ({t, label: `${f.camera.motion} ${t} s`}));
const out = process.argv[2] ?? 'camera.png';
writeFileSync(out, await contactSheet(film, {moments: [...stills(film)], columns: 4, width: 1200}));
writeFileSync(out.replace(/\.png$/, '-reduced.png'), await contactSheet(calm, {moments: stills(calm), columns: 4, width: 1200}));
console.log(`wrote ${out} and ${out.replace(/\.png$/, '-reduced.png')}`);
