# Final review remediation

- Removed the shared normalized table-definition fallback from the object-definition contract.
- Added PostgreSQL- and SQL Server-owned table DDL generation and a complete PostgreSQL `CREATE VIEW` wrapper.
- Added stable PostgreSQL, SQL Server, and MySQL routine identity/argument metadata; unique names remain resolvable when an engine cannot supply arguments, while ambiguous names remain unresolved.
- Marked Redshift routine definition navigation unsupported instead of returning an arbitrary `prosrc` body.
- Added a distinct metadata-unavailable hover with a trusted metadata-refresh command and no passive notifications.
- Fetches table primary and foreign keys concurrently.
- Replaced the tautological capability matrix assertion with shared-driver behavior and concrete driver query-shape assertions.

Verification: focused tests (50 passed), full tests (386 passed, 7 skipped), TypeScript lint, production build, VSIX package, and `vsce ls --tree` inspection.
