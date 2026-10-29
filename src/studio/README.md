# studio — the preview studio

A local page for directing a film (see the package README, "The preview studio").

| file | one job |
|---|---|
| server.mjs | `startStudio({load, watch, port})`: loopback-only, read-only HTTP; compiles again when a watched file changes; keeps the last good film when a recipe refuses; the gallery's routes and the one pick being tried |
| lines.mjs | `jsonLines(text)`: recipe path → line in the file; `valueAt(recipe, path)` |
| gallery.mjs | the gallery's cards (`galleryCards`): a transition of the film's catalog or a word move each; a card's frames as one PNG (`cardFrames`), drawn by the code that draws a film; `boundedCache` for the cards drawn |
| picks.mjs | a pick as one line (`readPick`, `pickLine`), where each kind goes in a recipe (`pickScenes`), the facts a check reads (`lineFacts`), picks put in their places (`putPicks`) |
| apply.mjs | the checks, on a footprintjs flowchart with a record: `applyPicks(recipe, lines, {scenes, catalog})` on data, `applyLines(text, …)` on a recipe's JSON text, keeping its layout (`jsonLayout`); no file read or written |
| cli.mjs | `storyreel studio`: the studio on the project here (`projectStudio`: its load(), compile(recipe) and what it watches) |
| page.html · page.css · page.js | the page: picture, timeline, transcript, "what drew this spot", notes, the gallery, Try, the kept picks |

Laws: it listens on 127.0.0.1 and answers only requests addressed to that name (a page elsewhere
cannot reach it through a name that points here); it only reads (GET) and writes nothing; it never
runs anything from the recipe (paths are looked up, JSON is read, not evaluated). The page is built
with `textContent` only and a CSP of `default-src 'none'` plus its own script and style (and `blob:`
images: the frames and the cards it fetched).
A query's scene, kind and name are checked against the film's scenes, the kinds and the catalog before
anything is drawn or compiled; only a card the gallery lists is drawn, and the cards drawn are held in
a cache bounded by count and bytes (cleared on every reload). One pick is tried at a time, in memory;
a reload drops it.

Transcript: every word in `/api/film` carries `spoken`; a silent scene's words are its directions
(`spoken: false`, and the scene carries its `silent` list), drawn dim and slanted, because they are
seen, never said. A storyboard scene `{"id": "open", "silent": [["the door opens", 1.0]]}` shows
*the door opens* in grey italics, and a click still seeks to it.

Transitions: the **Transitions** link (`/api/transitions`) shows the collection a shot can enter with
(`transitions.mjs`), a row each, as a few moments of picture A becoming picture B — the built-in ones and,
when `load()` returns the film's `kits`, their own. Pick one by name in a stage's `enter`.

Gallery: `/api/gallery` lists the cards (`{kind: 'enter' | 'move', name, about, seconds, frames, columns, fps,
width, height}`) and the scenes that take each kind (`takes`); `/api/card?kind&name` is a card's frames, one PNG,
in rows of `columns`; the page steps through them. `about` is what the data says (a transition's family and
seconds, a move's feel and seconds): no card says more than the library knows. `/api/try?scene&kind&name`
compiles the film from a copy of the recipe with the pick (`load()`'s `compile`) and answers `{key, line, from,
start, end, …}`; `/api/frame?…&try=key` draws that copy (410 once it is gone). `/api/pick` checks a pick without
compiling and answers its line — what Keep copies, and `storyreel apply` writes.

Example: `node examples/studio.mjs hello` → open the printed address, click the stick figure: it
answers `story.items[0]`, line 7 of `examples/hello/recipe.json`. In a folder made by
`storyreel remake --starter`: `npx storyreel studio`, open the gallery, put the playhead in `scene-03`,
Try `torn` — then Keep, and `npx storyreel apply "scene-03 enter torn"`.
