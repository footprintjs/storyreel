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

Not planned: a full 3D renderer (meshes, lights, materials). The cards stay drawings; only their place is 3D.

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

It also serves product demos (a product's own page driven by script, the handoff's phase 2) and decks shown in films.
