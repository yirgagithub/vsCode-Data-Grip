# Task 3 Report: SQL Server Temporal Result Preservation

## Implementation

- Added exported `formatSqlServerTemporalValue` using `Date#toISOString()`, which is based on UTC components and therefore cannot shift a stored SQL Server calendar date through the machine's local timezone.
- SQL Server `date` becomes `YYYY-MM-DD`; `time` becomes `HH:mm:ss.sss`; `datetime`, `datetime2`, and `smalldatetime` become timezone-free `YYYY-MM-DDTHH:mm:ss.sss`; `datetimeoffset` remains an ISO instant ending in `Z`.
- Null remains null and milliseconds available on the JavaScript `Date` are retained.
- Connection setup registers mssql `valueHandler` entries for only Date, Time, DateTime, DateTime2, SmallDateTime, and DateTimeOffset. Existing handlers are not replaced, making repeated connection registration idempotent. Non-temporal tokens are untouched.
- The integration-style mock test verifies all six handlers are installed before querying, repeated connection preserves handler identities, and an integer result remains numeric.

## Strict TDD Evidence

### RED

Command:

`npm test -- tests/temporalResultValues.test.ts tests/additionalDrivers.test.ts`

Observed exit code 1: 8 failures and 8 passes. All seven pure formatter cases failed with `formatSqlServerTemporalValue is not a function`; the registration test failed because `valueHandler.has(type)` was false. These are the expected missing-feature failures.

### GREEN

Focused command:

`npm test -- tests/temporalResultValues.test.ts tests/additionalDrivers.test.ts`

Observed exit code 0: 2 files passed, 16 tests passed.

Full suite command:

`npm test`

Observed exit code 0: 35 files passed and 2 skipped; 408 tests passed and 7 skipped.

Type-check command:

`npm run lint`

Observed exit code 0 (`tsc -p ./ --noEmit`).

## datetimeoffset Representation Limit

Inspection of installed `tedious` 19.2.1 (`lib/value-parser.js`, `readDateTimeOffset`) shows that the parser reads but discards the two encoded offset bytes, then constructs a UTC JavaScript `Date`. By the time mssql's `valueHandler` runs, the original textual offset (for example `+02:00`) is unavailable. The formatter therefore emits the preserved instant in canonical UTC form with `Z`; it cannot honestly reconstruct or retain the discarded original offset. JavaScript `Date` also limits fractional precision to milliseconds, so any sub-millisecond SQL Server precision already discarded by the driver cannot be recovered.

## Self-review

- Scope is limited to the requested driver and tests plus this report; no execution timestamp or localization code changed.
- UTC-derived slicing ensures timezone-free SQL Server types do not gain `Z` and avoids local calendar shifts.
- Handler registration neither overwrites pre-existing custom handlers nor changes non-temporal values.
- No bundled runtime artifact change was required because the runtime exposes the same mssql module-level type tokens and `valueHandler` map.
