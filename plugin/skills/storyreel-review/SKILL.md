---
name: storyreel-review
description: Review and fix a StoryReel film by reading it first — the timeline (when each beat lands) and the review (words under the captions or over each other, cut off, a frozen picture, nothing new, too much to read) with three verdicts (no slideshow, drawn parts hold together, every number has a source) — then fix, preview the part in seconds, and look at one still only to confirm. Use when editing, debugging or polishing a StoryReel film, scene, shot or kit.
---

# Review a StoryReel film: read first, look last

Pictures cost many tokens and hide their times; the film's own record does not. Work from text, and open an image
only to confirm what the text already told you. (A film from nothing: the `storyreel-cartoon` skill,
[its SKILL.md](../storyreel-cartoon/SKILL.md).)

The project names its film in `storyreel.config.mjs`: `export default {film: flags => ({storyboard, recipe, kits?,
timings?, root?, narrationDir?, pacing?, layout?, out?})}` (`root`: the folder the command runs in; `out`: `out`).
Without `timings` the tools time the film from the voice folder's `timings.json`, or with `evenTimings(storyboard)`
(a 0.8 s tail a scene), paced by `pacing` when the config gives one. Every flag also reaches `film()` (`--ep ep1`).

## The loop

1. **When does it happen?** `npx storyreel timeline --scene <id>`: every scene start and beat with its time, the
   phrase it waits for and the recipe entry it moves. Never guess a time.
2. **What is wrong?** `npx storyreel review --scene <id>` (or the whole film): the counts, the verdicts that did not
   pass with why, and the first findings with their times and scene; `--full` lists every finding and every
   verdict's why. Findings: words under the captions, over words, cut off, no hook in the first 3 s<!-- REVIEW_DEFAULTS.hook -->, too much to
   read, no breath, the picture frozen for 5 s<!-- REVIEW_DEFAULTS.stillFor --> ("nothing changes"), nothing new for 5 s<!-- REVIEW_DEFAULTS.newEvery --> while it moves, a camera
   freeze over the voice, example data beside real numbers, and with `--loop true` a loop that jumps. What each means
   and its fix: [checks.md](../storyreel-cartoon/checks.md).
3. **Fix** the one problem that matters most, where the finding points (the timeline names the recipe entry). One
   fix per round, so the next review shows what it did.
4. **Look again, quickly:** `npx storyreel part --scene <id>`: the scenes with 1.5 s<!-- TOOL_DEFAULTS.handles --> either side (both cuts),
   the draft encode, reviewed first; seconds, not minutes. Half size only when the config names a `layout` (else
   1280×720<!-- RENDER_DEFAULTS.width RENDER_DEFAULTS.height -->); it writes `<out>/parts/<scenes>.mp4` and its `making-of.json`. Repeat 2–4 until nothing is found.
5. **Confirm the look, once:** `npx storyreel still --at <scene>+<seconds>[,…]` writes one PNG (`<out>/stills/`,
   path printed): read it last, for what text cannot say (colour, balance, a glyph drawn as a box, motion feel). For a
   fast move, `npx storyreel strip --at <scene>+<seconds>`: 12<!-- TOOL_DEFAULTS.frames --> frames around it, where a pop or a jump shows.

`npx storyreel <command> --help` gives a command's flags.

## The verdicts

- **No slideshow** fails when more than half the shots' time is held still over 3 s<!-- SLIDESHOW.hold -->, or more than 85% is still;
  "held still" names the shots. Fix with motion inside the shot, not more cuts.
- **Drawn parts hold together** runs only when a kit gives `parts(t)`: a mounted end comes off, a pair crosses, or a
  planted foot slides, each named with its part and time.
- **Every number has a source**: each unsourced number is named with its fix (`add {"value": 120, "source": "…"} to
  the facts, or mark scene rate "example": true`). "Example data over real numbers": erase the example line before
  the real scene.
- **Not run** checked nothing (no kit gives its parts, no facts): never read it as passed. Its evidence is in
  `reviewPart(film).record`. The header lists the checks that ran by id ([checks.md](../storyreel-cartoon/checks.md#the-reviews-findings)).

## Rules

- A still is taken at a moment the timeline named.
- Most findings are facts about the drawing; fix them before polishing. "Nothing changes", "nothing new" and "held
  still" are advice: a held title can be right — say why if you keep it.
- "A freeze over the voice": a camera `freeze` holds the picture while the voice names a drawing, or a mouth stays
  shut while its speaker talks. Move the freeze, or the line.
- "The loop jumps" on motion drawn on twos may be a clean loop: look at a strip of the seam before changing it.
- A review that stops with an error checked nothing: its message names the failed check. Never "nothing found".
- The command line reads the picture every 0.25 s<!-- REVIEW_DEFAULTS.every -->; `reviewPart(film, {every: .1})` reads finer; the numbers check
  reads at least every 0.25 s<!-- HOLD.step -->. Text in a fading scratch picture, and drawings that are not text, need the still.
- Render the whole film only when the parts are clean.
