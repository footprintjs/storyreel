# pick/ — what matters, window by window

**Why:** the pick is the only step that must read everything, so it is windowed: the largest brief is a window, never the
conversation. Each point carries its part and the messages it rests on, so the points are also the plan.

`pickBrief(messages)` → a brief; `readPicks(answer, ids)` → `[{part, text, sources}]` or a refusal by code. The stage loops
with the decider `next window` (`loopTo('pick')`); a window already answered is not asked again.

**Threats**
- A planted instruction in a message: the window is material, one JSON line per message (`dataLine`); the instructions
  are fixed text. Tested: `test/story/pick.test.mjs`, `test/story/threats.test.mjs`.
- An answer that cites what its window does not hold, a part that does not exist, a long text, too many points: refused
  by code, asked again once by the retry policy, then the window is marked (it reaches `ask` on the result).
- A point's words in the record: kept in the run's working memory only; state gets counts.
