# studio — the preview studio

A local page for directing a film (see the package README, "The preview studio").

| file | one job |
|---|---|
| server.mjs | `startStudio({load, watch, port})`: loopback-only, read-only HTTP; compiles again when a watched file changes; keeps the last good film when a recipe refuses |
| lines.mjs | `jsonLines(text)`: recipe path → line in the file; `valueAt(recipe, path)` |
| page.html · page.css · page.js | the page: picture, timeline, transcript, "what drew this spot", notes |

Laws: it listens on 127.0.0.1 and answers only requests addressed to that name (a page elsewhere
cannot reach it through a name that points here); it only reads (GET) and writes nothing; it never
runs anything from the recipe (paths are looked up, JSON is read, not evaluated). The page is built
with `textContent` only and a CSP of `default-src 'none'` plus its own script and style.

Transcript: every word in `/api/film` carries `spoken`; a silent scene's words are its directions
(`spoken: false`, and the scene carries its `silent` list), drawn dim and slanted, because they are
seen, never said. A storyboard scene `{"id": "open", "silent": [["the door opens", 1.0]]}` shows
*the door opens* in grey italics, and a click still seeks to it.

Example: `node examples/studio.mjs hello` → open the printed address, click the stick figure: it
answers `story.items[0]`, line 7 of `examples/hello/recipe.json`.
