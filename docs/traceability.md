# Traceability

Source: `docs/spec.md` v1.1.3. Tick a column only with evidence (test name, commit, or log entry).

| AC | Level | Test (name/file) | Seen failing | Implemented | Browser-verified | Deployed-verified |
|---|---|---|---|---|---|---|
| BASE-01 | collab | `BASE-01: the users fixture signs in three distinct accounts: host, member, outsider` (`tests/collab.spec.ts`) | Not seen failing (test of the harness; accounts `Host`, `Member`, `Outsider` created in T0.1) | Test accounts `planit-{host,member,outsider}@deepspace.test` |  |  |
| BASE-02 | unit | `BASE-02: … reads only as collaborator, and has no anonymous entry` (`src/schemas/outings-schema.test.ts`), strengthened for spec v1.1.3 | 2026-10-05: `expected undefined to be defined` — no `outings` schema registered | `src/schemas/outings-schema.ts`, registered in `src/schemas.ts` (ported from prototype `src/schemas/outings-schema.ts`) |  |  |
| BASE-03 | collab | `BASE-03: the outsider receives no outing records, including after new writes` (`tests/collab.spec.ts`; live `outing-count` + fresh socket read) | Fault-injected 2026-10-05: `outings` read policy `collaborator` → `true` → outsider count `8`, expected `0`. Restored, green. Writes so far are two `createOuting`s; extend with update writes (join/option) when those commands exist. | `outings` read `collaborator` (`src/schemas/outings-schema.ts`); `src/features/outing/OutingList.tsx` (count only), `src/pages/(app)/home.tsx` |  |  |
| BASE-04 | api | `BASE-04: …` (`tests/api.spec.ts`; 10 options × 2 members, 20 overlapping POSTs) | Fault-injected 2026-10-05: `blockConcurrencyWhile` removed → 6 of 20 responses stored. Restored, green. | `AppRecordRoom.fetch` serializes via `blockConcurrencyWhile` (`worker.ts`) |  |  |
| BASE-05 | manual | Manual: `src/domain/suggestions/fixtures/*.json` (+ `requests/`), log in `docs/DEVELOPMENT_LOG.md` Block 0 / T0.8 | n/a (manual) | Recorded 2026-10-05 via `integrations invoke`: geocoding ×2, forecast, places-search ×2 (`ll` supported), chat-completion (`claude-haiku-4-5`, $0.00089); ≈ $0.072 total |  |  |
| BASE-06 | api | `BASE-06: /internal/outing is not publicly reachable and a client X-User-Id is ignored` (`tests/api.spec.ts`, reads via `tests/helpers/outing.ts` `readOutings` over each user's own socket) | Fault-injected 2026-10-05: (1) route forwards client `X-User-Id` → host does not receive the outing (stored under forged member ID); (2) public `POST /internal/outing` forwarded raw to the room → direct hit executed a command. Restored, green. | `AppRecordRoom.fetch` override in `worker.ts` (exact path `/internal/outing`, `blockConcurrencyWhile`) ported from prototype `worker.ts:54-82`; `src/server/outing-room.ts`; route builds a fresh room request with the verified user ID only; `src/domain/{types,errors,commands}.ts` (minimal `createOuting`) |  |  |
| OUT-01 | api | `OUT-01: …` (`tests/api.spec.ts`) + unit `createOuting builds the spec §4.3 record…` |  | `createOuting` in `src/domain/commands.ts`; `src/server/outing-room.ts` create path |  |  |
| OUT-02 | unit | `OUT-02: …` (`commands.test.ts`) |  | `createOutingInput` in `src/domain/validate.ts` |  |  |
| OUT-03 | unit | `OUT-03: …` (`src/domain/time.test.ts`) | First run passed for OUT-03; DST probe bug caught by OUT-04 (±3h probes missed the transition) and fixed | `toStartAt`, `formatInZone` in `src/domain/time.ts` |  |  |
| OUT-04 | unit | `OUT-04: …` (`time.test.ts`, `commands.test.ts`) | Red on first run: `03:00` just after the gap returned null; probes widened to ±24h | `toStartAt` returns null in a DST gap → `createOuting` INVALID_INPUT |  |  |
| OUT-05 | unit | `OUT-05: …` (`src/domain/commands.test.ts`) |  | `createOuting` refuses `startAt <= now` (injected `now`) |  |  |
| OUT-06 | smoke | `OUT-06: …` smoke (`tests/smoke.spec.ts`) + unit `OutingList.test.ts` (pluralization) | Red on first run: page crashed ("Invalid time value") on T0.5-era records with empty `startAt`; `formatInZone` now degrades to "Time unavailable" | `src/features/outing/OutingList.tsx` cards (title, location, `formatInZone` + IANA zone, state), `outingWord` |  |  |
| OUT-07 | unit | `OUT-07: …` unit (`commands.test.ts`) + api (`tests/api.spec.ts`) |  | `deleteOuting` (host only) → `records.delete` |  |  |
| OUT-08 | smoke | `OUT-08: …` (`tests/smoke.spec.ts`) |  | `CreateOutingDialog.tsx` (title, location, date, time, timezone only); `InviteGate.tsx` has no inputs |  |  |
| INV-01 | api | `INV-01: …` (`tests/api.spec.ts`) |  | Room token lookup (`records.query` by `inviteToken`) in `outing-room.ts` |  |  |
| INV-02 | unit | `INV-02: …` (`commands.test.ts`) |  | `joinOuting` no-op for members |  |  |
| INV-03 | api | `INV-03: …` (`tests/api.spec.ts`) |  | `INVITE_INVALID_MESSAGE` for any missing record |  |  |
| INV-04 | smoke | `INV-04: …` (`tests/smoke.spec.ts`, compares gate HTML for valid vs invalid token) |  | `src/features/outing/InviteGate.tsx` renders from the token only |  |  |
| INV-05 | smoke | `INV-05: …` (`tests/smoke.spec.ts`) |  | Copy invite dialog in `OutingPage.tsx` |  |  |
| INV-06 | unit | `INV-06: …` (`commands.test.ts`) — join half; "can post comments" half added with T3.3 |  | `joinOuting` has no state check |  |  |
| INV-07 | unit | `INV-07: …` (`commands.test.ts`) |  | `CAPS.members` check in `joinOuting` |  |  |
| OPT-01 | unit | `OPT-01: …` (`src/domain/options.test.ts`) + §6 matrix rows (`matrix.test.ts`) |  | `addOption` / `editOption` / `deleteOption`, `isLocked` in `src/domain/commands.ts`; limits in `validate.ts` |  |  |
| OPT-02 | unit | `OPT-02: …` (`src/domain/options.test.ts`) + §6 matrix rows (`matrix.test.ts`) |  | `addOption` / `editOption` / `deleteOption`, `isLocked` in `src/domain/commands.ts`; limits in `validate.ts` |  |  |
| OPT-03 | smoke | `OPT-03: …` (`tests/smoke.spec.ts`) |  | `OptionCard.tsx` facts list (Address/Price/Hours default "Unconfirmed"; links only from `link`/`sourceUrl`) |  |  |
| OPT-04 | collab | `OPT-04, VOTE-06, FIN-08: …` (`tests/collab.spec.ts`) |  | Realtime `useQuery` → `OutingPage` / `OptionCard` / `ConfirmedPlan` |  |  |
| OPT-05 | unit | `OPT-05: …` (`src/domain/options.test.ts`) + §6 matrix rows (`matrix.test.ts`) |  | `addOption` / `editOption` / `deleteOption`, `isLocked` in `src/domain/commands.ts`; limits in `validate.ts` |  |  |
| OPT-06 | unit | `OPT-06: …` (`src/domain/options.test.ts`) + §6 matrix rows (`matrix.test.ts`) | Matrix fault-injected 2026-10-05: host lock bypass removed → `§6 deleteOption (own, locked): host (open)` red; restored | `addOption` / `editOption` / `deleteOption`, `isLocked` in `src/domain/commands.ts`; limits in `validate.ts` |  |  |
| OPT-07 | unit | `OPT-07: …` (`src/domain/options.test.ts`) + §6 matrix rows (`matrix.test.ts`) |  | `addOption` / `editOption` / `deleteOption`, `isLocked` in `src/domain/commands.ts`; limits in `validate.ts` |  |  |
| OPT-08 | unit | `OPT-08: …` (`src/domain/options.test.ts`) + §6 matrix rows (`matrix.test.ts`) |  | `addOption` / `editOption` / `deleteOption`, `isLocked` in `src/domain/commands.ts`; limits in `validate.ts` |  |  |
| OPT-09 | smoke | `OPT-09: …` (`tests/smoke.spec.ts`) |  | `OptionCard.tsx` `canEdit`/`canDelete` from domain `isLocked` |  |  |
| VOTE-01 | unit | `VOTE-01: …` (`src/domain/responses.test.ts`) |  | `setResponse` in `commands.ts` (upsert per user+option; `null` removes) |  |  |
| VOTE-02 | api | `VOTE-02: …` (`tests/api.spec.ts`; forged `input.userId` and `X-User-Id`) |  | zod strips `userId`; route forwards only the JWT user |  |  |
| VOTE-03 | unit | `VOTE-03: …` (`src/domain/responses.test.ts`) |  | `setResponse` in `commands.ts` (upsert per user+option; `null` removes) |  |  |
| VOTE-04 | unit | `VOTE-04: …` (`responses.test.ts`) |  | `src/domain/tally.ts` |  |  |
| VOTE-05 | smoke | `VOTE-05: …` (`tests/smoke.spec.ts`) |  | `OptionCard.tsx` counts, directory names, `aria-pressed`, destructive Can’t do styling |  |  |
| VOTE-06 | collab | `OPT-04, VOTE-06, FIN-08: …` (`tests/collab.spec.ts`) |  | Realtime `useQuery` → `OutingPage` / `OptionCard` / `ConfirmedPlan` |  |  |
| VOTE-07 | unit | `VOTE-07: …` unit (`responses.test.ts`) + smoke (`tests/smoke.spec.ts`, request body `[maybe, null]`) |  | `setResponse` in `commands.ts` (upsert per user+option; `null` removes) |  |  |
| FIN-01 | unit | `FIN-01: …` (`responses.test.ts`) + §6 matrix |  | `finalize` / `reopen` in `commands.ts` |  |  |
| FIN-02 | unit | `FIN-02: …` (`responses.test.ts`) + §6 matrix |  | `finalize` / `reopen` in `commands.ts` |  |  |
| FIN-03 | unit | `FIN-03: …` (`responses.test.ts`) + §6 matrix; requestSuggestions half added in Block 4 |  | `finalize` / `reopen` in `commands.ts` |  |  |
| FIN-04 | api | `FIN-04: …` (`tests/api.spec.ts`; 20 runs, both orderings observed: 8 stored-before / 12 refused) | Fault-injected 2026-10-05: `blockConcurrencyWhile` removed → run 2 finalize overwritten (`state` back to `open`). Restored, green. | Serialized room + `setResponse` state check |  |  |
| FIN-05 | smoke | `FIN-05: …` (`tests/smoke.spec.ts`) |  | `src/features/outing/ConfirmedPlan.tsx` |  |  |
| FIN-06 | unit | `FIN-06: …` (`responses.test.ts`) |  | `planText` in `src/domain/summary.ts` |  |  |
| FIN-07 | unit | `FIN-07: …` unit (`responses.test.ts`) + smoke "previous pick" (`tests/smoke.spec.ts`) |  | `finalize` / `reopen` in `commands.ts` |  |  |
| FIN-08 | collab | `OPT-04, VOTE-06, FIN-08: …` (`tests/collab.spec.ts`) |  | Realtime `useQuery` → `OutingPage` / `OptionCard` / `ConfirmedPlan` |  |  |
| PREF-01 | unit |  |  |  |  |  |
| PREF-02 | api |  |  |  |  |  |
| PREF-03 | unit |  |  |  |  |  |
| PREF-04 | smoke |  |  |  |  |  |
| PREF-05 | collab |  |  |  |  |  |
| COM-01 | unit |  |  |  |  |  |
| COM-02 | unit |  |  |  |  |  |
| COM-03 | collab |  |  |  |  |  |
| COM-04 | smoke |  |  |  |  |  |
| COM-05 | unit |  |  |  |  |  |
| SUG-01 | unit |  |  |  |  |  |
| SUG-02 | unit |  |  |  |  |  |
| SUG-03 | unit |  |  |  |  |  |
| SUG-04 | unit |  |  |  |  |  |
| SUG-05 | unit |  |  |  |  |  |
| SUG-06 | api |  |  |  |  |  |
| SUG-07 | unit |  |  |  |  |  |
| SUG-08 | unit |  |  |  |  |  |
| SUG-09 | unit |  |  |  |  |  |
| SUG-10 | unit |  |  |  |  |  |
| SUG-11 | collab |  |  |  |  |  |
| SUG-12 | unit |  |  |  |  |  |
| SUG-13 | unit |  |  |  |  |  |
| SUG-14 | smoke |  |  |  |  |  |
| SUG-15 | unit |  |  |  |  |  |
| SUG-16 | manual |  |  |  |  |  |
| UX-01 | smoke | `UX-01: …` create/join + `UX-01: option commands …` refused edit (`tests/smoke.spec.ts`) |  | `src/lib/outing-api.ts` `useCommand` (pending + message, no optimistic writes); used by create, join, delete |  |  |
| UX-02 | smoke |  |  |  |  |  |
| UX-03 | smoke |  |  |  |  |  |
| UX-04 | manual |  |  |  |  |  |
| UX-05 | manual |  |  |  |  |  |
| SEC-01 | api | `SEC-01: every public command without a valid JWT returns 401 UNAUTHENTICATED` (`tests/api.spec.ts`) | 2026-10-05: before route existed, expected 401, received 404. Fault-injected: (1) auth check skipped → `createOuting with no Authorization header` 200; (2) unverified JWT payload trusted → `createOuting with unsigned forged JWT` 200. Restored, green. | `src/server/outing-routes.ts` (JWT via scaffold `resolveAuth`, checked before allowlist), registered in `worker.ts`; ported from prototype `src/server/outing-routes.ts:7-10` |  |  |
| SEC-02 | api | First half: `SEC-02: browser calls to /api/integrations/* return 403, signed in or not` (`tests/api.spec.ts`). Second half (bundle has no provider URLs) pending T4.13. | Fault-injected 2026-10-05: original scaffold proxy restored with its outbound `apiWorkerFetch` replaced by an offline stub (no paid call) → `GET openweathermap/geocoding (anonymous)` 200, expected 403. Restored, green. | First half: `/api/integrations/:name/:endpoint` → 403 in `src/server/http-routes.ts`, ported from prototype `src/server/http-routes.ts:232-236` |  |  |
| SEC-03 | manual |  |  |  |  |  |
| SEC-04 | api |  |  |  |  |  |
| REL-01 | manual |  |  |  |  |  |
| REL-02 | manual |  |  |  |  |  |
| REL-03 | manual |  |  |  |  |  |
| REL-04 | manual |  |  |  |  |  |
