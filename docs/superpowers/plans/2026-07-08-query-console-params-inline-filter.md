# Query Console Parameters And Inline Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix SQL parameter detection so quoted SQL literals are not prompted, and fix result-grid value filters so a new filter starts with no selected values and only filters after the user selects values.

**Architecture:** Keep SQL placeholder parsing in `src/services/sqlParameters.ts` and cover literal/comment/cast edge cases with unit tests. Keep result-grid filter behavior in `src/webviews/results/app/components/ResultGrid.tsx`, exposing only small pure helpers needed for focused tests without adding a browser test stack.

**Tech Stack:** TypeScript, React, Vitest, VS Code extension runtime.

## Global Constraints

- Start from latest `origin/main`.
- Do not touch generated `dist/` or `media/results/` bundles unless a build command regenerates them intentionally.
- Use TDD: failing tests first, then implementation, then full verification.
- Push a branch and open a detailed PR.

---

### Task 1: SQL Parameter Detection

**Files:**
- Modify: `src/services/sqlParameters.ts`
- Modify: `tests/queryMemory.test.ts`

**Interfaces:**
- Consumes: `findSqlParameters(sql: string): SqlParameter[]`
- Produces: same API, with placeholders ignored inside single-quoted and double-quoted SQL literals.

- [ ] **Step 1: Write the failing test**

Add a test in the `describe('SQL parameters')` block:

```ts
it('ignores brace and named placeholders inside SQL string literals', () => {
  const sql = `select *
from public.event_fact
where event_datetime::date between {startDate} and :endDate
  and literal_brace = '{startDate}'
  and literal_colon = ":startDate"
  and status = :status`;

  expect(uniqueSqlParameterNames(findSqlParameters(sql))).toEqual(['startDate', 'endDate', 'status']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/queryMemory.test.ts -t "ignores brace and named placeholders inside SQL string literals"`

Expected: FAIL because quoted `{startDate}` or `:startDate` is still included.

- [ ] **Step 3: Write minimal implementation**

Move placeholder reads so they only run when not inside single-quoted or double-quoted strings.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run tests/queryMemory.test.ts -t "SQL parameters"`

Expected: PASS.

### Task 2: Inline Value Filter Defaults

**Files:**
- Modify: `src/webviews/results/app/components/ResultGrid.tsx`
- Create: `tests/resultGridFilter.test.ts`

**Interfaces:**
- Consumes: value-filter helper behavior in `ResultGrid.tsx`
- Produces: new filter selection starts empty; existing filters retain selected values; empty selected values match no rows once applied.

- [ ] **Step 1: Write failing helper tests**

Create `tests/resultGridFilter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initialColumnFilterSelection, matchesColumnFilterForTest } from '../src/webviews/results/app/components/ResultGrid';

describe('ResultGrid value filters', () => {
  it('starts a new value filter with no selected values', () => {
    expect(initialColumnFilterSelection(undefined, ['active', 'paused'])).toEqual([]);
  });

  it('keeps existing selected values when reopening an active value filter', () => {
    expect(initialColumnFilterSelection({ column: 'status', operator: 'values', value: '', values: ['active'] }, ['active', 'paused'])).toEqual(['active']);
  });

  it('does not match any rows when an applied value filter has no selected values', () => {
    expect(matchesColumnFilterForTest('active', { column: 'status', operator: 'values', value: '', values: [] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/resultGridFilter.test.ts`

Expected: FAIL because helpers are not exported yet.

- [ ] **Step 3: Write minimal implementation**

Export the `ColumnFilter` interface and two small testable helpers from `ResultGrid.tsx`. Use the helper for `ColumnFilterPopover` initial state, defaulting to `[]` for new value filters.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run tests/resultGridFilter.test.ts`

Expected: PASS.

### Task 3: Verification And PR

**Files:**
- Modify only files from Tasks 1 and 2 plus this plan file.

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run: `npm test`

Expected: PASS with skipped live tests unchanged.

- [ ] **Step 3: Commit, push, and open PR**

Run:

```bash
git status --short
git add docs/superpowers/plans/2026-07-08-query-console-params-inline-filter.md src/services/sqlParameters.ts src/webviews/results/app/components/ResultGrid.tsx tests/queryMemory.test.ts tests/resultGridFilter.test.ts
git commit -m "Fix SQL parameter literals and inline value filters"
git push -u origin fix/query-console-params-inline-filter
gh pr create --base main --head fix/query-console-params-inline-filter --title "Fix SQL parameter literals and inline value filters" --body-file pr-body.md
```

Expected: PR URL is returned.
