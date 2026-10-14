// Every refusal names the fix (test/refusals.mjs): what is wrong AND what to write instead. The scan reads every throw
// in src/; the pins below are refusals that used to say only what was wrong, now held to the fix they name.
import test from 'node:test';
import assert from 'node:assert/strict';
import {refusals, namesFix} from './refusals.mjs';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {validatePacing} from '../src/pacing.mjs';
import {validateTheme} from '../src/theme.mjs';

test('every refusal in src/ names the fix: a value to write, an example, or what to do', () => {
  const all = refusals();
  assert.ok(all.length > 600, `the scan reads the refusals (${all.length})`);
  const silent = all.filter(r => !r.exempt && !r.wraps && !namesFix(r.message)).map(r => `src/${r.file}:${r.line}: ${r.message}`);
  assert.deepEqual(silent, [], 'say what to write instead (a key, a value, an example), or mark an internal invariant `// refusal: internal (why)`');
  // The exemptions stay few, and each says why.
  const exempt = all.filter(r => r.exempt);
  assert.ok(exempt.length <= 15, `${exempt.length} refusals are exempt: ${exempt.map(r => `${r.file}:${r.line}`).join(', ')}`);
  for (const r of exempt) assert.ok(r.exempt.length > 8, `src/${r.file}:${r.line}: say why it names no fix`);
});

test('the scan tells a refusal that names its fix from one that does not', () => {
  for (const said of ['Unknown scene …', 'whiteboard item … draws nothing', 'Pacing scene identity mismatch', '… has unsupported key …', 'checkVideo: … has no picture'])
    assert.equal(namesFix(said), false, said);
  for (const said of ['Unknown scene … (the scenes are …)', 'pacing.sceneTail is missing: give the settle after each scene\'s last word, 0.3–3 seconds (e.g. "sceneTail": 0.8)',
    'part has unsupported key … (a part is {scenes | scene, handles?})', 'quality must be \'draft\' or \'standard\''])
    assert.equal(namesFix(said), true, said);
});

const board = {title: 'Pins', scenes: [{id: 'a', narration: 'One line to say.'}, {id: 'b', silent: [['it goes', 2]]}]};
const compile = recipe => compileFilm({storyboard: board, recipe, timings: evenTimings(board)});

test('the refusals that said only what was wrong now say what to write', async () => {
  const film = await compile({story: {kit: 'whiteboard', items: []}});
  assert.throws(() => film.clock.start('c'), /^Error: Unknown scene c \(the scenes are a, b\)$/);
  await assert.rejects(compile({story: {kit: 'whiteboard', items: [{at: ['a', 'One'], dur: 1}]}}), /whiteboard item 0 draws nothing: give it write: "words", or draw: \[\[shape, …args\], …\] \(the shapes are .*arrow/);
  await assert.rejects(compile({story: {kit: 'whiteboard', items: [{at: ['a', 'One'], dur: 1, draw: [['blob', 1, 2]]}]}}), /Unknown shape blob \(the shapes are /);
  await assert.rejects(compile({story: {kit: 'whiteboard', items: [{at: ['a', 'One'], dur: 1, write: 'hi', colour: 'red'}]}}), /whiteboard item 0 has unsupported key colour \(an item takes at, dur, draw, write, x, y, size, align, color,/);
  await assert.rejects(compile({story: {kit: 'whiteboard', items: [{at: ['a', 'One'], write: 'hi'}]}}), /whiteboard item 0 needs a duration: dur, its seconds of drawing \(e\.g\. "dur": 1\.2\)/);
  await assert.rejects(compile({story: {kit: 'whiteboard', items: []}, stages: [{type: 'recap', scene: 'b', colour: 1}]}), /stage b has unsupported key colour \(it takes .*scene/);
  await assert.rejects(compile({story: {kit: 'whiteboard', items: []}, stages: [{type: 'lens', scene: 'b'}]}), /has type "lens", which no kit provides: pass the kit that adds it \(kits: \[myKit\]\), or use a built-in type \(code, api, recap, summary, world\)/);
  assert.throws(() => validatePacing({voiceSpeed: 1, holds: []}, board), /pacing\.sceneTail is missing: give the settle/);
  assert.throws(() => validatePacing({voiceSpeed: 1, sceneTail: .8}, board), /pacing\.holds is missing: give a list of \{scene, after, seconds\}, or \[\] for none/);
  assert.throws(() => validatePacing({voiceSpeed: 1, sceneTail: .8, holds: [], tails: {c: 1}}, board), /pacing\.tails\.c is not a storyboard scene \(the scenes are a, b\)/);
  assert.throws(() => validatePacing({voiceSpeed: 1, sceneTail: .8, holds: [], pause: 1}, board), /pacing has unsupported key pause \(pacing takes voiceSpeed, sceneTail, holds, tails\)/);
  assert.throws(() => validateTheme({palette: {}}), /theme\.palette\.bg is missing: give it \(theme\.palette needs bg, glow,/);
});
