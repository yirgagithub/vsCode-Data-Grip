# Data Grip

An AI-native VS Code database client for PostgreSQL and Redshift.

## Why I Built This

This project started when my company moved away from IntelliJ IDEA and I lost the DataGrip workflow I relied on every day. I tried to find a VS Code extension that felt like a real replacement, but nothing I found came close to the mix of schema browsing, SQL editing, and database introspection that made DataGrip so practical.

That gap is what pushed me to build this extension. The goal was to bring a DataGrip-style experience into VS Code instead of forcing a context switch back to a separate IDE.

The AI-native layer is there to make repeated database work faster, not to replace the core editor experience. It helps with things like:

- executing queries and keeping them in durable, searchable history
- finding an old query later when you remember the intent, not the exact SQL
- using semantic search over query history to recover work you forgot to save
- explaining schema context, table structure, and query behavior
- suggesting Redshift table improvements, including candidate distribution keys and other storage choices
- combining database metadata with history so AI responses stay grounded in the real database

The result is a database client that feels native to VS Code, but still aims for the depth I missed from DataGrip.

## Quick Start: Schema-Aware SQL

1. Run `Database: Add Database Connection` or pick an existing connection from the Database view.
2. Open a query console with `Database: Add Query Console`, or open a `.sql` file and run `Database: Set SQL File Connection`.
3. Start typing SQL. After the metadata cache warms, `from ` suggests schemas, tables, and views. `alias.` suggests cached columns.

Opening a query console connects the selected database and starts metadata warm-up. If no VS Code workspace is open, the console file is stored in extension storage; that storage message is informational and does not disable autocomplete.

The editor uses cached metadata first. It does not query the database on every keystroke. If metadata is stale or incomplete, completions may use the last cached snapshot, but red diagnostics stay quiet until the extension has fresh enough metadata to verify the object.

The first time schema-backed completions are ready for a connection, VS Code shows a one-time confirmation. If suggestions or diagnostics look confusing, run `Database: Show SQL Metadata Status` from the Command Palette. It reports the active connection, schema, cache age, freshness, refresh state, and the next action to take.

## Development Checks

```bash
npm run lint
npm test
npm run build
```

Real database metadata behavior should be verified with a seeded PostgreSQL database before shipping cache changes. Use a simple table such as:

```sql
create schema if not exists public;
create table if not exists public.users (
  id integer primary key,
  email text not null
);
```

Then connect the extension, open a query console, type:

```sql
select u.
from public.users u
```

Expected result: `email` and `id` are offered from cached column metadata, and incomplete SQL does not produce schema diagnostics until the cache is fresh enough to verify it.

### Timed TTHW Check

Use this check after metadata-cache changes to measure time to hello world.

1. Start a timer from a clean VS Code window with the extension loaded.
2. Select or add a PostgreSQL connection.
3. Open a query console or bind a `.sql` file to that connection.
4. Type `select u.` followed by `from public.users u`.
5. Stop the timer when real cached column completions appear.

Record:

```text
Connection selected at:
Editor ready at:
First schema-backed completion at:
Total time:
Notes:
```

Target: 2-5 minutes from connection selection to first useful schema-backed completion. Diagnostics should stay quiet while the query is incomplete or metadata is stale.

An opt-in integration test is available when a PostgreSQL URL is provided:

```bash
DATABASE_INTEGRATION_URL=postgres://postgres:postgres@localhost:5432/postgres npm test
```
