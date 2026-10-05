---
description: Build every task in one block of docs/tasks.md with tests, then stop at the block gate
argument-hint: <block number, e.g. 1>
---
Block: $ARGUMENTS

Before starting: read CLAUDE.md, `docs/spec.md`, `docs/plan.md`, and the Block $ARGUMENTS table in `docs/tasks.md`. Skip tasks already marked implemented in `docs/traceability.md`. Run `git tag block-$ARGUMENTS-start` if that tag doesn't exist.

For each remaining task, in order:
1. If it is *manual*, needs a paid call, a deploy, or a push: stop and tell Sai exactly what to do, then continue when he says so.
2. Implement the task following CLAUDE.md architecture rules and the spec sections its ACs depend on.
3. Write a test for every AC in the task (names start with the AC ID; assert the observable result).
4. For security/concurrency ACs listed in CLAUDE.md: break the guard temporarily, confirm the test fails, restore it. Note "fault-injected: <what>" in the traceability "Seen failing" cell.
5. Run the task's tests, the block's suites (`npx deepspace test run unit`, plus `test run api` / `test run all` when the block has those levels), and `npx tsc --noEmit`. Fix until green.
6. Update traceability (Test, Implemented), then commit: `T<id> (<AC IDs>): <what>`.

**Gate** (after the last task):
- Run `npx deepspace test run unit`, `npx deepspace test run all`, `npx tsc --noEmit`, `npm run lint`. Report pass counts.
- If the Codex plugin is installed, run `/codex:adversarial-review --base block-$ARGUMENTS-start` focused on spec §5–6 (codes, matrix, identity, serialized writes) and list findings without acting on them.
- Append to `docs/DEVELOPMENT_LOG.md` under "Block $ARGUMENTS": tasks done, commits, anything ported, spec gaps found, Codex findings. Leave a "Verified by Sai:" line empty.
- Stop. List what Sai should click through by hand before the next block.
