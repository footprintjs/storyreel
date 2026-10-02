// Speech in scripts with combining vowel signs (Tamil, Telugu, Hindi…): a phrase is found by its letters AND its
// vowel signs, so two words that differ only in a vowel sign are told apart (கடை "shop" is not கட).
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeClock, evenTimings} from '../src/index.mjs';
import {normSpeech} from '../src/clock.mjs';

test('a vowel sign is part of the word: the phrase is found where it is said, not where its bare letters first appear', () => {
  assert.equal(normSpeech('கடை!'), 'கடை'); assert.notEqual(normSpeech('கடை'), normSpeech('கட'));
  // "கட" (here a name, said first) and "கடை" (shop, said later): the shop must be found at its own word.
  const board = {scenes: [{id: 's', narration: 'கட வந்தாள். பிறகு கடை திறந்தது.'}]};
  const clock = makeClock(board, evenTimings(board)), words = clock.words('s');
  assert.equal(clock.at(['s', 'கடை']), words.find(w => w.text.startsWith('கடை')).start);
  const telugu = {scenes: [{id: 't', narration: 'కొత్త క్రేయాన్. ఒక కొత్త క్రేయాన్!'}]};
  const tc = makeClock(telugu, evenTimings(telugu));
  assert.equal(tc.at(['t', 'ఒక కొత్త క్రేయాన్']), tc.words('t')[2].start);
});

test('English is found as before (no combining marks after NFKC)', () => {
  assert.equal(normSpeech("Amaira's crayon, too!"), 'amairascrayontoo');
  assert.equal(normSpeech('café'), normSpeech('café'), 'a composed and a decomposed é are the same word');
});
