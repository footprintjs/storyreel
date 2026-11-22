# kits/isometric — StoryDeck's maps in a film

**Why:** a system drawn as blocks on a floor seen from a corner reads at a glance, and a talk often has it twice: on a
slide (StoryDeck) and in a film (StoryReel). This kit draws the same map the same way, because every number comes from
`footprint-story`: `/isometric` builds the map (`buildIsoMap`, the map's steps, with the film's policy) and rounds each
cable and stops it for its head (`cableWay`); `/motion` rides the packets (`rideProfile`, `rideSeconds`, `withHold`,
`showStops`, `hiddenRamps`). The kit only draws on the canvas and words what it finds.

```js
import {isometricKit} from 'footprint-storyreel/kits/isometric';
await compileFilm({storyboard, timings, recipe, kits: [isometricKit]});
```

```json
{"type": "world", "scene": "map", "world": {"kit": "isometric",
  "blocks": [{"name": "you", "label": "You"}, {"name": "api", "label": "API", "size": [2, 2, 1.6], "group": "backend"},
             {"name": "db", "kind": "cylinder", "label": "Database", "group": "backend", "appear": ["map", "reads the database"]}],
  "floors": [{"group": "backend", "label": "Production account"}],
  "wires":  [{"name": "w1", "arrow": "you to api", "label": "https", "packets": 1, "speed": "260px"}, {"arrow": "api to db", "packets": 1, "behind": "fade"}]}}
```

## The words: StoryDeck's attributes as keys

| deck (`map.html`) | recipe | |
|---|---|---|
| `data-k` | `name` | one word (no space, no dot); a camera frames the piece by it |
| `data-iso="block"` / `"cylinder"` | `kind` | `block` when left out; `"ball"` is the film's own (below) |
| `data-at="col row [lift]"` | `at` | every block or none: with none, placed from the wires |
| `data-size="wide deep high"` | `size` | `[2, 2, 1]` when left out; a floor `[cols, rows]`, fitted round its blocks when left out |
| `<b>` / `<small>` | `label` / `small` | the name fitted to the top (26 px, two lines, down to 16); the small line under it (18 down to 12) |
| `data-break` | `break` | where the name's two lines part: `"even"` (the usual: alike) or `"fill"` (the first line full) — footprint-story's named rules; the record's block names it |
| `--iso-color`, class `ok`/`warn`/`bad` | `color` / `tone` | a tone is the theme's colour as a pale tint, so the ink name stays readable |
| `data-iso-group` | `group` | groups placed group by group; a floor with the group is fitted round them |
| `data-ports="p1: 0.4 2 0.3"` | `ports: [{name, at, face?}]` | checked by `readPorts` |
| `data-label` (floor, wire) | `label` | a floor's lies flat along its front edge; a wire's on a plate on the cable |
| `<i class="wire" data-arrow="lap.rj45 to sw.p1">` | `arrow` | the same grammar; a trailing bend (`"a to b 0"`) draws it straight |
| `data-head="none"` · `data-packets` · `data-speed="260px"` | `head` · `packets` · `speed` | speed: seconds a run (3) or `"260px"` a second |
| `data-ride="ease-ends 0.15 0.2"` · `data-rest="end 1s"` | `ride: [0.15, 0.2]` · `rest: 1` | |
| `data-trail="3px …"` · `data-behind="fade"` | `trail: {width, color}` · `behind: "fade"` | |
| `data-iso-grid="120 at 960 240"` / `"fit"` | `grid: {tile, at, rise?}` / `"fit"` | fitted by default (into `area`, the whole frame unless given); a tile 8 to 2000 px |

**A labelled floor is held in the fitted picture.** StoryDeck fits its picture to the blocks, their cables and a group's
floor, and lets any other floor run past the slide (a click's camera frames what it shows). A film shows its whole frame
and has no click, so here every floor with a `label` is held too: a floor's name run off the frame is a name nobody reads.

**Straight wires** (written with a bend, or with no way along the floor, such as two blocks at different heights) follow
StoryDeck's rule: each runs from 6 px off one block's outline to 6 px off the other's, two on one pair spread into lanes
at most 80 px apart (a request and its answer, each keeping to its left), a bend of 40 curves it 40 px off its straight
line, fewer than 12 px of wire between the blocks is refused (they touch or overlap: move them apart), and a port with a
bend is refused (a wire to a port runs along the floor).

What a film adds, where a deck has clicks: `appear` (an anchor: the piece comes in over 0.35 s, and is named from then),
a wire's `start` (when its packets begin; else when it appears, else the film's start) and `strict` (a warning refuses).

## The map's steps: footprint-story's (from 0.39.0)

`build.mjs` hands the read map to `footprint-story/isometric` · `buildIsoMap(spec, ISO_MAP_POLICIES.film)` and joins
what it built back onto the kit's pieces. The steps are footprint-story's, in its order: `place` (by the map, or from
the wires: `arrange` / `arrangeByGroup`), `route` (`routes`, with ports), `fitFloors`, `grid` (written, or `gridFor`
into the area), `shape` (each piece's faces, box, centre and outline: the style's `shape` column), `names`
(`wordsToFit` in the room a top has), `order` (`backToFront`), `floorLabels` (`floorLabelPlace`) and `style` (each
piece's paint list: the style's other columns, painted by `paint.mjs`). Until 0.38.0 the
kit carried its own copy of them; footprint-story took that copy over in 0.24.0 and pinned it, so the frames did not
change when the kit moved onto it (`test/golden.json` is the same), and `test/iso-map-steps.test.mjs` checks the kit's
built map against `buildIsoMap`'s and that no kit file runs a step itself.

- **The spec** (`build.mjs` · `specOf`): the read map as plain data. Each piece's `who` is the kit's entry words less
  the recipe entry (`isometric blocks[2] ("db")`); a refusal comes back with the entry put in front (`stage map: …`),
  so it reads as the kit's always did. A floor with a size and no `at` is handed at `[0, 0]` (read.mjs): the spec takes
  a floor's place and size together. A written grid is handed as `{tile, origin, rise?}`.
- **The built map** (`map.built`, frozen plain data, no function): each block's `at`, `shape` (`faces`: a block's
  `left`, `right` and `top` polygons; a cylinder's `side` path and `top` ellipse), `paint` (its paint list, from
  `paints`), `fitted` and `smallFitted`; each floor's `at`, `size`, `shape` (its `ground` polygon and `grid` lines),
  `paint` (from `floorPaints`) and label `place`; each wire's `route` (null: written straight); the paint `order`.
  The kit's grid is made again from its numbers (`isometric(built.view)`).
- **The policy** (`ISO_FIT` = `ISO_MAP_POLICIES.film`): StoryDeck's tile range and names, a film's small line fitted
  down to 12 px, and every labelled floor held in a fitted picture (below). The spec carries the world's `style` when
  it writes one (below); with none it has no `style` key, and the map is built in the usual style (today's look).

## A world's style (from 0.42.0)

**Why:** one map can be drawn in more than one look — a heavy outline for a slide seen from the back of a room, no
outline for a soft explainer — and the look should be a word in the recipe, never new drawing code. footprint-story
names the looks: a style is a row of named choices, one per column (`isoStyle`; `shape`, `shading`, `line`,
`palette`, `texture`, `effects`), and the map's `style` step paints each piece's list by it. A world's `style` is
that row as it is:

```json
{"type": "world", "scene": "map", "world": {"kit": "isometric", "style": {"line": {"name": "ink", "width": 5}},
  "blocks": [{"name": "you", "label": "You"}, {"name": "db", "kind": "cylinder", "label": "Database"}],
  "wires":  [{"arrow": "you to db"}]}}
```

- **A column left out is today's look**, and a world with no `style` is exactly today's: the spec has no `style` key,
  so the map, its record and every frame are what they were (`test/golden.json` is the same).
- **The choices are footprint-story's** (`ISO_STYLE_CHOICES`, and the human door's `HUMAN_STYLE_CHOICES`, handed in
  whole): `line` is `"ink"` (the usual: the ink round every face, 2.5 px; option `width`, 0.5 to 20 px, for an
  outlined look), `"none"` (no outline on the faces; a floor keeps its tile lines), `"contour"` (a bold even contour)
  or `"human:sketchy"` (drawn by hand, below); `shape` `"box"`, `shading` `"tones"` or `"paper"`, `palette` `"theme"`
  or `"duotone"`, `texture` `"none"`, `"human:hatch"` or `"human:grain"` (below) and no `effects` yet. A choice is
  written as its name (`"none"`) or as `{"name": "ink", …its options}`.
- **Drawn as it asks.** The painter draws each item's stroke at the width the list gives (an outlined 5 px line at
  5 px) and draws no stroke where the list has none (`line: "none"`); the kit still picks the colours (below).
  `test/iso-style.test.mjs` pins an outlined world's and a no-outline world's pictures, different from today's and
  from each other.
- **Refused in the kit's words** (`read.mjs` · `readStyle`), naming the entry: a column there is not
  (`stage map: isometric style takes the columns shape, shading, line, palette, texture, effects (a column left out
  keeps today's look), or a look ({"look": "outlined", "line-art", "paper-grain", "duotone" or "sketchy"}) — not "colour"`), a
  choice there is not, listing those there are (`… style: line has no choice "dashed" — the line choices are "ink",
  "none", "contour" or "human:sketchy"`), and an option the choice does not take or a value out of its range, in
  footprint-story's words (`… style: line "ink" takes a width from 0.5 to 20 px — not 50`).
- **The record says the style the map was built in**, as footprint-story records it (`{row, options}`, every column
  filled in): on the world's `map.style`, in its `summary` (so the compile's record keeps it beside the world's entry),
  and in the map flow's record (its `read` step writes `style`), the usual row for a world that wrote none.

## Named looks (from 0.49.0)

A world can name one of footprint-story's looks — a style row under a name (`ISO_LOOKS`, footprint-story 0.34, 0.35
and 0.37) — in place of writing its columns:

```json
{"kit": "isometric", "style": {"look": "duotone"}, "blocks": [{"name": "you", "label": "You"}, {"name": "db", "kind": "cylinder", "tone": "ok"}]}
```

| look | its row | what it draws |
|---|---|---|
| `outlined` | `line: "contour"` | today's tones, a bold even contour round each piece and lighter inner lines (the sticker look) |
| `line-art` | `shading: "paper"`, `line: {"name": "contour", "width": 3, "inner": 1.25}` | ink lines on paper, nothing else |
| `paper-grain` | `texture: "human:grain"` | today's look printed on paper, a fine seeded grain over every face |
| `duotone` | `palette: "duotone"` | two inks on paper: lines in the ink, faces tints of the accent; a toned block (ok / warn / bad) keeps its colour |
| `sketchy` (0.50.0) | `shading: "paper"`, `line: "human:sketchy"`, `texture: {"name": "human:hatch", "spacing": 28}` | drawn by hand: white faces, every edge drawn as a pen goes (silhouette, then inner edges), the left sides hatched and the right cross-hatched, the lit tops clear |

- **A column written beside the look replaces its entry**, whole (`{"look": "line-art", "line": {"name": "contour",
  "width": 4}}`). Refused in footprint-story's words, naming the entry: a look that is none (`stage map: isometric
  style: look is one of "outlined", "line-art", "paper-grain", "duotone", "sketchy" (a row of choices under a name), or none —
  not "glitter"`), and a look whose every column the row writes (`… look "duotone" sets palette, and the row writes it
  itself, so the look draws nothing — drop the look, or the palette written beside it`).
- **On the film's ground** (`looks.mjs` · `groundedStyle`). The ground is the theme's (`lookOf(theme).bg`), dark when
  it is darker than the theme's ink. On a dark ground line-art's paper is the ground (`shading: {"name": "paper",
  "colour": <ground>}`) and the duotone's paper and ink are the ground and the theme's ink (`palette: {"name":
  "duotone", "paper", "ink", "accent"}`), as footprint-story's 0.35.0 notes ask of a dark page — white paper under a
  light ink, or a navy line on a dark ground, would not be seen. A column the recipe writes is left as written. The
  duotone's one column then holds the ground's colours, so its row is written out without the look's name
  (footprint-story refuses a look that draws nothing); the world's record keeps `look: {name, ground}` beside
  footprint-story's `style` for every world that names a look. On a light ground every look is handed in as written.
- **A duotone tints the untoned blocks** (`build.mjs` · `specOf`): the kit builds with no colours, and the duotone
  leaves a face the page colours as it is (where the kit's ok / warn / bad tones live), so a world in the duotone
  hands each block with no tone its colour (its own, else the kit's tone) and the duotone prints it as a tint. Toned
  blocks and floors stay the page's. No other world hands a colour: its spec is as it was.
- **A name is written in the ink that reads on its face** (`draw.mjs` · `drawName`, footprint-story's `readableInk`
  since 0.50.0 — the rule StoryReel 0.49.0 had as its own `nameInk`, moved there so a deck and a film choose alike, its
  result pinned equal to StoryReel's: no pinned picture moved): the theme's ink when it stands 4.5 : 1 on the block's
  top (every light theme, every tone), else the ground when it reads better — on a dark theme a name on a pale tone was
  drawn light on light, where the contrast check could not even see it. StoryReel's contrast check reads each look clean on the paper theme and on a dark one, each look's scene alone
  (`test/iso-looks.test.mjs` pins the closest word: 5.08 to 6.91 : 1, against 4.5 : 1 needed).
- **Sketchy is drawn within the stroke budget**: the example's sketchy world draws its few hundred strokes with no note
  (the hatch 28 px apart: footprint-story's 64-block world draws 1,246 strokes, under the 2,000 note); its seams too
  (below: a ball).
- **The grain's marks count against the stroke budget** (`notes.mjs` · `MARKS_PER_STROKE`, 32 marks a stroke: a mark is
  one segment of a path stroked once a face, a stroke a ring filled). A world's summary keeps `marks` beside `strokes`
  (absent when none: the floor's tile lines are the map's own). `bench/strokes.mjs`: the 64-block world in each look
  0.5 to 2.0 ms a frame (plain 0.6); fine grain on 256 big blocks (264,278 marks) 68 ms, a note.
- `examples/iso-looks` names each of the five looks on a stage of its own, pinned in `test/golden.json`.

## The painter: the map's paint list on a canvas (from 0.41.0)

`paint.mjs` · `paintItems(c, items, {base, ink, now})` draws one piece's paint list (footprint-story's `paint.js`
format) item by item, in the list's order: a `polygon`, a whole `ellipse`, a `path` (moves, lines, arcs of at most half
a turn counted the way they turn, a close), loose `lines` or a `stroke` (below), each filled when its fill comes to a
colour and stroked with its stroke's colour, alpha, width, join and cap. It decides no shape and no colour, and refuses
an item or a path step it does not know. `draw.mjs` hands it each floor's list (`floorPaints`) and then each block's
(`paints`), back to front.

**A hand-drawn line (from 0.46.0).** A `stroke` item (`{item: 'stroke', points: [[x, y, width, t], …], stroke:
{colour, alpha, width, join, cap}}`, footprint-story/human · `strokeItems`) has a width and a time per point. A canvas
line has one width, so the painter fills a ring instead, and every number of it is footprint-story's:
`strokeOutline(strokeAt(points, now), {cap})` — `strokeAt` the line as far as the pen has come (the pen's place
between two points included, so it grows smoothly), `strokeOutline` the one ring round it, both ends capped. The
painter only fills it, once, in the stroke's colour (its ink when it names none), by the non-zero rule (the ring can
cross itself at a round cap; even-odd would leave a hole). `now` is the frame's time less the piece's `appear` moment
(else the film's start: `draw.mjs` · `sinceStart`); with no `now` (a still) the line is whole.
`test/iso-strokes.test.mjs` checks the ring to 1e-6 at every cap and time, a faint line covered once over its ends
whichever way it runs, and pins a hand-drawn block's pictures.

**A world drawn by hand (from 0.46.0).** footprint-story's hand-drawn choices, `human:sketchy` (line: each piece's
edges drawn as a hand would, outline first), `human:hatch` (texture: the shaded faces hatched, after the line) and
`human:grain` (texture, 0.49.0: the `paper-grain` look's marks), are a tool's own choices. The kit hands in
footprint-story's whole list (`read.mjs` · `STYLE_CHOICES` = `HUMAN_STYLE_CHOICES`) to the style check, to the map build
(`buildIsoMap(spec, ISO_FIT, {choices})`) and to the map flow `storyreel check` runs (`runMapFlow(…, {choices})`), so
a world writes them as any other choice and the record names them (`style.row`):

```json
{"kit": "isometric", "style": {"line": {"name": "human:sketchy", "speed": 900}, "texture": {"name": "human:hatch", "spacing": 16}},
 "blocks": [{"name": "you", "label": "You", "appear": ["sketch", "First the browser"]}]}
```

Their options are footprint-story's (`human:sketchy`: `width`, `tremor`, `overshoot`, `speed`; `human:hatch`:
`spacing`, `angle`, `width`, `tremor`). Each piece is drawn as its pen goes from its moment: a hatch is slow (each
line a stroke), so a wider `spacing` and a faster `speed` finish a piece sooner. `examples/iso-sketch` is pinned in
`test/golden.json`.

**What it costs a frame.** A finished stroke's ring is built once and kept by its paint item (`paint.mjs` ·
`strokeRing`); only a stroke still being drawn has its ring built at its frame. Filling still costs per stroke:
`bench/strokes.mjs` measures a 64-block world drawn whole. So a world's strokes have a budget (ours, `notes.mjs` ·
`STROKE_BUDGET`): from 2,000 its notes say so with the fix, past 20,000 it is refused naming its style and the fix;
its summary keeps the count (`strokes`). A texture's marks (the grain's) count too, 32 to a stroke (0.49.0, above).

**What it paints:** a block's `left`, `right` and `top` faces, a cylinder's `side` and `top`, a floor's `ground` and
`grid` tile lines. **What stays drawn by hand in `draw.mjs`:** block names and small lines, floor names, cables and
their leads, arrow heads, wire labels on their plates, packets and their trails.

**Why the colours come in at draw time, not through the style step:** the kit builds its map with no colours, so the
built map (and the map flow's run of the same spec) is the deck's, colour for colour. Each fill then carries its
recipe (`{mix: [toward, share], colour: null}`: the top 20% toward white, the sides 6% and 18% toward black) and each
stroke `colour: null` — the page decides. The kit is that page: it picks a block's base (its `color`, its `tone`'s pale
tint, or StoryDeck's `#d9e4f3`), a floor's (its `color`, or none: its ground is then left unpainted) and the theme's
ink, and the painter applies the recipe to them with the kit's own `mix`, as it always did. A colour the list does
give (a style's own palette, when footprint-story ships one) is drawn as given. footprint-story proved this painter call for call equal to the
kit's 0.38.0 face-by-face drawing; `test/golden.json` pins it here, and `test/iso-paint.test.mjs` checks every item
kind on a recording canvas and that the kit paints the built map's lists and traces no face itself.

## Why a map is so: its own record (from 0.40.0)

`storyreel check` builds each isometric world's map again with footprint-story's map flow (`flow.mjs` · `mapRun`:
`runMapFlow(map.spec, ISO_FIT)`, the very spec `buildIsoMap` was handed) and keeps that run's record, so an agent asks
why a block stands where it does, why the grid is fitted, why a name is that size, and is answered from the record:

```
$ storyreel log --run 1 --why at --map 'stages[0]'
at = [[0,5,0],[5,1,0],[11,1,0]]
place: hand (hand#2) [wrote: at]
  read (read#0) ← via blocks [wrote: who, blocks, floors, wires, written, area, style, policy]
    ⚠ also consumed args — slice may be incomplete here
  place (place#1) ← [control: every block has an at: the map placed them] [wrote: placed, placedWhy]
    ↳ read#0 (see above)
```

WHY twice: a world is compiled on a synchronous path and a footprintjs run is not (footprint-story's
`docs/design/2026-11-map-flow.md`). The map flow's map must equal the kit's built map; the check compares them and says
a difference aloud (`drift`). See `../../check/README.md` · Asking why a map is so.

## A world's pieces move by intent (from 0.43.0)

**Why:** a block that falls, a ball thrown onto a server — tuned by hand, each move takes many tries (a duration, an
ease, keyframes) and differs run to run. Here the author writes only what happens, in footprint-story's words, and
footprint-story's intent decider (`footprint-story/human` · `planIntents`) decides the rest: the model, the duration
from a law, the curve. The kit says only where things are, and draws the block where the samples put it.

```json
{"type": "world", "scene": "drop", "world": {"kit": "isometric",
  "blocks": [{"name": "box", "at": [1, 1, 3]}, {"name": "ball", "kind": "cylinder", "at": [1, 6], "size": [1.2, 1.2, 0.6]},
             {"name": "server", "at": [8, 2], "size": [2, 2, 1.6]}],
  "motion": [{"piece": "box", "do": "fall", "at": ["drop", "It falls to the floor"]},
             {"piece": "ball", "do": "throw", "to": "server", "at": ["drop", "the ball is thrown"], "wrap": [{"wrapper": "anticipate"}]}]}}
```

The box falls under gravity onto the floor under it (0.46 s: `ballistic`, the usual for a fall); the ball is thrown at
45° onto the middle of the server's top, with a wind-up first (`ballistic` and `anticipate`). Nothing was timed.

| key | | |
|---|---|---|
| `piece` | a block's name | the block that moves; a floor or a wire is refused (a packet later), and so is a block a wire joins (its cable is laid to where it stands and would not follow it) |
| `do` | `fall` · `throw` · `hang` · `settle` · `reach` | footprint-story's word for the move (below) |
| `at` | an anchor | when the move begins; left out, when the block appears, else the film's start |
| `to` | a block's name or tiles | where it ends: a block's name is the middle of its top (it ends standing on it), tiles `[col, row]` or `[col, row, lift]` a place in the world. A throw, a settle and a reach need one; a fall and a hang take none |
| `from` | a block's name or tiles | a hang's pin (only a hang takes one). A block's name is never the middle of its top (the piece would rest inside the block): under a block in the air above the piece, the middle of its underside; beside any other, its top edge that faces the piece, on an arm out from it by half the piece's depth (below) |
| `wrap` | `[{"wrapper": "anticipate"}]` | footprint-story's wrappers, innermost first: `anticipate`, `follow-through`, `hold`, `overshoot`, with their options (at most 4) |
| `model` | `"bounce"`, `{"name": "bounce", "squash": 0.2}` | one of footprint-story's models for the family, when the usual is not wanted (a fix footprint-story gives is written here as it says it) |
| `accept` | `["arc"]` | critics whose findings this move keeps, when what they find is meant (a straight slide): shown as accepted and recorded, never a fault. Each must be one the move's model is checked by, or `reel:contact` |

**What a block can do in a film now** (`motion-read.mjs` · `MOTION_DOS`, footprint-story 0.31):

| do | it moves | the usual model | also |
|---|---|---|---|
| `fall` | straight down from where it stands onto the highest top under it (a block its footprint overlaps), else the floor | `ballistic` | `bounce` (and its `squash`, drawn: the block flattens at a landing, its area kept) |
| `throw` | through the air, its foot landing on `to` | `ballistic` (the usual apex: a 45° throw) | `bounce` (lands on the line its target stands on and bounces to rest) |
| `hang` | on a rope from the pin `from` (above its top: a lower pin is refused) to its top, swinging until it rests below the pin; the rope is drawn and framed with the block | `verlet` | |
| `settle` | to `to` on the motion spring | `spring` | its `feel` |
| `reach` | to `to` on one smooth push, its seconds from Fitts's law (a block's top face's width across the frame is the target) | `min-jerk` | its `bend` |
| `roll` (0.44.0) | a **ball** along the level it rests on (the floor, or a block's top) to `to`, turning by distance / radius, slowed to rest exactly there by rolling resistance | `no-slip` | its `resistance`, `gravity` |
| `slide` (0.44.0) | any block along the level it rests on to `to`, slowed to rest exactly there by kinetic friction, never turning | `coulomb` | its `kinetic`, `static`, `gravity` |
| `tumble` (0.44.0) | a **ball** or a **block** through the air spinning, landing its foot on `to` (a block's top or the floor, no higher than it starts), then rolling on (a ball) or sliding on (a block) to rest along the same way | `free-spin` | its `resistance` (a ball's roll on), `kinetic`, `static` (a block's slide on), `gravity` |

`draw`, `write` and `sketch` move a pen's point along a line, not a block: refused, saying so. Each word is one row in
`MOTION_DOS` and one in `motion.mjs` · `INTENT_OF`, and a test pins that the two tables agree.

```json
"blocks": [{"name": "ball", "kind": "ball", "label": "Ball", "at": [1, 6]}, {"name": "crate", "label": "Crate", "at": [1, 1], "size": [1.4, 1.4, 1]},
           {"name": "shelf", "at": [7, 1], "size": [2, 2, 1.5]}, {"name": "cube", "at": [7.5, 1.5, 1.5], "size": [1, 1, 1]}],
"motion": [{"piece": "ball", "do": "roll", "to": [6, 6.5]},
           {"piece": "crate", "do": "slide", "to": [4, 2.2], "at": ["roll", "A crate slides"]},
           {"piece": "cube", "do": "tumble", "to": [8, 4.5], "at": ["roll", "the cube tumbles"]}]
```

**Rolling, sliding and tumbling are planned side on along their way** (`motion-side.mjs`). These models move a body
along a level floor under gravity, and a floor seen from a corner is no level line on the frame (a roll planned there
would run down a 27° slope). So each is footprint-story's intent in the upright plane through the body's way — x along
the way from where it starts, y down — in the world's own px, a tile's true length (its width over √2: a level line
across the frame is drawn at its true length, and heights in that plane are the same px, so distance / radius is a true
turn). The kit takes the radius and shape from the block (a ball's half width; a block tumbles as a `box` its half
height) and lays each sample back on the floor along the way. The author writes intent only: `to`, and `wrap`, `model`,
`accept` as for any move. `motionIntents` holds these side-on intents as footprint-story was handed them.

- A **roll** and a **slide** keep to the level they start on: the block must rest on it (one in the air is refused:
  fall it first), its middle over that top at both ends (a way off the top's edge is refused), and `to` at that level (a
  block's name is the middle of its top, a level up: refused, saying which tiles beside it). footprint-story picks the
  start speed that brings it to rest exactly on `to`; it relies on what it rests on standing still.
- A **tumble** flies down onto `to` (a block's top, or the floor; to tiles in the air, or up, is refused) and then
  rolls or slides on as footprint-story's landing rule says: where it comes to rest is footprint-story's, the last
  sample of its own plan of the intent (planned alone before the next move is placed from it; the list's plan gives the
  same move). An end off the top it landed on is refused, naming how far it went on and the fix (land it on the floor,
  or slow it: `model: {"name": "free-spin", "resistance": …}`). A **block** tumbles end over end about one of its own
  edges, so its way runs along a row or a column, and it is as long along its way as it is high — then every face it
  lands on shows the very block again, and at rest it is drawn as built (pinned to the pixel). Otherwise refused, saying
  which `to` or `size` would do.
- **What can be drawn turning, and what is refused** (`motion-read.mjs` · `TURNING_KINDS`): a roll turns a ball; a tumble a
  ball or a block. A block does not roll (it tips over its edges); a cylinder stands on its flat end and the kit draws it
  only upright, so it can neither roll on its rim nor tumble end over end and land rolling — each is refused naming the
  entry and the fix (make it a ball, slide it, throw it). WHY refused: a picture turned on the frame is a turn about the
  line to the viewer, which no body on this floor makes; a turn the film cannot show truly is said, never faked.

**A turn is drawn as the grid sees it** (`turn.mjs`). A body rolling along its way turns about the level line in the floor
across it (up × the way), by the angle the sample gives — a roll's distance / radius, a tumble's spin — never worked out
again. Its corners (a block) or its marks (a ball) are turned in tiles and put on the frame by the grid's own numbers, so a
cube tumbling shows its faces turning, each toned by the way it faces as the built faces are (blended, so a face turning
from top to side darkens smoothly, and square on it is the built colour exactly), and a ball shows the halves of its two
marks that face the viewer turning forward. A piece's turns follow one another: a ball rolled twice turns on from where
its first roll left it. While a body turns its **name is hidden** (a name on its top would be no part of a body turning
end over end), from the move's start to its end, and it is not listed to read then; at rest it is drawn again (a block
on its top face, a ball on its middle). A turning block is swept for `reel:contact` as the box its turned corners fill
over each short stretch (a cube a corner on reaches √2 of its half side), so it never passes through a block unseen.

**A ball** (`kind: "ball"`, the film's own) is round every way — its size `[d, d, d]`, `[1, 1, 1]` when left out. The
map is built with it as the cylinder round it (placed, ordered, routed to and its name fitted as that cylinder, which
holds the whole ball: footprint-story's map build takes no ball yet). **footprint-story paints the ball** (0.50.0,
`ball.mjs`; footprint-story 0.37's `paintPiece` with `kind: "ball"`) in the world's style — any style or look: its
outline (the great circle across the way to the viewer — a circle on the usual grid) a face as a top is, edged, and its
two seams the line's marks (today's look: the ink at half, 2 px); its name on its middle in the ink that reads on that
face; its shape (what a camera frames, what hides a cable) the ball's own. A turned ball's list takes the turned marks in
place of its seams (the level seam first, `turn.mjs` · `ballPicture`), and a moved one has every point put where its
pose says. A ball has no ports (a wire joins it at its foot). A line that draws a ball's seams by hand
(`human:sketchy`, the `sketchy` look) plans them as built, with no seam to turn, so a roll or a tumble of such a ball is
refused, naming the fix (`… a roll turns the ball, and this world's line "human:sketchy" draws a ball's seams by hand as
it is built — they could not be drawn turning: throw it (do: "throw") or slide it (do: "slide"), or write another line
beside the look ("line": "ink")`); a throw or a slide is drawn by hand as it goes.

**Where things are** (`motion.mjs`, by footprint-story's place rules — `/isometric` · `footOf`, `landingUnder`, `ridesOn`, `offFrame`, `drawnOff`): a block moves by its **foot** (the middle of its footprint, at
its lift), in the built map's tiles put on the frame by its grid. Moves are placed in the order they begin, each from
what the world is then: a fall lands on the highest top under it, else the floor (a block already resting there cannot
fall); a target block is aimed at **where it stands when the move begins** (a box that fell earlier is caught where it
fell), and a move that relies on a block that moves meanwhile — its target, what it lands on — is refused with both
times. A block that moves from under another resting on its top is refused, naming both entries: the rider would be
left on nothing, and only the author knows whether it goes too (move it off first, or anchor the move before it lands).
A hang ties the rope to its **top**; its pin must be above it. **A hang from a block** (`"from": "shelf"`, from 0.51.0;
`motion-hang.mjs` · `hangPin`) is tied where a real one would be: to the middle of its **underside** when the block is
in the air above the piece's top (a beam, a shelf on nothing), the piece hanging beneath it; else **beside** it — at its
top, the middle of the edge that faces the piece, on an arm held out by half the piece's own depth across that edge,
so at rest the piece hangs flush against that side, touching it and not inside it. The arm is drawn from the edge to
the pin in the rope's ink, and framed with the rope. Before 0.51.0 a block's name was the middle of its top, as `to`
takes it, and a piece hung there always rested inside the block (`reel:contact`, every time). The rope's length is
where the piece starts, so a piece hung from one tile away swings past its rest and back into the block — and that is
still a `reel:contact` warn: the rule picks where the rope is tied, never what the swing may do. The record names the
block, the rule and the pin (`map.motions[i].hung`: `{on, rule: "under" | "beside", pin}`). A block whose top is not
above the piece's is refused, naming a pin of tiles above it. Tiles off the 1600×900 frame are refused in tiles,
naming where the blocks stand, and so is a way that leaves the frame as it is drawn — a throw's top, a swinging rope —
checked at each sample, saying the moment, how far off and where its foot is then in tiles (a block the map itself
draws off the frame is the map's to say).

**What a move passes through** (`reel:contact`, the kit's own critic): each move is sampled 30 times a second, its
block placed in tiles where it is drawn, and the box is **swept** along each stretch between two samples against every
other block (moving too, when it moves): footprint-story's `/isometric` · `sweptThrough` finds the deepest point of each stretch
(`checkMoments` the samples, `deepestPass` the deepest of them, `passFinding` its words; the kit adds `reel:` and its fix),
so a fast move skips nothing — a 30-tile reach or a 50-tile throw covers more than a tile between samples, and a wall a
tenth of a tile thin is still found. Going a twentieth of a tile or more into a block is a finding naming the block,
the moment and the fix (a settle onto a top from
beside it rises through its side; a throw onto the same top does not). WHY the kit's and not footprint-story's
`contact`: that critic reads boxes on the frame, and on an isometric frame a block's picture overlaps blocks it is
nowhere near (a ball resting on a top is inside that block's box on the frame). This finding is the world's record,
not the intent decider's run (that run holds no tiles).

**Timed on the film's clock.** A move begins at its anchor and lasts what footprint-story planned. A block is drawn as
built until its first move begins, moves along the samples, and stays where its last move ended. A piece's moves run
one after another, each from where the one before left it (the box can fall, then be thrown): two that overlap in time
are refused with both times and the seconds footprint-story planned, and a hang (which ends wherever its swing settles)
is a piece's last move.

**Drawn at the sampled place.** The kit draws the very block (its faces, names and colours are the built map's) under a
transform: moved by the sample, and scaled about its foot by a bounce's squash. A camera frames it where it is
(`regionsAt`), turned as it is. **Only a roll's and a tumble's angle is drawn** (above): footprint-story's other block
moves give an angle too, but none is a body's turn — a throw's and a fall's is the heading of the flight, a hang's the
heading of its rope's last link — and a block that stood upright would jump to it.

**Painted in its place.** At each frame a moving block takes its place in the back-to-front order where it is now:
footprint-story's `grid.backToFront` over every block, the moved one at its current place (footprint-story's `footTiles`
works that place back from where it is drawn, on the move's way; once a move ends, its planned end exactly). So a ball
high over a wall is drawn in front of it, and one that lands behind the wall is drawn behind it. Until a block first
moves, the built order is used as it was.

**A block a wire joins cannot move**, and is refused saying so: its cable is laid on the floor to where it stands, and
would not follow it.

**What a move covers** (`reel:covers`, `motion-cover.mjs`, by footprint-story's `/isometric` · `hiddenNames`): a moved
block that comes to rest over another block's name (a ball on a server's top sits on its name), and is painted after
that block, hides the name. "Painted after" is read from the order of every block, the order the film paints by
(`orderAt`); 0.44.0 ordered the two blocks alone and so hid a name the picture draws over a block behind it, fixed in
0.45.0. From that moment until the block moves on, the name is not drawn and not listed to read (`texts()`), and the move is a finding naming the move, the name and the fix. A
block passing over a name in flight hides nothing: it is a moment of natural occlusion, drawn as it is, and the
contrast check judges a word by its best moment, so it reads no faint word (pinned on CI's fonts and macOS's). The fix:
land it clear, or `"accept": ["reel:covers"]` when it is meant (the example accepts its ball on the server).
WHY not drawn: a few letters peeking past a block read as a word too faint to read, and how many peek depends on how
wide the host's font draws them (CI's DejaVu Sans showed "Server" at 1.56:1 where macOS hid it whole). The cover is
decided from the kit's own numbers — a name's fitted lines at 1.2 of its size a letter, wider than any font draws its
widest letters (a test measures "MW", "WWW" and a full-width "Ｗ" in the host's fonts) — so every host draws and says
the same words.

**A world with no motion is exactly as it was**: nothing is planned, its record and summary have no `motions`, no run
is handed out, and every frame is the same (`test/golden.json` is unchanged; the examples `examples/iso-motion` and
`examples/iso-roll` add their own pins, as `examples/iso-sketch` does for a world drawn by hand).

**The record keeps footprint-story's decisions, as its data**: the world's `map.motions` has each move's `path`,
`piece`, `do`, `at` (its start on the film's clock), `seconds`, `model`, `by` (`usual` or `named`), `reason`
(footprint-story's sentence: "do: 'fall' → ballistic, the usual for do: 'fall' — a fall of 205.8 px onto the floor at y
377.2 from rest, over 0.46 s under 1960 px/s²") and `wrappers`; its `summary.motions` (kept beside the world's entry in
the compile's record) the few words of each. `motionIntents` is what footprint-story was handed.

**Why a move is so: its own record.** `storyreel check` runs each moving world's intents through footprint-story's
chart (`motionRun`: `footprint-story/humanflow` · `runHumanFlow`, the very intents `planIntents` was handed) and keeps
that run's record, so `storyreel log --run <id> --why duration-1 --motion story` says why `motion[1]` takes its time,
from the record alone (`../../check/README.md` · Asking why a move is so). The two plans must be equal; a difference is
a `drift` line. **What footprint-story's critics find** (`jerk`, `arc`, `spacing`, `contact`, `volume`, `stretch`, and
from 0.44.0 `roll-slip` — a drawn turn astray from distance / radius — and `spin` — a drawn angle that jumps, or a spin
that changes in flight; a spin too fast for any track to read is said as a `note`)
reaches the check's reply at the critic's own level, naming the entry and the fix in footprint-story's words: a `warn`
(a body through a block, a straight slide) is a finding to fix, so a check never reads clean over it; a `note` is
advice; a critic the entry names in `accept` is shown as accepted, with no fix, and the check can read clean
(`review.mjs` · `MOTION_KINDS`):

```
fix  0:11.8–0:12.5 drop · a move that reads wrong: arc: its move runs straight (it bows 0.0% of its length) — … · at story.motion[3] · fix: bow it: model: {name: 'min-jerk', bend: 0.06}
```

Every refusal names the entry and the fix (`stage drop: isometric motion[0] ("ball"): a fall drops the block from
where it stands, and it stands on the floor (lift 0) — lift it first (its at: [col, row, 3]), or throw it`), and
footprint-story's own refusals come back in the entry's name. At most 64 moves a world (footprint-story's
`MOST_INTENTS`).

## What a film reads of it

- `regionsAt(t)`: each block, floor and wire by `name` (`story.blocks[3]`, `stages[0].world.wires[1]`), each label by
  its own path — a focus, a push or a camera move frames `"db"`.
- `texts()`: every label, for the reading check.
- `parts(t)`: each packet's centre mounted on the stretch of its cable it rides, for the geometry audit.
- `notes`: what the kit says of the map, each `{level, path, message, fix?}` with the fix (`fix`: the words after " — "
  in the message, said apart) — a wire that passes behind a block, shares a lane, crosses three or more, turns four or
  more times, doubles back at a port, or is drawn straight and why; a name that does not fit its top; a floor's name
  that does not fit or finds its edge covered; a block whose paper grain footprint-story thinned on a face too big for
  it (`grain-thinned`, an `info`, its fix twice the spacing). The film carries every world's notes as `film.kitNotes`
  (each path from the recipe's top: `story.wires[2]`), `storyreel check` says each (a `warn` a fix, an `info` advice:
  `../../check/README.md`), and the compile's record keeps
  them, with the world's `summary` (placed by whom, the tile, the style, how many blocks, floors, wires, cables along
  the floor, packets), beside the world's entry (`world.story`, `stage.stages[1]`). `strict: true` refuses the film on a warning.
- `map`: the whole record on the world (every block's place and fitted name, every cable's corners, length and hidden
  stretches), for a test or a tool that reads the world itself.
- `mapRun({sink, recorders})`: the map built again by the map flow, a run whose record says why (`flow.mjs`); the film
  hands each such world's out as `film.mapRuns` (`[{name, kit, run}]`, named by its recipe path), for `storyreel check`.
- `motionRun({sink, recorders})` and `motionFindings`: a moving world's intents run through footprint-story's chart, and
  what its critics found (`motion.mjs`); the film hands them out as `film.motionRuns` (`[{name, kit, run, findings}]`).

Every refusal names the entry (`stage map: isometric wires[2] ("w3")`) and the fix; a value it quotes is cut to 60
characters; a field is read once, by its own value (a getter is refused, never run); the lists' lengths (256 blocks and
floors, 1024 wires) are checked before an entry is read; the grid's and the router's own refusals come back in the
entry's name.

## Files

| file | one job |
|---|---|
| `index.mjs` | the kit: compile, regions, texts, parts, the record |
| `read.mjs` | the recipe entry checked (its `style` too), every refusal naming the entry and the fix |
| `build.mjs` | the read map handed to footprint-story's `buildIsoMap`, and what it built joined onto the pieces |
| `flow.mjs` | the same spec run through footprint-story's map flow, for its record; where its map parts from the kit's |
| `cables.mjs` | each wire on the frame: the cable's rounded line, a straight wire, a lead's share, a label's place (footprint-story's rules) |
| `ride.mjs` | the packets at t, from the shared ride numbers |
| `notes.mjs` | what the kit says, in words |
| `draw.mjs` | the canvas drawing, StoryDeck's look in the film's theme: the paint lists through `paint.mjs`, the rest by hand |
| `paint.mjs` | the one canvas painter: a piece's paint list traced, filled and stroked as the list says; a hand-drawn `stroke` filled as footprint-story's ring of the part drawn by now |
| `motion-read.mjs` | the `motion` entries checked, every refusal naming the entry and the fix; what a block can do (`MOTION_DOS`) |
| `motion.mjs` | each entry made a footprint-story intent on the frame, planned (`planIntents`), timed on the clock and sampled at t (with its place for the paint order); its record, findings and run |
| `motion-cover.mjs` | which names a moved block covers, and when (footprint-story's rule at each sample): not drawn, not listed to read, said (`reel:covers`) |
| `motion-side.mjs` | roll, slide and tumble: each a footprint-story intent side on along its way in the world's px, its checks of levels and edges (footprint-story's `sideFoot` lays its samples back on the floor) |
| `turn.mjs` | a body turned where it is, as the grid sees it: a turn as a matrix in tiles, a turned block's faces (its paint list) and a ball's outline and marks, a turning block's reach |
| `ball.mjs` | a ball painted by footprint-story in the world's style; its list turned (the turned marks for its seams) and moved; a turning move of a ball whose seams are drawn by hand refused |
| `words.mjs` | how both readers quote a value and check keys and anchors (`shown`, `keysOf`, `anchorLike`): its own module, so the kit's modules import no cycle (a test pins it) |

**From footprint-story, as StoryDeck has them** (they were carried here from StoryDeck until 0.35.0; both tools now
import the one copy, so a deck and a film draw the same cable):

| here | footprint-story |
|---|---|
| `cables.mjs` · a cable's label, its plate and the looks a map's labels share | `/isometric` · `labelPlace`, `labelHalf`, `held`, `walkWay`, `LABEL_PLACES`, `CABLE` |
| `cables.mjs` · a straight wire: its lanes, its ends 6 px off each outline, too close refused, its bend, its curve | `/isometric` · `lanesOf`, `straightRun`, `bentWire`, `curveWay` (and `exitOutline` beneath) |
| `cables.mjs` · the cable's numbers (6 px clear, corners 0.4 of a tile, the 18 px head's four fifths) | `/isometric` · `CABLE` |
| `cables.mjs` · a laid cable's line, stopped where its head begins (from 0.36.0: never past 1 px short of its last run's start, as StoryDeck stops it — before, at most half that run) | `/isometric` · `cableWay` |
| `cables.mjs` · a lead into a port on a seen side: the share of the line drawn again over its block, where a packet passes onto it (from 0.37.0: through its floor corner, from where the head begins — before, the straight run of its points to the floor point) | `/isometric` · `cableLead` |
| `ride.mjs` · a packet's share at t (CSS's `linear()` read at a moment) and how much of it shows past a block | `/motion` · `onStops`, `seenAt` |
| `draw.mjs` · the arrow head's corners (only the painting is here) | `/isometric` · `arrowHead`, `headingOf` |

**Moving pieces, from footprint-story** (0.45.0: StoryReel 0.44.0 and StoryDeck each held these; now one copy, and the
kit keeps only the drawing, its `reel:` prefix and its words). `turn.mjs` · `reachOver` stays here, not shared yet.

| here | footprint-story |
|---|---|
| `motion.mjs`, `motion-side.mjs` · a block's foot, top and corner; what a fall lands on; a block resting on one that moves | `/isometric` · `footOf`, `topOf`, `cornerOf`, `landingUnder`, `overTop`, `ridesOn` |
| `motion.mjs` · a moving foot's place in tiles, a side-on sample laid back on the floor, the world's px in a tile | `/isometric` · `footTiles`, `sideFoot`, `worldPx` |
| `motion.mjs` · what a move passes through (`reel:contact`) | `/isometric` · `sweptThrough`, `checkMoments`, `deepestPass`, `passFinding` |
| `motion.mjs`, `draw.mjs`, `turn.mjs` · off the 1600×900 frame (`MOTION_FRAME`, handed in), a point where its pose puts it | `/isometric` · `offFrame`, `drawnOff`, `posed` |
| `motion-cover.mjs` · a name's box, an outline over it, which resting block hides it (`reel:covers`) | `/isometric` · `nameBox`, `NAME_WIDTH`, `overlapsBox`, `orderAt`, `hiddenNames`, `coverFinding` |

What the film does otherwise, each said where it is done: a tone is a pale tint of the theme's colour; a floor's name
is whole ink on a halo of the ground, a little heavier (the film's contrast check reads slanted words); the small line
is fitted; the grid is fitted when blocks are placed by hand too.

**Not here:** icons beside a floor's name (`data-icon`), footprints and pictures standing on the floor
(`data-footprint`), floor kept clear under words (`data-keep-clear`), packets that keep their size through a camera
move (`data-keep-size`), wires from a block to a flat piece, and a way for `storyreel check` to list the kit's notes
(they are on the world: `notes`; `strict` turns a warning into a refusal). The example: `examples/iso-world`, built and
checked by `test/iso-world.test.mjs` and pinned in `test/golden.json`; the moving one, `examples/iso-motion`, by
`test/iso-motion.test.mjs`, pinned there too; the rolling one, `examples/iso-roll`, by `test/iso-roll.test.mjs`.
