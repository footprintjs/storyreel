// One script (script.mjs): marks written in the narration — a moment, {name}, and a speaker tag, {@who} — never said and
// never shown. What is said (said, momentsOf, linesOf, sceneScript) and every refusal; the white space and quotes around
// marks, held to any narration of words, quotes and marks; reading in linear time; a mark in a scene with number slots;
// the clock's moments (a beat at a mark, plus, the end of a scene, the pause at a mark); a pacing hold at a mark; the
// anchors; the script tool; and a film keyed to moments that keeps its beats on their words when a line is reworded.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {said, momentsOf, linesOf, sceneScript, momentOf, makeClock, evenTimings, paceTimings, spokenText, sceneText, unsaidNumbers, compileFilm, castText, readCast} from '../src/index.mjs';
import {momentFix} from '../src/script.mjs';
import {checkScene} from '../src/clock.mjs';
import {planHolds} from '../src/pacing.mjs';
import {checkPhrase, anchorsText, phrasesIn} from '../src/anchors.mjs';
import {readInputs, script, TOOLS} from '../src/tools.mjs';
import {startStudio} from '../src/studio/server.mjs';

/** A kit whose spec names beats, each resolved as any kit resolves them. */
const kit = {name: 'beats', story: {compile: (spec, c) => { for (const b of spec.beats ?? []) c.at(b); return {hang: 1, draw() {}}; }}};
const talk = 'Mom walks in. {@mom}"What are you two up to?" {@amaira}"Mom! I can\'t wait {wow} to show you!"';

test('what is said: the marks out and the white space they leave tidied; each moment where its next word starts', () => {
  assert.equal(said('Ten ones {dots} make a ten {hop}.'), 'Ten ones make a ten.');
  assert.deepEqual(momentsOf('Ten ones {dots} make a ten {hop}.'), [{name: 'dots', offset: 9}, {name: 'hop', offset: 20}], '{hop} has no word after it: the end of what is said');
  // One run of white space between two words; none at the ends, before a closing mark or after an opening one.
  for (const [written, out] of [['{intro} Hello there.', 'Hello there.'], ['Hello there {end}', 'Hello there'], ['Ten ones {dots}, make', 'Ten ones, make'],
    ['Hello{x} there', 'Hello there'], ['Hello {x}there', 'Hello there'], ['A {x} {y} B', 'A B'], ['(aside {x})', '(aside)'], ['({x} aside)', '(aside)'],
    ["He said {x} 'hi'", "He said 'hi'"], ["'Hi there {wave}' she said", "'Hi there' she said"], ['‘Hi there {wave}’ she said', '‘Hi there’ she said'], ['line one {x}\nline two', 'line one\nline two']]) {
    assert.equal(said(written), out, written);
  }
  // A narration without marks is said exactly as written; the cast's {{role}} is no mark (withCast puts the name there).
  for (const text of ['Plain words.', '  Spaces  as  written ', 'Quotes \'stay\' and "stay".', '{{hero}} waves.', '']) {
    assert.equal(said(text), text); assert.deepEqual(momentsOf(text), []); assert.deepEqual(linesOf(text), []);
  }
  assert.equal(said('{{hero}} {wave}waves.'), '{{hero}} waves.');
  // Speaker tags: who says each quoted line, the line inside its quotes with its own marks out (an apostrophe is no quote).
  const text = said(talk);
  assert.equal(text, 'Mom walks in. "What are you two up to?" "Mom! I can\'t wait to show you!"');
  assert.deepEqual(linesOf(talk), [{by: 'mom', say: 'What are you two up to?', offset: 15}, {by: 'amaira', say: 'Mom! I can\'t wait to show you!', offset: 41}]);
  for (const line of linesOf(talk)) assert.equal(text.slice(line.offset, line.offset + line.say.length), line.say, 'a line stands in what is said at its offset');
  assert.deepEqual(momentsOf(talk), [{name: 'wow', offset: text.indexOf('to show')}], 'a moment inside a line');
  assert.deepEqual(linesOf('{@a}"One." {@b}‘Two.’ {@c}“Three.” {@d} \'Four.\' {@e}\'I can\'t.\'').map(l => [l.by, l.say]), [['a', 'One.'], ['b', 'Two.'], ['c', 'Three.'], ['d', 'Four.'], ['e', 'I can\'t.']], 'each pair of quotes, only spaces after the tag');
  assert.deepEqual(sceneScript({id: 'talk', narration: talk}), {id: 'talk', said: text, lines: linesOf(talk), moments: momentsOf(talk)});
  assert.deepEqual(sceneScript({id: 'open', silent: [['the door opens', 1]]}), {id: 'open', said: null, lines: [], moments: []}, 'a silent scene says nothing');
  // A beat's phrase that is a mark names a moment; words are a phrase, as ever.
  assert.equal(momentOf('{hop}'), 'hop'); assert.equal(momentOf(' {hop} '), 'hop'); assert.equal(momentOf('make a ten'), null); assert.equal(momentOf('{{hero}} waves'), null);
  assert.throws(() => momentOf('{@mom}'), /^Error: "\{@mom\}": a speaker tag names who says a line, and is no moment: write a moment where the beat lands/);
  assert.throws(() => momentOf('{1x}'), /^Error: "\{1x\}": not a moment: a moment's name is a letter, then letters, digits, - or _/);
});

test('the white space between marks, and a mark before an opening quote, never glue words: each reads as written without the marks', () => {
  for (const [written, out] of [
    ['Mom walks in. {@mom}\'{wave}Hi!\'', 'Mom walks in. \'Hi!\''], ['He said {x} \'{y}hi there\'', 'He said \'hi there\''], ['He said {x} "{y}hi there"', 'He said "hi there"'],
    ['One.\n\n{x}\n\'{y}Two.\'', 'One.\n\n\'Two.\''], ['I stayed {x} ’cause it rained.', 'I stayed ’cause it rained.'], ['Line one.{a}\n{b}Line two.', 'Line one.\nLine two.'],
    ['Hello,{a} {b}there', 'Hello, there'], ['Hello{a} {b}there', 'Hello there'], ['Mom walks in. {look} {@mom}"{wave}Hi!"', 'Mom walks in. "Hi!"']]) {
    assert.equal(said(written), out, written);
  }
  // The clock then finds each moment at its own word, never inside one glued to it.
  const at = (narration, mark) => { const board = {scenes: [{id: 's', narration}]}, clock = makeClock(board, evenTimings(board)); return clock.words('s').find(w => w.start === clock.at(['s', mark]))?.text; };
  assert.equal(at('Mom walks in. {@mom}\'{wave}Hi!\'', '{wave}'), '\'Hi!\'');
  assert.equal(at('He said {x} \'{y}hi there\'', '{x}'), '\'hi');
  assert.equal(at('I stayed {x} ’cause it rained.', '{x}'), '’cause');
  assert.equal(at('Hello{a} {b}there', '{b}'), 'there');
  assert.deepEqual(linesOf('Mom walks in. {@mom}\'{wave}Hi!\''), [{by: 'mom', say: 'Hi!', offset: 15}]);
});

test('any narration of words, quotes and marks reads as written: no brace is left, each moment is when its own word starts', () => {
  // 4 000 narrations from a seeded generator: words (an apostrophe, accents, Tamil, digits), quotes of every kind,
  // punctuation, line breaks, and marks before a word, after it, before its opening quote, or on their own.
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648, pick = list => list[Math.floor(rnd() * list.length)];
  const WORDS = ['ten', 'ones', 'can\'t', 'make', 'a', 'Café', 'dogs\'', '42', 'naïve', 'über', 'கடை'], PUNCT = ['', '', '', ',', '.', '!', '?', '…', ';'];
  const OPEN = ['', '', '', '(', '\'', '"', '“', '‘'], CLOSE = {'(': ')', '\'': '\'', '"': '"', '“': '”', '‘': '’', '': ''};
  const failures = [];
  for (let n = 0; n < 4000; n++) {
    let text = '', k = 0;
    for (let p = 0, parts = 3 + Math.floor(rnd() * 8); p < parts; p++) {
      const open = pick(OPEN), word = pick(WORDS), mark = rnd() < .35 ? `{m${k++}}` : '', where = Math.floor(rnd() * 4);
      const token = `${where === 2 ? mark : ''}${open}${where === 0 ? mark : ''}${word}${CLOSE[open]}${pick(PUNCT)}${where === 1 ? mark : ''}`;
      text += (p ? pick([' ', ' ', ' ', '  ', '\n']) : '') + token;
      if (rnd() < .15) text += ` {m${k++}}`;
    }
    const s = said(text), moments = momentsOf(text), board = {scenes: [{id: 's', narration: text}]}, clock = makeClock(board, evenTimings(board));
    if (/[{}]/.test(s)) failures.push(['a brace is left', text, s]);
    const words = clock.words('s'), tokens = [...s.matchAll(/\S+/g)];
    for (const m of moments) {
      const t = clock.at(['s', `{${m.name}}`]);
      if (m.offset >= s.length) { if (t !== words.at(-1).end) failures.push(['the end', text, m.name]); continue; }
      if (!/[\p{L}\p{M}\p{N}]/u.test(s[m.offset])) failures.push(['its offset is no word', text, m.name]);
      const k2 = tokens.findLastIndex(x => x.index <= m.offset);
      if (!/[\p{L}\p{M}\p{N}]/u.test(s.slice(tokens[k2].index, m.offset)) && t !== words[k2].start) failures.push(['another word', text, m.name]);
    }
  }
  assert.deepEqual(failures.slice(0, 5), [], `${failures.length} of 4000 narrations`);
});

test('every refusal names the scene and the mark, quoted so nothing in it reads as the message, and says what to write', () => {
  // Through the scene's check, the timings and said() itself: the same refusal, the scene named.
  const refuses = (narration, why) => {
    for (const read of [() => checkScene({id: 'today', narration}), () => evenTimings({scenes: [{id: 'today', narration}]}), () => said(narration, {name: 'storyboard scene today'})]) assert.throws(read, why);
  };
  refuses('Ten ones {1dots} make', /storyboard scene today: "\{1dots\}" is not a mark, at "Ten ones \{1dots\} make": a moment is \{name\} and a speaker \{@who\}, each name a letter, then letters, digits, - or _/);
  refuses('Ten {hop it} ones', /"\{hop it\}" is not a mark/);
  refuses('Ten {@} ones', /"\{@\}" is not a mark/);
  refuses('Ten ones {dots make a ten.', /storyboard scene today: a "\{" opens a mark that never closes, at "Ten ones \{dots make a ten\.": close it \(\{hop\}\), or take the brace out/);
  refuses('Ten ones dots} make', /storyboard scene today: a "\}" closes no mark, at "Ten ones dots\} make": open the mark \(\{hop\}\), or take the brace out/);
  refuses('Ten ones {dots} make a ten, and {dots} again.', /storyboard scene today: the moment \{dots\} is written twice, at "Ten ones \{dots\} make a ten, and \{dots\} …" and at "… \{dots\} make a ten, and \{dots\} again\.": a moment's name is used once in its scene — rename one/);
  refuses('Ten ones{dots}make', /storyboard scene today: "\{dots\}" stands inside a word, at "Ten ones\{dots\}make": a mark goes between words — put a space before or after it/);
  refuses('{@mom} walks in.', /storyboard scene today: "\{@mom\}" stands right before the quoted line it gives a speaker, only spaces between, at .*: write the line in quotes just after it/);
  refuses('{@mom} {look}"Hi!"', /"\{@mom\}" stands right before the quoted line .*\(a moment goes before the tag, or inside the quotes\)/);
  refuses('{@mom}"What are you up to?', /storyboard scene today: "\{@mom\}"'s line opens with " and never closes, at .*: end it with "/);
  refuses('{@mom}"Hi {@dad}" there.', /storyboard scene today: "\{@dad\}" stands inside "\{@mom\}"'s line, at .*: end the line with " before the next speaker/);
  // An apostrophe can end a line in '…' or ‘…’ quotes: a line that could end at two places refuses, naming both and the fix.
  refuses('{@mom}\'The dogs\' bowls are empty.\' she says', /storyboard scene today: "\{@mom\}"'s line could end at "\{@mom\}'The dogs'" or at "…e dogs' bowls are empty\.'": an apostrophe reads as the end of a line in '…' quotes — write the line in "…" quotes$/);
  refuses('{@kid}‘I’m goin’ home now.’ he said', /line could end at "\{@kid\}‘I’m goin’" or at .*in ‘…’ quotes — write the line in "…" quotes$/);
  assert.deepEqual(linesOf('{@mom}"The dogs\' bowls are empty." she says').map(l => l.say), ['The dogs\' bowls are empty.'], 'in "…" quotes the apostrophe is only an apostrophe');
  assert.deepEqual(linesOf('{@mom}\'Hi.\' she said, \'then left.\'').map(l => l.say), ['Hi.'], 'a closing quote after a stop is never an apostrophe');
  // A silent scene takes no marks; a moment inside a number slot has no word to stand before; nor one the timings put inside a word.
  assert.throws(() => checkScene({id: 'open', silent: [['the door {x} opens', 1]]}), /storyboard scene open: silent\[0\] has a mark, "\{x\}", and a silent scene takes none \(a beat names a direction by its words\): take it out/);
  assert.throws(() => evenTimings({scenes: [{id: 'frame', narration: 'It takes 16.67 {x}ms now.', say: [['16.67 ms', 'sixteen point six seven milliseconds']]}]}),
    /storyboard scene frame: the moment \{x\} stands inside the number slot "16\.67 ms" \(say\[0\]\), which the voice says as one run: put it before or after "16\.67 ms"/);
  const joined = {scenes: [{id: 'fact', narration: 'A well-{x}known fact.'}]};
  assert.throws(() => makeClock(joined, evenTimings(joined)), /storyboard scene fact: the moment \{x\} falls inside the timed word "well-known": a moment stands between words — move it before or after the word, or time the word as two/);
  assert.throws(() => said(42), /^TypeError: the narration: narration must be the words said, as one string/);
  // What a refusal quotes is JSON's: a control character, a line break or a huge mark never reaches the terminal as it is.
  const quote = text => { try { said(text, {name: 'scene h'}); } catch (e) { return e.message; } return null; };
  assert.match(quote('Hello {\u001b[31mRED\u001b[0m} there'), /^scene h: "\{\\u001b\[31mRED\\u001b\[0m\}" is not a mark/);
  assert.match(quote('Hello {a\nb} there'), /^scene h: "\{a\\nb\}" is not a mark, at "Hello \{a\\nb\} there"/);
  const huge = quote(`Hello {${'a b '.repeat(2000)}} there`);
  assert.ok(huge.length < 400 && /"\{a b a b .*…" is not a mark/.test(huge), huge.slice(0, 200));
  const long = quote(`one {${'é'.repeat(200)}} two {${'é'.repeat(200)}}`), name = /the moment \{(é+)…\} is written twice/.exec(long)?.[1];
  assert.ok(name && name.length < 40 && long.length < 400, long);
  assert.doesNotMatch(quote(`${'😀'.repeat(30)} {bad mark}`), /�|\\ud83d"/, 'never half a character');
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

test('a moment before a number slot that starts with a symbol the voice does not say ($, €, −, (, #) stands before its first spoken word', () => {
  // A slot that starts with a symbol the voice does not say ($, €, −, (, #): a moment before it is its first spoken word.
  for (const [narration, slot, first] of [['It costs {x} $5 today.', ['$5', 'five dollars'], 'five'], ['It costs {x}$5 today.', ['$5', 'five dollars'], 'five'], ['It costs {x} €10 today.', ['€10', 'ten euros'], 'ten'],
    ['It is {x} −3 °C outside.', ['−3 °C', 'minus three degrees'], 'minus'], ['It takes {x} (16.67 ms) per frame.', ['(16.67 ms)', 'sixteen point six seven milliseconds'], 'sixteen'], ['We are {x} #1 again.', ['#1', 'number one'], 'number']]) {
    const s = {id: 'slot', narration, say: [slot]}, b = {scenes: [s]}, c = makeClock(b, evenTimings(b));
    assert.equal(checkScene(s), 'spoken', narration);
    assert.equal(c.words('slot').find(w => w.start === c.at(['slot', '{x}'])).text, first, narration);
  }
  // A mark after a slot's digits ("5{x}%") stands before the next word said after it: the voice says the slot as one run.
  const pct = {scenes: [{id: 'slot', narration: 'It is 5{x}% more.', say: [['5%', 'five percent']]}]}, after = makeClock(pct, evenTimings(pct));
  assert.equal(after.words('slot').find(w => w.start === after.at(['slot', '{x}'])).text, 'more.');
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

test('a phrase is a moment alone or words alone, and one rule says what a moment takes: the clock refuses by it, the anchors note by it', () => {
  // A mark with other words is neither a moment nor a phrase: it refuses, naming both ways to write it.
  for (const phrase of ['a {ten}', '{hop}.', '{hop}hop', '{a} {b}', 'a } b']) assert.throws(() => momentOf(phrase, 'today'), /^Error: today: a moment is named alone \("\{ten\}"\), and a phrase is the words said, with no braces \("a ten"\): write one or the other$/, phrase);
  assert.throws(() => momentOf('{@mom}'), /^Error: "\{@mom\}": a speaker tag names who says a line, and is no moment: write a moment where the beat lands \(\{look\}\{@mom\}"…"\) and name that \("\{look\}"\)$/);
  assert.throws(() => momentOf('{@mom}', null), /^Error: a speaker tag names who says a line/, 'with no where, the reason alone');
  const board = {scenes: [{id: 'today', narration: 'Ten ones {dots} make a ten {hop}.'}]}, clock = makeClock(board, evenTimings(board));
  assert.throws(() => clock.at(['today', 'a {ten}']), /today "a \{ten\}": a moment is named alone/);
  // nth and edge on a moment: one rule (script.mjs · momentFix), the clock's refusal and the anchors' note word for word.
  assert.equal(momentFix({}), null);
  assert.equal(momentFix({nth: 0}), 'a moment is one time, so it takes no nth (its name is used once in its scene): leave nth out');
  assert.throws(() => clock.at({scene: 'today', phrase: '{dots}', nth: 1, edge: 'end'}), new RegExp(`today "\\{dots\\}": ${momentFix({nth: 1, edge: 'end'}).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
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

test('the pause at a mark never runs backwards: a voice\'s word may start just before the one before it ends, and a hold at the mark still moves the word after it', () => {
  const board = {scenes: [{id: 'today', narration: 'Ten ones {dots} make a ten. {hop}Then it hops.'}]};
  const overlap = {scenes: [{id: 'today', duration: 4, alignment: {status: 'available'}, words: [{text: 'Ten', start: .1, end: .5}, {text: 'ones', start: .5, end: 1}, {text: 'make', start: .99, end: 1.4},
    {text: 'a', start: 1.5, end: 1.6}, {text: 'ten.', start: 1.7, end: 2.1}, {text: 'Then', start: 2.3, end: 2.6}, {text: 'it', start: 2.7, end: 2.8}, {text: 'hops.', start: 2.9, end: 3.3}]}]};
  const held = makeClock(board, paceTimings(board, overlap, {sceneTail: .8, holds: [{scene: 'today', after: '{dots}', seconds: 1.5}]}));
  assert.equal(held.at(['today', '{dots}']), .99 + 1.5, '"make" waits the hold');
  assert.ok(held.pauseAfter(['today', '{dots}']).end > held.pauseAfter(['today', '{dots}']).start, 'the pause at the mark is never backwards');
});

test('the anchors know marks: one its scene does not have is missing, the scene\'s moments listed; never ambiguous; nth or edge on one is noted; a speaker tag is no anchor', async () => {
  const board = {scenes: [{id: 'today', narration: 'Ten ones {dots} make a ten {hop}. {@mom}"And ten tens?"'}]}, timings = evenTimings(board), clock = makeClock(board, timings);
  assert.deepEqual(checkPhrase(clock, ['today', '{dots}']), {problem: null, places: clock.places('today', '{dots}')});
  assert.deepEqual(checkPhrase(clock, ['today', '{nope}']), {problem: 'missing', places: [], near: null}, 'no nearest words: a mark has none');
  assert.equal(checkPhrase(clock, {scene: 'today', phrase: '{dots}', nth: 0}).problem, 'moment');
  assert.equal(checkPhrase(clock, ['today', '{@mom}']).problem, 'missing', 'a speaker tag is no anchor');
  assert.equal(checkPhrase(clock, ['nowhere', '{dots}']).problem, 'scene');
  // Read from a recipe by their shape, as a phrase is.
  const recipe = {story: {kit: 'beats', beats: [['today', '{dots}'], ['today', '{nope}', .3], {scene: 'today', phrase: '{hop}', nth: 0}, ['today', '{@mom}'], ['today', '{1x}']]}};
  assert.deepEqual(phrasesIn(recipe, new Set(['today'])).map(p => [p.path, p.ref]), recipe.story.beats.map((ref, i) => [`story.beats[${i}]`, ref]));
  // Noted by the compile, each standing in where it can, and said as text — with the clock's own reason, word for word.
  const film = await compileFilm({storyboard: board, timings, recipe, kits: [kit], anchors: 'note'});
  assert.deepEqual(film.anchors.map(n => [n.problem, n.path]), [['missing', 'story.beats[1]'], ['moment', 'story.beats[2]'], ['missing', 'story.beats[3]'], ['missing', 'story.beats[4]']]);
  const at = path => film.beats.find(b => b.path === path).t;
  assert.equal(at('story.beats[1]'), +(clock.start('today') + .3).toFixed(3), 'a missing moment stands at its scene\'s start');
  assert.equal(at('story.beats[2]'), +clock.at(['today', '{hop}']).toFixed(3), 'a moment named with nth stands at the moment');
  const text = anchorsText({clock: film.clock, notes: film.anchors, checked: 5});
  assert.match(text, /^5 phrases checked: 3 not said, 1 a moment named with nth or edge\n/);
  assert.match(text, /\n {2}today "\{nope\}" → story\.beats\[1\] — no such moment in today; its moments: \{dots\} \([\d.]+ s\) · \{hop\} \([\d.]+ s\)\n/);
  const reason = ref => { try { clock.at(ref); } catch (e) { return e.message.replace(/^today "[^"]*": /, ''); } return null; };
  for (const [path, ref] of [['story.beats[3]', ['today', '{@mom}']], ['story.beats[4]', ['today', '{1x}']]]) assert.ok(text.includes(`today "${ref[1]}" → ${path} — ${reason(ref)}`), `${path}: ${reason(ref)}\n${text}`);
  assert.ok(text.includes(`today "{hop}" → story.beats[2] — ${momentFix({nth: 0})}`), 'nth on a moment: the clock\'s rule, word for word');
  await assert.rejects(compileFilm({storyboard: board, timings, recipe: {story: {kit: 'beats', beats: [['today', '{nope}']]}}, kits: [kit]}), /Moment not in today: "\{nope\}"/, 'by default the compile stops at it');
});

const project = fileURLToPath(new URL('./fixtures/script/', import.meta.url)), cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const run = args => spawnSync(process.execPath, [cli, ...args], {cwd: project, encoding: 'utf8'});

test('storyreel script: the spoken scenes as JSON, one a line — what is said, who says each line, each moment — for a voice step in any language', async () => {
  const r = run(['script']);
  assert.equal(r.status, 0, r.stderr);
  const scenes = JSON.parse(r.stdout);
  assert.deepEqual(scenes, [
    {id: 'today', speaker: 'grandma', said: 'Ten ones make a ten.', lines: [], moments: [{name: 'dots', offset: 9}, {name: 'hop', offset: 20}]},
    {id: 'talk', said: 'Mom walks in. "What are you two up to?" "Mom! I can add 16 and 24 now!"', spoken: 'Mom walks in. "What are you two up to?" "Mom! I can add sixteen and twenty-four now!"',
      lines: [{by: 'mom', say: 'What are you two up to?', offset: 15}, {by: 'amaira', say: 'Mom! I can add 16 and 24 now!', offset: 41, spoken: 'Mom! I can add sixteen and twenty-four now!'}], moments: []},
    {id: 'frame', said: `One frame takes 16.67 ms.${String.fromCodePoint(0x2028)}That is fast.`, spoken: `One frame takes sixteen point six seven milliseconds.${String.fromCodePoint(0x2028)}That is fast.`, lines: [], moments: [{name: 'fast', offset: 16}]},
  ], 'the silent scene left out, the cast\'s name in, the scene\'s speaker, `spoken` only where the voice says something else (a line too)');
  // One scene a line, as any reader splits lines — Python's splitlines() too, which breaks at U+2028, U+2029 and U+0085.
  const lines = r.stdout.trim().split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u{2028}\u{2029}]/u);
  assert.deepEqual(lines.slice(1, -1).map(line => JSON.parse(line.replace(/,$/, '')).id), ['today', 'talk', 'frame'], 'one scene a line, inside [ and ]');
  assert.equal(await script(await readInputs({cwd: project})), r.stdout.trim(), 'the tool, as the command line runs it');
  assert.equal(TOOLS.script.load, 'config', 'it reads the config\'s film untimed');
  const bad = run(['script', '--bad', 'true']);
  assert.equal(bad.status, 1); assert.match(bad.stderr, /^storyreel script: storyboard scene today: a "\{" opens a mark that never closes, at "Ten ones \{dots make a ten\.": close it/);
  const help = run(['script', '--help']);
  assert.equal(help.status, 0); assert.match(help.stdout, /^storyreel script \[--flag value …\] {3}The film's script as JSON, one spoken scene a line, .*\n {2}--config {2}the project file/);
});

test('a film keyed to moments keeps its beats on their words when a line is reworded; the same film keyed by phrases breaks', async () => {
  const lines = {
    first: 'Ten ones {dots} make a ten. The new ten {hop}hops to the tens place.',
    reworded: 'Look closely: ten little ones {dots} make one ten together. And now the new ten {hop}hops over to the tens place.',
  };
  const recipe = {story: {kit: 'beats', beats: [['count', '{dots}'], ['count', '{hop}', .2]]}, guesses: [{after: ['count', '{dots}'], question: 'How many ones?'}]};
  const pacing = {sceneTail: .8, holds: [{scene: 'count', after: '{dots}', seconds: 1.5}]};
  const times = {};
  for (const [version, narration] of Object.entries(lines)) {
    const storyboard = {scenes: [{id: 'count', narration}, {id: 'next', narration: 'That is how a ten is made.'}]};
    const even = evenTimings(storyboard), film = await compileFilm({storyboard, timings: paceTimings(storyboard, even, pacing), recipe, kits: [kit]});
    const words = film.clock.words('count'), start = word => words.find(w => w.text === word).start, at = path => film.beats.find(b => b.path === path).t;
    assert.equal(at('story.beats[0]'), +start('make').toFixed(3), `${version}: {dots} lands as "make" is said`);
    assert.equal(at('story.beats[1]'), +(start('hops') + .2).toFixed(3), `${version}: {hop} lands 0.2 s after "hops" starts`);
    // The hold is the pause at {dots}: "make" waits 1.5 s longer than it would unpaced, the words before it never move,
    // and the guess waits in it, from "ones" ending.
    const unpaced = makeClock(storyboard, even).words('count'), ones = words.findIndex(w => w.text === 'ones');
    assert.equal(+(start('make') - unpaced.find(w => w.text === 'make').start).toFixed(3), 1.5, version);
    assert.deepEqual(words.slice(0, ones + 1).map(w => w.start), unpaced.slice(0, ones + 1).map(w => w.start), version);
    assert.equal(at('guesses[0].after'), +words[ones].end.toFixed(3), `${version}: the guess's pause starts as "ones" ends`);
    times[version] = at('story.beats[0]');
    // What is shown never has a mark: the captions and the studio's script.
    assert.ok(film.clock.shownWords(0).every(w => !/[{}]/.test(w.text)));
    const studio = await startStudio({load: async () => ({film, storyboard, recipe}), port: 0, log: () => {}});
    try { assert.equal((await (await fetch(studio.url + 'api/film')).json()).scenes[0].narration, said(narration)); } finally { await studio.close(); }
  }
  assert.ok(times.reworded > times.first + 1, `the reworded line says more before "make": its beat moved with the word (${times.first} → ${times.reworded})`);
  // The same beats written as phrases of the first line: the rewording leaves them on words no longer said.
  const phrases = {story: {kit: 'beats', beats: [['count', 'make a ten'], ['count', 'hops', .2]]}};
  const film = narration => { const storyboard = {scenes: [{id: 'count', narration}, {id: 'next', narration: 'That is how a ten is made.'}]}; return compileFilm({storyboard, timings: evenTimings(storyboard), recipe: phrases, kits: [kit]}); };
  await film(lines.first);
  await assert.rejects(film(lines.reworded), /Phrase not in count: "make a ten"/);
});

test('reading a narration is linear: 40 KB with long runs of white space, braces or lines reads in well under 100 ms', () => {
  for (const text of ['x' + ' '.repeat(40000) + 'y {m}', 'a {m} x' + ' '.repeat(40000) + 'y {k} b', Array.from({length: 3500}, (_, k) => `{@a${k}}"hi."`).join(' '),
    Array.from({length: 5000}, (_, k) => `w {m${k}}`).join(' '), '{'.repeat(40000), '{{{{{{'.repeat(7000) + '}', '{@a}\'' + 'it\'s '.repeat(8000) + 'end.\'']) {
    const t0 = performance.now();
    try { said(text); linesOf(text); } catch { /* a refusal is read in time too */ }
    const ms = performance.now() - t0;
    assert.ok(ms < 100, `${ms.toFixed(1)} ms for ${JSON.stringify(text.slice(0, 30))}… (${text.length} characters)`);
  }
});

test('one owner of {{role}}: the cast reads it where script.mjs passes over it, and puts the name there', () => {
  const cast = readCast({hero: {name: 'Amaira'}});
  for (const text of ['{{hero}} {wave}waves.', '{{ hero }} {x} waves', '{x}{{hero}} waves']) assert.equal(castText(said(text), cast), said(castText(text, cast)), text);
});
