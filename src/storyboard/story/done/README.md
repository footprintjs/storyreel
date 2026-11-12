# done/ — the board, and how sure each scene is

**Why:** a board that reads is not the same as a board that is sure. Each scene gets a standing: `known` (its point rests
on cited messages and its piece needed no fix), `not-sure` (it says what is not known, or passed only after a fix), or
`ask` (two points disagree, a claim cites nothing, or no point rests on its messages). The asks are listed on the result
for the owner; the run does not stop for them.

`standingOf(board, points, fixed, refusedWindows)` → `{standing, ask}`. `stop` ends a run whose fixes ran out.

**Threats:** the reasons are fixed words; state holds codes, ids and indexes only.
