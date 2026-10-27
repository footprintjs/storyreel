// The five scene questions (progression.mjs): each shot may answer what exists now, what changed, why, what became
// possible and what constraint remains — one short sentence each. film.shots and the making-of carry them; the film
// checks that the story moves one world on (report by default, refuse when the recipe says so).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings, makeFilm} from '../src/index.mjs';
import {QUESTIONS, QUESTION_ASKS, readQuestions, checkProgression, progressionMode, contentWords, sharedWords} from '../src/progression.mjs';
import {tempDir} from './tmp.mjs';

const storyboard = {title: 'Checkout', scenes: [
  {id: 'cart', narration: 'The cart holds three items and an offer made yesterday.'},
  {id: 'refused', narration: 'At checkout, the app refuses the offer.'},
  {id: 'fresh', narration: 'So the person asks again, and gets a fresh offer.'},
]};
const timings = evenTimings(storyboard);
/** A world kit that refuses any key it does not know: the scene questions are the engine's, never the kit's. */
const strict = name => ({name, story: {compile(spec) {
  for (const key of Object.keys(spec)) if (key !== 'kit') throw new Error(`${name}: unsupported key ${key}`);
  return {hang: 1, draw: c => { c.fillStyle = '#336'; c.fillRect(0, 0, 1600, 900); }};
}}});
const kits = [strict('one'), strict('two'), strict('three')];
// A story told in order: each change carried into the next scene's exists, the opening used, the constraint answered.
const told = {
  story: {exists: 'The cart holds three items and an offer made yesterday.'},
  refused: {exists: 'The cart still holds yesterday\'s offer.', changed: 'The app refuses the offer at checkout.', why: 'The price changed after the offer was made.',
    opens: 'The person can ask for a fresh offer.', remains: 'Nothing can be bought at the old price.'},
  fresh: {exists: 'The offer is refused at checkout.', changed: 'The person asks again and gets a fresh offer at the new price.'},
};
const recipe = (answers = {}, top = {}) => ({story: {kit: 'one', ...answers.story},
  stages: [{type: 'world', scene: 'refused', world: {kit: 'two'}, ...answers.refused}, {type: 'world', scene: 'fresh', world: {kit: 'three'}, ...answers.fresh}], ...top});
const film = (answers, top, more = {}) => compileFilm({storyboard, timings, recipe: recipe(answers, top), kits, ...more});
const look = (f, t) => { const c = createCanvas(320, 180), ctx = c.getContext('2d'); ctx.scale(.2, .2); f.frame(ctx, t); return createHash('sha256').update(c.data()).digest('hex'); };

test('each shot answers the five questions in one short sentence each; film.shots carries them, and the kit never sees them', async () => {
  const f = await film(told);
  assert.deepEqual(QUESTIONS, ['exists', 'changed', 'why', 'opens', 'remains']);
  assert.deepEqual(f.shots.map(s => Object.fromEntries(QUESTIONS.filter(q => s[q]).map(q => [q, s[q]]))), [told.story, told.refused, told.fresh]);
  assert.deepEqual(f.progression, [], 'a story told in order: nothing to report');
  // Each answer is trimmed, and read as one sentence (abbreviations are not sentence ends).
  assert.deepEqual(readQuestions({why: '  The price changed at 3 p.m. Monday.  '}, 'x'), {why: 'The price changed at 3 p.m. Monday.'});
  assert.equal(readQuestions({intent: 'Not a question.'}, 'x'), null, 'a shot that answers none: null');
  for (const [answers, message] of [
    [{refused: {changed: 42}}, /^Error: stage refused: changed says what changed, in one short sentence \(e\.g\. "The app refuses the offer at checkout\."\), not 42$/],
    [{refused: {opens: '  '}}, /stage refused: opens says what became possible, in one short sentence/],
    [{refused: {remains: 'x'.repeat(141)}}, /stage refused: remains is 141 characters; a scene's answer fits in 140 \(one short sentence\)/],
    [{story: {why: 'The price changed. Then the offer went stale.'}}, /the story: why reads as two sentences at "…rice changed\. Then the offe…"; each answer is one short sentence: keep the one that says why it changed/],
  ]) await assert.rejects(film(answers), message);
  await assert.rejects(compileFilm({storyboard, timings, kits, recipe: {story: {kit: 'one'}, stages: [{type: 'world', scene: 'refused', world: {kit: 'two', changed: 'Inside the world.'}}]}}),
    /stage refused: changed belongs on the stage, beside world \(the engine reads it there\), not inside world/);
  for (const q of QUESTIONS) assert.ok(QUESTION_ASKS[q].asks && QUESTION_ASKS[q].example, `${q} says what it asks, with an example`);
});

test('the answers draw nothing: the same pixels, the same keys, and the compile record keeps them beside each shot', async () => {
  const plain = await film({}, {}, {record: true}), answered = await film(told, {}, {record: true});
  for (const t of [0, 3, 6, 9]) assert.equal(look(answered, t), look(plain, t), `the picture at ${t} s`);
  assert.deepEqual(plain.shots.map(Object.keys), answered.shots.map(s => Object.keys(s).filter(k => !QUESTIONS.includes(k))), 'a film without answers has no answer keys');
  assert.equal(plain.progression, undefined, 'and no progression list');
  const [before, after] = [plain, answered].map(f => f.record.snapshot.sharedState);
  assert.equal(before['checks.progression'], undefined, 'the compile record is as it was without answers');
  assert.equal(before['stage.stages[0]'].questions, undefined);
  assert.deepEqual(after['stage.stages[0]'].questions, told.refused);
  assert.deepEqual(after['checks.progression'], {rule: 'report', found: []});
});

test('what does not progress is reported, each with its fix: no change, a change not carried, an opening never used, a constraint never answered', async () => {
  const f = await film({
    story: {exists: 'The cart holds three items.'},
    refused: {exists: 'The cart holds three items.', changed: 'The app refuses the offer at checkout.', opens: 'The person can share the cart.', remains: 'Nothing can be bought at the old price.'},
    fresh: {exists: 'A rainbow arcs over the sea.', why: 'Rain stopped.', remains: 'The seller must approve it.'},
  });
  assert.deepEqual(f.progression.map(p => [p.kind, p.where]), [['not-carried', 'stage refused'], ['opens-unused', 'stage refused'], ['remains-unanswered', 'stage refused'], ['changes-nothing', 'stage fresh'], ['remains-unanswered', 'stage fresh']]);
  assert.deepEqual(f.progression.map(p => p.text), [
    'stage refused changed "The app refuses the offer at checkout.", and stage fresh\'s exists ("A rainbow arcs over the sea.") shares no word with it: say what exists now that it changed',
    'stage refused opens "The person can share the cart.", and no later scene\'s changed picks it up: show it used (a later scene\'s "changed"), or leave opens out',
    'stage refused leaves "Nothing can be bought at the old price.", and no later scene\'s changed answers it, so the story ends with it: answer it in a later scene\'s "changed", or leave remains out',
    'stage fresh changes nothing (it says no "changed"): each scene after the first moves the world on — say what changed, in one sentence, or fold the scene into stage refused',
    'stage fresh is the story\'s last scene and leaves "The seller must approve it.", which nothing answers: answer it before the end, or leave remains out',
  ]);
  // A change the next scene says nothing of: no exists there.
  assert.deepEqual(checkProgression([{path: 'a', where: 'A', questions: {changed: 'The offer is refused.'}}, {path: 'b', where: 'B', questions: {changed: 'A fresh offer comes.'}}]).map(p => p.text),
    ['A changed "The offer is refused.", and B does not say what exists: give B "exists", carrying the change forward']);
  // Only the shots that answer take part: a title card between two scenes is passed over, and the first sets the world up.
  assert.deepEqual(checkProgression([{path: 'a', where: 'A', questions: {exists: 'Three items.', changed: 'Two items are removed.'}}, {path: 't', where: 'T', questions: null},
    {path: 'b', where: 'B', questions: {exists: 'One item is left after 2 are removed.', changed: 'It is bought.'}}]), []);
});

test('progression: "refuse" refuses what does not progress, naming the fix; anything but report or refuse refuses', async () => {
  await assert.rejects(film({story: {exists: 'Three items.'}, refused: {exists: 'Three items.'}, fresh: {exists: 'Three items.', changed: 'One is bought.'}}, {progression: 'refuse'}),
    /^Error: The story does not progress \(the recipe says progression: "refuse"\): stage refused changes nothing \(it says no "changed"\)/);
  await film(told, {progression: 'refuse'});
  await assert.rejects(film({}, {progression: 'refuse'}), /^Error: progression: "refuse" checks the shots' answers to the five scene questions, and no shot gives one: answer them on the story and the stages \("exists", "changed", "why", "opens", "remains"\), or leave progression out$/, 'nothing to check is no pass');
  assert.throws(() => progressionMode('strict'), /progression must be "report" \(the default: film\.progression lists a scene that changes nothing/);
  await assert.rejects(film(told, {progression: true}), /progression must be "report"/);
});

test('the words compared: names of things, never the little words; a number word is its digits; a plural or a tense is its stem', () => {
  assert.deepEqual(contentWords('The person is counting the two offers again.'), ['person', 'count', '2', 'offer']);
  assert.deepEqual(sharedWords('Two items are removed.', 'There are 2 items left.'), ['2', 'item']);
  assert.deepEqual(sharedWords('The app refused it.', 'It is refused by the app.'), ['app', 'refus']);
  assert.deepEqual(sharedWords('It stopped.', 'Then it stops.'), ['stop']);
  assert.deepEqual(sharedWords('The price was set.', 'It is priced again.'), ['price'], 'one word starts the other, four letters or more');
  assert.deepEqual(sharedWords('It is here now.', 'It was there then.'), [], 'the little words carry nothing');
});

test('answers in any script are read as words: Devanagari and Tamil keep their vowel signs, and both sides are compared in NFC', async () => {
  assert.deepEqual(contentWords('राम के पास सात सेब हैं।'), ['राम', 'के', 'पास', 'सात', 'सेब', 'हैं']);
  assert.deepEqual(contentWords('அம்மா நான்கு பழங்கள் வாங்கினாள்.'), ['அம்மா', 'நான்கு', 'பழங்கள்', 'வாங்கினாள்']);
  assert.deepEqual(sharedWords('राम ने दो सेब खाए।', 'अब राम के पास पाँच सेब हैं।'), ['राम', 'सेब']);
  assert.deepEqual(sharedWords('அம்மா பழங்கள் வாங்கினாள்.'.normalize('NFD'), 'பழங்கள் மேசையில் உள்ளன.'), ['பழங்கள்'], 'NFD on one side, NFC on the other');
  // A Hindi story told in order passes a refusing check (before, every Hindi answer read as no words at all).
  const hindi = {story: {exists: 'मेज़ पर सात सेब हैं।'}, refused: {exists: 'मेज़ पर सात सेब हैं।', changed: 'राम दो सेब खाता है।'}, fresh: {exists: 'अब राम के पास पाँच सेब हैं।', changed: 'राम बचे हुए सेब गिनता है।'}};
  assert.deepEqual((await film(hindi, {progression: 'refuse'})).progression, []);
  assert.deepEqual(checkProgression([{path: 'a', where: 'A', questions: {changed: 'அம்மா பழங்கள் வாங்கினாள்.'}}, {path: 'b', where: 'B', questions: {exists: 'பழங்கள் மேசையில் உள்ளன.', changed: 'அம்மா ஒரு பழம் சாப்பிட்டாள்.'}}]), []);
});

test('makeFilm: the making-of keeps each shot\'s answers and what does not progress — and nothing of the kind without answers', {skip: spawnSync('ffmpeg', ['-version']).error ? 'needs ffmpeg' : false}, async t => {
  const dir = tempDir('progression', t), render = {width: 320, height: 180, fps: 6};
  const answers = {...told, fresh: {exists: 'The offer is refused at checkout.'}};
  const made = await makeFilm({storyboard, timings, recipe: recipe(answers), kits, out: path.join(dir, 'a', 'film.mp4'), render});
  const record = JSON.parse(readFileSync(made.makingOf, 'utf8'));
  assert.deepEqual(record.progression.shots, [{where: 'the story', scene: 'cart', path: 'story', ...answers.story}, {where: 'stage refused', scene: 'refused', path: 'stages[0]', ...answers.refused}, {where: 'stage fresh', scene: 'fresh', path: 'stages[1]', ...answers.fresh}]);
  assert.deepEqual(record.progression.found.map(f => [f.kind, f.where]), [['opens-unused', 'stage refused'], ['remains-unanswered', 'stage refused'], ['changes-nothing', 'stage fresh']]);
  const plain = JSON.parse(readFileSync((await makeFilm({storyboard, timings, recipe: recipe(), kits, out: path.join(dir, 'b', 'film.mp4'), render})).makingOf, 'utf8'));
  assert.equal(plain.progression, undefined);
  assert.ok(!JSON.stringify(plain.compile).includes('progression'), 'the compile\'s record names no progression');
});
