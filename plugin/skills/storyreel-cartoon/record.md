# The records: read first, look last

Every process in StoryReel with more than one step is a footprintjs flowchart, and its verdicts are decided with
`decide()`, so each run keeps a record of what it did and **why**: the rule that matched, the values it read, the
thresholds it compared them with. Reading that record is the house method. It is cheaper and surer than looking at
frames: a picture costs many tokens and hides its times, and a guess about why a camera cut or a check failed is
usually wrong. Read the record and the review's text first; open a still only to confirm what they told you.

## Where each record is

| you ran | its record | what to read there |
|---|---|---|
| `makeFilm` | `making-of.json` beside the video | key by key below |
| `compileFilm({…, record: true})` | `film.record` = `{narrative, snapshot}` | the compile stage by stage: read inputs, build worlds and stages, guesses and notes, checks, resolve lines |
| a refused compile | `error.record` (with `record: true`) | the narrative up to the stage that refused, ending in its `error` entry |
| any `compileFilm` | `film.camera`, `film.claims`, `film.reading`, `film.watching`, `film.shots`, `film.beats` | each camera move as played and the reduced-motion `decision`; every number and its source; lines too short to read; bursts; each shot; each phrase and the entry that asked for it (`path`) |
| `reviewPart` / `npx storyreel review` | `review.verdicts`, `review.record`, `review.ran` | each verdict with `why` and `measured`; the review's narrative, its `decide()` conditions; which checks ran |
| `beatMap` / `npx storyreel beats` | `map.record`, `map.levels` | why the tempo is sure or not; every level tried and the tests it failed |
| `fromPose` | `source.record` | each foot contact, each gap, the facing, the loop, each with `why` |
| `breakdown` / `npx storyreel breakdown` | `record.json`, `spec.shots[i].motion.why` | every candidate cut and shot decided, with its measures |

## making-of.json, key by key

| key | what it holds |
|---|---|
| `schemaVersion`, `made`, `out`, `seconds`, `span` | the record's version, when it was made, the video, its length, and the stretch of the film it shows (`span.whole` is false for a part) |
| `inputs` | what the film was made from, each hashed, and what draws it (`storyreel`, `engine`, `footprintjs`): what an approval locks ([release.md](release.md#approve-the-film-that-was-watched)) |
| `pacing`, `chapters` | the pacing as applied; one chapter per titled scene |
| `beats` | each phrase said (`said`), when (`at`), and the recipe entry it triggered (`entry`) |
| `claims` | the numbers on screen, the verdict and why (declared lines only; the review also reads what the picture draws) |
| `sounds`, `loudness` | how many sound effects the film has (a count); the loudness as measured and set (`type: 'skipped'` with a reason for a silent film) |
| `tools` | the tools and versions it was made with |
| `pipeline`, `compile` | the render pipeline's narrative and the compile's, stage by stage |
| `code` (only when `code` is given) | the kit's code fingerprint and what it covered: `fingerprint`; `files` (every file hashed, relative to the film's root); `packages` (each installed package it imports, `name@version`); `missing` (a relative import or a literal asset that leads nowhere: `file: spec`); `unfollowed` (an import or asset chosen at run time, which no reader can follow: name its folder in `codeFingerprint`, with `extensions` for files that are not code, JSON, fonts or images); `unparsed` (a module read only up to the line where it was lost, ending inside a comment, string, template or regex). A fingerprint made in another process says its files are not listed |
| `camera` (only when the recipe has camera moves) | each move as played (`played`, `ends`; `covers` only when it scaled the picture up to keep the frame covered; `lasts`: until when its framing holds, null to the film's end) and the reduced-motion `decision` |
| `finished` (only with `check`) | the checks on the MP4 itself: `checked`, `findings`, and `skipped` with why (voice, lip sync and captions need a voice or a caption file to compare) |
| only when used | `notes` (director's notes as applied), `strings` (the language and the keys used), `reading` (lines too short to read), `poster` (its file and second), `listening` (the sound's findings), `narration` (the voice placed on a second try), `music` (a song), `voice` (a voice folder's word check), `picture` (a segmented render: each segment drawn or reused, and why), `approval` (rendered under one), `swept` (folders a stopped render left, removed), `version` (a layout, motion blur, caption files or `soundAt: 'peak'`) |

A silent film's MP4 still has a sound track: silence, plus any sound effects the kits make.

## Reading a narrative

A narrative is a list of entries `{type, text, stageName, …}`: `stage` (a stage began), `step` (a value read or
written), `condition` (a decision, with the rule, the values and the thresholds), `error` (where it stopped). Filter it
rather than reading it all: the decisions are `type === 'condition'`, a failure is the last entry.

```js run
import assert from 'node:assert/strict';
import {compileFilm, evenTimings} from 'footprint-storyreel';
import {reviewPart} from 'footprint-storyreel/review';

const field = {name: 'field', story: {compile: (spec, clock) => ({hang: 1,
  draw: (ctx, t) => { ctx.fillStyle = '#7fcb62'; ctx.fillRect(0, 0, 1600, 900); ctx.fillStyle = '#e2574c'; ctx.fillRect(200 + 60 * t, 500, 120, 200); },
  regionsAt: t => [{box: [200 + 60 * t, 500, 320 + 60 * t, 700], path: 'story', label: 'the box', name: 'box'}]})}};
const storyboard = {scenes: [{id: 'field', silent: [['a box slides along', 3], ['the camera moves in', 3]]}]};
const recipe = {story: {kit: 'field'}, camera: [{move: 'dolly-in', at: ['field', 'the camera moves in'], on: 'box'}]};

const film = await compileFilm({storyboard, recipe, kits: [field], timings: evenTimings(storyboard), record: true});
assert.deepEqual(film.record.narrative.filter(e => e.type === 'stage').map(e => e.text.replace(/^Stage \d+: [^.]*?(with|to) /, '')),
  ['read inputs.', 'build worlds and stages.', 'guesses and notes.', 'checks.', 'resolve lines.']);   // the compile, stage by stage
assert.equal(film.camera.decision.chosen, 'moves');                                  // the reduced-motion decision
assert.deepEqual(film.camera.moves.map(m => `${m.path} ${m.move}: ${m.played}`), ['camera[0] dolly-in: move']);
assert.deepEqual(film.beats.map(b => `${b.t} s ${b.ref[1]} → ${b.path}`), ['3 s the camera moves in → camera[0].at']);   // who asked

const review = await reviewPart(film);
assert.match(review.record.filter(e => e.type === 'condition')[0].text, /^\[Condition\]: .*slideshow\/passed\.$/);   // a verdict, with its rule

const wrong = {...recipe, camera: [{...recipe.camera[0], on: 'sheep'}]};   // a refusal names the fix, and its record ends where it stopped
await assert.rejects(compileFilm({storyboard, recipe: wrong, kits: [field], timings: evenTimings(storyboard), record: true}), error => {
  assert.equal(error.message, 'camera[0] (dolly-in on "sheep"): nothing in the picture is called "sheep" at 3.00 s; the names there are box');
  assert.match(error.record.narrative.at(-1).text, /^\[Error\]: An error occurred at guesses and notes/);
  return true;
});
```

## Rules for reading

- A time comes from the record or the timeline (`npx storyreel timeline`), never from a guess.
- A verdict's `why` is the decision; `measured` holds the values it read. `not run` checked nothing.
- A refusal's message names what to change; fix that, not something near it.
- When a record and a picture disagree, trust the record and report the disagreement: it is a bug in a kit or in
  StoryReel, worth a short note with the record's lines.
