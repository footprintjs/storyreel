// Evidence classes (claims.mjs): a fact may say how it is known — verified (a source), reported (a named person said
// it), derived (grouped from verified facts), extrapolated (carried past what is known) or open (unresolved) — with how
// it was checked. A claim in words (`says`) is found where the film says or shows it. The making-of lists every claim
// with its class, and a release refuses an open claim it says or shows unless the recipe allows it with a reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {compileFilm, evenTimings, makeFilm} from '../src/index.mjs';
import {readFacts, findStatements, readAllowOpen, evidenceOf, unallowedOpen, openRefusal, claimsCount, unsourcedClaims, claimText, EVIDENCE} from '../src/claims.mjs';
import {makeRelease} from '../src/release.mjs';
import {tempDir} from './tmp.mjs';

const ffmpeg = !spawnSync('ffmpeg', ['-version']).error;
// A product explainer: a number on screen, a quote, a total grouped from two verified counts, a trend, and one claim still open.
const facts = [
  {id: 'battery-hours', value: 18, text: '18 hours', evidence: 'verified', source: 'https://example.org/spec', checked: 'the spec sheet, 2026-10-20'},
  {id: 'support-quote', says: 'most returns are a loose cable', evidence: 'reported', by: 'Asha Rao, head of support', source: 'call notes, 2026-10-18', checked: 'read back to her by email'},
  {id: 'sales-march', value: 120, evidence: 'verified', source: 'https://example.org/q1', checked: 'the quarterly report'},
  {id: 'sales-april', value: 80, evidence: 'verified', source: 'https://example.org/q2', checked: 'the quarterly report'},
  {id: 'sales-spring', value: 200, text: '200 sold', evidence: 'derived', from: ['sales-march', 'sales-april'], checked: 'added the two months'},
  {id: 'sales-2030', value: 900, evidence: 'extrapolated', from: ['sales-spring'], checked: 'the spring rate, carried on to 2030'},
  {id: 'full-day', says: 'the battery lasts a full day', evidence: 'open', checked: 'the vendor has not confirmed it yet'},
];
const storyboard = {title: 'Battery', facts, scenes: [
  {id: 'spec', narration: 'It runs for 18 hours, and the battery lasts a full day.', say: [['18 hours', 'eighteen hours']]},
  {id: 'sales', narration: 'This spring, 200 sold, and support says most returns are a loose cable.', say: [['200 sold', 'two hundred sold']]},
  {id: 'demo', example: true, narration: 'Say the battery lasts a full day on a test bench.'},
]};
const recipe = (more = {}) => ({story: {kit: 'whiteboard', items: [
  {at: ['spec', 'It runs'], dur: .6, write: '18 hours', x: 800, y: 300, size: 50, align: 'center'},
  {at: ['sales', 'This spring'], dur: .6, write: 'By 2030: 900 a year', x: 800, y: 500, size: 50, align: 'center'}]}, ...more});
const timings = evenTimings(storyboard, {wordSeconds: .4, tail: 1});

test('a fact says how it is known: its class, how it was checked, who said it, what it is made from — and a fact that says nothing is read as before', () => {
  const read = readFacts(facts, 'storyboard.facts');
  assert.deepEqual(read[0], {value: 18, text: '18 hours', source: 'https://example.org/spec', kind: 'url', id: 'battery-hours', evidence: 'verified', checked: 'the spec sheet, 2026-10-20'});
  assert.deepEqual(read[1], {says: 'most returns are a loose cable', source: 'call notes, 2026-10-18', kind: 'unverified', id: 'support-quote', evidence: 'reported', checked: 'read back to her by email', by: 'Asha Rao, head of support'});
  assert.deepEqual(read[4], {value: 200, text: '200 sold', id: 'sales-spring', evidence: 'derived', checked: 'added the two months', from: ['sales-march', 'sales-april']}, 'a derived claim rests on what it is grouped from: no source of its own needed');
  assert.deepEqual(read[6], {says: 'the battery lasts a full day', id: 'full-day', evidence: 'open', checked: 'the vendor has not confirmed it yet'});
  assert.deepEqual(readFacts([{value: 60, text: '60 Hz', source: 'https://example.org'}]), [{value: 60, text: '60 Hz', source: 'https://example.org', kind: 'url'}], 'unclassed: exactly as before');
  assert.deepEqual(Object.keys(EVIDENCE), ['verified', 'reported', 'derived', 'extrapolated', 'open']);
});

test('each class asks for what it needs, and every refusal names the fix', () => {
  const one = f => () => readFacts([f], 'storyboard.facts');
  for (const [fact, message] of [
    [{value: 1, source: 'x', evidence: 'sure', checked: 'y'}, /storyboard\.facts\[0\]: evidence is how the claim is known — "verified" \(a source\), "reported" \(a named person said it\), "derived" \(grouped from verified facts, directly or through derived ones\), "extrapolated" \(carried past what is known\), or "open" \(unresolved\) — not "sure"/],
    [{value: 1, source: 'x', evidence: 'verified'}, /checked says how the claim was checked, in words \(e\.g\. "read on the vendor's spec sheet, 2026-10-20"\)/],
    [{value: 1, evidence: 'open'}, /an open claim says what is still unresolved in checked/],
    [{value: 1, evidence: 'verified', checked: 'read'}, /source says where 1 comes from: a URL, a document or a record pointer/],
    [{value: 1, source: 'x', evidence: 'reported', checked: 'asked'}, /a reported claim names who said it: by \("Asha Rao, head of support"\)/],
    [{value: 1, evidence: 'reported', by: 'Asha', checked: 'asked'}, /source says where 1 comes from: a URL, a document or a record pointer \(where they said it\)/],
    [{value: 1, source: 'x', evidence: 'verified', checked: 'y', by: 'Asha'}, /by names who said a reported claim, and this one is verified: leave by out, or class it "reported"/],
    [{value: 1, evidence: 'derived', checked: 'added'}, /from lists the ids of the facts a derived claim is grouped from \(\["sales-march", "sales-april"\]\)/],
    [{value: 1, source: 'x', evidence: 'verified', checked: 'y', from: ['a']}, /from lists the facts a derived or extrapolated claim is made from, and this one is verified: leave from out/],
    [{value: 1, evidence: 'extrapolated', checked: 'trend'}, /an extrapolated claim says what it is carried from: from \(the facts' ids\) or source/],
    [{value: 1, source: 'x', checked: 'y'}, /storyboard\.facts\[0\] has checked, which says how a claim is known: give its evidence too/],
    [{says: 'it lasts a day', source: 'x'}, /says is a claim in words; say how it is known too — evidence "verified"/],
    [{says: 'it lasts', value: 1, evidence: 'open', checked: 'y'}, /says is a claim in words, and value a number on screen .*: give one fact says, another value/],
    [{says: '42', evidence: 'open', checked: 'y'}, /says is the claim as the film says or shows it, in words/],
    [{id: 'two words', value: 1, source: 'x'}, /id names the fact, one word that no other fact uses/],
    [{value: 1, source: 'x', note: 'y'}, /has note; a fact takes value, text and source \(and, saying how it is known: id, says, evidence, checked, by, from\)/],
  ]) assert.throws(one(fact), message, JSON.stringify(fact));
  const list = l => () => readFacts(l, 'storyboard.facts');
  assert.throws(list([{value: 1, source: 'x', evidence: 'verified', checked: 'y'}, {value: 2, source: 'x'}]), /storyboard\.facts\[1\] says no evidence, and storyboard\.facts\[0\] does: once one fact says how it is known, every fact does/);
  assert.throws(list([{id: 'a', value: 1, source: 'x'}, {id: 'a', value: 2, source: 'x'}]), /storyboard\.facts\[1\]: id "a" is storyboard\.facts\[0\]'s too: give each fact an id of its own/);
  assert.throws(list([{id: 'a', value: 1, evidence: 'derived', from: ['b'], checked: 'y'}]), /from names "b", which is no fact's id \(the ids: a\)/);
  assert.throws(list([{id: 'a', value: 1, evidence: 'open', checked: 'y'}, {value: 2, evidence: 'derived', from: ['a'], checked: 'y'}]), /a derived claim is grouped from verified or derived facts, and "a" is open: verify "a" first \(evidence "verified", with its source\); until then this claim is open too: class it "open"$/);
  assert.throws(list([{id: 'a', value: 1, source: 'x', evidence: 'reported', by: 'Asha', checked: 'y'}, {value: 2, evidence: 'derived', from: ['a'], checked: 'y'}]), /and "a" is reported: verify "a" first \(evidence "verified", with its source\)$/, 'no class suggested that would let an open claim through');
  assert.throws(list([{id: 'a', value: 1, evidence: 'derived', from: ['b'], checked: 'y'}, {id: 'b', value: 2, evidence: 'derived', from: ['a'], checked: 'y'}]), /a derived claim cannot rest on itself \(from leads back to "a"\)/);
  // Every `from` chain, extrapolated ones too: a trend carried from itself rests on nothing.
  assert.throws(list([{id: 'w', value: 1, evidence: 'extrapolated', from: ['w'], checked: 'a trend'}]), /storyboard\.facts\[0\]: an extrapolated claim cannot rest on itself \(from leads back to "w"\): ground it in sourced facts/);
  assert.throws(list([{id: 'a', value: 1, evidence: 'extrapolated', from: ['b'], checked: 'y'}, {id: 'b', value: 2, evidence: 'extrapolated', from: ['a'], checked: 'y'}]), /an extrapolated claim cannot rest on itself \(from leads back to "a"\)/);
});

test('the film lists every claim with its class: numbers it shows and says, and claims in words it says or shows', async () => {
  const film = await compileFilm({storyboard, recipe: recipe(), timings});
  const byNumber = n => film.claims.numbers.filter(c => c.number === n).map(c => [c.path, c.evidence ?? null, c.id ?? null]);
  assert.deepEqual(byNumber('18'), [['story.items[0]', 'verified', 'battery-hours'], ['captions', 'verified', 'battery-hours']]);
  assert.deepEqual(byNumber('200'), [['captions', 'derived', 'sales-spring']]);
  assert.deepEqual(byNumber('900'), [['story.items[1]', 'extrapolated', 'sales-2030']]);
  assert.deepEqual(byNumber('2030'), [['story.items[1]', null, null]], 'a number no fact backs carries no class');
  assert.deepEqual(film.claims.statements.map(c => [c.says, c.scene, c.path, c.evidence, c.example]), [
    ['the battery lasts a full day', 'spec', 'captions', 'open', false],
    ['most returns are a loose cable', 'sales', 'captions', 'reported', false],
    ['the battery lasts a full day', 'demo', 'captions', 'open', true]]);
  const said = film.claims.statements[0];
  assert.ok(said.at > film.clock.offsets[0] && said.to > said.at, 'said aloud: timed by its words');
  // A derived claim is sourced by the facts it is grouped from; the count and the verdict read it so.
  assert.deepEqual(claimsCount(film.claims), {numbers: 5, examples: 0, sourced: 4, open: 5, unsourced: 1, unverified: 0, factsGiven: true});
  assert.deepEqual(unsourcedClaims(film.claims).map(c => c.number), ['2030']);
  const ev = evidenceOf(film.claims);
  assert.deepEqual(ev.classes, {verified: 2, reported: 1, derived: 1, extrapolated: 1, open: 1, unclassed: 1});
  assert.deepEqual(ev.claims.map(c => [c.claim, c.kind, c.evidence, c.said]), [
    ['18', 'number', 'verified', 'shown'], ['18', 'number', 'verified', 'spoken'], ['the battery lasts a full day', 'words', 'open', 'spoken'],
    ['2030', 'number', null, 'shown'], ['900', 'number', 'extrapolated', 'shown'], ['200', 'number', 'derived', 'spoken'], ['most returns are a loose cable', 'words', 'reported', 'spoken']], 'in time order: the line is up before its words are said');
  const quote = ev.claims.find(c => c.claim === 'most returns are a loose cable');
  assert.deepEqual(quote, {claim: 'most returns are a loose cable', kind: 'words', evidence: 'reported', said: 'spoken', scene: 'sales',
    path: 'captions', at: quote.at, id: 'support-quote', source: 'call notes, 2026-10-18', sourceKind: 'unverified', checked: 'read back to her by email', by: 'Asha Rao, head of support'});
  // An open fact behind a number: no source yet, so the number has none — and its fix says to settle it.
  const open = await compileFilm({storyboard: {...storyboard, facts: [...facts.slice(0, 6), {id: 'cycles', value: 500, evidence: 'open', checked: 'two sources disagree'}],
    scenes: [{id: 'spec', narration: 'It lasts 500 cycles.'}]}, recipe: {story: {kit: 'whiteboard', items: []}}, timings: evenTimings({scenes: [{id: 'spec', narration: 'It lasts 500 cycles.'}]})});
  assert.equal(claimText(unsourcedClaims(open.claims)[0]), '"500" (scene spec, captions) has no source: it rests on an open claim ("cycles") — two sources disagree: settle it (find its source and class it "verified"), or mark scene spec "example": true');
  assert.equal(evidenceOf((await compileFilm({storyboard: {...storyboard, facts: [{value: 18, source: 'x'}]}, recipe: recipe(), timings})).claims), null, 'unclassed facts: no evidence list');
});

test('a claim made from an open fact is open too: never sourced, and a release refuses it unless the open fact is allowed', async () => {
  const chain = [
    {id: 'day', value: 18, text: '18 hours', evidence: 'open', checked: 'the vendor has not confirmed it yet'},
    {id: 'week', value: 126, text: '126 hours', evidence: 'extrapolated', from: ['day'], checked: 'seven days of it'},
    {id: 'month', value: 540, text: '540 hours', evidence: 'extrapolated', from: ['week'], checked: 'a month of weeks'},
    {id: 'spec', value: 12, text: '12 hours', evidence: 'verified', source: 'https://example.org/spec', checked: 'the spec sheet'},
    {id: 'year', value: 4380, text: '4380 hours', evidence: 'extrapolated', from: ['spec'], checked: 'a year of it'}];
  const board = {title: 'Chain', facts: chain, scenes: [{id: 'a', narration: 'A week is 126 hours, a month 540 hours, a year 4380 hours.'}]};
  const film = await compileFilm({storyboard: board, recipe: {story: {kit: 'whiteboard', items: []}}, timings: evenTimings(board)});
  assert.deepEqual(claimsCount(film.claims), {numbers: 3, examples: 0, sourced: 1, open: 3, unsourced: 2, unverified: 0, factsGiven: true}, 'only the year leads back to a source');
  assert.deepEqual(unsourcedClaims(film.claims).map(c => c.number), ['126', '540']);
  assert.equal(claimText(unsourcedClaims(film.claims)[0]), '"126" (scene a, captions) has no source: it is made from "day", which do not lead back to a source (an open fact, or one with no source): settle them (a source, evidence "verified"), or mark scene a "example": true');
  const open = unallowedOpen(film.claims);
  assert.deepEqual(open.map(c => [c.number, c.rests.map(r => r.id)]), [['126', ['day']], ['540', ['day']]], 'a month extrapolated from a week extrapolated from an open day is open');
  assert.match(openRefusal(open), /^This release says or shows 2 open claims \(unresolved\): "126" \(said in scene a; fact "week"; rests on open "day": the vendor has not confirmed it yet\); "540" .* allow the open fact in the recipe with a reason: "evidence": \{"allowOpen": \{"day": "why it may go out unresolved"\}\}$/);
  assert.deepEqual(evidenceOf(film.claims).claims.map(c => [c.claim, c.restsOnOpen ?? null]), [['126', ['day']], ['540', ['day']], ['4380', null]]);
  const allowed = await compileFilm({storyboard: board, recipe: {story: {kit: 'whiteboard', items: []}, evidence: {allowOpen: {day: 'the vendor confirms it next week'}}}, timings: evenTimings(board)});
  assert.deepEqual(unallowedOpen(allowed.claims), [], 'the open fact allowed: what is made from it may go out too');
});

test('a release is refused only for what it shows: a part or a Short that cuts the open claim away passes the gate', async t => {
  const film = await compileFilm({storyboard, recipe: recipe(), timings});
  const spoken = film.claims.statements[0], spec = {from: film.clock.offsets[0], to: film.clock.offsets[1]}, sales = {from: film.clock.offsets[1], to: film.clock.offsets[2]};
  assert.ok(spoken.at >= spec.from && spoken.to <= spec.to, 'the open claim is said in scene spec');
  assert.equal(unallowedOpen(film.claims, {ranges: [[spec.from, spec.to]]}).length, 1);
  assert.deepEqual(unallowedOpen(film.claims, {ranges: [[sales.from, sales.to]]}), [], 'a part without it');
  assert.deepEqual(unallowedOpen(film.claims, {ranges: [[0, spoken.at - .5], [sales.from, sales.to]]}), [], 'cuts that leave it out');
  // makeFilm: the render's own span decides. With no FFmpeg to encode, a render that passes the gate fails at its first
  // frame instead — after the gate, which its failed run's record shows.
  const dir = tempDir('evidence-span', t), noEncoder = {width: 320, height: 180, fps: 6, whole: true, ffmpeg: path.join(dir, 'no-ffmpeg')};
  await assert.rejects(makeFilm({storyboard, recipe: recipe(), timings, out: path.join(dir, 'a', 'film.mp4'), release: true, render: {...noEncoder, from: sales.from, to: sales.to}}), /could not encode/);
  await assert.rejects(makeFilm({storyboard, recipe: recipe(), timings, out: path.join(dir, 'b', 'film.mp4'), release: true, render: {...noEncoder, from: spec.from, to: spec.to}}), /^Error: This release says or shows 1 open claim/);
});

test('an allowed open claim passes the release gate, and the record says the gate ran — checked without FFmpeg', async t => {
  const dir = tempDir('evidence-allowed', t), out = path.join(dir, 'film.mp4');
  await assert.rejects(makeFilm({storyboard, recipe: recipe({evidence: {allowOpen: {'full-day': 'the vendor confirms it next week'}}}), timings, out, release: true,
    render: {width: 320, height: 180, fps: 6, whole: true, ffmpeg: path.join(dir, 'no-ffmpeg')}}), /could not encode/, 'past the gate: it fails only for want of an encoder');
  const failed = JSON.parse(readFileSync(path.join(dir, 'making-of.failed.json'), 'utf8'));
  assert.ok(failed.pipeline.some(e => e.stageName === 'plan-picture' && e.key === 'release' && e.rawValue === true), 'the gate ran and passed, in plan-picture');
  // Unclassed facts: nothing for the gate to check, so the record says nothing of a release.
  const plain = path.join(dir, 'plain', 'film.mp4');
  await assert.rejects(makeFilm({storyboard: {...storyboard, facts: [{value: 18, source: 'x'}]}, recipe: recipe(), timings, out: plain, release: true, render: {width: 320, height: 180, fps: 6, whole: true, ffmpeg: path.join(dir, 'no-ffmpeg')}}), /could not encode/);
  assert.ok(!JSON.parse(readFileSync(path.join(dir, 'plain', 'making-of.failed.json'), 'utf8')).pipeline.some(e => e.key === 'release'), 'no gate, no release in the record');
});

test('a claim in words is found in any script: a word\'s marks are part of it (Tamil, Devanagari), and the two sides are compared in NFC', () => {
  const read = readFacts([{id: 'milk', says: 'பால்', evidence: 'open', checked: 'y'}, {id: 'seven', says: 'सात सेब', evidence: 'open', checked: 'y'}]);
  const shown = text => [{text, at: 1, to: 3, scene: 0, path: 'stages[0].title'}];
  assert.deepEqual(findStatements(shown('தம்பி பால் குடித்தான்'), {facts: read, scenes: ['a']}).map(c => [c.says, c.offset]), [['பால்', 6]]);
  assert.deepEqual(findStatements(shown('அன்பால் வென்றான்'), {facts: read, scenes: ['a']}), [], 'never inside a word: the ் before it is part of the word');
  assert.deepEqual(findStatements(shown('मेज़ पर सात सेब हैं'), {facts: read, scenes: ['a']}).map(c => [c.says, c.offset]), [['सात सेब', 8]]);
  assert.deepEqual(findStatements(shown('सात सेबों'), {facts: read, scenes: ['a']}), [], 'the vowel sign ों is part of the word');
  const nfd = readFacts([{says: 'café open', evidence: 'open', checked: 'y'}]);
  assert.deepEqual(findStatements(shown('The cafe\u0301 open late'), {facts: nfd, scenes: ['a']}).map(c => c.offset), [4], 'NFD on screen, NFC in the fact: the same words, at their place as written');
});

test('a claim in words is found where its words stand together — case and marks between them ignored, never inside a word', () => {
  const read = readFacts([{id: 'full-day', says: 'the battery lasts a full day', evidence: 'open', checked: 'y'}]);
  const shown = text => [{text, at: 1, to: 3, scene: 0, path: 'stages[0].title'}];
  assert.equal(findStatements(shown('And yes — The Battery lasts, a full day!'), {facts: read, scenes: ['a']}).length, 1);
  assert.equal(findStatements(shown('the battery lasts a full daylight shift'), {facts: read, scenes: ['a']}).length, 0, 'never inside a word');
  assert.equal(findStatements(shown('the battery lasts most of a full day'), {facts: read, scenes: ['a']}).length, 0, 'the words in order, together');
  assert.deepEqual(findStatements(shown('the battery lasts a full day'), {facts: null}), []);
});

test('the recipe allows an open claim in a release only by its id, with a reason in words; anything else refuses, naming the fix', async () => {
  const read = readFacts(facts);
  assert.deepEqual(readAllowOpen({allowOpen: {'full-day': ' the vendor confirms it next week, and the film says "about" '}}, read), {'full-day': 'the vendor confirms it next week, and the film says "about"'});
  assert.equal(readAllowOpen({allowOpen: {}}, read), null);
  for (const [value, message] of [
    [{allowOpen: {nope: 'r'}}, /recipe\.evidence\.allowOpen names "nope", which is no fact's id \(the ids: battery-hours, support-quote/],
    [{allowOpen: {'battery-hours': 'r'}}, /allowOpen names "battery-hours", which is "verified", not open: leave it out \(only an open claim needs allowing\)/],
    [{allowOpen: {'full-day': ' '}}, /recipe\.evidence\.allowOpen\.full-day is why it may go out unresolved, in words/],
    [{allow: {}}, /recipe\.evidence has allow; it takes allowOpen only: \{"allowOpen": \{"<an open fact's id>": "why it may go out unresolved"\}\}/],
    [['full-day'], /recipe\.evidence is \{"allowOpen"/],
  ]) assert.throws(() => readAllowOpen(value, read), message);
  assert.throws(() => readAllowOpen({allowOpen: {x: 'r'}}, null), /names "x", which is no fact's id: the storyboard names no facts/);
  const film = await compileFilm({storyboard, recipe: recipe({evidence: {allowOpen: {'full-day': 'the vendor confirms it next week'}}}), timings});
  assert.deepEqual(film.claims.allowOpen, {'full-day': 'the vendor confirms it next week'});
  assert.deepEqual(unallowedOpen(film.claims), []);
  await assert.rejects(compileFilm({storyboard, recipe: recipe({evidence: {allowOpen: {'sales-spring': 'r'}}}), timings}), /allowOpen names "sales-spring", which is "derived", not open/);
});

test('a release refuses an open claim it says or shows, before anything is drawn — the example scene\'s is labelled, and a draft lists it', async t => {
  const dir = tempDir('evidence', t), film = await compileFilm({storyboard, recipe: recipe(), timings});
  const open = unallowedOpen(film.claims);
  assert.deepEqual(open.map(c => [c.says, c.scene]), [['the battery lasts a full day', 'spec']], 'the example scene\'s says so on screen: not refused');
  const refusal = 'This release says or shows 1 open claim (unresolved): "the battery lasts a full day" (said in scene spec; fact "full-day"; open: the vendor has not confirmed it yet). '
    + 'Settle each one (find its source and class it "verified", or "reported" by a named person) or cut it from the film; to release it unresolved, allow the open fact in the recipe with a reason: "evidence": {"allowOpen": {"full-day": "why it may go out unresolved"}}';
  assert.equal(openRefusal(open), refusal);
  await assert.rejects(makeFilm({storyboard, recipe: recipe(), timings, out: path.join(dir, 'r', 'film.mp4'), release: true}), {message: refusal});
  assert.ok(!existsSync(path.join(dir, 'r', 'film.mp4')) && !existsSync(path.join(dir, 'r', 'making-of.json')), 'nothing drawn, nothing written but the failed run\'s record');
  // makeRelease is a release: the same refusal, before any target renders.
  await assert.rejects(makeRelease({storyboard, recipe: recipe(), timings, out: path.join(dir, 'rel'), targets: ['youtube'], post: {title: 'Battery', description: 'How long it lasts.', audience: 'general'}}), {message: refusal});
  await assert.rejects(makeFilm({storyboard, recipe: recipe(), timings, out: path.join(dir, 'x', 'film.mp4'), release: 'yes'}), /release is true \(this render leaves the house: an open claim it says or shows refuses it, unless the recipe allows that claim with a reason\) or false/);
});

test('makeFilm records every claim with its class; an allowed open claim reaches a release, with its reason in the record', {skip: ffmpeg ? false : 'needs ffmpeg'}, async t => {
  const dir = tempDir('evidence-made', t), render = {width: 320, height: 180, fps: 6};
  const draft = JSON.parse(readFileSync((await makeFilm({storyboard, recipe: recipe(), timings, out: path.join(dir, 'draft', 'film.mp4'), render})).makingOf, 'utf8'));
  assert.deepEqual(draft.claims.evidence.classes, {verified: 2, reported: 1, derived: 1, extrapolated: 1, open: 1, unclassed: 1});
  assert.deepEqual(draft.claims.evidence.claims.map(c => `${c.claim}: ${c.evidence}`), ['18: verified', '18: verified', 'the battery lasts a full day: open', '2030: null', '900: extrapolated', '200: derived', 'most returns are a loose cable: reported']);
  assert.equal(draft.release, undefined, 'a draft says nothing of a release');
  const allowed = recipe({evidence: {allowOpen: {'full-day': 'the vendor confirms it next week, and the film says so'}}});
  const released = JSON.parse(readFileSync((await makeFilm({storyboard, recipe: allowed, timings, out: path.join(dir, 'out', 'film.mp4'), render, release: true})).makingOf, 'utf8'));
  assert.equal(released.release, true);
  assert.deepEqual(released.claims.evidence.allowed, {'full-day': 'the vendor confirms it next week, and the film says so'});
  const plain = JSON.parse(readFileSync((await makeFilm({storyboard: {...storyboard, facts: [{value: 18, source: 'x'}]}, recipe: recipe(), timings, out: path.join(dir, 'plain', 'film.mp4'), render})).makingOf, 'utf8'));
  assert.equal(plain.claims.evidence, undefined, 'facts that say nothing of how they are known: the record is as it was');
  const plainRelease = JSON.parse(readFileSync((await makeFilm({storyboard: {...storyboard, facts: [{value: 18, source: 'x'}]}, recipe: recipe(), timings, out: path.join(dir, 'plain-release', 'film.mp4'), render, release: true})).makingOf, 'utf8'));
  assert.equal(plainRelease.release, undefined, 'a release with nothing for the gate to check: no release in the record');
  assert.equal(plainRelease.rubric, undefined, 'a recipe with no rubric: none in the record');
});
