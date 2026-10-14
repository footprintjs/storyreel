// The tempo corpus (test/songs.mjs · tempoCorpus): 248 songs made sample by sample, each with its true tempo and beats,
// and 21 ill-posed ones. The beat map may be unsure — tempo-close, the strongest taken, the alternatives listed — but it
// may never claim a wrong tempo as certain, and when it is unsure and wrong, the right tempo is among its alternatives.
// A film cuts only on the beats safeBeats allows — every beat of a sure map, the shared and heard ones of an unsure
// map — and not one of those may fall off a true beat, sure or unsure (phase is checked for both). Every round that
// found a rhythm the rule got wrong is pinned here, so no later change can bring one back. The ill-posed rhythms
// (songs.mjs · ILL_POSED) are not scored: each must only give a verdict the record keeps.
import test from 'node:test';
import assert from 'node:assert/strict';
import {beatMapOf, safeBeats, likelyTempi} from '../src/beats.mjs';
import {tempoCorpus, noiseFrom} from './songs.mjs';

const GROUPS = ['drum patterns', 'rhythm families', 'songs', 'bass, hands, meters and echoes'];
const VERDICTS = ['tempo-measured', 'tempo-faster', 'tempo-slower', 'tempo-close'];
const near = (bpm, truth) => Math.abs(bpm - truth) <= Math.max(1, truth * .01);
const onABeat = (beats, t, within = .05) => beats.some(u => Math.abs(u - t) <= within);
const KINDS = ['right and certain', 'right but close', 'wrong but close', 'wrong and certain'];
const tally = () => ({...Object.fromEntries(KINDS.map(k => [k, 0])), songs: 0, 'off-beat cuts': 0, 'true beats': 0, 'cut-able': 0, likely: 0, unsure: 0, cuts: {sure: 0, close: 0}, snapped: {sure: 0, close: 0}});
const total = tally(), random = noiseFrom(7), uniform = (a, b) => a + (b - a) * (random() + 1) / 2;

/** One song's map, judged: which of the four it is; the beats a film may cut on against the true ones; cuts every 3–8 s snapped within ±0.15 s. */
async function judge(song, counts) {
  const made = song.make(), truth = made.bpm ?? song.bpm, map = await beatMapOf(made.samples, 22050), right = near(map.bpm, truth);
  const kind = `${right ? 'right' : 'wrong'} ${map.sure ? 'and certain' : 'but close'}`, which = map.sure ? 'sure' : 'close';
  const cut = safeBeats(map).beats, off = cut.filter(t => !onABeat(made.beats, t)), end = made.samples.length / 22050;
  const cuts = [], snapped = [];
  for (let t = uniform(3, 8); t < end; t += uniform(3, 8)) { cuts.push(t); if (onABeat(cut, t, .15)) snapped.push(t); }
  for (const c of [counts, total]) {
    c[kind]++; c.songs++; c['off-beat cuts'] += off.length; c.cuts[which] += cuts.length; c.snapped[which] += snapped.length;
    if (!map.sure) {
      c['true beats'] += made.beats.length; c['cut-able'] += cut.length - off.length; c.unsure++;
      if (likelyTempi(map).some(b => Math.abs(b - truth) <= Math.max(1.5, truth * .01))) c.likely++;
    }
  }
  return {kind, map, truth, off, right};
}

const percent = (a, b) => `${(100 * a / Math.max(1, b)).toFixed(1)}%`;
const summary = c => `${c.songs} songs: ${KINDS.map(k => `${c[k]} ${k}`).join(', ')}; ${c['off-beat cuts']} cuts off a true beat (sure and unsure); unsure maps: ${c['cut-able']} of ${c['true beats']} true beats cut-able (${percent(c['cut-able'], c['true beats'])}), the truth among the likely tempi in ${c.likely} of ${c.unsure}; a cut every 3–8 s snaps (±0.15 s): sure ${c.snapped.sure} of ${c.cuts.sure} (${percent(c.snapped.sure, c.cuts.sure)}), unsure ${c.snapped.close} of ${c.cuts.close} (${percent(c.snapped.close, c.cuts.close)})`;

for (const group of GROUPS) test(`${group}: never a wrong tempo claimed as certain; unsure and wrong, the right one among the alternatives; no cut off a true beat`, async t => {
  const counts = tally(), wrongAndCertain = [], unlisted = [], offBeat = [];
  for (const song of tempoCorpus().filter(s => s.group === group)) {
    const {kind, map, truth, off, right} = await judge(song, counts);
    if (kind === 'wrong and certain') wrongAndCertain.push(`${song.name}: ${map.bpm} (${map.verdict}), truth ${truth}`);
    if (!right && !map.alternatives.some(a => near(a.bpm, truth))) unlisted.push(`${song.name}: ${map.bpm}, alternatives ${map.alternatives.map(a => a.bpm).join(', ')}`);
    if (off.length) offBeat.push(`${song.name} (${map.verdict}): ${off.length} cuts off a true beat (${off.slice(0, 3).map(x => x.toFixed(3)).join(', ')} …)`);
  }
  t.diagnostic(`${group}: ${summary(counts)}`);
  assert.deepEqual(wrongAndCertain, [], 'a wrong tempo is never claimed as certain');
  assert.deepEqual(unlisted, [], 'unsure and wrong, the right tempo is among the alternatives');
  assert.deepEqual(offBeat, [], 'every beat a film may cut on is a true beat, sure or unsure');
});

test('the whole corpus: 248 songs, none wrong and certain, no cut off a true beat', t => {
  t.diagnostic(`corpus: ${summary(total)}`);
  assert.equal(total.songs, 248);
  assert.equal(total['wrong and certain'], 0);
  assert.equal(total['off-beat cuts'], 0);
});

test('ill-posed rhythms (a snare alone on 2 and 4, a kick-only tresillo, claps alone on the off-beats): not scored, each gives a verdict its record keeps', async t => {
  const said = [];
  for (const song of tempoCorpus().filter(s => s.group === 'ill-posed')) {
    const made = song.make(), map = await beatMapOf(made.samples, 22050), condition = map.record.find(e => e.type === 'condition');
    assert.ok(VERDICTS.includes(map.verdict), `${song.name}: ${map.verdict}`);
    assert.ok(condition && condition.text.includes(map.verdict), `${song.name}: the record says ${map.verdict}`);
    said.push(`${song.name}: ${map.verdict} ${map.bpm}${map.sure ? '' : ` (one of ${likelyTempi(map).join(', ')})`}`);
  }
  assert.equal(said.length, 21);
  t.diagnostic(`ill-posed: ${said.join('; ')}`);
});
