# QueryDeck

QueryDeck is an AI-first VS Code SQL workbench for developers who want to connect, browse schema, run queries, inspect results, and recover useful SQL without leaving the editor.

It supports PostgreSQL, Redshift, MySQL, SQLite, Microsoft SQL Server, Oracle, Redis, and Snowflake.

![QueryDeck supported database connections](https://raw.githubusercontent.com/yirgagithub/vsCode-Data-Grip/main/media/marketplace/querydeck-connections.png)

## Why Install QueryDeck?

- Bring SQL work into the same editor where Codex, Claude Code, Copilot, and other AI coding tools already work.
- Ask AI to explain SQL, fix SQL errors, summarize local query memory, and recommend table performance improvements.
- Search local query memory by plain-language phrases, table names, columns, output fields, status, or SQL fragments.
- Stay in VS Code while working with production, local, and warehouse databases.
- Open durable query consoles that are tied to saved connections.
- Browse schemas, tables, columns, keys, indexes, views, procedures, and generated DDL.
- Run SQL from files, selections, or parameterized query consoles.
- Inspect result grids with paging, filtering, copy, export, charting, and pinned tabs.
- Mark production and read-only connections so destructive SQL gets an extra safety check.

## AI-First SQL Workflow

QueryDeck is designed for the way developers now work in VS Code: write SQL, inspect schema, keep history, and hand useful context to AI coding assistants without jumping into a separate database IDE.

Use it with:

- Codex, Claude Code, Copilot, or another AI assistant reading and editing SQL in your workspace.
- QueryDeck AI commands for explain, fix, query-memory summaries, and performance recommendations.
- Local query memory so useful SQL does not disappear after a tab closes.
- Production and read-only safety checks before risky SQL runs.

## Coming From Another Database Tool?

QueryDeck is built for developers who want a focused SQL workflow inside VS Code: connect, write SQL, run queries, inspect results, and recover past work quickly.

| If you use... | What QueryDeck is good for |
| --- | --- |
| DBCode | QueryDeck is lighter and focused on SQL consoles, local query memory, safety checks, and AI-assisted SQL inside VS Code. DBCode has broader database coverage and advanced features; QueryDeck aims to be simpler to adopt for daily SQL work. |
| Database Client | QueryDeck focuses less on general database administration and more on repeatable SQL workflows: durable consoles, history search, schema-aware editing, result grids, and production safety. |
| SQLTools | QueryDeck avoids a separate driver-extension setup for its supported engines and adds a richer workbench layer around query consoles, result tabs, AI help, and local query history. |
| Desktop database IDEs | QueryDeck keeps common database work inside the editor you already use, so you do not have to switch apps just to inspect schema, run SQL, or reopen an old query. |

Choose QueryDeck if your pain is not just connecting to a database, but keeping the whole SQL loop close to your code.

## Screenshots

### Connect And Browse

![QueryDeck connection onboarding and schema explorer](https://raw.githubusercontent.com/yirgagithub/vsCode-Data-Grip/main/media/marketplace/querydeck-connections.png)

### Run SQL And Inspect Results

![QueryDeck SQL console and result grid](https://raw.githubusercontent.com/yirgagithub/vsCode-Data-Grip/main/media/marketplace/querydeck-results.png)

### Recover Past Queries And Use AI

![QueryDeck query history and AI assistance](https://raw.githubusercontent.com/yirgagithub/vsCode-Data-Grip/main/media/marketplace/querydeck-history-ai.png)

## Built For Daily SQL Work

```text
connect -> browse schema -> write SQL -> run queries -> inspect results -> reuse history
```

QueryDeck is strongest when you live in SQL files and repeat real database workflows every day: reporting, analytics checks, migration review, debugging, data cleanup, production support, and exploratory analysis.

## Feature Highlights

| Area | What QueryDeck does |
| --- | --- |
| Connections | Save database connections, connect or disconnect, and bind SQL files to a selected connection. |
| Connection onboarding | Engine-specific defaults, labels, required fields, help text, SQLite file selection, and inline test feedback. |
| Schema explorer | Browse databases, schemas, tables, views, columns, keys, indexes, functions, procedures, triggers, and object metadata. |
| Query consoles | Open persistent SQL scratchpads per connection. Consoles are stored in VS Code global storage, outside the visible workspace. |
| SQL execution | Run or cancel the current query, selected range, current statement, or full SQL file. |
| Parameters | Use reusable placeholders such as `:startDate`, `:status`, or `{customerId}` and fill them before execution. |
| Results | Inspect result tabs with row limits, paging controls, filters, copy/export actions, charts, and execution status. |
| Autocomplete | Use cached schema metadata for table, view, schema, alias, and column suggestions. |
| Query sessions | Track active consoles and older query history so useful SQL can be found and reopened later. |
| History search | Find previous queries by phrase, table, column, output column, SQL fragment, file name, or status. |
| AI assistance | Explain SQL, fix SQL, summarize query memory, and analyze table performance with VS Code language models or OpenAI-compatible providers. |
| Safety | Confirm destructive SQL on production connections and restrict read-only connections to SELECT-style queries. |

## Quick Start

1. Install QueryDeck from the VS Code Marketplace.
2. Open the Database activity view.
3. Run `Database: Add Database Connection`.
4. Choose PostgreSQL, Redshift, MySQL, SQLite, Microsoft SQL Server, Oracle, Redis, or Snowflake.
5. Enter connection details and save with a clear name such as `Local PostgreSQL`, `Analytics Warehouse`, or `Production Reporting`.
6. Connect from the Database explorer.
7. Run `Database: Add Query Console`, or open a `.sql` file and run `Database: Set SQL File Connection`.
8. Write SQL and run it with `Ctrl+Enter` on Windows/Linux or `Cmd+Enter` on macOS.

## Query Consoles

A query console is a persistent SQL scratchpad tied to one database connection. Use consoles for exploratory analysis, recurring reporting queries, migration checks, troubleshooting, and SQL you want to keep available outside the current workspace.

Consoles support:

- Current statement, selected range, and full-file execution.
- Multi-statement execution in one batch, so temp tables and transactions can share the same session.
- Connection-aware autocomplete and diagnostics.
- Local query history for completed, failed, and cancelled console executions.
- Parameter prompts before a query runs.
- Durable storage in VS Code global storage, so console files do not clutter the opened project.

You can also use normal `.sql` files. Bind a file to a connection with `Database: Set SQL File Connection`, then run SQL from the editor action or keyboard shortcut.

## Query Parameters

Use parameters when a query should be reused with different dates, IDs, statuses, or filters. QueryDeck recognizes both named and brace placeholders:

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

When you run a query with parameters, QueryDeck opens a compact `Parameters` panel. Enter each value once, then execute. The panel shows the parameter name and surrounding SQL context so it is clear what each value controls.

Parameter value behavior:

- Text values are quoted and escaped automatically when the placeholder is not already inside single quotes.
- Numbers are inserted as numbers.
- `true` and `false` become SQL booleans.
- `null` becomes `NULL`.
- Values that already look like single-quoted SQL literals are preserved.
- Use `sql:` for an intentional raw SQL expression, for example `sql:current_date - interval '30 days'`.

PostgreSQL casts such as `created_at::date` are not treated as parameters.

## Query History

Run `Database: Find Past Query...` to search local query memory. You can use plain-language phrases such as:

```text
monthly revenue by status
failed customer lookup
orders last 30 days
email domain counts
```

Search looks across query titles, AI-generated summaries when available, SQL text, source file names, connection names, table names, column names, output columns, and status. Results can be opened, copied, explained, modified with AI, previewed for safety, or rerun.

## Database Explorer

The Database explorer lets you browse connections, catalogs, schemas, tables, views, columns, keys, indexes, functions, procedures, and triggers.

Common actions include:

- Open table data.
- Copy object names and qualified names.
- Generate SELECT, INSERT, UPDATE, DELETE, DDL, and maintenance SQL.
- Compare schemas.
- Show ER diagrams.
- Import table data.
- Copy tables between connections.
- Profile data.
- Analyze table performance.

## AI Assistance

When a VS Code language model or OpenAI-compatible provider is available, QueryDeck can:

- Explain selected SQL.
- Suggest fixes for SQL errors.
- Generate modified SQL from an instruction.
- Summarize query memory so history search works better with natural-language-style phrases.
- Analyze table performance from past workload patterns.

Database passwords are not included in prompts.

## Safety And Privacy

- Database passwords are stored with VS Code SecretStorage.
- AI prompts do not include saved database passwords.
- Query history is local to your VS Code environment.
- Connections can be marked as production.
- Read-only connections only accept SELECT-style queries.
- Destructive SQL on production connections can require confirmation before execution.

## Screenshot And Demo Hygiene

Use neutral connection names and generic schema/table examples in shared screenshots or demos. For example, prefer names like `Local PostgreSQL`, `Analytics Warehouse`, and `Production Reporting`, and sample tables such as `analytics.orders` or `public.customers`.

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

Query console files are stored in VS Code extension global storage under `query-consoles`, not in the opened project. Existing consoles created by older versions under legacy workspace query folders can still be reopened from their saved records.

### Autocomplete Only Shows SQL Keywords

Check that the SQL file or console is bound to a connection. Run `Database: Show SQL Metadata Status` to see whether the schema cache is empty, stale, loading, or ready.

### Table Preview Looks Empty

The table preview should show a loading state while data is being fetched. If it stays empty, check the connection state and run `Database: Refresh Database Explorer`.

## Status

QueryDeck is early and improving quickly. The fastest way to shape it is to install it, try it against a real database workflow, and open issues with missing drivers, UX friction, or SQL workflows that should be smoother.
