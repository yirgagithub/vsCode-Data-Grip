# Task 4 Report: Native object-definition retrieval

## Status

Implemented `DatabaseDriver.getObjectDefinition(connectionId, object)` for SQL drivers while retaining `getTableDDL` for current callers. Native definition strings are returned without trimming, normalization, translation, or synthesis. Redis remains excluded through the base unsupported behavior.

Implementation commit: `235da2360b7be6ed3ac6c6bdf0b348eefdeaf5a6` (`feat: retrieve database object definitions`)

## RED evidence

Command:

```text
npx vitest run tests/databaseObjectDefinition.test.ts tests/postgresDriver.test.ts tests/mysqlDriver.test.ts tests/additionalDrivers.test.ts
```

Initial result: exit 1. `tests/databaseObjectDefinition.test.ts` had 5/5 expected failures with `TypeError: driver.getObjectDefinition is not a function`; the 17 pre-existing focused tests passed.

## GREEN evidence

Focused command:

```text
npx vitest run tests/databaseObjectDefinition.test.ts tests/postgresDriver.test.ts tests/mysqlDriver.test.ts tests/additionalDrivers.test.ts
```

Result: exit 0; 4 files passed, 25 tests passed.

Lint command:

```text
npm run lint
```

Result: exit 0 (`tsc -p ./ --noEmit`).

Scoped whitespace check:

```text
git diff --check -- src/database/drivers tests/databaseObjectDefinition.test.ts tests/postgresDriver.test.ts tests/mysqlDriver.test.ts tests/additionalDrivers.test.ts
```

Result: exit 0. A repository-wide `git diff --check` still reports pre-existing `node_modules/.bin/*` whitespace changes; Task 4 did not touch or stage `node_modules`.

## Engine behavior

- PostgreSQL: `pg_get_viewdef`, `pg_get_functiondef`, and `pg_get_triggerdef` with bound values; table calls preserve the existing `getTableDDL` path.
- MySQL: safely quoted `SHOW CREATE` for tables, views, functions, and procedures; bound `information_schema.triggers` lookup for triggers.
- SQL Server: `OBJECT_DEFINITION(OBJECT_ID(...))` with escaped object identity; table calls preserve `getTableDDL`.
- Oracle: bound `DBMS_METADATA.GET_DDL` for tables/views and bound `ALL_SOURCE` retrieval for functions, procedures, and triggers.
- SQLite: bound `sqlite_master` lookup for tables, views, and triggers; functions/procedures return `undefined`.
- Snowflake: `GET_DDL` with existing identifier quoting and escaped literal input.
- Redshift: bound `pg_views` and `pg_proc` text retrieval; unavailable table/trigger definitions return `undefined`.

## Self-review

- The returned catalog/command value is converted to string only; whitespace and terminators are not changed.
- Unsupported branches are explicit and return `undefined`.
- PostgreSQL, Oracle, SQLite, and Redshift catalog values use binding. Engines whose native command does not accept identifier parameters use existing identifier quoting or escaped literals.
- No hover/provider code or unrelated feature code was added.
- Only Task 4 source/tests and this report were staged; the existing untracked Task 1 brief and dirty `node_modules` were preserved.

## Concerns

- PostgreSQL has no built-in `pg_get_tabledef`; the binding plan explicitly requires the table branch to preserve/delegate to current `getTableDDL`, so table behavior remains the existing generated DDL while all newly supported object kinds return native catalog text.
- The focused tests use driver mocks (and an in-memory SQLite database). Live engine validation belongs to Task 6.

## Important review fixes

Follow-up RED command used the same required focused suite. It exited 1 with 8 expected failures: Redis table definitions leaked the legacy logical-view text; MySQL trigger retrieval did not use `SHOW CREATE TRIGGER`; PostgreSQL/MySQL errors leaked a `password` property; SQL Server did not bracket-quote dotted/special identifiers; Oracle expected an aggregate row and lost ordered multi-row source; and Snowflake attempted unsupported trigger DDL.

The fixes now:

- return `undefined` for every Redis object kind and Snowflake triggers;
- retrieve MySQL triggers with safely quoted `SHOW CREATE TRIGGER` and return `SQL Original Statement` unchanged;
- bracket-quote each SQL Server identifier part before passing the qualified identity to `OBJECT_ID`;
- convert direct catalog errors through the existing `toQueryError`/driver conversion, removing arbitrary sensitive properties;
- fetch Oracle `ALL_SOURCE.TEXT` ordered by `LINE` and concatenate rows in JavaScript, avoiding `LISTAGG` length limits while preserving source text;
- exercise all five object kinds through contract/capability tests plus native query shape, quoting, unsupported, error, and long Oracle source cases.

Follow-up GREEN result: 4 files passed, 34 tests passed. `npm run lint` exited 0.

## Final capability coverage

Added an explicit eight-engine by five-object-kind capability matrix and exercised every supported/unsupported branch across PostgreSQL, MySQL, SQL Server, Oracle, SQLite, Snowflake, Redshift, and the Redis exclusion. Coverage now includes Redshift native view/routine text and unsupported table/trigger branches, all SQL Server and Oracle kinds, all Snowflake kinds including unsupported trigger, MySQL/PostgreSQL procedures, SQLite's supported table/view/trigger and unsupported routines, plus sanitized Redshift and SQLite catalog failures.

The first coverage run exited 1 with two test-fixture defects (leaked mock SSL state and an overly broad MySQL view fixture); no production defect was exposed, so production code was not changed. After correcting those test fixtures, the required focused command passed 4 files and 37 tests.
