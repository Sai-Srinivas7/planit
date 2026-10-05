# PlanIt — submission note

**What was built.** PlanIt is a private group outing planner on DeepSpace. A host creates an outing and shares an invite link. Friends join, add places and preferences, respond Yes / Maybe / Can't do on each place, and talk it through. The host then confirms one plan, which anyone can copy. Changes appear live for every member and never for outsiders. Unknown facts read "Unconfirmed", and the confirmed view says nothing is booked. The host can request up to three suggested places, with weather context and short AI explanations. Manual planning works when every provider is down.

**Integrations.** All are DeepSpace catalog integrations, called only from worker code with `buildCronContext(env, env.OWNER_USER_ID).integrations.call` and billed to the app owner:
- `openweathermap/geocoding`: resolve the location; ambiguous or unknown asks the host to be more specific.
- `openweathermap/forecast`: weather within 90 minutes of the start, or "Forecast unavailable".
- `serpapi/places-search`: places near the geocoded point (`ll`).
- `anthropic/chat-completion`: `claude-haiku-4-5` explanations, schema-validated, with venue text passed as data.

The browser integration proxy returns 403, and a test checks the client bundle contains no provider hosts.

**Main tradeoff.** Each outing is one record, and every write is a command run inside the record room's `blockConcurrencyWhile`. This makes every check-then-write atomic: a vote and a finalize cannot interleave, and BASE-04 and FIN-04 fail without the gate. The cost is one app-wide command queue and an override of one SDK method (`RecordRoom.fetch`).

**What the agent did.** Claude Code (Opus 5.5) wrote the spec-driven plan, tasks and tests, and built Blocks 0–6 test-first per acceptance criterion:
- 149 unit tests, including the full §6 authorization matrix.
- 49 Playwright api, smoke and collab tests.
- Fault injection for every security and concurrency AC: each guard was broken on purpose to see its test go red, then restored.

Details, decisions and spec gaps are in `docs/DEVELOPMENT_LOG.md`; AC status is in `docs/traceability.md`.

**What Sai verified.** _(to fill in: hand checks, live two-account loop, deploy, live suggestion run and its cost)_
