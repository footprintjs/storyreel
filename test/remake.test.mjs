// Make one like it (remake.mjs): a breakdown's spec read as a draft plan — its shots grouped into scenes (a run of quick
// shots joined by hard cuts is one), the pace, how each scene comes in, whether its song times it — every choice with its
// why. Specs written here, whose answers are known; and one breakdown of a film made with FFmpeg, planned end to end.
import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PACE_NAMES, TRANSITION_NAMES} from 'footprint-story/motion';
import {remakePlan, remakePlanText, REMAKE, SCENE_KINDS, breakdown} from '../src/breakdown.mjs';
import {MUSIC} from '../src/music.mjs';
import {compileKinetic} from '../src/kits/kinetic/index.mjs';
import {tempDir} from './tmp.mjs';
import {NOT_READ, shot, specOf, quickWords, beatsOf, makeReference, skip} from './remake-specs.mjs';

test('a run of quick shots joined by hard cuts is one scene; a held shot is a scene of its own; each scene says what it is and why', async () => {
  const spec = specOf([...quickWords(4), shot(2), shot(.4), shot(.4), shot(.4, {text: true}), shot(2, {text: true}), shot(2, {motion: 'camera', camera: 'left'}), shot(2, {motion: 'inside'}), shot(.5, {blank: true}), shot(2)]);
  const plan = await remakePlan(spec);
  assert.deepEqual(plan.scenes.map(x => [x.id, x.kind, x.shots]), [
    ['scene-01', 'kinetic', [1, 2, 3, 4]], ['scene-02', 'still', [5]], ['scene-03', 'montage', [6, 7, 8]], ['scene-04', 'title', [9]],
    ['scene-05', 'camera', [10]], ['scene-06', 'moving', [11]], ['scene-07', 'blank', [12]], ['scene-08', 'still', [13]]]);
  const [kinetic, , montage] = plan.scenes;
  assert.equal(kinetic.why.because, 'a run of quick shots, 50 % or more of them lettered: kinetic type, a word a shot');
  assert.deepEqual(kinetic.why.rules[0], {then: 'kinetic', met: true, checks: ['shots 4 ≥ 2 ✓', 'lettered 1 ≥ 0.5 ✓']});
  assert.deepEqual(montage.why.rules.slice(0, 2).map(r => [r.then, r.met, r.checks]), [['kinetic', false, ['shots 3 ≥ 2 ✓', 'lettered 0.333 ≥ 0.5 ✗']], ['montage', true, ['shots 3 ≥ 2 ✓']]]);
  assert.deepEqual([kinetic.from, kinetic.to, kinetic.seconds], [0, 1.2, 1.2]);
  assert.deepEqual([kinetic.starts, montage.starts], [[0, .3, .6, .9], [3.2, 3.6, 4]], 'when each of its shots starts: where a starter lands its cards');
  // What a breakdown cannot know is still to give: words and pictures by scene, the camera's way, nothing for plain ground.
  assert.deepEqual(plan.todo.filter(x => x.scene).map(x => [x.scene, x.give, x.what]), [
    ['scene-01', 'words', '4 words, one a shot, in the order they land'], ['scene-02', 'pictures', 'a picture'], ['scene-03', 'pictures', '3 pictures, one a shot'],
    ['scene-04', 'words', 'the words it holds on screen'], ['scene-05', 'pictures', 'a picture for the camera to move over (it moves left)'],
    ['scene-06', 'pictures', 'a moving picture: footage, or a world that moves'], ['scene-08', 'pictures', 'a picture']]);
  assert.deepEqual([...SCENE_KINDS], ['kinetic', 'montage', 'blank', 'title', 'still', 'camera', 'moving']);
});

test('how each scene comes in is the reference\'s own, as a stage names it; quicker than any transition is a cut; the first scene is where the film starts', async () => {
  const spec = specOf([shot(2, {enter: 'fade-in', took: .5}), shot(2, {enter: 'dissolve', took: .07}), shot(2, {enter: 'dissolve', took: .5}), shot(2, {enter: 'fade-in', took: .3}),
    shot(2, {enter: 'dissolve', took: 6}), shot(2, {enter: 'dip'}), ...quickWords(2), shot(.3, {enter: 'dissolve', took: .5, text: true}), shot(.3, {text: true})]);
  const plan = await remakePlan(spec);
  assert.deepEqual(plan.scenes.map(x => [x.in, x.enter]), [['fade-in', null], ['dissolve', 'cut'], ['dissolve', {type: 'fade', seconds: .5}], ['fade-in', {type: 'dip', seconds: .3}],
    ['dissolve', {type: 'fade', seconds: 4}], ['dip', 'dip'], ['cut', 'cut'], ['dissolve', {type: 'fade', seconds: .5}]]);
  assert.deepEqual(plan.scenes.map(x => x.enterWhy), ['the reference opens with a fade in (0.5 s); a film here starts on its first picture',
    'the reference dissolves to it in 0.07 s, quicker than any transition takes (0.2 s): a cut', 'the reference dissolves to it in 0.5 s: a fade',
    'the reference fades it in from one colour in 0.3 s: a dip', 'the reference dissolves to it in 6 s: a fade of 4 s, the longest a transition takes',
    'the reference dips through one colour to it: a dip', 'the reference cuts to it', 'the reference dissolves to it in 0.5 s: a fade']);
  // A dissolve ends a run of quick shots: the words on either side of it are two scenes.
  assert.deepEqual(plan.scenes.slice(-2).map(x => x.shots), [[7, 8], [9, 10]]);
  for (const x of plan.scenes) if (x.enter) assert.ok(TRANSITION_NAMES.includes(typeof x.enter === 'string' ? x.enter : x.enter.type), `${x.id}: ${JSON.stringify(x.enter)} is a transition`);
  // The entrance most scenes take, said once.
  assert.deepEqual(plan.enter, {type: 'fade', scenes: 3, of: 7});
});

test('the pace: a promo when half the shots are short or it cuts often, else a lesson — with the numbers that decided it', async () => {
  const fast = await remakePlan(specOf([...quickWords(6), shot(2)]));
  assert.deepEqual([fast.pace.name, fast.pace.why.because, fast.pace.why.rules[0].checks], ['promo', 'half its shots last less than 1.5 s: a promo\'s pace', ['median 0.3 < 1.5 ✓']]);
  // Shots of 1.6 s: half are not short, but it cuts more than 30 times a minute.
  const often = await remakePlan(specOf(Array.from({length: 8}, () => shot(1.6))));
  assert.deepEqual([often.pace.name, often.pace.why.rules.map(r => r.met)], ['promo', [false, true]]);
  const slow = await remakePlan(specOf([shot(4), shot(5), shot(6)]));
  assert.equal(slow.pace.name, 'lesson');
  assert.match(slow.pace.why.because, /a lesson's pace$/);
  for (const plan of [fast, slow]) assert.ok(PACE_NAMES.includes(plan.pace.name), `${plan.pace.name} is a pace a recipe names`);
});

/** Beats as a breakdown reports them: `on` of `of` judged cuts on a beat. */
test('music: a film cut to its song is timed by it — each scene\'s bars at its tempo, a kinetic scene a beat a word at least', async () => {
  // 120 BPM: a bar is 2 s. 4 words in 1.2 s round to one bar; 9 words need three bars (4 beats a bar), one beat apart.
  const plan = await remakePlan(specOf([...quickWords(4), shot(4.2), ...quickWords(9)], {beats: beatsOf({on: 3, of: 4})}));
  assert.equal(plan.music.verdict, 'music-first');
  assert.deepEqual(plan.music.why.rules.at(-1), {then: 'music-first', met: true, checks: ['judgedCuts 4 > 0 ✓', 'onBeatShare 0.75 ≥ 0.5 ✓']});
  assert.deepEqual(plan.scenes.map(x => [x.kind, x.bars, x.every]), [['kinetic', 1, 1], ['still', 2, undefined], ['kinetic', 3, 1]]);
  assert.equal(plan.music.seconds, 12);
  // A montage is a run too: a beat a picture at least (6 pictures in 1.8 s round to one bar, which has 4 beats: two bars).
  const pictures = await remakePlan(specOf([shot(4), ...Array.from({length: 6}, () => shot(.3))], {beats: beatsOf({on: 3, of: 4})}));
  assert.deepEqual(pictures.scenes.map(x => [x.kind, x.bars, x.every]), [['still', 2, undefined], ['montage', 2, 1]]);
  assert.match(remakePlanText(pictures), /\| 2, a picture every 1 beat \|/);
  assert.deepEqual(plan.todo.filter(x => !x.scene), [{give: 'song', what: 'a song at about 120 BPM, and its beat map (beatMap): beatTimings times the film by it'}]);
  // Fewer than half on a beat: its cuts follow the picture; its words time it.
  const under = await remakePlan(specOf([shot(2), shot(2)], {beats: beatsOf({on: 1, of: 4})}));
  assert.deepEqual([under.music.verdict, under.scenes[0].bars, under.todo.map(x => x.give)], ['song-under', undefined, ['pictures', 'pictures', 'timing']]);
});

test('music first stays inside what beatTimings and the kinetic kit take: at most 64 bars a scene (a longer one is to split), at most 8 beats between words', async () => {
  // 140 BPM: a bar is 1.71 s, so a 150 s shot is 88 bars — cut to 64, and the to-do says to split it.
  const long = await remakePlan(specOf([shot(150), shot(2)], {beats: beatsOf({bpm: 140, on: 1, of: 1})}));
  assert.deepEqual([long.scenes[0].bars, long.scenes[0].longer], [MUSIC.mostBars, 88]);
  assert.deepEqual(long.todo.find(x => x.give === 'split'), {scene: 'scene-01', give: 'split', what: 'it lasts 88 bars at 140 BPM, more than the 64 a scene takes: split it into scenes, or keep 64 bars'});
  // Two quick words read as one scene with a long cut-off: 30 s at 120 BPM is 15 bars, 30 beats a word — kept at 8.
  const slow = await remakePlan(specOf([shot(30, {text: true}), shot(30, {text: true})], {beats: beatsOf({on: 1, of: 1})}), {thresholds: {quick: 40}});
  assert.deepEqual([slow.scenes[0].kind, slow.scenes[0].bars, slow.scenes[0].every], ['kinetic', 30, MUSIC.mostEvery]);
  // The kinetic kit refuses past the same 8 (it keeps its own copy of the number, off the song's I/O).
  assert.throws(() => compileKinetic({words: ['a'], on: 'beats', every: MUSIC.mostEvery + 1}, {}), new RegExp(`a whole number 1–${MUSIC.mostEvery},`));
});

test('music: an unsure tempo is settled first; beats not read are read first (when there is sound); every one says what to do', async () => {
  const unsure = await remakePlan(specOf([shot(2)], {beats: beatsOf({on: 4, of: 4, sure: false})}));
  assert.equal(unsure.music.verdict, 'unsure');
  assert.deepEqual(unsure.todo.filter(x => !x.scene).map(x => x.what), ['the tempo you hear: storyreel breakdown ref.mp4 --beats --bpm <n>, then plan again', 'what times the words: a voice (narration), or evenTimings for a silent film']);
  const notRead = await remakePlan(specOf([shot(2)]));
  assert.deepEqual([notRead.music.verdict, notRead.music.notRead, notRead.todo.filter(x => !x.scene).map(x => x.give)], ['not-read', NOT_READ.why, ['beats', 'timing']]);
  const silent = await remakePlan(specOf([shot(2)], {sound: false, beats: {ran: false, why: 'the video has no sound'}}));
  assert.deepEqual(silent.todo.filter(x => !x.scene).map(x => x.give), ['timing']);
  // No cut judged (no music where the cuts are): never music first.
  const none = await remakePlan(specOf([shot(2), shot(2)], {beats: {...beatsOf({on: 0, of: 0})}}));
  assert.equal(none.music.verdict, 'song-under');
});

test('flashes are kept with the scene they fall in; the thresholds are the plan\'s own, and a quicker cut-off makes more scenes', async () => {
  const spec = specOf([...quickWords(3), shot(1.2, {text: true}), shot(1.2, {text: true}), shot(3)], {flashes: [.4, 3.1, 9]});
  const plan = await remakePlan(spec);
  assert.deepEqual(plan.scenes.map(x => x.flashes ?? []), [[.4], [], [3.1], []]);
  assert.deepEqual(plan.thresholds, REMAKE);
  const longer = await remakePlan(spec, {thresholds: {quick: 1.5}});
  assert.deepEqual(longer.scenes.map(x => [x.kind, x.shots.length]), [['kinetic', 5], ['still', 1]]);
  assert.equal(longer.thresholds.quick, 1.5);
});

test('the record keeps every choice as a decision with its evidence, each scene\'s named', async () => {
  const plan = await remakePlan(specOf([...quickWords(2), shot(2)]));
  const decisions = plan.record.filter(e => e.type === 'condition').map(e => e.text);
  assert.ok(decisions.some(t => /half its shots last less than 1\.5 s/.test(t)), decisions.join('\n'));
  assert.ok(decisions.some(t => /scene 1 at 0 s: a run of quick shots/.test(t)), decisions.join('\n'));
  assert.ok(decisions.some(t => /scene 2 at 0\.6 s: one shot, nothing in it moving/.test(t)), decisions.join('\n'));
  assert.doesNotThrow(() => structuredClone(plan));
});

test('the plan in words: the choices with their numbers, the scenes, the entrances that are not cuts, flashes, and what is still to give', async () => {
  const plan = await remakePlan(specOf([...quickWords(3), shot(2, {enter: 'dissolve', took: .5}), shot(2), shot(2)], {flashes: [.2]}));
  const text = remakePlanText(plan);
  assert.match(text, /^# Make one like ref\.mp4\n\nA draft plan from its breakdown: 6 shots in 6\.9 s, as 4 scenes\. Nothing is made from it until you approve it\./);
  assert.match(text, /\*\*Pace: promo\.\*\* Half its shots last less than 1\.5 s: a promo's pace \(median 1\.15 < 1\.5 ✓\)\./);
  assert.match(text, /\*\*Music: the beats were not read\.\*\* The breakdown did not read the beats: no beat map was given/);
  assert.match(text, /\*\*Between scenes: a cut\*\* \(2 of 3\)\. Write "enter": "cut" on each stage that takes it; left out, a stage fades in\./);
  assert.match(text, /\| scene-01 \| 0:00\.0 \| 0:00\.9 \| 0\.9 s \| 1–3 \| kinetic type, 3 words \| the start \| a run of quick shots/);
  assert.match(text, /## How the scenes come in\n\n- scene-02 comes in by a fade, 0\.5 s: the reference dissolves to it in 0\.5 s: a fade\.\n/);
  assert.match(text, /## Flashes\n\n- scene-01: 1 flash at 0:00\.2/);
  // Scenes that need the same thing are named together.
  assert.match(text, /- scene-02, scene-03, scene-04: a picture\.\n/);
  assert.match(text, /- the beats, read: storyreel breakdown ref\.mp4 --beats, then plan again\.\n/);
});

test('refusals name the fix', async () => {
  const spec = specOf([shot(2)]);
  await assert.rejects(remakePlan(null), /remakePlan: give a breakdown's spec \(breakdown\.json, or breakdown\(file\)\.spec\)/);
  await assert.rejects(remakePlan({spec}), /this is what breakdown\(\) returns; give its spec \(breakdown\(file\)\.spec\)/);
  await assert.rejects(remakePlan({...spec, schemaVersion: 2}), /schemaVersion 2 \(run storyreel breakdown again/);
  await assert.rejects(remakePlan({...spec, shots: []}), /its shots are a list of one shot or more/);
  await assert.rejects(remakePlan({...spec, shots: [{index: 1}]}), /shots\[0\] is a breakdown's shot, \{index, start, end, seconds/);
  await assert.rejects(remakePlan({...spec, flashes: undefined}), /its flashes are a list/);
  await assert.rejects(remakePlan({...spec, audio: {}}), /its audio\.beats says whether the beats were read/);
  await assert.rejects(remakePlan({...spec, audio: {sound: true, beats: {ran: true, bpm: 120}}}), /its audio\.beats were read, so they give \{ran: true, bpm, sure, cuts: \[\{onBeat\}\], onBeat\}/);
  await assert.rejects(remakePlan(spec, {thresholds: {fast: 1}}), /"fast" is not a threshold; the thresholds are quick, lettered, promoMedian, promoCuts, onBeat/);
  await assert.rejects(remakePlan(spec, {thresholds: {quick: 0}}), /thresholds\.quick is a number more than 0, not 0/);
  await assert.rejects(remakePlan(spec, {thresholds: {onBeat: 50}}), /thresholds\.onBeat is a share, more than 0 and at most 1 \(0\.5\), not 50/);
});

// ── End to end: a film made with FFmpeg, broken down, planned, and the command line ────────────────────────

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

test('end to end: a film broken down and planned — the quick lettered cards one kinetic scene, the held blue card plain ground, the box a moving picture; the command line prints the same', {skip}, async () => {
  const dir = tempDir('remake-test'), out = path.join(dir, 'reference-breakdown');
  const {spec} = await breakdown(makeReference(dir), {out});
  const plan = await remakePlan(spec);
  assert.deepEqual(plan.scenes.map(x => [x.kind, x.shots.length, x.enter]), [['kinetic', 4, null], ['blank', 1, 'cut'], ['moving', 1, 'cut']]);
  assert.deepEqual([plan.pace.name, plan.music.verdict], ['promo', 'not-read']);
  // The command line: the folder storyreel breakdown wrote, in words; --json the same plan without its record.
  const words = spawnSync(process.execPath, [cli, 'remake', out], {encoding: 'utf8'});
  assert.equal(words.status, 0, words.stderr);
  assert.equal(words.stdout, `${remakePlanText(plan)}\n`);
  const json = spawnSync(process.execPath, [cli, 'remake', path.join(out, 'breakdown.json'), '--json', '--quick', '0.3'], {encoding: 'utf8'});
  assert.equal(json.status, 0, json.stderr);
  const data = JSON.parse(json.stdout);
  assert.equal(data.record, undefined);
  assert.deepEqual([data.thresholds.quick, data.scenes.map(x => x.kind)], [.3, ['title', 'title', 'title', 'title', 'blank', 'moving']]);
});

test('the command line refuses what it cannot plan, naming the fix (exit 2), and says its usage', () => {
  const run = (...args) => spawnSync(process.execPath, [cli, 'remake', ...args], {encoding: 'utf8'});
  const dir = tempDir('remake-cli'), notJson = path.join(dir, 'breakdown.json');
  writeFileSync(notJson, 'not json');
  for (const [args, said] of [[[], /name the breakdown: its breakdown\.json, or the folder/], [['/no/such/place'], /no file or folder at \/no\/such\/place: name a breakdown\.json/],
    [[dir], /is not JSON .*: name the breakdown\.json storyreel breakdown wrote/], [[notJson, '--quick', 'soon'], /--quick needs seconds, more than 0 \(e\.g\. --quick 1\.5\), not "soon"/],
    [[notJson, '--loud'], /"--loud" is not understood/]]) {
    const r = run(...args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}`);
    assert.match(r.stderr, said);
  }
  const help = run('--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^storyreel remake <breakdown\.json \| its folder> \[--quick s\] \[--json\]/);
});
