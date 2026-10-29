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
