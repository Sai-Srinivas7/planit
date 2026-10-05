---
description: Make the failing test for one acceptance criterion pass, then refactor
argument-hint: <AC-ID or task ID like T2.2>
---
Target: $ARGUMENTS. If it is a task ID, apply every step to each AC listed for that task in `docs/tasks.md`.

1. Implement the minimum code to make the $ARGUMENTS test pass, following CLAUDE.md architecture rules. If porting from `~/actually-go`, name the source file and lines.
2. Run the $ARGUMENTS test, then the whole block's suites (`test run unit`, plus `test run api` or `test run all` if the block has those levels). Run `npx tsc --noEmit`.
3. Refactor only if it simplifies; rerun after.
4. Update the "Implemented" cell in `docs/traceability.md`.
5. Report: files changed, commands run with pass/fail counts, anything the spec didn't cover. Propose a commit message `$ARGUMENTS: <what>` (add `— ported from prototype <file>` if applicable). Stop for review.
