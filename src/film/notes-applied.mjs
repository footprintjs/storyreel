/**
 * Stage 23 of the compile: the director's notes as applied, in the order written — a camera speed (and what it did to
 * the push-in and the worlds), each cut and the hand-over or entrance it replaced, each push where it landed — so the
 * making-of record says what each note changed. Its own stage because it only reports: it reads what the stages
 * before it decided and changes nothing.
 *
 * Reads: notes, push, TURN, worldKits, stages, pushes, recipe.
 * Writes: notesApplied.
 */

export function notesAppliedStage(state) {
  const {notes, push, TURN, worldKits, stages, pushes, recipe} = state;
  // The notes as applied, in the order written: the making-of record says what each one changed.
  const applied = new Map();
  if (notes.speedNote) applied.set(notes.speedNote, {note: notes.speedNote.note, speed: notes.speed, ...(push ? {pushIn: {seconds: +TURN.toFixed(3), was: push.turn ?? 1}} : {}), worlds: [...worldKits], pushes: pushes.length});
  for (const st of stages) if (st.cutNote) applied.set(st.cutNote, {note: st.cutNote.note, cut: st.scene, at: +st.start.toFixed(3), was: st.cutWas});
  for (const p of pushes) applied.set(p.given, {note: p.note, push: {at: p.at, zoom: p.zoom, ...(p.on ? {on: p.on, size: p.size} : {})}, from: +p.a.toFixed(3), to: +p.b.toFixed(3), seconds: +p.seconds.toFixed(3)});
  const notesApplied = (recipe.notes ?? []).map(n => applied.get(n));
  state.notesApplied = notesApplied;
}
