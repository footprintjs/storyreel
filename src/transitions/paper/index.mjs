/**
 * The paper transitions: eight changes of picture drawn as things done to paper and ink — torn, eraser, inkBleed,
 * ringIris, glassSheet, curl, fold, morph — one module each beside this one. They are built-in entries of the one
 * collection (transitions.mjs · TRANSITIONS, which places each in its family) and draw through its one contract,
 * draw(ctx, {e, from, to, p, ghost, theme, boxes}). Each module exports its catalog entry only: its raw draw is wrapped
 * here, by landed, which restores the canvas. What each one means, and when to use it, is the README's table
 * (README · Transitions), held to the catalog by test/paper-transitions.test.mjs.
 *
 * Three laws every one keeps (pinned by test/paper-transitions.test.mjs):
 *   - e = 0 is the leaving picture and e = 1 the arriving one, exactly (landed): the shapes start and end off the
 *     frame, and the two ends are drawn as the pictures themselves, so nothing jumps when the shot takes over;
 *   - a frame is a pure function of e and the settings: a torn edge or an ink blot is a seeded shape (seeded.mjs ·
 *     seeded, the `seed` setting), never Math.random, so the same frame index gives the same pixels;
 *   - paper and ink are the film's theme's (tokens.mjs · paperTokens). A colour a transition adds to the picture (the
 *     ring, the morph's outline, the ink) is a setting whose default, null, is the theme's own.
 */
import {W, H} from '../../frame.mjs';
import {TORN} from './torn.mjs';
import {ERASER} from './eraser.mjs';
import {INK_BLEED} from './ink.mjs';
import {RING_IRIS} from './ring.mjs';
import {GLASS_SHEET} from './glass.mjs';
import {CURL, FOLD} from './page.mjs';
import {MORPH} from './morph.mjs';

/** The two ends exactly, and between them the transition's own draw, clipped to the frame, the canvas left as it was found. */
const landed = draw => function drawLanded(ctx, args) {
  if (!(args.e > 0)) { args.from(ctx); return; }
  if (!(args.e < 1)) { args.to(ctx); return; }
  ctx.save();
  try { ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); draw(ctx, args); } finally { ctx.restore(); }
};
const entry = def => ({...def, draw: landed(def.draw)});

/** The eight, by family; TRANSITIONS freezes them with the rest. */
export const PAPER_TRANSITIONS = Object.freeze({
  torn: entry(TORN), eraser: entry(ERASER), inkBleed: entry(INK_BLEED), ringIris: entry(RING_IRIS),
  glassSheet: entry(GLASS_SHEET), curl: entry(CURL), fold: entry(FOLD), morph: entry(MORPH),
});
export {paperTokens} from './tokens.mjs';
export {seeded} from './seeded.mjs';
