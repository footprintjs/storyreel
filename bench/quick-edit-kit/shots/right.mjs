/** The right shot: a bar that fills over the voice, and dots that arrive on its phrases. */
import {PAPER, INK, dots} from './ink.mjs';

export function compileRight(spec, clock) {
  const start = clock.start(spec.scene), beats = spec.beats.map(b => clock.at(b) - start);
  return {hang: 1, draw(c, t) {
    const u = t - start;
    c.fillStyle = PAPER; c.fillRect(0, 0, 1600, 900);
    c.fillStyle = '#c0392b'; c.fillRect(160, 700, Math.min(1280, u * 40), 60);
    c.strokeStyle = INK; c.lineWidth = 5; c.strokeRect(160, 700, 1280, 60);
    beats.forEach((at, j) => dots(c, {n: 5, at, every: .3, y: 260 + j * 150, color: '#27ae60'}, u));
  }};
}
