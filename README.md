# Data Grip

Data Grip is a VS Code database workbench for PostgreSQL and Redshift. It is built for the everyday database workflow inside an editor:

```text
connect -> browse schema -> write SQL -> run queries -> inspect results -> reuse history
```

The extension is not intended to replace VS Code with a separate database IDE. It brings the core DataGrip-style workflow into VS Code: durable query consoles, schema-aware SQL editing, table browsing, query sessions, result grids, and local query history.

## Features

| Area | What it does |
| --- | --- |
| Connections | Save PostgreSQL and Redshift connections, connect/disconnect, and keep the selected connection available to SQL files. |
| Schema explorer | Browse databases, schemas, tables, views, columns, keys, indexes, and object metadata from the Database activity view. |
| Query consoles | Open persistent SQL consoles per connection. New console files are stored in VS Code extension global storage under `query-consoles`, outside the visible workspace. |
| SQL execution | Run or cancel the current query, a selected range, or a full SQL file. Multi-statement selections execute as one batch so temp tables and transactions share a session. |
| Results | Inspect query results in a VS Code panel with tabs, row limits, paging controls, copy/export actions, and execution status. |
| Autocomplete | Use cached schema metadata for table, view, schema, alias, and column suggestions. |
| Query sessions | Track active consoles and older query history so useful SQL can be found and reopened later. |
| AI assistance | Use VS Code language models to explain SQL, fix SQL, and summarize query memory without storing database passwords in prompts. |

## Quick Start

1. Open the Database activity view in VS Code.
2. Run `Database: Add Database Connection`.
3. Choose PostgreSQL or Redshift and enter the connection details.
4. Run `Database: Add Query Console`.
5. Type SQL and run it with `Ctrl+Enter` on Windows/Linux or `Cmd+Enter` on macOS.
6. Open the Database panel to inspect result tabs and query sessions.

For schema-aware autocomplete, connect to a database and open a query console or bind a `.sql` file with `Database: Set SQL File Connection`. Metadata warms in the background. After the cache is ready, table and column completions appear from the active connection.

## Run Locally

### Prerequisites

- VS Code 1.90 or newer
- Node.js 20 or newer
- npm
- A PostgreSQL or Redshift database for manual testing

### Start the Extension Development Host

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build the extension and webview assets:

   ```bash
   npm run build
   ```

3. Open this repository in VS Code:

   ```bash
   code .
   ```

4. Press `F5`, or open Run and Debug and choose `Run Extension`.

VS Code starts a new Extension Development Host window with this extension loaded from the local repository.

### Use the Local Extension

In the Extension Development Host window:

1. Open the Database activity view.
2. Add a PostgreSQL or Redshift connection.
3. Click `Test Connection`.
4. Open a query console with `Database: Add Query Console`.
5. Run a query with `Ctrl+Enter` or `Cmd+Enter`.
6. Open a table from the explorer to preview table data.

### Local Development Loop

Use these commands while developing:

```bash
npm run lint
npm test
npm run build
```

Use `npm run lint` for TypeScript checks, `npm test` for Vitest tests, and `npm run build` before launching or packaging the extension.

For TypeScript-only iteration, run:

```bash
npm run watch
```

If you change React result-panel code or CSS under `src/webviews/results/app`, rebuild the webview bundle:

```bash
npm run bundle:webview
```

## Manual Database Check

Use a small PostgreSQL database to verify schema metadata, autocomplete, query execution, and result rendering.

Create a basic table:

```sql
create schema if not exists public;

create table if not exists public.users (
  id integer primary key,
  email text not null
);
```

Then, in a query console connected to that database, type:

```sql
select u.
from public.users u
```

Expected behavior:

- `id` and `email` appear as column suggestions after metadata warms.
- Incomplete SQL does not produce schema diagnostics until metadata is fresh enough to verify it.
- Running a query shows a loading state, then a populated result tab.

## Tests

Run all tests:

```bash
npm test
```

Run TypeScript checks:

```bash
npm run lint
```

Run the full build:

```bash
npm run build
```

The PostgreSQL metadata integration test is opt-in. Provide a database URL when you want to run it:

```bash
DATABASE_INTEGRATION_URL=postgres://postgres:postgres@localhost:5432/postgres npm test
```

## Troubleshooting

### Query Console File Location

Query console files are stored in VS Code extension global storage under `query-consoles`, not in the opened project. Existing consoles created by older versions under `.vscode-data-grip` can still be reopened from their saved records.

### Autocomplete Only Shows SQL Keywords

Check that the SQL file or console is bound to a connection. Run `Database: Show SQL Metadata Status` to see whether the schema cache is empty, stale, loading, or ready.

### Table Preview Looks Empty

The table preview should show a loading state while data is being fetched. If it stays empty, check the connection state and run `Database: Refresh Database Explorer`.

### Changes Do Not Appear in the Extension Host

Run `npm run build`, then reload the Extension Development Host window. For result-panel UI changes, make sure `npm run bundle:webview` has run.

## Project Structure

```text
src/database/       Connection manager, query executor, and database drivers
src/explorer/       Database tree nodes and explorer provider
src/persistence/    Connection, console, history, memory, and result stores
src/services/       SQL parsing, metadata cache, diagnostics, and query memory
src/webviews/       Connection editor, query sessions, table preview, and results UI
tests/              Unit and integration tests
media/              Built webview assets and extension icons
dist/               Compiled extension output
```

## Status

This project is in active development. PostgreSQL and Redshift are the supported database engines. The core workflow is available, but local testing against real databases is still important before shipping driver, schema-cache, or query-execution changes.
