# Database Object Hover and Definition Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compact hover metadata and Ctrl+click/F12 definition navigation for tables, views, functions, stored procedures, and triggers in QueryDeck-bound SQL editors.

**Architecture:** A pure SQL object-reference resolver feeds one metadata resolver shared by VS Code hover and definition providers. Schema metadata is extended with routines/triggers, while a typed driver API retrieves exact object definitions into QueryDeck-owned read-only virtual SQL documents.

**Tech Stack:** TypeScript, VS Code Extension API, Vitest, existing QueryDeck database drivers and schema cache.

## Global Constraints

- Support tables, views, functions, stored procedures, and triggers on SQL connections; exclude Redis.
- Passive hover never emits notifications or guesses ambiguous objects.
- Generated definition documents are read-only and never execute SQL.
- Keep hover compact; indexes, row counts, and storage sizes remain out of scope.
- Use existing identifier comparison, document-connection resolution, and metadata refresh behavior.

---

## File Structure

- Create `src/services/sqlObjectReference.ts`: pure cursor-to-object parsing and ranges.
- Create `src/services/databaseObjectMetadata.ts`: shared object resolution and hover model.
- Create `src/services/databaseObjectHover.ts`: Markdown-safe compact rendering.
- Create `src/providers/databaseObjectLanguageProviders.ts`: VS Code hover/definition adapters and virtual documents.
- Modify `src/types.ts`: object identity, routine signatures, and cached routines/triggers.
- Modify `src/database/drivers/DatabaseDriver.ts` and SQL drivers: typed definition retrieval.
- Modify `src/services/schemaContextService.ts` and `schemaMetadataCacheStore.ts`: routine/trigger cache lifecycle.
- Modify `src/extension.ts`: provider construction, registration, and disposal only.
- Add focused tests under `tests/` matching each unit above.

### Task 1: Parse SQL object references

**Files:**
- Create: `src/services/sqlObjectReference.ts`
- Test: `tests/sqlObjectReference.test.ts`

**Interfaces:**
- Produces: `findSqlObjectReference(sql: string, offset: number): SqlObjectReference | undefined`
- Produces: `SqlObjectReference { range: { start: number; end: number }; parts: string[]; context: 'relation' | 'routine' | 'trigger'; argumentCount?: number }`

- [ ] **Step 1: Write failing parser tests** for `FROM/JOIN/UPDATE/INSERT INTO/DELETE FROM`, quoted qualified names, routine calls, trigger DDL, aliases, CTEs, nested SQL, strings, comments, and built-ins. Assert exact offsets, normalized parts, context, and routine argument count.

```ts
expect(findSqlObjectReference('select * from sales.orders o', 22)).toEqual({
  range: { start: 14, end: 26 }, parts: ['sales', 'orders'], context: 'relation'
});
expect(findSqlObjectReference('with orders as (select 1) select * from orders', 45)).toBeUndefined();
```

- [ ] **Step 2: Run `npx vitest run tests/sqlObjectReference.test.ts`** and verify failure because the module is absent.
- [ ] **Step 3: Implement a small tokenizer/state machine** that masks comments/strings, tracks CTE names and parentheses, classifies relation/routine/trigger contexts, preserves exact source ranges, and rejects aliases and built-ins.
- [ ] **Step 4: Re-run the focused test** and expect all parser cases to pass.
- [ ] **Step 5: Commit** with `git add src/services/sqlObjectReference.ts tests/sqlObjectReference.test.ts && git commit -m "feat: resolve SQL database object references"`.

### Task 2: Extend object metadata and cache

**Files:**
- Modify: `src/types.ts`
- Modify: `src/services/schemaContextService.ts`
- Modify: `src/services/schemaMetadataCacheStore.ts`
- Test: `tests/schemaContextService.test.ts`
- Test: `tests/schemaMetadataCacheStore.test.ts`

**Interfaces:**
- Produces: `DatabaseObjectKind = 'table' | 'view' | 'function' | 'procedure' | 'trigger'`
- Produces: `DatabaseObjectIdentity { kind; schema; name; signature?: string; table?: string }`
- Extends `RoutineInfo` with optional `signature?: string`, `arguments?: string[]`.
- Extends `SchemaCacheEntry` with `functions: RoutineInfo[]`, `procedures: RoutineInfo[]`, `triggers: TriggerInfo[]`.

- [ ] **Step 1: Write failing cache tests** proving one schema load fetches routines/triggers with tables/views, persists them, hydrates older cache records as empty arrays, shares in-flight loads, and marks failures consistently.
- [ ] **Step 2: Run the two focused test files** and verify missing fields/requests fail.
- [ ] **Step 3: Add the types and metadata loading** using `Promise.all([getSchemas, getTables, getViews, getFunctions, getProcedures, getTriggers])`; keep cache deserialization backward compatible with `?? []` and increment `SCHEMA_METADATA_CACHE_VERSION`.
- [ ] **Step 4: Run `npx vitest run tests/schemaContextService.test.ts tests/schemaMetadataCacheStore.test.ts`** and expect pass.
- [ ] **Step 5: Commit** with message `feat: cache routine and trigger metadata`.

### Task 3: Resolve objects and render compact hover content

**Files:**
- Create: `src/services/databaseObjectMetadata.ts`
- Create: `src/services/databaseObjectHover.ts`
- Test: `tests/databaseObjectMetadata.test.ts`
- Test: `tests/databaseObjectHover.test.ts`

**Interfaces:**
- Consumes: `SqlObjectReference`, `SchemaContextService`, bound `ConnectionConfig`.
- Produces: `resolveDatabaseObject(reference, connection, schemaContext): Promise<ResolvedDatabaseObject | undefined>`.
- Produces: `renderDatabaseObjectHover(object): string` containing escaped Markdown.

- [ ] **Step 1: Write failing resolution tests** for qualified/default-schema objects, case rules, tables/views, routine overloads by argument count, triggers, aliases/built-ins, ambiguous overloads, disconnected cached metadata, and missing objects.
- [ ] **Step 2: Write failing renderer tests** asserting table columns/nullability/PK/FK, view columns, function return/signature, procedure signature, trigger table/timing/events, and Markdown escaping.
- [ ] **Step 3: Run both focused files** and verify imports/functions are missing.
- [ ] **Step 4: Implement metadata resolution** with one discriminated `ResolvedDatabaseObject` union and no UI dependencies; obtain table keys/foreign keys through existing schema services and return `undefined` for ambiguity.
- [ ] **Step 5: Implement compact Markdown rendering** with a shared `escapeMarkdownText()` and no arbitrary command links.
- [ ] **Step 6: Re-run both focused tests** and expect pass.
- [ ] **Step 7: Commit** with message `feat: resolve and format database object metadata`.

### Task 4: Add typed definition retrieval to database drivers

**Files:**
- Modify: `src/database/drivers/DatabaseDriver.ts`
- Modify: `src/database/drivers/driverUtils.ts`
- Modify: `src/database/drivers/postgresDriver.ts`
- Modify: `src/database/drivers/mysqlDriver.ts`
- Modify: `src/database/drivers/sqlServerDriver.ts`
- Modify: `src/database/drivers/oracleDriver.ts`
- Modify: `src/database/drivers/sqliteDriver.ts`
- Modify: `src/database/drivers/snowflakeDriver.ts`
- Modify: `src/database/drivers/redshiftDriver.ts`
- Test: existing driver tests plus `tests/databaseObjectDefinition.test.ts`

**Interfaces:**
- Produces: `getObjectDefinition(connectionId: string, object: DatabaseObjectIdentity): Promise<string | undefined>`.
- Preserves: `getTableDDL(...)` for existing callers, delegated by the table branch.

- [ ] **Step 1: Add failing contract tests** with fake drivers for every object kind and engine capability, requiring undefined for unsupported definitions and sanitized thrown errors.
- [ ] **Step 2: Run `npx vitest run tests/databaseObjectDefinition.test.ts tests/postgresDriver.test.ts tests/mysqlDriver.test.ts tests/additionalDrivers.test.ts`** and verify interface/query failures.
- [ ] **Step 3: Implement each engine's catalog/native definition query** with bound parameters and existing identifier quoting. Use engine-native sources (`pg_get_*def`, `SHOW CREATE`, `OBJECT_DEFINITION`, Oracle catalog source, SQLite `sqlite_master`, Snowflake `GET_DDL`); Redshift returns available view/routine text and `undefined` where unsupported.
- [ ] **Step 4: Re-run focused driver tests** with query-shape and returned-definition assertions; expect pass.
- [ ] **Step 5: Commit** with message `feat: retrieve database object definitions`.

### Task 5: Add VS Code hover, definition, and virtual document providers

**Files:**
- Create: `src/providers/databaseObjectLanguageProviders.ts`
- Modify: `src/extension.ts`
- Test: `tests/databaseObjectLanguageProviders.test.ts`
- Test: `tests/commandSurface.test.ts`

**Interfaces:**
- Consumes: document connection resolver, `findSqlObjectReference`, `resolveDatabaseObject`, `renderDatabaseObjectHover`, and `getObjectDefinition`.
- Produces: `DatabaseObjectLanguageProviders` implementing `HoverProvider`, `DefinitionProvider`, `TextDocumentContentProvider`, and `dispose()`.

- [ ] **Step 1: Write failing provider tests** proving SQL-only registration, bound-document gating, compact hover, silent passive failures, Ctrl+click/F12 locations, stable encoded virtual URIs, refreshed content, read-only scheme behavior, explicit unsupported/error notifications, and no partial document opening.
- [ ] **Step 2: Run the focused provider tests** and verify the provider is absent.
- [ ] **Step 3: Implement provider adapters** with cancellation checks before/after async work. Build `querydeck-definition:` URIs from connection ID, kind, schema, name, and signature; store content in an in-memory map and fire `onDidChange` before returning the definition location.
- [ ] **Step 4: Register providers in `activate()`** for `{ language: 'sql' }`, route only documents resolved to QueryDeck connections, and add all disposables to `context.subscriptions`.
- [ ] **Step 5: Run `npx vitest run tests/databaseObjectLanguageProviders.test.ts tests/commandSurface.test.ts`** and expect pass.
- [ ] **Step 6: Commit** with message `feat: add database object hover and definition navigation`.

### Task 6: Cross-feature regression and packaging verification

**Files:**
- Modify only files required by failures found in this task.
- Test: `tests/engineFunctionalMatrix.test.ts`
- Test: `tests/liveDatabaseDrivers.integration.test.ts` where existing containers support catalog assertions.

- [ ] **Step 1: Add functional-matrix assertions** documenting which engines enumerate and define each object kind; distinguish unsupported from failure.
- [ ] **Step 2: Run `npm test`** and expect the complete Vitest suite to pass.
- [ ] **Step 3: Run `npm run lint`** and expect TypeScript no-emit validation to pass.
- [ ] **Step 4: Run `npm run build`** and expect extension, MCP, runtimes, and webview bundles to succeed.
- [ ] **Step 5: Run `npx vsce package --no-dependencies`** and verify a VSIX is created without secret/runtime packaging regressions.
- [ ] **Step 6: Inspect `git status --short` and `git diff --check`**, remove generated artifacts that are not intentionally tracked, and confirm only scoped changes remain.
- [ ] **Step 7: Commit** any verification-driven fixes with message `test: verify database object navigation across engines`.
