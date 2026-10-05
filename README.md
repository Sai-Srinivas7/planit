# PlanIt

Turn "we should go somewhere" into one confirmed outing for a small private group.

Create an outing → share the invite link → friends join → add places and preferences → respond Yes / Maybe / Can't do → talk it through → the host confirms one plan → copy the details. The host can also ask for up to three suggested places, with weather context and short AI explanations.

PlanIt is a planning tool. It never implies a booking, a reservation, or verified availability: unknown facts show as "Unconfirmed" and the confirmed view says nothing is booked.

Built on the [DeepSpace SDK](https://docs.deep.space) (Cloudflare Workers + Durable Objects). Spec, plan, task list and AC traceability live in `docs/`.

## Setup

Requirements: Node 22.15+ / 24 / 26, npm 11.6+.

```sh
npm install
npx deepspace auth login         # once
npx deepspace dev start          # local dev (fixture providers by default)
```

Tests (three named test accounts are needed for the multi-user specs: `Host`, `Member`, `Outsider`):

```sh
npx deepspace test accounts create --email <name>@deepspace.test --name "<Name>" --password-stdin
npx deepspace test run unit      # domain rules, §6 matrix, suggestion pipeline (Vitest)
npx deepspace test run all       # unit + api + smoke + collab (Playwright)
npx tsc --noEmit && npm run lint
```

`npx deepspace test run` without a suite skips the collab specs, so it is never a full run. If port 5173 is busy, add `--port <n>`.

## Architecture

```
browser ──POST /api/outing/:command──▶ Hono route (verifies JWT, allowlist, 12 KB cap)
                                         │  fresh internal request, X-User-Id = verified user only
                                         ▼
                              AppRecordRoom /internal/outing
                              blockConcurrencyWhile: read record → applyCommand() → write record
                                         │
                                         ▼  realtime push to members only (read: 'collaborator')
```

- **One record per outing** in the `outings` collection; all business state is in its `payload` JSON (spec §4.3). The schema denies every client write; only the command path writes.
- **All rules are pure functions** in `src/domain/` — `applyCommand(outing, userId, command, input, now)` returns the next outing or a `CommandError` with a spec §5 code. The full §6 authorization matrix is a table-driven unit test (`src/domain/matrix.test.ts`).
- **Serialized commands.** Every command runs inside the room's `blockConcurrencyWhile`, so check-then-write never interleaves (a vote and a finalize cannot overlap). BASE-04 and FIN-04 prove it with concurrent requests; removing the gate makes them fail.
- **Identity** comes only from the verified JWT. User IDs in input and client `X-User-Id` headers are ignored. There are no name fields; names come from the DeepSpace user directory.
- **The room never throws** out of `blockConcurrencyWhile`; unexpected failures return 500 `INTERNAL`.

Key files: `worker.ts` (room override), `src/server/outing-routes.ts` (public route, suggestion orchestration), `src/server/outing-room.ts` (load → apply → save), `src/domain/*` (rules), `src/features/outing/*` (UI), `src/lib/outing-api.ts` (client: pending state, refusal messages, no optimistic writes).

## Integrations

All provider calls are made from worker code with `buildCronContext(env, env.OWNER_USER_ID).integrations.call(...)`, billed to the app owner. The browser integration proxy (`/api/integrations/*`) returns 403, and a test checks the built client bundle contains no provider hostnames.

| Step | Endpoint | Notes |
|---|---|---|
| Resolve location | `openweathermap/geocoding` | 0 or several distinct matches → the host is asked to be more specific |
| Weather | `openweathermap/forecast` | entry within 90 min of the start, else "Forecast unavailable" |
| Places | `serpapi/places-search` | with `ll` from the geocode; normalized, deduped, max 3 |
| Explanations | `anthropic/chat-completion` | `claude-haiku-4-5`; output validated, venue text passed as data |

Providers are behind adapters (`src/domain/suggestions/adapters.ts`) with live and fixture implementations. Selection: `PROVIDERS=live|fixture`; when unset, local dev/test (where the CLI sets `ALLOW_DEBUG_ROUTES`) uses fixtures recorded in `src/domain/suggestions/fixtures/`, and deployed apps use live providers. Limits: 3 runs per outing, 30 billable runs app-wide per UTC day, enforced exactly in the room.

## Known limitations

- All outings share one serialized command queue (one RecordRoom for the app). Fine at this scale; a busy app would shard rooms per outing.
- The room overrides `RecordRoom.fetch` to add `/internal/outing`; an SDK upgrade could change that method.
- A leaked invite link works for as long as the outing exists; members cannot leave or be removed.
- Forecasts only cover about 5 days ahead.
- A suggestion run executes inside the request; if the worker dies mid-run, the run counts as failed after 2 minutes and can be retried.
- The prototype folder (`~/actually-go`) shares this app's ID; deploying from it would overwrite PlanIt.

## Scaffold code PlanIt does not use

Left in place, unregistered or unused: `src/ai/*` (assistant chat; the agent only mounts with the AI chat schema, which PlanIt doesn't declare), `src/cron.ts`, `src/jobs.ts`, `src/products.ts`, `src/subscriptions.ts`, `src/actions/` (no server actions), `src/pages/(app)/(protected)/settings.tsx`. The Yjs, canvas, presence, cron and job Durable Object classes stay declared because removing a DO class needs a migration.
