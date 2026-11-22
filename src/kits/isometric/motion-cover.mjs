/**
 * motion-cover — what a moving block hides: another block's name (its label and small line on its top) that a moved
 * block is drawn over. A ball thrown onto a server's top sits on the server's name.
 *
 *   coversOf(map, moves, poseAt) → {hidden: Map(block → [[from, to], …]), findings: [{intent, critic, level, what, fix}]}
 *
 * WHY: the kit says which words are on screen to be read, and when (`texts()`): the reading and contrast checks measure
 * exactly those. A name a moved block covers is not there to read, so its span ends while it is covered — and the kit
 * says so itself (`reel:covers`, a finding naming the move, the name and the fix) rather than leaving a check to find a
 * word "too faint" behind a block, which depends on how wide the host's font draws it.
 *
 * The rules are footprint-story's (`/isometric`, 0.32.0 — one copy, StoryDeck reads it too): a name's box from the
 * built map's numbers only (`nameBox`: its fitted lines and size, NAME_WIDTH of its size a letter, never a font's width,
 * so every host decides the same), whether an outline meets it (`overlapsBox`), which resting block hides it at a
 * moment (`hiddenNames`: read from the paint order of EVERY block, `orderAt` — the order the film paints by), and the
 * finding's words (`coverFinding`). The kit keeps when (every move's samples), its `reel:` prefix and its fix.
 *
 * Only a block at REST hides a name: one passing over it in flight is a moment of natural occlusion, drawn as it is
 * (the name, then the block in front of it), and the contrast check judges a word by its best moment, so a pass never
 * reads as a faint word. A name is hidden from the moment a moved block comes to rest over it until that block moves on.
 */
import {posed, nameBox, hiddenNames, coverFinding} from 'footprint-story/isometric';
import {drawnOutline} from './turn.mjs';

/** A block's name on its top as a box on the frame, as built, or null when it has none: draw.mjs · drawBlock's layout (the small line drawn joined on one line). */
const boxOf = (b) => (b.fitted ? nameBox(b.fitted, b.smallFitted ? {text: b.smallFitted.lines.join(' '), size: b.smallFitted.size} : null, b.shape.centre) : null);

/**
 * Which names the moving blocks hide, and when. `moves` (motion.mjs, each with its samples' moments `times`), `poseAt`
 * (motion.mjs · poseAt). A name is hidden at a moment when a resting moved block's outline there — as it is drawn, turned
 * when its pose is (turn.mjs · drawnOutline, the outline a camera frames and the frame check reads) — overlaps its box and
 * that block is painted after the named one in the order of every block where each stands (footprint-story ·
 * hiddenNames). The moments read are every move's samples; between them nothing moves, so a state holds until the next
 * one (after the last, for good).
 * `findings`: a move that comes to rest over a name — its last moment hides one — names the move, the name and the fix.
 */
export function coversOf(map, moves, poseAt) {
  const named = map.blocks.map((b) => ({block: b, box: boxOf(b)})).filter((n) => n.box), movers = [...new Set(moves.map((m) => m.piece))];
  const index = new Map(map.blocks.map((b, i) => [b, i]));
  const placeOf = (b, t) => poseAt(b, t)?.at ?? [b.at[0], b.at[1], b.at[2] ?? 0];
  // a block at rest at t: none of its moves runs then (the moment one ends, it rests)
  const resting = (b, t) => !moves.some((m) => m.piece === b && t >= m.start && t < m.start + m.seconds);
  const hiddenAt = (n, t) => {
    const own = poseAt(n.block, t), box = own ? [posed([n.box[0], n.box[1]], own), posed([n.box[2], n.box[3]], own)].flat() : n.box;
    const covers = movers.flatMap((p) => {
      const pose = p !== n.block && resting(p, t) ? poseAt(p, t) : null;
      // its outline as drawn at rest (turn.mjs · drawnOutline): a body left turned is drawn by its turned corners, and
      // what it covers is what is drawn — never its outline as built, moved
      return pose ? [{piece: index.get(p), outline: drawnOutline(p, pose, map.grid)}] : [];
    });
    if (!covers.length) return null;
    const things = map.blocks.map((b) => ({at: placeOf(b, t), size: b.size}));
    const [by] = hiddenNames(map.grid, things, [{piece: index.get(n.block), box}], covers);
    return by === null ? null : map.blocks[by];
  };
  const times = [...new Set(moves.flatMap((m) => m.times))].sort((a, b) => a - b), hidden = new Map();
  for (const n of named) {
    const spans = [];
    let from = null;
    for (const t of times) {
      const by = hiddenAt(n, t);
      if (by && from === null) from = t;
      if (!by && from !== null) { spans.push([from, t]); from = null; }
    }
    if (from !== null) spans.push([from, Infinity]);
    if (spans.length) hidden.set(n.block, spans);
  }
  const findings = moves.flatMap((m, i) => {
    const end = m.times.at(-1), over = named.filter((n) => n.block !== m.piece && hiddenAt(n, end) === m.piece);
    return over.map((n) => {
      const said = coverFinding(n.block.name, n.block.fitted.lines.join(' '));
      return {intent: i, critic: `reel:${said.critic}`, level: said.level, what: said.message,
        fix: `land it clear of the name (to: tiles beside "${n.block.name}", or a corner of its top), or accept it when it is meant ("accept": ["reel:covers"])`};
    });
  });
  return {hidden, findings};
}
