/** The left shot: a sun that rises over the voice, and dots that arrive on its phrases. */
import {PAPER, INK, dots} from './ink.mjs';

export function compileLeft(spec, clock) {
  const start = clock.start(spec.scene), beats = spec.beats.map(b => clock.at(b) - start);
  return {hang: 1, draw(c, t) {
    const u = t - start;
    c.fillStyle = PAPER; c.fillRect(0, 0, 1600, 900);
    c.fillStyle = '#f5b041'; c.beginPath(); c.arc(1300, 620 - Math.min(400, u * 14), 90, 0, Math.PI * 2); c.fill();
    c.strokeStyle = INK; c.lineWidth = 6; c.beginPath(); c.moveTo(100, 760); c.lineTo(1500, 760); c.stroke();
    beats.forEach((at, j) => dots(c, {n: 6, at, every: .35, y: 300 + j * 140, color: '#2e86c1'}, u));
  }};
}
