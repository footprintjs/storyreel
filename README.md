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
- **Honest by construction.** Values on screen can be read from real data (a recorded run), a line
  too short to read is reported (or refused), and every film says how it was made.
- **The same frames every time.** `frame(ctx, t)` is a pure function of time. Pixel pins catch any
  change that moves a pixel, so a film you approved stays the film you approved.
- **Direct it like a director.** Camera words as data (`speed`, `cut`, `push`), a collection of
  transitions to cut between shots, and a local studio where you scrub, play with the voice, and click a
  drawing to find the line of the recipe that drew it.
- **One film, every platform.** The same film renders as a YouTube video, a square feed post and a
  vertical Short or Reel — with a title band, captions burned in from the voice's own word times, and a
  crop that follows the action — or with caption files for players that show their own.

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

Every entrance also takes `seconds` (0.2–3), `ease` (a name from the ease table) and `sound` (a sound's
name, or `false`). An ease that goes past the end (`back`, `spring`) is refused where the frame's edge
would show — only `slide` takes one. An unknown name, key or setting refuses, naming what the transition
takes: `enter has unsupported key at (a push takes seconds, ease, sound, from)`.

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
  one over a spotlight or another push — one camera move at a time.

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
`instagram-reels`), each imported only when a release names it. What differs between platforms lives in
the adapter as data: the video's shape, its length, the text fields and their limits, the thumbnail, who the
platform is for, and how the text is composed (YouTube's description gets the film's chapters).

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
  TikTok, Instagram (13 and over) and LinkedIn (16 and over) refuse it, with the fix: the full film goes where
  children watch, and a teaser for parents goes there as `'general'`.
- **Refused before a frame is drawn** when it can be known then (the audience, a title over the limit, a
  thumbnail of the wrong shape, a part too long); the film's own length and the text with its chapters are
  checked after the render.
- **Limits change.** Each adapter says when its facts were checked and where (`facts`); a target may override
  one (`{target: 'tiktok', limits: {seconds: {max: 3600}}}`). An adapter of your own is an object of the same
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
  `dim` veils the rest in the paper, `none`. A camera focus and the director's push notes cannot share the camera.
  `safe` keeps framed things where captions cannot cover them (`[0, 0, 1600, 700]` above burned-in captions).
  Strategies compose: `"strategy": ["camera", "dim"]` moves the camera and veils the rest of its view.
- **Emphasis strategies** (`EMPHASIS`): `pop` lands the words big on their beat and settles them into a label in
  the top corner until the next words; `corner` is the label only; `none`.
- **Your own strategy** has the same shape, by name: `compileFilm({…, strategies: {focus: {mine: {show(ctx, view,
  paint, theme)}}, emphasis: {mine: {draw(ctx, t, word, theme)}}}})`.
- **Every move is a spring** (`footprint-storyreel/motion`): named feels — `snappy`, `default`, `heavy` (cameras),
  `playful` (pops) — or `{k, d}`; `spring(t, feel)`, `pop(t, at)`, and `track(t, keys)` for a value with many
  targets (one spring per change, so it never jumps). Kits use the same functions for their own motion.
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
  resolved, the words spoken in and around it (captions and mouths), the director's notes over it, the
  strings its entries name (`{"$string": key}`: one word changed redraws only the segments that show it),
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
  words under the captions while a caption shows, words over other words, words cut off at the edge, nothing
  changing for 5 s. Read the findings and the timeline first; look at a frame only to confirm:

  ```js
  import {reviewPart} from 'footprint-storyreel/review';
  const r = await reviewPart(film, {part: {scenes: ['chapters']}, layout: {format: 'landscape', captions: true}});
  console.log(r.timeline); console.log(r.text);
  // 2:02.5–2:05.3 chapters · under the captions: "one turn"
  ```
  The review is a footprintjs flowchart: a selector picks each check by what the part has (no caption band, no
  caption check), each check runs as its own subflow, and `r.record` says what ran and why. A check of your own
  is `{label, why, when(scope), find(review)}` in `checks`.
- **The same, from the command line — and as a skill for agents.** `npx storyreel timeline | review | part | still
  --scene <id>` (the film named in the project's `storyreel.config.mjs`: `export default {film: flags =>
  ({storyboard, recipe, kits, root, narrationDir?, pacing?, layout?})}`; every flag also reaches `film()`). The
  package ships the skill that teaches the order — timeline, review, fix, part, one still last — as a Claude Code
  plugin: `claude plugin marketplace add footprintjs/storyreel`, then `claude plugin install storyreel@storyreel`
  (or copy `plugin/skills/storyreel-review/SKILL.md` into a project's `.claude/skills/`). `footprint-storyreel/tools` is the one core both use.
- **And as an MCP server,** for any assistant that speaks MCP: `storyreel mcp [--flag value …]` serves the same
  four tools over stdio (the flags are every call's defaults; a still comes back as the picture). Each call runs in
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
      texts() { return []; },                 // optional, for the reading check: [{text, from, to, path}]
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
pixels). Each takes how far through its seconds a change is (0..1, clamped) and returns how far the value
has gone. An unknown name refuses, naming the eases:

```js
import {easeNamed} from 'footprint-storyreel/ease';
const x = 200 + 600 * easeNamed('spring')((t - start) / .4);   // easeNamed('bounce') → "bounce" is not an ease; the eases are linear, in, …
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
| `compileFilm({storyboard, timings, recipe, data?, kits?, theme?, root?, strings?, hostKeys?, record?})` | the film: `frame(ctx, t)`, `total`, `clock`, `beats`, `sounds`, `notes`, `reading`, `shots` (each shot's intent, facts and moments), `watching`, `rows` (the rows of pictures segments are planned from), `moments()`, `regionsAt(t)`, `pointAt(t, x, y)`, `posterAt`, `theme`; with `record: true`, `record` (the compile as a footprintjs run) |
| `renderFilm({film, storyboard, timings, narrationDir?, out, width?, height?, fps?, intro?, stamp?, from?, to?, poster?, loudness?, layout?, motionBlur?, captionFiles?, quality?, video?})` | the MP4 (FFmpeg), its chapters (one per titled scene), its poster, its loudness (two passes); a version for a platform, motion blur, caption files; the picture in one pass or in cached segments |
| `compileLayout(film, layout)` · `FORMAT_NAMES` | a format's picture and bands, drawn at any t (`footprint-storyreel/layout` adds `formatOf`, `cropWindow`) |
| `spokenTracks(film)` | the film's speech as tracks: chunk them with footprint-narration's `captionChunks`, write files with its `captionFile` (`footprint-storyreel/captions` adds `drawCaption`) |
| `TRANSITIONS` · `TRANSITION_NAMES` · `transitionCatalog(kits)` · `transitionSheet({catalog?, moments?, width?})` | the transitions a shot can enter with, a kit's own added, on one PNG (`footprint-storyreel/transitions` adds `readEntrance`, `ghostPainter`) |
| `makeFilm({storyboard, recipe, timings \| narrationDir, pacing?, strings?, out, render?})` | compile + render as a footprintjs pipeline, with `making-of.json` (a segmented render: one subflow per segment) |
| `approveFilm({record, by, note?})` · `checkApproval(approval, inputs)` | the approval lock: approve a watched render from its making-of.json, and whether the film is still it (`makeFilm({…, approval})` refuses otherwise) |
| `checkVideo({file, film?, captions?, voiced?, joins?, intro?, expect?, checks?, probe?})` · `FINISHED_CHECK_NAMES` | checks on the finished file: lengths, blank runs, flash frames, hand-overs and joins, the voice, captions (`footprint-storyreel/finished` adds `ffmpegProbe`, `FINISHED_CHECKS`, `FINISHED`) |
| `segmentedVideo({store, recipe, code?, force?, samples?, parallel?})` · `wholeVideo()` · `folderStore(dir)` · `ffmpegJoin()` · `planSegments(film, {fps})` · `segmentKey(…)` · `codeFingerprint(paths)` | re-render only what changed: the picture in cached segments, joined (`renderFilm({…, video})`) |
| `footprint-storyreel/release` → `makeRelease({targets, post, out, …})` · `loadTarget` · `checkAdapter` · `planProblems` · `TARGET_NAMES` | the post for each platform: the video in its shape, captions, thumbnail, the text to paste, checked against the platform's limits and audience |
| `readCast(cast)` · `castText(text, cast)` · `withCast(value, cast)` | the cast: `{{role}}` in any text becomes the role's name; kits read the rest from `context.cast` |
| `evenTimings(storyboard)` · `paceTimings(storyboard, timings, pacing)` · `applyPacing(…)` | word times without a voice; pacing for a silent or a voiced cut |
| `directionTimings(scene, {tail?})` · `withDirections(storyboard, timings)` · `sceneText(scene)` · `spokenText(scene)` · `unsaidNumbers(storyboard)` | a silent scene's timing; a voice's timings completed with the silent scenes; a scene's text as spoken (number slots in words); digits without a slot |
| `makeClock(storyboard, timings)` | phrases → seconds; `speaking(t)`, `turns()`, `gaze(t, who)` |
| `footprint-storyreel/shots` → `readIntent` · `readContinuity` · `checkContinuity` · `tooMuchTooFast` · `distinctMoments` · `WATCHING` | the shot plan's checks, on their own |
| `footprint-storyreel/ease` → `EASES` · `easeNamed(name, where?)` · `inOut` | the one ease table (`linear in out inOut back walk jump spring`) |
| `footprint-storyreel/acting` → `moodAt(keys, t)` · `idleAt(t, {seed})` · `follows(f, delay?)` · `ACTING` | a mood change acted (anticipation, a take, a cross-fade), an idle layer that never moves in step |
| `contactSheet(film, {moments?, columns?, width?})` | a PNG of stills |
| `frameHashes(film, {count?, width?, times?})` · `changedFrames(pinned, now)` | pixel pins |
| `whiteboardKit` · `cartoonKit` · `loadTheme('paper' \| 'storybook')` | the built-in looks |
| `footprint-storyreel/studio` → `startStudio({load, watch, port})` | the preview studio |

TypeScript types ship with the package: the main entry, `/studio`, and the documented subpaths (`/clock`, `/pacing`, `/ease`, `/acting`, `/finished`, `/listening`, `/release`, `/pins`, `/sheet`, `/render`, `/segments`, `/approval`, `/pipeline`, `/film`, `/strings`, `/theme`, `/reading`, `/shots`, `/regions`, `/captions`, `/layout`, `/transitions`, `/kits/whiteboard`, `/kits/cartoon`). The drawing internals a kit author may reuse (`/pen`, `/ground`, `/sound`, `/notes`, `/kits/paper`, `/kits/paper/code`, `/kits/whiteboard/board`) are plain JavaScript without types.


## Laws

1. **Data only.** A recipe names shapes, phrases and numbers; an unknown key refuses. Nothing in a recipe runs.
2. **Phrases, not seconds.** Pictures follow the voice; change the voice and the film follows. Seconds appear only where the storyboard declares a silent scene, as each direction's length.
3. **Pure function of time.** `frame(ctx, t)` draws any moment in any order, the same way every time.
4. **Every frame restores the canvas**: no leaked transform, alpha, compositing, shadow, filter or clip (the test fills the whole frame after each one and reads its corners).
5. **One focal point at a time**: speech is a bubble, data is a pill, the old stage leaves before the new one arrives, one camera move at a time.
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
| FFmpeg (separate program, on PATH) | LGPL/GPL | encoding and mixing |

Node 22+. Licence: MIT (the bundled Caveat font: SIL OFL 1.1, `fonts/caveat/OFL.txt`).
First user: the AgentFootprint video course.
