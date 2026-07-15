# Result Filter Consistency Design

## Goal

Make result-grid value filters complete, predictable, and safe for date-only and high-cardinality columns.

## Behavior

- A value-filter popup shows every unique value available in the currently fetched result set in one scrollable, virtualized list. It must not silently truncate the list.
- Search covers the complete unique-value list.
- The header checkbox represents the complete list. It is checked when every value is selected, indeterminate when only some values are selected, and unchecked when none are selected. Unchecking it clears every selection.
- The selected count and checkbox always describe the same selection set.
- Opening a column filter derives its available values from rows that satisfy every other active column filter. The column's own filter is excluded from this derivation so its current choices remain visible and editable.
- Applied filters remain persisted with the result tab and session. Pagination continues to rerun the original SQL and apply those filters locally to the fetched page; this change does not rewrite SQL.

## Date-only values

Database date-only values are displayed and keyed as their exact calendar date (`YYYY-MM-DD`). They must not pass through JavaScript `Date` or UTC conversion, acquire a time component, or shift by timezone. Timestamp values retain timestamp formatting.

## High-cardinality protection

Before materializing a costly filter list, estimate its unique-value count and memory payload. Warn when either threshold is reached:

- 10,000 unique values; or
- 5 MB estimated filter payload.

The warning reports the estimated count and memory and offers:

- **Filter in SQL**: explains that a `WHERE` condition should narrow the result; it does not modify the query automatically.
- **Continue anyway**: materializes and displays the complete virtualized list for this popup.

No selection is created or changed until the user chooses an action.

## Implementation boundaries

- Extract pure helpers for cascading-row selection, unique option generation, selection-state calculation, payload estimation, and date-only formatting.
- Keep persistence in the existing result-tab grid state.
- Keep filtering local to fetched rows; server-side filtering and automatic SQL rewriting are out of scope.
- Reuse the existing result-grid popover and styling, adding list virtualization and an inline warning state.

## Tests

- Date-only values retain the original calendar date in grid cells, filter labels, and filter keys.
- A second filter preserves the first filter.
- Region `Africa` restricts Country options to countries present in Africa when all rows are fetched.
- A column's own active filter does not remove its other available choices from its popup.
- Search examines all unique values, including values beyond the former 250-item limit.
- Select-all checked, indeterminate, unchecked, and count states remain consistent.
- Deselect-all clears selections outside the current search.
- High-cardinality thresholds warn correctly and both warning actions behave as specified.
- Existing grid-state persistence and pagination behavior remain covered.
