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
