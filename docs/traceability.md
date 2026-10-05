# Traceability

Source: `docs/spec.md` v1.1.2. Tick a column only with evidence (test name, commit, or log entry).

| AC | Level | Test (name/file) | Seen failing | Implemented | Browser-verified | Deployed-verified |
|---|---|---|---|---|---|---|
| BASE-01 | collab | `BASE-01: the users fixture signs in three distinct accounts: host, member, outsider` (`tests/collab.spec.ts`) | Not seen failing (test of the harness; accounts `Host`, `Member`, `Outsider` created in T0.1) | Test accounts `planit-{host,member,outsider}@deepspace.test` |  |  |
| BASE-02 | unit | `BASE-02: registered outings schema denies client create, update, and delete for every role` (`src/schemas/outings-schema.test.ts`) | 2026-10-05: `expected undefined to be defined` — no `outings` schema registered | `src/schemas/outings-schema.ts`, registered in `src/schemas.ts` (ported from prototype `src/schemas/outings-schema.ts`) |  |  |
| BASE-03 | collab | `BASE-03: the outsider receives no outing records, including after new writes` (`tests/collab.spec.ts`; live `outing-count` + fresh socket read) | Fault-injected 2026-10-05: `outings` read policy `collaborator` → `true` → outsider count `8`, expected `0`. Restored, green. Writes so far are two `createOuting`s; extend with update writes (join/option) when those commands exist. | `outings` read `collaborator` (`src/schemas/outings-schema.ts`); `src/features/outing/OutingList.tsx` (count only), `src/pages/(app)/home.tsx` |  |  |
| BASE-04 | api |  |  |  |  |  |
| BASE-05 | manual | Manual: `src/domain/suggestions/fixtures/*.json` (+ `requests/`), log in `docs/DEVELOPMENT_LOG.md` Block 0 / T0.8 | n/a (manual) | Recorded 2026-10-05 via `integrations invoke`: geocoding ×2, forecast, places-search ×2 (`ll` supported), chat-completion (`claude-haiku-4-5`, $0.00089); ≈ $0.072 total |  |  |
| BASE-06 | api | `BASE-06: /internal/outing is not publicly reachable and a client X-User-Id is ignored` (`tests/api.spec.ts`, reads via `tests/helpers/outing.ts` `readOutings` over each user's own socket) | Fault-injected 2026-10-05: (1) route forwards client `X-User-Id` → host does not receive the outing (stored under forged member ID); (2) public `POST /internal/outing` forwarded raw to the room → direct hit executed a command. Restored, green. | `AppRecordRoom.fetch` override in `worker.ts` (exact path `/internal/outing`, `blockConcurrencyWhile`) ported from prototype `worker.ts:54-82`; `src/server/outing-room.ts`; route builds a fresh room request with the verified user ID only; `src/domain/{types,errors,commands}.ts` (minimal `createOuting`) |  |  |
| OUT-01 | api |  |  |  |  |  |
| OUT-02 | unit |  |  |  |  |  |
| OUT-03 | unit |  |  |  |  |  |
| OUT-04 | unit |  |  |  |  |  |
| OUT-05 | unit |  |  |  |  |  |
| OUT-06 | smoke |  |  |  |  |  |
| OUT-07 | unit |  |  |  |  |  |
| OUT-08 | smoke |  |  |  |  |  |
| INV-01 | api |  |  |  |  |  |
| INV-02 | unit |  |  |  |  |  |
| INV-03 | api |  |  |  |  |  |
| INV-04 | smoke |  |  |  |  |  |
| INV-05 | smoke |  |  |  |  |  |
| INV-06 | unit |  |  |  |  |  |
| INV-07 | unit |  |  |  |  |  |
| OPT-01 | unit |  |  |  |  |  |
| OPT-02 | unit |  |  |  |  |  |
| OPT-03 | smoke |  |  |  |  |  |
| OPT-04 | collab |  |  |  |  |  |
| OPT-05 | unit |  |  |  |  |  |
| OPT-06 | unit |  |  |  |  |  |
| OPT-07 | unit |  |  |  |  |  |
| OPT-08 | unit |  |  |  |  |  |
| OPT-09 | smoke |  |  |  |  |  |
| VOTE-01 | unit |  |  |  |  |  |
| VOTE-02 | api |  |  |  |  |  |
| VOTE-03 | unit |  |  |  |  |  |
| VOTE-04 | unit |  |  |  |  |  |
| VOTE-05 | smoke |  |  |  |  |  |
| VOTE-06 | collab |  |  |  |  |  |
| VOTE-07 | unit |  |  |  |  |  |
| FIN-01 | unit |  |  |  |  |  |
| FIN-02 | unit |  |  |  |  |  |
| FIN-03 | unit |  |  |  |  |  |
| FIN-04 | api |  |  |  |  |  |
| FIN-05 | smoke |  |  |  |  |  |
| FIN-06 | unit |  |  |  |  |  |
| FIN-07 | unit |  |  |  |  |  |
| FIN-08 | collab |  |  |  |  |  |
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
| UX-01 | smoke |  |  |  |  |  |
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
