# SQL Metadata Diagnostics Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cache-derived missing-table and missing-column diagnostics non-blocking across every SQL database and provide an in-editor Quick Fix that refreshes the selected connection's metadata.

**Architecture:** `SqlDiagnosticsService` will tag metadata-only warnings with stable diagnostic codes. A focused code-action provider will translate those tagged diagnostics into a `Refresh database metadata` Quick Fix, while a refresh service will connect only when required and synchronously rebuild schema metadata before diagnostics are rerun by the extension.

**Tech Stack:** TypeScript, VS Code Extension API, Vitest, QueryDeck schema metadata cache.

## Global Constraints

- Cover PostgreSQL, Redshift, MySQL, SQLite, SQL Server, Oracle, and Snowflake; Redis has no SQL diagnostics.
- Metadata-cache guesses are warnings; structural parser and live planner failures remain errors.
- Remove SQL formatter parameter masking and formatter-specific tests from PR #18.
- Keep PR #18 open and unmerged.

---

### Task 1: Remove unrelated formatter scope

**Files:**
- Restore: `src/services/sqlFormattingService.ts`
- Restore: `tests/sqlFormattingService.test.ts`
- Modify: `tests/queryMemory.test.ts`

**Interfaces:**
- Consumes: `origin/main` formatter behavior.
- Produces: a branch whose formatter files match `origin/main` and whose diagnostics tests contain no Redshift formatter fixture.

- [ ] **Step 1: Restore formatter files from the base branch**

```powershell
git restore --source=origin/main -- src/services/sqlFormattingService.ts tests/sqlFormattingService.test.ts
```

- [ ] **Step 2: Remove Redshift-only formatter and oversized script fixtures while retaining cross-database diagnostic policy tests**

Use `git diff origin/main...HEAD -- tests/queryMemory.test.ts` to identify branch-added tests. Keep the parameter-independent cross-database warning and structural-error tests; remove formatter-focused and redundant Redshift-only fixtures.

- [ ] **Step 3: Verify formatter files have no PR diff**

Run: `git diff origin/main -- src/services/sqlFormattingService.ts tests/sqlFormattingService.test.ts`

Expected: no output.

- [ ] **Step 4: Commit**

```powershell
git add src/services/sqlFormattingService.ts tests/sqlFormattingService.test.ts tests/queryMemory.test.ts
git commit -m "Narrow PR to SQL metadata diagnostics"
```

### Task 2: Tag database-wide metadata warnings

**Files:**
- Modify: `src/services/sqlDiagnosticsService.ts`
- Test: `tests/queryMemory.test.ts`

**Interfaces:**
- Produces: `SQL_METADATA_DIAGNOSTIC_SOURCE`, `SQL_METADATA_MISSING_RELATION`, and `SQL_METADATA_MISSING_COLUMN` exports used by the code-action provider.
- Produces: warning diagnostics with `source = 'QueryDeck metadata'` and a code value carrying the warning kind and schema name.

- [ ] **Step 1: Add failing assertions for warning identity across all SQL database types**

Extend the existing `it.each(sqlDatabaseTypes)` test to assert that both missing-relation and missing-column diagnostics have warning severity, source `QueryDeck metadata`, and codes beginning with `querydeck.metadata.missingRelation:` or `querydeck.metadata.missingColumn:`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/queryMemory.test.ts -t "metadata-only relation and column diagnostics"`

Expected: FAIL because diagnostic source/code are absent.

- [ ] **Step 3: Implement tagged metadata diagnostics**

Add a private constructor helper in `SqlDiagnosticsService` that creates warning diagnostics, assigns the stable source, and assigns `${kind}:${schema}` as the code. Use it for qualified relations, qualified columns, and unqualified columns. Do not change syntax or planner diagnostics.

- [ ] **Step 4: Run focused diagnostics tests and verify GREEN**

Run: `npm test -- tests/queryMemory.test.ts -t "SQL diagnostics"`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/services/sqlDiagnosticsService.ts tests/queryMemory.test.ts
git commit -m "Classify cached SQL metadata misses as warnings"
```

### Task 3: Add metadata refresh operation and Quick Fix

**Files:**
- Create: `src/services/sqlMetadataRefresh.ts`
- Create: `src/services/sqlMetadataCodeActionProvider.ts`
- Modify: `src/extension.ts`
- Test: `tests/queryMemory.test.ts`

**Interfaces:**
- Produces: `refreshSqlMetadata(connectionManager, schemaContext, connection, schemaNames): Promise<void>`.
- Produces: `SqlMetadataCodeActionProvider` whose command id is `database.refreshSqlMetadata` and whose title is `Refresh database metadata`.
- Consumes: diagnostic source/code exports from Task 2.

- [ ] **Step 1: Add failing refresh-operation tests**

Test that an offline connection calls `connectionManager.connect(connection.id)` before refresh, an active connection does not reconnect, each requested schema is invalidated and loaded with `refresh = true`, and an entry with `status: 'error'` rejects with its error message.

- [ ] **Step 2: Run refresh tests and verify RED**

Run: `npm test -- tests/queryMemory.test.ts -t "SQL metadata refresh"`

Expected: FAIL because `refreshSqlMetadata` does not exist.

- [ ] **Step 3: Implement the refresh operation**

Implement synchronous refresh around `ConnectionManager.isConnected`, `ConnectionManager.connect`, `SchemaContextService.invalidate`, and `SchemaContextService.loadSchema`. Deduplicate schema names and throw when a returned cache entry is not `ready`.

- [ ] **Step 4: Run refresh tests and verify GREEN**

Run: `npm test -- tests/queryMemory.test.ts -t "SQL metadata refresh"`

Expected: PASS.

- [ ] **Step 5: Add failing code-action tests**

Test that the provider returns exactly one Quick Fix for a tagged QueryDeck metadata warning, passes document URI plus the schema from the diagnostic code to `database.refreshSqlMetadata`, and returns no action for syntax/planner diagnostics.

- [ ] **Step 6: Run provider tests and verify RED**

Run: `npm test -- tests/queryMemory.test.ts -t "SQL metadata code actions"`

Expected: FAIL because the provider does not exist.

- [ ] **Step 7: Implement and register the provider and command**

Create the provider, register it for `{ language: 'sql' }`, and register `database.refreshSqlMetadata`. The command resolves the document's selected connection, calls `refreshSqlMetadata`, refreshes the explorer, reruns `updateSqlDiagnostics(document)`, and reports refresh failures with `showErrorMessage`.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run: `npm test -- tests/queryMemory.test.ts -t "SQL metadata"`

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/services/sqlMetadataRefresh.ts src/services/sqlMetadataCodeActionProvider.ts src/extension.ts tests/queryMemory.test.ts
git commit -m "Add SQL metadata refresh quick fix"
```

### Task 4: Verify and revise PR #18

**Files:**
- Modify: PR #18 title and body on GitHub.

**Interfaces:**
- Produces: a pushed branch and an open PR accurately describing only the validation-warning and refresh-action behavior.

- [ ] **Step 1: Run full verification**

```powershell
npm run lint
npm run build
npm test
npx --yes @vscode/vsce@3.9.2 package --no-dependencies --out .tmp-sql-metadata-refresh-verify.vsix
git diff --check
```

Expected: every command exits 0; unit output has no failures.

- [ ] **Step 2: Confirm branch scope**

Run: `git diff --stat origin/main...HEAD` and `git diff origin/main...HEAD -- src/services/sqlFormattingService.ts tests/sqlFormattingService.test.ts`.

Expected: no formatter diff; only diagnostics, refresh action, tests, and approved docs remain.

- [ ] **Step 3: Push the branch**

```powershell
git push origin fix/redshift-insert-with
```

- [ ] **Step 4: Rewrite PR metadata**

Set the title to `Make cached SQL diagnostics actionable across databases`. Rewrite the body to describe warning severity, preserved authoritative errors, the metadata-refresh Quick Fix, supported databases, and exact verification results.

- [ ] **Step 5: Confirm PR remains open and unmerged**

Run: `gh pr view 18 --repo yirgagithub/vsCode-Data-Grip --json state,title,body,url,files,statusCheckRollup`

Expected: state `OPEN`, revised title/body, no formatter files.
