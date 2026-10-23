# Showing a film to a person

A person who asked for a change wants to see it, not read about it — and their attention, like a picture's tokens,
is the scarce thing. Show the least that answers their question, in an order that never wastes a render.

## The round

1. **Words first.** After any edit to the narration, the recipe or the pacing: `npx storyreel anchors`. Every phrase
   not said, or now said more than once, is a drawing at the wrong moment; fix them before anything is drawn. A new
   voice goes: narration → voice → `anchors` → stills → render. Key new beats to moments written in the narration
   (`{name}`, [voice.md](../storyreel-cartoon/voice.md#one-script-moments-and-speakers)): a rewording keeps them on
   their words, and the voice reads `npx storyreel script`.
2. **Pictures before videos.** For each change, find its moments in the timeline (search its text for the recipe
   entry rather than reading the recipe) and make one `still` an episode holding all of them: the timeline's times
   paste straight into `--at`, as printed — no sums. To see a scene's every beat at once:
   `npx storyreel still --beats <id>`, each frame labelled with its time and what is said there. Show those. Render
   only once they agree — and then `changes` first: only the changed pieces are drawn.
3. **One page they can open on a phone.** Each round: what changed, in plain words; the pictures; then the films.
   `npx storyreel share out/ep1.mp4` makes each film small and quick to start, with a poster. Put one big play button
   on the poster that loads the whole file and then plays it — a bare `<video src>` stays blank where a host does not
   answer range requests. Keep one page and update it, so the link never changes.
4. **Say it plainly.** What they will see and hear, never the code. Ask only what is theirs to decide (taste, their
   family's words, what to cut); decide the rest and say why.

## A review by several viewers

For a draft that is nearly done, `npx storyreel sheet --every 4` (a frame every 4 s<!-- TOOL_DEFAULTS.every -->, labelled) and, for each episode,
its script (`npx storyreel script`: what each scene says and who says each line) and the words on screen. Give them to separate reviewers, one lens
each, so no lens is crowded out by another:

- **A child of the audience's age:** where they would look, what drags, what is too busy, what they would shout at the screen.
- **A parent:** length, tone, anything confusing or misleading, anything that would make them stop it.
- **A teacher (the subject's expert):** every number, sum and claim agrees as said, shown and drawn; the movement shows
  the idea at the moment the voice says it; no misconception planted.
- **An animator:** what overlaps or is cut off, where the eye goes, camera moves too many or too fast, transitions that jar.
- **A historian (a fact-checker)** when the film says anything about the world: true, fairly hedged, a source for each.

Each returns its findings ranked — the time, what is wrong, why it matters to that viewer, a fix — marked must,
should or nice. Merge them into one list, most important first (one finding several viewers make ranks higher), fix
the musts, and say which shoulds are the person's call.

## Keep it true and cheap

- **The story's facts as tests:** the numbers it counts, the words it must say, what its characters wear — so a later
  edit cannot break them unseen.
- **One picture a check:** several moments in one still, 1200–1600 px wide (a scene's beats: `still --beats`); a sheet
  for a reviewer; a `strip` only for a fast move.
- **Text before pictures:** the timeline, the review and `anchors` are text; read them first, look last.
