// A measurement, not a feature: the scene a children's cartoon series made by hand — at a fruit shop ten oranges hop
// into a bag one per word, Grandad picks up the bag, they walk home, she eats one, gives two to the squirrels, seven
// are left — written as the data that series would write for the stage, through the generic API only. The kit here is
// the test's own (the demo kit's drawings under the series' names, plus an orange), so nothing of the series lives in
// the library. The narration is the series' own two scenes, with one line added for the walk out.
//
// Its hand-written world code for these two places is 343 lines (a shop, 193; the walk home, 150; plus 35 lines of
// helpers they share; counted by hand in that series' own repository, so this file does not check it), of which about 100 draw the backdrops and props: those become place and prop adapters, drawn
// once and reused. The data below is 28 lines (asserted), and plays the same story with the same continuity.
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {stageDrawings, DEMO} from '../src/stage/index.mjs';

const storyboard = {scenes: [
  {id: 'shop', narration: "Amaira's birthday party is coming! Today, Grandad takes her to the fruit shop. {ask}'Ten oranges, please!' {count}Amaira counts them into the bag. '{o1}One, {o2}two, {o3}three, {o4}four, {o5}five, {o6}six, {o7}seven, {o8}eight, {o9}nine, {o10}ten!' {full}'Ten oranges for your party,' says Grandad. {take}Grandad picks up the bag, {home}and off they go."},
  {id: 'walk', narration: "On the way home, Amaira's tummy rumbles. {hungry}'Grandad, I'm hungry!' 'Have one, sweetheart.' {eat}She eats an orange. {yum}Yum! {sq1}Then a little squirrel scampers up. It looks hungry too. {sq2}And here comes its friend! {give}Amaira gives them an orange each. {kind}'Sharing is kind,' says Grandad."},
]};

// The data, exactly as a recipe would carry it (two world stages), one action a line.
const DATA = `[
{"type": "world", "scene": "shop", "world": {"kit": "series", "place": "fruitshop",
 "cast": {"grandad": {"x": 260}, "amaira": {"x": 470}, "seller": {"x": 1450, "facing": "left"}},
 "props": {"crate": {"kind": "crate", "at": "counter"}, "bag": {"kind": "bag", "at": "table"}, "oranges": {"kind": "orange", "count": 10, "in": "crate"}},
 "actions": [
  {"do": "enter", "who": ["grandad", "amaira"], "at": ["shop", "Amaira's birthday party"]},
  {"do": "point", "who": "amaira", "on": "oranges", "at": ["shop", "{ask}"]},
  {"do": "enter", "what": "bag", "at": ["shop", "{count}"]},
  {"do": "count", "what": "oranges", "into": "bag", "who": "amaira", "at": [["shop", "{o1}"], ["shop", "{o2}"], ["shop", "{o3}"], ["shop", "{o4}"], ["shop", "{o5}"], ["shop", "{o6}"], ["shop", "{o7}"], ["shop", "{o8}"], ["shop", "{o9}"], ["shop", "{o10}"]]},
  {"do": "walkTo", "who": "grandad", "to": "bag", "at": ["shop", "{full}"]},
  {"do": "pickUp", "who": "grandad", "what": "bag", "at": ["shop", "{take}"]},
  {"do": "exit", "who": ["grandad", "amaira"], "to": "right", "at": ["shop", "{home}"]}]}},
{"type": "world", "scene": "walk", "world": {"kit": "series", "place": "walkhome",
 "cast": {"grandad": {"x": 420}, "amaira": {"x": 160}, "squirrel1": {"as": "squirrel", "x": 1060, "facing": "left"}, "squirrel2": {"as": "squirrel", "x": 1225, "facing": "left"}},
 "props": {"bag": {"kind": "bag", "with": "grandad"}, "oranges": {"kind": "orange", "count": 10, "in": "bag"}},
 "actions": [
  {"do": "enter", "who": "grandad", "at": ["walk", "On the way home"]},
  {"do": "walkTo", "who": "amaira", "to": 700, "at": ["walk", "On the way home"]},
  {"do": "lookAt", "who": "amaira", "on": "grandad", "at": ["walk", "{hungry}"]},
  {"do": "takeOutOf", "who": "amaira", "what": "oranges", "from": "bag", "at": ["walk", "{eat}"]},
  {"do": "fade", "what": "oranges", "from": "amaira", "at": ["walk", "{yum}"]},
  {"do": "enter", "who": "squirrel1", "at": ["walk", "{sq1}"]},
  {"do": "enter", "who": "squirrel2", "at": ["walk", "{sq2}"]},
  {"do": "takeOutOf", "who": "amaira", "what": "oranges", "from": "bag", "at": ["walk", "{give}"]},
  {"do": "give", "from": "amaira", "to": "squirrel1", "what": "oranges", "at": ["walk", "{give}", 0.6]},
  {"do": "takeOutOf", "who": "amaira", "what": "oranges", "from": "bag", "at": ["walk", "{give}", 1.2]},
  {"do": "give", "from": "amaira", "to": "squirrel2", "what": "oranges", "at": ["walk", "{give}", 1.8]}]}}
]`;
const DATA_LINES = 28;

// The test's drawings: the demo drawings under the series' names, and an orange.
const kit = stageDrawings({name: 'series',
  places: {fruitshop: DEMO.places.shop, walkhome: DEMO.places.park},
  people: {grandad: DEMO.people.adult, amaira: DEMO.people.child, seller: DEMO.people.adult, squirrel: DEMO.people.pet},
  props: {...DEMO.props, orange: {size: [36, 36], draw(ctx) { ctx.fillStyle = '#f39a2b'; ctx.beginPath(); ctx.arc(0, -18, 18, 0, Math.PI * 2); ctx.fill(); }}}});

test('the series\' shop and walk home, as stage data: the same story in a few lines, with its continuity checked across the cut', async t => {
  const stages = JSON.parse(DATA), lines = DATA.split('\n').length, pretty = JSON.stringify(stages, null, 2).split('\n').length;
  assert.equal(lines, DATA_LINES);
  t.diagnostic(`stage data: ${lines} lines as written (${pretty} pretty-printed, ${JSON.stringify(stages).length} characters); the hand-written worlds it replaces: 343 lines of code`);
  const film = await compileFilm({storyboard, timings: evenTimings(storyboard), recipe: {story: {kit: 'whiteboard', items: []}, stages}, kits: [kit]});
  const [, shop, walk] = film.shots;
  assert.deepEqual([shop.end['oranges in bag'], shop.end.bag], [10, 'with grandad']);
  assert.deepEqual([walk.start['oranges in bag'], walk.start.bag], [10, 'with grandad']);
  assert.deepEqual([walk.end['oranges in bag'], walk.end['oranges with squirrel1'], walk.end['oranges with squirrel2']], [7, 1, 1]);
  assert.deepEqual(walk.ledger.at(-1).where.oranges, {bag: 7, squirrel1: 1, squirrel2: 1, gone: 1});
  // Each orange lands on its word: the ledger's count beats are the narration's "{o1}" … "{o10}".
  assert.deepEqual(shop.ledger.filter(e => e.do === 'count').map(e => e.at), Array.from({length: 10}, (_, k) => +film.clock.at(['shop', `{o${k + 1}}`]).toFixed(3)));
  // The camera's names in the shop include each prop group by name, as the series' worlds named them by hand.
  assert.deepEqual(film.regionsAt(film.clock.at(['shop', '{o5}'])).map(r => r.name).filter(Boolean), ['grandad', 'amaira', 'seller', 'crate', 'bag', 'oranges', 'shelves']);
});
