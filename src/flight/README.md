# flight — the focus camera's flights between shots

A `camera` focus (`../attention.mjs`) makes each key a shot. **Why this folder:** the author writes which subject a
shot frames and, when it matters, how the camera gets there (`do`: `"fly"` or `"cut"`, `seconds`); footprint-story
(`footprint-story/shot` · `planCameraMove`) decides the path and the time, and its critics (`checkCameraMove`) say what
still looks wrong. This folder is the seam: StoryReel's flat framings in, footprint-story's plan out, drawn by the film.

| file | one job |
|---|---|
| `steps.mjs` | the three steps (read → plan → check, `FLIGHT_STEPS`), a framing as a camera and back (`cameraOf`, `viewOfCamera`), the view at any second (`viewAt`), and `planFlights`, the steps run in order as the compile runs them |
| `run.mjs` | the same steps as a footprintjs chart (`flightFlow`, `runFlights`), so `storyreel check` keeps a record `log --why --camera focus` reads (`../check/cameras.mjs`) |

**A flat picture as a scene.** A picture is cards on the plane z = 0, seen from the front, level, through the normal
lens; a framing `{cx, cy, z, sx, sy}` is the camera on `(cx, −cy, 0)` with the frame's height at the target `900 / z`
and its picture slid by `shift` so the target lands at `(sx, sy)`. Exact: a point lands where the framing puts it
(`test/flight.test.mjs` pins it). So a flight never turns — a slerp of 0°: the target slides in a line, the zoom grows
by equal ratios, timed by minimum jerk at the fewest seconds that keep slide and growth under footprint-story's limits.

**What is StoryReel's own, and why.**

- The framing of each shot (`attention.mjs` · `framedView`: `frameZoom` within `safe`, 1× to 3×, the rule StoryDeck
  frames by): footprint-story frames a flat card by its height alone at its own shares and knows no safe area, so the
  ends go in as camera numbers, not shot words.
- A cut the key asks for (`do: "cut"`): footprint-story has no asked-for cut — its cuts come of a turn past `cutPast`
  or a fly too far, and a front view never turns.
- Keeping the frame covered: each sampled framing's point is moved in as far as the picture's edges ask, as before.
- `reel:cut-short`: a key that lands before the flight above it arrives cuts that one short, and the next flight sets
  off from where the camera is, from rest (footprint-story plans between two shots only). A warn, with the time to
  move the key by.
- Fixes in the recipe's words: `seconds: N` is the key's own; footprint-story's wider framing is a size of the film's
  or `"on": "wide"`; a fix that would turn or lift the camera (`lift`, `cutPast`, `by`) is one a flat picture cannot
  take, so it is said as frame wider, or cut.

**What is not here.** An orbit (`do: "orbit"` is refused: it circles in 3D, and the picture is flat — a layered world's
camera move `orbit` slides its layers instead), a path through more than two shots, a zoom that widens on its way
between two framings far apart (both subjects leave the frame on the way, and `in-sight` says so).
