/**
 * motion — a world's pieces moved by intent: each `motion` entry (motion-read.mjs) made into one of footprint-story's
 * intents on the frame, every move decided by footprint-story's intent decider (`planIntents`: the model, the duration
 * from a law, the curve), timed on the film's clock, and sampled at any moment.
 *
 *   planMotions(map, motions, clock, where) → {intents, planned, moves, record, summary, findings, poseAt, run}
 *
 * WHY nothing is decided here: the author writes intent, and footprint-story knows how bodies move. The kit only says
 * where things are — a block's place from the built map, a target by its block's name, the floor from the grid — in
 * frame pixels, and draws the block where the samples put it (draw.mjs).
 *
 * The places, in the built map's tiles and then frame px (`map.grid.at`): a block moves by its FOOT (the middle of its
 * footprint, at its lift). A fall drops it straight down to the floor under its foot (lift 0); a throw, a settle and a
 * reach end with its foot on `to` — a block's top (the middle of it) or tiles. A hang ties a rope to its TOP and swings
 * it to rest below the pin (`from`). Each piece's moves run one after another, each from where the one before left it.
 *
 * The record keeps what footprint-story decided, as its data: each move's model, how it was chosen, its reason, its
 * seconds and when it starts on the film's clock. `run` is the same intents through footprint-story's chart
 * (`footprint-story/humanflow` · runHumanFlow), so `storyreel check` keeps a record that answers why (check/motions.mjs).
 */
import {planIntents, sampleMove} from 'footprint-story/human';
import {firstDifference} from './flow.mjs';
import {MOTION_DOS} from './motion-read.mjs';

/** The frame the moves are planned on: the film's 1600×900 sheet, the size every world draws on. */
export const MOTION_FRAME = Object.freeze([1600, 900]);

/** A block's foot and top in tiles: the middle of its footprint, at its lift and at its height. */
const footOf = (b) => [b.at[0] + b.size[0] / 2, b.at[1] + b.size[1] / 2, b.at[2] ?? 0];
const topOf = (b) => [b.at[0] + b.size[0] / 2, b.at[1] + b.size[1] / 2, (b.at[2] ?? 0) + b.size[2]];
/** A place as motion-read gave it, in tiles: a block's top (a thing ends standing on it), or the tiles written. */
const tilesOf = (place) => (place.block ? topOf(place.block) : place.tiles);
const named = (model, name) => model === name || model?.name === name;
/** A plain value frozen at every level: the intents are handed out (motionIntents) and run again later (runOf), so nothing may change them in between. */
const frozen = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(frozen); } return v; };
const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Each `do` as one of footprint-story's intents: (entry, {px, place, piece}) → {intent, end, tie}. `px(tiles)` puts a
 * place on the frame; `place` is where the piece's foot stands now (tiles); `end` is where it stands after (tiles), null
 * when only the swing knows (a hang: the piece's last move); `tie` the point of the block the samples move: its foot, or
 * its top for a hang (the rope's end). WHY one row a word: roll, slide and tumble (footprint-story 0.31) are one row each.
 */
export const INTENT_OF = Object.freeze({
  fall: (e, {px, place}) => {
    if (!(place[2] > 0)) throw new Error(`${e.who}: a fall drops the block from where it stands, and it stands on the floor (lift 0) — lift it first (its at: [col, row, 3]), or throw it (do: "throw")`);
    return {intent: {from: px(place), floor: px([place[0], place[1], 0])[1]}, end: [place[0], place[1], 0], tie: 'foot'};
  },
  throw: (e, {px, place}) => {
    const to = tilesOf(e.to), end = px(to);
    // a bouncing throw lands on a floor: the line its target stands on (footprint-story refuses one that starts below it)
    return {intent: {from: px(place), to: end, ...(named(e.model, 'bounce') ? {floor: end[1]} : {})}, end: to, tie: 'foot'};
  },
  hang: (e, {px, place, piece}) => ({intent: {from: px(tilesOf(e.from)), to: px([place[0], place[1], place[2] + piece.size[2]])}, end: null, tie: 'top'}),
  settle: (e, {px, place}) => ({intent: {from: px(place), to: px(tilesOf(e.to))}, end: tilesOf(e.to), tie: 'foot'}),
  // a reach to a block aims at its top: Fitts's law reads the target's width, so a wider block is reached sooner
  reach: (e, {px, place}) => ({intent: {from: px(place), to: px(tilesOf(e.to)), ...(e.to.block ? {target: Math.max(1, e.to.block.shape.box.w)} : {})}, end: tilesOf(e.to), tie: 'foot'}),
});

/** footprint-story's refusal in the kit's words: its "human: " off, the entry's name in front when it does not say it. */
function refusal(e, where, entry) {
  const said = String(e?.message ?? e).replace(/^human: /, '');
  return new Error(`${where}: ${entry && !said.startsWith(entry.who.slice(where.length + 2)) ? `${entry.who.slice(where.length + 2)}: ` : ''}${said}`, {cause: e});
}

/**
 * The moves planned. `map`: the built map (build.mjs, with `grid` and each block's `at`, `size`, `shape`, `appearAt`);
 * `motions`: motion-read's entries; `clock`: the film's. Throws in the entry's name when an anchor is not said, a piece
 * does what it cannot, two of a piece's moves overlap, or footprint-story refuses an intent.
 */
export function planMotions(map, motions, clock, where) {
  const px = (t) => { const p = map.grid.at(t[0], t[1], t[2] ?? 0); return [p.x, p.y]; };
  // when each move begins: its anchor, else when its block appears, else the film's start
  const starts = motions.map((m) => {
    if (m.at === null) return m.piece.appearAt ?? 0;
    try { return clock.at(m.at); } catch (e) { throw new Error(`${m.who}: at: ${e.message}`, {cause: e}); }
  });
  // each piece's moves in time order, each from where the one before left it
  const intents = new Array(motions.length), ties = new Array(motions.length), byPiece = new Map();
  for (const [i, m] of motions.entries()) byPiece.set(m.piece, [...(byPiece.get(m.piece) ?? []), i]);
  for (const [piece, list] of byPiece) {
    list.sort((a, b) => starts[a] - starts[b] || a - b);
    let place = footOf(piece), last = null;
    for (const i of list) {
      const m = motions[i];
      if (last !== null && starts[i] === starts[last]) throw new Error(`${m.who}: it begins at ${round3(starts[i])} s, as ${motions[last].path} does — a piece makes one move at a time: anchor one later`);
      if (last !== null && place === null) throw new Error(`${m.who}: it follows ${motions[last].path}, a hang, which ends wherever its swing settles — a hang is a piece's last move: take this one out, or move it before the hang`);
      const made = INTENT_OF[m.do](m, {px, place, piece});
      intents[i] = {do: m.do, name: piece.name, who: m.who.slice(where.length + 2), ...made.intent, ...(m.wrap.length ? {wrap: m.wrap} : {}), ...(m.model !== null ? {model: m.model} : {})};
      ties[i] = made.tie; place = made.end; last = i;
    }
  }
  frozen(intents);
  let planned;
  try { planned = planIntents(intents, {frame: [...MOTION_FRAME]}); } catch (e) {
    // a refusal that names no entry (a model's option out of range): each intent alone finds the one it is about
    const culprit = motions.find((m, i) => { try { planIntents([intents[i]], {frame: [...MOTION_FRAME]}); return false; } catch { return true; } });
    throw refusal(e, where, culprit);
  }
  const moves = motions.map((m, i) => ({path: m.path, piece: m.piece, start: starts[i], seconds: planned.durations[i].seconds, move: planned.moves[i], tie: ties[i]}));
  for (const list of byPiece.values()) for (let k = 1; k < list.length; k += 1) {
    const before = moves[list[k - 1]], m = moves[list[k]];
    if (m.start < before.start + before.seconds - 1e-9) throw new Error(`${motions[list[k]].who}: it begins at ${round3(m.start)} s, while ${before.path} still moves "${m.piece.name}" until ${round3(before.start + before.seconds)} s (footprint-story planned it ${round3(before.seconds)} s) — anchor it at ${round3(before.start + before.seconds)} s or later: a later phrase, or ["scene", "phrase", ${round3(before.start + before.seconds - m.start)}] after this one`);
  }
  return {intents: frozen(intents), planned, moves, ...recordsOf(motions, moves, planned), poseAt: poseAtOf(moves, px), run: runOf(intents, planned)};
}

/**
 * What the world's record keeps of the moves (`record`: each move's model, how it was chosen, its reason, its seconds
 * and its start on the film's clock, all footprint-story's data), what its summary keeps (`summary`: the few words of
 * each), and the critics' findings, each naming its entry, when it is seen and the fix in footprint-story's words.
 */
function recordsOf(motions, moves, planned) {
  const record = moves.map((m, i) => Object.freeze({path: m.path, piece: m.piece.name, do: motions[i].do, at: round3(m.start), seconds: round3(m.seconds),
    model: planned.choices[i].model, by: planned.choices[i].by, reason: planned.moves[i].reason, wrappers: Object.freeze([...planned.durations[i].wrappers])}));
  const summary = record.map((r) => Object.freeze({piece: r.piece, do: r.do, model: r.model, at: r.at, seconds: r.seconds}));
  const findings = planned.findings.map((f) => {
    const m = moves[f.intent], who = planned.intents[f.intent].who;
    return Object.freeze({path: m.path, from: m.start, to: m.start + m.seconds, critic: f.critic, level: f.level,
      what: f.message.startsWith(`${who}: `) ? f.message.slice(who.length + 2) : f.message, fix: f.fix});
  });
  return {record: Object.freeze(record), summary: Object.freeze(summary), findings: Object.freeze(findings)};
}

/**
 * Where a piece is drawn at t: null before its first move begins (drawn as built), else its pose — `dx`, `dy` (how far
 * the tie point has come from where the block was built), `pivot` (that point, as built), `sx`, `sy` (a bounce's squash,
 * its area kept: 1 when none) and `rope` (a hang's points, the pin first). After its last move it stays where that ended.
 *
 * WHY no angle: footprint-story 0.30's block moves give one, but none is a body's turn — a throw's and a fall's is the
 * heading of its flight, a hang's the heading of its rope's last link — and a block that stood upright would jump to
 * it. tumble (0.31) turns a body: its row in INTENT_OF will say so, and the pose will carry its angle.
 */
function poseAtOf(moves, px) {
  const tracks = new Map();
  for (const m of moves) tracks.set(m.piece, [...(tracks.get(m.piece) ?? []), m].sort((a, b) => a.start - b.start));
  // each piece's foot and top on the frame where it was built: what its samples are measured from
  const built = new Map([...tracks.keys()].map((b) => [b, {foot: px(footOf(b)), top: px(topOf(b))}]));
  return (piece, t) => {
    const list = tracks.get(piece);
    if (!list || t < list[0].start) return null;
    const m = list.findLast((x) => x.start <= t), s = sampleMove(m.move, Math.min(m.seconds, t - m.start));
    const pivot = built.get(piece)[m.tie];
    return {dx: s.x - pivot[0], dy: s.y - pivot[1], pivot, sx: s.sx ?? 1, sy: s.sy ?? 1, ...(m.tie === 'top' ? {rope: s.points} : {})};
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
