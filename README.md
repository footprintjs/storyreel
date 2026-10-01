# Footprint StoryReel

**Teaching films from a script and a recipe.** You write what is said (the storyboard) and what is
drawn when each phrase is said (the recipe, plain JSON). StoryReel turns them into one film you can
seek to any moment, renders the MP4 with its sound, and writes a **making-of record**: which words
triggered which drawing, the pacing, the tools and versions.

It is built for explainers and lessons: a whiteboard story, a push into a typed card, code that
appears line by line as the voice names it, pause-and-guess questions, a recap drawn from the
film's own frames. A cartoon world and a storybook look ship too, and the look is a plug-in.

```
a lesson:   story (a world, a problem, a eureka) → push-in to one prop → paper stages on one page → recap → teaser
an episode: world → world → paper → world → recap …   each scene a shot: a fade, a wipe, an iris, a page turn or a cut
```

## Why StoryReel

- **Pictures follow the words, not the clock.** Every drawing is tied to a spoken phrase. Record the
  voice again, slower or in another language, and the film follows; a phrase that is not in the
  script refuses the recipe instead of drifting.
- **Honest by construction.** Values on screen can be read from real data (a recorded run), a line
  too short to read is reported (or refused), and every film says how it was made.
- **The same frames every time.** `frame(ctx, t)` is a pure function of time. Pixel pins catch any
  change that moves a pixel, so a film you approved stays the film you approved.
- **Direct it like a director.** Camera words as data (`speed`, `cut`, `push`), and a local studio
  where you scrub, play with the voice, and click a drawing to find the line of the recipe that drew it.

## Install

```bash
npm i footprint-storyreel
```

- **Node 22 or later.**
- **FFmpeg on your PATH** to render MP4s (`brew install ffmpeg`, `apt install ffmpeg`, …). Compiling,
  drawing frames, the studio and the checks need no FFmpeg.
- Drawing is native (`@napi-rs/canvas`, prebuilt for macOS, Linux and Windows). The handwriting font
  (Caveat, SIL OFL) is bundled.

## Your first film

The package ships three examples; `examples/hello` is the smallest complete film (a whiteboard
story, a push-in to a card, one code stage). Its two input files:

```json
// storyboard.json — what is said, by scene
{"title": "One pebble for one sheep", "scenes": [
  {"id": "story", "title": "Long ago", "narration": "Long ago, before people wrote numbers down, a shepherd kept count with pebbles. …"},
  {"id": "rule", "title": "The rule", "narration": "One pebble for one sheep. If a pebble is left over, a sheep is missing. That is the idea behind counting."}]}
```

```json
// recipe.json — what is drawn when each phrase is said (excerpt)
{"story": {"kit": "whiteboard", "items": [
   {"at": ["story", "a shepherd"], "dur": 1.2, "draw": [["figure", 300, 620, 1.1]]},
   {"at": ["story", "came home"], "eureka": [1360, 360]}]},
 "pushIn": {"after": "story", "rest": 0.3, "turn": 1.8, "zoom": 2.2, "caption": "Now the rule."},
 "stages": [{"type": "code", "scene": "rule", "title": "One pebble for one sheep", "code": {"file": "rule.ts"},
             "reveal": [[0, ["rule", "One pebble for one sheep"]], [1, ["rule", "If a pebble is left over"]]]}]}
```

```js
import {readFileSync} from 'node:fs';
import {makeFilm, evenTimings} from 'footprint-storyreel';

const read = f => JSON.parse(readFileSync(f, 'utf8'));
const storyboard = read('storyboard.json'), recipe = read('recipe.json');
const result = await makeFilm({
  storyboard, recipe, root: '.',                  // root: where the recipe's code files live
  timings: evenTimings(storyboard, {tail: 4}),    // silent: evenly spaced words (or narrationDir: your voice)
  out: 'out/film.mp4',
});
console.log(result.out, result.makingOf);         // the film, and making-of.json beside it
```

From a clone of the package: `node examples/hello/make.mjs`, `node examples/shepherd/make.mjs`
(the cartoon kit), `node examples/worlds/make.mjs` (worlds as shots, a pause-and-guess, a string table),
`node examples/recap/make.mjs` (a recap of the film's own frames and a teaser for the next film).

**See it before you render it:** `node examples/studio.mjs hello` opens the preview studio (below).

## A voice

Any text-to-speech works, as long as you can give each word its time. The timings are one entry per
scene — `{id, duration, words: [{text, start, end}], alignment: {status: 'available'}, audio}` — written
beside the scene audio as `timings.json`; pass the folder as `narrationDir`. Forced alignment gives the
word times for any voice (the AgentFootprint course uses Chatterbox with torchaudio MMS_FA; Kokoro
reports its own). **Pacing** — `{sceneTail, holds: [{scene, after: 'a phrase', seconds}], tails}` —
inserts silence after phrases so the pictures can land; with a voice it is cut into the audio, and in a
silent cut `paceTimings` shifts the word times the same way.

## Silent scenes

A scene with no voice — the door opens, a character walks in — is written in the storyboard with
**directions** in place of `narration`: script lines, each with how long it lasts. The clock treats a
direction exactly like a spoken phrase, so a recipe names it the same way (`plus`, `edge` and `nth` as
usual), and **a direction is never spoken**: the voice skips it, a voiced cut plays silence there, and
the studio shows its words dim and slanted (`spoken: false` in the transcript).

```json
{"scenes": [
  {"id": "open", "title": "Morning", "silent": [["the door opens", 1.0], ["Mia walks to the stall", 3.0]]},
  {"id": "stall", "narration": "Mia counts the cups she sold."}]}
```

```json
{"at": ["open", "Mia walks to the stall"], "dur": 1.0, "draw": [["figure", 200, 620, 1]]}
```

- **One function owns the timing:** `directionTimings(scene, {tail?})` spreads each direction's words
  evenly over its seconds (here "Mia walks to the stall" starts at 1.0 s); the scene lasts the sum of
  the seconds, plus the tail; alignment `{status: 'available', method: 'directions'}`. `evenTimings` uses
  it for every silent scene (with its own tail), and `withDirections(storyboard, timings)` fills in the
  silent scenes a voice's `timings.json` leaves out (`makeFilm` and the pacing do this for you, so a
  voice step needs to know only the spoken scenes).
- **A scene is spoken or silent, never both.** A scene with `narration` and `silent`, or neither, is
  refused; so is a direction that is not `[text, seconds]` (`{"text", "seconds"}` refuses with the fix),
  one with no words, or one shorter than 0.2 s or longer than 20 s. (Directions inside a spoken scene
  are not supported yet.)
- **No hold after a direction.** A pacing hold in a silent scene is refused, naming the scene — make
  that direction longer instead. The scene's tail still applies (`"tails": {"open": 1.2}`).
- **The sound.** With a voice and pacing, `applyPacing` writes `silent-<scene>.wav` into the run's copy
  of the voice folder (at the voice's sample rate, the directions' length plus the tail) when the voice
  has no audio for the scene. Without pacing, `renderFilm` generates the silence itself, in its own
  folder; a *spoken* scene with no audio still refuses.

## The recipe

A recipe is data only, never code. Every beat names what is SAID: `["scene", "phrase", plus?]`.
A phrase that is not in the narration refuses the recipe.

```json
{
  "story":  {"kit": "whiteboard", "items": [{"at": ["story", "a shepherd"], "dur": 1.2, "draw": [["figure", 300, 620, 1.1]]}], "erasers": {}, "spots": []},
  "pushIn": {"after": "story", "rest": 0.3, "turn": 1.8, "zoom": 2.2, "caption": "Now the rule."},
  "card":   {"prop": [1240, 430, 1480, 710], "rows": [...], "template": {...}, "aside": {"at": [380, 490], "scale": 0.8}},
  "stages": [{"type": "code", "scene": "rule", "title": "One pebble for one sheep", "code": {"file": "rule.ts"}, "reveal": [[0, ["rule", "One pebble"]]]}],
  "recalls": {"name": ["scene", "phrase", 1.0]}
}
```

- `story.kit: "whiteboard"` — items drawn stroke by stroke (`figure`, `robot`, `rect`, `line`,
  `ellipse`, `bubble`, `tick`, `arrow`, `poly`), handwriting (`write`), a eureka (`eureka: [x, y]`:
  light bulb + chime), named erasers, spotlights with a camera push.
- `pushIn` — after the story, the camera pushes into `card.prop` and it becomes a typed card.
- `card` — rows of `{value, tone, note, source, tags}`; tones: `available` (known), `unknown`, `dim`.
  `source` is the SOURCE chip; `tags: [{label: 'WHEN', text: 'last night'}]` are small chips under the row.
- `stages` built in: `code` (a real file's on-screen block, tokenized by Shiki; `code.size` for a wider block (default 23 px); `reveal`, `focus`,
  `glows` that link a code line to a card row, `footer`), `api` (code + a list of values read
  from `data`), `recap` (the film's own frames on a story strip, then an optional `teaser`),
  `summary` (cards), `world` (below). Any stage takes `chrome: false` to drop its chip and title.
- **The top level is checked.** A recipe takes `story` (or the older `whiteboard`), `pushIn`, `card`,
  `stages`, `guesses`, `notes`, `recalls`, `poster`, `reading` and `paperStyle`; any other key refuses,
  so a misspelling (`"stage"`) is never silently ignored. An application that keeps its own data in the
  recipe names those keys in `hostKeys`: they are allowed, and the engine never reads them.
  `compileFilm({…, recipe: {story, stages, terms}})` refuses `"terms"` with the fix;
  `compileFilm({…, recipe: {story, stages, terms}, hostKeys: ['terms']})` compiles (so does `makeFilm`).
- **Files stay inside `root`.** A file the recipe names (a code excerpt today; pictures next) loads only
  from inside the film's root folder (the `root` option, default the working folder). The check uses
  real paths, so `../film-private/x.ts` (a sibling folder whose name begins like the root) and a
  symbolic link that leads out of the folder are both refused, with a message naming the fix (so is a
  `root` that does not exist):
  `"code": {"file": "code/rule.ts"}` loads; `"code": {"file": "../film-private/rule.ts"}` refuses.

### A recap and a teaser

`recalls` keep frames of the film itself (a phrase names the moment); a `recap` stage lays them on a
story strip and hops between them as the voice names each one, and its `teaser` fills the screen with one
of them, stamps the next question, rewinds the story fast and brings in the next film's title. The
teaser runs to the film's end, so the last scene needs about 6.5 s after `teaser.at`
(`examples/recap`, pinned in `test/golden.json`):

```json
"recalls": {"stall": ["story", "from a small stall", 1.6], "total": ["story", "twelve sales", 0.8]},
"stages": [{"type": "recap", "scene": "recap", "chip": "RECAP", "title": "What we saw",
  "frames": [{"recall": "stall", "caption": "A stall"}, {"recall": "total", "caption": "Twelve sales"}],
  "keys": [{"at": ["recap", "A small stall"], "f": 0}, {"at": ["recap", "Twelve sales"], "f": 1}],
  "teaser": {"at": ["recap", "where did the lemons go"], "recall": "total", "stamp": "AND THE LEMONS?",
    "rewind": {"from": ["story", "Twelve cups"], "to": ["story", "Mia sells lemonade"]},
    "next": {"chip": "NEXT FILM", "title": "Where did the lemons go?", "sub": "a ledger that does not add up"}}}]
```

### Signs that tie the story to the code

Three whiteboard shapes — `tag`, `clock`, `flashlight` (`["flashlight", x, y, scale, -1]` points left) — can
stand for ideas a film must keep apart (in the AgentFootprint course: source · when · coverage). The same
signs follow the idea onto paper:

```json
{"type": "code", "scene": "build", "code": {"file": "…"},
 "marks":   [{"line": 2, "icon": "tag", "from": ["build", "Its source"]}],
 "columns": [{"key": "source", "from": ["build", "Its source"], "to": ["build", "When it was checked"]},
             {"key": "WHEN",   "from": ["build", "When it was checked"], "to": ["build", "And what it covers"]}]}
```

`marks` put the sign beside a code line from the phrase on; `columns` ring the card's SOURCE chips
(`source`) or its tags with that label (`WHEN`, …) while the voice names them. `card.sourceIcon` puts a
sign in every SOURCE chip, and a row tag may carry one (`{"label": "WHEN", "text": "last night", "icon": "clock"}`).

### An episode: worlds as scenes

Leave out `pushIn` and `card`, and every stage is a **shot** that fills the frame. A `world` stage
draws any story kit, full screen, in its scene; paper stages have the page to themselves (the code
panel is centred) and hand over to each other on it. A shot enters with `enter`:
`"fade"` (the default), `"wipe"` (left to right) or `"iris"` (a circle opening; `{"type": "iris",
"at": [x, y], "seconds": 0.8}`). Three quarters of the change happens in the silence before the
scene's first word. `"page"` is a page turn: the old shot lifts from its right edge and folds over to
the left, uncovering the new one (default 1.1 s) — for storybook films.

```json
{"story": {"kit": "whiteboard", "items": [ … ]},
 "stages": [
   {"type": "world", "scene": "valley", "enter": "fade", "world": {"kit": "cartoon", "flock": { … }}},
   {"type": "code", "scene": "rule", "enter": "wipe", "chrome": false, "code": {"file": "count.ts"}, "reveal": [ … ]},
   {"type": "world", "scene": "again", "enter": {"type": "iris", "at": [800, 420]}, "world": {"kit": "whiteboard", "items": [ … ]}}]}
```

### Pause and guess

```json
"guesses": [{"after": ["valley", "How many sheep went out"], "question": "How many sheep went out?", "answer": "Three!", "place": "top"}]
```

The card appears when the phrase ends, a ring runs out over the pause the narration holds there,
and the card FLIPS as the voice gives the answer: it closes on the question and opens on the answer,
so the two never overlap, then a tick and a chime. A theme sets the card's look in its `guess` section:
`{"look": "storybook", "card": "#fbf2dc", "ink": "#3b2b1a", "answer": "#2f6b3a"}` draws a paper card with
an inked, hand-drawn border (the package ships a `storybook` theme with it: `theme: 'storybook'`). The pause IS the pacing hold
(`holds: [{"scene": "valley", "after": "How many sheep went out", "seconds": 3}]`): a guess with
no hold of at least 1 s after its phrase refuses the recipe — a countdown never runs while the
narrator keeps talking. `place`: `top` (default), `center` or `bottom`, so the picture the
question is about stays in view; `until` (a phrase) sets when the answer leaves (default: 2.6 s,
and before its scene hands over). The answer is given in the question's own scene: a pause that
ends less than 1.9 s before its scene does refuses the recipe (say the answer after the pause).

### Director notes

Watching a draft, a director speaks in camera words: *the zooms feel rushed*, *hard cut into the loop*,
*push in on the card at the order line*. A recipe's `notes` say exactly that, over the film, without
touching its beats — so a note can be tried, kept or dropped in one line:

```json
"notes": [
  {"note": "The zooms feel rushed", "speed": 0.7},
  {"note": "Hard cut into the loop", "cut": "inside"},
  {"note": "Push in on the card at the order line",
   "push": {"at": [380, 490], "zoom": 1.3, "from": ["build", "The order line"], "to": ["build", "The policy line"]}}
]
```

Each note carries its words (`note`) and exactly one camera word:

- **`speed`** (0.25–4) — every camera move takes its seconds divided by it: the push-in, spotlights,
  a story kit's camera moves, the pushes. One speed per film. A world drawn by a kit that cannot follow
  it (below: `motion`) refuses the note, and so does a push-in that would still be running when the card
  moves aside for the first stage (lengthen the tail of the scene before it).
- **`cut`** (a scene id) — that scene's stage arrives on its first frame, whole, instead of by its
  hand-over or entrance. Not into the story (it is one continuous world) or the first stage of a
  lesson (it arrives with the push-in). A recipe may also write the entrance itself: `"enter": "cut"`.
- **`push`** — the camera pushes in on `at` (a point on the 1600×900 frame; the studio gives it to you)
  by `zoom` (default 1.25), easing in (`seconds`, default 1) from the phrase `from` and out from `to`.
  The picture always covers the frame; guess cards stay where they are. A push stays on one picture:
  one that runs across a hand-over, an entrance, a cut, the push-in or the teaser refuses, and so does
  one over a spotlight or another push — one camera move at a time.

The film returns the notes as applied (`film.notes`: what each one changed, and when), and the
making-of record lists them.

### The string table

Write an on-screen word as `{"$string": "key"}` anywhere in the recipe, and pass the language's
table (`strings: {"key": "text"}`). (The older spelling `{"string": "key"}` is refused with this one as
the fix when the table has that key.) A key the table lacks refuses the recipe, and so does a key
with no table; the making-of record lists the language and the keys used. (A second language
also needs its own narration; the recipe's phrases are its English cues for now.)


## Checking a film

- **Reading time.** Every line meant to be read — titles, footers, list lines, captions, the board's
  writing, guess questions and answers, the push-in caption — must stay up, whole, about **0.3 s a word**
  (at least a second), counted from when it is fully shown until it starts to leave. `film.reading`
  lists the lines that are too short (the making-of record and the studio show them); a recipe with
  `"reading": "refuse"` is refused while any line is. Code is left out: it is studied, not read in a beat.
- **Stills.** `film.moments()` gives each scene's picture once it has settled and each change of
  picture half way through; `contactSheet(film)` puts them on one PNG (the studio's *Stills sheet*).
  A muddy double exposure, a collision or text caught mid-flight shows up in the half-way stills.
- **A poster.** `"poster": ["summary", "What to keep", 1]` names the film's best settled frame. The
  renderer writes it beside the video (`poster.jpg`) and makes it the video's first frame, so every
  platform's thumbnail shows it; the length and the sound's sync do not change.
- **Pixel pins.** `frameHashes(film)` hashes frames at 24 evenly spaced moments; store them beside a test
  and compare with `changedFrames(pinned, now)`. `frameHashes(film, {times})` hashes the moments you
  name instead (seconds inside the film, each rounded to the millisecond and used as its key), so a short
  pop that even spacing would miss can be pinned: `frameHashes(film, {times: film.moments().map(m => m.t)})`.
  Give `count` or `times`, not both; two moments that round to the same millisecond refuse (one would be lost).
  Hashes depend on the machine's fonts: record them again on a new machine, and otherwise only for a
  change you meant. This package also pins, for every example film, what its pixels never show —
  `film.reading`, `film.moments()` and the refusal a push note gets across each change of picture
  (`test/behaviour.json`; `node test/behaviour.mjs --write` re-records it, only for a change you meant).
  The pins must reach a plain hand-over on the page, a director's cut and a line too short to read —
  `examples/recap` carries all three (`"notes": [{"note": "Go straight to the code", "cut": "code"}]`,
  then a `summary` stage handed over to on the page, whose closing line is up too briefly) — and a test
  says so if an edit to the examples drops one.
- **Loudness, in two passes.** `renderFilm` measures the whole mixed film first (FFmpeg's `loudnorm`),
  then sets it with **one fixed gain** from that measurement (`linear=true`), so a quiet opening stays
  quiet instead of being raised to the voice's level. The target is `loudness: {I: -16, TP: -1.5}` (LUFS,
  dBTP; `LRA` in LU is optional). It is checked before anything renders: I and TP are required, each a
  finite number in FFmpeg's range (I -70..-5, TP -9..0, LRA 1..50), and any other key refuses with the fix
  (`loudness.lra is not a key: use LRA (loudness range, LU, 1..50)`). With one gain, `loudnorm` reads the
  range target only to decide whether to stay linear, so **when you set no `LRA` the second pass asks for
  the measured range** (rounded up, at least 7, at most 50) — a quiet stretch beside a louder voice no
  longer forces the varying gain, and the sound is the same. `result.loudness.target` is what the second
  pass asked for. `result.loudness.type` is FFmpeg's reported normalization type: `linear` (one gain),
  `dynamic` (loudnorm varied the gain: the true-peak limit, a film under 3 s, or a measured range above an
  `LRA` you set still blocks one gain) or `skipped` (nothing usable to measure, so the sound is left as it
  is: `reason` says "the audio is silent" for pure silence — a render of only a silent opening works —
  or names the fields FFmpeg left unread). A perfectly steady sound measures a range of exactly 0, which
  FFmpeg reads as "not measured"; it is sent as 0.1 and `measured` keeps the 0. The making-of record keeps
  it all and **flags every type that is not `linear`**:
  ```json
  "loudness": {"type": "linear", "target": {"I": -16, "TP": -1.5, "LRA": 15},
    "measured": {"I": -37.97, "TP": -25.21, "LRA": 14.2, "thresh": -50.36, "offset": 21.5}}
  ```
- **The making-of record** (`making-of.json`, written by `makeFilm`): every phrase → the recipe entry it
  triggered and when, the director's notes as applied, the lines too short to read, the pacing, the
  poster, the loudness as measured and set, the tools and versions — the film's own footprintjs run —
  and, under `compile`, the compile stage by stage (the narrative of its record, below).

## The compile record

`compileFilm({…, record: true})` runs the compile as a footprintjs flowchart and returns the film with
`film.record = {narrative, snapshot}`. Off (the default) nothing changes: the same return keys, the same
pixels. Drawing a frame is never recorded; the compile is, in five stages, each running its own part of
the compile and then writing small values about it (numbers, words, recipe paths — never a canvas):

| stage | reads | writes |
|---|---|---|
| read inputs | – | `recipe` (its top-level keys), `lines` (each scene's start and end, seconds), `notes`, `strings` |
| build worlds and stages | `recipe`, `lines` | `world.story` and `stage.stages[i]`: kit, scene, recipe path |
| guesses and notes | `lines`, `notes`, `stage.*` | `guess.guesses[n]` (the pause, when the card is gone), `note.notes[i]` (as applied) |
| checks | `world.*`, `stage.*`, `guess.*`, `note.*` | `checks.reading`, `checks.sounds`, `checks.ready` |
| resolve lines | `lines` | `when.<recipe path>` = seconds, for every line the build resolved |

Lines are resolved while the build asks for them; the clock is a pure function of the paced word times,
so *resolve lines* writes them all once the build is done (a line no recipe entry named is written as
`when.(no entry) <the phrase>`). The run keeps, for every write, the keys its stage read first
(footprintjs `writeProvenance: 'reads-prefix'`), so a slice walks back from any value:

```js
import {sliceForKey, formatSlice, keysReadFromExecutionTree} from 'footprintjs/trace';
const film = await compileFilm({storyboard, timings, recipe, record: true});
const {snapshot} = film.record;
console.log(formatSlice(sliceForKey(snapshot.commitLog, 'when.story.items[0].at', keysReadFromExecutionTree(snapshot.executionTree))));
// SLICE for 'when.story.items[0].at' — reads via: execution-tree
// resolve lines (resolve-lines#4) [wrote: when.story.items[0].at, …]
//   read inputs (read-inputs#0) ← via lines [wrote: recipe, lines, notes]
```

The record is detached (it survives `structuredClone` and JSON). A refused build keeps its record: the
error carries `error.record`, whose narrative names the stage that refused. `record` other than true or
false refuses. `makeFilm` always records and puts the narrative in `making-of.json` under `compile`.

## The preview studio

A local page for directing a film: the picture at the playhead, a timeline with the scenes, a tick for
every spoken phrase (coloured by the part of the recipe that named it) and the notes, the transcript
with the word being said, and the voice. **Click the picture** and it says what drew that spot — the
recipe entry (`story.items[3]`, `stages[2].reveal[1]`, `card.rows[0]`, `guesses[0]`), its line in the
recipe file (a link that opens it in VS Code), and the coordinates you need for a new item or a push.
Save the recipe and the film is compiled again; a recipe that refuses shows why, and the last good
film stays on screen.

```js
import {startStudio} from 'footprint-storyreel/studio';
const studio = await startStudio({
  load: async () => ({film, storyboard, recipe, source: {file: 'recipe.json'}, audio: 'voice.wav'}),
  watch: ['recipe.json'],          // compiled again when these change
  port: 4321,
});
```

Keys: space plays; ← → step a frame (shift: a second); `[` `]` the previous and next phrase; `,` `.`
the previous and next scene. It listens on 127.0.0.1 only, answers only requests addressed to that
name, only reads (GET), and runs nothing from the recipe. The engine side is `film.regionsAt(t)`
(what is drawn where, each box naming its recipe entry) and `film.pointAt(t, x, y)` (a click in the
recipe's coordinates); every `film.beats[i].path` names the entry that asked for that phrase.

## Built-in kits

- **whiteboard** (story) — a board hanging on paper; marker props, handwriting, eraser, eureka, spotlights.
- **cartoon** (story) — a flat, friendly world drawn in code (no image files): morning-to-evening
  sky, hills, a stone pen and gate, a shepherd, sheep that walk with a bounce, a bag of pebbles;
  captions; camera moves (`camera: [{at, to: [x, y], zoom}]`, the frame always stays covered).
  `node examples/shepherd/make.mjs` renders its first scene.

```json
{"story": {"kit": "cartoon", "evening": ["evening", "Each evening"],
  "flock": {"count": 4, "missing": 1, "out": {"at": ["morning", "when a sheep went out"], "every": 1.3}, "home": {"at": ["evening", "when a sheep came home"], "every": 1.3}},
  "eureka": {"at": ["evening", "But wait"], "text": "One is missing!"},
  "captions": [{"at": ["morning", "One sheep one pebble"], "until": ["morning", "One sheep one pebble", 3], "text": "one sheep · one pebble"}],
  "camera": [{"at": ["morning", "A shepherd had sheep"], "to": [560, 640], "zoom": 1.35}]}}
```

## Kits

```js
// A story kit draws the opening world on a 1600×900 sheet.
const myKit = {name: 'cartoon', story: {
  motion: ['cameraSpeed'],                    // it follows a director's speed note (below)
  compile(spec, clock, motion) {
    return {
      hang: 1,                                // 1 = full frame; 0.9 = a board hanging on the paper
      draw(ctx, t, spot) { /* draw the world at t */ },
      spotAt(t) { return null; },             // optional spotlight {cx, cy, r, zoom, w}
      regionsAt(t) { return []; },            // optional, for the studio: [{box: [x0, y0, x1, y1] on the sheet, path: 'items[3]', label}]
      texts() { return []; },                 // optional, for the reading check: [{text, from, to, path}]
      sounds: [{time: clock.at(['story', 'But wait']), type: 'chime'}],
    };
  }}};

// A stage kit adds a stage type. `keys` lists its own spec keys (besides type, scene, chip,
// chipDark, title, enter, chrome); any other key refuses. cardBox is null in a film without a card.
const loopKit = {name: 'agent-loop', stages: {loop: {
  keys: ['loop'],
  compile(spec, {clock, data}) { … }, draw(ctx, P, theme, handle, t, cardBox) { … },
  card(handle, t) { return {rows, glow, pop}; },   // optional: drive the card
  place(handle) { return {at: [800, 600], scale: .58}; }, // optional: take the card into the scene
  sounds(handle) { return [{time, type}]; },
}}};

await compileFilm({storyboard, timings, recipe, kits: [myKit, loopKit]});
```

`motion.cameraSpeed` is the film's camera speed (1 unless a note sets it): a kit that lists
`motion: ['cameraSpeed']` divides the seconds of its camera moves and spotlights by it. A kit that does
not list it still draws, but a speed note on a film with one of its worlds refuses (the note says
*every* camera move). A stage kit's `compile` gets `{clock, data, motion}`, and may add
`regions(handle, t, cardBox)` for the studio (boxes on the frame, paths relative to its stage).

**The kit context.** A story kit that declares `context: true` is compiled as `compile(spec, context)`
instead: one frozen object `{clock, motion, theme, root, library, labels, insideRoot, readFile}`. `theme`
is the film's theme; `library` and `labels` are the recipe's (empty until a recipe carries them). Files go
through `readFile(path)` (or `insideRoot(path)`, the real path), which loads only from inside the film's
root folder, the same rule as the recipe's own files: a sibling folder or a link out refuses. The context
has no way to draw the film. A kit that does not declare it keeps `compile(spec, clock, motion)`, and the
speed-note rule above is the same for both.

**Ready.** A world may return `ready`, a Promise that settles once it can draw (its images decoded).
`compileFilm` waits for every world's `ready` before it draws the recipe's `recalls` and before it
returns, so a recall never catches a half-loaded picture. A `ready` that rejects refuses the film, naming
the world; a `ready` that is not a Promise refuses.

```js
import {loadImage} from '@napi-rs/canvas';
const picturesKit = {name: 'pictures', story: {context: true,
  compile(spec, {clock, theme, readFile}) {
    const shown = clock.at(spec.at); let img = null;
    const ready = loadImage(readFile(spec.src)).then(loaded => { img = loaded; });
    return {hang: 1, ready, draw(ctx, t) {
      ctx.fillStyle = theme.palette.bg; ctx.fillRect(0, 0, 1600, 900);
      if (t >= shown) ctx.drawImage(img, 0, 0, 1600, 900);
    }};
  }}};
// "src": "pics/stall.png" loads; "src": "../film-private/stall.png" refuses: it is outside the root folder
```

**Eases.** One table names how a change speeds up and settles (`footprint-storyreel/ease` ·
`EASES`, `easeNamed(name, where)`): `linear`; `in` (starts slow); `out` (slows into place); `inOut` (slow,
fast, slow: exactly the whiteboard's `ease`, which is now this curve under its old name); `back` (overshoots
about 10% and settles); `walk` (speeds up over the first fifth, steady, slows over the last fifth); `jump`
(no in-between: the start value until the change ends). Each takes how far through its seconds a change is
(0..1, clamped) and returns how far the value has gone. An unknown name refuses, naming the eases:

```js
import {easeNamed} from 'footprint-storyreel/ease';
const x = 200 + 600 * easeNamed('out')((t - start) / .4);   // easeNamed('spring') → "spring" is not an ease; the eases are linear, in, …
```

**Sounds.** `tap`, `slide`, `settle`, `question`, `chime`, `door`, `step`, `click`, `whoosh`, `crumble`:
short, quiet and made by procedural synthesis (no samples). A kit's sound is `{time, type, gain?}`:

- `gain` (0..1) overrides the sound's default (1 for the first five; `door` .8, `step` .7, `click` .8,
  `whoosh` .8, `crumble` .7). **A gain is relative to its scene**: each scene's sounds are scaled by one
  factor, set by the loudest moment in that scene (`sound.mjs · createMotionSound`), so a loud door turns
  down every tap in the same scene.
- Names, gains and the count are checked when the film is built (`compileFilm`), not after rendering: a
  misspelled name refuses, naming the kit and the sounds there are, and a scene with more than 64 sounds
  (the engine's and every kit's together) refuses, naming the scene.

```js
sounds: [{time: clock.at(['story', 'the door opens']), type: 'door', gain: .45}, {time: clock.at(['story', 'she walks in']), type: 'step'}]
// type: 'dor' → the story kit "farm" makes a sound "dor"; the sounds are slide, settle, tap, … crumble
```


## API

| import | what it does |
|---|---|
| `compileFilm({storyboard, timings, recipe, data?, kits?, theme?, root?, strings?, hostKeys?, record?})` | the film: `frame(ctx, t)`, `total`, `clock`, `beats`, `sounds`, `notes`, `reading`, `moments()`, `regionsAt(t)`, `pointAt(t, x, y)`, `posterAt`; with `record: true`, `record` (the compile as a footprintjs run) |
| `renderFilm({film, storyboard, timings, narrationDir?, out, width?, height?, fps?, intro?, stamp?, from?, to?, poster?, loudness?})` | the MP4 (FFmpeg), its chapters, its poster, its loudness (two passes) |
| `makeFilm({storyboard, recipe, timings \| narrationDir, pacing?, strings?, out, render?})` | compile + render as a footprintjs pipeline, with `making-of.json` |
| `evenTimings(storyboard)` · `paceTimings(storyboard, timings, pacing)` · `applyPacing(…)` | word times without a voice; pacing for a silent or a voiced cut |
| `directionTimings(scene, {tail?})` · `withDirections(storyboard, timings)` · `sceneText(scene)` | a silent scene's timing; a voice's timings completed with the silent scenes; a scene's text |
| `makeClock(storyboard, timings)` | phrases → seconds |
| `footprint-storyreel/ease` → `EASES` · `easeNamed(name, where?)` · `inOut` | the one ease table (`linear in out inOut back walk jump`) |
| `contactSheet(film, {moments?, columns?, width?})` | a PNG of stills |
| `frameHashes(film, {count?, width?, times?})` · `changedFrames(pinned, now)` | pixel pins |
| `whiteboardKit` · `cartoonKit` · `loadTheme('paper' \| 'storybook')` | the built-in looks |
| `footprint-storyreel/studio` → `startStudio({load, watch, port})` | the preview studio |

TypeScript types ship with the package: the main entry, `/studio`, and the documented subpaths (`/clock`, `/pacing`, `/ease`, `/pins`, `/sheet`, `/render`, `/pipeline`, `/film`, `/strings`, `/theme`, `/reading`, `/regions`, `/kits/whiteboard`, `/kits/cartoon`). The drawing internals a kit author may reuse (`/pen`, `/ground`, `/sound`, `/notes`, `/kits/paper`, `/kits/paper/code`, `/kits/whiteboard/board`) are plain JavaScript without types.


## Laws

1. **Data only.** A recipe names shapes, phrases and numbers; an unknown key refuses. Nothing in a recipe runs.
2. **Phrases, not seconds.** Pictures follow the voice; change the voice and the film follows. Seconds appear only where the storyboard declares a silent scene, as each direction's length.
3. **Pure function of time.** `frame(ctx, t)` draws any moment in any order, the same way every time.
4. **Every frame restores the canvas**: no leaked transform, alpha, compositing, shadow, filter or clip (the test fills the whole frame after each one and reads its corners).
5. **One focal point at a time**: speech is a bubble, data is a pill, the old stage leaves before the new one arrives, one camera move at a time.
6. **Long enough to read.** A line meant to be read stays up about 0.3 s a word.
7. **Notes change the camera, never the beats.** Every note says what was asked; one the film cannot honour refuses.
8. **Say what made it.** The making-of record lists every phrase → drawing, every note, every tool, and the compile stage by stage.
9. **Pinned pixels.** An approved film stays the approved film until a change is meant.

## Not in this package

StoryReel is for teaching and story films. **Screenshots shown as evidence are in scope**: a real
screen or a real result, shown so the viewer sees the actual thing a lesson is about, is the honesty law
at work, not marketing. **Marketing polish is not**: launch videos, brand campaigns and polished product
shots are left out on purpose; a launch-video tool such as
[`/brag`](https://github.com/latent-spaces/brag) (a Claude Code skill, MIT) fits better. What comes
next here — recipe kinds, a library explainer generated from a repository, vertical teasers — is in
[BACKLOG.md](BACKLOG.md).

## What it uses

| library | licence | for |
|---|---|---|
| footprintjs | MIT | the pipeline and its making-of record |
| @napi-rs/canvas | MIT | drawing |
| perfect-freehand | MIT | marker strokes |
| roughjs | MIT | sketched shapes |
| shiki | MIT | code tokens |
| Caveat (font, bundled) | SIL OFL 1.1 | handwriting |
| FFmpeg (separate program, on PATH) | LGPL/GPL | encoding and mixing |

Node 22+. Licence: MIT (the bundled Caveat font: SIL OFL 1.1, `fonts/caveat/OFL.txt`).
First user: the AgentFootprint video course.
