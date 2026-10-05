See [AGENTS.md](./AGENTS.md) for the DeepSpace SDK. Load the `deepspace` skill before touching SDK code; check it (or docs.deep.space) before using any SDK API instead of guessing.

# PlanIt rules

**Sources of truth:** `docs/spec.md` (what), `docs/plan.md` (how), `docs/tasks.md` (order), `docs/traceability.md` (status). The prototype in `~/actually-go` is read-only reference.

**Spec**
- Never edit `docs/spec.md` without asking. If code or a test shows the spec is wrong, stop and propose the change (section, old text, new text, why).

**TDD**
- No implementation code without a failing test whose name starts with its AC ID: `test('VOTE-02: ...')`.
- Show the failing output and say why it fails for the intended reason before implementing. A failure from a typo, wrong route, or bad selector doesn't count.
- Implement the minimum to pass, then run the whole block's suite, then refactor.
- Never weaken, skip, or delete an existing assertion to get green. Ask instead.
- Mock only at provider adapters (`src/domain/suggestions/adapters.ts`). Never mock `applyCommand`, the room, or routes.

**Architecture (spec §4–5)**
- All business rules live in `src/domain/` as pure functions. `applyCommand()` returns the next outing or a `CommandError` with a spec §5 code.
- Every write goes through `POST /api/outing/:command` → room `/internal/outing` → `blockConcurrencyWhile`. No `useMutations` for outings.
- User identity comes only from the verified JWT. Ignore any user ID in input. No name fields; names come from the user directory.
- Provider calls only via `buildCronContext(env, env.OWNER_USER_ID).integrations.call` in worker code. Never `fetch` a provider directly; never call integrations from the client.

**Commands**
- `npx deepspace test run unit` · `npx deepspace test run api` · `npx deepspace test run all` (the default `test run` skips collab, so it is never a full run).
- Typecheck: `npx tsc --noEmit`. Lint: `npm run lint` (check package.json if it differs).

**After each AC:** update `docs/traceability.md`, then report files changed, commands run, and results. Stop for review before committing.

**Never:** run `npx deepspace deploy`, push, or change `wrangler.toml` app identity without asking. Never deploy from `~/actually-go`.
