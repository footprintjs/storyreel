// The tempo corpus (test/songs.mjs · tempoCorpus): 234 songs made sample by sample, each with its true tempo and beats.
// The beat map may be unsure — tempo-close, the strongest taken, the alternatives listed — but it may never claim a
// wrong tempo as certain, and when it is unsure and wrong, the right tempo is among its alternatives. Unsure, a film
// cuts only on the beats every candidate shares (beats.mjs · safeBeats): not one of those may fall off a true beat.
// Every round that found a new rhythm the rule got wrong is pinned here, so no later change can bring one back.
import test from 'node:test';
import assert from 'node:assert/strict';
import {beatMapOf, safeBeats} from '../src/beats.mjs';
import {tempoCorpus} from './songs.mjs';

const GROUPS = ['drum patterns', 'rhythm families', 'songs', 'bass, hands and meters'];
const near = (bpm, truth) => Math.abs(bpm - truth) <= Math.max(1, truth * .01);
const onABeat = (beats, t) => beats.some(u => Math.abs(u - t) <= .05);
const tally = () => ({'right and certain': 0, 'right but close': 0, 'wrong but close': 0, 'wrong and certain': 0, songs: 0, 'off-beat cuts': 0, 'true beats': 0, 'cut-able': 0});
const total = tally();

/** One song's map, judged: which of the four it is, and for an unsure map the beats it would cut on against the true ones. */
async function judge(song, counts) {
  const made = song.make(), truth = made.bpm ?? song.bpm, map = await beatMapOf(made.samples, 22050), right = near(map.bpm, truth);
  const kind = `${right ? 'right' : 'wrong'} ${map.sure ? 'and certain' : 'but close'}`;
  const cut = map.sure ? [] : safeBeats(map).beats, off = cut.filter(t => !onABeat(made.beats, t));
  for (const c of [counts, total]) {
    c[kind]++; c.songs++;
    if (!map.sure) { c['off-beat cuts'] += off.length; c['true beats'] += made.beats.length; c['cut-able'] += cut.length - off.length; }
  }
  return {kind, map, truth, off, right};
}

const summary = c => `${c.songs} songs: ${['right and certain', 'right but close', 'wrong but close', 'wrong and certain'].map(k => `${c[k]} ${k}`).join(', ')}; unsure maps: ${c['off-beat cuts']} off-beat cuts, ${c['cut-able']} of ${c['true beats']} true beats cut-able (${(100 * c['cut-able'] / Math.max(1, c['true beats'])).toFixed(1)}%)`;

for (const group of GROUPS) test(`${group}: never a wrong tempo claimed as certain; unsure and wrong, the right one among the alternatives; unsure, no cut off a true beat`, async t => {
  const counts = tally(), wrongAndCertain = [], unlisted = [], offBeat = [];
  for (const song of tempoCorpus().filter(s => s.group === group)) {
    const {kind, map, truth, off, right} = await judge(song, counts);
    if (kind === 'wrong and certain') wrongAndCertain.push(`${song.name}: ${map.bpm} (${map.verdict}), truth ${truth}`);
    if (!right && !map.alternatives.some(a => near(a.bpm, truth))) unlisted.push(`${song.name}: ${map.bpm}, alternatives ${map.alternatives.map(a => a.bpm).join(', ')}`);
    if (off.length) offBeat.push(`${song.name}: ${off.length} cuts off a true beat (${off.slice(0, 3).map(x => x.toFixed(3)).join(', ')} …)`);
  }
  t.diagnostic(`${group}: ${summary(counts)}`);
  assert.deepEqual(wrongAndCertain, [], 'a wrong tempo is never claimed as certain');
  assert.deepEqual(unlisted, [], 'unsure and wrong, the right tempo is among the alternatives');
  assert.deepEqual(offBeat, [], 'unsure, every beat a film may cut on is a true beat');
});

test('the whole corpus: 234 songs, none wrong and certain, no cut off a true beat', t => {
  t.diagnostic(`corpus: ${summary(total)}`);
  assert.equal(total.songs, 234);
  assert.equal(total['wrong and certain'], 0);
  assert.equal(total['off-beat cuts'], 0);
});
