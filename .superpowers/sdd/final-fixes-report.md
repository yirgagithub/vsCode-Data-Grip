# Final review fixes report

## Changes

- Replaced the synthetic JSON literal round-trip assertion with coverage through `AgentDatabaseService.runReadOnlyQuery` and `ResultSessionStore.saveTabs/getTabs`; existing TSV/CSV/Markdown assertions continue to cover the actual result export helpers.
- Strengthened opt-in live-driver assertions to compare representative engine-specific temporal strings exactly.
- Documented the Tedious/mssql limitation: `DateTimeOffset` reaches the handler after original offset and sub-millisecond precision are lost, and `mssql.valueHandler` is process-global with QueryDeck owning these temporal handlers.
- Restored generated outputs to pre-branch commit `f79d52d`, rebuilt from the committed branch sources, and restored `dist/runtime/node_modules` afterward to prevent Windows/native dependency noise.

## Commands and results

- `npm test -- --run tests/resultFormat.test.ts tests/mcpAgentService.test.ts tests/resultSessionStore.test.ts tests/additionalDrivers.test.ts`
  - Initial result: expected RED infrastructure failure for the new persistence test because `vscode` was unresolved (23 tests passed; new suite failed before collection). Added the same explicit `vscode` mock pattern used by existing persistence tests.
- `npm test -- --run tests/resultFormat.test.ts tests/mcpAgentService.test.ts tests/resultSessionStore.test.ts tests/additionalDrivers.test.ts tests/liveDatabaseDrivers.integration.test.ts`
  - Result: 4 files passed, 1 opt-in live file skipped; 24 tests passed, 6 skipped.
- `git restore --source=f79d52d --worktree -- dist media; npm run build; git restore --source=f79d52d --worktree -- dist/runtime/node_modules`
  - Result: build passed. Native dependency copies restored; no `dist/runtime/node_modules` content is included in the fix.
- Reproducibility check: SHA-256 hashes of every tracked file under `dist` and `media`, excluding `dist/runtime/node_modules`, were captured, `npm run build` was run again, native copies restored, and hashes compared.
  - Result: `REPRODUCIBLE: 224 tracked generated files matched byte-for-byte across consecutive builds (native dependency copies excluded/restored).`
  - Evidence: `all-build-hashes-first.txt`, `all-build-hashes-second.txt`, and `artifact-build-status.txt` in this report directory.
- `npm run lint`
  - Result: passed (`tsc -p ./ --noEmit`).
- `npm test`
  - Result: 36 files passed, 2 skipped; 413 tests passed, 7 opt-in integration tests skipped.
- `git diff --check` (restricted to files committed by this task after staging)
  - Result: passed with no output.

## Artifact cleanup evidence

- Generated outputs were rebuilt twice from the same source tree with byte-identical hashes for all 224 tracked non-native artifacts.
- The build-created native dependency tree was restored from `f79d52d`; no `node_modules` path is staged.
- Only generated files with actual content differences are staged; stat-only CRLF noise shown by Windows `git status` is not staged.
