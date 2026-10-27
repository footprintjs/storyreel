// A scored self-review (rubric.mjs): a rubric is data — a name, a scale, points, least scores. The review lays out each
// point's stills and evidence (the library scores nothing); the scores go into the render's making-of record; an
// approval refuses scores under the recipe's least. No rubric is built in: the one here is a test's own.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {compileFilm, evenTimings, approveFilm} from '../src/index.mjs';
import {readRubric, readRubricRule, rubricSheet, rubricText, readScores, scoresRecord, recordScores, rubricShort, rubricRefusal, LOOKS, RUBRIC_SCALE, OPENING_SECONDS} from '../src/rubric.mjs';
import {REVIEW_DEFAULTS} from '../src/review.mjs';
import {loadProject, review, fullRender} from '../src/tools.mjs';
import {makeFilm} from '../src/index.mjs';
import {tempDir} from './tmp.mjs';

const explainer = {name: 'explainer', least: 8, points: [
  {id: 'opening', label: 'The opening holds attention', ask: 'Do the first seconds give a reason to keep watching?', look: 'opening'},
  {id: 'words', label: 'Words and numbers read easily', look: 'words'},
  {id: 'idea', label: 'The one idea is clear', look: 'shots'},
  {id: 'sound', label: 'Sound lands on what it marks', look: 'sound'},
  {id: 'faces', label: 'Faces show the feeling', look: 'faces'},
  {id: 'look', label: 'It looks finished'}]};
const storyboard = {title: 'Checkout', scenes: [
  {id: 'cart', title: 'The cart', narration: 'The cart holds three items and an offer made yesterday.'},
  {id: 'refused', narration: 'At checkout, the app refuses the offer.'}]};
const recipe = {story: {kit: 'whiteboard', items: [{at: ['cart', 'The cart'], dur: .6, write: 'Three items', x: 800, y: 300, size: 50, align: 'center'}]},
  stages: [{type: 'summary', scene: 'refused', title: 'Refused', intent: 'Show the app refusing a stale offer.', changed: 'The app refuses the offer at checkout.'}], rubric: explainer};
const timings = evenTimings(storyboard, {wordSeconds: .4, tail: 1});

test('a rubric is data: a name, a scale, points and their looks, least scores — checked, each refusal naming the fix', () => {
  const r = readRubric(explainer);
  assert.deepEqual(r.scale, RUBRIC_SCALE, 'whole scores 1–10 when it names no scale');
  assert.deepEqual(r.points.map(p => [p.id, p.look]), [['opening', 'opening'], ['words', 'words'], ['idea', 'shots'], ['sound', 'sound'], ['faces', 'faces'], ['look', 'settled']]);
  assert.deepEqual(r.least, {opening: 8, words: 8, idea: 8, sound: 8, faces: 8, look: 8}, 'a number is every point\'s least');
  assert.deepEqual(readRubric({...explainer, least: {opening: 9}}).least, {opening: 9}, 'or some points\'');
  assert.equal(readRubric({...explainer, least: undefined}).least, null, 'or none: the scores are recorded, nothing is required');
  assert.deepEqual(readRubric({...explainer, scale: [0, 5], least: 4}).scale, [0, 5]);
  assert.equal(readRubricRule(undefined), null);
  assert.deepEqual(Object.keys(LOOKS), ['opening', 'words', 'faces', 'shots', 'sound', 'settled']);
  assert.equal(OPENING_SECONDS, REVIEW_DEFAULTS.hook, 'the opening look reads the review\'s hook');
  for (const [value, message] of [
    ['explainer', /^Error: rubric is a rubric, \{"name", "scale"\?: \[1, 10\], "least"\?: 8 or \{"<point id>": 8\}, "points": \[\{"id", "label", "ask"\?, "look"\?\}\]\}, not "explainer"$/],
    [{...explainer, best: 10}, /rubric has best; a rubric takes name, scale, least, points/],
    [{...explainer, name: ''}, /rubric: name says which rubric it is, in words/],
    [{...explainer, scale: [10, 1]}, /rubric: scale is the lowest and highest score, whole numbers, lowest first \(\[1, 10\]\), not \[10,1\]/],
    [{...explainer, points: []}, /rubric: points lists what is scored/],
    [{...explainer, points: [{id: 'a b', label: 'x'}]}, /rubric\.points\[0\]: id names the point, one word \("opening"\), not "a b"/],
    [{...explainer, points: [{id: 'a', label: 'x'}, {id: 'a', label: 'y'}]}, /rubric\.points\[1\]: id "a" is another point's too/],
    [{...explainer, points: [{id: 'a'}]}, /rubric\.points\[0\]: label says what the point is, in words/],
    [{...explainer, points: [{id: 'a', label: 'x', look: 'mood'}]}, /rubric\.points\[0\]: look is what to lay out for it — opening, words, faces, shots, sound, settled — not "mood"/],
    [{...explainer, points: [{id: 'a', label: 'x', weight: 2}]}, /rubric\.points\[0\] has weight; a point takes id, label, ask, look/],
    [{...explainer, least: 11}, /rubric: least is a whole score 1–10, not 11/],
    [{...explainer, least: {nope: 8}}, /rubric: least names "nope", which is no point of the rubric \(its points: opening, words, idea, sound, faces, look\)/],
    [{...explainer, least: {opening: 8.5}}, /rubric: least\.opening is a whole score 1–10, not 8\.5/],
  ]) assert.throws(() => readRubric(value), message);
});

test('the sheet lays out each point\'s stills and evidence, from what the film knows, in one stable layout', async () => {
  const film = await compileFilm({storyboard, recipe, timings});
  assert.deepEqual(film.rubric, readRubric(explainer), 'the recipe\'s rubric, checked');
  assert.ok(!('rubric' in await compileFilm({storyboard, recipe: {...recipe, rubric: undefined}, timings})), 'a recipe with no rubric: the film has none');
  await assert.rejects(compileFilm({storyboard, recipe: {...recipe, rubric: {...explainer, least: 0}}, timings}), /recipe\.rubric: least is a whole score 1–10, not 0/);
  const sheet = rubricSheet(film, film.rubric);
  const point = id => sheet.points.find(p => p.id === id);
  assert.deepEqual(point('opening').stills.map(s => s.t), [0, .75, 1.5, 2.25, 3]);
  assert.deepEqual(point('opening').evidence, ['said in the first 3 s: "The cart holds three items and an"', 'the review was not run, so its hook check is not here'], 'the words that start inside the first 3 s');
  assert.deepEqual(point('idea').evidence, ['the story: no intent', 'stage refused: for "Show the app refusing a stale offer."; changed "The app refuses the offer at checkout."']);
  assert.deepEqual(point('idea').stills.map(s => s.label), ['The cart', 'refused'], 'each scene\'s settled picture');
  assert.match(point('words').evidence[0], /^2 lines meant to be read; \d+ up too briefly to read$/);
  assert.deepEqual(point('faces').evidence, ['no kit on screen draws a mouth (mouthsAt): the stills are each scene\'s settled picture — score the expression the drawing shows']);
  assert.deepEqual(point('sound').evidence.slice(0, 1), [`${film.sounds.length} effect sound${film.sounds.length === 1 ? '' : 's'}`]);
  assert.ok(sheet.points.every(p => p.stills.length <= 6 && p.stills.every(s => s.t >= 0 && s.t < film.total)), 'at most six stills a point, each inside the film');
  // A review's findings are evidence: its hook check, its findings on words.
  const reviewed = rubricSheet(film, film.rubric, {review: {ran: ['hook'], findings: [{kind: 'hook', from: 0, to: 3, what: 'nothing moves'}, {kind: 'cut-off', from: 4, to: 5, what: '"Refused"'}]}});
  assert.equal(reviewed.points[0].evidence[1], 'the review\'s hook check: nothing moves in the first 3 s');
  assert.ok(reviewed.points[1].evidence.includes('4.00 s cut-off: "Refused"'));
  const text = rubricText(sheet, {files: {opening: '/out/stills/rubric-opening.png'}});
  assert.equal(text.split('\n').slice(0, 9).join('\n'), [
    'Rubric "explainer": score each point 1–10 from its stills and evidence (the library scores nothing).',
    'The recipe asks for at least 8 on every point before approval.',
    '',
    '1. opening — The opening holds attention (look: opening)',
    '   ask: Do the first seconds give a reason to keep watching?',
    '   stills: /out/stills/rubric-opening.png · 0.00 s, 0.75 s, 1.50 s, 2.25 s, 3.00 s',
    '   evidence:',
    '   - said in the first 3 s: "The cart holds three items and an"',
    '   - the review was not run, so its hook check is not here'].join('\n'));
  assert.match(text, /\n6\. look — It looks finished \(look: settled\)\n   stills: The cart \([\d.]+ s\), refused \([\d.]+ s\)\n   evidence:\n   - none beyond the stills$/);
  assert.match(rubricText(rubricSheet(film, {...explainer, least: {opening: 9, idea: 7}})), /^.*\nThe recipe asks, before approval, for at least: opening 9, idea 7\./);
  assert.match(rubricText(rubricSheet(film, {...explainer, least: undefined})), /^.*\nNothing is required of the scores: they are recorded\./);
});

test('scores: every point once, a whole score on the scale; the record says whether the least scores are met', () => {
  const r = readRubric(explainer);
  assert.deepEqual(readScores('opening=8, words=7,idea=9,sound=8,faces=8,look=10', r), {opening: 8, words: 7, idea: 9, sound: 8, faces: 8, look: 10});
  assert.deepEqual(readScores({look: 8, opening: 8, words: 8, idea: 8, sound: 8, faces: 8}, r), {opening: 8, words: 8, idea: 8, sound: 8, faces: 8, look: 8}, 'in the rubric\'s order');
  for (const [scores, message] of [
    ['opening=8', /scores leave out words, idea, sound, faces, look: score every point of the rubric "explainer" \(opening, words, idea, sound, faces, look\)/],
    ['opening=8,opening=9', /scores name opening twice: score each point once/],
    ['mood=8', /scores name "mood", which is no point of the rubric "explainer" \(its points: opening, words, idea, sound, faces, look\)/],
    ['opening=11', /scores\.opening is a whole score 1–10, not 11/],
    ['opening=good', /scores\.opening is a whole score 1–10, not "good"/],
    ['opening 8', /scores are each point's score, "opening=8,words=8,idea=8,sound=8,faces=8,look=8", not "opening 8"/],
    [[8], /scores are each point's score/],
  ]) assert.throws(() => readScores(scores, r), message);
  const at = new Date('2026-10-27T10:00:00Z');
  const rec = scoresRecord({rubric: r, scores: 'opening=9,words=6,idea=8,sound=8,faces=8,look=8', by: 'a reviewer', at});
  assert.deepEqual(rec, {name: 'explainer', scale: [1, 10], points: ['opening', 'words', 'idea', 'sound', 'faces', 'look'], least: {opening: 8, words: 8, idea: 8, sound: 8, faces: 8, look: 8},
    scores: {opening: 9, words: 6, idea: 8, sound: 8, faces: 8, look: 8}, by: 'a reviewer', scored: '2026-10-27T10:00:00.000Z', met: false, short: [{id: 'words', score: 6, least: 8}]});
  assert.deepEqual(rubricShort(rec), [{id: 'words', score: 6, least: 8}]);
  assert.equal(scoresRecord({rubric: {...explainer, least: undefined}, scores: 'opening=1,words=1,idea=1,sound=1,faces=1,look=1', by: 'x'}).met, undefined, 'nothing required: no met');
  assert.throws(() => scoresRecord({rubric: r, scores: 'opening=9,words=6,idea=8,sound=8,faces=8,look=8', by: ' '}), /say who scored it: by/);
});

test('the scores go into the render\'s making-of record, and an approval waits for scores that meet the recipe\'s least', t => {
  const dir = tempDir('rubric', t), file = path.join(dir, 'making-of.json'), made = {schemaVersion: 1, out: path.join(dir, 'film.mp4'), span: {from: 0, to: 9, total: 9, whole: true},
    inputs: {storyboard: 'a', recipe: 'b'}, rubric: {name: 'explainer', scale: [1, 10], points: ['opening', 'words', 'idea', 'sound', 'faces', 'look'], least: readRubric(explainer).least}};
  writeFileSync(file, JSON.stringify(made));
  assert.throws(() => approveFilm({record: file, by: 'Sam'}), /^Error: approveFilm: the recipe's rubric "explainer" asks for least scores before approval \(opening 8, words 8, idea 8, sound 8, faces 8, look 8\), and this render has not been scored: score it \(storyreel review --rubric, then --scores … --by …\), then approve$/);
  const low = recordScores(file, {rubric: explainer, scores: 'opening=9,words=6,idea=8,sound=8,faces=8,look=8', by: 'a reviewer'});
  assert.equal(low.met, false);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).rubric.scores.words, 6, 'written into the record');
  assert.throws(() => approveFilm({record: file, by: 'Sam'}), /and words scored 6 \(by a reviewer\): fix it, render again and score it again$/);
  recordScores(file, {rubric: explainer, scores: 'opening=9,words=8,idea=8,sound=8,faces=8,look=8', by: 'a reviewer'});
  assert.equal(approveFilm({record: file, by: 'Sam'}).by, 'Sam', 'met: approved');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).inputs, made.inputs, 'the rest of the record is as it was');
  assert.throws(() => recordScores(file, {rubric: {...explainer, name: 'other'}, scores: 'opening=9,words=8,idea=8,sound=8,faces=8,look=8', by: 'x'}), /the render was made with its recipe's rubric "explainer" \(points opening, words, idea, sound, faces, look; .*\), and this one differs in its name: score it with the recipe's rubric/);
  writeFileSync(file, JSON.stringify({...made, failed: {error: 'boom'}}));
  assert.throws(() => recordScores(file, {rubric: explainer, scores: 'opening=9,words=8,idea=8,sound=8,faces=8,look=8', by: 'x'}), /is the record of a render that failed \(boom\): score a render that finished/);
  assert.throws(() => recordScores(path.join(dir, 'none.json'), {rubric: explainer, scores: 'opening=9', by: 'x'}), /cannot be read \(ENOENT\): render the film first, then score it/);
  assert.equal(rubricRefusal(undefined), null, 'a recipe without a rubric: nothing waits');
  assert.equal(approveFilm({record: {inputs: {storyboard: 'a', recipe: 'b'}}, by: 'Sam'}).by, 'Sam');
});

test('the scores are of the render\'s own rubric and of the whole film it shows: a lookalike rubric, a part or another film refuses', t => {
  const dir = tempDir('rubric-guard', t), file = path.join(dir, 'making-of.json'), r = readRubric(explainer), all8 = 'opening=8,words=8,idea=8,sound=8,faces=8,look=8';
  const inputs = {storyboard: 'a', recipe: 'b', files: {'kit.mjs': 'c'}};
  const made = {inputs, span: {from: 0, to: 9, total: 9, whole: true}, rubric: {name: 'explainer', scale: [1, 10], points: r.points.map(p => p.id), least: r.least}};
  const fresh = (more = {}) => writeFileSync(file, JSON.stringify({...made, ...more}));
  // A rubric of the same name that asks less: fewer points, a lower least, a wider scale.
  for (const [lookalike, scores, differs] of [
    [{...explainer, points: explainer.points.slice(0, 2)}, 'opening=9,words=9', 'points, least'],
    [{...explainer, least: 1}, all8, 'least'],
    [{...explainer, scale: [1, 100]}, all8, 'scale'],
  ]) {
    fresh();
    assert.throws(() => recordScores(file, {rubric: lookalike, scores, by: 'x'}), new RegExp(`the render was made with its recipe's rubric "explainer" \\(points opening, words, idea, sound, faces, look; scale 1–10; least opening 8, .*\\), and this one differs in its ${differs}: score it with the recipe's rubric \\(render again if the recipe changed\\)$`));
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).rubric.scores, undefined, `nothing recorded (${differs})`);
  }
  fresh();
  assert.equal(recordScores(file, {rubric: explainer, scores: all8, by: 'x', inputs}).met, true, 'the recipe\'s own rubric, the same film: recorded');
  assert.equal(recordScores(file, {rubric: explainer, scores: all8, by: 'y'}).by, 'y', 'scored again on the same rubric (the record keeps its scores beside it)');
  fresh({span: {from: 2, to: 5, total: 9, whole: false}});
  assert.throws(() => recordScores(file, {rubric: explainer, scores: all8, by: 'x'}), /is the record of a render of 2–5 s of a 9 s film: render the whole film, then score it/);
  fresh();
  assert.throws(() => recordScores(file, {rubric: explainer, scores: all8, by: 'x', inputs: {...inputs, recipe: 'changed', files: {'kit.mjs': 'd'}}}),
    /is the record of another film than the one laid out to score \(its recipe, files changed since that render\): render again, then score/);
  // No rubric in the record (the recipe named none): a rubric file's scores are recorded as asked.
  fresh({rubric: undefined});
  assert.equal(recordScores(file, {rubric: {name: 'quick', points: [{id: 'look', label: 'It looks finished'}]}, scores: 'look=3', by: 'x'}).name, 'quick');
});

const fixture = fileURLToPath(new URL('./fixtures/tools/storyreel.config.mjs', import.meta.url));
/** A project of its own: the tools' fixture, its recipe given this rubric (or none). */
function projectWith(dir, rubric) {
  writeFileSync(path.join(dir, 'storyreel.config.mjs'), [`import project from ${JSON.stringify(pathToFileURL(fixture).href)};`,
    `export default {film: flags => { const f = project.film(flags); return {...f, recipe: {...f.recipe${rubric ? `, rubric: ${JSON.stringify(rubric)}` : ''}}}; }};`, ''].join('\n'));
  return dir;
}

test('storyreel review --rubric: the review, then each point with its picture and evidence; --scores --by records them in the render\'s making-of', async t => {
  const dir = projectWith(tempDir('rubric-tool', t), {...explainer, points: explainer.points.slice(0, 3)}), out = path.join(dir, 'out');
  const p = await loadProject({cwd: dir, out});
  const laid = await review(p, {rubric: 'true'});
  assert.match(laid.text, /^the whole film: 0\.00–[\d.]+ s of [\d.]+ s — review \(.*\):\n/);
  assert.match(laid.text, /\n\nRubric "explainer": score each point 1–10 from its stills and evidence \(the library scores nothing\)\.\nThe recipe asks for at least 8 on every point before approval\.\n\n1\. opening — The opening holds attention \(look: opening\)\n/);
  assert.match(laid.text, /\nRecord the scores \(into .*making-of\.json, once the film is rendered\): storyreel review --rubric --scores opening=N,words=N,idea=N --by "<who scored>"$/);
  assert.deepEqual(laid.files.map(f => path.basename(f)), ['rubric-opening.png', 'rubric-idea.png'], 'a picture for each point with stills');
  for (const file of laid.files) assert.ok(existsSync(file), file);
  assert.match(laid.text, /\n2\. words — Words and numbers read easily \(look: words\)\n   stills: none\n   evidence:\n   - 0 lines meant to be read; 0 up too briefly to read\n/, 'a kit that lists no lines: nothing to show, and the evidence says so');
  await assert.rejects(review(p, {rubric: 'true', scores: 'opening=8,words=8,idea=8'}), /review --rubric --scores: say who scored it: --by/);
  await assert.rejects(review(p, {rubric: 'true', scores: 'opening=8,words=8,idea=8', by: 'a reviewer'}), /no making-of\.json in .*out: render the film first \(the scores are kept in the render's record, beside film\.mp4\), then score it/);
  // A record of another film (another recipe) is never scored from this layout.
  writeFileSync(path.join(out, 'making-of.json'), JSON.stringify({inputs: {...p.film.inputs, recipe: 'another'}}));
  await assert.rejects(review(p, {rubric: 'true', scores: 'opening=9,words=7,idea=8', by: 'a reviewer'}), /is the record of another film than the one laid out to score \(its recipe changed since that render\): render again, then score/);
  writeFileSync(path.join(out, 'making-of.json'), JSON.stringify({inputs: p.film.inputs, rubric: {name: 'explainer', scale: [1, 10], points: ['opening', 'words', 'idea'], least: {opening: 8, words: 8, idea: 8}}}));
  assert.match(await review(p, {rubric: 'true', scores: 'opening=9,words=7,idea=8', by: 'a reviewer'}),
    /^rubric "explainer" scored by a reviewer, recorded in .*making-of\.json: opening 9, words 7, idea 8; under the least score: words 7 \(at least 8\) — an approval refuses it until it is fixed, rendered and scored again$/);
  assert.deepEqual(JSON.parse(readFileSync(path.join(out, 'making-of.json'), 'utf8')).rubric.scores, {opening: 9, words: 7, idea: 8});
  await assert.rejects(review(p, {rubric: 'true', scene: 'one'}), /review --rubric scores the whole film: leave scene, from and to out/);
  await assert.rejects(review(p, {scores: 'opening=9'}), /review: scores goes with a rubric: add --rubric \(--rubric --scores opening=9 --by "<who scored>"\)/);
  // No rubric in the recipe: say how to give one; a rubric file in the project is read instead.
  const bare = await loadProject({cwd: projectWith(tempDir('rubric-bare', t)), out});
  await assert.rejects(review(bare, {rubric: 'true'}), /review --rubric: the recipe names no rubric — give it one \("rubric": \{"name", "scale"\?, "least"\?, "points": \[/);
  writeFileSync(path.join(bare.cwd, 'rubric.json'), JSON.stringify({name: 'quick', points: [{id: 'look', label: 'It looks finished'}]}));
  const quick = await review(bare, {rubric: 'rubric.json'});
  assert.match(quick.text, /Rubric "quick": .*\nNothing is required of the scores: they are recorded\.\n\n1\. look — It looks finished \(look: settled\)/);
  assert.match(quick.text, /storyreel review --rubric rubric\.json --scores look=N --by/);
  await assert.rejects(review(bare, {rubric: '../outside.json'}), /review --rubric: "\.\.\/outside\.json" is not a file inside the project/);
});

test('the command line: storyreel review --rubric prints the layout and its pictures\' paths', {timeout: 120_000}, t => {
  const dir = projectWith(tempDir('rubric-cli', t), {name: 'quick', points: [{id: 'opening', label: 'The opening', look: 'opening'}]});
  const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [cli, 'review', '--rubric', '--out', path.join(dir, 'out')], {cwd: dir, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1\. opening — The opening \(look: opening\)\n   stills: .*rubric-opening\.png · 0\.00 s, 0\.75 s/);
});

test('a real render\'s record is the film laid out: review --rubric --scores records into it, and the approval reads them', {skip: spawnSync('ffmpeg', ['-version']).error ? 'needs ffmpeg' : false, timeout: 120_000}, async t => {
  const dir = projectWith(tempDir('rubric-real', t), {name: 'quick', least: 7, points: [{id: 'opening', label: 'The opening', look: 'opening'}]}), out = path.join(dir, 'out');
  const p = await loadProject({cwd: dir, out}), full = fullRender(p);
  const made = await makeFilm({...full, render: {...full.render, layout: {...full.render.layout, scale: .5}, quality: 'draft'}});
  assert.deepEqual(JSON.parse(readFileSync(made.makingOf, 'utf8')).rubric, {name: 'quick', scale: [1, 10], points: ['opening'], least: {opening: 7}}, 'the render writes its recipe\'s rubric, unscored');
  assert.throws(() => approveFilm({record: made.makingOf, by: 'Sam'}), /has not been scored/);
  assert.match(await review(p, {rubric: 'true', scores: 'opening=7', by: 'a reviewer'}), /^rubric "quick" scored by a reviewer, recorded in .*making-of\.json: opening 7; every least score met \(opening 7\)$/);
  assert.equal(approveFilm({record: made.makingOf, by: 'Sam'}).by, 'Sam');
});
