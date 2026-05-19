# Feature Request: AI-Supported Database Engine

Status: Future implementation

## Summary

Build the extension toward an AI-supported database workbench where database work has memory. The main product value is not only generating SQL, but helping users recover, understand, reuse, and safely modify the SQL they already wrote.

The flagship feature should let users ask natural-language questions such as:

```text
Get me the SQL query I used to find duplicate invoices.
Show me the query where I joined orders with customers and filtered by Germany.
Find the SQL I ran last week for monthly churn.
```

The extension should search historical SQL usage, workspace SQL files, saved snippets, schema context, and query execution metadata, then return likely matches with enough context to reuse safely.

## Problem

Developers and analysts often write useful SQL queries, run them, and then lose track of them. Days or weeks later they need the same query again, but ordinary query history is hard to search because users remember the intent, business concept, tables, filters, or result shape rather than the exact SQL text.

This creates repeated work:

- Rewriting queries that already existed.
- Searching through old files or raw query history manually.
- Losing the reasoning behind a query.
- Accidentally changing a known-good query while recreating it from memory.

## Proposed Capabilities

### AI Query Memory

Store executed queries with enough metadata for later retrieval:

- SQL text.
- Connection and database context.
- Timestamp.
- Execution status.
- Row count.
- Result column names.
- Execution duration.
- Error message, if the query failed.
- Statement range or source document, when available.

Generate an AI title and short summary for each meaningful query, for example:

```text
Title: Duplicate invoice check
Summary: Finds invoice numbers that appear more than once, grouped by customer and invoice date.
Tables: invoices, customers
```

### Semantic Query Search

Allow users to search old SQL by intent rather than exact text:

- "the query for cancelled trial users"
- "SQL that checked missing product prices"
- "revenue grouped by month"
- "the query that returned customer_id, email, and last_login"

Search should consider SQL text, generated summaries, table names, column names, result metadata, timestamps, and connection names.

### Query Retrieval UI

When the assistant finds candidate queries, show:

- The SQL query.
- When it was run.
- Which connection/database it used.
- The generated title and summary.
- Tables and columns involved.
- Result metadata such as row count and output columns.
- Actions: Open, Run, Copy, Save, Explain, Modify.

The user should be able to inspect candidates before executing anything.

### Query Explanation and Modification

For any retrieved query, the assistant should be able to:

- Explain what the SQL does.
- Highlight joins, filters, grouping, ordering, and write operations.
- Modify the query from a natural-language instruction.
- Adapt the query to a different date range, table, schema, or SQL dialect when possible.

Example prompts:

```text
Change this query to last month.
Add a filter for active customers.
Make it return one row per user.
Convert this PostgreSQL query to Redshift.
```

### Safety Guardrails

AI-assisted query reuse must be safe by default, especially for write operations.

The extension should warn before running:

- DELETE
- UPDATE
- DROP
- TRUNCATE
- ALTER
- CREATE INDEX on large tables
- queries without WHERE clauses where that is risky
- queries against production-marked connections

For destructive SQL, the assistant should offer a preview SELECT or EXPLAIN step before execution.

## MCP Server Consideration

An MCP server is not required for the first implementation, but it is a strong long-term architecture option.

The extension can first build the feature internally:

```text
VS Code extension
  -> query history store
  -> summary and metadata index
  -> semantic search
  -> assistant UI
```

Later, the same internal services can be exposed through an MCP server:

```text
VS Code extension / local service
  -> query history store
  -> schema cache
  -> semantic index
  -> MCP tools
  -> AI clients
```

Possible MCP tools:

```text
search_query_history(naturalLanguage, connectionId?)
get_query_details(queryId)
get_database_schema(connectionId)
get_saved_sql_files(query)
explain_query_plan(connectionId, sql)
summarize_query_history(dateRange, connectionId?)
```

MCP becomes valuable when:

- The same database memory should be available to multiple AI clients.
- The AI needs controlled access to schema, history, and execution metadata.
- The extension needs a clean tool boundary instead of provider-specific integrations.
- Future agents need to search or reason over the database workspace without direct database access.

Recommendation: design the internal query-memory service as if it may become MCP-backed later, but do not require MCP for the MVP.

## Suggested MVP

1. Persist query history with SQL, timestamp, connection, execution status, row count, output columns, duration, and source document/range.
2. Generate a title and summary for each useful query.
3. Add semantic search over query history.
4. Add an assistant command for "Find past query..." that accepts natural-language input.
5. Show ranked query matches with Open, Copy, Explain, Modify, and Run actions.
6. Add destructive-query warnings before re-running retrieved SQL.

## Later Enhancements

- Auto-tags such as reporting, debugging, migration, analytics, billing, customer, performance.
- Pinned and named queries.
- Team query library for shared, approved SQL.
- Query timeline grouped by day, connection, and intent.
- Saved AI conversation threads attached to queries.
- Query performance assistant using EXPLAIN or EXPLAIN ANALYZE.
- "What did I do?" summaries, such as "What queries did I run against production today?"
- Error-memory search, such as "Find the query that failed with missing column yesterday."

## Product Principle

The assistant should make database work recoverable. Users should feel that useful SQL is never lost, even if they only remember what they were trying to do.
