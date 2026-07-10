# QueryDeck Security

QueryDeck is a database extension, so security reports matter. Please avoid posting credentials, private schema details, production SQL, or customer data in public issues.

## Supported Versions

Security fixes target the latest published QueryDeck version.

## Reporting A Vulnerability

Open a private security advisory on GitHub when available, or contact the maintainer through the repository owner profile. Include:

- QueryDeck version.
- Editor version.
- Operating system.
- Database engine involved.
- A minimal sanitized reproduction.
- Why the behavior creates security risk.

## Security Design Notes

- Database passwords are stored using VS Code SecretStorage.
- Query history and query memory are local to the editor environment.
- Production connections can require destructive-query confirmation.
- Read-only connections reject non-SELECT-style execution paths.
- The MCP server is designed for read-only database context and row-limited query execution.

QueryDeck cannot protect secrets that users paste into SQL text, screenshots, issue reports, logs, or AI prompts. Sanitize shared examples before publishing them.

