# Task 2 Report — Enforce Rules Against the Repository Import Graph

## Status

DONE_WITH_CONCERNS

## Commit

- Implementation: `04ea0925f13a42e4a0d94db3fed8d895c01de111` (`build: enforce architecture boundaries`)

## RED Evidence

Command:

```text
npx vitest run tests/architectureBoundary.test.ts tests/packageScripts.test.ts
```

Observed exit code: `1`.

- `tests/architectureBoundary.test.ts` failed to load `../scripts/architecture/checkArchitecture` because the checker did not exist.
- The new package-script assertion failed because `scripts['check:architecture']` was `undefined`.
- The remaining seven pre-existing package-script tests passed.

## GREEN Evidence

Commands:

```text
npx vitest run tests/architectureBoundary.test.ts tests/packageScripts.test.ts
npm run check:architecture
```

Observed exit code: `0`.

- Focused Vitest run: 2 test files passed, 9 tests passed.
- Architecture CLI: exit code 0 and no violations printed.

## Files

- Created `scripts/architecture/checkArchitecture.js`.
- Created `tests/architectureBoundary.test.ts`.
- Modified `tests/packageScripts.test.ts`.
- Modified `package.json`.
- `package-lock.json` was not changed because package scripts do not affect the lockfile.

## Implementation Notes

- Scans `src/**/*.ts` and `src/**/*.tsx` recursively.
- Recognizes static `import`, static `export ... from`, side-effect imports, and CommonJS `require` calls described by the Task 2 interface.
- Ignores package imports and unresolved relative imports, resolves explicit source files and directory `index.ts`/`index.tsx` entry points, and delegates dependency policy to Task 1's `isAllowedDependency`.
- Normalizes reported paths to repository-relative POSIX form and sorts violations deterministically.
- The CLI prints violations and sets a failing exit code; `validate` runs lint, architecture checks, tests, then build in the required order.

## Self-Review

- Compared the implementation and test changes against every Task 2 interface and step.
- Ran `git diff --check` on all implementation files; it passed.
- Confirmed the repository-level test exercises the real repository rather than mocks.
- Confirmed no later-task files or plan/spec documents were edited.
- Confirmed no Task 1 follow-up was necessary: `src/vendorModules.d.ts` contains no relative import edge, so scanning it does not create an unclassified dependency; manifest layer-key validation is outside the behavior needed by this checker.
- Committed only the four Task 2 implementation/test files, leaving pre-existing worktree changes untouched.

## Concerns

- Vitest emits the pre-existing Vite CJS Node API deprecation warning despite all focused tests passing.
- The shared worktree contains extensive unrelated pre-existing changes under `node_modules` and modifications to `.superpowers/sdd/progress.md` and `.superpowers/sdd/task-1-report.md`; none were staged or committed for Task 2.

## Review-Fix Addendum

### Commit

- Review fixes: `c951c0e63c60a837160c9edf188fc8683b54d76c` (`fix: parse architecture imports with TypeScript`)

### RED Evidence

Command:

```text
npx vitest run tests/architectureBoundary.test.ts
```

Observed exit code: `1`; 2 tests failed and 3 passed.

- The unresolved-relative-import fixture expected one violation but received `[]`, proving unresolved imports were silently skipped.
- The dynamic-import/import-type fixture expected two forbidden edges but received `[]`, proving regex discovery missed both AST forms.
- The existing static import, `require`, and export cases passed under the old implementation, providing characterization before the parser replacement.

The first AST implementation then surfaced the real non-source `./styles.css` asset import and, after distinguishing existing non-source assets, a focused run exposed an overly broad directory check that skipped index imports. Tightening that check to existing files restored index resolution.

### GREEN Evidence

Commands:

```text
npx vitest run tests/architectureBoundary.test.ts tests/packageScripts.test.ts
npm run check:architecture
```

Final observed exit code: `0`.

- Focused Vitest run: 2 test files passed, 13 tests passed, 0 failed; `architectureBoundary` passed 5 tests and `packageScripts` passed 8 tests.
- Architecture CLI: exit code 0 with no violations printed.

### Review Fixes

- Replaced regex matching with `typescript` AST traversal using the existing dependency.
- Traverses static import declarations, export declarations with module specifiers, literal dynamic `import()` calls, literal `require()` calls, and TypeScript `import('./module').Type` nodes.
- Emits a deterministic violation for every unresolved relative TypeScript source import, with repository-relative `from`/`to` paths and reason `unresolved relative import "<specifier>"`.
- Keeps existing relative non-source asset files outside the TypeScript architecture graph; nonexistent relative imports still fail closed.
- Added temporary-repository fixtures covering allowed and forbidden edges, unresolved relative imports, dynamic import, import-type, require, and export forms. Fixtures are removed after every test.

### Self-Review

- Preserved `checkArchitecture(root)` and the existing CLI behavior.
- Verified all discovered relative source imports are either resolved and checked with `isAllowedDependency`, or reported as unresolved; there is no silent unresolved-source `continue` path.
- Verified violations retain deterministic sorting by normalized `from:to`.
- Used real filesystem fixtures and the TypeScript parser rather than mocks or parser-shaped test doubles.
- Ran `git diff --check` before committing; it passed.
- Committed only `scripts/architecture/checkArchitecture.js` and `tests/architectureBoundary.test.ts`; unrelated shared-worktree changes remain untouched.

### Remaining Concerns

- Vitest continues to emit the pre-existing Vite CJS Node API deprecation warning after all 13 focused tests pass.
- Existing non-TypeScript asset imports (for example `./styles.css`) are intentionally excluded because Task 2 enforces the TypeScript repository import graph.
