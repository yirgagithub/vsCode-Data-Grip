# Task 1 implementation report

- Files changed: `src/services/sqlObjectReference.ts`, `tests/sqlObjectReference.test.ts`
- Test command: `npx vitest run tests/sqlObjectReference.test.ts`
- Test result: 1 file passed, 18 tests passed
- Lint result: passed (reported by implementer)
- Commit: `88e28bb`
- Self-review: parser remains isolated from VS Code and metadata/provider behavior.
- Concern: built-in routine filtering is conservative; dialect-specific built-in names may need future expansion.

## Review fixes (2026-07-15)

- RED evidence: `npx vitest run tests/sqlObjectReference.test.ts` failed as expected with 12 failures and 18 passes. The failures reproduced statement/nested-scope CTE leakage, `WITH RECURSIVE`/multiple-CTE handling, schema-qualified name suppression, SQL construct and dialect built-in false positives, trigger DDL modifiers, and parenthesis-free `EXEC` calls.
- Files changed: `src/services/sqlObjectReference.ts`, `tests/sqlObjectReference.test.ts`.
- Implementation: CTE suppression now records each declaration against its enclosing statement/query scope, handles `RECURSIVE` and comma-separated declarations, and applies only to unqualified names. Routine candidates now require qualification or an explicit `CALL`/`EXEC`/`EXECUTE` context, preventing keyword/scalar/built-in false positives without depending on an exhaustive name list. Trigger parsing skips `IF`/`NOT`/`EXISTS`; explicit procedure invocation supports parenthesis-free SQL Server syntax.
- Test command/result: `npx vitest run tests/sqlObjectReference.test.ts` -> 1 file passed, 30 tests passed, exit 0 (377 ms).
- Exact lint command/result from `package.json`: `npm run lint` -> `tsc -p ./ --noEmit`, exit 0.
- Scoped whitespace check: `git diff --check -- src/services/sqlObjectReference.ts tests/sqlObjectReference.test.ts` -> exit 0.
- Fix commit: `fef5fd3` (`fix: harden SQL object reference parsing`).
- Self-review: parser remains pure and dependency-free; source ranges and normalized parts are unchanged; CTE scopes terminate at the matching query parenthesis or same-depth semicolon; qualified physical relations are never treated as CTE references; regression coverage exercises every Important review finding.
- Concerns: unqualified parenthesized expressions are intentionally conservative and are not returned as routines unless introduced by `CALL`/`EXEC`/`EXECUTE`; metadata resolution can still identify ambiguous names later. The worktree contains extensive pre-existing `node_modules` changes and an earlier report edit, none of which were included in the fix commit.

## Second review fixes (2026-07-15)

- RED evidence: `npx vitest run tests/sqlObjectReference.test.ts` produced 1 failed file with 2 failed and 30 passed tests. `SELECT calculate_total(amount) FROM orders` returned `undefined`, while `EXECUTE AS USER` incorrectly returned `AS` as a routine.
- Files changed: `src/services/sqlObjectReference.ts`, `tests/sqlObjectReference.test.ts`.
- Implementation: restored unqualified parenthesized routine candidates for later metadata confirmation, while filtering SQL grammar constructs through a dedicated keyword set and retaining the cross-dialect built-in filter. Explicit `EXECUTE` procedure parsing now rejects the `EXECUTE AS` security-context form.
- Focused test result: `npx vitest run tests/sqlObjectReference.test.ts` -> 1 file passed, 32 tests passed, exit 0 (356 ms before commit).
- Lint result: `npm run lint` -> `tsc -p ./ --noEmit`, exit 0.
- Fix commit: `53a390f` (`fix: preserve unqualified SQL routine references`).
- Self-review: ordinary unqualified UDFs retain exact ranges and argument counts; existing `IN`, `VALUES`, `OVER`, dialect built-in, trigger, CTE, and `EXEC` regressions remain covered; parser stays pure and Task 1-scoped.
- Concerns: syntactic filtering cannot enumerate every future dialect built-in; later metadata confirmation remains the authority for whether a surviving unqualified candidate is a real routine. The report includes pre-existing edits and is intentionally not part of the source/test fix commit.
