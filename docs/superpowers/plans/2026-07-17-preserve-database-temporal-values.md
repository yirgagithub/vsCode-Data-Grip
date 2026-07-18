# Preserve Database Temporal Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent QueryDeck from timezone-shifting database temporal result cells by keeping them as stable strings across every supported driver and result consumer.

**Architecture:** Ask each database client for string-valued temporal cells at the driver boundary. PostgreSQL/Redshift, MySQL, Oracle, and Snowflake have native fetch/parser controls; SQL Server requires type-aware conversion through its supported value handlers. SQLite and Redis already preserve scalar values and receive regression coverage proving QueryDeck does not infer dates.

**Tech Stack:** TypeScript 5.9, Vitest, pg 8, mysql2 3, mssql 12/Tedious, oracledb 7, snowflake-sdk 3, sqlite3 6, redis 6.

## Global Constraints

- Never construct a JavaScript `Date` for database result cells when the driver can return temporal text.
- Preserve non-temporal values and nulls unchanged.
- Do not change QueryDeck-owned execution timestamps.
- The grid, filtering, copy/export, persistence, and MCP paths must consume the same stable cell value.
- Do not add automatic localization or timezone conversion.

---

### Task 1: PostgreSQL, Redshift, and MySQL Native String Fetching

**Files:**
- Modify: `src/database/drivers/postgresDriver.ts`
- Modify: `src/database/drivers/mysqlDriver.ts`
- Test: `tests/postgresDriver.test.ts`
- Test: `tests/mysqlDriver.test.ts`

**Interfaces:**
- Consumes: `pg.types.getTypeParser(oid, format)` and `PoolConfig.types`; `mysql2.PoolOptions.dateStrings`.
- Produces: pool configurations that return PostgreSQL/Redshift temporal OIDs and MySQL `DATE`, `DATETIME`, and `TIMESTAMP` cells as strings.

- [ ] **Step 1: Write failing PostgreSQL parser tests**

Extend the `pg` mock to expose `types.getTypeParser`, capture each pool's `config.types`, and assert OIDs `1082`, `1083`, `1114`, `1184`, `1186`, and `1266` use a parser that returns the input text unchanged while a non-temporal OID delegates to the default parser.

```ts
it('preserves PostgreSQL and Redshift temporal result text', async () => {
  const driver = new PostgresDriver();
  await driver.connect(config());
  const parser = pgMock.pools[0].config.types?.getTypeParser;
  expect(parser?.(1114, 'text')('2026-07-17 00:00:00')).toBe('2026-07-17 00:00:00');
  expect(parser?.(1184, 'text')('2026-07-17 00:00:00+02')).toBe('2026-07-17 00:00:00+02');
});
```

- [ ] **Step 2: Run the PostgreSQL test and verify RED**

Run: `npx vitest run tests/postgresDriver.test.ts`

Expected: FAIL because pool config has no custom `types.getTypeParser`.

- [ ] **Step 3: Implement PostgreSQL/Redshift temporal parsers**

Add a temporal OID set and pass a per-pool parser registry from `toPoolConfig`; return `(value: string) => value` for temporal text OIDs and delegate all other OIDs and formats to the runtime's default parser. Keep this per pool rather than mutating global `pg.types`.

```ts
const POSTGRES_TEMPORAL_OIDS = new Set([1082, 1083, 1114, 1184, 1186, 1266]);
```

- [ ] **Step 4: Run the PostgreSQL test and verify GREEN**

Run: `npx vitest run tests/postgresDriver.test.ts`

Expected: all PostgreSQL/Redshift driver tests pass.

- [ ] **Step 5: Write the failing MySQL pool-config test**

Capture the config passed to the MySQL mock and assert:

```ts
expect(mysqlMock.pools[0].config.dateStrings).toEqual(['DATE', 'DATETIME', 'TIMESTAMP']);
```

- [ ] **Step 6: Run the MySQL test and verify RED**

Run: `npx vitest run tests/mysqlDriver.test.ts`

Expected: FAIL because `dateStrings` is undefined.

- [ ] **Step 7: Implement MySQL temporal string fetching**

Add the exact `dateStrings: ['DATE', 'DATETIME', 'TIMESTAMP']` option in `toPoolConfig`, including SSL fallback pools because they reuse that function.

- [ ] **Step 8: Run both driver test files and commit**

Run: `npx vitest run tests/postgresDriver.test.ts tests/mysqlDriver.test.ts`

Expected: both files pass.

```powershell
git add src/database/drivers/postgresDriver.ts src/database/drivers/mysqlDriver.ts tests/postgresDriver.test.ts tests/mysqlDriver.test.ts
git commit -m "fix: preserve postgres and mysql temporal values"
```

### Task 2: Oracle and Snowflake Native String Fetching

**Files:**
- Modify: `src/database/drivers/oracleDriver.ts`
- Modify: `src/database/drivers/snowflakeDriver.ts`
- Test: `tests/additionalDrivers.test.ts`

**Interfaces:**
- Consumes: Oracle execute option `fetchTypeHandler` plus runtime temporal/STRING constants; Snowflake execute option `fetchAsString`.
- Produces: query execution options that return every Oracle and Snowflake temporal result as a string.

- [ ] **Step 1: Write failing Oracle execute-option tests**

Extend the Oracle runtime mock with `STRING`, `DB_TYPE_DATE`, `DB_TYPE_TIMESTAMP`, `DB_TYPE_TIMESTAMP_TZ`, and `DB_TYPE_TIMESTAMP_LTZ`. Capture execute options and verify the handler maps each temporal metadata type to `STRING`, while returning `undefined` for VARCHAR/NUMBER.

```ts
const handler = oracleMock.executeOptions.at(-1)?.fetchTypeHandler;
expect(handler({ dbType: oracleMock.runtime.DB_TYPE_DATE })).toEqual({ type: oracleMock.runtime.STRING });
expect(handler({ dbType: oracleMock.runtime.DB_TYPE_VARCHAR })).toBeUndefined();
```

- [ ] **Step 2: Run the Oracle test and verify RED**

Run: `npx vitest run tests/additionalDrivers.test.ts -t "Oracle temporal"`

Expected: FAIL because `fetchTypeHandler` is missing.

- [ ] **Step 3: Implement an Oracle driver-local fetch handler**

Expand `OracleRuntime` with the required constants, create a `temporalFetchTypeHandler(oracle)` helper, and include it on all query-result `execute` calls. Do not set global `oracledb.fetchAsString`.

- [ ] **Step 4: Run the Oracle test and verify GREEN**

Run: `npx vitest run tests/additionalDrivers.test.ts -t "Oracle temporal"`

Expected: PASS.

- [ ] **Step 5: Write failing Snowflake execute-option tests**

Capture the options passed to `connection.execute` and assert:

```ts
expect(snowflakeMock.executeOptions.at(-1)?.fetchAsString).toEqual(['Date']);
```

- [ ] **Step 6: Run the Snowflake test and verify RED**

Run: `npx vitest run tests/additionalDrivers.test.ts -t "Snowflake temporal"`

Expected: FAIL because `fetchAsString` is absent.

- [ ] **Step 7: Implement Snowflake date-string fetching**

Extend `SnowflakeConnection.execute` options and pass `fetchAsString: ['Date']` from `executeSnowflake`. Preserve the callback rows and metadata pipeline unchanged.

- [ ] **Step 8: Run additional-driver tests and commit**

Run: `npx vitest run tests/additionalDrivers.test.ts`

Expected: all tests pass.

```powershell
git add src/database/drivers/oracleDriver.ts src/database/drivers/snowflakeDriver.ts tests/additionalDrivers.test.ts
git commit -m "fix: preserve oracle and snowflake temporal values"
```

### Task 3: SQL Server Type-Aware Temporal Strings

**Files:**
- Modify: `src/database/drivers/sqlServerDriver.ts`
- Create: `tests/temporalResultValues.test.ts`
- Test: `tests/additionalDrivers.test.ts`

**Interfaces:**
- Consumes: `mssql.valueHandler`, SQL Server temporal type tokens, and Date getters.
- Produces: `configureSqlServerTemporalValueHandlers(runtime: MssqlRuntime): void` plus deterministic ISO-like strings with no timezone-induced calendar shift.

- [ ] **Step 1: Write failing pure-format tests**

Test date-only, time, datetime/datetime2/smalldatetime, and datetimeoffset handler outputs using fixed Date instances. Assert date-only output is `YYYY-MM-DD`, timezone-free types contain no trailing `Z`, and values are stable in the configured UTC interpretation.

```ts
expect(formatSqlServerTemporalValue(new Date('2026-07-17T00:00:00.000Z'), 'date')).toBe('2026-07-17');
expect(formatSqlServerTemporalValue(new Date('2026-07-17T12:34:56.789Z'), 'datetime2')).toBe('2026-07-17 12:34:56.789');
```

- [ ] **Step 2: Run the pure-format test and verify RED**

Run: `npx vitest run tests/temporalResultValues.test.ts`

Expected: FAIL because the formatter does not exist.

- [ ] **Step 3: Implement the minimal SQL Server temporal formatter**

Export a focused helper that uses UTC components because Tedious defaults to `useUTC: true`. Preserve available millisecond precision and return null unchanged before handlers call it.

- [ ] **Step 4: Run the pure-format test and verify GREEN**

Run: `npx vitest run tests/temporalResultValues.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing SQL Server registration tests**

Mock `mssql.valueHandler` as a `Map`, expose temporal type tokens, connect a driver, and assert handlers are registered for `Date`, `Time`, `DateTime`, `DateTime2`, `SmallDateTime`, and `DateTimeOffset` before query execution. Assert an integer result stays numeric.

- [ ] **Step 6: Run registration tests and verify RED**

Run: `npx vitest run tests/additionalDrivers.test.ts -t "SQL Server temporal"`

Expected: FAIL because no value handlers are registered.

- [ ] **Step 7: Register SQL Server temporal handlers**

Expand `MssqlRuntime` to include `valueHandler` and temporal type tokens. Register idempotently during `connect` before creating the pool. Do not handle non-temporal tokens.

- [ ] **Step 8: Run SQL Server tests and commit**

Run: `npx vitest run tests/temporalResultValues.test.ts tests/additionalDrivers.test.ts`

Expected: all tests pass.

```powershell
git add src/database/drivers/sqlServerDriver.ts tests/temporalResultValues.test.ts tests/additionalDrivers.test.ts
git commit -m "fix: preserve sql server temporal values"
```

### Task 4: End-to-End Result-Pipeline Preservation and Verification

**Files:**
- Modify: `tests/resultFormat.test.ts`
- Modify: `tests/additionalDrivers.test.ts`
- Modify: `tests/liveDatabaseDrivers.integration.test.ts`

**Interfaces:**
- Consumes: string-valued temporal cells from Tasks 1-3.
- Produces: regression proof that shared UI/export code and no-coercion engines preserve temporal strings exactly.

- [ ] **Step 1: Add shared pass-through regression tests**

For representative `DATE`, `TIME`, timezone-free timestamp, and timezone-aware timestamp strings, assert `formatFieldValue`, TSV, CSV, Markdown, and JSON-facing row objects preserve the input text exactly. Add SQLite and Redis driver assertions proving date-shaped strings remain strings and are not parsed.

- [ ] **Step 2: Run targeted tests**

Run: `npx vitest run tests/resultFormat.test.ts tests/additionalDrivers.test.ts`

Expected: PASS; if any assertion fails, correct only the consumer that mutates the string.

- [ ] **Step 3: Extend opt-in live coverage**

Add one temporal-value query per available SQL integration connection and assert returned cells are strings. Keep the existing environment-variable skip behavior so CI without databases remains deterministic.

- [ ] **Step 4: Run compile, full tests, and build**

Run: `npm run lint`

Expected: exit 0.

Run: `npm test`

Expected: all non-live tests pass with only existing opt-in integration skips.

Run: `npm run build`

Expected: exit 0 and regenerated `dist`/`media/results` assets.

- [ ] **Step 5: Inspect the final diff and commit verification artifacts**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; only planned source, tests, docs, and generated build artifacts are modified.

```powershell
git add tests/resultFormat.test.ts tests/additionalDrivers.test.ts tests/liveDatabaseDrivers.integration.test.ts dist media/results
git commit -m "test: cover temporal value preservation"
```
