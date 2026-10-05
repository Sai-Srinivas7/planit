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
