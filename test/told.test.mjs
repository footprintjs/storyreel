// What the film already knows and `storyreel check` must say (src/fix/told.mjs): a key the director left out
// (film.director.dropped) is a finding at its own level, naming its recipe entry, the reason with its seconds and the fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {direct} from '../src/director.mjs';
import {reviewPart, REVIEW_CHECKS, findingsText} from '../src/review.mjs';
import {checkFilm, problemsOf} from '../src/check/index.mjs';
import {DROP_KINDS} from '../src/fix/told.mjs';
import {DROP_LEVELS} from '../src/director/framing.mjs';

const BOXES = {sam: [1100, 300, 1400, 850], 'sam.face': [1190, 300, 1310, 420], lamp: [700, 200, 820, 500]};
const regions = Object.entries(BOXES).map(([name, box]) => ({box, path: `names.${name}`, label: name, name}));
const kit = (name, names) => ({name, story: {compile: () => ({hang: 1, regionsAt: () => regions.filter(r => names.includes(r.name)), draw: c => { c.fillStyle = '#ddd'; c.fillRect(0, 0, 1600, 900); }})}});
// Two pictures, the second from scene b: a close-up on Sam's question needs 6.62 s to fly in and back before b starts.
const board = {scenes: [{id: 'a', narration: 'Night falls here. {@sam}"Is it late?"'}, {id: 'b', narration: 'The yard is dark. The lamp is on.'}]};
const twoPictures = wordSeconds => compileFilm({storyboard: board, timings: evenTimings(board, {wordSeconds, tail: .3}), kits: [kit('ka', ['sam', 'sam.face']), kit('kb', ['lamp'])],
  recipe: {story: {kit: 'ka'}, stages: [{type: 'world', scene: 'b', world: {kit: 'kb'}}], director: 'on'}});
/** What the check is handed by the review, as tools.mjs hands it. */
const reviewed = r => ({findings: r.findings, lines: r.findings.map(f => findingsText([f])), verdicts: [], head: null, notRun: []});
const checkOf = r => checkFilm({anchors: async () => ({notes: [], lines: [], checked: 0, stopped: null}), review: async () => reviewed(r), changes: async () => 'nothing changed', before: () => null});

test('every key left out has a level the check maps, and a warn has a fix', async () => {
  assert.deepEqual(Object.keys(DROP_KINDS), [...DROP_LEVELS]);
  const f = await twoPictures(.6);
  for (const d of f.director.dropped) {
    assert.ok(DROP_LEVELS.includes(d.level), `${d.said}: ${d.level}`);
    if (d.level === 'warn') assert.ok(d.fix, `${d.said}: a warn says how to keep it`);
  }
});

test('a close-up with no time to fly in and back is a fix: named at the director, the reason with its seconds, the fix with the seconds to give', async () => {
  const f = await twoPictures(.6), [drop] = f.director.dropped;
  const r = await reviewPart(f);
  assert.ok(r.ran.includes('director'), 'the review reads what the director left out');
  const found = r.findings.filter(x => x.kind === 'director');
  assert.deepEqual(found.map(x => [x.from, x.to, x.scene, x.where, x.fix]), [[drop.t, drop.t, 'a', 'director', drop.fix]]);
  assert.match(drop.fix, /^give the line \d+\.\d\d s more before the change, or frame it in a scene of its own$/);
  assert.match(found[0].what, /^the question key on "sam\.face" \(close\) at "Is it late\?" in the focus: the picture changes at \d+\.\d\d s \(b\): no time to arrive on "sam\.face" and fly back to wide before it — the flights take \d+\.\d\d s and the voice leaves \d+\.\d\d s$/);
  // the check counts it as something to fix, and says it on its line
  const done = await checkOf(r);
  assert.equal(done.verdict, 'fix');
  const line = done.text.split('\n').find(l => / · left out by the director: /.test(l));
  assert.match(line, /^fix {2}0:0\d\.\d–0:0\d\.\d a · left out by the director: the question key on "sam\.face".* · at director · fix: give the line \d+\.\d\d s more before the change, or frame it in a scene of its own$/);
  // a voice slow enough for both flights keeps the close-up: nothing is left out, and the review reads nothing new
  const slow = await twoPictures(2.4);
  assert.deepEqual(slow.director.dropped, []);
  assert.ok(!(await reviewPart(slow)).ran.includes('director'), 'nothing left out: the check is not run');
});

test('what the director\'s own grammar holds back is advice, its fix the setting that would frame it; a key too soon is a fix whose seconds keep it', async () => {
  const run = {scenes: [{id: 'run', narration: 'The race starts. {@ann}"Go!" {@ann}"Go on!" {@bo}"Faster!" They run. {@ann}"Look!" They run on. {@bo}"Yes!"'}]};
  const times = evenTimings({scenes: [{id: 'run', narration: 'The race starts. Go! Go on! Faster! They run. Look! They run on. Yes!'}]}, {wordSeconds: 1});
  const names = ['ann', 'ann.face', 'bo', 'bo.face'], d = direct({storyboard: run, timings: times, names, groups: false});
  assert.deepEqual(d.dropped.map(x => [x.said, x.level, x.fix ?? null]), [
    ['"Go on!"', 'note', 'to frame it too, give a turn more: "director": {"closeUps": {"perTurn": 2}}'],
    ['They run.', 'warn', 'give "They run." 1.00 s more after "Faster!" (a pause in the voice before it), or let the camera\'s keys come closer ("director": {"gap": 1})'],
    ['"Look!"', 'note', 'to frame it too, give the scene more: "director": {"closeUps": {"perScene": 3}}'],
    ['"Yes!"', 'note', 'to frame it too, give the scene more: "director": {"closeUps": {"perScene": 3}}']]);
  // each fix, followed, frames what it was about
  const followed = direct({storyboard: run, timings: times, names, groups: false, director: {gap: 1, closeUps: {perTurn: 2, perScene: 3}}});
  for (const said of ['"Go on!"', 'They run.', '"Look!"']) assert.ok(!followed.dropped.some(x => x.said === said), `${said} is framed once its fix is followed`);
  // through the check: advice asks for no fix, so a film whose director only held keys back reads clean
  const notes = d.dropped.filter(x => x.level === 'note'), film = {director: {dropped: notes.map(x => ({...x, kind: 'camera', path: 'focus'}))}, clock: {start: () => 0}};
  const hits = REVIEW_CHECKS.director.find({film, window: {from: 0, to: 30}});
  assert.deepEqual(hits.map(h => h.kind), ['director-note', 'director-note', 'director-note']);
  const problems = problemsOf({review: {findings: hits.map(h => ({...h, scene: 'run', from: h.t, to: h.t})), lines: hits.map(h => h.what), verdicts: []}});
  assert.deepEqual(problems.map(p => p.level), ['advice', 'advice', 'advice']);
  assert.match(hits[0].what, /^the exclamation key on "ann\.face" \(close\) at "Go on!" in the focus: held: ann's turn has had its close-up \(closeUps\.perTurn 1\)$/);
});

test('a mood left out is said too: lost to the timing a fix, nothing there to act it on advice', () => {
  const board1 = {scenes: [{id: 's', narration: 'Night. {@mia}"Oh!" {@mia}"Wow!"'}]};
  const rules = {en: {lang: 'en', moods: [{name: 'shock', when: ['Oh!'], mood: 'surprised'}, {name: 'joy', when: ['Wow!'], mood: 'happy'}]}};
  const quick = evenTimings({scenes: [{id: 's', narration: 'Night. Oh! Wow!'}]}, {wordSeconds: .2});
  const d = direct({storyboard: board1, timings: quick, lang: 'en', rules, moods: ['calm', 'surprised', 'happy'], rest: 'calm', names: ['mia']});
  const soon = d.dropped.find(x => x.kind === 'mood' && x.said === '"Wow!"');
  assert.equal(soon.level, 'warn');
  assert.match(soon.fix, /^give "Wow!" \d\.\d\d s more after mia's last change \(a pause in the voice before it\)$/);
  const none = direct({storyboard: board1, lang: 'en', rules, moods: ['calm'], rest: 'calm', names: ['mia']}).dropped.filter(x => x.kind === 'mood');
  assert.deepEqual(none.map(x => [x.level, x.why]), [['note', 'the picture\'s kit acts none of surprised for mia'], ['note', 'the picture\'s kit acts none of happy for mia']]);
});
