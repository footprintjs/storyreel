/**
 * Stage 24 of the compile: watching time (shots.mjs) — each shot's moments, the phrases the recipe names while it is on
 * screen, never too many too close together — reported, or refused; and the shots as planned, for film.shots. Its own
 * stage because it is a check on the whole film's beats, made once every phrase that is not something to see (a push's
 * camera words, a rewind, the poster, the recalls, the reads, the camera's moves) is known.
 *
 * Reads: notes, stages, recipe, readRefs, camerawork, beats, plan.
 * Writes: watchingRule, watching, shotsPlanned.
 */
import {tooMuchTooFast, distinctMoments, watchingMode, watchingText, WATCHING} from '../shots.mjs';

export function watchingStage(state) {
  const {notes, stages, recipe, readRefs, camerawork, beats, plan} = state;
  // Watching time (shots.mjs): each shot's moments — the phrases the recipe names while it is on screen —
  // never too many, too close together. Phrases that are not something to see are left out, by identity:
  // a push's camera words, a teaser's rewind (it names the past), the poster and the recalls.
  const notMoments = new Set([...notes.pushes.flatMap(n => [n.push.from, n.push.to]), ...stages.flatMap(st => st.teaser ? [st.teaser.rewind.from, st.teaser.rewind.to] : []), ...(recipe.stepsTrack?.rewind?.to ? [recipe.stepsTrack.rewind.to] : []),
    ...(recipe.poster ? [recipe.poster] : []), ...Object.values(recipe.recalls ?? {}), ...readRefs, ...(camerawork ? recipe.camera.flatMap(m => [m.at, m.until]) : [])]);
  const momentsOf = u => beats.filter(b => !notMoments.has(b.ref) && b.t >= u.from && b.t < u.to).map(b => b.t);
  const watchingRule = watchingMode(recipe.watching);
  const watching = tooMuchTooFast(plan.map(u => ({path: u.path, where: u.where, moments: momentsOf(u)})), WATCHING);
  if (watchingRule === 'refuse' && watching.length) throw new Error(`Too much, too fast (the recipe says watching: "refuse"): ${watching.slice(0, 3).map(watchingText).join('; ')}${watching.length > 3 ? `; and ${watching.length - 3} more` : ''}`);
  const shotsPlanned = plan.map(u => ({path: u.path, where: u.where, scene: u.scene, from: +u.from.toFixed(3), to: +u.to.toFixed(3), intent: u.intent, start: u.continuity?.start ?? null, end: u.continuity?.end ?? null, moments: distinctMoments(momentsOf(u)).length, ...u.questions, ...(u.ledger ? {ledger: u.ledger} : {})}));
  Object.assign(state, {watchingRule, watching, shotsPlanned});
}
