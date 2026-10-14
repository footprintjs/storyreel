---
name: storyreel-cartoon
description: Build a cartoon film with StoryReel (footprint-storyreel) from scratch - project setup, a storyboard (spoken or silent), a kit that draws the world, a figure that walks, a recipe with camera moves, review checks, a small draft render, approval and release. Use when making a cartoon, an animated short or an explainer with footprint-storyreel, or adding a scene, a walk or a camera move to one.
---

# Build a cartoon with StoryReel

The main path as one working, silent 20.8 s film: a figure walks across a farm, a bird flies off the fence, the
camera dollies in, she waves. Each file below is complete. Open the pages beside this file only when a step needs more.

## 1. Set up

`mkdir farm-film && cd farm-film && npm init -y && npm i footprint-storyreel` (Node 22 or later). Write `.mjs` files,
and run every script and command from this folder: they read and write relative to it. FFmpeg is needed for step 6.

## 2. The storyboard: what happens, and when

A silent scene lists **directions**, `[what happens, seconds]`; the recipe names a direction exactly as it would a
spoken phrase (its words are spread evenly over its seconds, so name it from its first word to land at its start),
and a direction is never spoken. A spoken scene has `"narration": "…"` instead ([voice.md](voice.md)). These add up to
20 s; `evenTimings` adds a 0.8 s tail to each scene (`evenTimings(storyboard, {tail})`).

```json file=storyboard.json
{"title": "A walk on the farm", "scenes": [{"id": "farm", "title": "The farm", "silent": [
    ["morning on the farm", 2.5], ["she walks across the farm", 4], ["a bird flies off the fence", 3.5],
    ["she stops by the barn", 3], ["the camera moves in", 4], ["she waves", 3]]}]}
```

## 3. The kit: what is drawn

A story kit's `compile(spec, clock)` gets the recipe's `story` entry and returns `draw(ctx, t)`: the whole 1600×900
frame at any second `t`. Times come from phrases (`clock.at([scene, phrase])`), never from seconds in the code. `walk`
plans feet that never slide, `drawFigure` draws any pose, `regionsAt` names what a camera can frame, `parts` lets the
review check the legs. The pose, `joints` and `figureAt`'s points: [kits.md](kits.md#a-figure-the-pose-and-its-points).

```js file=farm.mjs
import {walk, WALKS} from 'footprint-storyreel/walk';
import {walkSource} from 'footprint-storyreel/pose';
import {drawFigure, figureAt} from 'footprint-storyreel/kits/cartoon/figure';
const FLOOR = 760, SIZE = 300, STYLE = 'stroll';   // where her feet stand (y, px), her height (px), her walk

function compile(spec, clock) {
  const start = clock.at(spec.walk), stop = clock.at(spec.stop), bird = clock.at(spec.bird), wave = clock.at(spec.wave);
  // Her feet come together at `stop`: the stepping gets what is left after the style's set-off (its anticipation).
  const plan = walk({from: 150, to: 1100, start, size: SIZE, style: STYLE, seconds: stop - start - WALKS[STYLE].anticipate});
  const her = walkSource(plan), near = plan.facing === 1 ? 1 : 0;   // the arm on the camera's side (figureAt's `near`)
  // ONE pose for draw, regionsAt and parts, so the camera frames and the review checks what is drawn. The arms swing
  // with the walk; from the wave on, joints raise the near arm (radians from hanging, + forward; the elbow rests at 0.25).
  const poseAt = t => {
    const pose = her.poseAt(t), u = Math.min(1, (t - wave) / .4), arms = [{shoulder: 0, elbow: .25}, {shoulder: 0, elbow: .25}];
    arms[near] = {shoulder: 2.6 * u, elbow: .25 + .3 * u * Math.sin(12 * (t - wave))};
    return u <= 0 ? pose : {...pose, joints: {arms}};
  };
  const at = t => figureAt(poseAt(t), {floor: FLOOR, size: SIZE});   // the points she is drawn through
  return {
    hang: 1,                                                       // the world fills the frame
    draw(ctx, t) {
      ctx.fillStyle = '#9fd8ff'; ctx.fillRect(0, 0, 1600, 900); ctx.fillStyle = '#7fcb62'; ctx.fillRect(0, 560, 1600, 340);   // sky, grass
      const cx = (200 + 12 * t) % 1800 - 100;                      // a cloud that drifts: the picture never freezes
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, 150, 40, 0, 7); ctx.arc(cx + 50, 140, 50, 0, 7); ctx.fill();
      ctx.fillStyle = '#a0683f'; ctx.fillRect(1250, 420, 220, 200);  // the barn
      ctx.fillStyle = '#5b4636'; for (let x = 60; x < 1560; x += 90) ctx.fillRect(x, 640, 14, 90);   // fence posts
      const u = Math.max(0, t - bird);                             // the bird leaves the fence as she passes
      ctx.fillStyle = '#2e2c38'; ctx.beginPath(); ctx.arc(700 + 260 * u, 630 - 180 * u, 12, 0, 7); ctx.fill();
      drawFigure(ctx, poseAt(t), {floor: FLOOR, size: SIZE});
    },
    regionsAt(t) {                                // by name: "on": "walker" frames her; path: the spec key that moves her
      const p = at(t), xs = [p.head.x, ...p.feet.map(f => f.x), ...p.hands.map(h => h.x)], top = Math.min(p.head.y - p.head.r, ...p.hands.map(h => h.y));
      return [{box: [Math.min(...xs) - 30, top - 10, Math.max(...xs) + 30, FLOOR + 10], path: 'walk', label: 'the walker', name: 'walker'}];
    },
    parts(t) {                                                     // her legs: a foot on the floor (lift 0) must not slide
      const pose = poseAt(t), p = at(t), segments = {};
      p.feet.forEach((foot, j) => {
        segments[`thigh ${j + 1}`] = {a: [p.hip.x, p.hip.y], b: [p.knees[j].x, p.knees[j].y]};
        segments[`shin ${j + 1}`] = {a: [p.knees[j].x, p.knees[j].y], b: [foot.x, foot.y], mount: `thigh ${j + 1}`, contact: pose.feet[j].lift === 0 ? 'b' : false};
      });
      return {segments};
    },
  };
}
export const farmKit = {name: 'farm', story: {compile}};
```

## 4. The recipe: when, by phrase

`story.kit` names the kit; the other `story` keys are the kit's own (here, the phrases it acts on). `camera` lists
moves by name ([camera.md](camera.md)). An unknown top-level key, or a phrase not in the storyboard, refuses.

```json file=recipe.json
{"story": {"kit": "farm",
   "walk": ["farm", "she walks across the farm"], "bird": ["farm", "a bird flies off the fence"],
   "stop": ["farm", "she stops by the barn"], "wave": ["farm", "she waves"]},
 "camera": [{"move": "dolly-in", "at": ["farm", "the camera moves in"], "on": "walker", "amount": 1.6}]}
```

## 5. Check it before anything renders

The command line reads the film named in `storyreel.config.mjs`:

```js file=storyreel.config.mjs
import {readFileSync} from 'node:fs';
import {farmKit} from './farm.mjs';
const read = file => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
export default {film: () => ({storyboard: read('./storyboard.json'), recipe: read('./recipe.json'), kits: [farmKit]})};
```

```sh run
npx storyreel timeline
npx storyreel review
```

`timeline` gives every beat's second; `review` reads the picture as text and gives three verdicts
([checks.md](checks.md)). The same in code, as a gate that fails on a finding, a failed verdict or a compile list:

```js run file=check.mjs
import {readFileSync} from 'node:fs';
import {compileFilm, evenTimings} from 'footprint-storyreel';
import {reviewPart} from 'footprint-storyreel/review';
import {farmKit} from './farm.mjs';
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const storyboard = read('storyboard.json'), recipe = read('recipe.json');
const film = await compileFilm({storyboard, recipe, kits: [farmKit], timings: evenTimings(storyboard)});
const review = await reviewPart(film);
const weak = [...film.reading, ...film.watching, ...film.listening];   // what the compile lists without refusing
console.log(`${film.total} s`, review.text || 'nothing found', `\n${review.verdictText}`, weak);
if (review.findings.length || review.verdicts.some(v => v.verdict === 'failed') || weak.length) process.exit(1);
```

Fix one finding at a time. "Nothing new for 5 s" means no beat landed for 5 s: give the kit or the recipe a moment
to act on (here, the bird). Look at frames last (`npx storyreel still --at farm+12`); the full loop is the
`storyreel-review` skill ([its SKILL.md](../storyreel-review/SKILL.md)).

## 6. A small draft render

```js file=make.mjs
import {readFileSync} from 'node:fs';
import {makeFilm, evenTimings, codeFingerprint} from 'footprint-storyreel';
import {farmKit} from './farm.mjs';
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const storyboard = read('storyboard.json'), recipe = read('recipe.json');
const result = await makeFilm({storyboard, recipe, kits: [farmKit], timings: evenTimings(storyboard),
  code: codeFingerprint(['farm.mjs']),   // every file that draws (it follows no imports: name each, or a folder)
  out: 'out/draft/film.mp4', check: 'report', render: {width: 640, height: 360, quality: 'draft'}});
console.log(result.out, result.makingOf);      // out/draft/: film.mp4, making-of.json, chapters.txt
```

`node make.mjs` takes seconds. Without `width`/`height` a render is 1280×720<!-- RENDER_DEFAULTS.width RENDER_DEFAULTS.height -->. Give each render its own folder, and
delete drafts you no longer need: films are large.

## 7. Read the record, approve, release

`making-of.json` says what played and why (`beats`, `camera`, `claims`, `finished`, each stage's narrative): read it
before guessing ([record.md](record.md)). When the person signs off the draft they watched, `approveFilm` locks what it
was made from; `makeRelease` makes each platform's version and post ([release.md](release.md)).

## Where to go next

[kits.md](kits.md) (the cartoon world, the whiteboard, the figure) · [motion.md](motion.md) · [camera.md](camera.md) ·
[voice.md](voice.md) · [music.md](music.md) · [mocap.md](mocap.md) (a figure moved by a phone video) · [checks.md](checks.md)
· [breakdown.md](breakdown.md) (match a reference video) · [release.md](release.md) · [record.md](record.md).
