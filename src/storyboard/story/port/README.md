# port/ — the model, as a port

**Why:** the chart holds no model. Every stage that asks sends one brief shape and takes JSON text back, so any model,
and later a paused run answered from outside, plugs in without changing the chart.

`brief(stage, instructions, material, ids)` → `{stage, instructions, material, expects, ids}`; `inProcess(fn)` → a driver;
`askJson` reads an answer; `askOrRefuse` (ask.mjs) asks for a stage and keeps a last refusal as an outcome. `ASK_RETRY` is
the retry policy of every stage that asks.

**Threats**
- An answer's words in the record: refusals are code's own words by code; a JSON parser's message (which quotes the text)
  is never used. Tested.
- A model's own error (which may quote the brief): kept off the record, handed to the caller as the refusal's `cause`.
- A huge answer: over 1 MB is refused.
