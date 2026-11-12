# write/ — the board, from the points

**Why:** the writer sees the points and the messages they cite, never the whole conversation, so it cannot cite what it
was not shown, and the brief does not grow with the conversation.

`writeBrief(shape, points, cited, most)` → `{brief, left}`; the instructions are `storyboardBrief`'s for the shape, with
one line on the points. `readBoard(answer)` takes a JSON object; the next stage checks it whole.

**Threats**
- Planted words in a point or a message: material lines; the instructions are the same whatever they say. Tested.
- Many or long cited messages: each clipped to 4 KB, and messages beyond the window are left out and counted.
- The board's words in the record: kept in working memory; state gets its size.
