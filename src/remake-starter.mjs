/**
 * A starter film from a remake plan (remake.mjs · remakePlan): the approved plan made into a film's inputs that render
 * as they are — an animatic in the reference's own rhythm — for a person to fill in. Each scene of the plan is a silent
 * scene of the storyboard (one direction, as long as the reference's scene) with a kinetic world on it (kits/kinetic):
 *
 *   kinetic   a card a shot, "WORD 1" …, each landing when the reference cuts to its shot, the ground and ink swapping
 *   title     one card, "TITLE"
 *   blank     the ground alone (a kinetic world with no words)
 *   montage   a grey card a shot, "PICTURE 1" …; a still, a camera move or a moving picture one grey card naming it — a
 *             film here cannot show a picture file yet, so the card stands in for the picture
 *
 * A run of more shots than a kinetic world takes (KINETIC.most) is scenes of its own, cut one to the next as the
 * reference cuts (scene-31, scene-31-2 …), so every cut is kept. The first scene is the film's story, each other a world
 * stage coming in as the plan says (`enter`); the recipe keeps the plan's pace. A scene's first ground is never the
 * ground before it, so every cut shows. Under music first the song times it — the plan's bars (`music.bars`, for
 * beatTimings) — and the cards land on the scene's beats, `every` apart.
 * Nothing is guessed: the words, the pictures and the song are listed as still to give, each with where it goes.
 */
import {DIRECTION_SECONDS} from './clock.mjs';
import {MUSIC} from './music.mjs';
import {BEATS} from './beats.mjs';
import {SCENE_KINDS, BURSTS, sceneTodo} from './remake.mjs';
import {KINETIC} from './kits/kinetic/index.mjs';
import {starterFiles, oneLine} from './remake-starter-files.mjs';

/** The starter's two families of cards: [ground, ink]. Words on the kinetic kit's own; a picture to come on grey. */
export const STARTER = Object.freeze({words: Object.freeze(['#f3eee3', '#1a1a1a']), pictures: Object.freeze(['#4a525c', '#e8ebee'])});

/** Each kind's direction in the storyboard (what the studio shows while the scene plays) and its card. */
const DIRECTION = Object.freeze({kinetic: 'words land', montage: 'pictures cut', blank: 'plain ground', title: 'a title', still: 'a still picture', camera: 'a camera move', moving: 'a moving picture'});
const CARD = Object.freeze({title: 'TITLE', still: 'PICTURE', camera: 'CAMERA MOVE', moving: 'MOVING PICTURE'});
const PICTURED = Object.freeze(['montage', 'still', 'camera', 'moving']);
const GIVES = Object.freeze(['words', 'pictures', 'split', 'song', 'tempo', 'beats', 'timing']);

const round = v => +v.toFixed(3);
const PLAN = 'remakePlan\'s plan (storyreel remake --json, or remakePlan(spec))';

/** The plan, checked as far as the starter reads it: each refusal names the fix. */
function readPlan(plan) {
  const who = 'remakeStarter';
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error(`${who}: give ${PLAN}`);
  if (!Array.isArray(plan.scenes) || !plan.scenes.length) throw new Error(`${who}: give ${PLAN}; its scenes are a list of one scene or more`);
  if (typeof plan.pace?.name !== 'string' || typeof plan.music?.verdict !== 'string' || typeof plan.from?.file !== 'string') throw new Error(`${who}: give ${PLAN}; it names its pace, its music and the file it was made from`);
  if (plan.todo !== undefined && !(Array.isArray(plan.todo) && plan.todo.every(t => t && GIVES.includes(t.give) && typeof t.what === 'string' && (t.scene === undefined || typeof t.scene === 'string'))))
    throw new Error(`${who}: its todo is a list of {scene?, give, what}, each give one of ${GIVES.join(', ')}, as remakePlan writes it`);
  const beats = plan.music.verdict === 'music-first', ids = new Set();
  plan.scenes.forEach((x, i) => {
    const at = `${who}: scenes[${i}]`;
    if (typeof x?.id !== 'string' || !/^[\w-]+$/.test(x.id) || x.id === '__proto__' || ids.has(x.id)) throw new Error(`${at} needs an id of its own, letters, digits, - and _ ("scene-01"), not ${JSON.stringify(x?.id)}`);
    ids.add(x.id);
    if (!SCENE_KINDS.includes(x.kind)) throw new Error(`${at} (${x.id}): its kind is one of ${SCENE_KINDS.join(', ')}, not ${JSON.stringify(x.kind)}`);
    if (![x.from, x.to, x.seconds].every(Number.isFinite) || !(x.to > x.from) || Math.abs(x.seconds - (x.to - x.from)) > 1e-3) throw new Error(`${at} (${x.id}): from, to and seconds are its time in the reference, from before to, seconds the time between`);
    if (!Array.isArray(x.shots) || !x.shots.length || !Array.isArray(x.starts) || x.starts.length !== x.shots.length) throw new Error(`${at} (${x.id}): its shots and when each starts (starts) are lists of one length — make the plan again (storyreel remake): a plan made before 0.25.0 has no starts`);
    x.starts.forEach((t, k) => { if (!(Number.isFinite(t) && t >= x.from && t < x.to && (k === 0 || t > x.starts[k - 1]))) throw new Error(`${at} (${x.id}): starts[${k}] is when its shot starts, in order, inside the scene (${x.from}–${x.to} s), not ${JSON.stringify(t)}`); });
    if (beats && !(Number.isInteger(x.bars) && x.bars >= 1 && x.bars <= MUSIC.mostBars)) throw new Error(`${at} (${x.id}): the song times this film, so each scene has its bars, a whole number 1–${MUSIC.mostBars}, not ${JSON.stringify(x.bars)}`);
    if (beats && x.every !== undefined && !(Number.isInteger(x.every) && x.every >= 1 && x.every <= MUSIC.mostEvery)) throw new Error(`${at} (${x.id}): every is the beats between two cards, a whole number 1–${MUSIC.mostEvery}, not ${JSON.stringify(x.every)}`);
  });
  return {plan, beats, ids};
}

/**
 * A plan scene as the starter's scenes: one; or a run of more shots than a kinetic world takes, in parts of at most
 * KINETIC.most shots, each a scene from its first shot to the next part's (the reference cuts there). Each part: {id,
 * from, seconds, starts, first (its first shot's place in the run)}. Under music first each part's bars: enough for its
 * cards `every` beats apart, the last the rest of the plan's bars.
 */
function partsOf(x, beats) {
  const n = x.shots.length;
  if (!BURSTS.includes(x.kind) || n <= KINETIC.most) return [{id: x.id, from: x.from, seconds: x.seconds, starts: x.starts, first: 0, ...(beats ? {bars: x.bars} : {})}];
  const count = Math.ceil(n / KINETIC.most), size = Math.ceil(n / count), every = x.every ?? 1;
  const parts = Array.from({length: count}, (_, k) => {
    const first = k * size, starts = x.starts.slice(first, first + size), next = x.starts[first + size] ?? x.to;
    return {id: k ? `${x.id}-${k + 1}` : x.id, from: starts[0], seconds: round(next - starts[0]), starts, first};
  });
  if (beats) {
    const need = part => Math.ceil(part.starts.length * every / BEATS.meter);
    parts.forEach((part, k) => { part.bars = k < count - 1 ? need(part) : Math.max(need(part), x.bars - parts.slice(0, -1).reduce((sum, p) => sum + p.bars, 0)); });
  }
  return parts;
}

/** A part's cards: one a shot for a run (numbered through the whole run), one for a held shot, none for plain ground. */
function cardsOf(x, part) {
  if (x.kind === 'blank') return [];
  if (BURSTS.includes(x.kind)) return part.starts.map((_, k) => `${x.kind === 'kinetic' ? 'WORD' : 'PICTURE'} ${part.first + k + 1}`);
  return [CARD[x.kind]];
}

/**
 * A scene's directions: its seconds (held to the 0.2 s a direction takes at least), in parts of at most 20 s, the first
 * named for the kind and the rest its parts — whose sum is the scene's time.
 */
function directionsOf(kind, seconds) {
  const [least, most] = DIRECTION_SECONDS, held = Math.max(least, round(seconds)), parts = Math.ceil(held / most), each = round(held / parts);
  return Array.from({length: parts}, (_, k) => [k ? `${DIRECTION[kind]}, part ${k + 1}` : DIRECTION[kind], k < parts - 1 ? each : round(held - each * (parts - 1))]);
}

/** The colours of a scene's cards: its family's pair, turned so its first ground is not the ground before it. */
const colorsOf = (family, before) => (family[0] === before ? [family[1], family[0]] : [...family]);
/** The ground a scene ends on: its first, or the other after an even count of cards that flip. */
const lastGround = (colors, cards, flip) => (flip && cards > 0 && cards % 2 === 0 ? colors[1] : colors[0]);

/** Where the n-th scene's cards are in recipe.json: the first scene is the story, the rest stages. */
const placeOf = n => (n === 0 ? 'story.words' : `stages[${n - 1}].world.words`);
/** Cards named in a sentence: "WORD 1", "WORD 1" and "WORD 2", "WORD 1" … "WORD 5". */
const cardsText = cards => (cards.length < 3 ? cards.map(c => `"${c}"`).join(' and ') : `"${cards[0]}" … "${cards.at(-1)}"`);

/**
 * What a plan scene still needs and where it goes: its words in place of its cards; a picture not yet (the card stands
 * in). What it needs is the plan's own words (remake.mjs · sceneTodo, which a plan made by hand may leave out); `place`
 * is where its first cards are in recipe.json.
 */
function sceneGive(plan, x, made, beats) {
  const cards = made.flatMap(m => m.cards), n = cards.length, give = x.kind === 'kinetic' || x.kind === 'title' ? 'words' : PICTURED.includes(x.kind) ? 'pictures' : null;
  if (!give) return null;
  const what = plan.todo?.find(t => t.scene === x.id && t.give === give)?.what ?? sceneTodo({id: x.id, kind: x.kind, words: x.shots.length})[0].what;
  const parts = made.length > 1 ? ` (in ${made.length} scenes: ${made.map(m => m.id).join(', ')})` : '';
  const where = give === 'words' ? `In recipe.json, its words${parts}: in place of ${cardsText(cards)}${n < 2 ? '' : beats ? ' (they land on its beats, in order)' : ', each keeping its at (when the reference cuts to its shot)'}`
    : `Not yet: a film here cannot show a picture file, so ${n > 1 ? `its grey cards${parts} stand` : 'its grey card stands'} in`;
  return {scene: x.id, give, what, where, place: placeOf(made[0].n)};
}

/** Where the film's own needs go, as sentences: the song beside the config, the beats or tempo through the breakdown, the timing for now the reference's. */
const FILM_WHERE = Object.freeze({
  song: 'Put it at song.wav beside storyreel.config.mjs, or name it (--song <file>; --bpm <n> when its tempo is unsure)',
  tempo: 'Then make the starter again: storyreel remake <the breakdown\'s folder> --starter <a new folder>',
  beats: 'Then make the starter again: storyreel remake <the breakdown\'s folder> --starter <a new folder>',
  timing: 'For now each scene lasts its direction in storyboard.json, the reference\'s own time. A voice times it instead: give each scene its narration in place of its directions, then in storyreel.config.mjs name the voice\'s folder (narrationDir) and take out timings',
  split: 'In the bars (BARS in storyreel.config.mjs), and the scenes in storyboard.json and recipe.json',
});

/**
 * The starter for a remake plan: {storyboard, recipe, music: {bars} | null (beatTimings' bars, under music first), give:
 * [{scene?, give, what, where, place?}] (place: where a scene's first cards are in recipe.json), notes (what the starter
 * does not make), files: {name: text}} — the storyboard, recipe, plan, storyreel.config.mjs, render.mjs and README.md
 * of a folder that renders as it is (storyreel remake --starter).
 */
export function remakeStarter(given, {title} = {}) {
  const {plan, beats, ids} = readPlan(given);
  if (title !== undefined && !(typeof title === 'string' && title.trim())) throw new Error(`remakeStarter: title is the film's, some words, not ${JSON.stringify(title)}`);
  let before = null, n = 0;
  // Each plan scene, made: its parts, each a scene of the starter with its cards and its world.
  const scenes = plan.scenes.map(x => ({x, made: partsOf(x, beats).map((part, k) => {
    if (k && ids.has(part.id)) throw new Error(`remakeStarter: ${x.id} is split into scenes of at most ${KINETIC.most} cards, and the plan already has a scene ${part.id}: rename that one`);
    const cards = cardsOf(x, part), flip = BURSTS.includes(x.kind), colors = colorsOf(PICTURED.includes(x.kind) ? STARTER.pictures : STARTER.words, before);
    const silent = directionsOf(x.kind, part.seconds), enter = k ? 'cut' : x.enter;
    before = lastGround(colors, cards.length, flip);
    const words = beats ? cards : cards.map((text, c) => ({text, at: [part.id, silent[0][0], round(part.starts[c] - part.from)]}));
    const world = {kit: 'kinetic', scene: part.id, words, colors, ...(flip ? {flip: true} : {}), ...(beats && cards.length ? {on: 'beats', ...(cards.length > 1 && x.every ? {every: x.every} : {})} : {})};
    return {id: part.id, n: n++, cards, silent, enter, world, bars: part.bars};
  })}));
  const all = scenes.flatMap(s => s.made), [first, ...rest] = all;
  const storyboard = {title: title?.trim() ?? `Like ${oneLine(plan.from.file)}`, scenes: scenes.flatMap(({x, made}) => made.map(m => ({id: m.id, title: x.kind, silent: m.silent})))};
  const recipe = {pace: plan.pace.name, story: first.world, stages: rest.map(m => ({type: 'world', scene: m.id, ...(m.enter ? {enter: m.enter} : {}), world: m.world}))};
  const film = (plan.todo ?? []).filter(t => !t.scene || t.give === 'split').map(t => ({...t, where: Object.hasOwn(FILM_WHERE, t.give) ? FILM_WHERE[t.give] : 'As the plan says'}));
  const give = [...scenes.map(({x, made}) => sceneGive(plan, x, made, beats)).filter(Boolean), ...film];
  const held = plan.scenes.filter(x => x.seconds < DIRECTION_SECONDS[0]), flashes = plan.scenes.reduce((sum, x) => sum + (x.flashes?.length ?? 0), 0);
  const notes = [...(held.length ? [`Held ${DIRECTION_SECONDS[0]} s, the least a scene lasts here: ${held.map(x => x.id).join(', ')} (in the reference, shorter), so every cut after ${held.length === 1 ? 'it' : 'each'} comes later by the difference`] : []),
    ...(flashes ? [flashes === 1 ? 'The flash the plan lists is not made: add it as a card of its own if you want it' : `The ${flashes} flashes the plan lists are not made: add them as cards of their own if you want them`] : [])];
  const music = beats ? {bars: Object.fromEntries(all.map(m => [m.id, m.bars]))} : null;
  const starter = {storyboard, recipe, music, give, notes};
  return {...starter, files: starterFiles(plan, starter)};
}
