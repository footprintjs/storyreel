# camerawork — the camera plan's stages

`planCamera` (src/camerawork.mjs) is a footprintjs flowchart: read moves → one picture → one camera → motion? (moves
| cuts) → aim. **Why this folder.** A chart file is wiring only, so the chart's stage functions and the arithmetic they
use live here, and src/camerawork.mjs reads as the chart.

| file | one job |
|---|---|
| `stages.mjs` | each stage of the chart (read moves, one picture, one camera, the motion decision, played, aim) and the record it leaves |
| `lanes.mjs` | the plan's arithmetic: view and depth axes as eased lanes, the picture's clock, handheld, aiming at and following a named thing |
| `checks.mjs` | the camera's rules on those lanes: the frame stays covered, a dolly on a thing holds, a dolly-out widens |
