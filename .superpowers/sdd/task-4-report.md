# Task 4 Report: Persisted-Record Compatibility Fixtures

## Outcome

Added a reviewed, entirely synthetic compatibility fixture for connections, query consoles, query history, query memory, result sessions, and SQL document bindings. Each current production store reader is instantiated against the exact persisted key and must return a stable identifier plus a representative domain field. No production code or behavior changed.

## Files changed

- `tests/fixtures/compatibility/persisted-records.json`
- `tests/helpers/inMemoryExtensionContext.ts`
- `tests/persistenceCompatibility.test.ts`
- `tests/resultSessionStore.test.ts`
- `tests/queryMemory.test.ts`

## TDD evidence

Initial command:

`npx vitest run tests/persistenceCompatibility.test.ts`

RED result: exit 1 because `tests/fixtures/compatibility/persisted-records.json` did not exist (`ENOENT`). After the fixture and first reader assertions were added, the compatibility suite passed.

Review-fix RED command:

`npx vitest run tests/persistenceCompatibility.test.ts`

RED result: exit 1 with 2 failed and 7 passed. The required-field mutation test failed because `assertPersistedRecords` did not exist, and the SecretStorage round-trip test received `undefined` instead of `value`.

Review-fix GREEN command:

`npx vitest run tests/persistenceCompatibility.test.ts tests/resultSessionStore.test.ts tests/queryMemory.test.ts`

GREEN result: exit 0; 3 test files passed and 99 tests passed. Breakdown: 9 compatibility tests, 2 result-session tests, and 88 query-memory tests.

## Additional verification

- `npm run lint` — exit 0; TypeScript `--noEmit` completed without diagnostics.
- `npm run check:architecture` — exit 0; the architecture checker reported no violations.
- `git diff --check -- tests/persistenceCompatibility.test.ts tests/helpers/inMemoryExtensionContext.ts tests/resultSessionStore.test.ts tests/queryMemory.test.ts` — exit 0; only Git line-ending conversion warnings were emitted.

## Self-review

- Every fixture store is non-empty and its current production reader is exercised, rather than checking JSON shape alone.
- Runtime validation enumerates the required fields for every record type and nested result sets; the exported fixture is typed as `PersistedRecords` only after validation succeeds.
- SQL document binding fixtures use `SqlDocumentConnectionRecord & { id: string }`; the test asserts `legacy-document-binding` on the raw record and verifies URI plus connection ID through `SqlDocumentConnectionStore`.
- Connections deliberately omit `password`, and the test rejects a password property on the record returned by `ConnectionStore`.
- The shared in-memory context replaced both store-test inline fakes. Its mementos clone values on reads and writes, and its SecretStorage is Map-backed with get/store/delete plus disposable `onDidChange` listener semantics.
- Fixture names, hosts, URIs, SQL, values, and timestamps are deterministic synthetic data. No real credentials or user data are present.

## Concerns

- The repository contains extensive unrelated pre-existing modifications under `node_modules` and `.superpowers`; Task 4 staging is restricted to the files listed above.
- The current `SqlDocumentConnectionRecord` production interface has no `id`. The compatibility fixture intentionally retains the plan-requested synthetic legacy ID as an additional raw persisted field, while reader assertions verify the public URI/connection behavior.
