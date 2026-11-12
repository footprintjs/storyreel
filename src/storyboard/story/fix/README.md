# fix/ — one piece at a time

**Why:** a board with one wrong number should not be written again whole. Each piece at fault goes back on its own, with
its problems and the messages it cites, and the answer replaces that piece alone; the whole board is checked again.

`fixBrief(instructions, pieceBrief)` adds the form to answer in to `storyboardFixBriefs`'s brief; `applyPiece(board, piece,
answer)` replaces the piece or refuses. Each piece gets the retry policy's tries of its own (`askWithTries`), counted per
piece, so a later piece is not left one try by an earlier one; `fixes[]` records each piece's tries. Rounds: `mostFix`.

**Threats**
- An answer that reaches past its piece (another field, the shape): refused; a frame answer may name only its fields.
- `__proto__` in a JSON answer: set as an own field, never a prototype. Tested.
- The loop running for ever: rounds are data (`mostFix`, 3 by default), and past them the run stops with the problems.
