# port/ — the model, as a port

**Why:** the chart holds no model. Every stage that asks sends one brief shape and takes JSON text back, so any model,
and later a paused run answered from outside, plugs in without changing the chart.

`brief(stage, instructions, material, ids)` → `{stage, instructions, material, expects, ids}`; `inProcess(fn)` → a driver;
`askJson` hands the driver the brief and `{stage}` and reads its answer; `askOrRefuse` (ask.mjs) asks once per stage
attempt, retried by the stage's policy, and keeps a last refusal as an outcome; `askWithTries` gives each of several asks
in one stage (the fix's pieces) the policy's tries of its own. `ASK_RETRY` is the policy.

**A paused driver, later, without the scope.** A driver is handed `{stage}` only. A paused driver will not call
`interrupt` itself: it will answer with a marker that says "not yet", and the stage boundary in `engine.mjs` (the one
place that holds the scope) will turn that into `interrupt(scope, {brief})`. On resume footprintjs re-runs the stage from
its top and the answer comes back through the same driver call. So the port does not change, and no driver holds the scope.

**Threats**
- An answer's words in the record: refusals are code's own words by code; a JSON parser's message (which quotes the text)
  is never used. Tested.
- A model's own error (which may quote the brief): kept off the record (`refusal.mjs` keeps it under a private symbol),
  handed to the caller as the refusal's `cause`. A model that failed is never retried.
- The chart's scope reaching a driver: a driver gets `{stage}`, frozen. Tested.
- A huge answer: over 1 MB is refused.
