// The tempo corpus (test/songs.mjs · tempoCorpus): 185 songs made sample by sample, each with its true tempo. The beat
// map may be unsure — tempo-close, the strongest taken, the alternatives listed — but it may never claim a wrong tempo
// as certain, and when it is unsure and wrong, the right tempo is among its alternatives. Every round that found a new
// rhythm the rule got wrong is pinned here, so no later change can bring one back.
import test from 'node:test';
import assert from 'node:assert/strict';
import {beatMapOf} from '../src/beats.mjs';
import {tempoCorpus} from './songs.mjs';

const near = (bpm, truth) => Math.abs(bpm - truth) <= Math.max(1, truth * .01);
const verdictOf = map => { const line = map.record.find(e => e.type === 'condition').text; return (line.match(/chose ([\w-]+)/) ?? line.match(/: ([\w-]+)\.$/))[1]; };

for (const group of ['drum patterns', 'rhythm families', 'songs']) test(`${group}: never a wrong tempo claimed as certain; unsure and wrong, the right one among the alternatives`, async t => {
  const counts = {'right and certain': 0, 'right but close': 0, 'wrong but close': 0}, wrongAndCertain = [], unlisted = [];
  for (const song of tempoCorpus().filter(s => s.group === group)) {
    const map = await beatMapOf(song.make().samples, 22050), certain = verdictOf(map) !== 'tempo-close', right = near(map.bpm, song.bpm);
    if (!right && certain) wrongAndCertain.push(`${song.name}: ${map.bpm} (${verdictOf(map)})`);
    if (!right && !map.alternatives.some(a => near(a.bpm, song.bpm))) unlisted.push(`${song.name}: ${map.bpm}, alternatives ${map.alternatives.map(a => a.bpm).join(', ')}`);
    if (right || !certain) counts[right ? (certain ? 'right and certain' : 'right but close') : 'wrong but close']++;
  }
  t.diagnostic(`${group}: ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')}`);
  assert.deepEqual(wrongAndCertain, [], 'a wrong tempo is never claimed as certain');
  assert.deepEqual(unlisted, [], 'unsure and wrong, the right tempo is among the alternatives');
});
