/**
 * Sheets: many pictures on one image. A contact sheet: stills of a film on one image, so a whole film can be checked at a glance —
 * each picture once it has settled, AND each change of picture half way through, where a muddy
 * double exposure, a collision or text mid-flight shows up. Every still is labelled with its time.
 */
import {createCanvas} from '@napi-rs/canvas';
import {TRANSITIONS, readEntrance, ghostPainter} from './transitions.mjs';
import {loadTheme} from './theme.mjs';

const clockText = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/**
 * @param film     from compileFilm
 * @param moments  [{t, label}] (default: film.moments() — settled pictures and mid-changes)
 * @param columns  stills per row (default 4) · width: the sheet's width in pixels (default 1600)
 * @returns a PNG Buffer
 */
export async function contactSheet(film, {moments = film.moments(), columns = 4, width = 1600} = {}) {
  const pad = 12, label = 26, w = Math.floor((width - pad * (columns + 1)) / columns), h = Math.round(w * 9 / 16);
  const rows = Math.max(1, Math.ceil(moments.length / columns)), sheet = createCanvas(width, pad + rows * (h + label + pad)), c = sheet.getContext('2d');
  c.fillStyle = '#20232a'; c.fillRect(0, 0, sheet.width, sheet.height);
  moments.forEach((m, i) => {
    const x = pad + (i % columns) * (w + pad), y = pad + Math.floor(i / columns) * (h + label + pad);
    c.save(); c.translate(x, y); c.beginPath(); c.rect(0, 0, w, h); c.clip(); c.scale(w / 1600, w / 1600); film.frame(c, m.t); c.restore();
    c.fillStyle = m.kind === 'moving' ? '#f5b400' : '#c9cdd4'; c.font = '600 13px Menlo'; c.textBaseline = 'middle';
    c.fillText(`${clockText(m.t)}  ${m.label}`.slice(0, Math.floor(w / 8)), x, y + h + label / 2);
  });
  return sheet.encode('png');
}

/**
 * The transitions on one image, as a video editor's browser shows them: a row per transition, each a few
 * moments of picture A becoming picture B (with the default settings, eased as the transition eases).
 * @param catalog  the transitions (default: the built-in collection; transitions.mjs · transitionCatalog adds a kit's)
 * @param moments  how far through each change to show (default .2 .4 .6 .8 of its seconds)
 * @param width    the sheet's width in pixels (default 1200)
 * @returns a PNG Buffer
 */
export async function transitionSheet({catalog = TRANSITIONS, moments = [.2, .4, .6, .8], width = 1200} = {}) {
  const names = Object.keys(catalog).filter(n => n !== 'cut'), theme = loadTheme('paper'), ghost = ghostPainter();
  const pad = 10, label = 170, cols = moments.length, w = Math.floor((width - label - pad * (cols + 1)) / cols), h = Math.round(w * 9 / 16);
  const sheet = createCanvas(width, pad + names.length * (h + pad)), c = sheet.getContext('2d');
  c.fillStyle = '#20232a'; c.fillRect(0, 0, sheet.width, sheet.height);
  names.forEach((name, row) => {
    const en = readEntrance(sampleEntrance(catalog[name], name), `transitionSheet ${name}`, catalog), y = pad + row * (h + pad), boxes = sampleBoxes(en);
    moments.forEach((u, col) => {
      const x = label + pad + col * (w + pad);
      c.save(); c.translate(x, y); c.beginPath(); c.rect(0, 0, w, h); c.clip(); c.scale(w / 1600, w / 1600);
      en.draw(c, {e: en.ease(u), from: pictureA, to: pictureB, p: en.p, ghost: (alpha, paint) => ghost(c, alpha, paint), theme, boxes});
      c.restore();
    });
    c.fillStyle = '#f2f3f5'; c.font = '700 20px Menlo'; c.textBaseline = 'middle'; c.fillText(name, pad, y + h / 2 - 12);
    c.fillStyle = '#9aa1ab'; c.font = '500 13px Menlo'; c.fillText(`${catalog[name].family} · ${en.seconds} s`, pad, y + h / 2 + 14);
  });
  return sheet.encode('png');
}

/** A transition with its default settings; a setting that names a thing in the picture (it has no default) names the sample's. */
function sampleEntrance(tr, type) {
  const needs = Object.entries(tr.params ?? {}).filter(([, spec]) => spec.name && spec.default === undefined).map(([k]) => [k, 'thing']);
  return needs.length ? {type, ...Object.fromEntries(needs)} : type;
}
/** Every thing a transition looks for (transitions.mjs · regions) is the sample's: A's red circle as it leaves, B's yellow square as it arrives. */
const CIRCLE = Object.freeze([970, 240, 1390, 660]), SQUARE = Object.freeze([270, 250, 670, 650]);
function sampleBoxes(en) {
  const want = en.regions?.(en.p) ?? {}, all = (names, box) => Object.fromEntries((names ?? []).map(n => [n, box]));
  return {from: all(want.from, CIRCLE), to: all(want.to, SQUARE)};
}

/** Two pictures that differ everywhere, so every transition's shape shows: warm paper with an A, deep blue with a B. */
function pictureA(c) {
  c.fillStyle = '#f3eee3'; c.fillRect(0, 0, 1600, 900);
  c.fillStyle = '#b33f36'; c.beginPath(); c.arc(1180, 450, 210, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#23211c'; c.font = '800 460px Helvetica'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('A', 480, 470);
}
function pictureB(c) {
  c.fillStyle = '#2d5c9a'; c.fillRect(0, 0, 1600, 900);
  c.fillStyle = '#f5b400'; c.fillRect(270, 250, 400, 400);
  c.fillStyle = '#ffffff'; c.font = '800 460px Helvetica'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('B', 1130, 470);
}
