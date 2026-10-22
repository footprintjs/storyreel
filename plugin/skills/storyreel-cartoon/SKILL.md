---
name: storyreel-cartoon
description: Build a cartoon film with StoryReel (footprint-storyreel) from scratch - setup, a storyboard (spoken or silent), a kit that draws the world, a walking figure, a recipe with camera moves, review, a small draft render, approval and release. Use when making a cartoon, animated short or explainer with footprint-storyreel, or adding a scene, walk or camera move to one.
---

# Build a cartoon with StoryReel

The main path as one working, silent 20.8 s film: a figure walks across a farm, a bird flies off the fence, the
camera dollies in, she waves. Each file below is complete; open a page beside this one only when a step needs more.

## 1. Set up

`mkdir farm-film && cd farm-film && npm init -y && npm i footprint-storyreel` (Node 22 or later). Write `.mjs` files
and run everything from this folder (paths are relative to it). FFmpeg is needed for step 6.

## 2. The storyboard: what happens, and when

A silent scene lists **directions**, `[what happens, seconds]`, never spoken; the recipe names one as it would a
spoken phrase (from its first word, to land at its start). A spoken scene has `"narration": "…"` ([voice.md](voice.md)).
These add up to 20 s; `evenTimings` adds a 0.8 s tail to each scene (`evenTimings(storyboard, {tail})`).

```json file=storyboard.json
{"title": "A walk on the farm", "scenes": [{"id": "farm", "title": "The farm", "silent": [
    ["morning on the farm", 2.5], ["she walks across the farm", 4], ["a bird flies off the fence", 3.5],
    ["she stops by the barn", 3], ["the camera moves in", 4], ["she waves", 3]]}]}
```

## 3. The kit: what is drawn

A story kit's `compile(spec, clock)` gets the recipe's `story` entry and returns `draw(ctx, t)`: the 1600×900 frame
at any second `t`, its times from phrases (`clock.at([scene, phrase])`), never seconds in the code. `walk` plans feet
that never slide, `drawFigure` draws a pose, `regionsAt` names what a camera can frame, `parts` lets the review check
the legs ([kits.md](kits.md#a-figure-the-pose-and-its-points)).

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
moves by name ([camera.md](camera.md)). `[scene, phrase, seconds]` lands that many seconds after the phrase starts
(`["farm", "she waves", 1.5]`). An unknown top-level key, or a phrase not in the storyboard, refuses. In a spoken scene,
key new beats to a moment written in the narration (`"… {wave}she waves"`, named `["shop", "{wave}"]`): a reworded line
keeps it on its word ([voice.md](voice.md#one-script-moments-and-speakers)). Phrases still work.

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

`timeline` gives every beat's second; `review` reads the picture as text: a summary and three verdicts (`--full` for
every finding; [checks.md](checks.md)). The same as a gate in code, failing on a finding, a failed verdict or a list:

```js run file=check.mjs
import {readFileSync} from 'node:fs';
import {compileFilm, evenTimings} from 'footprint-storyreel';
import {reviewPart} from 'footprint-storyreel/review';
import {farmKit} from './farm.mjs';
const read = file => JSON.parse(readFileSync(file, 'utf8')), storyboard = read('storyboard.json');
const film = await compileFilm({storyboard, recipe: read('recipe.json'), kits: [farmKit], timings: evenTimings(storyboard)});
const {findings, verdicts, verdictText} = await reviewPart(film);
const weak = [...film.reading, ...film.watching, ...film.listening];   // what the compile lists without refusing
console.log(verdictText, weak);
if (findings.length || verdicts.some(v => v.verdict === 'failed') || weak.length) process.exit(1);
```

Fix one finding at a time ("nothing new": no beat landed; give the kit a moment to act on, here the bird). Look at
frames last (`npx storyreel still --at farm+12`); the full loop is [storyreel-review](../storyreel-review/SKILL.md).

## 6. A small draft render

```js file=make.mjs
import {readFileSync} from 'node:fs';
import {makeFilm, evenTimings, codeFingerprint} from 'footprint-storyreel';
import {farmKit} from './farm.mjs';
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const storyboard = read('storyboard.json'), recipe = read('recipe.json');
const result = await makeFilm({storyboard, recipe, kits: [farmKit], timings: evenTimings(storyboard),
  code: codeFingerprint(['farm.mjs']),   // the kit's code and everything it imports, for the approval to lock
  out: 'out/draft/film.mp4', check: 'report', render: {width: 640, height: 360, quality: 'draft'}});
console.log(result.out, result.makingOf);      // real paths: out/draft/ holds film.mp4, making-of.json, chapters.txt
```

`node make.mjs` takes seconds; without `width`/`height` a render is 1280×720<!-- RENDER_DEFAULTS.width RENDER_DEFAULTS.height -->. With a `layout` (captions, a
platform's shape) the format sets the size and `width`/`height` refuse: a captioned draft is `render: {layout:
{format: 'landscape', captions: true, scale: 2/3}}`, 1280×720 ([release.md](release.md#one-film-every-platform)).
Render into a folder of your own: one others can write to is refused ([release.md](release.md#where-storyreel-may-write)).
Delete drafts you no longer need: films are large.

## 7. Read the record, approve, release

`making-of.json` says what played and why (`beats`, `camera`, `claims`, `finished`, each stage's narrative): read it
before guessing ([record.md](record.md)). When the person signs off the draft they watched, `approveFilm` locks what it
was made from; `makeRelease` makes each platform's version and post ([release.md](release.md)). More: [kits.md](kits.md)
· [perspective.md](perspective.md) · [motion.md](motion.md) · [camera.md](camera.md) · [voice.md](voice.md) · [music.md](music.md) · [mocap.md](mocap.md)
· [breakdown.md](breakdown.md).
