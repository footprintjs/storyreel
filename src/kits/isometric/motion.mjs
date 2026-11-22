/**
 * motion — a world's pieces moved by intent: each `motion` entry (motion-read.mjs) made into one of footprint-story's
 * intents on the frame, every move decided by footprint-story's intent decider (`planIntents`: the model, the duration
 * from a law, the curve), timed on the film's clock, and sampled at any moment.
 *
 *   planMotions(map, motions, clock, where) → {intents, planned, moves, record, summary, findings, poseAt, run}
 *
 * WHY nothing is decided here: the author writes intent, and footprint-story knows how bodies move. The kit only says
 * where things are — a block's place, a target by its block's name, what it lands on — in frame pixels, and draws the
 * block where the samples put it (draw.mjs). The facts about places are motion-place.mjs's.
 *
 * The places, in the built map's tiles and then frame px (`map.grid.at`): a block moves by its FOOT (the middle of its
 * footprint, at its lift). A fall drops it straight down onto the highest top under it, else the floor; a throw, a
 * settle and a reach end with its foot on `to` — a block's top (the middle of it, where that block stands when the move
 * begins) or tiles. A hang ties a rope to its TOP and swings it to rest below the pin (`from`), which must be above it.
 * Moves are placed in the order they begin, each piece from where its last move left it, so a target that moved earlier
 * is aimed at where it went. A move whose way passes through another block is a finding (`reel:contact`).
 *
 * The record keeps what footprint-story decided, as its data: each move's model, how it was chosen, its reason, its
 * seconds and when it starts on the film's clock. `run` is the same intents through footprint-story's chart
 * (`footprint-story/humanflow` · runHumanFlow), so `storyreel check` keeps a record that answers why (check/motions.mjs).
 */
import {planIntents, sampleMove} from 'footprint-story/human';
import {firstDifference} from './flow.mjs';
import {MOTION_DOS, REEL_CRITICS} from './motion-read.mjs';
import {footOf, topOf, cornerOf, landingUnder, offFrame, drawnOff, footTiles, sweptThrough, posed, FRAME} from './motion-place.mjs';

/** The frame the moves are planned on: the film's 1600×900 sheet, the size every world draws on. */
export const MOTION_FRAME = FRAME;

const named = (model, name) => model === name || model?.name === name;
/** A plain value frozen at every level: the intents are handed out (motionIntents) and run again later (runOf), so nothing may change them in between. */
const frozen = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(frozen); } return v; };
const round3 = (v) => Math.round(v * 1000) / 1000;
const tilesText = (t) => `[${t.map((v) => round3(v)).join(', ')}]`;

/**
 * Each `do` as one of footprint-story's intents: (entry, place) → {intent, end, tie, leans}. `place` is what the world
 * knows when the move begins: `px(tiles)` puts a place on the frame, `foot` is where the piece's foot stands (tiles),
 * `at` its corner, `piece` the block, `target(place, key)` a written place in tiles (a block's top where it stands now),
 * `others` the other blocks where they stand ({block, at}). `end` is where the foot stands after (tiles), null when only
 * the swing knows (a hang: the piece's last move); `tie` the point the samples move (its foot, or its top for a hang);
 * `leans` the blocks the move relies on standing still (its target, what it lands on). WHY one row a word: roll, slide
 * and tumble (footprint-story 0.31) are one row each.
 */
export const INTENT_OF = Object.freeze({
  fall: (e, {px, foot, at, piece, others}) => {
    const land = landingUnder(at, piece.size, others), on = land.block ? `"${land.block.name}"'s top (lift ${round3(land.lift)})` : 'the floor';
    if (!(foot[2] > land.lift + 1e-6)) throw new Error(`${e.who}: a fall drops the block from where it stands, and it stands on ${on} already — lift it first (its at: [col, row, ${round3(land.lift + 3)}]), or throw it (do: "throw")`);
    const end = [foot[0], foot[1], land.lift];
    return {intent: {from: px(foot), floor: px(end)[1]}, end, tie: 'foot', leans: land.block ? [land.block] : []};
  },
  throw: (e, {px, foot, target}) => {
    const to = target(e.to, 'to'), end = px(to);
    // a bouncing throw lands on a floor: the line its target stands on (footprint-story refuses one that starts below it)
    return {intent: {from: px(foot), to: end, ...(named(e.model, 'bounce') ? {floor: end[1]} : {})}, end: to, tie: 'foot', leans: e.to.block ? [e.to.block] : []};
  },
  hang: (e, {px, foot, piece, target}) => {
    const pin = target(e.from, 'from'), top = [foot[0], foot[1], foot[2] + piece.size[2]];
    // a rope hangs down from its pin: a pin at or under the block's top would stand the rope up from below it
    if (!(pin[2] > top[2] + 1e-6)) throw new Error(`${e.who}: from is its pin, at lift ${round3(pin[2])} — a block hangs below its pin, and its top is at lift ${round3(top[2])}: lift the pin above it (from: [${round3(pin[0])}, ${round3(pin[1])}, ${round3(top[2] + 3)}])`);
    return {intent: {from: px(pin), to: px(top)}, end: null, tie: 'top', leans: e.from.block ? [e.from.block] : []};
  },
  settle: (e, {px, foot, target}) => { const to = target(e.to, 'to'); return {intent: {from: px(foot), to: px(to)}, end: to, tie: 'foot', leans: e.to.block ? [e.to.block] : []}; },
  // a reach to a block aims at its top: Fitts's law reads the target's width, the top face's width across the frame
  reach: (e, {px, foot, target, topWidth}) => {
    const to = target(e.to, 'to');
    return {intent: {from: px(foot), to: px(to), ...(e.to.block ? {target: topWidth(e.to.block)} : {})}, end: to, tie: 'foot', leans: e.to.block ? [e.to.block] : []};
  },
});

/** footprint-story's refusal in the kit's words: its "human: " off, the entry's name in front when it does not say it. */
function refusal(e, where, entry) {
  const said = String(e?.message ?? e).replace(/^human: /, '');
  return new Error(`${where}: ${entry && !said.startsWith(entry.who.slice(where.length + 2)) ? `${entry.who.slice(where.length + 2)}: ` : ''}${said}`, {cause: e});
}

/**
 * The moves placed in the order they begin: each made into an intent from what the world knows then (where every block
 * stands once the moves begun before it have ended — motion-place's facts), its ends checked to be on the frame.
 * Returns {intents, spans}: `spans[i]` the foot's way in tiles ({from, to, end}) and the move's tie and leans.
 */
function placeMoves(map, motions, starts, where) {
  const px = (t) => { const p = map.grid.at(t[0], t[1], t[2] ?? 0); return [p.x, p.y]; };
  // a block's top face's width across the frame: its east corner to its west for a block, the ellipse's width for a cylinder
  const topWidth = (b) => (b.kind === 'cylinder' ? b.shape.box.w : Math.max(1, map.grid.at(b.at[0] + b.size[0], b.at[1], 0).x - map.grid.at(b.at[0], b.at[1] + b.size[1], 0).x));
  // where each block's corner is now: its built `at`, then where its last move left it; null once it hangs (its rest unknown)
  const now = new Map(map.blocks.map((b) => [b, [b.at[0], b.at[1], b.at[2] ?? 0]])), lastOf = new Map();
  const intents = new Array(motions.length), spans = new Array(motions.length);
  const order = motions.map((_, i) => i).sort((a, b) => starts[a] - starts[b] || a - b);
  for (const i of order) {
    const m = motions[i], piece = m.piece, last = lastOf.get(piece);
    if (last !== undefined && starts[i] === starts[last]) throw new Error(`${m.who}: it begins at ${round3(starts[i])} s, as ${motions[last].path} does — a piece makes one move at a time: anchor one later`);
    if (last !== undefined && now.get(piece) === null) throw new Error(`${m.who}: it follows ${motions[last].path}, a hang, which ends wherever its swing settles — a hang is a piece's last move: take this one out, or move it before the hang`);
    const at = now.get(piece), foot = footOf(at, piece.size);
    const target = (place, key) => {
      if (place.tiles) {
        const off = offFrame(px(place.tiles));
        if (off) throw new Error(`${m.who}: ${key} ${tilesText(place.tiles)} is off the frame (${off}) — ${key === 'from' ? 'give a pin the frame shows (a lower lift, or tiles nearer the blocks)' : 'give tiles on the floor'}: the blocks stand between columns ${round3(Math.min(...map.blocks.map((b) => b.at[0])))} and ${round3(Math.max(...map.blocks.map((b) => b.at[0] + b.size[0])))}, rows ${round3(Math.min(...map.blocks.map((b) => b.at[1])))} and ${round3(Math.max(...map.blocks.map((b) => b.at[1] + b.size[1])))}`);
        return place.tiles;
      }
      const there = now.get(place.block);
      if (there === null) throw new Error(`${m.who}: ${key} names "${place.block.name}", which hangs from ${motions[lastOf.get(place.block)].path} — where its swing rests is not known before it is planned: aim at tiles instead ([col, row])`);
      return topOf(there, place.block.size);
    };
    const others = map.blocks.filter((b) => b !== piece && now.get(b) !== null).map((b) => ({block: b, at: now.get(b)}));
    // a block resting on this one's top when it moves would be left in the air: refused, naming both entries — a
    // picture with a block floating on nothing is wrong, and only the author knows whether the rider goes too
    const rider = others.find((o) => landingUnder(o.at, o.block.size, [{block: piece, at}]).block === piece && Math.abs(o.at[2] - (at[2] + piece.size[2])) < 1e-6);
    if (rider) {
      const since = lastOf.has(rider.block) ? `since ${motions[lastOf.get(rider.block)].path}` : 'as built';
      throw new Error(`${m.who}: it moves "${piece.name}" from under "${rider.block.name}", which rests on its top ${since}, and would leave it on nothing — move "${rider.block.name}" off first (a motion for it before ${round3(starts[i])} s), or anchor this move before "${rider.block.name}" lands there`);
    }
    const made = INTENT_OF[m.do](m, {px, foot, at, piece, target, others, topWidth});
    intents[i] = {do: m.do, name: piece.name, who: m.who.slice(where.length + 2), ...made.intent, ...(m.wrap.length ? {wrap: m.wrap} : {}), ...(m.model !== null ? {model: m.model} : {})};
    // the foot's way in tiles, for its place in the paint order and the pass-through check (poseAt · footTiles); a hang
    // swings towards below its pin, which is all that is known of its end before it is planned
    spans[i] = {from: foot, to: made.end ?? [...target(m.from, 'from').slice(0, 2), 0], end: made.end, tie: made.tie, leans: made.leans};
    now.set(piece, made.end ? cornerOf(made.end, piece.size) : null);
    lastOf.set(piece, i);
  }
  return {intents, spans};
}

/**
 * The moves planned. `map`: the built map (build.mjs, with `grid` and each block's `at`, `size`, `shape`, `appearAt`);
 * `motions`: motion-read's entries; `clock`: the film's. Throws in the entry's name when an anchor is not said, a piece
 * does what it cannot, two of a piece's moves overlap, a move relies on a block that moves meanwhile, an accepted critic
 * is not one its move is checked by, or footprint-story refuses an intent.
 */
export function planMotions(map, motions, clock, where) {
  // when each move begins: its anchor, else when its block appears, else the film's start
  const starts = motions.map((m) => {
    if (m.at === null) return m.piece.appearAt ?? 0;
    try { return clock.at(m.at); } catch (e) { throw new Error(`${m.who}: at: ${e.message}`, {cause: e}); }
  });
  const {intents, spans} = placeMoves(map, motions, starts, where);
  frozen(intents);
  let planned;
  try { planned = planIntents(intents, {frame: [...MOTION_FRAME]}); } catch (e) {
    // a refusal that names no entry (a model's option out of range): each intent alone finds the one it is about
    const culprit = motions.find((m, i) => { try { planIntents([intents[i]], {frame: [...MOTION_FRAME]}); return false; } catch { return true; } });
    throw refusal(e, where, culprit);
  }
  const moves = motions.map((m, i) => ({path: m.path, piece: m.piece, do: m.do, start: starts[i], seconds: planned.durations[i].seconds, move: planned.moves[i], ...spans[i]}));
  const until = (m) => m.start + m.seconds;
  for (const [i, m] of moves.entries()) {
    // one move at a time a piece, and the blocks a move relies on (its target, what it lands on) stand still meanwhile:
    // it was placed where they stand once their earlier moves end
    for (const other of moves) {
      if (other === m || other.start > m.start || (other.start === m.start && moves.indexOf(other) > i)) continue;
      if (other.piece === m.piece && m.start < until(other) - 1e-9) throw new Error(`${motions[i].who}: it begins at ${round3(m.start)} s, while ${other.path} still moves "${m.piece.name}" until ${round3(until(other))} s (footprint-story planned it ${round3(other.seconds)} s) — anchor it at ${round3(until(other))} s or later: a later phrase, or ["scene", "phrase", ${round3(until(other) - m.start)}] after this one`);
    }
    for (const b of m.leans) for (const other of moves.filter((o) => o.piece === b)) {
      if (other.start < until(m) - 1e-9 && until(other) > m.start + 1e-9) throw new Error(`${motions[i].who}: it relies on "${b.name}" standing still from ${round3(m.start)} s to ${round3(until(m))} s, and ${other.path} moves it from ${round3(other.start)} s to ${round3(until(other))} s — anchor this one at ${round3(until(other))} s or later (["scene", "phrase", seconds after]), or that one after ${round3(until(m))} s`);
    }
    // an accepted critic is one this move is checked by: a name it is not would accept nothing, silently
    const checks = [...planned.moves[i].checks, ...REEL_CRITICS];
    for (const name of motions[i].accept) if (!checks.includes(name)) throw new Error(`${motions[i].who}: accept names "${name}", which its move (${planned.choices[i].model}) is not checked by — its critics are ${checks.join(', ')}`);
  }
  const poseAt = poseAtOf(moves, map);
  keepOnFrame(map, moves, motions, poseAt);
  const through = throughFindings(map, moves, poseAt);
  return {intents: frozen(intents), planned, moves, ...recordsOf(motions, moves, planned, through), poseAt, run: runOf(intents, planned)};
}

/**
 * How often a move is sampled for the pass-through and frame checks, and the most samples a move takes (a 30 s bounce:
 * 900). The pass-through check sweeps each block between two samples (motion-place · sweptThrough), so a fast move skips
 * nothing however thin a block; only the bend of the way between two samples (a thirtieth of a second) is taken straight.
 */
const SAMPLE_RATE = 30, SAMPLES_MOST = 900;
/** The moments a move is checked at: its start, its end, and SAMPLE_RATE a second between. */
const samplesOf = (m) => { const n = Math.min(SAMPLES_MOST, Math.max(2, Math.ceil(m.seconds * SAMPLE_RATE))); return Array.from({length: n + 1}, (_, k) => m.start + (k / n) * m.seconds); };

/**
 * Every move kept on the frame as it is drawn, not only at its written ends: its block's outline and a hang's rope at
 * each sample (a 50-tile throw's top, a long rope swinging out). Refused naming the entry, the moment, how far off,
 * and where its foot is then in tiles; the fix is a nearer `to`, or a lower pin. WHY a refusal, as for written tiles:
 * a block drawn off the frame is a picture nobody sees.
 */
function keepOnFrame(map, moves, motions, poseAt) {
  for (const [i, m] of moves.entries()) {
    // a block the map itself draws off the frame (a grid written in numbers can) is the map's to say, not its move's
    if (m.piece.shape.outline.some((p) => offFrame(p))) continue;
    for (const t of samplesOf(m)) {
      const pose = poseAt(m.piece, t);
      const off = drawnOff(m.piece.shape.outline.map((p) => posed(p, pose)), pose.rope ?? []);
      if (!off) continue;
      const foot = footOf(pose.at, m.piece.size);
      throw new Error(`${motions[i].who}: its way leaves the frame — at ${round3(t - m.start)} s ${off.part === 'block' ? 'the block' : 'its rope'} is ${off.off} (its foot at tiles ${tilesText(foot)}) — ${m.tie === 'top' ? 'a pin nearer the blocks, or lower (from)' : 'a nearer to, or one lower on the frame'}`);
    }
  }
}

/**
 * The kit's own critic, `reel:contact`: a move whose block goes into another block on its way, swept between each
 * two samples (motion-place · sweptThrough), each other block where it stands then (moving too, when it moves). WHY the kit's, not footprint-story's contact critic:
 * that one reads boxes on the frame, and on an isometric frame a block's picture overlaps blocks it is nowhere near (a
 * ball resting on a top is inside its box on the frame) — only the world's tiles can say what a block passes through.
 * One finding a move, at its deepest. Its record is the world's, not the intent decider's run (that run has no tiles).
 */
function throughFindings(map, moves, poseAt) {
  const placeAt = (b, t) => poseAt(b, t)?.at ?? [b.at[0], b.at[1], b.at[2] ?? 0];
  return moves.flatMap((m, i) => {
    const times = samplesOf(m), rest = map.blocks.filter((b) => b !== m.piece);
    let worst = null;
    for (let k = 1; k < times.length; k += 1) {
      const [t0, t1] = [times[k - 1], times[k]];
      const hit = sweptThrough(m.piece.size, placeAt(m.piece, t0), placeAt(m.piece, t1), rest.map((b) => ({block: b, from: placeAt(b, t0), to: placeAt(b, t1)})));
      if (hit && (!worst || hit.depth > worst.depth)) worst = {...hit, t: t0 + hit.share * (t1 - t0)};
    }
    if (!worst) return [];
    const fix = m.tie === 'top' ? `move "${worst.block.name}" out of its swing, or the pin (from) so it swings clear` : m.do === 'throw' ? `throw it to a place clear of "${worst.block.name}", or move "${worst.block.name}" out of its way`
      : `move it round "${worst.block.name}": a to clear of it, or throw it over (do: "throw")`;
    return [{intent: i, critic: 'reel:contact', level: 'warn', what: `at ${round3(worst.t - m.start)} s it goes ${round3(worst.depth)} tiles into "${worst.block.name}" — it passes through a block`, fix}];
  });
}

/**
 * What the world's record keeps of the moves (`record`: each move's model, how it was chosen, its reason, its seconds,
 * its start on the film's clock and the critics its entry accepts, all footprint-story's data but the last), what its
 * summary keeps (`summary`: the few words of each), and the findings — footprint-story's critics' and the kit's own
 * (`through`) — each naming its entry, when it is seen and the fix. A finding of a critic its entry accepts keeps its
 * words and is marked `accepted`: the check shows it as accepted, never as a fault.
 */
function recordsOf(motions, moves, planned, through) {
  const record = moves.map((m, i) => Object.freeze({path: m.path, piece: m.piece.name, do: motions[i].do, at: round3(m.start), seconds: round3(m.seconds),
    model: planned.choices[i].model, by: planned.choices[i].by, reason: planned.moves[i].reason, wrappers: Object.freeze([...planned.durations[i].wrappers]),
    ...(motions[i].accept.length ? {accepted: Object.freeze([...motions[i].accept])} : {})}));
  const summary = record.map((r) => Object.freeze({piece: r.piece, do: r.do, model: r.model, at: r.at, seconds: r.seconds}));
  const said = [...planned.findings.map((f) => {
    const who = planned.intents[f.intent].who;
    return {...f, what: f.message.startsWith(`${who}: `) ? f.message.slice(who.length + 2) : f.message};
  }), ...through];
  const findings = said.sort((a, b) => a.intent - b.intent).map((f) => {
    const m = moves[f.intent];
    return Object.freeze({path: m.path, from: m.start, to: m.start + m.seconds, critic: f.critic, level: motions[f.intent].accept.includes(f.critic) ? 'accepted' : f.level, what: f.what, fix: f.fix});
  });
  return {record: Object.freeze(record), summary: Object.freeze(summary), findings: Object.freeze(findings)};
}

/**
 * Where a piece is drawn at t: null before its first move begins (drawn as built), else its pose — `dx`, `dy` (how far
 * the tie point has come from where the block was built), `pivot` (that point, as built), `sx`, `sy` (a bounce's squash,
 * its area kept: 1 when none), `rope` (a hang's points, the pin first) and `at` (where the block stands now in tiles,
 * its corner as a built block's `at`: what the paint order and the pass-through check are worked out from). After its
 * last move it stays where that ended.
 *
 * WHY no angle: footprint-story 0.30's block moves give one, but none is a body's turn — a throw's and a fall's is the
 * heading of its flight, a hang's the heading of its rope's last link — and a block that stood upright would jump to
 * it. tumble (0.31) turns a body: its row in INTENT_OF will say so, and the pose will carry its angle.
 */
function poseAtOf(moves, map) {
  const px = (t) => { const p = map.grid.at(t[0], t[1], t[2] ?? 0); return [p.x, p.y]; }, footAt = footTiles(map.grid);
  const tracks = new Map();
  for (const m of moves) tracks.set(m.piece, [...(tracks.get(m.piece) ?? []), m].sort((a, b) => a.start - b.start));
  // each piece's foot and top on the frame where it was built: what its samples are measured from
  const built = new Map([...tracks.keys()].map((b) => [b, {foot: px(footOf(b.at, b.size)), top: px(topOf(b.at, b.size))}]));
  return (piece, t) => {
    const list = tracks.get(piece);
    if (!list || t < list[0].start) return null;
    const m = list.findLast((x) => x.start <= t), s = sampleMove(m.move, Math.min(m.seconds, t - m.start));
    const pivot = built.get(piece)[m.tie], {foot, top} = built.get(piece);
    // the foot on the frame now: the sample itself, or for a hang (tied at its top, drawn upright) as far below it as built;
    // once the move has ended its place is the one it was planned to end on, exactly (worked back from the frame, a
    // ball resting on a top could come out a billionth under it, inside the block it stands on, and be ordered behind it)
    const ended = t >= m.start + m.seconds && m.end !== null;
    const [c, r, lift] = ended ? m.end : footAt([s.x, s.y + (m.tie === 'top' ? foot[1] - top[1] : 0)], m, Math.min(1, (t - m.start) / m.seconds));
    return {dx: s.x - pivot[0], dy: s.y - pivot[1], pivot, sx: s.sx ?? 1, sy: s.sy ?? 1, ...(m.tie === 'top' ? {rope: s.points} : {}),
      at: cornerOf([c, r, lift], piece.size)};
  };
}

/**
 * The same intents run through footprint-story's intent decider as a footprintjs chart (runHumanFlow), so the run's
 * record answers why: `storyreel check` runs it (check/motions.mjs). Its result must equal the compile's: `differs` is
 * null, or where they first part (flow.mjs · firstDifference). Loaded when first run: a film that never asks pays nothing.
 */
function runOf(intents, planned) {
  return async ({sink, recorders = []} = {}) => {
    const {runHumanFlow} = await import('footprint-story/humanflow');
    const {result, snapshot} = await runHumanFlow(intents, {frame: [...MOTION_FRAME], ...(sink ? {sink} : {}), recorders});
    return {snapshot, differs: firstDifference(result, planned)};
  };
}

/** The `do` words the planner has a row for: motion-read's, the same list (a test pins it). */
export const PLANNED_DOS = Object.freeze(Object.keys(INTENT_OF));
export {MOTION_DOS};
