# Gap report: Codex prototype vs spec v1.0

Audited: commit `bfa5042` plus uncommitted working-tree changes, 2026-10-05. Read-only; nothing was changed.
Auditor: Claude (independent of the Codex build). Spec: `docs/spec.md` v1.0.

## Summary

The prototype solves the same problem with a different architecture. Its core loop works and has a real
end-to-end test. It is stronger than the spec on concurrency, and weaker on integrations, identity, and
several decided behaviors.

| | Spec v1.0 | Prototype |
|---|---|---|
| Data model | 8 collections (outings, team_members, invitations, preferences, options, responses, comments, suggestion_runs) | 1 collection `outings`; everything else in a JSON `payload` field |
| Read boundary | `'team'` via `team_members` | `'collaborator'` via a `members` array on the record |
| Write path | DeepSpace server actions | Custom Hono route `/api/outing/:command` → custom `/internal/outing` endpoint inside an overridden `RecordRoom.fetch` |
| Concurrency | Not transactional; snapshot at finalize so races can't change the confirmed view | `blockConcurrencyWhile` serializes every read-modify-write; votes and confirm cannot interleave |
| Duplicate prevention | `uniqueOn` + `userBound` | Code filters then pushes, inside the serialized gate |
| Places / weather / LLM | `serpapi/places-search`, `openweathermap/*`, `anthropic/chat-completion` via proxy | Photon, Overpass (OpenStreetMap), Open-Meteo, DeepSeek, all plain `fetch`; DeepSeek only if `AI_API_KEY` is set |
| DeepSpace integrations used | 3 | **0** (the `/api/integrations/*` proxy is deliberately blocked with 403) |
| Display names | Account name from user directory | Typed at create/join ("Your name"), stored per outing |
| Tests | AC-named, unit/api/collab/smoke | 13 Playwright tests passed (last run 15:27 today), 7 Vitest unit tests; 1 large journey test covers most of the loop; none AC-named |

## Part A: foundations (evidence)

1. **Schema.** `src/schemas/outings-schema.ts`: columns `hostId` (userBound), `members` (json), `inviteToken`, `payload` (json). Every role: `read: 'collaborator'`, `create/update/delete: false`. Outsiders receive nothing over realtime; direct client writes are refused. No other business collections exist.
2. **Write paths.** `src/actions/index.ts` is empty. All writes go `src/lib/outing-api.ts` → `src/server/outing-routes.ts:8` (allowlist of commands, 12 KB body cap) → `worker.ts:55-80` (`/internal/outing`) → `src/server/outing-room.ts` → `src/outing.ts changeOuting()`, which calls the room's internal `/api/tools/execute` with `X-App-Action: true`.
3. **Identity.** User IDs come from the verified JWT (`resolveAuth`) and are passed in an internal `X-User-Id` header; no client-supplied user ID is trusted. Display names are client-typed (`outing-room.ts:19, 27`) and are not the account name. This is why the outing showed "Nate (you)" while the account menu said "Sai Srinivas".
4. **External calls.** `src/server/suggestions.ts:5-9` plain `fetch` to Photon (geocode, `limit: 1`), Overpass (places within 1.8 km), Open-Meteo (16-day hourly), and DeepSeek (`AI_BASE_URL` default `api.deepseek.com`). Called from the worker, never the client. `src/integrations.ts` lists only `google`. `src/server/http-routes.ts:230-234` returns 403 for every `/api/integrations/*` call.
5. **Tests.** `.deepspace/playwright-results.json`: 13 expected, 0 failed, 0 skipped. Six are scaffold smoke tests, two scaffold api tests, three scaffold collab tests. `tests/outing.spec.ts` holds the real coverage (one two-user journey test plus a public-caller test). `src/outing.test.ts` has 7 unit tests (run result not recorded here). One collab test is `test.skip`.

## Part B: acceptance criteria

Status: ✅ met · 🟡 partial · ❌ missing · ⚠️ wrong · 🔀 met by a different mechanism · ❓ can't tell

### BASE
| AC | Status | Evidence |
|---|---|---|
| BASE-01 | 🟡 | Journey test uses `users(2)`; no third outsider account |
| BASE-02 | 🔀 | No `uniqueOn`; vote dedupe in `changeOuting` inside the serialized gate |
| BASE-03 | ✅ | Schema denies client create/update/delete for all roles (not directly tested) |
| BASE-04 | 🟡 | `'collaborator'` read is enforced by the platform; test only checks the title isn't rendered for user B |
| BASE-05 | 🔀 | 2 s app-wide and 60 s per-outing cooldowns inside the gate instead of a lock row |
| BASE-06 | ⚠️ | No catalog endpoints used |

### OUT / INV
| AC | Status | Evidence |
|---|---|---|
| OUT-01 | ✅ | One record holds outing, host membership, and token, so creation is a single write |
| OUT-02 | 🟡 | Zod validation; limits differ (title 100 vs 80, location 150 vs 120) |
| OUT-03 | 🟡 | Stores date, time, timezone strings, not an instant; display is correct in the outing's timezone |
| OUT-04 | ❌ | No DST-gap check |
| OUT-05 | ❌ | Past dates accepted |
| OUT-06 | 🟡 | Home card omits timezone; "1 outings" not pluralized |
| INV-01 | ✅ | `join` adds member once |
| INV-02 | 🟡 | No duplicate, but returns `{ id }` without `alreadyMember` |
| INV-03 | ✅ | Unknown and deleted tokens give the same message (deleted record is gone) |
| INV-04 | ✅ | Verified in browser: valid and fake tokens render identical signed-out pages |
| INV-05 | 🔀 | Token is in the member-readable record; outsiders can't read it |
| INV-06 | ✅ | `join` has no confirmed check |

### OPT / VOTE
| AC | Status | Evidence |
|---|---|---|
| OPT-01 | ✅ | `propose`, `by` = caller, price/hours "Unconfirmed" |
| OPT-02 | 🟡 | http(s) check present; limits differ (address 250, note 500) |
| OPT-03 | ✅ | Price, hours, address show "Unconfirmed" |
| OPT-04 | ✅ | Tested live in journey test |
| OPT-05–09 | ❌ | No option edit or delete |
| VOTE-01 | ✅ | Unit test "changed vote replaces the prior vote" |
| VOTE-02 | ✅ | User ID never read from input |
| VOTE-03 | ✅ | Option must exist in this outing ("Place not found") |
| VOTE-04 | ❌ | Options render in insertion order; no tally sort |
| VOTE-05 | 🟡 | Counts and own choice (`aria-pressed`); no voter names |
| VOTE-06 | ✅ | Tested live |
| VOTE-07 | ❌ | Votes can't be cleared |

### FIN
| AC | Status | Evidence |
|---|---|---|
| FIN-01 | 🟡 | `confirmedId`, `confirmedAt` set; no snapshot (not needed under the gate) |
| FIN-02 | ✅ | Unknown option refused; already-confirmed refused |
| FIN-03 | ✅ | `requirePlanning` blocks propose, vote, preferences, suggestions; comments allowed (unit + e2e tested) |
| FIN-04 | 🔀 | Serialization makes the race impossible; untested |
| FIN-05 | 🟡 | "Voting is closed. See you there."; no "nothing is booked" note |
| FIN-06 | ✅ | `summary()` includes timezone and "Unconfirmed"; tested |
| FIN-07 | ❌ | No reopen |
| FIN-08 | ✅ | Tested live |

### PREF / COM
| AC | Status | Evidence |
|---|---|---|
| PREF-01, 02 | ✅ | One preference per person; caller from JWT |
| PREF-03 | ⚠️ | Interests are free text (max 200) and flow into the LLM prompt; budget values differ |
| PREF-04 | 🟡 | Panel shows preferences and host; no "stated, not verified" note |
| PREF-05 | ✅ | Tested live |
| COM-01 | ✅ | Server-set author and timestamp (limit 500 vs 1000) |
| COM-02, 05 | ❌ | No comment deletion |
| COM-03 | 🟡 | Live post tested; no delete |
| COM-04 | ⚠️ | Names are client-typed, not account names |

### SUG
| AC | Status | Evidence |
|---|---|---|
| SUG-01 | 🔀 | Cooldowns inside the gate prevent a double run |
| SUG-02 | 🟡 | 5 per outing, 10 per user per day; no app-wide cap |
| SUG-03 | 🟡 | Dedupe by name, not provider ID; ranked by interest keyword matches |
| SUG-04 | 🟡 | Explanations are a positional array, not keyed by candidate ID |
| SUG-05 | 🟡 | No user IDs sent; free-text interests are; system prompt treats input as data; no injection fixture test |
| SUG-06 | ✅ | 503 with readable message; manual planning unaffected |
| SUG-07 | 🟡 | Weather matched by exact hour; stored on outing and shown; 16-day range |
| SUG-08 | ✅ | Unit test: AI and weather failure still yield 3 places |
| SUG-09 | ⚠️ | Geocoder `limit: 1` silently takes the first match |
| SUG-10 | ✅ | `finishSuggestions` rechecks `requirePlanning` |
| SUG-11 | ❌ | No run record; suggestions run synchronously in the request |
| SUG-12 | ✅ | Appends, skipping names already present |
| SUG-13 | 🟡 | Tests stub global `fetch`; no adapter seam |
| SUG-14 | 🟡 | Host-only enforced server-side; button state not checked |

### UX / SEC
| AC | Status | Evidence |
|---|---|---|
| UX-01 | ❓ | Not checked |
| UX-02 | 🟡 | Loading text exists; browser showed 1–3 s blank first paint |
| UX-03 | 🟡 | "Live updates" bound to query `ready`; observed while signed out |
| UX-04 | 🟡 | Journey test asserts no horizontal scroll at 390 px; keyboard not checked |
| UX-05 | ❓ | Not checked |
| SEC-01 | ✅ | 401 tested for `create` |
| SEC-02 | ⚠️ | No client provider calls (good), but worker uses plain `fetch`, not `tools.integration` |
| SEC-03 | ✅ | `.dev.vars` git-ignored and untracked |
| SEC-04 | ✅ | No route returns `users` rows |

## Part C: code with no AC behind it

- Host can delete an outing (`delete` command, UI "Delete outing").
- Caps: 50 members, 30 options, 200 comments per outing.
- Scaffold pages and modules: `api-status.tsx`, `settings.tsx`, `src/ai/*` (assistant chat), `src/cron.ts`, `src/jobs.ts`, `src/products.ts`, `src/subscriptions.ts`.
- Working tree differs from the commit: `BUILD_STATE.md` deleted, `index.html` and `src/constants.ts` modified, and `.claude/skills/deepspace/*` gave I/O errors when read.

## Correction to the earlier browser review

"Forecast unconfirmed" on the Oct 11 outing was not a failed weather call. That text is the default
until a suggestion run happens, and no run had happened on that outing.

## The decision this report forces

The architecture choice comes before any fix.

- **Keep the prototype's command room** and revise the spec (v1.1): the serialized gate becomes the
  atomic boundary, the snapshot and `uniqueOn` rules drop out, and the "main tradeoff" in the writeup is
  real atomicity in exchange for one global serialized room and an override of SDK internals.
- **Move to the spec's model**: separate collections, server actions, platform `uniqueOn`. More DeepSpace
  primitives, but no atomic read-modify-write, so the snapshot workaround stays.

Fixes needed either way: route all three providers through the DeepSpace proxy; account names instead
of typed names; reopen; vote clear; option edit/delete; comment delete; tally sort and voter names;
fixed interest tags; ambiguous-location handling; past-date check.
