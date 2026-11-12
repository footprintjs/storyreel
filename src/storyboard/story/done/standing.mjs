/**
 * The standing of each scene: known, not sure, or ask, and why. Known: the board passed the check against the whole
 * conversation, its point rests on cited messages, and its piece needed no fix. Not sure: it says what is not known, or it
 * passed only after a fix. Ask: it rests on a point only the owner can settle (two points disagree, or a claim cites
 * nothing), or on no picked point at all. The asks are listed on the result for the owner; the run does not stop for them.
 */
import {POINT_WHY} from '../merge/merge.mjs';

/** Why a scene stands as it does, beyond its point's own reason: fixed words. */
export const SCENE_WHY = Object.freeze({
  ...POINT_WHY,
  frame: 'it is the story\'s frame, checked against the whole conversation',
  fixed: 'it passed the check only after a fix',
  'no-point': 'no picked point rests on the messages it cites: only the owner can say where it comes from',
  'refused-window': 'the model gave no usable points for this part of the conversation: only the owner can say what it holds',
  unused: 'no scene tells this point',
});

/** The piece a scene comes from: `checked-2` is `checked[1]`; the title and what happens next are the frame. */
const pieceOf = (scene) => (scene.part === 'title' || scene.part === 'next' ? 'frame' : `${scene.part}[${Number(scene.id.split('-').pop()) - 1}]`);

/** The point a scene tells: same part, the most sources shared (`sources`: the scene's, by ordinal); -1 when none shares one. */
function pointOf(scene, sources, points) {
  let best = -1, most = 0;
  points.forEach((p, k) => {
    const shared = p.part === scene.part ? p.sources.filter((id) => sources.includes(id)).length : 0;
    if (shared > most) { best = k; most = shared; }
  });
  return best;
}

function sceneStanding(scene, sources, points, fixed) {
  // a scene is fixed when its own entry was, or its whole list (piece `checked` holds every `checked-*` scene)
  const wasFixed = fixed.has(pieceOf(scene)) || fixed.has(scene.part);
  if (scene.part === 'title' || scene.part === 'next') return {standing: wasFixed ? 'not-sure' : 'known', why: wasFixed ? 'fixed' : 'frame', point: null};
  if (scene.part === 'unsure') return {standing: 'not-sure', why: 'unsure', point: null};
  const k = pointOf(scene, sources, points);
  if (k < 0) return {standing: 'ask', why: 'no-point', point: null};
  const p = points[k];
  if (p.standing === 'ask') return {standing: 'ask', why: p.why, point: k};
  if (wasFixed) return {standing: 'not-sure', why: 'fixed', point: k};
  return {standing: p.standing, why: p.why, point: k};
}

/**
 * {standing, ask}: `standing[sceneId] = {standing, why, sources, point}` (sources by ordinal; point: the index into the
 * record's points, or null); `ask`: what only the owner can answer, [{scene} | {point} | {window}, why]. `points`: their
 * sources by ordinal. `fixed`: the pieces any fix changed. `ordinalOf(id)`: a message's ordinal.
 */
export function standingOf(board, points, fixed, refusedWindows, ordinalOf) {
  const standing = {}, ask = [], told = new Set(), fixedSet = new Set(fixed);
  for (const scene of board.scenes) {
    const sources = (scene.beat.sources ?? []).map(ordinalOf);
    const s = sceneStanding(scene, sources, points, fixedSet);
    standing[scene.id] = {...s, sources};
    if (s.point !== null) told.add(s.point);
    if (s.standing === 'ask') ask.push({scene: scene.id, why: SCENE_WHY[s.why]});
  }
  points.forEach((p, k) => { if (p.standing === 'ask' && !told.has(k)) ask.push({point: k, why: `${SCENE_WHY[p.why]}; ${SCENE_WHY.unused}`}); });
  for (const window of refusedWindows) ask.push({window, why: SCENE_WHY['refused-window']});
  return {standing, ask};
}
