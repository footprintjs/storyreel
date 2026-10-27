// The stage (src/stage/): a scene as data — a place, a cast, props and actions from a small fixed vocabulary — played
// by the library and drawn by a kit's adapters. Each action's timing, the continuity ledger, the refusals, the names
// for the camera, and that every frame is a pure function of time.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {compileStage, readAdapters, DEMO, demoKit, ACTIONS, ACTION_NAMES, TRAVELS, STAGE, BADGE_NAMES} from '../src/stage/index.mjs';
import {walk} from '../src/walk.mjs';
import {fingersAt} from '../src/fingers.mjs';

const stage = spec => compileStage(spec, {adapters: DEMO});
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const item = (s, t, key) => s.stateAt(t).items.find(i => i.key === key);
const who = (s, t, id) => s.stateAt(t).people.find(p => p.who === id);
const shop = (actions, extra = {}) => stage({place: 'shop',
  cast: {keeper: {as: 'adult', x: 1300, facing: 'left'}, girl: {as: 'child', x: 520}},
  props: {crate: {kind: 'crate', at: 'counter'}, bag: {kind: 'bag', at: 'table'}, apples: {kind: 'apple', count: 10, in: 'crate'}, ...extra}, actions});
const tenBeats = Array.from({length: 10}, (_, k) => 2 + k * .5);

test('the vocabulary is the small fixed list, as data, with its travels and badges', () => {
  assert.deepEqual(ACTION_NAMES, ['walkTo', 'enter', 'exit', 'pickUp', 'give', 'putInto', 'takeOutOf', 'count', 'fade', 'point', 'open', 'close', 'lookAt', 'countOnFingers']);
  assert.deepEqual(Object.keys(TRAVELS), ['hop', 'toss', 'lift', 'drop', 'slide']);
  assert.deepEqual(BADGE_NAMES, ['total', 'each', 'none']);
  for (const [verb, rule] of Object.entries(ACTIONS)) for (const k of rule.needs) assert.ok(rule.keys.includes(k), `${verb} needs ${k} and takes it`);
  assert.equal(demoKit.name, 'demo');
  assert.deepEqual([...demoKit.adapters.places, ...demoKit.adapters.people, ...demoKit.adapters.props], ['shop', 'park', 'room', 'adult', 'child', 'pet', 'apple', 'bag', 'crate', 'box']);
});

test('count: one thing a beat hops from where it is into the container on an arc, winds back first, lands and settles; the badge counts on landing', () => {
  const s = shop([{do: 'count', what: 'apples', into: 'bag', at: tenBeats}]), hop = TRAVELS.hop.seconds;
  const first = s.ledger[0];
  assert.deepEqual([first.path, first.where.apples], ['actions[0].at[0]', {crate: 9, bag: 1}]);
  // The first to go is the top of the heap (slot 9 of the crate's rows); it rests in the crate until its beat.
  const key = 'apples#10', from = item(s, 1, key), to = item(s, 2 + hop + 1, key);
  assert.ok(from.layer === 'in:crate' && to.layer === 'in:bag', `${from.layer} → ${to.layer}`);
  // Anticipation: just before its beat it winds back, away from where it goes (bag is to the left: it moves right).
  const wound = item(s, 2 - .02, key);
  assert.ok(wound.x > from.x + 1, `winds back: ${wound.x} vs ${from.x}`);
  // An arc: half way it is well above the straight line between where it left and where it lands.
  const mid = item(s, 2 + hop / 2, key);
  assert.ok(mid.y < Math.min(from.y, to.y) - 100, `arcs over: ${mid.y}`);
  assert.equal(mid.layer, 'flight');
  // Lands: squashed on contact (wider than tall), round again within 0.6 s.
  const landed = item(s, 2 + hop + .01, key);
  assert.ok(landed.sx > 1.05 && landed.sy < .95 && near(landed.sx * landed.sy, 1), `squash ${landed.sx} × ${landed.sy}`);
  assert.deepEqual([item(s, 2 + hop + .7, key).sx, item(s, 2 + hop + .7, key).sy], [1, 1]);
  // The badge: none before the first landing, n after the nth, done (the last) after the tenth.
  assert.equal(s.stateAt(2 + hop - .01).badges.length, 0);
  assert.deepEqual(s.stateAt(2 + 3 * .5 + hop + .01).badges.map(b => b.n), [4]);
  assert.deepEqual(s.stateAt(10).badges.map(b => [b.n, b.done]), [[10, true]]);
  // Sounds: a tap as each lands, a chime for the last.
  assert.deepEqual(s.sounds.map(x => x.type), [...Array(9).fill('tap'), 'chime']);
  assert.ok(near(s.sounds[0].time, 2 + hop));
  // 'each' puts a number over each thing instead; 'none' has none.
  const each = shop([{do: 'count', what: 'apples', into: 'bag', at: tenBeats.slice(0, 3), badge: 'each'}]);
  assert.deepEqual(each.stateAt(5).badges.map(b => b.n), [1, 2, 3]);
  assert.equal(shop([{do: 'count', what: 'apples', into: 'bag', at: tenBeats.slice(0, 3), badge: 'none'}]).stateAt(5).badges.length, 0);
});

test('walkTo, enter and exit walk with walk.mjs: the same feet, the same place at every moment; a group keeps its formation', () => {
  const s = shop([{do: 'walkTo', who: 'girl', to: 900, at: 1}]), plan = walk({from: 520, to: 900, start: 1, size: DEMO.people.child.size});
  for (const t of [0, 1, 1.4, 2, 2.6, plan.arrive, plan.end, 9]) {
    const p = who(s, t, 'girl');
    assert.ok(near(p.x, plan.at(t).x), `x at ${t}`);
    if (t >= 1 && t <= plan.end) assert.deepEqual(p.walk, plan.at(t)); else assert.equal(p.walk, null);
  }
  // Entering: off stage before, walking in from the nearer edge, on stage at its cast place.
  const e = shop([{do: 'enter', who: 'girl', at: 1}]);
  assert.equal(who(e, .9, 'girl'), undefined);
  assert.ok(who(e, 1.2, 'girl').x < 0, 'from the left edge');
  assert.equal(who(e, 9, 'girl').x, 520);
  // Exiting: off stage once the walk has settled past the edge; what they hold goes with them.
  const x = shop([{do: 'walkTo', who: 'girl', to: 'bag', at: 0}, {do: 'pickUp', who: 'girl', what: 'bag', at: 3}, {do: 'exit', who: 'girl', at: 4}]);
  assert.equal(who(x, 30, 'girl'), undefined);
  assert.equal(item(x, 30, 'bag'), undefined);
  assert.deepEqual(x.ledger.at(-1).holds, {girl: {bag: 1}});
  // A group: both walk the same way, the second keeping its distance from the first.
  const g = stage({place: 'park', cast: {a: {as: 'adult', x: 300}, b: {as: 'child', x: 500}}, actions: [{do: 'walkTo', who: ['a', 'b'], to: 800, at: 0}]});
  assert.deepEqual([who(g, 20, 'a').x, who(g, 20, 'b').x], [800, 1000]);
});

test('pickUp, give, putInto, takeOutOf: the arm winds back, swings out past its end and settles; the thing travels by its strategy', () => {
  const s = shop([
    {do: 'walkTo', who: 'girl', to: 'bag', at: 0},
    {do: 'pickUp', who: 'girl', what: 'bag', at: 3},
    {do: 'walkTo', who: 'girl', to: 1000, at: 4},
    {do: 'takeOutOf', who: 'keeper', what: 'apples', from: 'crate', at: 4},
    {do: 'give', from: 'keeper', to: 'girl', what: 'apples', at: 8},
    {do: 'putInto', who: 'girl', what: 'apples', into: 'bag', at: 9},
  ]);
  const lift = STAGE.arm.move + TRAVELS.lift.seconds;
  // pickUp: the arm reaches, the bag lifts from the table to her hand.
  const arm = t => who(s, t, 'girl').arm?.amount ?? 0;
  assert.equal(arm(3 - STAGE.arm.anticipate - .01), 0);
  assert.ok(arm(3 - .02) < 0, 'winds back before it reaches');
  assert.ok(Math.max(...Array.from({length: 40}, (_, i) => arm(3 + i * .01))) > 1.05, 'passes its end');
  assert.equal(item(s, 3 + lift - .01, 'bag').layer.startsWith('with') || item(s, 3 + lift - .01, 'bag').layer === 'flight', true);
  assert.equal(item(s, 3 + lift + .01, 'bag').layer, 'with:girl');
  assert.equal(arm(3 + lift + STAGE.lower + .01), 0);
  // give: a toss of TRAVELS.toss.seconds, hand to hand; both face each other.
  assert.equal(item(s, 8 - .01, 'apples#10').layer, 'with:keeper');
  assert.equal(item(s, 8 + TRAVELS.toss.seconds + .01, 'apples#10').layer, 'with:girl');
  assert.deepEqual([who(s, 8.2, 'keeper').facing, who(s, 8.2, 'girl').facing], [-1, 1]);
  assert.deepEqual([who(s, 8.2, 'keeper').arm.why, who(s, 8.2, 'girl').arm.why], ['give', 'take']);
  // putInto: into the bag she holds (it goes with her); the ledger counts it.
  assert.equal(item(s, 12, 'apples#10').layer, 'in:bag');
  assert.deepEqual(s.ledger.map(e => e.where.apples), [{crate: 10}, {crate: 10}, {crate: 10}, {crate: 9, keeper: 1}, {crate: 9, girl: 1}, {crate: 9, bag: 1}]);
  assert.deepEqual(s.sounds.map(x => x.type), ['slide', 'tap', 'whoosh', 'tap']);
});

test('fade, point, lookAt, open and close, countOnFingers, and props that pop in and out: each on its beat, each timed', () => {
  const s = stage({place: 'room', cast: {kid: {as: 'child', x: 300}, dad: {as: 'adult', x: 760}},
    props: {box: {kind: 'box', at: 'table'}, apples: {kind: 'apple', count: 3, with: 'kid'}, ball: {kind: 'apple', at: [1200, 860]}},
    actions: [
      {do: 'fade', what: 'apples', n: 2, at: 1},
      {do: 'point', who: 'kid', on: 'box', at: 2},
      {do: 'lookAt', who: 'dad', on: 'kid', at: 2},
      {do: 'open', what: 'box', who: 'dad', at: 4},
      {do: 'lookAt', who: 'dad', on: 'box', at: 5},
      {do: 'close', what: 'box', at: 6},
      {do: 'countOnFingers', who: 'kid', at: 7, up: 10, fold: [7.5, 8.1]},
      {do: 'exit', what: 'ball', at: 9},
    ]});
  // fade: 2 of the 3 she holds go over STAGE.fade, the last held stays.
  const apples = t => s.stateAt(t).items.filter(i => i.prop === 'apples');
  assert.equal(apples(.9).length, 3);
  assert.ok(apples(1 + STAGE.fade / 2).filter(i => i.opacity < 1 && i.opacity > 0).length === 2);
  assert.equal(apples(1 + STAGE.fade + .01).length, 1);
  assert.deepEqual(s.ledger[0].where.apples, {kid: 1, gone: 2});
  // point: the arm toward the box's middle, held STAGE.hold, then down.
  const p = who(s, 2.5, 'kid').arm, box = item(s, 2.5, 'box');
  assert.deepEqual([p.why, p.to[0], p.to[1]], ['point', box.x, box.y - DEMO.props.box.size[1] / 2]);
  assert.equal(who(s, 2 + STAGE.hold + STAGE.lower + .01, 'kid').arm, null);
  // lookAt: the eyes come round over STAGE.look; a second look moves from the first to the next.
  assert.ok(who(s, 2 + STAGE.look / 2, 'dad').look.amount > 0 && who(s, 2 + STAGE.look / 2, 'dad').look.amount < 1);
  assert.equal(who(s, 3, 'dad').look.amount, 1);
  const kidHead = [300, 860 - .85 * DEMO.people.child.size];
  assert.deepEqual(who(s, 3, 'dad').look.to, kidHead);
  assert.ok(who(s, 5 + STAGE.look / 2, 'dad').look.to[0] > kidHead[0] && who(s, 5 + STAGE.look / 2, 'dad').look.to[0] < box.x);
  // open and close: shut, swinging open past 1 and settling at 1, then back to 0; a door sound each.
  const door = t => item(s, t, 'box').open;
  assert.equal(door(3.8), 0);
  assert.ok(Math.max(...Array.from({length: 60}, (_, i) => door(4 + i * .01))) > 1.03);
  assert.equal(door(5.5), 1);
  assert.equal(door(6.9), 0);
  assert.deepEqual(s.sounds.filter(x => x.type === 'door').map(x => x.time), [4, 6]);
  // countOnFingers: fingersAt's numbers on the beats, hands coming up.
  const keys = [{at: 7, up: 10}, {at: 7.5, fold: 1}, {at: 8.1, fold: 1}];
  for (const t of [7.2, 7.6, 8.4]) assert.deepEqual({...who(s, t, 'kid').fingers, shown: 0}, {...fingersAt(keys, t), shown: 0});
  assert.deepEqual(s.ledger.filter(e => e.fingers !== undefined).map(e => [e.path, e.fingers]), [['actions[6]', 10], ['actions[6].fold[0]', 9], ['actions[6].fold[1]', 8]]);
  // A prop that exits pops out (moves.mjs · pop-out) and is gone.
  assert.equal(item(s, 8.9, 'ball').opacity, 1);
  assert.ok(item(s, 9.2, 'ball').scale < 1);
  assert.equal(item(s, 10.5, 'ball'), undefined);
  // A prop that enters is off stage until its beat, then pops in.
  const pop = stage({place: 'shop', props: {bag: {kind: 'bag', at: 'table'}}, actions: [{do: 'enter', what: 'bag', at: 1}]});
  assert.equal(item(pop, .9, 'bag'), undefined);
  assert.ok(item(pop, 1.1, 'bag').scale < 1);
  assert.equal(item(pop, 3, 'bag').scale, 1);
  assert.deepEqual(pop.facts.start, {bag: 'off stage'});
});

test('the continuity record: after every beat, who holds what and how many are where; the facts it starts and ends with', () => {
  const park = stage({place: 'park',
    cast: {girl: {as: 'child', x: 520}, pet1: {as: 'pet', x: 1050, facing: 'left'}, pet2: {as: 'pet', x: 1250, facing: 'left'}},
    props: {bag: {kind: 'bag', with: 'girl'}, apples: {kind: 'apple', count: 10, in: 'bag'}},
    actions: [
      {do: 'takeOutOf', who: 'girl', what: 'apples', from: 'bag', at: 1},
      {do: 'fade', what: 'apples', from: 'girl', at: 2},
      {do: 'takeOutOf', who: 'girl', what: 'apples', from: 'bag', at: 3},
      {do: 'give', from: 'girl', to: 'pet1', what: 'apples', at: 3.6},
      {do: 'takeOutOf', who: 'girl', what: 'apples', from: 'bag', at: 4.4},
      {do: 'give', from: 'girl', to: 'pet2', what: 'apples', at: 5},
    ]});
  assert.deepEqual(park.ledger.map(e => [e.at, e.do, e.said]), [
    [1, 'takeOutOf', 'girl takes 1 of apples out of bag'], [2, 'fade', '1 of apples gone'],
    [3, 'takeOutOf', 'girl takes 1 of apples out of bag'], [3.6, 'give', 'girl gives 1 of apples to pet1'],
    [4.4, 'takeOutOf', 'girl takes 1 of apples out of bag'], [5, 'give', 'girl gives 1 of apples to pet2']]);
  assert.deepEqual(park.ledger.at(-1).where, {bag: {girl: 1}, apples: {bag: 7, pet1: 1, pet2: 1, gone: 1}});
  assert.deepEqual(park.ledger.at(-1).holds, {girl: {bag: 1}, pet1: {apples: 1}, pet2: {apples: 1}});
  assert.deepEqual(park.ledger.at(-1).on, ['girl', 'pet1', 'pet2']);
  assert.deepEqual(park.facts.start, {bag: 'with girl', 'apples in bag': 10, 'apples with girl': 0, 'apples with pet1': 0, 'apples with pet2': 0, 'apples on the ground': 0});
  assert.deepEqual(park.facts.end, {bag: 'with girl', 'apples in bag': 7, 'apples with girl': 0, 'apples with pet1': 1, 'apples with pet2': 1, 'apples on the ground': 0});
  assert.deepEqual(park.continuity, park.facts);
  assert.ok(Object.isFrozen(park.ledger) && Object.isFrozen(park.ledger[0]) && Object.isFrozen(park.facts.end));
  // A stage aside (a flash-forward, a memory) keeps its record and carries no facts.
  assert.equal(stage({place: 'park', aside: true}).continuity, null);
});

test('impossible sequences refuse, naming the action and the fix', () => {
  const refuses = (actions, pattern, extra) => assert.throws(() => shop(actions, extra), pattern);
  // A thing you do not hold; more than a container has; an 11th thing into 10 slots.
  refuses([{do: 'give', from: 'girl', to: 'keeper', what: 'apples', at: 1}], /actions\[0\]: girl gives 1 of apples at 1\.00 s but holds 0 \(apples: 10 in crate\): take it out of its container first/);
  refuses([{do: 'takeOutOf', who: 'keeper', what: 'apples', from: 'crate', n: 11, at: 1}], /takes 11 of apples out of crate at 1\.00 s, and crate has 10/);
  refuses([{do: 'count', what: 'apples', into: 'bag', at: tenBeats}], /bag holds 10 and has 1 in it: counting 10 into it makes 11 \(count at most 9, or give bag more slots\)/, {extra: {kind: 'apple', in: 'bag'}});
  refuses([{do: 'count', what: 'apples', into: 'bag', at: [...tenBeats, 7]}], /count names 11 beats, one per thing, but 10 of apples are there to count/);
  refuses([{do: 'takeOutOf', who: 'keeper', what: 'apples', from: 'crate', at: 1}, {do: 'putInto', who: 'keeper', what: 'apples', into: 'crate', n: 2, at: 2}], /keeper puts 2 of apples into crate at 2\.00 s but holds 1/);
  // A container still filling when it is picked up; someone out of reach; one action at a time; off stage.
  refuses([{do: 'count', what: 'apples', into: 'bag', at: tenBeats}, {do: 'walkTo', who: 'girl', to: 'bag', at: 2}, {do: 'pickUp', who: 'girl', what: 'bag', at: 6.5}], /bag is still being filled or emptied until 6\.95 s; move it once the last thing has landed/);
  refuses([{do: 'pickUp', who: 'keeper', what: 'bag', at: 1}], /keeper \(at x 1300\) is 600 px from bag \(at x 700\) at 1\.00 s, and reaches 353: give keeper a walkTo to it first/);
  refuses([{do: 'walkTo', who: 'girl', to: 900, at: 1}, {do: 'point', who: 'girl', on: 'bag', at: 1.5}], /actions\[1\] \(point\): girl is still busy with actions\[0\] \(walkTo\) until \d+\.\d\d s, and this starts at 1\.50 s: one action at a time/);
  refuses([{do: 'exit', who: 'girl', at: 0}, {do: 'point', who: 'girl', on: 'bag', at: 9}], /girl is off stage at 9\.00 s: give them an enter before this action/);
  refuses([{do: 'enter', who: 'girl', at: 0}, {do: 'enter', who: 'girl', at: 9}], /girl is already on stage at 9\.00 s/);
  // A shut lid; a door already open; a thing that has no door.
  const room = actions => stage({place: 'room', cast: {kid: {as: 'child', x: 420}}, props: {box: {kind: 'box', at: 'table'}, ball: {kind: 'apple', with: 'kid'}}, actions});
  assert.throws(() => room([{do: 'putInto', who: 'kid', what: 'ball', into: 'box', at: 1}]), /box is shut at 1\.00 s: open it first/);
  assert.throws(() => room([{do: 'open', what: 'box', at: 1}, {do: 'open', what: 'box', at: 2}]), /box is already open at 2\.00 s/);
  assert.throws(() => room([{do: 'open', what: 'ball', at: 1}]), /ball has no door or lid \(the kit's "apple" does not open\)/);
  assert.throws(() => room([{do: 'open', what: 'box', at: 1}, {do: 'putInto', who: 'kid', what: 'ball', into: 'box', at: 2}, {do: 'close', what: 'box', at: 2.2}]), /box shuts at 2\.20 s while things still go in or out: close it at 2\.50 s or later/);
  // Fading more than there are; counting from a group spread over two holders without saying which.
  refuses([{do: 'fade', what: 'apples', n: 11, at: 1}], /11 of apples fade at 1\.00 s, and 10 are there \(10 in crate\): fade at most 10/);
  refuses([{do: 'takeOutOf', who: 'keeper', what: 'apples', from: 'crate', at: 1}, {do: 'fade', what: 'apples', at: 2}], /apples are 9 in crate, 1 with keeper at 2\.00 s: say which go with from/);
  // Actions out of time order; a thing still on its way.
  refuses([{do: 'point', who: 'girl', on: 'bag', at: 3}, {do: 'lookAt', who: 'keeper', on: 'girl', at: 2}], /actions\[1\] \(lookAt\) starts at 2\.00 s, before actions\[0\] \(3\.00 s\): list the actions in the order they start/);
  refuses([{do: 'takeOutOf', who: 'keeper', what: 'apples', from: 'crate', at: 1}, {do: 'give', from: 'keeper', to: 'girl', what: 'apples', at: 1.4}], /keeper is still busy with actions\[0\] \(takeOutOf\) until 1\.55 s/);
});

test('names and data refuse: an unknown verb, key, id, place, person or prop kind (listing what the kit has), and two things with one name', () => {
  const refuses = (spec, pattern) => assert.throws(() => stage(spec), pattern);
  refuses({place: 'beach'}, /place: the stage kit "stage" has no place called "beach" \(its places are shop, park, room\)/);
  refuses({place: 'shop', cast: {a: {as: 'giant', x: 1}}}, /cast\.a: the stage kit "stage" has no people called "giant" \(its people are adult, child, pet\)/);
  refuses({place: 'shop', props: {a: {kind: 'pear', at: [1, 1]}}}, /props\.a: the stage kit "stage" has no prop called "pear" \(its props are apple, bag, crate, box\)/);
  refuses({place: 'shop', actions: [{do: 'jump', at: 1}]}, /actions\[0\]: "do" is one of walkTo, enter, exit, pickUp, give, putInto, takeOutOf, count, fade, point, open, close, lookAt, countOnFingers, not "jump"/);
  refuses({place: 'shop', cast: {a: {as: 'adult', x: 1}}, actions: [{do: 'point', who: 'a', on: 'a', at: 1, how: 'fast'}]}, /point has no key "how" \(it takes who, on, at, until\)/);
  refuses({place: 'shop', actions: [{do: 'give', from: 'a', to: 'b', at: 1}]}, /give needs what/);
  refuses({place: 'shop', cast: {a: {as: 'adult', x: 1}}, actions: [{do: 'pickUp', who: 'b', what: 'x', at: 1}]}, /who is a cast member \(a\), not "b"/);
  refuses({place: 'shop', props: {table: {kind: 'apple', at: [1, 1]}, shelves: {kind: 'apple', at: [1, 1]}}}, /two things are called "shelves" \(props and the place\)/);
  refuses({place: 'shop', props: {a: {kind: 'apple', at: 'roof'}}}, /the place "shop" has no spot "roof" \(its spots are table, counter\)/);
  refuses({place: 'shop', props: {a: {kind: 'apple', in: 'b'}, b: {kind: 'apple', at: [1, 1]}}}, /in names a container \(there are none/);
  refuses({place: 'shop', props: {a: {kind: 'apple', count: 11, in: 'b'}, b: {kind: 'bag', at: [1, 1]}}}, /11 things start in b, which holds 10/);
  refuses({place: 'shop', props: {a: {kind: 'bag', in: 'b'}, b: {kind: 'bag', in: 'a'}}}, /a container cannot hold what holds it/);
  refuses({place: 'shop', props: {a: {kind: 'apple', at: [1, 1], with: 'x'}}}, /give exactly one of at/);
  refuses({place: 'shop', weather: 'rain'}, /has "weather"; a stage takes place, cast, props, actions, aside, sounds/);
  refuses({place: 'shop', cast: {'a.b': {as: 'adult', x: 1}}}, /a cast member "a\.b" needs a name of letters, digits/);
  refuses({place: 'shop', actions: [{do: 'count', what: 'a', into: 'b', at: ['shop', '{a1}']}]}, /at is a list of beats, one per thing/);
  assert.throws(() => compileStage({place: 'shop', actions: [{do: 'enter', what: 'x', at: ['shop', 'hello']}]}, {adapters: DEMO}), /without a clock a beat is seconds/);
  // The adapters are checked once, by name.
  assert.throws(() => readAdapters({places: {}, people: {}, props: {}}, 'mine'), /the stage kit "mine" has no places: give at least one/);
  assert.throws(() => readAdapters({...DEMO, people: {x: {size: 0, draw() {}}}}, 'mine'), /people\.x: size is the standing height in px/);
  assert.throws(() => readAdapters({...DEMO, people: {x: {size: 300, walk: 'skip', draw() {}}}}, 'mine'), /people\.x: no walk called "skip"/);
  assert.throws(() => readAdapters({...DEMO, props: {x: {size: [1, 1], slots: 2.5, draw() {}}}}, 'mine'), /slots is how many things it holds/);
});

test('names for the camera: each person, each prop by its id (a group: the box round all its things), and the place\'s regions', () => {
  const s = shop([{do: 'count', what: 'apples', into: 'bag', at: tenBeats.slice(0, 4)}]);
  const at = t => Object.fromEntries(s.regionsAt(t).map(r => [r.name, r]));
  assert.deepEqual(Object.keys(at(0)), ['keeper', 'girl', 'crate', 'bag', 'apples', 'shelves']);
  assert.deepEqual(at(0).girl, {box: [520 - .22 * 330, 860 - 330, 520 + .22 * 330, 860], path: 'cast.girl', label: 'girl', name: 'girl'});
  assert.equal(at(0).shelves.path, 'place.shelves');
  // Before the count the apples are all in the crate; after four, some are in the bag: the group's box spans both.
  const crate = at(0).crate.box, bag = at(0).bag.box;
  assert.ok(at(0).apples.box[0] >= crate[0] - 1, 'all in the crate');
  assert.ok(at(6).apples.box[0] <= bag[2] && at(6).apples.box[2] >= crate[0], 'from the bag to the crate');
});

test('every frame is a pure function of time: the same numbers and pixels in any order, from any compile, and the canvas restored', () => {
  const spec = {place: 'shop', cast: {keeper: {as: 'adult', x: 1300, facing: 'left'}, girl: {as: 'child', x: 380}},
    props: {crate: {kind: 'crate', at: 'counter'}, bag: {kind: 'bag', at: 'table'}, apples: {kind: 'apple', count: 10, in: 'crate'}},
    actions: [{do: 'enter', who: 'girl', at: 0}, {do: 'count', what: 'apples', into: 'bag', who: 'keeper', at: tenBeats.map(t => t + 3)},
      {do: 'walkTo', who: 'girl', to: 'bag', at: 9}, {do: 'pickUp', who: 'girl', what: 'bag', at: 12}, {do: 'exit', who: 'girl', at: 13}]};
  const a = stage(spec), b = stage(structuredClone(spec)), times = [0, .5, 3.1, 5.3, 7.7, 9.4, 12.3, 13.5, 15, 19];
  for (const t of times) assert.deepEqual(a.stateAt(t), b.stateAt(t), `state at ${t}`);
  const canvas = createCanvas(400, 225), ctx = canvas.getContext('2d');
  const hash = (s, t) => {
    ctx.reset(); ctx.scale(.25, .25); s.draw(ctx, t);
    const m = ctx.getTransform();
    assert.deepEqual([m.a, m.d, m.e, m.f, ctx.globalAlpha], [.25, .25, 0, 0, 1], `the canvas is restored after the frame at ${t}`);
    return createHash('sha256').update(canvas.toBuffer('image/png')).digest('hex');
  };
  const forward = times.map(t => hash(a, t)), backward = [...times].reverse().map(t => hash(b, t)).reverse();
  assert.deepEqual(forward, backward);
  assert.ok(new Set(forward).size > 6, 'the frames differ: the stage moves');
});

test('a name every JavaScript object already has is refused wherever a recipe writes one, and nothing reaches Object.prototype', () => {
  const before = Object.getOwnPropertyNames(Object.prototype).sort();
  for (const name of ['__proto__', 'constructor', 'prototype']) {
    // As an id (JSON.parse makes "__proto__" an own key, as a recipe file would): refused, with the fix.
    assert.throws(() => stage(JSON.parse(`{"place": "shop", "cast": {"${name}": {"as": "adult", "x": 400}}}`)), new RegExp(`a cast member "${name}" has a name every JavaScript object already has: give it another name, such as "${name.replace(/_/g, '')}1"`));
    assert.throws(() => stage(JSON.parse(`{"place": "shop", "props": {"${name}": {"kind": "apple", "at": [400, 860]}}}`)), new RegExp(`a prop "${name}" has a name every JavaScript object already has`));
    // As a spot, a target, a place, a kind or an action's key: looked up among own keys only, and refused.
    assert.throws(() => stage(JSON.parse(`{"place": "shop", "props": {"a": {"kind": "apple", "at": "${name}"}}}`)), /the place "shop" has no spot/);
    assert.throws(() => stage({place: 'shop', cast: {kid: {as: 'child', x: 400}}, actions: [{do: 'point', who: 'kid', on: name, at: 1}]}), /on is a cast member, a prop, a spot or a region of the place/);
    assert.throws(() => stage({place: 'shop', cast: {kid: {as: 'child', x: 400}}, actions: [{do: 'walkTo', who: 'kid', to: name, at: 1}]}), /actions\[0\]\.to: on is a cast member/);
    assert.throws(() => stage({place: name}), /has no place called/);
    assert.throws(() => stage({place: 'shop', props: {a: {kind: name, at: [1, 1]}}}), /has no prop called/);
    assert.throws(() => stage({place: 'shop', cast: {a: {as: name, x: 1}}}), /has no people called/);
    assert.throws(() => stage(JSON.parse(`{"place": "shop", "actions": [{"do": "fade", "what": "a", "at": 1, "${name}": {"polluted": true}}]}`)), new RegExp(`fade has no key "${name}"`));
  }
  // A name an object only inherits (toString, hasOwnProperty) is an ordinary name: its records hold it as their own key.
  const s = stage({place: 'shop', cast: {hasOwnProperty: {as: 'child', x: 600}}, props: {toString: {kind: 'apple', count: 2, at: [700, 860]}, valueOf: {kind: 'bag', at: 'table'}},
    actions: [{do: 'pickUp', who: 'hasOwnProperty', what: 'toString', at: 1}, {do: 'putInto', who: 'hasOwnProperty', what: 'toString', into: 'valueOf', at: 2}]});
  assert.deepEqual(s.ledger.at(-1).where, {toString: {ground: 1, valueOf: 1}, valueOf: {ground: 1}});
  assert.ok(Object.hasOwn(s.ledger[0].holds, 'hasOwnProperty') && Object.hasOwn(s.facts.end, 'valueOf'));
  assert.throws(() => stage({place: 'shop', props: {a: {kind: 'apple', at: 'toString'}}}), /the place "shop" has no spot "toString"/);
  assert.deepEqual(Object.getOwnPropertyNames(Object.prototype).sort(), before, 'Object.prototype gained or lost nothing');
  assert.equal(({}).polluted, undefined);
});
