# read-source/ — the conversation, opened

**Why:** every later stage needs the conversation's words for a brief, and none of them may keep the words. So this
opens it as a source: facts for the record, words read again from where they came from whenever a brief needs them.

`openSource(conversation, {cwd, window})` → `{facts, window(i), cited(ids), all()}`. `facts`: message count, bytes, sha256,
the window size, how many messages were clipped, and the windows as message offsets `{from, to, bytes}`.

**Threats**
- A path out of the project, a link, a file too big: read only through create's `readJson` (in-project real path, 32 MB).
- Malformed messages, too many: checked by the storyboard door's own rule (`storyboardBrief`), 5,000 messages at the most.
- A long id used to smuggle words into the record: an id over 80 characters (the longest a board may cite) is refused.
- Words in the record: only the facts are written to state. Tested in `test/story/read-source.test.mjs` and `test/story/threats.test.mjs`.
- A file or a list changed between stages: every read checks the hash counted at the start, and refuses a change.
- One huge message: clipped to fit its window, saying how much was cut; the check still reads it whole.
