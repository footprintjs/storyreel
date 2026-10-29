// Picks (studio/picks.mjs, studio/apply.mjs, apply-cli.mjs): a choice made by eye in the studio's gallery, kept as one
// line — "scene-05 enter torn", "scene-03 move pop" — and written into the recipe by `storyreel apply` without anyone
// reading it: the line, where it goes (a stage's enter, a kinetic world's move), every refusal naming its reason and its
// fix, nothing applied when any line refuses, the record of each run (every line's checks, decided on a flowchart), and
// only the values set changed in the file's text. End to end on a project that picks its film by a flag (--ep, as a
// series does), the edited recipe compiled before anything is written.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, symlinkSync, realpathSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readPick, pickLine, pickScenes, changeText} from '../src/studio/picks.mjs';
import {applyPicks, applyLines, MOST_LINES} from '../src/studio/apply.mjs';
import {jsonSpans} from '../src/studio/lines.mjs';
import {transitionCatalog, TRANSITION_NAMES} from '../src/transitions.mjs';
import {MOVES, MOVE_NAMES} from '../src/moves.mjs';
import {WORD_MOVES, readWordMove, compileKinetic} from '../src/kits/kinetic/index.mjs';
import {tempDir} from './tmp.mjs';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const repo = fileURLToPath(new URL('..', import.meta.url));
const scenes = ['open', 'shop', 'walk', 'next'];
/** A recipe as a series writes one: a story of its own, world stages coming in by a cut, a fade, nothing; two kinetic worlds. */
const recipe = () => ({
  story: {kit: 'kinetic', scene: 'open', words: ['Hello']},
  stages: [
    {type: 'world', scene: 'shop', enter: 'cut', world: {kit: 'kinetic', scene: 'shop', words: []}},
    {type: 'world', scene: 'walk', enter: {type: 'fade', seconds: .8}, world: {kit: 'cartoon', scene: 'walk'}},
    {type: 'world', scene: 'next', world: {kit: 'cartoon', scene: 'next'}},
  ],
});
const curtain = {family: 'theatre', seconds: 1, ease: 'inOut', sound: null, params: {}, draw(ctx, {e, from, to}) { (e < .5 ? from : to)(ctx); }};
const catalog = transitionCatalog([{name: 'stage', transitions: {curtain}}]);
const film = {scenes, catalog};

test('a pick is one line: the scene, what it sets (enter or move), the name; anything else refuses, naming the form', () => {
  assert.deepEqual(readPick('scene-05 enter torn'), {scene: 'scene-05', kind: 'enter', name: 'torn', line: 'scene-05 enter torn'});
  assert.deepEqual(readPick('  my scene   move   pop '), {scene: 'my scene', kind: 'move', name: 'pop', line: 'my scene move pop'}, 'the scene is what comes before the last two words');
  assert.equal(pickLine({scene: 'scene-05', kind: 'move', name: 'pop'}), 'scene-05 move pop');
  for (const bad of ['', 'scene-05', 'scene-05 enter', 'scene-05 fade torn', 'scene-05 enter torn now', 'a\nb enter torn', 42, null]) {
    assert.throws(() => readPick(bad), /is not a pick: write "<scene> enter <transition>" or "<scene> move <move>" \(e\.g\. "scene-05 enter torn"\)/, JSON.stringify(bad));
  }
});

test('where a pick goes: enter on the stage that plays the scene, move on the scene\'s kinetic world — the caller\'s recipe untouched', async () => {
  const given = recipe(), before = JSON.stringify(given);
  const {recipe: out, changes} = await applyPicks(given, ['shop enter torn', 'walk enter curtain', 'next enter fade', 'open move pop', {scene: 'shop', kind: 'move', name: 'blur-in'}], film);
  assert.equal(JSON.stringify(given), before, 'a copy: the recipe given is never edited');
  assert.deepEqual(out.stages.map(s => s.enter), ['torn', 'curtain', 'fade'], 'a kit\'s transition is a pick too; settings given before are replaced by the name');
  assert.deepEqual(Object.keys(out.stages[2]), ['type', 'scene', 'enter', 'world'], 'an entrance not there before goes beside its scene');
  assert.deepEqual([out.story.move, out.stages[0].world.move], ['pop', 'blur-in']);
  assert.deepEqual(changes.map(c => [c.path, changeText(c)]), [
    ['stages[0].enter', 'shop enter: cut → torn'], ['stages[1].enter', 'walk enter: {"type":"fade","seconds":0.8} → curtain'],
    ['stages[2].enter', 'next enter: (not set) → fade'], ['story.move', 'open move: (not set) → pop'], ['stages[0].world.move', 'shop move: (not set) → blur-in']]);
  const twice = await applyPicks(given, ['shop enter torn', 'shop enter fade'], film);
  assert.equal(twice.recipe.stages[0].enter, 'fade', 'in order: a later pick of the same scene and kind wins');
  assert.deepEqual(twice.changes.map(changeText), ['shop enter: cut → torn', 'shop enter: torn → fade']);
  assert.deepEqual(pickScenes(given), {enter: ['shop', 'walk', 'next'], move: ['open', 'shop']});
  assert.deepEqual(pickScenes({...given, pushIn: {}}).enter, [], 'a film with a pushIn: no stage enters with a transition');
  // A word move goes by the scene whose words the world follows — its own scene, which need not be its stage's.
  const follows = {stages: [{type: 'world', scene: 'shop', world: {kit: 'kinetic', scene: 'walk', words: []}}, {type: 'world', scene: 'next', world: {kit: 'kinetic', words: []}}]};
  assert.deepEqual(pickScenes(follows), {enter: ['shop', 'next'], move: ['walk', 'next']}, 'a world that names no scene of its own goes by its stage\'s');
  const moved = await applyPicks(follows, ['walk move pop', 'next move slam'], film);
  assert.deepEqual(moved.changes.map(c => c.path), ['stages[0].world.move', 'stages[1].world.move']);
  assert.deepEqual(Object.keys(moved.recipe.stages[1].world), ['kit', 'move', 'words'], 'a world with no scene: the move goes beside its kit');
  await assert.rejects(applyPicks(follows, ['shop move pop'], film), /shop move pop: its scene has no kinetic world .* — the scenes with one are walk, next/);
});

test('every refusal says its reason (the rule\'s label) and its fix; every line is checked before any is applied', async () => {
  const refuses = (lines, pattern, r = recipe()) => assert.rejects(applyPicks(r, lines, film), pattern, lines.join(' | '));
  await refuses(['attic enter torn'], /^Error: attic enter torn: its scene is not in the storyboard — the scenes are open, shop, walk, next$/);
  await refuses(['open enter torn'], /open enter torn: no stage plays its scene, so nothing enters there \(the story opens the film; a scene with no stage stays in the shot before it\) — a transition goes on a stage's scene: shop, walk, next/);
  await refuses(['shop enter swirl'], new RegExp(`shop enter swirl: its name is not a transition of this film — the transitions are ${[...TRANSITION_NAMES, 'curtain'].join(', ')}`));
  await refuses(['shop enter match'], /shop enter match: its transition needs a setting a line cannot give \(a pick takes a transition's defaults\) — a match needs enter\.region: .*; give this one in the recipe \("enter": \{"type": "match", …\}\)/);
  await refuses(['shop enter torn'], /shop enter torn: the film has a pushIn, which hands its stages over on one page, so no stage enters with a transition — enter is for a film without one/, {...recipe(), pushIn: {}});
  await refuses(['walk move pop'], /walk move pop: its scene has no kinetic world \(kits\/kinetic\), so there is no word to move — the scenes with one are open, shop/);
  await refuses(['shop move pop'], /this film has none: a word move is for kinetic type/, {stages: [{type: 'world', scene: 'shop', world: {kit: 'cartoon'}}]});
  // A word move is the kinetic kit's own rule (readWordMove): its refusal, in its own words, is the line's.
  await refuses(['shop move drop-in'], /^Error: shop move drop-in: kinetic move "drop-in" is not an entrance a whole word makes — name one that is \(fade-slide, soft-rise, mask-wipe, pop, blur-in, slam\)$/);
  await refuses(['shop move wobble'], /^Error: shop move wobble: kinetic move "wobble" is not a move — name one a whole word makes \(fade-slide, soft-rise, mask-wipe, pop, blur-in, slam\)$/);
  await refuses(['shop fade torn'], /^Error: "shop fade torn" is not a pick: write/);
  const r = recipe(), refused = await applyPicks(r, ['shop enter torn', 'attic enter torn', 'nonsense', 'open move pop'], film).catch(e => e);
  assert.match(refused.message, /^2 of 4 lines refuse:\n {2}attic enter torn: its scene is not in the storyboard.*\n {2}"nonsense" is not a pick/);
  assert.equal(refused.refusals.length, 2);
  assert.deepEqual(r, recipe(), 'nothing is applied');
  await assert.rejects(applyPicks(r, Array(MOST_LINES + 1).fill('shop enter torn'), film), /at most 200 lines at once, not 201/);
  await assert.rejects(applyPicks(r, [], film), /give the lines \(a list of one or more\)/);
});

test('each run keeps its record: every line, its kind and the rule that took it or refused it, in plain JSON', async () => {
  const {record} = await applyPicks(recipe(), ['shop enter torn', 'open move pop'], film);
  assert.deepEqual(record, JSON.parse(JSON.stringify(record)), 'plain JSON');
  const decisions = record.filter(e => e.type === 'condition').map(e => [e.stageId, e.text]);
  assert.deepEqual(decisions.map(([id]) => id), ['kind', 'check', 'more', 'kind', 'check', 'more']);
  assert.match(decisions[0][1], /"shop enter torn: an entrance: it sets the enter of the stage that plays its scene"/);
  assert.match(decisions[1][1], /"shop enter torn: its scene takes it, and its name is one this film has"/);
  assert.match(decisions[3][1], /"open move pop: a word move: it sets the move of its scene's kinetic world"/);
  const refused = await applyPicks(recipe(), ['open enter torn'], film).catch(e => e);
  assert.ok(refused.record.some(e => e.type === 'condition' && /open enter torn: no stage plays its scene.*stagePlays false eq false ✓, and chose refused/.test(e.text)), 'a refusal keeps its record too: which rule refused, over which facts');
});

test('the moves a whole word makes are one rule, the kinetic kit\'s: each one draws a word, every other move refuses', async () => {
  assert.deepEqual(WORD_MOVES, MOVE_NAMES.filter(n => { try { readWordMove(n, 'x'); return true; } catch { return false; } }));
  assert.deepEqual(WORD_MOVES, ['fade-slide', 'soft-rise', 'mask-wipe', 'pop', 'blur-in', 'slam']);
  for (const move of WORD_MOVES) {
    assert.ok(MOVES[move].uses.includes('text') && MOVES[move].kind === 'entrance', move);
    assert.doesNotThrow(() => compileKinetic({words: [{text: 'Word', at: ['s', 'p']}], move}, {at: () => .2, total: 2}), move);
  }
  assert.throws(() => readWordMove('wobble', 'x'), /x: kinetic move "wobble" is not a move — name one a whole word makes \(fade-slide, soft-rise, mask-wipe, pop, blur-in, slam\)/);
  // A line takes every move the kit takes, and refuses every other in the kit's own words.
  const kitSays = line => { try { readWordMove(line.split(' ')[2], line); return null; } catch (e) { return e.message; } };
  for (const move of MOVE_NAMES) assert.equal(await applyPicks(recipe(), [`shop move ${move}`], film).then(() => null, e => e.message), kitSays(`shop move ${move}`), move);
});

test('applyLines: the recipe\'s text in, the new text out — only the values set changed, every other byte as it was; no file is read or written', async () => {
  const r = recipe(), lines = ['shop enter torn'], expected = (await applyPicks(r, lines, film)).recipe;
  // As JSON.stringify writes it (two spaces, four, a tab, one line; a final line break or none): still JSON.stringify's.
  for (const [gap, layout] of [[2, 'two spaces'], [4, 'four spaces'], ['\t', 'a tab'], ['', 'one line']]) {
    for (const end of ['\n', '']) {
      const out = await applyLines(`${JSON.stringify(r, null, gap)}${end}`, lines, film);
      assert.equal(out.text, `${JSON.stringify(expected, null, gap)}${end}`, `${layout}${end ? ', a final line break' : ''}`);
      assert.equal(out.changes.length, 1); assert.ok(out.record.length > 10);
      assert.deepEqual(out.recipe, expected);
    }
  }
  // Any other layout — short lists on one line (as prettier writes them), numbers as a person wrote them, a line ending
  // of its own — is kept too: a value set is replaced where it stands, and a key not there goes beside its scene, on a
  // line of its own with its neighbours' indent and line ending, or inline beside it.
  const written = ['{',
    '  "story": { "kit": "kinetic", "scene": "open", "words": ["Hello", "there"], "colors": ["#f3eee3", "#1a1a1a"], "size": 4.80e2 },',
    '  "stages": [',
    '    { "type": "world", "scene": "shop", "enter": "cut", "world": { "kit": "kinetic", "scene": "shop", "words": [] } },',
    '    {', '      "type": "world",', '      "scene": "walk",', '      "enter": { "type": "fade", "seconds": 0.80 },', '      "world": { "kit": "cartoon", "scene": "walk" }', '    },',
    '    {', '      "type": "world",', '      "scene": "next",', '      "world": { "kit": "cartoon", "scene": "next" }', '    }',
    '  ]', '}', ''].join('\n');
  const four = ['shop enter torn', 'walk enter fade', 'next enter iris', 'open move pop'];
  /** The text with exactly the four changes, each in the layout around it. */
  const changed = (text, eol, indent) => text.replace('"scene": "open", "words"', '"scene": "open", "move": "pop", "words"').replace('"enter": "cut"', '"enter": "torn"')
    .replace('"enter": { "type": "fade", "seconds": 0.80 }', '"enter": "fade"').replace(`"scene": "next",${eol}`, `"scene": "next",${eol}${indent}"enter": "iris",${eol}`);
  const tabs = written.replace(/^( +)/gm, m => '\t'.repeat(m.length / 2)), crlf = written.replaceAll('\n', '\r\n');
  for (const [text, eol, indent, layout] of [[written, '\n', '      ', 'short lists on one line'], [crlf, '\r\n', '      ', 'CRLF line endings'], [tabs, '\n', '\t\t\t', 'tabs']]) {
    const out = await applyLines(text, four, film);
    assert.equal(out.text, changed(text, eol, indent), layout);
    assert.equal(out.text.split(eol).length, text.split(eol).length + 1, `${layout}: one line more, the entrance put beside its scene`);
  }
  // On one line (as JSON.stringify writes it compact): the line is the same but for the four values.
  const compact = JSON.stringify(JSON.parse(written)), out = (await applyLines(compact, four, film)).text;
  assert.equal(out, compact.replace('"scene":"open","words"', '"scene":"open","move":"pop","words"').replace('"enter":"cut"', '"enter":"torn"')
    .replace('"enter":{"type":"fade","seconds":0.8}', '"enter":"fade"').replace('"scene":"next","world"', '"scene":"next","enter":"iris","world"'));
  // Two lines for one scene and kind: the later wins, set once (a key not there is put in once, with the later value).
  const twice = await applyLines(written, ['shop enter torn', 'next enter iris', 'shop enter fade', 'next enter wipe'], film);
  assert.equal(twice.text, written.replace('"enter": "cut"', '"enter": "fade"').replace('"scene": "next",\n', '"scene": "next",\n      "enter": "wipe",\n'));
  assert.deepEqual(twice.changes.map(changeText), ['shop enter: cut → torn', 'next enter: (not set) → iris', 'shop enter: torn → fade', 'next enter: iris → wipe']);
  // Where each value is: its text's offsets, and a member's key.
  const spans = jsonSpans(written), at = p => written.slice(spans.get(p).start, spans.get(p).end);
  assert.deepEqual([at('stages[1].enter'), at('story.size'), at('story.words'), written.slice(spans.get('stages[1].enter').keyStart, spans.get('stages[1].enter').keyEnd)],
    ['{ "type": "fade", "seconds": 0.80 }', '4.80e2', '["Hello", "there"]', '"enter"']);
  assert.equal(spans.get('stages[2].scene').line, 13);
  await assert.rejects(applyLines('{"story":', lines, film), /the recipe is not JSON/);
  await assert.rejects(applyLines(written, ['attic enter torn'], film), /its scene is not in the storyboard/);
});

// ── storyreel apply, end to end ──────────────────────────────────────────────────────────────────────────────────────
/** A project folder that loads footprint-storyreel as an installed package (this checkout). */
function project(dir, files) {
  mkdirSync(path.join(dir, 'node_modules'), {recursive: true});
  symlinkSync(repo, path.join(dir, 'node_modules', 'footprint-storyreel'), 'dir');
  for (const [name, text] of Object.entries(files)) { mkdirSync(path.dirname(path.join(dir, name)), {recursive: true}); writeFileSync(path.join(dir, name), text); }
  return dir;
}
/**
 * A series' config: --ep picks the episode, whose storyboard and recipe are in a folder of its own; a kit adds a curtain,
 * and a door — a transition that goes through the door in the picture it arrives at, which no picture here has: a line
 * that passes every check, and a film that refuses to compile with it.
 */
const SERIES = `import {readFileSync} from 'node:fs';
import {evenTimings} from 'footprint-storyreel';
import {kineticKit} from 'footprint-storyreel/kits/kinetic';
const curtain = {family: 'theatre', seconds: 1, ease: 'inOut', sound: null, params: {}, draw(ctx, {e, from, to}) { (e < .5 ? from : to)(ctx); }};
const door = {...curtain, regions: () => ({to: ['door']})};
const read = (ep, name) => JSON.parse(readFileSync(new URL(\`./\${ep}/\${name}\`, import.meta.url), 'utf8'));
export default {film: ({ep = 'ep00'} = {}) => {
  if (!/^ep\\d\\d$/.test(ep)) throw new Error('no episode ' + ep);
  const storyboard = read(ep, 'storyboard.json');
  return {storyboard, recipe: read(ep, 'recipe.json'), kits: [kineticKit, {name: 'stage', transitions: {curtain, door}}], timings: evenTimings(storyboard, {tail: 0})};
}};
`;
const episode = {title: 'Ep', scenes: [{id: 'open', silent: [['first words', 1.5]]}, {id: 'shop', silent: [['second words', 1.5]]}, {id: 'walk', silent: [['third words', 1.5]]}]};
const episodeRecipe = {story: {kit: 'kinetic', scene: 'open', words: [{text: 'ONE', at: ['open', 'first']}]},
  stages: [{type: 'world', scene: 'shop', enter: 'cut', world: {kit: 'kinetic', scene: 'shop', words: [{text: 'TWO', at: ['shop', 'second']}]}},
    {type: 'world', scene: 'walk', enter: {type: 'fade', seconds: .5}, world: {kit: 'kinetic', scene: 'walk', words: []}}]};
const apply = (cwd, ...args) => spawnSync(process.execPath, [cli, 'apply', ...args], {cwd, encoding: 'utf8'});

test('storyreel apply on a series: --ep picks the film, --recipe names its file, a kit\'s transition is a pick, only the values set change', t => {
  const other = {...episodeRecipe, stages: episodeRecipe.stages.slice(0, 1)};
  const dir = project(tempDir('apply', t), {'storyreel.config.mjs': SERIES, 'ep01/storyboard.json': JSON.stringify(episode), 'ep01/recipe.json': `${JSON.stringify(episodeRecipe, null, 2)}\n`,
    'ep00/storyboard.json': JSON.stringify(episode), 'ep00/recipe.json': JSON.stringify(other)});
  const file = path.join(realpathSync(dir), 'ep01', 'recipe.json'), before = readFileSync(file, 'utf8'), flags = ['--ep', 'ep01', '--recipe', 'ep01/recipe.json'];
  const done = apply(dir, 'shop enter curtain', 'walk enter torn', 'open move pop', ...flags);
  assert.equal(done.status, 0, done.stderr);
  assert.equal(done.stdout, `shop enter: cut → curtain\nwalk enter: {"type":"fade","seconds":0.5} → torn\nopen move: (not set) → pop\n${file}: 3 changes written\n`);
  const after = readFileSync(file, 'utf8'), written = JSON.parse(after);
  assert.deepEqual([written.stages.map(s => s.enter), written.story.move], [['curtain', 'torn'], 'pop']);
  assert.equal(after, `${JSON.stringify(written, null, 2)}\n`, 'written as it was: JSON.stringify\'s layout, two spaces');
  assert.equal(after, before.replace('"enter": "cut"', '"enter": "curtain"').replace(/"enter": \{[^}]*\}/, '"enter": "torn"').replace('"scene": "open",\n', '"scene": "open",\n    "move": "pop",\n'), 'only the three values');
  assert.equal(after.split('\n').length, before.split('\n').length - 3 + 1, 'the fade\'s four lines are one, and the story has one line more');
  // Every refusal writes nothing, and names its reason and its fix.
  const unchanged = (r, pattern) => { assert.equal(r.status, 2, r.stdout); assert.match(r.stderr, pattern); assert.match(r.stderr, /Nothing was written\./); assert.equal(readFileSync(file, 'utf8'), after); };
  unchanged(apply(dir, 'shop enter fade', 'attic enter fade', ...flags), /attic enter fade: its scene is not in the storyboard — the scenes are open, shop, walk/);
  unchanged(apply(dir, 'open enter fade', ...flags), /open enter fade: no stage plays its scene/);
  unchanged(apply(dir, 'shop enter swirl', ...flags), /its name is not a transition of this film — the transitions are .*, morph, curtain/);
  unchanged(apply(dir, 'walk move drop-in', ...flags), /walk move drop-in: kinetic move "drop-in" is not an entrance a whole word makes — name one that is/);
  // A line every check takes, in a film that then refuses to compile: said in the compile's words, nothing written.
  unchanged(apply(dir, 'shop enter fade', 'walk enter door', ...flags), /storyreel apply: the recipe with these lines does not compile: stage walk: the door looks for "door" in the picture it arrives at, and nothing in the picture is called "door"/);
  unchanged(apply(dir, 'shop fade', ...flags), /"shop fade" is not a pick/);
  // The file must be the recipe the film reads with these flags: without --ep the config gives another film.
  unchanged(apply(dir, 'shop enter fade', '--recipe', 'ep01/recipe.json'), /ep01\/recipe\.json is not the recipe storyreel\.config\.mjs's film\(\) gives with these flags: give the flags that pick its film/);
  unchanged(apply(dir, 'shop enter fade', '--ep', 'ep01'), /no recipe file at .*recipe\.json: name the JSON file storyreel\.config\.mjs's film\(\) reads its recipe from \(--recipe file\)/);
  // The command line.
  const usage = (r, pattern) => { assert.equal(r.status, 2); assert.match(r.stderr, pattern); };
  usage(apply(dir), /give the lines to apply, each in quotes/);
  usage(apply(dir, '--ep', 'ep01', 'shop enter fade'), /"shop enter fade" comes after a flag: give the lines first/);
  usage(apply(dir, 'shop enter fade', '--recipe'), /--recipe needs the recipe's JSON file/);
  assert.equal(apply(dir, 'shop enter fade', '--ep', 'ep99').status, 1, 'a film the config cannot give: the project cannot be read');
  assert.equal(readFileSync(file, 'utf8'), after);
  // Two lines for one scene and kind: the later wins.
  const again = apply(dir, 'shop enter fade', 'shop enter wipe', ...flags);
  assert.equal(again.stdout, `shop enter: curtain → fade\nshop enter: fade → wipe\n${file}: 2 changes written\n`, again.stderr);
  assert.equal(readFileSync(file, 'utf8'), after.replace('"enter": "curtain"', '"enter": "wipe"'));
});

test('storyreel apply --record: one JSON object — the file, whether it was written, the changes or the refusals, and the record', t => {
  const dir = project(tempDir('apply-record', t), {'storyreel.config.mjs': SERIES, 'ep00/storyboard.json': JSON.stringify(episode), 'ep00/recipe.json': JSON.stringify(episodeRecipe)});
  const file = path.join(realpathSync(dir), 'ep00', 'recipe.json');
  const done = apply(dir, 'shop enter torn', '--record', '--recipe', 'ep00/recipe.json');
  assert.equal(done.status, 0, done.stderr);
  const report = JSON.parse(done.stdout);
  assert.deepEqual([report.file, report.written, report.changes, report.refusals], [file, true, ['shop enter: cut → torn'], []]);
  assert.ok(report.record.some(e => e.type === 'condition' && /shop enter torn: its scene takes it/.test(e.text)));
  assert.equal(readFileSync(file, 'utf8'), `${JSON.stringify({...episodeRecipe, stages: [{...episodeRecipe.stages[0], enter: 'torn'}, episodeRecipe.stages[1]]})}`, 'one line, as it was');
  const refused = apply(dir, 'open enter torn', '--record', '--recipe', 'ep00/recipe.json'), shown = JSON.parse(refused.stdout);
  assert.equal(refused.status, 2);
  assert.deepEqual([shown.written, shown.changes, shown.refusals.length], [false, [], 1]);
  assert.ok(shown.record.some(e => /open enter torn: no stage plays its scene/.test(e.text)), 'the record says which rule refused');
  const broken = apply(dir, 'walk enter door', '--record', '--recipe', 'ep00/recipe.json'), said = JSON.parse(broken.stdout);
  assert.deepEqual([broken.status, said.written, said.refusals.length], [2, false, 1]);
  assert.match(said.refusals[0], /^the recipe with this line does not compile: stage walk: the door looks for "door"/);
  assert.ok(said.record.some(e => /walk enter door: its scene takes it/.test(e.text)), 'the checks took it: their record, and then the compile\'s refusal');
});
