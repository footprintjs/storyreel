# Kits: the code that draws

The recipe is data and never runs; a **kit** is the code that draws what the recipe names. Keeping the two apart is
what lets the same recipe be checked, re-timed to a new voice, and reviewed as text: the kit only answers "what does
the world look like at second `t`".

## Three ways a kit draws

- **The story** (`recipe.story`, `{"kit": "<name>", …}`): one continuous world for the scenes before the first stage.
- **A world shot** (a stage `{"type": "world", "scene": "<id>", "enter": …, "world": {"kit": "<name>", …}}`): a kit
  drawn full screen for its scene, entering by a transition (`fade` when left out; `cut`, `wipe`, `iris`, `push`,
  `whip`, `zoom`, `page`, `through`, `match` …, or a move: `{"move": "soft-rise"}`). Every recipe still has a
  `story`: when the first scene is already a stage, give it an empty board, `{"kit": "whiteboard", "items": []}`.
- **A stage kit** adds a stage type of its own (`{name, stages: {loop: {keys, compile, draw}}}`); see the package
  README, section "Kits".

Pass every kit the film uses: `compileFilm({…, kits: [myKit, cartoonKit]})` (and the same to `makeFilm`). The built-in
`whiteboard` kit needs no passing.

```js run
import assert from 'node:assert/strict';
import {compileFilm, evenTimings, cartoonKit} from 'footprint-storyreel';

// A story kit of your own: a sunrise. compile() runs once; draw(ctx, t) draws any moment.
const sunrise = {name: 'sunrise', story: {compile(spec, clock) {
  const up = clock.at(spec.rise);                                   // a phrase → its second
  return {hang: 1, draw(ctx, t) {
    const u = Math.min(1, Math.max(0, (t - up) / 3));
    ctx.fillStyle = '#ffd9a0'; ctx.fillRect(0, 0, 1600, 900);
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(800, 700 - 300 * u, 90, 0, 7); ctx.fill();
    ctx.fillStyle = '#6aa84f'; ctx.fillRect(0, 650, 1600, 250);
  }};
}}};

const storyboard = {title: 'Morning', scenes: [
  {id: 'dawn', silent: [['the sun comes up', 4], ['a new day', 2]]},
  {id: 'field', narration: 'A shepherd had sheep. Each morning a sheep went out through the gate.'}]};
const recipe = {
  story: {kit: 'sunrise', rise: ['dawn', 'the sun comes up']},
  stages: [{type: 'world', scene: 'field', enter: {type: 'iris', at: [800, 600]},
    world: {kit: 'cartoon', flock: {count: 3, out: {at: ['field', 'a sheep went out'], every: 1.2}, home: {at: ['field', 'through the gate'], every: 1.2}}}}]};
const film = await compileFilm({storyboard, recipe, kits: [sunrise, cartoonKit], timings: evenTimings(storyboard)});
assert.deepEqual(film.shots.map(s => `${s.where}: ${s.from}–${s.to} s`), ['the story: 0–6.8 s', 'stage field: 6.8–12.84 s']);
assert.deepEqual(film.regionsAt(9).map(r => r.name).filter(Boolean), ['sun', 'shepherd', 'sack', 'pen', 'gate']);   // what a camera can frame
```

## What a story kit's compile returns

`compile(spec, clock, motion)` runs once per film: `spec` is the recipe entry (its keys besides `kit` are yours),
`clock.at([scene, phrase, plus?])` turns a phrase into seconds (an unknown phrase refuses, naming it). It returns:

| key | what it is for |
|---|---|
| `hang` | 1 fills the frame; 0.9 hangs it like a board on paper |
| `draw(ctx, t, spot)` | the world at second `t`, on a 1600×900 sheet. Required |
| `regionsAt(t)` | `[{box: [x0, y0, x1, y1], path, label, name?}]`: what is where, on the 1600×900 sheet. `path` says what drew it, relative to the kit's recipe entry (a click in the studio shows `story.<path>`); `label` is words for a person; a `name` is what a camera move, a push note, a focus or a `through`/`match` transition can frame |
| `parts(t)` | `{segments, regions?, apart?}`: the numbers the drawing is made from, so the review checks they hold together ([checks.md](checks.md#drawn-parts-hold-together)) |
| `texts()` | `[{text, from, to, gone?, path}]`: words it draws, for the reading-time check; its lines are claims too (a number in one needs a source), and `gone` (when a line's last ink goes, as an eraser ends) keeps an example scene's label up until then |
| `sounds` | `[{time, type, gain?}]`: `tap`, `slide`, `settle`, `question`, `chime`, `door`, `step`, `click`, `whoosh`, `crumble` |
| `layers`, `drawLayer(ctx, t, name, spot)` | depth, back to front, for orbit, dolly-zoom and rack-focus ([camera.md](camera.md#depth-layers)) |
| `cameraMoves` | `[{from, to}]`: seconds when the kit moves its own camera, so recipe camera moves take turns with it |
| `spotAt(t)` | a spotlight `{cx, cy, r, zoom, w}`, or null |
| `mouthsAt(t)` | `[{who, open}]`: mouths on screen, for the lip-sync check |
| `ready` | a Promise that settles once it can draw (images decoded) |

Declare `motion: ['cameraSpeed']` beside `compile` when the kit's own camera moves follow a director's speed note,
and `context: true` to be compiled as `compile(spec, {clock, motion, theme, root, readFile, insideRoot, …})`;
`readFile` loads files only from inside the film's root folder.

Words a kit draws that claim nothing (line numbers, a step counter) go inside `footprint-storyreel/decorative` ·
`decorative`, and code inside `code`, so the numbers check reads them rightly ([checks.md](checks.md#every-number-has-a-source)).

## The laws a kit keeps

- **A pure function of time.** `draw(ctx, t)` draws any moment in any order the same way: no state carried from
  the frame before, no `Date.now()`, no random numbers without a fixed seed. Work everything out in `compile`.
- **Times from phrases.** A second written in the code drifts when the voice changes; `clock.at` does not.
- **Leave the canvas as you found it.** `ctx.save()` and `ctx.restore()` around any transform, alpha, shadow,
  filter or clip.
- **Motion that holds still reads as a slideshow.** Keep something alive in every shot (a cloud, a blink, an idle
  breath: `idleAt` in [motion.md](motion.md#acting-a-character-who-thinks)).

## The built-in cartoon world

`cartoonKit` draws a shepherd, his sheep, a stone pen and a gate, hills and a sky that turns to evening. Its spec
(every time a phrase): `flock: {count, missing?, out: {at, every}, home: {at, every}}` (required), `evening`,
`eureka: {at, text?}`, `spots: [{from, to, at: [x, y], r, zoom}]`, `captions: [{at, until, text}]`, and its own
camera keys `camera: [{at, to: [x, y], zoom}]` (inside `story`; the recipe's top-level `camera` list is the
camera moves of [camera.md](camera.md)). It names `sun`, `shepherd`, `sack`, `pen`, `gate` and, after the eureka,
`bulb`, and gives its parts (the shepherd's arms and staff, each sheep's legs). The complete example is
`node_modules/footprint-storyreel/examples/shepherd/` (`make.mjs`, `storyboard.json`, `recipe.json`).

## A figure: the pose and its points

`footprint-storyreel/kits/cartoon/figure` · `drawFigure(ctx, pose, {floor, size, colors?})` draws a round-headed figure
from a **pose**, standing on `floor` (its y, px), `size` px tall; `colors` overrides `FIGURE_COLORS` (`skin`, `shirt`,
`legs`, `shoes`, `ink`). A pose comes from a planned walk (`footprint-storyreel/pose` · `walkSource`), from a video
([mocap.md](mocap.md)), or from your own code; the main path's `farm.mjs` ([SKILL.md](SKILL.md)) is a whole kit.

- **The pose** (`footprint-storyreel/pose` · `POSE_KEYS`): `x` (the body's place on the floor, px), `lift` (px up from
  standing; − sinks), `lean` (radians, + toward the way it faces), `feet: [{x, lift, angle}, {x, lift, angle}]` (a foot
  with `lift` 0 is on the floor; `angle` is its roll, + toes up), `swing` (the arms' swing, −1…1), `turn` (0 facing
  us … 1 turned along the way), `facing` (1 walks toward +x, −1 toward −x), `walking`, `phase`. `checkPose(pose)`
  names every key a pose gets wrong.
- **`joints`** (optional): `{torso?, neck?, arms?: [{shoulder, elbow}, {shoulder, elbow}], legs?}`, in radians from
  hanging straight down, + forward (the way it faces); `arms[j]` is on `feet[j]`'s side. `drawFigure` bends the arms and
  the neck by them; the legs are always solved to reach the feet. Without `arms`, an arm swings with the walk: shoulder
  ±0.5 × `swing`, elbow 0.25 (its rest bend). Start a gesture from those values, or it pops. The bones, in torso
  lengths (`unit`): upper arm 0.55, forearm 0.5, thigh and shin 0.85 each, neck 0.2, head radius 0.32; so a hand is at
  most 1.05 units from the shoulder. There is no helper that puts a hand at a point: work out the two angles, or try
  values and read `figureAt(...).hands` back.
- **`turn` is not `facing`.** A walk turns to go (`turn` 1) and back to us once it settles (`turn` 0), but `facing`
  keeps its sign: the figure is still drawn side-on toward `facing`, and "forward" for every joint is that way. `turn`
  moves only the eye.
- **The points** (`figureAt(pose, {floor, size})`, px on the sheet): `hip`, `shoulder`, `head` (`{x, y, r}`), and per
  side `knees`, `feet`, `elbows`, `hands` (two each, `[j]` on `feet[j]`'s side); `near` is the side drawn in front,
  `unit` one torso length in px (0.3<!-- TORSO_SHARE --> of `size`). Use them for `regionsAt`, `parts`, and anything drawn on the figure
  (a hat at `head`, a bag at `hands[near]`), from the same pose `draw` uses.

```js run
import assert from 'node:assert/strict';
import {walk} from 'footprint-storyreel/walk';
import {walkSource, checkPose} from 'footprint-storyreel/pose';
import {figureAt, FIGURE_COLORS} from 'footprint-storyreel/kits/cartoon/figure';

const her = walkSource(walk({from: 150, to: 1100, start: 0, size: 300}));
const pose = her.poseAt(2), p = figureAt(pose, {floor: 760, size: 300});
checkPose(pose);                                       // a pose of your own: it throws, naming each key that is wrong
assert.equal(p.unit, 90);                                     // one torso length: 0.3 of size
assert.deepEqual(Object.keys(p), ['hip', 'shoulder', 'head', 'knees', 'feet', 'elbows', 'hands', 'near', 'unit']);
assert.equal(p.near, 1);                                      // walking toward +x, feet[1]'s side is drawn in front
assert.equal(p.feet[0].y, 760 - pose.feet[0].lift);           // a foot is where the pose puts it: a hat goes on p.head
assert.deepEqual(Object.keys(FIGURE_COLORS), ['skin', 'shirt', 'legs', 'shoes', 'ink']);
```

## The whiteboard

`{"story": {"kit": "whiteboard", "items": [{"at": ["story", "a shepherd"], "dur": 1.2, "draw": [["figure", 300, 620, 1.1]]}]}}`:
marker drawings stroke by stroke (`figure`, `robot`, `rect`, `line`, `ellipse`, `bubble`, `tick`, `arrow`, `poly`),
handwriting (`write`), a eureka, erasers and spotlights. `node_modules/footprint-storyreel/examples/hello/` is the
smallest whole film with it.
