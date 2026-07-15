# Task 4: Native object-definition retrieval

Work in `C:\Users\yirga\.openclaw\workspace\querydeck-table-hover-ddl` on `feature/table-hover-ddl`. Read Task 4 and Global Constraints in the plan; they are binding.

Extend the typed `DatabaseDriver` API with `getObjectDefinition(connectionId, object): Promise<string | undefined>` while preserving `getTableDDL` for current callers. Implement object definition retrieval for existing SQL drivers using each engine's native catalog/command and bound parameters/existing identifier quoting: PostgreSQL `pg_get_*def`, MySQL `SHOW CREATE`, SQL Server `OBJECT_DEFINITION`, Oracle catalog source, SQLite `sqlite_master`, Snowflake `GET_DDL`, and Redshift's available view/routine text. Unsupported object/engine combinations return `undefined`; sanitize errors consistently.

Hard rule: return each engine's native definition verbatim. Never normalize, translate, synthesize, or present a common cross-database DDL format. Redis is excluded.

Use strict TDD. Add/update focused contract and driver tests covering every object kind and capability, unsupported results, query shape, binding/safe quoting, and returned native text. Do not add hover/providers in this task.

Run `npx vitest run tests/databaseObjectDefinition.test.ts tests/postgresDriver.test.ts tests/mysqlDriver.test.ts tests/additionalDrivers.test.ts` (adapt only if exact existing test names differ) and `npm run lint`. Commit implementation and write `.superpowers/sdd/task-4-report.md` with RED evidence, exact commands/results, commit, self-review, and concerns.
