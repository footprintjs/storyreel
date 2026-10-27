/**
 * The demo kit: a tiny stage kit of plain shapes, to try the stage with and to show what a kit supplies. Its people
 * are the cartoon figure (kits/cartoon/figure.mjs) with arms bent toward what they reach for and a face that looks
 * and talks; its places and props are a few filled shapes. A real kit draws its own look; the stage is the same.
 *
 *   places  shop (spots: table, counter; regions: shelves) · park (spots: bench; regions: trees) · room (spots: table)
 *   people  adult · child · pet
 *   props   apple · bag (holds 10) · crate (holds 20) · box (holds 8, has a lid)
 */
import {drawFigure, figureAt} from '../kits/cartoon/figure.mjs';
import {stageKit} from './kit.mjs';

const INK = '#2e2c38', FLOOR = 860;
const fill = (ctx, color, path) => { ctx.fillStyle = color; ctx.beginPath(); path(); ctx.fill(); };
const rect = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };

// ── people ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The figure's pose from the stage's: standing, or the walk's, facing the stage's way. */
const standing = (x, facing) => ({x, lift: 0, lean: 0, feet: [{x: x - 10, lift: 0, angle: 0}, {x: x + 10, lift: 0, angle: 0}], swing: 0, turn: 0, facing, walking: false, phase: 'after'});
const HOLD = {shoulder: .75, elbow: .9};
function figurePose(pose, holding) {
  const base = pose.walk ? {...pose.walk, facing: pose.facing} : standing(pose.x, pose.facing), near = pose.facing === 1 ? 1 : 0;
  const arms = [0, 1].map(j => ({shoulder: (j === 1 ? 1 : -1) * .5 * base.swing, elbow: .25}));
  if (holding) arms[near] = HOLD;
  if (pose.arm) {
    const shoulder = figureAt(base, {floor: pose.y, size: pose.size}).shoulder, [tx, ty] = pose.arm.to;
    const aim = Math.atan2(pose.facing * (tx - shoulder.x), ty - shoulder.y), from = arms[near].shoulder;
    arms[near] = {shoulder: from + (aim - from) * pose.arm.amount, elbow: arms[near].elbow * (1 - Math.min(1, Math.max(0, pose.arm.amount)))};
  }
  return {...base, joints: {neck: 0, arms}};
}
/** Where a figure's near hand is while it holds something (the stage puts what it holds there). */
const figureHand = ({x, y, facing, size, walk}) => {
  const p = figureAt(figurePose({x, y, facing, size, walk, arm: null}, true), {floor: y, size});
  return [p.hands[p.near].x, p.hands[p.near].y];
};
/** Two small hands in front of the chest, each finger as long as it is straight (fingersAt's numbers). */
function hands(ctx, p, fingers, size) {
  const up = Math.max(0, fingers.shown), y = p.shoulder.y + .12 * size * (1 - up), w = .018 * size;
  for (const [hand, dx] of [['left', -.09], ['right', .02]]) fingers.hands[hand].forEach((e, k) => {
    const x = p.shoulder.x + (dx + .016 * k) * size;
    rect(ctx, '#f3c39b', x, y - .07 * size * Math.max(0, e) * up, w * .8, .07 * size * Math.max(0, e) * up + .02 * size);
  });
}
function person(colors, size) {
  return {size, mouth: true, hand: figureHand, draw(ctx, pose) {
    const fp = figurePose(pose, pose.holding.length > 0), p = figureAt(fp, {floor: pose.y, size: pose.size});
    drawFigure(ctx, fp, {floor: pose.y, size: pose.size, colors});
    const {x, y, r} = p.head, look = pose.look, lx = look ? Math.max(-1, Math.min(1, (look.to[0] - x) / 200)) * look.amount : 0, ly = look ? Math.max(-1, Math.min(1, (look.to[1] - y) / 200)) * look.amount : 0;
    fill(ctx, '#ffffff', () => ctx.arc(x + pose.facing * .25 * r + lx * .2 * r, y - .1 * r, .22 * r, 0, Math.PI * 2));
    fill(ctx, INK, () => ctx.arc(x + pose.facing * .25 * r + lx * .3 * r, y - .1 * r + ly * .1 * r, .1 * r, 0, Math.PI * 2));
    fill(ctx, INK, () => ctx.ellipse(x + pose.facing * .2 * r, y + .45 * r, .18 * r, .04 * r + .14 * r * pose.talk, 0, 0, Math.PI * 2));
    if (pose.fingers) hands(ctx, p, pose.fingers, pose.size);
  }};
}
const pet = {size: 120, walk: {cadence: 4, stride: 1, bob: .06, bounce: 1, lift: .15, lean: .05, arms: 0, anticipate: .2, dip: .05, settle: .3, rock: .04, roll: 0}, hand: ({x, y, facing, size}) => [x + facing * .4 * size, y - .45 * size], draw(ctx, pose) {
  const {x, y, size: s, facing: f} = pose, lift = pose.walk ? pose.walk.lift * 2 : 0, by = y - .3 * s - lift;
  fill(ctx, '#a5703f', () => ctx.ellipse(x - f * .45 * s, by - .25 * s, .16 * s, .32 * s, -f * .4, 0, Math.PI * 2));   // its tail
  fill(ctx, '#c08552', () => ctx.ellipse(x, by, .32 * s, .24 * s, 0, 0, Math.PI * 2));
  fill(ctx, '#c08552', () => ctx.arc(x + f * .3 * s, by - .22 * s, .17 * s, 0, Math.PI * 2));
  fill(ctx, INK, () => ctx.arc(x + f * .36 * s, by - .26 * s, .03 * s, 0, Math.PI * 2));
}};

// ── places ────────────────────────────────────────────────────────────────────────────────────────────────────────
const wall = (ctx, color, floor) => { rect(ctx, color, 0, 0, 1600, 640); rect(ctx, floor, 0, 640, 1600, 260); };
const table = (ctx, x, top, w) => { rect(ctx, '#a8754a', x - w / 2, top, w, 16); rect(ctx, '#8a5d38', x - w / 2 + 14, top + 16, 14, FLOOR - top - 16); rect(ctx, '#8a5d38', x + w / 2 - 28, top + 16, 14, FLOOR - top - 16); };
const shop = {floor: FLOOR, spots: {table: [700, 700], counter: [1280, 596]}, regions: {shelves: [80, 140, 1000, 420]},
  draw(ctx) {
    wall(ctx, '#f4e9d4', '#dcc7a5');
    for (const y of [240, 400]) { rect(ctx, '#9a6a40', 80, y, 920, 16); for (let x = 110; x < 980; x += 52) fill(ctx, ['#d9443a', '#f4d54a', '#7fb84a'][(x + y) % 3], () => ctx.arc(x, y - 20, 20, 0, Math.PI * 2)); }
    table(ctx, 700, 700, 260);
  },
  front(ctx) { rect(ctx, '#b98a5a', 1080, 610, 440, 250); rect(ctx, '#9a6a40', 1066, 596, 468, 18); }};
const park = {floor: FLOOR, spots: {bench: [1250, 760]}, regions: {trees: [60, 220, 520, 640]},
  draw(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 640); g.addColorStop(0, '#bfe3f4'); g.addColorStop(1, '#eef7ee'); ctx.fillStyle = g; ctx.fillRect(0, 0, 1600, 640);
    rect(ctx, '#9fcf7a', 0, 600, 1600, 300); rect(ctx, '#e9dcc4', 0, 740, 1600, 160);
    for (const [x, r] of [[160, 110], [400, 90]]) { rect(ctx, '#8a5a38', x - 14, 640 - 2 * r, 28, 2 * r); fill(ctx, '#6fae5c', () => ctx.arc(x, 640 - 2 * r, r, 0, Math.PI * 2)); }
    rect(ctx, '#8a5d38', 1150, 700, 200, 14); rect(ctx, '#8a5d38', 1160, 714, 12, 46); rect(ctx, '#8a5d38', 1328, 714, 12, 46);
  }};
const room = {floor: FLOOR, spots: {table: [500, 700]}, draw(ctx) {
  wall(ctx, '#dcebf0', '#d9c3a0'); rect(ctx, '#ffffff', 1050, 140, 300, 220); rect(ctx, '#bfe3f4', 1066, 156, 268, 188); table(ctx, 500, 700, 320);
}};

// ── props: each drawn with its bottom centre at (0, 0) ────────────────────────────────────────────────────────────
const apple = {size: [34, 34], draw(ctx) {
  fill(ctx, '#d9443a', () => ctx.arc(0, -17, 17, 0, Math.PI * 2));
  fill(ctx, '#7fb84a', () => ctx.ellipse(5, -35, 6, 3, -.5, 0, Math.PI * 2));
}};
const trapezoid = (ctx, color, w, h, lip = 0) => fill(ctx, color, () => { ctx.moveTo(-w / 2 - 4, 0); ctx.lineTo(w / 2 + 4, 0); ctx.lineTo(w / 2, -h + lip); ctx.lineTo(-w / 2, -h + lip); ctx.closePath(); });
const bag = {size: [120, 120], slots: 10, draw: ctx => trapezoid(ctx, '#b8956a', 120, 120), front: ctx => trapezoid(ctx, '#d8b98a', 120, 120, 34)};
const crate = {size: [220, 80], slots: 20, draw: ctx => rect(ctx, '#a87444', -110, -80, 220, 80),
  front: ctx => { rect(ctx, '#d9ad74', -110, -56, 220, 56); rect(ctx, '#a87444', -104, -30, 208, 4); }};
const box = {size: [160, 120], slots: 8, opens: true, draw: ctx => rect(ctx, '#6d8fb8', -80, -120, 160, 120),
  front(ctx, look) {
    rect(ctx, '#8fb0d6', -80, -84, 160, 84);
    ctx.translate(-80, -120); ctx.rotate(-Math.PI * .55 * look.open); rect(ctx, '#5b7ca3', 0, -10, 160, 12);   // the lid, hinged at its back edge
  }};

/** The demo kit's adapters (stageKit's input), and the kit itself. */
export const DEMO = Object.freeze({
  places: Object.freeze({shop, park, room}),
  people: Object.freeze({adult: person({shirt: '#3a8f8a'}, 470), child: person({shirt: '#e2a03f', legs: '#5b4a8b'}, 330), pet}),
  props: Object.freeze({apple, bag, crate, box}),
});
export const demoKit = stageKit({name: 'demo', ...DEMO});
