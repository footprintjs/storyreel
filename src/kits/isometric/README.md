# kits/isometric — StoryDeck's maps in a film

**Why:** a system drawn as blocks on a floor seen from a corner reads at a glance, and a talk often has it twice: on a
slide (StoryDeck) and in a film (StoryReel). This kit draws the same map the same way, because every number comes from
`footprint-story`: `/isometric` places the blocks (`arrange`, `arrangeByGroup`), lays the cables (`routes`, with ports),
fits the grid (`gridFor`), the floors' names (`floorLabelPlace`) and the blocks' names (`wordsToFit` with `grid.room`),
orders the painting (`backToFront`) and rounds each cable (`rounded`); `/motion` rides the packets (`rideProfile`,
`rideSeconds`, `withHold`, `showStops`, `hiddenRamps`). The kit only draws on the canvas and words what it finds.

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

Every refusal names the entry (`stage map: isometric wires[2] ("w3")`) and the fix; a value it quotes is cut to 60
characters; a field is read once, by its own value (a getter is refused, never run); the lists' lengths (256 blocks and
floors, 1024 wires) are checked before an entry is read; the grid's and the router's own refusals come back in the
entry's name.

## Files

| file | one job |
|---|---|
| `index.mjs` | the kit: compile, regions, texts, parts, the record |
| `read.mjs` | the recipe entry checked, every refusal naming the entry and the fix |
| `build.mjs` | placement, routes, grid, floors, faces, fitted names, painting order |
| `cables.mjs` | each wire on the frame: the cable's rounded line, a straight wire, a lead's share, a label's place |
| `ride.mjs` | the packets at t, from the shared ride numbers |
| `notes.mjs` | what the kit says, in words |
| `draw.mjs` | the canvas painting, StoryDeck's look in the film's theme |

**Carried from StoryDeck** rather than shared — footprint-story leaves them out today, and they are to move there in a
later step, so a deck and a film keep one copy:

| here | from StoryDeck |
|---|---|
| `cables.mjs · LABEL_PLACES`, `labelAt` | `deck/cable.js · LABEL_PLACES`, `labelPlace` (a cable label's place on its cable) |
| `cables.mjs · labelHalf` | `deck/transforms.js · labelBox` |
| `cables.mjs · ISO_CABLE` | `deck/cable.js` and `deck/transforms.js` numbers: CLEAR, GAP, LANE, the 12 px least, CORNER, HEAD, SAMPLE, WALK_MOST, LABEL, EDGE, TIP, LABEL_LOOKS |
| `cables.mjs · exitOutline` | `deck/boxes.js · exitOutline` |
| `cables.mjs · layStraight` | `deck/transforms.js · wiresBetween` (straight wires: GAP, lanes, the too-close refusal) and `wireSvg` (the bend's curve) |
| `cables.mjs · curveWay` | `deck/rides.js · curveLength` (a curve walked in 64 runs) |
| `build.mjs · roundOutline` | `deck/iso.js · roundOutline` |
| `ride.mjs · seenAt` | `deck/rides.js · seenOf` (CSS there, a number at t here) |
| `ride.mjs · onStops` | CSS `linear()`, which StoryDeck's stops are written as (`deck/rides.js · easing`) |
| `draw.mjs · drawHead` | `deck/transforms.js · headAt` |

What the film does otherwise, each said where it is done: a tone is a pale tint of the theme's colour; a floor's name
is whole ink on a halo of the ground, a little heavier (the film's contrast check reads slanted words); the small line
is fitted; the grid is fitted when blocks are placed by hand too.

**Not here:** icons beside a floor's name (`data-icon`), footprints and pictures standing on the floor
(`data-footprint`), floor kept clear under words (`data-keep-clear`), packets that keep their size through a camera
move (`data-keep-size`), wires from a block to a flat piece, and a way for `storyreel check` to list the kit's notes
(they are on the world: `notes`; `strict` turns a warning into a refusal). The example: `examples/iso-world`, built and
checked by `test/iso-world.test.mjs` and pinned in `test/golden.json`.
