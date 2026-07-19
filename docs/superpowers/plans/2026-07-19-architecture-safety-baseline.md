# Architecture Safety Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish enforceable architecture boundaries and compatibility inventories before moving QueryDeck features into the new modular structure.

**Architecture:** This first redesign increment adds executable guardrails without relocating production features. A dependency checker defines the allowed target architecture, compatibility snapshots protect the public and persisted surfaces, and architecture records make later feature migrations reviewable.

**Tech Stack:** TypeScript 5.9, Node.js 20, Vitest 1.6, npm scripts, GitHub Actions, VS Code extension manifests.

## Global Constraints

- Preserve every current feature and all user-visible behavior.
- Preserve command identifiers, configuration keys, saved connections, document bindings, query history, query memory, persisted result sessions, and supported database behavior.
- Deliver through staged pull requests; `main` must remain buildable, testable, packageable, and releasable.
- Do not add product features or redesign UI workflows during the architecture freeze.
- Production modules may move only after characterization tests cover their observable behavior.
- Database values must remain lossless; formatting may not mutate stored or transported values.
- Merging remains a deliberate user decision after CI and review.

## Program Plan Sequence

This plan is the first independently reviewable increment. Follow it with separate plans for:

1. application composition root and command registration;
2. lossless query/result contracts and driver capabilities;
3. connections feature migration;
4. query execution feature migration;
5. results and result-session migration;
6. explorer and schema metadata migration;
7. table data plus import/export migration;
8. query history and memory migration;
9. diagnostics, plans, and AI migration;
10. administration, cleanup, and final boundary enforcement.

## Planned File Structure

- `architecture/modules.json`: machine-readable module layers, public entry points, and temporary legacy allowances.
- `scripts/architecture/checkArchitecture.js`: import graph parser and dependency-rule evaluator.
- `scripts/architecture/architectureRules.js`: pure path classification and rule functions.
- `tests/architectureRules.test.ts`: focused unit tests for path and dependency rules.
- `tests/architectureBoundary.test.ts`: repository-level test that runs the checker against `src/`.
- `tests/fixtures/compatibility/public-surface.json`: reviewed snapshot of commands, settings, activation events, menus, and keybindings.
- `scripts/compatibility/publicSurface.js`: deterministic manifest projection used by tests and snapshot updates.
- `tests/publicSurfaceCompatibility.test.ts`: fails when the shipped command/configuration surface changes unexpectedly.
- `tests/fixtures/compatibility/persisted-records.json`: representative legacy persisted records for every current store.
- `tests/persistenceCompatibility.test.ts`: verifies current readers accept the compatibility fixtures.
- `docs/architecture/README.md`: concise architecture map and dependency direction.
- `docs/architecture/decisions/0001-feature-oriented-modular-monolith.md`: accepted architecture decision.
- `.github/workflows/ci.yml`: runs architecture and compatibility checks explicitly.

---

### Task 1: Add Pure Architecture Rules

**Files:**
- Create: `architecture/modules.json`
- Create: `scripts/architecture/architectureRules.js`
- Create: `tests/architectureRules.test.ts`

**Interfaces:**
- Consumes: repository-relative POSIX paths.
- Produces: `classifyModule(path: string): ModuleKind` and `isAllowedDependency(from: string, to: string): boolean`.

- [ ] **Step 1: Write the failing unit tests**

```ts
import { describe, expect, it } from 'vitest';
import { classifyModule, isAllowedDependency } from '../scripts/architecture/architectureRules';

describe('architecture rules', () => {
  it('classifies target modules and legacy source', () => {
    expect(classifyModule('src/core/errors.ts')).toBe('core');
    expect(classifyModule('src/features/results/index.ts')).toBe('feature');
    expect(classifyModule('src/adapters/database/postgres.ts')).toBe('adapter');
    expect(classifyModule('src/app/createApplication.ts')).toBe('app');
    expect(classifyModule('src/services/sqlDialect.ts')).toBe('legacy');
  });

  it('enforces inward dependencies and feature public APIs', () => {
    expect(isAllowedDependency('src/features/results/useCases/runQuery.ts', 'src/core/query.ts')).toBe(true);
    expect(isAllowedDependency('src/core/query.ts', 'src/features/results/index.ts')).toBe(false);
    expect(isAllowedDependency('src/features/results/useCases/runQuery.ts', 'src/adapters/database/postgres.ts')).toBe(false);
    expect(isAllowedDependency('src/features/results/index.ts', 'src/features/connections/index.ts')).toBe(true);
    expect(isAllowedDependency('src/features/results/useCases/runQuery.ts', 'src/features/connections/internal/store.ts')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/architectureRules.test.ts`

Expected: FAIL because `scripts/architecture/architectureRules.js` does not exist.

- [ ] **Step 3: Add the module manifest**

```json
{
  "layers": ["core", "feature", "adapter", "app", "legacy"],
  "roots": {
    "core": "src/core/",
    "feature": "src/features/",
    "adapter": "src/adapters/",
    "app": "src/app/"
  },
  "featurePublicEntry": "index.ts",
  "legacyRoots": [
    "src/ai/", "src/controllers/", "src/database/", "src/explorer/", "src/mcp/",
    "src/persistence/", "src/providers/", "src/runtime/", "src/services/", "src/utils/",
    "src/webviews/", "src/extension.ts", "src/mcpServer.ts", "src/types.ts"
  ]
}
```

- [ ] **Step 4: Implement the pure rules**

```js
const path = require('path');
const manifest = require('../../architecture/modules.json');

const normalize = (value) => value.split(path.sep).join('/').replace(/^\.\//, '');

function classifyModule(file) {
  const normalized = normalize(file);
  for (const [kind, root] of Object.entries(manifest.roots)) {
    if (normalized.startsWith(root)) return kind;
  }
  return 'legacy';
}

function isFeaturePublicEntry(file) {
  const parts = normalize(file).split('/');
  return parts.length === 4 && parts[0] === 'src' && parts[1] === 'features' && parts[3] === manifest.featurePublicEntry;
}

function isAllowedDependency(from, to) {
  const fromKind = classifyModule(from);
  const toKind = classifyModule(to);
  if (fromKind === 'legacy' || toKind === 'legacy') return true;
  if (fromKind === 'core') return toKind === 'core';
  if (fromKind === 'feature') {
    return toKind === 'core' || (toKind === 'feature' && (sameFeature(from, to) || isFeaturePublicEntry(to)));
  }
  if (fromKind === 'adapter') return toKind !== 'app';
  return true;
}

function sameFeature(from, to) {
  const fromParts = normalize(from).split('/');
  const toParts = normalize(to).split('/');
  return fromParts[2] === toParts[2];
}

module.exports = { classifyModule, isAllowedDependency };
```

- [ ] **Step 5: Run the test and commit**

Run: `npx vitest run tests/architectureRules.test.ts`

Expected: 2 tests PASS.

```bash
git add architecture/modules.json scripts/architecture/architectureRules.js tests/architectureRules.test.ts
git commit -m "test: define architecture dependency rules"
```

### Task 2: Enforce Rules Against the Repository Import Graph

**Files:**
- Create: `scripts/architecture/checkArchitecture.js`
- Create: `tests/architectureBoundary.test.ts`
- Modify: `package.json`
- Modify: `tests/packageScripts.test.ts`

**Interfaces:**
- Consumes: `src/**/*.ts` and `src/**/*.tsx`, plus Task 1's `isAllowedDependency`.
- Produces: `checkArchitecture(root: string): ArchitectureViolation[]` where each violation has `from`, `to`, and `reason`.

- [ ] **Step 1: Write repository-level failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { checkArchitecture } from '../scripts/architecture/checkArchitecture';

describe('repository architecture', () => {
  it('contains no forbidden target-module imports', () => {
    expect(checkArchitecture(process.cwd())).toEqual([]);
  });
});
```

Add to `tests/packageScripts.test.ts`:

```ts
it('runs architecture checks as part of validation', () => {
  const scripts = packageJson().scripts ?? {};
  expect(scripts['check:architecture']).toBe('node scripts/architecture/checkArchitecture.js');
  expect(scripts.validate).toBe('npm run lint && npm run check:architecture && npm test && npm run build');
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npx vitest run tests/architectureBoundary.test.ts tests/packageScripts.test.ts`

Expected: FAIL because the checker and scripts do not exist.

- [ ] **Step 3: Implement deterministic import resolution**

Create `scripts/architecture/checkArchitecture.js` with these exported entry points:

```js
const fs = require('fs');
const path = require('path');
const { isAllowedDependency } = require('./architectureRules');

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const IMPORT_PATTERN = /(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)/g;

function checkArchitecture(root) {
  const sourceRoot = path.join(root, 'src');
  const violations = [];
  for (const file of sourceFiles(sourceRoot)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1] ?? match[2];
      if (!specifier.startsWith('.')) continue;
      const target = resolveSourceImport(file, specifier);
      if (!target) continue;
      const fromRelative = relative(root, file);
      const toRelative = relative(root, target);
      if (!isAllowedDependency(fromRelative, toRelative)) {
        violations.push({ from: fromRelative, to: toRelative, reason: 'forbidden dependency direction or deep feature import' });
      }
    }
  }
  return violations.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : SOURCE_EXTENSIONS.includes(path.extname(full)) ? [full] : [];
  });
}

function resolveSourceImport(from, specifier) {
  const base = path.resolve(path.dirname(from), specifier);
  const candidates = [...SOURCE_EXTENSIONS.map((ext) => `${base}${ext}`), ...SOURCE_EXTENSIONS.map((ext) => path.join(base, `index${ext}`))];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

if (require.main === module) {
  const violations = checkArchitecture(process.cwd());
  if (violations.length) {
    console.error(violations.map((item) => `${item.from} -> ${item.to}: ${item.reason}`).join('\n'));
    process.exitCode = 1;
  }
}

module.exports = { checkArchitecture };
```

- [ ] **Step 4: Add validation scripts**

Add to `package.json`:

```json
"check:architecture": "node scripts/architecture/checkArchitecture.js",
"validate": "npm run lint && npm run check:architecture && npm test && npm run build"
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/architectureBoundary.test.ts tests/packageScripts.test.ts`

Expected: all focused tests PASS.

Run: `npm run check:architecture`

Expected: exit code 0 with no violations.

```bash
git add scripts/architecture/checkArchitecture.js tests/architectureBoundary.test.ts tests/packageScripts.test.ts package.json package-lock.json
git commit -m "build: enforce architecture boundaries"
```

### Task 3: Freeze the Public Extension Surface

**Files:**
- Create: `scripts/compatibility/publicSurface.js`
- Create: `tests/fixtures/compatibility/public-surface.json`
- Create: `tests/publicSurfaceCompatibility.test.ts`

**Interfaces:**
- Consumes: `package.json`.
- Produces: `projectPublicSurface(pkg: object): PublicSurfaceSnapshot` with sorted arrays and configuration records.

- [ ] **Step 1: Write the failing compatibility test**

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { projectPublicSurface } from '../scripts/compatibility/publicSurface';

describe('public surface compatibility', () => {
  it('preserves the reviewed command, activation, menu, keybinding, and settings surface', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    const expected = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/compatibility/public-surface.json'), 'utf8'));
    expect(projectPublicSurface(pkg)).toEqual(expected);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/publicSurfaceCompatibility.test.ts`

Expected: FAIL because the projection module and reviewed fixture do not exist.

- [ ] **Step 3: Implement a stable projection**

```js
function projectPublicSurface(pkg) {
  const contributes = pkg.contributes ?? {};
  return {
    activationEvents: [...(pkg.activationEvents ?? [])].sort(),
    commands: [...(contributes.commands ?? [])].sort(byCommand),
    menus: sortObject(contributes.menus ?? {}),
    keybindings: [...(contributes.keybindings ?? [])].sort(byCommand),
    configuration: sortObject(contributes.configuration?.properties ?? {})
  };
}

function byCommand(left, right) {
  return String(left.command).localeCompare(String(right.command));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

module.exports = { projectPublicSurface };
```

- [ ] **Step 4: Generate and review the fixture**

Run:

```powershell
node -e "const fs=require('fs'); const {projectPublicSurface}=require('./scripts/compatibility/publicSurface'); const p=require('./package.json'); fs.mkdirSync('tests/fixtures/compatibility',{recursive:true}); fs.writeFileSync('tests/fixtures/compatibility/public-surface.json', JSON.stringify(projectPublicSurface(p), null, 2)+'\n')"
```

Expected: `tests/fixtures/compatibility/public-surface.json` contains only current shipped manifest behavior, sorted deterministically. Review the diff to confirm it contains no secrets or generated noise.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/publicSurfaceCompatibility.test.ts tests/commandSurface.test.ts`

Expected: all tests PASS.

```bash
git add scripts/compatibility/publicSurface.js tests/fixtures/compatibility/public-surface.json tests/publicSurfaceCompatibility.test.ts
git commit -m "test: freeze extension public surface"
```

### Task 4: Add Persisted-Record Compatibility Fixtures

**Files:**
- Create: `tests/fixtures/compatibility/persisted-records.json`
- Create: `tests/persistenceCompatibility.test.ts`
- Modify: `tests/resultSessionStore.test.ts`
- Modify: `tests/queryMemory.test.ts`

**Interfaces:**
- Consumes: existing store constructors and the same in-memory VS Code context helpers already used by store tests.
- Produces: a reviewed fixture with `connections`, `queryConsoles`, `queryHistory`, `queryMemory`, `resultSessions`, and `documentConnections` records.

- [ ] **Step 1: Create representative legacy fixtures**

Use field names and versions copied from the current store tests. Include at least:

```json
{
  "connections": [{ "id": "connection-1", "name": "Local PostgreSQL", "type": "postgres", "host": "localhost", "port": 5432, "database": "app", "username": "developer", "sslMode": "prefer", "color": "blue" }],
  "queryConsoles": [],
  "queryHistory": [],
  "queryMemory": [],
  "resultSessions": [],
  "documentConnections": []
}
```

Replace each empty array in the same step with one complete dummy record using the public interfaces imported by the corresponding store (`ConnectionConfig`, `QueryConsoleRecord`, `QueryHistoryItem`, `QueryMemoryItem`, `QueryResultTab`, and `SqlDocumentConnectionRecord`). Use the stable IDs `legacy-connection`, `legacy-console`, `legacy-history`, `legacy-memory`, `legacy-result-session`, and `legacy-document-binding`. Values must be synthetic, and the connection fixture must omit `password` because secrets are stored separately.

- [ ] **Step 2: Write failing reader-compatibility tests**

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const fixtures = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/compatibility/persisted-records.json'), 'utf8'));

describe('persisted record compatibility', () => {
  it('keeps a reviewed fixture for every persisted store', () => {
    expect(Object.keys(fixtures).sort()).toEqual([
      'connections', 'documentConnections', 'queryConsoles', 'queryHistory', 'queryMemory', 'resultSessions'
    ]);
    Object.values(fixtures).forEach((records) => expect(records).not.toEqual([]));
  });
});
```

Extend the existing store test suites using their in-memory context helpers so each store reads its fixture and returns the expected public record. Do not introduce a second fake VS Code context implementation.

- [ ] **Step 3: Verify the new tests fail for any incorrect fixture field**

Run: `npx vitest run tests/persistenceCompatibility.test.ts tests/resultSessionStore.test.ts tests/queryMemory.test.ts`

Expected: FAIL until every fixture uses the exact current storage key, record version, and field shape.

- [ ] **Step 4: Correct fixtures and add explicit compatibility assertions**

For each store, assert stable identifiers and one representative domain field after reading, for example:

```ts
expect(store.getAll().map((record) => record.id)).toContain('legacy-result-session');
expect(store.getAll().find((record) => record.id === 'legacy-result-session')?.title).toBe('Legacy query');
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/persistenceCompatibility.test.ts tests/resultSessionStore.test.ts tests/queryMemory.test.ts`

Expected: all focused tests PASS.

```bash
git add tests/fixtures/compatibility/persisted-records.json tests/persistenceCompatibility.test.ts tests/resultSessionStore.test.ts tests/queryMemory.test.ts
git commit -m "test: preserve persisted record compatibility"
```

### Task 5: Document the Enforced Architecture Decision

**Files:**
- Create: `docs/architecture/README.md`
- Create: `docs/architecture/decisions/0001-feature-oriented-modular-monolith.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `architecture/modules.json` and the approved redesign spec.
- Produces: a contributor-facing architecture map and accepted decision record.

- [ ] **Step 1: Write the architecture map**

`docs/architecture/README.md` must contain:

```md
# QueryDeck Architecture

QueryDeck is a feature-oriented modular monolith.

## Dependency Direction

`app -> adapters -> features -> core`

- `core` contains shared domain invariants and has no outward dependencies.
- `features/<name>` owns one user capability and exposes only `features/<name>/index.ts`.
- `adapters` implements feature ports for VS Code, databases, persistence, webviews, files, and AI providers.
- `app` constructs the application and owns startup and shutdown.

Legacy folders remain temporarily permitted while vertical slices migrate. New feature code must follow the target boundaries.

Run `npm run check:architecture` before committing.
```

- [ ] **Step 2: Record the architecture decision**

The ADR must use headings `Status`, `Context`, `Decision`, `Consequences`, and `Migration`. Set Status to `Accepted — 2026-07-19`. Record why strict Clean Architecture and file-splitting-only were rejected, and link the approved redesign spec.

- [ ] **Step 3: Link contributor documentation**

Add an `Architecture` subsection to the root `README.md` linking to `docs/architecture/README.md`. Do not add marketing claims or change feature documentation.

- [ ] **Step 4: Verify links and commit**

Run: `rg -n "docs/architecture/README.md|feature-oriented modular monolith|app -> adapters -> features -> core" README.md docs/architecture architecture/modules.json`

Expected: the README link, architecture description, and machine-readable manifest are all present.

```bash
git add README.md docs/architecture
git commit -m "docs: publish QueryDeck architecture map"
```

### Task 6: Put Guardrails in CI and Verify the Baseline

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/packageScripts.test.ts`

**Interfaces:**
- Consumes: `npm run check:architecture` and all compatibility tests from earlier tasks.
- Produces: a CI architecture step that runs before the general test suite.

- [ ] **Step 1: Write a failing workflow assertion**

Add to `tests/packageScripts.test.ts`:

```ts
it('checks architecture before running the full unit suite in CI', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  const architectureIndex = workflow.indexOf('run: npm run check:architecture');
  const testIndex = workflow.indexOf('run: npm test');
  expect(architectureIndex).toBeGreaterThan(-1);
  expect(testIndex).toBeGreaterThan(architectureIndex);
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/packageScripts.test.ts`

Expected: FAIL because CI has no explicit architecture step.

- [ ] **Step 3: Add the CI step**

Insert after type-checking and before `npm test` in every relevant CI job:

```yaml
      - name: Check architecture boundaries
        run: npm run check:architecture
```

- [ ] **Step 4: Run complete verification**

Run: `npm run lint`

Expected: exit code 0.

Run: `npm run check:architecture`

Expected: exit code 0 and no violations.

Run: `npm test`

Expected: all unit and integration tests PASS; opt-in live database tests may report skipped when services are not enabled.

Run: `npm run build`

Expected: exit code 0 and extension, MCP, runtime, and webview bundles produced.

Run: `npm run compile:e2e`

Expected: exit code 0.

- [ ] **Step 5: Commit the CI gate**

```bash
git add .github/workflows/ci.yml tests/packageScripts.test.ts
git commit -m "ci: require architecture guardrails"
```

## Baseline Exit Criteria

- Target dependency rules are executable locally and in CI.
- Existing legacy folders remain allowed, but new target modules cannot violate direction or deep-import other features.
- The complete public extension manifest is protected by a reviewed deterministic fixture.
- Every persisted store has representative backward-compatibility data and reader assertions.
- Contributors can find the architecture map and accepted decision from the root README.
- The full existing test/build pipeline passes without changing product behavior.
