/**
 * motion-hang — where a hang's rope is tied when its pin is a block (`"from": "shelf"`), in tiles.
 *
 *   hangPin(block, at, piece, foot) → {pin, arm, rule}
 *
 * WHY not the middle of the block's top (as `to` takes a block's name: a throw lands there): a hang rests straight
 * below its pin, and below the middle of a block's top is the block itself, so a piece hung there always swung into it
 * (`reel:contact`, every time) and a block was no use as a pin. A piece hangs from a block the way it would from a real
 * one, by one of two rules, chosen by where the block is:
 *
 *   under   a block in the air above the piece (its underside higher than the piece's top: a shelf on nothing, a beam):
 *           the rope is tied to the middle of its underside, and the piece hangs beneath it.
 *   beside  any other block (one standing on the floor beside the piece): the rope is tied at the block's top, at the
 *           middle of the edge that faces the piece, on an arm held out from that edge by half the piece's own depth
 *           across it — so at rest the piece hangs flush against that side, touching it and not inside it. The arm is
 *           drawn, from the edge to the pin, in the rope's ink: the piece reads as hung from that block.
 *
 * The rope's length is where the piece starts: it swings from there to rest below the pin. A piece that starts off to
 * one side swings past that rest and back (footprint-story's rope), and a swing that goes into the block — or any other
 * — is said, as every move's is (`reel:contact`): the rule picks where the rope is tied, never what the swing may do.
 * A block whose top (or underside) is not above the piece's top is no pin (motion.mjs refuses it, naming the fix).
 */

/** How far a block's underside must be above the piece's top to hang it beneath (tiles): floats, not a gap. */
const ABOVE = 1e-6;

/**
 * The pin for a hang from `block`, standing at its corner `at` (tiles), of `piece` whose foot is at `foot` (tiles):
 * {pin: [col, row, lift], arm: [col, row, lift] or null (where the arm leaves the block, for `beside`), rule}.
 */
export function hangPin(block, at, piece, foot) {
  const [x0, y0, z0] = [at[0], at[1], at[2] ?? 0], [w, d, h] = block.size, top = foot[2] + piece.size[2];
  const cx = x0 + w / 2, cy = y0 + d / 2;
  if (z0 > top + ABOVE) return {pin: [cx, cy, z0], arm: null, rule: 'under'};
  // the side that faces the piece: the one its foot lies furthest beyond, measured past the block's own half size
  // (a foot under the block's footprint: the side it is nearest, by its share of each half size)
  const dx = foot[0] - cx, dy = foot[1] - cy, past = [Math.abs(dx) - w / 2, Math.abs(dy) - d / 2];
  const acrossX = Math.max(...past) > 0 ? past[0] >= past[1] : Math.abs(dx) / w >= Math.abs(dy) / d;
  const way = (v) => (v < 0 ? -1 : 1), lift = z0 + h;
  if (acrossX) {
    const edge = [cx + way(dx) * (w / 2), cy, lift];
    return {pin: [edge[0] + way(dx) * (piece.size[0] / 2), cy, lift], arm: edge, rule: 'beside'};
  }
  const edge = [cx, cy + way(dy) * (d / 2), lift];
  return {pin: [cx, edge[1] + way(dy) * (piece.size[1] / 2), lift], arm: edge, rule: 'beside'};
}
