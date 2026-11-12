# merge/ — the windows' points as one list

**Why:** windows overlap in what they talk about. Two points of one part on a shared message are one point; when their
numbers differ, the point is marked `ask`, never settled silently.

`mergePoints(picks)` → `{points, dropped, conflicts}`, at most 24 points; `pointFacts(point)` is what state may hold.

**Threats:** code only. A conflict becomes `ask`, never a silent choice. A point's words never reach state.
