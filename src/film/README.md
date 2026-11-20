# film — the compile, stage by stage

`compileFilm` (src/film.mjs) turns a storyboard, its paced timings and a recipe into one film: `frame(ctx, t)` draws
it at any second, and the film carries everything the checks, the render and the record read.

**Why stages.** The compile was one function of about 1,050 lines, and StoryReel builds its features as footprintjs
flowcharts (the run's record is the debug log). Each module here is one stage: a function that takes the one `state`
object the stages before it filled and adds its own named results to it. No stage reaches into another's locals;
every value a later stage needs is on `state`, by name. `src/film.mjs` only runs them in order, and yields the five
record segments (record.mjs · COMPILE_STAGES) between them, so wiring a real chart is a one-file job.

A function a stage adds (`frame`, `regionsAt`, `named` …) may read a value a later stage adds (`camerawork`,
`pushes`, `attention`, `labels`) from `state` when it is called, never when it is made: the drawing is made before the
camera is placed, and draws with it. Each module's head comment says what its stage reads and writes.

## The stages, in the order they run

| file | one job |
|---|---|
| `options.mjs` | the options checked; cast and strings put into the text; the director's rules and notes read |
| `clock.mjs` | the film's clock, logging every phrase it resolves (anchors: 'note' notes and stands in) |
| `sources.mjs` | the theme, the files under the root (hashed as read), facts, example scenes, differs, rubric, pace |
| `kits.mjs` | the story and stage kits by name, the transitions, and how a world is built and hung |
| `direct.mjs` | the director's keys landed in the worlds before they are built |
| *segment `read-inputs`* | |
| `story.mjs` | the story world, and the push-in's card, timing and geometry |
| `stages.mjs` | every stage read, checked and put on the clock (code tokenized, worlds built) |
| `card.mjs` | where the card goes once the stages start; the push-in done before it moves |
| `plan.mjs` | the plan of the shots: intent, continuity, reads, the five scene questions |
| *segment `build-worlds-and-stages`* | |
| `shots.mjs` | the director's cuts, and the film as a row of shots with their entrances |
| `guesses.mjs` | pause and guess: each question checked against its pause and scene |
| `steps-track.mjs` | the steps track and its rewind cue |
| `page.mjs` | the blank paper, the recalls, what the page and each stage show at t |
| `teaser.mjs` | the recap's teaser for the next film |
| `world-drawing.mjs` | how a world is drawn: sheet, cloud, spotlight, push-in, depth layers |
| `picture.mjs` | the whole frame at t: `frame(ctx, t)` |
| `labels.mjs` | the example label and the labels on how a scene differs |
| `changes.mjs` | where the picture changes, and what else moves the camera |
| `regions.mjs` | what is drawn where, the world on screen, and the one thing called a name |
| `probes.mjs` | mouths, parts and points at t, for the checks, without drawing |
| `entrances.mjs` | every world ready, then the boxes an entrance goes through |
| `camera.mjs` | the director's focus framing, the pushes, attention and the camera's moves |
| `notes-applied.mjs` | the director's notes as applied, for the record |
| *segment `guesses-and-notes`* | |
| `watching.mjs` | watching time: too much, too fast; the shots as planned |
| `reading.mjs` | every line the film shows, the labels' spans, reading time and the reads |
| `sounds.mjs` | the sound design, the found sounds checked, the listening check |
| `moments.mjs` | the moments worth a still, and the film as rows of pictures |
| `stills.mjs` | the poster and the recall images (the first drawing of the film) |
| *segments `checks` and `resolve-lines`* | |
| `inputs.mjs` | what the film was made from, hashed, and each string's hash |
| `claims.mjs` | every number and claim in words the film shows, with what backs it |
| `result.mjs` | the film as handed back, every field in its order |

## Helpers (no state of their own)

| file | one job |
|---|---|
| `keys.mjs` | the keys a recipe, a stage, a world stage and a guess may carry; the recipe key check |
| `util.mjs` | the hand-over ramp, aiming a canvas, recipe paths, data values, deep freeze, names given once |
| `summaries.mjs` | what each record segment reports (record.mjs · step) |
