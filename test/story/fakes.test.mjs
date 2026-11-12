// A fake model for the story chart's tests: scripted answers by stage, each brief it was given kept to look at afterwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inProcess} from '../../src/storyboard/story/port/port.mjs';

const example = (file) => JSON.parse(readFileSync(new URL(`../../examples/found/${file}`, import.meta.url), 'utf8'));
/** The five-message example conversation, and a board that reads against it. */
export const CHAT = example('chat.json');
export const STORY = example('story.json');

/** Points that fill what-we-found from the example conversation. */
export const PICKED = {points: [
  {part: 'checked', text: 'One character could match two ways', sources: ['m1']},
  {part: 'checked', text: '26 hidden characters took 4355 ms', sources: ['m2']},
  {part: 'checked', text: 'Version 0.4.0 was not yet published', sources: ['m3']},
  {part: 'found', text: 'A long hidden run could hang the check', sources: ['m1', 'm2']},
  {part: 'unsure', text: 'Whether other patterns have the same flaw', sources: []},
  {part: 'next', text: 'One character class, and a timed test', sources: ['m4']},
]};

/**
 * {model, briefs, asked}: a driver answering each stage from `script[stage]`, a list used in order (the last one again once
 * it runs out). An answer is text as it is, a function of the brief, or anything else as its JSON.
 */
export function scripted(script) {
  const briefs = [], used = {};
  const model = inProcess((brief) => {
    briefs.push(brief);
    const list = script[brief.stage] ?? assert.fail(`the fake model has no answer for the ${brief.stage} brief`);
    const n = used[brief.stage] = (used[brief.stage] ?? 0) + 1, answer = list[Math.min(n, list.length) - 1];
    const value = typeof answer === 'function' ? answer(brief) : answer;
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
  return {model, briefs, asked: (stage) => briefs.filter((b) => b.stage === stage).length};
}

test('the fake model answers in order, then repeats its last answer', async () => {
  const {model, asked} = scripted({pick: ['a', {b: 1}]});
  assert.equal(await model.answer({stage: 'pick'}), 'a');
  assert.equal(await model.answer({stage: 'pick'}), '{"b":1}');
  assert.equal(await model.answer({stage: 'pick'}), '{"b":1}');
  assert.equal(asked('pick'), 3);
});
