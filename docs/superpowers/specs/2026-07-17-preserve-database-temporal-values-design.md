# Preserve Database Temporal Values

## Problem

QueryDeck currently allows database drivers to convert temporal result cells into JavaScript `Date` objects. Moving those results through the extension host and webview serializes the objects as UTC ISO timestamps. That conversion can change the displayed calendar date and also affects copying, filtering, exporting, persistence, and agent-facing query results.

## Decision

Database result cells are data, not presentation metadata. QueryDeck will preserve temporal values as strings at each database-driver boundary and will not create JavaScript `Date` objects for result cells.

This applies to all temporal database types, including date, time, datetime, timestamp, and timezone-aware variants. The value exposed by the database client should remain stable across the extension's result pipeline. Internal QueryDeck metadata such as execution start times is outside this rule.

## Architecture

Each SQL driver will request string output for temporal columns using its client library's supported configuration or fetch options:

- PostgreSQL and Redshift: install result parsers that return the server text for temporal OIDs.
- MySQL: enable string output for temporal types in pool configuration.
- SQL Server: use driver configuration or row normalization that preserves the database field representation without UTC serialization.
- Oracle: request string fetching for temporal types.
- Snowflake: configure or normalize temporal results to stable strings before constructing `QueryExecutionResult`.
- SQLite: preserve its native scalar values; do not infer dates from strings or numbers.
- Redis: no temporal coercion; preserve returned scalar values.

Where a client library cannot directly expose raw temporal text, driver-local normalization will convert the value immediately using the column's database type metadata. No renderer-only correction will be used as the primary fix because non-UI consumers must receive the same stable values.

## Data Flow

1. The database client executes a query.
2. The driver receives rows plus column metadata.
3. Temporal cells are already strings or are normalized to strings inside the driver.
4. `QueryExecutionResult` carries those strings unchanged.
5. Grid rendering, filtering, copying, exports, persistence, and MCP responses consume the same value without timezone conversion.

## Compatibility

- Non-temporal values retain their current types and behavior.
- Null values remain null.
- QueryDeck-owned timestamps retain their current representation.
- Temporal cell strings are treated as opaque database values; the result viewer does not reinterpret their timezone.
- Existing explicit user formatting features may format a value only when requested and must not mutate the underlying result.

## Testing

Regression tests will reproduce the one-day shift with positive-offset local dates and verify driver configuration or normalization for every supported database engine. Shared result formatting and export tests will verify that temporal strings pass through unchanged. Existing driver and result tests must remain green.

## Out of Scope

- Converting stored database values to a preferred timezone.
- Localizing dates or timestamps automatically.
- Changing SQL parameter serialization or write behavior unless a failing regression test shows it uses the same result-cell path.
