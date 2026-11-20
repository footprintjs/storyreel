/**
 * The checks on where the camera goes, made on the lanes once both versions (as moves, as cuts) are laid: every move
 * keeps the frame covered within the most a camera zooms, a dolly on a thing holds without passing it, and a dolly-out
 * widens. Its own module because these refusals are the camera's rules, read apart from the arithmetic they sample.
 */
import {MAX_ZOOM, coverZoom, covered, REST} from '../camera.mjs';
import {SAMPLE, r3, spanOf} from './lanes.mjs';

/**
 * Each view and follow move, sampled over its own span (each is checked where it moves, so a refusal names the move
 * that moves): never past MAX_ZOOM. Returns {covers: how far each had to scale up to keep the frame covered, where it
 * did (Map move → zoom), for the record; inherited: the first move that starts already past the limit, or null} — that
 * one did not take the camera there, so it is not named for it: a hold did (checkHolds, which runs next, names it).
 */
export function checkCover(moves, stateAt, cuts) {
  const covers = new Map();
  let inherited = null;   // the first move that starts already past the limit: what held the camera there is to blame
  for (const m of moves) {
    if (m.family !== 'view' && m.family !== 'follow') continue;
    const [a, b] = spanOf(m, cuts), n = Math.max(1, Math.ceil((b - a) / SAMPLE));
    // Already past the limit just before it starts (a cut's one moment is its own arrival, so judged a hair before)?
    const was = stateAt(a - 1e-6), wasNeed = Math.max(was.z, coverZoom(was));
    if (!(wasNeed <= MAX_ZOOM)) { inherited ??= {m, need: wasNeed, t: a}; continue; }
    let most = 0, zoomed = {z: 0}, needed = {z: 0};   // the most it scaled to cover; the furthest it zooms, or needs to
    for (let i = 0; i <= n; i++) {
      const t = a + (b - a) * i / n, v = stateAt(t), need = coverZoom(v), z = Math.max(v.z, need);
      if (v.z > zoomed.z) zoomed = {z: v.z, t};
      if (!(need <= needed.z)) needed = {z: need, t};
      if (need > v.z + 1e-6) most = Math.max(most, z);
    }
    // Said with the furthest it goes (not the first moment past the limit): the number a director changes.
    if (zoomed.z > MAX_ZOOM) throw new Error(`${m.path} (${m.move}) takes the camera to ×${zoomed.z.toFixed(2)} at ${zoomed.t.toFixed(2)} s, past the ×${MAX_ZOOM} a camera goes to (dollies multiply: each starts from the zoom on screen, a pan's or a dutch's included): dolly in less, or dolly out between them`);
    if (!(needed.z <= MAX_ZOOM)) throw new Error(`${m.path} (${m.move}) would need the picture at ${Number.isFinite(needed.z) ? `×${needed.z.toFixed(2)}` : 'more than any zoom'} at ${needed.t.toFixed(2)} s to keep the frame covered (a camera goes to ×${MAX_ZOOM}; it looks at most 600 px across and 337 px up or down from the middle): move it less far`);
    if (most) covers.set(m, r3(most));
  }
  return {covers, inherited};
}

/** The move that rolled the frame by t (the last one on the roll axis to start), or null. */
const rollerAt = (moves, t, cuts) => moves.filter(x => x.def.axes(x.p).includes('r') && spanOf(x, cuts)[0] <= t).at(-1) ?? null;

/**
 * A dolly-out must widen: where the camera is headed once it and every move begun before its end have arrived must
 * need less zoom than where it was headed as it began (covered: a dutch's cover need included). Otherwise it would
 * play as nothing, or as a zoom IN, so it refuses, naming what holds the zoom. Judged from where the camera is headed
 * (viewLanes · timeline), never from a moment on screen, so the moving film and the reduced-motion film decide alike.
 */
export function checkWidens(moves, timeline) {
  timeline.forEach((e, i) => {
    if (e.m?.move !== 'dolly-out') return;
    const m = e.m, before = covered(i ? timeline[i - 1].settled : REST).z;
    let j = i; while (timeline[j + 1] && timeline[j + 1].t < m.until) j++;
    const after = covered(timeline[j].settled), need = coverZoom(after);
    if (after.z < before - 1e-6) return;
    const roller = need >= after.z - 1e-6 && after.r ? timeline.slice(0, j + 1).filter(x => x.m?.def.axes(x.m.p).includes('r')).at(-1)?.m : null;
    const why = roller ? `the ${roller.move} (${roller.path}) needs ×${need.toFixed(2)} to keep the frame covered`
      : before <= 1 + 1e-6 ? 'the camera is already at the whole frame' : `where it looks, the frame needs ×${need.toFixed(2)} to stay covered`;
    throw new Error(`${m.path} (dolly-out) cannot widen here: ${why}; the camera is headed for ×${before.toFixed(2)} as it starts, and would end at ×${after.z.toFixed(2)}; ${roller ? `level the ${roller.move} first (amount 0), or leave the dolly-out out` : 'leave the dolly-out out'}`);
  });
}

/**
 * Each dolly on a thing, while it holds: it re-aims as a push or the focus moves the picture under it, from its end
 * until moves have taken over both where it looks across (x) and up and down (y), or its picture changes — a move on
 * one of them leaves the other re-aiming. With its own roll it needs no more zoom than it has; only a later dutch can
 * raise the need, so a hold past ×4 refuses naming the dutch.
 */
export function checkHolds(moves, stateAt, cuts) {
  const nextOn = (m, axis, b) => Math.min(Infinity, ...moves.filter(x => x !== m && (x.family === 'view' || x.family === 'follow') && x.def.axes(x.p).includes(axis) && spanOf(x, cuts)[0] >= b).map(x => spanOf(x, cuts)[0]));
  for (const m of moves.filter(x => x.holdEnd !== undefined)) {
    const b = spanOf(m, cuts)[1], end = Math.min(m.holdEnd, Math.max(nextOn(m, 'x', b), nextOn(m, 'y', b))), n = Math.ceil((end - b) / SAMPLE);
    let worst = {need: 0};   // said with the most it needs (not the first moment past the limit), as checkCover says it
    for (let i = 1; i <= n; i++) {
      const t = b + (end - b) * i / n, v = stateAt(t), need = Math.max(v.z, coverZoom(v));
      if (!(need <= worst.need)) worst = {need, t};
    }
    if (!(worst.need > MAX_ZOOM)) continue;
    const roller = rollerAt(moves, worst.t, cuts), who = roller ? `${roller.path} (${roller.move}) rolls the frame while ${m.path} (${m.move})` : `${m.path} (${m.move})`;
    throw new Error(`${who} holds on "${m.p.on}": at ${worst.t.toFixed(2)} s the picture would need ${Number.isFinite(worst.need) ? `×${worst.need.toFixed(2)}` : 'more than any zoom'} to keep the frame covered (a camera goes to ×${MAX_ZOOM}): ${roller ? `roll less, or dolly in less before it` : 'dolly in less'}`);
  }
}

