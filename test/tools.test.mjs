// The review tools (tools.mjs) and the command line (cli.mjs): read first (timeline, review), look last (part, still).
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {loadProject, readInputs, timeline, review, still, TOOLS, strip, anchors, sheet} from '../src/tools.mjs';
import {tempDir} from './tmp.mjs';
import {makeClock, paceTimings} from '../src/index.mjs';
import {filmTimeline} from '../src/render.mjs';
import {momentAt} from '../src/momenttext.mjs';

const project = fileURLToPath(new URL('./fixtures/tools/', import.meta.url)), cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const run = (args, cwd = project) => spawnSync(process.execPath, [cli, ...args], {cwd, encoding: 'utf8'});
const has = cmd => !spawnSync(cmd, ['-version']).error;

test('the tools read the project\'s film: its timeline and its review as text, a still as one picture', async () => {
  const out = tempDir('tools'), p = await loadProject({cwd: project, out});
  assert.match(await timeline(p, {scene: 'two', handles: 0}), /^two: [\d.]+–[\d.]+ s of [\d.]+ s \(times: scene\+seconds from that scene's start, then the film clock\)\ntwo\+0\.00 \(0:0\d\.\d\)  ── two$/m);
  const read = await review(p, {full: 'true'});
  assert.match(read, /review \(under-captions, words-overlap, cut-off, hook, text-density, stale, still, slideshow, claims\):\n[\s\S]*0:02\.0–0:03\.8 one · words over words: "Alpha" and "Beta"/);
  const short = await review(p);
  assert.match(short, /review \(.*\):\n1 finding: 1 words over words · verdicts: 2 passed, 1 not run\nDrawn parts hold together · not run: no kit on screen gives its parts \(parts\(t\)\)\n0:02\.0–0:03\.8 one · words over words: "Alpha" and "Beta"$/, 'by default: the counts, what did not pass, the findings');
  assert.ok(short.length < read.length);
  assert.match(read, /\nverdicts:\nNo slideshow · passed: the shots move inside themselves: most of their running time is never held still for more than 3 s \(0 % of [\d.]+ s dead, \d+ % still\)\nDrawn parts hold together · not run: no kit on screen gives its parts \(parts\(t\)\)\nEvery number has a source · passed: the film shows no number/, 'the verdicts follow the findings, each with why');
  const s = await still(p, {at: 'one+2.5,two+0'});
  assert.ok(existsSync(s.file) && s.file.endsWith('.png'), s.text);
  await assert.rejects(still(p, {at: 'three+1'}), /"three\+1" is not a moment \(scene\+seconds, .*; the scenes are one, two\)/);
  assert.deepEqual(Object.keys(TOOLS), ['timeline', 'review', 'part', 'anchors', 'script', 'changes', 'still', 'sheet', 'strip']);
  const st = await strip(p, {at: 'one+2', frames: 6});
  assert.ok(existsSync(st.file) && st.file.endsWith('strip-one+2.png'), st.text);
  assert.match(st.text, /6 frames at 30 fps around one\+2 \([\d.]+ s\): frame 0 is the moment/);
  await assert.rejects(strip(p, {at: 'one+2,two+0'}), /strip: name one moment \(at: "scene\+seconds"\); a still shows several/);
  await assert.rejects(strip(p, {}), /^Error: strip: name one moment \(at: "scene\+seconds"\)$/, 'a strip\'s refusals name the strip, not the still');
  await assert.rejects(strip(p, {at: 'three+1'}), /^Error: strip: "three\+1" is not a moment \(scene\+seconds, .*; the scenes are one, two\)$/);
  await assert.rejects(still(p, {}), /^Error: still: name the moments \(at: "scene\+seconds,…"\)$/);
  await assert.rejects(strip(p, {at: 'one+2', frames: 1}), /frames must be a whole number 2–30/);
  // A moment is exactly scene+seconds: its words are printed as its label, so nothing may ride after them.
  await assert.rejects(still(p, {at: 'one+2+/elsewhere/secret.png'}), /^Error: still: "one\+2\+\/elsewhere\/secret\.png" is not a moment/);
  await assert.rejects(strip(p, {at: 'one+\n2'}), /^Error: strip: "one\+\\n2" is not a moment/, 'a control character');
  await assert.rejects(still(p, {at: 'one+1', width: 60000}), /^Error: still: width must be a whole number of pixels 100–4000, not 60000$/);
  await assert.rejects(strip(p, {at: 'one+1', width: '12.5'}), /^Error: strip: width must be a whole number of pixels 100–4000, not "12\.5"$/);
  await assert.rejects(still(p, {at: Array(31).fill('one+1').join(',')}), /^Error: still: at most 30 moments in one picture, not 31$/);
  assert.match(await review(p, {loop: 'true'}), /review \(.*loop.*\):[\s\S]*the loop jumps: the end is not the start/);
});

test('a still of many moments is written: a name too long for a file is cut, with a hash of the whole, so two never meet', async t => {
  const p = await loadProject({cwd: project, out: tempDir('long-names', t)});
  // 30 moments of 8 characters named a file of 273 bytes, past the 255 a file name holds: the still failed to write.
  const many = from => Array.from({length: 30}, (_, k) => `one+1.${from + k}`).join(',');
  const [a, b] = [await still(p, {at: many(10)}), await still(p, {at: many(11)})];
  for (const s of [a, b]) assert.ok(existsSync(s.file) && path.basename(s.file).length <= 104, s.file);
  assert.match(path.basename(a.file), /^one\+1\.10_one\+1\.11_[\w+.-]*-[0-9a-f]{16}\.png$/);
  assert.notEqual(a.file, b.file, 'two long names that start alike end in their own hash');
  assert.ok((await still(p, {at: 'one+2.5,two+0'})).file.endsWith(`${path.sep}one+2.5_two+0.png`), 'a short name is as it was');
});

test('the timeline speaks the still tool\'s language: a scene\'s times are scene+seconds from their own scene\'s start, the film clock beside; a window\'s and the film\'s are seconds on the film clock', async t => {
  const p = await loadProject({cwd: project, keyed: 'true', out: tempDir('timeline', t)});
  assert.equal(await timeline(p, {scene: 'two'}), [
    'two: 3.78–9.04 s of 9.04 s (times: scene+seconds from that scene\'s start, then the film clock)',
    'one+4.10 (0:04.1)  "slowly" → story.beats[0]',   // in the handles before two: counted from its own scene, never negative
    'two+0.00 (0:05.3)  ── two',
    'two+0.68 (0:06.0)  "a second scene" → story.beats[1]',
    'two+2.02 (0:07.3)  "{turn}" → story.beats[2]',
    'two+2.58 (0:07.9)  "shorter" → story.beats[3]'].join('\n'));
  assert.equal(await timeline(p, {from: '0:06', to: '0:08', handles: 0}), [
    '0:06–0:08: 6.00–8.00 s of 9.04 s (times: seconds from the film\'s start)',
    '7.30  "{turn}" → story.beats[2]',
    '7.86  "shorter" → story.beats[3]'].join('\n'), 'a window\'s times are the film\'s, no longer counted from the window');
  assert.match(await timeline(p), /^the whole film: 0\.00–9\.04 s of 9\.04 s \(times: seconds from the film's start\)\n0\.00 {2}── one\n4\.10 {2}"slowly" → story\.beats\[0\]\n5\.28 {2}── two\n/);
});

test('every time the timeline prints goes to still --at and strip --at as written, and lands on what it lists', async t => {
  const out = tempDir('round-trip', t), p = await loadProject({cwd: project, keyed: 'true', out}), {film} = p, rows = filmTimeline(film);
  // Three listings of the whole film — by scenes, whole, as a window — each a line per row, in order.
  for (const args of [{scene: 'one,two'}, {}, {from: 0, to: film.total, handles: 0}]) {
    const lines = (await timeline(p, args)).split('\n').slice(1);
    assert.equal(lines.length, rows.length, JSON.stringify(args));
    const times = lines.map(l => /^(\S+)(?: \((\d+:\d\d\.\d)\))? {2}/.exec(l));
    times.forEach(([, time, clock], k) => {
      assert.ok(Math.abs(momentAt(film, time, 'still') - rows[k].t) <= .005 + 1e-9, `${time} is ${rows[k].t}`);
      if (clock) assert.ok(Math.abs(momentAt(film, clock, 'still') - rows[k].t) <= .05 + 1e-9, `${clock} is ${rows[k].t}, to the tenth`);
    });
    const s = await still(p, {at: times.map(m => m[1]).join(',')});
    assert.deepEqual([...s.text.matchAll(/(?:: |, )(\S+) \(([\d.]+) s\)/g)].map(m => [m[1], Math.abs(+m[2] - rows[times.findIndex(x => x[1] === m[1])].t) <= .01]), times.map(m => [m[1], true]), s.text);
  }
  const strips = await Promise.all(['two+2.02', '0:07.3', '7.30'].map(at => strip(p, {at, frames: 2})));
  assert.deepEqual(strips.map(s => /around (\S+) \(([\d.]+) s\)/.exec(s.text).slice(1)), [['two+2.02', '7.30'], ['0:07.3', '7.30'], ['7.30', '7.30']]);
  // As an agent works: the timeline's line, pasted.
  const listed = run(['timeline', '--scene', 'two', '--keyed', 'true']), turn = /^(\S+) \S+ {2}"\{turn\}"/m.exec(listed.stdout)?.[1];
  assert.equal(turn, 'two+2.02', listed.stdout + listed.stderr);
  const shot = run(['still', '--at', turn, '--keyed', 'true', '--out', out]);
  assert.equal(shot.status, 0, shot.stderr); assert.match(shot.stdout, /· 1 frame: two\+2\.02 \(7\.30 s\)$/m);
});

test('a still and a strip take the moments they always took, read exactly as before, and m:ss on the film clock too', async t => {
  const p = await loadProject({cwd: project, out: tempDir('old-forms', t)}), {film} = p, two = film.clock.start('two').toFixed(2), last = (film.total - .001).toFixed(2);
  const s = await still(p, {at: 'one+2.5,two+0,3.25,+2,one+-1,two+100'});
  assert.ok(s.file.endsWith(`${path.sep}one+2.5_two+0_3.25_+2_one+-1_two+100.png`), s.file);
  assert.match(s.text, new RegExp(`· 6 frames: one\\+2\\.5 \\(2\\.50 s\\), two\\+0 \\(${two} s\\), 3\\.25 \\(3\\.25 s\\), \\+2 \\(2\\.00 s\\), one\\+-1 \\(0\\.00 s\\), two\\+100 \\(${last} s\\)$`), 'held to the film, as ever');
  assert.match((await still(p, {at: '0:02.5,0:03'})).text, /· 2 frames: 0:02\.5 \(2\.50 s\), 0:03 \(3\.00 s\)$/);
  assert.match((await strip(p, {at: '0:02', frames: 2})).text, /strip-0-02\.png · 2 frames at 30 fps around 0:02 \(2\.00 s\)/);
  for (const at of ['0:61', '1:2:3:4', 'one+2+3', 'one+x']) await assert.rejects(still(p, {at}), new RegExp(`^Error: still: ${JSON.stringify(at).replace(/[+]/g, '\\+')} is not a moment \\(`), at);
});

test('a moment by what is said: scene:phrase or scene:{moment}, +seconds after either, where the film\'s clock says it is — labelled as written', async t => {
  const p = await loadProject({cwd: project, keyed: 'true', out: tempDir('said', t)}), {film} = p, logged = film.beats.length;
  const s = await still(p, {at: 'two:a second scene,two:{turn},two:{turn}+0.5,two:a little shorter+0.25,one:said slowly'});
  assert.ok(s.file.endsWith(`${path.sep}two-a-second-scene_two--turn-_two--turn-+0.5_two-a-little-shorter+0.25_one-said-slowly.png`), s.file);
  assert.equal(film.beats.length, logged, 'a still looks a moment up without adding it to the film\'s beats (the timeline lists those)');
  // Each lands where the clock a recipe's beats are read on puts it (its at(), asked last: it logs what it is asked).
  const asked = [['two', 'a second scene', 0], ['two', '{turn}', 0], ['two', '{turn}', .5], ['two', 'a little shorter', .25], ['one', 'said slowly', 0]];
  assert.deepEqual([...s.text.matchAll(/(?:: |, )([^,]+) \(([\d.]+) s\)/g)].map(m => [m[1], m[2]]),
    asked.map(([scene, phrase, plus]) => [`${scene}:${phrase}${plus ? `+${plus}` : ''}`, (film.clock.at([scene, phrase]) + plus).toFixed(2)]));
  assert.match((await strip(p, {at: 'two:{turn}+0.5', frames: 2})).text, /strip-two--turn-\+0\.5\.png · 2 frames at 30 fps around two:\{turn\}\+0\.5 \(7\.60 s\)/);
  // What names no one place refuses, saying why and what to write, each place as the timeline says it.
  const refused = {
    'two:a': 'said 2 times in two (two+0.68 · two+1.82): name one by its time, or by words said only there, as storyreel anchors suggests them: "a second" (two+0.68) · "a little" (two+1.82)',
    'two:much shorter': 'not said in two; the nearest words said: "shorter" (two+2.58)',
    'two:{gone}': 'two has no moment {gone} (its moments: {turn} (two+1.82))',
    'one:{gone}': 'one has no moment {gone} (it has none)',
    'two:{@mom}': 'a speaker tag names who says a line, and is no moment: write a moment where the beat lands ({look}{@mom}"…") and name that ("{look}")',
    'two:a {turn}': 'a moment is named alone ("{ten}"), and a phrase is the words said, with no braces ("a ten"): write one or the other'};
  for (const [at, why] of Object.entries(refused)) await assert.rejects(still(p, {at}), {message: `still: ${JSON.stringify(at)} — ${why}`});
  await assert.rejects(strip(p, {at: 'two:much shorter+1'}), {message: 'strip: "two:much shorter+1" — not said in two; the nearest words said: "shorter" (two+2.58)'});
  await assert.rejects(still(p, {at: 'two:'}), {message: 'still: "two:" names nothing said: write the words after the colon (two:what is said) or a moment (two:{name})'});
  for (const at of ['three:hello', 'two:{turn}+x', 'two:a+1+2']) await assert.rejects(still(p, {at}), new RegExp(`^Error: still: ".*" is not a moment \\(scene\\+seconds, seconds or m:ss on the film clock, or what is said: scene:phrase or scene:\\{moment\\}, \\+seconds after either; the scenes are one, two\\)$`), at);
  assert.equal(film.beats.length, logged + asked.length, 'only the at() asked above was logged');
});

test('anchors: every phrase the film is keyed to, in one pass — the pacing\'s holds and the recipe\'s beats, where each is named', async () => {
  const text = await anchors(await readInputs({cwd: project, anchors: 'true'}));
  assert.match(text, /^8 phrases checked: 2 not said, 1 past the last place, 1 no such scene, 1 said more than once\n/);
  assert.match(text, /\n {2}two "much shorter" → pacing\.holds\[1\] — not said; the nearest words said: "shorter" \([\d.]+ s\)\n {2}one "a lot of words" → recipe\.story\.beats\[1\] — not said; the nearest words said: "words"/, 'a hold not said, then a beat: one clock for both');
  assert.match(text, /two "scene" → recipe\.story\.beats\[3\] — nth 2, but it is said 1 time \(nth counts the places from 0\)/);
  assert.match(text, /three "hello" → recipe\.story\.beats\[4\] — no scene "three"/);
  assert.match(text, /one "a" → recipe\.story\.beats\[2\] — said 2 times; the first is used \([\d.]+ s\)\. Each alone: "A first" \([\d.]+ s\) · "a few" \([\d.]+ s\)/);
  // A hold is read on the film's clock too: its time is the paced film's, and it has its fixes (words before its end).
  const held = await anchors(await readInputs({cwd: project, anchors: 'twice'})), film = await loadProject({cwd: project, anchors: 'twice'});
  const [first, second] = film.film.clock.places('one', 'a');
  assert.match(held, new RegExp(`one "a" → pacing\\.holds\\[0\\] — said 2 times; the first is used \\(${first.end.toFixed(2)} s\\)\\. Each alone: "A first" \\([\\d.]+ s\\) · "with a" \\(${second.end.toFixed(2)} s\\)`), `${held}\n(the second keeps its end: words added before it; the first has none before, so its fix moves the end and says when)`);
  assert.match(await anchors(await readInputs({cwd: project})), /^no phrase is named/);
  const r = run(['anchors', '--anchors', 'true']);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /^8 phrases checked/, 'the command line, as the tool');
  // A voice leaves its silent scenes out: the clock fills them in, as pacing does.
  assert.match(await anchors(await readInputs({cwd: project, anchors: 'true', voiced: 'true'})), /^8 phrases checked: 2 not said/);
  // A compile that stops (a kit refusing a time stood in for) loses nothing: the rest are read from the recipe itself.
  const stop = await anchors(await readInputs({cwd: project, anchors: 'stop'}));
  assert.match(stop, /^the compile stopped, so the recipe's phrases were read from the recipe itself: 6 checked: 3 not said, 1 said more than once\n/);
  assert.match(stop, /one "a lot of words in it" → recipe\.story\.beats\[1\] — not said;[\s\S]*two "much shorter" → recipe\.story\.beats\[2\] — not said;[\s\S]*one "a" → recipe\.story\.beats\[3\] — said 2 times/, 'the beats after the stop too');
  assert.match(stop, /\nthe compile stopped: words: the beats come in order: give them as they are said\nfix the phrases above, and run it again$/);
  assert.doesNotMatch(stop, /each said once/);
});

test('anchors: a hold at a moment its scene does not have stands in after the scene\'s last word, so every other time in the report stays the film\'s', async () => {
  // The scene's last word ("ten.") is said first as "Ten": by its text alone, the stand-in would hold after the first one.
  const marked = fileURLToPath(new URL('./fixtures/script/', import.meta.url)), read = await readInputs({cwd: marked, holds: 'true'});
  const held = makeClock(read.said, paceTimings(read.said, read.raw, {sceneTail: .8, holds: [{scene: 'today', after: '{dots}', seconds: 1.5}]}));
  const text = await anchors(read);
  assert.match(text, /^3 phrases checked: 1 not said\n/);
  assert.match(text, new RegExp(`today "\\{gone\\}" → pacing\\.holds\\[1\\] — no such moment in today; its moments: \\{dots\\} \\(${held.at(['today', '{dots}']).toFixed(2)} s\\) · \\{hop\\} \\(${held.at(['today', '{hop}']).toFixed(2)} s\\)$`), text);
});

test('sheet: the film at a glance — a frame every few seconds, so many to a sheet, each labelled with its time and scene', async () => {
  const p = await loadProject({cwd: project, out: tempDir('sheet')}), s = await sheet(p, {every: 1, per: 4});
  const frames = Math.ceil(p.film.total - 1e-6);
  assert.equal(s.files.length, Math.ceil(frames / 4)); assert.ok(s.files.every(f => existsSync(f) && /sheet-film-\d+\.png$/.test(f)), s.text);
  assert.match(s.text, new RegExp(`^the whole film: 0\\.00–[\\d.]+ s of [\\d.]+ s: ${frames} frames, one every 1 s, ${s.files.length} sheets of up to 4\\n`));
  assert.match(s.text, /sheet-film-1\.png · 0:00\.0–0:03\.0/);
  const two = await sheet(p, {scene: 'two', every: 2});
  assert.equal(two.files.length, 1); assert.match(two.text, /^two: [\d.]+–[\d.]+ s of [\d.]+ s: \d+ frames, one every 2 s, 1 sheet of up to 20\n.*sheet-two-1\.png/, 'a scene alone: no handles');
  await assert.rejects(sheet(p, {every: 0}), /^Error: sheet: every is the seconds between frames, 0\.25–60, not 0$/);
  await assert.rejects(sheet(p, {per: 1.5}), /^Error: sheet: per is how many frames a sheet holds, a whole number 2–60, not 1\.5$/);
});

test('share: a small copy of a finished film to send, quick to start on a phone, and its poster', {skip: has('ffmpeg') ? false : 'needs ffmpeg'}, async () => {
  const {shareCopy, shareText} = await import('../src/share.mjs'), dir = tempDir('share'), film = path.join(dir, 'film.mp4');
  const made = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=10:duration=3', '-f', 'lavfi', '-i', 'sine=duration=3', '-shortest', '-pix_fmt', 'yuv420p', film]);
  assert.equal(made.status, 0, String(made.stderr));
  const s = shareCopy(film, {width: 320, poster: 1});
  assert.equal(s.video, path.join(dir, 'film.share.mp4')); assert.equal(s.poster, path.join(dir, 'film.poster.jpg'));
  assert.ok(existsSync(s.video) && existsSync(s.poster)); assert.deepEqual([s.width, s.height], [320, 180]); assert.ok(Math.abs(s.seconds - 3) < .2);
  assert.match(shareText(s), /film\.share\.mp4 · [\d.]+ MB · 0:0[23] · 320×180 — poster .*film\.poster\.jpg$/);
  assert.equal(readdirSync(dir).filter(f => f.startsWith('.')).length, 0, 'nothing half-made left beside it');
  assert.throws(() => shareCopy(film, {width: 321}), /share: width is an even number of pixels 160–3840 \(854 is 480p\), not 321/);
  assert.throws(() => shareCopy(film, {poster: 9}), /share: poster is the moment its still is taken, 0 to [\d.]+ s \(the film's length\), not 9/);
  assert.throws(() => shareCopy(path.join(dir, 'none.mp4')), /share: no video at .*none\.mp4/);
  const r = run(['share', film, '--width', '320', '--out', path.join(dir, 'out')]);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /out\/film\.share\.mp4 · /);
  assert.equal(run(['share', film, '--widht', '320']).status, 2, 'a flag share does not take');
  const empty = run(['share', film, '--ffmpeg']), word = run(['share', film, '--width', 'abc']);
  assert.equal(empty.status, 2); assert.match(empty.stderr, /--ffmpeg needs the path of an FFmpeg \(e\.g\. --ffmpeg \/usr\/local\/bin\/ffmpeg\)$/m, 'a flag with no value is not "true"');
  assert.equal(word.status, 2); assert.match(word.stderr, /--width needs a whole number of pixels \(e\.g\. --width 854\), not "abc"/);
  assert.equal(run(['share']).status, 2, 'no film named');
});

test('a film with no voice is paced from its config: the even timings take its holds and tails, as makeFilm takes them', async () => {
  const plain = await loadProject({cwd: project}), paced = await loadProject({cwd: project, paced: 'true'});
  // A 2 s hold after "a few words", and each scene's 0.8 s tail made 1.5 s (counted from its last word's end, as a voice's is).
  const grew = paced.film.total - plain.film.total;
  assert.ok(Math.abs(grew - (2 + 2 * (1.5 - .8))) < .1, `the paced film is ${grew.toFixed(3)} s longer`);
  assert.match(await timeline(paced, {scene: 'two', handles: 0}), /^two: /);
  await assert.rejects(loadProject({cwd: project, paced: 'notail'}), /pacing\.sceneTail is missing: give the settle after each scene's last word, 0\.3–3 seconds \(e\.g\. "sceneTail": 0\.8\)/);
});

test('the command line: each tool by name, its flags to the film too; refusals name the fix', () => {
  const help = run(['help']);
  assert.equal(help.status, 0); assert.match(help.stdout, /Read first, look last: timeline → review → fix → part → still\./);
  const r = run(['review', '--scene', 'one']);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /words over words: "Alpha" and "Beta"/);
  const none = run(['review'], tempDir('empty'));   // a folder with no project in it (its own, not the shared temp folder)
  assert.equal(none.status, 1); assert.match(none.stderr, /no storyreel\.config\.mjs in .*: a project names its film there/);
  assert.equal(run(['draw']).status, 2, 'an unknown tool is a usage error');
  for (const command of ['timeline', 'review', 'part', 'anchors', 'script', 'changes', 'still', 'sheet', 'strip', 'beats', 'share', 'breakdown', 'mcp']) {
    const h = run([command, '--help']);
    assert.equal(h.status, 0, `${command} --help: ${h.stderr}`); assert.match(h.stdout, new RegExp(`^storyreel ${command} `), `${command} --help gives its own usage`);
  }
  assert.match(run(['still', '--help']).stdout, /--at {2}moments: scene\+seconds/);
  assert.match(run(['review', '--help']).stdout, /--full {2}true for every finding/);
});

test('part: the scenes with their handles, rendered quickly, reviewed first', {skip: has('ffmpeg') ? false : 'needs ffmpeg'}, () => {
  const out = tempDir('part'), r = run(['part', '--scene', 'two', '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /two: [\d.]+–[\d.]+ s .* — review/);
  assert.match(r.stdout, new RegExp(`${out.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/parts/two\\.mp4 · [\\d.]+ s · made in [\\d.]+ s · checks`));
});

/**
 * An MCP server started with `flags` in `cwd`: each message written (an object as JSON-RPC, a string as the line itself),
 * its input closed, and once it has answered and ended, its replies by id (and all of them, in order), its exit code and
 * what it said on stderr.
 */
async function mcpSession(flags, messages, {cwd = project} = {}) {
  const server = spawn(process.execPath, [cli, 'mcp', ...flags], {cwd}), replies = new Map(), all = [];
  let buffered = '', stderr = '';
  server.stdout.on('data', d => { buffered += d; let i; while ((i = buffered.indexOf('\n')) >= 0) { const m = JSON.parse(buffered.slice(0, i)); buffered = buffered.slice(i + 1); replies.set(m.id, m); all.push(m); } });
  server.stderr.on('data', d => { stderr += d; });
  for (const m of messages) server.stdin.write(`${typeof m === 'string' ? m : JSON.stringify({jsonrpc: '2.0', ...m})}\n`);
  server.stdin.end();
  const code = await new Promise(r => server.on('close', r));
  return {replies, all, code, stderr};
}
const ask = (id, method, params) => ({id, method, params});
const call = (id, name, args) => ask(id, 'tools/call', {name, arguments: args});

test('the same tools over MCP (stdio): the handshake, the list with each tool\'s arguments, a call as text, a still as the picture, an error as an error', async () => {
  const out = tempDir('mcp');
  const {replies} = await mcpSession(['--out', out], [
    ask(1, 'initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'test', version: '0'}}), {method: 'notifications/initialized'},
    ask(2, 'tools/list', {}), call(3, 'review', {scene: 'one'}), call(4, 'still', {at: 'one+2.5'}),
    call(5, 'still', {at: 'nowhere+1'}), ask(6, 'resources/list', {}), call(7, 'strip', {at: 'one+2', frames: '4'}), call(8, 'sheet', {every: '1', per: '4'}),
    call(9, 'anchors', {})]);
  assert.equal(replies.get(1).result.serverInfo.name, 'storyreel'); assert.ok(replies.get(1).result.capabilities.tools);
  const tools = replies.get(2).result.tools;
  assert.deepEqual(tools.map(t => t.name), ['timeline', 'review', 'part', 'anchors', 'script', 'changes', 'still', 'sheet', 'strip']);
  assert.deepEqual(tools.find(t => t.name === 'script').inputSchema.properties, {}, 'script takes no arguments of its own');
  assert.deepEqual(Object.keys(tools.find(t => t.name === 'part').inputSchema.properties), ['scene', 'from', 'to', 'handles', 'full']);
  assert.equal(tools.find(t => t.name === 'part').inputSchema.required, undefined, 'a part takes its scenes or a window: it says which it lacks');
  assert.deepEqual(Object.keys(tools.find(t => t.name === 'changes').inputSchema.properties), ['render', 'handles']);
  assert.deepEqual(tools.find(t => t.name === 'strip').inputSchema.required, ['at']);
  assert.deepEqual(tools.find(t => t.name === 'still').inputSchema.required, ['at']);
  assert.ok(tools.every(t => t.inputSchema.additionalProperties === false), 'a tool takes its own arguments and no others');
  assert.match(replies.get(3).result.content[0].text, /words over words: "Alpha" and "Beta"/);
  const [text, image] = replies.get(4).result.content;
  assert.match(text.text, /stills\/one\+2\.5\.png · 1 frame/); assert.equal(image.type, 'image'); assert.equal(image.mimeType, 'image/png');
  assert.equal(replies.get(5).result.isError, true); assert.match(replies.get(5).result.content[0].text, /"nowhere\+1" is not a moment/);
  assert.equal(replies.get(6).error.code, -32601);
  const [stripText, stripImage] = replies.get(7).result.content;
  assert.match(stripText.text, /strip-one\+2\.png · 4 frames/); assert.equal(stripImage.type, 'image', 'a strip comes back as the picture too');
  const [sheetText, ...sheets] = replies.get(8).result.content;
  assert.match(sheetText.text, /sheets of up to 4/); assert.equal(sheets.length, sheetText.text.match(/sheet-film-\d+\.png/g).length, 'every sheet comes back as a picture');
  assert.ok(sheets.length > 1 && sheets.every(i => i.type === 'image'));
  assert.match(replies.get(9).result.content[0].text, /^no phrase is named/, 'anchors over MCP: it times the film itself');
  assert.match(replies.get(1).result.instructions, /anchors \(every phrase not said, or said twice, with its fix\) first/);
  // Another config is named when the server starts, never by a call.
  const noisy = await mcpSession(['--config', 'noisy.config.mjs', '--out', out], [call(8, 'still', {at: 'two+0'})]);
  const [noisyText, noisyImage] = noisy.replies.get(8).result.content;
  assert.match(noisyText.text, /^TREE PIPELINE: [\s\S]*\n\/.*stills\/two\+0\.png · 1 frame/, 'the project printed first; the picture\'s line came last');
  assert.equal(noisyImage?.type, 'image', 'and the picture still comes back');
});

test('over MCP the project is fixed at start: a call that names config or cwd, another argument, or a value read as a flag is refused, runs nothing, and the server answers the next call', async t => {
  const out = tempDir('mcp-fixed', t), elsewhere = tempDir('mcp-elsewhere', t), ran = path.join(elsewhere, 'ran.txt'), secret = path.join(elsewhere, 'secret.png');
  // A config that leaves a mark when it is imported: what a call naming it would run. And a picture outside the project.
  writeFileSync(path.join(elsewhere, 'storyreel.config.mjs'), `import {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(ran)}, 'ran');\nexport default {film: () => ({})};\n`);
  writeFileSync(secret, 'not yours to see');
  const {replies, all, code} = await mcpSession(['--out', out], [
    call(1, 'review', {config: path.join(elsewhere, 'storyreel.config.mjs')}), call(2, 'review', {scene: 'one', cwd: elsewhere}),
    call(3, 'still', {at: 'one+1', out: elsewhere}), call(4, 'timeline', {scene: '--config'}), call(5, 'constructor', {}),
    call(6, 'timeline', {scene: 'one\u0000'}), ask(7, 'tools/call', null), 'null', call(9, 'still', {at: `one+2+\n${secret}\nx`}),
    call(10, ['timeline'], {}), `{"jsonrpc":"2.0","method":"ping","id":${'['.repeat(9000)}${']'.repeat(9000)}}`, call(12, 'review', {scene: 'one'})]);
  const said = id => { assert.ok(replies.has(id), `no answer to call ${id}: the server stopped (exit ${code})`); return replies.get(id).result; };
  const rule = 'config and cwd are fixed when the MCP server starts; restart it with --config (or --cwd) to use another';
  for (const id of [1, 2]) assert.deepEqual(said(id), {isError: true, content: [{type: 'text', text: rule}]});
  assert.equal(said(3).content[0].text, 'still takes no "out" (it takes at, width): the rest — the config, the folder, the film\'s own flags — is fixed when the MCP server starts');
  assert.equal(said(4).content[0].text, 'timeline: scene "--config" would be read as a flag: a value never starts with --');
  assert.match(said(5).content[0].text, /^no tool called "constructor"/, 'a name every object inherits is not a tool');
  assert.equal(said(6).isError, true, 'a value the command line cannot be given (a NUL byte) is an error, not the server\'s end');
  assert.equal(said(7).isError, true);
  assert.deepEqual(said(9).content.map(c => c.type), ['text'], 'a moment with a line naming another picture is refused, and no picture comes back');
  assert.match(said(9).content[0].text, /is not a moment/);
  assert.match(said(10).content[0].text, /^a tool is named by text/);
  assert.equal(all.filter(m => m.id === null && m.error?.code === -32600).length, 2, 'a message that is not an object, and an id that is neither a string nor a number');
  assert.match(said(12).content[0].text, /words over words: "Alpha" and "Beta"/, 'and the server answers the next call');
  assert.equal(code, 0);
  assert.equal(existsSync(ran), false, 'the config a call named never ran');
  assert.deepEqual(readdirSync(elsewhere).sort(), ['secret.png', 'storyreel.config.mjs'], 'and nothing was written in the folder a call named');
});

test('over MCP a still\'s picture is the one it made, sent on a pipe of its own: a path printed after it, or whatever else the project does, is never taken for it', {timeout: 60_000}, async t => {
  const out = tempDir('mcp-picture', t), decoyProject = tempDir('mcp-decoy', t), decoy = path.join(decoyProject, 'decoy.png');
  writeFileSync(decoy, 'a picture the still did not make');
  // A project that listens for messages (a channel it held open would never let a call end), writes junk on fd 3 (only a
  // still's command line has the pipe there) and prints another picture's path as the very last line, as it exits.
  writeFileSync(path.join(decoyProject, 'storyreel.config.mjs'), [
    'import {writeSync} from \'node:fs\';',
    `import project from ${JSON.stringify(pathToFileURL(path.join(project, 'storyreel.config.mjs')).href)};`,
    'process.on(\'message\', () => {});',
    `if (process.argv[2] === 'still') writeSync(3, ${JSON.stringify(`not json\n{"picture": 5}\n{"picture": "relative.png"}`)});   // no line end: the picture's line still stands alone`,
    `process.on('exit', () => writeSync(1, ${JSON.stringify(`${decoy}\n`)}));`,
    'export default project;', ''].join('\n'));
  const {replies, code} = await mcpSession(['--out', out], [call(1, 'still', {at: 'one+2'}), call(2, 'timeline', {scene: 'two', handles: 0})], {cwd: decoyProject});
  const [text, image] = replies.get(1).result.content;
  assert.match(text.text, new RegExp(`\\n${decoy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), 'the decoy\'s path is the last line of the text');
  assert.equal(image?.data, readFileSync(path.join(realpathSync(out), 'stills', 'one+2.png')).toString('base64'), 'and the picture is the still\'s own');
  assert.match(replies.get(2)?.result.content[0].text ?? '', /^two: /, 'a call with no picture is answered too');
  assert.equal(code, 0);
});

test('over MCP the project is chosen at start: --cwd is the folder every call runs in, and one that is not a folder refuses to start', async t => {
  const out = tempDir('mcp-cwd', t), from = tempDir('mcp-from', t), folder = tempDir('mcp-project', t);
  // A config that reads its storyboard by a path relative to the folder the command line runs in.
  writeFileSync(path.join(folder, 'storyboard.json'), JSON.stringify({title: 'Near', scenes: [{id: 'near', narration: 'A scene read from beside the config.'}]}));
  writeFileSync(path.join(folder, 'storyreel.config.mjs'), `import {readFileSync} from 'node:fs';\nimport project from ${JSON.stringify(pathToFileURL(path.join(project, 'storyreel.config.mjs')).href)};\nexport default {film: flags => ({...project.film(flags), storyboard: JSON.parse(readFileSync('storyboard.json', 'utf8'))})};\n`);
  const {replies} = await mcpSession(['--cwd', folder, '--out', out], [call(1, 'timeline', {})], {cwd: from});
  assert.match(replies.get(1).result.content?.[0].text ?? JSON.stringify(replies.get(1)), /^the whole film: [\d.]+–[\d.]+ s of [\d.]+ s \(times: seconds from the film's start\)\n0\.00 {2}── near$/m);
  const none = spawnSync(process.execPath, [cli, 'mcp', '--cwd', 'nowhere'], {cwd: from, encoding: 'utf8', input: ''});
  assert.equal(none.status, 2); assert.equal(none.stderr.trim(), 'storyreel mcp: --cwd nowhere is not a folder: start the server on the project\'s folder');
});
