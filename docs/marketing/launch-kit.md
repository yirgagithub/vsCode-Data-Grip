# QueryDeck Launch Kit

## Positioning

QueryDeck is an AI-first SQL workbench for VS Code, Cursor, and compatible editors. It combines multi-database connections, schema browsing, result grids, local query memory, AI SQL help, and a read-only MCP server for agent workflows.

The main wedge is not "another database client." The main wedge is database context for AI-assisted development.

## One-Line Copy

QueryDeck is an AI-first SQL workbench for VS Code and Cursor with local query memory, result grids, and safe read-only database context for AI agents.

## Short Marketplace Copy

Connect PostgreSQL, MySQL, SQLite, SQL Server, Oracle, Redis, Snowflake, and Redshift from VS Code. Browse schemas, run SQL, inspect result grids, search local query memory, and use AI assistance to explain, fix, and improve SQL. QueryDeck also includes a read-only MCP server for Codex, Claude, Cursor, and other agent workflows.

## Launch Story

Developers are moving SQL work into AI-assisted editors, but database context is still scattered across desktop tools, copied query snippets, and risky manual prompts. QueryDeck keeps that loop inside the editor: schema, query execution, history, result inspection, and agent-safe database context.

## Hacker News

Title:

```text
Show HN: QueryDeck - AI-first SQL workbench for VS Code with local query memory
```

Post:

```text
Hi HN,

I built QueryDeck, a VS Code/Cursor database workbench for people who do SQL inside AI-assisted editors.

It supports PostgreSQL, MySQL, SQLite, SQL Server, Oracle, Redis, Snowflake, and Redshift. The core workflow is connect -> browse schema -> write SQL -> run query -> inspect result grid -> search query memory.

The part I think is most interesting is the AI workflow: QueryDeck keeps query memory local, can explain/fix SQL through VS Code language models or an OpenAI-compatible provider, and includes a read-only MCP server so agents can inspect schema/search query memory/run row-limited SELECTs without getting write access.

I am trying to make database work feel native inside VS Code/Cursor instead of bouncing between an IDE, terminal, browser tabs, and pasted AI prompts.

Would love blunt feedback, especially from people using DataGrip, SQLTools, DBCode, or database clients inside VS Code.
```

## Reddit

### r/vscode

Title:

```text
I built an AI-first SQL workbench for VS Code with local query memory
```

Body:

```text
I have been building QueryDeck, a VS Code database workbench for PostgreSQL, MySQL, SQLite, SQL Server, Oracle, Redis, Snowflake, and Redshift.

The usual database-client pieces are there: schema explorer, query consoles, result grids, history search, export/copy, production safety prompts, and read-only connection mode.

The angle I care most about is AI-assisted SQL work: local query memory, explain/fix SQL, table performance help, and a read-only MCP server for Codex/Claude/Cursor-style workflows.

I would love feedback from people who currently use SQLTools, Database Client, DBCode, DataGrip, or psql/mysql shells from inside VS Code.
```

### r/PostgreSQL

Title:

```text
Looking for feedback: VS Code SQL workbench with query memory and read-only AI agent context
```

Body:

```text
I am building QueryDeck, a VS Code/Cursor SQL workbench. PostgreSQL is one of the main workflows I want to get right.

Current features include connection management, schema explorer, query consoles, result grids, query parameters, query history search, AI explain/fix SQL, and a read-only MCP server for agent workflows.

The safety model matters: use least-privilege database users, row limits, read-only execution for MCP, and no saved passwords in AI prompts.

If you use VS Code for PostgreSQL work, what would make this worth switching to from DataGrip, psql, SQLTools, or another extension?
```

### r/dataengineering

Title:

```text
Would a VS Code SQL workbench with local query memory help your analytics workflow?
```

Body:

```text
I am building QueryDeck, a SQL workbench inside VS Code/Cursor for databases and warehouses including PostgreSQL, MySQL, SQLite, SQL Server, Oracle, Redis, Snowflake, and Redshift.

The workflow is meant for repeated analytics/debugging work: query consoles, result grids, history search, query memory, parameter prompts, export/copy, and AI explain/fix/performance review.

I am especially interested in whether local query memory and safe read-only AI agent access are useful for data engineering work, or if this is solving the wrong pain.
```

## X / LinkedIn Posts

```text
I am building QueryDeck: an AI-first SQL workbench for VS Code and Cursor.

Connect Postgres/MySQL/SQLite/SQL Server/Oracle/Redis/Snowflake/Redshift, run SQL, inspect result grids, search local query memory, and give AI agents safe read-only database context through MCP.
```

```text
The old SQL workflow:
database IDE -> copy schema -> paste into AI -> run query elsewhere -> lose history.

The QueryDeck workflow:
VS Code/Cursor -> schema -> query -> result grid -> local query memory -> AI explain/fix -> read-only MCP context.
```

```text
I do not want AI agents guessing database schemas from pasted snippets.

QueryDeck gives agents controlled read-only access to schema, table DDL, query memory, and row-limited SELECTs from inside the editor.
```

## Product Hunt

Tagline:

```text
AI-first SQL workbench for VS Code and Cursor
```

Description:

```text
QueryDeck keeps database work inside your editor: multi-database connections, schema explorer, query consoles, result grids, local query memory, AI SQL help, and read-only MCP context for agents like Codex, Claude, and Cursor.
```

First comment:

```text
I built QueryDeck because AI-assisted coding still treats databases like an afterthought. Developers paste schema snippets into chats, run SQL in separate tools, and lose the context of past queries.

QueryDeck brings that loop into VS Code-compatible editors: browse schema, run SQL, inspect result grids, search local query memory, and expose safe read-only context to AI agents through MCP.

I would love feedback from developers using DataGrip, SQLTools, Database Client, DBCode, or terminal-first SQL workflows.
```

## Demo Video Scripts

### Demo 1: Query Memory

1. Open QueryDeck in VS Code.
2. Search for `monthly revenue by status`.
3. Open a past query from local memory.
4. Rerun it with parameters.
5. Show the result grid and chart view.

Hook:

```text
Stop hunting through old SQL files. QueryDeck lets you find previous database work by meaning, table, column, result field, or SQL fragment.
```

### Demo 2: AI SQL Fix

1. Run a query with a real syntax or column error against sample data.
2. Open AI fix.
3. Apply the suggestion.
4. Rerun successfully.

Hook:

```text
When SQL fails, QueryDeck can explain the error and suggest a fix without sending saved database passwords to the model.
```

### Demo 3: Agent-Safe Database Context

1. Configure a sample read-only MCP connection.
2. Ask an agent to inspect schema.
3. Ask it to find a useful past query.
4. Ask it to run a row-limited SELECT.
5. Show that write statements are rejected.

Hook:

```text
AI agents should not need production write access to understand your database. QueryDeck exposes read-only schema and query context through MCP.
```

## Outreach Targets

- VS Code extension roundups.
- Cursor and AI coding workflow newsletters.
- PostgreSQL and data engineering newsletters.
- Developer tooling podcasts.
- YouTube channels covering VS Code productivity.
- Maintainers or community users of SQLTools, Database Client, DBCode, and DataGrip alternatives.

## Launch Checklist

- Marketplace listing has real screenshots and no fake UI.
- Open VSX version is visible and installable.
- README includes MCP setup and privacy model.
- Support, security, and privacy files are present.
- Demo GIF or video uses sample data only.
- First five feedback users have installed the extension before public launch.
- Posts link to Marketplace, Open VSX, GitHub, and docs.

