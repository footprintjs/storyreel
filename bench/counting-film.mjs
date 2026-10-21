/**
 * The benches' film (bench/quick-edit.mjs, bench/changes.mjs): Counting, 3:07 on even timings — a board, a cartoon
 * valley by fade, code by wipe, and two shots of the bench kit (bench/quick-edit-kit) by torn and iris.
 */
const say = (...lines) => lines.join(' ');
const storyboard = {title: 'Counting', scenes: [
  {id: 'open', title: 'The board', narration: say('Here is our board. Today we count with pebbles, the way a shepherd did long ago, before anyone wrote numbers down.',
    'A shepherd had a flock to keep, and a field far from home. Every morning the sheep went out, and every evening they came back.',
    'But how could he know that every one of them came home? He had no numbers to count with, only his hands and the stones on the ground.',
    'So he picked up a pebble for each sheep. Watch the board, and we will do what he did, one stone at a time.')},
  {id: 'flock', title: 'The valley', narration: say('Now we are in the valley. The shepherd lets the sheep out, one by one, through the gate in the stone wall.',
    'As each sheep passes him, he drops one pebble into his bag. One sheep, one pebble. Another sheep, another pebble. He does not need to know any number.',
    'How many sheep went out? Three sheep went out, and there are three pebbles in the bag. The bag remembers for him.',
    'All day the sheep eat the grass, and the shepherd rests under the tree. In the evening, they all come home, and he takes one pebble out for each.',
    'If a pebble is left over, a sheep is missing, and he goes to look for it before the night comes down.')},
  {id: 'rule', title: 'The rule', narration: say('Here is the rule, written as code. One pebble for every sheep that goes out, and nothing else.',
    'The list of sheep is mapped to a list of pebbles, one for one. The length of that list is the count, and the code never needs to know it in advance.',
    'This is the same idea the shepherd had, written so a computer can follow it. A list on one side, a list on the other, matched one to one.',
    'When the lists match, the count is right. When they do not, something is missing, and the code can say so.')},
  {id: 'left', title: 'Morning', narration: say('In the morning the sun comes up over the hill, and the first sheep step out into the light.',
    'One, then another, then another: each one gets its pebble as it goes, and the row of pebbles grows across the page.',
    'The shepherd does not hurry. Each pebble is a promise that the sheep will be looked for if it does not come back.',
    'By the time the sun is high, the whole flock is out, and the row of pebbles is complete.')},
  {id: 'right', title: 'Evening', narration: say('In the evening the bar fills as the light goes, and the sheep come back down the hill.',
    'For every sheep through the gate, one pebble leaves the bag. The row shrinks as the flock comes home.',
    'When the last sheep is in, the bag is empty, and the shepherd knows that everyone is safe for the night.',
    'That is counting, the old way: one thing for one thing, matched until nothing is left over.')},
]};
const recipe = {
  story: {kit: 'whiteboard', defaultErase: null, erasers: {}, spots: [], items: [
    {at: ['open', 'Here is our board'], dur: 1.0, write: 'Counting with pebbles', x: 800, y: 200, size: 64, align: 'center'},
    {at: ['open', 'a pebble for each sheep'], dur: .4, draw: [['ellipse', 700, 480, 22, 16]], color: 'blue', size: 8, seed: 1},
    {at: ['open', 'a pebble for each sheep', .3], dur: .4, draw: [['ellipse', 800, 480, 22, 16]], color: 'blue', size: 8, seed: 2},
    {at: ['open', 'a pebble for each sheep', .6], dur: .4, draw: [['ellipse', 900, 480, 22, 16]], color: 'blue', size: 8, seed: 3}]},
  stages: [
    {type: 'world', scene: 'flock', enter: 'fade', world: {kit: 'cartoon', evening: ['flock', 'In the evening'],
      flock: {count: 3, missing: 0, out: {at: ['flock', 'lets the sheep out'], every: 1.2}, home: {at: ['flock', 'they all come home'], every: 1.0}},
      captions: [{at: ['flock', 'they all come home'], until: ['flock', 'they all come home', 3], text: 'three sheep · three pebbles'}],
      camera: [{at: ['flock', 'lets the sheep out'], to: [560, 640], zoom: 1.25}]}},
    {type: 'code', scene: 'rule', enter: 'wipe', chrome: false, file: 'count.ts', label: 'TYPESCRIPT', code: {file: 'count.ts', emphasis: {"'pebble'": 'known'}},
      reveal: [[0, ['rule', 'Here is the rule']], [1, ['rule', 'The length of that list']]],
      footer: {text: 'One pebble for every sheep.', at: ['rule', 'One pebble for every sheep']}},
    {type: 'world', scene: 'left', enter: 'torn', world: {kit: 'bench', shot: 'left', scene: 'left', beats: [['left', 'the first sheep step out'], ['left', 'the row of pebbles grows'], ['left', 'the whole flock is out']]}},
    {type: 'world', scene: 'right', enter: {type: 'iris', at: [800, 420]}, world: {kit: 'bench', shot: 'right', scene: 'right', beats: [['right', 'the sheep come back'], ['right', 'one pebble leaves the bag'], ['right', 'the bag is empty']]}},
  ],
};

/** The film's storyboard and recipe (fresh copies each call: a bench edits its own). */
export const countingFilm = () => ({storyboard: structuredClone(storyboard), recipe: structuredClone(recipe)});
