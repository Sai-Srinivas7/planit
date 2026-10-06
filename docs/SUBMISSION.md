# PlanIt — submission note

**What was built.** PlanIt is a private group outing planner on DeepSpace. A host creates an outing and shares an invite link. Friends join, add places and preferences, respond Yes / Maybe / Can't do on each place, and talk it through. The host then confirms one plan, which anyone can copy. Changes appear live for every member and never for outsiders. Unknown facts read "Unconfirmed", and the confirmed view says nothing is booked. The host can request up to three suggested places, with weather context and short AI explanations. Manual planning works when every provider is down.

**Integrations.** All are DeepSpace catalog integrations, called only from worker code with `buildCronContext(env, env.OWNER_USER_ID).integrations.call` and billed to the app owner:
- `openweathermap/geocoding`: resolve the location; ambiguous or unknown asks the host to be more specific.
- `openweathermap/forecast`: weather within 90 minutes of the start, or "Forecast unavailable".
- `serpapi/places-search`: places near the geocoded point (`ll`).
- `anthropic/chat-completion`: `claude-haiku-4-5` explanations, schema-validated, with venue text passed as data.

The browser integration proxy returns 403, and a test checks the client bundle contains no provider hosts.

**Main tradeoff.** Each outing is one record, and every write is a command run inside the record room's `blockConcurrencyWhile`. This makes every check-then-write atomic: a vote and a finalize cannot interleave, and BASE-04 and FIN-04 fail without the gate. The cost is one app-wide command queue and an override of one SDK method (`RecordRoom.fetch`).

**Left out on purpose.** Scheduling polls, bookings, payments, calendars, maps, notifications, and AI chat. None is needed to get from "we should go" to one confirmed plan. Price and opening hours stay "Unconfirmed": a map listing isn't verification, and the app never implies a booking. I considered DeepSeek for explanations but it isn't a catalog integration, so it would have meant managing a key outside the proxy.

**How the agents were used.**
- **Codex (one shot)** built a first prototype from a DeepSpace-generated prompt. Claude audited it against my spec (`docs/gap-report.md`): its serialized write design was sound, but it used zero DeepSpace integrations (plain `fetch` to OpenStreetMap, Open-Meteo, DeepSeek), took typed display names instead of account names, and lacked reopen, vote clearing, option edit/delete, and comment delete.
- **I decided:** keep the prototype's serialized design and rebuild cleanly as PlanIt in a new folder; route all providers through DeepSpace integrations; use account names; and 17 product decisions (option lock rule, reopen behavior, limits, and others) recorded in `docs/spec.md` §11.
- **Claude (chat)** drafted the spec, plan, and task list from my decisions, and reviewed the build at gates. In Block 0 that review found that a failed write inside `blockConcurrencyWhile` would reset the room for every user; it was fixed before Block 1.
- **Claude Code** built Blocks 0–6 against the spec, task by task, with a test named for every acceptance criterion: 149 unit tests (including the full §6 authorization matrix as a table) and 49 Playwright api, smoke, and collab tests. For every security and concurrency criterion it broke the guard on purpose, confirmed the test failed, and restored it (without serialization, only 6 of 20 concurrent votes survived). It stopped for spec conflicts; I approved five spec revisions after v1.0 (v1.1 → v1.1.4), each with a changelog line.
- Removed unused scaffold code (in-app AI chat, payments starters, unused UI primitives); the README code map separates PlanIt's code from DeepSpace's.

Details: `docs/DEVELOPMENT_LOG.md`; AC status: `docs/traceability.md`.

**What I verified myself.**
- Chose the architecture and every product decision; reviewed the gap report against the prototype's code.
- Ran PlanIt locally with two accounts in separate browsers: create, invite, join, places, votes, comments, preferences, confirm, reopen, copy plan; changes appeared live in the other window.
- _(fill in)_ Deployed app: same loop with two accounts; Outsider sees nothing; Member has no Confirm/Suggest.
- _(fill in)_ One live suggestion run on the deployed app: places, weather, explanations; cost from `npx deepspace app usage`.

**Unfinished / next.** Members can't leave and invite links never expire; forecasts only cover 5 days; all outings share one command queue (shard per outing if it grew).
