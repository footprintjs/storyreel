# check/ — the existing readers, and the judge

**Why:** the board is checked by the readers that already exist, unchanged: `storyboardProblems` against the whole
conversation, then a film's `filmFromBoard`. Problems are grouped into pieces by `storyboardFixBriefs`. The judge's
`decide()` chooses done, fix or stop, with the reason on the record.

`checkBoard(board, conversation)` → `{problems, fixBriefs, facts}`; `JUDGE_RULES` are data.

**Threats**
- A number in an unshown message: the check reads the whole conversation (`checkAnywhere`), so it is still checked.
- A disguised number, braces, a script: refused by the readers as today.
- A key the board wrote reaching the record: state holds piece names code wrote (`frame`, `checked[1]`) and counts.
