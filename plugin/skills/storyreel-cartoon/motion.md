# Motion: moves, eases, walks, acting

A designer asks for "a soft rise" or "a pop", not for a curve and two numbers; an animator times a reaction by known
rules. StoryReel keeps both as data and pure functions of time, so a kit asks for motion by name and every frame
still draws the same at any `t`. Everything here is used inside a kit's `draw(ctx, t)` ([kits.md](kits.md)).

| module | what it gives |
|---|---|
| `footprint-storyreel/moves` | 30 moves by name (`pop`, `soft-rise`, `text-reveal-word`…): `moveAt`, `stagger`, `applyMove`, `movesBy`, `readMove` |
| `footprint-storyreel/ease` | the one ease table (`EASES`, `easeNamed`), CSS curves (`bezier`), `overshoots` |
| `footprint-storyreel/motion` | springs (`spring`, `track`, `settleTime`, feels `snappy` `default` `heavy` `playful`), `heldTime` (drawn on twos), `follow`/`lag`, `turnaround` |
| `footprint-storyreel/walk` | `walk({from, to, start, size, style, seconds?})`: a walk whose planted feet never slide |
| `footprint-storyreel/principles` | `anticipate`, `squash`, `envelope`/`burst`, `arc` |
| `footprint-storyreel/acting` | `moodAt`, `idleAt`, `follows`, `mouthAt` |

## Moves by name

| kind | moves |
|---|---|
| entrance | `fade-slide` `soft-rise` `mask-wipe` `iris-open` `overshoot` `bounce-landing` `spring-follow` `pop` `text-reveal-word` `text-reveal-letter` `count-up` `line-draw` `blur-in` `scale-in` `drop-in` `slam` |
| exit | `fade-slide-out` `soft-sink` `mask-wipe-out` `iris-close` `pop-out` `blur-out` `scale-out` `drop-out` |
| feedback | `shake` `wiggle` `nod` |
| ambient | `marquee` `pulse` `float` (they loop) |

`moveAt(name, t, {start, seconds?, feel?, reduced?})` gives `{opacity, x, y, scale, rotate, blur, clip, progress,
mask}` at `t`; `applyMove(ctx, values, {box})` puts them on the canvas for a thing drawn in `box` and returns false
when nothing shows (save before, restore after). `stagger(items, gap)` spaces the words of one line (`gap` in
seconds, or a move's name for its own gap). `movesBy({feel, use, kind})` finds moves; an unknown name refuses,
listing them. The timing rules are in the data: an exit takes half its entrance's seconds, words of a reveal are
0.09 s apart, an entrance ends at rest. A whole shot can enter with a move too: `"enter": {"move": "soft-rise"}`.

```js run
import {writeFileSync} from 'node:fs';
import {compileFilm, evenTimings, contactSheet} from 'footprint-storyreel';
import {moveAt, stagger, applyMove, movesBy} from 'footprint-storyreel/moves';

// A sign pops in on a phrase, then its words are revealed one after another.
const sign = {name: 'sign', story: {compile(spec, clock) {
  const at = clock.at(spec.pop), words = spec.text.split(' ');
  return {hang: 1, draw(ctx, t) {
    ctx.fillStyle = '#f6f1e7'; ctx.fillRect(0, 0, 1600, 900);
    ctx.save();
    if (applyMove(ctx, moveAt('pop', t, {start: at}), {box: [500, 300, 1100, 600]})) { ctx.fillStyle = '#e2574c'; ctx.fillRect(500, 300, 600, 300); }
    ctx.restore();
    ctx.font = '700 64px sans-serif'; ctx.fillStyle = '#2e2c38';
    let x = 560;
    for (const {item, delay} of stagger(words, 'text-reveal-word')) {
      const w = ctx.measureText(item).width;
      ctx.save();
      if (applyMove(ctx, moveAt('text-reveal-word', t, {start: at + .4 + delay}), {box: [x, 400, x + w, 470]})) ctx.fillText(item, x, 460);
      ctx.restore(); x += w + 20;
    }
  }};
}}};
const storyboard = {scenes: [{id: 'shop', silent: [['the sign pops up', 2], ['open today', 2]]}]};
const film = await compileFilm({storyboard, recipe: {story: {kit: 'sign', pop: ['shop', 'the sign pops up'], text: 'Open today'}}, kits: [sign], timings: evenTimings(storyboard)});
writeFileSync('sign.png', await contactSheet(film, {moments: [0.1, 0.25, 0.5, 1.5].map(t => ({t, label: `${t} s`}))}));
console.log(movesBy({feel: 'bouncy', use: 'logo'}).map(m => m.name));   // overshoot, bounce-landing, pop, pop-out, wiggle
console.log(moveAt('pop', 1, {start: 0, reduced: true}).scale);         // 1: reduced motion is the end state at once
```

## Eases and springs

Eases (`footprint-storyreel/ease` · `easeNamed`): `linear`, `in`, `out`, `inOut`, `back`, `walk`, `jump`, `spring`,
`bounce`, `outCubic`, `outQuint`, `outExpo`, `outBack`, `inOutCubic`, `standard`, `emphasized`, or a CSS curve
`"cubic-bezier(0.16, 1, 0.3, 1)"`. `easeNamed(name)` returns the curve, a function of how far through its seconds a
change is (0..1, clamped) to how far the value has gone: `easeNamed('inOut')(0.25)` (its second argument only names
who asked, in a refusal). `overshoots(name)` says whether it goes past the end (a
transition refuses one that would show the frame's edge). A spring (`footprint-storyreel/motion` · `spring`) arrives
by its own physics: `settleTime('heavy')` is about 0.8 s. `track(t, [[time, value], …])` moves a value through many
targets with one spring per change, so it never jumps.

## A walk

`walk({from, to, start, size, style})` plans it once, in `compile`: it sets off (a dip and a lean back), steps with
each foot planted exactly where the body passes over it, rolls each foot heel to toe, stops with the feet together and
settles. `at(t)` gives `{x, lift, lean, feet: [{x, lift, angle}, …], swing, turn, facing, walking, phase}`; a foot with
`lift` 0 is on the floor and does not move. The option `seconds` fits the stepping to a length (refused, with the
range, when the pace would be silly); the stepping starts after the style's set-off (`WALKS[style].anticipate`
seconds). The plan it returns says when: `w.arrive` (the feet come together), `w.end` (settled), `w.steps`, and
`w.at(t)`. Styles: `stroll`, `brisk`, `bouncy`, `tiptoe`,
or `{cadence, stride, bob, …}` of your own (`footprint-storyreel/walk` · `WALKS` lists their numbers).
`footprint-storyreel/pose` · `walkSource(plan)` turns it into the pose `drawFigure` draws ([SKILL.md](SKILL.md)).

```js run
import {walk} from 'footprint-storyreel/walk';
import {heldTime} from 'footprint-storyreel/motion';

const w = walk({from: 100, to: 900, start: 1, size: 300, style: 'bouncy'});
console.log(w.steps, 'steps; feet together at', w.arrive.toFixed(2), 's; settled at', w.end.toFixed(2), 's');
const planted = [1.8, 1.85, 1.9].map(t => w.at(t).feet.filter(f => f.lift === 0).map(f => f.x));
console.log(planted);              // the planted foot keeps its x from moment to moment
console.log(heldTime(1.01, 'twos'));   // 1: on twos a drawing is held for two frames; draw the figure at heldTime(t)
```

A hand-drawn cartoon holds each drawing for two frames while its camera moves on every frame: work out a figure's
pose from `heldTime(t)` and leave the camera and the room on `t`. `follow(body, t, {from, feel, drag})` and `lag`
make a part that hangs off a moving body (hair, a bag, a hem) swing back as it sets off and on past as it stops;
`turnaround(turn, {views})` says which drawing (front, three-quarter, side) to use as a walk's `turn` passes.

## The animator's principles

`footprint-storyreel/principles`: `anticipate(t, {at, distance})` winds back a little before a move;
`squash(t, {velocity?, landings?, axis?})` gives `{sx, sy}` that keep the volume (`sx × sy = 1`), stretched by speed
and flattened on each landing `{at, speed}`; `burst(t, events, 'flash')` is a one-shot glow, and two close events add;
`arc(from, to, u)` curves a straight path a little, as a hand moves.

## Acting: a character who thinks

`footprint-storyreel/acting`: `moodAt(keys, t)` acts a change of mood (the eyes close just before it, a take, a
cross-fade), `idleAt(t, {seed})` keeps a character alive while nothing happens, `follows(f, delay)` makes the head
follow the eyes, and `mouthAt(clock, t, who)` opens a speaker's mouth only while that speaker says a word.
`idleAt` returns `{breath, blink, sway, glance}`: `breath` a scale about 1 (±0.012: scale the body by it), `blink`
0 open … 1 shut (draw the eyes that closed), `sway` px (add it to x), `glance` −1…1 (a look aside now and then). Give
each character its own `seed`, so two never blink in step. `drawFigure` draws none of these itself: apply them to
the pose (`{...pose, x: pose.x + idle.sway}`) or to your own drawing.

```js run
import {anticipate, squash} from 'footprint-storyreel/principles';
import {idleAt, moodAt} from 'footprint-storyreel/acting';

console.log(anticipate(1.95, {at: 2, distance: 300}));              // about −22 px: a step back before it goes
console.log(squash(2, {landings: [{at: 2, speed: 1400}]}));         // {sx: 1.39, sy: 0.72}: flattened as it lands
console.log(idleAt(3, {seed: 1}).blink, idleAt(3, {seed: 2}).sway);
console.log(moodAt([{at: 0, mood: 'calm'}, {at: 2, mood: 'surprised', take: 1}], 2.1).take);
```
