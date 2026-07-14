# GROUP BY Quick Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic lightbulb action that inserts a missing GROUP BY expression into the exact failing SELECT scope without opening a preview window.

**Architecture:** A database-aware normalizer will classify native planner errors and extract the missing expression. A pure SQL rewrite service will combine that evidence with QueryDeck's parsed query tree and clause scanner to return a high-confidence text edit. Planner diagnostics will be tagged, and a dedicated VS Code code-action provider will expose the edit directly as a Quick Fix.

**Tech Stack:** TypeScript, VS Code Extension API, QueryDeck `SqlQueryTreeService`, Vitest.

## Global Constraints

- Phase 1 covers GROUP BY errors only.
- No AI, AI fallback, preview, diff, or external service.
- Direct edits require an unambiguous expression and SELECT scope.
- Preserve comments, parameters, indentation, line endings, and unrelated SQL.
- Keep the pull request open and unmerged until the user explicitly requests merge.

---

### Task 1: Normalize native GROUP BY errors

**Files:**
- Create: `src/services/sqlGroupByError.ts`
- Test: `tests/sqlGroupByQuickFix.test.ts`

**Interfaces:**
- Produces: `normalizeGroupByError(databaseType: DatabaseType, error: QueryError): GroupByErrorEvidence | undefined`.
- Produces: `GroupByErrorEvidence { expression: string; position?: number; confidence: 'high' }`.
- Consumes: native messages from PostgreSQL, Redshift, MySQL, SQL Server, Oracle, Snowflake, and an equivalent SQLite message.

- [ ] **Step 1: Write parameterized failing normalization tests**

Cover these representative messages and expected expressions:

```ts
[
  ['postgres', 'column "sales.region" must appear in the GROUP BY clause or be used in an aggregate function', 'sales.region'],
  ['redshift', 'column "sales.region" must appear in the GROUP BY clause or be used in an aggregate function', 'sales.region'],
  ['mysql', "Expression #1 of SELECT list contains nonaggregated column 'shop.sales.region'; this is incompatible with sql_mode=only_full_group_by", 'sales.region'],
  ['sqlserver', "Column 'sales.region' is invalid in the select list because it is not contained in either an aggregate function or the GROUP BY clause.", 'sales.region'],
  ['oracle', 'ORA-00979: "SALES"."REGION": must appear in the GROUP BY clause', 'SALES.REGION'],
  ['snowflake', "'SALES.REGION' in select clause is neither an aggregate nor in the group by clause", 'SALES.REGION'],
  ['sqlite', 'column "sales.region" must appear in the GROUP BY clause', 'sales.region']
]
```

Also assert no result for Oracle's expression-free `ORA-00979: not a GROUP BY expression`, unrelated planner errors, Redis, empty identifiers, and unsafe SQL fragments.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/sqlGroupByQuickFix.test.ts -t "normalizes"`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal database-aware normalization**

Use anchored message patterns per database, strip only database/catalog prefixes when the remaining qualified identifier is unambiguous, preserve quoted identifiers, and reject expressions containing statement delimiters or comments. Carry `QueryError.position` as a numeric hint without rewriting it.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/sqlGroupByQuickFix.test.ts -t "normalizes"`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/services/sqlGroupByError.ts tests/sqlGroupByQuickFix.test.ts
git commit -m "Normalize GROUP BY planner errors"
```

### Task 2: Resolve SELECT scopes and compute SQL edits

**Files:**
- Create: `src/services/sqlGroupByQuickFix.ts`
- Modify: `src/services/sqlQueryTreeService.ts`
- Test: `tests/sqlGroupByQuickFix.test.ts`

**Interfaces:**
- Produces: `computeGroupByQuickFix(document: TextDocument, evidence: GroupByErrorEvidence, diagnosticRange: Range): GroupByQuickFix | undefined`.
- Produces: `GroupByQuickFix { expression: string; range: Range; newText: string }`.
- May add a read-only query-tree helper that returns flattened SELECT-containing nodes ordered smallest-first; it must not alter execution detection.

- [ ] **Step 1: Write failing top-level edit tests**

Assert a query without GROUP BY inserts the clause before `HAVING`, `ORDER BY`, `LIMIT`, `OFFSET`, `FETCH`, set operators, or the semicolon. Assert a query with GROUP BY appends `, expression` before the next clause and refuses a duplicate expression.

- [ ] **Step 2: Run top-level tests and verify RED**

Run: `npm test -- tests/sqlGroupByQuickFix.test.ts -t "top-level|existing GROUP BY|clause order"`

Expected: FAIL because `computeGroupByQuickFix` does not exist.

- [ ] **Step 3: Implement quote/comment-aware clause scanning**

Build a scanner that tracks single quotes, quoted identifiers, line/block comments, dollar quotes, and parenthesis depth. It must find SELECT, GROUP BY, HAVING, ORDER BY, LIMIT/OFFSET/FETCH, UNION/INTERSECT/EXCEPT, and scope terminators only at the target scope's depth.

- [ ] **Step 4: Run top-level tests and verify GREEN**

Run: `npm test -- tests/sqlGroupByQuickFix.test.ts -t "top-level|existing GROUP BY|clause order"`

Expected: PASS.

- [ ] **Step 5: Write failing complex-scope tests**

Add fixtures for a CTE body, final SELECT after a CTE, nested subquery, correlated subquery, each UNION branch, repeated `region` identifiers in inner/outer scopes, two statements in one document, function expression `date_trunc('month', created_at)`, comments containing clause words, CRLF input, and an ambiguous error with no usable position.

- [ ] **Step 6: Run complex tests and verify RED**

Run: `npm test -- tests/sqlGroupByQuickFix.test.ts -t "CTE|subquery|correlated|UNION|multiple statements|ambiguous"`

Expected: FAIL on unresolved nested/branch targeting.

- [ ] **Step 7: Implement parser-first scope selection**

Use the diagnostic range and normalized error position to rank the smallest parsed node containing the reported expression. For UNION branches, split only top-level set-operation spans inside that node. Require one winning scope; return `undefined` on a tie. Compute indentation and line ending from the target scope, and emit one insertion/replacement only.

- [ ] **Step 8: Run all rewrite tests and verify GREEN**

Run: `npm test -- tests/sqlGroupByQuickFix.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/services/sqlGroupByQuickFix.ts src/services/sqlQueryTreeService.ts tests/sqlGroupByQuickFix.test.ts
git commit -m "Compute scope-aware GROUP BY fixes"
```

### Task 3: Tag planner diagnostics and expose the Quick Fix

**Files:**
- Modify: `src/services/sqlDiagnosticsService.ts`
- Create: `src/services/sqlGroupByCodeActionProvider.ts`
- Modify: `src/extension.ts`
- Modify: `tests/queryMemory.test.ts`
- Test: `tests/sqlGroupByQuickFix.test.ts`

**Interfaces:**
- Produces: planner diagnostic source `QueryDeck planner` and code `querydeck.planner.groupBy` only when normalization succeeds.
- Produces: `SqlGroupByCodeActionProvider`, registered for SQL with `CodeActionKind.QuickFix`.
- The provider attaches a `WorkspaceEdit` directly to the action; document change handling reruns diagnostics.

- [ ] **Step 1: Add failing planner-diagnostic identity tests**

Mock each supported driver's validation result and assert recognized GROUP BY errors receive the planner source/code while unrelated errors remain untagged errors.

- [ ] **Step 2: Run diagnostics tests and verify RED**

Run: `npm test -- tests/queryMemory.test.ts -t "GROUP BY planner diagnostic"`

Expected: FAIL because source/code are absent.

- [ ] **Step 3: Tag eligible planner diagnostics**

Call `normalizeGroupByError(connection.type, result.error)` inside planner diagnostic creation. Keep severity `Error`, attach the stable source/code only for recognized high-confidence evidence, and preserve the native error text.

- [ ] **Step 4: Run diagnostics tests and verify GREEN**

Run: `npm test -- tests/queryMemory.test.ts -t "GROUP BY planner diagnostic"`

Expected: PASS.

- [ ] **Step 5: Add failing code-action tests**

Assert the provider returns `Add sales.region to GROUP BY` with one direct workspace edit for an eligible diagnostic. Assert no action for metadata warnings, unrelated planner errors, duplicate GROUP BY expressions, ambiguous scopes, or stale/unmatched diagnostic ranges.

- [ ] **Step 6: Run provider tests and verify RED**

Run: `npm test -- tests/sqlGroupByQuickFix.test.ts -t "code action"`

Expected: FAIL because the provider does not exist.

- [ ] **Step 7: Implement and register the provider**

Construct the provider with `SqlQueryTreeService`; recompute normalization and edit from the current document plus diagnostic. Set `action.edit` to a new `WorkspaceEdit`, mark the action preferred, and register it alongside the metadata provider. Do not add a command, preview UI, or AI dependency.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run: `npm test -- tests/sqlGroupByQuickFix.test.ts tests/queryMemory.test.ts -t "GROUP BY|code action"`

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/services/sqlDiagnosticsService.ts src/services/sqlGroupByCodeActionProvider.ts src/extension.ts tests/queryMemory.test.ts tests/sqlGroupByQuickFix.test.ts
git commit -m "Add GROUP BY quick fix action"
```

### Task 4: Full verification and pull request

**Files:**
- Modify: new GitHub pull request only.

**Interfaces:**
- Produces: a tested branch and an open, unmerged PR describing deterministic GROUP BY fixes.

- [ ] **Step 1: Run fresh verification**

```powershell
npm run lint
npm test
npm run build
npx --yes @vscode/vsce@3.9.2 package --no-dependencies --out .tmp-group-by-quick-fix-verify.vsix
git diff --check origin/main...HEAD
```

Expected: all commands exit 0 and no tests fail.

- [ ] **Step 2: Audit scope**

Run `git diff --stat origin/main...HEAD` and inspect the complete source/test diff. Confirm there is no AI call, preview UI, unrelated diagnostic fix, or generated artifact.

- [ ] **Step 3: Push and open a PR**

Push `feature/group-by-quick-fix`, open a PR titled `Add scope-aware GROUP BY quick fixes`, include supported databases and verification evidence, and leave it unmerged.

- [ ] **Step 4: Watch GitHub CI**

Wait for unit, marketplace capture, and all live-database checks. Report any failure accurately; do not merge.
