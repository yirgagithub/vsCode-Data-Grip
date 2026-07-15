# Task 3: Resolve objects and render compact hover content

Work in `C:\Users\yirga\.openclaw\workspace\querydeck-table-hover-ddl` on `feature/table-hover-ddl`. Read Task 3 and Global Constraints in the implementation plan; they are binding.

Create `src/services/databaseObjectMetadata.ts`, `src/services/databaseObjectHover.ts`, `tests/databaseObjectMetadata.test.ts`, and `tests/databaseObjectHover.test.ts`.

Implement a UI-independent discriminated `ResolvedDatabaseObject` union and `resolveDatabaseObject(reference, connection, schemaContext)`. Cover qualified/default-schema resolution, existing case rules, tables/views, routine overload matching by argument count, triggers, aliases/built-ins, ambiguous overloads, disconnected cached metadata, and missing objects. Use existing schema services for keys/foreign keys; return `undefined` for ambiguity.

Implement `renderDatabaseObjectHover(object): string` with Markdown-safe compact output: table columns/nullability/PK/FK, view columns, function return/signature, procedure signature, and trigger table/timing/events. Include a shared `escapeMarkdownText()` and no command links. Keep indexes, row counts, and storage sizes out of scope. Passive hover must not notify or guess.

Use strict TDD and observe failing imports/functions before production code. Run `npx vitest run tests/databaseObjectMetadata.test.ts tests/databaseObjectHover.test.ts` and `npm run lint`. Commit implementation and write `.superpowers/sdd/task-3-report.md` with RED evidence, exact commands/results, commit, self-review, and concerns. Native definitions are not part of this task and must never be normalized or synthesized.
