# StoryReel motion grammar: a Flash-like language, anchored to the voice

*Design, 2026-09-30, revised after review. Nothing is built yet. Code is cited as file · symbol under `storyreel/src/`. All example content is invented.*

## 1. Why

A short film made by hand at the owner's workplace showed what holds an audience:
- a silent walk-in that taps a real screen
- a dive "behind that tap" into the machinery
- chips landing on a screenshot
- a helper robot sweeping a light over a picture
- a thought cloud replaying an earlier moment
- a card crumbling to dust
- balloons
- a big question, then "But wait…"

The film did **not** show that the voice clock is too weak. We counted its 217 moment references:
- 150 are a bare phrase;
- 51 are a phrase plus a small offset (0.15 to 2 seconds);
- 16 are in seconds. All 16 are in the one silent opening, which had no words to hang on.

Silent directions (phase 0) fix that opening.

The real cost was something else. Every device was built by hand from low-level layers inside a patched engine, so the next film, an agent, or one day a studio cannot pick any of them up. This design turns the eight devices into named building blocks in the library, all written in one small grammar, so they can be reused and later edited visually.

Flash showed how motion can grow into a tool. It split a film into two parts:
- the **Library**, where each drawing is defined once, as a symbol;
- the **Timeline**, which says when each placed copy has which values.

People set keyframes, and the engine worked out the frames in between. Masks, motion paths, presets and the Flash editor itself were all built on that split. Wherever code came into a Flash film, the editor could no longer show what it would do.

StoryReel adds something Flash never had: **the voice is the clock.** The timeline's ruler is the spoken words, not frame numbers. If the narration is re-recorded, the pictures follow it. Everything below is JSON data, and nothing in it runs. The grammar ships only what the eight devices use. Everything else goes on a "later" list (section 12) and waits until a device or a real film needs it.

## 2. The model in ten concepts

| concept | in ten words or fewer |
|---|---|
| library | drawings, ways and devices, each defined once, by name |
| symbol | one drawing a kit paints, with typed knobs and areas |
| item | one placed, named copy of a symbol |
| channel | one value of an item that keys can change |
| layer | a named band of items: art, guide, mask or camera |
| line | a spoken phrase or silent direction: the root of every "when" |
| key | a channel's value at a line, eased over seconds |
| verb | a named key shape: enter, move, focus, reveal, leave |
| clip | an item that shows an earlier stretch of the film |
| device | a library entry of items and keys, with knobs |

## 3. Vocabulary

The full map stays here so a studio can grow into it. The last column says when each word lands. "Later" means it is on the later list.

| StoryReel | Flash | CSS / SVG / Lottie | meaning | lands |
|---|---|---|---|---|
| frame | Stage | viewport, `viewBox` | the 1600×900 picture the viewer sees | today |
| world, camera | Pasteboard, Camera layer | After Effects camera | a bigger canvas; the camera chooses what shows | 2 |
| library, symbol | Library, Graphic symbol | `<defs>`, `<symbol>`, precomp | drawings defined once, by name | 1a |
| knob | Component parameter | Essential Properties | a typed setting a symbol exposes | 1a |
| item (`as`) | instance + instance name | `<use id>` | one placed, named copy | 1a |
| area (`@x#name`) | a button's hit area | HTML `<map><area>` | a named box on a symbol, as fractions of it | 1d |
| channel | Motion Editor property row | Lottie `ks` | a value that can take keys | 1a |
| layer | layer | `z-index` | a named band, drawn back to front | 1a |
| swap layer | a keyframe that replaces what was there | – | a new arrival makes the last one leave | 1b |
| line, label | frame label | SMIL syncbase, Lottie `markers` | a spoken phrase or direction, or a shared name for one | 0, 1b |
| key, tween | keyframe, motion tween | `@keyframes` stop | a value at a line; the engine fills in the motion between | 1a |
| ease (`jump`) | Penner easing (hold keyframe) | `cubic-bezier()` (`steps()`) | how a change speeds up and settles (`jump`: no in-between) | 1a; four-number curves later |
| verb, way | Motion Preset | `@keyframes` name, Manim `FadeIn` | a named key shape, and how it looks | 1a; recipe-written ways later |
| guide (`along`) | motion guide | `<animateMotion>` | a line an item travels | 3 |
| mask layer | mask layer | `clip-path`, Lottie `tt` | the named layers show only through its shape | 3 (engine shapes only) |
| clip (`time`) | Graphic loop mode | Lottie `st/sr/tm` | an item showing an earlier stretch of film time | 4 |
| carry | shape tween | View Transitions | the same name in two pictures morphs from one to the other | later |
| voice, cue | stream sound, event sound | EPUB Media Overlays | the narration is the clock; a cue is a one-shot sound | 0 |
| device | Motion Preset + component | `.mogrt` | an audience device with knobs | 1c |

## 4. The grammar

### 4.1 Where it lives, three naming rules, and words with two meanings

The grammar is a new world kind, `"kit": "motion"`. It goes in `recipe.story` or in `stages[i].world`. `library` and `labels` sit at the top of the recipe.

- `at` always means **when**. `seconds` always means **how long**; recipes already use that word. A place is always `x`/`y`, an item (`@ledger`), or an item's area (`@ledger#cups`).
- These rules apply only inside the motion kit. Outside it, `push.at`, `spots[].at` and `enter.at` (the iris centre) still mean places.
- An unknown key is refused, and the refusal names the fix, as `notes.mjs · readPush` does today.

```json
{"library": {}, "labels": {}, "story": {"kit": "motion", "world": [3200, 1800], "layers": []}}
```

Some words already mean something else in a recipe. This table keeps them apart:

| word | inside the motion kit | elsewhere in a recipe | how they stay apart |
|---|---|---|---|
| `at` | when | a place: `push.at`, `spots[].at`, `enter.at` | the motion kit's refusals name its meaning |
| `done` | names the moment a key finishes | – | chosen over `mark`, because `marks` is already a stage key (signs beside code lines, `film.mjs · STAGE_KEYS`) |
| `tick` | the small sign agentScan drops | – | the same reason |
| `lines` | a device's list of the lines it needs, and a use's ties from those names to real lines | – | chosen over `labels`, which means only the top-level named moments |
| `focus` | the camera verb, inside a key | a stage's code-line highlight | a key field vs a stage key; never on the same object |
| `reveal` | a verb that uncovers through a mask | a stage's `[line, phrase]` reveal | the same |
| `card` | a symbol name (a value of `use`) | the recipe's title-card key | a value vs a key |
| `plus` | a key's offset from its line | the third element of a phrase reference | giving both on one key is refused |
| `hold` | not used | a pause after a line, in `pacing.json` | a device asks for a pause with `needsPause` |
| `spot` | not used | spotlights (`spotAt`) | a symbol's named boxes are `areas` |

### 4.2 Lines: phrases, directions, labels, derived moments

`at` takes one of three things:
- a phrase, written as today's beat reference (`clock.mjs · makeClock`): `[scene, phrase, plus?]` or `{scene, phrase, edge, nth}`;
- a label name;
- a derived moment (below).

`plus` can be from −1 to 2 seconds. That is enough to start just before or after a phrase, but never enough for seconds to become the "when".

**Silent scenes.** A silent scene is written in `storyboard.json` (the clock reads the storyboard). In place of `narration` it has directions: script lines, each with a length. The clock treats a direction like a spoken phrase. The voice and the captions skip directions.

```json
{"id": "open", "silent": [["the door opens", 1.0], ["Mia walks to the stall", 3.0], ["she taps the ledger", 1.5]]}
```

Silent scenes reach well past the clock, so one new function owns them: `clock.mjs · directionTimings` (proposed). It turns a silent scene's directions into a scene timing, with three parts: words taken from the directions, a generated silent audio file of the right length, and the alignment method `"directions"`. Every caller uses it:
- `clock.mjs · evenTimings` and the starter's voice step. Today the voice step knows only scenes with narration.
- `pacing.mjs · applyPacing`, `paceTimings` and `planHolds`. Today these read a WAV file and call `speechIndex` for every scene. They will skip holds inside a silent scene (the scene's tail still applies), and they will refuse a hold placed after a direction.
- `render.mjs · renderFilm`. It joins one audio file per scene, and it will use the generated silence.
- `studio/server.mjs · filmJson`. Direction words are marked "not spoken" in the transcript.
- `types/index.d.ts · Storyboard`. A scene may carry `silent` and no `narration`.

A direction inside a spoken scene waits for phase 6 (section 10). Until then it is refused.

**Labels.** Keys normally quote their phrase directly. A label gives a shared moment a name, so the moment is written in one place:

```json
"labels": {"sold": ["count", "every cup she sold", 0.3]}
```

**Derived moments.** There are two:
- `done` names the moment a key finishes.
- `reach` is the moment an item moving along a guide passes an area. It is refused on a key whose ease overshoots (`back`), because an overshoot can pass the same spot two or three times. The allowed eases are `linear in out inOut walk`.

Every chain of derived moments must end at a line, and chains may not loop. The making-of record prints each chain, for example: `chip ← done "tapped" ← "she taps the ledger"`.

### 4.3 Library and symbols

A recipe's `library` holds named **presets**: a symbol with some of its knobs filled in. The built-in devices are data that the library owns. A recipe can define its own devices and ways only once the studio exists (later list).

```json
"library": {"ledger": {"use": "picture",
  "knobs": {"src": "shots/ledger.png", "areas": {"cups": [0.62, 0.2, 0.3, 0.1], "cash": [0.62, 0.7, 0.3, 0.12]}}}}
```

Areas are fractions of the image, so they still line up on a retaken screenshot with the same layout. An area is addressed as `@ledger#cups`. The `#` means an area name can never collide with a channel or knob name.

Images load only from inside the film's root folder (the `root` option, which defaults to the working folder). Today's check, `film.mjs · compileFilm · within`, only compares how the paths begin. So with root `/x/film`, the path `../film-private/x.png` is accepted. Phase 0 replaces the check:
- resolve real paths first, so a symbolic link cannot point outside;
- compute `path.relative(root, path)`;
- refuse a result that starts with `..` or is an absolute path.

### 4.4 Items, channels and types

```json
{"as": "ledger", "use": "ledger", "x": 1210, "y": 520, "scale": 0.9, "parent": "@stall"}
```

Every item has four built-in channels: `x y scale alpha`. It also has one channel for each knob its symbol declares. `parent` is an item or an item's area (`@robot#lamp`), and makes the item move with it. `rotate`, `pivot` and `tint` are on the later list.

**Transparency.** `alpha` applies to each shape separately, because canvas transparency acts on each drawing call. A symbol made of overlapping shapes therefore shows its overlaps while it fades. A symbol that must fade as one piece declares `group: true`. Only then does the engine draw it through a full-size layer (`film.mjs · layerFor`), so the cost shows where it is paid. When `tint` lands, it will be a value handed to `draw` (the symbol paints in that theme colour), never a compositing pass.

Depth is not a channel. Only layer order decides what is in front.

**One table of types, for channels and knobs alike.** A future studio builds its settings panel from this table:

| type | examples | in-between | checked |
|---|---|---|---|
| number | `x`, `size`, `count` | smooth change | the symbol's range |
| seconds | `seconds`, a device's `pause` | – | 0.1 to 3; walks and replays up to 8 |
| progress | `progress`, `open`, `flight` | smooth change | 0 to 1 |
| zoom | `zoom` | smooth change | 0.25 to 4, or `"fill"` (the target fills the frame) |
| tone | `tone` | jumps | a theme colour name, never a hex code |
| text | `text` | jumps | reading time and size on screen |
| image | `src` | jumps | a path inside the root folder |
| choice | `pose`, `mode` | jumps | one of the declared choices |
| seed | `seed` | – | a whole number |
| item | `screen`, `thinker` | – | `@name` in the same world |
| area | `area` | – | a name the symbol's areas declare |
| target | `focus`, `to` | – | an item, an item's area, or `"wide"`; a bare area name means an area of the item's own parent |
| line | a device's lines, a clip's `from`/`to` | – | a phrase, direction, label or derived moment |
| list | `chips`, `marks` | – | entries of a declared shape; feeds `repeat` |
| slot | `inside` | – | items the use supplies (section 4.16) |

### 4.5 Layers

The first layer in the list is drawn at the back.
- `kind` is `art`, `guide`, `mask` or `camera`.
- `mode` is `stack` (the default) or `swap`.

**On a stack layer**, an item stays until its own `leave`, or until its world leaves the frame. Things build up, such as three chips on a screenshot or a row of cards. The summary stage (`film.mjs · cardsAt`) and whiteboard items already build up this way today.

**On a swap layer**, a new arrival makes the previous item leave first. This is the hand-over (section 6). It is the only place where the engine adds a departure, and the recipe shows it.

```json
{"name": "talk", "mode": "swap", "items": [{"as": "q1", "use": "caption"}, {"as": "q2", "use": "caption"}]}
```

A symbol can declare `focal: true`: captions, chips, cards and thought clouds do. `focal` is used only by the law 5 checks on arrivals (section 6). It never makes anything leave.

An entry in `layers` can also be a device use (section 4.16).

### 4.6 Keys, eases, stays

The usual way to write a key is a verb:

```json
"keys": [{"at": ["count", "the ledger wakes"], "enter": "pop"}]
```

The same thing as plain channel keys:

```json
"keys": [{"at": ["count", "the ledger wakes"], "alpha": 0, "scale": 0.6},
         {"at": ["count", "the ledger wakes"], "alpha": 1, "scale": 1, "ease": "back", "seconds": 0.4}]
```

- A key reads: *at this line, go to these values over `seconds`, with this ease.*
  - A key with no `seconds` and no way is an **instant set**, like Flash's hold keyframe.
  - `seconds` is 0.1 to 3; walks and replays may take up to 8.
- The eases are `linear in out inOut back walk jump`.
  - They live in one table in the core.
  - `inOut` is exactly today's `kits/whiteboard/board.mjs · ease`.
  - `jump` is Flash's hold keyframe. It is not called `hold`, because `hold` keeps its `pacing.json` meaning: a pause after a line.
  - `spring` (`kits/paper/paper.mjs · spring`), `bounce` and four-number curves are on the later list.
- **Stays**: before its first key, an item shows the first key's values. After its last key, it keeps the last key's values.
- Two keys on the same channel may not overlap in time. An instant key takes no time, so it may share a moment with the tween after it. Keys at the same moment apply in the order written.
- **The one deliberate break from Flash:** a Flash tween stretched to fill the gap until the next keyframe. Here a tween lasts `seconds` and then stays, because the speaker decides how long the gap is.

Key addresses for the studio are decided in phase 5. They will never contain phrase text, because rewording the narration would break them.

### 4.7 Verbs and ways

Most keys are written as one **verb** with a **way**. The way brings the channels it changes, a default ease, a length and a sound, so most lines need no numbers. A verb is turned into ordinary channel keys when the film is built, as a Flash Motion Preset was. In the file it stays a verb until someone uses Break Apart in the studio (section 8).

These are the ways that ship. Each one gets a pinned still.

| verb | way | channels it changes | seconds | ease | sound | phase |
|---|---|---|---|---|---|---|
| enter | fade | alpha 0→1 | 0.45 | out | – | 1a |
| enter | pop | alpha 0→1, scale 0.6→1 | 0.4 | back | tap | 1a |
| enter | open | the symbol's `open` 0→1 | 0.8 | inOut | door | 3 |
| enter | burst | alpha 0→1, then the symbol's `flight` 0→1 | 4.5 | out | – | 3 |
| enter | cut | all at once | 0 | jump | – | 1a |
| move | glide | x, y to `to` | 0.8 | inOut | – | 1a |
| move | walk | x, y to `to`, or `progress` along a guide | from distance walked at the figure's size | walk | step (from distance) | 3 |
| move | cut | x, y at once | 0 | jump | – | 1a |
| focus | push | camera x, y, zoom | 1.2 | inOut | whoosh when 1 s or longer | 2 |
| focus | cut | camera at once | 0 | jump | – | 2 |
| reveal | iris | a circle mask's radius, 0 → covering its parent | 0.8 | inOut | – | 3 |
| leave | fade | alpha 1→0 | 0.45 | in | – | 1a |
| leave | crumble | the item's box breaks into a seeded grid of 24 pieces that fall and fade, then dust | 1.2 | in | crumble | 3 |
| leave | iris | a circle mask's radius back to 0 | 0.8 | inOut | – | 3 |
| leave | cut | gone at once | 0 | jump | – | 1a |

`crumble` draws the symbol once per piece through a clip: 24 drawing calls and no extra surface. It is refused on an item without a `seed`. The automatic departure on a swap layer uses `leave: "fade"`.

On the later list: the verbs `say` and `replay` (clips cover replay), and the ways `rise grow draw wipe type sweep shrink fly pan`. Ways written in a recipe also wait. When they come they will look like a CSS `@keyframes` rule:

```json
"ways": {"wobbleIn": {"verb": "enter", "seconds": 0.5, "keys": [{"p": 0, "alpha": 0, "rotate": -6}, {"p": 1, "alpha": 1, "rotate": 0}]}}
```

### 4.8 Repeat (stagger later)

`repeat` makes one item for each entry in a list (`chips/1`, `chips/2`). callouts, agentScan and diveIn use it. It is also allowed on a device's keys (section 4.16).

- A repeat group counts as **one arrival** for the law 5 checks.
- On a stack layer the group builds up.
- On a swap layer each member hands over to the next. Each member must stay on screen for its reading time; if it cannot, the reading check refuses the film and names the two entries.

```json
{"as": "chips", "use": "chip", "parent": "@ledger", "repeat": [{"area": "cups", "text": "cups"}, {"area": "cash", "text": "cash"}],
 "area": {"each": "area"}, "knobs": {"text": {"each": "text"}}, "keys": [{"at": ["count", "two things"], "enter": "pop"}]}
```

`stagger` (spacing a group's verb out, one after another) is on the later list. When it lands, the rules are already decided:
- a staggered group is one focal unit, and its members never hand over to each other;
- the whole group leaves when the next unit arrives on its swap layer;
- a stagger gap shorter than the entrance is refused.

### 4.9 Guides and masks

A guide is a list of points, or the edge of an item (`edgeOf` plus `side`).

Masks take **only shapes the engine owns**: `circle`, `rect`, `polygon` and `cone`.
- Each shape has its own channels: a circle has `r`; a rect has `w` and `h`; a cone has `angle`, `spread` and `length`.
- A mask can have a `parent`.
- It is drawn with `ctx.clip()`, exactly as `film.mjs · drawEntering` draws today's iris and wipe, so it needs no extra surface.
- `invert: true` shows the masked layers everywhere *except* inside the shape (an even-odd clip against the world).

A mask made of any drawing (a symbol) would need off-screen surfaces for every live mask at every nesting level. It waits for a separate decision, backed by a checked-in benchmark.

```json
{"name": "path", "kind": "guide", "points": [[220, 760], [900, 770], [1180, 700]]}
{"as": "mia", "use": "person", "along": "path", "keys": [{"at": ["open", "Mia walks to the stall"], "move": "walk"}]}
{"name": "hole", "kind": "mask", "over": ["inside"], "shape": "circle", "parent": "@ledger", "keys": [{"at": "filled", "reveal": "iris"}]}
```

Footsteps are worked out from the distance walked at the figure's size, so the feet never slide.

### 4.10 Camera

Each world has one camera layer, and `focus` is its only verb.

```json
{"name": "cam", "kind": "camera", "x": 1600, "y": 900, "zoom": 0.58,
 "keys": [{"at": "tapped", "focus": "@ledger", "zoom": 1.1}]}
```

- **One connection point.** Every camera reports to the engine through one new connection point, `cameraAt(t)`, next to today's `spotAt`. `film.mjs · worldView`, `pointAt`, `moments` and `notes.mjs · placePushes` all read it. Clicking a spot therefore finds the right recipe entry even while the camera is moving.
- **A spotlight** is a move on top of the world camera. The two combine; they are not rivals.
- **Speed.** The engine divides camera seconds by the director's `cameraSpeed` only for cameras that a kit hands over in raw seconds through the new `context: true` contract (section 7). The motion kit is one of these. Kits on the old contract (`kits/whiteboard/index.mjs · compileWhiteboard`, `kits/cartoon/index.mjs · compileCartoon`) keep dividing by themselves, and the engine never divides them a second time. The speed tests in `test/notes.test.mjs` pass unchanged as the proof.
- **Drawing through the camera.** Only a kit that declares `draws: "vector"` is drawn through the camera as shapes, so deep zooms stay sharp. Today `film.mjs · drawWorld` paints a 1600×900 picture and then enlarges it, which blurs. On this path:
  - drawing is clipped to the sheet's box, so a 3200×1800 world never paints over the paper outside it;
  - the sheet's shadow (`film.mjs · hung`) is drawn once, as one rectangle;
  - `setTransform` and `resetTransform` are refused inside a symbol's draw (the purity test catches them);
  - motion worlds hang at 1 by default, so `zoom: "fill"` fills the frame, not just the sheet.

### 4.11 Clips: nested time

```json
{"as": "clip", "use": "film", "parent": "@cloud#window",
 "time": {"from": ["count", "every cup she sold"], "to": ["count", "what is in the box"]}, "view": "@ledger"}
```

- `use` is `"film"`. `"scene:<id>"` is on the later list.
- **Time.** `from` and `to` are both lines. The clip plays that stretch of film at normal speed, starting when the clip arrives, then stays on the `to` picture until it leaves. An optional `seconds` with an `ease` squeezes or stretches the stretch to fit a set length. `loop`, `still` and `reverse` are on the later list.
- **View.** `view` chooses which part of the remembered frame shows. It is either a box `[x, y, w, h]` of the 1600×900 frame, or `"@item"`, which means that item's region at the `from` moment. A whole frame shrunk to thought-cloud size turns 64 px captions into about 18 px; a view shows the part that matters at a size people can read.
- **No second clock.** A clip's time is worked out from film time. A clip shows what the viewer saw, and it is muted by default.
- **Text inside a clip** counts as picture. The making-of record reports it, but it is not refused (open question 2).
- **One level deep.** Clips inside a clip are switched off. Only the engine draws clips; the kit context gives kits no way to draw the film (section 7).
- **Scratch surfaces.** Each nesting level gets its own set: `sheet`, `nest`, and the fade-layer cache that `film.mjs · layerFor` keeps by size, all held in one "surfaces" object per level. Today `film.mjs · compileFilm` shares all three, and a clip drawn while its shot fades in would clear the outer canvas halfway through a frame.
- **Cost.** A clip is drawn at its size on screen. A clip whose `from` and `to` are the same moment is drawn once and cached, as `recipe.recalls` are.

### 4.12 Carry (later)

When an item that leaves and an item that arrives share a `carry` name, the first morphs into the second. Today's push-in is one example. None of the eight devices uses it, so it waits on the later list.

### 4.13 Sound

The voice is the stream that sets the clock. A `cue` is a one-shot sound on a key.
- Today's sounds (`sound.mjs · LENGTHS`) are `slide settle tap question chime`. The new ones are `door step click whoosh crumble`.
- Each sound has a default `gain` (volume), which a key can override.
  - The gain is **relative to its scene**. `sound.mjs · createMotionSound` scales a whole scene by one gain, set by its loudest sound, so a loud door turns down every tap in that scene. This is written down now; limiting each sound on its own is on the later list.
- A symbol can also make its own sounds, such as footsteps. Those count toward the limit.
- Sound names **and** the limit of 64 sounds per scene are checked when the film is built, in `compileFilm`. Today both are checked only in `sound.mjs · resolveSoundEvents`, which `render.mjs · renderFilm` calls after every video frame is already encoded.
- **Loudness** is set in two passes, so a silent opening stays quiet instead of being turned up to the voice's level.
  - The second pass reports its normalization type. If that type is not `linear`, the making-of record flags it: FFmpeg's `loudnorm` falls back to its varying mode when the true-peak limit blocks a fixed gain, and that would raise the silence again.
  - The BACKLOG.md note that `loudnorm` fails on pure silence is fixed in the same phase: a partial render of only the silent opening must pass.

```json
{"at": ["open", "the door opens"], "enter": "open", "gain": 0.45}
```

### 4.14 Particles (idle motion later)

Particles, such as crumble dust and balloons, are formulas of time.
- They need a `seed`, a number that fixes the random pattern. It sits on the item, and the item hands it to both its symbol and its ways. The studio writes one when it adds the item, so renaming the item never changes the pixels. An item with particles and no seed is refused.
- Particles drawn **in front of** a focal item that is arriving, or is still inside its reading time, are refused. Particles on a layer behind it are fine.

Idle motion (`bob sway breathe blink wobble`) is on the later list. When it lands it will need a seed, and it will be refused on the camera and on a focal item while that item is arriving or leaving.

### 4.15 Devices

A device is data. It has:
- `lines`: the names of the lines it needs, which each use ties to real lines;
- typed `knobs` (the type table in section 4.4);
- its own `layers`;
- optional `keys` on items passed in to it (each key names its `item`, which is an item knob or `"camera"`);
- an optional `needsPause`.

The rules:
- There are only two ways to fill in a value: `{"knob": "name"}`, and `{"each": "field"}` inside one `repeat`. There is no arithmetic, there are no conditions, and strings are never joined. A new need becomes a new knob type or a new way, never an operator.
- **`needsPause` asks for a pause; it never makes one.** `pacing.json` stays the only place a pause is written.
  - `compileFilm` checks the paced timings with `clock.pauseAfter`, the same check the guesses use (`film.mjs · compileFilm`, the guesses check).
  - If the pause is missing or too short, it refuses and prints the exact `pacing.holds` entry to add.
  - Because the check lives in `compileFilm`, every caller sees the same film: `pipeline.mjs · makeFilm`, the studio (`examples/studio.mjs`), the golden pins (`test/golden.mjs`) and the tests.
  - It is refused after a direction (silent scenes have no holds), and on a line that uses `nth` above 0, because pacing matches only the first time a phrase is spoken (`pacing.mjs · planHolds`, `paceTimings`).
- The making-of record lists what each use expanded into, for example `hook → 2 items, 2 keys, needs a 1 s pause after "But wait"`.

A use looks like this:

```json
{"as": "hook", "use": "hookQuestion", "lines": {"ask": ["why", "Where did the lemons go"], "turn": ["why", "But wait"]},
 "knobs": {"question": "Where did the lemons go?"}}
```

### 4.16 Expansion: how a use becomes items

| rule | what it says |
|---|---|
| where a use sits | A use is an entry in its world's `layers` list. Its layers go in as one group at that spot, in the device's own back-to-front order. A device item drawn behind its own parent is listed in the making-of record, because it is usually a mistake (the fix is to move the use later in the list). |
| made names | `<use>/<name>`, for example `hook/q`. |
| looking up `@name` | Inside a device or a use, the names it makes come first: in recall, `@cloud` means this use's own `cloud`. A made name that hides an item of the world is refused. |
| worlds | Names belong to one world (`recipe.story` or one stage's world) and are unique in it across all its scenes. `@name` finds names in the same world only. |
| items passed in | An `item` knob takes `@name`. Keys a device puts on that item join the item's own keys; keys on the same channel that overlap are refused. |
| `repeat` on keys | Allowed: one key for each list entry, for example diveIn's camera visits. |
| camera targets | An item, an item's area (`@x#cups`), or `"wide"`. Zoom is a number or `"fill"`. |
| slots | A `slot` knob holds items the use supplies. The device places them in one of its layers, they keep their own phrase keys, and they are named like made names (`behind/till`). |
| where clicks point | Every region and making-of entry of a device-made item names the **use's** place in the recipe plus the knob entry that fed it, for example `story.layers[2].knobs.chips[1]`. The definition's place goes in a second field, `made: "callouts · layers[0].items[0]"`. The studio's click-to-find (`studio/lines.mjs · jsonLines`, `valueAt`, `studio/page.js · ownerOf`) works only with paths that exist in the recipe file. |

### 4.17 The first symbols

All of these are in the motion kit (`kits/motion/`, new), and each gets a pinned still. Sizes are in pixels on the 1600×900 frame.

| symbol | knobs (type, range, default) | size · pivot | areas | focal | texts | own sounds | phase |
|---|---|---|---|---|---|---|---|
| caption | text (text, up to 14 words); size (number 28–96, 48); tone (tone, `ink`) | fits its text · centre | – | yes | text | – | 1a |
| picture | src (image); areas (boxes as fractions); width (number 160–1600, 800) | from the image · centre | from the knob | no | – | – | 1d |
| chip | text (text, up to 4 words); tone (tone, `accent`) | fits its text, 56 high · bottom centre | – | yes | text | – | 1d |
| pointer | – | 40×40 · tip | – | no | – | – | 3 |
| door | open (progress, 0) | 220×400 · foot of the hinge | – | no | – | – | 3 |
| person | pose (choice stand/walk/think/wow, stand); tone (tone, `ink`) | 120×320 · feet | head | no | – | step, from distance walked | 3 |
| robot | pose (choice idle/scan, idle) | 140×180 · feet | lamp | no | – | – | 3 |
| shade | tone (tone, `ink`) | its parent's box · centre | – | no | – | – | 3 |
| tick | text (text, up to 3 words) | 64×64 · centre | – | no | text | – | 3 |
| card | text (text, up to 8 words); tone (tone, `paper`) | 360×200 · centre | – | yes | text | – | 3 |
| balloons | count (number 1–24, 18); flight (progress, 0); uses the item's seed | the frame · bottom centre | – | no | – | – | 3 |
| thoughtCloud | – | 520×340 · tip of its tail | window | yes | – | – | 4 |

**Chip placement** (phase 1d): a chip sits above its area, or below it when above would leave the frame. It never covers its area.

The engine owns the mask shapes, guides, clips (`use: "film"`) and the camera; none of these are symbols. The scene props in the examples (stall, bin, chart) are pictures.

## 5. The eight devices

For each device: its library definition, then one use in a recipe. The definitions are complete. The diveIn and agentScan definitions double as test fixtures.

**hookQuestion**: a big question, then the turn.
```json
"hookQuestion": {"device": {"lines": ["ask", "turn"],
  "knobs": {"question": {"type": "text"}, "twist": {"type": "text", "default": "But wait…"}, "pause": {"type": "seconds", "default": 1}},
  "needsPause": {"after": "turn", "seconds": {"knob": "pause"}},
  "layers": [{"name": "talk", "mode": "swap", "items": [
    {"as": "q", "use": "caption", "knobs": {"text": {"knob": "question"}, "size": 64}, "keys": [{"at": "ask", "enter": "pop"}]},
    {"as": "t", "use": "caption", "knobs": {"text": {"knob": "twist"}, "tone": "accent"}, "keys": [{"at": "turn", "enter": "pop"}]}]}]}}
```
```json
{"as": "hook", "use": "hookQuestion", "lines": {"ask": ["why", "Where did the lemons go"], "turn": ["why", "But wait"]},
 "knobs": {"question": "Where did the lemons go?"}}
```
Because the layer is a swap layer, the question leaves before the twist arrives. If `pacing.json` has no pause of at least 1 s after "But wait", the build refuses and prints the entry to add.

**callouts**: chips land on areas of a screenshot.
```json
"callouts": {"device": {
  "knobs": {"screen": {"type": "item"}, "mode": {"type": "choice", "of": ["stack", "swap"], "default": "stack"},
            "chips": {"type": "list", "item": {"area": "area", "text": "text", "at": "line"}}},
  "layers": [{"name": "chips", "mode": {"knob": "mode"}, "items": [{"as": "chip", "use": "chip", "repeat": {"knob": "chips"},
    "parent": {"knob": "screen"}, "area": {"each": "area"}, "knobs": {"text": {"each": "text"}}, "keys": [{"at": {"each": "at"}, "enter": "pop"}]}]}]}}
```
```json
{"as": "tour", "use": "callouts", "knobs": {"screen": "@ledger", "chips": [
  {"area": "cups", "text": "cups sold", "at": ["count", "every cup she sold"]},
  {"area": "cash", "text": "cash box", "at": ["count", "what is in the box"]}]}}
```
By default the chips build up. `"mode": "swap"` shows one at a time, and each chip must stay for its reading time.

**walkIn**: a silent cold open.
```json
"walkIn": {"device": {"lines": ["arrive", "walk", "tap"],
  "knobs": {"walker": {"type": "item"}, "door": {"type": "item"}, "screen": {"type": "item"}, "area": {"type": "area"}, "then": {"type": "image"}},
  "layers": [{"name": "hand", "items": [
    {"as": "pointer", "use": "pointer", "parent": {"knob": "screen"},
     "keys": [{"at": "tap", "enter": "fade", "seconds": 0.3},
              {"at": "tap", "plus": 0.3, "move": "glide", "to": {"knob": "area"}, "cue": "click", "done": "tapped"}]}]}],
  "keys": [{"item": {"knob": "door"}, "at": "arrive", "enter": "open"},
           {"item": {"knob": "walker"}, "at": "arrive", "plus": 0.4, "enter": "fade"},
           {"item": {"knob": "walker"}, "at": "walk", "move": "walk", "to": {"knob": "screen"}},
           {"item": {"knob": "screen"}, "at": "tapped", "src": {"knob": "then"}},
           {"item": "camera", "at": "tapped", "plus": 0.3, "focus": {"knob": "screen"}, "zoom": 1.1}]}}
```
```json
{"as": "arrive", "use": "walkIn",
 "lines": {"arrive": ["open", "the door opens"], "walk": ["open", "Mia walks to the stall"], "tap": ["open", "she taps the ledger"]},
 "knobs": {"walker": "@mia", "door": "@door", "screen": "@ledger", "area": "cups", "then": "shots/ledger-cups.png"}}
```
The walker and the door are the recipe's own items, so later devices can name the same `@mia`. The camera waits for the tap because of a rule (the `tapped` moment), not because someone added up seconds.

**diveIn**: "behind that tap", into the machinery.
```json
"diveIn": {"device": {"lines": ["dive", "back"],
  "knobs": {"screen": {"type": "item"}, "inside": {"type": "slot"},
            "visits": {"type": "list", "item": {"target": "target", "at": "line"}}},
  "keys": [{"item": "camera", "at": "dive", "focus": {"knob": "screen"}, "zoom": "fill", "done": "filled"},
           {"item": "camera", "repeat": {"knob": "visits"}, "at": {"each": "at"}, "focus": {"each": "target"}},
           {"item": "camera", "at": "closed", "focus": "wide"}],
  "layers": [{"name": "inside", "items": {"knob": "inside"}},
             {"name": "hole", "kind": "mask", "over": ["inside"], "shape": "circle", "parent": {"knob": "screen"},
              "keys": [{"at": "filled", "reveal": "iris"}, {"at": "back", "leave": "iris", "done": "closed"}]}]}}
```
```json
{"as": "behind", "use": "diveIn", "lines": {"dive": ["how", "behind that tap"], "back": ["how", "back on the ledger"]},
 "knobs": {"screen": "@ledger",
  "visits": [{"target": "@till", "at": ["how", "this is the till"]}],
  "inside": [{"as": "kitchen", "use": "picture", "parent": "@ledger", "knobs": {"src": "art/kitchen.png", "width": 1400}},
             {"as": "till", "use": "card", "parent": "@ledger", "x": 240, "y": 200, "knobs": {"text": "the till"},
              "keys": [{"at": ["how", "it counts every cup"], "enter": "pop"}]}]}}
```
The screen fills the frame before the hole opens. The hole closes before the camera pulls back, so there is one move at a time. The inner world arrives through a `slot`: its items keep their own phrase keys, so each part of the machinery can light up on its own phrase. The till card pops on a later phrase than the camera visit, so no focal item arrives while the camera is moving.

**agentScan**: a robot sweeps a light over a picture; each tick lands when the light reaches it.
```json
"agentScan": {"device": {"lines": ["start"],
  "knobs": {"image": {"type": "item"}, "seconds": {"type": "seconds", "default": 3.5},
            "marks": {"type": "list", "item": {"area": "area", "text": "text"}}},
  "keys": [{"item": "camera", "at": "start", "focus": {"knob": "image"}, "zoom": 1.5, "seconds": 0.9, "done": "framed"}],
  "layers": [
    {"name": "sweep", "kind": "guide", "edgeOf": {"knob": "image"}, "side": "top"},
    {"name": "dim", "items": [{"as": "shade", "use": "shade", "parent": {"knob": "image"}, "alpha": 0,
      "keys": [{"at": "framed", "alpha": 0.45, "seconds": 0.4}, {"at": "swept", "alpha": 0, "seconds": 0.4}]}]},
    {"name": "light", "kind": "mask", "over": ["dim"], "invert": true, "shape": "cone", "parent": "@robot#lamp",
     "angle": 90, "spread": 30, "length": 700},
    {"name": "scan", "items": [
      {"as": "robot", "use": "robot", "along": "sweep", "knobs": {"pose": "scan"},
       "keys": [{"at": "framed", "move": "walk", "seconds": {"knob": "seconds"}, "done": "swept"}]},
      {"as": "tick", "use": "tick", "repeat": {"knob": "marks"}, "parent": {"knob": "image"}, "area": {"each": "area"},
       "knobs": {"text": {"each": "text"}}, "keys": [{"at": {"reach": "@robot", "area": {"each": "area"}}, "enter": "pop"}]}]}]}}
```
```json
{"as": "scan", "use": "agentScan", "lines": {"start": ["count", "the helper reads the chart"]},
 "knobs": {"image": "@chart", "marks": [{"area": "tue", "text": "#1"}, {"area": "sat", "text": "#2"}]}}
```
The light is an inverted cone mask. The picture is dimmed everywhere except inside the cone that rides on the robot's lamp. The robot starts on the camera's `framed` moment, not after a fixed number of seconds, so it never starts while the camera is still moving, at any speed. If the walk gets longer, the ticks move with the light.

**recall**: a thought cloud replays an earlier moment of the film.
```json
"recall": {"device": {"lines": ["open", "close"],
  "knobs": {"from": {"type": "line"}, "to": {"type": "line"}, "view": {"type": "item"}, "thinker": {"type": "item"}},
  "keys": [{"item": {"knob": "thinker"}, "at": "open", "pose": "think"},
           {"item": "camera", "at": "open", "focus": "@cloud", "done": "settled"}],
  "layers": [{"name": "thought", "items": [
    {"as": "cloud", "use": "thoughtCloud", "parent": {"knob": "thinker"},
     "keys": [{"at": "settled", "enter": "pop", "done": "shown"}, {"at": "close", "leave": "fade"}]},
    {"as": "clip", "use": "film", "parent": "@cloud#window",
     "time": {"from": {"knob": "from"}, "to": {"knob": "to"}}, "view": {"knob": "view"},
     "keys": [{"at": "shown", "enter": "fade"}, {"at": "close", "leave": "fade"}]}]}]}}
```
```json
{"as": "lookBack", "use": "recall", "lines": {"open": ["why", "Let's go back"], "close": ["why", "back to today"]},
 "knobs": {"from": ["count", "every cup she sold"], "to": ["count", "what is in the box"], "view": "@ledger", "thinker": "@mia"}}
```
The remembered moment is named by phrases and is never pasted into the recipe. The camera settles before the cloud arrives. The `view` shows the ledger at a size people can read, not the whole frame shrunk down.

**loss**: a card crumbles to dust.
```json
"loss": {"device": {"lines": ["show", "break"],
  "knobs": {"text": {"type": "text"}, "to": {"type": "target"}, "seed": {"type": "seed"}},
  "layers": [{"name": "card", "items": [{"as": "card", "use": "card", "seed": {"knob": "seed"}, "knobs": {"text": {"knob": "text"}}, "keys": [
    {"at": "show", "enter": "pop", "done": "shown"},
    {"at": "shown", "plus": 0.4, "move": "glide", "to": {"knob": "to"}, "seconds": 1.4},
    {"at": "break", "leave": "crumble"}]}]}]}}
```
```json
{"as": "lost", "use": "loss", "lines": {"show": ["why", "the lemon count"], "break": ["why", "thrown away"]},
 "knobs": {"text": "{ 40 lemons }", "to": "@bin", "seed": 4}}
```
The card and the crumble are separate pieces: a plain card is the same card without the `leave` key.

**celebrate**: balloons.
```json
"celebrate": {"device": {"lines": ["go"],
  "knobs": {"count": {"type": "number", "range": [1, 24], "default": 18}, "seed": {"type": "seed"}, "pause": {"type": "seconds", "default": 2}},
  "needsPause": {"after": "go", "seconds": {"knob": "pause"}},
  "layers": [{"name": "party", "items": [{"as": "balloons", "use": "balloons", "seed": {"knob": "seed"},
    "knobs": {"count": {"knob": "count"}}, "keys": [{"at": "go", "enter": "burst", "cue": "chime"}]}]}]}}
```
```json
{"as": "yay", "use": "celebrate", "lines": {"go": ["end", "she sold out"]}, "knobs": {"seed": 3}}
```
- The balloons make one shared chime, not one pop per balloon. The scene's sound count stays small, and nothing pops over the next line, even though the balloons rise for 4.5 s, longer than the 2 s pause.
- Place the use before the layer that holds the captions, so the balloons rise behind them. Particles in front of a focal item that is arriving or still being read are refused.

## 6. The laws, kept, and the new automatic checks

| law | how the grammar keeps it | new automatic check |
|---|---|---|
| 1 data only | a closed list of words; only two fill-ins; kits only draw | anything unknown is refused, starting with the recipe's top level, which nothing checks today; sound names and the per-scene sound count are checked when the film is built |
| 2 phrases, not seconds | `at` is a line, a label or a derived moment; seconds appear only as `seconds`, `plus` (−1 to 2) and `needsPause`; directions only in scenes the storyboard declares silent (in spoken scenes from phase 6, inside a paced pause) | every chain ends at a line, with no loops; every direction has at least one key (no dead air); `plus` given twice is refused; `needsPause` only after a spoken phrase with `nth` 0 |
| 3 pure function of time | everything is a formula of time; seeds are required; only the engine draws clips | each symbol is drawn twice at the same moment, in shuffled order, and the pixels must match; `setTransform`/`resetTransform` inside a symbol are refused |
| 4 every frame restores the canvas | the engine wraps every item's drawing in save/restore; masks are clips inside that save | the restore test in `test/film.test.mjs` is extended: after each frame, `globalCompositeOperation` is `source-over`, `shadowBlur` is 0, `filter` is `none`, and a fill of the whole frame has the expected corner pixel (a leaked clip shows there); it runs on every device example |
| 5 one focal point | one camera connection point; swap layers hand over; focal arrivals are checked | see the list below this table |
| 6 long enough to read | every text reports when it is fully shown and when it starts to leave, through `texts()`; stage kits get `texts()` too | `reading.mjs · tooShortToRead`, plus two checks the engine can now make because it knows where everything is: the text's size on screen (its size × every parent's scale × zoom) must be at least a minimum, and the text must be inside the frame; text inside a clip is reported, not refused |
| 7 notes change the camera, never the beats | the engine divides camera seconds by `cameraSpeed` once, and only for new-contract cameras | see the fingerprint below this table |
| 8 say what made it | `clock.at(ref, path)` is given the recipe path explicitly. Today `film.mjs · recipePaths` finds paths by object, so a phrase reached through a label or a device has no path recorded | the making-of record lists every chain, every expansion (the use's recipe path and the names it made), every derived moment, every key that moved with the camera, every departure the engine added, every pause a device needs, and the loudness normalization type |
| 9 pinned pixels | a new world kind; drawing through the camera only for kits that ask for it | `test/golden.json` stays unchanged for old recipes (`pins.mjs · frameHashes`); `frameHashes` gains a `times` option, and each device's pinned example is sampled at `film.moments()` plus the middle of every key the device made (today's 24 evenly spaced moments can miss a 0.4 s pop) |

**Law 5, what is refused.** These checks apply between cameras written in the new grammar: the motion kit's camera layer, and director pushes on a motion world.
- two camera moves that overlap;
- a focal item arriving while such a camera is moving.

These apply anywhere in the motion kit:
- two focal arrivals on the same line. A repeat group counts as one arrival. The engine refuses; it never quietly reorders.
- particles drawn in front of a focal item that is arriving or still inside its reading time.

These are **reported, never refused**: overlaps that involve an older kit's camera (such as the cartoon camera) or a spotlight. A spotlight combines with the world camera. The pinned shepherd example overlaps today: the cartoon camera's "But wait" move runs from 26.90 s to 28.50 s, while the "One pebble is still" spotlight eases in from 27.66 s. It must keep compiling and drawing the same pixels.

**Before any refusal ships**, the check runs in report-only mode over every known recipe: `storyreel/examples`, storyreel-starter, little-aha-stories and the pebbles-to-plus series. It is turned on only when every one of them still compiles.

Items that are not focal, such as pointers and ticks, are free to move.

**Law 7, the fingerprint.** The engine records the time of every key that **rests on a phrase**, meaning its chain reaches a line without passing through a camera key. It records them once before notes apply and once after, and the two must match.

A key whose chain passes through a camera key (a `done` on a camera key, or anything chained to one) is **part of that camera move**. It moves with a speed note, and the making-of record says so, for example: `behind: "filled" moved 0.4 s, by the speed note, via the camera`.

Every law check (reading time, law 5) runs after notes are applied. A note that pushes such a key into trouble is therefore refused by that check, which names the note.

This keeps every library device usable with speed notes. A test proves it: diveIn and agentScan must compile at speeds 0.5 and 1.5. It matters because speed is film-wide (`notes.mjs · readSpeed`), so one device that could not take a speed note would lock the whole film.

**The hand-over, defined once.** The hand-over happens only on swap layers. The old item finishes leaving before the new one arrives, timed by one table in the core.

Today those timings are copied across `film.mjs · into`, `stateAt`, `drawShot`, `regionsAt` and `arrivalOf`, and the copies already disagree:
- `arrivalOf` says a hand-over ends at start + 0.4;
- the drawing finishes it at start + 0.25.

`arrivalOf` feeds the reading check, the push-note refusals and the still moments (`film.mjs · readableLines`, `moments`, `notes.mjs · placePushes`), and the pixel pins see none of these. So:
- the table keeps both numbers under their own names (`arrivalSettles: 0.4`, `drawingSettles: 0.25`);
- before the refactor, `film.reading`, `film.moments()` and the notes refusals are pinned for every example, so any change shows up in a test.

The engine adds departures only on swap layers. It never moves a key you wrote.

## 7. Kits and engine: who owns what

| a kit provides, for each symbol | the engine owns |
|---|---|
| `draw(ctx, props, t, P)`: pure, inside its own box, never `setTransform`; `P` gives the theme's colours | the clock, lines, labels, `done`, `reach` |
| `size`, `pivot` | keys, tweens, the ease table, verbs, ways |
| `knobs`: type, default, and a range or list of choices | position, scale and alpha; `parent`; layer order; save/restore |
| `focal: true`, where it applies; `group: true` when it must fade as one piece | guides, masks (engine shapes only), clips |
| `areas(props)`, as fractions | the camera: `cameraAt`, speed for new-contract cameras, drawing through the camera |
| `texts(props)` | a clickable region for every item (`regions.mjs · view / then` must learn rotation when `rotate` lands) |
| `cues(props, keys)` | sound timing, volume, checks, loudness |
| optional `ready(props)`, which waits for images to load | every law check, every refusal, and the making-of record |
| optional `overlay(ctx, items, t)` for a layer, drawn after its items (the whiteboard's marker and eraser need it, section 9) | |

A symbol never sees the film's clock or the narration, so the same symbol works in a film, in a studio preview, and in a rendered still or clip for a deck (section 10). Kits draw only in Node today: `pen.mjs` registers fonts through `@napi-rs/canvas`, and `film.mjs` uses `createCanvas`. Drawing in a browser is a later phase.

**Changes to the engine's connection points, all additions:**
- `types/index.d.ts · Kit` gains a `symbols` field next to `story` and `stages`.
- Today `film.mjs · compileWorld` calls `kit.compile(spec, clock, motion)`. That call is synchronous and passes no theme, no root folder and no library.
  - A kit that declares `context: true` receives `{clock, motion, theme, root, library, labels}` instead.
  - The context has no way to draw the film. Only the engine draws clips, so nesting stays one level deep, and nothing can call the film while it is still being built.
  - The kit may also return `ready`, which waits for images to load; the engine waits for it before drawing `recipe.recalls`.
  - Older kits keep today's call.
- **Camera seconds.** A `context: true` kit hands over its camera in raw seconds, and the engine divides by `cameraSpeed`. Older kits keep dividing by themselves and still list `motion: ['cameraSpeed']`; `compileWorld` refuses a speed note for any kit that does not list it, as it does today.
- Only a kit that declares `draws: "vector"` is drawn through the camera. Every other kit keeps today's enlarged picture.

## 8. The studio this makes possible

| panel | what it shows | what an edit does |
|---|---|---|
| Stage | the frame at the current moment, with faint "ghosts" of nearby moments | dragging writes `x`/`y`, or the key at the current line |
| Timeline | a ruler made of the transcript's words (direction words marked as not spoken); labels as flags; keys as diamonds on words; verbs as bars; a camera row and a sound row; broken laws in red | dropping a key on a word moves it to that word |
| Layers | layers grouped by kind; device uses folded up | reordering changes what is drawn in front |
| Library | symbols, ways and devices | dragging one onto the stage adds an item |
| Settings | fields built from the one type table (section 4.4), with a reading-time meter on text | sets a value |

Double-click a device use to **edit it in place**. **Break Apart** writes out the plain items and keys a use stands for, and it cannot be undone.

**Round-trip rules.**
1. The film's own files are the only documents: the storyboard, the recipe, `pacing.json` and the string tables, as the XFL files were for Flash. There is no side file.
2. **Every edit names the file it changes.**
   - On-screen text that came from a `{"$string": key}` edits the string table for the current language, and the recipe keeps its key. `strings.mjs · withStrings` fills the keys in, so the film only ever sees the filled-in copy; writing the English text over the key would break every other language.
   - Directions edit the storyboard.
   - Pauses edit `pacing.json`.
3. The studio writes a thing back in the same form it read it.
4. An edit changes only its own bytes in its file (using a twin of `studio/lines.mjs · jsonLines`), so hand formatting survives.
5. Every edit is built before it is saved. A refusal is shown and never saved.
6. A rename updates every reference to the old name, and is refused if the new name is taken.
7. **Addresses.** Name addresses (`@ledger`, `@hook/q`, `@ledger#cups`) survive reordering. A key's address is designed in this phase and never contains phrase text. Position-based paths are still produced for `studio/page.js · ownerOf`; a device-made item answers with its use's path (section 4.16).

Today the studio is read-only by its own rule (`studio/README.md`). Until the owner decides otherwise, it shows each edit as a file, a path and a value to copy by hand.

## 9. How existing films keep working

| today | what happens |
|---|---|
| every existing recipe | draws exactly the same pixels; the overlap check only reports on older cameras and spotlights |
| the ease curves, the nine copies of the fade-in/fade-out pattern, and the hand-over timings | each becomes one table that everything reads; the old names still work; the two hand-over numbers are kept under their own names, and the reading, moments and notes results are pinned first |
| cartoon camera (`kits/cartoon/index.mjs · compileCartoon`) | read through `cameraAt`; keeps its own speed division and its blending from the in-flight position; its overlaps are reported, never refused; the shepherd example stays pinned and unchanged |
| spotlights (both kits' `spotAt`, `film.mjs · spotCamera`) | read through `cameraAt` as a move on top of the world camera; each kit's defaults are written down as data |
| whiteboard items (`kits/whiteboard/index.mjs · compileWhiteboard`) | the kit stays. Phase 1a proves only that one isolated shape on the sheet draws identically as a symbol. Two things cannot live in a symbol that draws "inside its own box": the marker (drawn at the tip of the last item still being drawn) and the eraser (which clips across items) (`board.mjs · renderTimeline`). They move to a layer overlay before the shapes (`board.mjs · shapes`) become symbols. |
| entrances, director notes, paper stages, `recalls`, pause-and-guess | stay as they are; director pushes on a motion world are checked against its camera |
| teaser (`film.mjs · drawTeaser`) | stays as it is. Nothing pins it today, so phase 0 adds a small example with a teaser and recalls to `test/golden.mjs · FILMS` and pins it. Its eased rewind and fixed part offsets are not a clip's shape; recall is the first proof of clips. |
| fields that accept unknown keys today (the cartoon spec, `card`, `pushIn`, parts of stages) | a separate cleanup, one field at a time, each with a pinned test |

## 10. The shared beat with storydeck

**What storydeck has today.**
- `sections.js · buildSections` groups steps (HTML snapshots) into sections.
- A slide marked `data-build="add"` is layered on top of the one before.
- Read shows `finalStep`; Watch shows `allSteps`.

Storydeck has no `carry` and no named entrances today. Those words are **new shared vocabulary** that this design proposes.

**An export, not a shared runtime.** Kits draw only in Node, and storydeck is a React page that shows HTML. So phase 6 is an export: for each beat, StoryReel renders a still (for Read) and a short clip (for Watch), and storydeck shows them. A pen that can draw in the browser is its own later phase, with a pixel-parity test against the Node pen.

**A label is a beat id.** Each way of viewing (each lens) turns a beat into something different:

| lens | a beat becomes |
|---|---|
| Film | the time its `say` is spoken |
| Watch | one click, playing that beat's rendered clip |
| Read | the beat's final picture, as a rendered still |
| Scroll | the beat number plus how far through it you are, turned into a time and its nearest rendered frame |

```json
{"section": "why", "beats": [
  {"id": "ask", "say": "Where did the lemons go?", "do": [{"item": "@q", "enter": "pop"}]},
  {"id": "turn", "say": "But wait.", "do": [{"item": "@clue", "enter": "pop"}]},
  {"id": "look", "direction": "Mia stares at the empty crate", "seconds": 2.0, "do": [{"item": "@mia", "pose": "wow"}]}]}
```

- Inside a beat, `at` defaults to the start of the beat's own `say`.
- The question leaves by itself at "But wait", because `@q` and `@clue` sit on a swap layer.
- A beat can ask for a pause with `needsPause`, exactly as a device does; `pacing.json` still owns it.
- **A direction inside a spoken section** (the beat "look") sits in the pause after the phrase before it. That pause must exist in `pacing.json` and be at least `seconds` long; it is the same check as `needsPause`. This lands in phase 6, and until then films refuse it.
- A beat with neither `say` nor `direction` appears only in the deck. A film refuses it and names the missing line.

**Store events, not snapshots.** Beats record what enters, moves and leaves, not finished pictures. In the owner's Map–Walker–Trace–Fold–Lens terms:
- the beats are the trace;
- the picture at beat *k* is the fold (every change up to beat *k*);
- Read, Scroll, Watch and Film are lenses.

When `carry` lands, the same `carry` name in two beats becomes a FLIP morph in the deck and a tween in the film.

## 11. What we do not take from Flash, and why

| not taken | law | replaced by |
|---|---|---|
| ActionScript, frame scripts, expressions | 1 | verbs, ways, devices, seeded particles |
| a MovieClip's own playhead; state machines | 3 | clips whose time is worked out from the film's time |
| buttons, click and hover events | 3 | the spoken line is the only event; interaction belongs to storydeck |
| frame numbers, or seconds used as "when" | 2 | lines, labels, directions, derived moments |
| a tween stretched to the next keyframe | 2 | a tween lasts `seconds`, then stays |
| two camera moves at once | 5 | one camera connection point; overlapping moves in the new grammar are refused |

## 12. Rollout

Decision 1 (screenshots are in scope as evidence) is recorded in section 13; phase 0a writes it into the README.

Each phase lands with its rules written into the section's README, pinned tests, and a small public example with invented content.

| phase | ships | tests | example |
|---|---|---|---|
| 0a safety pins | a teaser + recalls example in `test/golden.mjs · FILMS`; pins of `film.reading`, `film.moments()` and the notes refusals for every example; the extended restore test; `frameHashes` `times` option; the fixed root-folder check | old pins unchanged; a sibling-folder path and a symbolic link out of the folder are refused | – |
| 0b groundwork | the check on the recipe's top-level keys; sound names and per-scene count checked when the film is built; five new sounds with gain; silent directions (`clock.mjs · makeClock`, `speechIndex`, `evenTimings`, new `directionTimings`; `pacing.mjs · applyPacing`, `paceTimings`, `planHolds`; `render.mjs · renderFilm` with generated silence; `types/index.d.ts · Storyboard`; `studio/server.mjs · filmJson`; the starter's voice step); two-pass loudness with its normalization type recorded; the `ready` step; the shared ease table; the kit context object | a misspelled sound is refused; 65 sounds in one scene are refused at build; directions are never spoken; a voiced film and a silent cut, each with a silent scene, both render; a partial render of only the silent opening passes; a hold after a direction is refused | "The kettle": a silent opening |
| 1a symbols | the symbol contract (draw, size, pivot, knobs, focal, group, texts); items; `x y scale alpha` and knob channels; keys and eases; enter/leave/move with fade, pop, glide and cut on stack layers; `texts()`; clickable regions; `clock.at(ref, path)`; the caption symbol | one isolated whiteboard shape redrawn as a symbol with identical pixels; a refusal test for every closed list; the purity and restore tests | "The ledger wakes" |
| 1b swap layers and lines | swap layers; the hand-over table; labels; `done`; the focal arrival checks (motion kit only) | the hand-over pinned; two focal arrivals on one line refused; derived chains printed | "Two signs at the stall" |
| 1c devices | devices; the expansion rules; `needsPause` checked in `compileFilm`; **hookQuestion** | a missing pause is refused with its `pacing.json` entry printed, through `makeFilm`, the studio example and the golden path alike; a pause on an `nth` above 0 is refused; the expansion is listed in the making-of | "Where did the lemons go?" |
| 1d places | `repeat`; areas; `parent` to items and areas; chip placement; the picture and chip symbols; **callouts** | stacked chips build up; swapped chips each stay for their reading time; clicking a device-made chip answers a path that `valueAt` finds in the recipe file | "Two things in the ledger" |
| 2 camera | the camera layer; `cameraAt`; speed for new-contract cameras; the overlap check (report-only over every known recipe first); the fingerprint with camera-chained keys; drawing through the camera (sheet clip, one shadow, worlds hung at 1) | shepherd unchanged; clicking works while the camera moves; an overlap between new cameras is refused and an old-camera overlap is reported; a camera `done` chain compiles at speeds 0.5 and 1.5; `test/notes.test.mjs` speed tests unchanged; a checked-in benchmark before any speed figure is quoted | "The lemonade tour" |
| 3 guides, masks, particles | `along`; `reach` (refused on overshooting eases); footsteps; mask shapes with `invert`; crumble; seeds; the particle rule; the phase-3 symbols; **walkIn**, **agentScan**, **loss**, **celebrate** | the missing-seed refusal; `reach` with `back` refused; agentScan at speeds 0.5 and 1.5; each device pinned at its moments plus the middle of its keys | "Mia opens the stall" |
| 4 clips and slots | clips with `from`/`to`/`view`, scratch surfaces per nesting level, cached one-moment clips; `slot` knobs; **recall**, **diveIn** | a clip inside a clip is refused; a clip inside a world that arrives on a fade; diveIn at speeds 0.5 and 1.5; text inside a recall is reported | "Behind that tap" |
| 5 studio | read-only panels first; key addresses; saving edits only after the owner decides | after an edit, only the edited value changes, in the file the edit named; a `$string` edit lands in the string table | the lemonade film, opened in the studio |
| 6 shared beat | one beat file; a still and a clip exported for each beat; directions inside a paced pause in spoken scenes | the same file shows as a deck and as a film | "The lemonade stand" |

**Later** (each goes to BACKLOG.md as "add when a device or a real film needs it"):
- carry; stagger (with the group rule in section 4.8); idle motion;
- the verbs `say` and `replay`; the ways `rise grow draw wipe type sweep shrink fly pan`;
- ways and devices written in a recipe (after the studio);
- the channels `rotate`, `pivot` and `tint`;
- the eases `spring` and `bounce`, and four-number curves;
- clips of `scene:<id>`, and the clip plays `loop`, `still` and `reverse`;
- limiting each sound's volume on its own;
- masks made of any drawing (with a benchmark);
- a browser pen for storydeck (with pixel parity).

## 13. Decisions (the owner delegated them, 2026-09-30)

Each decision favours what keeps the library general and lets a film choose, over a fixed rule of taste.

| # | question | decision | why |
|---|---|---|---|
| 1 | screenshots | **In scope.** A screenshot shown as evidence in a teaching film (a real screen, a real result) belongs here; marketing polish (launch videos, brand campaigns) does not. The README's backlog wording changes in phase 0a. | three devices need it, and "show the real thing" is the honesty law, not marketing |
| 2 | text inside a replay | **Reported, not refused**, by default. A film may set `"reading": "refuse"` and then clip text is checked like any other text. | a replay shows what the viewer already read; a film that wants it strict can say so |
| 3 | smallest text on screen | **20 px on the 1600×900 frame after every scale and zoom** (24 px at 1080p), as a film setting `minTextPx` with that default. Below it: reported; with `"reading": "refuse"`: refused. | readable on a phone; a vertical teaser can set its own number |
| 4 | studio saving | **Yes, later and opt-in**: the studio stays read-only by default; `--write` turns on saving under the round-trip rules (section 8), only to the film's own files, every edit compiled before it is saved, local only. | the editor is the point of the grammar, but writing files must be a choice the author makes |
| 5 | celebrate once per part | **Advice, not a refusal**: the making-of record notes a second celebration in a part. | taste belongs to the film; the library refuses only what breaks a law |
| 6 | the later list | **Nothing moves sooner.** Each later item lands when a device or a real film needs it, with that film as its first test. | the grammar grows from use, never ahead of it |

## 14. footprintjs: the record, debugging, and the AI helper

*Added after the workflow, at the owner's request.* The making-of record today has four coarse steps (`pipeline.mjs · makeFilm`: check inputs, pace, compile, render) and the list of phrases. The grammar makes the **compile** worth recording step by step, because most of what a film does is now decided there: which line a key lands on, what a device expanded into, which departures the engine added, which check passed or refused.

**1. The compile becomes a footprintjs flowchart.** Drawing a frame stays a pure function and is never recorded (far too many frames, and nothing is decided there). The compile is recorded:

| stage | reads | writes (scope keys) |
|---|---|---|
| read inputs | storyboard, recipe, pacing, strings | `recipe` (paths only), `lines` |
| resolve lines | `lines`, timings | `when.<label or phrase>`: the seconds, and the chain that produced them |
| expand devices | `recipe` uses, `library` | `items.<name>` for every made item: symbol, layer, knobs, the use's recipe path and the `made` path |
| place keys | `items.*`, `when.*` | `keys.<item>`: each key's start, length, ease, and the line it rests on |
| apply notes | `keys.*`, `notes` | changed key times, each naming its note (the law 7 fingerprint) |
| checks | everything above | `checks.<law>`: passed, reported or refused, with the items and lines involved |

- **Why each value is what it is.** With the `writeProvenance: 'reads-prefix'` option, every write records the keys its stage read first. So `sliceForKey('items.hook/q')` (from `footprintjs/trace`) walks back from the item to the device use, the line it rests on, the phrase and the word timing behind that line. `formatSlice` prints the walk in plain lines.
- **Choices carry their reasons.** Where the engine chooses (a chip above or below its area, a departure added on a swap layer, the moment a `reach` resolves to), it uses `decide()`, so the record keeps the evidence: "below, because above would leave the frame by 38 px".
- **Refusals keep their record.** footprintjs commits a failing stage's writes before it rethrows, so a refused build still has a record that says which check refused, on which items and lines.
- **Tags as bookmarks.** Stages carry `.tag('device')`, `.tag('check')`, so `tagStops` (time travel over the finished record) jumps straight to every expansion or every check.

**2. Debugging in the studio.** Click the card that is in the way at 0:34. The studio already knows which recipe entry drew it (`regionsAt`); it now also shows a **Why** panel from the slice: *`hook/q` came from the use `hook` (`story.layers[2]`), device `hookQuestion`; it arrives on "Where did the lemons go" (12.31 s); the reading check refused it because `tour/chip/1` was still inside its reading time.* No re-running and no guessing: the answer is read from the record. The owner's Lens components can draw the chain.

**3. The AI helper.** When the author says "too crowded here" or "move this earlier":
1. the agent reads the record for that moment (the slice, the checks, the notes applied);
2. it proposes a small edit, a recipe path and a new value, never new code;
3. the studio compiles the edit before anything is saved (round-trip rule 5) and the checks run again;
4. the two records are compared, so the agent can say exactly what changed ("q now arrives 0.6 s later; the reading check passes").

The agent answers from the record, so it can say "known" when the slice reaches recipe entries and word timings with nothing untracked, and "not sure" when `causalChain` flags an untracked read: the owner's honest-answers rule, applied to films. Each studio session is itself a footprintjs run (edit → compile → checks), so a whole directing session can be replayed.

**Limits.** Only the compile is recorded, never the frames. Recording makes each rebuild slower; the studio rebuilds on every save, so a checked-in benchmark measures the cost before any figure is quoted, and `commitValues: 'delta'` keeps the record small. The agent proposes; the author approves, as at every other gate.

**Rollout.** Phase 0b moves the compile onto footprintjs stages (the same film, a richer record). Phases 1c and 1d record expansions and checks. Phase 5 adds the Why panel and the AI loop to the studio.

## Review notes

- **Blocker: the overlap refusal would refuse the pinned shepherd example.** Refusal now applies only between new-grammar cameras. Older kit cameras and spotlights are reported, never refused, and a spotlight combines with the world camera. A report-only sweep over every known recipe runs before the check turns on (§6, §9, §12 phase 2).
- **Major (both reviews): speed notes clash with camera-chained keys in diveIn and agentScan.** Keys chained through a camera key move with it and are reported. Law checks run after notes. agentScan starts on the camera's `done`. diveIn and agentScan are tested at speeds 0.5 and 1.5. The old Q3 is closed (§5, §6).
- **Major (both reviews): device holds merged only in makeFilm, making a second owner of pauses.** Holds became `needsPause`, a requirement checked in `compileFilm` with `clock.pauseAfter` like the guesses. `pacing.json` stays the only owner, and the refusal prints the entry to add. `nth` above 0 and directions are refused (§4.15).
- **Major: silent scenes break pacing, render, the voice step and the studio.** One `directionTimings` function feeds `evenTimings`, the voice step, pacing, render, the studio and the types. Phase 0b lists every file with voiced, silent-cut and partial-render tests (§4.2, §12).
- **Major: stagger contradicts the item-by-item hand-over.** The hand-over happens only on swap layers, and a repeat group counts as one arrival. Stagger is on the later list with its group rule and gap refusal already written (§4.5, §4.8).
- **Major: the teaser is unpinned and a clip cannot express it.** It is pinned in phase 0a and stays as it is; recall is the first proof of clips (§9, §12).
- **Major: device-made regions name a path that is not in the recipe.** Regions name the use's path plus the knob entry, with the definition in a `made` field, and a studio click test is added (§4.16, §12 phase 1d).
- **Major: masks made of symbols need off-screen compositing.** Masks take only engine shapes drawn with `ctx.clip()` (plus `invert`). Symbol masks wait for a benchmark (§4.9).
- **Major: phase 1 is too big for one step.** It is split into 1a–1d, and phase 0 into 0a/0b, each pinned (§12).
- **Major: the scope of the focal auto-departure is undefined, so nothing can build up.** Departures happen only on swap layers. `focal` only checks arrivals, stack layers keep items, callouts default to stack, and the particle rule is narrowed to arriving or still-being-read items (§4.5, §4.14, §6).
- **Major: the expansion rules are underspecified.** New §4.16 covers name lookup, worlds, placement, repeat on keys, camera targets and slots. There is one merged type table, and complete diveIn and agentScan definitions double as fixtures (§4.4, §4.16, §5).
- **Major: the symbols and ways are unspecified.** A symbol catalog (§4.17) and a full ways table (§4.7) give each row's knobs, defaults and phase, and each row gets a pinned still.
- **Major: clips have no end, unreadable text and an impossible teaser promise.** Clip time is `{from, to}` with optional `seconds`/`ease`. `view` crops the remembered frame, text in a clip counts as picture, and the teaser promise is dropped (§4.11).
- **Major: callouts ship before `parent`/areas, and Q1 comes too late.** `parent`, areas and chip placement ship with callouts in 1d, and Q1 is asked before phase 0 (§12, §13).
- **Major: §1 overstates the cost, and much of the grammar is unused by any device.** §1 is rewritten around the measured counts and justified by reuse. Unused features moved to the later list, and the vocabulary table gains a "lands" column (§1, §3, §12).
- **Major: storydeck needs browser drawing, and a mid-scene direction is undefined.** Phase 6 is an export of a still and a clip per beat, and the browser pen is a later phase. A mid-scene direction sits inside a paced pause (§10).
- **Minors addressed:**
  - alpha per shape with `group: true`; tint as a draw value;
  - surfaces per nesting level and `frameAt` removed;
  - old kits keep their own speed division;
  - both hand-over numbers kept, with pins first;
  - sound count at build, celebrate's range and one chime, gain relative to the scene, the normalization type recorded;
  - the restore test extended;
  - `frameHashes` times;
  - the root-folder check fixed;
  - the drawing-through-the-camera safeguards;
  - studio edits name their file;
  - `reach` refused on overshooting eases;
  - the whiteboard identity claim limited, with a layer overlay;
  - a reserved-words table with `done`, `tick` and `lines`;
  - instant keys by default;
  - `hotspot` renamed to `area`.