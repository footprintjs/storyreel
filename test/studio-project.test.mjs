// The studio on a whole project (studio/cli.mjs · projectStudio, tools.mjs · compileProject): a voiced film paced by its
// config, whose words come from the voice and whose Try compiles with the very same timings; a file the config asks to
// be watched compiling the film again; a `watch` that is not a list refused, naming the fix; and a film with a pushIn,
// whose stages hand over on one page, refusing an entrance to Try.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {loadInputs, compileProject} from '../src/tools.mjs';
import {startStudio} from '../src/studio/server.mjs';
import {tempDir} from './tmp.mjs';
import {installed, studioIn, stopped, until} from './studio-run.mjs';

/**
 * A voiced project: two scenes said by a voice (its timings.json, beside no audio: the studio plays the picture only),
 * paced by the config — a hold of 1.5 s after "lands on the voice" — with kinetic words landing on the said words.
 * The pacing is a file the config reads and asks to be watched.
 */
const CONFIG = `import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {kineticKit} from 'footprint-storyreel/kits/kinetic';
const read = name => JSON.parse(readFileSync(new URL('./' + name, import.meta.url), 'utf8'));
export default {film: () => ({storyboard: read('storyboard.json'), recipe: read('recipe.json'), kits: [kineticKit],
  narrationDir: fileURLToPath(new URL('./voice', import.meta.url)), pacing: read('pacing.json'), watch: ['pacing.json']})};
`;
const storyboard = {title: 'Voiced', scenes: [{id: 'one', narration: 'Every word here lands on the voice. Then it waits.'}, {id: 'two', narration: 'The second scene speaks its words too.'}]};
const recipe = {story: {kit: 'kinetic', scene: 'one', words: ['Every', 'word', 'Then', 'waits']},
  stages: [{type: 'world', scene: 'two', enter: 'fade', world: {kit: 'kinetic', scene: 'two', words: ['second', 'words']}}]};
const hold = seconds => ({sceneTail: 1, holds: [{scene: 'one', after: 'lands on the voice', seconds}]});
/** The voice's own word times: not the even ones a silent cut would get. */
const voice = {...evenTimings(storyboard, {wordSeconds: .5, lead: .4, tail: 1}), provider: 'a voice'};

function voicedProject(t) {
  const dir = installed(tempDir('studio-voiced', t));
  mkdirSync(path.join(dir, 'voice'));
  for (const [name, value] of [['storyboard.json', storyboard], ['recipe.json', recipe], ['pacing.json', hold(1.5)], ['voice/timings.json', voice]]) writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2));
  writeFileSync(path.join(dir, 'storyreel.config.mjs'), CONFIG);
  return dir;
}
const said = (scene, text) => scene.words.find(w => w.text === text);
const bytes = async r => Buffer.from(await r.arrayBuffer());

test('a voiced, paced project: the film\'s words come from the voice, paced; Try compiles with the same timings; a watched file compiles it again', async t => {
  const dir = voicedProject(t), project = await loadInputs({cwd: dir}), film = await compileProject(project);
  assert.equal(project.inputs.voiced, true, 'the voice folder has its timings.json');
  const one = film.timings.scenes[0], raw = voice.scenes[0];
  assert.deepEqual([said(one, 'Every').start, said(one, 'voice.').start], [said(raw, 'Every').start, said(raw, 'voice.').start], 'before the hold: the voice\'s own times');
  assert.equal(+(said(one, 'Then').start - said(raw, 'Then').start).toFixed(3), 1.5, 'after it: moved by the hold');
  const run = studioIn(dir);
  try {
    const url = await run.url, shown = await (await fetch(`${url}api/film`)).json();
    assert.equal(shown.error, null);
    assert.deepEqual(shown.scenes.map(s => s.words.map(w => [w.text, w.start])), film.timings.scenes.map((s, i) => s.words.map(w => [w.text, film.clock.offsets[i] + w.start])),
      'the studio\'s words are the paced voice\'s, as compileProject times them');
    assert.match(run.out(), /watching recipe\.json, storyboard\.json, pacing\.json;/);
    // Try a move on scene two: the copy is compiled from the same timings, so scene one is the same picture, frame for frame.
    const tried = await (await fetch(`${url}api/try?scene=two&kind=move&name=pop`)).json();
    assert.deepEqual([tried.line, tried.start, tried.path], ['two move pop', film.clock.start('two'), 'stages[0].world.move']);
    const frame = async (time, key) => bytes(await fetch(`${url}api/frame?t=${time}&w=320${key ? `&try=${key}` : ''}`));
    const held = said(one, 'Then').start - .3;   // in the hold: "word" is up; unpaced, "Then" would have landed by now
    assert.ok(!(await frame(held)).equals(await frame(said(one, 'Then').start + .3)), 'the picture changes when "Then" lands');
    assert.ok((await frame(held)).equals(await frame(held, tried.key)), 'in the hold, the copy shows what the film shows: its words on the same times');
    const lands = film.clock.offsets[1] + said(film.timings.scenes[1], 'second').start + .1;
    assert.ok(!(await frame(lands)).equals(await frame(lands, tried.key)), 'in scene two the word lands another way');
    // A file the config asks to be watched: changed, the film is compiled again with it.
    writeFileSync(path.join(dir, 'pacing.json'), JSON.stringify(hold(2.5)));
    const again = await until(async () => (await fetch(`${url}api/film`)).json(), f => f.version > shown.version);
    assert.equal(+(again.scenes[0].words.find(w => w.text === 'Then').start - said(raw, 'Then').start).toFixed(3), 2.5, 'the longer hold is the film\'s now');
    assert.equal(readFileSync(path.join(dir, 'pacing.json'), 'utf8'), JSON.stringify(hold(2.5)), 'the studio writes nothing');
  } finally { assert.equal(await stopped(run.child), 0); }
});

test('storyreel studio refuses a watch that is not a list of files, naming the fix', async t => {
  const dir = installed(tempDir('studio-watch', t));
  for (const bad of ['\'pacing.json\'', '[\'\']', '[42]']) {
    writeFileSync(path.join(dir, 'storyreel.config.mjs'), `export default {film: () => ({storyboard: {title: 'W', scenes: [{id: 'a', silent: [['words', 1]]}]}, recipe: {story: {kit: 'kinetic', scene: 'a', words: []}}, watch: ${bad}})};\n`);
    const run = studioIn(dir), error = await run.url.then(() => null, e => e);
    if (!error) await stopped(run.child);
    assert.equal(error?.code, 1, `${bad}: ${error?.err}`);
    assert.match(error.err, /storyreel studio: storyreel\.config\.mjs: watch is a list of files the studio compiles again on \(paths from the config's folder, or absolute\), not /);
  }
});

test('a film with a pushIn: its stages hand over on one page, so Try refuses an entrance, and the gallery lists no scene for one', async () => {
  const hello = fileURLToPath(new URL('../examples/hello/', import.meta.url)), read = f => JSON.parse(readFileSync(hello + f, 'utf8'));
  const board = read('storyboard.json'), given = read('recipe.json'), timings = evenTimings(board, {tail: 4});
  assert.ok(given.pushIn, 'the hello film pushes in');
  const compile = r => compileFilm({storyboard: board, timings, recipe: r, root: hello});
  const studio = await startStudio({load: async () => ({film: await compile(given), storyboard: board, recipe: given, compile}), port: 0, log: () => {}});
  try {
    const refused = await fetch(`${studio.url}api/try?scene=rule&kind=enter&name=fade`);
    assert.equal(refused.status, 422);
    assert.match((await refused.json()).error, /^rule enter fade: the film has a pushIn, which hands its stages over on one page, so no stage enters with a transition — enter is for a film without one$/);
    assert.deepEqual((await (await fetch(`${studio.url}api/gallery`)).json()).takes, {enter: [], move: []});
    assert.equal(studio.held().tries, 0, 'nothing compiled');
  } finally { await studio.close(); }
});
