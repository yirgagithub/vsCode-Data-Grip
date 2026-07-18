# Task 1 Report

Status: DONE

Commit: `a126c1c fix: preserve postgres and mysql temporal values`

## Implementation

- PostgreSQL and Redshift pools now receive a per-pool type parser registry. OIDs 1082, 1083, 1114, 1184, 1186, and 1266 use an identity text parser; every other OID and format delegates to the runtime `pg.types.getTypeParser` implementation. Global pg parser state is not mutated.
- MySQL normal and SSL-fallback pools now use `dateStrings: ['DATE', 'DATETIME', 'TIMESTAMP']`.
- No result-cell `Date` construction, localization, timezone conversion, or execution-timestamp behavior was introduced.

## TDD Evidence

### RED: PostgreSQL/Redshift

Command: `npx vitest run tests/postgresDriver.test.ts`

Expected failure observed: 1 of 16 tests failed. `fetches temporal values as native text and delegates other types` failed with `Cannot read properties of undefined (reading 'getTypeParser')`, proving the pool had no per-pool parser registry.

### RED: MySQL

Command: `npx vitest run tests/mysqlDriver.test.ts`

Expected failure observed: 1 of 9 tests failed. `fetches date, datetime, and timestamp values as strings for all pools` received `undefined` instead of `['DATE', 'DATETIME', 'TIMESTAMP']`.

### GREEN: focused files individually

- `npx vitest run tests/postgresDriver.test.ts`: exit 0; 1 file passed, 16 tests passed.
- `npx vitest run tests/mysqlDriver.test.ts`: exit 0; 1 file passed, 9 tests passed.

### Final focused verification

Command: `npx vitest run tests/postgresDriver.test.ts tests/mysqlDriver.test.ts`

Output: exit 0; 2 files passed, 25 tests passed.

### Full suite

Command: `npx vitest run`

Output: exit 0; 34 files passed and 2 skipped; 396 tests passed and 7 skipped (403 total).

### Type checking

Command: `npm run lint`

Output: exit 0; `tsc -p ./ --noEmit` completed without diagnostics.

## Self-review

- Reviewed the committed diff and ran `git diff --check`; no whitespace errors were reported.
- Parser behavior is scoped to each PostgreSQL pool and preserves the default parser for non-temporal values/formats.
- The MySQL option is built by the shared `toPoolConfig`, so both initial and fallback pools are covered.
- No unrelated source, tests, or `node_modules` files were staged or committed.

## Concerns

- Vitest emits the repository's existing Vite CJS deprecation warning; it does not affect test results.
- Live database integration tests remain skipped unless their environment variables are configured.

## Blocking Review Fixes

- Bundled PostgreSQL runtime now exports both `Pool` and `types`, ensuring packaged builds can construct the per-pool temporal parser registry.
- Redshift's `toPoolConfig` override now accepts and forwards the default parser registry to the PostgreSQL base implementation.
- Added bundled-runtime contract coverage and Redshift-specific temporal/delegation coverage.

### Review RED evidence

- `npx vitest run tests/runtimeChunks.test.ts`: exit 1; 1 of 3 tests failed because `pgRuntime.types.getTypeParser` was `undefined`.
- `npx vitest run tests/postgresDriver.test.ts`: exit 1; 1 of 17 tests failed because the Redshift pool's `config.types` was `undefined`.

### Review GREEN evidence

- Runtime rebuild via the installed Windows esbuild binary followed by `npx vitest run tests/postgresDriver.test.ts tests/runtimeChunks.test.ts`: exit 0; 2 files and 20 tests passed.
- `npx vitest run`: exit 0; 34 files passed and 2 skipped; 398 tests passed and 7 skipped (405 total).
- `npm run lint`: exit 0; `tsc -p ./ --noEmit` completed without diagnostics.

### Review-fix concern

- `npm run bundle:runtimes` cannot execute in this worktree because `node_modules/esbuild/bin/esbuild` is an ELF binary under Windows. Verification used the already-installed `node_modules/@esbuild/win32-x64/esbuild.exe` with the package script's exact arguments. This is an environment/dependency-installation issue, not a source change.
