# whiteboard — the built-in board, drawn by hand

A board on the paper: drawings, handwriting, erasers, a eureka bulb, spotlights. **Why this folder:** the author
writes what the board draws, when and for how long; how a hand draws it (the order of the strokes, the pen's pace and
width, its lifts) is footprint-story's, so a film and a deck draw by the same rules.

| file | one job |
|---|---|
| `index.mjs` | the recipe read (`compileWhiteboard`), the shapes by name (`SHAPES`), where each item is (`placeOf`), the kit |
| `sketch.mjs` | each drawing handed to footprint-story's `hand-sketch` (`planSketches`), drawn in parts when too big (`partsOf`), its ink and the marker's place (`sketchDraw`), its critics' findings in the recipe's words (`sketchFindings`) |
| `board.mjs` | the board's own pictures: surface, shapes as polylines, handwriting, the marker, the eraser, the timeline, a marker line drawn whole (the paper kit's) |

```json
{"story": {"kit": "whiteboard", "items": [
  {"at": ["story", "a shepherd"], "dur": 1.2, "draw": [["figure", 300, 620, 1.1]]},
  {"at": ["story", "a box"], "dur": 0.9, "draw": [["rect", 1240, 430, 240, 280]]}]}}
```

**How a drawing is drawn.** Each `draw` item, and each eureka's bulb, is one `do: 'sketch'` intent (footprint-story ·
planIntents). A polyline that ends where it starts is a closed shape (one stroke round); lines that share a corner
point are drawn on without a lift; the strokes go from the top left in the fewest the corners allow (Euler, Fleury).
`dur` is the plan's seconds, lifts included, so the film's clock is the author's. The ink is each stroke's ring as far
as the pen has come (`strokeOutline(strokeAt(points, now))`, filled by the isometric kit's painter, non-zero), and the
marker is at the plan's own sample: on the ink's end while drawing, in the air between strokes. `size` is the marker's
width (0.25 to 20 px); `seed` names the hand's wobble.

**Its record.** The drawings run again through the intent decider as a chart in `storyreel check`
(`log --run 1 --why duration-<k> --motion story`, k counting the drawings in order). Its critics `pen-lifts`,
`stroke-order` and `hatch-gaps` are wired into the review's `motion` check (on the item, the fix in recipe words;
`accept` keeps one as written), but they check order and lifts only, and today they cannot fire on a board's drawings: footprint-story always draws a board's lines in the fewest strokes, outline first, and a board sends no fills. A `dur` too short is squeezed with no finding yet (a figure at 0.05 s runs about 34× its natural pace of 1.71 s); a pace critic is to come from footprint-story; StoryReel adds no pace rule of its own. The film's record keeps each drawing's strokes, lifts and seconds (`world.story.summary`).
The stroke budget is the isometric world's (`STROKE_BUDGET`: a note from 2,000, refused past 20,000).

**What is not footprint-story's, and why.**

- Words (`write`) are written on left to right by clipping the Caveat line, the marker at the edge: footprint-story
  has no letterforms to plan a pen by (its `write` model takes a letter's pen points; a font's outline would be traced
  as hollow letters).
- The eureka's glow, the spotlight, the eraser: not strokes.
- A drawing too big for one sketch (past 1,024 shapes or 4,096 corners, or a line past 1,024 points) is drawn in
  parts one after another, each its length's share of `dur`; no lift is planned between two parts.
- No boil: a board's marker drawing does not redraw itself while it is held.
