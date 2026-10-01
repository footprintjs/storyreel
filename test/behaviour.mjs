/**
 * Behaviour pins for the example films: what a film decides that its pixels never show — the lines
 * too short to read (film.reading), the stills (film.moments()), and what the push check
 * (notes.mjs · placePushes) answers to one push note laid across each change of picture. They make a
 * refactor of the timings behind them (film.mjs · arrivalOf, pictureChanges) safe: any change shows.
 * `node test/behaviour.mjs --write` records test/behaviour.json; behaviour.test.mjs compares against it.
 * Re-record only for an intended change, and say so in the commit. No fonts are involved: the pins
 * hold on every machine.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {speechIndex, phraseMatches} from '../src/index.mjs';
import {normSpeech} from '../src/clock.mjs';
import {FILMS, compileExample} from './golden.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = (name, file) => JSON.parse(readFileSync(fileURLToPath(new URL(`../examples/${name}/${file}`, import.meta.url)), 'utf8'));
const round = t => +t.toFixed(3);

/** Every spoken word on the film's clock: {t (film seconds), ref} — a ref the clock resolves to exactly that word. */
function spokenWords(film, storyboard) {
  return storyboard.scenes.flatMap((scene, i) => {
    const timing = film.timings.scenes[i], index = speechIndex(scene, timing);
    return timing.words.filter(w => normSpeech(w.text)).map(w => {
      const nth = phraseMatches(index, w.text).findIndex(m => m.start === w.start);
      return {t: film.clock.offsets[i] + w.start, ref: {scene: scene.id, phrase: w.text, nth}};
    });
  });
}

/** Where the picture changes: each change half way (film.moments(), its own pushes left out), and each scene's start (a cut is there). */
function pictureChanges(film, storyboard) {
  const moving = film.moments().filter(m => m.kind === 'moving' && !m.label.startsWith('mid push:')).map(m => ({t: m.t, what: m.label}));
  const starts = storyboard.scenes.slice(1).map(sc => ({t: film.clock.start(sc.id), what: `start of ${sc.id}`}));
  return [...moving, ...starts].sort((a, b) => a.t - b.t);
}

/** One push note from the last word before `t` to the first word after it: what the film says to it. */
async function pushAcross(name, recipe, words, change) {
  const before = words.findLast(w => w.t < change.t), after = words.find(w => w.t > change.t);
  if (!before || !after) return {across: change.what, at: round(change.t), says: 'no spoken word on both sides'};
  const note = {note: `push across ${change.what}`, push: {at: [800, 450], from: before.ref, to: after.ref}};
  let says = 'accepted';
  try { await compileExample(name, {recipe: {...recipe, notes: [...(recipe.notes ?? []), note]}}); } catch (e) { says = e.message; }
  return {across: change.what, at: round(change.t), from: before.ref, to: after.ref, says};
}

/** One film's behaviour: {reading, moments, pushes}. */
export async function behaviourOf(name) {
  const film = await compileExample(name), storyboard = read(name, 'storyboard.json'), recipe = read(name, 'recipe.json');
  const words = spokenWords(film, storyboard), pushes = [];
  for (const change of pictureChanges(film, storyboard)) pushes.push(await pushAcross(name, recipe, words, change));
  return {reading: film.reading, moments: film.moments().map(m => ({...m, t: round(m.t)})), pushes};
}

/** Every example film's behaviour, by name. */
export async function behaviours() {
  const out = {};
  for (const name of Object.keys(FILMS)) out[name] = await behaviourOf(name);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  writeFileSync(here + 'behaviour.json', JSON.stringify(await behaviours(), null, 1) + '\n');
  console.log('pinned', here + 'behaviour.json');
}
