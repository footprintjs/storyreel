// The stage in a film (src/stage/kit.mjs, shots.mjs · joinContinuity): a recipe names the stage kit like any world,
// its actions are timed on the voice's phrases, the camera frames its names, and its continuity record reaches the
// film — each shot's facts are checked against the shot before, and its ledger is in film.shots and the record.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {demoKit} from '../src/stage/index.mjs';

const storyboard = {scenes: [
  {id: 'shop', narration: 'At the shop, the shopkeeper counts apples into a bag. {a1}One, {a2}two, {a3}three, {a4}four, {a5}five, {a6}six, {a7}seven, {a8}eight, {a9}nine, {a10}ten! {full}The bag is full, and the girl comes over to take it. {take}She picks it up, says thank you very much, {bye}and off she goes with her apples.'},
  {id: 'park', narration: '{in}In the park she walks along the path and stops to rest for a little while. {eat}She eats one apple, slowly. {pets}Two little friends come running up. {give1}She gives one apple to the first, {give2}and one apple to the second. {left}How many are left in her bag?'},
]};
const shopStage = {kit: 'demo', place: 'shop',
  cast: {shopkeeper: {as: 'adult', x: 1300, facing: 'left'}, girl: {as: 'child', x: 380}},
  props: {crate: {kind: 'crate', at: 'counter'}, bag: {kind: 'bag', at: 'table'}, apples: {kind: 'apple', count: 10, in: 'crate'}},
  actions: [
    {do: 'count', what: 'apples', into: 'bag', who: 'shopkeeper', at: Array.from({length: 10}, (_, k) => ['shop', `{a${k + 1}}`])},
    {do: 'walkTo', who: 'girl', to: 'bag', at: ['shop', '{full}']},
    {do: 'pickUp', who: 'girl', what: 'bag', at: ['shop', '{take}']},
    {do: 'exit', who: 'girl', at: ['shop', '{bye}']}]};
const parkStage = (apples = 10, extra = {}) => ({kit: 'demo', place: 'park', ...extra,
  cast: {girl: {as: 'child', x: 520}, pet1: {as: 'pet', x: 1050, facing: 'left'}, pet2: {as: 'pet', x: 1250, facing: 'left'}},
  props: {bag: {kind: 'bag', with: 'girl'}, apples: {kind: 'apple', count: apples, in: 'bag'}},
  actions: [
    {do: 'enter', who: 'girl', at: ['park', '{in}']},
    {do: 'takeOutOf', who: 'girl', what: 'apples', from: 'bag', at: ['park', '{eat}']},
    {do: 'fade', what: 'apples', from: 'girl', at: ['park', '{eat}', 1]},
    {do: 'enter', who: ['pet1', 'pet2'], at: ['park', '{pets}']},
    {do: 'takeOutOf', who: 'girl', what: 'apples', from: 'bag', at: ['park', '{give1}']},
    {do: 'give', from: 'girl', to: 'pet1', what: 'apples', at: ['park', '{give1}', .6]},
    {do: 'takeOutOf', who: 'girl', what: 'apples', from: 'bag', at: ['park', '{give2}']},
    {do: 'give', from: 'girl', to: 'pet2', what: 'apples', at: ['park', '{give2}', .6]}]});
const recipe = (park = parkStage(), stage = {}) => ({story: shopStage, stages: [{type: 'world', scene: 'park', ...stage, world: park}]});
const film = (r, options = {}) => compileFilm({storyboard, timings: evenTimings(storyboard), recipe: r, kits: [demoKit], ...options});

test('a stage plays on the voice: two places, ten apples into a bag, one eaten, two given, seven left; each shot carries its facts and ledger', async () => {
  const f = await film(recipe(), {record: true});
  const [shop, park] = f.shots;
  assert.deepEqual([shop.where, park.where], ['the story', 'stage park']);
  assert.equal(shop.end['apples in bag'], 10);
  assert.equal(shop.end.bag, 'with girl');
  assert.deepEqual([park.start['apples in bag'], park.end['apples in bag'], park.end['apples with pet1'], park.end['apples with pet2']], [10, 7, 1, 1]);
  assert.equal(shop.ledger.length, 13);
  assert.equal(park.ledger.at(-1).said, 'girl gives 1 of apples to pet2');
  // Each count beat is on its word: "{a3}three" is the third landing's beat.
  assert.equal(shop.ledger[2].at, +f.clock.at(['shop', '{a3}']).toFixed(3));
  // The making-of record keeps both: the world's continuity and its ledger.
  const written = JSON.stringify(f.record.snapshot);
  assert.match(written, /"apples in bag":7/);
  assert.match(written, /girl gives 1 of apples to pet2/);
  // The camera's names, through the film (the world's view applied): people, props by name, the place's regions.
  const names = f.regionsAt(f.clock.at(['shop', '{a5}'])).map(r => r.name).filter(Boolean);
  assert.deepEqual(names, ['shopkeeper', 'girl', 'crate', 'bag', 'apples', 'shelves']);
  assert.deepEqual(f.regionsAt(f.clock.at(['park', '{left}'])).map(r => r.name).filter(Boolean), ['girl', 'pet1', 'pet2', 'bag', 'apples', 'trees']);
  // Its sounds are the film's; the mouths of the people who draw one are the lip-sync check's.
  assert.ok(f.sounds.filter(s => s.type === 'chime').length >= 1);
  assert.deepEqual(f.mouthsAt(f.clock.at(['shop', '{a2}'])).map(m => m.who), ['shopkeeper', 'girl']);
  // Every frame draws, any order.
  const ctx = createCanvas(1600, 900).getContext('2d');
  for (const t of [30, 2, 17, 5]) { ctx.reset(); f.frame(ctx, t); }
});

test('continuity across shots: a park that starts with 9 apples in the bag, after a shop that ended with 10, is refused by name', async () => {
  await assert.rejects(film(recipe(parkStage(9))), /Continuity: stage park starts with apples in bag = 9, but the story left apples in bag = 10/);
  // A stage aside (a flash-forward, a memory) keeps its ledger and carries no facts, so it may differ.
  const f = await film(recipe(parkStage(9, {aside: true})));
  assert.deepEqual([f.shots[1].start, f.shots[1].end, f.shots[1].ledger.length], [null, null, 8]);
});

test('a shot\'s declared continuity joins its world\'s: both kept, a disagreement refused', async () => {
  const f = await film(recipe(parkStage(), {continuity: {end: {mood: 'happy'}}}));
  assert.deepEqual([f.shots[1].end.mood, f.shots[1].end['apples in bag']], ['happy', 7]);
  await assert.rejects(film(recipe(parkStage(), {continuity: {end: {'apples in bag': 6}}})), /Continuity: stage park declares end apples in bag = 6, but its world ends with apples in bag = 7 \(its own record\)/);
});

test('in a film, a beat is a phrase (Law 2): seconds refuse, and every refusal names the stage', async () => {
  const bad = {...shopStage, actions: [{do: 'walkTo', who: 'girl', to: 'bag', at: 3}]};
  await assert.rejects(film({story: bad}), /the "shop" stage: actions\[0\]\.at: /);
  const busy = {...shopStage, actions: [{do: 'walkTo', who: 'girl', to: 900, at: ['shop', '{a1}']}, {do: 'point', who: 'girl', on: 'bag', at: ['shop', '{a2}']}]};
  await assert.rejects(film({story: busy}), /the "shop" stage: actions\[1\] \(point\): girl is still busy with actions\[0\] \(walkTo\)/);
});
