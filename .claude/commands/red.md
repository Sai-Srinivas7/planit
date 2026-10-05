---
description: Write the failing test for one acceptance criterion and stop
argument-hint: <AC-ID>
---
Acceptance criterion: $ARGUMENTS

1. Read $ARGUMENTS in `docs/spec.md` §8, plus the sections it depends on (§4 data, §5 commands and codes, §6 matrix, §7 suggestions). Find its task in `docs/tasks.md`.
2. Write only the test, at the level the AC states ([unit] → `src/domain/*.test.ts`, [api] → `tests/api.spec.ts`, [collab] → `tests/collab.spec.ts`, [smoke] → `tests/smoke.spec.ts`). Name it `'$ARGUMENTS: <behavior>'`. Assert the AC's observable result, not just a status code.
3. If supporting types or empty stubs are needed for it to compile, add only signatures that throw `not implemented`.
4. Run the narrowest command that executes this test. Show the failure output.
5. Explain in one or two sentences why it fails for the intended reason. If it fails for another reason, fix the test and rerun.
6. Update the "Test" and "Seen failing" cells in `docs/traceability.md`. Write no implementation. Stop.
