# Task 6: Cross-feature regression and packaging verification

Work in `C:\Users\yirga\.openclaw\workspace\querydeck-table-hover-ddl` on `feature/table-hover-ddl`. Read Task 6 and Global Constraints in the plan.

Add functional-matrix assertions documenting which engines enumerate and define table/view/function/procedure/trigger, distinguishing unsupported from failure. Add live integration assertions only where existing container coverage supports them; do not invent unavailable infrastructure.

Run and record fresh evidence for: `npm test`, `npm run lint`, `npm run build`, and `npx vsce package --no-dependencies`. Inspect `git diff --check` and scoped `git status --short`; do not stage or alter pre-existing `node_modules` dirt. Remove only newly generated artifacts from this task when safe. Confirm native definitions remain verbatim and Redis excluded.

Fix only failures caused by this feature, using TDD for behavior changes. Commit matrix/tests or verification-driven fixes and write task-6-report.md with exact results, skipped live coverage, artifact path, status scope, and concerns.
