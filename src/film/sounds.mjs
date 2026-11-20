/**
 * Stage 26 of the compile: the sound design — quiet accents on the actions, a chime on the eurekas and the answer, each
 * kit's own sounds checked by name and gain, each entrance's sound — counted per scene the way the render mixes them;
 * the found sounds it names checked once (in the library, licence, file), so a film that cannot be rendered offline
 * refuses when it is built; and the listening check (about half the changes of picture silent). Its own stage because
 * sound decides no pixel: it reads the built film and hands the render its list.
 *
 * Reads: recipe, root, storyboard, timings, clock, story, storySpec, push, boardEnd, MOVE0, shots, stages,
 * stageKitNames, recapStage, teaser, guesses.
 * Writes: sounds, foundUsed, listening.
 */
import path from 'node:path';
import {checkSound, soundsByScene, MAX_SOUNDS_PER_SCENE, FOUND} from '../sound.mjs';
import {readLibrary, useFound, trimOf, foundFields} from '../found/index.mjs';
import {listeningMode, changeSounds, listeningText} from '../listening.mjs';

export function soundsStage(state) {
  const {recipe, root, storyboard, timings, clock, story, storySpec, push, boardEnd, MOVE0, shots, stages, stageKitNames, recapStage, teaser, guesses} = state;
  // Sound design: quiet accents on the actions, a chime on the eurekas and the answer. A kit's sounds are
  // checked by name and gain here (sound.mjs · checkSound), and keep their gain.
  const sounds = [];
  // A found sound (found/) keeps its name: {time, type: 'found', name, gain?}.
  // Each found sound remembers who asked for it, for a refusal of its trim to name (foundSoundsUsed).
  const askedBy = new Map();
  const add = (time, type, gain, found = {}, who = null) => {
    if (!(Number.isFinite(time) && time >= 0 && time < clock.total)) return;
    const sound = {time, type, ...(gain === undefined ? {} : {gain}), ...(type === FOUND ? foundFields(found) : {})};
    sounds.push(sound); if (type === FOUND && who) askedBy.set(sound, who);
  };
  const addKitSounds = (list, who) => { for (const s of list ?? []) { checkSound(s, who); add(s.time, s.type, s.gain, s, who); } };
  /** When a shot's entrance sounds: from the change's first moment, or later where its moment is (transitions.mjs · hitAt, hitAfter: cloudBurst's pop). */
  const soundTime = shot => shot.start - shot.enter.lead + (shot.enter.hitAfter ?? 0);
  addKitSounds(story.sounds, `the story kit "${storySpec.kit}"`);
  if (push) { add(boardEnd, 'slide'); add(MOVE0, 'slide'); }
  for (const shot of shots.slice(1)) {
    const s = shot.enter.sound;   // a sound's name, or a found sound {type: 'found', name, gain?} (transitions.mjs · entranceSound)
    if (s) add(soundTime(shot), s.type ?? s, s.gain, s, `stage ${(shot.stages[0] ?? stages.find(st => st.world === shot.world)).scene}'s entrance`);
  }
  for (const st of stages) {
    if (st.world) addKitSounds(st.world.instance.sounds, `the story kit "${st.world.kit}" (stage ${st.scene})`);
    for (const [, at] of st.reveal ?? []) add(at, 'tap');
    for (const item of st.listAt ?? []) add(item.t, 'tap');
    for (const k of st.cardsAt ?? []) add(k.t, 'settle');
    if (st.kit?.sounds) addKitSounds(st.kit.sounds(st.handle), `the stage kit "${stageKitNames[st.type]}" (stage ${st.scene})`);
  }
  if (recapStage) {
    for (const k of recapStage.keysAt.slice(1)) add(k.t, 'tap');
    if (teaser) { add(teaser.at + 1.2, 'settle'); add(teaser.at + 2.7, 'slide'); add(teaser.at + 3.6, 'slide'); add(teaser.at + 4.8, 'chime'); }
  }
  for (const g of guesses) { add(g.start, 'question'); if (g.answer) add(g.end, 'chime'); }
  sounds.sort((a, b) => a.time - b.time);
  checkSoundCounts(sounds, clock, storyboard, timings);
  // Found sounds (found/): each one used is checked once, here — in the library at <root>/sounds/sounds.json, its
  // record's own licence through the gate (CC BY-SA only with recipe.foundSounds.allowShareAlike), its file the record's
  // (size and sha256) — so a film that cannot be rendered offline refuses when it is built, naming the sounds add fix.
  const foundUsed = foundSoundsUsed(sounds, recipe.foundSounds, root, askedBy);
  // Listening (listening.mjs): about half the changes of picture silent, never the same cue twice running.
  const listeningRule = listeningMode(recipe.listening);
  const listening = push ? [] : changeSounds(shots.slice(1).map(shot => ({at: soundTime(shot), where: `stage ${(shot.stages[0] ?? stages.find(st => st.world === shot.world)).scene}`, sound: soundLabel(shot.enter.sound)})));
  if (listeningRule === 'refuse' && listening.length) throw new Error(`The sound asks too much of the ear (the recipe says listening: "refuse"): ${listening.slice(0, 3).map(listeningText).join('; ')}${listening.length > 3 ? `; and ${listening.length - 3} more` : ''}`);
  Object.assign(state, {sounds, foundUsed, listening});
}

/**
 * At most MAX_SOUNDS_PER_SCENE sounds in a scene, counted the way renderFilm mixes them (sound.mjs ·
 * soundsByScene), so the film refuses when it is built, not after every frame is encoded.
 */
function checkSoundCounts(sounds, clock, storyboard, timings) {
  soundsByScene(sounds, clock.offsets, timings.scenes.map(s => s.duration)).forEach((list, i) => {
    if (list.length <= MAX_SOUNDS_PER_SCENE) return;
    const kinds = Object.entries(Object.groupBy(list, e => e.type)).map(([type, l]) => `${type} ×${l.length}`).join(', ');
    throw new Error(`Scene "${storyboard.scenes[i].id}" has ${list.length} sounds (${kinds}); a scene takes at most ${MAX_SOUNDS_PER_SCENE}: make fewer (a kit's sounds count too), or spread them over more scenes`);
  });
}

/** A recipe's "foundSounds": {"allowShareAlike"?: true}, checked. */
function readFoundSounds(spec) {
  if (spec === undefined) return {allowShareAlike: false};
  if (!spec || typeof spec !== 'object' || Array.isArray(spec) || Object.keys(spec).some(k => k !== 'allowShareAlike') || (spec.allowShareAlike !== undefined && typeof spec.allowShareAlike !== 'boolean')) {
    throw new Error('recipe.foundSounds takes {"allowShareAlike": true} (CC BY-SA sounds too: they put the whole film under CC BY-SA), or is left out');
  }
  return {allowShareAlike: spec.allowShareAlike === true};
}
/** The found sounds a film's sounds name, each checked for use (found/library.mjs · useFound), in name order: [{name, file, record, root, allowShareAlike}]. */
function foundSoundsUsed(sounds, spec, root, askedBy = new Map()) {
  const {allowShareAlike} = readFoundSounds(spec), names = [...new Set(sounds.filter(s => s.type === FOUND).map(s => s.name))].sort();
  if (!names.length) return Object.freeze([]);
  const library = readLibrary(root);
  // Each keeps the film's root and the rule it was checked by, so the render checks it again the same way (render.mjs ·
  // mixFound) — through the root, never a folder guessed from the file's real path (sounds/ may be a link inside it).
  const at = path.resolve(root), used = names.map(name => Object.freeze({...useFound(at, name, {library, allowShareAlike}), root: at, allowShareAlike}));
  // Every trim inside its recording (found/record.mjs · trimOf), refused here, not after the frames are drawn.
  for (const s of sounds) {
    if (s.type !== FOUND) continue;
    try { trimOf(s, used.find(u => u.name === s.name).record); } catch (e) { throw new Error(`${askedBy.get(s) ?? `the found sound at ${s.time.toFixed(2)} s`}: ${e.message}`, {cause: e}); }
  }
  return Object.freeze(used);
}
/** A change's sound for the listening check: its name, or "found sound "<name>"" (listening.mjs compares and says them). */
const soundLabel = s => (s && typeof s === 'object' ? `found sound "${s.name}"` : s);
