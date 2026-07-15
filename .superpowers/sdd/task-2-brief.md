# Task 2: Extend object metadata and cache

Work in `C:\Users\yirga\.openclaw\workspace\querydeck-table-hover-ddl` on branch `feature/table-hover-ddl`.

Read the implementation plan and design spec first. The plan's Task 2 and Global Constraints are binding.

## Deliverable

- Add `DatabaseObjectKind = 'table' | 'view' | 'function' | 'procedure' | 'trigger'`.
- Add `DatabaseObjectIdentity { kind; schema; name; signature?: string; table?: string }`.
- Extend `RoutineInfo` with optional `signature?: string` and `arguments?: string[]`.
- Extend `SchemaCacheEntry` with `functions: RoutineInfo[]`, `procedures: RoutineInfo[]`, and `triggers: TriggerInfo[]`.
- Make a schema load fetch routines/triggers with tables/views, persist them, hydrate older records with empty arrays, share in-flight loads, and mark failures consistently.
- Increment `SCHEMA_METADATA_CACHE_VERSION` for the new persisted shape.

## Constraints

- Use strict TDD: write failing tests and observe the expected failures before production edits.
- Use `Promise.all([getSchemas, getTables, getViews, getFunctions, getProcedures, getTriggers])` where it fits the existing service architecture.
- Preserve backward-compatible cache deserialization with `?? []`.
- Do not implement hover rendering, definition retrieval, or VS Code providers in this task.
- Definitions are engine-native; never normalize, translate, or synthesize cross-database DDL.

Run `npx vitest run tests/schemaContextService.test.ts tests/schemaMetadataCacheStore.test.ts` and `npm run lint`. Commit with `feat: cache routine and trigger metadata`.

Write `.superpowers/sdd/task-2-report.md` with RED evidence, files changed, exact commands/results, commit hash, self-review, and concerns. Return only status, commit, one-line test/lint summary, and concerns.
