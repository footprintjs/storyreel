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

**Why.** A finding that says only a time and a scene ("no breath", across the whole film) makes whoever edits the film —
a person or a model — look at the picture to learn what to change. The film already knows: what is drawn where, each
box naming the recipe entry that drew it (`film.regionsAt`, `../regions.mjs`, the boxes the preview studio's hit test
reads), and where a point of the frame is in the recipe's own coordinates (`film.pointAt`). This folder asks those two,
and nothing here keeps a second map of the picture.

## Two checks on drawings

The whiteboard (`../kits/whiteboard`) and the paper (`../kits/paper`, `../film/regions.mjs`) mark the regions that are
ink, not words: `drawing: true` (the board's shapes and eurekas, the paper's marks and card), and `holds: true` for a
drawing that frames words inside it (a board item drawn only with rect, ellipse or bubble; the card). A world's own
region is `sheet: true`, the 1600×900 sheet its items are written on. With those, two checks run (`drawings.mjs`):

| check | finds | the fix |
|---|---|---|
| `words-over-drawing` | 30 % or more of a word's box on a drawing's box (`DRAWINGS.over`), unless the word is the drawing's own or lies wholly inside one that holds words | the smallest move up, down, left or right that clears it on its sheet: `move it 138 up …: set x, y to (300, 422)` |
| `drawing-off-frame` | a quarter or more of a drawing's box outside its sheet (`DRAWINGS.off`); on the page, the frame, while the camera is at rest | the move that brings it in (its box's corner, and the shift of every point), or the size that fits: `shrink it to W×H` |

A box is a drawing's extent, not its ink, so the thresholds leave a grazed corner alone. A kit of your own takes part by
marking its regions the same way (`{box, path, label, drawing: true, holds?: true}`).

| file | one job |
|---|---|
| `places.mjs` | where things are, read through the film's regions: a word's entry, a moment's entry, a sheet, a point in recipe units, the words said in a stretch; `entryAt(recipe, path)` |
| `moves.mjs` | the smallest move that clears a box or brings it in, the size it must shrink to, and the fix said in words |
| `words.mjs` | `where` and `fix` for a word: moved clear of another box, or brought in from the edge |
| `say.mjs` | the fixes about time: a beat keyed on a phrase said there, pacing holds, a drawn part kept together |
| `drawings.mjs` | the two drawing checks |

**A film's words stay on their row.** A path, a label or a word from the film can hold a line break; the review's
`findingsText` makes every line one line (`../oneline.mjs`), so nothing a film draws can start another. A recipe path is
followed through own keys of plain data only (`entryAt`), never used to reach anything else.
