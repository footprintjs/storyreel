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
| `data-iso-grid="120 at 960 240"` / `"fit"` | `grid: {tile, at, rise?}` / `"fit"` | fitted by default (into `area`, the whole frame unless given) |

What a film adds, where a deck has clicks: `appear` (an anchor: the piece comes in over 0.35 s, and is named from then),
a wire's `start` (when its packets begin; else when it appears, else the film's start) and `strict` (a warning refuses).

## What a film reads of it

- `regionsAt(t)`: each block, floor and wire by `name` (`story.blocks[3]`, `stages[0].world.wires[1]`), each label by
  its own path — a focus, a push or a camera move frames `"db"`.
- `texts()`: every label, for the reading check.
- `parts(t)`: each packet's centre mounted on the stretch of its cable it rides, for the geometry audit.
- `notes`: what the kit says of the map, each `{level, path, message}` with the fix — a wire that passes behind a block,
  shares a lane, crosses three or more, turns four or more times, doubles back at a port, or is drawn straight and why; a
  name that does not fit its top; a floor's name that does not fit or finds its edge covered. `map`: the record (who
  placed the blocks, the tile, every block's place and fitted name, every cable's corners, length and hidden stretches).

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

Carried from StoryDeck rather than shared (footprint-story leaves them out): a cable label's place on its cable
(`deck/cable.js · labelPlace`, 13 places from the middle), a round thing's outline, and the cable-on-the-frame numbers
(6 px off a foot, corners 0.4 of a tile, an 18 px head).

**Not here:** icons beside a floor's name (`data-icon`), footprints and pictures standing on the floor
(`data-footprint`), floor kept clear under words (`data-keep-clear`), packets that keep their size through a camera
move (`data-keep-size`), wires from a block to a flat piece, and a way for `storyreel check` to list the kit's notes
(they are on the world: `notes`; `strict` turns a warning into a refusal). The example: `examples/iso-world`, built and
checked by `test/iso-world.test.mjs` and pinned in `test/golden.json`.
