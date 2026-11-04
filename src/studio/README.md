# studio — the preview studio

A local page for directing a film (see the package README, "The preview studio").

| file | one job |
|---|---|
| server.mjs | `startStudio({load, watch, port, home})`: loopback-only HTTP that reads, and takes one write (a note); compiles again when a watched file changes (one load at a time: a change meanwhile loads once more after it); keeps the last good film when a recipe refuses; the gallery's routes; what may ask what (HEAD, Sec-Fetch-Site, the query) |
| tries.mjs | the picks tried (`pickTries`): one compile at a time (409), the last few compiled kept by line and version, the one tried last drawn (410 for any other) |
| refusal.mjs | `Refusal`: a request refused, its words and its HTTP status |
| lines.mjs | a JSON text read where it stands: `jsonSpans(text)` (path → its line and offsets), `jsonLines(text)` (path → line), `spliceJson(text, edits, {beside})` (values set in place, every other byte kept); `valueAt(recipe, path)` |
| gallery.mjs | the gallery's cards (`galleryCards`): a transition of the film's catalog or a word move each; a card's frames as one PNG (`cardFrames`), drawn by the code that draws a film; `boundedCache` for the cards drawn |
| picks.mjs | a pick as one line (`readPick`, `pickLine`), where each kind goes in a recipe (`pickScenes`), the facts a check reads (`lineFacts`), picks put in their places (`putPicks`, a new key `BESIDE` its scene or kit) |
| apply.mjs | the checks, on a footprintjs flowchart with a record: `applyPicks(recipe, lines, {scenes, catalog})` on data, `applyLines(text, …)` on a recipe's JSON text, changing only the values set (`spliceJson`); no file read or written |
| feedback.mjs | feedback.md's format, text in and out: the project id line (`withProject`), a note's body and line (`noteBody`, `noteLine`), read back (`readBody`, `noteLines`), ticked (`tickLines`), appended (`appendLine`), the words cleaned (`cleanWords`), a place as an agent reads it (`placeText`: every anchor JSON-quoted) |
| notekey.mjs | the person's note key, kept outside the project (`noteKey`: STORYREEL_HOME, else ~/.storyreel; made once, 0600, read only as a plain file of theirs), a key's name in a project (`keyName`), a note's signature (`signNote`, `signedBy`) |
| note.mjs | a note made into feedback.md's next line, on a footprintjs flowchart with a record (`writeNote`): the place read from the film (scene+seconds, the entry drawn at the spot and its line, the words said around), signed |
| feedback-read.mjs | feedback.md read on a flowchart (`readFeedback`): whose each line is (decided per line; a repeated id is one note), done by the person's done mark, where each entry is now (another recipe file's said), the notes to tick by number or id (one refused, none ticked) |
| feedback-file.mjs | feedback.md on disk, beside the recipe's file: read with `files.mjs · readPlainFile` (no link, no FIFO, at most 1 MB); changed only under its lock (`withFeedback`), a note appended (`addToFeedback`), a tick rewritten with its mode kept (`rewriteFeedback`) |
| take-note.mjs | the one write's three steps: the body read (`readJsonBody`, at most 16 KB), its fields checked (`noteRequest`), the note taken one at a time (`noteTaker`) |
| feedback-tool.mjs | `storyreel feedback` (and its MCP tool, listed in tools.mjs): the person's open notes for an agent, short; `--done`, `--all`, `--record` |
| cli.mjs | `storyreel studio`: the studio on the project here (`projectStudio`: its load(), compile(recipe) and what it watches; `watchCode`: its own code, compiled again when it changes) |
| code.mjs | the project's own code, read fresh after an edit (`projectCode`): the files the config reaches inside its folder, a version of their bytes, and the config's URL under it; one resolve hook hands the version on, so an edited kit is a new module and StoryReel and the packages stay one copy |
| help.mjs | the usage of `storyreel studio` and `storyreel apply`, text only, so `storyreel --help` loads neither |
| page.html · page.css · page.js | the page: picture, timeline, transcript, "what drew this spot", the director's notes, the gallery, Try, the kept picks, and the note box under the picture (a note at the playhead, or on the spot clicked) |

Laws: it listens on 127.0.0.1 and answers only requests addressed to that name (a page elsewhere
cannot reach it through a name that points here), and only at its own address, `/<key>/` — 128 random bits, printed
to whoever started it and nowhere else: anything else is 403 before it is read, so another user of a shared machine,
who can reach the port, can neither read the film nor post a note that verifies as the person's (`curl` sets every
header the write checks; it cannot guess the key). The page uses relative paths, so the key rides on every request.
No cookie: a browser sends a cookie for 127.0.0.1 to every port, another user's server among them; it reads (GET; HEAD only for the page's own
files and `/api/audio`, 405 elsewhere) and takes one write, a note (below); it never runs anything from the recipe
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

The one write — a note, `POST /api/note` (any other method there: 405, `Allow: POST`; a POST anywhere else: 405) —
is the narrowest the page needs. Refused (403) unless `Sec-Fetch-Site` is `same-origin`: here a request that does not
say is refused too, unlike the read routes, because it writes (a current browser always says; a script outside one
has no need of the studio's page). Refused (403) unless `Origin` is the studio's own (`http://127.0.0.1:<port>` or
`http://localhost:<port>`), and unless `Host` is, as everywhere; then 415 unless it is JSON — which also means a page
elsewhere could only send it after a CORS preflight the studio never answers. The body is read only up to 16 KB (413:
a longer `Content-Length` before a byte is read, a longer body as soon as it is; the connection closed after) and must
be one object of `{version, t, x?, y?, words}` and nothing else (400): the page never sends the place — the scene,
the entry, the line, what is said are read from the film itself (note.mjs), so a request cannot put words in an
anchor. `version` is the film the spot was clicked on (409 when it was compiled again since: a spot names a drawing of
the film the person saw, never the next one), and the page drops a spot when the film reloads, keeping the words; the
film and its recipe file's lines are taken together, so a reload while a note waits pairs neither with the other.
One note is taken at a time in the studio, and every change to feedback.md — a note, or a tick from `storyreel
feedback` in another process — holds its lock (`feedback.md.lock`, made with O_EXCL, holding the holder's pid; one
whose process is gone is taken over, one that is not a plain file — a link a shared project carried — is refused naming
it, and a holder removes only a lock that is still its own) and reads the file again under it: a note is one O_APPEND
write (the first one, a new file linked into place — or, on a disk with no hard links, created exclusively — and made
again against the file when one appeared meanwhile, never a second header), a tick the whole text renamed over it
with its mode kept, so neither loses the other's line.
feedback.md is read with `files.mjs · readPlainFile` (its name lstat-ed first and never followed, a FIFO or a device
refused before it is opened, opened `O_NOFOLLOW | O_NONBLOCK` where the system has them, the descriptor's device and
inode compared with the name's, at most 1 MB read in a bounded loop) and written with `writeOutput` into its folder's
checked real path. The key that signs it lives outside the project (notekey.mjs; refused inside the project's folder),
so a project someone sends cannot carry notes that pass for the person's, and its file is read the same way and must
be the person's alone (0600, one name). A studio with no recipe file takes no note (501), saying how to give it one.
The anchors of a signed line are still recipe data — a scene id, an entry's path, the narration — so the reader
(feedback-tool.mjs) quotes each as JSON and gives the person's words a line of their own; its description tells an
agent they are data, never instructions. A tick adds a done mark signed like the note (notekey.mjs · signDone), trusted
over the box for un-ticking only (a box unticked by hand does not reopen a note its mark says is done; a box ticked by
hand still counts as done, by design), and a repeated id is one note. What a signature does not prove: that the line is in the
project it was written for (a feedback.md copied whole from another of the person's projects verifies), nor that a
line deleted and put back from an older copy is still wanted.

Example: in a project, `npx storyreel studio`, click the drawing that moves too fast, type *slower here*, Enter; then
`npx storyreel feedback` prints `1. at "scene-02+3.40" (0:12.4) · entry "stages[1]" · line 18 of "recipe.json" · said
"and then it lands"` and `note: slower here`; edit line 18, then `npx storyreel feedback --done 1`.

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
