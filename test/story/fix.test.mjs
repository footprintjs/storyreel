// The fix: an answer replaces its piece alone, or is refused; the brief is the door's own, with the form added.
import test from 'node:test';
import assert from 'node:assert/strict';
import {storyboardFixBriefs} from 'footprint-story/storyboard';
import {CHAT, STORY} from './fakes.test.mjs';
import {applyPiece, fixBrief} from '../../src/storyboard/story/fix/fix.mjs';

const at = (piece, ...ats) => ({piece, problems: ats.map((a) => ({at: a, message: 'm'}))});

test('an entry answer replaces that entry only', () => {
  const fixed = applyPiece(STORY, at('checked[1]', 'checked[1].found'), {what: 'Cost', found: 'slow', sources: ['m2']});
  assert.equal(fixed.checked[1].what, 'Cost');
  assert.deepEqual(fixed.checked[0], STORY.checked[0]);
  assert.equal(STORY.checked[1].what, 'The cost', 'the board given is not changed');
});

test('a frame answer changes only the fields its problems name, and null takes one out', () => {
  const fixed = applyPiece(STORY, at('frame', 'closing', 'subtitle'), {closing: 'Done.', subtitle: null});
  assert.equal(fixed.closing, 'Done.');
  assert.ok(!('subtitle' in fixed));
  assert.throws(() => applyPiece(STORY, at('frame', 'closing'), {title: 'Other'}), {code: 'not-a-piece'});
  assert.throws(() => applyPiece(STORY, at('frame', 'shape'), {shape: 'told-twice'}), {code: 'not-a-piece'});
});

test('a whole list answer must be a list; an entry answer an object at an index that exists', () => {
  assert.equal(applyPiece(STORY, at('unsure', 'unsure'), []).unsure.length, 0);
  assert.throws(() => applyPiece(STORY, at('unsure', 'unsure'), {}), {code: 'not-a-piece'});
  assert.throws(() => applyPiece(STORY, at('checked[9]', 'checked[9]'), {}), {code: 'not-a-piece'});
  assert.throws(() => applyPiece(STORY, at('checked[0]', 'checked[0]'), 'text'), {code: 'not-a-piece'});
});

test('a __proto__ field from JSON stays a field, never a prototype', () => {
  const answer = JSON.parse('{"__proto__": {"polluted": true}}');
  const fixed = applyPiece({...STORY}, at('frame', '__proto__'), answer);
  assert.equal(Object.getPrototypeOf(fixed), Object.prototype);
  assert.equal({}.polluted, undefined);
});

test('the fix brief is the door\'s material for the piece, with the form to answer in, and the ids it cites', () => {
  const board = {...STORY, checked: STORY.checked.map((c, i) => (i === 1 ? {...c, found: 'took 9999 ms'} : c))};
  const {instructions, briefs} = storyboardFixBriefs(board, [{at: 'checked[1]', message: 'says 9999'}], {conversation: CHAT});
  const b = fixBrief(instructions, briefs[0]);
  assert.ok(b.instructions.startsWith(instructions));
  assert.match(b.instructions, /the piece as it should be/);
  assert.ok(b.material.startsWith('checked[1]\n'));
  assert.deepEqual(b.ids, ['m2']);
});
