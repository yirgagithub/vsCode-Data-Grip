# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

Two separate compilation pipelines must both run:

```bash
npm run build            # full build: compile + bundle:webview
npm run compile          # tsc only (extension host code → dist/)
npm run bundle:webview   # vite only (React results panel → media/results/)
npm run watch            # tsc -watch (extension host only, not webview)
npm run lint             # tsc --noEmit (type checking, no ESLint configured)
npm test                 # vitest run
```

- After changing extension-host TypeScript: `npm run compile`, then reload Extension Host
- After changing React results-panel code: `npm run bundle:webview`
- Integration tests require `DATABASE_INTEGRATION_URL` env var pointing to a real Postgres instance

## Architecture

Three runtime contexts:

1. **Extension host** (`src/` → `dist/`): Node.js/CommonJS. All business logic, commands, database interaction via VS Code extension API.
2. **Results Panel webview** (`src/webviews/results/app/` → `media/results/`): React 19 + Zustand SPA bundled by Vite. Runs in a sandboxed iframe. Communicates with extension host via `postMessage`.
3. **Table Data Panel webview** (`src/webviews/table/TableDataPanel.ts`): Self-contained vanilla JS/HTML template string rendered inline. Intentionally does not use React.

### Data Flow

```
SQL editor → SqlSectionService (parse sections)
  → QueryExecutor.execute()
    → ConnectionManager.getDriver() → PostgresDriver / RedshiftDriver (pg Pool)
    → QueryHistoryStore.add()
    → QueryMemoryService.recordHistoryItem()
  → ResultsPanelProvider.addTab()
    → postMessage('hydrate') → React app (Zustand store)
```

### Database Drivers

`DatabaseDriver` interface in `src/database/drivers/DatabaseDriver.ts` with two implementations:

- **PostgresDriver**: Uses `pg.Pool`. Row limits via query wrapping. Cancellation via `pg_cancel_backend`. SSL defaults to `prefer` with `disable` fallback.
- **RedshiftDriver**: Extends PostgresDriver. Overrides schema discovery to use Redshift system views (`svv_all_*`) with `pg_*` fallbacks. Port 5439, SSL always on.

To add a new driver: implement `DatabaseDriver`, register in `ConnectionManager`'s `drivers` map, add type to `DatabaseType` in `src/types.ts`.

### Webview Message Protocol

Results panel messages are typed in `src/webviews/results/messages.ts`:
- **Host → webview**: `hydrate`, `upsertTab`, `setRunning`
- **Webview → host**: `ready`, `activateTab`, `closeTab`, `pinTab`, `renameTab`, `rerunTab`, `copy`

The webview sends `ready` on mount; the host replies with `hydrate`.

### Persistence

All persistence uses VS Code `workspaceState` (per-workspace) or `globalState`/`SecretStorage` (global). No files on disk except query console `.sql` files in `.vscode-data-grip/`.

- **ConnectionStore**: `globalState` + `SecretStorage` for passwords
- **QueryHistoryStore**: `workspaceState`, capped at 1000
- **QueryMemoryStore**: `workspaceState`, capped at 2000 (AI-summarized)
- **ResultSessionStore**: `workspaceState`, pinned tabs only
- **SqlDocumentConnectionStore**: `workspaceState`, URI→connection bindings, capped at 500
- **SchemaMetadataCacheStore**: `workspaceState`, per-connection schema snapshots

### Key Services

- **SchemaContextService**: Schema metadata cache driving autocomplete and diagnostics
- **SqlSectionService**: Parses SQL editors to detect semicolon-delimited executable sections
- **SqlDiagnosticsService**: Debounced (450ms) diagnostics using `EXPLAIN` via the driver
- **QueryMemoryService**: Records queries and generates AI summaries via VS Code built-in LLM API
- **SqlSafetyClassifier**: Detects destructive SQL and prompts confirmation on production connections

### Stack

- TypeScript 5.x (strict, ES2022, CommonJS output)
- `pg` for both PostgreSQL and Redshift
- React 19 + Zustand 5 (results webview only)
- Vite 5 (webview bundler)
- Vitest (test runner)
- VS Code built-in LLM API for AI features (no external credentials)
