# route/ — one brief, or one per window

**Why:** one pick brief is the cheapest when the conversation fits in a window; above that, one brief could not run at all.
The caller never chooses: `decide()` reads the window count and the record says which and why.

`ROUTE_RULES` and `ROUTE_FALLBACK` are the rules, as data. Both branches start the pick at the first window.

**Threats:** none of its own: it reads counts only.
