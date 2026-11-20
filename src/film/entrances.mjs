/**
 * Stage 21 of the compile: every world made ready (its images decoded: a push on a named thing reads the worlds'
 * regions), then the boxes an entrance goes through found once — in the picture it leaves at the change's first
 * moment, in the one it arrives at at its last — so a frame stays a pure function of time. Its own stage because it is
 * the first that needs every world ready and the regions in place, and it fills the boxes the drawing reads.
 *
 * Reads: readies, push, shots, stages, clock, entranceBoxes, namedIn, shotRegions.
 * Writes: entranceBoxes (filled, by shot).
 */

export async function entrancesStage(state) {
  const {readies, push, shots, stages, clock, entranceBoxes, namedIn, shotRegions} = state;
  // A push on a named thing reads the worlds' regions, so every world is ready first (its images decoded).
  await readyWorlds(readies);
  // An entrance that goes through a named thing (transitions.mjs · regions) finds it once, here: in the picture
  // it leaves at the change's first moment, in the one it arrives at at its last. The draw reads these boxes,
  // so a frame stays a pure function of time; a name the picture does not have refuses, naming the ones it has.
  if (!push) shots.forEach((shot, j) => {
    const en = shot.enter;
    if (!j || !en.regions) return;
    const st = shot.stages[0] ?? stages.find(s => s.world === shot.world), where = `stage ${st.scene}`, want = en.regions(en.p);
    const lists = want && typeof want === 'object' && !Array.isArray(want) && ['from', 'to'].every(side => want[side] === undefined || (Array.isArray(want[side]) && want[side].every(n => typeof n === 'string' && n.trim())));
    if (!lists) throw new Error(`${where}: the ${en.type}'s regions(p) must return {from?: [names], to?: [names]}`);
    // A world in a thought cloud is not on the frame until its cloud opens, after the change has ended.
    if (want.to?.length && shot.world?.frame) throw new Error(`${where}: the ${en.type} goes to ${want.to.map(n => `"${n}"`).join(', ')} in the picture it arrives at, and that world opens in a thought cloud (its frame): none of it is on the frame until the cloud has opened, after the change. Enter it another way (a cut, a fade, an iris), or leave its frame out`);
    // Every thing a setting names is looked up: one regions(p) leaves out would never be checked.
    const looked = new Set([...(want.from ?? []), ...(want.to ?? [])]);
    for (const [name, value] of Object.entries(en.p)) if (en.names?.includes(name) && value !== null && !looked.has(value)) throw new Error(`${where}: the ${en.type}'s ${name} names "${value}", which its regions(p) does not look for`);
    const t0 = Math.max(0, shot.start - en.lead), t1 = Math.min(clock.total, t0 + en.seconds);
    const names = side => {
      const list = want?.[side] ?? [];
      if (!Array.isArray(list) || !list.every(n => typeof n === 'string' && n.trim())) throw new Error(`${where}: the ${en.type}'s regions(p) must return {from?: [names], to?: [names]}`);
      return list;
    };
    const find = (side, sh, t) => Object.freeze(Object.fromEntries(names(side).map(name => [name, entranceBox(sh, name, t, {where, type: en.type, side})])));
    entranceBoxes.set(shot, Object.freeze({from: find('from', shots[j - 1], t0), to: find('to', shot, t1)}));
  });
  /** The box of the thing an entrance names, in the picture it leaves (side 'from') or arrives at ('to'), at t; it must be on the frame. */
  function entranceBox(shot, name, t, {where, type, side}) {
    const picture = side === 'from' ? 'the picture it leaves' : 'the picture it arrives at';
    let box;
    try { box = namedIn(shotRegions(shot, t), name, t); } catch (err) { throw new Error(`${where}: the ${type} looks for "${name}" in ${picture}, and ${err.message}`); }
    const w = Math.min(1600, box[2]) - Math.max(0, box[0]), h = Math.min(900, box[3]) - Math.max(0, box[1]);
    if (!(w >= 4 && h >= 4)) throw new Error(`${where}: the ${type} goes through "${name}" in ${picture}, which is not on the frame at ${t.toFixed(2)} s (its box is [${box.map(n => Math.round(n)).join(', ')}])`);
    return Object.freeze([...box]);
  }
}

/** Wait for every world to be ready; the first that failed refuses the film, naming the world. */
async function readyWorlds(readies) {
  const failed = (await Promise.all(readies)).find(Boolean);
  if (failed) throw new Error(`${failed.where}: the kit "${failed.name}" was not ready: ${failed.error?.message ?? failed.error}`, {cause: failed.error});
}

