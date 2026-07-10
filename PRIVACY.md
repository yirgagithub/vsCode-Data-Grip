# QueryDeck Privacy

QueryDeck is designed as a local-first SQL workbench for VS Code-compatible editors.

## What Stays Local

- Saved connection records.
- Query consoles.
- Query history.
- Query memory metadata.
- Result tabs restored by the extension.

Database passwords are stored with VS Code SecretStorage. QueryDeck does not need database passwords in prompts for AI explain, fix, or performance workflows.

## AI Features

When AI features are used, QueryDeck sends the selected SQL or sanitized workflow context needed for the requested action to the configured provider. The provider can be a VS Code language model or an OpenAI-compatible endpoint selected in settings.

Do not select or submit private customer data, secrets, credentials, or regulated data to AI tools unless your team has approved that provider and workflow.

## MCP Server

The QueryDeck MCP server is intended to expose database context to AI agents in a controlled, read-only way. Configure it with least-privilege database users, low row limits, and non-production credentials when possible.

## Marketplace Media

Screenshots, GIFs, demos, and docs should use sample data and neutral connection names such as `Local PostgreSQL`, `Analytics Warehouse`, and `Production Reporting`.

