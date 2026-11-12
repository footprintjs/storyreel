# merge/ — the windows' points as one list

**Why:** windows overlap in what they talk about. Two points of one part on a shared message are one point; when their
numbers differ, the point is marked `ask`, never settled silently.

`mergePoints(picks)` → `{points, dropped, conflicts}`, at most 24 points; `pointFacts(point)` is what state may hold.

**What it cannot find yet:** each message is in one window, and a point may cite only its own window, so two points share
a message only within one window. Duplicates and disagreements are found within a window; two windows that disagree
about the same matter both keep their points. No fuzzy matching is tried.

**Threats:** code only. State holds each point's sources by ordinal. A conflict becomes `ask`, never a silent choice. A point's words never reach state.
