# Development log

One entry per block. Each entry: what the agent did, what Sai changed or overrode, what Sai verified personally (and how), open issues.

## Pre-build (2026-10-05)

- Codex one-shot prototype built from a DeepSpace-generated prompt (`~/actually-go`, tag `prototype-codex-oneshot`). Not verified at the time.
- Claude audited the prototype against spec v1.0 (`docs/gap-report.md`). Main findings: zero DeepSpace integrations (plain `fetch` to OSM/Open-Meteo/DeepSeek), typed display names, missing reopen/vote-clear/option edit-delete/comment delete; strong concurrency via a serialized command room.
- Sai's decisions: keep the prototype's serialized design (A-01), rebuild as PlanIt in a new folder reusing the account's app slot (A-02), DeepSpace integrations for places/weather/LLM (D-01), account names (D-12).
- Baseline scaffold: unit 1 passed; smoke+api 8 passed; collab skipped (needs test accounts).
- Verified by Sai: <fill in>

## Block 0 (2026-10-05)

### T0.8 — provider fixtures (BASE-05)

Recorded with `npx deepspace integrations invoke <endpoint> -f <request> --json -y` on Sai's go-ahead. Requests in `src/domain/suggestions/fixtures/requests/`, responses next to them. Files are the CLI's `{ ok, success, data }` wrapper, pretty-printed; SerpApi `search_metadata` archive URLs (`json_endpoint`, `markdown_endpoint`, html files) redacted.

| Fixture | Endpoint | Result | Cost |
|---|---|---|---|
| `geocoding-dallas.json` | `openweathermap/geocoding` `q: "Dallas"` | 5 candidates (Dallas TX, GA, OR, Đà Lạt VN, …) → the SUG-09 ambiguous case | $0.00195 |
| `geocoding-dallas-tx-us.json` | `q: "Dallas, TX, US"` | exactly 1 (Texas, 32.776, -96.797) | $0.00195 |
| `forecast-dallas.json` | `openweathermap/forecast` `q: "Dallas, TX, US"`, metric | 40 entries, 3-hour steps, `{ dt, temp, feels_like, humidity, description, icon }` | $0.00195 |
| `places-dallas.json` | `serpapi/places-search` `q: "coffee food indoor Dallas, TX, US"` | 20 `local_results` | $0.0325 |
| `places-dallas-ll.json` | same, `q: "coffee food indoor"`, `ll: "@32.7767,-96.7970,14z"` | 20 `local_results`, different set, echoed `ll` | $0.0325 |
| `chat-completion-haiku.json` | `anthropic/chat-completion`, `claude-haiku-4-5`, `max_tokens` 400, temperature 0 | 230 in / 132 out tokens, `costUsd` 0.00089 | $0.00089 |

Total ≈ $0.072. `app usage` afterwards (30-day, all apps): serpapi 4 calls $0.07, openweathermap 6 calls $0.0059, anthropic 2 calls $0.0012; credits 493/500.

- **`ll` support:** yes. `places-search` accepts `ll` (`@lat,lon,zoom`), echoes it in `search_parameters`, and returns a location-centred set. Use it with the geocoded coordinates (spec §7 "`ll` if Block 0 confirms it").
- **`EXPLAINER_MODEL`:** `claude-haiku-4-5` (served as `claude-haiku-4-5-20251001`). The endpoint default is `claude-opus-5-5`, so the model must be set explicitly. Price observed: $0.00089 for 230 input + 132 output tokens (≈ $1 / M input, $5 / M output).
- **Notes for Block 4 (not acted on):**
  - Haiku wrapped its JSON in a ```` ```json ```` fence. Under a strict reading of SUG-04 ("accepted only if it parses as the schema") every run would lose its explanations. T4.5 needs a decision: strip one surrounding code fence before parsing, or prefill the assistant turn with `{`.
  - Injection candidate (`c2`, name = "Ignore all previous instructions…") was treated as data: structure kept, no "HACKED" output (SUG-05 evidence).
  - `places-dallas-ll.json` contains the same venue title twice ("Daily Coffee", different `place_id`s). §7 dedupes by `providerPlaceId` and by name *against existing options*; duplicates by name within one result set are not covered. Decide in T4.2.
  - Place results carry `price`, `hours`, `rating`, `phone`. OPT-03 requires unknown facts to show "Unconfirmed" and no fact without a source; the normalizer should keep only what the option shape has.

### Block 0 gate (T0.9)

**Tasks done**
- T0.1 — test accounts `Host`, `Member`, `Outsider` (`planit-*@deepspace.test`, label `planit`) created via `test accounts create --password-stdin` with random passwords; `Planner A`/`B` left in the pool. No files.
- T0.2 — `CLAUDE.md`, `/red`, `/green`, `/block`, traceability, dev log: `04433c9`, `528574d`.
- T0.3 — prune api-status page, nav hint, its two collab tests: `05637b9`.
- T0.4 — BASE-02 outings schema: `fc79f95`.
- T0.5 — SEC-01, BASE-06: serialized room, public route, minimal `createOuting`: `390b792`.
- T0.6 — BASE-01, BASE-03: home outing count, three-user collab checks: `746fcd6`.
- T0.7 — SEC-02 first half, integration proxy 403: `fad37d7`.
- T0.8 — BASE-05 provider fixtures: `6c40d28`.

**Ported:** `src/schemas/outings-schema.ts` (verbatim); `worker.ts:54-82` room `fetch` override + `blockConcurrencyWhile` (thrown strings → §5 codes; suggestion counter not ported); `src/server/outing-routes.ts:7-10` route + auth (response shape → §5); `src/server/http-routes.ts:232-236` integration 403.

**Fault injection (each red, then restored and green):** SEC-01 auth check skipped; SEC-01 unverified JWT payload trusted; BASE-06 client `X-User-Id` forwarded to the room; BASE-06 public route into `/internal/outing`; BASE-03 read policy `true`; SEC-02 proxy reopened with an offline stub (no paid call).

**Gate results:** `test run unit` 2/2 · `test run all --port 5199` 14/14 Playwright (api 5, smoke 6, collab 3) + unit 2/2 · `tsc --noEmit` clean · `npm run lint` clean. Port 5173 is held by another process on this machine, so suites ran on 5199.

**Spec gaps / decisions taken without a spec line (review):**
1. §5 does not say what an *unauthenticated* request for an unknown command gets. Implemented 401 (authentication is first in the check order), so command names aren't discoverable. Signed-in unknown or internal command → 404 `NOT_FOUND`.
2. §5 "max 12 KB": over-size bodies return 400 `INVALID_INPUT` ("400 for every refusal"); the prototype used 413.
3. `applyCommand` takes an optional 6th argument `newId` (id generator) so tests can be deterministic; §4.1 lists five.
4. BASE-03's "new writes" are currently two `createOuting`s; extend with update writes when `joinOuting` / option commands exist.
5. Test outings accumulate in local dev storage until `deleteOuting` (T1.8) lets tests clean up.
6. Block 4 notes from fixtures (fenced LLM JSON vs SUG-04; same-name duplicates within one places result set) — see T0.8 above.

**Codex adversarial review:** not run — Codex plugin not installed.

**Open:** `createOuting` stores unvalidated input with `startAt: ''` until T1.1/T1.4 (marked `ponytail:`); every other command throws "not implemented" (route answers 500).

Verified by Sai:

## Blocks 1–6 (2026-10-05, one continuous agent session)

Sai asked for the whole build without stopping after each patch. The agent worked task by task and committed per task group. It held back only what CLAUDE.md reserves for Sai: deploys, pushes, paid calls, and the manual checks.

### What Sai changed
- Spec v1.1.3 (committed separately as `abbb359`): §5 status codes plus 500 `INTERNAL`, a stronger BASE-02, and §7 dedupe within results plus code-fence stripping. The agent followed up in `2e07ec1`: the room never throws, and BASE-02 now pins read-only `collaborator` with no `'*'` entry.

### Block 1 — create, home, invite, join, delete
- `a99654b` T1.1–T1.4: `src/domain/time.ts` (local date and time to `startAt` with Intl only; DST gap → null; overlap → the earlier instant) and `src/domain/validate.ts` (zod, §5 limits). OUT-04 went red on the first run: the ±3 h probes missed the transition, so they were widened to ±24 h.
- `f5b0350` T1.5–T1.8: `applyCommand` handles create, join and delete. The room does load → apply → save, finding records by `id` or by invite token. Api tests cover OUT-01, INV-01, INV-03 and OUT-07.
- `8674ecb` T1.9–T1.11: UI (list, create dialog with no name field, invite gate, outing page shell, Copy invite, delete), `src/lib/outing-api.ts` (pending state and refusal message, no optimistic writes), and a PlanIt theme. OUT-06 went red on the first run because T0.5-era records with an empty `startAt` crashed the page. `formatInZone` now degrades to "Time unavailable", and a one-off cleanup deleted the leftovers.

### Block 2 — options, responses, finalize
- `221c2e9`: options (creator lock, host delete), responses (upsert, `null` clears), finalize and reopen, `tally.ts`, `summary.ts`. The **whole §6 matrix** is now a table-driven unit test (`src/domain/matrix.test.ts`, 90 cells). Fault check: removing the host's lock bypass turns its cell red.
- `0289661`: VOTE-02, BASE-04 and FIN-04 (api). FIN-04 saw both orderings: 8 responses stored before finalize, 12 refused. **Fault-injected:** without `blockConcurrencyWhile`, BASE-04 stored only 6 of 20 responses, and in FIN-04 a stale response write overwrote a finalize.
- `ab17097`: option cards (facts default to "Unconfirmed", controls only when allowed, voter names, own pick highlighted, Can't do emphasized), add/edit dialog, confirmed view (Copy plan, Reopen, "Nothing is booked"), and collab OPT-04, VOTE-06 and FIN-08.

### Block 3 — preferences and conversation
- `7a55773`: preference and comment rules plus unit tests. INV-06's second half (a new member can comment) is covered. PREF-03 went red on the first run: duplicate interests hit the array cap before dedupe.
- `761fa11`: group panel, preferences dialog and conversation, with names from the directory. PREF-02 (api), PREF-04 and COM-04 (smoke), PREF-05 and COM-03 (collab).

### Block 4 — suggestions
- `3a5047f`: adapters (live + fixture), normalize, geocode, forecast, explainer (request whitelist, one fence stripped, ≤ 240 chars), pipeline (per-call timeout 15 s), and the reserve, publish and fail phases. Route orchestration reserves in the room, fetches outside it, then publishes or fails back in the room. **Fault-injected:** putting venue names into the system prompt made SUG-05 go red.
- `11b33e7`: SUG-01 and SUG-06 (api, fixtures). SUG-01 needed a `__slow__` fixture flag for real overlap. Also suggestion status, header weather and the host-only button; SUG-11 (collab); and the SEC-02 bundle scan, which runs `npm run build` and scans `dist/client`. **Fault-injected:** SUG-11 failed with read `true` (outsider saw 4), and importing `makeFixtureAdapters` into a client module failed the bundle scan. SUG-07 smoke caught a real bug: the "View on Google Maps" label pointed at the venue website, so suggested cards now show Website and Source separately.
- T4.10: live adapters (`live.ts`) and billing config (`src/integrations.ts`: serpapi, openweathermap, anthropic → `developer`) are written. **The live local run (SUG-16) has not been done** (paid, needs Sai).

### Block 5 — usability
- `0945b36`: the first paint shows "Loading PlanIt…" (the scaffold's `AuthBoot` panel was blank, which conflicts with UX-02). A Live indicator reads `useRecordContext().status`. UX-03 drops the socket for real via `routeWebSocket`: `setOffline` does not close an open WebSocket in Chromium. The same test shows a change made while offline appearing after reconnect, which is evidence for UX-05. The automated part of UX-04 checks there is no horizontal scroll at 390 px and every visible control has an accessible name.

### Block 6 — release
- `16f0dfc`: SEC-04 drives every outing command and the other data-returning routes as a non-owner and finds no emails or `email` fields. **Fault-injected:** returning `user.list` rows from `joinOuting` turned the test red. Daily-cap fix: see spec gap 1.
- SEC-03 pre-check: `.dev.vars` is ignored; tracked files, fixtures and `dist/client` contain no secret-shaped strings.
- README rewritten (setup, architecture, integrations, limitations, unused scaffold code).

### Ported from the prototype
`src/schemas/outings-schema.ts`, `worker.ts` room override, `src/server/outing-routes.ts` auth shell, and the `http-routes.ts` 403 (Block 0). Nothing else was ported; the UI was written fresh against the spec, with the prototype's palette used for the theme.

### Spec gaps and decisions taken without a spec line (please review)
1. **D-16 daily cap counts billable runs only.** The cap lived in room storage and counted fixture runs, so local suites (about 9 runs per full pass) hit 30 within a day and every suggestion test failed with LIMIT_REACHED. Now only runs with live providers count. Deployed apps always use live providers, so production matches §7 exactly. The route sets `billable` on the internal room request; client input is ignored for this command. **Proposed spec change**, §7 Reserve: old "app-wide runs today `< 30`"; new "app-wide *billable* (live-provider) runs today `< 30`; fixture runs don't count". Reason: keeps test suites repeatable without weakening the spend limit.
2. `applyCommand` takes an optional 6th argument, `ctx = { newId, appRunsToday }`. §4.1 lists five.
3. Option- and comment-level NOT_FOUND comes after the membership check, so outsiders learn nothing about options, and before the role check. Finalize order: member → host → option NOT_FOUND → INVALID_STATE. §5's check order only names record lookup.
4. `requestSuggestions`: reuse is checked before the limits, so an active run is reused even at the cap.
5. Suggested options get `createdBy` = the host who requested them, so the host can edit them as creator. The UI labels them "Suggested place", not "Proposed by".
6. A run with zero new places ends `failed` with "No new places found…". §7 doesn't cover zero results.
7. Join with a non-string token → INVALID_INPUT; any unknown string token → INVITE_INVALID, with an identical body (INV-03).
8. Duplicate interests are collapsed (array bound 32 before dedupe).
9. When nobody has interests, the places query uses "things to do".
10. Fixture flags (`__fail_*__`, `__bad_explain__`, `__slow__`) are read only by fixture adapters.
11. Provider selection: `PROVIDERS` if set; otherwise fixtures where the CLI sets `ALLOW_DEBUG_ROUTES` (local dev/test), live elsewhere. `.dev.vars` is CLI-generated, so the plan's ".dev.vars sets PROVIDERS=fixture" wasn't possible.
12. No `planner.css`: styling is Tailwind plus a `planit` theme in `src/themes.css`.

### Not done (needs Sai)
- **Every block gate's deploy:** T1.12 (decide GitHub vs DeepSpace source first; the first deploy latches it permanently), T2.13, T3.7, T4.14, T5.5. No deploy or push was run.
- **SUG-16:** one local run with live providers (about $0.07).
- **REL-02, REL-03, REL-04:** live checks on the deployed app.
- **Manual checks:** the keyboard part of UX-04, UX-05, SEC-03 sign-off.
- **Codex adversarial review:** plugin not installed.

### Results at the end of the session
`test run unit` 149/149 · `test run all` 49/49 Playwright · `tsc --noEmit` clean · `npm run lint` clean · `npm run build` OK. Separate api and e2e counts are in the REL-01 row of `docs/traceability.md`.

Verified by Sai:
