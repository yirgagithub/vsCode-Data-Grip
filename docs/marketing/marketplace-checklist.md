# QueryDeck Marketplace Checklist

## Positioning

- Lead with "AI-first SQL workbench" instead of only "database client".
- Mention VS Code and Cursor in external launch copy.
- Mention local query memory, result grids, and read-only MCP context in the first screen.
- Avoid claims that imply cloud sync, team features, or hosted service behavior before they exist.

## Search Metadata

Use Marketplace keywords for concrete user intent:

- database
- sql
- postgres
- postgresql
- mysql
- sqlite
- sqlserver
- oracle
- redis
- snowflake
- redshift
- query
- schema
- data
- ai
- mcp
- codex
- claude
- cursor
- query history
- query memory
- datagrip
- results grid
- sql workbench

Keep keyword count below Marketplace limits.

## Screenshot Order

1. Result grid with real sample query output.
2. Connection explorer with multiple database engines.
3. SQL editor with bound connection and parameterized query.
4. Query memory search.
5. MCP or AI workflow when there is a real visual to show.

## Screenshot Rules

- Use sample data only.
- Use neutral connection names: `Local PostgreSQL`, `Analytics Warehouse`, `Production Reporting`.
- Do not show private hostnames, credentials, production schemas, customer names, or real business metrics.
- Avoid generated/fake UI composites.
- Verify each image renders in the Marketplace README before publishing.

## Trust Signals

- Repository link points to the public GitHub repo.
- License is visible.
- `SUPPORT.md`, `SECURITY.md`, and `PRIVACY.md` are present.
- README explains local storage, SecretStorage, AI provider behavior, and MCP read-only posture.
- Issue templates should be added before larger public launch.

## Pre-Launch Verification

- Install from Marketplace in a clean VS Code profile.
- Install from Open VSX in a compatible editor.
- Confirm the displayed extension name is QueryDeck.
- Confirm screenshots load in Marketplace and Open VSX pages.
- Confirm the first query workflow works against sample SQLite or local PostgreSQL.
- Confirm `Database: Find Past Query...` appears and works after a query is run.
- Confirm MCP docs match the current packaged entrypoint.

