# PlanIt — Implementation plan

Status: draft for review. Implements `docs/spec.md` v1.1.2. Next: `docs/tasks.md` (ordered tasks per AC).
Reference only: prototype at `~/actually-go` (tag `prototype-codex-oneshot`). Never edited, never deployed.

## 1. Working rules

- **Spec first.** If code or a test shows the spec is wrong, stop, edit `docs/spec.md`, bump the version, add a changelog line, commit that alone (`spec: v1.x.y — <why>`), then continue.
- **One AC at a time.** Write the test named with the AC ID, run it, confirm it fails for the intended reason, implement the minimum, run the block's suite, refactor, commit (`AC-ID: <what>`).
- **Ported code** comes in only behind a failing test. Commit message says `ported from prototype <file>`.
- **Mock only at provider adapters.** Never mock `applyCommand`, the room, or routes.
- **Every block ends deployed** (from Block 1) and with a `docs/DEVELOPMENT_LOG.md` entry: what the agent did, what Sai changed, what Sai verified.

## 2. Target layout

New or changed files only. Scaffold files not listed stay as they are.

```
src/domain/                      pure logic, no I/O — the unit-test seam
  types.ts                       Outing, Option, Preference, Weather, enums, caps
  errors.ts                      CommandError { code, message }, code list
  time.ts                        startAt from date+time+IANA tz; DST-gap and past checks
  validate.ts                    zod schemas for every command input (spec §5 limits)
  commands.ts                    applyCommand(outing, userId, command, input, now)
  commands.test.ts               table-driven authorization matrix + rules
  tally.ts / tally.test.ts       counts, voter lists, sort (VOTE-04)
  summary.ts / summary.test.ts   copy-plan text (FIN-06)
  suggestions/
    adapters.ts                  Geocoder, Forecast, Places, Explainer interfaces
    live.ts                      implementations via integrations.call
    fixture.ts                   implementations from fixtures/*.json
    fixtures/*.json              recorded in Block 0
    normalize.ts (+test)         SerpApi result → Option; dedupe; cap 3
    geocode.ts (+test)           0 / 1 / many candidates (SUG-09)
    forecast.ts (+test)          pick entry within 90 min of startAt
    explain.ts (+test)           build request, parse + validate output (SUG-04/05)
    pipeline.ts (+test)          fetch phase orchestration with adapters

src/server/
  outing-room.ts                 in-room handler: load record, applyCommand, save, invite lookup,
                                 app-wide daily counter (room storage)
  outing-routes.ts               POST /api/outing/:command — JWT, allowlist, 12 KB cap, suggest flow
  http-routes.ts                 CHANGE: /api/integrations/* → 403
worker.ts                        CHANGE: AppRecordRoom.fetch override (/internal/outing +
                                 blockConcurrencyWhile); registerOutingRoutes(app)
src/schemas/outings-schema.ts    NEW (spec §4.2);  src/schemas.ts CHANGE: register it
src/integrations.ts              CHANGE: serpapi, openweathermap, anthropic → 'developer'

src/lib/outing-api.ts            client: callCommand() → { ok, data } | { ok:false, code, message }
src/features/outing/             UI, split from the prototype's single home.tsx
  OutingList.tsx  CreateOutingDialog.tsx  InviteGate.tsx  OutingPage.tsx  OptionCard.tsx
  OptionDialog.tsx  GroupPanel.tsx  PreferencesDialog.tsx  Conversation.tsx
  ConfirmedPlan.tsx  SuggestionStatus.tsx  useOuting.ts  names.ts (directory lookup)
src/pages/(app)/home.tsx         CHANGE: routes ?outing= / ?invite= to the feature components
src/planner.css                  ported styles

tests/helpers/outing.ts          signed-in command helper, create/cleanup fixtures
tests/api.spec.ts                EXTEND: wiring, auth, concurrency, provider failure
tests/collab.spec.ts             EXTEND: live updates, outsider receives nothing
tests/smoke.spec.ts              EXTEND: rendering ACs
docs/traceability.md             AC → test → implemented → browser → deployed
docs/DEVELOPMENT_LOG.md          per block
CLAUDE.md                        PlanIt rules for Claude Code (keeps pointer to AGENTS.md)
.claude/commands/red.md, green.md
```

**Prune** (Block 0, only if typecheck and the baseline suite stay green): `api-status.tsx` page, its nav entry, and the collab tests that cover it. Leave Durable Object classes in place (removing one needs a DO migration). Leave `src/ai/*`, `cron.ts`, `jobs.ts` untouched and unregistered; list them in the README as scaffold code PlanIt doesn't use.

## 3. Test design

| Level | What it proves | Pattern |
|---|---|---|
| `[unit]` `src/domain/*.test.ts` | Every rule and every ✗ cell in spec §6 | Table: `[actor, state, command, input] → code`. Fixtures build outings in any state with a `makeOuting()` helper. `now` is injected so time rules are deterministic. |
| `[api]` `tests/api.spec.ts` | Route, JWT, allowlist, room wiring; concurrency; forged fields | `users()` pages fetch a token and POST commands (helper ported from prototype `tests/outing.spec.ts:4-11`). Concurrency: `Promise.all` of 20 commands, then read the record. |
| `[collab]` `tests/collab.spec.ts` | Realtime between host and member; outsider receives nothing | `users(['Host','Member','Outsider'])`. Outsider check: count of `outings` records on the outsider's page stays 0 after host writes. |
| `[smoke]` `tests/smoke.spec.ts` | Rendering rules, controls shown/hidden | Signed-in pages, `data-testid` selectors |

Commands to run: `npx deepspace test run unit`, `npx deepspace test run api`, `npx deepspace test run all`. The default `test run` skips collab, so it never counts as a full run.

Test data: every outing title starts with `__test-${Date.now()}__`; created outings are deleted in `finally` via `deleteOuting`.

## 4. Blocks

Each block: ACs in order → files → port source → exit check. Exit check is spec §10 plus the block's deploy.

### Block 0 — Harness and foundations
1. Create a third test account (`Outsider`); confirm `test accounts list --usable` shows 3. Rename the pool accounts used by tests to `Host`, `Member`, `Outsider` selectors.
2. Write `CLAUDE.md` rules, `/red` and `/green` commands, empty `traceability.md` and `DEVELOPMENT_LOG.md`.
3. Prune per §2.
4. `outings` schema + register → **BASE-02** (direct client writes refused).
5. Room override + route skeleton with one trivial command (`createOuting` minimal) → **BASE-06** (internal path unreachable, client `X-User-Id` ignored), **SEC-01**. Port: `worker.ts:49-82`, `outing-routes.ts`.
6. **BASE-01**, **BASE-03** (outsider receives nothing).
8. **BASE-05**: record fixtures with `npx deepspace integrations invoke` for geocoding, forecast, places-search, chat-completion (~$0.04 total + one LLM call); save to `src/domain/suggestions/fixtures/`; note `ll` support, chosen `EXPLAINER_MODEL`, and its price.
9. `/api/integrations/*` → 403 (**SEC-02** first half). Port: `http-routes.ts:230-234`.

Exit: all suites green with nonzero counts, including collab; no deploy yet (nothing user-facing).

### Block 1 — Create, home, invite, join, delete
ACs: OUT-01…08, INV-01…07.
Order: `time.ts` (OUT-03/04/05) → `validate.ts` (OUT-02) → `applyCommand` create/join/delete (OUT-01, OUT-07, INV-02, INV-06, INV-07) → api wiring (INV-01, INV-03) → UI: OutingList, CreateOutingDialog, InviteGate, Copy invite (OUT-06, OUT-08, INV-04, INV-05).
Port: create/join from prototype `outing-room.ts:17-38` (minus name fields); home list and invite page layout from `home.tsx`.
Exit: **first deploy** (`npx deepspace deploy`) to `planit.app.space`; create + join checked live with two accounts.

### Block 2 — Options, responses, finalize
ACs: OPT-01…09, VOTE-01…07, FIN-01…08, BASE-04.
Order: options (OPT-01/02/05–08 unit) → responses (VOTE-01/03/07 unit, VOTE-02 api) → tally (VOTE-04) → finalize/reopen (FIN-01/02/03/07) → summary (FIN-06) → concurrency (FIN-04 api) → UI: OptionCard, OptionDialog, ConfirmedPlan (OPT-03/09, VOTE-05, FIN-05, FIN-07 smoke) → collab (OPT-04, VOTE-06, FIN-08).
Port: vote rules and `summary()` from prototype `outing.ts`; card layout from `home.tsx`.
Exit: deploy; full loop without suggestions checked live.

### Block 3 — Preferences and conversation
ACs: PREF-01…05, COM-01…05.
Order: preference validation (PREF-03) → set (PREF-01, PREF-02 api) → comments (COM-01/02/05) → UI: GroupPanel, PreferencesDialog, Conversation, `names.ts` directory lookup (PREF-04, COM-04) → collab (PREF-05, COM-03).
Exit: deploy; REL-02 path checked live.

### Block 4 — Suggestions
ACs: SUG-01…15, SEC-02 (second half).
Order: pure pieces against fixtures first — normalize (SUG-03), geocode (SUG-09), forecast (SUG-07 unit), explain (SUG-04/05/08) → room phases: reserve, limits, stale run (SUG-01 unit, SUG-02, SUG-15), publish/fail (SUG-10, SUG-12) → pipeline with fixture adapters (SUG-13) → route orchestration (SUG-01 api, SUG-06) → live adapters via `buildCronContext(env, env.OWNER_USER_ID).integrations.call` (SUG-16) → UI: SuggestionStatus, weather in header, button rules (SUG-07 smoke, SUG-14) → collab (SUG-11).
Do not port `suggestions.ts`.
Exit: deploy; **REL-04** one live run on the deployed app, cost noted.

### Block 5 — Usability pass
ACs: UX-02, UX-03, UX-04, UX-05 (UX-01 is checked in every block).
Mobile width, keyboard pass, loading state on first paint, live indicator only when connected.
Exit: deploy.

### Block 6 — Release
ACs: REL-01…03, SEC-03, SEC-04.
README (setup, architecture, integrations, limitations), submission note (what was built, integrations, main tradeoff, what the agent did, what Sai verified), final traceability pass.

## 5. Risks to check early

| Risk | Where it bites | Check |
|---|---|---|
| `RecordRoom.fetch` override or internal `/api/tools/execute` behaves differently in SDK 0.37.0 than in the prototype's install | Block 0 step 5 | Prototype ran the same SDK version (0.37.0); BASE-04 and BASE-06 prove it here |
| `integrations.call` response shapes (geocoding, places have no published output schema) | Block 4 | Fixtures from Block 0 step 8 define them before any parser is written |
| Account display names: test accounts may all show placeholder names | Block 3 COM-04 | Give test accounts distinct `--name` values in step 1 |
| Provider latency inside the request | Block 4 | Per-call timeout; whole run fails cleanly (SUG-06) |
| GitHub latch at first release | Block 1 deploy | Decide before first deploy: ship from GitHub (repo needed for submission) |

## 6. Decisions from review

- BASE-05 via CLI fixtures in Block 0; worker path proven by SUG-16 in Block 4 (spec v1.1.2).
- BASE-04 runs in Block 2 after `setResponse`; Block 0 step 7 removed.
- BASE-02 is a schema unit test.
- GitHub vs DeepSpace source: decided right before the first deploy (end of Block 1).
