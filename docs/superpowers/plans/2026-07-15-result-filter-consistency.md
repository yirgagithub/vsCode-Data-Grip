# Result Filter Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make result-grid filters cascade correctly, display date-only values without timezone shifts, expose every safe unique value, and warn before materializing high-cardinality lists.

**Architecture:** Move filter derivation and value formatting into pure helpers so behavior is testable without rendering React. `ResultGrid` will supply field metadata and rows already constrained by other filters to a virtualized popover; the popover will use one canonical selection set and a guarded option-analysis result.

**Tech Stack:** TypeScript, React 19, Vitest, VS Code webviews, CSS virtualization primitives.

## Global Constraints

- Filtering remains local to fetched rows and never rewrites SQL.
- Applied filters remain persisted with the result tab/session.
- Warn at 10,000 unique values or 5 MB estimated filter payload, whichever comes first.
- Date-only values render as exact `YYYY-MM-DD`; timestamp formatting is unchanged.
- Work stays on PR #23 branch `fix/redshift-table-definition`.

---

### Task 1: Field-aware date-only formatting

**Files:**
- Modify: `src/webviews/results/app/format.ts`
- Modify: `src/webviews/results/app/components/ResultGrid.tsx`
- Modify: `tests/resultFormat.test.ts`
- Modify: `tests/resultGridFilter.test.ts`

**Interfaces:**
- Produces: `formatFieldValue(value: unknown, field?: Pick<QueryField, 'dataTypeId' | 'dataTypeName'>): string`.
- Produces: field-aware filter keys and labels consumed by later filter helpers.

- [ ] **Step 1: Write failing tests** proving PostgreSQL OID `1082` and type name `date` turn `2025-11-08T23:00:00.000Z` into `2025-11-09` only when the original database date is available as a date-only string, while timestamp fields retain ISO timestamps. Cover grid labels and value-filter keys with the same assertions.
- [ ] **Step 2: Run `npm test -- tests/resultFormat.test.ts tests/resultGridFilter.test.ts`** and confirm failures are caused by missing field-aware formatting.
- [ ] **Step 3: Implement `formatFieldValue`** with date-only detection from field metadata. Preserve an incoming `YYYY-MM-DD` string verbatim; for driver-provided `Date` values use calendar components without applying a second UTC conversion. Route ResultGrid display, sorting, copying, filter labels, filter keys, and matching through the helper with the relevant field.
- [ ] **Step 4: Run the focused tests** and confirm they pass.
- [ ] **Step 5: Commit** with `fix: preserve date-only result values`.

### Task 2: Cascading filter-option derivation

**Files:**
- Create: `src/webviews/results/app/resultFilters.ts`
- Modify: `src/webviews/results/app/components/ResultGrid.tsx`
- Modify: `tests/resultGridFilter.test.ts`

**Interfaces:**
- Produces: `rowsForColumnOptions(rows, filters, column, fields): Record<string, unknown>[]`.
- Produces: `buildColumnFilterOptions(rows, field): FilterOption[]`.
- Consumes: `formatFieldValue` from Task 1.

- [ ] **Step 1: Write failing tests** with Region values `Africa`/`Europe` and 30 countries. Assert that an active Africa filter leaves only the two African countries in Country options, that adding Country preserves Region, and that Country's own active filter is excluded while calculating Country options.
- [ ] **Step 2: Run `npm test -- tests/resultGridFilter.test.ts`** and confirm the uncascaded 30-country result fails.
- [ ] **Step 3: Implement pure cascading helpers** by filtering rows with every active filter except the target column, then deriving counted/sorted unique options from those rows. Update `ResultGrid` to pass these derived rows and target-field metadata to the popover.
- [ ] **Step 4: Run the focused test** and confirm all cascading and persistence assertions pass.
- [ ] **Step 5: Commit** with `fix: cascade result column filters`.

### Task 3: Canonical select-all state and complete searchable list

**Files:**
- Modify: `src/webviews/results/app/resultFilters.ts`
- Modify: `src/webviews/results/app/components/ResultGrid.tsx`
- Modify: `src/webviews/results/app/styles.css`
- Modify: `tests/resultGridFilter.test.ts`

**Interfaces:**
- Produces: `selectionState(selectedKeys, allKeys): 'none' | 'partial' | 'all'`.
- Produces: `toggleAllValues(selectedKeys, allKeys): Set<string>`.
- Produces: virtual list constants and visible-window calculation for all matching options.

- [ ] **Step 1: Write failing tests** for none/partial/all states, clearing selections outside the search text, selecting all values, and searching a value positioned after index 250.
- [ ] **Step 2: Run `npm test -- tests/resultGridFilter.test.ts`** and confirm the old 250-item truncation and matching-only checkbox behavior fail.
- [ ] **Step 3: Implement one canonical selection model.** The header checkbox uses all option keys, sets DOM `indeterminate` for partial state, clears all keys when toggled from all/partial to none, and selects all keys from none. Remove `MAX_FILTER_OPTIONS`; keep search over the complete options array and render only the visible scroll window plus spacers.
- [ ] **Step 4: Run focused tests and `npm run lint`** and confirm both pass.
- [ ] **Step 5: Commit** with `fix: keep filter selection state consistent`.

### Task 4: High-cardinality guard

**Files:**
- Modify: `src/webviews/results/app/resultFilters.ts`
- Modify: `src/webviews/results/app/components/ResultGrid.tsx`
- Modify: `src/webviews/results/app/styles.css`
- Modify: `tests/resultGridFilter.test.ts`

**Interfaces:**
- Produces: `analyzeFilterCardinality(rows, field, limits?): { uniqueCount: number; estimatedBytes: number; warned: boolean }`.
- Uses constants `FILTER_UNIQUE_WARNING_LIMIT = 10_000` and `FILTER_MEMORY_WARNING_BYTES = 5 * 1024 * 1024`.

- [ ] **Step 1: Write failing tests** at 9,999/10,000 unique values and immediately below/at 5 MB. Assert that warning state does not mutate filters, `Continue anyway` enables full option generation, and `Filter in SQL` leaves filters unchanged and displays SQL guidance.
- [ ] **Step 2: Run `npm test -- tests/resultGridFilter.test.ts`** and confirm missing guard failures.
- [ ] **Step 3: Implement the incremental cardinality analyzer and warning UI.** Show estimated unique count and formatted memory, with `Filter in SQL` and `Continue anyway` buttons. Do not auto-edit SQL. Cache the user's continue decision only for the currently open column popup.
- [ ] **Step 4: Run focused tests and `npm run lint`** and confirm they pass.
- [ ] **Step 5: Commit** with `feat: guard high-cardinality result filters`.

### Task 5: Full verification and PR update

**Files:**
- Verify: all changed source, test, and generated webview assets.

- [ ] **Step 1: Run `npm test`** and require zero failures.
- [ ] **Step 2: Run `npm run lint`** and require zero TypeScript errors.
- [ ] **Step 3: Run `npm run build`** and require successful extension and webview bundles.
- [ ] **Step 4: Inspect `git diff --check` and `git status --short`**; stage only intentional source, tests, docs, and required generated assets.
- [ ] **Step 5: Commit generated assets if the build changed tracked outputs**, using `build: refresh result webview assets`.
- [ ] **Step 6: Push detached HEAD to `origin/fix/redshift-table-definition`**, verify PR #23 contains every commit, and do not merge it.
