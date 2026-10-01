# Changelog

## Unreleased

- **The kit context** (`film.mjs · kitContext`): a story kit that declares `context: true` is compiled as
  `compile(spec, context)`, one frozen object `{clock, motion, theme, root, library, labels, insideRoot,
  readFile}` (`library` and `labels` are empty until a recipe carries them). `readFile(path)` loads only from
  inside the root folder (`files.mjs · insideRoot`: a sibling folder or a link out refuses). The context has
  no way to draw the film. Older kits keep `compile(spec, clock, motion)`; the speed-note rule is the same for
  both; `context` other than true/false refuses. Types: `KitContext`, `ContextKit`, `StoryWorld`;
  `compileFilm` and `makeFilm` take both kinds of kit (two signatures, so an inline kit on today's contract
  keeps its contextual types).
- **Ready** (`film.mjs · readyOf`, `readyWorlds`): a world may return `ready`, a Promise (e.g. its images
  decoding); `compileFilm` waits for every one before drawing the recipe's `recalls` and before returning. A
  `ready` that rejects refuses the film, naming the world; one that is not a Promise refuses.
- **One ease table** (`src/ease.mjs`, `footprint-storyreel/ease`): `EASES` = `linear in out inOut back walk
  jump`, `easeNamed(name, where)` (an unknown name refuses, naming the eases). `inOut` is exactly the
  whiteboard's `ease`; `kits/whiteboard/board.mjs · ease` is now that curve under its old name, and
  `film.mjs` and `notes.mjs` read it from the table. No easing changed: the pixel pins are unchanged.

- **Silent scenes with directions** (`clock.mjs · directionTimings`): a storyboard scene may carry
  `"silent": [["the door opens", 1.0], ["Mia walks to the stall", 3.0]]` in place of `narration`. The clock
  treats a direction like a spoken phrase (`["open", "the door opens"]`, with `plus`, `edge`, `nth`);
  directions are never spoken. `directionTimings(scene, {tail?})` spreads each direction's words evenly
  over its seconds (alignment method `directions`); `evenTimings` uses it for silent scenes;
  `withDirections(storyboard, timings)` fills in the silent scenes a voice left out (used by `makeFilm`,
  `paceTimings` and `applyPacing`); `speechIndex` and `makeClock` read a silent scene's directions as its
  text (`sceneText`). A scene with both `narration` and `silent`, or neither, or a direction that is not
  `[words, 0.2..20 seconds]`, refuses with the fix (`clock.mjs · checkScene`). Pacing refuses a hold in a
  silent scene, naming it; the scene's tail still applies. `applyPacing` writes a generated silence
  (`silent-<scene>.wav`, at the voice's rate) when the voice folder has no audio for a silent scene, and
  `renderFilm` generates it when there is no pacing (`render.mjs · joinVoice`; a spoken scene with no
  audio refuses). The studio's transcript marks direction words `spoken: false` and shows them dim and
  slanted. `types/index.d.ts · Storyboard` allows `silent` (`Direction`, `StoryboardScene`). Existing
  films are untouched: the pixel pins are unchanged.

- **Loudness in two passes** (`render.mjs · muxWithLoudness`): `renderFilm` measures the whole mixed film
  (`loudnorm` with `print_format=json`), then sets it with one fixed gain from what was measured
  (`measured_I/TP/LRA/thresh`, `offset`, `linear=true`), so a quiet opening is no longer raised to the
  voice's level. `renderFilm`'s result carries `loudness: {type, target, measured, reason?}` — `type` is the
  normalization type FFmpeg reports for the second pass (`linear` or `dynamic`), or `skipped` — and
  `makeFilm` writes it into `making-of.json`, with a `flag` whenever the type is not `linear`. The target
  takes an optional `LRA`.
- **A render of only a silent opening works** (the BACKLOG bug): when the measurement finds no loudness
  (pure silence, `-inf`), normalisation is skipped instead of handing the AAC encoder NaN.
- **One fixed gain is kept for a wide range** (review round): with no `LRA` set, the second pass asks for
  the measured loudness range (rounded up, 7..50; `render.mjs · effectiveTarget`) — in linear mode
  `loudnorm` reads it only as a gate, so the hello film now comes back `linear` instead of `dynamic`. A
  perfectly steady sound (range 0, FFmpeg's "not measured") is sent as 0.1 and stays linear. A skipped
  pass names its real reason (silence, or `could not read: <fields>`); a missing or killed FFmpeg fails
  with its own error instead of "is this FFmpeg built with loudnorm?". The `loudness` option is checked
  (`render.mjs · checkLoudnessTarget`): I and TP required, LRA optional, each finite and in FFmpeg's
  range; any other key refuses with the fix (`loudness.lra is not a key: use LRA …`).
- **The recipe's top level is checked** (`film.mjs · checkRecipeKeys`): `story`, `whiteboard`, `pushIn`,
  `card`, `stages`, `guesses`, `notes`, `recalls`, `poster`, `reading`, `paperStyle`; any other key
  refuses with the list and the fix. A host application names the keys it reads itself in the new
  `hostKeys` option of `compileFilm` and `makeFilm` (e.g. `hostKeys: ['terms']`); the engine ignores them.
  Every known recipe was swept first: only a glossary under `terms` needs a `hostKeys` entry.
- **Sounds are checked when the film is built**, not only after rendering: a kit sound with an unknown
  name or a gain outside 0..1 refuses, naming the kit and the sounds there are (`sound.mjs · checkSound`),
  and a scene with more than 64 sounds refuses, naming the scene. One rule says which scene a sound falls
  in (`sound.mjs · soundsByScene`), used by both `compileFilm` and `renderFilm`.
- **Five new sounds**: `door`, `step`, `click`, `whoosh`, `crumble` (original procedural synthesis, short
  and quiet). Every sound has a default gain, and a sound event may carry `gain` (0..1) that overrides it;
  `compileFilm` keeps the gain of story-kit and stage-kit sounds in `film.sounds`. A gain is relative to
  its scene (a scene is scaled by one factor set by its loudest moment). The first five sounds produce
  the same samples as before (pinned in `test/sound.test.mjs`).
- **Files stay inside `root`, for real.** The root-folder check (`files.mjs · insideRoot`) compares real
  paths with `path.relative`: a sibling folder whose name begins like the root (`../film-private/x.ts`
  with root `/x/film`, which the old prefix check let through) and a symbolic link that leads out of the
  folder are refused, with a message that names the fix.
- **`frameHashes(film, {times})`** hashes the moments you name (seconds inside the film) instead of 24
  evenly spaced ones; anything else refuses.
- **Safety pins for the motion grammar's refactors** (no film draws a different pixel):
  - a new example, `examples/recap` (a recap strip of the film's own frames and a teaser), pinned in
    `test/golden.json` — nothing pinned the teaser before;
  - behaviour pins (`test/behaviour.json`): for every example film, `film.reading`, `film.moments()` and
    the refusal a push note gets across each change of picture;
  - the restore test runs on every example film and also checks compositing, shadow, filter and a
    leaked clip (a full-frame fill must reach the corners).
  - `examples/recap` also takes a director's cut into its code stage and a `summary` stage handed over to
    on the page, whose closing line is too short to read, so the behaviour pins reach the hand-over's
    settle (`film.mjs · arrivalOf`), a zero-length change and `film.reading`; a test fails if no pinned
    film carries them.
- `frameHashes` refuses two moments that round to the same millisecond (one would be lost), and `count`
  together with `times`; a bad moment that is not a number is quoted. `insideRoot` refuses a `root` that
  does not exist with a message naming the fix.
- README: screenshots shown as evidence are in scope; marketing polish is not.
- Code is tokenized with no time limit (`kits/paper/code.mjs · tokenize`): Shiki's 500 ms per-line
  limit made a busy machine tokenize the same code differently, or throw (`startIndex` of undefined).

## 0.2.0 — first release for other projects

- **Director notes** (`recipe.notes`): `speed` (every camera move), `cut` (a scene starts on a hard cut;
  also `enter: "cut"`), `push` (the camera pushes in on a point from one phrase to another). A note the
  film cannot honour refuses; `film.notes` and the making-of record list each as applied.
- **Preview studio** (`footprint-storyreel/studio`): a local, read-only page — scrub, play with the voice,
  click a drawing to see the recipe entry (and its line) that drew it; compiles again on save.
- **What drew this spot:** `film.regionsAt(t)`, `film.pointAt(t, x, y)`, and the recipe path on every beat.
- **Reading time:** `film.reading` lists lines shown for less than about 0.3 s a word; `"reading": "refuse"`.
- **Stills:** `film.moments()` (settled pictures and changes half way) and `contactSheet(film)`.
- **A poster:** `recipe.poster` names a frame; the renderer writes `poster.jpg` and makes it the video's first frame.
- Story kits receive `motion` (`{cameraSpeed}`) and may declare `motion: ['cameraSpeed']`, `regionsAt(t)`, `texts()`.
- A push-in that would still be running when the card moves aside now refuses the recipe.
- TypeScript types. The `hello` example's push-in is quicker (0.3 s rest, 1.8 s turn) so its caption can be read.

## 0.1.0

The engine as used by the AgentFootprint video course: storyboard + recipe → one seekable film,
whiteboard / paper / cartoon kits, worlds as shots with fades, wipes, irises and page turns,
pause-and-guess, a string table, pacing for voiced and silent cuts, pixel pins, a footprintjs making-of record.
