# A local recording as a shot

Use this when the actual screen must appear in the film. Keep placement and timing in the recipe: edit a named
box or phrase anchor rather than inspecting frames to position every zoom.

1. Record with a tool you run yourself. Put a local MP4/WebM inside the film's `root`; do not use a URL or a link
   outside it. Use local FFmpeg and ffprobe builds supporting the `fd` input protocol.
2. Import `footageKit` from `footprint-storyreel/kits/footage` and pass `kits: [footageKit]` to the existing compile
   or make path. `createFootageKit({ffmpeg, ffprobe})` chooses explicit tool paths when needed.
3. Give the story or a world stage a `file` and `scene`. Start with `contain`, 12 fps and decode width 1600. Preserve
   the entire screen until a deliberate crop is approved.

```json
{"story": {"kit": "footage", "scene": "form", "file": "demo/form.webm", "fit": "contain",
  "keys": [{"at": ["form", "Open the form"], "video": 0},
           {"at": ["form", "Explain the result"], "video": 4},
           {"at": ["form", "Continue"], "video": 4}],
  "regions": [{"name": "result", "box": [100, 200, 600, 400]}]}}
```

Those phrases must exist in the storyboard, the recording must reach four seconds, and the box must be inside its
original dimensions. `at` is a film second or phrase anchor; `video` is a recording second. Increasing film times
and nondecreasing recording times are required. Equal recording times hold; the other spans play at 1/8×–8×.
Outside explicit keys, hold the nearest keyed frame. With no keys, start at the scene and play normally, then hold.

Named boxes are in the original recording's pixels, before contain/cover fitting. Existing camera/focus recipes
can target them (`on: 'result'`); no click locations or labels are guessed. The recording is muted, so narration
and music use the existing paths. Use the existing caption layout and transition catalog, not a new compositor.

Read `film.preparation` or `making-of.json.preparation` first: the world's source, bounds and remap decision
narratives explain preparation, holds and speed. Read any refusal whole. Reduce width/fps, trim or split the recording when a limit is reached;
`FOOTAGE` owns the limits. Preparation is complete before seekable frames are drawn. Re-render a small part first,
then read `picture.line` to see which full-render pieces changed. A new recording must invalidate the pieces that
show it; an approval still locks the full input set.

**Do not claim recorded pixels were checked as text.** Inspect readability at the intended output size. Keep a
demo's facts and unknowns distinct; do not turn a recorded error into a proven root cause. This phase does not
generate click logs, automatic zooms, voice or run a recording script. See the package README's “Recorded video as a
shot” section and `src/kits/footage/README.md` for bounds and the full example.
