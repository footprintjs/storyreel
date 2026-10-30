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
