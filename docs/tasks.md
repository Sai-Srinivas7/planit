# PlanIt — Tasks

Implements `docs/plan.md` against `docs/spec.md` v1.1.2. Work top to bottom.
Each task: one red → green → refactor loop per AC (`/red <AC>` then `/green <AC>`), unless marked *setup* or *manual*.
A task is done when its ACs are ticked in `docs/traceability.md` and committed.

Legend: **ACs** · level · files · done check

---

## Block 0 — Harness and foundations

| ID | Task | ACs | Files | Done check |
|---|---|---|---|---|
| T0.1 | *setup* Test accounts: 3 usable, named `Host`, `Member`, `Outsider` (`npx deepspace test accounts create --email <x>@deepspace.test --name "<Name>" --password-stdin`) | — | — | `test accounts list --usable` shows all 3 |
| T0.2 | *setup* Review `CLAUDE.md`, `.claude/commands/red.md`, `green.md`, `docs/traceability.md`, `docs/DEVELOPMENT_LOG.md` | — | those files | Committed |
| T0.3 | *setup* Prune `api-status.tsx`, its nav entry, and the collab tests that cover it | — | `src/pages/(app)/(protected)/api-status.tsx`, `src/nav.ts`, `tests/collab.spec.ts` | typecheck + `test run unit` + `test run all` green |
| T0.4 | `outings` schema pinned | BASE-02 [unit] | `src/schemas/outings-schema.ts`, `src/schemas.ts`, `src/schemas/outings-schema.test.ts` | Test fails before schema exists, passes after |
| T0.5 | Serialized room + public route + minimal `createOuting` (stores record, caller = host) | SEC-01 [api], BASE-06 [api] | `worker.ts`, `src/server/outing-room.ts`, `src/server/outing-routes.ts`, `src/domain/{types,errors,commands}.ts`, `tests/helpers/outing.ts`, `tests/api.spec.ts` | No JWT → 401; unknown command → 404; `/internal/outing` from outside → not routed; spoofed `X-User-Id` ignored (record's `hostId` = real caller) |
| T0.6 | Minimal home list (`data-testid="outing-count"`) + three-user check | BASE-01 [collab], BASE-03 [collab] | `src/pages/(app)/home.tsx`, `src/features/outing/OutingList.tsx`, `tests/collab.spec.ts` | Outsider count stays 0 after host creates and updates an outing |
| T0.7 | Block the browser integration proxy | SEC-02 first half [api] | `src/server/http-routes.ts`, `tests/api.spec.ts` | `POST /api/integrations/openweathermap/geocoding` → 403 |
| T0.8 | *manual* Record fixtures with `npx deepspace integrations invoke` (geocoding "Dallas" and "Dallas, TX, US", forecast, places-search, chat-completion); try `ll`; pick `EXPLAINER_MODEL` from `integrations info anthropic/chat-completion` pricing | BASE-05 [manual] | `src/domain/suggestions/fixtures/*.json`, `docs/DEVELOPMENT_LOG.md` | Fixtures committed; `ll`, model, price logged |
| T0.9 | *gate* Block 0 exit | — | `docs/DEVELOPMENT_LOG.md` | All suites green with nonzero counts incl. collab; log entry; commit |

## Block 1 — Create, home, invite, join, delete

| ID | Task | ACs | Files | Done check |
|---|---|---|---|---|
| T1.1 | Local date+time+tz → `startAt`; display in outing tz | OUT-03 [unit] | `src/domain/time.ts` (+test) | Same local time for viewers in other zones |
| T1.2 | Reject DST-gap local times | OUT-04 [unit] | `time.ts` | `2026-03-08 02:30 America/Chicago` → INVALID_INPUT |
| T1.3 | Reject past start times (injected `now`) | OUT-05 [unit] | `time.ts`, `validate.ts` | |
| T1.4 | Create-input validation and limits | OUT-02 [unit] | `src/domain/validate.ts` (+test) | Each field: missing, over limit, bad tz |
| T1.5 | Full `createOuting` record | OUT-01 [api] | `commands.ts`, `outing-room.ts` | Record shape matches spec §4.3 |
| T1.6 | Join rules: idempotent, finalized allowed, cap 50 | INV-02, INV-06, INV-07 [unit] | `commands.ts` (+test) | |
| T1.7 | Join wiring; invalid vs deleted token identical | INV-01, INV-03 [api] | `outing-room.ts` (token lookup), `tests/api.spec.ts` | Response bodies byte-identical |
| T1.8 | `deleteOuting` (host only) | OUT-07 [unit + api] | `commands.ts`, `outing-room.ts` | Member → NOT_HOST; invite after delete → INVITE_INVALID |
| T1.9 | Home list + create dialog (no name field) | OUT-06, OUT-08 [smoke] | `OutingList.tsx`, `CreateOutingDialog.tsx`, `src/lib/outing-api.ts`, `src/planner.css` | Timezone on cards; pluralized count |
| T1.10 | Invite gate + Copy invite | INV-04, INV-05 [smoke] | `InviteGate.tsx`, `OutingPage.tsx` (shell) | Signed-out valid/invalid identical |
| T1.11 | Pending + refusal states for create/join/delete | UX-01 [smoke] | `outing-api.ts`, components | Refused command shows message, nothing appears saved |
| T1.12 | *gate* Decide GitHub vs DeepSpace source; `npx deepspace deploy`; live create + join with two accounts | — | `DEVELOPMENT_LOG.md` | Live URL works; log entry; commit |

## Block 2 — Options, responses, finalize

| ID | Task | ACs | Files | Done check |
|---|---|---|---|---|
| T2.1 | `addOption` + validation + cap 30 | OPT-01, OPT-02 [unit] | `commands.ts`, `validate.ts` | |
| T2.2 | Edit/delete with creator lock and host delete | OPT-05, OPT-06, OPT-07, OPT-08 [unit] | `commands.ts` | Every option row of spec §6 has a test |
| T2.3 | `setResponse` incl. clear and unknown option | VOTE-01, VOTE-03, VOTE-07 [unit] | `commands.ts` | |
| T2.4 | Forged `userId` ignored | VOTE-02 [api] | `tests/api.spec.ts` | |
| T2.5 | 20 concurrent responses, no lost updates | BASE-04 [api] | `tests/api.spec.ts` | Exactly 20 responses stored |
| T2.6 | Tally, voter lists, sort | VOTE-04 [unit] | `src/domain/tally.ts` (+test) | Tie → older option first |
| T2.7 | finalize / reopen and frozen commands | FIN-01, FIN-02, FIN-03, FIN-07 [unit] | `commands.ts` | Reopen keeps responses and selection |
| T2.8 | Copy-plan text | FIN-06 [unit] | `src/domain/summary.ts` (+test) | Includes tz, "unconfirmed", "nothing is booked" |
| T2.9 | Concurrent `setResponse` vs `finalize`, 20 runs | FIN-04 [api] | `tests/api.spec.ts` | No response stored after `finalizedAt` |
| T2.10 | Option card + dialog: Unconfirmed facts, allowed controls only, voter names, own choice highlighted, click-again clears | OPT-03, OPT-09, VOTE-05, VOTE-07 [smoke] | `OptionCard.tsx`, `OptionDialog.tsx`, `names.ts` | |
| T2.11 | Confirmed view + reopen pre-selection | FIN-05, FIN-07 [smoke] | `ConfirmedPlan.tsx` | "Nothing is booked" visible |
| T2.12 | Live updates host ↔ member | OPT-04, VOTE-06, FIN-08 [collab] | `tests/collab.spec.ts` | |
| T2.13 | *gate* UX-01 for Block 2 commands; deploy; live loop without suggestions | UX-01 [smoke] | `DEVELOPMENT_LOG.md` | |

## Block 3 — Preferences and conversation

| ID | Task | ACs | Files | Done check |
|---|---|---|---|---|
| T3.1 | Preference validation (fixed values) and storage | PREF-03, PREF-01 [unit] | `validate.ts`, `commands.ts` | |
| T3.2 | Forged `userId` ignored | PREF-02 [api] | `tests/api.spec.ts` | |
| T3.3 | Comments: post, cap 200, author/host delete, hard delete | COM-01, COM-02, COM-05 [unit] | `commands.ts` | |
| T3.4 | Group panel + preferences dialog with directory names | PREF-04, COM-04 [smoke] | `GroupPanel.tsx`, `PreferencesDialog.tsx`, `names.ts` | Names match account names |
| T3.5 | Conversation panel with delete controls | COM-04 [smoke] | `Conversation.tsx` | |
| T3.6 | Live updates | PREF-05, COM-03 [collab] | `tests/collab.spec.ts` | Deleted comment disappears live |
| T3.7 | *gate* UX-01; deploy; REL-02 path live | UX-01 | `DEVELOPMENT_LOG.md` | |

## Block 4 — Suggestions

Fixture mode: `.dev.vars` sets `PROVIDERS=fixture` for local tests. Failure scenarios are selected by a location prefix that only the fixture adapters read (for example `__fail_places__ Dallas, TX`), never by live adapters.

| ID | Task | ACs | Files | Done check |
|---|---|---|---|---|
| T4.1 | Adapter interfaces + fixture adapters | — (supports SUG-13) | `suggestions/adapters.ts`, `fixture.ts` | Typecheck |
| T4.2 | Normalize, dedupe, cap 3 | SUG-03 [unit] | `normalize.ts` (+test) | Uses recorded places fixture |
| T4.3 | Geocode 0 / 1 / many | SUG-09 [unit] | `geocode.ts` (+test) | "Dallas" fixture → ambiguous |
| T4.4 | Forecast within 90 min or unavailable | SUG-07 [unit] | `forecast.ts` (+test) | |
| T4.5 | Explainer request and output validation | SUG-04, SUG-05, SUG-08 [unit] | `explain.ts` (+test) | Injection fixture keeps structure |
| T4.6 | Reserve phase: running reuse, limits, stale run | SUG-01, SUG-02, SUG-15 [unit] | `commands.ts`, `outing-room.ts` (daily counter) | |
| T4.7 | Publish / fail phases | SUG-10, SUG-12 [unit] | `commands.ts` | Finalized → results discarded |
| T4.8 | Pipeline with fixture adapters | SUG-13 [unit] | `pipeline.ts` (+test) | No network calls |
| T4.9 | Route orchestration | SUG-01, SUG-06 [api] | `outing-routes.ts` | Two concurrent requests → providers called once; places failure → run `failed`, nothing else changed |
| T4.10 | Live adapters + billing config; one local live run | SUG-16 [manual], SUG-13 (live explainer fixture) | `suggestions/live.ts`, `src/integrations.ts` | Live run logged with cost |
| T4.11 | Suggestion status, header weather, host-only button | SUG-07, SUG-14 [smoke] | `SuggestionStatus.tsx`, `OutingPage.tsx` | |
| T4.12 | Run status live; outsider receives nothing | SUG-11 [collab] | `tests/collab.spec.ts` | |
| T4.13 | Client bundle has no provider URLs | SEC-02 second half [api] | `tests/api.spec.ts` | Built JS assets contain no provider hostnames |
| T4.14 | *gate* deploy; one live run on deployed app | REL-04 [manual] | `DEVELOPMENT_LOG.md` | Cost noted |

## Block 5 — Usability pass

| ID | Task | ACs | Done check |
|---|---|---|---|
| T5.1 | Loading state on first paint | UX-02 [smoke] | |
| T5.2 | Live indicator only when signed in and connected | UX-03 [smoke] | |
| T5.3 | 390 px and keyboard pass | UX-04 [manual] | Notes in log |
| T5.4 | Reconnect shows server state | UX-05 [manual] | Notes in log |
| T5.5 | *gate* deploy | — | |

## Block 6 — Release

| ID | Task | ACs | Done check |
|---|---|---|---|
| T6.1 | Full suites, typecheck, lint, build | REL-01 | Counts recorded |
| T6.2 | Live two-account loop and refused paths | REL-02, REL-03 | Checklist in log |
| T6.3 | Secrets and users-row checks | SEC-03, SEC-04 | |
| T6.4 | README: setup, architecture, integrations, limitations, scaffold code not used | — | |
| T6.5 | Submission note: what was built, integrations, main tradeoff, what the agent did, what Sai verified | — | |
| T6.6 | Final traceability pass: every AC has test → implemented → browser → deployed | — | No empty cells without a reason |
