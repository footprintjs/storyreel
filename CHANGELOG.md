# Changelog

## 0.4.0 — re-render only what changed; approve a film; acting, match cuts and held layers; checks on the finished file

### Who says each word
- **A word's own `speaker`** in the timings (written by a voice step that knows who said what) wins over the scene's:
  `clock.speaking(t)`, `clock.turns()` (now one turn per run of words by one speaker), `gaze` and `mouthAt` follow
  it, so the narrator and the characters can take turns inside one scene. A word with no speaker is the scene's
  speaker, or the narrator; without word speakers nothing changes (`clock.words` keeps a speaker only on a word that
  carried one). A word speaker that is not a word refuses, naming the word. A segment's key holds the word speakers.
- **Captions end a sentence that ends inside a quote or a bracket** (`tomorrow!"`, `me?'`, `done.”`), so a caption no
  longer runs on into the next sentence.

### Listening
- **`film.listening`** (`footprint-storyreel/listening`): what the sounds of the changes of picture ask of the
  ear — more than 60% of four or more changes making a sound (about half should be silent), or the same cue
  twice running; `"listening": "refuse"` refuses them. The worlds example now lists its wipe and iris both
  sliding.
- **The same sound twice** means two neighbouring changes of picture: a sound, a silent change, then the same sound
  again is the rhythm the rule asks for, not a finding.
- **Each role measured apart** (FFmpeg's ebur128 meter: under a second for a 10-minute film): a render measures the voice and the effects before it mixes them
  (`result.loudness.roles`, LUFS) and lists the effects in `result.listening` when they are less than 10 LU
  under the voice; `makeFilm` writes both lists into `making-of.json`'s `listening`.

### Check the finished file
- **`checkVideo({file, film?, captions?, voiced?, joins?, intro?, expect?, checks?, probe?})`** reads the finished
  file itself and reports what a person would catch watching it: picture and sound of different lengths, or a
  length outside the brief (`duration`); a blank run the film does not mean (`blank`); a frame unlike both its
  neighbours, which are alike (`flash`); a cut a frame early or late, a frame repeated where segments join
  (`handovers`); words not heard in a voiced render (`voice`); captions out of order, past the end, or away
  from their first word (`captions`). With the film, what it meant is never reported; a check that needs what
  was not given is skipped, saying why. The probe is an adapter (`ffmpegProbe()`), each check a strategy
  (`footprint-storyreel/finished`). **`makeFilm({check: 'report' | 'refuse', expect})`** runs them as a stage of
  its own (`check-finished`) and writes `finished` into `making-of.json`.
- **Lips in sync** (`lipsync`): every mouth a kit draws (a world's `mouthsAt(t) → [{who, open}]`, collected by
  `film.mouthsAt(t)`) against the finished file's voice, every 10 ms: how far the mouths lead or trail it (sound
  more than 45 ms ahead or 125 ms behind is seen: ITU-R BT.1359), a mouth moving while nothing is heard, a
  speaker heard with the mouth shut (a mouth that moves in silence for under 0.15 s — usually a word's end timed into
  the silence after it — is worth a look, not a problem). **`mouthAt(clock, t, who)`** (`footprint-storyreel/acting`): the mouth the
  kits had each written for themselves — open only while its owner says a word, about once a syllable.
- The checks were reviewed against real renders (36 renders, every example, 10/24/30 fps, motion blur, a vertical
  layout, intros, parts, segments) and planted faults; what that found is fixed: the sound is read at 16 kHz (at 8 kHz
  an /s/ read as silence and a correct film was refused); each mouth is lined up around its own speaker's words (with
  two speakers the lag was never reported); a part (`from`, `to`) is checked as the part; a cut is expected on the
  very frame the encoder shows it (a rounding at the last bit of the clock reported "a frame late"); an intro is never
  taken for a blank film; a silent scene's directions are never counted as captioned words; lips are skipped, saying
  why, when no kit draws a mouth; ffprobe is found on the PATH when it is not beside the FFmpeg given, and a check that
  cannot run is recorded (`finished.error`) unless the render must refuse. `film.rows[i].stage` names the entry a row
  begins with.
- **Fixed: the last frames of every film were lost** (also in 0.3.0). FFmpeg's `-shortest` stopped a copied
  picture a few frames early when it was muxed with the sound (4 frames of a 35 s film at 30 fps); the sound is
  now padded to the picture's exact length (frames / fps) and both end there. Found by the first run of the
  checks above.

### Through a thing: match cuts
- **`through`** (family `match`): the camera goes through a thing in the old picture — a window, a screen,
  a ring (`shape: "round"`) — and the new picture is what was inside it: fitted in the opening, zoomed about
  the one point that zoom leaves still until it fills the frame, the opening widening to the frame's edges at
  the end. `"enter": {"type": "through", "region": "window"}`.
- **`match`**: a thing in the old picture becomes the same thing in the new one (`region`, and `into` when the
  new picture names it differently). The old picture pushes in on its thing, the new one pulls back from its
  own, and they meet half way — same place, same size — at a quick dissolve. Both cameras only zoom in, so the
  frame is always covered: things far apart meet larger.
- **Held layers**: a world's `overlay(ctx, t)` is drawn on the frame, over the picture and outside its camera, so a
  transition or a director's push never moves it (a presenter in the corner); through a change of picture the leaving
  shot's layer crosses into the arriving one's, mixed as light is (`layerCrossfader` in
  `footprint-storyreel/transitions`), so the same layer in both shots stays exactly itself.
- **The built-in kits name what they draw**: a whiteboard item takes a `name` (one word), and the cartoon kit
  names its scenery as its camera shows it — `sun` (it sets with the evening), `shepherd`, `sack`, `pen`,
  `gate`, and `bulb` once the eureka shows. `examples/match` turns a whiteboard circle into the cartoon's sun
  and goes back through the shepherd's idea (the bulb) to the board, then checks the finished file.
- A `through` opening widens to the new picture's own edges (a round one squaring its corners as it goes), so
  nothing of the old picture shows through a gap before the last frame.
- **The contract**: a transition may say which things it looks for, `regions: p => ({from?, to?})`, and
  reads them in `draw(ctx, {…, boxes})`. The film finds each one once, when it is built (the leaving
  picture's at the change's first moment, the arriving one's at its last), so a frame stays a pure function of
  time; a name the picture does not have, or a thing off the frame, refuses, naming the names there are. A
  setting may be `{name: true}` (required) or `{name: true, default: null}`.
- `docs/transitions.png` redrawn with the two new rows.

### Acting: changes, not swaps
- **`footprint-storyreel/acting`**: `moodAt(keys, t)` acts a mood change the way an animator times a
  reaction — `anticipation` (the eyes close over the 0.1 s before the change and open over the 0.08 s after,
  so the face swaps while they are shut), a `take` (a damped swing up to the key's `take`, back past rest by
  12% of it, still at 0.4 s), a colour cross-fade `u` and a spring `settle`. `idleAt(t, {seed})`: breath,
  blink on an uneven rhythm, sway and a glance now and then, different for every seed so two characters never
  move in step. `follows(f, delay)`: the head follows where the eyes went. Keys out of order refuse.
- **One change at a time**: changes closer than one change takes to settle (max(fade, settle)) refuse, and so
  do two moods at one moment and timings that are not seconds above 0; a key that repeats the mood is no
  change. Every number a kit reads moves smoothly from frame to frame. `idleAt` refuses periods that are not
  seconds above 0 (`blinkEvery: Infinity` or `blinkFor: 0` never blinks) and finds the blink at any moment in
  the same time.
- **The cartoon kit acts**: the shepherd squints into his eureka, the face swaps under the squint and the head
  jumps and settles (it used to swap in one frame); each sheep blinks on its own rhythm. The pixel pins were
  re-recorded for this: 5 of the shepherd example's 24 pinned frames and 2 of the worlds example's changed.

### Reads, and a fairer reading pace
- **`reads`** on the story and on every stage (beside `intent` and `continuity`): what the viewer must take in,
  each `{what, at, min?, region?}`. `film.reads` lists them timed, with a `problem` when two overlap, when the
  shot ends before one lands, or when its `region` is not drawn then; `"reading": "refuse"` refuses them. A read's
  phrase is logged with its recipe path like every other line.
- **`"reading": {"rule", "pace": "letters"}`**: 1.5 s + a fifteenth of a second a letter (`LETTERS` in
  `footprint-storyreel/reading`), fairer to short labels than the words pace (still the default).

### Numbers shown in digits, said in words; listening back
- **Number slots**: a scene's `say: [[shown, spoken], …]` — the captions show `shown` ("16.67 ms"), the voice
  says `spoken` ("sixteen point six seven milliseconds"). The scene's text is what is spoken (`spokenText`,
  `sceneText`), a beat may name a phrase as shown or as spoken, and captions and caption files collapse the
  spoken run back into what is shown (`clock.shownWords(i)`). A slot not in the narration, out of order or
  spoken in digits refuses. `unsaidNumbers(storyboard)` lists digits without a slot.
- **The voice check in the record**: `makeFilm` reads the voice folder's `word-check.json` into
  `making-of.json` (`voice`: words scored low, words the listen-back did not hear, stale when older than
  the timings); `voiceCheck: 'refuse'` refuses a film with a word not heard (`readVoiceCheck` on
  `footprint-storyreel/pipeline`). The voice tools' check transcribes the audio freely and lines it up with
  the script, because forced alignment cannot see a dropped word.

### What a film is made from, and approving it
- **`film.inputs`**: what the film was made from, hashed (keys sorted first, so reformatting changes nothing):
  the storyboard, the timings, the recipe, the strings, the data, the theme, and every file it read through
  its root (code excerpts, a kit's `readFile`/`insideRoot`), by path. `making-of.json` lists them as `inputs`,
  with the pacing, the voice's audio (each file by name, length and bytes) and, with `makeFilm({code})`, a
  fingerprint of the kits' code.
- **`approveFilm({record, by, note?})`** approves a render as it was watched: from its making-of.json (the path
  or the object). **`makeFilm({…, approval})`** refuses to render anything else — once the film is compiled,
  before a frame is drawn — naming what changed (a file by its path) and the approver's own date;
  `making-of.json` keeps the approval and says what it does not lock (the render settings; the kits' code
  without a fingerprint). `checkApproval` is exported (`footprint-storyreel/approval` adds `stableJson`,
  `requireApproval`, `voiceHash`, `readApproval`, `unlocked`). Anything that is not an approval refuses as one.
- **`voiceCheck: 'refuse'`** also refuses a voice with no word check, one older than the voice's timings, or one
  that only aligned the words and never listened back.
- An approval is of the whole film: `making-of.json` says what part a render shows (`span`), and a render of a
  part refuses to be approved. A render the approval refuses leaves the approved render's narration folder as it
  was (the new one is paced aside and moved into place only once the film is allowed).

### Re-render only what changed
- **`segmentedVideo({store, recipe, code?, force?, samples?, parallel?})`** — a picture strategy for
  `renderFilm({…, video})` and `makeFilm({render: {video}})`: the film in segments (one per row of pictures,
  `film.rows`, from when each shot's entrance starts; rows under `minSeconds` join the one before), each kept
  in a store under a key built from what draws it on its own clock (its entries, the guess cards over it, its
  lines, words and notes, `film.inputs`, the frame settings, the code), reused when the key and a spot check
  of `samples` frames — painted as the video shows them, at the same places in the segment — match, drawn
  again otherwise or when `force` names it, then joined without re-encoding. A segment that moved is reused
  only when its frames did not move with the film's clock. The sound is mixed for the whole film every time.
  `result.video` (and `making-of.json`'s `picture`) says which segments were drawn, which reused, and why.
- **Every frame once**: a row whose entrance starts before the row ahead of it takes over from it (that row's
  entries join it), so the segments never overlap; with motion blur a segment that starts at a cut draws the
  row before it too. A segment lands in the store whole or not at all; a file cut short is never reused; when
  one segment fails the others stop; the default joiner runs the render's own FFmpeg.
- **Three seams**: the strategy (`wholeVideo()` — the default, one pass — or `segmentedVideo()`), the store
  (`folderStore(dir)`) and the joiner (`ffmpegJoin()`), each replaceable. `planSegments`, `segmentKey` and
  `codeFingerprint` (code, data, images and fonts, TypeScript too) are exported for tools that want the plan
  or the keys.
- **`makeFilm` draws the picture as a fan-out**: a `plan-picture` stage, then one footprintjs subflow per part
  (`render-picture`), then `render-film` joins and finishes; a whole-film render is one part.
- **`film.rows`**: the film as rows of pictures — when each starts to arrive, the recipe entries that draw it,
  and how it arrives (a pushIn film is one row).
- `renderFilm` is now `prepareRender` (the checked job and its one way to encode frames) → a strategy →
  `finishRender` (sound, mux, chapters, captions); the output is unchanged, and an FFmpeg that fails while
  encoding frames — or cannot start — now refuses instead of passing silently or crashing the process.

## 0.3.0 — shots planned like a film crew plans them; transitions as a collection; one film in every platform's shape

### Planning the shots (borrowed from how a film crew plans a shot)
- **`intent`** on the story and on every stage: what the shot is for, in one sentence (at most 140 characters;
  a second sentence refuses — one shot, one beat; abbreviations and initials are not sentence ends).
- **`continuity: {start, end}`**: the facts true when a shot starts and ends. The compile carries them forward
  in film order and refuses a shot whose start contradicts the story so far, naming the shot that last
  stated the fact and a fix that works (end the shot before it with the new fact).
- **Too much, too fast** (`film.watching`, the studio's list, `"watching": "refuse"`): more than 4 moments in
  2 s is a burst. Each shot's moment count is information (`film.shots[i].moments`), never a verdict.
- **Framing by name**: a director's push may aim `on` a thing the kit names (`regionsAt → {name}`), with
  `size` medium, close or insert; the zoom follows from the thing's size, and a framing that cannot be honoured
  (already too big, or too small for ×3) refuses, naming the framings that would work. Every world is ready
  before a push reads its regions. `Region.name` is new.
- **Listeners look at the speaker**: `clock.gaze(t, who)` (with `also` at a hand-over) and `clock.turns()`.
- `film` gains `shots` (in film order) and `watching`; the recipe gains `watching` (so `watching` can no longer
  be a host key); the new entry point is `footprint-storyreel/shots`. The engine now reads `intent` and
  `continuity` on the story spec and leaves them out of what the story kit gets; inside a world stage's
  `world` they refuse (they belong on the stage).

### Earlier, unreleased
- **The loudness flag says what to ask for** (`pipeline.mjs · loudnessRecord`): when one fixed gain was
  blocked by the true-peak limit, the making-of record's flag names the loudest target one gain can reach
  here (`I + (TP limit − measured peak)`, rounded down): "ask for loudness I -18.6 or lower to keep one fixed
  gain". No advice when the peak was not the cause.
- **Characters that talk** (`clock.mjs · makeClock`): a storyboard scene may name its `speaker` (`"speaker":
  "robot"`: a word; anything else refuses). The clock — the one a story kit is compiled with — answers
  `clock.speaking(t)`: `{scene, speaker, word, start, end}` while a word is being said, `null` between words
  and in a silent scene, so a kit moves the right character's mouth with the voice; `clock.words(scene)` lists a
  scene's said words on the film's clock. The voice step decides what `speaker` sounds like (the starter maps it
  to a voice profile); the engine reads it only here. Types: `StoryboardScene.speaker`, `Clock.words`,
  `Clock.speaking`.
- **Transitions: a collection, like a video editor's** (`src/transitions.mjs`, `footprint-storyreel/transitions`):
  a shot's `enter` names one of twelve — `cut`; dissolve `fade` · `dip` (`color`); wipe `wipe` (`from`) · `split`
  (`line`) · `clock`; `iris` (`at`); motion `push` · `slide` · `whip` (`from`); `zoom` (`at`); `page` — each with
  a family, a default length, ease and sound, and checked settings. Every entrance also takes `seconds`, `ease`
  (any name in the ease table; `back` and `spring` only where the frame's edge would not show: `slide`) and
  `sound` (a sound's name or `false`). A kit adds its own (`kit.transitions`), named in a recipe like a built-in
  one; a kit may not take a built-in name or another kit's. One drawing contract for all:
  `draw(ctx, {e, from, to, p, ghost, theme})` (`ghostPainter` is the see-through scratch picture the fade always
  used, now shared). `transitionSheet({catalog})` puts any collection on one PNG (the README's picture,
  `examples/transitions.mjs`); the studio shows it under **Transitions** (`load()` may return `kits`). `TRANSITIONS`,
  `TRANSITION_NAMES`, `transitionCatalog`, `readEntrance`, `CUT`. The five that shipped before draw the same
  pixels and make the same sounds (the pixel pins are unchanged). **Changed:** the refusal for an unknown
  entrance lists the collection (`enter must be a transition: cut, fade, …`), and `at` is now a setting of
  `iris` and `zoom` only — `{"type": "fade", "at": […]}`, accepted and ignored before, refuses.
- **One film, every platform** (`src/layout.mjs`, `footprint-storyreel/layout`): `renderFilm({…, layout})`
  renders the film as `landscape` 1920×1080 (YouTube, X, LinkedIn), `square` 1080×1080 (feeds), `portrait`
  1080×1350 (Instagram and Facebook feeds) or `vertical` 1080×1920 (Shorts, Reels, TikTok): a title band
  (`header: {title, sub?}`), captions burned in (`captions: true | {maxWords, size, box}`), and in portrait and
  vertical a 4:3 crop that follows the action (`crop: [{at: beat, x, width?}]`, eased; `width` up to 1600 shows
  the whole frame with paper above and below). The bands sit where the phone players leave room (in
  vertical, title, film and captions all between y 285 and 1460: under the app's top bar, above its text,
  the captions under the film so they never cover the picture), take the film's paper, ink and sans type
  (`film.theme`, new) unless the layout names `background`/`ink`, and move with `box`. A layout is data:
  unknown keys and misplaced bands refuse. Only landscape takes an `intro`. `compileLayout`, `FORMAT_NAMES`,
  `formatOf`, `cropWindow`. The result carries `format`.
- **Captions** (`src/captions.mjs`, `footprint-storyreel/captions`): built from the word times the film already
  has — never a silent scene's directions. `captionChunks(film, {maxWords, maxChars, breaks})` (a chunk takes
  one word more rather than leave a clause's last word alone); the word being said is highlighted
  (`captionAt`, `drawCaption`); the poster shows the title band without a caption. **Caption files**: `renderFilm({…, captionFiles: true | ['vtt'|'srt']})` writes
  `captions.vtt` / `captions.srt` beside the video on its clock (whole sentences, at most two lines of 42),
  for players that show their own captions; `captionFile(chunks, kind, {offset, from, to})`.
- **Motion blur** (`renderFilm({…, motionBlur: 4 | {subframes, shutter}})`): each frame the average of 2–16
  moments over `shutter` (default half) of its time; the bands and the poster are never blurred. Without a
  layout or motion blur a render is the same as before.
- **`spring`** joins the ease table: a closed-form damped spring (damping 0.7), overshooting about 4% and
  settling, exact at both ends.
- `makeFilm` writes the version it made into `making-of.json`: `version: {format, motionBlur?, captionFiles?}`.
  Examples: `examples/formats.mjs` (the hello film in all four formats), `examples/transitions.mjs`.

- **The compile record** (`record.mjs · recordSteps`, `film.mjs · compileSteps`): `compileFilm({…, record:
  true})` runs the compile as a footprintjs flowchart of five stages — read inputs, build worlds and stages,
  guesses and notes, checks, resolve lines — each running its own segment of the existing compile (the
  segments are one generator; with the record off they are simply drained, in the same order). Stages write
  small values only: `recipe`, `lines`, `world.<path>`, `stage.stages[i]`, `guess.guesses[n]`,
  `note.notes[i]`, `checks.*`, and `when.<recipe path>` = seconds for every line resolved. The run uses
  `writeProvenance: 'reads-prefix'`, so `sliceForKey` (footprintjs/trace) walks back from a line to the stage
  that read the scenes' seconds. The film carries `record: {narrative, snapshot}` (detached; survives
  structuredClone); a refused build's error carries `record` too. `record` other than true/false refuses.
  Off (the default) the return keys and the pixels are unchanged (the pixel pins are unchanged). The
  director's notes as applied are now computed just after the push notes are placed (before the reading
  check); nothing they read changed. `makeFilm` records the compile and writes its narrative to
  `making-of.json` under `compile`. Types: `CompileRecord`, `Film.record`, `CompileFilmOptions.record`. A
  benchmark: `node bench/compile.mjs [runs]` (median milliseconds per example, record off and on).

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
