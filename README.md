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
an episode: world → world → paper → world → recap …   each scene a shot, entering by one of a dozen transitions
then:       one film → a version for every place it is posted: 16:9, 1:1, 4:5, 9:16, captions burned in
```

## Why StoryReel

- **Pictures follow the words, not the clock.** Every drawing is tied to a spoken phrase. Record the
  voice again, slower or in another language, and the film follows; a phrase that is not in the
  script refuses the recipe instead of drifting.
- **Honest by construction.** Values on screen can be read from real data (a recorded run), every
  number on screen names its source (or sits in a scene marked as example data), a line too short to
  read is reported (or refused), and every film says how it was made.
- **The same frames every time.** `frame(ctx, t)` is a pure function of time. Pixel pins catch any
  change that moves a pixel, so a film you approved stays the film you approved.
- **Direct it like a director.** Camera words as data (`speed`, `cut`, `push`), camera moves by name (a dolly
  in, an orbit, a rack focus, a dutch angle, a freeze…), a collection of transitions to cut between shots, and a
  local studio where you scrub, play with the voice, and click a drawing to find the line of the recipe that drew it.
- **One film, every platform.** The same film renders as a YouTube video, a square feed post and a
  vertical Short or Reel — with a title band, captions burned in from the voice's own word times, and a
  crop that follows the action — or with caption files for players that show their own.

## Install

```bash
npm i footprint-storyreel
```

- **Node 22 or later.**
- **FFmpeg on your PATH** to render MP4s (`brew install ffmpeg`, `apt install ffmpeg`, …); breaking a reference film
  down needs FFmpeg 5.1 or later. Compiling, drawing frames, the studio and the checks need no FFmpeg.
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
silent cut `paceTimings` shifts the word times the same way. `makeFilm` only reads the voice folder: it
paces a copy of what the render reads (`timings.json` and each scene's audio, which must be named inside
the folder) and moves it to `<out dir>/narration`, so an out folder that overlaps the voice folder refuses.

### Numbers: shown in digits, said in words

A voice drops or garbles digits — and sometimes the words for them. Write a number once for each side
with a **number slot**: the captions show `shown`, the voice says `spoken`:

```json
{"id": "frame", "narration": "One frame takes 16.67 ms at 60 Hz.",
 "say": [["16.67 ms", "sixteen point six seven milliseconds"], ["60 Hz", "sixty hertz"]]}
```

The scene's text is what is spoken (`spokenText(scene)`), so the voice's word times line up with it; a
beat may name a phrase either way (`["frame", "takes 16.67 ms"]` and `["frame", "takes sixteen point six
seven milliseconds"]` are the same moment); the captions and caption files show `16.67 ms`, timed from the
first spoken word of the slot to its last. Each `shown` must appear in the narration, in order, and
`spoken` is words only. `unsaidNumbers(storyboard)` lists digits left without a slot, so a voice tool can
refuse them before it speaks. The slots are [footprint-narration](https://github.com/footprintjs/footprint-narration)'s
(`spokenMap`, `checkSlots`, `shownWords`, `normSpeech`), the package StoryReel shares with StoryDeck — which
also says, automatically, what a voice should read for the text nobody marked (`autoRules`).

**Listen back.** Forced alignment fits every script word somewhere in the audio, so a word the voice
dropped still gets a slot and a plausible time. The voice tools' word check also transcribes the audio
freely and lines it up with the script; a word whose letters were mostly not heard is reported as **not
heard**. `makeFilm` reads the voice folder's `word-check.json` into `making-of.json` (`voice`: low words,
not-heard words, stale when older than the timings), and `voiceCheck: 'refuse'` refuses a film with a word
not heard.

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
  `stages`, `guesses`, `notes`, `recalls`, `poster`, `reading`, `watching` and `paperStyle`; any other key refuses,
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
panel is centred) and hand over to each other on it. A shot enters with `enter`, a transition from the
collection below (a fade when it is left out). Three quarters of the change happens in the silence
before the scene's first word.

```json
{"story": {"kit": "whiteboard", "items": [ … ]},
 "stages": [
   {"type": "world", "scene": "valley", "enter": "fade", "world": {"kit": "cartoon", "flock": { … }}},
   {"type": "code", "scene": "rule", "enter": "wipe", "chrome": false, "code": {"file": "count.ts"}, "reveal": [ … ]},
   {"type": "world", "scene": "again", "enter": {"type": "iris", "at": [800, 420]}, "world": {"kit": "whiteboard", "items": [ … ]}}]}
```

### Transitions

A video editor keeps a collection of transitions — Premiere's *Video Transitions*, Final Cut's
*Transitions browser*, DaVinci Resolve's *Effects library* — many looks for the one behaviour, grouped in
families, each with a default length and a few settings. StoryReel keeps the same collection, as data a
recipe names:

![Every transition, a row each: picture A becoming picture B at a fifth, two fifths, three fifths and four fifths of the change](https://raw.githubusercontent.com/footprintjs/storyreel/main/docs/transitions.png)

| family | transition | what it does | settings (default) | length | sound |
|---|---|---|---|---|---|
| cut | `cut` | the new shot, whole, on the scene's first frame | – | 0 | – |
| dissolve | `fade` | a cross-fade (the default entrance) | – | 0.8 s | – |
| | `dip` | out to a colour, then in from it: the two pictures never show at once | `color` (`#000000`) | 1 s | – |
| wipe | `wipe` | an edge crosses the frame | `from`: `left` · `right` · `top` · `bottom` (`left`) | 0.8 s | slide |
| | `split` | doors open from the middle | `line`: `vertical` · `horizontal` (`vertical`) | 0.8 s | slide |
| | `clock` | a clock hand sweeps from twelve | – | 0.9 s | slide |
| iris | `iris` | a circle opens from a point | `at`: `[x, y]` (the centre) | 0.8 s | slide |
| motion | `push` | the new picture pushes the old one out | `from` (`right`) | 0.7 s | slide |
| | `slide` | the new picture slides over the old one, which stays | `from` (`right`) | 0.7 s | slide |
| | `whip` | a fast push that streaks, as a camera turned quickly blurs | `from` (`right`) | 0.4 s | whoosh |
| zoom | `zoom` | the old picture rushes forward and fades while the new one settles | `at` (the centre) | 0.6 s | whoosh |
| page | `page` | the old picture is a page that lifts from its right edge and turns over | – | 1.1 s | slide |
| match | `through` | the camera goes through a thing in the old picture (a window, a screen) and the new picture is what was inside it | `region` (required), `shape`: `box` · `round` (`box`) | 1.2 s | whoosh |
| | `match` | a thing in the old picture becomes the same thing in the new one: they meet, same place, same size, at a dissolve | `region` (required), `into` (the same name) | 1 s | – |

```json
"enter": "push"
"enter": {"type": "through", "region": "window"}              through the old picture's window into the new one
"enter": {"type": "match", "region": "ring", "into": "loop"}  the old ring becomes the new picture's loop
"enter": {"type": "push", "from": "left", "seconds": 0.5}
"enter": {"type": "dip", "color": "#ffffff"}                  a dip to white
"enter": {"type": "whip", "sound": false}                     no sound
"enter": {"type": "slide", "ease": "spring"}                  slides in, overshoots a little and settles
```

Every entrance also takes `seconds` (0.2–3), `ease` (a name from the ease table, or a four-number curve as CSS
writes it, `"cubic-bezier(0.16, 1, 0.3, 1)"`) and `sound` (a sound's name, or `false`). An ease that goes past
the end (`back`, `outBack`, `spring`, or a four-number curve whose y leaves 0..1) is refused where the frame's
edge would show — only `slide` takes one. An unknown name, key or setting refuses, naming what the transition
takes: `enter has unsupported key at (a push takes seconds, ease, sound, from)`.

**A move as an entrance.** A shot can also arrive the way a card or a logo does: by a move from the
vocabulary (see [Moves](#moves-motion-asked-for-by-name)), the new picture moving in over the old one on the
move's own seconds and curve:

```json
"enter": {"move": "soft-rise"}                                 rises a little and fades in, gliding to rest
"enter": {"move": "iris-open", "seconds": 0.8, "sound": "slide"}
"enter": {"move": "pop", "feel": "heavy"}                      the same move on the heavy spring
```

A move entrance takes `move`, `seconds`, `feel` (another curve: a move feel or a spring's) and `sound` (none
by default). The moves a whole picture can make are the entrances that fade, move, scale, blur or uncover it —
`fade-slide`, `soft-rise`, `mask-wipe`, `iris-open`, `overshoot`, `bounce-landing`, `spring-follow`, `pop`,
`blur-in`, `scale-in`, `drop-in`, `slam`; one that counts, draws or splits text needs the thing itself, and
refuses, naming these. A move of the recipe's own is data too: `"enter": {"move": {"name": "drift-in", "kind":
"entrance", "feel": "soft", "uses": ["ui"], "seconds": 0.5, "ease": "outQuint", "props": {"x": [400, 0]}}}`.
The old picture shows only where the move's own start shows it, and only until the new picture is in place: on
its way in a picture never goes past its place on the far side (where a sliver of the old picture would open at
the frame's edge) and never shrinks below the frame unless it started smaller; once each property first reaches
its rest it is held there, so a bouncy picture never swings back off its place and a `pop` never dips below full
size after its swell (it still swells past full size: that only covers more). The moment each property arrives is
worked out once, when the entrance is read, so every frame is still a pure function of time. A blurred picture is
blurred whole and exactly where it is, its edge blurring into its own colours (its edge rows stretched out under
the blur), so nothing moves when the blur ends. No kit transition setting may be called `move`.
Films that do not name a move draw exactly as before.

**Through a thing.** `through` and `match` go through something drawn in the pictures, named the way a
kit names what it draws (`regionsAt(t) → [{box, path, label, name}]`, the names a push note frames). The
built-in kits name things too: a whiteboard item's `"name": "pebble"`, and the cartoon's `sun`, `shepherd`,
`sack`, `pen`, `gate` and (after the eureka) `bulb`; `node examples/match/make.mjs` turns a board's circle into
the sun and goes back through the shepherd's idea. The
film finds each named thing once, when it is built: in the picture the change leaves at its first moment, in
the one it arrives at at its last — so every frame of the change is still a pure function of time, and a name
the picture does not have refuses then, naming the ones it has: `stage loop: the through looks for "window" in
the picture it leaves, and nothing in the picture is called "window" at 12.40 s; the names there are screen,
ring`. `through` zooms about the one point that leaves still while the new picture, fitted inside the
opening, grows to fill the frame; near the end the opening widens to the frame's edges. `match` pushes the old
picture in on its thing and pulls the new one back from its own, so the two meet half way at a quick
dissolve — at least 1.3 times the larger one's size, and larger when they are far apart, because a camera
that zooms only in must zoom far enough to carry its thing to the meeting point without uncovering an edge.
Both end on the new picture exactly.

**A kit adds its own**, as Final Cut takes Motion templates and Premiere takes `.mogrt` files, and a recipe
names it like a built-in one. Every transition — built in or not — draws through one contract:

```js
const stageKit = {name: 'stage', transitions: {curtain: {
  family: 'theatre', seconds: 1.2, ease: 'inOut', sound: 'whoosh',
  params: {color: {color: true, default: '#7a1020'}},          // settings: {oneOf}, {point}, {color} or {number: [min, max]}, each with a default; or {name: true}
  draw(ctx, {e, from, to, p, ghost, theme, boxes}) {          // e: 0..1, eased; from(c) / to(c) draw the two pictures
    (e < .5 ? from : to)(ctx);                                // cover the whole frame at every e
    const closed = 1 - Math.abs(1 - 2 * e);
    ctx.fillStyle = p.color; ctx.fillRect(0, 0, 800 * closed, 900); ctx.fillRect(1600 - 800 * closed, 0, 800 * closed, 900);
  }}}};
// "enter": {"type": "curtain", "color": "#000000"}
```

**Held layers.** A world may draw an `overlay(ctx, t)` on the frame: it is drawn over the picture and outside
its camera, so a transition or a director's push never moves it — a presenter in the corner stays in the corner
while a match cut zooms the pictures under him. Through a change of picture the leaving shot's layer crosses into
the arriving one's, mixed as light is, so the same layer in both shots stays exactly itself (and a layer only one
shot has fades out or in with the change).

`ghost(alpha, paint)` paints a picture whole into a scratch picture and lays it over at that alpha (a
see-through picture must be drawn whole: canvas alpha on its parts shows the seams). A transition that goes
through things says which with `regions: p => ({from: [p.region], to: [p.into]})` and reads where they are in
`boxes.from[name]` / `boxes.to[name]` (`[x0, y0, x1, y1]` on the frame); a `{name: true}` setting is the
recipe's name for one (no default: the recipe must give it). A kit's transition
may not take a built-in name or another kit's. `transitionSheet({catalog})` draws any collection on one
PNG (`node examples/transitions.mjs` wrote the picture above), and the studio shows it under
**Transitions**.

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
- **`push` on a named thing** — `{"on": "robot", "size": "close", "from": …, "to": …}` frames a thing the world's
  kit names (its regions carry `name`), the way a crew frames a subject: **`medium`** (it fills half the frame),
  **`close`** (about three quarters) or **`insert`** (a detail, nearly all of it). The zoom follows from how big
  the thing is when the push starts (its worlds ready, before any other push), so a director says *close on the
  robot* instead of guessing a number. A name nothing in the picture has refuses, listing the names there, and so
  does a name two things share; a thing that already fills the frame refuses, naming the framings that would push
  in (or none); a thing so small a framing would need more than ×3 refuses too (push at a point with `at` and
  `zoom`), so a framing word always means what it says. `on` takes `size`, never `zoom` ("wide" is the shot itself).
- **`push`** — the camera pushes in on `at` (a point on the 1600×900 frame; the studio gives it to you)
  by `zoom` (default 1.25), easing in (`seconds`, default 1) from the phrase `from` and out from `to`.
  The picture always covers the frame; guess cards stay where they are. A push stays on one picture:
  one that runs across a hand-over, an entrance, a cut, the push-in or the teaser refuses, and so does
  one over a spotlight, a kit's own camera move (`cameraMoves`) or another push — one camera move at a time.

The film returns the notes as applied (`film.notes`: what each one changed, and when), and the
making-of record lists them.

### The string table

Write an on-screen word as `{"$string": "key"}` anywhere in the recipe, and pass the language's
table (`strings: {"key": "text"}`). (The older spelling `{"string": "key"}` is refused with this one as
the fix when the table has that key.) A key the table lacks refuses the recipe, and so does a key
with no table; the making-of record lists the language and the keys used. (A second language
also needs its own narration; the recipe's phrases are its English cues for now.)


## Planning the shots

A film crew plans every shot before it rolls: what the shot is FOR, what is true when it starts and when it
ends, and how much it asks the viewer to take in. StoryReel keeps the same plan as data, beside the story and
each stage, so a film can say what each shot does, and the compile can catch a story that contradicts itself.

```json
{"type": "world", "scene": "race", "enter": "push",
 "intent": "Show the app refusing an offer the person made stale.",
 "continuity": {"start": {"order": "none", "size": "M"}, "end": {"order": "none", "size": "L"}},
 "world": {"kit": "shop", …}}
```

- **`intent`** — what the shot is for, in **one sentence** (at most 140 characters): one shot, one clear beat.
  A second sentence refuses ("give the second idea a shot of its own"); abbreviations and initials ("Mr. Robot",
  "e.g. Here", "U.S.", "3 p.m.") are not sentence ends. The check reads punctuation, so its refusal says where
  it saw a second sentence and how to spell an abbreviation out.
  `film.shots` lists every shot — the story, then each stage — with its intent and when it is on screen, and
  the studio's *Shots* list shows them.
- **`continuity`** — the facts true when the shot starts and when it ends: `{start: {…}, end: {…}}`, each fact
  a word, a number or true/false. The film walks the shots in order, carrying the facts forward: a shot's
  `start` must agree with what the shots before it left, or the recipe is refused, naming both shots:
  `Continuity: stage race starts with order = "none", but stage second left it "placed". Show the change …`.
  A shot may change anything between its own start and end (that is what it shows). The facts are your
  words: the check compares what you declared, and never pretends to see the pictures.
- **Where they go.** On a stage (beside `world` for a world stage — inside `world` they refuse, because that
  is the kit's own spec) and on the story (`"story": {"kit": "…", "intent": "…", …}`; the engine reads them
  and hands the kit the rest).
- **Too much, too fast.** The moments of a shot are the phrases the recipe names while it is on screen;
  moments closer than a quarter of a second count as one, and phrases that are nothing to see are left out
  (a push's camera words, a teaser's rewind, the poster, the recalls). More than **4 moments in 2 s** is a
  burst — too fast to take in. `film.watching` lists the bursts (the studio's *Too much, too fast*, and the
  making-of record); `"watching": "refuse"` refuses. How many moments a shot carries is information, never a
  verdict — `film.shots[i].moments` — because a list revealed one item per spoken word is many moments and
  one beat. Whether a shot is one beat is what its one-sentence intent says.
- **Film order.** The shots are listed and checked in the order they play, whatever order the recipe lists
  its stages in.

```js
const film = await compileFilm({storyboard, timings, recipe, kits});
film.shots.map(s => `${s.where}: ${s.intent ?? '(no intent)'}`);   // what each shot is for
film.watching;                                                      // [{kind: 'burst', where, at, moments, seconds}]
```

### Reads: what the viewer must take in

An intent says what a shot is for; **reads** say what the viewer must understand, and when — timed by
meaning, not by movement. Each read starts on a phrase, needs a least time to land (`min`, 2 s by
default) and may name the thing it is about (`region`, a name the kit gives in `regionsAt`):

```json
{"type": "world", "scene": "loop", "intent": "Name the loop: change the picture, show it, at a speed.",
 "reads": [{"what": "the ring is a loop that keeps turning", "at": ["loop", "That is a loop"], "min": 2},
           {"what": "each turn changes the picture", "at": ["change", "It changes the picture"], "min": 2.5, "region": "ring"}],
 "world": {"kit": "draws", "shot": "ring"}}
```

One read at a time: `film.reads` lists every read, timed, with a `problem` when two overlap, when the shot
ends before one lands (lengthen the scene's tail), or when its region is not drawn at that moment; with
`"reading": "refuse"` the recipe refuses them. A short label gets a fairer reading time with
`"reading": {"pace": "letters"}`: 1.5 s to find the line, then a fifteenth of a second a letter
("change the picture": 2.6 s instead of 1 s).

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
  or names the fields FFmpeg left unread). When the true-peak limit is what blocked one gain, the record says
  how loud one gain can go (`… reaches the -1.5 dBTP limit at I = -18.6 LUFS — ask for loudness I -18.6 or
  lower to keep one fixed gain`). A perfectly steady sound measures a range of exactly 0, which
  FFmpeg reads as "not measured"; it is sent as 0.1 and `measured` keeps the 0. The making-of record keeps
  it all and **flags every type that is not `linear`**:
  ```json
  "loudness": {"type": "linear", "target": {"I": -16, "TP": -1.5, "LRA": 15},
    "measured": {"I": -37.97, "TP": -25.21, "LRA": 14.2, "thresh": -50.36, "offset": 21.5}}
  ```
- **The making-of record** (`making-of.json`, written by `makeFilm`): every phrase → the recipe entry it
  triggered and when, the director's notes as applied, the lines too short to read, the pacing, the
  poster, the loudness as measured and set, the tools and versions — the film's own footprintjs run —
  and, under `compile`, the compile stage by stage (the narrative of its record, below). A version made
  for a platform says so: `"version": {"format": "vertical", "motionBlur": 4, "captionFiles": ["captions.vtt"]}`.

## Three verdicts: no slideshow, parts that hold, numbers with a source

Some questions about a film have a yes or a no: is it a slideshow? Does the drawing hold together? Does every
number on screen say where it comes from? StoryReel answers each with a **verdict** — `passed`, `failed`, or
`not run` — decided with footprintjs's `decide()`, so the record of the run that asked keeps *why*: the rule that
matched, the values it read and the thresholds it compared them with. A check that cannot run (no parts, no facts)
says `not run` and why; it never passes.

```js
import {reviewPart} from 'footprint-storyreel/review';
const r = await reviewPart(film);     // the hello example
console.log(r.verdictText);
// No slideshow · passed: the shots move inside themselves: most of their running time is never held still for more than 3 s (32 % of 27.8 s dead, 63 % still; held still: stage rule 75 %)
// Drawn parts hold together · not run: no kit on screen gives its parts (parts(t))
// Every number has a source · not run: the storyboard names no facts, so the numbers outside example scenes cannot be checked (4 numbers on screen: 0 sourced, 0 in example scenes, 4 unchecked)
r.record.filter(e => e.type === 'condition').map(e => e.text);
// [Condition]: It evaluated Rule 2 "the storyboard names no facts, so the numbers outside example scenes cannot be checked": factsGiven false eq false ✓, open 4 gt 0 ✓, and chose claims/not run.
```

`r.verdicts` is the same as data, `[{check, label, verdict, why, measured, summary}]`, every verdict check in order.
A failed verdict's reasons are findings too (`r.findings`, `r.text`): the stretches held still, the parts that break,
the numbers with no source. `npx storyreel review` prints the verdicts under the findings. A verdict check of your own
is `{label, why, notRun, when(scope), measure(review) → {measured, hits}, verdict: {rules, passed}}` in `checks`:
each measured value goes on the scope by its name, for the rules' filters (`{deadShare: {gt: .5}}`).

The example films, as the review answers them (pinned in `test/slideshow.test.mjs`):

| film | no slideshow | drawn parts | numbers |
|---|---|---|---|
| `hello` | passed: 32 % dead, 63 % still (`stage rule` 75 % dead) | not run (no parts) | not run: 4 numbers drawn (the card's "sheep 1", a 0 in the code), no facts |
| `recap` | passed: 15 % dead, 58 % still (`the story` 22 %, `stage code` 37 %) | not run (no parts) | not run: 12 numbers, no facts |
| `shepherd` | passed: 0 % dead, 0 % still | passed (21 parts) | passed: no number |
| `worlds` | passed: 0 % dead, 34 % still | passed (17 parts) | not run: 3 numbers drawn, no facts |

### No slideshow

A film whose shots do not move inside themselves is a slideshow, however well it cuts: a still picture, a cut,
another still picture, a voice over all of it (the anti-slideshow gate huashu-art-motion's film_gate runs). It is
measured, not guessed (`footprint-storyreel/slideshow`):

- **Each shot in its middle.** A shot (`film.shots`: the story, then each stage) is measured with every change of
  picture cut out (`film.changes`: its own entrance, the next shot's, a hand-over on its page, a cut — a cut has no
  length, and no step crosses it), so a transition never counts as the shot moving.
- **Frames drawn small.** The middle is read as frames 160 px wide, each pixel a 10×10 cell of the frame, a few
  times a second (the review's own frames: the picture is drawn once for every check). A step between two frames
  **moves** when at least `area` of the cells (0.0002: about 300 px² of the frame) changed by more than `level` (4
  grey levels: a 1-px line of ink drawn across a cell moves it 19; the tail of a fade moves less). A frame is a pure function of time, so a picture that does not move
  draws exactly the same pixels; on the example films the verdicts are the same for any `area` from 0.0001 to 0.001.
- **Dead time.** A still stretch is **dead** when it holds for more than `hold` (3 s: a slide held up, where a pause
  between two moves is a beat) — or when it is all of a shot that never moves, however short (slides of 2.5 s,
  crossfaded, are all dead). The film **fails** when more than half (`most`) of its shots' running time is dead. The
  dead stretches are its findings (`stage two holds still: 100 % of its 6.5 s is dead (still for more than 3 s at a
  time)`); one frozen for 5 s or more is the **still** check's to name when it runs, so it is said once — and the
  shots that hold still are listed with a passing verdict too, as data. Measured: still cards with cuts, 100 %; slides
  of 2.5 s, 100 %; a card turning to a new page every 5 s, 63 %; every 1.5 s, 0 %. A kit cannot exempt itself.
- **Two ways round it, closed.** A shot whose changes, all its steps together, touch less than `cover` of the frame
  (0.25 %) never moves: a still card with a blinking caret is all dead (a thin caret changes no cell past `level` at
  all; the test's touches 0 %), while the example shot that moves least (worlds' code stage) touches 0.94 %. And the film fails, too, when more than `still` (85 %) of its
  shots' running time is still at all, however short each stretch: a deck swapped every 3 s holds no stretch past 3 s
  and is still 93 % of the time (its findings say so: `is still 93 % of its 10.5 s, in stretches of 3 s or less (a deck
  of slides)`); the stillest example film, hello, is still 63 % of the time. Real code films stay well under the cap
  (measured, compiled with their own voices and read every 0.25 s at 160 px): two lessons of a video course, 29 % and
  45 %; a starter film, 54 %; two episodes of a browser series, 26 % and 18 % (the second not voiced yet: even
  timings); the stillest single shot of any, 80 %.
  Their code stages animate what they reveal (no more than one change in five moves for a single step), so a word
  swapped in one step every 2 s — 88 % still — is a slide shown fast, not a code stage.
- **The two rules meet at a deck that changes a word.** Slides that differ by one digit or one short word fail on every
  platform, but which rule fails them rides on the font: where the changed glyph is a different width (proportional
  digits, as macOS's sans-serif has: "1" is 21 px wide at 60 px, "2" 32 px) the rest of the line shifts, the changes
  cover 1.1 % of the frame, and the still cap fails it; where it is the same width (tabular digits) only the glyph
  changes, under 0.25 %, and the shot never moves — all of it dead. The verdict is the same; the reason differs, and the
  record says which.

It is not the **stale** check, and does not repeat it: stale asks whether anything *new* comes (a scene, a beat, a
word not on screen a moment before) while the picture moves; this asks whether the picture *moves* between the new
things. A code stage that reveals a line every few seconds is never stale, and can still be a slide; a world that
drifts for ten seconds with nothing new is stale, and moves. Nor is it **still**, which names one stretch frozen
for 5 s; this weighs every stretch held more than 3 s against the shots' running time. All four example films pass:
`hello` and `recap` (a whiteboard and code stages, still between their reveals) hold still for a third and a sixth of
their time.

```js
import {slideshowOf, SLIDESHOW} from 'footprint-storyreel/slideshow';
const s = slideshowOf(film);             // {shots, seconds, still, dead, deadShare, deadShots: [{where, deadShare, deadAt, …}]}
slideshowOf(film, {rule: {...SLIDESHOW, hold: 4}});    // the thresholds are data
```

### Drawn parts hold together

An arm that floats off its shoulder for three frames, two legs that pass through each other, a foot that skates
while the body walks: the eye catches these at once, and nothing that reads the picture as text can. A kit that
wants its drawing audited gives its **parts** — the numbers it draws them from, in its own coordinates (before any
camera) — and the audit checks them over time, as an anatomy check reads a figure (`footprint-storyreel/geometry`):

```js
parts(t) {   // on a world (a stage kit: parts(handle, t))
  return {
    segments: {
      'arm left':  {a: [x - 26, y - 135], b: [x - 52, y - 110], width: 16, mount: 'robe'},   // a: the root, on its mount
      'hand left': {a: [x - 55, y - 108], b: [x - 55, y - 108], width: 18, mount: 'staff'},  // a hand on the staff
      'staff':     {a: [x - 58, y], b: [x - 58, y - 250], width: 9},
      'foot 1':    {a: heel, b: toe, mount: 'leg 1', contact: planted ? 'a' : false},  // resting on its heel (walk.mjs)
      …},
    regions: {robe: [x - 52, y - 150, x + 52, y]},       // boxes a part can be mounted on
    apart: [['arm left', 'arm right']],                  // pairs that must never cross
  };
}
```

- **Mounted.** A segment's root `a` lands on its `mount` — a segment (touching it, both widths counted) or a region
  (inside it) — within `reach` (2 px); `ends: 'mounted'` holds its tip `b` there too (a strap, a hand rail).
- **Apart.** A declared pair's centre lines never cross; a joint they share (two legs from one hip) is no crossing.
- **Planted.** `contact` names the end a segment rests on — `'a'`, `'b'`, or `true` (flat: both) — and `false` in
  the air. A planted end may never be more than `slide` (1 px) from where it was first planted, until the part lifts:
  a drift of a fraction of a pixel a moment adds up, and fails. Read it from the pose — walk.mjs's feet are planted
  while their `lift` is 0 — and, for a foot that rolls, name the end it rolls about: the heel while its toes are up
  (`angle > 0`, as it lands), both when it is flat, the toe while its heel is up (`angle < 0`, as it pushes off). A
  figure walked by it passes; one whose feet skate under the body fails, and so does a foot turned about its heel
  while it should rest on its toe.
- **Sampled.** Every `every` seconds (a frame at 30 fps), over the part reviewed (`film.partsAt(t)` lists what the
  kits on screen give, on the picture's clock, `film.pictureAt(t)`); moments further apart than that (the parts were off
  screen in between) start the planted ends again, and so does a jump of the picture's clock (`jump`: it ran more than
  3 × the film's — a camera freeze letting go; a speed ramp, at up to 2.5 ×, is the same picture moving on, and a freeze
  holding still keeps its feet where they were). It **fails** when anything breaks, naming the part and when (`story: "foot 1" slides while it is planted`);
  it is **not run** when no kit on screen gives its parts, or when the parts declare nothing to check.

The cartoon kit gives its parts — the shepherd's staff, arms and hands, each sheep's body and legs, a standing
sheep's feet planted — from its shape: the same numbers it draws from (`shepherdShape`, `sheepShape`), so the audit
checks the drawing itself, and fails when the drawing does (pinned: the staff and arms are strokes the frame draws).

### Every number has a source

A number on screen reads as a fact. Every number the film shows — its lines (titles, footers, list lines, a world's
words, guess cards, the push-in caption), its emphasis words, its captions as shown (a number slot in its digits) and,
in the review, every word the picture draws (a kit's own words, a card's rows, code) — must match a **fact** the
storyboard names, or sit in a scene marked as **example data** (`footprint-storyreel/claims`):

```json
{"title": "Frames", "facts": "facts.json", "scenes": [
  {"id": "rate", "narration": "A screen draws at 60 Hz, so one frame takes 16.67 ms."},
  {"id": "shop", "example": true, "narration": "Say a stall sells 12 cups in a morning."}]}
```

```json
[{"value": 60, "text": "60 Hz", "source": "https://example.org/display-rates"},
 {"value": 16.67, "source": "docs/frames.md"},
 {"value": -5, "text": "−5 °C", "source": "met-office/2026-01-12.csv"},
 {"value": "3:15", "text": "at 3:15", "source": "run.json#steps[2].at"}]
```

- **A fact** is `{value, text?, source}`: `value` the number as the screen shows it, its sign too (`16.67`, `-5`,
  `1000000` for "1,000,000"; as written when it is not one value: `"1,000"`, `"3:15"`); `text` the words it is shown
  with — they must stand around it in the line that shows it, so `60 Hz` is not `60 sheep`, and `6 Hz` is not the 6 in
  "6 apples and 16 Hz"; `source` where it comes from: an http(s) URL; a file inside the film's root that is there (a
  document, or a record with a pointer into it after `#`: `run.json#steps[2]`) — a path that is there outside the root
  refuses; or anything else ("Smith, 2020", "trust me", "/r/science thread": words that lead to no file are words,
  whatever they start with), which passes, kept as **unverified**: the verdict counts the
  numbers that rest on a source nobody can follow, and says so (`4 sourced (1 on a source nobody can follow:
  unverified)`). `facts` is a JSON
  file inside the film's root, or the list itself. The facts draw nothing, so they are in no segment's key (a source
  corrected redraws nothing): they are hashed on their own, `film.inputs.facts`, and an approval locks them. A fact
  that is not one refuses, naming the fix.
- **An example scene** (`"example": true`) says so on screen: an "Example data" label in the top right corner (the
  emphasis corner label's look) — in a format that crops the frame (portrait, vertical), in the corner of what the crop
  shows — over the scene, and on after it while any line the scene shows is still on screen (a whiteboard keeps its
  writing into the next scene; the label stays with it: `film.claims.labels`), to the line's last ink: an eraser that
  starts 0.4 s after the cut and wipes for 0.8 s keeps the label up until 1.2 s, not 0.4 s (a kit's `texts()` says
  when a line's last ink goes as `gone`). `"example": "Beispieldaten"` puts the
  label in the film's language. Its numbers need no source while they are labelled, and the label is in the key of
  every segment that shows it. Beside a real number, a lingering label seems to cover that number too, so the review
  says so (**example data over real numbers**: `an example line lingers into scene real beside real numbers (60):
  erase it before the scene`) — erase the example line before the next scene starts.
- **The numbers** are found the way the voice tools find digits (footprint-narration's `unsaidDigits`), with their
  sign — a minus, the minus sign or an en dash standing on its own: "−5 °C" and "–5 °C" are −5, which a fact for `5`
  does not source — less a digit run that is part of a name: right after a cased letter (H2O, MP4, v2), or after a
  hyphen after one (COVID-19, B-52, ISO-8601, A-1000, UTF-8) — unless it is a year (1000–2199) after a lower-case word
  or a time prefix (mid-, pre-, post-, early-, late-, in any case): "mid-2024", "pre-2020", "post-1990" are numbers,
  which need a source. A unit written onto a number stays a number
  (60Hz, 4K), and a number after a CJK character is a number (価格は100円).
- **Read in the film's language.** A number is read by the language the film is shown in: `lang`, one BCP 47 tag
  (`compileFilm({…, lang: 'de'})`, `film.lang`; `makeFilm`'s `lang`, which also names its string table, is the same
  value), its group and decimal symbols and its grouping taken from `Intl.NumberFormat(lang)`. In `de` "2,5 kg" is 2.5
  and "1.299,99 €" 1299.99; in `fr` "2,5" is 2.5 and "1 299,99" (a narrow or plain no-break space) 1299.99; in `en-IN`,
  `ta`, `te` and `hi` "1,00,000" is 100000 (Indian grouping); in `en` "1,000" is a thousand. What the language does not
  write as one number ("16.67" in `de`, "2,5" in `en`) is kept as written. Without a language, a number the languages
  read apart — "1,000" and "1.000" (a thousand, or one?), "2,5" (a decimal comma, or a list?), "1,00,000" — is
  **ambiguous**: kept as written, so only a fact that writes it the same way (`"value": "2,5"`) sources it, never `2.5`,
  and the fix says how to give the film its language. What every language reads alike is one value ("1,000,000",
  "1,299.99" and "1.299,99", "16.67"). Typed and drawn numbers are read by the same rule, and the language is in what an
  approval locks (`film.inputs.lang`). An as-written number is sourced only by a fact written the same way: `"2,5"`
  sources "2,5", and a fact of 2.5 does not, however its digits print.
  A language's own digits are numbers too — Arabic-Indic (`ar-EG`: "١٢٣٤", and "1٬234٫5" with its own separators is
  1234.5), Persian (`fa`), Devanagari (`hi-IN-u-nu-deva`: "१,००,०००"), Bengali (`bn`), Telugu, Tamil, Thai, the
  full-width digits and separators of Chinese and Japanese text (`ja` "１，０００円" is 1000, "３．５kg" 3.5, "－５℃" −5;
  the ideographic comma 、 separates a list, never a group) — and in a
  film with no language a digit of any script is read as a digit; a number that mixes scripts ("١2٣") is ambiguous. Two
  writings to watch:
  - **French with a plain space.** `fr` groups with a no-break space ("1 299,99": U+202F, which is what
    `Intl.NumberFormat('fr')` writes, or U+00A0). Typed with a plain space, "1 299,99" is two numbers, 1 and 299.99: write
    the no-break space (`'1\u202f299,99'`), or give the fact as written.
  - **International grouping in an Indian film.** `en-IN` groups 1,00,000; "1,000,000" is not how it writes a million, so
    it is kept as written: source it with a fact written the same way (`{"value": "1,000,000", …}`), or write 10,00,000.

  ```js
  const film = await compileFilm({storyboard, recipe, timings, lang: 'de'});   // facts: [{"value": 2.5, "text": "2,5 kg", "source": "…"}]
  film.claims.numbers[0];   // {number: '2,5', lang: 'de', source: '…', …}; with no lang: {number: '2,5', ambiguous: 'no language', source: null, …}
  ```

  `film.claims` lists them all: `{facts, examples, numbers: [{number, line, offset, at, to, scene, path, example,
  source, lang?, ambiguous?}]}` — one per place in a line (the same number twice in a line is two claims), from when the line is whole on
  screen to when it starts to leave, decided in the scene where the line is first shown.
- **What is drawn.** The review also reads the numbers in every word its frames draw — the words it reads for every
  check, so no frame is drawn again: measured, 1.9 ms for the 1,495 words of the hello example's 128 samples, against
  about 4 s for its whole review. Words on one line are read with a space between them, and as one only where their
  ink touches (a gap under 8 % of their height), a sign or a decimal point is written onto its digits ("16" then ".67
  ms" is 16.67; code tokens "-" then "5" are −5), or a lone point stands between digits within half their height (a
  code panel's tokens "16" "." "67" are 16.67, "$1" "," "299" "." "99" are 1,299.99, and `f(4,5)` drawn token by token
  is read as typed) — so "12" and "30" drawn 4 px apart are two numbers, never 1230, and so are two digit
  groups of different sizes: "$1,299" with a raised "99" is 1,299 and 99, since the picture does not say whether a
  raised group is cents, a power (10²) or a note. A number drawn a digit at a time reads as its digits (they stand
  5–22 % of their height apart, as two numbers drawn close do): draw a number as one string, as every built-in kit
  does. A drawn number counts once it **holds** — the same number, in the same place of the same line (the line with
  its numbers masked: "Sold 40 cups" and "Sold 40 kg" are two claims, each checked against its own facts), up for 0.5 s
  (`HOLD`) — so a typewriter's partials ("1", "12", "129" on the way to 1299, 0.33 s each at 3 characters a second) and
  a counter's passing values are no claims, and a line typed on past its number ("We sold 1299" while "cups" is typed)
  is one claim, the line it becomes. The hold is timed, whatever the review's step: the claims check reads the frames
  every 0.25 s or finer (the review's own reads when they are that fine; measured on the four examples at the default
  0.25 s, no frame read again and under 20 ms; at `every: 1` it reads 4 times the frames, 0.9–2.3 s against 0.3–0.7 s
  for their whole review, and finds the numbers the coarse reads missed — worlds' three), and reads a number's edges
  again every 0.05 s where the reads cannot tell: a number up for 0.5 s or more always counts, one up for less than
  0.4 s never does. A drawn number counts as example data only while the label is up the whole time it holds. A drawn number is a
  declared one when a declared line holds it and the drawn words are that line, or a word-bounded start or end of it;
  any other is a claim of its own (`path: 'drawn'`). `makeFilm`'s `check-claims` reads the declared lines only (it
  draws no frame).
- **Decorative text.** Words a kit draws that the film does not say — a code panel's line numbers, a strip's frame
  badges — are drawn through `decorative` (`footprint-storyreel/decorative`): the review reads them for every check
  (under the captions, over each other, cut off, how much there is to read), and the claims check leaves them out.

  ```js
  import {decorative} from 'footprint-storyreel/decorative';

  lines.forEach((line, i) => {
    decorative(ctx, () => ctx.fillText(String(i + 1), x + 52, y + i * lh));   // the line number: read, never a claim
    ctx.fillText(line, x + 72, y + i * lh);                                     // the code: its numbers need a source
  });
  ```

  The mark rides on the context while the function runs (a shared symbol, so a kit with its own copy of the library
  marks words the engine reads); a frame drawn without the review is unchanged by it. Mark the context the words are
  DRAWN on: text drawn onto an offscreen canvas and then laid on the frame is marked through that canvas's own context,
  never the frame's:

  ```js
  const sheet = createCanvas(400, 900), s = sheet.getContext('2d');
  decorative(s, () => s.fillText(String(i + 1), 40, y));   // marked where it is drawn; ctx.drawImage(sheet, 0, 0) carries the mark
  ```

  A step counter is decorative too — it counts the film's own steps, it claims nothing about the world:

  ```js
  decorative(ctx, () => ctx.fillText(`Step ${step} of 300`, 1500, 60));   // neither the step nor the 300 needs a source
  ```

  The built-in code stage draws no line numbers.
- **Code is read as code.** A code panel's numbers follow its programming language, not the film's: in a `de` film
  `x = 16.67` is 16.67 and `f(4,5)` is 4 and 5. Draw code inside `code` (the same module): its words are read with "."
  as the decimal mark, "," always a separator, never any grouping, and "_" between digits joining them as JavaScript
  and Python write it (`1_000_000` is 1000000; outside code "_" joins nothing) — and they still need a source. The built-in code
  stage marks its own code; a kit's code panel marks its own:

  ```js
  import {code, decorative} from 'footprint-storyreel/decorative';

  lines.forEach((line, i) => {
    decorative(ctx, () => ctx.fillText(String(i + 1), x + 52, y + i * lh));   // the line number: no claim
    code(ctx, () => ctx.fillText(line, x + 72, y + i * lh));                    // "f(4,5)": 4 and 5, in any film
  });
  ```
- **The verdict**: `failed` when a number outside an example scene has no source — each listed with its scene, its
  recipe entry and the fix (`"120" (scene rate, story.items[1]) has no source: add {"value": 120, "source": "…"} to
  the facts, or mark scene rate "example": true`); `not run` when the storyboard names no facts and a number shows
  outside an example scene; `passed` otherwise (a film that shows no number passes).

It is a verdict in the review (the numbers whose span meets the part reviewed), and a stage of `makeFilm`'s
pipeline, `check-claims`, right after the compile: the making-of record keeps it (`"claims": {verdict, why, numbers,
sourced, examples, unsourced: [{number, scene, path, at, fix}]}`) and the pipeline's record its `decide()` evidence. `makeFilm({…, claims: 'refuse'})` refuses a number
with no source before anything is drawn — and a film whose numbers cannot be checked — leaving the voice folder and
the last render's narration as they were:

```js
await makeFilm({storyboard, recipe, timings, out: 'out/film.mp4', claims: 'refuse'});
// The film shows 1 number with no source (claims: 'refuse'): "120" (scene rate, story.items[1]) has no source: …
```

The pipeline's check sees **declared lines only** — it draws no frame — and its refusal and record say so (`"saw":
"declared lines only (the review also reads what the picture draws)"`); a number only the picture shows (a card's row,
a kit's own words, code) is caught by the review.

## One film, every platform

Most people meet a film in a feed, on a phone, with the sound off. `renderFilm({…, layout})` renders the
same film in the shape each place plays — the film is always drawn on its 1600×900 frame, and the
layout puts that frame into an output picture of another shape, with a title band and a caption band
where the shape leaves room:

| format | size | where it is posted | the picture |
|---|---|---|---|
| `landscape` | 1920×1080 | YouTube, X, LinkedIn | the whole frame; captions over its foot |
| `square` | 1080×1080 | LinkedIn, X and Facebook feeds | title band · the whole frame · captions |
| `portrait` | 1080×1350 | Instagram and Facebook feeds | title band · a 4:3 crop · captions |
| `vertical` | 1080×1920 | YouTube Shorts, Instagram Reels, TikTok | title band · a 4:3 crop · captions |

```js
await renderFilm({film, storyboard, timings, narrationDir, out: 'out/shorts/teaser.mp4', motionBlur: 4,
  layout: {format: 'vertical',
    header: {title: 'Yes, no, or not enough evidence', sub: 'a talk'},
    captions: true,
    crop: [{at: ['story', 'a shepherd'], x: 330}, {at: ['story', 'for every sheep'], x: 900}]}});
```

- **Captions** are the voice's own word times (the forced alignment, or the even times of a silent cut),
  so they say exactly what is spoken, when: short chunks broken after punctuation (a chunk takes one word
  more rather than leave a word alone), the word being said in yellow. A silent scene's directions are
  never captioned, and the poster (the thumbnail) shows the title band without a caption. `captions: {maxWords, size, box}` changes the chunk length, the type size and the band.
- **The bands sit where the apps leave room.** A phone's full-screen player covers its top ~250 px with
  its own bar, the bottom ~420 px with the account name and the post's text, and the right ~120 px from
  the middle down with its buttons; Instagram shows a vertical video in its feed cut to 4:5. So in the
  vertical format the title, the film and the captions all sit between y 285 and 1460, inside what Shorts,
  Reels and TikTok leave clear: the film is a 4:3 crop, so the captions fit under it and never cover the
  picture — a teaching film's picture has words in it too (the players as they were laid out in 2026; a
  band's `box` moves it when an app changes).
- **A crop follows the action**: `crop` keys tie the crop's centre (an x on the 1600-wide frame) to spoken
  phrases, like every other key, and it eases from one to the next (centred until the first). A key's
  `width` (400–1600; the format's is 1200) shows more — `{"at": [...], "x": 800, "width": 1600}` is the whole
  frame, with the paper above and below, for a wide title card — or less, to come closer. The portrait and
  vertical formats crop; the others show the whole frame.
- **The bands take the film's own paper and ink** and its sans type (`film.theme`); `background` and
  `ink` change them.
- **Caption files.** `captionFiles: true` writes `captions.vtt` and `captions.srt` beside the video, on
  its clock (a partial render or an intro moves them), in cues of whole sentences on at most two lines —
  YouTube, LinkedIn and X play their own captions from a file, so a landscape version can carry a file
  instead of burned-in words. The chunks and the files are footprint-narration's (`captionChunks` over the
  film's `spokenTracks(film)`, `captionFile`, `readCaptions`).
- **Motion blur.** `motionBlur: 4` (or `{subframes, shutter}`) makes each frame the average of that many
  moments over half the frame's time, so a fast push or a whip streaks as a camera's would. It costs one
  drawing per subframe; the bands and the poster are never blurred.
- **One folder per version.** A render writes `poster.jpg` and `chapters.txt` beside its video, so give
  each version its own folder. `node examples/formats.mjs` renders the hello film in all four.

A layout is data, checked like a recipe: an unknown key refuses, a header in the landscape format
refuses (it has no band), a crop key out of spoken order refuses. Only the landscape format takes an
`intro`.

### Release: one call, every platform

A layout makes a version; a **release** makes the whole post for each place it goes. One interface,
`makeRelease`, and one adapter per platform (`youtube`, `youtube-shorts`, `linkedin`, `tiktok`,
`instagram-reels`, `x`), each imported only when a release names it. What differs between platforms lives in
the adapter as data: the video's shape, its length, the text fields and their limits — counted as the platform
counts them (X: a link is 23, an emoji 2) — the thumbnail, who the platform is for, and how the text is composed
(YouTube's description gets the film's chapters; X's post gets them when it has room).

```js
import {makeRelease} from 'footprint-storyreel/release';

await makeRelease({storyboard, recipe, narrationDir, pacing, out: 'release/ep01',
  post: {title: 'One sheep, one pebble', description: 'How counting began.', audience: 'kids', thumbnail: 'ep01.jpg'},
  targets: ['youtube', {target: 'youtube-shorts', from: 51, to: 110, crop: [{at: ['past', 'a shepherd'], x: 900}]}]});
// release/ep01/youtube/  the film 1920×1080, captions.srt + .vtt, thumbnail.jpg, post.json, post.txt (made for kids: yes) — nothing else
// release/ep01/work/youtube/  the render's working files and its record (making-of.json), kept apart
// release/ep01/youtube-shorts/  a 59 s part, 1080×1920 with the title band and captions, post.json, post.txt
```

- **Who it is for.** `post.audience` is `'kids'` or `'general'`. YouTube marks a kids' film made for kids;
  TikTok, Instagram, X (13 and over) and LinkedIn (16 and over) refuse it, with the fix: the full film goes where
  children watch, and a teaser for parents goes there as `'general'`.
- **Refused before a frame is drawn** when it can be known then (the audience, a title over the limit, a
  thumbnail of the wrong shape, a part too long, a picture larger than the platform takes); the film's own length
  and the text with its chapters are checked after the render.
- **X** takes a square video of at most 140 s and a post of 280 as X counts it (an account with Premium posts longer
  videos and up to 25,000 characters: `{target: 'x', limits: {seconds: {max: 3 * 3600}, text: {text: {max: 25000}}}}`
  — how X counts stays). X autoplays videos in the timeline and its own captions are speech-to-text, not on every
  video, so the captions are burned in; the release gives X no caption file and no thumbnail. X takes a picture of at
  most 1920×1200 (1200×1900 tall): `{target: 'x', scale: 2}` (2160×2160) is refused before it renders. A time in a
  post with one video (`1:05`) becomes a link to that moment — on iOS for now, X says, and at most 50 in a post — so
  the chapters go in when there are at most 50 and the post has room.
- **How X counts.** The X target counts a post with twitter-text 3.1.0's count (`parseTweet(text).weightedLength`; the
  function is the adapter's `limits.text.text.count`, `(await loadTarget('x')).adapter.limits.text.text.count`), the library X
  publishes for counting a post, ported (`src/targets/x-count/`, Apache-2.0, its licence beside it) and pinned to it:
  `test/fixtures/x-counts.json` holds over 300 texts with twitter-text's count, and `xLength` gives every one. A link is 23
  — a name with a dot only when it ends in a top-level domain twitter-text knows (`storyreel.dev` is a link, `Node.js`
  is not, `README.md` is: md is Moldova's), and not in an address, after `#`, `$` or `-`, or for localhost and IP
  addresses; punctuation after a link is text. Its top-level domains are its own 2019 list: a name under a newer one
  (`film.music`) counts as text here though X may make it a link (23), so keep such names out of a post near the limit. An emoji is 2; a code point 1 up to U+10FF (Latin, Greek, Cyrillic,
  Hebrew, Arabic, the Indic scripts…) or among the general punctuation's spaces, dashes, quotes and primes, else 2
  (Chinese, Japanese, Korean, the ellipsis…). An emoji newer than that library (Emoji 11.0) counts here as its
  parts, never less than the 2 X counts. `scripts/x-counts.mjs` remakes the table from a scratch install of
  twitter-text@3.1.0 — never a dependency.
- **Limits change.** Each adapter says when its facts were checked and where (`facts`); a target may override
  one (`{target: 'tiktok', limits: {seconds: {max: 3600}}}`), checked as the adapter's are; a key given as
  `undefined` is not given (the platform's value stays). A platform that takes a picture only up to some size says
  so (`limits.frame`, the largest frames, one per orientation). An adapter of your own is an object of the same
  shape (`checkAdapter` names what is missing), passed in `targets`.
- **Uploading is not a release's job:** it needs the account owner's sign-in, and stays a separate step.
- **For a big screen.** `{target: 'youtube', scale: 2}` makes the picture 3840×2160 (4K): every line and word is
  redrawn at that size, not enlarged. Pair it with the render's `quality: 'high'`, a slower and finer encode whose
  colours are converted and tagged as HD video's (BT.709), the way players read them.
- **The thumbnail from the film.** `post.thumbnail: 'poster'` draws the recipe's poster (a phrase that is said) at
  the platform's thumbnail size; a film without a poster is refused before anything renders. Where the thumbnail
  is uploaded (YouTube) the video starts on the film's own first frame; elsewhere the poster stays in the first frame
  (the render's `posterFrame`).
- **Made with AI, said so.** `post.synthetic` lists what in the film is realistic and made with AI (`['voice']` for a
  synthetic voice narrating). YouTube asks creators to disclose that, so its post says `alteredOrSynthetic: yes`:
  tick "Altered or synthetic content" when you upload.
- **Chapters come from titled scenes.** A titled scene starts a chapter and an untitled one goes on with the one
  before it; a storyboard with no titles at all makes every scene a chapter, named by its id.

### The cast: one film, another language and place

A film made for another language should feel native there: the hero's name, her clothes, the shop on her
street. The cast holds that as configuration, so the recipe and the kits stay the same.

```js
const cast = {hero: {name: 'Amaira', outfit: 'pavadai'}, mom: {name: 'Amma'}};
await makeFilm({storyboard, recipe, cast, narrationDir, out});   // storyboard: "{{hero}} is helping today."
```

- **`{{role}}` in the text** (the storyboard, the recipe's phrases and labels, the string table) becomes the
  role's name before anything reads it: the voice says it, a beat's phrase finds it, a card shows it. Voice the
  storyboard after `withCast(storyboard, readCast(cast))`, so the voice says what the film expects.
- **Kits read the rest of a role** (a look, an outfit, a skin or hair colour, a voice) from `context.cast` (a story
  kit with `context: true`) or a stage kit's compile options; what a role carries besides its name is the kit's to
  define.
- The cast is part of what the film is made from (`film.inputs.cast`): an approval locks it. A `{{role}}` the cast
  lacks, or a role without a name, refuses with the fix.

## Where the viewer looks: focus and emphasis, as strategies

The recipe says WHAT the voice is about and WHEN — a beat and a thing the kit names in its regions — and a
strategy says HOW, so the same film can be shown another way by changing one word:

```json
"focus": {"strategy": "camera", "feel": "heavy", "keys": [
  {"at": ["leak", "leaves the building"], "on": "database", "size": "medium"},
  {"at": ["turn", "the front door"], "on": "wide"}]},
"emphasis": {"strategy": "pop", "words": [{"at": ["rules", "acts as"], "text": "YOUR RULES"}]}
```

- **Focus strategies** (`footprint-storyreel/attention` · `FOCUS`): `camera` eases the camera to frame the named
  thing (medium, close, insert — as a director's push; `"wide"` is the whole frame), `spotlight` darkens the rest,
  `dim` veils the rest in the paper, `none`. A camera focus and the director's push notes cannot share the camera,
  and the recipe's camera moves take turns with a moving focus ([Camera moves by name](#camera-moves-by-name)).
  `safe` keeps framed things where captions cannot cover them (`[0, 0, 1600, 700]` above burned-in captions).
  Strategies compose: `"strategy": ["camera", "dim"]` moves the camera and veils the rest of its view.
- **Emphasis strategies** (`EMPHASIS`): `pop` lands the words big on their beat and settles them into a label in
  the top corner until the next words; `corner` is the label only; `none`.
- **Your own strategy** has the same shape, by name: `compileFilm({…, strategies: {focus: {mine: {show(ctx, view,
  paint, theme)}}, emphasis: {mine: {draw(ctx, t, word, theme)}}}})`.
- **Every move is a spring** (`footprint-storyreel/motion`): named feels — `snappy`, `default`, `heavy` (cameras),
  `playful` (pops) — or `{k, d}`; `spring(t, feel)`, `pop(t, at)`, and `track(t, keys)` for a value with many
  targets (one spring per change, so it never jumps). Kits use the same functions for their own motion.
  `settleTime(feel)` is how long a feel's spring takes to arrive (within half a percent: `heavy` about 0.8 s) —
  when a move on that feel stops moving, which is how the camera's moves know when a moving focus has settled.
- **Drawn on twos** (`heldTime(t, 'twos')`): a hand-drawn cartoon holds each drawing for two frames while its camera
  moves on every frame; a figure that changes on every frame slides like a puppet. A kit works out everything about
  a figure (its pose, its place, its mouth) from `heldTime(t)` and leaves the camera and the room on `t`. Timings:
  `ones`, `twos`, `threes`, or a number of frames; frames are counted at 30 a second (`{fps}` for another rate).
- **Follow-through** (`follow(body, t, {from, feel, drag})`, `lag`): a part that hangs off a moving body (hair,
  a hem, a bag) hangs on a springy joint: it swings back as the body sets off, on past as the body stops, and
  settles; while the body moves steadily it hangs as it does at rest. `drag` adds the air: a hem or a scarf also
  trails a moving body. `body` is the point the part hangs from (`u → x` or `u → [x, y]`); `lag` is how far the part
  trails it, the number a kit bends the part by. Still a pure function of time: steps of 1/240 s from `from`, each
  solved exactly, so any stiffness is steady. Give `from` as the scene's start (not 0) and make `body` once.
  ```js
  const momX = u => momAt(u).x;                                  // made once, when the world is compiled
  const th = heldTime(t, 'twos');                                // her drawing on twos; the camera stays on t
  const from = clock.start('shop');                              // the scene's start: the steps begin there
  drawMom(ctx, th, {x: momX(th), hair: lag(momX, th, {from}), hem: lag(momX, th, {from, drag: 5})});
  ```

- **A walk, the whole flow of it** (`footprint-storyreel/walk`): feet that never slide. `walk({from, to, start, size,
  style})` plans it once; `at(t)` gives the body's place, its rise and lean, each foot's place and lift, the arm
  swing and the turn. It sets off (a dip and a lean back, turning to face the way it goes), steps (each foot planted
  where the body passes over it; the body bobs, the arms swing against the legs), stops with the feet together and
  settles (it rocks on past its feet and turns back). The steps come from the distance and the figure's size. Styles
  are strategies: `stroll`, `brisk`, `bouncy`, `tiptoe`, or `{cadence, stride, bob, …}` of your own. A kit draws the
  legs to the feet it is given (its adapter); the walk never draws.
  ```js
  const exit = walk({from: 130, to: 1800, start: clock.at(['shop', 'Mom goes']), size: 475, style: 'stroll'});
  const p = exit.at(heldTime(t));       // her walk, on twos
  drawMom(ctx, heldTime(t), {x: p.x, walk: p});
  ```
  **The feet roll heel to toe** (`feet[j].angle`, radians, + toes up): a foot lands on its heel, flattens while the
  body passes over it, lifts its heel before it pushes off its toe — what makes a walk read as a person's, not a
  puppet's. How far is the style's `roll` (stroll .32, brisk .38, bouncy .26, tiptoe 0; a style of your own without it
  rolls like a stroll). The first step starts flat and the last lands flat, so a foot's roll never snaps. A kit turns
  the shoe about the end that rests on the floor: about its heel while the toes are up (`angle > 0`, as it lands),
  about its toe while the heel is up (`angle < 0`, as it pushes off) — `ctx.rotate(-foot.angle)` about that point, in a
  figure drawn facing +x, the heel at `foot.x` and the toe a shoe's length ahead — so the end on the floor never moves.
  Turned about its heel all the way, the toe would sink into the floor as the heel rises; the geometry audit catches
  it when the kit names the end it rests on (`contact: 'a'`, `'b'` or `true`, Three verdicts below).
- **A turn that reads as a turn** (`footprint-storyreel/motion · turnaround`): a cartoon turnaround swaps drawings —
  front, three-quarter, side — as a walk's `turn` passes each step between them, and `turnaround(turn, {views})`
  says which drawing (`view`) and how wide to draw it (`squash`): the figure narrows for a moment across each swap,
  so the change reads as the body turning, not a jump. Two drawings (front and side) swap at half way.
  ```js
  const {view, squash} = turnaround(p.turn, {views: 2});
  ctx.save(); ctx.translate(p.x, y); ctx.scale(squash, 1); ctx.translate(-p.x, -y);
  (view ? drawSide : drawFront)(ctx, t, p); ctx.restore();
  ```

## Camera moves by name

Directors and prompt guides name camera work — *dolly in on the shepherd*, *a slow orbit*, *rack focus to the
hills*, *a dutch angle as it goes wrong* — and naming it gets the effect. A recipe says the same in its `camera`
list: each move by name, on a beat (or at seconds on the film's clock), easing by a curve or a spring feel. The
film places every move, checks it against the rest of the film, and says in its record how each one was played.

```json
"camera": [
  {"move": "dolly-in", "at": ["farm", "shepherd"], "until": ["farm", "his sheep"], "on": "shepherd", "amount": 1.4},
  {"move": "orbit", "at": ["farm", "at the gate"], "seconds": 2, "amount": 140},
  {"move": "rack-focus", "at": ["farm", "the hills"], "from": "shepherd", "on": "hills"},
  {"move": "dutch", "at": ["turn", "something is wrong"], "amount": 6, "feel": "heavy"}
]
```

The moves (`footprint-storyreel/camera` · `CAMERA_MOVES`), a catalog like the transitions':

| family | move | what it does | settings (default) | length |
|---|---|---|---|---|
| view | `pan` | the camera looks across the picture (at most 600 px from the middle) | `amount`: px, + right (240) | 2 s |
| | `tilt` | it looks up or down (at most 337 px from the middle) | `amount`: px, + down (140) | 2 s |
| | `dolly-in` | it moves closer, toward a named thing as far as the picture's edges allow | `amount`: times closer (1.3); `on`: a named thing (none: where it looks) | 2 s |
| | `dolly-out` | it moves back, never past the whole frame, recentring as it goes | `amount` (1.3); `on` | 2 s |
| | `crane` | it rises (or descends) and comes a little closer | `amount`: px it rises, − descends (120); `scale` (1.12) | 2.5 s |
| | `dutch` | the frame rolls to an angle; 0 levels it again | `amount`: degrees, + clockwise (8) | 1.5 s |
| follow | `truck` | it follows a named thing sideways | `on` (required) | 2 s |
| | `track` | it follows a named thing wherever it goes | `on` (required) | 2 s |
| depth | `orbit` | it circles the subject: what is behind slides one way, what is in front the other, the nearer the more | `amount`: px a layer infinitely far would slide; a layer at depth d slides `amount × (1 − 1/d)` (120) | 3 s |
| | `dolly-zoom` | the subject keeps its size while the background grows behind it | `amount` (0.35; − gives it back) | 3 s |
| | `rack-focus` | the focus pulls from one layer to another; the rest goes soft by its distance from the focus | `on` (required), `from`, `amount`: px of blur (8) | 1.5 s |
| texture | `handheld` | a small, slow drift, the same every time for its `seed` | `amount`: px (6), `seed` (1) | to the film's end |
| time | `speed-ramp` | the picture runs slow in the middle and makes the time up on either side: in step with the voice at both ends | `amount`: its speed half way (0.3) | 2 s |
| | `freeze` | the picture holds while the voice goes on, then jumps to where the voice is | – | 1.5 s |

- **When and how it eases.** `at` is a beat or seconds; `until` a beat or seconds, or `seconds` its length (left
  out: the move's own; with a `feel`, the time its spring takes to settle). `ease` names a curve from the ease table or writes one (`cubic-bezier(…)`)
  (`inOut` by default); `feel` a spring (`heavy`, `snappy`… or `{k, d}`), fitted to the move's seconds. A time or
  texture move takes neither. List the moves in the order they start. A whip pan is a transition between two shots,
  not a move inside one: `{"move": "whip"}` refuses and says to write `"enter": "whip"`.
- **The frame stays covered.** There is nothing past the picture's edge, so a move never uncovers it: a pan at the
  whole frame, a dutch angle or a follow scales the picture up just enough (the record says how far: `covers`). The
  zoom it needs grows as the camera looks away from the middle — `800 / (800 − px)` across, `450 / (450 − px)` up or
  down: a pan of 240 px from the middle needs ×1.43, of 600 px ×4 — so the camera looks at most 600 px across and
  337 px up or down from the middle, whatever the `amount` ranges allow (they are for a camera already moved). A dolly
  keeps the zoom it asks for, times the zoom on screen as it starts (a pan's or a dutch's included: a dolly is always a
  change of what the viewer sees), and goes toward its thing only as far as the edges allow, as a push note does; it
  then stays on the thing's place in the picture, so a push or the focus that moves the picture under the camera
  later does not leave it framing an empty spot (a thing that walks away is followed by a `truck` or a `track`). As it
  re-aims it keeps the thing on its framing, with its own roll: a later dutch scales the picture up to cover, as a
  dutch does anywhere. A move that starts while another runs aims from where that one is going — a dolly beside a pan
  from the zoom the pan ends on — and starts from what is on screen, so it never jumps; reduced motion ends on the same
  framing. A move past ×4 refuses, naming the move that moves: each is checked over its own span, then a dolly on a
  thing over its hold (until moves have taken over both where it looks across and up and down, or its picture
  changes) — a dutch that would take a held dolly past ×4 refuses, naming the dutch. A dolly-out that cannot widen — a
  dutch's cover need holds the zoom up, or the camera is already at the whole frame — refuses as the no-op it is (it
  would play as nothing, or as a zoom in); it is judged from where the camera is headed, not from a moment on screen.
  A recipe is checked as written and as cut, whichever version is made, so the moving film and the reduced-motion
  film accept and refuse the same recipes, with the same words. Every move's framing is a pure function of time.
- **Depth.** A world gives its layers a depth: `layers: [{name, depth}]`, back to front, and `drawLayer(ctx, t, name,
  spot)`, which draws one layer on a clear sheet (all of them, in order, draw what `draw` does). The depth is how far
  the layer is from the camera, as a multiple of the subject's distance: **1 is the subject's plane**, 2 twice as far,
  0.5 half way to the camera. An orbit slides each layer by `amount × (1 − 1/depth)`; a dolly zoom scales it by
  `(1 + amount) × depth / (depth + amount)`; a rack focus blurs it by its distance from the focused plane, `|1/depth −
  1/focused|` (a lens's circle of confusion). The farthest layer is scaled just enough to keep covering the frame. A
  world's first rack focus starts with everything sharp: over its first third the depth of field narrows on `from`,
  then the focus pulls to `on`; a later one starts where the last ended (`from` may be left out). A depth move on
  paper, or on a world with no layers, refuses, naming what to add. **Cost:** a moved world draws each layer on its
  own sheet (a plain 1080p frame of a three-layer world: about 3 ms; layered, about 8 ms), and a blur is made on a
  copy at 1/k of the size (k about blur ÷ 1.5, at most 8; a blur under half a pixel is not drawn): a held rack focus
  costs about 10–20 ms a 1080p frame on a laptop (a full-size blur cost about 60).
- **One picture, one camera.** A move (handheld aside) stays on one picture: one that runs across a hand-over, an
  entrance, a cut, the push-in or the teaser refuses, as a push does. Its framing holds until the picture changes,
  then eases back to the whole frame over the change (at a cut, at once), so every new picture opens wide. A film has
  one camera: a move cannot run while a moving focus (the `camera` strategy, from each key until its spring settles),
  a push note (while it eases in or out), a world's spotlight or a world's own camera moves it (a kit says when its
  camera moves with `cameraMoves: [{from, to}]`: the cartoon kit's `camera` keys do — a push note takes turns with
  them too), and two moves cannot move the same thing at once (a pan and a dutch may). They take turns, and they compose: the push moves the picture, the focus frames it, and the camera's
  moves are the outermost lens, so a dolly in after the focus has framed a thing pushes in on that framing; handheld
  drifts over everything. The picture keeps its own clock under a freeze or a speed ramp, and so do the depth moves;
  the push, the focus, the camera, the held layers, the guess cards and the words keep the voice's.
- **Reduced motion.** `compileFilm({…, reducedMotion: true})` (and `makeFilm`) is the version for a viewer who asks
  for less motion: each move cuts to its end framing on its first moment (a truck or track at its last, where its
  thing then is), the return over a change cuts at its start, handheld is off, a speed ramp plays in step and a
  freeze is kept — a still is not motion. It changes only these camera moves: a moving focus, the push notes, a kit's
  own camera and spotlights, the transitions and everything a kit animates play as written (give a reduced-motion
  version its own recipe for those). A film without camera moves is the same either way; one with them carries
  `reducedMotion: true` in its inputs, so an approval of the moving film does not cover it.
- **The record.** The plan is a footprintjs flowchart — read moves, one picture, one camera, a `decide()` on reduced
  motion, cuts or moves, aim — so `film.camera` says how the film was played and why: `motion` (`moves` or `cuts`),
  `decision` (the rule and its evidence), each move as placed (`at`, `until`, its settings, `played`: `move`, `cut`,
  `off` or `kept`, `covers`, `lasts`, and `ends`: the framing it resolved to, `{x, y, z, r}`, with a hash of the path
  for a follow — so an edit under it, a push a dolly aims through, changes the record and the keys) and the plan's
  narrative. `film.cameraAt(t)` is the framing at t (`{x, y, z,
  r}`: the point it centres, the zoom, the roll), the making-of record keeps `camera`, the compile record writes
  `camera.camera[i]`, and a cached segment's key holds the moves that reach it, so changing one redraws only those.
  A film without `camera` draws exactly the frames it drew before (the pixel pins hold).

`node examples/camera.mjs` makes the film above and its reduced-motion version and writes stills of both:

```js
import {writeFileSync} from 'node:fs';
import {compileFilm, evenTimings, contactSheet} from 'footprint-storyreel';

const storyboard = {scenes: [{id: 'farm', narration: 'The shepherd counts his sheep at the gate, and the hills go quiet behind him.'}]};
const paint = {hills: c => { c.fillStyle = '#9cc29a'; c.fillRect(0, 0, 1600, 900); },
  shepherd: c => { c.fillStyle = '#8a5a2b'; c.fillRect(700, 380, 200, 420); },
  gate: c => { c.fillStyle = '#5b4636'; for (let x = 1100; x < 1560; x += 70) c.fillRect(x, 560, 26, 340); }};
const farm = {name: 'farm', story: {compile: () => ({hang: 1,
  draw: c => Object.values(paint).forEach(layer => layer(c)),
  layers: [{name: 'hills', depth: 6}, {name: 'shepherd', depth: 1}, {name: 'gate', depth: .6}],   // back to front
  drawLayer: (c, t, name) => paint[name](c),
  regionsAt: () => [{box: [700, 380, 900, 800], path: 'shepherd', label: 'the shepherd', name: 'shepherd'}],
})}};
const recipe = {story: {kit: 'farm'}, camera: [
  {move: 'dolly-in', at: ['farm', 'shepherd'], until: ['farm', 'his sheep'], on: 'shepherd', amount: 1.4},
  {move: 'orbit', at: ['farm', 'at the gate'], seconds: 2, amount: 140},
  {move: 'rack-focus', at: ['farm', 'the hills'], from: 'shepherd', on: 'hills'},
]};
const film = await compileFilm({storyboard, timings: evenTimings(storyboard), recipe, kits: [farm]});
console.log(film.camera.moves.map(m => `${m.move} at ${m.at} s: ${m.played}`));   // dolly-in at 0.68 s: move, …
writeFileSync('camera.png', await contactSheet(film, {moments: [1, 2.5, 4.5, 6.5].map(t => ({t, label: `${t} s`}))}));
// reducedMotion: true → each move a cut on its first moment: film.camera.motion === 'cuts'
```

## Moves: motion asked for by name

A designer asks for "a soft rise" or "a pop", not for a curve and two numbers — and a film that asks by name
gets the timing right without anyone working it out again. `footprint-storyreel/moves` is that vocabulary,
modelled on the motion-reference libraries that sort motions by how they **feel** (`smooth`, `crisp`, `soft`,
`heavy`, `bouncy`) and what they are **for** (`ui`, `text`, `logo`, `character`, `3d`). Every move is data —
`{name, kind, feel, uses, seconds, ease | spring, props}` — so a recipe can name one (or write its own), and
a shot that enters with one says which in `film.rows`:

| kind | moves |
|---|---|
| entrance | `fade-slide` `soft-rise` `mask-wipe` `iris-open` `overshoot` `bounce-landing` `spring-follow` `pop` `text-reveal-word` `text-reveal-letter` `count-up` `line-draw` `blur-in` `scale-in` `drop-in` `slam` |
| exit | `fade-slide-out` `soft-sink` `mask-wipe-out` `iris-close` `pop-out` `blur-out` `scale-out` `drop-out` |
| feedback | `shake` `wiggle` `nod` |
| ambient | `marquee` `pulse` `float` (they loop) |

The practitioners' timing rules are numbers in the data, not advice: an exit takes half its entrance's seconds
(`pairs` names the entrance it closes, and it accelerates away on `in`); a reveal puts 0.09 s between words
(`WORD_GAP`, a move's `gap`); overshoot moves ride `outBack`; a spring move plays its spring in real time, and its
seconds last at least until the spring comes within 1% of rest for good (worked out exactly; a refusal gives the
number) — a spring that would take longer than 10 s cannot drive a move. Laws every move keeps — built in or your
own, checked by `readMove` each time you give it one: an entrance ends at rest, an exit starts at rest, feedback
starts and ends at rest, an ambient move loops from rest.

- `moveAt(name, t, {start, seconds?, feel?, reduced?})` → `{opacity, x, y, scale, rotate, blur, clip, progress,
  mask}`: every property, at rest where the move leaves it alone (`x`/`y` and `blur` in frame pixels, `rotate` in
  degrees, `clip` the share its `mask` uncovers, `progress` how much of the thing's own content shows — a line
  drawn, a number counted). `seconds` stretches it; `feel` drives it on another curve (a move feel, a spring
  feel — `snappy`, `playful` … — or `{k, d}`); `reduced: true` is reduced motion: no in-between, the end state
  from `start` on.
- `stagger(items, gap)` → `[{item, index, delay}]`: gap in seconds, or a text reveal's own (`'text-reveal-word'`).
  It spaces the pieces of ONE item — the words of a line, the letters of a word — and they may overlap (0.09 s
  apart, each word 0.45 s): the reader reads the line, not its words one by one. Such a cascade of n pieces counts
  as arrived at (n − 1) × gap + seconds, and its reading time starts then. Separate things the narration counts
  (the members of a repeat group) are a different matter: there each must arrive before the next starts
  (docs/design/2026-10-motion-grammar.md, section 4.8).
- `movesBy({feel, use, kind})` finds moves; `readMove(name | move)` checks one of your own; an unknown name
  refuses, listing the moves by kind.
- `applyMove(ctx, values, {box})` puts the values on a canvas for a thing drawn in `box` (opacity, offset, scale
  and turn about its centre, mask, blur); save before, restore after; it returns false when nothing shows.

```js
import {createCanvas} from '@napi-rs/canvas';
import {moveAt, stagger, applyMove, movesBy} from 'footprint-storyreel/moves';

const ctx = createCanvas(1600, 900).getContext('2d'), t = 1.3;      // any moment: a pure function of time
ctx.font = '700 64px sans-serif';
let x = 200;
for (const {item, delay} of stagger('One sheep, one pebble'.split(' '), 'text-reveal-word')) {   // 0.09 s apart
  const v = moveAt('text-reveal-word', t, {start: 1 + delay}), w = ctx.measureText(item).width;
  ctx.save();
  if (applyMove(ctx, v, {box: [x, 400, x + w, 470]})) ctx.fillText(item, x, 460);
  ctx.restore();
  x += w + 20;
}
movesBy({feel: 'bouncy', use: 'logo'}).map(m => m.name);   // ['overshoot', 'bounce-landing', 'pop', 'pop-out', 'wiggle']
moveAt('pop', 1.2, {start: 1, reduced: true}).scale;       // 1: reduced motion, already at rest
```

A shot can enter with a move too (see [Transitions](#transitions)).

### The principles: anticipation, squash and stretch, one-shot events, arcs

Four of the animator's principles, as plain numbers any move can use (`footprint-storyreel/principles`; pure
functions of time, like every frame). The walk and acting already do their own versions of these — a dip before
setting off, a squint before a change of mood; these are the same ideas for everything else.

- `anticipate(t, {at, distance})` — the small counter-move before a move: over 0.15 s before `at` the thing winds
  back by a tenth of the distance (at most 40 px), and lets go over the 0.1 s after it while the move begins.
  `distance` is a number or `[dx, dy]`; the offset comes back the same shape.
- `squash(t, {velocity, landings, axis})` → `{sx, sy}` with `sx × sy = 1` (the volume is kept): stretched along the
  motion by its speed (1000 px/s stretches 20%), flattened on each landing `{at, speed}`, then a quick wobble past
  round that settles within about a third of a second; landings that overlap add.
- `envelope(age, shape)` and `burst(t, events, shape)` — a one-shot event (a `flash`, a `pop`, a `shake`, or
  `{attack, decay}`): it rises over 40–120 ms (smoothstep, so it starts gently) and fades exponentially. `burst`
  works each event out from its own age, so two events close together add instead of restarting.
- `arc(from, to, u, {bend, toward})` — a point-to-point path that curves a little, as a hand's does: the middle
  sits 12% of the distance off the straight line, bulging `up` unless told otherwise.

```js
import {createCanvas} from '@napi-rs/canvas';
import {anticipate, squash, burst, arc} from 'footprint-storyreel/principles';
import {EASES} from 'footprint-storyreel/ease';

const ctx = createCanvas(1600, 900).getContext('2d'), t = 2.85;    // any moment: a pure function of time
const go = 2, from = [200, 600], to = [1300, 600], u = EASES.inOutCubic((t - go) / .8);
const [x, y] = arc(from, to, u);                                    // a slight curve, like a hand
const back = anticipate(t, {at: go, distance: to[0] - from[0]});   // a step back before it goes
const {sx, sy} = squash(t, {landings: [{at: go + .8, speed: 1400}]});
const glow = burst(t, [go + .8], 'flash');                          // the landing flashes; two flashes add
ctx.save(); ctx.translate(x + back, y); ctx.scale(sx, sy);         // squashed about the point it lands on
ctx.fillStyle = `rgb(${Math.round(180 + 75 * Math.min(1, glow))}, 80, 60)`;
ctx.beginPath(); ctx.arc(0, -40, 40, 0, Math.PI * 2); ctx.fill(); ctx.restore();
```

## Where StoryReel writes, and what it cleans

A render writes only where you point it, and leaves only what you asked for. The system's temp folder holds only
two passes' scratch, for the moment they run, each removed in a `finally`: the FFmpeg filter that reads a video's stills
(`stills.mjs`), and the sound a breakdown hands its beat map (`breakdown.mjs`). Each is named
`storyreel-scratch-<host>-<pid>-<XXXXXX>` and swept like a render's folders (below), so a killed pass leaves nothing for good.

Every scratch folder — those two, a render's working folder, `makeFilm`'s voice copy — is made one way
(`scratch.mjs` · `makeScratch`): `mkdtemp`, which creates a NEW folder with a random suffix, at once, that only you can
open (mode 0700). It never takes a name that is already there, so a folder or a link someone else planted in a shared
temp folder, at a name StoryReel might pick, is never written into. The voice copy gets the mode a plain folder gets
(0777 less your umask, usually 0755) before it is renamed to `narration/`, never the out folder's: in a shared folder
such as `/tmp` (1777) that would let anyone rewrite the voice the other tools read. In such a shared folder, a
`narration` another user put there cannot be removed: `makeFilm` stops (EPERM) rather than write into it, so make
films into a folder of your own.

| where | what | kept? |
|---|---|---|
| beside `out` | the video, `poster.jpg`, `chapters.txt`, the caption files; with `makeFilm`, `making-of.json` and (with a voice) `narration/`, the paced copy the render read | yes: the outputs |
| `.storyreel-work-<host>-<pid>-<XXXXXX>` beside `out` | the working files: the picture without its sound, the voice and the effects as WAVs, the lists FFmpeg joins, segment files on their way to the cache | removed when the render ends, finished or failed |
| `.narration-<host>-<pid>-<XXXXXX>` beside `out` (`makeFilm` with a voice) | the paced copy of the voice, which the render reads; it becomes `narration/` once the film is made | removed if the film is refused or fails |
| `work` (a folder you name: `renderFilm({…, work})`, `makeFilm({…, render: {work}})`) | the same working files, when you want to look at them | yes: you chose the place |
| `folderStore(dir)` | the segment cache (Re-render only what changed) | yes: you chose the place |
| `makeRelease({out})` | each target's post in `<out>/<target>/`, the render and its making-of in `<out>/work/<target>/` | yes |

```js
await renderFilm({film, storyboard, timings, out: 'renders/film.mp4'});                          // renders/: film.mp4, chapters.txt (and poster.jpg)
await renderFilm({film, storyboard, timings, out: 'renders/film.mp4', work: 'renders/work'});   // the working files kept in renders/work/
```

`renderFilm` and `makeFilm` remove the working files in a `finally`. A picture strategy of your own that prepares a
render itself (`prepareRender`) writes its working files to `job.work` and ends with `closeRender(job)`.

**A render that was stopped** (Ctrl-C, a killed process) cannot clean up: no library sees a SIGKILL, and StoryReel
installs no signal handler. Its hidden folders are named for the host and the process, so the next render
into that folder on the same host sweeps the ones whose process is gone (and a `makeFilm` the voice copies), and the
making-of record lists what it swept (`swept: {count, names}`). A folder of this host's is judged only by whether its
process runs: a live render's is never touched, however long it has been quiet. Any other such folder untouched for more
than a day (by the newest write inside it) is swept too: an older name, another host's, this host under a name it had
before. A folder you named with `work` is never touched; a fresh folder another host left is left for that host's own
next render, since its process cannot be seen from here. A sweep touches only real folders that you own: a link with
such a name, or another user's folder, is ignored (not removed, not followed, not listed). Cleaning up never fails a
render: a left folder of yours that cannot be removed (a read-only folder in it, a locked file) is skipped and listed
(`swept.failed: [{name, why}]`). Two films made at once into one
folder each read their own copy of the voice; `narration/` is the one made last (placed once more if the other slipped
in between; the record says `narration: {placedAgain}`). The tests
make their folders through one helper (`test/tmp.mjs` · `tempDir`), each removed when its test or file ends;
`npm run test:temp` runs the whole suite with a temp folder of its own and fails if anything is left (stopped,
it stops the suite and removes that folder too).

## Re-render only what changed

A film is edited many times. Fixing one word, one beat or one drawing should not mean drawing all
4 000 frames again. `video: segmentedVideo({store, recipe, code})` makes the picture in **segments** — one
per row of pictures (a shot, from the moment its entrance starts), so a transition is never cut in two —
keeps each one in a store, and on the next render reuses every segment that nothing has changed:

```js
import {renderFilm, segmentedVideo, folderStore, codeFingerprint} from 'footprint-storyreel';

const video = segmentedVideo({
  store: folderStore('work/segments'),     // <key>.mp4 + <key>.json per segment, kept between renders
  recipe,                                  // each segment's recipe entries are part of its key
  code: codeFingerprint(['film/kits']),    // your drawing code: change a kit, and what it draws changes
});
const result = await renderFilm({film, storyboard, timings, narrationDir, out: 'out/draft.mp4', video});
console.log(result.video.rendered, 'drawn,', result.video.reused, 'reused');
```

- **A key is on the segment's own clock.** It is built from what draws the segment, timed from its first
  frame: its recipe entries (and the shot an entrance, or a blurred cut, also draws; a push-in film's
  `pushIn` and `card`; every row a teaser rewinds through), the guess cards over it, every line they
  resolved, the words spoken in and around it (captions and mouths; an example scene's label), the director's
  notes over it, the strings its entries name (`{"$string": key}`: one word changed redraws only the segments that show it),
  what reaches every frame — the data, the theme, the cast and every file the film read (`film.inputs`) —
  the frame settings (size, layout, stamp, motion blur, poster) and the drawing code (StoryReel's own, its
  fonts and the versions it draws with, and yours). So a scene near the start that grows by whole frames
  changes the keys of the segments around it, not of the ones further on.
- **Edit one shot, draw one segment.** With one fingerprint for all your kits, any edit draws every segment
  again. `code: sourceCode(entry => [the files that draw it])` keys each segment by its own shots' code
  instead: the files a segment's entries name, everything they import (followed; a package by its installed
  version) and any `shared` files (hashed as they are — a kit's index imports every shot, so its imports are
  not followed). An edit to one shot's module then draws only the segments that show it:

  ```js
  code: sourceCode(entry => entry.world?.shot ? [`film/kits/draws/shots/${entry.world.shot}.mjs`] : [],
    {shared: ['film/kits/draws/index.mjs']}),
  ```
- **Look at one part, with its handles.** `renderFilm({…, part: {scenes: ['chapters'], handles: 1.5}})` renders
  those scenes and 1.5 s of the film either side — the end of the part before and the start of the part after,
  as a film editor's handles — so both of its cuts are seen without rendering the whole film. With
  `quality: 'draft'` (the quickest encode) and `layout: {…, scale: .5}` (half size) it is a quick look while
  editing; a part render is checked as a part and can never be approved (an approval is of the whole film).
  `partTimeline(film, {from, to})` lists the scenes and beats in it with their times (`timelineText` as lines):
  read when "the network does the waiting" lands instead of rendering stills to guess.
- **Review a part by reading it.** `reviewPart(film, {part, layout})` (`footprint-storyreel/review`) reads the
  picture as text — every line a frame draws, where it lands and how faint — and names what is wrong, with times:
  words under the captions while a caption shows, words over other words, words cut off at the edge, the picture
  frozen for 5 s (`still`), nothing new for 5 s while it moves (`stale`: no scene, no beat and no new words —
  `newEvery`), a camera freeze over the voice (`frozen-voice`: the voice names a drawing while the picture is held, or
  a mouth stays still while its speaker talks), an example line beside real numbers (`example-lingers`: its "Example
  data" label stays up with it into a real scene), and — with `loop: true`, for a part made to loop — an end that does not come round to its start (the
  part's own scenes, not its handles: its last moment against its first, as the eye takes them in and word for word).
  Motion that steps rather than runs (a flipbook, a blink, a part drawn on twos) is read one drawing short of coming
  round, so such a loop reads as a jump even when it loops cleanly: look at a strip of the seam before changing it.
  Read the findings and the timeline first; look at a frame only to confirm:

  ```js
  import {reviewPart} from 'footprint-storyreel/review';
  const r = await reviewPart(film, {part: {scenes: ['chapters']}, layout: {format: 'landscape', captions: true}});
  console.log(r.timeline); console.log(r.text);
  // 2:02.5–2:05.3 chapters · under the captions: "one turn"
  ```
  The review is a footprintjs flowchart: a selector picks each check by what the part has (no caption band, no
  caption check), each check runs as its own subflow, and `r.record` says what ran and why. A check of your own
  is `{label, why, when(scope), find(review)}` in `checks`; `find` answers at once with its hits, `[{kind, t, what}]`.
  A check that throws, or answers with anything else (a promise, no list, a hit without its time or its words),
  fails the review with one error naming every check that failed, so a review that returns has run every check it
  picked. Three checks answer with a verdict — no slideshow, drawn parts that hold together, every number with a
  source (`r.verdicts`, `r.verdictText`; [below](#three-verdicts-no-slideshow-parts-that-hold-numbers-with-a-source)).
- **The same, from the command line — and as a skill for agents.** `npx storyreel timeline | review | part | still |
  strip --scene <id>` (`strip --at <scene>+<seconds>`: a fast move frame by frame — 12 consecutive frames around
  the moment, side by side — to catch a pop, a jump or two things crossing) (the film named in the project's `storyreel.config.mjs`: `export default {film: flags =>
  ({storyboard, recipe, kits, root, narrationDir?, pacing?, layout?})}`; every flag also reaches `film()`). The
  package ships the skill that teaches the order — timeline, review, fix, part, one still last — as a Claude Code
  plugin: `claude plugin marketplace add footprintjs/storyreel`, then `claude plugin install storyreel@storyreel`
  (or copy `plugin/skills/storyreel-review/SKILL.md` into a project's `.claude/skills/`). `footprint-storyreel/tools` is the one core both use.
  `npx storyreel beats <song>` needs no project: it prints a song's beat map for settling its tempo (see Music: cut on
  the beat).
- **And as an MCP server,** for any assistant that speaks MCP: `storyreel mcp [--flag value …]` serves the same
  five tools over stdio (the flags are every call's defaults; a still or a strip comes back as the picture). Each call runs in
  a fresh process, so an edit to a kit between two calls is always seen:

  ```bash
  claude mcp add storyreel -- npx storyreel mcp --ep ep1 --voice work/ep1/voice      # Claude Code
  # Claude Desktop / VS Code (Copilot) / Cursor: a stdio server, command "npx", args ["storyreel", "mcp", …]
  ```
- **A reused segment must pass a spot check.** A few of its frames (6 by default, `samples`) are painted
  again exactly as the video shows them (layout, motion blur, stamp, poster) at the same places in the
  segment, and must match the ones kept when it was drawn. A segment that moved is reused only when its
  frames did not move with the film's clock: a kit that animates on it (the cartoon's drifting clouds)
  makes it draw again (`why`: it moved). A key whose frames changed anyway is drawn again, saying the key
  missed something. Six frames are a spot check, not a proof: a change the key misses that shows only
  between them is not seen, which is why the key lists what it does and a final render can use
  `wholeVideo()`.
- **The sound is never cached.** It is mixed for the whole film on every render (it takes seconds), so it
  never has a seam; the segments are joined without re-encoding (`ffmpegJoin()` with the render's own
  FFmpeg; every segment is encoded with the same settings). A segment lands in the store whole or not at
  all, and a file cut short is never reused; when one segment fails, the others stop.
- **You decide when a part is drawn fresh.** `force: [2, 'race']` draws the third segment and every
  segment covering the scene `race` again, whatever their keys say. A final render for publishing can
  still use `wholeVideo()` (the default): every frame in one pass.
- **Three seams.** The strategy (`wholeVideo()`, `segmentedVideo()`), the store (`folderStore(dir)`, or
  your own `{get(key), put(key, file, manifest)}`) and the joiner (`ffmpegJoin()`, or your own
  `{join(files, out)}`) are each replaceable. A segmented render covers the whole film: an `intro` or a
  part (`from`, `to`) refuses, naming `wholeVideo()`.
- **In `makeFilm`**, each segment is its own footprintjs subflow (a fan-out over the plan), and
  `making-of.json` gets a `picture` entry: every segment, its key, and whether it was drawn or reused
  and why. `parallel` (2 by default) is how many segments are drawn at once.

## Approve a film

A "final" render should be the film someone actually watched. Every `makeFilm` render's `making-of.json`
lists what the film was made from, hashed (`inputs`): the storyboard, the timings, the recipe, the strings,
the data, the theme, every file the film read through its root, the pacing, the voice's audio, and — when you
pass `code: codeFingerprint(['film/kits'])` — the kits' drawing code. `approveFilm` takes the record of the
render the person watched, and `makeFilm({…, approval})` refuses to render anything else, naming what changed:

```js
import {approveFilm, makeFilm} from 'footprint-storyreel';

// When the person signs off on the draft they watched (its making-of.json):
writeFileSync('film/approval.json', JSON.stringify(approveFilm({record: 'out/draft/making-of.json', by: 'Sanjay', note: 'v12, for the conference'}), null, 2));

// The final render: refuses if anything changed since.
await makeFilm({storyboard, recipe, pacing, narrationDir: 'work/voice', code, out: 'out/final/film.mp4', approval: JSON.parse(readFileSync('film/approval.json', 'utf8'))});
// → "The film changed since Sanjay approved it on 2026-10-02: the file rule.ts differs from what was approved. …"
```

The hashes are of the data, not its spelling (keys are sorted first), so reformatting a file changes
nothing; a changed word, phrase, number, file or take does. The check runs once the film is compiled, before
a frame is drawn. `making-of.json` keeps the approval it was rendered under, and says what an approval does
not lock: the render settings (the same approved film is made for every platform) and, without a code
fingerprint, the kits' code. A draft is rendered without one.

## Listening

A sound on every change of picture stops meaning anything — the ear learns to ignore it — and the same cue
twice running sounds like a loop. The film lists what its changes of picture ask of the ear (`film.listening`):
more than 60% of them making a sound (about half should be silent: an entrance's `"sound": false`), or two
entrances in a row with the same sound. A render measures the voice and the effects apart before it mixes them
(`result.loudness.roles`, in LUFS) and says when the effects are less than 10 LU under the voice, where they
start to bury the words. `"listening": "refuse"` refuses the film's own findings. The rules are
`footprint-storyreel/listening` · `LISTENING`.

```json
"stages": [{"scene": "loop", "enter": {"type": "zoom", "sound": "whoosh"}}, {"scene": "frame", "enter": {"type": "push", "sound": false}}]
```

## Music: cut on the beat

A cut that lands just off the beat feels late even when nobody can say why, so an editor cuts on the beat — and does
not trust an automatic beat grid blindly: a grid can be a half or a double of the real tempo, and a song's drop is not
always where its loudest moment is. StoryReel measures the song, says how sure it is and what else the tempo could be,
and fits the film to it only where asked, never further than you allow.

```js
import {beatMap, peakOf, safeBeats, likelyTempi} from 'footprint-storyreel/beats';

const map = await beatMap('music/theme.mp3');
map.bpm;            // 123 — a line through the beats
map.beats;          // [0.3, 0.788, 1.275, …] seconds, each on the transient it sits on
map.bars;           // every bar's first beat (a 4/4 guess; the downbeat from low-band onsets)
map.drop;           // 8.105 — the largest sustained rise in low and mid energy after a quieter build, on its beat (null: none)
map.confidence;     // 0..1: the share of beats that sit on a measured onset
map.verdict;        // 'tempo-close' — or tempo-measured, -faster, -slower, -given; map.sure is false only when close
map.alternatives;   // [{bpm: 123.02, score: 1, phaseDoubt: 0.4, beats: […]}, {bpm: 61.51, score: 0.82, …}, …] — the tempos the onsets also fit, each with its grid
map.levels;         // [{bpm: 61.51, score: 0.82, fails: ['kicked']}, …] — every level of the beat tried, and why it is not sure
safeBeats(map);     // {beats: [0.3, 1.275, …], grid: 'shared', shared: 20, of: 40, tempi: [123.02, 61.51, …]} — what a film may cut on
likelyTempi(map);   // [123, 62] — an unsure map's candidates scoring 0.5 or more: the tempi to settle it with
map.nearestBeat(12.4); map.nextBeat(12.4); map.onBeat(12.4, .05);
peakOf('sfx/door.wav');   // 0.322: start the door at eventTime − 0.322 and its thud lands on the event
```

- **How it measures** (plain functions, `src/dsp.mjs`): the song read through FFmpeg as mono samples; onset strength as
  spectral flux on a radix-2 FFT, log-compressed and split into low (< 200 Hz), mid and high bands (a hit in the song's
  first milliseconds is a beat; a pad or a noise floor already sounding at its first sample is not, and neither is
  its end; a first click anywhere in the first 60 ms — an encoder's delay — is found where it is, over a pad too); the tempo by autocorrelation of the
  onsets, weighed by a prior that prefers 70–180 BPM (`range`), with the ranked alternatives; the beats by dynamic
  programming (Ellis 2007), each moved onto the transient it sits on (an attack heard over a held note: the energy of
  the samples' first difference), the beats the chain carried through a quiet intro or a fading end left out (each
  must stand out from what surrounds it); the bars from low-band onsets; the drop where low
  and mid energy rise most and hold, and arrive at once.
- **The map is a flowchart, and its record explains it.** decode → onsets → choose-tempo → track-beats → find-bars →
  measure-rise → find-drop, each verdict `decide()` evidence in `map.record`: `It examined "One level of the beat passes
  both tests — the kick pulse and the in-betweens agree — and it is the strongest": passing=(1 item), strongest=92.12,
  and chose tempo-measured.` `map.levels` lists every level tried and the tests each failed.
- **One rule for being sure: two pieces of evidence must agree.** The same beat scores well at other levels — a steady
  pulse also repeats every two and three beats, hats on the eighths twice a beat, a syncopated snare between them — so
  the map tries every level from a quarter to four times the strongest tempo (`map.levels`), and a level is certain
  only when it passes both tests (`levelTests`, `BEATS.level`):
  - *the kick pulse*, when the song has one (eight kicks or more): a kick is a low-band peak that DIES — within 0.1 s
    it falls below 0.55 of its peak — and arrives with a broadband transient, so a sustained bass note is not a kick
    (`dsp.mjs · lowPulse`). The kicks land on the level's beats (in phase), on nearly every one of them (`kicked`
    0.75, not loosened), and never between them;
  - *the in-betweens*: the beats carry the song's body evenly, and no subdivision is filled — the half-beats may sound
    (hats on the eighths) but not as strongly as the beats, the thirds and quarters not at all, and nothing sounds as
    strongly anywhere between the beats (a level whose every quarter-beat sounds is too slow; one with a hit on the
    fifth sixteenth is wrong too). With no kick pulse, the level's own score must also stand 0.3 over every other.
  - *a backbeat names the tactus*: a snare or a clap (`dsp.mjs · backbeatPulse`: noise rising in the mid and high bands
    at once that RINGS — 45 ms on, the high band still holds a fifth of its rise, where a kick's beater click or a closed
    hat has died) on every other beat of a level — 2 and 4 of a bar — makes that level the beat, and no other level can
    be certain (`backbeatEveryOther`): not a faster one (`backbeat slower`) — a kick and a bass on every eighth fill
    every beat of the double, but the snare is on only every fourth — nor a slower one whose beats are the backbeat
    (`backbeat faster`): an 808 on the quarters under a snare on 2 and 4 at 150 was heard, sure, at 75, its grid on the
    snares. A level
    that keeps the backbeat on at most 3 in 8 of its beats fails `half-time` on its own: it is twice too fast.

  When exactly one level passes, the verdict is certain: `tempo-measured` (the strongest), `tempo-faster` or
  `tempo-slower` — unless another level was refused by the kicks alone (`refusedByKicksAlone`: it failed only kick
  tests, and passes the in-betweens once the kicks are masked): a level that wins only because the right one failed
  "no kick between" is never certain. Otherwise — none passes, or more than one — it is `tempo-close`: the strongest is
  taken and `alternatives` lists eight, each with its own grid. A wrong tempo claimed as certain is the one failure that
  matters, so many songs come out close: a backbeat (the kick on one and three is not a kick on every beat), a click
  track with a kick every fourth click, a dembow, a breakbeat; give `bpm` to settle them.
- **Checked against a corpus** of 262 songs made sample by sample (`test/songs.mjs · tempoCorpus`,
  `test/tempo-corpus.test.mjs`): 56 drum patterns; nine rhythm families — dembow, son clave, half-time shuffle, trap,
  four on the floor, breakbeat, sixteenths with the kick on one, bossa nova, funk — at seven tempi; 66 songs; and 77 of
  bass, hands, meters and echoes — a backbeat over eighth-note bass, eighth-note kicks with the snare on 2 and 4, four
  on the floor humanised (±12 ms), a backbeat drifting ±3% in tempo, 6/8, a kick on the and of two, bass on quarters
  with chords, a kick (with its beater's click) and a bass on every eighth under a snare on 2 and 4, a dotted-eighth
  delay on the rim and the snare, an 808 sub on the quarters under a snare on 2 and 4, a backbeat with a dub echo (0.5)
  on the snare. **None is wrong and certain**; 61 are right and certain, 109 right but close, 92 wrong but close, each
  of those with the right tempo among its alternatives — and **no beat a film may cut on lies off a true beat, sure or
  unsure** (phase is checked for both). **The thresholds are calibrated on these synthetic
  songs only**, with room to spare (loosening every one of them but `kicked` together still claims nothing wrong);
  for a real mix, read the verdict and `map.levels` (`storyreel beats <song>`), and give `bpm` to settle it.
- **An unsure map cuts only where every candidate agrees and the song hits** (`safeBeats(map)`, the one rule the
  pipeline and `fitToMusic` both use): a sure map gives every beat; a close one only the beats that lie on EVERY
  listed candidate's grid (within 0.035 s, `BEATS.safe.tolerance`) — the right tempo is among the candidates, so such
  a beat is a true beat whichever it is — and, of those, only where the song actually hits (`map.hits`, `dsp.mjs ·
  hitsOf`: an attack in the low or mid band, the strongest within a little over a sixteenth either side and at least
  0.6 of the median attack on the beats — a delay's repeat a sixteenth before the beat it precedes, or an echo ringing
  on past the song's end, is not a hit; `unheard` counts the shared beats dropped). None at all when any candidate is
  unsure of its phase (its grid could sit on the "and": the onsets half a beat off it as strong as on it, `phaseDoubt`
  ≥ 0.9). Across the corpus's 201 unsure maps that leaves **0 cuts off a true beat** and 7.1% of the true beats
  cut-able (652 of 9,172).
- **A song's ring-out holds no beat.** No map, sure or unsure, keeps a beat after the song's last hit: the tracker
  carries its grid on through what rings after the music stops — an 808's long tail, a dub echo, a delay's repeats —
  and a beat there sits on nothing, or on an echo off the grid (an 808 on the quarters at 85 kept one, sure, 0.07 s off
  it). The record says how many it dropped (`ringOut`).
- **Unsure snaps little; a tempo settles it.** Measured over the corpus the way an editor cuts — a cut every 3–8 s,
  snapped when a beat it may cut on lies within ±0.15 s — a sure map snaps about 45% of cuts (138 of 306) and an
  unsure one about **4%** (34 of 856). The intersection is not loosened (no subset of the candidates kept every cut on the beat); instead an unsure
  map is quick to settle: `likelyTempi(map)` names its candidates scoring 0.5 or more — the true tempo is among them
  for 196 of the 201 unsure maps — and **a given tempo makes the map sure** (`tempo-given`), so a film cuts on every
  beat. Hear the song, pick one, give it as `music.bpm`.
- **`storyreel beats <song>`** prints the map for a person to settle it in seconds — no project needed (`beatMapText`):

  ```
  $ npx storyreel beats music/theme.wav
  theme.wav · 31.566 s · tempo-close (unsure: a film cuts only on the beats every candidate shares) · 190 BPM, 96 beats

  candidate tempi (score against the strongest):
     190.55 BPM  1.00
      95.15 BPM  0.94
      63.27 BPM  0.85
      47.47 BPM  0.25  (unlikely)

  levels of the beat tried (a level is sure only when it passes every test, and no other does):
      47.64 BPM  phase, kick between (2), kick between (4), filled (2), filled (4), filled (between)
      63.52 BPM  phase, kick between (3), filled (3), filled (between)
      95.28 BPM  phase, kick between (2), filled (2), filled (between)
     190.55 BPM  half-time, backbeat slower

  settle it: give the tempo you hear — music.bpm in makeFilm, or beatMap(file, {bpm}) — one of 191, 95, 63 BPM; the map is then sure, and a film cuts on every beat.
  ```

  `--bpm 95` checks a tempo (the map is then sure); `--ffmpeg` names the FFmpeg. A bad option exits 2, a song that
  cannot be read 1.
- **Known limits — ill-posed rhythms.** Three rhythms no measure can settle, because each is a pulse at more than one
  tempo or phase as much as at the true one; they are in the corpus as their own group (`ill-posed`, 21 songs), pinned
  only to give a verdict the record keeps, never scored:
  - *a snare alone on 2 and 4*: a snare every other beat is a steady pulse at half the tempo; the map is unsure, at
    half the tempo (35 BPM for a song at 70, the only likely one), and its shared beats are the snares — a film cuts on
    2 and 4 only (144 cut-able over the seven tempi, every one a true beat);
  - *a kick-only tresillo* (3 + 3 + 2): three uneven kicks a bar fit several grids, none evenly; always `tempo-close`,
    the strongest seldom the true tempo — and the beats it lets a film cut on (92 over the seven tempi) all fall on
    true beats;
  - *claps alone on the off-beats*: claps on the "and"s are as well a pulse on the beat; the map is unsure (the claps
    on every beat of its tempo are a backbeat of the double), and the beats it shares are ON the claps — every one half
    a beat off the true beat (40 over the seven tempi), which no measure can tell. A given tempo does not move the
    beats off the claps: if you hear them as off-beats, leave `snap` out for that song.
- **Known limits — a heavy delay on the drums.** Repeats at 80% of a dotted-eighth delay on the kick and the snare
  fill every sixteenth with kick-like hits; at 70 BPM the map can then be sure of four times the tempo. The corpus's
  delay (70% on the rim and the snare) stays right or unsure at every tempo; give `bpm` for a dub mix.
- No beat in four standing out is `bars-guessed`; no rise that holds is `drop-none`; a rise that climbs for more than
  2 s with no hit at its start is `drop-fade` — a fade-in, not a drop (`drop: null` both ways).
- **Override what it got wrong**: `beatMap(file, {bpm: 128, drop: 42.5})` — the record then says the tempo and the drop
  were given (a drop past the song's end refuses). `beatMapOf(samples, 22050)` maps samples already in hand.
- **A wrong option says so by code.** Every error `beatMap` throws for the caller's options — an unknown key
  (`{tempo: 120}`), a value out of range (`{bpm: 5}`), a drop past the song's end, samples that are not mono Float32 at
  22050 Hz — carries `code: 'BEAT_OPTIONS'`; an error reading the sound (a missing file, FFmpeg failing, a silent song)
  carries none, so a caller can tell "fix the call" from "fix the file":

  ```js
  try { await beatMap(file, {tempo: 120}); } catch (e) { if (e.code === 'BEAT_OPTIONS') …; }  // "tempo is not an option; the options are bpm, drop, range, ffmpeg"
  ```

**Into a film**, all opt-in — a film without `music` renders byte for byte as before:

```js
await makeFilm({storyboard, recipe, narrationDir, pacing, out: 'out/film.mp4',
  music: {file: 'music/theme.mp3', gain: .2,
    snap: {tolerance: .15},                      // scene starts onto a beat, no scene's length changed by more than 0.15 s
    dropOn: ['story', 'came home']},             // the song starts so its drop lands on this phrase
  render: {soundAt: 'peak'}});                   // every sound effect's loudest moment on its moment
```

- **Snapping** (`music.mjs · fitToMusic`) moves each scene start — a cut, and the transition anchored on it (three
  quarters of its change before the start) — onto the nearest beat within the tolerance. It changes only how long a
  scene's silence after its last word lasts, and **each scene's length changes by at most the tolerance**, so every
  word, drawing and caption keeps its place inside its scene. A scene is never made shorter than its last word, its
  latest keyed moment (a drawing at `["story", "came home", 0.4]` lands after the last word) and then the silence
  after them: 0.1 s (`MUSIC.clear`), or the lead of the entrance into the next scene, which plays in this scene's tail
  (three quarters of a transition; 0.65 s for a hand-over on the page). A beat that would need more is passed over, and
  a cut with no such beat stays where it is, saying why.
- **The moves add up.** The film after a moved cut moves with it, so a cut can end up further from where it was than
  the tolerance: the record keeps each cut's drift (how far it now sits from where it was, against the film's start or
  the key moment), and when two beats are within the tolerance, the one that brings the drift back is taken. Twelve
  scenes, each landing 0.17 s further past a beat than the last, keep every cut within the tolerance of its place.
- **The drop on a key moment.** With `dropOn`, the song starts where its drop lands on that phrase (before the film, the
  song begins part way in; after, the film plays without it until then). That scene's own start is then held by the drop;
  the cuts after it are fitted forward and the ones before it backward from it. A song with no drop the map can find
  refuses with the fix: give `music.drop`, the second it drops. So does anything that would lose the song silently: a
  key moment outside the film, a drop past the song's end, a song placed where it never plays during the film.
- **A voice follows.** In a voiced cut, each moved scene's audio in the run's copy of the voice is padded with silence or
  cut short (faded over 10 ms) to its new length, by whole samples (`fitVoice`; a 16-bit PCM WAV voice, as pacing needs);
  the voice folder itself is never touched.
- **The record.** `map-beats` and `fit-to-music` run as stages of the pipeline, after the pacing; `making-of.json` gets
  `music`: the song, its gain, where it starts, its beat map (tempo, verdict, `sure`, the levels tried, alternatives,
  drop, confidence), the grid the fit cut on (`fit.cutOn`: every beat, shared, or none) and every cut's verdict, with
  both flowcharts' records. An unsure map that snapped leaves a finding in `music.findings`, with the tempi to pick
  from (`tempi`): *tempo unsure (close): cuts only on beats every candidate shares (20 of 40); give music.bpm (one of
  123, 62) to cut on every beat — storyreel beats <song> shows why*. The song and every setting are part of what an approval locks
  (`inputs.music`), and so is `soundAt: 'peak'` when it is asked for (`inputs.soundAt`): a film without either keeps
  the inputs it had.
- **In the mix.** The song plays under the voice and the effects at `gain` (0..1 of its own level), fading out over the
  film's last `fadeOut` seconds (1.5), measured apart as a role (`result.loudness.roles.music`); a song less than 10 LU
  under the voice is a listening finding, as loud effects are. `renderFilm({…, music: {file, start, gain?, fadeOut?}})`
  places a song by hand.
- **Sounds by their peaks.** `soundAt: 'peak'` starts each sound its peak earlier (`sound.mjs · soundPeak`: a door thuds
  0.32 s in, a whoosh swells to its middle, a click is at once), never before its scene starts; left out, every sound
  begins on its moment as before. `peakOf(file)` gives the same for a sound file of your own.

## Check the finished file

A render can pass every check before it and still come out wrong: a segment joined a frame off, a voice
file that went silent, captions shifted by an intro. `checkVideo` reads the finished file itself — the
picture as small grey frames, the sound as samples — and reports what a person would catch watching it:

| check | finds |
|---|---|
| `duration` | picture and sound of different lengths; a picture longer or shorter than the film; a length outside the brief (`expect: {seconds, tolerance?}`) |
| `blank` | a run of one-colour frames the film does not mean (a dip to black is meant) |
| `flash` | a frame unlike both its neighbours, which are alike — a one-frame glitch |
| `handovers` | a cut that lands a frame early or late; a frame repeated where two segments join |
| `voice` | words the film times that are not heard in a voiced render (quieter than −50 dBFS) |
| `lipsync` | mouths that lead or trail the voice beyond what the eye forgives (sound 45 ms ahead or 125 ms behind, ITU-R BT.1359); a mouth moving while nothing is heard; a speaker heard with the mouth shut |
| `captions` | cues out of order or overlapping, past the end of the picture, or starting away from their first word |

```js
import {checkVideo} from 'footprint-storyreel';
const report = await checkVideo({file: 'out/film.mp4', film, captions: 'out/film.srt', voiced: true, expect: {seconds: 240}});
// report.ok, report.findings: [{check: 'flash', at: 12.3, severity: 'problem', text: 'a flash frame at 12.30 s (frame 123): …'}]
```

With the film it was made from, the checks know what was meant, so a dip to black, a cut or a silent scene is
never reported; a check that needs what was not given — or finds nothing to compare, such as lips when no kit
draws a mouth — is skipped, saying why. An intro is your own drawing: the checks read the film's frames after it.
A part of the film (`from`, `to`, as renderFilm takes them) is checked as that part. The checks read the file with
FFmpeg's `ffprobe` (beside the FFmpeg you give, or on the PATH; `FFPROBE_BIN` names another); when it cannot run,
`check: 'report'` records the error in `finished.error` and `check: 'refuse'` refuses. `makeFilm({…, check: 'report'})`
runs them as a stage of its own and writes `finished` into `making-of.json`; `check: 'refuse'` turns a problem
into a refusal. The probe that reads the file is an adapter (`ffmpegProbe()`, or your own `{probe, frames,
sound}`), and each check a strategy (`footprint-storyreel/finished` · `FINISHED_CHECKS`, `FINISHED`). The
first run of these checks found a bug in the renderer itself: FFmpeg's `-shortest` stopped the picture a few
frames early, so the last frames of every film were lost; the sound is now padded to the picture's exact
length instead.

## Break down a reference film

A director who admires a film says "match this". An agent cannot watch it, but it can read numbers and look at
contact sheets. `breakdown(videoFile)` (`footprint-storyreel/breakdown`) reads any MP4 once, small and grey, and writes
down what a viewer would note: every cut and what kind it is, the shots and their lengths, the pacing, where the motion
lives and whether the camera moves, which shots carry lettering, and — given a beat map — which cuts land on the beat.

```js
import {breakdown} from 'footprint-storyreel/breakdown';
const {spec, text, files} = await breakdown('reference.mp4', {out: 'work/reference'});
console.log(text);   // breakdown.md, in plain words:
// | # | from | to | length | comes in by | motion | lettering |
// | 4 | 0:04.8 | 0:06.8 | 2 s | hard cut | things move inside the frame | – |
// | 5 | 0:06.8 | 0:08.8 | 2 s | hard cut | the camera pans right | – |
// | 6 | 0:08.8 | 0:10.4 | 1.6 s | dip through one colour 0.8 s | still | yes |
spec.shots[4].motion.why.rules[1].checks;   // ['pan 0.188 ≥ 0.02 ✓', 'explained 0.97 ≥ 0.5 ✓', 'share 1 ≥ 0.6 ✓']
```

`npx storyreel breakdown reference.mp4 --out work/reference` does the same from the command line; it needs no project
(`storyreel breakdown --help`; a failure prints where the record stopped and its last decisions). It needs **FFmpeg 5.1
or later** (it reads frames with `-fps_mode passthrough`, and hands FFmpeg the stills' selection in a file, since a long
film's runs past what one argument may hold: `-/filter:v` from FFmpeg 7, `-filter_script:v` before. Tested with FFmpeg
9.0.2 on macOS, which takes only `-/filter:v`, and FFmpeg 6.1.1 on Ubuntu 24.04 in CI, which takes only `-filter_script:v`).

- **What it writes:** `breakdown.json` (the spec), `breakdown.md` (the same in plain words), a contact sheet per shot
  (`shots/shot-01.png`: 3 to 6 stills across it, labelled in yellow when it moves), `overview.png` (one still of every
  shot) and `record.json`.
- **Times you can trust.** Every decoded frame is read with its own time (FFmpeg starts every file's clock at 0, a
  transport stream's and an offset MP4's too) and laid on a constant clock (`finished.mjs · onSlots`): slot k is the frame
  a player shows at k / rate (each time exact: showinfo's integer `pts` in its time base, never its `pts_time`, which
  FFmpeg before 7 rounds to six digits — 10 ms past 1,000 s), so a variable-rate file — a phone's, a screen recording — keeps its cuts on the frame shown
  then, and so does a picture that starts after its sound. A picture that changes size mid-stream (two streams joined, a
  WebM) is read on one running count of frames: FFmpeg's filter chain is never rebuilt (`-reinit_filter 0`, the scale
  takes the new size), and showinfo's lines are counted by the reader, never by their own `n`. A slot no new frame reached repeats the one before, and a
  repeat takes no part in finding cuts (a one-frame flash read twice is one flash); a new frame that looks the same as
  the one before — a still screen — is a frame, and counts. The rate is decided, with its evidence in `read.why`: the
  nominal rate, unless it is past 120 a second or more than twice the average. When the two differ the spec says so under
  `warnings` (and the record keeps it); so it does when the file names no length (`video.lengthFrom: 'frames'`: counted
  from the frames read). A picture stored on its side is read as it is shown: `video.width` and `video.height` are the
  shown size, with its `rotation`. A file with sound only refuses: there is no picture to break down.
- **Cuts, and their kinds.** A hard cut is one frame whose change is a peak: 12 grey levels or more, and 3 times the
  change of the frames around it. A flash (one frame unlike the frames either side, which are alike) is reported apart
  and splits no shot. **Fades** are found first, from every run of one colour: the picture fading into it and out of it,
  followed as a trend (an eased fade moves too little in a frame to rise every frame), at least 0.2 s long, and covering
  most of the way before its last step (the picture at that step has at most half its spread): so a fade's own last step
  into black, however sudden, is a step of the fade (`fade-step` in the record), never a cut — and a picture that dims a
  little and then cuts to black was cut. A fade
  in and out round a hold of at most 1 s is a **dip**; a lone **fade-in** or **fade-out** owns its hold. A stretch where the
  picture keeps changing is a **dissolve** when its middle frame is the even mix of its ends, the change runs one way, and
  no shift of the whole picture explains it; anything else that changes is motion. A fade that opens or closes the film
  splits no shot.
- **Shots and pacing:** each shot's start, end and length and how it comes in (a dissolve's middle is the boundary;
  transitions on one frame — a fade out to black, then a cut to white — make one boundary, the others under `also`); the
  median and mean shot, the shortest and longest, cuts a minute. A shot of one colour all through (a slug of black, a
  colour card) says so.
- **Motion:** per shot, a 6 × 4 grid of where the picture changes, and a verdict: **still**; **camera** (the whole
  picture shifts together, found from the row and column means, and most of the frame changes at once; it says which
  way the camera pans or tilts, or none when the shift nets out); or **inside** (things move while the frame holds). The
  film's motion every 0.5 s is in `spec.motion.curve`.
- **Lettering is a heuristic, and says so:** rows of sharp strokes that form lines (at least twice as wide as tall, so
  an icon or a face is left out), covering 0.8% of a still or more. The film's logo is left out (`text.mark` says how
  much): each mark that stays put in a corner of every still of a shot is a candidate, decided by one rule — a logo when
  it stays put in at least 3 shots and at least three quarters of them. A bug in every shot, in shots 1, 2 and 4 of 4, or
  missing only from the title and the credits (8 of 10) is the logo; a name in a corner of one shot, a caption over
  shots 1–2 of 4, or one that comes back after a cutaway (2 of 3) is lettering; a film of two shots has no logo. Its known
  miss: a name shown in 3 shots of 4 reads as a logo — the record shows that decision with its evidence. It never reads
  the words (no OCR).
- **Beats.** `beatMap(audioFile, {...beatOptions, ffmpeg})` → `{bpm, beats: [seconds], drop?, confidence?, alternatives?:
  [{bpm, score}]}` is handed the video's sound as a WAV (in a folder removed after), the beat map's own options
  (`beatOptions`) and this run's FFmpeg, so a beat map such as beats.mjs's fits as it is (`{beatMap}`, or
  `{beatMap: f => beatMap(f, {ffmpeg})}`): `breakdown(file, {beatMap, beatOptions: {bpm: 120}})` lays its grid at 120 BPM
  where it finds no tempo of its own. `beatOptions` are the reader's own: the breakdown hands them on untouched and
  never checks their names or values. A reader that finds them wrong throws an error with `code: 'BEAT_OPTIONS'` — a
  wiring mistake, so the breakdown refuses with it; any other error it throws is a sound it could not read, recorded as
  not run. The spec reports the BPM (and how
  sure: `confidence`, and `close` when another tempo scores 90% of the best or more), the beats, the drop and the shot on
  screen there, and which cuts land within 0.05 s of a beat. Without a beat map, without sound, or when the beat map
  cannot read the sound (it throws: a silent track, no tempo), the spec says the beats were not read, and why (when the beat
  map asks for one of its options, the reason says to give it as `beatOptions`); the rest of the breakdown stands. A beat map that answers in another shape refuses, naming the shape.
- **Every verdict says why.** The breakdown is a footprintjs flowchart (probe → frames → cuts → gradual changes →
  shots → motion → stills → lettering → beats → overview → spec), and each candidate cut, gradual change and shot is
  decided with `decide()`, 100 at a time (a subflow that loops over batches — "left 262 gt 0 ✓, and chose cuts/decide the
  next 100" — so the decisions running together stay few): each verdict in the spec carries every rule tried, its
  measures against the thresholds, and `record.json` keeps the run's narrative, every line naming its candidate by number
  and time — `[Condition]: It evaluated Rule 2 "cut candidate 2 at 1.6 s: the picture jumps in one frame, far more than
  the frames around it change": jump 54.7 gte 12 ✓, ratio 54.7 gte 3 ✓, and chose cuts/each~1/cut.` (the path's `each~N` counts
  within its batch of 100 — footprintjs numbers a fan-out's branches — so the candidate's own number is in the label).
- **Exact values.** A rule compares a measure as it is; the spec rounds it only to show it, and a check shows as many
  decimals as it takes to agree with its verdict (`endSpread 1.472 < 1.5 ✓`, never "1.5 < 1.5").
- **The thresholds** are `BREAKDOWN`: `thresholds: {cutJump: 20}` changes one; an unknown name refuses, naming them.
- **Memory.** It keeps about 4 KB a frame of measures, and a shot's stills only while its sheet is drawn (stills are read
  in one pass and handed over as they come; the overview keeps a small copy of one per shot). Measured: a 4-minute film
  of 385 shots peaks at about 0.6 GB.
- **Limits.** A wipe, a push or a zoom between shots reads as motion, often as a short moving shot between two cuts. A
  dissolve between two shots that both move is found only where its middle is still the mix of its ends. A zoom is not
  told apart from other motion, and a slow change (a board drawn stroke by stroke) can read as still. Lettering is a
  guess from strokes: a row of drawn stars can pass for it. Heavy grain through a dip keeps the black from reading as one
  colour, so the dip can be missed (and read as motion). A synthetic texture that moves (a scrolling pattern) has no
  stable picture to compare, so its cuts and dissolves are less sure than a filmed scene's.

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
import {sliceForKey, formatSlice, keysReadFromExecutionTree} from 'foottrace';
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
the previous and next scene. **Transitions** opens the collection a shot can enter with, on one sheet
(return `kits` from `load()` and their own transitions show too). It listens on 127.0.0.1 only, answers only requests addressed to that
name, only reads (GET), and runs nothing from the recipe. The engine side is `film.regionsAt(t)`
(what is drawn where, each box naming its recipe entry) and `film.pointAt(t, x, y)` (a click in the
recipe's coordinates); every `film.beats[i].path` names the entry that asked for that phrase.

## Built-in kits

- **whiteboard** (story) — a board hanging on paper; marker props, handwriting, eraser, eureka, spotlights.
- **cartoon** (story) — a flat, friendly world drawn in code (no image files): morning-to-evening
  sky, hills, a stone pen and gate, a shepherd who acts his eureka, sheep that walk with a bounce and
  blink on their own rhythms, a bag of pebbles; captions; camera moves (`camera: [{at, to: [x, y], zoom}]`, the frame always stays covered).
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
      regionsAt(t) { return []; },            // optional, for the studio: [{box: [x0, y0, x1, y1] on the sheet, path: 'items[3]', label, name?}]
                                              // a `name` ('robot') is what a director's push can frame: {on: 'robot', size: 'close'}
      layers: [{name: 'sky', depth: 8}, {name: 'hero', depth: 1}],  // optional, back to front: what a camera's orbit,
      drawLayer(ctx, t, name, spot) { },      //   dolly-zoom and rack-focus move by depth (see Camera moves by name)
      cameraMoves: [{from: 4.2, to: 5.8}],    // optional: when the kit's own camera moves (seconds): pushes and camera moves take turns with it
      texts() { return []; },                 // optional, for the reading check: [{text, from, to, gone?, path}] (gone: its last ink, an eraser's end)
      parts(t) { return {segments: {}}; },    // optional, for the geometry audit: {segments, regions, apart} (see Three verdicts)
      sounds: [{time: clock.at(['story', 'But wait']), type: 'chime'}],
    };
  }}};

// A kit may also add transitions (see Transitions): {name, transitions: {curtain: {family, seconds, ease, sound, params, draw}}}.

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

**Characters that talk.** A storyboard scene may name who says it — `{"id": "no", "speaker": "robot",
"narration": "No, it was not shipped."}` — and the clock a kit is compiled with answers who is speaking at any
moment: `clock.speaking(t)` is `{scene, speaker, word, start, end}` while a word is being said and `null`
between words, so a mouth opens and closes with the voice (and only the speaker's mouth moves).
`clock.words(scene)` lists a scene's said words on the film's clock. What a speaker sounds like is the voice
step's business (the starter maps a speaker to a voice profile); a silent scene says nothing.

When the narrator and the characters take turns inside one scene, the voice step can say who says each word: a
word's own `speaker` in timings.json (`{"text": "Yes!", "start": 4.1, "end": 4.4, "speaker": "amaira"}`) wins over
the scene's, and a word with none is the scene's speaker, or the narrator. `speaking(t)`, `turns()` (one turn per
run of words by one speaker), `gaze` and `mouthAt` all follow it. Without word speakers nothing changes.

Listeners look at the speaker. `clock.gaze(t, who)` says where `who` looks: at the character speaking, as
`{at: 'robot', amount: 0..1}` — turning toward them 0.3 s before their first word and back 0.5 s after their last
(`{turn, hold}` to change it) — or `null` when nobody else speaks. A speaker never looks at itself, and a narrator
(a scene with no speaker) is nobody on screen. One speaker's turns in a row hold the look between them; when one
speaker hands over to another, the stronger look wins and `also: {at, amount}` names the other, so a kit can
blend the two instead of jumping. `clock.turns()` lists every turn: `[{scene, speaker, start, end}]`.

```js
const g = clock.gaze(t, 'user');                                   // she looks at whoever talks
const eyes = g?.at === 'robot' ? g.amount : 0;                     // 0 = at her screen, 1 = at the robot
```

```js
import {mouthAt} from 'footprint-storyreel/acting';
const open = mouthAt(clock, t, 'robot');   // 0..1: open only while the robot says a word, about once a syllable
```

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
(no in-between: the start value until the change ends); `spring` (a damped spring: arrives fast, overshoots
about 4% and settles — the "pop" a motion designer reaches for; a formula, so any moment draws the same
pixels); `bounce` (lands and bounces three times, never past the end); `outCubic`, `outQuint`, `outExpo`
(arrivals, each with a faster start and a longer glide than the last; `outExpo` reaches exactly 1); `outBack`
(the same curve as `back`, under the name CSS libraries use); `inOutCubic`; `standard` and `emphasized`
(Material 3's: `cubic-bezier(0.2, 0, 0, 1)`, and its two-piece emphasized path). A four-number curve is asked
for as CSS writes it — `easeNamed("cubic-bezier(0.16, 1, 0.3, 1)")` — or made with `bezier(x1, y1, x2, y2)`:
the same curve a browser draws (solved exactly, by Newton's method with a bisection fallback; x1 and x2 are
times, within 0..1, and anything else refuses). `overshoots(name)` says whether an ease goes past its end on the
way, worked out exactly for a four-number curve. Each takes how far through its seconds a change is (0..1,
clamped) and returns how far the value has gone, exactly 0 at the start and 1 at the end. An unknown name
refuses, naming the eases:

```js
import {easeNamed, bezier, overshoots} from 'footprint-storyreel/ease';
const x = 200 + 600 * easeNamed('spring')((t - start) / .4);   // easeNamed('wobble') → "wobble" is not an ease; the eases are linear, in, …
const glide = bezier(.16, 1, .3, 1);                           // = easeNamed('cubic-bezier(0.16, 1, 0.3, 1)')
overshoots('cubic-bezier(0.34, 1.56, 0.64, 1)');               // true: its y goes past 1
```

**Acting.** A face swapped from one frame to the next reads as a glitch; a change that is acted reads as a
thought. `footprint-storyreel/acting` times a character the way an animator times a reaction, and leaves the
drawing to the kit:

- `moodAt(keys, t)` — keys are `[{at, mood, take?}]` in time order. It returns the `mood` now and the one it
  is changing `from`; `anticipation` (0..1: the eyes close over the 0.1 s before a change and open over the
  0.08 s after it, so the face swaps while they are shut); `take` (a stretch that peaks at the key's `take`,
  falls back past rest by 12% of it and is still 0.4 s after the change; `take: 0` only cross-fades); `u`
  (0..1 over 0.3 s: cross-fade the colours with it); `settle` (a spring, for a pose). A key that repeats the
  mood is no change. Keys out of order refuse.
- `idleAt(t, {seed})` — what a character does while nothing happens: `breath` (a scale), `blink` (0..1, on
  an uneven rhythm), `sway` (pixels), `glance` (a look aside now and then). Each seed moves differently, so
  give every character its own: two characters never blink or breathe in step, and a hold never freezes.
- `follows(f, delay)` — a value that follows another a moment behind: the head goes where the eyes went.
- `mouthAt(clock, t, who)` — how open a speaker's mouth is: it moves only while its owner says a word (the
  scene's `speaker`; `null` is the narrator), about once a syllable. A kit that draws mouths says where they are
  — a world's `mouthsAt(t) → [{who, open}]` (a kit stage's `mouthsAt(handle, t)`) — and the lip-sync check
  holds the finished file to them (`film.mouthsAt(t)` lists the mouths on screen).

Both are pure functions of time, like every frame. The cartoon kit's shepherd acts his eureka this way,
and each of his sheep blinks on its own rhythm.

```js
import {moodAt, idleAt} from 'footprint-storyreel/acting';
const act = moodAt([{at: 0, mood: 'calm'}, {at: eurekaAt, mood: 'surprised'}], t), idle = idleAt(t, {seed: 1});
const shut = Math.max(idle.blink, act.anticipation);           // squint into the change, blink between changes
const headY = y - 185 - 16 * act.take;                         // the take lifts the head, then it settles
eye(ctx, x, headY, act.mood === 'surprised' ? 4.5 + 1.5 * act.u : 4.5, shut);
```

**Sounds.** `tap`, `slide`, `settle`, `question`, `chime`, `door`, `step`, `click`, `whoosh`, `crumble`:
short, quiet and made by procedural synthesis (no samples). A kit's sound is `{time, type, gain?}`:

- `gain` (0..1) overrides the sound's default (1 for the first five; `door` .8, `step` .7, `click` .8,
  `whoosh` .8, `crumble` .7). **A gain is relative to its scene**: each scene's sounds are scaled by one
  factor, set by the loudest moment in that scene (`sound.mjs · createMotionSound`), so a loud door turns
  down every tap in the same scene.
- **Where it sits on its moment**: a sound begins on its moment; `renderFilm({…, soundAt: 'peak'})` starts each one its
  peak earlier, so its hit lands there instead (a door's thud, a whoosh's swell; see *Music: cut on the beat*).
- Names, gains and the count are checked when the film is built (`compileFilm`), not after rendering: a
  misspelled name refuses, naming the kit and the sounds there are, and a scene with more than 64 sounds
  (the engine's and every kit's together) refuses, naming the scene.

```js
sounds: [{time: clock.at(['story', 'the door opens']), type: 'door', gain: .45}, {time: clock.at(['story', 'she walks in']), type: 'step'}]
// type: 'dor' → the story kit "farm" makes a sound "dor"; the sounds are slide, settle, tap, … crumble
```

## Motion from a video

A walk planned by numbers looks like a walk; a child's wave filmed on a phone looks like that child. Real people
hesitate, lean, overshoot and settle, and that timing is hard to key by hand. `footprint-storyreel/mocap` copies it
from a video onto a 2D cartoon figure: the person's 2D keypoints, frame by frame, become a **motion source** that any
kit draws. No 3D body model is needed. The 3D route (SMPL-X, then a rig) is licensed for research only and downloads
gigabytes of weights, and a flat cartoon needs only the joints it can see.

**One port for everything that moves a figure** (`footprint-storyreel/pose`): a motion source is `{name, poseAt(t)}`,
and the pose is the one the kits already draw from a walk: `{x, lift, lean, feet: [{x, lift, angle}, …], swing, turn,
facing, walking, phase}` (a foot's `angle` is its roll, + toes up: a walk rolls heel to toe; motion from a video keeps
it 0, as the ankle stands for the whole foot), plus optional `joints`, the angles a kit may bend limbs by (radians,
+ forward): `{torso, neck, arms: [{shoulder, elbow}, …], legs: [{hip, knee}, …]}`, where `arms[j]` and `legs[j]` are on
`feet[j]`'s side. `walkSource(walk({…}))` is the planned walk as one adapter, and `fromPose` is another.
`motionSource` checks a source of your own; `checkPose` names every key a pose gets wrong. A kit never asks where a
pose came from:

```js
import {readFileSync} from 'node:fs';
import {walkSource} from 'footprint-storyreel/pose';
import {fromPose} from 'footprint-storyreel/mocap';
import {drawFigure} from 'footprint-storyreel/kits/cartoon/figure';

const keypoints = JSON.parse(readFileSync('wave.pose.json', 'utf8'));                // tools/pose-from-video.py wrote it
const wave = await fromPose(keypoints, {x: 900, size: 420, start: 6, from: 1.2, to: 4}); // made once, before compileFilm
const enter = walkSource({from: 100, to: 900, start: 0, size: 420});
// in the kit's draw(ctx, t): the same figure walks in, then waves as the child did
drawFigure(ctx, (t < wave.start ? enter : wave).poseAt(t), {floor: 760, size: 420});
```

The figure (`footprint-storyreel/kits/cartoon/figure`) puts its feet where the pose does, bends its knees forward to
reach them (a foot out of reach brings the hips down, never the foot up), rolls each shoe with its foot's `angle`, and
draws the side the camera sees in front: walking toward +x, the person's right.

**Getting the keypoints.** `tools/pose-from-video.py` reads a video with MediaPipe Pose (Apache-2.0) and writes the
JSON. It is optional, and nothing in the package installs or runs it:

```sh
pip install mediapipe                                       # once, in a virtual environment of your own (it brings
                                                            # OpenCV; do not add opencv-python beside it)
python tools/pose-from-video.py wave.mp4 wave.pose.json     # --model lite|full|heavy (default heavy), --fps 30
```

- **Heavy, by default**: on a clean side-on walk, the full model traded the left and right ankles in 15 of 78 frames
  and the copied feet slid 45–135 px while planted; heavy traded them in 1 and slid at most 19.5 px.
- **It downloads a model on first use**: MediaPipe's pose landmarker (lite about 6 MB, full about 9 MB, heavy about
  30 MB), at a pinned version, from Google's model storage into `~/.cache/storyreel` (`--models DIR`), and reuses it
  after that. It checks the file's SHA-256 against `MODEL_SHA256` in the script (all three are recorded) and removes
  a download that does not match. To pin another model version, change the URL, run once with `--trust-download`
  (it prints the new hash) and record it. The video never leaves the machine.
- **Time**: a phone films at a variable rate, so each frame's own timestamp is read and the points are resampled onto
  a steady `--fps` (default: the video's stated rate), the rate written in the JSON.
- **Visibility**: every point is written with MediaPipe's visibility as its confidence, so `fromPose` decides what is
  seen (`minConfidence`) and its gap rules decide what is filled. A side-on walker's far limbs often read under 0.5:
  give such a clip a lower `minConfidence`. `--min-visibility V` writes the points under V as `null` instead.
- **Logs**: MediaPipe writes INFO and WARNING lines to stderr on every run; the tool filters them out as they come and
  passes on every other line at once (an error, a fatal one just before a crash too). `--logs` shows them all.
- **A damaged file**: a decoder stops at a damaged stretch, so a clip can end early with no error. The time the frames
  read span is held against the video stream's real duration from FFprobe (FFmpeg's, on PATH) — its own, or its
  Matroska `DURATION` tag; the file's only when the video is its one stream, as beside audio that is usually the
  audio's — never against the count its header states: a trimmed file (`ffmpeg -ss 2.2 -c copy`) states the frames its edit list hides, and a variable rate's
  count is an estimate. Frames that end early or start late by more than two frames are reported and written into the
  JSON (`"unread": {frames, why: "damaged", read: [from, to], duration}`), and `fromPose`'s record says so
  (`record.unread`); frames spanning less than half the duration are refused. Without FFprobe there is no duration:
  fewer frames than the header states are reported as `why: "unknown"` (a trimmed file states more than it shows; a
  damaged one ends early), never refused, and the warning says whether FFprobe was not found or gave no duration. A file
  that states a duration or frames yet decodes not one is refused as damaged at its start.

Any COCO-17 detector's output fits the same JSON:

```json
{"scheme": "coco-17", "fps": 30, "coordinates": "pixels", "width": 1280, "height": 720,
 "frames": [[[640, 210, 0.98], [636, 202, 0.95], …17 points], null, {"nose": [641, 211, 0.97], …}]}
```

`scheme` is `coco-17` or `mediapipe-33`. A frame is the scheme's points in its order, or by name (a name left out was
not seen), or `null` where nobody was found. A point is `[x, y, confidence]` (0..1) or `null`. `coordinates` is
`pixels` or `normalised` (shares of the width and the height, which are then needed). Only the thirteen joints a figure
is drawn from are read (nose, shoulders, elbows, wrists, hips, knees, ankles); every point is checked.

**The conversion is a flowchart** (footprintjs), so each run explains itself in `source.record`, to a person or a
model. Every verdict carries `decide()`'s evidence (the facts, the rule, the thresholds) and a sentence that says why:

| stage | what it does | what the record keeps |
|---|---|---|
| read-keypoints | reads and checks the JSON; keeps `from`–`to` (seconds of the video) and reads half a second either side as context; a point under `minConfidence` (0.5) is not seen | `kept`, `nobody`, `dropouts` (one line per joint) |
| fill-gaps | each kind of gap (its length, where it lies) decided once — by its whole length, even where it reaches past a cut: bridged (short, seen on both sides), held (short, at an edge) or refused; a gap wholly in the context is filled, not decided | `gaps`: each verdict with `at`, every place it was used (and how many of its points were reported unsure) |
| smooth | One Euro, forward then back (no lag: a foot lands on the frame it landed on), the ends reflected; with the context, then cut | `torso` (px), `smoothing` |
| normalise | hips as the origin, one torso length as the unit, y up, `mirror` if asked; which way it faces (asked, travel, nose) | `facing` |
| joint-angles | torso, neck, shoulders, elbows, hips, knees; each track continuous (an arm passing overhead never jumps a turn) | `angles` |
| plant-feet | each still stretch of a foot: planted (still for `minContact`, on the floor), aloft (the top of a jump) or passing; a planted foot is locked to its spot; the legs are re-solved to it, the knee bent forward, the bones their own length | `contacts` (frames and film seconds), `notPlanted`, `floor`, `standing`, `reach`, `legs` |
| close-loop | played once (it holds its last frame), or looped: the seam measured with the feet; refused, with the cut where they meet, when a foot would slide there | `loop` |
| retime | the video's frames onto film seconds (`start`, `speed`) | `timing` |
| motion-source | `poseAt(t)`: drawn straight between the frames around t | `source` |

```js
const wave = await fromPose(keypoints, {x: 900, size: 420, start: 6, from: .4, to: 2});   // the tests' wave, 25 fps
wave.record.contacts[0]
// {foot: 'left', frames: [10, 50], lasts: 1.64, overFloor: 0.001, how: 'planted', spot: 0.235, film: [6, 7.6],
//  why: 'still long enough, on the floor: planted: stillSeconds 1.64 ≥ 0.1 ✓, overFloor 0.001 ≤ 0.15 ✓', evidence: {…}}
```

**A planted foot never slides**: through a contact the pose's foot is the same number every millisecond, and the
figure draws it there. **A gap too long to guess refuses**, naming the joint, the video's frames and the fixes:

```
fromPose "video": 1 gap is too long to fill: left_knee is missing in frames 30–45 (16 frames, 0.533 s). At most
0.2 s (maxGap) is filled in: trim the clip past it (from, to: seconds of the video), film it again with the whole
body in view, or raise maxGap
```

A gap is made of points the detector never found, or found but reported under `minConfidence`, and the fix differs:
a point never found wants the whole body in view; a point reported unsure (a side-on walker's far arm, at visibility
0.02–0.2 in every frame) wants a lower `minConfidence`. The refusal says which. A gap is decided by its whole length,
even where it reaches past a cut, and the refusal says which of its frames are kept:

```
fromPose "video": 2 gaps are too long to fill: left_elbow, left_wrist are reported only under minConfidence 0.5 (at
0.02–0.2) in every frame (frames 0–59). At most 0.2 s (maxGap) is filled in: trim the clip past them (from, to:
seconds of the video), lower minConfidence (0.5) to use the points the detector reported, or raise maxGap
fromPose "video": 1 gap is too long to fill: left_knee is missing in frames 40–55 (16 frames, 0.533 s, of which 48–55
are kept). …
```

**A loop joins only where the feet meet.** Looped (`loop: true`), a clip's last frame is the next repeat's first: the
body carries on by the clip's travel, and each angle by its whole turns, so a looped walk keeps walking. The seam is
measured with the feet, in the room: where each foot is at the last frame against where it was at the first. Within
`seam` (0.05 torso lengths) it loops, and a foot planted across the seam is one contact on one spot, so it does not
move there either. A clip planted through its whole length (a wave) loops in place. Past `seam`, it refuses with the
slide and the cut where the feet do meet (`record.loop.cut`). A clip of up to 3,600 frames (two minutes at 30 fps) is
searched, every pair of frames (measured: about 0.4 s for 3,600); a longer one is not, and the refusal says the clip
was too long to search rather than that no cut exists:

```
fromPose "video": looped, its left foot is 29.8 px (0.248 torso lengths) from where it starts at the seam (frame 95
against frame 0), and at most 0.05 (seam) is joined, so it would slide or jump at every repeat. To loop it, trim it to
whole cycles: from 0.466667 to 2.666667 (frames 14–80) meet within 0.2 px; or play it once (loop: false)
```

The arms and the body's height are not locked as the feet are: `record.loop.pose` says how far they jump at the seam
(radians, torso lengths), so trimming to whole cycles can bring it to 0.

A refusal carries the record so far as `error.record`. The settings (`MOCAP`) are seconds, or torso lengths (hips to
shoulders), so they read the same at any size of video: `maxGap` 0.2 s, `stillSpeed` 0.6, `minContact` 0.1 s,
`floorBand` 0.15, `blend` 0.1 s, `seam` 0.05, `smooth` `{minCutoff: 1.5, beta: 0.5, dCutoff: 1}` (or `null`). The same
keypoints give the same record and the same poses every run.

**The record's size** follows the motion, not the detector's flicker. A verdict is written once per kind of gap, with
every place it was used (about 40 bytes each); dropouts are one line per joint (13 at most); there is one entry per
still stretch of a foot (a few a second of walking). The narrative has a few lines per verdict: about five per contact,
plus a few per kind of gap. Measured on a 100-second synthetic walk at 30 fps (3,000 frames): 183 contacts, 972 narrative
lines and a 302 KB record; with a detector flickering on 2,047 points (1,004 gaps), 988 lines and 362 KB.

`node examples/mocap/strip.mjs keypoints.json [out.png]` draws eight moments of a clip and prints what was found (in a
checkout, `test/fixtures/mocap/walk.coco.json` is the tests' synthetic walk).

What it cannot see, so film for it: one person, from a steady phone, the whole body in view, moving across the frame
(walking toward the camera changes their size, and the floor is taken as flat and level in the picture). Depth is
lost; `turn` is how wide the shoulders look against `frontal`. The ankle stands for the foot, so a heel rising before
the toes leave is locked with the foot, and a foot's roll is 0. A lighter model can trade left and right feet; heavy is
the default because it rarely does; there is no swap repair.

## API

| import | what it does |
|---|---|
| `compileFilm({storyboard, timings, recipe, data?, kits?, theme?, root?, strings?, hostKeys?, record?, reducedMotion?})` | the film: `frame(ctx, t)`, `total`, `clock`, `beats`, `sounds`, `notes`, `camera` and `cameraAt(t)` (the camera moves as played), `reading`, `lines` (every line meant to be read), `shots` (each shot's intent, facts and moments), `changes` (every change of picture), `watching`, `claims` (every number shown, with its source), `rows` (the rows of pictures segments are planned from), `moments()`, `regionsAt(t)`, `partsAt(t)`, `pictureAt(t)`, `mouthsAt(t)`, `pointAt(t, x, y)`, `posterAt`, `theme`; with `record: true`, `record` (the compile as a footprintjs run) |
| `renderFilm({film, storyboard, timings, narrationDir?, out, width?, height?, fps?, intro?, stamp?, from?, to?, poster?, loudness?, layout?, motionBlur?, captionFiles?, quality?, video?})` | the MP4 (FFmpeg), its chapters (one per titled scene), its poster, its loudness (two passes); a version for a platform, motion blur, caption files; the picture in one pass or in cached segments |
| `compileLayout(film, layout)` · `FORMAT_NAMES` | a format's picture and bands, drawn at any t (`footprint-storyreel/layout` adds `formatOf`, `cropWindow`) |
| `spokenTracks(film)` | the film's speech as tracks: chunk them with footprint-narration's `captionChunks`, write files with its `captionFile` (`footprint-storyreel/captions` adds `drawCaption`) |
| `TRANSITIONS` · `TRANSITION_NAMES` · `transitionCatalog(kits)` · `transitionSheet({catalog?, moments?, width?})` | the transitions a shot can enter with, a kit's own added, on one PNG (`footprint-storyreel/transitions` adds `readEntrance`, `ghostPainter`) |
| `CAMERA_MOVES` · `CAMERA_MOVE_NAMES` | the camera moves a recipe's `camera` names (`footprint-storyreel/camera` adds `readCameraMove`, `coverZoom`, `covered`, `viewOf`, `aimAt`, `speedRamp`, `handheldAt`, `layersAt`, `REST`, `MAX_ZOOM`) |
| `makeFilm({storyboard, recipe, timings \| narrationDir, pacing?, strings?, out, render?, claims?})` | compile + render as a footprintjs pipeline, with `making-of.json` (a segmented render: one subflow per segment; the claims verdict, `check-claims`) |
| `approveFilm({record, by, note?})` · `checkApproval(approval, inputs)` | the approval lock: approve a watched render from its making-of.json, and whether the film is still it (`makeFilm({…, approval})` refuses otherwise) |
| `checkVideo({file, film?, captions?, voiced?, joins?, intro?, expect?, checks?, probe?})` · `FINISHED_CHECK_NAMES` | checks on the finished file: lengths, blank runs, flash frames, hand-overs and joins, the voice, captions (`footprint-storyreel/finished` adds `ffmpegProbe`, `FINISHED_CHECKS`, `FINISHED`) |
| `footprint-storyreel/breakdown` → `breakdown(videoFile, {out?, beatMap?, thresholds?, ffmpeg?, probe?})` · `breakdownText(spec)` · `BREAKDOWN` | a reference film as a spec to match: cuts, fades and dissolves, shots, pacing, motion, lettering (a heuristic), cuts on the beat (`beatMap(wav, {ffmpeg})`); every verdict with its evidence |
| `segmentedVideo({store, recipe, code?, force?, samples?, parallel?})` · `wholeVideo()` · `folderStore(dir)` · `ffmpegJoin()` · `planSegments(film, {fps})` · `segmentKey(…)` · `codeFingerprint(paths)` | re-render only what changed: the picture in cached segments, joined (`renderFilm({…, video})`) |
| `footprint-storyreel/release` → `makeRelease({targets, post, out, …})` · `loadTarget` · `checkAdapter` · `planProblems` · `TARGET_NAMES` | the post for each platform: the video in its shape, captions, thumbnail, the text to paste, checked against the platform's limits and audience |
| `readCast(cast)` · `castText(text, cast)` · `withCast(value, cast)` | the cast: `{{role}}` in any text becomes the role's name; kits read the rest from `context.cast` |
| `evenTimings(storyboard)` · `paceTimings(storyboard, timings, pacing)` · `applyPacing(…)` | word times without a voice; pacing for a silent or a voiced cut |
| `directionTimings(scene, {tail?})` · `withDirections(storyboard, timings)` · `sceneText(scene)` · `spokenText(scene)` · `unsaidNumbers(storyboard)` | a silent scene's timing; a voice's timings completed with the silent scenes; a scene's text as spoken (number slots in words); digits without a slot |
| `makeClock(storyboard, timings)` | phrases → seconds; `speaking(t)`, `turns()`, `gaze(t, who)` |
| `footprint-storyreel/shots` → `readIntent` · `readContinuity` · `checkContinuity` · `tooMuchTooFast` · `distinctMoments` · `WATCHING` | the shot plan's checks, on their own |
| `footprint-storyreel/review` → `reviewPart(film, {part?, layout?, checks?, …})` · `REVIEW_CHECKS` · `findingsText` · `verdictsText` · `wordsAt` | a part reviewed by reading it: findings with times, and three verdicts (passed, failed, not run) with their `decide()` evidence |
| `footprint-storyreel/slideshow` → `slideshowOf(film, {from?, to?, every?, rule?})` · `shotMotion` · `shotInsides` · `moved` · `SLIDESHOW` · `SLIDESHOW_VERDICT` | no slideshow: how much each shot moves in its middle, and whether most of the running time is dead (held still more than 3 s) |
| `footprint-storyreel/geometry` → `geometryOf(film, {from?, to?, rule?})` · `auditParts` · `readParts` · `crosses` · `breakText` · `GEOMETRY` · `GEOMETRY_VERDICT` | a kit's drawn parts audited: mounted ends stay on, pairs kept apart never cross, a planted end stays where it was planted |
| `footprint-storyreel/claims` → `numbersIn` · `numberValue` · `numberLocale` · `CODE_READING` · `readFacts` · `sourceKind` · `exampleScenes` · `labelSpans` · `findClaims` · `drawnLines` · `DRAWN` · `HOLD` · `drawnClaims` · `lingeringExamples` · `claimsCount` · `unsourcedClaims` · `claimText` · `CLAIMS_VERDICT` | every number on screen with its source: a fact the storyboard names, or an example scene (`film.claims`; the review adds what the picture draws) |
| `footprint-storyreel/decorative` → `decorative` · `code` · `isDecorative` · `isCode` · `DECORATIVE` · `CODE` | text a kit draws but the film does not say (line numbers, badges): read by every review check but the claims check |
| `footprint-storyreel/ease` → `EASES` · `easeNamed(name, where?)` · `bezier(x1, y1, x2, y2)` · `overshoots(name)` · `inOut` | the one ease table (`linear in out inOut back walk jump spring bounce outCubic outQuint outExpo outBack inOutCubic standard emphasized`), and four-number curves as CSS writes them |
| `footprint-storyreel/moves` → `moveAt(move, t, {start, seconds?, feel?, reduced?})` · `stagger(items, gap)` · `movesBy({feel, use, kind})` · `readMove` · `applyMove` · `MOVES` | motion asked for by name: 30 moves as data, by feel and use, with the practitioners' timing rules |
| `footprint-storyreel/principles` → `anticipate` · `squash` · `envelope` · `burst` · `arc` · `BURSTS` | anticipation, volume-keeping squash and stretch, one-shot events that add, paths that curve like a hand |
| `footprint-storyreel/acting` → `moodAt(keys, t)` · `idleAt(t, {seed})` · `follows(f, delay?)` · `ACTING` | a mood change acted (anticipation, a take, a cross-fade), an idle layer that never moves in step |
| `footprint-storyreel/beats` → `beatMap(file, {bpm?, drop?, range?})` · `beatMapOf(samples, 22050)` · `safeBeats(map)` · `likelyTempi(map)` · `beatMapText(map)` · `peakOf(file)` · `peakOfSamples` · `BEATS` | a song's tempo, beats, bars and drop, with the alternatives and how sure (its record: every verdict with its evidence); the beats an unsure map may be cut on, and the tempi to settle it with (`storyreel beats <song>`); a sound's peak; a bad option throws with `code: 'BEAT_OPTIONS'` |
| `footprint-storyreel/music` → `fitToMusic({storyboard, timings, beats, snap?, dropOn?, recipe?, kits?})` · `fitVoice(runDir, before, after)` · `MUSIC` | scene starts onto the beat (each scene's length changed by at most a tolerance, never past its words, keys or the next entrance's lead; off unless `snap` is given); the song started so its drop lands on a key moment (`makeFilm({…, music})` runs both) |
| `footprint-storyreel/pose` → `motionSource({name, poseAt})` · `walkSource(walk)` · `checkPose(pose)` · `POSE_KEYS` · `TORSO_SHARE` | the motion-source port: one pose shape for everything that moves a figure; the planned walk as one adapter |
| `footprint-storyreel/mocap` → `fromPose(keypoints, {x, size, …})` · `MOCAP` · `SCHEMES` · `RIG_JOINTS` | motion copied from a video's 2D keypoints (COCO-17, MediaPipe-33), as a motion source with its record |
| `footprint-storyreel/kits/cartoon/figure` → `drawFigure(ctx, pose, {floor, size})` · `figureAt` · `FIGURE_COLORS` | a cartoon figure any motion source moves; planted feet stay put |
| `contactSheet(film, {moments?, columns?, width?})` | a PNG of stills |
| `frameHashes(film, {count?, width?, times?, each?})` · `changedFrames(pinned, now)` | pixel pins (`each(t, ctx)` sees every frame drawn) |
| `whiteboardKit` · `cartoonKit` · `loadTheme('paper' \| 'storybook')` | the built-in looks |
| `footprint-storyreel/studio` → `startStudio({load, watch, port})` | the preview studio |

TypeScript types ship with the package: the main entry, `/studio`, and the documented subpaths (`/clock`, `/pacing`, `/ease`, `/moves`, `/principles`, `/acting`, `/finished`, `/listening`, `/release`, `/pins`, `/sheet`, `/render`, `/segments`, `/approval`, `/pipeline`, `/film`, `/strings`, `/theme`, `/reading`, `/shots`, `/review`, `/slideshow`, `/geometry`, `/claims`, `/decorative`, `/regions`, `/captions`, `/layout`, `/transitions`, `/breakdown`, `/camera`, `/beats`, `/music`, `/kits/whiteboard`, `/kits/cartoon`, `/pose`, `/mocap`, `/kits/cartoon/figure`). The drawing internals a kit author may reuse (`/pen`, `/ground`, `/sound`, `/notes`, `/kits/paper`, `/kits/paper/code`, `/kits/whiteboard/board`) are plain JavaScript without types.


## Laws

1. **Data only.** A recipe names shapes, phrases and numbers; an unknown key refuses. Nothing in a recipe runs.
2. **Phrases, not seconds.** Pictures follow the voice; change the voice and the film follows. Seconds appear only where the storyboard declares a silent scene, as each direction's length.
3. **Pure function of time.** `frame(ctx, t)` draws any moment in any order, the same way every time.
4. **Every frame restores the canvas**: no leaked transform, alpha, compositing, shadow, filter or clip (the test fills the whole frame after each one and reads its corners).
5. **One focal point at a time**: speech is a bubble, data is a pill, the old stage leaves before the new one arrives, one camera: its moves take turns with the focus, the pushes and the spotlights.
6. **Long enough to read.** A line meant to be read stays up about 0.3 s a word.
7. **Said in words, shown in digits.** A number the voice reads is a say slot; a word the voice did not say is caught by listening back, not by alignment.
8. **Notes change the camera, never the beats.** Every note says what was asked; one the film cannot honour refuses.
9. **Say what made it.** The making-of record lists every phrase → drawing, every note, every tool, and the compile stage by stage.
10. **Pinned pixels.** An approved film stays the approved film until a change is meant.
11. **Draw again only what changed.** A segment is reused only when its key — the entries, lines, words, notes, inputs, settings and code that draw it — is unchanged and a spot check of its frames, painted as the video shows them, agrees; the sound is mixed whole every time.

## Not in this package

StoryReel is for teaching and story films. **Screenshots shown as evidence are in scope**: a real
screen or a real result, shown so the viewer sees the actual thing a lesson is about, is the honesty law
at work, not marketing. **Marketing polish is not**: launch videos, brand campaigns and polished product
shots are left out on purpose; a launch-video tool such as
[`/brag`](https://github.com/latent-spaces/brag) (a Claude Code skill, MIT) fits better. What comes
next here — recipe kinds, a library explainer generated from a repository, a teaser cut of a film — is
in [BACKLOG.md](BACKLOG.md).

## What it uses

| library | licence | for |
|---|---|---|
| footprintjs | MIT | the pipeline and its making-of record |
| @napi-rs/canvas | MIT | drawing |
| perfect-freehand | MIT | marker strokes |
| roughjs | MIT | sketched shapes |
| shiki | MIT | code tokens |
| footprint-narration | MIT | the spoken text and the captions |
| Caveat (font, bundled) | SIL OFL 1.1 | handwriting |
| twitter-text 3.1.0 (ported, bundled) | Apache-2.0 | X's count of a post |
| twemoji-parser 11.0.2 (its emoji list, bundled) | MIT | the emoji X counts as 2 |
| FFmpeg (separate program, on PATH) | LGPL/GPL | encoding and mixing |
| MediaPipe Pose (optional, `tools/pose-from-video.py`; not installed) | Apache-2.0 | keypoints from a video |

Node 22+. Licence: MIT AND Apache-2.0 — StoryReel's own code is MIT; the X counter is ported from twitter-text,
Apache-2.0 (`src/targets/x-count/LICENSE-twitter-text`); the bundled Caveat font is SIL OFL 1.1 (`fonts/caveat/OFL.txt`).
First user: the AgentFootprint video course.
