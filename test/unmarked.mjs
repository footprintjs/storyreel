/**
 * Films without marks are read as before (script.mjs: a narration with no {name} or {@who} is said exactly as written):
 * what every reader of a scene's words gives for the example films and for scenes with number slots, speakers and
 * anchors — the voiced cut's holds too (planHolds, over a voice made of the word times) — each hashed. `node test/unmarked.mjs --write` records test/fixtures/unmarked.json — recorded from 0.20.1, the
 * last release before marks — and unmarked.test.mjs holds the code to it. Re-record only for an intended change, and
 * say so in the commit. Times and text only: no fonts are involved, so the pins hold on every machine.
 */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {evenTimings, paceTimings, makeClock, spokenText, sceneText, unsaidNumbers, compileFilm} from '../src/index.mjs';
import {checkPhrase, anchorsText} from '../src/anchors.mjs';
import {planHolds} from '../src/pacing.mjs';
import {FILMS, compileExample} from './golden.mjs';

export const PINS = fileURLToPath(new URL('./fixtures/unmarked.json', import.meta.url));
const read = (name, file) => JSON.parse(readFileSync(fileURLToPath(new URL(`../examples/${name}/${file}`, import.meta.url)), 'utf8'));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
/** What a reason gives, or the words of its refusal: a refusal is an output too. */
const said = f => { try { return f(); } catch (e) { return {refused: e.message}; } };

/** Every reading of a clock: each scene's words and captions, and every word as a phrase — at, its end, plus, nth, the pause after it, its places. */
function clockReads(storyboard, clock) {
  return storyboard.scenes.map((scene, i) => ({
    words: clock.words(scene.id), shown: clock.shownWords(i), turns: i ? undefined : clock.turns(),
    phrases: clock.words(scene.id).map(w => ({
      at: said(() => clock.at([scene.id, w.text, .25])), end: said(() => clock.at({scene: scene.id, phrase: w.text, edge: 'end', nth: 0})),
      pause: said(() => clock.pauseAfter([scene.id, w.text])), places: clock.places(scene.id, w.text)})),
  }));
}

/** A voice for a scene's timing: a tone while each word is said, silence between (where a voiced cut puts a hold). */
const voiceOf = (timing, rate = 8000) => ({rate, samples: Int16Array.from({length: Math.round(timing.duration * rate)},
  (_, i) => (timing.words.some(w => i / rate >= w.start && i / rate < w.end) ? Math.round(6000 * Math.sin(i / 3)) : 0))});

/** One storyboard read every way, without a film: its text, its even and paced timings, its clock, and where a voiced cut holds. */
function readings(storyboard, pacing = null) {
  const even = evenTimings(storyboard), paced = pacing ? paceTimings(storyboard, even, pacing) : null;
  const voiced = pacing ? storyboard.scenes.map((scene, i) => (scene.silent ? null : said(() => planHolds(scene, even.scenes[i], pacing.holds, voiceOf(even.scenes[i]))))) : null;
  return {spoken: storyboard.scenes.map(s => (s.narration === undefined ? null : spokenText(s))), text: storyboard.scenes.map(s => sceneText(s)),
    unsaid: unsaidNumbers(storyboard), even, paced, clock: clockReads(storyboard, makeClock(storyboard, paced ?? even)), ...(voiced ? {voiced} : {})};
}

/** Scenes beside the examples: number slots, a speaker and a word's own speaker, a silent opening, phrases said more than once. */
const SCENES = {
  slots: {scenes: [{id: 'frame', narration: 'One frame takes 16.67 ms, at 60 Hz. In 1868 it was 24.', say: [['16.67 ms', 'sixteen point six seven milliseconds'], ['60 Hz', 'sixty hertz']]}]},
  speakers: {scenes: [{id: 'open', silent: [['the door opens', 1], ['Mia walks in', 2]]}, {id: 'ask', speaker: 'mia', narration: 'What are you two up to? Tell me, tell me now.'},
    {id: 'answer', narration: "Mom! I can add big numbers now. That's what we do."}]},
  anchors: {scenes: [{id: 'add', narration: 'The party dresses: one ten and two ones. The uniforms: one ten and five ones. One ten, two tens!'},
    {id: 'seal', narration: 'Then he seals the tokens in a clay envelope, so the count stays safe.'}]},
};

/** Every pin, by name: {name: hash}. */
export async function unmarkedPins() {
  const pins = {};
  for (const name of Object.keys(FILMS)) {
    const storyboard = read(name, 'storyboard.json'), pacing = FILMS[name].pacing ? read(name, FILMS[name].pacing) : null, film = await compileExample(name);
    pins[`${name} · readings`] = hash(readings(storyboard, pacing));
    pins[`${name} · film`] = hash({total: film.total, beats: film.beats, timings: film.timings, anchors: film.anchors, clock: clockReads(storyboard, film.clock)});
  }
  for (const [name, storyboard] of Object.entries(SCENES)) pins[`${name} · readings`] = hash(readings(storyboard, {sceneTail: .8, holds: [{scene: storyboard.scenes.at(-1).id, after: storyboard.scenes.at(-1).narration.split(' ')[1], seconds: 1.2}]}));
  // The anchors, noted by a compile and said as text: not said, said more than once, past the last place, no such scene.
  const {anchors} = SCENES, timings = evenTimings(anchors), clock = makeClock(anchors, timings);
  const refs = [['add', 'two tens'], ['add', 'One ten'], ['seal', 'he keeps them in one clay envelope', .5], {scene: 'add', phrase: 'one ten', nth: 7}, ['nowhere', 'x']];
  const kit = {name: 'beats', story: {compile: (spec, c) => { for (const b of spec.beats) c.at(b); return {hang: 1, draw() {}}; }}};
  const film = await compileFilm({storyboard: anchors, timings, recipe: {story: {kit: 'beats', beats: refs}}, kits: [kit], anchors: 'note'});
  pins['anchors · noted'] = hash({checks: refs.map(r => checkPhrase(clock, r)), noted: film.anchors, beats: film.beats, text: anchorsText({clock: film.clock, notes: film.anchors, checked: refs.length})});
  return pins;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  writeFileSync(PINS, `${JSON.stringify(await unmarkedPins(), null, 1)}\n`);
  console.log('pinned', PINS);
}
