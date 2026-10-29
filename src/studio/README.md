# studio — the preview studio

A local page for directing a film (see the package README, "The preview studio").

| file | one job |
|---|---|
| server.mjs | `startStudio({load, watch, port})`: loopback-only, read-only HTTP; compiles again when a watched file changes; keeps the last good film when a recipe refuses; the gallery's routes; what may ask what (HEAD, Sec-Fetch-Site, the query) |
| tries.mjs | the picks tried (`pickTries`): one compile at a time (409), the last few compiled kept by line and version, the one tried last drawn (410 for any other) |
| refusal.mjs | `Refusal`: a request refused, its words and its HTTP status |
| lines.mjs | a JSON text read where it stands: `jsonSpans(text)` (path → its line and offsets), `jsonLines(text)` (path → line), `spliceJson(text, edits, {beside})` (values set in place, every other byte kept); `valueAt(recipe, path)` |
| gallery.mjs | the gallery's cards (`galleryCards`): a transition of the film's catalog or a word move each; a card's frames as one PNG (`cardFrames`), drawn by the code that draws a film; `boundedCache` for the cards drawn |
| picks.mjs | a pick as one line (`readPick`, `pickLine`), where each kind goes in a recipe (`pickScenes`), the facts a check reads (`lineFacts`), picks put in their places (`putPicks`, a new key `BESIDE` its scene or kit) |
| apply.mjs | the checks, on a footprintjs flowchart with a record: `applyPicks(recipe, lines, {scenes, catalog})` on data, `applyLines(text, …)` on a recipe's JSON text, changing only the values set (`spliceJson`); no file read or written |
| cli.mjs | `storyreel studio`: the studio on the project here (`projectStudio`: its load(), compile(recipe) and what it watches) |
| help.mjs | the usage of `storyreel studio` and `storyreel apply`, text only, so `storyreel --help` loads neither |
| page.html · page.css · page.js | the page: picture, timeline, transcript, "what drew this spot", notes, the gallery, Try, the kept picks |

Laws: it listens on 127.0.0.1 and answers only requests addressed to that name (a page elsewhere
cannot reach it through a name that points here); it only reads (GET; HEAD only for the page's own
files and `/api/audio`, 405 elsewhere) and writes nothing; it never runs anything from the recipe
(paths are looked up, JSON is read, not evaluated). The page is built with `textContent` only and a
CSP of `default-src 'none'` plus its own script and style (and `blob:` images: the frames and the
cards it fetched).
What draws, checks or compiles what a query names — `/api/frame`, `/api/card`, `/api/pick`, `/api/try` —
answers the studio's own page only: a request whose `Sec-Fetch-Site` is anything but `same-origin` or
`none` is refused (403) before anything is drawn (a page on another site can still ask by an image tag,
never reading the answer, and would spend a compile and replace the pick being tried); a browser that
sends no such header is let through. A query is read only when each parameter is given once and the
whole is at most 1024 characters (400, 414). Its scene, kind and name are checked against the film's
scenes, the kinds and the catalog before anything is drawn or compiled; only a card the gallery lists is
drawn, and the cards drawn are held in a cache bounded by count and bytes, each under the film version
it was drawn for (so a card still being drawn during a reload is never shown for the new film). One
compile runs at a time (another Try meanwhile: 409); the last four picks compiled are kept, by line and
version, so a pick tried again is free; the one tried last is the one drawn, and a reload drops them all.
`held()` says what is kept.

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
compiling and answers its line — what Keep copies, and `storyreel apply` writes. A word move goes on the kinetic
world whose words the scene says: the story's (its `scene`), or a world stage's by its world's own `scene` (which need
not be the stage's; a world with none goes by its stage's).

Apply: `storyreel apply` (apply-cli.mjs) checks every line (apply.mjs), then compiles the recipe with them once, as
the tools compile the film (tools.mjs · compileProject): any refusal and nothing is written. The text changes only
where a value is set — `spliceJson` replaces the value's own text, or puts a key not there just after its entry's
`scene` (else `kit`), on a line of its own with its neighbours' indent and line ending, or inline beside it — so a
file written by hand, by prettier, with CRLF or tabs or on one line keeps every other byte. With `next enter iris`,

    {
      "type": "world",
      "scene": "next",
      "world": { "kit": "cartoon", "scene": "next", "words": ["Hello", "there"] }
    }

gains one line, `"enter": "iris",` just under `"scene": "next",` at its indent; with `shop enter torn`, a stage on one
line, `{ "type": "world", "scene": "shop", "enter": "cut", … }`, changes only `"cut"` to `"torn"`.

Example: `node examples/studio.mjs hello` → open the printed address, click the stick figure: it
answers `story.items[0]`, line 7 of `examples/hello/recipe.json`. In a folder made by
`storyreel remake --starter`: `npx storyreel studio`, open the gallery, put the playhead in `scene-03`,
Try `torn` — then Keep, and `npx storyreel apply "scene-03 enter torn"`.
