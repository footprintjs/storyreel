---
name: storyreel
description: Start here to make a film, a cartoon or an explainer video with StoryReel (npm footprint-storyreel), films drawn in code from a storyboard and a recipe and rendered to MP4. Gives the path from storyboard to released film, and which skill or page to read for each job (build, motion, camera, music, motion from a video, checks, voice, release, review).
---

# StoryReel: films drawn in code

StoryReel (`npm i footprint-storyreel`, Node 22 or later) makes a film from two files and some drawing code.
The **storyboard** says what is said, scene by scene; a silent scene says what happens and for how long.
The **recipe** (plain JSON, never code) says what is drawn when each phrase is said or each moment comes.
A **kit** is the code that draws: the built-in `whiteboardKit` and `cartoonKit`, or a kit of your own.
Every frame is a pure function of time, so a film is checked by reading it before anything renders. Only the MP4
needs FFmpeg on the PATH.

## From storyboard to a released film

1. **Storyboard.** Scenes with `narration` (spoken), or `silent: [[what happens, seconds], …]`.
2. **Kit.** What the world looks like at any moment `t`: the built-in cartoon world, or your own story kit
   (a figure that walks is `footprint-storyreel/walk` plus `footprint-storyreel/kits/cartoon/figure`).
3. **Recipe.** Each beat names a phrase of the storyboard, never a second: `["scene", "phrase"]`. Camera moves,
   transitions and checks are recipe data too.
4. **Timings.** `evenTimings(storyboard)` for a silent film or a first draft; a voice folder (`narrationDir`) with
   word times when there is a voice.
5. **Compile and read.** `npx storyreel timeline` (when each beat lands), `npx storyreel review` (what is wrong, as
   text, and three verdicts). Fix, and review again until it says nothing found.
6. **Draft.** `npx storyreel part --scene <id>` for a quick look at a few scenes, or a small `makeFilm` render of
   the whole film.
7. **Read the record.** `making-of.json` beside the video says what played, when, and why.
8. **Approve** the draft the person watched (`approveFilm`); the final render refuses anything that changed since.
9. **Release.** `makeRelease` makes the post for each platform: the video in its shape, captions, the post text.

## Which skill or page for each job

| job | read |
|---|---|
| build a cartoon film, the main path: steps 1–9 with a walking figure | the `storyreel-cartoon` skill ([its SKILL.md](../storyreel-cartoon/SKILL.md)) |
| fix or polish a film that exists: timeline, review, part, still | the `storyreel-review` skill ([its SKILL.md](../storyreel-review/SKILL.md)) |
| write a kit: what it returns, the built-in cartoon and whiteboard kits | [kits.md](../storyreel-cartoon/kits.md) |
| motion by name: moves, eases, walks, acting, the animator's principles | [motion.md](../storyreel-cartoon/motion.md) |
| camera moves by name: dolly, pan, orbit, rack focus; one camera at a time | [camera.md](../storyreel-cartoon/camera.md) |
| music: cut on the beat, settle an unsure tempo | [music.md](../storyreel-cartoon/music.md) |
| motion copied from a phone video onto a figure | [mocap.md](../storyreel-cartoon/mocap.md) |
| the checks: slideshow, drawn parts, numbers with a source, reading time | [checks.md](../storyreel-cartoon/checks.md) |
| learn from a reference video: its cuts, shots and pacing | [breakdown.md](../storyreel-cartoon/breakdown.md) |
| a voice: word times, pacing, numbers said in words | [voice.md](../storyreel-cartoon/voice.md) |
| platforms: formats, captions, thumbnails, the post | [release.md](../storyreel-cartoon/release.md) |
| where each record is, and how to read one | [record.md](../storyreel-cartoon/record.md) |

The package README (`node_modules/footprint-storyreel/README.md`) is the full reference; the examples it ships are
in `node_modules/footprint-storyreel/examples/` (`shepherd` is the built-in cartoon world, `camera.mjs` the camera
moves, `mocap/strip.mjs` motion from a video).

## The house method: read first, look last

Every process in StoryReel with more than one step (the compile, the render pipeline, the review, the camera plan,
the beat map, motion from a video, a breakdown) is a footprintjs flowchart, and its verdicts are decided with
footprintjs's `decide()`, so its record keeps **why**: the rule that matched, the values it read, the thresholds. When something
looks wrong, read that record and the review's text before you guess, and before you look at a picture. A picture
costs many tokens and hides its times; the record and the timeline do not. Open a still last, to confirm the look.

- A refusal is a message that names the fix: read it whole. A refused compile carries `error.record`.
- A verdict says `passed`, `failed` or `not run`, each with why. `not run` checked nothing: never read it as passed.
- Never guess a time: the timeline gives every beat's second.
