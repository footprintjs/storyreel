# fix — what a finding is about, and the one change that clears it

Every finding of a review (`review.mjs`) carries two more fields beside its time, scene and words:

- **`where`** — the recipe entry it is about, as the author wrote it: `story.items[1]`, `stages[2].world.items[0]`,
  `stages[0].title`, `card`, `pacing.holds`, `storyboard.scenes[3].differs` — or the storyboard's scene
  (`storyboard.scenes[1]`) when nothing smaller drew it.
- **`fix`** — one concrete change, in that entry's own units: `move it 138 up, clear of "figure" (story.items[0]): set x,
  y to (300, 422)`, `shrink it to 1582×8 (now 2614×14)`, `key a beat on ["farm", "she stops by"] (said at 0:10.0)`,
  `add {"scene": "a", "after": "went out", "seconds": 0.8} to pacing.holds`.

The reply says both on the finding's one line (`… · at story.items[1] · fix: move it …`), and the check's record keeps
them as data (`storyreel log --run N --why fixes`).

**Small whatever the film** (`text.mjs`). `where` is cut to 80 characters, `fix` to 200, and a film's word or label
quoted in them to 40; a line is 300 at most, and its `· at … · fix: …` keeps its room — the words of `what` are cut
first. A film's word is quoted with its quotes escaped and the field mark (" · ") shown as its escape, so nothing a film
draws can stand for a field of the line.

**A fix that can be followed.** A move is tried against every word and drawing up at that moment, and goes on past one
it would land on. A shrink says where the shrunk box goes. A quoted phrase is lengthened until its scene says it once
(the clock's own matching), or the beat names which place (`nth`); a pacing hold is offered only in a pause with no
effect sound in it, at a clause's end before one inside a clause, the picks spread when pauses are equal — and never
after a phrase said twice (a hold has no `nth`). A span's `where` is the entry most of its hits name, so a region that
comes and goes over a word never splits the finding.

**Why.** A finding that says only a time and a scene ("no breath", across the whole film) makes whoever edits the film —
a person or a model — look at the picture to learn what to change. The film already knows: what is drawn where, each
box naming the recipe entry that drew it (`film.regionsAt`, `../regions.mjs`, the boxes the preview studio's hit test
reads), and where a point of the frame is in the recipe's own coordinates (`film.pointAt`). This folder asks those two,
and nothing here keeps a second map of the picture.

## Two checks on drawings

The whiteboard (`../kits/whiteboard`) and the paper (`../kits/paper`, `../film/regions.mjs`) mark the regions that are
ink, not words: `drawing: true` (the board's shapes and eurekas, the paper's marks and card), and `holds`, the boxes of
a drawing that frame words inside them (each rect, ellipse, bubble or tag among a board item's shapes; the card). A world's own
region is `sheet: true`, the 1600×900 sheet its items are written on. With those, two checks run (`drawings.mjs`):

| check | finds | the fix |
|---|---|---|
| `words-over-drawing` | 30 % or more of a word's box on a drawing's box (`DRAWINGS.over`), unless the word is the drawing's own or lies wholly inside one of its rooms (`holds`: a table's cells, a title box, a tag) | the smallest move up, down, left or right that clears it on its sheet without landing on another word or drawing: `move it 138 up …: set x, y to (300, 422)` |
| `drawing-off-frame` | a quarter or more of a drawing's box outside its sheet (`DRAWINGS.off`); on the page, the frame, while the camera is at rest | the move that brings it in (its box's corner, and the shift of every point), or the size that fits and where: `shrink it to W×H …, its box at (x, y)` |

A box is a drawing's extent, not its ink, so the thresholds leave a grazed corner alone. A kit of your own takes part by
marking its regions the same way (`{box, path, label, drawing: true, holds?: [[x0, y0, x1, y1], …]}`).

| file | one job |
|---|---|
| `places.mjs` | where things are, read through the film's regions: a word's entry, a moment's entry, a sheet, a point in recipe units, the words said, where a phrase is said; `entryAt(recipe, path)`; why the regions could not be read (`trouble`: the review's notes) |
| `text.mjs` | how long `where`, `fix`, a quote and a line may be; how a film's word is quoted |
| `moves.mjs` | the smallest move that clears a box or brings it in, the size it must shrink to, and the fix said in words |
| `words.mjs` | `where` and `fix` for a word: moved clear of another box, or brought in from the edge |
| `say.mjs` | the fixes about time: a beat keyed on a phrase said there, pacing holds, a drawn part kept together |
| `drawings.mjs` | the two drawing checks |

**A film's words stay on their row.** A path, a label or a word from the film can hold a line break; the review's
`findingsText` makes every line one line (`../oneline.mjs`), so nothing a film draws can start another. A recipe path is
followed through own keys of plain data only (`entryAt`), never used to reach anything else.
