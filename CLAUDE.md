See [AGENTS.md](./AGENTS.md) for the DeepSpace SDK. Load the `deepspace` skill before touching SDK code; check it (or docs.deep.space) before using any SDK API instead of guessing.

# PlanIt rules

**Sources of truth:** `docs/spec.md` (what), `docs/plan.md` (how), `docs/tasks.md` (order), `docs/traceability.md` (status). The prototype in `~/actually-go` is read-only reference.

**Spec**
- Never edit `docs/spec.md` without asking. If code or a test shows the spec is wrong, stop and propose the change (section, old text, new text, why).

**Testing**
- Every AC gets a test whose name starts with its AC ID: `test('VOTE-02: ...')`. Assert the AC's observable result, not just a status code.
- Write the implementation and its tests in the same task. A task is done only when its tests pass.
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

**Working mode: autonomous per block (`/block <N>`).**
- Work through `docs/tasks.md` for the block, task by task, without stopping between tasks.
- Per task: implement → write the task's AC tests → run them, the block's suites, and `npx tsc --noEmit` → update `docs/traceability.md` → commit `T<id> (<AC IDs>): <what>` (add `— ported from prototype <file>` when porting).
- For security and concurrency ACs (BASE-03, BASE-04, BASE-06, FIN-04, SUG-05, SUG-11, SEC-*), also prove the test can fail: temporarily break the guard, confirm the test goes red, restore it, and note that in traceability.
- Stop and ask only for: a spec conflict or ambiguity; a change that would weaken an existing assertion; any *manual* task, paid call, deploy, or push; the block gate.

**Never:** run `npx deepspace deploy`, push, or change `wrangler.toml` app identity without asking. Never deploy from `~/actually-go`.
