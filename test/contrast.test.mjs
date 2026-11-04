// Words stand out (contrast.mjs, review.mjs · contrast): WCAG's ratio read from the frame's own pixels; a faint word
// fails and names the fix, a large word needs 3:1, a word written on is judged once it is whole, a word clipped away
// is never read, and a part with no word is not run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {reviewPart} from '../src/review.mjs';
import {luminance, contrastRatio, wordContrast, faintWords, CONTRAST} from '../src/contrast.mjs';

test('the ratio is WCAG\'s: black on white 21:1, #767676 on white just passes 4.5:1, #777777 just fails', () => {
  assert.equal(+contrastRatio(luminance(0, 0, 0), luminance(255, 255, 255)).toFixed(2), 21);
  assert.ok(contrastRatio(luminance(0x76, 0x76, 0x76), 1) >= 4.5);
  assert.ok(contrastRatio(luminance(0x77, 0x77, 0x77), 1) < 4.5);
});

test('a word on a canvas: its ink against the ground around it', () => {
  const c = createCanvas(400, 100), x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 400, 100);
  x.fillStyle = '#000'; x.font = 'bold 40px sans-serif'; x.textBaseline = 'alphabetic'; x.fillText('Ink', 20, 70);
  const m = x.measureText('Ink'), box = [20 - m.actualBoundingBoxLeft, 70 - m.actualBoundingBoxAscent, 20 + m.actualBoundingBoxRight, 70 + m.actualBoundingBoxDescent];
  const got = wordContrast(x.getImageData(0, 0, 400, 100).data, 400, 100, box);
  assert.ok(got.ratio > 15, `black on white reads near 21:1: ${got.ratio}`);
  assert.equal(got.ground, 1);
  assert.equal(wordContrast(x.getImageData(0, 0, 400, 100).data, 400, 100, [10, 10, 11, 11]), null, 'a box too small is not read');
});

test('a word is judged by its best moment; one never seen is counted, not read', () => {
  const box = [10, 10, 60, 30], at = (t, ratio) => ({t, contrasts: [{text: 'word', box, ratio, needs: 4.5, large: false}]});
  assert.deepEqual(faintWords([at(1, 1.4), at(2, 9), at(3, 9)]).low, [], 'written on: faint at first, whole later');
  assert.equal(faintWords([at(1, 1.4), at(2, 9), at(3, 9)]).words, 1);
  assert.deepEqual(faintWords([at(1, 1), at(2, 1.05)]), {words: 0, unseen: 1, low: [], closest: null}, 'never any ink: clipped away');
  assert.deepEqual(faintWords([at(1, 2), at(2, 3.1)]).low.map(w => [w.ratio, w.t]), [[3.1, 2]], 'faint at its best: found at its best moment');
  assert.equal(CONTRAST.seen, 1.1);
  const two = [{t: 1, contrasts: [{text: 'big', box: [0, 0, 90, 60], ratio: 3.3, needs: 3, large: true}, {text: 'small', box: [0, 80, 40, 90], ratio: 6, needs: 4.5, large: false}]}];
  assert.equal(faintWords(two).closest.text, 'big', 'the closest call is nearest its own threshold (3.3 of 3), not the lowest ratio alone');
});

const storyboard = {title: 'Contrast', scenes: [{id: 'card', narration: 'A card with words on it, read for a while by the voice.'}]};
const timings = evenTimings(storyboard, {wordSeconds: .5});
const filmOf = draw => compileFilm({storyboard, timings, recipe: {story: {kit: 'card'}}, kits: [{name: 'card', story: {compile: () => ({hang: 1, draw})}}]});
const card = (ink, size = 32) => (c, t) => {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, 1600, 900);
  c.fillStyle = ink; c.font = `${size}px sans-serif`; c.textBaseline = 'middle'; c.fillText('Read me', 200, 300);
  // a word typed on: clipped to a growing width, whole after 2 s
  c.save(); c.beginPath(); c.rect(200, 500, Math.min(1, t / 2) * 400, 100); c.clip(); c.fillStyle = '#111'; c.fillText('Typed in', 200, 550); c.restore();
};
const verdict = r => r.verdicts.find(v => v.check === 'contrast');

test('a dark word passes; a typed-in word is judged once it is whole', async () => {
  const r = await reviewPart(await filmOf(card('#222222')));
  assert.equal(verdict(r).verdict, 'passed', verdict(r).why);
  assert.equal(verdict(r).measured.words, 2);
});

test('a light grey word fails, and the finding names its ratio and the fix', async () => {
  const r = await reviewPart(await filmOf(card('#aaaaaa')));
  assert.equal(verdict(r).verdict, 'failed');
  const found = r.findings.filter(f => f.kind === 'contrast');
  assert.equal(found.length, 1);
  assert.match(found[0].what, /^"Read me" stands 2\.\d+:1 against what is behind it \(it needs 3:1, large\): darken or lighten the word, or put a band behind it$/, '32 px on the 1600 frame is 38 px at 1080: large');
});

test('a large word needs 3:1, a small one 4.5:1', async () => {
  const large = await reviewPart(await filmOf(card('#8a8a8a', 72)));
  assert.equal(verdict(large).verdict, 'passed', `#8a8a8a is about 3.4:1: enough for a large word (${verdict(large).summary})`);
  const small = await reviewPart(await filmOf(card('#8a8a8a', 14)));
  assert.equal(verdict(small).verdict, 'failed', 'and not for a small one');
  assert.match(small.findings.find(f => f.kind === 'contrast').what, /\(it needs 4\.5:1\)/);
});

test('a part with no word is not run', async () => {
  const r = await reviewPart(await filmOf(c => { c.fillStyle = '#fff'; c.fillRect(0, 0, 1600, 900); }));
  assert.equal(verdict(r).verdict, 'not run');
});
