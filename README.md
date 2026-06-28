# Data Grip

Data Grip is a VS Code database workbench for PostgreSQL, Redshift, MySQL, SQLite, Microsoft SQL Server, Oracle, Redis, and Snowflake. It is built for everyday SQL work inside the editor:

```text
connect -> browse schema -> write SQL -> run queries -> inspect results -> reuse history
```

The extension brings the core DataGrip-style workflow into VS Code: durable query consoles, schema-aware SQL editing, table browsing, query sessions, result grids, and local query history.

## Features

| Area | What it does |
| --- | --- |
| Connections | Save database connections, connect or disconnect, and keep the selected connection available to SQL files. |
| Schema explorer | Browse databases, schemas, tables, views, columns, keys, indexes, and object metadata from the Database activity view. |
| Query consoles | Open persistent SQL consoles per connection. New console files are stored in VS Code extension global storage under `query-consoles`, outside the visible workspace. |
| SQL execution | Run or cancel the current query, a selected range, or a full SQL file. Multi-statement selections execute as one batch so temp tables and transactions share a session. |
| Parameters | Use reusable placeholders such as `:startDate`, `:status`, or `{customerId}` and fill them in before execution. |
| Results | Inspect query results in a VS Code panel with tabs, row limits, paging controls, copy/export actions, charts, and execution status. |
| Autocomplete | Use cached schema metadata for table, view, schema, alias, and column suggestions. |
| Query sessions | Track active consoles and older query history so useful SQL can be found and reopened later. |
| History search | Find previous console queries with plain-language phrases, table names, column names, output columns, or SQL fragments. |
| AI assistance | Use VS Code language models to explain SQL, fix SQL, summarize query memory, and help analyze table performance without storing database passwords in prompts. |

## Usage

1. Open the Database activity view in VS Code.
2. Run `Database: Add Database Connection`.
3. Choose PostgreSQL, Redshift, MySQL, SQLite, Microsoft SQL Server, Oracle, Redis, or Snowflake.
4. Enter the connection details and give the connection a clear generic name, such as `Local PostgreSQL`, `Analytics Warehouse`, or `Production Reporting`.
5. Connect from the Database explorer.
6. Run `Database: Add Query Console`, or open a `.sql` file and run `Database: Set SQL File Connection`.
7. Write SQL and run it with `Ctrl+Enter` on Windows/Linux or `Cmd+Enter` on macOS.
8. Inspect result tabs, query sessions, and query history from the Database panel.

For schema-aware autocomplete, connect to a database and open a query console or bind a `.sql` file to a connection. Metadata warms in the background. After the cache is ready, table and column completions appear from the active connection.

## Query Consoles

A query console is a persistent SQL scratchpad tied to one database connection. Use consoles for exploratory analysis, recurring reporting queries, migration checks, troubleshooting, and any SQL you want to keep available outside the current workspace.

Consoles support:

- Current statement, selected range, and full-file execution.
- Multi-statement execution in one batch, so temp tables and transactions can share the same session.
- Connection-aware autocomplete and diagnostics.
- Local query history for completed, failed, and cancelled console executions.
- Parameter prompts before a query runs.
- Durable storage in VS Code global storage, so console files do not clutter the opened project.

You can also use normal `.sql` files. Bind a file to a connection with `Database: Set SQL File Connection`, then run SQL from the editor action or keyboard shortcut.

## Query Parameters

Use parameters when a query should be reused with different dates, IDs, statuses, or filters. Data Grip recognizes both named and brace placeholders:

```sql
select
  date_trunc('day', created_at)::date as order_date,
  status,
  count(*) as order_count,
  sum(total_amount) as gross_revenue
from analytics.orders
where created_at::date between '{startDate}' and :endDate
  and status = :status
  and customer_id = :customerId
group by 1, 2
order by order_date desc, status;
```

When you run a query with parameters, Data Grip opens a compact `Parameters` panel. Enter each value once, then execute. The panel shows the parameter name and the surrounding SQL context so it is clear what each value controls.

Parameter value behavior:

- Text values are quoted and escaped automatically when the placeholder is not already inside single quotes.
- Numbers are inserted as numbers.
- `true` and `false` become SQL booleans.
- `null` becomes `NULL`.
- Values that already look like single-quoted SQL literals are preserved.
- Use `sql:` for an intentional raw SQL expression, for example `sql:current_date - interval '30 days'`.

PostgreSQL casts such as `created_at::date` are not treated as parameters.

## Query Sessions

The `Query Sessions` view lives in the Database activity view and has two tabs: `Database` and `History`.

### Database Tab

The `Database` tab shows active and recent query consoles grouped by connection. Use it to reopen a console, see which connection it belongs to, check whether the latest run is running/completed/failed/cancelled, and see recent duration or row-count information.

Console actions include:

- Create a new query console.
- Refresh sessions.
- Expand or collapse connection groups.
- Pin or unpin consoles.
- Move consoles up or down.
- Untrack a console from the session list.
- Clear active session records when you want a clean view.

### History Tab

The `History` tab shows older query-console executions grouped by connection. Use it to reopen SQL from a previous run, copy the SQL, mark useful history as a favorite, or delete history items you no longer need.

History keeps successful, failed, and cancelled console runs, along with useful context such as status, execution time, row count, connection, tables, columns, and output columns when available.

## Search History

Run `Database: Find Past Query...` to search query memory. You can use plain-language phrases such as:

```text
monthly revenue by status
failed customer lookup
orders last 30 days
email domain counts
```

Search looks across query titles, AI-generated summaries when available, SQL text, source file names, connection names, table names, column names, output columns, and status. Results can be opened, copied, explained, modified with AI, previewed for safety, or rerun.

## Results

Query results appear in the Database panel. Result tabs show execution status, row counts, duration, and one or more result sets. You can page through rows, resize and filter columns, copy cells or rows, export data, pin important tabs, rerun a result, and inspect chart views for result sets that fit charting.

Pinned result tabs can be restored across sessions. Unpinned tabs are optimized for fast iteration while you write and rerun SQL.

## Database Explorer

The Database explorer lets you browse connections, catalogs, schemas, tables, views, columns, keys, indexes, functions, procedures, and triggers. Common actions are available from context menus, including opening table data, copying names, viewing object DDL, generating SQL scripts, comparing schemas, showing ER diagrams, importing data, copying tables between connections, profiling data, and generating maintenance SQL.

## AI Assistance

When a VS Code language model or OpenAI-compatible provider is available, Data Grip can:

- Explain selected SQL.
- Suggest fixes for SQL errors.
- Generate modified SQL from an instruction.
- Summarize query memory so history search works better with natural-language-style phrases.
- Analyze table performance from past workload patterns.

Database passwords are not included in prompts.

## Safety

Connections can be marked as production. When destructive SQL appears on a production connection, Data Grip can ask for confirmation before running it. Read-only connections only accept SELECT-style queries.

## Working With Screenshots And Demos

Use neutral connection names and generic schema/table examples in shared screenshots or demos. For example, prefer names like `Local PostgreSQL`, `Analytics Warehouse`, and `Production Reporting`, and use sample tables such as `analytics.orders` or `public.customers`.

This keeps screenshots and documentation reusable without exposing company-specific connection names, schemas, campaign logic, or production query details.

## Live Database Tests

CI runs real driver tests against Docker-backed PostgreSQL, MySQL, Redis, SQL Server, and Oracle containers, plus SQLite. To run one engine locally:

```bash
docker compose -f docker-compose.live-tests.yml up -d postgres
LIVE_DATABASE_ENGINE=postgres npm run test:live
docker compose -f docker-compose.live-tests.yml down -v
```

Use `LIVE_DATABASE_ENGINE=all` after starting the Docker services to run the full live matrix locally.

## Troubleshooting

### Query Console File Location

Query console files are stored in VS Code extension global storage under `query-consoles`, not in the opened project. Existing consoles created by older versions under `.vscode-data-grip` can still be reopened from their saved records.

### Autocomplete Only Shows SQL Keywords

Check that the SQL file or console is bound to a connection. Run `Database: Show SQL Metadata Status` to see whether the schema cache is empty, stale, loading, or ready.

### Table Preview Looks Empty

The table preview should show a loading state while data is being fetched. If it stays empty, check the connection state and run `Database: Refresh Database Explorer`.

## Status

This project is in active development. PostgreSQL, Redshift, MySQL, SQLite, Microsoft SQL Server, Oracle, Redis, and Snowflake are supported database engines. Redis is exposed through command execution plus logical key-type views. The core workflow is available, but validating database-specific behavior against your own database is still recommended before relying on a driver, schema-cache, or query-execution change.
