# Task 5: VS Code hover, definition, and virtual document providers

Work in `C:\Users\yirga\.openclaw\workspace\querydeck-table-hover-ddl` on `feature/table-hover-ddl`. Read Task 5 and Global Constraints in the plan; they are binding.

Create `src/providers/databaseObjectLanguageProviders.ts`, modify `src/extension.ts`, and add focused provider/command-surface tests.

Implement VS Code `HoverProvider`, `DefinitionProvider`, and `TextDocumentContentProvider` integration using the approved parser, metadata resolver, hover renderer, bound document connection resolver, and driver native `getObjectDefinition`. Register for SQL only and gate on QueryDeck-bound documents. Passive hover failures are silent. Ctrl+click/F12 opens stable encoded `querydeck-definition:` virtual URIs backed by an in-memory content map, refreshes content with `onDidChange`, and never executes SQL. Definition documents must be read-only. Unsupported/explicit navigation failures may notify, but must never open partial content. Honor cancellation before/after async work and dispose every registration.

Hard rule: virtual documents show each engine's returned native definition verbatim; never normalize, translate, or synthesize cross-database DDL.

Use strict TDD. Cover SQL-only registration/gating, hover, silent failures, cancellation, URI stability/encoding, refreshed content, read-only scheme behavior, unsupported/error handling, and no partial opening. Run focused provider/command tests and `npm run lint`. Commit and write task-5-report.md with RED/GREEN evidence and concerns.
