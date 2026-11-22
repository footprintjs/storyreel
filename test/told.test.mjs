// What the film already knows and `storyreel check` must say (src/fix/told.mjs): a key the director left out
// (film.director.dropped) is a finding at its own level, naming its recipe entry, the reason with its seconds and the fix;
// and so is what a world's kit says of the world it built (film.kitNotes), naming the world and the entry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {direct} from '../src/director.mjs';
import {reviewPart, REVIEW_CHECKS, findingsText} from '../src/review.mjs';
import {checkFilm, problemsOf} from '../src/check/index.mjs';
import {DROP_KINDS, NOTE_KINDS} from '../src/fix/told.mjs';
import {isometricKit} from '../src/kits/isometric/index.mjs';
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

test('what the director\'s own grammar holds back, and its own keys lost to the timing, are advice, each with the change that would frame it', async () => {
  const run = {scenes: [{id: 'run', narration: 'The race starts. {@ann}"Go!" {@ann}"Go on!" {@bo}"Faster!" They run. {@ann}"Look!" They run on. {@bo}"Yes!"'}]};
  const times = evenTimings({scenes: [{id: 'run', narration: 'The race starts. Go! Go on! Faster! They run. Look! They run on. Yes!'}]}, {wordSeconds: 1});
  const names = ['ann', 'ann.face', 'bo', 'bo.face'], d = direct({storyboard: run, timings: times, names, groups: false});
  assert.deepEqual(d.dropped.map(x => [x.said, x.level, x.fix ?? null]), [
    ['"Go on!"', 'note', 'to frame it too, give a turn more: "director": {"closeUps": {"perTurn": 2}}'],
    // the director's own way back to medium, too soon after Bo's close-up: its key, not the author's — a note
    ['They run.', 'note', 'give "They run." 1.00 s more after "Faster!" (a pause in the voice before it), or let the camera\'s keys come closer ("director": {"gap": 1})'],
    ['"Look!"', 'note', 'to frame it too, give the scene more: "director": {"closeUps": {"perScene": 3}}'],
    ['"Yes!"', 'note', 'to frame it too, give the scene more: "director": {"closeUps": {"perScene": 3}}']]);
  // each fix, followed, frames what it was about
  const followed = direct({storyboard: run, timings: times, names, groups: false, director: {gap: 1, closeUps: {perTurn: 2, perScene: 3}}});
  for (const said of ['"Go on!"', 'They run.', '"Look!"']) assert.ok(!followed.dropped.some(x => x.said === said), `${said} is framed once its fix is followed`);
  // through the check: advice asks for no fix, so a film whose director only held keys back reads clean
  const notes = d.dropped.filter(x => x.level === 'note'), film = {director: {dropped: notes.map(x => ({...x, kind: 'camera', path: 'focus'}))}, clock: {start: () => 0}};
  const hits = REVIEW_CHECKS.director.find({film, window: {from: 0, to: 30}});
  assert.deepEqual(hits.map(h => h.kind), ['director-note', 'director-note', 'director-note', 'director-note']);
  const problems = problemsOf({review: {findings: hits.map(h => ({...h, scene: 'run', from: h.t, to: h.t})), lines: hits.map(h => h.what), verdicts: []}});
  assert.deepEqual(problems.map(p => p.level), ['advice', 'advice', 'advice', 'advice']);
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

// A map whose wire passes behind a tall block (a warn), then from scene two a slab too big for its paper grain (an info).
const sb = {scenes: [{id: 'one', narration: 'A map with a wire behind a tall block.'}, {id: 'two', narration: 'A slab of paper.'}]};
const behind = {kit: 'isometric', blocks: [{name: 'app', at: [0, 0]}, {name: 'logs', at: [3, 3], size: [2, 2, 3]}, {name: 'db', at: [5, 6]}], wires: [{arrow: 'app to db'}]};
const slab = style => ({kit: 'isometric', style, blocks: [{name: 'slab', at: [0, 0], size: [10, 10, 1], label: 'Slab'}, {name: 'a', at: [12, 0], label: 'A'}]});
const mapFilm = (style = {look: 'paper-grain'}) => compileFilm({storyboard: sb, timings: evenTimings(sb), recipe: {story: behind, stages: [{type: 'world', scene: 'two', world: slab(style)}]}, kits: [isometricKit]});

test('a world\'s warning is a fix and its note advice, each at the world\'s first moment on screen, naming the world, the entry and the kit\'s fix', async () => {
  const f = await mapFilm(), two = f.clock.start('two');
  assert.deepEqual(f.kitNotes.map(n => [n.level, n.path]), [['warn', 'story.wires[0]'], ['info', 'stages[0].world.blocks[0]']]);
  for (const n of f.kitNotes) assert.ok(n.fix && n.message.endsWith(` — ${n.fix}`), `${n.path}: its fix is the words after " — "`);
  const r = await reviewPart(f), found = r.findings.filter(x => x.kind.startsWith('world'));
  assert.ok(r.ran.includes('world'));
  assert.deepEqual(found.map(x => [x.kind, x.from, x.scene, x.where]), [['world', 0, 'one', 'story.wires[0]'], ['world-note', two, 'two', 'stages[0].world.blocks[0]']]);
  assert.equal(found[0].what, 'the story: isometric wires[0] (app to db): passes behind logs: that stretch of it is hidden', 'the world and its entry named, the fix said apart');
  assert.equal(found[0].fix, 'move it or the two blocks (at) so there is floor to see between, or draw the wire straight ("arrow": "app to db 0")');
  assert.match(found[1].what, /^stage two: isometric blocks\[0\] \("slab"\): its paper grain is laid wider than the style's spacing on 1 face/);
  assert.equal(found[1].fix, 'make the block smaller (size), or write the grain out wider on every face: "style": {"texture": {"name": "human:grain", "spacing": 32}} in place of "look": "paper-grain"');
  // through the check: the warning asks for a fix, the note is advice
  const done = await checkOf(r);
  assert.ok(done.said.problems.some(p => p.level === 'error' && p.kind === 'world' && / · its world warns: the story: isometric wires\[0\].* · at story\.wires\[0\] · fix: move it or the two blocks/.test(p.line)));
  assert.ok(done.said.problems.some(p => p.level === 'advice' && p.kind === 'world-note'));
  // a part that shows only the first world says only its note
  const part = await reviewPart(f, {part: {scenes: ['one'], handles: 0}});
  assert.deepEqual(part.findings.filter(x => x.kind.startsWith('world')).map(x => x.where), ['story.wires[0]']);
});

test('the fix a world\'s note names can be followed: the grain written out at the spacing it gives lays every face alike', async () => {
  const followed = await mapFilm({texture: {name: 'human:grain', spacing: 32}});
  assert.deepEqual(followed.kitNotes.map(n => n.path), ['story.wires[0]'], 'the slab says nothing now');
  const plain = await mapFilm({texture: {name: 'human:grain', spacing: 16}});
  assert.equal(plain.kitNotes[1].fix, 'make the block smaller (size), or give the grain a wider spacing on every face (texture: {"name": "human:grain", "spacing": 32}, or wider)', 'a world with no look is told its own texture');
  assert.deepEqual(Object.keys(NOTE_KINDS), ['warn', 'info']);
  // a world that says nothing adds nothing: the review does not read worlds' notes
  const quiet = await compileFilm({storyboard: sb, timings: evenTimings(sb), recipe: {story: {kit: 'isometric', blocks: [{name: 'a', label: 'A'}, {name: 'b', label: 'B'}], wires: [{arrow: 'a to b'}]}}, kits: [isometricKit]});
  assert.deepEqual(quiet.kitNotes, []);
  assert.ok(!(await reviewPart(quiet)).ran.includes('world'));
});

// The reviewer's probe: the director's default rules, a new scene in the same picture opening on a thing it names. The
// scene's wide key and the sentence's insert land at once, so the insert is lost to the gap however slow the voice.
const desk = {scenes: [{id: 'a', narration: 'Night falls. The lamp glows.'}, {id: 'b', narration: 'The desk is bare.'}]};
const deskFilm = wordSeconds => compileFilm({storyboard: desk, timings: evenTimings(desk, {wordSeconds, tail: .3}), kits: [kit('room', ['lamp', 'desk'])], recipe: {story: {kit: 'room'}, director: 'on'}});
BOXES.desk = [200, 500, 500, 700]; regions.push({box: BOXES.desk, path: 'names.desk', label: 'desk', name: 'desk'});

test('the director\'s own keys lost to the timing are notes: a director film with no rules of its own reads clean', async () => {
  for (const wordSeconds of [1, 3]) {
    const f = await deskFilm(wordSeconds), lost = f.director.dropped.find(d => d.said === 'The desk is bare.' && d.rule === 'insert');
    assert.ok(lost, `${wordSeconds} s a word: the insert on the desk is left out`);
    assert.equal(lost.level, 'note', 'the director\'s own insert: advice, never a fix the author cannot follow');
    assert.ok(f.director.dropped.every(d => d.level === 'note'), 'the author asked for nothing here');
    const r = await reviewPart(f, {checks: {director: REVIEW_CHECKS.director}});
    assert.ok(r.findings.length && r.findings.every(x => x.kind === 'director-note'));
    assert.equal((await checkOf(r)).verdict, 'clean', `${wordSeconds} s a word: what the director left out asks for no fix`);
  }
});

test('a key the author asked for and the timing lost is a fix, a key moment too — never filed as a note', () => {
  const board1 = {scenes: [{id: 'race', narration: 'The race starts. {@ann}"Go!" {@bo}"Yes!"'}]};
  const quick = evenTimings({scenes: [{id: 'race', narration: 'The race starts. Go! Yes!'}]}, {wordSeconds: .5});
  const rules = {shots: [{name: 'win', when: ['Yes!'], shot: 'close', key: true}]};
  const d = direct({storyboard: board1, timings: quick, names: ['ann', 'ann.face', 'bo', 'bo.face'], groups: false, director: {rules}});
  const win = d.dropped.find(x => x.said === '"Yes!"');
  assert.deepEqual([win.rule, win.name, win.level], ['line', 'win', 'warn']);
  assert.match(win.fix, /^give "Yes!" \d\.\d\d s more after "Go!" \(a pause in the voice before it\)/);
  const go = d.dropped.find(x => x.said === '"Go!"');
  assert.ok(!go || go.level === 'warn', 'a line\'s own close-up is the author\'s too');
});
