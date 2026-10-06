---
name: storyreel-review
description: Review and fix a StoryReel film by reading it first — the part's timeline (when each beat lands) and its review (words under the captions, over each other, cut off, nothing changing) — then fix, preview the part in seconds, and look at one still only to confirm. Use when editing, debugging or polishing a StoryReel film, scene, shot or kit, or when someone reports something wrong in one.
---

# Review a StoryReel film: read first, look last

Pictures cost many tokens and hide their times; the film's own record does not. Work from text, and open an
image only to confirm what the text already told you.

The project names its film in `storyreel.config.mjs` (`export default {film: flags => ({storyboard, recipe, kits,
root, narrationDir?, pacing?, layout?, out?})}`); every flag also reaches `film()`, e.g. `--ep ep1 --voice work/ep1/voice`.

## The loop

1. **When does it happen?** `npx storyreel timeline --scene <id>` — every scene start and every beat with its
   time, the phrase it waits for and the recipe entry it moves. Never guess a time: read it here.
2. **What is wrong?** `npx storyreel review --scene <id>` (or the whole film without `--scene`, about 2 s) —
   words under the captions while a caption shows, words over other words, words cut off at the edge, nothing
   changing for 5 s or more; each with its times on the film clock and its scene.
3. **Fix** the one problem that matters most, in the code or data the finding points to (the recipe entry in the
   timeline names it). One fix per round, so the next review shows what that fix did.
4. **Look again, quickly:** `npx storyreel part --scene <id>` — the scenes with 1.5 s of the film either side (so
   both cuts are seen), half size, the draft encode, reviewed first; seconds, not minutes. Repeat 2–4 until the
   review says nothing found.
5. **Confirm the look, once:** `npx storyreel still --at <scene>+<seconds>[,…]` writes one PNG of those moments;
   read that image last, for what text cannot say (colour, balance, a glyph drawn as a box, motion feel).

## Rules

- A time comes from the timeline, never from a guess; a still is taken at a moment the timeline named.
- The review's findings are facts about the drawing (where each word landed, when); fix them before polishing.
- "Nothing changes" is advice, not an error: a held title can be right — say why if you keep it.
- Text drawn into a fading scratch picture, and drawings that are not text, are not read: those need the still.
- Render the whole film only when the parts are clean; it reuses every segment nothing changed.
