# Changelog

## Unreleased

- **One script: moments and speakers written in the narration.** A beat keyed to a phrase breaks when its line is
  reworded (the phrase is no longer said, or is said twice), and a line changed meant editing it twice: in the
  storyboard, and in the voice step's own list of who says what. Now the narration carries marks that are never spoken
  and never shown: `{name}` is a MOMENT — when the scene's next spoken word starts (with none after it, when its last
  word ends) — and `{@who}` is the SPEAKER of the quoted line right after it (`{@mom}"What are you two up to?"`).
  `"Ten ones {dots} make a ten {hop}."` is said, voiced and captioned as "Ten ones make a ten."; a beat names a moment
  as it names a phrase (`["today", "{dots}"]`, `["today", "{hop}", 0.2]`, `{scene, phrase: "{dots}", plus}`), a pacing
  hold puts its silence in the pause at the mark (`{scene, after: "{dots}"}`), and a guess after one waits there — and
  a rewording keeps each on its word. A moment is one time, so `nth` and `edge` on one refuse, naming the fix. A
  speaker tag moves no mouth by itself: the voice step writes each word's `speaker` from the lines, and the clock's
  `speaking`, `turns` and `gaze` (and so the mouths) read those.
- **`script.mjs`, the one owner of the grammar** (`footprint-storyreel/script`, and the main entry): `said(narration)`
  (the marks out, the white space they leave tidied — between marks and around quotes too — so no two words are ever
  glued), `momentsOf` (`[{name, offset}]`: `offset` where in `said` the next word starts; `at` stays seconds, as on the
  clock), `linesOf` (`[{by, say, offset}]`), `sceneScript(scene)` and `momentOf(phrase)`. Reading is linear in the
  narration's length. Every reader of a scene's words reads what is said — `spokenText`, `sceneText`, `evenTimings`,
  the number slots, the captions, the studio — so no voice, caption or clock sees a mark. The clock finds a moment by
  the letters said before it (a number slot counted as the voice says it), and gains `moments(scene)`: `[{name, t}]`.
  Refusals name the scene, the mark and the fix, quoting the narration as JSON (no control character or line break
  reaches the terminal as it is, and a long mark or name is cut): braces holding anything else, a brace that opens or
  closes no mark, a name written twice in a scene (both places named), a mark inside a word, a speaker tag with no
  quoted line after it (or one that never closes, or another speaker inside it), a line in `'…'` or `‘…’` that an
  apostrophe could end at two places (write it in `"…"`), a phrase that is a mark with other words (`"a {ten}"`), a
  mark in a silent scene's directions, a moment inside a number slot (one before a slot's symbol, `{x} $5`, is before
  its first word: it is fine), and one the timings put inside a word.
- **`speechIndex(scene, timing)` gains `moments`** (each moment's time and the pause at it, on the scene's clock) **and
  can now refuse**: a moment the timings put inside one word.
- **`storyreel anchors` knows moments:** one its scene does not have is "not said", with the scene's moments listed; a
  speaker tag or a malformed mark named as an anchor says the clock's own reason; a moment is never said more than
  once; one named with `nth` or `edge` is noted (`problem: 'moment'`) and stands at the moment. `phrasesIn` reads
  moments from a recipe as it reads phrases.
- **`storyreel script`: the film's script as JSON, for a voice step in any language** — each spoken scene, one a line:
  `{id, speaker?, said, spoken?, lines, moments}`; a line carries `spoken` too where it holds a number slot (what the
  voice says), and U+2028, U+2029 and U+0085 are written as escapes, so a reader that splits lines at them (Python's
  `splitlines()`) still reads one scene a line. A silent scene is left out. Over MCP too (nine tools).
  `footprint-storyreel/tools` · `script`.
- **The timeline speaks the still tool's language.** `storyreel timeline --scene X` counted its times from the start
  of its window, which opens `handles` seconds (1.5) before the scene, while `still --at X+seconds` counts from the
  scene's own start: every time copied from the timeline landed 1.5 s late, and an agent did the subtraction by hand.
  Now a scene's timeline prints each time as `scene+seconds` from the start of the scene it falls in, the film clock
  beside it (`two+2.02 (0:07.3)  "{turn}" → story.beats[2]`); a line in the handles counts from its own scene, the
  one before or after, so no time is negative and none needs a new form. A window's (`--from`, `--to`) and the whole
  film's are seconds on the film clock (a window's counted from its own start before). The header says what the times
  count from. Whatever the timeline prints goes to `still --at` and `strip --at` as written, and `--at` takes m:ss too
  (`0:07.3`, as the review prints its times). The timeline's help lists `--from` and `--to` (MCP takes them too). In
  code: `filmTimeline(film, {from, to})` (`footprint-storyreel/render`) gives the rows on the film clock, exactly
  (`partTimeline` keeps the stretch's own clock), and `timelineText(rows, {time})` says each time your own way.
- **A moment by what is said.** `still --at` and `strip --at` take `scene:phrase` (`two:a second scene`) and
  `scene:{moment}` (`today:{hop}`, a moment written in the narration), with `+seconds` after either
  (`today:{hop}+0.5`): found on the film's clock as a recipe's beat is, with no time to work out first, and labelled
  on the picture as written. What names no one place refuses, saying why and each place as `scene+seconds`: a phrase
  not said (with the nearest words said), one said more than once (each place, and words said only there, as
  `storyreel anchors` suggests them), a moment the scene does not have (with the ones it has), braces that name no
  moment (the clock's own reason). `--at` is comma-separated, so a phrase's own commas are left out (words match
  whatever the punctuation). The lookup reads the clock's places, so a still adds nothing to the film's beats.
  `scene+seconds` and plain seconds read exactly as before.
- **Fix: a hold not said, with no nearest words, stands in after its scene's last word** (`storyreel anchors`): it
  stood in by the last word's text, which names the first place that word is said — so the report's other times moved
  by the hold. Now it is named by words said only there (`exactPhrases`), or left out when none are.
- **Fix: a still of many moments is written.** A still's file is named after its moments, and 30 short ones
  (`one+1.10,…`) made a name longer than the 255 bytes a file name holds, so the still failed (`ENAMETOOLONG`). A name
  past 100 characters is now cut and ends in a hash of the whole (a strip's and a sheet's too); a shorter one is as it was.
- **Films without marks do not change:** every reader of their words gives what 0.20.1 gave — the voiced cut's holds
  (`planHolds`) too — pinned by hash from 0.20.1 itself (`test/unmarked.mjs`), beside the pixel pins. Phrases work
  exactly as before.
- **Breaking:** braces in a narration are marks now. A narration with anything else in braces (`"we write {a: 1}"`), or
  a lone `{` or `}`, refuses, naming the scene and the fix: write the words a voice says. So does a mark-shaped `{…}` in
  a silent scene's direction, and a beat's phrase with a brace that is not one moment alone. A beat whose phrase is
  exactly a mark (`"{dots}"`) names a moment, no longer the word in it.
- **Breaking:** `storyreel timeline`'s times (above): a scene's are `scene+seconds (m:ss.t)`, a window's are on the film
  clock, and the header says so (`(times: scene+seconds from that scene's start, then the film clock)`, `(times:
  seconds from the film's start)`). A script that read the times as counted from the window's start reads them anew.

## 0.20.1 — anchors reads the holds on the film's clock

- **`storyreel anchors` reads the pacing's holds on the film's clock too:** a hold said more than once now gets its
  fixes (words added before it, so its pause stays where it is) and its time is the paced film's; in 0.20.0 a hold's
  lines showed the time before pacing and no fixes.

## 0.20.0 — anchors: every phrase checked at once; sheets and a copy to share

- **`storyreel anchors`: every phrase the film is keyed to, checked in one pass.** An edit to the narration leaves
  beats on words no longer said — the compile stops at the first, so they were found one render at a time — and on
  words now said twice, where the drawing quietly lands at the first place. The tool checks the recipe's beats and the
  pacing's holds at once and says, for each, where it is named and what to write instead: not said (the nearest words
  that are), said more than once (words said only at each place, keeping the beat's time: added after a beat's phrase,
  before a pause's), an nth past the last place, an unknown scene. Over MCP too. In code, `compileFilm({anchors:
  'note'})` notes each in `film.anchors` instead of stopping (a missing phrase stands at the nearest words said), and
  the clock gains `places(scene, phrase)`: every place a phrase is said. Only the recipe's own phrases are noted (one a
  kit builds for itself is read as ever, so a kit probing `nth` until the clock refuses still stops); a compile that
  stops anyway carries what it noted on `error.anchors`, and the tool then reads the rest from the recipe itself
  (`phrasesIn`, now the one reader of a recipe's phrases by their shape: the music's floors use it too). A pause (a
  hold, a guess) is timed by its end, and its fixes keep the end. A voiced film with a silent scene is checked as it is
  paced. `readInputs` (`footprint-storyreel/tools`) reads a config without timing it; a tool says how it loads with
  `load: 'inputs' | 'config'` (was `compile: false`). The anchors decide no pixel (`NOT_DRAWING`).
- **`storyreel sheet`: the film at a glance, for a reviewer.** A frame every 4 s (`--every`), 20 to a sheet (`--per`),
  each labelled with its time and scene, as PNGs — the whole film, its scenes, or a window. Over MCP every sheet comes
  back as a picture (up to `MAX_PICTURES`, 6), and the server's instructions name `anchors` and `sheet`.
- **`storyreel share <video>`: a copy to send to a person.** No project needed: `<name>.share.mp4` (854 wide, H.264 and
  AAC, its index first) and `<name>.poster.jpg` beside the film or in `--out`; `shareCopy` in
  `footprint-storyreel/tools`. FFmpeg writes them in a scratch folder of their own and each is moved onto its place
  whole; a run FFmpeg did not finish (a status, a signal) is never moved; a folder at either name refuses before
  anything is made; the film is read with the finished-file probe (`ffmpegProbe`); a flag given no value refuses.
- **The focus strategy `circle`:** a teacher's marker loop round the named thing as the voice names it, drawn in
  0.45 s at each key and gone at `"wide"`; `["camera", "circle"]` frames and circles. A focus strategy's view gains
  `on`, `thing` (the key's box, not eased) and `since` (seconds since the key).
- **The review skill** checks the phrases after an edit to the words, and links `showing.md`: pictures before videos,
  one page a person opens on a phone, and a review by several viewers (a child, a parent, a teacher, an animator, a
  historian) merged into one list. It stays inside the agent-cost baseline (6 566 bytes of 6 046 + 10 %).
- **Breaking:** a review tool says how it loads with `load: 'inputs' | 'config'`; the `compile: false` it had is gone
  (`TOOLS.changes.load` is `'inputs'`). A focus strategy of your own is shown a view with three more fields (`on`,
  `thing`, `since`); nothing it read before changed.

## 0.19.0 — the chat edit loop: see only what changed

- **The chat edit loop: see an edit before the full render.** `storyreel changes` plans the full render's pieces and
  compares each key with the cache that render keeps, drawing nothing: one line per changed stretch with the reason a
  render's report gives, then the count —
  `2:37–3:08 left + right · its recipe entries changed, beats moved` / `7 of 41 pieces changed (0:30 of 3:08)` (0.5 s
  in the bench: a silent three-minute film after a recipe edit; a voiced film paces a copy of its voice first). A piece
  kept where an earlier scene's growth moved it is spot-checked now, as the render checks it, so a kit that animates on
  the film's clock is listed ("it moved, and its frames moved with the film's clock"); so is a kept piece checked by
  fewer frames than asked. What the keys cannot see (a kit with no `sources`) closes the count after `note:`, as a
  render's line ends — only the full render's spot check catches it. `storyreel changes --render` draws only those
  pieces, into the cache (the 0.18 store and spot-check laws unchanged), and writes `<out>/changes/review.mp4`: the
  changed stretches back to back, each with 1 s of the film either side (`--handles`, from the cache), labelled with its
  time, the film's voice under it (no clip when every piece changed: it would be the film). The full render that follows
  draws nothing they drew. The MCP server serves `changes` too.
- **`previewChanges(film, {render, handles, clip})`** is the same in code, on makeFilm's own options. A film is made
  ready for it as makeFilm makes it — the cast, the inputs' checks, the out folder, the voice paced in a copy of its own,
  the compile, the plan — one way for both (the internal `prepare.mjs`), so its keys are the full render's. A film
  fitted to a song (`music`) is refused: the fit moves its scenes, and a preview does not run it.
- **A project's config names its full render:** `render` and `code`, its video in `out` (`film.mp4`), and the rest of
  makeFilm's own options it gives (`music`, `check`, `claims`, …). `fullRender(project)` (`footprint-storyreel/tools`)
  is that render's makeFilm options, so a project's render script is `makeFilm(fullRender(await loadInputs(flags)))`;
  `loadInputs` reads the config without compiling the film. The tools now read a config's `strategies` and
  `reducedMotion` too, and time a film with no voice by what is said — the cast's names in it (a `{{role}}` in the
  narration refused the tools before).
- **`storyreel part --from 0:12 --to 0:18`**: a window of the film clock (seconds or m:ss) instead of scenes, with the
  same handles — "frames N–M".
- The segment cache: `folderStore` gains `kept(key)` (a kept piece's manifest from its shape and size, its video unread),
  and `segmentedVideo` gains `why(job, piece)` (why `one` would draw it, read before anything is drawn), `notes(job)`
  and `cache`; `one` and `why` share one spot check.
- `bench/changes.mjs` measures the loop on a three-minute film; the benches' film moved to `bench/counting-film.mjs`.
  The agent-cost baseline grows by the review skill's chat edit loop (5123 → 6046 bytes) and takes the cartoon skill's
  current size (9869 bytes).
- **A release that changes no code a kit uses keeps that kit's pieces.** A kit file that imports `footprint-storyreel` or
  a subpath is keyed by the StoryReel modules it reaches, read by content through StoryReel's exports (and the packages
  they import that draw, by version), no longer by StoryReel's version; another package is still keyed by its version.
  The first render after upgrading to this release redraws once, because the key changes from version to content.
- **Breaking:** an MCP tool call can no longer pass `config` or `cwd` (they are fixed when the server starts, by
  `storyreel mcp --config … --cwd …`); `storyreel changes` compares with the full render the project's config names,
  so a project's render script should be `makeFilm(fullRender(await loadInputs(flags)))`; and the first render after
  upgrading redraws once, because a kit that imports StoryReel is now keyed by the content of the code it reaches, not
  by StoryReel's version.

### Security

- **The MCP server's project is fixed when it starts.** A tool call could name a config (a module the server imports
  and runs) or a folder to work in. Now `config`, `cwd` (the folder each call runs in) and the film's own flags are set
  only by `storyreel mcp --config … --cwd …`; a call that passes one, an argument its tool does not take, or a value
  starting with `--` is refused before anything runs. A still's or a strip's picture comes back on a channel of its
  own, never read out of the text: a moment `one+2+<a line naming another .png>` was taken as `one+2`, and that other
  file came back as the picture. A moment is now exactly `scene+seconds`, and a still or a strip is 100–4000 px wide (a
  still holds at most 30 moments). A malformed message, an id that is not a string or a number, or a value the command
  line cannot take (a NUL byte) is answered as an error and no longer stops the server.

## 0.18.0 — quick edits by default, a thought cloud

- **A thought cloud: a world shown as a memory or a daydream.** `"frame": "thought"` on the story or on a world stage
  draws the world inside a cartoon thought cloud: scalloped, inked in the theme's ink on its card, with a soft shadow,
  and a trail of three little circles toward a corner (no thinker: remembering is the cloud). The world is drawn at the
  cloud's scale (`size`, 0.5–0.9, 0.8 by default), so the cloud is a window onto all of it but its corners. As the shot
  starts, the trail pops up from the corner, one circle after another with a small overshoot, and the cloud puffs open
  out of it. `corner`, `size`, `seed` (the scallops), `color` and `ink` set it, and a bad one refuses, naming the fix.
  `backdrop` darkens the ground round the cloud so the thought stands out: a hex colour (flat), or `{color, vignette}`
  (lighter near the cloud, darker at the edges). It darkens in as the trail rises, and `cloudBurst` clears it on its
  pop (0.3 s, eased out), so nothing dark lingers on the next shot.
  A paper stage, and the story of a film with a `pushIn`, refuse a frame; so does `frame` written inside a stage's
  `world`. The world's regions follow it into the cloud. The opening is a change of picture: pushes and camera moves take
  turns with it, the world is not on screen until the cloud starts to open, and a `match`, `through` or `morph` cannot go
  to a named thing in a world in a cloud.
- **`cloudBurst`: back to now.** A new transition in the dissolve family: the cloud swells a little and the memory pales
  into the cloud's paper, then it pops into puffs that drift out and shrink away. Nothing of the next shot shows before
  the pop: the old shot stays whole round the cloud. After it, the next shot is uncovered where the puffs part and fades
  up round the cloud. Out of a thought it pops that very cloud: the settings the recipe leaves out are the frame's, and
  one it gives must agree; over a plain shot it cuts the same cloud from the picture. The pop keeps `principles.mjs`'s
  `BURSTS.pop` timing at its default 1 s (a longer change stretches it), and the cloud and its puffs are seeded. 1 s,
  sound `whoosh`.
- **`envelopeShare(age, shape)`** (`footprint-storyreel/principles`): how much of a one-shot event has come by `age`, its
  envelope added up as a share of all of it: how far a thing the event pushed has gone (cloudBurst's puffs).
- **A transition's sound can hit on its moment.** `hitAt` (0 to below 1) moves a transition's sound from the change's
  first moment to its moment: the e its draw reaches it at (`cloudBurst`'s pop, 0.3). The entrance places it in time
  through its ease, so an eased change still sounds on its moment. A kit's transition may say it too; it is 0 by
  default, so every other transition sounds where it did.

- **Every render is drawn in pieces kept beside the video, by default.** `renderFilm` and `makeFilm` without `video`
  keep the picture in `<out folder>/.storyreel/segments/<format>-<W>x<H>-<quality>` and redraw only the pieces an edit
  reached. `whole: true` draws every frame in one pass (to debug the cache); a part or an intro is drawn whole.
  `segments: {dir, cap, chunkSeconds, minSeconds, margin, parallel, samples, force, code, kitsCode}` sets the cache.
  - The cache is held to 4 GB (`cap`): after each render the pieces used longest ago go first, never one that render
    used or one used in the last ten minutes.
  - `result.video.line` (and `making-of.json` → `picture.line`) says it in one line: `picture: 3 of 41 pieces drawn
    (title: shot code changed; forward 12–18 s: words changed), 38 reused`. Every piece's reason is in
    `picture.segments[i].why`.
- **Pieces, not shots.** A row of pictures is cut where a scene or a sentence starts and every 6 s from there
  (`chunkSeconds`), so a re-voiced word redraws its sentence from there on; the sentences and scenes after it move
  whole and are reused. A key is on the piece's own clock: a beat, a word, a caption, a note or a camera move near it
  (3 s, `margin`) counts exactly; one farther off counts only by the side it is on. A piece inside a camera freeze or
  speed ramp is keyed by the moments it shows.
- **Only the code that paints is in a key.** A key holds StoryReel's drawing fingerprint (the painter, the film, the
  layout and what they import; `footprint-storyreel/segments` · `drawingCode`) instead of every StoryReel file, and a
  transition (`cloudBurst` too), the steps track or a thought cloud only in the pieces that draw it. A release that changes sounds, reviews, the command
  line or a transition the film never plays keeps the cache. An approval still locks all of StoryReel.
- **The stamp is burned at the join**, from a picture the painter drew (FFmpeg's `overlay`, not `drawtext`): a new
  label costs one re-encode, never a redraw. A render with no stamp joins its pieces by copying, as before.
- **A kit says where its code lives:** `sources: {entry: spec => [files], shared?, transition?}`. A piece is then keyed
  by the code of the entries it draws, so editing one shot redraws only the pieces that show it. The cartoon and
  whiteboard kits declare theirs. A kit without `sources` is keyed by `makeFilm`'s `code` where it draws.
- **Focus, emphasis and an example scene's label are in the keys** of the pieces they reach. Before, a change to
  `recipe.focus` or `recipe.emphasis` was caught only by the spot check. So is the arriving row a blurred frame just
  before an entrance draws.
- **No two pieces share a file, and the join uses what was checked.** Two pieces of one film whose keys would match
  (two quiet stretches of a long scene) are told apart by their place. Each piece is held in the render's own working
  folder (a hard link, or a copy) when it is checked or drawn, so nothing put later changes what is joined.
- **Code changed after a render started is never kept:** when a file a key reads changed on disk after the process
  started (the code it draws with is older than its key), the pieces are drawn and not kept, and the line says so.
- **Keys also hold:** a focus or emphasis strategy of your own (its function's text); a crop's keys (portrait and
  vertical); a director's push through its ease-out; both rows of an entrance a replayed moment draws; the recalls at
  full size. With `posterFrame: false` the spot check paints frame 0 as the video shows it. A piece file that cannot be
  read is drawn again rather than failing the render. What weakens a render's keys is said in the line, not only in
  `note`: a kit with no `sources`, code it loads at run time, code changed after the start.
- **The cache trusts nothing it reads back:** hex keys name the files, a link is never read, a manifest must have a
  piece's shape for its key, and the video must be the bytes it recorded (size and SHA-256). A key also holds the
  FFmpeg build that encodes it: pieces are joined by copying, and an MP4 keeps one set of H.264 parameters, so a piece
  another build encoded is drawn again rather than joined.
- **A code fingerprint follows an installed package's own imports** when it reads a file inside that package (StoryReel's
  own modules, as npm installs them, and a kit's `sources` that name one). An import from your code into
  `node_modules` is still that package's version, never followed.
- **Pieces are drawn a fair share of the cores at a time** (`parallel`: the cores less one, at most 6; it was 2). The
  drawing is one thread, so this overlaps encoding with drawing.
- The StoryReel skill gains a four-line edit loop (part first, a full render redraws only what changed, keep the
  stamp's label steady, `whole: true` only to debug): its agent-cost baseline is re-recorded for that page alone
  (3821 → 4483 B, about 165 tokens more); every other row keeps its baseline.
- **Breaking:** `renderFilm` and `makeFilm` without `video` now draw in pieces kept beside the video (`whole: true`
  draws every frame in one pass); `segmentedVideo`'s `samples` is 1–60 (0, no spot check, is refused); its `recipe` is
  optional (the film's own, `film.recipe`); `code` left out now means each kit's `sources` (`code: null` is still no
  code). `ffmpegJoin().join` takes `{stamp}` and the strategy's `join` is async. A segment key from 0.17 never matches
  (a first render draws everything once).

## 0.17.0 — a convincing tear, trimmed sounds, a steps track

- **`torn` is a slow peel, rebuilt** (it was a quick tear, then a drag). A rip runs across the old picture at a seeded,
  uneven pace: slow to start, catching in small stutters. Behind it the torn flap peels up, still showing the old
  picture as it lifts, then curls over to show the paper's back, and casts a soft shadow. The new picture is uncovered
  right behind the curl; the old one is gone there, never left visible beside a line. The torn edge is two-tone paper:
  the surface, then a white fibrous core with stray fibres. At the end the curl is carried off and the new picture
  settles. 3.2 s by default.
  - **Breaking:** `direction` is now the way the rip travels (`right`, from the left edge, is the default), no longer
    the edge a sheet is dragged toward. `tear` is gone: there is no separate drag phase. `drift` (px, default 0) brings
    the new picture in with the tear. The default sound is `crumble`; the default ease is `linear` (the pace is the
    rip's own). At 3.2 s it starts 2.4 s before its shot's first word (three quarters of its length, like every
    entrance), so a push, camera move or guess close to that cut may need room.
- **A change of picture may take up to 4 s** (was 3): one range for an entrance, a move entrance and a kit's transition.
- **Found sounds can be trimmed:** `from` / `to`, seconds into the recording, on a found sound event or an entrance's
  sound. A span outside the recording refuses when the film is built, naming its length. The mix cuts the span (with
  10 ms fades) and turns it down by its own peak, and the listening check measures what plays.
- **A steps track: a process walked backward, then played forward.** `recipe.stepsTrack` puts a slim band over every
  shot: labelled stations, a playhead that hops to each as the voice names it (⏪ walking back, ▶ forward), the current
  station lit, the ones behind ticked, the next a "?" until reached. A `flip` turns the finished rewind into play
  through its own forward station list; `rewind` replays the shot's picture under the teaser's rewind look as the
  track enters. Labels are the film's own words (1–18 characters; empty or longer refuses, naming the fix). Drawn
  outside a film through `footprint-storyreel/kits/paper/steps-track` (typed).
- The teaser's rewind look is one piece now, `footprint-storyreel/kits/paper` · `drawRewind` and `rewindAt`: the teaser
  and the steps track draw the same rewind (the teaser's pixels are unchanged).

## 0.16.0 — 2026-10-20

- **Found sounds: recorded effects, fetched once.** `npx storyreel sounds search "page turn"` lists Openverse's
  openly licensed sounds, one line each (id · title · licence · seconds · source). `npx storyreel sounds add <id> --as
  page-turn` fetches one once into the film's `sounds/` folder and records it in `sounds/sounds.json`: source, id,
  creator, licence, attribution, sha256, size. `sounds list` says what is there and what to fix.
  - A sound event names one as `{time, type: 'found', name, gain?}`, and so can an entrance's `sound`. The render
    mixes it from its file, offline, the way it mixes the music, and the effects-vs-voice check covers it.
  - The licence gate is one table (`footprint-storyreel/sounds` · `LICENCES`). CC0 and CC BY are used. CC BY-SA needs
    `"foundSounds": {"allowShareAlike": true}`, since it puts the whole film under CC BY-SA. NC, ND and unknown
    licences are refused, saying why. The gate reads each sound's own record at every use.
  - A missing or changed file refuses, naming the `sounds add` command that fixes it. The found sounds' hashes are
    part of the film's inputs, so an approval locks them.
  - Each sound's attribution goes into CREDITS.txt by itself, with its licence's deed and, for CC BY and CC BY-SA,
    "adapted: mixed into this film" plus a link to the work.
  - Hardening against what Openverse sends:
    - every text is made plain and capped;
    - https only, with redirects re-checked;
    - no local or private addresses;
    - a 20 MB cap and a 30 s timeout;
    - the stored file is always `<name>.<ext>`;
    - ffprobe must find audio, and FFmpeg and ffprobe read a found sound only as a local audio file;
    - a 429 stops, saying when to retry.
  - The Openverse adapter sits behind its own subpath (`footprint-storyreel/sounds/openverse`), so nothing that draws
    or renders a film imports network code. `OPENVERSE_TOKEN`, when set, goes to Openverse only.
- **The suite's text checks hold on any Linux runner.** Where a theme's named fonts are missing, the canvas falls back
  to a default face it picks by scanning the system's fonts, and that pick changed between two GitHub ubuntu-24.04
  images, moving the word gaps four reading and claims tests measure. `test/fonts.mjs`, loaded before every test
  file, registers DejaVu Sans (regular, bold) at Debian/Ubuntu's path under the generic families, the face those
  tests were calibrated on there. Nothing changes where that path is absent (macOS, Windows), nor in the package.

- **Eight paper transitions, built in.** `torn`, `eraser`, `inkBleed`, `ringIris`, `glassSheet`, `curl`, `fold` and
  `morph` join the collection (`footprint-storyreel/transitions` · `TRANSITIONS`), each in its family, named in a
  recipe like any other: `"enter": "torn"` leaves the old page behind (a recap torn away to reveal the new episode's
  title): a ragged tear runs across the old picture with the new one showing along it, then the torn sheet is dragged
  off toward `direction`, tilted and lifted, carrying the old picture whole (`tear` sets the share of the change the
  tear takes). They draw paper and ink in the film's theme's colours; a colour they add (the ring, the outline, the ink) defaults to the
  theme's and a recipe may name another. A torn edge or an ink blot is a seeded shape (`seed`), never chance, so the
  same frame is the same pixels; each starts on the old picture and ends on the new one exactly. The README's table
  gains a "use it for" column: what each transition means, for every transition, held to the catalog by a test.
  Settings gain two kinds, for a kit's transitions too: `{box: true, default: [x0, y0, x1, y1]}` and a colour whose
  default is `null` (the draw picks it). `node examples/transitions.mjs --names torn,inkBleed` draws a sheet of just
  the ones named. A kit that brought its own transition under one of these names must drop it (a kit may not reuse a
  built-in name).
- **One hex parser** (`src/colour.mjs`): `pen.mjs · rgba` and `mixColor` read `#rgb` too, and the `dim` focus veils in a
  theme's 8-digit `bg` (it fell back to the paper theme's).

- **A failed render keeps its making-of record.** `makeFilm` used to write `making-of.json` only after a run
  finished, so the run most worth reading left nothing behind. A run that fails now writes the record it got to as
  `making-of.failed.json` — marked `failed: {error}` with the error's text, beside what was known (the inputs once
  compiled, the voice check, the pacing, the footprintjs narrative of the stages that ran, the compile record) — and
  then throws the original error unchanged. A finished render's `making-of.json` in that folder is never replaced. A
  refusal inside the run (`claims: 'refuse'`, a voice refused) is a failed run too, so its out folder now holds
  `making-of.failed.json` where it used to be empty; nothing is drawn. `approveFilm` refuses a failed record. A
  finished run writes exactly the bytes it wrote before.

## 0.15.0 — perspective: a room with depth

- **`footprint-storyreel/perspective`: the layout artist's grid.** One horizon and one vanishing point for a scene;
  `at(x, depth, height)` places a thing by where it stands on the floor and returns where it lands on the frame and
  how small it looks; `along` spaces things on a line running into the room (a rail of dresses seen at
  three-quarters); `backToFront` gives the painter's order; `toward` gives a floor line to the vanishing point;
  `parallax` moves far things less when the camera pans. Bad input refuses, saying what it takes. A new
  `storyreel-cartoon` skill page, `perspective.md`, teaches agents the rules with a worked example.

## 0.14.0 — the tools cost an agent fewer tokens; every refusal names its fix

- **Token cost is a measured number, guarded in CI.** `node scripts/agent-cost.mjs` prints what an agent reads and
  writes to make the main path's farm film: the skills' descriptions (in every session), the three main-path skill
  pages, the default output of `timeline`, `review`, `part --scene farm` and `still --at farm+12`, and the storyboard
  and recipe it writes — bytes, and tokens as characters / 4. `test/agent-cost.test.mjs` fails when a number grows
  more than 10 % over `test/agent-cost.baseline.json`. **Baseline set in this release** (a deliberate act: say so here
  each time it moves): 288 tokens in every session, 4862 read, 147 written — from 324, 5811 and 147 on 0.13.1:

  | what | 0.13.1 | now |
  |---|---|---|
  | the skills' descriptions | 1299 B | 1156 B |
  | `storyreel/SKILL.md` | 5414 B | 3821 B |
  | `storyreel-cartoon/SKILL.md` | 10027 B | 9833 B (and four gaps documented) |
  | `storyreel-review/SKILL.md` | 6436 B | 5123 B |
  | `storyreel review` | 491 B | 140 B |
  | `storyreel part --scene farm` | 561 B | 210 B |
- **Short by default, `--full` for everything.** `review` and `part` print the counts, the verdicts that did not pass
  with why, and the first 5 findings (errors before advice), the rest counted (`footprint-storyreel/review` ·
  `reviewSummary`); `--full` (MCP: `full: "true"`) prints every finding and every verdict's why, as before.
- **Every command has `--help`** (`still`, `part`, `review`, `timeline`, `strip`, `beats`, `mcp`; `breakdown` had it),
  and `storyreel help <command>` too.
- **Every refusal names its fix.** A scan of the 697 throws in `src/` (`test/refusals.mjs`) fails on a message that says
  only what is wrong; 52 were rewritten — an unknown scene, shape, ink, eraser or icon now lists the ones there are, an
  unsupported key lists the keys taken, a missing file says what to give — and 11 lines are exempt, each saying why on
  the line (`// refusal: …`: 5 internal invariants, 6 whose fix another message gives, such as FFmpeg's own error). `pacing` without `sceneTail` said "sceneTail must be between 0.3 and 3": it now says the key
  is missing and gives an example (likewise `holds`). A render with a `layout` and `width`/`height` names
  `layout.scale` (`2/3` makes 1280×720, a draft).
- **A film with no voice is paced from its config.** The CLI (and MCP) tools ignored `pacing` unless a voice folder
  was named; they now pace the even timings with it, as `makeFilm` paces the timings it is given.
- **"Too much to read" counts as a reader does.** It counted every separate text draw as a word, so code coloured
  token by token, "=" and "(" included, counted several times over. It now joins the draws into lines as the claims
  check does (`drawnLines`), counts only runs with a letter or a digit, leaves out code drawn in `code()` (studied, not
  read at once — the reading-time check leaves it out too), counts the captions, says so, and quotes the words it
  counted (truncated).
- **A fact's source may be a URL followed by notes** (`"https://x.org/t table 2"`): the leading URL is the source. It
  was read as unverified.
- **The skills document** where a shot's `intent` goes (on the stage beside `world`, one sentence of at most 140
  characters), the offset form `[scene, phrase, seconds]`, a world's `overlay` held layer (kits.md), the draft size
  of a captioned render (`layout.scale: 2/3`), `--full` and `--help`.

## 0.13.1 — a review no longer holds every frame it reads

- **A review no longer holds every frame it reads.** `review` read each moment on a new canvas: a native picture
  (5.8 MB at 1600×900, 8.3 MB at 1080p, and a blurred transition's scratch beside it) that only a garbage collection
  and a turn of the event loop give back — and a review reads hundreds of moments in one go, so every one was held
  until it ended. It now reads every moment on one canvas per size, reset to new before each frame (`ctx.reset()`), so a
  frame is read exactly as before (a test pins `reset()` against a new canvas: every setting, no clip, path or saved
  state, the same bytes for the same scene). A test film's review held 6–7 GB; it now takes 1–2 GB, and a long film's
  review no longer grows with its length. The same pattern in the moves tests (a canvas and a ghost painter per step)
  is gone. A kit draws on one context every frame of a review: it keeps nothing on the context and never compares
  contexts across frames (README · Kits, the skills' kits.md).
- **The suite says its memory.** `npm run test:temp` ends with the suite's peak (its whole process tree, FFmpeg
  included, read from `ps`) and its heaviest test files, on the run's page in GitHub Actions too. With no test file
  over 2 GB, the heavy files no longer run in a pass of their own.

## 0.13.0 — camera moves by name, motion from a video, music on the beat, reference breakdowns, three review verdicts, skills that build a film, and outputs that stay where you put them

- **The suite fits a CI runner.** `npm run test:temp` runs the three heaviest test files (claims, review, slideshow)
  one at a time, after the rest, and the rest as many at once as the machine has cores less one and 4 GB each
  (`STORYREEL_TEST_CONCURRENCY` sets it): side by side they could need about 20 GB, and a 16 GB runner was shut down
  mid-suite. The publish workflow now runs the same gates as CI — `test:temp` (it ran `npm test`), publint, attw and
  the skills' renders — so a release cannot publish what CI would refuse.
- **One list of typed entry points.** `scripts/typed-entrypoints.mjs` prints every export of `package.json` that has
  `types`, and both workflows hand it to attw; a test fails if the two disagree. The lists had drifted: the publish
  missed `camera`, `moves`, `principles` and `breakdown`, and both missed `walk`, `pose`, `mocap` and
  `kits/cartoon/figure`.
- **The skills say where StoryReel may write** (release.md · "Where StoryReel may write", and one line in the main
  path where `out` is chosen): every folder from the out's real path up to `/` yours or root's and writable by no one
  else unless sticky; group-write only for a provably private group on Linux, never on macOS; `noowners` drives, an
  unreadable mount table under `/Volumes/`, exFAT and FAT refused; ACLs and network owners not read. Results report real
  paths (`/var/…` is `/private/var/…` on macOS); each output is written under a temporary name and renamed into place,
  never through a planted link; a `work` folder you name keeps fixed working-file names. `npm run test:skills:render`
  checks the draft's real path and that a team folder anyone can write to is refused.

- **Skills that build a film, not only review one.** The plugin ships three skills: `storyreel` (start here: the path
  from storyboard to a released film, and which skill or page to read for each job), `storyreel-cartoon` (the main
  path as one working film: a kit, a figure that walks, a camera dolly, the review as a gate, a small draft, approval,
  release; with reference pages for kits, motion, camera, music, motion from a video, checks, breakdown, voice, release
  and the records) and `storyreel-review` (now covering the slideshow, drawn-parts and numbers verdicts, the
  example-lingers and frozen-voice findings, and the review's `every`). They teach the house method: read the record
  before guessing, look at a picture last.
- **The skills are held to the code** (`test/skills.test.mjs`): every `npx storyreel` command and flag they name is one
  the CLI's `--help` lists, every `footprint-storyreel/<subpath>` is in the exports, every imported name is a real
  export, every link between pages resolves inside the plugin, every path into the installed package ships in it, and
  every code block marked `run` runs (in a temp folder, with the package installed there; compile, review or compute
  only, never a render) and asserts what it claims. Every js block parses, and every option it hands a typed function
  is one the function's type takes (`test/skills-options.mjs`: TypeScript's excess-key check, one literal at a time;
  `render` held to renderFilm's options). The catalog tables are compared with the code: the camera moves' families,
  defaults and lengths, the review's check ids and labels, the slideshow's thresholds, the formats' sizes, the release
  targets, the feels, the moves by kind, the eases, the walk styles and evenTimings' defaults. About 3 s.
- **The numbers the skills quote are the code's.** The review's defaults and two of its thresholds are data:
  `footprint-storyreel/review` · `REVIEW_DEFAULTS` (`every` 0.25 s, `stillFor` 5 s, `maxWords` 35, `minSilence` 0.8 s,
  `newEvery` 5 s, … and `hook` 3 s, `breath` 30 s), `footprint-storyreel/render` · `RENDER_DEFAULTS` (1280×720 at 30
  fps without a layout, a part's 1.5 s handles) and `footprint-storyreel/tools` · `TOOL_DEFAULTS` (a strip's 12 frames,
  a still's 1200 px); the code and the command line's help read them, so nothing changes. A number a page quotes is
  marked with its constant (`35 words<!-- REVIEW_DEFAULTS.maxWords -->`, invisible where the page is shown), and the
  truth test fails when the code or the page changes it. The `part` tool's help no longer says "half size" (it is
  half size only when the project names a layout).
- **`npm run test:skills:render`** (its own CI job, kept out of `npm test`) renders the main path's farm film as the
  skills write it: the small draft, the approval, the final, and the approval refusing a changed kit.

- **Breaking: `footprint-storyreel/regions` · `then` is now `compose`.** An export named `then` made the module's
  namespace a thenable, so `await import('footprint-storyreel/regions')` never settled. Use `compose(outer, inner)`;
  there is no alias. A test now imports every published entry point and fails if one does not settle or exports `then`.
- **An approval locks what draws the film.** makeFilm's inputs (and so `making-of.json` and an approval) hold
  StoryReel's version, its code (`inputs.engine`: the engine's fingerprint every segment key holds — every file of its
  code and the versions of `@napi-rs/canvas`, `roughjs`, `perfect-freehand`, `shiki` and `footprint-narration`) and
  footprintjs's version (the record's verdicts run on it). An `npm update` between the draft and the final render is
  named — "storyreel version (0.12.0 approved, 0.13.0 now)" — and so is a change under the same version, as a `file:`
  dependency's is: "StoryReel's code (same version 0.12.0)". **An approval made before this release names the
  versions and the code as new, once: approve the film again.** The segment keys do not hold the version: they hold the
  engine's fingerprint already — StoryReel's own files and the versions of what draws a frame, nothing else
  (`engineFingerprint`) — so a release that changes no drawing code, or a footprintjs patch, keeps its segments.
- **A recipe with no story refuses, naming what to give**: the film's first shot is its story world, so
  `"story": {"kit": "whiteboard", "items": []}` is an empty board, said — never a TypeError, never a blank board
  assumed. A whiteboard with no `items` refuses the same way.
- **`codeFingerprint` follows what the kits read**: their imports, transitively — JavaScript and TypeScript (`./x.js`
  finds `x.ts`), a linked or workspace package's code, each `node_modules` package by its version — and the assets a
  module loads by `new URL('…', import.meta.url)`, so an approval no longer misses a change in a helper a kit imports.
  Imports are read by a small tokenizer: one in a comment or a string is none. An import that leads nowhere is listed
  (`missing`), never thrown on, and one chosen at run time is listed (`unfollowed`: `import(expression)`, `new
  URL(expression, import.meta.url)`); a module the reader cannot finish (it ends inside a string or a template) is listed
  with its line (`unparsed`), never silent. A linked package's `exports` are read as Node reads them: conditions in
  order (`node`, `import`, `default`), `"./*"` patterns filled in. `sourceCode` reads the same way.
  The making-of record lists it all (`code: {fingerprint, files, packages, missing?, unfollowed?, unparsed?}`; `codeCover(fingerprint)`). A fingerprint made with this release differs from one made before, once:
  **an approval that locks the kits' code reports "code differs" — approve the film again.**

### Outputs in a shared folder

- **Outputs replace a link at their name, never write through it.** In a shared folder (macOS's `/private/tmp` has no
  `protected_symlinks`), another user could plant a link at `chapters.txt` (or `poster.jpg`, the captions,
  `making-of.json`, the video FFmpeg wrote with `-y`, …) and have a render overwrite any file of yours it pointed at.
  Every output is now written by `files.mjs` · `writeOutput`: made under a new name — FFmpeg's video in the work
  folder, anything else beside the output under a random name created exclusively — then renamed onto its name; a
  rename replaces a link and never follows one. A video whose work folder is on another disk is copied beside the
  output the same way first. A folder at an output's name is refused, never removed. That covers the render's video,
  poster, chapters and captions, `makeFilm`'s making-of, a release's video, captions, thumbnail, `post.json`,
  `post.txt` and `CREDITS.txt`, a breakdown's `breakdown.json`, `breakdown.md`, `record.json`, `overview.png` and
  shot sheets, the tools' stills and strips, pacing's paced audio, its `.unpaced.wav` and generated silence,
  `fitVoice`'s fitted audio, and the segment store's files. Every output's name is checked before anything is drawn
  (a render, a film, a release, a breakdown), so a folder at one refuses up front. The folders StoryReel names inside
  yours (a release's targets, a breakdown's `shots/`, the tools' `stills/`) are made 0755 and refuse a link, another
  user's folder, or one others can change without a sticky bit (`files.mjs` · `outputFolder`, through `scratch.mjs` ·
  `ownedFolder`, the sweep's one check of "ours"). Every folder StoryReel makes asks for 0755 — never wider under any
  umask (000 included), narrower under a stricter one (077: 0700) — and nothing is chmod-ed after; `narration/` is
  0755 at most.
- **One rule for where StoryReel writes** (`files.mjs` · `securePath`, as sshd's StrictModes and sudo's secure_path):
  first, at every entry that writes into a folder you name — `renderFilm` (and its `work`), `makeFilm`, `makeRelease`,
  `breakdown`, the tools' stills, `folderStore`, `applyPacing`, `fitVoice` — the out is resolved to its real path and
  every folder on it, up to the root, must be a real folder owned by you or root and writable by no one else unless
  sticky. The first that fails refuses, named. Everything is written through the real path only, and the paths the
  results report are real paths. Node has no `openat`, so no check of a path keeps a folder another user can
  rearrange safe. Group-write passes on Linux when the group is provably yours alone (a user private group, umask
  002): `/etc/nsswitch.conf` names exactly `files` (or `compat` with no `+` line) for `passwd` and `group`, and
  `/etc/group` and `/etc/passwd` show no one else in it — read once; with a directory, unreadable files, or on macOS
  (Directory Services; `staff` is everyone's), it refuses and names `chmod g-w`. The path is judged as the disk spells
  it (`realpathSync.native`), and so are the paths results report. `makeFolder` checks the path again once the folders
  are made, so one another user slipped in on the way (a link `mkdir -p` followed) refuses before anything is
  written. On macOS a drive mounted with "Ignore ownership" (`noowners`, read once from `/sbin/mount`) is refused, and
  an unreadable mount table refuses a path under `/Volumes/` (never the internal disk); exFAT and FAT show 0777 and are
  refused by the walk. Not read: an ACL granting others
  write, and a network folder's owners (what the server says): keep out in a folder of your own, on a local disk.
  **Breaking** for anyone rendering below a group-writable team folder, a 0777 folder, a sticky folder another user
  owns, or a drive that ignores ownership: render into a folder of your own and copy the film out.
- **The guard** (`test/outputs.test.mjs`) refuses any writing fs import outside `files.mjs` and the listed own-folder
  writers, by the local name it is given; fs or child_process taken whole or loaded late (a default or namespace
  import, `{default as fs}`, a re-export, `import()`, `require`, `createRequire()(…)`, `process.getBuiltinModule`);
  any program run that is not listed with where its output goes; and any FFmpeg or ffprobe flag that writes a file
  (`-y`, `-report`, `-progress`, `-vstats_file`, `-o`, `FFREPORT`, …) on a line not listed.

### Beats in the breakdown

- **`storyreel breakdown <video> --beats`** reads the video's sound with the beat map (`beats.mjs · beatMap`) and says
  which cuts land on the beat; `--bpm n` hands it the tempo you hear, `--ffmpeg path` names the FFmpeg both run.
  Without `--beats` nothing about the beats is read. A tempo the map refuses (`--bpm 5`, code `BEAT_OPTIONS`) refuses
  the breakdown (exit 2); a sound it cannot read is recorded as not run.
- **The breakdown judges cuts with `safeBeats`**, the one owner of which beats count: every beat of a sure map, only
  the beats every candidate shares and the song hits of an unsure one. A cut near none of those is off the beat for a
  sure map and not judged (`onBeat: null`, `unjudged`) for an unsure one; the spec gains `verdict`, `sure`, `judged`,
  `likely` and `phase`, and an unsure map's drop is a maybe. A close call is named only at 0.9 of the best or more, and
  never the winning tempo again.
- **"No music here."** A beat counts only where music is playing (`beats.mjs · musicAt`: a heard hit within one beat
  period): no beat in a silent gap, before the music starts or after it stops is one a film may cut on, so
  `fitToMusic` never snaps onto one, and the breakdown says "no music here" (`music: false`, `noMusic`) instead of
  "off the beat by 4.00 s". A reader that gives no `hits` gets no such check.
- **No steady beat, no map.** `beatMap` refuses (no code) a sound whose onsets keep no steady period — speech, noise,
  or music with a free tempo — or are faint (a held tone or pad), unless a tempo is given; the breakdown records it as
  not run, "the sound has no steady beat (…)", told apart from "the beat map could not read the sound (…)", the fix
  worded for the API or the command line (`hints`).
- **A given tempo sets the tempo, not the phase.** When the half-beats sound as strongly as the beats the map is not
  sure of its phase (`phase: 'unsure'`), keeps no beat to cut on, and says to try twice the tempo given.
- **Breaking: a breakdown's beat reader is handed the video itself**, not a WAV of its sound. A reader that expected a
  WAV must read the sound through FFmpeg (as `beatMap` does: 22050 Hz mono, streamed into one array; on a synthetic
  hour, `breakdown --beats` peaked at 1.1 GB where it took 2.8 GB). No compatibility shim.
- **A missing FFmpeg is a refusal, never a crash**: every streamed FFmpeg (the breakdown's frames and stills, the beat
  map's sound) catches the start error (`spawned.mjs`) and rejects naming it.

- **Full-width separators are read.** Chinese and Japanese text's full-width comma and point (，．) are a "," and a
  "." as the Arabic ٬ ٫ are, and the full-width minus (－) is a sign: `ja` "１，０００円" is 1000, "３．５kg" 3.5, "－５℃" −5,
  typed or drawn. The ideographic comma 、 stays a list separator, never a group mark.
- **Code joins digits by "_"**: under `code()`, `1_000_000` (JavaScript, Python) is 1000000; outside code "_" joins nothing.

- **Numbers are read in the language the film is shown in.** `compileFilm` takes `lang` (a BCP 47 tag) and keeps it as
  `film.lang` (and `film.inputs.lang`, for an approval to lock); `makeFilm`'s `lang`, which named the string table only,
  is now passed through: one value. Both claims checks read numbers by it, with the language's own group and decimal
  symbols and grouping (`Intl.NumberFormat`, `numberLocale`): `de` "2,5 kg" is 2.5 and "1.299,99" 1299.99, `fr`
  "1 299,99" (narrow no-break space) 1299.99, `en-IN`/`ta`/`te` "1,00,000" 100000. A tag that is not BCP 47 refuses.
- **Without a language, "2,5" is ambiguous**: kept as written, like "1,000" — only a fact written the same way sources
  it — and so are "1,00,000" and "1,2". An unsourced
  ambiguous number's fix says how to give the film its language. A fact `"2,5"` is accepted as written; a fact value
  with words or several numbers is refused with what to do (never "put the words around it" for a number).
  `numbersIn(text, {lang})` and `numberValue(run, {lang})` take the language as an option.
- **A language's own digits are numbers.** Arabic-Indic, Persian, Devanagari, Bengali, Telugu, Tamil, Thai — every
  script's digits (Unicode Nd) are read, with or without a language, and the Arabic separators ٬ and ٫ as a group and a
  decimal mark (`ar-EG` "1٬234٫5" is 1234.5). A film in its own digits used to pass as "shows no number". A number that
  mixes scripts is ambiguous; a fact in native digits ("١٢٣٤") sources the same number.
- **Code is read as code** (`footprint-storyreel/decorative` · `code`): words drawn inside it read "." as the decimal
  mark and "," as a separator, never grouping, whatever the film's language; the built-in code stage marks its code.
  The words carry `code: true`.
- **An as-written number is sourced only by a fact written the same way**: "16.67" in a `de` film (no German number)
  is no longer sourced by the number 16.67 because it prints alike.
- **Approvals made with a `lang` before this release** report their inputs changed (`film.inputs.lang` is new): approve
  the film again.
- **A line typed again is typed on again.** A typewriter line typed twice is one claim, its fullest line, each time:
  the typed-on merge now joins run to run before the runs of one number are pooled.
- **The review reads nothing after the film's end** when it times a number's hold: a typewriter caught mid-number by
  the film's last frame is no claim.

- **The example label stays until the example line's last ink.** An eraser wipes a line over its own time: the label
  now holds until the wipe ends (a kit's `texts()` may say when a line's last ink goes, `gone`; the whiteboard does),
  not only until it starts — an example number is never on screen unlabelled.
- **A decimal drawn as code tokens is one number.** A lone "." or "," between digits joins them when it stands within
  half their height of each (`DRAWN.point`): a code panel's "16" "." "67" is 16.67 and "$1" "," "299" "." "99" is
  1,299.99; `f(4,5)` is read as typed (by the film's language), and "12 30" and "x - 5" stay as they were.
- **Digit groups of different sizes never join.** "$1,299" with a raised "99" reads as 1,299 and 99 — not 129999 —
  since the picture does not say whether a raised group is cents, a power or a note (`DRAWN.size`, `DRAWN.baseline`).
- **`footprint-storyreel/decorative`: text the film does not say.** `decorative(ctx, draw)` marks the words drawn
  inside it (a code panel's line numbers, a strip's badges): the review reads them for every check, and the claims
  check leaves them out. Read words carry `decorative: true`.
- **A drawn number counts once it holds**: the same number, in the same place of the same line (every number masked:
  "Sold 40 cups" and "Sold 40 kg" are two claims, each checked against its own facts), up for 0.5 s (`HOLD`). A
  typewriter's partials and a counter's passing values are no claims, and a line typed on past its number is one claim.
  The hold is timed whatever the review's step: the claims check reads every 0.25 s or finer, and a number's edges
  again every 0.05 s where it must — a number up 0.5 s or more always counts, one up under 0.4 s never does. At the
  default step nothing more is read; at `every: 1` the claims check reads every 0.25 s (and finds numbers the coarse
  reads missed). The four example films read the same numbers as before.
- **Typed and drawn numbers are read by one rule** (numberValue, by the film's language): a fact of 1.2 never sources
  "steps 1,2 and 3" in a film without one; without one, "1.299,99" and "1,299.99" are both 1299.99 (the one reading in
  which each is a number).
- **A render cleans up after itself.** Its working files (the picture without its sound, the voice and the effects as
  WAVs, FFmpeg's lists, segment files on their way to the cache) go in a hidden `.storyreel-work-…` folder beside the
  video, removed when the render ends, finished or failed (`render.mjs` · `closeRender`; `renderFilm` and `makeFilm` call
  it in a `finally`). Only the outputs stay beside the video. To keep the working files, name a folder for them:
  `renderFilm({…, work})` (or `makeFilm({…, render: {work}})`). The system's temp folder holds only one pass's scratch
  while it runs (the stills' FFmpeg filter), removed in a `finally`; a breakdown's beat map reads the video's sound
  itself, so no copy of it is written.
- **A stopped render's folders are swept by the next one.** Scratch folders are named `<prefix>-<host>-<pid>-<XXXXXX>`
  (`scratch.mjs`): a render sweeps the `.storyreel-work-…` folders beside it whose process on this host is gone (Ctrl-C,
  a killed process: the library installs no signal handler), and `makeFilm` the `.narration-…` copies too; the
  making-of lists what was swept (`swept: {count, names}`). This host's folders are judged by whether their process
  runs, never by age: a live run's is never swept, however quiet. Any other folder untouched for more than a day (by the
  newest write inside it) is swept: 0.12's `.narration-<pid>`, another host's, this host under an earlier name. A fresh
  folder from another host (left for that host's own next run) and a `work` folder you named are never swept. The two
  pass that uses the system's temp folder (the stills) names its `storyreel-scratch-…` and sweeps it
  the same way. Cleaning up never fails a run: a folder that cannot be removed is skipped and listed in
  `swept.failed: [{name, why}]`.
- **Scratch folders are safe in a shared temp folder** (CWE-377). Every one — a render's working folder, `makeFilm`'s
  voice copy, the stills' scratch in the system's temp folder — is made by `scratch.mjs` ·
  `makeScratch`: `mkdtemp`, a new folder with a random suffix, created at once, that only you can open (mode 0700). A
  folder or a link another user planted at a name StoryReel might pick is never written into, and the voice is copied
  as new files only (`files.mjs` · `copyVoice` creates each exclusively). The copy gets a plain folder's mode (0777
  less the umask) before it becomes `narration/` (`files.mjs` · `placeVoice`), never the out folder's mode. A sweep touches only real folders you own: a link with a scratch name, or another user's
  folder, is ignored — not removed, not followed, not listed.
- **`makeFilm` renders from its own copy of the voice** and makes it `<out dir>/narration` only once the film is made:
  two films made at once into one folder no longer take each other's voice, and a refused or failed film leaves the
  folder's narration as it was. If the other film's folder slips in between the two steps of putting it in place
  (ENOTEMPTY, EEXIST), it is tried once more and the record says so (`narration: {placedAgain}`).
- **The tests clean up after themselves.** Every test folder comes from one helper (`test/tmp.mjs` · `tempDir`), named
  `storyreel-…` and removed when its test or its file ends. `npm run test:temp` runs the suite with a temp folder of its
  own and fails if anything is left; CI runs it. Stopped (Ctrl-C, SIGTERM), it stops the suite, removes its own folder
  and exits with the signal's code. A full run used to leave 87 folders behind; it now leaves none.
- **An example line beside real numbers is a finding.** An example scene's line that stays up into a real scene keeps
  its "Example data" label, which then seems to cover the real numbers beside it: the review's new
  `example-lingers` check says so while both are on screen (`an example line lingers into scene real beside real
  numbers (60): erase it before the scene`). `claims.mjs · lingeringExamples` finds the stretches.
- **"ISO-8601" and "A-1000" are names, not numbers.** A number after a hyphen after a word is a number only when it is a
  plausible year (1000–2199) after a lower-case word or a time prefix (mid-, pre-, post-, early-, late-, in any case):
  "mid-2024", "pre-2020" and "post-1990" still need a source; an upper-case code (COVID-19, B-52, UTF-8) does not.
- **Two numbers drawn close stay two.** The review joins drawn words without a space only where their ink touches (a
  gap under 8 % of their height, `DRAWN.touch`) or a sign or a decimal point stands at its digits (within 20 %,
  `DRAWN.mark`): "12" and "30" drawn 4 px apart are 12 and 30, never 1230; "16" then ".67 ms" is still 16.67, and "-"
  then "5" still −5. A number drawn a digit at a time now reads as its digits: draw it as one string.
- **A prose source is unverified, not refused.** A fact's source that leads to no file ("/r/science thread") is kept as
  unverified; only a path that is there, outside the film's root, refuses.
- **The slideshow's still cap is measured on real code films**, and stays: they are still 18–54 % of the time (the
  cap is 85 %), their stillest shot 80 %.

- **The review's `frozen-voice` names only what a freeze holds.** An emphasis word, a focus key or a guess card is drawn
  on the voice's clock, so its beat under a freeze is no longer reported as "appears when the freeze ends".
- **A camera move that starts while another runs aims from where that one is going.** A dolly beside a pan takes the
  zoom the pan ends on, not its middle, and still starts from what is on screen. Under reduced motion, a move during a
  follow aims from where the follow cuts to, so both versions end on the same framing.
- **A dolly on a thing never passes ×4 after it ends.** As it re-aims (a push or the focus moving the picture under
  it), it keeps the thing on its framing with its own roll, and a later dutch scales up to cover as anywhere. Its hold
  is checked for ×4 until moves have taken over both where it looks across and up and down (a pan on one leaves the
  other re-aiming), or its picture changes; a dutch that would take a held dolly past ×4 refuses, naming the dutch and
  the most the hold would need.
- **A refusal names the move that moves.** Each move is checked over its own span before any dolly's hold, so a pan
  that cannot be covered after a held dolly names the pan, not the dolly.
- **A dolly-out that cannot widen refuses.** When a dutch's cover need holds the zoom up, or the camera is already at
  the whole frame, a dolly-out would play as nothing or as a zoom in: it refuses instead, naming what holds the zoom
  (level the dutch first, or leave the dolly-out out). It is judged from where the camera is headed, so both versions
  of a film decide alike.
- **The moving film and the reduced-motion film accept and refuse the same recipes, with the same words.** A recipe's
  camera is checked as written and as cut, whichever version is made, each version with its own moves and its own
  picture clock (the cut film turns a speed ramp off, so its follows read their things on the voice's clock). A follow
  both versions read on the same clock is sampled once.
- **A move is not blamed for where a hold left the camera.** A move that starts with the picture already past ×4 defers
  to the hold that took it there, which refuses naming the dutch that rolled it.

### Motion from a video
- **`footprint-storyreel/pose`**: the motion-source port, `{name, poseAt(t)}`: one pose shape for everything that moves
  a figure, every foot with its roll (`angle`), plus optional joint angles (torso, neck, shoulders, elbows, hips,
  knees). `walkSource` is the planned walk as one adapter; `motionSource` and `checkPose` check a source and a pose,
  naming every wrong key.
- **`footprint-storyreel/mocap`**: `fromPose(keypoints, {x, size})` turns COCO-17 or MediaPipe-33 keypoints into a
  motion source, as a footprintjs flowchart with a record. Gaps are bridged, held or refused with their frames, and a refusal says whether the points were never found or
  reported under `minConfidence`. Smoothing is One Euro, forward and back. Feet are planted and locked so they never
  slide, and the legs are re-solved with the knees bent forward. A loop joins only where the feet meet, and otherwise
  refuses with the cut that does.
- **`footprint-storyreel/kits/cartoon/figure`**: `drawFigure`, a cartoon figure any motion source moves.
- **`tools/pose-from-video.py`** (optional; MediaPipe Pose, heavy by default): downloads a pinned model on first use and
  checks it by SHA-256, resamples a phone's variable rate to a steady fps, tells a damaged file by time against its
  real duration (a trimmed file is whole; one spanning under half its duration is refused), and filters MediaPipe's
  INFO and WARNING log lines while passing errors on at once.

### Three review verdicts: no slideshow, parts that hold, numbers with a source
- **Verdicts** (`src/verdict.mjs`): a check may answer `passed`, `failed` or `not run`, decided with footprintjs's
  `decide()` over what it measured, so the review's record keeps the rule, the values and the thresholds. A check that
  cannot run says `not run` and why, never passed. `reviewPart` returns `verdicts` and `verdictText`; `npx storyreel
  review` prints them under the findings. A verdict check of your own: `{label, when, measure, verdict, notRun?,
  summary?}` in `checks`.
- **No slideshow** (`footprint-storyreel/slideshow`): each shot is measured in its middle (`film.changes`, every change
  of picture, cut out) as grey frames 160 px wide — the review's own frames, drawn once (`frameHashes`'s new `each`).
  A still stretch held more than 3 s, or all of a shot that never moves (or whose changes, together, touch under
  0.25 % of the frame: a blinking caret), is dead; the film fails when more than half of its shots' running time is
  dead, or more than 85 % is still at all (a deck swapped every 3 s: 93 %). Thresholds are data (`SLIDESHOW`). The
  example films all pass (hello 32 % dead and 63 % still, recap 15 % and 58 %, shepherd and worlds 0 % dead); still
  cards and crossfaded 2.5 s slides are 100 % dead, a page every 5 s 63 %.
  Not the stale check: stale asks whether anything new comes, this whether the picture moves between the new things.
- **Drawn parts hold together** (`footprint-storyreel/geometry`): a kit may give `parts(t)` — segments `{a, b, width?,
  mount?, ends?, contact?}`, regions, pairs kept `apart` — and the audit checks that a mounted end stays on its mount,
  a pair never crosses, and a planted end (`contact: 'a' | 'b' | true`, the end a rolling foot rests on) never leaves
  where it was first planted — starting again across a gap or a jump of the picture's clock (a camera freeze letting
  go; a speed ramp is not a jump). The cartoon kit gives its parts from the shape it draws from (`shepherdShape`,
  `sheepShape`; pixels unchanged). `film.partsAt(t)` lists them, on the picture's clock (`film.pictureAt(t)`).
- **Every number has a source** (`footprint-storyreel/claims`): every number on screen — `film.lines`, the emphasis
  words, the captions as shown, and in the review every word the picture draws — matches a fact the storyboard names
  (`"facts": "facts.json"`, `[{value, text?, source}]`) or sits in a scene marked `"example": true`, which draws an
  "Example data" label — inside a crop's window in portrait and vertical, and on while any line the scene shows is
  still up (`film.claims.labels`). Numbers keep their sign (a minus, the minus sign, an en dash), a digit after a cased
  letter is part of a name (H2O, COVID-19, B-52; four digits after a hyphen are a year), CJK numbers are seen, and
  "1,000" / "1.000" are ambiguous (only a fact written the same way sources them); the review joins words drawn in
  pieces ("16" + ".67 ms"). A source is an http(s) URL, a file inside the root, or anything else kept as unverified and
  counted. `film.claims` lists them. A stage of `makeFilm`'s pipeline too, `check-claims` (it sees declared lines only,
  and says so), with `claims: 'report' | 'refuse'` (default report); the making-of record keeps the verdict, and a
  refusal leaves the voice and the last render's narration as they were (the paced voice now moves into place in
  `place-narration`). The facts are hashed on their own (`film.inputs.facts`, for an approval) and are in no
  segment's key.
- `film.lines` (every line meant to be read), `film.changes` (every change of picture), and `frame(ctx, t, {window})`
  (a layout's crop window, so a label the viewer must see stays inside it).
- The walk README now says to turn a shoe about the end on the floor (its heel while the toes are up, its toe while
  the heel is up), not about its heel all the way.

## 0.12.0 — walks with feet that roll heel to toe; a turn that reads as a turn

- **The feet roll heel to toe** (`walk(…).at(t).feet[j].angle`, radians, + toes up): a heel strike as a foot lands,
  flat while the body passes over it, the heel rising before the toe pushes off. A new style key, `roll` (stroll .32,
  brisk .38, bouncy .26, tiptoe 0); a style of your own without it rolls like a stroll (the one key that may be left
  out), and one above 1 radian is refused. The first step starts flat and the last lands flat: a foot's roll changes
  by less than 0.06 rad in any 1/240 s, in every style (tested). A standing foot's angle is 0.
- **`turnaround(turn, {views, depth, window})`** (`footprint-storyreel/motion`): which drawing of a cartoon turnaround
  to show for a walk's `turn` (front … side) and a squash across each swap (1 − depth at the swap, 1 away from it,
  never jumping), so a swap of drawings reads as the body turning.
- The refusal of an unknown walk names `roll` among the keys of a style of your own.

## 0.11.1 — Read compile records with Foottrace; accept footprintjs 10

- Record readers now come from `foottrace` (`^1.0.0`), which ships as a dependency. The README's slice
  example and the compile-record tests use its public reader door.
- The engine dependency accepts `footprintjs ^9.27.0 || ^10.0.0`; the lockfile uses the fixed 9.48.3
  release. The pipeline, narrative and snapshot types still come from footprintjs.
- No public export, film, pixel pin or behaviour fixture changes. The TypeScript check proves that
  Foottrace can read StoryReel's compile record without a cast or a second record representation.

## 0.11.0 — X as a release target; the review asks for something new and a loop that comes round; a voice never paced in place; cartoon motion (twos, follow-through, walks); the narration code in footprint-narration

### X: a release target
- **`x`**: a square 1080×1080 video with the title band and burned-in captions, up to 140 s, a post of at most 280
  characters as X counts them, the film's chapters in the post when there are at most 50 and the post has room (in a
  post with one video, X makes a time a link to that moment — on iOS for now, X says), audience 13 and over. Facts
  checked 2026-10-08 against X's help pages, its counting rules and its terms.
- **`xLength` is twitter-text 3.1.0's count** (`parseTweet(text).weightedLength`, config v3), the library X publishes
  for counting a post, ported into `src/targets/x-count/` (Apache-2.0, its licence beside it; the emoji list is
  twemoji-parser 11.0.2's, MIT) and pinned to it: `test/fixtures/x-counts.json` holds over 300 texts with
  twitter-text's count, and `xLength` must give every one. `scripts/x-counts.mjs` remakes the table from a scratch
  install of twitter-text@3.1.0, never a dependency. Links as twitter-text finds them (a known top-level domain;
  punctuation after a link is text; no link in an address, after `#`, `$` or `-`, or for localhost and IP
  addresses), emoji as twemoji-parser finds them, code points weighed by X's ranges (1 up to U+10FF and in the
  general punctuation's spaces, dashes, quotes and primes, else 2). An emoji newer than that library counts here as
  its parts, never less than the 2 X counts.
- **The package now includes Apache-2.0 code**: the X counter, ported from twitter-text, with its licence file
  (`src/targets/x-count/LICENSE-twitter-text`). Its licence is `MIT AND Apache-2.0` in package.json and in a
  release's CREDITS.txt; StoryReel's own code stays MIT.
- An adapter may say how a text field is counted (`limits.text.<field>.count`); raising a limit keeps the count.
  `post()` also gets the target's `limits` (overrides included), and X's post decides with that count.
- **Limits overridden are checked** as an adapter's are, so a count that is not a function or a `max` that is not a
  whole number is refused when the target loads, naming the field; a key given as `undefined` is not given (the
  platform's value stays: `{count: undefined}` keeps how X counts).
- **The largest frame**: an adapter may say the largest frames its platform takes (`limits.frame`, one per
  orientation), and a render larger than that is refused before it starts, naming the scale that fits. X takes at
  most 1920×1200 (1200×1900 tall), so `{target: 'x', scale: 2}` (2160×2160) is refused: release it at scale 1. The
  other adapters declare none and are unchanged. `planProblems` takes the target's `scale`.

### Review: nothing new, a loop that comes round; strip
- **Nothing new** (`stale`, on by default past `newEvery` seconds, 5): something new — a scene, a beat, a word that was
  not on screen a moment before — should come at least every few seconds. A gap is reported once, "nothing new for
  7.1 s since 0:07.1"; a frozen picture is left to `still` (the picture does not change) when that check runs too.
- **A loop that comes round** (`loop: true`, opt-in, `--loop true`): the picture at the part's end must be its start.
  The part is its own scenes (no handles), exactly where they lie (`partScenes`, unrounded: a scene a voice paced to
  10 µs is never read into its neighbour); its end is read at its last moment, never after the cut; the two
  pictures are compared at the film's size the way the eye takes them in (4×4-pixel cells: none more than 32
  levels apart, the mean under 0.02), and the words drawn at both ends must be the same. Measured: 0 of 1,800
  seamless loops read as a jump, 1,800 of 1,800 loops 0.2% of a turn short caught. Motion that steps rather than
  runs (a flipbook, a blink, a part drawn on twos) is read one drawing short of coming round, so such a loop reads
  as a jump even when it loops cleanly: look at a strip of the seam.
- **A check that fails fails the review**, naming it: one whose `find` or `when` throws or gives a promise, whose
  `find` gives something that is not a list of hits (or a list with a hole, or a hit without its name, time or
  words), or whose result could not be kept. A check's hits are copied as plain `{kind, t, what}`. The engine's own
  log lines are kept for that message, never printed.
- **`strip`** (tool and MCP): 12 consecutive frames around a moment, as one picture, for a fast move; MCP returns
  the picture itself for `still` and `strip` (the last line of the output that names a picture).
- `still`'s finding reads "the picture does not change for 7.0 s from 0:07.5" (one per stretch); a part's window
  is held to the film's length (a float total no longer reads past the end); times print as 1:00.0, never 0:60.0 —
  in the review, on contact sheets and strips, and in the studio (one `clockTenths`, `footprint-storyreel/clock` — a film time to the tenth, `1:21.5`, beside footprint-narration's `clockText`, a chapter time, `1:21`; the
  studio page keeps a copy, as it runs in the browser on its own).

### A voice is paced in a copy, never in place
- **`makeFilm` paces a copy of exactly what the render reads**, the voice's `timings.json` and each scene's audio (and
  a `.unpaced.wav` beside one, so a voice paced before is still refused), each a new, writable file read through
  any link. Before, the voice folder was copied with `cpSync`, which copies a symbolic link as a link: a voice
  folder given as a link, or holding links, was paced in place through them, its audio rewritten and its
  `timings.json` replaced. Nothing else in the voice folder is copied or even listed.
- **A scene's audio is a relative name inside the voice folder**: one that leads out of it (`../takes/a.wav`), an
  absolute one, or one with a control character is refused before anything is written.
- **A render whose out folder overlaps the voice folder is refused** before anything is written: an out folder inside
  the voice, or a voice that is, holds or lies inside `<out dir>/narration` (which the render replaces), compared
  by real path as the disk spells it.
- **Every path in ffmpeg's lists is quoted**: an audio name or an out folder with an apostrophe ("Sanjay's films")
  renders; a path with a line break is refused.

### Cartoon motion: drawn on twos, follow-through, and a walk whose feet never slide
- **Drawn on twos** (`footprint-storyreel/motion · heldTime(t, 'twos')`): the moment the drawing shown at `t` was made;
  each drawing holds for two frames while the camera moves on every frame. Timings `ones`, `twos`, `threes` or a
  number of frames, counted at 30 a second (`{fps}`).
- **Follow-through** (`follow(body, t, {from, feel, drag})`, `lag`): a part that hangs off a moving body hangs on a
  springy joint — it swings back as the body sets off, on past as it stops, and settles, and hangs as at rest at a
  steady pace; `drag` adds the air (a hem trails). Each 1/240 s step is solved exactly, so any feel is steady; a pure
  function of time.
- **A walk, the whole flow of it** (`footprint-storyreel/walk`): `walk({from, to, start, size, style}).at(t)` gives
  the body's place, rise and lean, each foot's place and lift, the arm swing and the turn: it sets off (a dip, a
  lean back, a turn), steps with each foot planted where the body passes over it (the feet never slide), and
  settles (it rocks on past its feet and turns back). Styles: `stroll`, `brisk`, `bouncy`, `tiptoe`, or your own.
  The walk never draws: a kit draws the legs to the feet it is given.
- **Motion blur stays inside its frame** (`render.mjs · blurMoments`): at a shutter of 1 the outermost moments were
  the half-way point the next frame shares, so drawings held on twos mixed; byte-identical below a shutter of 1.
- **A render starts on the film's frame grid**: a part preview starts at most a frame earlier than its window, so
  drawings held on twos pair the same frames as in the whole film. Whole films start at 0, unchanged.

### The narration code moves into footprint-narration (breaking: imports move)
StoryReel and StoryDeck each kept the same narration code — what a voice says for a number, the captions, YouTube's
chapter rule — and the copies had started to disagree. It now lives in one package both use,
[footprint-narration](https://github.com/footprintjs/footprint-narration). **What a film says, its captions and its
chapters are unchanged** for a whole film (moved code, pinned there by differential tests against 0.9.0's, and by
every test here); a part's chapters change as named below.
- **Moved out, imported from `footprint-narration` now**: `normSpeech`, `shownWords` (it takes a spoken map:
  `film.clock.shownWords(i)` is unchanged), `captionChunks` (it takes tracks — `captionChunks(spokenTracks(film))`),
  `captionAt`, `captionFile`, `FILE_CHUNKS`, `readCaptions`, and `youtubeChapters` (`youtubeChapters(marks,
  { length }).lines`, marks as `{ at, title }`; `chapterLine` → `clockText`). No forwarders are left behind.
- **New: `spokenTracks(film)`** — the film's speech as tracks (each spoken scene at its offset, its words as shown).
- `checkScene` refuses a scene's `say` with the same messages, through footprint-narration's `checkSlots`;
  `spokenText` and `unsaidNumbers` now refuse a `say` list `checkScene` would refuse, with its messages
  (`storyboard scene <id>: say[k] …`; an empty list too) — 0.9.0 used the slots up to the first one it could not find.
- `speechIndex(scene, timing).slots` is footprint-narration's spoken map (`phraseMatches` reads `slots.norm`); the
  `CaptionChunk` type is gone (footprint-narration's `WordCue`).
- **A part's chapters are the ones it shows.** A render of a part (`from`, `to`) lists in `chapters.txt` and in
  its result only the chapters that start inside it (0.9.0 listed every scene after its end too, and YouTube's
  rule then dropped one of them), so a release of a part posts only those. A blank intro title names its chapter
  `Title` (0.9.0 wrote a chapter with no name); a chapter title is one line (white space tidied).
- A chapter line of a film an hour long or more reads `1:02:05` (it read `62:05`); `chapters.txt` and the release
  read both.
- WebVTT caption files escape `& < >` in a word (they were written raw), and `readCaptions` reads them back.
- Segment caches draw once more after this upgrade: footprint-narration is part of every segment's key
  (`versions.mjs · DRAWING`), since the burned-in captions' words come from it. Its version is named in the
  making-of record and the release's CREDITS.txt.

## 0.10.0 — one word changed redraws only where it shows; one clock for the review and the render; emphasis on the thing

### One word changed redraws only where it shows
- **A segment's key holds only the strings its own entries name** (`{"$string": key}` in its recipe entries, the
  guess cards over it and what its entrance also draws), not the whole string table: changing one word — a guess
  card's answer — redraws the segments that show it instead of every segment of the film. `film.stringHashes`
  (each string's own hash) carries it; `film.inputs.strings` (the table's hash, what an approval locks) is
  unchanged. Measured on a 1:22 episode: before, changing one answer redrew 3 of 3 segments.
- **The cast is in every segment's key** (a kit draws its people from `context.cast`): a changed look or name used
  to leave every kept segment in place, so a re-render could reuse pictures of the old cast.

### One clock for the review and the render
- **`paceTimings` keeps a voice's audio**: when a scene's timing names its audio (a voice's timings.json), the
  scene ends where the voiced cut ends it — the later of the audio's end and the last word plus the tail — not at
  the last word plus the tail. The review tools (`storyreel timeline | review | still`) read a voice folder without
  touching its audio, so their film ran short of the rendered one (a voiced opener: 3.1 s short by the end, every
  beat after the first scene early). They now see the rendered film's clock.

### Emphasis on the thing
- **`emphasis` strategy `label`**: the words sit on the thing in focus — just above its top-left corner, travelling
  with the camera — or at the top middle when nothing is in focus. Emphasis strategies get the focus view
  (`draw(ctx, t, word, theme, view)`). The words glide between the two as the focus comes and goes — never a jump.

## 0.9.0 — where the viewer looks: focus and emphasis as strategies, motion with a feel, a director's checks

### Text too small to read is texture
- The review does not count text smaller than `minHeight` of the frame (0.011: 12 px at 1080) — a photo of a
  page on screen is a picture, not reading.

### A soft edge on the veil
- The `dim` and `spotlight` veils fade to nothing over a soft edge around the named thing (thin rings, still plain
  rectangles the review can read), instead of a hard-edged hole that showed as a pale box on empty paper.

### Focus strategies compose; the review sees a veil
- **`focus.strategy` may be a list**, applied in order: `["camera", "dim"]` moves the camera and veils the rest of
  its view (at most one of them may move the camera). The record names it `camera+dim`.
- **The veils are four rectangles** around the named thing, and **the review counts a word under a filled rectangle as
  veiled**, as much as the fill is opaque — a card over a label, a veil over the page. On a real 1:23 film the
  camera alone left 20 findings (frames full of words, words cut at the edge); camera and dim, none.

### The camera frames above the captions; the review sees what is veiled and what is framed out
- **`focus.safe`** ([x0, y0, x1, y1]): where a framed thing may sit — a film with burned-in captions keeps it above
  them ([0, 0, 1600, 700]); the thing is sized to and centred in it, and the picture still covers the frame.
- **`pop` lands on a veil of the paper**: while the words are big, the picture steps back under them, then returns.
- **The review**: a fill over the whole frame veils the words under it (as much as it is opaque), so words under a
  title card or a veil are not counted as on screen; while the film's camera is pushed in, a word less than half in
  the frame is framed out, not cut off.

### Where the viewer looks: focus and emphasis, as strategies; motion with a feel
- **`focus`** in the recipe: keys name a thing in the picture (or `"wide"`) on a beat; a strategy shows it —
  `camera` (eases to frame it: medium, close, insert), `spotlight`, `dim`, `none` — or one of your own
  (`compileFilm`/`makeFilm`'s `strategies.focus`). `film.attention` records it; `film.focusAt(t)` says where it is.
- **`emphasis`** in the recipe: words that land on their beat — `pop` (big, then a label in the corner until the
  next), `corner`, `none` — or your own (`strategies.emphasis`).
- **`footprint-storyreel/motion`**: closed-form springs with named feels (`snappy`, `default`, `heavy`, `playful`, or
  `{k, d}`): `spring`, `pop`, and `track` for a value with many targets.

### A director's checks, credits with every release, the skill as a plugin
- **A director's checks in the review** (each a strategy, picked when it fits): `hook` — nothing moves in the first
  3 s of the film; `text-density` — more than `maxWords` (35) words on screen at once; `silences` — fewer than two
  real silences (a pause of `minSilence`, 0.8 s, with no effect playing) in a spoken part of 30 s or more. On a
  real 2:26 episode: no hook or silence finding, and one honest "too much to read" (40 words for 2 s at the end).
- **CREDITS.txt with every release:** StoryReel and every tool the film's record lists (version, licence, what
  for), what the maker brought (`post.credits`, one line each) and the synthetic voice when declared.
- **The skill as a Claude Code plugin:** `claude plugin marketplace add footprintjs/storyreel`, then
  `claude plugin install storyreel@storyreel`. The skill moved to `plugin/skills/storyreel-review/SKILL.md`.

## 0.8.0 — read first: edit one part, review it as text, the tools for people and agents

### Speech in scripts with vowel signs
- **A phrase is found by its letters and its vowel signs** (`clock.mjs · normSpeech` keeps combining marks): in
  Tamil, Telugu, Hindi and other scripts whose vowel signs are combining marks, two words that differ only in a vowel
  sign (கடை "shop", கட) were the same to the matcher, so a phrase could be found at the wrong word. English is
  unchanged (NFKC leaves it no combining marks). A release folder named from a title keeps the vowel signs too.

### The review tools: a command line, a skill, one core
- **`storyreel <tool>`** (the package's bin): `timeline`, `review`, `part` and `still`, for people and for agents.
  The project names its film once, in `storyreel.config.mjs` (`export default {film: flags => ({storyboard,
  recipe, kits, root, narrationDir?, pacing?, layout?, out?})}`); every flag also reaches `film()`. Text first
  (when each beat lands; what is wrong, with times), a quick part render (handles, half size, draft encode,
  reviewed first), and one still last.
- **`skills/storyreel-review/SKILL.md`** ships with the package: read first, look last — the loop and its rules,
  for an agent to follow.
- **`footprint-storyreel/tools`**: the one core (`loadProject`, `timeline`, `review`, `part`, `still`, `TOOLS`
  with what each does and takes) the command line and the MCP server use.
- **`storyreel mcp`**: the same four tools over MCP (stdio) for Claude Code, Claude Desktop, VS Code's Copilot or
  Cursor — each call in a fresh process (an edit between calls is always seen), a still returned as the picture,
  the start flags as every call's defaults.

### Review a part by reading it
- **`reviewPart(film, {part, layout})`** (`footprint-storyreel/review`) reads the picture as text and names what is
  wrong, with times: words under the captions while a caption shows, words over other words, words cut off at the
  frame's edge, and a picture that does not change for 5 s or more. `wordsAt(film, t)` is every line a frame draws
  — followed from each world's sheet onto the frame, its quad kept through rotations — with its alpha. Words
  fainter than 0.5 or there for less than 1 s (a fade, a page turning) do not count. On a 2:26 film the whole
  review takes about 2 s.
- **The review is a footprintjs flowchart** with its own record: `read-part` reads the part once for every check,
  `pick-checks` is a selector that picks each check by what the part has (a caption band, words, length), each
  check runs as its own subflow, and `report` merges the findings into spans. A check is a strategy:
  `{label, why, when, find}`, and one of your own goes in `checks`. `findingsText` gives the lines; the compiled
  layout gains `captionAt(t)`.

### Edit one part, look at one part
- **Code per segment:** `segmentedVideo({code: sourceCode(sources, {shared})})` keys each segment by the code of its
  own shots — the files `sources(entry)` names for its recipe entries, everything they import (relative imports
  followed, a package by its installed version) and `shared` files (hashed as they are). An edit to one shot's
  module draws only the segments that show it again; one fingerprint for every kit (`codeFingerprint`) still works
  and draws them all.
- **A part with its handles:** `part: {scenes, handles}` on a render (and `makeFilm`'s `render`) renders those
  scenes and `handles` seconds (1.5) of the film either side, so both of the part's cuts are seen
  (`partWindow`). A part is checked as a part and is never approvable.
- **A quick look:** `quality: 'draft'` (x264 ultrafast) and a layout `scale` down to 0.5 (half size).
- **The part as text:** `partTimeline(film, {from, to})` / `timelineText(rows)` — each scene that starts and each
  beat that lands, with its time, phrase and recipe entry: what a reviewer (or a model) reads before looking at
  frames.

## 0.7.0 — the cast: one film, another language and place

### A release folder holds only what is posted
- Each target's folder (`<out>/<target>/`) now holds the video, its caption files, the thumbnail and post.json +
  post.txt — nothing else, so it is the folder you upload from. The render's working files and its record
  (making-of.json) go to `<out>/work/<target>/`; the posted files are linked from there (one copy on disk; copied
  where a link cannot be made). `Released.work` names that folder; a target called `work` is refused.

### The cast: one film, another language and place
- **`cast`** on `compileFilm` and `makeFilm`: `{role: {name, …}}`, who is in the film as configuration. `{{role}}`
  in the storyboard, the recipe and the string table becomes the role's name before anything reads it (the voice,
  the beats, the cards); kits get the cast frozen as `context.cast` (a context story kit) and in a stage kit's
  compile options, and read the rest of a role (a look, an outfit) as they choose. It is hashed into
  `film.inputs.cast`, so an approval locks it. `readCast`, `castText`, `withCast`. A `{{role}}` the cast lacks or a
  role without a name refuses with the fix. Without a cast and without `{{…}}`, nothing changes.

## 0.6.0 — a release for a big screen: 4K, a finer encode, the poster as thumbnail, AI said so, chapters from titles

- **A larger picture, redrawn sharp:** a layout takes `scale` (1–2; `layout.mjs · formatScale` checks it keeps the
  size whole and even), and a release target too: `{target: 'youtube', scale: 2}` is 3840×2160 (4K). Every line
  and word is drawn at that size; the boxes a layout reports are in output pixels.
- **A finer encode for posting:** `render: {quality: 'high'}` encodes slower and finer (x264 slow, CRF 16) and
  converts the colours with HD video's matrix, tagged so (BT.709). The default encode converted with FFmpeg's SD
  matrix and left the colours untagged, which players read as HD's — reds and greens a little off; it is unchanged
  ('standard'), and its segments keep their keys.
- **The thumbnail from the film:** `post.thumbnail: 'poster'` draws the recipe's poster at the platform's thumbnail
  size (filling it, centred, under its byte limit); a film without a poster is refused before anything renders.
  A platform that takes an uploaded thumbnail (YouTube) no longer gets the poster baked into the video's first
  frame (a one-frame flash of the title before the film): the render's new `posterFrame: false`, which a release
  sets for it; the default (true) and its segment keys are unchanged.
- **Made with AI, said so:** `post.synthetic` lists what in the film is realistic and made with AI (`['voice']`).
  YouTube and YouTube Shorts set `alteredOrSynthetic` from it — YouTube asks creators to disclose a synthetic voice
  narrating — and post.json keeps the list. post.txt says yes / no for a yes-or-no field.
- **Chapters come from titled scenes:** a titled scene starts a chapter and an untitled one goes on with the one
  before it (`render.mjs · sceneChapters`), so a film with a few titled parts no longer lists every scene by its id
  — which YouTube's chapter rules then thinned, keeping an id and dropping a title. A storyboard with no titles at
  all still makes every scene a chapter, by its id.

## 0.5.0 — release: one call, every platform

### Release: one call, every platform
- **`makeRelease({targets, post, out, …makeFilm options})`** (`footprint-storyreel/release`): one interface, one
  adapter per platform — `youtube`, `youtube-shorts`, `linkedin`, `tiktok`, `instagram-reels` — each imported only
  when a release names it. An adapter holds its platform's strategies as data: the video's shape (a layout), its
  length, the text fields and their limits, the thumbnail, who the platform is for (`audience: {minAge, kids}`)
  and how the text is composed (YouTube's description gets the chapters by YouTube's rules: the first at 0:00, at
  least three, each at least 10 s). Each target gets a folder: the video, caption files, thumbnail, `post.json`
  and `post.txt`. A post says who the film is for (`audience: 'kids' | 'general'`): YouTube marks a kids' film
  made for kids, the 13-and-over and 16-and-over platforms refuse it with the fix (a teaser for parents). What can
  be known before rendering refuses before a frame is drawn. Every adapter says when its facts were checked
  (`facts`), and a target may override a limit. Your own adapter: an object of the same shape (`checkAdapter`).

## 0.4.0 — re-render only what changed; approve a film; acting, match cuts and held layers; checks on the finished file

### Who says each word
- **A word's own `speaker`** in the timings (written by a voice step that knows who said what) wins over the scene's:
  `clock.speaking(t)`, `clock.turns()` (now one turn per run of words by one speaker), `gaze` and `mouthAt` follow
  it, so the narrator and the characters can take turns inside one scene. A word with no speaker is the scene's
  speaker, or the narrator; without word speakers nothing changes (`clock.words` keeps a speaker only on a word that
  carried one). A word speaker that is not a word refuses, naming the word. A segment's key holds the word speakers.
- **Captions end a sentence that ends inside a quote or a bracket** (`tomorrow!"`, `me?'`, `done.”`), so a caption no
  longer runs on into the next sentence.

### Listening
- **`film.listening`** (`footprint-storyreel/listening`): what the sounds of the changes of picture ask of the
  ear — more than 60% of four or more changes making a sound (about half should be silent), or the same cue
  twice running; `"listening": "refuse"` refuses them. The worlds example now lists its wipe and iris both
  sliding.
- **The same sound twice** means two neighbouring changes of picture: a sound, a silent change, then the same sound
  again is the rhythm the rule asks for, not a finding.
- **Each role measured apart** (FFmpeg's ebur128 meter: under a second for a 10-minute film): a render measures the voice and the effects before it mixes them
  (`result.loudness.roles`, LUFS) and lists the effects in `result.listening` when they are less than 10 LU
  under the voice; `makeFilm` writes both lists into `making-of.json`'s `listening`.

### Check the finished file
- **`checkVideo({file, film?, captions?, voiced?, joins?, intro?, expect?, checks?, probe?})`** reads the finished
  file itself and reports what a person would catch watching it: picture and sound of different lengths, or a
  length outside the brief (`duration`); a blank run the film does not mean (`blank`); a frame unlike both its
  neighbours, which are alike (`flash`); a cut a frame early or late, a frame repeated where segments join
  (`handovers`); words not heard in a voiced render (`voice`); captions out of order, past the end, or away
  from their first word (`captions`). With the film, what it meant is never reported; a check that needs what
  was not given is skipped, saying why. The probe is an adapter (`ffmpegProbe()`), each check a strategy
  (`footprint-storyreel/finished`). **`makeFilm({check: 'report' | 'refuse', expect})`** runs them as a stage of
  its own (`check-finished`) and writes `finished` into `making-of.json`.
- **Lips in sync** (`lipsync`): every mouth a kit draws (a world's `mouthsAt(t) → [{who, open}]`, collected by
  `film.mouthsAt(t)`) against the finished file's voice, every 10 ms: how far the mouths lead or trail it (sound
  more than 45 ms ahead or 125 ms behind is seen: ITU-R BT.1359), a mouth moving while nothing is heard, a
  speaker heard with the mouth shut (a mouth that moves in silence for under 0.15 s — usually a word's end timed into
  the silence after it — is worth a look, not a problem). **`mouthAt(clock, t, who)`** (`footprint-storyreel/acting`): the mouth the
  kits had each written for themselves — open only while its owner says a word, about once a syllable.
- The checks were reviewed against real renders (36 renders, every example, 10/24/30 fps, motion blur, a vertical
  layout, intros, parts, segments) and planted faults; what that found is fixed: the sound is read at 16 kHz (at 8 kHz
  an /s/ read as silence and a correct film was refused); each mouth is lined up around its own speaker's words (with
  two speakers the lag was never reported); a part (`from`, `to`) is checked as the part; a cut is expected on the
  very frame the encoder shows it (a rounding at the last bit of the clock reported "a frame late"); an intro is never
  taken for a blank film; a silent scene's directions are never counted as captioned words; lips are skipped, saying
  why, when no kit draws a mouth; ffprobe is found on the PATH when it is not beside the FFmpeg given, and a check that
  cannot run is recorded (`finished.error`) unless the render must refuse. `film.rows[i].stage` names the entry a row
  begins with.
- **Fixed: the last frames of every film were lost** (also in 0.3.0). FFmpeg's `-shortest` stopped a copied
  picture a few frames early when it was muxed with the sound (4 frames of a 35 s film at 30 fps); the sound is
  now padded to the picture's exact length (frames / fps) and both end there. Found by the first run of the
  checks above.

### Through a thing: match cuts
- **`through`** (family `match`): the camera goes through a thing in the old picture — a window, a screen,
  a ring (`shape: "round"`) — and the new picture is what was inside it: fitted in the opening, zoomed about
  the one point that zoom leaves still until it fills the frame, the opening widening to the frame's edges at
  the end. `"enter": {"type": "through", "region": "window"}`.
- **`match`**: a thing in the old picture becomes the same thing in the new one (`region`, and `into` when the
  new picture names it differently). The old picture pushes in on its thing, the new one pulls back from its
  own, and they meet half way — same place, same size — at a quick dissolve. Both cameras only zoom in, so the
  frame is always covered: things far apart meet larger.
- **Held layers**: a world's `overlay(ctx, t)` is drawn on the frame, over the picture and outside its camera, so a
  transition or a director's push never moves it (a presenter in the corner); through a change of picture the leaving
  shot's layer crosses into the arriving one's, mixed as light is (`layerCrossfader` in
  `footprint-storyreel/transitions`), so the same layer in both shots stays exactly itself.
- **The built-in kits name what they draw**: a whiteboard item takes a `name` (one word), and the cartoon kit
  names its scenery as its camera shows it — `sun` (it sets with the evening), `shepherd`, `sack`, `pen`,
  `gate`, and `bulb` once the eureka shows. `examples/match` turns a whiteboard circle into the cartoon's sun
  and goes back through the shepherd's idea (the bulb) to the board, then checks the finished file.
- A `through` opening widens to the new picture's own edges (a round one squaring its corners as it goes), so
  nothing of the old picture shows through a gap before the last frame.
- **The contract**: a transition may say which things it looks for, `regions: p => ({from?, to?})`, and
  reads them in `draw(ctx, {…, boxes})`. The film finds each one once, when it is built (the leaving
  picture's at the change's first moment, the arriving one's at its last), so a frame stays a pure function of
  time; a name the picture does not have, or a thing off the frame, refuses, naming the names there are. A
  setting may be `{name: true}` (required) or `{name: true, default: null}`.
- `docs/transitions.png` redrawn with the two new rows.

### Acting: changes, not swaps
- **`footprint-storyreel/acting`**: `moodAt(keys, t)` acts a mood change the way an animator times a
  reaction — `anticipation` (the eyes close over the 0.1 s before the change and open over the 0.08 s after,
  so the face swaps while they are shut), a `take` (a damped swing up to the key's `take`, back past rest by
  12% of it, still at 0.4 s), a colour cross-fade `u` and a spring `settle`. `idleAt(t, {seed})`: breath,
  blink on an uneven rhythm, sway and a glance now and then, different for every seed so two characters never
  move in step. `follows(f, delay)`: the head follows where the eyes went. Keys out of order refuse.
- **One change at a time**: changes closer than one change takes to settle (max(fade, settle)) refuse, and so
  do two moods at one moment and timings that are not seconds above 0; a key that repeats the mood is no
  change. Every number a kit reads moves smoothly from frame to frame. `idleAt` refuses periods that are not
  seconds above 0 (`blinkEvery: Infinity` or `blinkFor: 0` never blinks) and finds the blink at any moment in
  the same time.
- **The cartoon kit acts**: the shepherd squints into his eureka, the face swaps under the squint and the head
  jumps and settles (it used to swap in one frame); each sheep blinks on its own rhythm. The pixel pins were
  re-recorded for this: 5 of the shepherd example's 24 pinned frames and 2 of the worlds example's changed.

### Reads, and a fairer reading pace
- **`reads`** on the story and on every stage (beside `intent` and `continuity`): what the viewer must take in,
  each `{what, at, min?, region?}`. `film.reads` lists them timed, with a `problem` when two overlap, when the
  shot ends before one lands, or when its `region` is not drawn then; `"reading": "refuse"` refuses them. A read's
  phrase is logged with its recipe path like every other line.
- **`"reading": {"rule", "pace": "letters"}`**: 1.5 s + a fifteenth of a second a letter (`LETTERS` in
  `footprint-storyreel/reading`), fairer to short labels than the words pace (still the default).

### Numbers shown in digits, said in words; listening back
- **Number slots**: a scene's `say: [[shown, spoken], …]` — the captions show `shown` ("16.67 ms"), the voice
  says `spoken` ("sixteen point six seven milliseconds"). The scene's text is what is spoken (`spokenText`,
  `sceneText`), a beat may name a phrase as shown or as spoken, and captions and caption files collapse the
  spoken run back into what is shown (`clock.shownWords(i)`). A slot not in the narration, out of order or
  spoken in digits refuses. `unsaidNumbers(storyboard)` lists digits without a slot.
- **The voice check in the record**: `makeFilm` reads the voice folder's `word-check.json` into
  `making-of.json` (`voice`: words scored low, words the listen-back did not hear, stale when older than
  the timings); `voiceCheck: 'refuse'` refuses a film with a word not heard (`readVoiceCheck` on
  `footprint-storyreel/pipeline`). The voice tools' check transcribes the audio freely and lines it up with
  the script, because forced alignment cannot see a dropped word.

### What a film is made from, and approving it
- **`film.inputs`**: what the film was made from, hashed (keys sorted first, so reformatting changes nothing):
  the storyboard, the timings, the recipe, the strings, the data, the theme, and every file it read through
  its root (code excerpts, a kit's `readFile`/`insideRoot`), by path. `making-of.json` lists them as `inputs`,
  with the pacing, the voice's audio (each file by name, length and bytes) and, with `makeFilm({code})`, a
  fingerprint of the kits' code.
- **`approveFilm({record, by, note?})`** approves a render as it was watched: from its making-of.json (the path
  or the object). **`makeFilm({…, approval})`** refuses to render anything else — once the film is compiled,
  before a frame is drawn — naming what changed (a file by its path) and the approver's own date;
  `making-of.json` keeps the approval and says what it does not lock (the render settings; the kits' code
  without a fingerprint). `checkApproval` is exported (`footprint-storyreel/approval` adds `stableJson`,
  `requireApproval`, `voiceHash`, `readApproval`, `unlocked`). Anything that is not an approval refuses as one.
- **`voiceCheck: 'refuse'`** also refuses a voice with no word check, one older than the voice's timings, or one
  that only aligned the words and never listened back.
- An approval is of the whole film: `making-of.json` says what part a render shows (`span`), and a render of a
  part refuses to be approved. A render the approval refuses leaves the approved render's narration folder as it
  was (the new one is paced aside and moved into place only once the film is allowed).

### Re-render only what changed
- **`segmentedVideo({store, recipe, code?, force?, samples?, parallel?})`** — a picture strategy for
  `renderFilm({…, video})` and `makeFilm({render: {video}})`: the film in segments (one per row of pictures,
  `film.rows`, from when each shot's entrance starts; rows under `minSeconds` join the one before), each kept
  in a store under a key built from what draws it on its own clock (its entries, the guess cards over it, its
  lines, words and notes, `film.inputs`, the frame settings, the code), reused when the key and a spot check
  of `samples` frames — painted as the video shows them, at the same places in the segment — match, drawn
  again otherwise or when `force` names it, then joined without re-encoding. A segment that moved is reused
  only when its frames did not move with the film's clock. The sound is mixed for the whole film every time.
  `result.video` (and `making-of.json`'s `picture`) says which segments were drawn, which reused, and why.
- **Every frame once**: a row whose entrance starts before the row ahead of it takes over from it (that row's
  entries join it), so the segments never overlap; with motion blur a segment that starts at a cut draws the
  row before it too. A segment lands in the store whole or not at all; a file cut short is never reused; when
  one segment fails the others stop; the default joiner runs the render's own FFmpeg.
- **Three seams**: the strategy (`wholeVideo()` — the default, one pass — or `segmentedVideo()`), the store
  (`folderStore(dir)`) and the joiner (`ffmpegJoin()`), each replaceable. `planSegments`, `segmentKey` and
  `codeFingerprint` (code, data, images and fonts, TypeScript too) are exported for tools that want the plan
  or the keys.
- **`makeFilm` draws the picture as a fan-out**: a `plan-picture` stage, then one footprintjs subflow per part
  (`render-picture`), then `render-film` joins and finishes; a whole-film render is one part.
- **`film.rows`**: the film as rows of pictures — when each starts to arrive, the recipe entries that draw it,
  and how it arrives (a pushIn film is one row).
- `renderFilm` is now `prepareRender` (the checked job and its one way to encode frames) → a strategy →
  `finishRender` (sound, mux, chapters, captions); the output is unchanged, and an FFmpeg that fails while
  encoding frames — or cannot start — now refuses instead of passing silently or crashing the process.

## 0.3.0 — shots planned like a film crew plans them; transitions as a collection; one film in every platform's shape

### Planning the shots (borrowed from how a film crew plans a shot)
- **`intent`** on the story and on every stage: what the shot is for, in one sentence (at most 140 characters;
  a second sentence refuses — one shot, one beat; abbreviations and initials are not sentence ends).
- **`continuity: {start, end}`**: the facts true when a shot starts and ends. The compile carries them forward
  in film order and refuses a shot whose start contradicts the story so far, naming the shot that last
  stated the fact and a fix that works (end the shot before it with the new fact).
- **Too much, too fast** (`film.watching`, the studio's list, `"watching": "refuse"`): more than 4 moments in
  2 s is a burst. Each shot's moment count is information (`film.shots[i].moments`), never a verdict.
- **Framing by name**: a director's push may aim `on` a thing the kit names (`regionsAt → {name}`), with
  `size` medium, close or insert; the zoom follows from the thing's size, and a framing that cannot be honoured
  (already too big, or too small for ×3) refuses, naming the framings that would work. Every world is ready
  before a push reads its regions. `Region.name` is new.
- **Listeners look at the speaker**: `clock.gaze(t, who)` (with `also` at a hand-over) and `clock.turns()`.
- `film` gains `shots` (in film order) and `watching`; the recipe gains `watching` (so `watching` can no longer
  be a host key); the new entry point is `footprint-storyreel/shots`. The engine now reads `intent` and
  `continuity` on the story spec and leaves them out of what the story kit gets; inside a world stage's
  `world` they refuse (they belong on the stage).

### Earlier, unreleased
- **The loudness flag says what to ask for** (`pipeline.mjs · loudnessRecord`): when one fixed gain was
  blocked by the true-peak limit, the making-of record's flag names the loudest target one gain can reach
  here (`I + (TP limit − measured peak)`, rounded down): "ask for loudness I -18.6 or lower to keep one fixed
  gain". No advice when the peak was not the cause.
- **Characters that talk** (`clock.mjs · makeClock`): a storyboard scene may name its `speaker` (`"speaker":
  "robot"`: a word; anything else refuses). The clock — the one a story kit is compiled with — answers
  `clock.speaking(t)`: `{scene, speaker, word, start, end}` while a word is being said, `null` between words
  and in a silent scene, so a kit moves the right character's mouth with the voice; `clock.words(scene)` lists a
  scene's said words on the film's clock. The voice step decides what `speaker` sounds like (the starter maps it
  to a voice profile); the engine reads it only here. Types: `StoryboardScene.speaker`, `Clock.words`,
  `Clock.speaking`.
- **Transitions: a collection, like a video editor's** (`src/transitions.mjs`, `footprint-storyreel/transitions`):
  a shot's `enter` names one of twelve — `cut`; dissolve `fade` · `dip` (`color`); wipe `wipe` (`from`) · `split`
  (`line`) · `clock`; `iris` (`at`); motion `push` · `slide` · `whip` (`from`); `zoom` (`at`); `page` — each with
  a family, a default length, ease and sound, and checked settings. Every entrance also takes `seconds`, `ease`
  (any name in the ease table; `back` and `spring` only where the frame's edge would not show: `slide`) and
  `sound` (a sound's name or `false`). A kit adds its own (`kit.transitions`), named in a recipe like a built-in
  one; a kit may not take a built-in name or another kit's. One drawing contract for all:
  `draw(ctx, {e, from, to, p, ghost, theme})` (`ghostPainter` is the see-through scratch picture the fade always
  used, now shared). `transitionSheet({catalog})` puts any collection on one PNG (the README's picture,
  `examples/transitions.mjs`); the studio shows it under **Transitions** (`load()` may return `kits`). `TRANSITIONS`,
  `TRANSITION_NAMES`, `transitionCatalog`, `readEntrance`, `CUT`. The five that shipped before draw the same
  pixels and make the same sounds (the pixel pins are unchanged). **Changed:** the refusal for an unknown
  entrance lists the collection (`enter must be a transition: cut, fade, …`), and `at` is now a setting of
  `iris` and `zoom` only — `{"type": "fade", "at": […]}`, accepted and ignored before, refuses.
- **One film, every platform** (`src/layout.mjs`, `footprint-storyreel/layout`): `renderFilm({…, layout})`
  renders the film as `landscape` 1920×1080 (YouTube, X, LinkedIn), `square` 1080×1080 (feeds), `portrait`
  1080×1350 (Instagram and Facebook feeds) or `vertical` 1080×1920 (Shorts, Reels, TikTok): a title band
  (`header: {title, sub?}`), captions burned in (`captions: true | {maxWords, size, box}`), and in portrait and
  vertical a 4:3 crop that follows the action (`crop: [{at: beat, x, width?}]`, eased; `width` up to 1600 shows
  the whole frame with paper above and below). The bands sit where the phone players leave room (in
  vertical, title, film and captions all between y 285 and 1460: under the app's top bar, above its text,
  the captions under the film so they never cover the picture), take the film's paper, ink and sans type
  (`film.theme`, new) unless the layout names `background`/`ink`, and move with `box`. A layout is data:
  unknown keys and misplaced bands refuse. Only landscape takes an `intro`. `compileLayout`, `FORMAT_NAMES`,
  `formatOf`, `cropWindow`. The result carries `format`.
- **Captions** (`src/captions.mjs`, `footprint-storyreel/captions`): built from the word times the film already
  has — never a silent scene's directions. `captionChunks(film, {maxWords, maxChars, breaks})` (a chunk takes
  one word more rather than leave a clause's last word alone); the word being said is highlighted
  (`captionAt`, `drawCaption`); the poster shows the title band without a caption. **Caption files**: `renderFilm({…, captionFiles: true | ['vtt'|'srt']})` writes
  `captions.vtt` / `captions.srt` beside the video on its clock (whole sentences, at most two lines of 42),
  for players that show their own captions; `captionFile(chunks, kind, {offset, from, to})`.
- **Motion blur** (`renderFilm({…, motionBlur: 4 | {subframes, shutter}})`): each frame the average of 2–16
  moments over `shutter` (default half) of its time; the bands and the poster are never blurred. Without a
  layout or motion blur a render is the same as before.
- **`spring`** joins the ease table: a closed-form damped spring (damping 0.7), overshooting about 4% and
  settling, exact at both ends.
- `makeFilm` writes the version it made into `making-of.json`: `version: {format, motionBlur?, captionFiles?}`.
  Examples: `examples/formats.mjs` (the hello film in all four formats), `examples/transitions.mjs`.

- **The compile record** (`record.mjs · recordSteps`, `film.mjs · compileSteps`): `compileFilm({…, record:
  true})` runs the compile as a footprintjs flowchart of five stages — read inputs, build worlds and stages,
  guesses and notes, checks, resolve lines — each running its own segment of the existing compile (the
  segments are one generator; with the record off they are simply drained, in the same order). Stages write
  small values only: `recipe`, `lines`, `world.<path>`, `stage.stages[i]`, `guess.guesses[n]`,
  `note.notes[i]`, `checks.*`, and `when.<recipe path>` = seconds for every line resolved. The run uses
  `writeProvenance: 'reads-prefix'`, so `sliceForKey` (footprintjs/trace) walks back from a line to the stage
  that read the scenes' seconds. The film carries `record: {narrative, snapshot}` (detached; survives
  structuredClone); a refused build's error carries `record` too. `record` other than true/false refuses.
  Off (the default) the return keys and the pixels are unchanged (the pixel pins are unchanged). The
  director's notes as applied are now computed just after the push notes are placed (before the reading
  check); nothing they read changed. `makeFilm` records the compile and writes its narrative to
  `making-of.json` under `compile`. Types: `CompileRecord`, `Film.record`, `CompileFilmOptions.record`. A
  benchmark: `node bench/compile.mjs [runs]` (median milliseconds per example, record off and on).

- **The kit context** (`film.mjs · kitContext`): a story kit that declares `context: true` is compiled as
  `compile(spec, context)`, one frozen object `{clock, motion, theme, root, library, labels, insideRoot,
  readFile}` (`library` and `labels` are empty until a recipe carries them). `readFile(path)` loads only from
  inside the root folder (`files.mjs · insideRoot`: a sibling folder or a link out refuses). The context has
  no way to draw the film. Older kits keep `compile(spec, clock, motion)`; the speed-note rule is the same for
  both; `context` other than true/false refuses. Types: `KitContext`, `ContextKit`, `StoryWorld`;
  `compileFilm` and `makeFilm` take both kinds of kit (two signatures, so an inline kit on today's contract
  keeps its contextual types).
- **Ready** (`film.mjs · readyOf`, `readyWorlds`): a world may return `ready`, a Promise (e.g. its images
  decoding); `compileFilm` waits for every one before drawing the recipe's `recalls` and before returning. A
  `ready` that rejects refuses the film, naming the world; one that is not a Promise refuses.
- **One ease table** (`src/ease.mjs`, `footprint-storyreel/ease`): `EASES` = `linear in out inOut back walk
  jump`, `easeNamed(name, where)` (an unknown name refuses, naming the eases). `inOut` is exactly the
  whiteboard's `ease`; `kits/whiteboard/board.mjs · ease` is now that curve under its old name, and
  `film.mjs` and `notes.mjs` read it from the table. No easing changed: the pixel pins are unchanged.

- **Silent scenes with directions** (`clock.mjs · directionTimings`): a storyboard scene may carry
  `"silent": [["the door opens", 1.0], ["Mia walks to the stall", 3.0]]` in place of `narration`. The clock
  treats a direction like a spoken phrase (`["open", "the door opens"]`, with `plus`, `edge`, `nth`);
  directions are never spoken. `directionTimings(scene, {tail?})` spreads each direction's words evenly
  over its seconds (alignment method `directions`); `evenTimings` uses it for silent scenes;
  `withDirections(storyboard, timings)` fills in the silent scenes a voice left out (used by `makeFilm`,
  `paceTimings` and `applyPacing`); `speechIndex` and `makeClock` read a silent scene's directions as its
  text (`sceneText`). A scene with both `narration` and `silent`, or neither, or a direction that is not
  `[words, 0.2..20 seconds]`, refuses with the fix (`clock.mjs · checkScene`). Pacing refuses a hold in a
  silent scene, naming it; the scene's tail still applies. `applyPacing` writes a generated silence
  (`silent-<scene>.wav`, at the voice's rate) when the voice folder has no audio for a silent scene, and
  `renderFilm` generates it when there is no pacing (`render.mjs · joinVoice`; a spoken scene with no
  audio refuses). The studio's transcript marks direction words `spoken: false` and shows them dim and
  slanted. `types/index.d.ts · Storyboard` allows `silent` (`Direction`, `StoryboardScene`). Existing
  films are untouched: the pixel pins are unchanged.

- **Loudness in two passes** (`render.mjs · muxWithLoudness`): `renderFilm` measures the whole mixed film
  (`loudnorm` with `print_format=json`), then sets it with one fixed gain from what was measured
  (`measured_I/TP/LRA/thresh`, `offset`, `linear=true`), so a quiet opening is no longer raised to the
  voice's level. `renderFilm`'s result carries `loudness: {type, target, measured, reason?}` — `type` is the
  normalization type FFmpeg reports for the second pass (`linear` or `dynamic`), or `skipped` — and
  `makeFilm` writes it into `making-of.json`, with a `flag` whenever the type is not `linear`. The target
  takes an optional `LRA`.
- **A render of only a silent opening works** (the BACKLOG bug): when the measurement finds no loudness
  (pure silence, `-inf`), normalisation is skipped instead of handing the AAC encoder NaN.
- **One fixed gain is kept for a wide range** (review round): with no `LRA` set, the second pass asks for
  the measured loudness range (rounded up, 7..50; `render.mjs · effectiveTarget`) — in linear mode
  `loudnorm` reads it only as a gate, so the hello film now comes back `linear` instead of `dynamic`. A
  perfectly steady sound (range 0, FFmpeg's "not measured") is sent as 0.1 and stays linear. A skipped
  pass names its real reason (silence, or `could not read: <fields>`); a missing or killed FFmpeg fails
  with its own error instead of "is this FFmpeg built with loudnorm?". The `loudness` option is checked
  (`render.mjs · checkLoudnessTarget`): I and TP required, LRA optional, each finite and in FFmpeg's
  range; any other key refuses with the fix (`loudness.lra is not a key: use LRA …`).
- **The recipe's top level is checked** (`film.mjs · checkRecipeKeys`): `story`, `whiteboard`, `pushIn`,
  `card`, `stages`, `guesses`, `notes`, `recalls`, `poster`, `reading`, `paperStyle`; any other key
  refuses with the list and the fix. A host application names the keys it reads itself in the new
  `hostKeys` option of `compileFilm` and `makeFilm` (e.g. `hostKeys: ['terms']`); the engine ignores them.
  Every known recipe was swept first: only a glossary under `terms` needs a `hostKeys` entry.
- **Sounds are checked when the film is built**, not only after rendering: a kit sound with an unknown
  name or a gain outside 0..1 refuses, naming the kit and the sounds there are (`sound.mjs · checkSound`),
  and a scene with more than 64 sounds refuses, naming the scene. One rule says which scene a sound falls
  in (`sound.mjs · soundsByScene`), used by both `compileFilm` and `renderFilm`.
- **Five new sounds**: `door`, `step`, `click`, `whoosh`, `crumble` (original procedural synthesis, short
  and quiet). Every sound has a default gain, and a sound event may carry `gain` (0..1) that overrides it;
  `compileFilm` keeps the gain of story-kit and stage-kit sounds in `film.sounds`. A gain is relative to
  its scene (a scene is scaled by one factor set by its loudest moment). The first five sounds produce
  the same samples as before (pinned in `test/sound.test.mjs`).
- **Files stay inside `root`, for real.** The root-folder check (`files.mjs · insideRoot`) compares real
  paths with `path.relative`: a sibling folder whose name begins like the root (`../film-private/x.ts`
  with root `/x/film`, which the old prefix check let through) and a symbolic link that leads out of the
  folder are refused, with a message that names the fix.
- **`frameHashes(film, {times})`** hashes the moments you name (seconds inside the film) instead of 24
  evenly spaced ones; anything else refuses.
- **Safety pins for the motion grammar's refactors** (no film draws a different pixel):
  - a new example, `examples/recap` (a recap strip of the film's own frames and a teaser), pinned in
    `test/golden.json` — nothing pinned the teaser before;
  - behaviour pins (`test/behaviour.json`): for every example film, `film.reading`, `film.moments()` and
    the refusal a push note gets across each change of picture;
  - the restore test runs on every example film and also checks compositing, shadow, filter and a
    leaked clip (a full-frame fill must reach the corners).
  - `examples/recap` also takes a director's cut into its code stage and a `summary` stage handed over to
    on the page, whose closing line is too short to read, so the behaviour pins reach the hand-over's
    settle (`film.mjs · arrivalOf`), a zero-length change and `film.reading`; a test fails if no pinned
    film carries them.
- `frameHashes` refuses two moments that round to the same millisecond (one would be lost), and `count`
  together with `times`; a bad moment that is not a number is quoted. `insideRoot` refuses a `root` that
  does not exist with a message naming the fix.
- README: screenshots shown as evidence are in scope; marketing polish is not.
- Code is tokenized with no time limit (`kits/paper/code.mjs · tokenize`): Shiki's 500 ms per-line
  limit made a busy machine tokenize the same code differently, or throw (`startIndex` of undefined).

## 0.2.0 — first release for other projects

- **Director notes** (`recipe.notes`): `speed` (every camera move), `cut` (a scene starts on a hard cut;
  also `enter: "cut"`), `push` (the camera pushes in on a point from one phrase to another). A note the
  film cannot honour refuses; `film.notes` and the making-of record list each as applied.
- **Preview studio** (`footprint-storyreel/studio`): a local, read-only page — scrub, play with the voice,
  click a drawing to see the recipe entry (and its line) that drew it; compiles again on save.
- **What drew this spot:** `film.regionsAt(t)`, `film.pointAt(t, x, y)`, and the recipe path on every beat.
- **Reading time:** `film.reading` lists lines shown for less than about 0.3 s a word; `"reading": "refuse"`.
- **Stills:** `film.moments()` (settled pictures and changes half way) and `contactSheet(film)`.
- **A poster:** `recipe.poster` names a frame; the renderer writes `poster.jpg` and makes it the video's first frame.
- Story kits receive `motion` (`{cameraSpeed}`) and may declare `motion: ['cameraSpeed']`, `regionsAt(t)`, `texts()`.
- A push-in that would still be running when the card moves aside now refuses the recipe.
- TypeScript types. The `hello` example's push-in is quicker (0.3 s rest, 1.8 s turn) so its caption can be read.

## 0.1.0

The engine as used by the AgentFootprint video course: storyboard + recipe → one seekable film,
whiteboard / paper / cartoon kits, worlds as shots with fades, wipes, irises and page turns,
pause-and-guess, a string table, pacing for voiced and silent cuts, pixel pins, a footprintjs making-of record.
