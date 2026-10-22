// One script (script.mjs): marks written in the narration — a moment, {name}, and a speaker tag, {@who} — never said and
// never shown. What is said (said, marksOf, linesOf, scriptOf) and every refusal; a mark in a scene with number slots;
// the clock's moments (a beat at a mark, plus, the end of a scene, the pause at a mark); a pacing hold at a mark.
import test from 'node:test';
import assert from 'node:assert/strict';
import {said, marksOf, linesOf, scriptOf, momentOf, makeClock, evenTimings, paceTimings, spokenText, sceneText, unsaidNumbers} from '../src/index.mjs';
import {checkScene} from '../src/clock.mjs';
import {planHolds} from '../src/pacing.mjs';

const talk = "Mom walks in. {@mom}'What are you two up to?' {@amaira}'Mom! I can't wait {wow} to show you!'";

test('what is said: the marks out and the white space they leave tidied; each moment where its next word starts', () => {
  assert.equal(said('Ten ones {dots} make a ten {hop}.'), 'Ten ones make a ten.');
  assert.deepEqual(marksOf('Ten ones {dots} make a ten {hop}.'), [{name: 'dots', at: 9}, {name: 'hop', at: 20}], '{hop} has no word after it: the end of what is said');
  // One run of white space between two words; none at the ends, before a closing mark or after an opening one.
  for (const [written, out] of [['{intro} Hello there.', 'Hello there.'], ['Hello there {end}', 'Hello there'], ['Ten ones {dots}, make', 'Ten ones, make'],
    ['Hello{x} there', 'Hello there'], ['Hello {x}there', 'Hello there'], ['A {x} {y} B', 'A B'], ['(aside {x})', '(aside)'], ['({x} aside)', '(aside)'],
    ["He said {x} 'hi'", "He said 'hi'"], ["'Hi there {wave}' she said", "'Hi there' she said"], ['line one {x}\nline two', 'line one\nline two']]) {
    assert.equal(said(written), out, written);
  }
  // A narration without marks is said exactly as written; the cast's {{role}} is no mark (withCast puts the name there).
  for (const text of ['Plain words.', '  Spaces  as  written ', 'Quotes \'stay\' and "stay".', '{{hero}} waves.', '']) {
    assert.equal(said(text), text); assert.deepEqual(marksOf(text), []); assert.deepEqual(linesOf(text), []);
  }
  assert.equal(said('{{hero}} {wave}waves.'), '{{hero}} waves.');
  // Speaker tags: who says each quoted line, the line inside its quotes with its own marks out (an apostrophe is no quote).
  const text = said(talk);
  assert.equal(text, "Mom walks in. 'What are you two up to?' 'Mom! I can't wait to show you!'");
  assert.deepEqual(linesOf(talk), [{by: 'mom', say: 'What are you two up to?', at: 15}, {by: 'amaira', say: "Mom! I can't wait to show you!", at: 41}]);
  for (const line of linesOf(talk)) assert.equal(text.slice(line.at, line.at + line.say.length), line.say, 'a line stands in what is said where its at says');
  assert.deepEqual(marksOf(talk), [{name: 'wow', at: text.indexOf('to show')}], 'a moment inside a line');
  assert.deepEqual(linesOf('{@a}"One." {@b}‘Two.’ {@c}“Three.” {@d} \'Four.\'').map(l => [l.by, l.say]), [['a', 'One.'], ['b', 'Two.'], ['c', 'Three.'], ['d', 'Four.']], 'each pair of quotes, only spaces after the tag');
  assert.deepEqual(scriptOf({id: 'talk', narration: talk}), {id: 'talk', said: text, lines: linesOf(talk), moments: marksOf(talk)});
  assert.deepEqual(scriptOf({id: 'open', silent: [['the door opens', 1]]}), {id: 'open', said: null, lines: [], moments: []}, 'a silent scene says nothing');
  // A beat's phrase that is a mark names a moment; words are a phrase, as ever.
  assert.equal(momentOf('{hop}'), 'hop'); assert.equal(momentOf('make a ten'), null); assert.equal(momentOf('{{hero}} waves'), null);
  assert.throws(() => momentOf('{@mom}'), /^Error: "\{@mom\}": a speaker tag names who says a line, and is no moment: write a moment where the beat lands/);
  assert.throws(() => momentOf('{1x}'), /^Error: "\{1x\}": not a moment: a moment's name is a letter, then letters, digits, - or _/);
});

test('every refusal names the scene and the mark, and says what to write', () => {
  // Through the scene's check, the timings and said() itself: the same refusal, the scene named.
  const refuses = (narration, why) => {
    for (const read of [() => checkScene({id: 'today', narration}), () => evenTimings({scenes: [{id: 'today', narration}]}), () => said(narration, {name: 'storyboard scene today'})]) assert.throws(read, why);
  };
  refuses('Ten ones {1dots} make', /storyboard scene today: \{1dots\} is not a mark, at "Ten ones \{1dots\} make": a moment is \{name\} and a speaker \{@who\}, each name a letter, then letters, digits, - or _/);
  refuses('Ten {hop it} ones', /\{hop it\} is not a mark/);
  refuses('Ten {@} ones', /\{@\} is not a mark/);
  refuses('Ten ones {dots make a ten.', /storyboard scene today: a "\{" opens a mark that never closes, at "Ten ones \{dots make a ten\.": close it \(\{hop\}\), or take the brace out/);
  refuses('Ten ones dots} make', /storyboard scene today: a "\}" closes no mark, at "Ten ones dots\} make": open the mark \(\{hop\}\), or take the brace out/);
  refuses('Ten ones {dots} make a ten, and {dots} again.', /storyboard scene today: the moment \{dots\} is written twice, at "Ten ones \{dots\} make a ten, and \{dots\} …" and at "… \{dots\} make a ten, and \{dots\} again\.": a moment's name is used once in its scene — rename one/);
  refuses('Ten ones{dots}make', /storyboard scene today: \{dots\} stands inside a word, at "Ten ones\{dots\}make": a mark goes between words — put a space before or after it/);
  refuses('{@mom} walks in.', /storyboard scene today: \{@mom\} stands right before the quoted line it gives a speaker, only spaces between, at .*: write the line in quotes just after it/);
  refuses("{@mom} {look}'Hi!'", /\{@mom\} stands right before the quoted line .*\(a moment goes before the tag, or inside the quotes\)/);
  refuses("{@mom}'What are you up to?", /storyboard scene today: \{@mom\}'s line opens with ' and never closes, at .*: end it with '/);
  refuses("{@mom}'Hi {@dad}' there.", /storyboard scene today: \{@dad\} stands inside \{@mom\}'s line, at .*: end the line with ' before the next speaker/);
  // A silent scene takes no marks; a moment inside a number slot has no word to stand before; nor one the timings put inside a word.
  assert.throws(() => checkScene({id: 'open', silent: [['the door {x} opens', 1]]}), /storyboard scene open: silent\[0\] has a mark, \{x\}, and a silent scene takes none \(a beat names a direction by its words\): take it out/);
  assert.throws(() => evenTimings({scenes: [{id: 'frame', narration: 'It takes 16.67 {x}ms now.', say: [['16.67 ms', 'sixteen point six seven milliseconds']]}]}),
    /storyboard scene frame: the moment \{x\} stands inside the number slot "16\.67 ms" \(say\[0\]\), which the voice says as one run: put it before or after "16\.67 ms"/);
  const joined = {scenes: [{id: 'fact', narration: 'A well-{x}known fact.'}]};
  assert.throws(() => makeClock(joined, evenTimings(joined)), /storyboard scene fact: the moment \{x\} falls inside the timed word "well-known": a moment stands between words — move it before or after the word, or time the word as two/);
  assert.throws(() => said(42), /^TypeError: the narration: narration must be the words said, as one string/);
});

test('a mark in a scene with number slots: the slots stand in what is said, the voice says them in words, a moment before one is its first spoken word', () => {
  const scene = {id: 'frame', narration: 'One frame takes {fast}16.67 ms, at {rate}60 Hz. In {step2}1868 it was slower.', say: [['16.67 ms', 'sixteen point six seven milliseconds'], ['60 Hz', 'sixty hertz']]};
  const board = {scenes: [scene]};
  assert.equal(checkScene(scene), 'spoken');
  assert.equal(spokenText(scene), 'One frame takes sixteen point six seven milliseconds, at sixty hertz. In 1868 it was slower.');
  assert.equal(sceneText(scene), spokenText(scene));
  assert.deepEqual(unsaidNumbers(board), [{scene: 'frame', text: '1868'}], 'the 2 in {step2} is never said');
  const clock = makeClock(board, evenTimings(board)), start = text => clock.words('frame').find(w => w.text.startsWith(text)).start;
  assert.equal(clock.at(['frame', '{fast}']), start('sixteen'), 'the slot is said in words: the moment is its first');
  assert.equal(clock.at(['frame', '{fast}']), clock.at(['frame', '16.67 ms']), 'the moment the phrase as shown names');
  assert.equal(clock.at(['frame', '{rate}']), start('sixty'));
  assert.equal(clock.at(['frame', '{step2}']), start('1868'));
  assert.deepEqual(clock.shownWords(0).map(w => w.text), ['One', 'frame', 'takes', '16.67 ms,', 'at', '60 Hz.', 'In', '1868', 'it', 'was', 'slower.'], 'the captions show the digits, and no mark');
});

test('the clock: a beat at a mark lands when its next word starts, plus as for a phrase; with no word after, at the last word\'s end; the pause at a mark is the gap there', () => {
  const board = {scenes: [{id: 'intro', narration: 'Hello there.'}, {id: 'today', narration: 'Ten ones {dots} make a ten {hop}.'}]};
  const clock = makeClock(board, evenTimings(board)), w = clock.words('today');   // Ten · ones · make · a · ten.
  assert.equal(clock.at(['today', '{dots}']), w[2].start, '{dots}: when "make" starts');
  assert.equal(clock.at(['today', '{dots}']), clock.at(['today', 'make']));
  assert.equal(clock.at(['today', '{dots}', .5]), w[2].start + .5);
  assert.equal(clock.at({scene: 'today', phrase: '{dots}', plus: -.2}), w[2].start - .2);
  assert.equal(clock.at(['today', '{hop}']), w.at(-1).end, '{hop}: no word after it, so when the last word ends');
  assert.deepEqual(clock.pauseAfter(['today', '{dots}']), {start: w[1].end, end: w[2].start}, 'from "ones" ending to "make" starting');
  assert.deepEqual(clock.pauseAfter({scene: 'today', phrase: '{hop}'}), {start: w.at(-1).end, end: clock.end('today')}, 'at the end: to the scene\'s end');
  assert.deepEqual(clock.places('today', '{dots}'), [{start: w[2].start, end: w[2].start}], 'a moment is one place');
  assert.deepEqual(clock.places('today', '{nope}'), []); assert.deepEqual(clock.places('intro', '{dots}'), [], 'a moment is its own scene\'s');
  assert.deepEqual(clock.moments('today'), [{name: 'dots', t: w[2].start}, {name: 'hop', t: w.at(-1).end}]);
  assert.deepEqual(clock.moments('intro'), []);
  // A moment is one time: nth and edge refuse with the fix; one the scene does not have lists those it has.
  assert.throws(() => clock.at({scene: 'today', phrase: '{dots}', nth: 0}), /today "\{dots\}": a moment is one time, so it takes no nth \(its name is used once in its scene\): leave nth out/);
  assert.throws(() => clock.at({scene: 'today', phrase: '{dots}', edge: 'end'}), /today "\{dots\}": a moment is one time, so it takes no edge \(it has no start and end: plus moves it\): leave edge out/);
  assert.throws(() => clock.pauseAfter({scene: 'today', phrase: '{dots}', nth: 1}), /takes no nth/);
  assert.throws(() => clock.at(['today', '{nope}']), /Moment not in today: "\{nope\}" \(its moments: \{dots\}, \{hop\}\)/);
  assert.throws(() => clock.at(['intro', '{dots}']), /Moment not in intro: "\{dots\}" \(it has no moments\)/);
  assert.throws(() => clock.at(['today', '{@mom}']), /today "\{@mom\}": a speaker tag names who says a line, and is no moment/);
  assert.throws(() => clock.at(['today', 'dots']), /Phrase not in today: "dots"/, 'a mark is never said');
});

test('a pacing hold at a mark puts its silence in the pause there: the words after it move by its seconds, the words before do not', () => {
  const board = {scenes: [{id: 'today', narration: 'Ten ones {dots} make a ten. {hop}Then it hops.'}]};
  const even = evenTimings(board), paced = paceTimings(board, even, {sceneTail: .8, holds: [{scene: 'today', after: '{dots}', seconds: 1.5}]});
  const before = makeClock(board, even).words('today'), after = makeClock(board, paced).words('today');
  assert.deepEqual(after.map((w, i) => +(w.start - before[i].start).toFixed(3)), [0, 0, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5], 'Ten ones · make a ten. Then it hops.');
  assert.equal(+(paced.scenes[0].duration - paceTimings(board, even, {sceneTail: .8, holds: []}).scenes[0].duration).toFixed(3), 1.5, 'the scene grows by the hold');
  assert.deepEqual(paced.scenes[0].pacing.holds, [{after: '{dots}', seconds: 1.5, at: +before[1].end.toFixed(3)}], 'held after "ones", the word before the mark');
  assert.deepEqual(makeClock(board, paced).pauseAfter(['today', '{dots}']), {start: after[1].end, end: after[2].start}, 'the pause at the mark is the hold');
  assert.throws(() => paceTimings(board, even, {sceneTail: .8, holds: [{scene: 'today', after: '{nope}', seconds: 1}]}), /Pacing moment not in today: "\{nope\}" \(its moments: \{dots\}, \{hop\}\)/);
  assert.throws(() => paceTimings(board, even, {sceneTail: .8, holds: [{scene: 'today', after: '{@mom}', seconds: 1}]}), /pacing hold in today "\{@mom\}": a speaker tag names who says a line/);
  // A voiced cut cuts its silence in at the quietest point of the pause at the mark, never inside a word (pacing.mjs · planHolds).
  const timing = even.scenes[0], rate = 8000, wav = {rate, samples: Int16Array.from({length: Math.round(timing.duration * rate)}, (_, i) => Math.round(3000 * Math.sin(i / 3)))};
  const [hold] = planHolds(board.scenes[0], timing, [{scene: 'today', after: '{dots}', seconds: 1}], wav);
  assert.ok(hold.time >= before[1].end && hold.time <= before[2].start, `cut in between "ones" (${before[1].end}) and "make" (${before[2].start}), not at ${hold.time}`);
});
