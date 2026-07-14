# GROUP BY Quick Fix Design

## Goal

Make live database GROUP BY validation errors actionable in QueryDeck's SQL editor. When QueryDeck can identify the missing expression and the exact SELECT scope with high confidence, it offers a lightbulb action that edits that scope directly.

Phase 1 covers only GROUP BY errors. It does not add fixes for ambiguous identifiers, misspelled objects, parentheses, types, functions, permissions, or operational errors.

## User experience

An eligible diagnostic offers a Quick Fix titled `Add <expression> to GROUP BY`.

Clicking the action edits the current SQL document immediately. It does not open a preview, diff, or side-by-side window. QueryDeck then reruns diagnostics so the database can validate the revised statement.

If QueryDeck cannot confidently determine both the missing expression and its owning SELECT scope, it provides guidance without an automatic edit. It never guesses a scope or silently modifies a different query block.

## Supported databases

The normalizer recognizes equivalent live planner errors from PostgreSQL, Redshift, MySQL, SQL Server, Oracle, and Snowflake. SQLite uses the same path only if its driver returns an equivalent GROUP BY validation error. Redis is excluded because it is not SQL-based.

This feature is deterministic. It does not use AI, an AI fallback, or an external service.

## Error normalization

Database drivers continue returning native `QueryError` values. A focused normalizer converts recognized GROUP BY variants into a common recommendation containing:

- the missing SQL expression or column;
- the database error position when available;
- the failing statement range;
- enough source evidence to assess confidence.

Unrecognized or incomplete errors remain ordinary diagnostics and do not receive an edit action.

## SELECT-scope resolution

QueryDeck uses its parsed query tree, statement ranges, database error position, aliases, and expression occurrences to resolve the owning SELECT scope.

The resolver must handle:

- a top-level SELECT;
- an existing GROUP BY;
- CTE bodies and their final SELECT;
- nested and correlated subqueries;
- individual UNION branches;
- repeated column names across scopes;
- multiple SQL statements in one document;
- expressions such as qualified columns and function calls.

The resolver returns no automatic edit when multiple scopes remain plausible.

## SQL edit rules

For a resolved scope:

- If the scope already has a GROUP BY clause, append `, <expression>` to that clause.
- If the scope has no GROUP BY clause, insert `GROUP BY <expression>` after FROM/WHERE and before HAVING, ORDER BY, LIMIT/OFFSET/FETCH, UNION/INTERSECT/EXCEPT, the scope's closing parenthesis, or the statement terminator.
- Preserve the document's line endings and infer indentation from the target scope.
- Preserve comments, parameters, aliases, formatting, and all unrelated SQL.
- Do not add an expression already present in the target GROUP BY.
- Apply one workspace edit to the current document, then request immediate diagnostic refresh.

The phrase "append GROUP BY to the end" means the end of the relevant SELECT's grouping position, not the end of the file when SQL clause order or nested scopes require an earlier insertion.

## Integration

Live planner diagnostics that normalize to a GROUP BY recommendation receive a stable diagnostic source/code plus the normalized recommendation data required by the Quick Fix provider.

The existing SQL code-action provider will expose both metadata refresh actions and GROUP BY actions without mixing their eligibility rules. A dedicated GROUP BY command computes and applies the edit against the current document version. If the document changed after the diagnostic was produced, the command recomputes the recommendation or declines to edit.

## Failure handling

- Unsupported database message: keep the diagnostic, offer no GROUP BY action.
- Missing expression: keep the diagnostic and show guidance only.
- Ambiguous SELECT scope: keep the diagnostic and show guidance only.
- Stale diagnostic/document version: recompute; do not apply stale offsets.
- Edit failure: leave SQL unchanged and show the VS Code error.
- Database still rejects revised SQL: display the new live diagnostic normally.

## Testing

Tests will use real parser and edit logic rather than mocked rewrite results. Coverage includes:

- native error normalization for PostgreSQL, Redshift, MySQL, SQL Server, Oracle, and Snowflake;
- SQLite's equivalent path when an error is supplied;
- top-level insertion with correct clause ordering;
- appending to an existing GROUP BY;
- CTE, nested subquery, correlated subquery, and UNION-branch targeting;
- repeated identifiers and ambiguous-scope refusal;
- multiple statements and correct failing-statement targeting;
- qualified columns and expression preservation;
- comments, indentation, parameters, and line endings;
- duplicate GROUP BY prevention;
- stale-document recomputation;
- immediate diagnostic refresh after a successful edit;
- no action for metadata warnings, unrelated planner errors, Redis, or low-confidence cases.

Full lint, unit tests, build, VSIX packaging, and GitHub CI remain required before the PR is ready for review.

## Delivery

Implementation will use branch `feature/group-by-quick-fix` and a new pull request. The PR will remain open and unmerged until the user explicitly asks to merge it.
