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
| `data-iso="block"` / `"cylinder"` | `kind` | `block` when left out |
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
(`wordsToFit` in the room a top has), `order` (`backToFront`) and `floorLabels` (`floorLabelPlace`). Until 0.38.0 the
kit carried its own copy of them; footprint-story took that copy over in 0.24.0 and pinned it, so the frames did not
change when the kit moved onto it (`test/golden.json` is the same), and `test/iso-map-steps.test.mjs` checks the kit's
built map against `buildIsoMap`'s and that no kit file runs a step itself.

- **The spec** (`build.mjs` · `specOf`): the read map as plain data. Each piece's `who` is the kit's entry words less
  the recipe entry (`isometric blocks[2] ("db")`); a refusal comes back with the entry put in front (`stage map: …`),
  so it reads as the kit's always did. A floor with a size and no `at` is handed at `[0, 0]` (read.mjs): the spec takes
  a floor's place and size together. A written grid is handed as `{tile, origin, rise?}`.
- **The built map** (`map.built`, frozen plain data, no function): each block's `at`, `shape` (`faces`: a block's
  `left`, `right` and `top` polygons; a cylinder's `side` path and `top` ellipse), `fitted` and `smallFitted`; each
  floor's `at`, `size`, `shape` (its `ground` polygon and `grid` lines) and label `place`; each wire's `route` (null:
  written straight); the paint `order`. The kit's grid is made again from its numbers (`isometric(built.view)`).
- **The policy** (`ISO_FIT` = `ISO_MAP_POLICIES.film`): StoryDeck's tile range and names, a film's small line fitted
  down to 12 px, and every labelled floor held in a fitted picture (below). The style's paint list is built too; the
  kit paints its own look (`draw.mjs`) until a world's recipe takes a style.

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

## What a film reads of it

- `regionsAt(t)`: each block, floor and wire by `name` (`story.blocks[3]`, `stages[0].world.wires[1]`), each label by
  its own path — a focus, a push or a camera move frames `"db"`.
- `texts()`: every label, for the reading check.
- `parts(t)`: each packet's centre mounted on the stretch of its cable it rides, for the geometry audit.
- `notes`: what the kit says of the map, each `{level, path, message}` with the fix — a wire that passes behind a block,
  shares a lane, crosses three or more, turns four or more times, doubles back at a port, or is drawn straight and why; a
  name that does not fit its top; a floor's name that does not fit or finds its edge covered. The film carries every
  world's notes as `film.kitNotes` (each path from the recipe's top: `story.wires[2]`), and the compile's record keeps
  them, with the world's `summary` (placed by whom, the tile, how many blocks, floors, wires, cables along the floor,
  packets), beside the world's entry (`world.story`, `stage.stages[1]`). `strict: true` refuses the film on a warning.
- `map`: the whole record on the world (every block's place and fitted name, every cable's corners, length and hidden
  stretches), for a test or a tool that reads the world itself.
- `mapRun({sink, recorders})`: the map built again by the map flow, a run whose record says why (`flow.mjs`); the film
  hands each such world's out as `film.mapRuns` (`[{name, kit, run}]`, named by its recipe path), for `storyreel check`.

Every refusal names the entry (`stage map: isometric wires[2] ("w3")`) and the fix; a value it quotes is cut to 60
characters; a field is read once, by its own value (a getter is refused, never run); the lists' lengths (256 blocks and
floors, 1024 wires) are checked before an entry is read; the grid's and the router's own refusals come back in the
entry's name.

## Files

| file | one job |
|---|---|
| `index.mjs` | the kit: compile, regions, texts, parts, the record |
| `read.mjs` | the recipe entry checked, every refusal naming the entry and the fix |
| `build.mjs` | the read map handed to footprint-story's `buildIsoMap`, and what it built joined onto the pieces |
| `flow.mjs` | the same spec run through footprint-story's map flow, for its record; where its map parts from the kit's |
| `cables.mjs` | each wire on the frame: the cable's rounded line, a straight wire, a lead's share, a label's place (footprint-story's rules) |
| `ride.mjs` | the packets at t, from the shared ride numbers |
| `notes.mjs` | what the kit says, in words |
| `draw.mjs` | the canvas painting, StoryDeck's look in the film's theme |

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

What the film does otherwise, each said where it is done: a tone is a pale tint of the theme's colour; a floor's name
is whole ink on a halo of the ground, a little heavier (the film's contrast check reads slanted words); the small line
is fitted; the grid is fitted when blocks are placed by hand too.

**Not here:** icons beside a floor's name (`data-icon`), footprints and pictures standing on the floor
(`data-footprint`), floor kept clear under words (`data-keep-clear`), packets that keep their size through a camera
move (`data-keep-size`), wires from a block to a flat piece, and a way for `storyreel check` to list the kit's notes
(they are on the world: `notes`; `strict` turns a warning into a refusal). The example: `examples/iso-world`, built and
checked by `test/iso-world.test.mjs` and pinned in `test/golden.json`.
