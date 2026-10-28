// The automatic director (director.mjs): it reads the script — sentences, speakers, how each ends, the moments — and
// what each picture names, and proposes camera framing keys and acting moods as ordinary recipe keys, each with the rule
// behind it. Its own rules are neutral (end marks only); rules with words are data, per language. Explicit recipe keys
// always win, and a film with the director off (or without one) is the film exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings, frameHashes, makeFilm, makeClock, withDirections} from '../src/index.mjs';
import {planPieces} from '../src/segments/plan.mjs';
import {segmentKey} from '../src/segments/material.mjs';
import {focusTarget} from '../src/follow.mjs';
import {asDirected} from '../src/director/land.mjs';
import {direct, readRules, matchLine, readDirector, NEUTRAL_RULES, wordsOf, endOf} from '../src/director.mjs';
import {readScene} from '../src/director/sentences.mjs';
import {moodAt} from '../src/acting.mjs';
import {tempDir} from './tmp.mjs';

// Two people in a hall; who says each line is written in the narration ({@who}), the moments where the beats land.
const storyboard = {title: 'The key', scenes: [
  {id: 'hall', narration: 'Mia waits in the hall. {ask}{@sam}"Where did you put the key?" {@mia}"I have no idea!" {look}The lamp is on. {@sam}"Here it is!"'},
  {id: 'door', narration: '{try}Mia tries the door. {@mia}"It opens!" Sam laughs.'},
]};
const timings = evenTimings(storyboard, {wordSeconds: 1});
const BOXES = {mia: [100, 300, 400, 850], 'mia.face': [190, 300, 310, 420], sam: [1100, 300, 1400, 850], 'sam.face': [1190, 300, 1310, 420], lamp: [700, 200, 820, 500]};
const regions = Object.entries(BOXES).map(([name, box]) => ({box, path: `names.${name}`, label: name, name}));
const MOODS = ['calm', 'surprised', 'unsure', 'thinking'];
/** What each compile of the room kit was given (the director's keys land in its spec), newest last. */
const compiled = [];
/**
 * A room that frames by name and acts faces, and says so (`direction`): its camera keys [{at, on, size?}] are checked
 * against what it names, its moods are acted (moodAt), and the frame draws the zoom of the key in force — so a key that
 * landed changes pixels.
 */
const room = {name: 'room', story: {direction: {camera: 'camera', acting: 'acting', moods: MOODS, rest: 'calm'}, compile(spec, clock) {
  compiled.push(spec);
  const camera = (spec.camera ?? []).map(k => {
    if (k.on !== 'wide' && !BOXES[k.on]) throw new Error(`room: nothing is called "${k.on}"`);
    return {t: clock.at(k.at), z: k.on === 'wide' ? 1 : {medium: 1.3, close: 1.8, insert: 2.4}[k.size ?? 'medium']};
  });
  const acting = Object.fromEntries(Object.entries(spec.acting ?? {}).map(([who, keys]) => [who, keys.map(k => ({at: clock.at(k.at), mood: k.mood}))]));
  for (const keys of Object.values(acting)) moodAt([{at: -1, mood: 'calm'}, ...keys], 0);
  return {hang: 1, regionsAt: () => regions, draw(c, t) {
    const z = camera.findLast(k => t >= k.t)?.z ?? 1;
    c.fillStyle = '#d8e2cf'; c.fillRect(0, 0, 1600, 900);
    c.save(); c.translate(800, 450); c.scale(z, z); c.translate(-800, -450);
    for (const [name, [x0, y0, x1, y1]] of Object.entries(BOXES)) { c.fillStyle = name.includes('.') ? '#e8b28a' : name === 'lamp' ? '#f0c419' : '#3d5a80'; c.fillRect(x0, y0, x1 - x0, y1 - y0); }
    c.restore();
  }};
}}};
/** The same room with no direction: what it names is framed by the film's own focus. */
const plain = {name: 'plain', story: {compile: () => ({hang: 1, regionsAt: () => regions, draw: c => { c.fillStyle = '#d8e2cf'; c.fillRect(0, 0, 1600, 900); }})}};
const film = (recipe, options = {}) => compileFilm({storyboard, timings, recipe: {story: {kit: 'room'}, ...recipe}, kits: [room, plain], ...options});
const said = k => [k.at, k.on ?? k.mood, k.size ?? null, k.rule];

test('the rule patterns: … stands for any words, the end mark counts, words are whole, case and quotes do not', () => {
  const table = readRules({lang: 'en', rules: {lang: 'en', moods: [
    {name: 'unsure', when: ['I have no idea…', '…not sure…'], mood: 'unsure'},
    {name: 'why', when: ['Why…?'], mood: 'thinking'},
    {name: 'yes', when: ['Yes!'], mood: 'surprised'}]}});
  const mood = line => matchLine(line, table).mood?.name ?? null;
  assert.equal(mood('"I have no idea!"'), 'unsure');
  assert.equal(mood('I’m not sure, really.'), 'unsure', '’ reads as \' and a pattern may stand in the middle');
  assert.equal(mood('Why is the sky blue?'), 'why');
  assert.equal(mood('Why is the sky blue.'), null, 'a pattern ending with ? asks for a question');
  assert.equal(mood('Whyever not?'), null, 'words are whole: Why never matches Whyever');
  assert.equal(mood('YES!'), 'yes');
  assert.equal(mood('Yes, of course!'), null, '"Yes!" is exactly that line');
  assert.deepEqual(wordsOf('“I can’t,” she said.'), ["i", "can't", 'she', 'said']);
  assert.equal(endOf('"Is it?"'), '?');
  assert.equal(endOf('Ten oranges for your party,'), null);
  assert.equal(endOf('それは何？'), '?', 'a full-width mark is the same mark');
});

test('the neutral rules are end marks only: a question or an exclamation frames the speaker close, in any language', () => {
  const neutral = readRules();
  assert.deepEqual(neutral.source, ['neutral']);
  assert.deepEqual(NEUTRAL_RULES.moods, [], 'no mood comes from words in the library: those rules are the film\'s data');
  for (const [line, rule] of [['Where is it?', 'question'], ['¿Dónde está?', 'question'], ['¡Qué bien!', 'exclamation'], ['これだ！', 'exclamation'], ['Here it is.', null]])
    assert.equal(matchLine(line, neutral).shot?.name ?? null, rule, line);
  assert.deepEqual(neutral.guess, ['thinking']);
});

test('rules read in order: the recipe\'s, then the application\'s for the language, then the neutral; null takes a line out', () => {
  const app = {en: {lang: 'en', shots: [{name: 'aside', when: ['By the way…'], shot: null}], moods: [{name: 'wow', when: ['Wow…!'], mood: 'surprised'}]}};
  const recipe = {moods: [{name: 'wow-mine', when: ['Wow, look…!'], mood: ['delighted', 'surprised']}]};
  const table = readRules({lang: 'en-GB', rules: recipe, tables: app});
  assert.deepEqual(table.source, ['the recipe', 'the application\'s "en" table', 'neutral'], 'the application\'s table is found by the primary subtag');
  assert.equal(matchLine('Wow, look at that!', table).mood.name, 'wow-mine', 'the recipe\'s rule is read first');
  assert.equal(matchLine('Wow!', table).mood.name, 'wow');
  const aside = matchLine('By the way, is it late?', table).shot;
  assert.equal(aside.name, 'aside'); assert.equal(aside.shot, null, 'a rule with no shot takes the question out of the neutral rule\'s hands');
  assert.deepEqual(readRules({lang: 'fr', tables: app}).source, ['neutral'], 'a language with no table of its own is directed by the neutral rules');
});

test('a rule table in another language, chosen by the film\'s language: its own words, and the neutral end marks', () => {
  const tables = {es: {lang: 'es', moods: [{name: 'sorpresa', when: ['Oh…!'], mood: 'surprised'}]}};
  // (In “…” quotes: a straight " before ¡ or ¿ reads as a closing quote to the script, script.mjs · CLOSES.)
  const board = {scenes: [{id: 'casa', narration: 'Ana abre la caja. {@ana}“¡Oh, la llave!” {@leo}“¿Dónde estaba?”'}]};
  const es = direct({storyboard: board, lang: 'es', rules: tables, rest: 'calm'}), en = direct({storyboard: board, lang: 'en', rules: tables});
  assert.deepEqual(es.acting, {ana: [{at: ['casa', 'Oh'], mood: 'surprised'}, {at: ['casa', 'Dónde'], mood: 'calm'}]}, 'its words, in its language: "¡Oh, la llave!" surprises Ana, until Leo speaks');
  assert.deepEqual(en.acting, {}, 'the Spanish words are not read for a film in English');
  assert.deepEqual(es.focus.keys.map(k => k.on), ['ana.face', ['ana', 'leo']], 'the neutral rules frame the exclamation in Spanish too, and Leo\'s answer frames the two');
  assert.deepEqual(en.rules, ['neutral']); assert.deepEqual(es.rules, ['the application\'s "es" table', 'neutral']);
});

test('the script as the director reads it: sentences, who says each ({@who} lines), the moment or the words that name it', () => {
  const read = readScene(storyboard.scenes[0], 0);
  assert.deepEqual(read.sentences.map(s => [s.speaker, s.end, s.at]), [
    [null, '.', ['hall', 'Mia']],
    ['sam', '?', ['hall', '{ask}']],
    ['mia', '!', ['hall', 'I']],
    [null, '.', ['hall', '{look}']],
    ['sam', '!', ['hall', 'Here']]]);
  // With the voice's timings the words carry their speaker (the voice step writes it) and every sentence its time.
  const voiced = structuredClone(timings.scenes[0]);
  voiced.words.forEach((w, k) => { if (k >= 5 && k < 11) w.speaker = 'sam'; });
  const timed = readScene({id: 'hall', narration: said0()}, 0, {timing: voiced, offset: 10});
  assert.equal(timed.sentences[1].speaker, 'sam'); assert.equal(timed.sentences[1].t, 10 + voiced.words[5].start);
  // A sentence said twice is named by its words with nth.
  const twice = readScene({id: 'x', narration: 'Look up. Look up. Then look down.'}, 0);
  assert.deepEqual(twice.sentences.map(s => s.at), [{scene: 'x', phrase: 'Look up', nth: 0}, {scene: 'x', phrase: 'Look up', nth: 1}, ['x', 'Then']]);
});
/** The hall's narration with no speaker tags (the voice's timings say who speaks). */
function said0() { return 'Mia waits in the hall. {ask}"Where did you put the key?" "I have no idea!" {look}The lamp is on. "Here it is!"'; }

test('proposals on a script: the establishing shot, a close-up, a two-shot when the other answers, an insert, wide on a new scene', () => {
  const d = direct({storyboard, timings, names: Object.keys(BOXES)});
  assert.deepEqual(d.proposals.filter(p => p.kind === 'camera').map(said), [
    [['hall', '{ask}', -.2], 'sam.face', 'close', 'line'],        // a question: the speaker's face, just before the words
    [['hall', 'I', -.2], ['sam', 'mia'], 'medium', 'exchange'],   // Mia answers at once: the two of them
    [['hall', '{look}', -.2], 'lamp', 'insert', 'insert'],        // a thing the narration names, on its sentence
    [['hall', 'Here', -.2], 'sam.face', 'close', 'line'],         // Sam's next turn, still within the scene's budget
    [['door', '{try}'], 'wide', null, 'scene'],                   // a new scene in the same picture opens wide
    [['door', 'It', -.2], 'mia.face', 'close', 'line'],
    [['door', 'Sam', -.2], 'sam', 'medium', 'person']]);          // the narration names someone the picture draws
  assert.ok(d.dropped.some(x => x.on === 'mia' && x.why === 'held: a new picture keeps its establishing wide shot through its first sentence'), '"Mia waits in the hall." opens the picture: it stays wide');
  assert.deepEqual(d.focus, {strategy: 'camera', keys: d.proposals.filter(p => p.kind === 'camera').map(p => ({at: p.at, on: p.on, ...(p.size ? {size: p.size} : {})}))}, 'the keys are the focus a recipe writes');
  for (const p of d.proposals) assert.ok(p.said && p.rule && Number.isFinite(p.t), 'each proposal keeps its sentence, its rule and its time');
  // Back to medium after a close-up; when the other one answers, a two-shot that holds while they go back and forth.
  const talkBoard = {scenes: [{id: 's', narration: 'Night falls. {@ann}"Is it late?" {@ann}"I think so." {@bo}"Yes, it is!" {@ann}"Then we go!"'}]};
  const talkTimes = evenTimings({scenes: [{id: 's', narration: 'Night falls. Is it late? I think so. Yes, it is! Then we go!'}]}, {wordSeconds: 1});
  const talk = direct({storyboard: talkBoard, names: ['ann', 'ann.face', 'bo', 'bo.face'], timings: talkTimes});
  assert.deepEqual(talk.proposals.map(p => [p.on, p.size ?? null, p.rule]), [['ann.face', 'close', 'line'], ['ann', 'medium', 'after'], [['ann', 'bo'], 'medium', 'exchange']]);
  // A camera that frames one name at a time (groups: false) goes wide when the other speaks instead.
  const single = direct({storyboard: talkBoard, names: ['ann', 'ann.face', 'bo', 'bo.face'], timings: talkTimes, groups: false});
  assert.deepEqual(single.proposals.map(p => [p.on, p.size ?? null, p.rule]), [['ann.face', 'close', 'line'], ['ann', 'medium', 'after'], ['bo.face', 'close', 'line'], ['wide', null, 'turn']]);
  // "…," says Mia: an attribution names who spoke, so it does not reframe.
  const tag = direct({storyboard: {scenes: [{id: 's', narration: 'Night falls. {@mia}"It is late," says Mia.'}]}, names: ['mia', 'mia.face']});
  assert.deepEqual(tag.proposals, []);
});

test('the close-up budget: the first ?/! of a turn that follows someone else, so many a scene — data, and a key moment outside it', () => {
  const board = {scenes: [{id: 'run', narration: 'The race starts. {@ann}"Go!" {@ann}"Go on!" {@bo}"Faster!" They run. {@ann}"Look!" They run on. {@bo}"Yes!"'}]};
  const times = evenTimings({scenes: [{id: 'run', narration: 'The race starts. Go! Go on! Faster! They run. Look! They run on. Yes!'}]}, {wordSeconds: 1});
  const names = ['ann', 'ann.face', 'bo', 'bo.face'], run = options => direct({storyboard: board, timings: times, names, groups: false, ...options});
  const lines = d => d.proposals.map(p => [p.said, p.on, p.rule]);
  const d = run();
  assert.deepEqual(lines(d), [['"Go!"', 'ann.face', 'line'], ['"Faster!"', 'bo.face', 'line'], ['"Look!"', 'wide', 'turn']]);
  assert.deepEqual(d.dropped.map(x => [x.said, x.why]), [
    ['"Go on!"', "held: ann's turn has had its close-up (closeUps.perTurn 1)"],                       // the same turn
    ['They run.', '1.00 s after the line key on "bo.face": one camera move at a time (gap 2 s)'],     // back to medium, too soon
    ['"Look!"', 'held: the scene has had its close-ups (closeUps.perScene 2)'],
    ['"Yes!"', 'held: the scene has had its close-ups (closeUps.perScene 2)']]);
  // The budget is data: no limit per scene, two per turn.
  const free = run({director: {closeUps: {perScene: null, perTurn: 2}, gap: 0}});
  assert.deepEqual(lines(free).filter(l => l[2] === 'line').map(l => l[0]), ['"Go!"', '"Faster!"', '"Look!"', '"Yes!"'], 'no limit a scene: each turn\'s first exclamation');
  assert.ok(!free.dropped.some(x => x.said === '"Go on!"'), 'two a turn: "Go on!" may close, and the close-up on Ann is already up');
  // A rule's key moment is framed whatever the budget says.
  const key = run({director: {rules: {shots: [{name: 'win', when: ['Yes!'], shot: 'close', key: true}]}}});
  assert.deepEqual(lines(key).at(-1), ['"Yes!"', 'bo.face', 'line']);
  assert.equal(key.proposals.at(-1).name, 'win');
  // A speaker who goes on after the narrator is still in their turn: no new close-up.
  const again = direct({storyboard: {scenes: [{id: 'a', narration: 'Night falls. {@ann}"Wait!" Ann stops. {@ann}"Listen!"'}]}, names, timings: evenTimings({scenes: [{id: 'a', narration: 'Night falls. Wait! Ann stops. Listen!'}]}, {wordSeconds: 1})});
  assert.ok(again.dropped.some(x => x.said === '"Listen!"' && /still their turn/.test(x.why)));
});

test('aliases (the film\'s data): the narration names a thing however it likes, and a thing named wins over a person', () => {
  const board = {scenes: [{id: 'yard', narration: 'The sun is up. Mia counts the sacks. {@mia}"Ten." The scribe presses a mark into the clay.'}]};
  const names = ['mia', 'mia.face', 'scribe', 'scribe.face', 'row', 'tablet'];
  const plain = direct({storyboard: board, names, rest: 'calm'});
  assert.deepEqual(plain.proposals.map(p => [p.on, p.size, p.rule]), [['mia', 'medium', 'person'], ['scribe', 'medium', 'person']], 'without aliases the sacks and the clay are not things the picture names');
  const tables = {en: {lang: 'en', aliases: {sacks: 'row', clay: {on: 'tablet', size: 'close'}}}};
  const aliased = direct({storyboard: board, names, lang: 'en', rules: tables});
  assert.deepEqual(aliased.proposals.map(p => [p.at, p.on, p.size ?? null]), [[['yard', 'Mia', -.2], 'row', 'insert'], [['yard', 'Ten', -.2], 'wide', null], [['yard', 'The scribe', -.2], 'tablet', 'close']], 'the sacks, not Mia; back to wide; the clay');
  const mine = direct({storyboard: board, names, lang: 'en', rules: tables, director: {rules: {aliases: {sacks: {on: 'row', size: 'medium'}}}}});
  assert.equal(mine.proposals[0].size, 'medium', 'the recipe\'s alias wins over the application\'s');
  assert.throws(() => readRules({rules: {aliases: {'two words': 'row'}}}), /"two words" is not one word; an alias names one word the narration says/);
  assert.throws(() => readRules({rules: {aliases: {sacks: {on: 'row', size: 'huge'}}}}), /aliases\.sacks\.size is medium, close, insert/);
});

test('one camera move at a time: a key too soon after the last is left out, with why — a line\'s own framing takes the place of a lower one', () => {
  const quick = evenTimings(storyboard, {wordSeconds: .4});
  const d = direct({storyboard, timings: quick, names: Object.keys(BOXES)});
  const cams = d.proposals.filter(p => p.kind === 'camera');
  for (let i = 1; i < cams.length; i++) assert.ok(cams[i].t - cams[i - 1].t >= 2 - 1e-9, `${cams[i].on} at ${cams[i].t} keeps the gap`);
  assert.ok(d.dropped.some(x => /takes its place/.test(x.why)), 'a line\'s close-up replaced a lower key');
  assert.ok(d.dropped.some(x => /one camera move at a time \(gap 2 s\)/.test(x.why)), 'a key too soon was left out');
  assert.ok(direct({storyboard, timings: quick, names: Object.keys(BOXES), director: {gap: 0}}).dropped.every(x => x.why.startsWith('held:')), 'gap 0 leaves nothing out for being too soon');
});

test('moods: a line\'s rule (data), the first mood the kit can act, back to rest when someone else speaks or the scene changes', () => {
  const rules = {en: {lang: 'en', moods: [{name: 'unsure', when: ['I have no idea…'], mood: ['puzzled', 'unsure']}, {name: 'found', when: ['Here it is…!'], mood: 'surprised'}]}};
  const d = direct({storyboard, timings, lang: 'en', rules, moods: MOODS, rest: 'calm', names: Object.keys(BOXES)});
  assert.deepEqual(d.proposals.filter(p => p.kind === 'mood').map(p => [p.who, p.at, p.mood, p.rule]), [
    ['mia', ['hall', 'I'], 'unsure', 'line'],          // puzzled is not a face this kit has: the next one it does
    ['mia', ['hall', 'Here'], 'calm', 'rest'],         // Sam speaks: Mia's mood is done
    ['sam', ['hall', 'Here'], 'surprised', 'line'],
    ['sam', ['door', '{try}'], 'calm', 'scene']]);     // a new scene in the same picture
  assert.deepEqual(d.acting, {mia: [{at: ['hall', 'I'], mood: 'unsure'}, {at: ['hall', 'Here'], mood: 'calm'}], sam: [{at: ['hall', 'Here'], mood: 'surprised'}, {at: ['door', '{try}'], mood: 'calm'}]});
  // A person the picture does not draw is not acted (the record says so); with no table words, no line moods at all.
  const away = direct({storyboard, lang: 'en', rules, moods: MOODS, rest: 'calm', names: ['sam', 'sam.face']});
  assert.ok(away.dropped.some(x => x.who === 'mia' && /not in the picture/.test(x.why)));
  assert.deepEqual(direct({storyboard, timings, moods: MOODS, rest: 'calm'}).acting, {});
});

test('a pause and guess: whoever answers thinks from the question until they answer', () => {
  const board = {scenes: [{id: 'quiz', narration: 'Mia looks at the box. {q}What is inside? {pause}{@mia}"A cat."'}]};
  const d = direct({storyboard: board, guesses: [{after: ['quiz', '{pause}']}], moods: MOODS, rest: 'calm'});
  assert.deepEqual(d.acting, {mia: [{at: ['quiz', '{q}'], mood: 'thinking'}, {at: ['quiz', '{pause}'], mood: 'calm'}]});
  const byPhrase = direct({storyboard: board, guesses: [{after: ['quiz', 'What is inside']}], moods: MOODS, rest: 'calm'});
  assert.deepEqual(byPhrase.acting, d.acting, 'a guess after words, or after a moment, finds the same pause');
  const none = direct({storyboard: board, guesses: [{after: ['quiz', '{pause}']}], director: {rules: {guess: null}}, moods: MOODS, rest: 'calm'});
  assert.deepEqual(none.acting, {}, 'a table whose guess is null gives no thinking');
});

test('compileFilm with "director": the keys land in the world\'s own spec, are recorded with why, and the film draws them', async () => {
  compiled.length = 0;
  const directed = await film({director: 'on'});
  const spec = compiled.at(-1), record = directed.director;
  assert.equal(record.camera, 'auto');
  assert.deepEqual(record.pictures, [{path: 'story', kit: 'room', scenes: ['hall', 'door'], camera: 'world', acting: true}], 'auto: the world\'s kit takes framing keys, so they land there');
  assert.deepEqual(record.placed.map(p => p.path), ['story.camera']);
  assert.deepEqual(spec.camera, record.placed[0].keys, 'the world was built with the director\'s keys');
  assert.deepEqual(spec.camera.map(k => k.on), ['sam.face', 'mia.face', 'lamp', 'wide', 'mia', 'mia.face', 'sam'], 'one name at a time: this camera does not frame groups, so Mia\'s answer is her own close-up');
  assert.ok(record.dropped.some(p => /establishing/.test(p.why)));
  assert.ok(record.proposals.every(p => p.placed && p.path === 'story' && p.rule && p.said));
  assert.deepEqual(record.listeners.scenes, [{scene: 'hall', people: ['mia', 'sam']}, {scene: 'door', people: ['mia', 'sam']}]);
  assert.equal(record.listeners.by, 'reactionAt');
  // The probe that read the world's names logged no beat: each key's beat is in film.beats once, with its recipe entry.
  const keyed = directed.beats.filter(b => b.path?.startsWith('story.camera'));
  assert.equal(keyed.length, spec.camera.length);
  assert.deepEqual(keyed.map(b => b.path), spec.camera.map((_, i) => `story.camera[${i}].at`));
  assert.ok(directed.recipe.story.camera, 'the recipe as compiled (what the cache keys on) holds the keys');
  assert.ok(directed.inputs.director, 'an approval covers what the director chose');
  const plainFilm = await film({});
  assert.notDeepEqual(frameHashes(directed, {count: 12}), frameHashes(plainFilm, {count: 12}), 'the keys draw');
});

test('explicit keys always win: a world that frames itself keeps its camera; acting is kept person by person', async () => {
  const rules = {en: {lang: 'en', moods: [{name: 'unsure', when: ['I have no idea…'], mood: 'unsure'}, {name: 'found', when: ['Here it is…!'], mood: 'surprised'}]}};
  compiled.length = 0;
  const own = [{at: ['hall', 'lamp'], on: 'lamp', size: 'insert'}], mine = [{at: ['hall', 'Mia'], mood: 'thinking'}];
  const f = await film({story: {kit: 'room', camera: own, acting: {mia: mine}}, director: 'on'}, {lang: 'en', strategies: {director: rules}});
  const spec = compiled.at(-1);
  assert.deepEqual(spec.camera, own, 'the recipe\'s camera, untouched');
  assert.deepEqual(spec.acting.mia, mine, 'Mia acts as the recipe says');
  assert.deepEqual(spec.acting.sam.map(k => k.mood), ['surprised', 'calm'], 'Sam, whom the recipe does not act, gets the director\'s moods');
  const cams = f.director.proposals.filter(p => p.kind === 'camera'), mias = f.director.proposals.filter(p => p.who === 'mia');
  assert.ok(cams.length && cams.every(p => p.placed === false && /the recipe frames this world itself \(story\.camera\)/.test(p.why)));
  assert.ok(mias.length && mias.every(p => p.placed === false && /acts mia in this world itself/.test(p.why)));
  // An empty list is explicit too: the world's camera stays still.
  compiled.length = 0;
  await film({story: {kit: 'room', camera: []}, director: 'on'});
  assert.deepEqual(compiled.at(-1).camera, []);
});

test('"director": "off", or none, is the film exactly as without one — same frames, beats, regions and keys', async () => {
  const none = await film({}), off = await film({director: 'off'});
  assert.deepEqual(frameHashes(off, {count: 24}), frameHashes(none, {count: 24}));
  assert.deepEqual(off.beats, none.beats);
  assert.deepEqual([0, 2, 5, 9].map(t => off.regionsAt(t)), [0, 2, 5, 9].map(t => none.regionsAt(t)));
  assert.equal(off.director, undefined); assert.equal(none.director, undefined);
  const {recipe: a, ...inputsOff} = off.inputs, {recipe: b, ...inputsNone} = none.inputs;
  assert.deepEqual(inputsOff, inputsNone, 'no director key in the inputs');
  assert.notEqual(a, b, 'only the recipe\'s own hash differs: its text says "off"');
  const {director, ...rest} = off.recipe;
  assert.equal(director, 'off'); assert.deepEqual(rest, none.recipe);
  const keys = f => planPieces(f, {fps: 10}).map(piece => segmentKey(f, piece, {recipe: f.recipe, storyboard, pixels: {w: 160, h: 90}, fps: 10}));
  assert.deepEqual(keys(off), keys(none), 'every cached piece keeps its key');
  // The director on with nothing to land is the same picture too.
  const idle = await film({director: {camera: 'off', acting: 'off'}});
  assert.deepEqual(frameHashes(idle, {count: 24}), frameHashes(none, {count: 24}));
  assert.deepEqual(idle.director.placed, []);
});

test('a kit with no direction: the framing lands in the film\'s own focus — unless the recipe moves the camera itself', async () => {
  const f = await film({story: {kit: 'plain'}, director: 'on'});
  assert.deepEqual(f.director.pictures.map(p => p.camera), ['focus']);
  assert.deepEqual(f.director.placed.map(p => p.path), ['focus']);
  assert.equal(f.attention.focus.strategy, 'camera');
  assert.deepEqual(f.attention.focus.keys.map(k => k.on), ['mia', 'sam.face', ['sam', 'mia'], 'lamp', 'sam.face', 'wide', 'mia.face', 'sam'], 'the film\'s focus frames the two together (and, spanning the film, keeps no establishing hold)');
  const pair = f.focusAt(f.attention.focus.keys[2].t + 3).box, [mx0, , mx1] = BOXES.mia, [sx0, , sx1] = BOXES.sam;
  assert.ok(Math.abs(pair[0] - Math.min(mx0, sx0)) < 1 && Math.abs(pair[2] - Math.max(mx1, sx1)) < 1, 'a two-shot frames the box round both');
  assert.ok(f.beats.some(b => b.path === 'focus.keys[2].at'), 'each focus key\'s beat names its entry');
  const blocked = await film({story: {kit: 'plain'}, director: 'on', notes: [{note: 'push', push: {at: [800, 450], zoom: 1.2, from: ['door', 'Mia tries'], to: ['door', 'Sam laughs']}}]});
  assert.equal(blocked.attention, null);
  assert.ok(blocked.director.proposals.every(p => p.placed === false && /push the camera/.test(p.why)));
  const own = {strategy: 'camera', keys: [{at: ['hall', 'lamp'], on: 'lamp', size: 'insert'}]};
  const mine = await film({story: {kit: 'plain'}, director: 'on', focus: own});
  assert.deepEqual(mine.attention.focus.keys.map(k => k.on), ['lamp'], 'the recipe\'s own focus, untouched');
  assert.ok(mine.director.proposals.every(p => p.placed === false && p.why === 'the recipe has its own focus'));
});

// Two pictures: the hall in the story's room, the door in a stage's room (the stage path of probe, pictures and placing).
const twoPictures = {story: {kit: 'room'}, stages: [{type: 'world', scene: 'door', world: {kit: 'room'}}]};

test('two pictures, each world directed: its own keys, its own establishing shot, the stage\'s spec placed', async () => {
  compiled.length = 0;
  const f = await film({...twoPictures, director: 'on'});
  assert.deepEqual(f.director.pictures.map(p => [p.path, p.scenes, p.camera]), [['story', ['hall'], 'world'], ['stages[0]', ['door'], 'world']]);
  assert.deepEqual(f.director.placed.map(p => p.path), ['story.camera', 'stages[0].world.camera']);
  assert.deepEqual(f.recipe.stages[0].world.camera, f.director.placed[1].keys, 'the stage\'s world spec holds its keys (what the cache keys on)');
  assert.deepEqual(f.recipe.stages[0].world.camera.map(k => k.on), ['mia.face', 'sam'], 'the door\'s first sentence keeps its establishing shot');
  assert.ok(f.director.dropped.some(d => d.scene === 'door' && /establishing/.test(d.why)));
  assert.ok(f.beats.some(b => b.path === 'stages[0].world.camera[0].at'));
  assert.equal(compiled.length, 4, 'each directed world is built twice: once to read its names, once with its keys');
});

test('one camera: a push note, the recipe\'s focus or a world\'s own camera leaves the director\'s framing unplaced, with why', async () => {
  // (a) A push note and a world that takes framing keys: the world gets none (the film compiles).
  const pushed = await film({director: 'on', notes: [{note: 'push', push: {at: [800, 450], zoom: 1.2, from: ['hall', 'Where did'], to: ['hall', 'The lamp']}}]});
  assert.deepEqual(pushed.director.placed, []);
  assert.ok(pushed.director.proposals.filter(p => p.kind === 'camera').every(p => p.placed === false && /push the camera/.test(p.why)));
  // A focus that moves the camera takes it from a world too; one that only dims does not.
  const focused = await film({director: 'on', focus: {strategy: 'camera', keys: [{at: ['hall', 'lamp'], on: 'lamp'}]}});
  assert.ok(focused.director.proposals.filter(p => p.kind === 'camera').every(p => p.placed === false && /focus moves the camera/.test(p.why)));
  const dimmed = await film({director: 'on', focus: {strategy: 'dim', keys: [{at: ['hall', 'lamp'], on: 'lamp'}]}});
  assert.deepEqual(dimmed.director.placed.map(p => p.path), ['story.camera']);
  // (b) A world whose own camera moves (its kit's cameraMoves) takes nothing from the director's focus.
  const own = {name: 'own', story: {compile: (spec, clock) => ({hang: 1, regionsAt: () => regions, cameraMoves: (spec.camera ?? []).map(k => ({from: clock.at(k.at), to: clock.at(k.at) + 1.5})), draw: c => { c.fillStyle = '#ddd'; c.fillRect(0, 0, 1600, 900); }})}};
  const theirs = await compileFilm({storyboard, timings, recipe: {story: {kit: 'own', camera: [{at: ['hall', 'Where did']}]}, director: 'on'}, kits: [own]});
  assert.equal(theirs.attention, null, 'no focus over a world that moves its own camera');
  assert.ok(theirs.director.proposals.length && theirs.director.proposals.every(p => p.placed === false && p.why === 'the world at story moves its own camera (its kit\'s cameraMoves)'));
  // camera "focus" over a world that frames itself: the same.
  const framed = await film({story: {kit: 'room', camera: []}, director: {camera: 'focus'}});
  assert.ok(framed.director.proposals.filter(p => p.kind === 'camera').every(p => p.placed === false && /the recipe frames this world itself \(story\.camera\)/.test(p.why)));
});

test('"auto" frames each picture where it can: a world that takes keys in its spec, the others through the focus — wide at each change', async () => {
  const mixed = {story: {kit: 'plain'}, stages: [{type: 'world', scene: 'door', world: {kit: 'room'}}]};
  const f = await film({...mixed, director: 'on'});
  assert.deepEqual(f.director.pictures.map(p => [p.path, p.camera]), [['story', 'focus'], ['stages[0]', 'world']]);
  assert.deepEqual(f.director.placed.map(p => p.path), ['stages[0].world.camera', 'focus']);
  const keys = f.attention.focus.keys, change = f.clock.start('door');
  assert.equal(keys.at(-1).on, 'wide', 'the focus goes back to wide for the world that frames itself');
  assert.ok(f.focusAt(change).z < 1.02, 'and the door\'s picture opens wide (its spring settled, within half a percent of its move)');
  assert.equal(f.director.proposals.find(p => p.rule === 'picture').placed, true);
  // "worlds": the plain picture is not framed, and the record says why.
  const worlds = await film({...mixed, director: {camera: 'worlds'}});
  assert.equal(worlds.attention, null);
  assert.match(worlds.director.pictures[0].why, /the kit "plain" takes no framing keys \(no direction\.camera\): "camera": "auto" frames it through the film's focus/);
});

test('the focus over two pictures: back to wide as the second comes, a key no gap leaves out', async () => {
  const board = {scenes: [{id: 'a', narration: 'Night falls here. {@sam}"Is it late?"'}, {id: 'b', narration: 'The yard is dark. The lamp is on.'}]};
  const quick = evenTimings(board, {wordSeconds: .3, tail: .3});
  const kit = (name, names) => ({name, story: {compile: () => ({hang: 1, regionsAt: () => regions.filter(r => names.includes(r.name)), draw: c => { c.fillStyle = '#ddd'; c.fillRect(0, 0, 1600, 900); }})}});
  const f = await compileFilm({storyboard: board, timings: quick, recipe: {story: {kit: 'ka'}, stages: [{type: 'world', scene: 'b', world: {kit: 'kb'}}], director: 'on'}, kits: [kit('ka', ['sam', 'sam.face']), kit('kb', ['lamp'])]});
  const keys = f.attention.focus.keys, b = f.clock.start('b');
  assert.deepEqual(keys.map(k => k.on), ['sam.face', 'wide', 'lamp']);
  assert.ok(keys[1].t < b && keys[1].t > keys[0].t, 'the wide key lands before the change, so the camera arrives as the picture does');
  for (const t of [b, b + .1, b + .5]) assert.ok(f.focusAt(t).z < 1.02, `the second picture is wide at ${t.toFixed(2)} s`);
  assert.equal(f.director.proposals.find(p => p.rule === 'picture').placed, true);
  assert.ok(!f.director.dropped.some(d => d.rule === 'picture'), 'never left out');
});

test('a key lands only where the picture names what it frames: a thing drawn on its own sentence is framed on its words', async () => {
  const board = {scenes: [{id: 's1', narration: 'The farmer walks out early. The lamp glows on the table.'}]};
  const t = evenTimings(board, {wordSeconds: .5});
  const item = at => ({write: 'lamp', at, dur: .5, x: 800, y: 450, name: 'lamp'});
  const late = await compileFilm({storyboard: board, timings: t, recipe: {story: {kit: 'whiteboard', items: [item(['s1', 'The lamp glows'])]}, director: 'on'}});
  assert.deepEqual(late.attention.focus.keys.map(k => [k.on, k.t]), [['lamp', late.clock.at(['s1', 'The lamp'])]], 'no lead: the lamp is drawn on these words');
  const early = await compileFilm({storyboard: board, timings: t, recipe: {story: {kit: 'whiteboard', items: [item(['s1', 'The farmer'])]}, director: 'on'}});
  assert.deepEqual(early.attention.focus.keys.map(k => [k.on, +k.t.toFixed(3)]), [['lamp', +(early.clock.at(['s1', 'The lamp']) - .2).toFixed(3)]], 'drawn before: the usual lead');
});

test('every proposal is said where the clock says — silent directions too, one inside another named apart', async () => {
  const board = {scenes: [
    {id: 'a', narration: 'Night falls on the farm. {@ann}"Is it on?" {@bo}"Yes it is!" The lamp glows. The lamp glows again.'},
    {id: 'quiet', silent: [['The lamp flickers and the cat jumps', 2], ['Nothing moves', 2], ['The cat yawns', 2], ['The lamp flickers', 2]]},
    {id: 'b', narration: '{@ann}"Look!" Bo looks at the lamp. {@bo}"Wow!" {@ann}"Wow!"'}]};
  const times = withDirections(board, evenTimings({scenes: board.scenes.filter(s => !s.silent)}, {wordSeconds: .6}));
  const clock = makeClock(board, times);
  const d = direct({storyboard: board, timings: times, names: ['ann', 'ann.face', 'bo', 'bo.face', 'lamp', 'cat'], director: {gap: 0, closeUps: {perScene: null, perTurn: null}}});
  assert.ok(d.proposals.length > 6);
  for (const p of [...d.proposals, ...d.dropped]) assert.ok(Math.abs(clock.at(p.at) - p.t) < 1e-6, `${JSON.stringify(p.at)} is at ${p.t} s, as the clock says (${clock.at(p.at)})`);
  assert.deepEqual(readScene(board.scenes[1], 1).sentences.map(s => s.at), [['quiet', 'The lamp flickers and'], ['quiet', 'Nothing'], ['quiet', 'The cat yawns'], {scene: 'quiet', phrase: 'The lamp flickers', nth: 1}]);
  const plainKit = {name: 'flat', story: {compile: () => ({hang: 1, regionsAt: () => regions.concat([{box: [100, 600, 300, 800], path: 'cat', label: 'cat', name: 'cat'}]), draw: c => { c.fillStyle = '#ddd'; c.fillRect(0, 0, 1600, 900); }})}};
  const f = await compileFilm({storyboard: board, timings: times, recipe: {story: {kit: 'flat'}, director: 'on'}, kits: [plainKit]});
  for (const p of f.director.proposals) assert.ok(Math.abs(f.clock.at(p.at) - p.t) < 1e-6);
});

test('lists in a focus: a list of one is its name, "wide" is never in a list, and a Short\'s follow crop frames them all', async () => {
  const one = await film({story: {kit: 'plain'}, focus: {strategy: 'camera', keys: [{at: ['hall', 'lamp'], on: ['lamp']}]}});
  assert.equal(one.attention.focus.keys[0].on, 'lamp');
  await assert.rejects(film({story: {kit: 'plain'}, focus: {strategy: 'camera', keys: [{at: ['hall', 'lamp'], on: ['wide']}]}}), /focus\.keys\[0\]\.on lists "wide", which is the whole frame/);
  const two = await film({story: {kit: 'plain'}, focus: {strategy: 'camera', keys: [{at: ['hall', 'lamp'], on: ['mia', 'sam']}]}});
  const t = two.attention.focus.keys[0].t + 1, target = focusTarget(two, t, {turns: [], focusKeys: two.attention.focus.keys, w: 1600});
  assert.equal(target.why, 'focus');
  assert.equal(target.x, (Math.min(BOXES.mia[0], BOXES.sam[0]) + Math.max(BOXES.mia[2], BOXES.sam[2])) / 2, 'the crop follows the box round both');
});

test('each directed key carries its own beat: a mood and a camera key on one sentence name their own entries', async () => {
  const rules = {en: {lang: 'en', moods: [{name: 'found', when: ['Here it is…!'], mood: 'surprised'}]}};
  const f = await film({director: 'on'}, {lang: 'en', strategies: {director: rules}});
  const tryBeats = f.beats.filter(b => JSON.stringify(b.ref) === JSON.stringify(['door', '{try}'])).map(b => b.path).sort();
  assert.deepEqual(tryBeats, ['story.acting.sam[1].at', 'story.camera[4].at']);
});

test('the application\'s table: the exact language tag first, then its primary subtag', () => {
  const tables = {'en': {lang: 'en', moods: [{name: 'plain', when: ['Oh!'], mood: 'surprised'}]}, 'en-IN': {lang: 'en-IN', moods: [{name: 'indian', when: ['Oh!'], mood: 'happy'}]}};
  assert.equal(matchLine('Oh!', readRules({lang: 'en-IN', tables})).mood.name, 'indian');
  assert.equal(matchLine('Oh!', readRules({lang: 'en-GB', tables})).mood.name, 'plain');
});

test('an explicit recipe handed to the segment cache is keyed as the director placed it', async () => {
  const f = await film({...twoPictures, director: 'on'});
  const given = {story: {kit: 'room'}, stages: [{type: 'world', scene: 'door', world: {kit: 'room'}}], director: 'on'};
  assert.deepEqual(asDirected(given, f.director), structuredClone(f.recipe));
  assert.equal(asDirected(given, undefined), given, 'no director: the recipe as it is');
});

test('refusals name the fix', async () => {
  assert.throws(() => readDirector('yes'), /director is "on", "off" or \{lang\?, rules\?, camera\?, acting\?, gap\?, lead\?\}/);
  assert.throws(() => readDirector({cam: 'focus'}), /director has unsupported key cam \(it takes lang, rules, camera, acting, gap, lead, closeUps, exchange\)/);
  assert.throws(() => readDirector({camera: 'sideways'}), /director\.camera is "auto", "worlds", "focus", "off"/);
  assert.throws(() => readDirector({gap: -1}), /director\.gap is the least seconds between two camera keys/);
  assert.throws(() => readDirector({closeUps: {perScene: -1}}), /director\.closeUps\.perScene is a count, 0 or more, or null \(no limit\)/);
  assert.throws(() => readDirector({closeUps: {each: 1}}), /director\.closeUps has unsupported key each \(it takes perScene, perTurn\)/);
  assert.throws(() => readDirector({exchange: 'soon'}), /director\.exchange is how many seconds may pass before the other speaker replies/);
  assert.throws(() => readRules({rules: {shots: [{name: 'x', when: ['Oh!'], shot: 'close', key: 'yes'}]}}), /key is true \(a key moment: framed whatever the close-up budget says\) or false/);
  assert.throws(() => readDirector('on', {tables: {en: {}}}), /the film says no language: give compileFilm\(\{…, lang\}\) or "director": \{"lang": "…"\}/);
  assert.throws(() => readDirector({lang: 'en', rules: {lang: 'ta'}}), /director\.rules are in "ta" and the director reads "en"/);
  assert.throws(() => readRules({rules: {moods: [{name: 'x', when: ['…'], mood: 'calm'}]}}), /names no words and no end mark, so it would match every line/);
  assert.throws(() => readRules({rules: {moods: [{name: 'x', when: ['Oh!']}]}}), /gives no mood: give one \("surprised"\), or null/);
  assert.throws(() => readRules({rules: {shots: [{name: 'x', when: ['Oh!'], shot: 'huge'}]}}), /shot is medium, close, insert \(how much of the frame the face fills\), or null/);
  assert.throws(() => readRules({rules: {moods: [{name: 'x', when: ['Oh!'], mood: 'calm', size: 1}]}}), /has unsupported key size \(a mood rule takes name, when, mood\)/);
  assert.throws(() => direct({storyboard, director: 'off'}), /the director is "off"/);
  assert.throws(() => direct({storyboard, timings: evenTimings({scenes: [{id: 'hall', narration: 'Something else.'}, storyboard.scenes[1]]})}), /the timings for scene hall do not time what it says/);
  const badKit = {name: 'bad', story: {direction: {camera: 3}, compile: () => ({hang: 1, draw() {}})}};
  await assert.rejects(compileFilm({storyboard, timings, recipe: {story: {kit: 'bad'}, director: 'on'}, kits: [badKit]}), /story: the kit "bad"'s direction\.camera names a key of the world's spec, not 3/);
  const groupy = {name: 'groupy', story: {direction: {camera: 'camera', groups: 'yes'}, compile: () => ({hang: 1, draw() {}})}};
  await assert.rejects(compileFilm({storyboard, timings, recipe: {story: {kit: 'groupy'}, director: 'on'}, kits: [groupy]}), /direction\.groups is true \(its camera frames several names together: on: \[a, b\]\) or false/);
  const neither = {name: 'neither', story: {direction: {moods: ['calm']}, compile: () => ({hang: 1, draw() {}})}};
  await assert.rejects(compileFilm({storyboard, timings, recipe: {story: {kit: 'neither'}, director: 'on'}, kits: [neither]}), /takes neither camera nor acting/);
  await assert.rejects(film({director: {acting: 'faces'}}), /director\.acting is "worlds"/);
});

const ffmpeg = spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-version']).status === 0;
test('the making-of record keeps the direction', {skip: ffmpeg ? false : 'ffmpeg not on PATH'}, async t => {
  const out = path.join(tempDir('director', t), 'film.mp4');
  const result = await makeFilm({storyboard, timings, recipe: {story: {kit: 'room'}, director: 'on'}, kits: [room], out, render: {width: 160, height: 90, fps: 4}});
  assert.ok(existsSync(result.out));
  const record = JSON.parse(readFileSync(result.makingOf, 'utf8'));
  assert.deepEqual(record.director.placed.map(p => p.path), ['story.camera']);
  assert.ok(record.director.proposals.length > 4 && record.director.proposals.every(p => p.rule && p.said));
  assert.ok(record.beats.some(b => b.entry === 'story.camera[0].at'), 'each directed beat names the entry it landed in');
});

test('a directed frame is still a pure function of time', async () => {
  const a = await film({director: 'on'}), b = await film({director: 'on'});
  const draw = (f, t) => { const c = createCanvas(320, 180), x = c.getContext('2d'); x.scale(.2, .2); f.frame(x, t); return c.data().toString('base64'); };
  for (const t of [0, 2.5, 6, 9.7]) assert.equal(draw(a, t), draw(b, t));
  assert.deepEqual(a.director, b.director);
});
