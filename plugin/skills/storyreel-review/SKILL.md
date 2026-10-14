---
name: storyreel-review
description: Review and fix a StoryReel film by reading it first — the part's timeline (when each beat lands) and its review (words under the captions, over each other, cut off, a frozen picture, nothing new, a freeze over the voice, example data over real numbers) with three verdicts (no slideshow, drawn parts hold together, every number has a source) — then fix, preview the part in seconds, and look at one still only to confirm. Use when editing, debugging or polishing a StoryReel film, scene, shot or kit, or when someone reports something wrong in one.
---

# Review a StoryReel film: read first, look last

Pictures cost many tokens and hide their times; the film's own record does not. Work from text, and open an
image only to confirm what the text already told you. (Building a film from nothing: the `storyreel-cartoon` skill,
[its SKILL.md](../storyreel-cartoon/SKILL.md).)

The project names its film in `storyreel.config.mjs` (`export default {film: flags => ({storyboard, recipe, kits?,
root?, narrationDir?, pacing?, layout?, out?})}`; `root` defaults to the folder the command runs in, `out` to `out`);
every flag also reaches `film()`, e.g. `--ep ep1 --voice work/ep1/voice`.

## The loop

1. **When does it happen?** `npx storyreel timeline --scene <id>` — every scene start and every beat with its
   time, the phrase it waits for and the recipe entry it moves. Never guess a time: read it here.
2. **What is wrong?** `npx storyreel review --scene <id>` (or the whole film without `--scene`, a few seconds) —
   each finding with its times on the film clock and its scene: words under the captions, words over words, words cut
   off, no hook in the first 3 s, too much to read, no breath, the picture frozen for 5 s ("nothing changes"), nothing
   new for 5 s while it moves, a camera freeze over the voice, example data lingering beside real numbers, and with
   `--loop true` a loop that jumps. Under them, three **verdicts**: no slideshow, drawn parts hold together, every
   number has a source. What each means and how to fix it: [checks.md](../storyreel-cartoon/checks.md).
3. **Fix** the one problem that matters most, in the code or data the finding points to (the recipe entry in the
   timeline names it). One fix per round, so the next review shows what that fix did.
4. **Look again, quickly:** `npx storyreel part --scene <id>` — the scenes with 1.5 s of the film either side (so
   both cuts are seen), the draft encode, reviewed first; seconds, not minutes. It is half size only when the config
   names a `layout` (otherwise 1280×720), and writes `<out>/parts/<scenes>.mp4` with its `making-of.json` beside it
   (the next part's replaces it). Repeat 2–4 until the review says nothing found.
5. **Confirm the look, once:** `npx storyreel still --at <scene>+<seconds>[,…]` writes one PNG of those moments
   (`<out>/stills/`; it prints the path);
   read that image last, for what text cannot say (colour, balance, a glyph drawn as a box, motion feel). For a
   fast move, `npx storyreel strip --at <scene>+<seconds>` shows 12 consecutive frames around it: a pop, a jump or
   two things crossing shows there.

## The verdicts

- **No slideshow** fails when more than half the shots' running time is held still for over 3 s, or more than 85% is
  still at all; its findings ("held still") name the shots. Fix with motion inside the shot, not more cuts.
- **Drawn parts hold together** runs only when a kit gives `parts(t)`: a mounted end comes off, a pair crosses, or a
  planted foot slides — each named with its part and time.
- **Every number has a source**: `"120" (scene rate, story.items[1]) has no source: add {"value": 120, "source": "…"}
  to the facts, or mark scene rate "example": true`. "Example data over real numbers" means an example line stayed up
  into a real scene with its label: erase the line before that scene (a label per number is not the fix).
- The header lists the checks that ran by id (`stale` is "nothing new", `still` is "nothing changes"; every id:
  [checks.md](../storyreel-cartoon/checks.md#the-reviews-findings)).
- A verdict **not run** has checked nothing (no kit gives its parts, the storyboard names no facts): never read it
  as passed. Its evidence is in the review's record (`reviewPart(film).record`, its `condition` entries).

## Rules

- A time comes from the timeline, never from a guess; a still is taken at a moment the timeline named.
- The review's findings are facts about the drawing (where each word landed, when); fix them before polishing.
- "Nothing changes" (frozen), "nothing new" (it moves, but nothing new comes) and "held still" are advice, not
  errors: a held title, or one picture the voice explains, can be right — say why if you keep it.
- "A freeze over the voice": a camera `freeze` holds the picture while the voice names a drawing (it appears only when
  the freeze ends) or a mouth stays shut while its speaker talks. Move the freeze, or the line.
- "The loop jumps" on motion that steps rather than runs (a flipbook, a blink, a part drawn on twos) may be a clean
  loop: its last moment still shows its last drawing, one short of coming round. Look at a strip of the seam
  (`strip --at <scene>+<seconds>` at the part's end) before changing it.
- A review that stops with an error has not checked the part: its message names the check that failed. Fix it or
  report it; it is never "nothing found".
- The command line reads the picture every 0.25 s. In code, `reviewPart(film, {every: .1})` reads it more often
  (finer, slower); the numbers check always reads at least every 0.25 s.
- Text drawn into a fading scratch picture, and drawings that are not text, are not read: those need the still.
- Render the whole film only when the parts are clean.
