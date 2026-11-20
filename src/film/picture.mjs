/**
 * Stage 16 of the compile: the whole picture at t — a pushIn film's one page, or a row of shots each arriving through
 * its entrance; the held layers over it; then, outermost, the director's push, the focus and the camera's moves, the
 * guess cards, the steps track, the emphasis and the labels. `frame(ctx, t)` is the film. Its own stage because this
 * is the one place a frame is composed, and a frame stays a pure function of time: everything it reads was decided
 * by the stages before it, or (camerawork, pushes, attention, labels) by the stages after it, read when it draws.
 *
 * Reads: paper, blank, push, geo, card, storyWorld, boardEnd, TURN, MOVE0, MOVE1, namedAt, moveTo, centrePlace, shots,
 * entranceBoxes, NO_BOXES, shotAt, guesses, stepsTrack, rewinding, rewindNest, teaser, drawTeaser, drawWorld, spotOf,
 * pushInCamera, stateAt, stageSpec; at draw time camerawork, pushes, attention, exampleLabel, differsLabel.
 * Writes: pictureClock(t), frame(ctx, t, {window}).
 */
import {inOut as ease} from '../ease.mjs';
import {makePen} from '../pen.mjs';
import {ramp} from '../clock.mjs';
import {drawCard, drawStage, drawGuess, drawRewind, rewindAt} from '../kits/paper/paper.mjs';
import {drawStepsTrack} from '../kits/paper/steps-track.mjs';
import {pushAt} from '../notes.mjs';
import {ghostPainter, layerCrossfader} from '../transitions.mjs';
import {into, aim} from './util.mjs';

export function pictureStage(state) {
  const {paper, blank, push, geo, card, storyWorld, boardEnd, TURN, MOVE0, MOVE1, namedAt, moveTo, centrePlace, shots, entranceBoxes, NO_BOXES, shotAt,
    guesses, stepsTrack, rewinding, rewindNest, teaser, drawTeaser, drawWorld, spotOf, pushInCamera, stateAt, stageSpec} = state;
  /** A pushIn film at t: the story, the push into the prop, the card and the stages on one page. */
  function drawPushed(ctx, t) {
    drawWorld(ctx, storyWorld, t, t < boardEnd ? spotOf(storyWorld, t) : null, boardEnd, t >= boardEnd ? pushInCamera(t) : null);
    if (t >= boardEnd) {
      const typed = ease((t - boardEnd - TURN * .45) / (TURN * .45)), now = stateAt(t), P = makePen(ctx, paper, {baseScale: 1});
      ctx.save(); ctx.globalAlpha = typed; ctx.drawImage(blank, 0, 0);
      const move = Math.max(0, Math.min(1, (t - MOVE0) / (MOVE1 - MOVE0)));
      P.alpha(1 - move, () => P.text(push.caption, 800, Math.min(860, geo.pushed(0, card.prop[3])[1] + 60), 30, P.C.ink, {display: true, weight: 600}));
      drawCard(ctx, P, geo, card, {rows: now.rows, glow: now.glow, pop: now.pop, named: ramp(t, namedAt, .6), alpha: now.fade,
        place: {move, center: now.centre, aside: moveTo, loop: centrePlace}, columns: now.columns});
      const intro = ease((t - MOVE0 - .3) / .7);
      for (const [st, w] of now.shown) drawStage(ctx, P, paper, intro * w, stageSpec(st, t));
      ctx.restore();
    }
  }

  /** One shot at t, opaque: a world, or paper with its stages handing over on the page. */
  function drawShot(ctx, shot, t) {
    if (shot.world) { drawWorld(ctx, shot.world, t, spotOf(shot.world, t)); return; }
    ctx.drawImage(blank, 0, 0);
    const P = makePen(ctx, paper, {baseScale: 1});
    shot.stages.forEach((st, k) => {
      const next = shot.stages[k + 1], enter = k === 0 ? 1 : into(st, t, .2, .45), leave = next ? 1 - into(next, t, .65, .45) : 1;
      const w = Math.min(enter, leave); if (w > 0) drawStage(ctx, P, paper, w, stageSpec(st, t));
    });
  }
  const ghost = ghostPainter();
  /** The shot that is arriving over the one leaving, through its transition (transitions.mjs). */
  function drawTransition(ctx, j, t, e) {
    const shot = shots[j], prev = shots[j - 1], en = shot.enter;
    en.draw(ctx, {e, from: c => drawShot(c, prev, t), to: c => drawShot(c, shot, t), p: en.p, ghost: (alpha, paint) => ghost(ctx, alpha, paint), theme: paper, boxes: entranceBoxes.get(shot) ?? NO_BOXES});
  }
  /** A film without a pushIn at t: the current shot, or the next one arriving over it. */
  function drawShots(ctx, t) {
    const j = shotAt(t), shot = shots[j], u = j === 0 || shot.enter.type === 'cut' ? 1 : ramp(t, shot.start - shot.enter.lead, shot.enter.seconds);
    if (u >= 1) { drawShot(ctx, shot, t); return; }
    drawTransition(ctx, j, t, shot.enter.ease(u));
  }
  /**
   * The held layers (a world's `overlay(ctx, t)`, on the frame): drawn over the picture and outside its camera,
   * so a transition or a director's push never moves them — a presenter in the corner, a title band. Through a
   * change of picture the leaving shot's layer crosses into the arriving one's (layerCrossfader): the same layer
   * in both stays exactly itself.
   */
  const crossfade = layerCrossfader();
  const overlayOf = (shot, t) => (shot.world?.instance.overlay ? c => shot.world.instance.overlay(c, t) : null);
  function drawOverlays(ctx, t) {
    const j = shotAt(t), shot = shots[j], u = j === 0 || shot.enter.type === 'cut' ? 1 : ramp(t, shot.start - shot.enter.lead, shot.enter.seconds);
    const now = overlayOf(shot, t);
    if (u >= 1) { if (now) { ctx.save(); now(ctx); ctx.restore(); } return; }
    crossfade(ctx, Math.max(0, Math.min(1, shot.enter.ease(u))), overlayOf(shots[j - 1], t), now);
  }

  /** The picture's clock at t: the voice's, but in a camera's freeze or speed ramp (camerawork.mjs · clockAt). */
  const pictureClock = t => (state.camerawork ? state.camerawork.clockAt(t) : t);
  /**
   * The whole film at t, drawn into ctx whose transform maps 1600×900 onto the frame. `window` ({x0, y0, w, h} on the
   * frame), when a layout shows only part of it (a crop: layout.mjs · cropWindow), is what is shown: a label the viewer
   * must see (an example scene's) sits in its corner.
   */
  function frame(ctx, t, {window = null} = {}) { drawFrame(ctx, t, window, true); }
  /**
   * The frame at t. In a steps track's rewind cue (`rewinds`) the picture of an earlier moment plays back under the
   * rewind look (paper.mjs · drawRewind, the teaser's) and the track enters over it; the replay itself draws no rewind.
   */
  function drawFrame(ctx, t, window, rewinds) {
    if (teaser && t >= teaser.at) { drawTeaser(ctx, t, window); return; }
    if (rewinds && rewinding(t)) {
      const {from, to, seconds} = stepsTrack.rewind, u = t - from, n = rewindNest.getContext('2d');
      n.resetTransform(); n.clearRect(0, 0, 1600, 900); drawFrame(n, rewindAt(u / seconds, from, to), window, false);
      ctx.drawImage(rewindNest, 0, 0);
      const P = makePen(ctx, paper, {baseScale: 1});
      drawRewind(ctx, P, u); drawStepsTrack(ctx, P, stepsTrack, t);
      return;
    }
    // A director's push moves the camera over the picture; the guess cards stay where they are. The picture is
    // drawn on its own clock (a freeze holds it); the push, the focus and the camera keep the voice's.
    const tp = pictureClock(t);
    const picture = c => {
      const cam = pushAt(state.pushes, t);
      if (cam) { c.save(); aim(c, cam); }
      if (push) drawPushed(c, tp); else drawShots(c, tp);
      if (cam) c.restore();
    };
    // The focus strategy shows the picture (a camera frames the named thing, a spotlight darkens the rest…).
    const focused = c => { if (state.attention?.focus) state.attention.focus.show(c, t, picture); else picture(c); };
    // The camera's moves are the outermost lens: they frame whatever the push and the focus have framed.
    if (state.camerawork) state.camerawork.show(ctx, t, focused); else focused(ctx);
    if (!push) drawOverlays(ctx, t);
    for (const g of guesses) if (t >= g.start && t <= g.until + .5) drawGuess(ctx, makePen(ctx, paper, {baseScale: 1}), paper, g, t);
    if (stepsTrack) drawStepsTrack(ctx, makePen(ctx, paper, {baseScale: 1}), stepsTrack, t);
    state.attention?.emphasis?.draw(ctx, t);
    state.exampleLabel(ctx, t, window);
    state.differsLabel(ctx, t, window);
  }
  Object.assign(state, {pictureClock, frame});
}
