---
name: storyreel
description: Start here to make a film, cartoon or explainer video with StoryReel (npm footprint-storyreel): films drawn in code from a storyboard and a recipe, rendered to MP4. Gives the path from storyboard to released film and which skill or page to read for each job (build, motion, camera, music, mocap, checks, voice, release, review).
---

# StoryReel: films drawn in code

StoryReel (`npm i footprint-storyreel`, Node 22 or later; FFmpeg on the PATH only for the MP4) makes a film from:
the **storyboard** (what is said, scene by scene; a silent scene says what happens and for how long), the **recipe**
(plain JSON: what is drawn when each phrase is said, by phrase, never by second) and a **kit** (the code that draws:
the built-in `whiteboardKit` and `cartoonKit`, or your own). Every frame is a pure function of time, so a film is
checked by reading it before anything renders.

## The path

storyboard → kit → recipe → timings (`evenTimings(storyboard)`, or a voice folder) → `npx storyreel timeline` and
`npx storyreel review` until it says nothing found → a draft (`npx storyreel part --scene <id>`, or a small `makeFilm`)
→ read `making-of.json` → `approveFilm` the draft the person watched (the final render refuses when anything it was
made from changed) → `makeRelease` for each platform. The `storyreel-cartoon` skill walks it with a working film.

## The edit loop

- Look at an edit with `npx storyreel part --scene <id>` (seconds; never cached).
- A full render redraws only the pieces an edit reached: `picture.line` in `making-of.json` says which, and why.
- Keep the stamp's label steady: a new label re-encodes the join (no redraw).
- `render: {whole: true}` only to debug the cache.

## Which skill or page for each job

| job | read |
|---|---|
| build a cartoon film, the main path, with a walking figure | the `storyreel-cartoon` skill ([its SKILL.md](../storyreel-cartoon/SKILL.md)) |
| fix or polish a film that exists: timeline, review, part, still | the `storyreel-review` skill ([its SKILL.md](../storyreel-review/SKILL.md)) |
| write a kit: what it returns, the built-in cartoon and whiteboard kits | [kits.md](../storyreel-cartoon/kits.md) |
| motion by name: moves, eases, walks, acting, the animator's principles | [motion.md](../storyreel-cartoon/motion.md) |
| camera moves by name: dolly, pan, orbit, rack focus; one camera at a time | [camera.md](../storyreel-cartoon/camera.md) |
| cut between shots: a transition by name and what each one means (`torn`: leave the old page behind) | the package README, section Transitions: the catalog, `footprint-storyreel/transitions` · `TRANSITION_NAMES` |
| the person picks a transition or a word move by eye; apply the lines they kept (`scene-05 enter torn`) | `npx storyreel studio` (its gallery), then `npx storyreel apply "<line>" …`: no recipe to read; the package README, section Pick a move by eye |
| music: cut on the beat, settle an unsure tempo | [music.md](../storyreel-cartoon/music.md) |
| a recorded sound effect (`npx storyreel sounds search`) | the package README, section Found sounds |
| motion copied from a phone video onto a figure | [mocap.md](../storyreel-cartoon/mocap.md) |
| the checks: slideshow, drawn parts, numbers with a source, reading time | [checks.md](../storyreel-cartoon/checks.md) |
| learn from a reference video: its cuts, shots and pacing | [breakdown.md](../storyreel-cartoon/breakdown.md) |
| a voice: word times, pacing, numbers said in words | [voice.md](../storyreel-cartoon/voice.md) |
| approval, platforms: formats, captions, thumbnails, the post | [release.md](../storyreel-cartoon/release.md) |
| where each record is, and how to read one | [record.md](../storyreel-cartoon/record.md) |

The package README (`node_modules/footprint-storyreel/README.md`) is the full reference; read the section you need,
not all of it. Its examples are in `node_modules/footprint-storyreel/examples/` (`shepherd`: the cartoon world).

## Read first, look last

Every multi-step process in StoryReel (the compile, the render, the review, the camera plan, the beat map) is a
footprintjs flowchart whose record keeps **why**: the rule that matched and the values it read. Read that record, the
timeline and the review before you guess, and before you look at a picture: a picture costs many tokens and hides
its times. Open a still last, to confirm the look.

- A refusal names the fix: read it whole. A compile with `record: true` that refuses carries `error.record`.
- A verdict says `passed`, `failed` or `not run`. `not run` checked nothing: never read it as passed.
- The tools print a summary; `--full` prints every finding. `npx storyreel <command> --help` gives its flags.
