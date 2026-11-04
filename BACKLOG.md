# Backlog

Ideas agreed with the owner, not started. Each gets built only after a go.

## 1. Recipe kinds: one engine, several kinds of film

Today a recipe describes one of two shapes (a lesson, or an episode of shots). The next step is to
name the **kind** of film a recipe is, so each kind brings its own defaults, checks and generator:

| kind | what it is | exists |
|---|---|---|
| `lesson` | story → push-in to a card → paper stages → recap (the AgentFootprint course) | yes |
| `episode` | worlds and paper as shots, pause-and-guess (a children's series) | yes |
| `explainer` | a library explains itself: what it is for, the problem, one real run, the one call you write, where to get it | no |
| `teaser` | a 30–45 s vertical (9:16) cut of any film: the question first, the eureka, one line of code, where to watch | no |

- **The explainer is generated, then reviewed.** A command reads a repository — its README, examples,
  exports, a real run of an example — and writes a draft **storyboard and recipe** (data only, never
  code), in the spirit of [`/brag`](https://github.com/latent-spaces/brag). A person reads and approves
  them before anything is voiced or rendered. The honesty rules stay: every value on screen comes from
  the run, every line can be read in time, every film says how it was made.
- **A brand kit for explainers**: a logo, colours and fonts in, a theme out (the library's own site
  tokens), so a library's video looks like its docs.
- **The teaser** is drawn from the same recipe: the hook in the first three seconds (the question, not
  the title), then the one moment that matters. The vertical shape itself exists now (`layout.mjs`: the
  four formats, with captions and crop keys); what remains is the *cut* — choosing which moments of a
  longer film a 30–45 s teaser keeps.

## In scope, and still not in this package

**In scope:** a screenshot shown as evidence in a teaching film — a real screen, a real result — so the
viewer sees the actual thing (motion grammar, decision 1; the picture symbol, motion grammar phase 1d,
will load it from inside the film's root folder, through `files.mjs · insideRoot`).

**Still not in this package:** marketing polish — launch videos, brand campaigns, sales funnels,
polished product shots, HTML scenes. Use a launch-video tool such as `/brag`. An `explainer` teaches
what a library does; it does not sell it.

## From the 2026-10 tool scan (owner approved 2026-10-27) — all five shipped in 0.23.0

1. **Platform safe zones.** Each vertical target (youtube-shorts, tiktok, reels) declares, as data, where the app draws its own UI: the title/channel strip at the bottom and the action column on the right. Captions and the title band stay inside the safe area, and a check refuses a frame where they would be covered. Borrowed from ffmpeg-skill's delivery templates.
2. **Loudness per platform.** Each target names its integrated-loudness goal (Shorts and TikTok −14 LUFS), instead of one −16 for all.
3. **`storyreel doctor`.** Before a long render, ask the local FFmpeg which components the job needs (libass, loudnorm, xfade …). Report available / missing / unknown, and never guess "available".
4. **A scored self-review.** A fixed rubric for a draft, scored 1–10 from stills and the timeline: hook in the first seconds, readability of numbers and words, acting, clarity of the one idea, and sound sync. Fix the lowest three until all are 8 or higher. Record it in the making-of.
5. **A phone-size check.** Render review stills at phone size with the platform UI overlay drawn on top, so readability and covered captions show up before upload.

## From a two-language product film (2026-10-29) — proven in a film's own kits, to move into the library later

A 90-second product film was made twice from one set of film data, in English and in Arabic (right to left), with
its pieces written as small data-driven kits so they could move here. Each is general: it serves explainers and
teaching films as well as the film it was made for. Not started; each needs a go. (Scope note: this backlog's rule
above keeps marketing polish out of the package. These items are capabilities, not campaigns.)

1. **A footprintjs run as a flowchart world.** Draw a chart from a REAL run: its stages, decisions with branches,
   subflows, and the path the run took; footprints that walk it (left and right, turning with the path, taking the
   branch the decision chose); and the backtrack from foottrace's `sliceForKey` lighting back to the root, which
   ends on a root-cause card. Also inside a device frame (an app on a tablet). The strongest piece: it ties the
   films to footprintjs itself, and every value on screen comes from the run.
2. **A people kit of modern adult characters, with looks as data.** Skin, hair, outfit kinds (apron, tee, hoodie,
   abaya, thobe) and headwear (headset, hijab, shemagh). Acting poses: walk, phone to ear, facepalm, think,
   cheer, wave, hold a tablet. A cast line-up sheet comes with it. It sits beside the cartoon kit's figure,
   for films about grown-ups at work.
3. **Editions: one film, several versions.** A version file carries the cast, every on-screen string, the
   currency, the shop's products, the narration with its voice take, and the reading direction. This extends
   today's `cast` and string tables. **Right-to-left** is a layout rule, not a redraw: chart direction, chat
   sides, cards, captions, Arabic digits, and a font rule (an Arabic face without Latin digits draws empty boxes).
4. **Thought transitions.** `thought`, the partner of `cloudBurst` for going in: bubbles rise from a character,
   a cloud opens with the next scene already alive in miniature, and the camera pushes through the cloud's
   edge, never a square. Plus a cloud burst with a payoff (the objects that fall out of it).
5. **Two named moves.**
   - A card that collapses into a headline line (the record becomes "The app found it").
   - A pull-back reveal: from a screen to the device in someone's hands, then the room, in one continuous shot.
6. **A UI-mock kit and an icon set, drawn in code.**
   - Mocks: a browser window, a phone, a tablet with an app header, a help centre, a chat assistant (with its
     right-to-left mirror), and usage meters.
   - Icons: cart, truck, page, phone, headset, ticket, calendar, invoice, coins, clock.
7. **One rule for what a voice reads**, in footprint-story's narration door: drop the quote marks around a
   character's line, but keep apostrophes inside words. A voice tool that dropped every quote mark made Kokoro
   read "won't" as "won t", in every English film voiced with it. Every voice tool should share the one rule.
8. **More voices.**
   - A multilingual voice adapter (Chatterbox Multilingual, MIT; Arabic among its languages) beside Kokoro and
     Indic Parler.
   - Whole sentences voiced for natural prosody, with word times from a licence-clean aligner (e.g. Whisper,
     MIT), not proportional estimates.
   - No non-commercial models (MMS, XTTS) for films that promote anything.
9. **A mood score with a check.** An original score synthesized to the film's clock, its mood changing on the
   cuts and ducked under every phrase. A finished check measures the voice's lead over the music phrase by
   phrase, and fails when the voice does not clearly lead.
10. **A release folder in one call.** Masters at the `high` encode, a no-sound copy, the captions, small share
    copies with posters, and a README with checksums and the licences of every voice and asset.

## Checks borrowed from "Opus 5.5 Loop Lab" (2026-10-30)

Source: an X article by @anstapnever, "Opus 5.5 Loop Lab: 3D motion loops made from code"
(https://x.com/anstapnever/status/2110392373377380473, article https://x.com/i/article/2110374956806909952). It
states no licence for its code or prompts, so the IDEAS are borrowed and the code is written here. Several of its
rules this package already keeps: a frame is a pure function of time, randomness is seeded, the motion numbers live
in one place (footprint-story/motion), cuts are rounded from the song's own times, the first frame is the poster,
and there are stills, contact sheets, sync and loudness checks. Six are new. Each is a footprintjs stage, its rules a
`decide()` table, so a run says why it passed or refused. Not started; each needs a go.

1. **An accessibility check, the first to build.**
   - Text contrast of at least 4.5:1 against what is behind it, on every frame where a word is read.
   - No more than three flashes in any one second (the WCAG photosensitive threshold); the breakdown already
     finds flashes.
   - It matters most for films children watch.
2. **A brief check before the recipe.** A brief with fixed fields: goal, format, beat, look, stage, shots,
   motion, banned, and frames to check. It refuses vague adjectives ("premium", "luxurious", "realistic") until
   they are stated as values: colours, materials, light, sizes, timings. The article's main finding is that the
   vague brief gave a generic picture and the stated one gave the intended one.
3. **A banned-defaults check.** Everything fading in at once; the same entrance on every element; text that moves
   while it is read; decorative glow or particles; centred-everything layouts. Each is measured on the timeline
   and regions, and a project can add its own, after the article's rule: name what the model used anyway, and ban
   it.
4. **A motion-grammar check.**
   - Entrances ease out; exits ease in and are shorter; moves across the frame ease in and out; linear only for
     rotation, progress and loop phase.
   - Opacity and colour never bounce.
   - One hero move per shot. Secondary moves travel 50–70 % of the hero's and start 100–200 ms later; ambient
     motion stays under 5 %.
   - It extends the laws `readMove` already keeps.
5. **A seamless-loop check.** For a looping clip, the last frame flows into the first: frames 0 to N−1 are
   rendered, never N. A value moving through the seam keeps its speed, not only its position, and a sound tail
   needs a gap or a fade at the seam. StoryDeck's ambient loops need the same check.
6. **A motion graph.** Plot one named element's position and size, frame by frame, from the regions the film
   already knows, so a jerky or badly eased move shows as numbers before anyone looks at a picture.

Out of scope for now: the article's 3D material and light cookbook. Three.js is a different renderer from this
package's 2D canvas.

## The studio's review loop, borrowed from "Direct It Like a Studio, Check It Like an Engineer" (2026-10-30)

Source: an X article by @m4lkxx, "Motion Design with Opus 5.5: Direct It Like a Studio, Check It Like an Engineer"
(https://x.com/m4lkxx/status/2112550174962651338, article https://x.com/i/article/2112529635778965505). It states no
licence: the IDEAS are borrowed, the code is written here.

Several of its rules this package already keeps:
- any frame drawn from `t` alone;
- seeded randomness;
- picture and sound on one clock;
- sync checked in the decoded file, not the source;
- loudness per platform;
- cheap evidence first (stills, sheets, strips before a render);
- only changed pieces redrawn;
- a plan shown before anything is made (`remake`, look first);
- a release folder that lists what still needs a human eye.

Eight are new. They fit the studio (local, notes on the screen, an AI that applies changes) and every review. Not
started; each needs a go.

1. **A feeling becomes a defect.** A note in the studio that says a feeling ("feels slow", "too busy", "the colour
   is off", "the transition is weird") is turned by a `decide()` table into a measurement and a candidate change:
   - "slow" becomes a shorter hold, one beat;
   - "busy" becomes one hero move, with secondary moves 150 ms later;
   - "colour off" becomes a colour probe;
   - "weird transition" becomes three frames around the seam.
   The record says which rule fired, and the person still decides.
2. **Every finding carries its evidence class:**
   - **observed:** seen in a named frame, or measured from its pixels;
   - **inferred:** several observations point to a cause, but no frame proves it yet;
   - **unknown:** not checked, or the evidence conflicts.
   The judge is the render, the reference or a measurement, never the model's own claim. This is the same law as
   the claims' evidence classes, applied to review findings.
3. **Review rounds kept as files.** Each round is a folder: the stills it looked at, the person's notes VERBATIM,
   the defects found (with frames and classes), and what changed. Each round shrinks to the frames the last one
   touched. The making-of then shows how the film got right, not only that it did.
4. **Seam stills.** For every cut and transition, three frames one frame apart around it, on one sheet. In the
   studio, a click on a transition shows them.
5. **A colour probe.** The median colour of a named region (from the regions the film already knows), measured
   against its target (a theme token or a brand colour) with a colour difference. It is how "the colour is off"
   becomes a number.
6. **Check the checker.** Plant defects on purpose: shift a colour, land a sound three frames late, leave a
   placeholder bar, cover a caption. Each review check must catch its planted defect, or it is not trusted. This
   is a mutation test for the critic.
7. **References as rules.** A reference becomes measured rules (palette in hex, type, proportions, pacing; the
   breakdown already measures pacing) plus a list of what may NOT be copied, kept beside the film.
   **Missing assets are named before production**, all at once, not one refusal per render.
8. **The delivery lists what still needs a human eye.** Every release says which judgements no check can make:
   the voice's accent, the wording, likeness. This package's release folders start doing it now; the article
   makes it part of the contract.

## The rule draws the picture, borrowed from "Math-Animals" (2026-11-02)

Source: Math-Animals by r3al1tym (https://github.com/r3al1tym/math-animals). Ten animals are drawn in Canvas 2D from
published models of their form (a logarithmic spiral, a Voronoi wing, a Turing pattern), and a 64 s film is shot
from the pages. Its licence is MIT (Copyright (c) 2026 r3al1tym), so its code may be adapted if that notice is kept
in the file it lands in. Worth reading: `kit/kit.js` (one light, pencil lines that draw themselves, a lettering
hand), `tools/render.mjs` (its determinism check), `BUILDERS.md` (one shared brief) and `CONCEPT.md` (the concept
card).

Several of its rules this package already keeps:
- a frame is a pure function of time;
- randomness is seeded;
- slow surfaces are prepared once (a kit's `ready`) and each frame composes them;
- every number on screen has a source (`facts.json`, checked by `review`);
- judgement is scored per point (`review --rubric`) on each scene's settled picture.

Six are new, and a seventh says how they fit together. Each is a footprintjs stage with its rules in a `decide()`
table. Not started; each needs a go.

1. **The construction is the picture.** In a film that explains how something works (a lesson, a science film, a
   product's flowchart), the rule is drawn first, in pencil, and the thing grows out of it **in register**: the
   drawn spiral is the one the chambers follow, the drawn number line is the one the apples land on, the drawn
   flowchart is the one the footprints walk.
   - One function draws both, so they cannot drift apart. A check refuses a construction and an object drawn from
     different numbers.
   - The build has a grammar. The construction draws itself at a draughtsman's pace. The one designed moment is the
     handover, when the line becomes the thing. The labels are lettered last. After the build only ambient motion
     moves.
   - Where the object does not cover it, the construction stays visible, so a viewer can check the picture against
     the rule.
   - The whiteboard kit already draws strokes that write themselves; this adds the register and the handover. The
     flowchart world from the two-language film (above) would be its first user.
2. **A trial row: the same rule at other values.** Three to five small sketches along the foot of a scene, drawn by
   the same code at other values, each lettered with its value, and the real one ticked. It shows that the real
   thing is one setting of its rule. In a footprintjs film these are the branches a `decide()` did not take, drawn
   from the same chart, with the taken one ticked.
3. **One light for every kit.** One window direction for the whole film. A lifted piece casts its shadow
   `height × K` away along that direction, blurred in proportion to its height, plus a tight contact shadow where it
   touches. Kits ask for a shadow by height instead of setting their own numbers; the paper kit sets its own today,
   piece by piece.
   - The light table belongs beside the spring table in footprint-story's `/motion`, so a deck and a film share it.
     That package needs the owner's go.
   - Math-Animals' `castShadow` is a small MIT function to start from.
4. **A determinism check for a project's own kits.** This package tests its own kits for purity. A film's own kits
   are never checked (the two-language film has seventeen), yet the segment cache trusts them.
   - A `review` verdict draws a scene's settled frame, then another frame, then the first again, and compares the
     pixels.
   - It scans each kit's sources for `Math.random`, `Date.now` and `performance.now`.
   - It prints each kit's prepare time and its draw time per frame.
   - Their known trap goes in the kit guide: on some canvases, a small canvas drawn scaled up straight onto the
     frame differs by a few levels between draws. Scale it into a full-size canvas first, then draw that.
5. **A blind review packet.** Each round, a reviewer that has never seen the work gets the same fixed packet: each
   scene's settled picture at feed size, one full-size crop, and one reference. Nothing else: no making-of, no
   earlier notes, no intent. It scores the existing rubric and returns at most three ranked changes.
   - The packet is the mechanism. A person or a fresh agent reviews it; the library still calls no model.
   - Their open problem shows why the score matters: reviewers who saw only the output rarely said PASS (all 45 in
     one round said REVISE), and they propose a score per criterion to show progress between rounds. The rubric
     already gives that.
   - It builds on "Review rounds kept as files" above.
6. **A zoom never enlarges a picture silently.** The camera zooms by redrawing, so drawn shapes stay sharp. A
   prepared picture (a baked layer, a still, and soon a screen recording) is enlarged instead. `review` compares the
   camera's deepest zoom over each picture with the picture's own resolution, and names the fix: prepare it at that
   scale (their film shoots each page at 3× before it zooms), or zoom less. The motion graph (Loop Lab item 6) can
   also show that a zoom's centre stays still; theirs held within 0.004 px.
7. **Forms as strategies: how the six fit together.** A rule that draws (a spiral, a Voronoi tiling, branching
   toward free space, an L-system plant, packed circles relaxing into hexagons, growth rings) is a `form` strategy,
   the same family as the focus and walk strategies: `compileFilm({…, strategies: {form: {mine: …}}})`. Three layers,
   each with one job:
   - **The choices are a subflow, run once when the film compiles.** Which form, which values, whether each value is
     inside its stated range and sourced, which values the trial row shows, and when the construction, the handover
     and the labels play. Each is a `decide()` table, so the record says why a nautilus spiral grows 3.00 a turn and
     not the golden 6.85.
   - **The form is a pure function, not a stage.** `build(values, seed)` gives the construction as DATA (points,
     curves, cells), and `at(construction, u)` gives the shape grown to `u` (0..1). It never touches a canvas.
     Running a flowchart per frame would cost a run every 1/30 s and fill the record with noise.
   - **Drawing is an adapter.** Canvas for a film; canvas or SVG for a StoryDeck figure (its backlog item 3), so a
     deck and a film draw the same form from the same data. The one light (item 3) and the pencil belong here.
   - **For cartoons:** forms draw the world (trees, grass, clouds, stones, tiles, crowds), the patterns (a coat, a
     shell, a fabric) and the "how it works" pictures. Characters stay authored kits: maths does not make a face
     people like. A character's parts can still ask a form (hair strands along a curve, leaves on a branch).
   - **Look first:** one form (the spiral) with its trial row and its construction, drawn from one subflow run, in a
     film scene and a deck slide.

Not borrowed:
- **The fleet.** 154 sessions (3 leads, 46 builders, 97 reviewers, 8 fact-checkers) is against this package's token
  rule. One fresh reviewer per round keeps the useful half.
- **Material realism** (area light, occlusion, scattering). Their own open problem says it still reads as computed,
  and it is a 3D shading job.

The concept card's fields (person, feeling, wow moment, reference to beat, concept line) fold into the brief check
(Loop Lab item 2) when that is built.

## A 3D stage: the camera flies from one view to another (2026-11-03)

Today the camera is 2.5D: pan, tilt, dolly, truck and crane move over a flat picture, and orbit, dolly zoom and rack
focus slide, scale and blur a world's depth layers (`camera.mjs` · `layersAt`); `perspective` places flat drawings in
a one-point room. Nothing has an x, y, z place, so a shot cannot turn from one angle of a scene to another.

- **The stage is data.** Flat cards (a world, a slide, a picture, a word) placed in x, y, z with a turn; named
  viewpoints `{at: [x, y, z], look: [x, y, z], lens}`. A move flies the camera from one view to the next, eased, along
  a path that never passes through a card.
- **One model, one renderer: the browser.** The views, the flight and its choices are one module, shared with
  StoryDeck (its backlog item 4). Both draw the stage with the browser's own CSS 3D: StoryDeck live, StoryReel through
  an `html` world kit (below). No second 3D renderer is written for the 2D canvas.
- **Choices on a flowchart.** Which way round to fly, how far to arc, how long by the distance and the turn, whether a
  card would fill the lens or be seen edge-on: `decide()` tables, so the record says why the camera went the way it did.
- **Laws:** a frame stays a pure function of time; a card is never seen from behind unless it says it has a back;
  reduced motion cuts instead of flying; the review's checks read the words on a turned card where they land.
- **Look first:** one scene of three cards and two views, flown in a film and in a deck.

- **Our port, their adapters.** The stage is OUR shape — cards, views, flights, as plain data with no library's types
  in it — and a 3D library is an adapter behind one small interface: `renderer.mount(stage)`, `renderer.at(t)` (place
  the camera and cards for moment t), `renderer.regions()` (each card's box on the frame, for focus and the review).
  The first adapter is CSS 3D (no library, in StoryDeck and through the `html` world kit); a three.js adapter (an
  optional dependency, loaded only when named) can follow when a film needs real models, lights or materials. Every
  adapter passes one conformance test: the same stage at the same moments gives the same card corners on the frame,
  within a pixel. A film or a deck never imports a 3D library directly.

Not planned now: our own 3D renderer (meshes, lights, materials). That is the three.js adapter's job when it is needed.

- **Why the three.js adapter may come sooner (2026-11-03).** Meng To's Sakura River Valley
  (https://x.com/MengTo/status/2102760783344189761, live at https://valley.mengto.here.now) is a real-time three.js
  world generated with Opus 5.5: its page says terrain, trees, temples, water and sky are made procedurally at load,
  on three.js (MIT) and Poly Haven textures (CC0), in a 1 MB script. A real 3D world is now cheap to write, so the hard
  part of a 3D shot is capturing it frame by frame. The page states no licence for its own code: ideas only.
- **A 3D stage looked at from several sides.** One view hides a card seen edge-on or a part behind another. `still
  --views` lays out one moment from the stage's named views and a few orbit angles. Scenario's skills (below) review
  3D work on such sheets.
- **Camera numbers to start from** (Scenario's motion library, below): one dominant move a shot; a narrow lens (18–24°)
  to compress a poster shot, a wide one (70–95°) to fly through. Tried by eye before they become defaults.

## An `html` world kit: a web page as a shot, captured frame by frame (2026-11-03)

A world drawn by a web page: HTML, CSS (3D transforms included), SVG, web fonts, a StoryDeck slide, a product's own
screen. Not a screen recording, which drops and doubles frames and drifts from the voice, but a capture driven by
the film's clock, as Math-Animals' `tools/render.mjs` drives its pages:

- **The page keeps a small contract:** `window.storyreel = {ready, seek(t)}`, and `seek(t)` draws exactly moment t (a
  pure function of time, so a piece re-rendered alone matches). CSS animations are paused and set by time
  (`animation-delay: -t`), never left to run.
- **Captured in `ready`.** The kit opens the page in a headless browser (Playwright, an optional dependency loaded only
  when the kit is used), seeks each frame of its shot at the film's rate and size, and keeps the frames in a cache
  folder keyed by the page's files and the times (`outputFolder`). `draw(ctx, t)` then only draws the cached frame, so
  the camera, captions, focus, transitions and every review check work on it unchanged.
- **Regions from the page:** elements marked `data-region="name"` give their boxes, so focus and the studio's "what
  drew this spot" name them; the words the page shows are read from the page itself, for the review.
- **Threat model:** the page is the project's own file, inside its folder; the browser runs with no network, and a
  page that asks for one is refused, naming the fix; bounded frames, size and time.
- **Cost, measured before choosing:** a browser frame costs far more than a canvas frame; the cache and the pieces
  re-render only what changed. The bench decides the default resolution and whether to capture at 2× for zooms.
- **Look first:** one StoryDeck slide flown in 3D as a ten-second shot inside a film.

- **A page on its own clock (2026-11-03).** The valley above runs on `requestAnimationFrame` and `performance.now` and
  has no `seek(t)`. A `clock: 'virtual'` mode replaces those, `Date.now` and the timers, and seeds `Math.random`, before
  the page's scripts run, then steps it one frame at a time. Such a page only plays forward, so a piece re-rendered
  alone replays from its shot's start. The purity check compares two replays and refuses a page that differs.
- **GPU capture, a number to measure against.** Scenario's kinetic engine (below) steps `window.renderFrame(frame, fps)`
  in headless Chrome. It reports about 28 fps a worker for a simple 1080p60 WebGL scene with `--use-angle=metal`, three
  workers at once. That is their number on their machine; our bench decides.
- **Credits from the page.** The valley's page lists each asset with its source and licence. The kit reads such a list
  from a small manifest, and a release's credits (`creditsText`) name them as they name found sounds.

It also serves product demos (a product's own page driven by script, the handoff's phase 2) and decks shown in films.

## Figures that show the inside and say how they differ from the real thing (2026-11-03)

Source: a 3D interactive electricity book by @techartist_, being built with Opus 5.5, shown by @0xKapri
(https://x.com/0xKapri/status/2117304745228394951). It is not published and states no licence, so the IDEAS are borrowed
and the code is written here. Read from three frames of the post's video (two lessons): an open book on a desk, the
left page explaining, the right page holding a live figure that stands up off the page.

Several of its ideas this package already keeps: a guess before the answer (`Pause and guess`), a part lit as the voice
names it (focus), the paper look, a figure drawn by its rule (the Math-Animals section). StoryDeck's item 5 takes the
page layout and the flap. Five are new here. Each needs a go.

1. **The figure says how it differs from the real thing.** In the book, one caption says time runs 30 times faster,
   another says a moving part is drawn far larger than real, and a control switches between slowed and real. Here a
   figure declares it as data (`"differs": {"time": 30, "scale": "the electrons drawn far larger than real"}`), the words
   are drawn on the figure, and a verdict refuses a declared rate other than 1 with no words on screen. This serves the
   honest-answers goal. Its limit: the check reads what is declared and cannot see a speed-up nobody declared.
2. **A cutaway.** A cover taken off to show the parts inside, the cut faces hatched. Flat first: two drawings (outside,
   inside) and a window that opens over time, the inside parts naming regions only once they can be seen. Real 3D waits
   for the three.js adapter.
3. **A numbered key.** Numbers on the figure, the key under it, one line telling the viewer what to watch ("the kettle
   (2), then the meter (1)"). A check: every number in the key is on a part drawn at that moment, and every number on a
   part or in that line is in the key. These numbers are labels, so the claims check must not ask them for a source.
4. **A flow along a wire.** Dots moving along a named path, their speed from the model's value, each place a pure
   function of time (seeded start, offset = speed × t). Reduced motion shows fixed dots and an arrow.
5. **Ink, with colour only for what the lesson is about.** A hatched line drawing where only what moves has colour.
   `roughjs`, already a dependency, draws hachure, so a `hatch` fill is cheap. The colour probe measures the rule.

**Look first:** one scene, a torch cut away with its current flowing, its numbered key, and a caption saying time is slowed.

## A music video's lessons, from Scenario's "3D OS" skills (2026-11-03)

Source: Scenario (https://x.com/Scenario_gg/status/2117273548217524720), repo https://github.com/scenario-labs/skills, MIT
(Copyright (c) 2026 Scenario Inc.), so code may be adapted if that notice is kept in the file it lands in. Most of it
drives Scenario's paid generation service or desktop apps (Blender, Maya, ZBrush, Unreal, Unity, Godot, Roblox), and none
of that is borrowed: this package draws with code. Worth reading: `skills/scenario-kinetic-music-video`
(`references/lessons.md`, `references/motion_library.md`, `references/engine_api.md`), a three.js and Canvas compositor
where every pixel is a pure function of song time, the same idea as ours.

Several of its rules this package already keeps: tempo measured, never taken from a label; cuts on the song's own times;
no frozen frames (`still`, the slideshow verdict); a hook in the first seconds; notes by timestamp, then that range drawn
again (studio notes, `changes --render`); contact sheets; lip-sync checked on the file. Ten are new. Each needs a go.

1. **The song's layers as data.** Downbeat, kick, snare and vocal onset each drive one kind of thing, one or two layers
   a moment: `"grammar": {"downbeat": "cut", "kick": "punch", "vocal": "word"}`. Today the beat map gives beats, bars, a
   drop and hits. The layers need onsets split by band (`dsp.mjs`), measured on the tempo corpus before anyone relies on
   them. Their vocal stems come from Demucs, a large dependency, not borrowed.
2. **Lead.** Their rule: a visual hit lands 2–3 frames (0.05 s) before the sound, because the eye needs the frame before
   the ear. Tried by eye on one kinetic scene first; opt-in, since a default would move every cut.
3. **Cuts that climb with the energy.** Every 2 bars in a verse, 1 bar before the chorus, beats and half-beats at the
   peak, one long held shot in the bridge. A check: a section whose energy rises while its cuts thin out, unless declared.
4. **Showcase moments get time.** Their directors twice rejected a logo build or an end card cut too fast; it read at
   0.35–0.5× speed. A check on a declared showcase: too short, or a cut inside it.
5. **More word moves, never the same one twice in a row.** Ours are fade-slide, soft-rise, mask-wipe, pop, blur-in and
   slam. Candidates from their list that fit a canvas: smear slam, width wave, weight ladder, decode scramble, odometer,
   karaoke fill, word pile-up, kinetic crop, outline echo, text on a path. Each a gallery card to look at first. A review
   note when two lines in a row share a move. Their timing table (exits 60–70% of the entrance, a card never scaled from
   0) is compared with `footprint-story/motion` first; only what differs, and why.
6. **A spine.** A device that runs through the whole film, a counter, a clock or a countdown, its value from the film's
   clock, while the looks escalate. A number it shows goes through the claims check.
7. **Endings as variants.** Alternate endings rendered side by side so the person picks one. The segment cache makes
   this cheap: every piece before the split is shared. A release refuses until one is picked.
8. **Fades through colour, and true black.** A fade to black through a flash goes grey, and near-black ink shows as raised
   black. Two small checks for the colour probe.
9. **Iterations counted.** `storyreel log` can say how many renders and notes a film took, a number their directors asked
   for in the making-of.
10. **The refine loop, for the review skill.** A written rubric first; a verdict per item citing the rubric's line, never
    taste; the cheapest fix; one change a round; each round from the approved baseline, never the last attempt; three
    rounds with no clean one, or one line failing twice under different fixes, means report, not respin. It goes in
    `storyreel-review` within the agent-cost budget.

**Two small probes**, each a pinned test whatever it finds: file names differing only in case are one file on macOS (an
encode so named overwrote its own input in their run), and `start × fps` may not be whole, so a scene's first frame can
belong to the scene before.
