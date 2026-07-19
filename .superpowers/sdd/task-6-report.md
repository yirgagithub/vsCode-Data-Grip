# Task 6 Report: Put Guardrails in CI and Verify the Baseline

## Status

Complete. The unit-test CI job now runs the explicit architecture boundary check immediately after type-checking and before the build and full unit suite. The workflow was otherwise preserved.

## Files changed

- `.github/workflows/ci.yml` — adds the `Check architecture boundaries` step to the unit-test job.
- `tests/packageScripts.test.ts` — asserts that the CI workflow contains the architecture command and runs it before `npm test`.

No later redesign stage was implemented.

## TDD evidence

RED command:

```text
npx vitest run tests/packageScripts.test.ts
```

RED result: exit code 1; 1 test failed and 8 passed. The new assertion received `architectureIndex === -1`, proving the CI workflow did not yet contain `run: npm run check:architecture`.

GREEN command:

```text
npx vitest run tests/packageScripts.test.ts
```

GREEN result: exit code 0; 1 test file and all 9 tests passed.

### Code-quality review fix

The initial workflow assertion searched the entire YAML file, so commands in later jobs could satisfy it. The revised test extracts only the `unit-tests` job, stops at the next same-indentation job, and asserts the complete command order `lint < check:architecture < build < test` within that job. A structural test proves extraction excludes commands from a following job.

Review-fix RED: `npx vitest run tests/packageScripts.test.ts` exited 1 with 1 failed and 9 passed because the new structural test referenced the not-yet-implemented `workflowJob` extractor.

Review-fix GREEN: `npx vitest run tests/packageScripts.test.ts` exited 0; 1 file and all 9 tests passed after replacing the two weaker global assertions with the scoped ordering assertion and adding the structural extractor test.

## Exact full verification

Run in the required order:

1. `npm run lint` — exit code 0; `tsc -p ./ --noEmit` completed without diagnostics.
2. `npm run check:architecture` — exit code 0; the checker printed no violations.
3. `npm test` — exit code 0; 40 test files passed and 2 were skipped; 443 tests passed and 7 opt-in integration tests were skipped (450 total).
4. `npm run build` — exit code 0; TypeScript compilation, extension bundle, MCP bundle, runtime bundles, native-runtime copy, and webview bundle completed. Vite transformed 702 modules and built in 2.28s.
5. `npm run compile:e2e` — exit code 0; `tsc -p e2e` completed without diagnostics.

Vitest and Vite emitted the existing CJS Node API deprecation warning; it was non-fatal.

## Minor-ledger review

The Task 1 ledger still identifies two baseline-hardening candidates:

- validate `architecture/modules.json` layer/root keys fail-closed;
- consider declaring `src/vendorModules.d.ts` in `legacyRoots` before final enforcement.

Neither was changed in Task 6. Both affect the architecture model rather than the prescribed CI gate, and should receive a dedicated TDD/review cycle instead of being folded into this workflow-only task.

## Worktree concerns

- The worktree already contained user-owned changes to `.superpowers/sdd/progress.md`, `.superpowers/sdd/task-1-report.md`, and extensive `node_modules` content. They were not staged or altered by Task 6.
- The required build refreshed tracked generated `dist/**` and `media/results/**` files. They were excluded from the Task 6 commit because Task 6 changed no build inputs; these tracked outputs still require final reconciliation against the intended baseline and are not categorically disposable.
- Repository-wide `git diff --check` reports pre-existing trailing whitespace in modified `node_modules/.bin/*` shims. The scoped Task 6 files have no whitespace errors.
