# SQL Metadata Diagnostics and Refresh Design

## Goal

Revise PR #18 so it addresses QueryDeck's misleading red validation squiggles across every supported SQL database. Remove the unrelated SQL formatter work from the branch.

## Diagnostic policy

QueryDeck will distinguish between authoritative failures and cache-based guesses:

- Structural parser diagnostics remain errors.
- Errors returned by a connected database's planner remain errors.
- Missing-table and missing-column diagnostics derived only from cached metadata become warnings.

The warning policy applies consistently to PostgreSQL, Redshift, MySQL, SQLite, SQL Server, Oracle, and Snowflake. Redis is excluded because it does not use SQL diagnostics.

## Refresh action

Each cache-derived missing-table or missing-column warning will offer a VS Code Quick Fix named `Refresh database metadata`.

The action will:

1. Resolve the connection selected for the SQL document.
2. Connect when that connection is offline.
3. Refresh the relevant schema metadata, including table and column data.
4. Rerun diagnostics for the document after refresh completion.

If connection or refresh fails, QueryDeck will show the existing actionable error and keep the warning. The action will not silently suppress diagnostics or reconnect an already-active connection unnecessarily.

## Scope of PR #18

The branch will retain only changes needed for the database-wide diagnostic severity policy, the metadata-refresh Quick Fix, and their tests. SQL parameter masking, formatter tests, and Redshift-specific formatter framing will be removed.

The PR title and description will be rewritten around preventing false red SQL validation errors and providing an in-editor cache refresh path. The PR will remain open and unmerged.

## Verification

Tests will cover:

- cache-derived missing-table and missing-column diagnostics are warnings for all seven SQL databases;
- structural syntax diagnostics remain errors;
- live planner failures remain errors;
- the Quick Fix appears only for QueryDeck metadata warnings;
- refresh uses the document's selected connection, connects only when needed, refreshes metadata, and reruns diagnostics;
- refresh failure preserves the warning and reports the failure.

The focused tests, full unit suite, lint, build, and VSIX packaging check must pass before the PR is updated.
