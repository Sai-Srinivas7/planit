# Traceability

Source: `docs/spec.md` v1.1.2. Tick a column only with evidence (test name, commit, or log entry).

| AC | Level | Test (name/file) | Seen failing | Implemented | Browser-verified | Deployed-verified |
|---|---|---|---|---|---|---|
| BASE-01 | collab |  |  |  |  |  |
| BASE-02 | unit | `BASE-02: registered outings schema denies client create, update, and delete for every role` (`src/schemas/outings-schema.test.ts`) | 2026-10-05: `expected undefined to be defined` — no `outings` schema registered | `src/schemas/outings-schema.ts`, registered in `src/schemas.ts` (ported from prototype `src/schemas/outings-schema.ts`) |  |  |
| BASE-03 | collab |  |  |  |  |  |
| BASE-04 | api |  |  |  |  |  |
| BASE-05 | manual |  |  |  |  |  |
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
| SEC-02 | api |  |  |  |  |  |
| SEC-03 | manual |  |  |  |  |  |
| SEC-04 | api |  |  |  |  |  |
| REL-01 | manual |  |  |  |  |  |
| REL-02 | manual |  |  |  |  |  |
| REL-03 | manual |  |  |  |  |  |
| REL-04 | manual |  |  |  |  |  |
